// Live data for the newdesign Trainer "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// trainer's connected account. RLS scopes the Supabase queries to the
// signed-in trainer. The compliance / at-risk / correlation surfaces are
// intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, userLookupForRequest } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadStripe, loadCancelFlags } from '@/lib/stripe';
import { pickRenewals, renewalRows, RENEWAL_CHECK_CAP, type RenewalSource } from '@/lib/coach-renewals.mjs';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';
import { buildOriginFeed, byoMixOf, openSubsToday } from '@/lib/origin-attribution';
import { buildTrajectory, subDeparture, NOT_ENDED_STATUSES, OPEN_SUB_STATUSES } from '@/lib/coach-trajectory.mjs';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';
import { profileNames } from '@/lib/client-names';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ A PR IS A LIFT BEATEN, NOT A SET LOGGED. This counted every completed row of
// workout_set_logs, so a roster's ordinary sets (dozens a workout) were reported as
// "PRs hit". The count is now the one the coach app shows on each client: get_client_lifts'
// `prs`, the moves whose best in the last 30 days beats their best in the 30–90 days
// before. It runs as the trainer (is_coach_on_client), eight clients at a time; a failed or
// refused call leaves that client's count unknown (null), never 0.
async function clientPrs(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, number | null>> {
  const prs = new Map<string, number | null>();
  for (let i = 0; i < clientIds.length; i += 8) {
    const batch = clientIds.slice(i, i + 8);
    const results = await Promise.all(batch.map((id) => supabase.rpc('get_client_lifts', { p_user_id: id })));
    batch.forEach((id, j) => {
      const { data, error } = results[j];
      const n = data && typeof data === 'object' ? Number((data as { prs?: unknown }).prs) : NaN;
      if (error) console.warn('[shape-app] trainer analytics: get_client_lifts failed — that client\'s PRs render as unknown:', error.message);
      prs.set(id, !error && Number.isInteger(n) && n >= 0 ? n : null);
    });
  }
  return prs;
}

// When a workout happened: its start, else its end, else when it was logged (`started_at` can be
// null; `created_at` cannot). The window filter below reads the same order.
type SessionRow = { id: string; client_id: string; started_at: string | null; ended_at: string | null; created_at: string };
const sessionAt = (r: SessionRow) => r.started_at ?? r.ended_at ?? r.created_at;

export async function GET(request: Request) {
  // Renewals cost a Stripe read each, so only the page that shows them asks for them: the Business
  // page sends ?renewals=1, and the Goal page's live figures (dashData.jsx) do not.
  const wantRenewals = new URL(request.url).searchParams.get('renewals') === '1';
  // The website's cookie session, or the app's Bearer token (the app's Business page reads this
  // route too, 2026-10-17): it was cookie-only, so the app could never read it.
  const supabase = await clientForRequest(request);
  const { user, error: authErr } = await userLookupForRequest(request);

  if (!user) {
    // ⚠ AN AUTH OUTAGE IS NOT A SIGNED-OUT VIEWER (src/lib/auth-lookup.ts). getUser() answers a
    // dead network or an auth-server 5xx with a null user too, and the Business page reads a 401 as
    // "show the preview": a signed-in coach was shown the preview's payouts as their own. A 503 is
    // the unread state each zone already has.
    if (!isMeasuredSignedOut(authErr)) {
      console.warn('[shape-app] trainer analytics: the sign-in check failed — answering 503, not 401:', authErr?.message);
      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: trainerRow, error: trainerErr } = await supabase
    .from('trainers')
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();

  // A failed read is not "this account is not a trainer".
  if (trainerErr) {
    console.warn('[shape-app] trainer analytics: trainer row read failed:', trainerErr.message);
    return NextResponse.json({ error: 'Could not read your listing.' }, { status: 500 });
  }
  if (!trainerRow) {
    return NextResponse.json({ isTrainer: false });
  }

  const providerId = trainerRow.id;

  // ⚠ THE ERROR IS KEPT. Dropped, a failed read collapses into `subs = []`
  // and the route still answers with a role-valid payload reporting ZERO active
  // clients and ZERO MRR — which the Goal page then shows under a LIVE label,
  // and the revenue calculator adopts as a $0 pace. "You have no clients" and
  // "we could not ask" are different sentences; the subscription-derived
  // figures go null so the card can say which one it is.
  // Every active row, by the same cursor walk as the roster reads (past 1,000 the read was cut
  // short with no error, Codex on #2324); at the ceiling it is a failed read, so the figures go null.
  const { data: subRows, error: subErr } = await readAllById<{ id: string; client_id: string; price_cents: number | null; fee_bps?: number | null }>((after) => {
    let q = supabase
      .from('subscriptions')
      .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB (webhook-fallback parity)
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .in('status', OPEN_SUB_STATUSES);
    if (after) q = q.gt('id', after);
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    return q.order('id', { ascending: true }).limit(ROW_PAGE);
  });
  if (subErr) {
    console.warn(
      '[shape-app] trainer analytics: subscriptions read failed — MRR and active clients render "could not be read":',
      subErr.message
    );
  }
  const subsUnknown = !!subErr;
  const subs = subRows ?? [];
  // One client is one client, however many active rows they hold with this trainer (nothing in the
  // schema stops two): the revenue sums below keep every row, the counts and the roster do not.
  const clientIds = [...new Set(subs.map((r: { client_id: string }) => r.client_id).filter(Boolean))] as string[];
  const activeClients = subsUnknown ? null : clientIds.length;

  // Churn (Business page): the subscriptions that ended, newest first. There is no
  // cancellation survey yet, so exit reasons are always null — the UI says so
  // instead of inventing one.
  // ⚠ EVERY READ BELOW KEEPS ITS ERROR, for the reason the subscriptions read above states: an
  // empty list is a claim ("no cancellations", "no weigh-ins", "no sessions"), and a failed read
  // has not made it. The figure goes null and the page says it could not be read.
  // ⚠ ENDED IS THE TRAJECTORY'S CLOSED SET, NOT 'canceled' ALONE (the sweep after #2394 round 10). The
  // series closes a span on every status outside active, trialing and past_due (a never-started
  // checkout is no row at all), so an 'unpaid' or 'paused' plan counted as leaving in the pace and was
  // missing from this list. '*' so each row ends where the series ends it (subEndedAt reads
  // canceled_at / ended_at when a migration adds them; naming them would error the read before).
  const { data: churnRows, error: churnErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .not('status', 'in', `(${NOT_ENDED_STATUSES.join(',')})`)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(12);
  const churnIds = (churnRows ?? []).map((r) => r.client_id).filter(Boolean);
  const churnNames = new Map<string, string>();
  // The churned clients whose names went unread: the call below failed, so it named none of them.
  const churnUnread = new Set<string>();
  if (churnIds.length) {
    // ⚠ A CHURNED CLIENT IS OUTSIDE THE COACH POLICY BY DEFINITION. It scopes to the
    // open statuses (active, trialing and, since 2026-10-18-coach-access-past-due.sql,
    // past_due), and these rows come from status='canceled'.
    // Reading `profiles` directly returned nothing once the USING (true) policy
    // was dropped, and the fallback was the literal string 'Former client' —
    // so this failed SILENTLY, rendering plausible copy for every churn row.
    const { data, error } = await supabase.rpc('get_display_names', { p_ids: churnIds });
    if (error) {
      // A silent fall-through here renders plausible copy — the exact failure
      // this PR exists to stop. The likeliest cause is a deploy-order mismatch:
      // 2026-08-04 applied before this code shipped, or 2026-08-03 not applied.
      // ⚠ AND IT IS SAID ON THE PAGE, NOT ONLY IN THE LOG: each row's nameUnread (below). The
      // fallback 'Former client' read as "no name on file", in English in every language.
      console.warn('[shape-app] trainer analytics: get_display_names failed — every churn row\'s name renders as unread:', error.message);
      for (const id of churnIds) churnUnread.add(String(id));
    }
    for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) {
      churnNames.set(String(r.user_id), String(r.full_name ?? '').trim());
    }
  }
  if (churnErr) console.warn('[shape-app] trainer analytics: churn read failed — churn renders as unread:', churnErr.message);
  const grossCents = subs.reduce(
    (sum: number, r: { price_cents: number | null }) => sum + (r.price_cents ?? 0),
    0
  );
  // Net MRR from each row's STORED fee_bps (BYO subs pay 0% — the coach keeps
  // 100%), never a hardcoded 85%: the stored rate is the billing truth.
  const netCents = subs.reduce(
    (sum: number, r: { price_cents: number | null; fee_bps?: number | null }) =>
      sum + coachCutCents(r.price_cents ?? 0, bpsToRate(r.fee_bps ?? 1500)),
    0
  );

  // BYO origin labels (rails #1794, Business page): filled by the roster
  // block's profiles lookup (profileNames); byOrigin is built after it (below).
  const activeNames = new Map<string, string>();

  // Appointment counts, counted by the database: the rows themselves were read with a 1,000-row
  // limit and no order, so past 1,000 lifetime sessions every count was a sample (Codex on #2324).
  const nowIso = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const countSessions = () => supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId);
  const sessCounts = await Promise.all([
    countSessions(),
    countSessions().eq('status', 'completed'),
    countSessions().in('status', ['requested', 'confirmed']).gte('scheduled_at', nowIso),
    countSessions().gte('scheduled_at', todayStart.toISOString()).lt('scheduled_at', todayEnd.toISOString()).neq('status', 'cancelled'),
  ]);
  const sessErr = sessCounts.find((r) => r.error)?.error ?? null;
  if (sessErr) console.warn('[shape-app] trainer analytics: sessions count failed — session counts render as unread:', sessErr.message);
  const [totalSessions, completedSessions, upcomingSessions, bookedToday] = sessCounts.map((r) => r.count ?? 0);

  // Count of programs this trainer has published, for the home masthead ticker.
  const { count: programsCount, error: programsErr } = await supabase
    .from('client_workouts')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', providerId);

  // -------- Client-progress rollups (roster-wide) ---------------------------
  const since30Iso = new Date(Date.now() - 30 * 86400000).toISOString();
  const since30Date = since30Iso.slice(0, 10);
  const since7Iso = new Date(Date.now() - 7 * 86400000).toISOString();

  // ⚠ A FIGURE THAT COULD NOT BE READ IS NULL, NOT 0. `data || []` turned a failed read into a
  // roster that did no work, and the Business page printed it as a measurement.
  type RosterRow = {
    client_id: string;
    workouts30d: number | null;
    workouts7d: number | null;
    weightStart: number | null;
    weightLatest: number | null;
    weightChangeLb: number | null;
    prs30d: number | null;
    // null when no name is on file or none could be read; nameUnread says which.
    name?: string | null;
    nameUnread?: boolean;
  };
  const roster: RosterRow[] = [];
  // A failed subscriptions read leaves no roster to read, so every outcome starts unknown, not 0
  // (with no clients, the block below is skipped and these are what the page shows).
  let totalWorkouts30d: number | null = subsUnknown ? null : 0;
  let totalWorkouts7d: number | null = subsUnknown ? null : 0;
  let totalPrs30d: number | null = subsUnknown ? null : 0;
  let adherenceNum = 0;
  let adherenceDen = 0;
  let weightsUnknown = subsUnknown;

  if (clientIds.length) {
    // workout_sessions / workout_set_logs RLS (can_access_workout_session)
    // only exposes rows where THIS trainer is the session's provider, so a
    // client's self-logged workouts are invisible and the roster would
    // under-report workouts + PRs. clientIds here are already verified as
    // this trainer's active subscribers (read via the provider-scoped
    // subscriptions policy), so it's safe to read their workout aggregates
    // with the service-role client, constrained to exactly those clients.
    const admin = createAdminClient();
    const [workoutRes, snapRes, prsByClient, rosterNames] = await Promise.all([
      readAllById<SessionRow>((after) => {
        let q = admin
          .from('workout_sessions')
          .select('id, client_id, started_at, ended_at, created_at')
          .in('client_id', clientIds)
          // A reviewed session is a finished one the coach has looked at (get_client_lifts counts both).
          .in('status', ['completed', 'reviewed'])
          .or(`started_at.gte."${since30Iso}",and(started_at.is.null,ended_at.gte."${since30Iso}"),and(started_at.is.null,ended_at.is.null,created_at.gte."${since30Iso}")`);
        if (after) q = q.gt('id', after);
        // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
        return q.order('id', { ascending: true }).limit(ROW_PAGE);
      }),
      // Weigh-ins only; each client's first and latest are picked below, by date.
      readAllById<{ id: string; user_id: string; snapshot_date: string; weight_lb: number | string }>((after) => {
        let q = supabase
          .from('daily_health_snapshot')
          .select('id, user_id, snapshot_date, weight_lb')
          .in('user_id', clientIds)
          .gte('snapshot_date', since30Date)
          .not('weight_lb', 'is', null);
        if (after) q = q.gt('id', after);
        // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
        return q.order('id', { ascending: true }).limit(ROW_PAGE);
      }),
      clientPrs(supabase, clientIds),
      // ⚠ EVERY CLIENT'S NAME, A BATCH OF IDS AT A TIME (src/lib/client-names.ts). One select over
      // every id stopped at 1,000 rows, could pass the URL length limit, and dropped its error: the
      // names past it, or all of them, read "Client". A batch that fails comes back as unread.
      profileNames(supabase, clientIds),
    ]);
    const workoutsUnknown = !!workoutRes.error;
    if (workoutsUnknown) {
      console.warn('[shape-app] trainer analytics: workout sessions read failed — workouts and adherence render as unknown:', workoutRes.error?.message);
    }

    const workoutsByClient = new Map<string, { wk30: number; wk7: number }>();
    for (const r of workoutRes.data || []) {
      const k = String(r.client_id);
      const slot = workoutsByClient.get(k) || { wk30: 0, wk7: 0 };
      slot.wk30 += 1;
      if (new Date(String(sessionAt(r))).toISOString() >= since7Iso) slot.wk7 += 1;
      workoutsByClient.set(k, slot);
    }

    const weightsByClient = new Map<string, number[]>();
    weightsUnknown = !!snapRes.error;
    if (weightsUnknown) console.warn('[shape-app] trainer analytics: weigh-ins read failed — weight trends render as unread:', snapRes.error?.message);
    // The pages come in id order; a client's weigh-ins are put in date order before first and latest.
    const weighIns = (snapRes.data || []).slice().sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    for (const r of weighIns) {
      if (r.weight_lb == null) continue;
      const k = String(r.user_id);
      const list = weightsByClient.get(k) || [];
      list.push(Number(r.weight_lb));
      weightsByClient.set(k, list);
    }

    for (const [id, name] of rosterNames.names) activeNames.set(id, name);

    if (workoutsUnknown) { totalWorkouts30d = null; totalWorkouts7d = null; }
    for (const cid of clientIds) {
      const w = workoutsUnknown ? null : workoutsByClient.get(cid) || { wk30: 0, wk7: 0 };
      const weights = weightsByClient.get(cid) || [];
      const wStart = weights.length ? weights[0] : null;
      const wLatest = weights.length ? weights[weights.length - 1] : null;
      const wDelta = wStart != null && wLatest != null ? wLatest - wStart : null;
      const prs = prsByClient.get(cid) ?? null;
      if (w && totalWorkouts30d != null && totalWorkouts7d != null) {
        totalWorkouts30d += w.wk30;
        totalWorkouts7d += w.wk7;
        // Adherence proxy: completed workouts vs target of 4/wk over the last 4 wk.
        adherenceDen += 16;
        adherenceNum += Math.min(16, w.wk30);
      }
      // One client's PRs unread leaves the roster's total unread, not short.
      totalPrs30d = prs == null || totalPrs30d == null ? null : totalPrs30d + prs;
      roster.push({
        client_id: cid,
        workouts30d: w ? w.wk30 : null,
        workouts7d: w ? w.wk7 : null,
        weightStart: wStart,
        weightLatest: wLatest,
        weightChangeLb: wDelta != null ? Math.round(wDelta * 10) / 10 : null,
        prs30d: prs,
      });
    }
    // Attach names for the roster table. ⚠ A NAME THE ROUTE DOESN'T HAVE IS NULL, AND nameUnread SAYS
    // WHY: the read failed (true) or no name is on file (false). It was the English 'Client' for
    // both, so a failed read looked like a roster of nameless clients, in every language.
    for (const r of roster) {
      r.name = activeNames.get(r.client_id) || null;
      r.nameUnread = rosterNames.unread.has(r.client_id);
    }
  }

  // ⚠ NULL, NOT 0, WHEN THERE IS NOTHING TO MEASURE. A goal bound to this
  // figure renders 0 as a measurement — "0% of 95%" under a "Live" label — for
  // a coach who simply has no planned sessions yet.
  const avgAdherencePct = adherenceDen ? Math.round((adherenceNum / adherenceDen) * 100) : null;

  // The practice trajectory (review 2026-09-09, R8): every subscription this
  // trainer has ever had, any status, plus paid one-time purchases — bucketed by
  // ISO week into active / added / ended / MRR / one-time. Read with the same
  // provider-scoped policies as the rows above.
  //
  // ⚠ A FAILED READ MUST NOT RENDER AS "no subscribers yet". `data` is null
  // for an RLS denial, a timeout or a pre-migration column mismatch alike, and
  // an empty series is a claim about the coach's business rather than about the
  // read — so the error sends `trajectory: null` and the plate says it could not
  // be read.
  // ⚠ EVERY ROW, A PAGE AT A TIME (Codex, #2394). This was one read, newest first, cut at 1,000
  // by the API whatever its `.limit(2000)` said. The cut dropped the OLDEST rows, and those hold
  // the longest-standing clients who are still active, so today's headcount and MRR (which the
  // Plan and the Goal tab start from) came out short with no error. The series doesn't depend on
  // the order the rows arrive in.
  const [subsAllRes, purchasesRes] = await Promise.all([
    readAllById<{ id: string }>((after) => {
      let q = supabase.from('subscriptions').select('*').eq('provider_role', 'trainer').eq('provider_id', providerId);
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    }),
    readAllById<{ id: string }>((after) => {
      let q = supabase.from('one_time_purchases').select('*').eq('provider_role', 'trainer').eq('provider_id', providerId).eq('status', 'paid');
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    }),
  ]);
  if (subsAllRes.error) {
    console.warn('[shape-app] trainer analytics: trajectory subscriptions read failed — the plate renders "could not be read":', subsAllRes.error.message);
  }
  if (purchasesRes.error) {
    console.warn('[shape-app] trainer analytics: trajectory purchases read failed — one-time revenue omitted:', purchasesRes.error.message);
  }
  // ⚠ A FAILED PURCHASES READ IS CARRIED, NOT COERCED TO ZERO (CodeRabbit, #2030).
  // `purchasesRes.data ?? []` makes every week's one-time revenue 0, and the CSV export
  // then writes `0.00` into a coach's accounting file — turning an RLS change, a schema
  // drift or a timeout into the financial claim that no one-time revenue existed. The
  // warning above already knew; the payload did not say so, and a consumer cannot
  // distinguish "none" from "not read" without being told.
  // One instant for the series and the churn list below, so both clamp a close to the same "now".
  const seriesNow = Date.now();
  const trajectory = subsAllRes.error
    ? null
    : {
      oneTimeUnknown: !!purchasesRes.error,
      ...buildTrajectory({
        subs: subsAllRes.data ?? [],
        purchases: purchasesRes.data ?? [],
        now: seriesNow,
        cutCents: (priceCents: number, feeBps: number | null) => coachCutCents(priceCents, bpsToRate(feeBps ?? 1500)),
      }),
    };

  // Today's clients' rows: the trajectory's open rows, or the active read when the trajectory could
  // not be read (openSubsToday says why). The brought-in share and the origin feed are both taken over
  // them, so the Plan's "1 of your 3" and the Growth tab's "1 you brought" count the same clients.
  const todaySubs = openSubsToday(subsAllRes.error ? null : subsAllRes.data ?? [], subsUnknown ? null : subs);

  // Per-client attribution feed — today's subscriptions + recent paid one-time
  // purchases, each labelled from its STORED (origin, fee_bps) pair. Shared
  // with the nutritionist route so the mapping can't drift.
  const byOrigin = todaySubs ? await buildOriginFeed(supabase, 'trainer', providerId, todaySubs, activeNames) : null;

  // ⚠ A PLAN THAT ENDED IS DECIDED WHEN IT ENDED, NOT BY WHETHER THE CLIENT IS HERE NOW (the sweep
  // after #2394 round 10; coach-trajectory.mjs subDeparture). Asked "do they hold a plan now?", a
  // client who left on Aug 20 and came back on Sep 25 read as still a client and dropped out of the
  // list, while the trajectory and the pace counted the Aug 20 departure. Each row is decided from the
  // series' own rows (every status, read above), at the close of the ISO week it ended in, the instant
  // the series' weekly `ended` is judged at (its review: judged at the instant itself, a client whose
  // card failed on a Monday and who came back on the Thursday was a departure here and none in the
  // pace). `departed` true is "this ended their membership", false "they held another plan then",
  // null "the trajectory rows could not be read", which the page says rather than guessing. endedAt
  // is the series' own close (clamped to now): a member who cancelled mid-period keeps a period end in
  // the future, and that is not when they left.
  // ⚠ A NAME IS NULL WHEN NONE IS ON FILE OR NONE COULD BE READ, AND nameUnread SAYS WHICH (it was the
  // English 'Former client' for both): each page words the two in its own copy.
  const churn = churnErr ? null : (churnRows ?? []).map((r) => {
    const end = subDeparture(r, subsAllRes.data ?? [], seriesNow);
    return {
      name: churnNames.get(String(r.client_id)) || null,
      nameUnread: churnUnread.has(String(r.client_id)),
      clientId: r.client_id == null ? null : String(r.client_id),
      departed: subsAllRes.error ? null : end.departed,
      startedAt: r.created_at ?? null,
      endedAt: end.endedAt == null ? null : new Date(end.endedAt).toISOString(),
      priceCents: r.price_cents ?? null,
      reason: null, // collects once the cancellation survey ships
    };
  });

  // Renewing in the next 7 days (Business page, Money tab). Each one is asked of Stripe, because a
  // member who cancelled keeps an active row until the period ends (src/lib/coach-renewals.mjs).
  // Built from the active subscriptions: when they could not be read, neither can this.
  const due = subsUnknown || !wantRenewals ? [] : pickRenewals(subs as RenewalSource[]);
  const [stripeSummary, cancelFlags] = await Promise.all([
    loadStripe(trainerRow.stripe_account_id ?? null, trainerRow.stripe_account_status ?? null),
    loadCancelFlags(due.map((r) => r.stripe_subscription_id).filter((v): v is string => !!v).map(String), RENEWAL_CHECK_CAP),
  ]);
  const renewals = subsUnknown
    ? null
    : renewalRows(due, {
      names: activeNames,
      flags: cancelFlags,
      cutCents: (priceCents: number, feeBps: number | null) => coachCutCents(priceCents, bpsToRate(feeBps ?? 1500)),
    });

  return NextResponse.json({
    isTrainer: true,
    providerId,
    churn,
    // Built from today's subscriptions: when they could not be read, neither can this.
    byOrigin,
    // The share of CLIENTS the coach brought: the Plan and Goal calculators start from it. Taken over
    // today's clients, the trajectory's latest week, so it is "of" the same count the Plan says "you
    // have" (the sweep after #2394 round 10).
    byoMix: todaySubs ? byoMixOf(todaySubs) : null,
    trajectory,
    ...(wantRenewals ? { renewals } : {}),
    metrics: {
      mrrGrossCents: subsUnknown ? null : grossCents,
      mrrNetCents: subsUnknown ? null : netCents,
      activeClients,
      totalSessions: sessErr ? null : totalSessions,
      completedSessions: sessErr ? null : completedSessions,
      upcomingSessions: sessErr ? null : upcomingSessions,
    },
    clientProgress: {
      activeClients,
      workouts30d: totalWorkouts30d,
      workouts7d: totalWorkouts7d,
      prs30d: totalPrs30d,
      avgAdherencePct,
      // The weigh-ins could not be read: an empty "top weight loss" is not "no trends".
      weightsUnknown,
      // The roster itself could not be read: an empty list below is not "no history".
      rosterUnknown: subsUnknown,
      roster: roster
        .slice()
        .sort((a, b) => (b.workouts30d ?? -1) - (a.workouts30d ?? -1))
        .slice(0, 12),
    },
    ticker: {
      bookedToday: sessErr ? null : bookedToday,
      upcomingSessions: sessErr ? null : upcomingSessions,
      activeClients,
      programsCount: programsErr ? null : programsCount ?? 0,
      workouts7d: totalWorkouts7d,
      avgAdherencePct,
    },
    stripe: stripeSummary,
  });
}
