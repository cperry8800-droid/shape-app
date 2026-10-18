// Live data for the newdesign Nutritionist "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// nutritionist's connected account. RLS scopes the Supabase queries to the
// signed-in nutritionist. The compliance / at-risk / correlation surfaces
// are intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadStripe, loadCancelFlags } from '@/lib/stripe';
import { pickRenewals, renewalRows, RENEWAL_CHECK_CAP, type RenewalSource } from '@/lib/coach-renewals.mjs';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';
import { buildOriginFeed, byoMixOf } from '@/lib/origin-attribution';
import { buildTrajectory } from '@/lib/coach-trajectory.mjs';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Renewals cost a Stripe read each, so only the page that shows them asks for them: the Business
  // page sends ?renewals=1, and the Goal page's live figures (dashData.jsx) do not.
  const wantRenewals = new URL(request.url).searchParams.get('renewals') === '1';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: nutriRow, error: nutriErr } = await supabase
    .from('nutritionists')
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();

  // A failed read is not "this account is not a nutritionist" (the trainer route's rule).
  if (nutriErr) {
    console.warn('[shape-app] nutritionist analytics: nutritionist row read failed:', nutriErr.message);
    return NextResponse.json({ error: 'Could not read your listing.' }, { status: 500 });
  }
  if (!nutriRow) {
    return NextResponse.json({ isNutritionist: false });
  }

  const providerId = nutriRow.id;

  // ⚠ THE ERROR IS KEPT. Dropped, a failed read collapses into `subs = []`
  // and the route still answers with a role-valid payload reporting ZERO active
  // clients and ZERO MRR — which the Goal page then shows under a LIVE label,
  // and the revenue calculator adopts as a $0 pace. "You have no clients" and
  // "we could not ask" are different sentences; the subscription-derived
  // figures go null so the card can say which one it is.
  // Every active row, by the trainer route's cursor walk (one read stopped at 1,000 with no error,
  // #2394); at the ceiling it is a failed read, so the figures go null.
  const { data: subRows, error: subErr } = await readAllById<{ id: string; client_id: string; price_cents: number | null; fee_bps?: number | null }>((after) => {
    let q = supabase
      .from('subscriptions')
      .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB (webhook-fallback parity)
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    if (after) q = q.gt('id', after);
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    return q.order('id', { ascending: true }).limit(ROW_PAGE);
  });
  if (subErr) {
    console.warn(
      '[shape-app] nutritionist analytics: subscriptions read failed — MRR and active clients render "could not be read":',
      subErr.message
    );
  }
  const subsUnknown = !!subErr;
  const subs = subRows ?? [];
  // One client is one client, however many active rows they hold with this nutritionist (the
  // trainer route's rule): the revenue sums below keep every row, the counts and the roster do not.
  const clientIds = [...new Set(subs.map((r: { client_id: string }) => r.client_id).filter(Boolean))] as string[];
  const activeClients = subsUnknown ? null : clientIds.length;
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

  // Churn (Business page): canceled subscriptions, newest first. No
  // cancellation survey yet → exit reasons are always null and the UI says so.
  // ⚠ THE ERROR IS KEPT: an empty list says "no cancellations", which a failed read has not said.
  const { data: churnRows, error: churnErr } = await supabase
    .from('subscriptions')
    .select('client_id, price_cents, created_at, current_period_end')
    .eq('provider_role', 'nutritionist')
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
      console.warn("[shape-app] nutritionist analytics: get_display_names failed — every churn row renders as 'Former client':", error.message);
    }
    for (const r of (data ?? []) as { user_id: string; full_name: string | null }[]) {
      churnNames.set(String(r.user_id), String(r.full_name ?? '').trim());
    }
  }
  if (churnErr) console.warn('[shape-app] nutritionist analytics: churn read failed — churn renders as unread:', churnErr.message);
  const churn = churnErr ? null : (churnRows ?? []).map((r) => ({
    name: churnNames.get(String(r.client_id)) || 'Former client',
    startedAt: r.created_at ?? null,
    endedAt: r.current_period_end ?? null,
    priceCents: r.price_cents ?? null,
    reason: null, // collects once the cancellation survey ships
  }));

  // Appointment counts, counted by the database as the trainer route counts them: the rows were read
  // with a 1,000-row limit and no order, so past 1,000 lifetime consults every count was a sample,
  // and a failed read was 0 consults (#2394). A failed count is unread, not 0.
  const nowIso = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const countSessions = () => supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId);
  const sessCounts = await Promise.all([
    countSessions(),
    countSessions().eq('status', 'completed'),
    countSessions().in('status', ['requested', 'confirmed']).gte('scheduled_at', nowIso),
    countSessions().gte('scheduled_at', todayStart.toISOString()).lt('scheduled_at', todayEnd.toISOString()).neq('status', 'cancelled'),
  ]);
  const sessErr = sessCounts.find((r) => r.error)?.error ?? null;
  if (sessErr) console.warn('[shape-app] nutritionist analytics: sessions count failed — session counts render as unread:', sessErr.message);
  const [totalSessions, completedSessions, upcomingSessions, bookedToday] = sessCounts.map((r) => r.count ?? 0);

  // New clients in the last 7 days (any subscription created since).
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: newClients7d } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId)
    .gte('created_at', since7);

  // -------- Client-progress rollups for nutritionist roster -----------------
  const since30Date = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // ⚠ A FIGURE THAT COULD NOT BE READ IS NULL, NOT 0 (the trainer route's rule): a failed read
  // is not a roster that logged nothing.
  type RosterRow = {
    client_id: string;
    name?: string;
    daysLogged30d: number | null;
    avgProteinG: number | null;
    avgCalories: number | null;
    weightStart: number | null;
    weightLatest: number | null;
    weightChangeLb: number | null;
  };
  const roster: RosterRow[] = [];
  let totalDaysLogged = 0;
  let totalProteinDays = 0;
  let proteinHits = 0; // >=120g
  // A failed subscriptions read leaves no roster to read, so its logs start unknown, not 0.
  let snapsUnknown = subsUnknown;

  if (clientIds.length) {
    // dietary_kcal = calories EATEN; the snapshot's `calories` is a device's burn.
    type Snap = { id: string; user_id: string; snapshot_date: string; protein_g: number | null; dietary_kcal: number | null; weight_lb: number | null };
    const [snapRes, namesRes] = await Promise.all([
      // Every row in the window, a page at a time: about 33 clients logging daily pass 1,000 rows,
      // and the one read (in date order) kept the oldest days and dropped every client's latest.
      readAllById<Snap>((after) => {
        let q = supabase
          .from('daily_health_snapshot')
          .select('id, user_id, snapshot_date, protein_g, dietary_kcal, weight_lb')
          .in('user_id', clientIds)
          .gte('snapshot_date', since30Date);
        if (after) q = q.gt('id', after);
        // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
        return q.order('id', { ascending: true }).limit(ROW_PAGE);
      }),
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds),
    ]);

    snapsUnknown = !!snapRes.error;
    if (snapsUnknown) console.warn('[shape-app] nutritionist analytics: snapshots read failed — logs, protein and weight trends render as unread:', snapRes.error?.message);
    const byClient = new Map<string, Snap[]>();
    // The pages come in id order; a client's rows are put in date order before first and latest.
    const snaps = (snapRes.data || []).slice().sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
    for (const r of snaps) {
      const list = byClient.get(r.user_id) || [];
      list.push(r);
      byClient.set(r.user_id, list);
    }
    for (const r of namesRes.data || []) activeNames.set(String(r.id), String(r.full_name || '').trim());

    for (const cid of clientIds) {
      if (snapsUnknown) {
        roster.push({ client_id: cid, daysLogged30d: null, avgProteinG: null, avgCalories: null, weightStart: null, weightLatest: null, weightChangeLb: null });
        continue;
      }
      const rows = byClient.get(cid) || [];
      const proteins = rows.map((r) => r.protein_g).filter((v) => v != null) as number[];
      const cals = rows.map((r) => r.dietary_kcal).filter((v) => v != null) as number[];
      const weights = rows.map((r) => r.weight_lb).filter((v) => v != null) as number[];
      const wStart = weights.length ? Number(weights[0]) : null;
      const wLatest = weights.length ? Number(weights[weights.length - 1]) : null;
      const wDelta = wStart != null && wLatest != null ? wLatest - wStart : null;
      // A logged day is a day with a meal on it (calories eaten or protein). A
      // watch, sleep or weigh-in row alone is not a nutrition log.
      const loggedDays = rows.filter((r) => r.dietary_kcal != null || r.protein_g != null).length;
      totalDaysLogged += loggedDays;
      for (const p of proteins) { totalProteinDays += 1; if (Number(p) >= 120) proteinHits += 1; }
      roster.push({
        client_id: cid,
        daysLogged30d: loggedDays,
        avgProteinG: proteins.length ? Math.round(proteins.reduce((a, b) => a + Number(b), 0) / proteins.length) : null,
        avgCalories: cals.length ? Math.round(cals.reduce((a, b) => a + Number(b), 0) / cals.length) : null,
        weightStart: wStart,
        weightLatest: wLatest,
        weightChangeLb: wDelta != null ? Math.round(wDelta * 10) / 10 : null,
      });
    }
    for (const r of roster) r.name = activeNames.get(r.client_id) || 'Client';
  }

  // Per-client attribution feed — subscriptions + recent paid one-time
  // purchases, each labelled from its STORED (origin, fee_bps) pair. Shared
  // with the trainer route so the mapping can't drift.
  const byOrigin = await buildOriginFeed(supabase, 'nutritionist', providerId, subs, activeNames);

  // ⚠ NULL, NOT 0, WHEN THERE IS NOTHING TO MEASURE — see the trainer route. Nor when the logs
  // could not be read.
  const proteinAdherencePct = totalProteinDays ? Math.round((proteinHits / totalProteinDays) * 100) : null;
  const avgLogsPerClient = snapsUnknown ? null : clientIds.length ? Math.round(totalDaysLogged / clientIds.length) : 0;

  // The practice trajectory (review 2026-09-09, R8) — the same series the trainer
  // route builds, read the same way: every row, a page at a time, and a failed read
  // (or one past readAllById's ceiling) sends `trajectory: null` so the plate says it
  // could not be read instead of asserting the coach has no subscribers.
  // ⚠ EVERY ROW, A PAGE AT A TIME (Codex, #2394). This was one read, newest first, cut at 1,000
  // by the API whatever its `.limit(2000)` said. The cut dropped the OLDEST rows, and those hold
  // the longest-standing clients who are still active, so today's headcount and MRR (which the
  // Plan and the Goal tab start from) came out short with no error. The series doesn't depend on
  // the order the rows arrive in.
  const [subsAllRes, purchasesRes] = await Promise.all([
    readAllById<{ id: string }>((after) => {
      let q = supabase.from('subscriptions').select('*').eq('provider_role', 'nutritionist').eq('provider_id', providerId);
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    }),
    readAllById<{ id: string }>((after) => {
      let q = supabase.from('one_time_purchases').select('*').eq('provider_role', 'nutritionist').eq('provider_id', providerId).eq('status', 'paid');
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    }),
  ]);
  if (subsAllRes.error) {
    console.warn('[shape-app] nutritionist analytics: trajectory subscriptions read failed — the plate renders "could not be read":', subsAllRes.error.message);
  }
  if (purchasesRes.error) {
    console.warn('[shape-app] nutritionist analytics: trajectory purchases read failed — one-time revenue omitted:', purchasesRes.error.message);
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
  const due = subsUnknown || !wantRenewals ? [] : pickRenewals(subs as RenewalSource[]);
  const [stripeSummary, cancelFlags] = await Promise.all([
    loadStripe(nutriRow.stripe_account_id ?? null, nutriRow.stripe_account_status ?? null),
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
    isNutritionist: true,
    providerId,
    churn,
    // Built from the active subscriptions: when they could not be read, neither can this.
    byOrigin: subsUnknown ? null : byOrigin,
    // The share of CLIENTS the coach brought (byoMixOf): the Plan and Goal calculators start from it.
    byoMix: subsUnknown ? null : byoMixOf(subs),
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
      // The roster itself could not be read: an empty list below is not "no history".
      rosterUnknown: subsUnknown,
      // The snapshots could not be read: an empty "top weight loss" is not "no trends", and the
      // log figures are null rather than a roster that logged nothing.
      weightsUnknown: snapsUnknown,
      proteinAdherencePct,
      avgLogsPerClient,
      totalDaysLogged: snapsUnknown ? null : totalDaysLogged,
      roster: roster
        .slice()
        .sort((a, b) => (b.daysLogged30d ?? -1) - (a.daysLogged30d ?? -1))
        .slice(0, 12),
    },
    ticker: {
      consultsToday: sessErr ? null : bookedToday,
      upcomingSessions: sessErr ? null : upcomingSessions,
      activeClients,
      proteinAdherencePct,
      newClients7d: newClients7d ?? 0,
      avgLogsPerClient,
    },
    stripe: stripeSummary,
  });
}
