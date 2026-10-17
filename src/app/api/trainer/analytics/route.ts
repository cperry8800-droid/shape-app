// Live data for the newdesign Trainer "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// trainer's connected account. RLS scopes the Supabase queries to the
// signed-in trainer. The compliance / at-risk / correlation surfaces are
// intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadStripe, loadCancelFlags } from '@/lib/stripe';
import { pickRenewals, renewalRows, RENEWAL_CHECK_CAP, type RenewalSource } from '@/lib/coach-renewals.mjs';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';
import { buildOriginFeed } from '@/lib/origin-attribution';
import { buildTrajectory } from '@/lib/coach-trajectory.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ A PR IS A LIFT BEATEN, NOT A SET LOGGED. This counted every completed row of
// workout_set_logs, so a roster's ordinary sets (dozens a workout) were reported as
// "PRs hit". The count is now the one the coach app shows on each client: get_client_lifts'
// `prs`, the moves whose best in the last 30 days beats their best in the 30–90 days
// before. It runs as the trainer (is_coach_on_client), eight clients at a time; a failed or
// refused call leaves that client's count unknown (null), never 0.
async function clientPrs(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

// ⚠ EVERY ROW, A PAGE AT A TIME. One select returns at most 1,000 rows (the API's cap) and says
// nothing when it stops there, so a big roster's workouts and weigh-ins were read short (Codex on
// #2324). Keyset on id, not an offset (cron/guardrail-health says why: a row written mid-read
// shifts every later offset); a read that reaches the ceiling is unknown, not short. `page` builds
// one filtered page: rows after `after`, ordered by id, ROW_PAGE at most.
const ROW_PAGE = 1000;
const ROW_PAGES = 50;
async function readAllById<T extends { id: unknown }>(
  page: (after: string | null) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < ROW_PAGES; i += 1) {
    const { data, error } = await page(after);
    if (error) return { data: null, error };
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < ROW_PAGE) return { data: rows, error: null };
    after = String(got[got.length - 1].id);
  }
  return { data: null, error: { message: `more than ${ROW_PAGE * ROW_PAGES} rows` } };
}

// When a workout happened: its start, else its end, else when it was logged (`started_at` can be
// null; `created_at` cannot). The window filter below reads the same order.
type SessionRow = { id: string; client_id: string; started_at: string | null; ended_at: string | null; created_at: string };
const sessionAt = (r: SessionRow) => r.started_at ?? r.ended_at ?? r.created_at;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
      .in('status', ['active', 'trialing']);
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

  // Churn (Business page): canceled subscriptions, newest first. There is no
  // cancellation survey yet, so exit reasons are always null — the UI says so
  // instead of inventing one.
  // ⚠ EVERY READ BELOW KEEPS ITS ERROR, for the reason the subscriptions read above states: an
  // empty list is a claim ("no cancellations", "no weigh-ins", "no sessions"), and a failed read
  // has not made it. The figure goes null and the page says it could not be read.
  const { data: churnRows, error: churnErr } = await supabase
    .from('subscriptions')
    .select('client_id, price_cents, created_at, current_period_end')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .eq('status', 'canceled')
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(12);
  const churnIds = (churnRows ?? []).map((r) => r.client_id).filter(Boolean);
  const churnNames = new Map<string, string>();
  if (churnIds.length) {
    // ⚠ A CHURNED CLIENT IS OUTSIDE THE COACH POLICY BY DEFINITION. It scopes to
    // status in ('active','trialing'), and these rows come from status='canceled'.
    // Reading `profiles` directly returned nothing once the USING (true) policy
    // was dropped, and the fallback below is the literal string 'Former client' —
    // so this failed SILENTLY, rendering plausible copy for every churn row.
    const { data, error } = await supabase.rpc('get_display_names', { p_ids: churnIds });
    if (error) {
      // A silent fall-through here renders plausible copy — the exact failure
      // this PR exists to stop. The likeliest cause is a deploy-order mismatch:
      // 2026-08-04 applied before this code shipped, or 2026-08-03 not applied.
      console.warn("[shape-app] trainer analytics: get_display_names failed — every churn row renders as 'Former client':", error.message);
    }
    for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) {
      churnNames.set(String(r.user_id), String(r.full_name ?? '').trim());
    }
  }
  if (churnErr) console.warn('[shape-app] trainer analytics: churn read failed — churn renders as unread:', churnErr.message);
  const churn = churnErr ? null : (churnRows ?? []).map((r) => ({
    name: churnNames.get(String(r.client_id)) || 'Former client',
    startedAt: r.created_at ?? null,
    endedAt: r.current_period_end ?? null,
    priceCents: r.price_cents ?? null,
    reason: null, // collects once the cancellation survey ships
  }));
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
  // block's ONE profiles lookup; byOrigin is built after it (below).
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
    const [workoutRes, snapRes, prsByClient, namesRes] = await Promise.all([
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
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds),
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

    for (const r of namesRes.data || []) activeNames.set(String(r.id), String(r.full_name || '').trim());

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
    // Attach names for the roster table.
    for (const r of roster as Array<RosterRow & { name?: string }>) {
      r.name = activeNames.get(r.client_id) || 'Client';
    }
  }

  // Per-client attribution feed — subscriptions + recent paid one-time
  // purchases, each labelled from its STORED (origin, fee_bps) pair. Shared
  // with the nutritionist route so the mapping can't drift.
  const byOrigin = await buildOriginFeed(supabase, 'trainer', providerId, subs, activeNames);

  // ⚠ NULL, NOT 0, WHEN THERE IS NOTHING TO MEASURE. A goal bound to this
  // figure renders 0 as a measurement — "0% of 95%" under a "Live" label — for
  // a coach who simply has no planned sessions yet.
  const avgAdherencePct = adherenceDen ? Math.round((adherenceNum / adherenceDen) * 100) : null;

  // The practice trajectory (review 2026-09-09, R8): every subscription this
  // trainer has ever had, any status, plus paid one-time purchases — bucketed by
  // ISO week into active / added / ended / MRR / one-time. Read with the same
  // provider-scoped policies as the rows above.
  //
  // ⚠ NEWEST FIRST, because the cap has to cut the OLD end. Ordered ascending,
  // a coach past the limit would lose their most recent rows — the half
  // activeNow, the adds and the churn rate are computed from.
  //
  // ⚠ AND A FAILED READ MUST NOT RENDER AS "no subscribers yet". `data` is null
  // for an RLS denial, a timeout or a pre-migration column mismatch alike, and
  // an empty series is a claim about the coach's business rather than about the
  // read — so the error sends `trajectory: null` and the plate says it could not
  // be read.
  const [subsAllRes, purchasesRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('one_time_purchases')
      .select('*')
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(2000),
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
  const trajectory = subsAllRes.error
    ? null
    : {
      oneTimeUnknown: !!purchasesRes.error,
      ...buildTrajectory({
        subs: subsAllRes.data ?? [],
        purchases: purchasesRes.data ?? [],
        cutCents: (priceCents: number, feeBps: number | null) => coachCutCents(priceCents, bpsToRate(feeBps ?? 1500)),
      }),
    };

  // Renewing in the next 7 days (Business page, Money tab). Each one is asked of Stripe, because a
  // member who cancelled keeps an active row until the period ends (src/lib/coach-renewals.mjs).
  // Built from the active subscriptions: when they could not be read, neither can this.
  const due = subsUnknown ? [] : pickRenewals(subs as RenewalSource[]);
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
    // Built from the active subscriptions: when they could not be read, neither can this.
    byOrigin: subsUnknown ? null : byOrigin,
    trajectory,
    renewals,
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
