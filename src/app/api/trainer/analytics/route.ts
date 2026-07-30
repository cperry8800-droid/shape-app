// Live data for the newdesign Trainer "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// trainer's connected account. RLS scopes the Supabase queries to the
// signed-in trainer. The compliance / at-risk / correlation surfaces are
// intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadStripe } from '@/lib/stripe';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';
import { buildOriginFeed } from '@/lib/origin-attribution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: trainerRow } = await supabase
    .from('trainers')
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!trainerRow) {
    return NextResponse.json({ isTrainer: false });
  }

  const providerId = trainerRow.id;

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB (webhook-fallback parity)
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);
  const subs = subRows ?? [];

  // Churn (Business page): canceled subscriptions, newest first. There is no
  // cancellation survey yet, so exit reasons are always null — the UI says so
  // instead of inventing one.
  const { data: churnRows } = await supabase
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
  const churn = (churnRows ?? []).map((r) => ({
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
  const clientIds = subs.map((r: { client_id: string }) => r.client_id).filter(Boolean);

  // BYO origin labels (rails #1794, Business page): filled by the roster
  // block's ONE profiles lookup; byOrigin is built after it (below).
  const activeNames = new Map<string, string>();

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('scheduled_at, status')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .limit(1000);
  const sessions = sessRows ?? [];

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  let completedSessions = 0;
  let upcomingSessions = 0;
  let bookedToday = 0;
  for (const s of sessions) {
    if (s.status === 'completed') {
      completedSessions += 1;
    } else if (
      (s.status === 'requested' || s.status === 'confirmed') &&
      new Date(s.scheduled_at).getTime() >= now
    ) {
      upcomingSessions += 1;
    }
    const sched = new Date(s.scheduled_at).getTime();
    if (sched >= todayStart.getTime() && sched < todayEnd.getTime() && s.status !== 'cancelled') {
      bookedToday += 1;
    }
  }

  // Count of programs this trainer has published, for the home masthead ticker.
  const { count: programsCount } = await supabase
    .from('client_workouts')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', providerId);

  // -------- Client-progress rollups (roster-wide) ---------------------------
  const since30Iso = new Date(Date.now() - 30 * 86400000).toISOString();
  const since30Date = since30Iso.slice(0, 10);
  const since7Iso = new Date(Date.now() - 7 * 86400000).toISOString();

  type RosterRow = {
    client_id: string;
    workouts30d: number;
    workouts7d: number;
    weightStart: number | null;
    weightLatest: number | null;
    weightChangeLb: number | null;
    prs30d: number;
  };
  const roster: RosterRow[] = [];
  let totalWorkouts30d = 0;
  let totalWorkouts7d = 0;
  let totalPrs30d = 0;
  let adherenceNum = 0;
  let adherenceDen = 0;

  if (clientIds.length) {
    // workout_sessions / workout_set_logs RLS (can_access_workout_session)
    // only exposes rows where THIS trainer is the session's provider, so a
    // client's self-logged workouts are invisible and the roster would
    // under-report workouts + PRs. clientIds here are already verified as
    // this trainer's active subscribers (read via the provider-scoped
    // subscriptions policy), so it's safe to read their workout aggregates
    // with the service-role client, constrained to exactly those clients.
    const admin = createAdminClient();
    const [workoutRes, snapRes, prRes, namesRes] = await Promise.all([
      admin
        .from('workout_sessions')
        .select('client_id, started_at, status')
        .in('client_id', clientIds)
        .eq('status', 'completed')
        .gte('started_at', since30Iso),
      supabase
        .from('daily_health_snapshot')
        .select('user_id, snapshot_date, weight_lb')
        .in('user_id', clientIds)
        .gte('snapshot_date', since30Date)
        .order('snapshot_date', { ascending: true }),
      admin
        .from('workout_set_logs')
        .select('client_id, created_at, completed')
        .in('client_id', clientIds)
        .eq('completed', true)
        .gte('created_at', since30Iso),
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds),
    ]);

    const workoutsByClient = new Map<string, { wk30: number; wk7: number }>();
    for (const r of workoutRes.data || []) {
      const k = String(r.client_id);
      const slot = workoutsByClient.get(k) || { wk30: 0, wk7: 0 };
      slot.wk30 += 1;
      if (r.started_at && new Date(String(r.started_at)).toISOString() >= since7Iso) slot.wk7 += 1;
      workoutsByClient.set(k, slot);
    }

    const weightsByClient = new Map<string, number[]>();
    for (const r of snapRes.data || []) {
      if (r.weight_lb == null) continue;
      const k = String(r.user_id);
      const list = weightsByClient.get(k) || [];
      list.push(Number(r.weight_lb));
      weightsByClient.set(k, list);
    }

    const prsByClient = new Map<string, number>();
    for (const r of prRes.data || []) {
      const k = String(r.client_id);
      prsByClient.set(k, (prsByClient.get(k) || 0) + 1);
    }

    for (const r of namesRes.data || []) activeNames.set(String(r.id), String(r.full_name || '').trim());

    for (const cid of clientIds) {
      const w = workoutsByClient.get(cid) || { wk30: 0, wk7: 0 };
      const weights = weightsByClient.get(cid) || [];
      const wStart = weights.length ? weights[0] : null;
      const wLatest = weights.length ? weights[weights.length - 1] : null;
      const wDelta = wStart != null && wLatest != null ? wLatest - wStart : null;
      const prs = prsByClient.get(cid) || 0;
      totalWorkouts30d += w.wk30;
      totalWorkouts7d += w.wk7;
      totalPrs30d += prs;
      // Adherence proxy: completed workouts vs target of 4/wk over the last 4 wk.
      adherenceDen += 16;
      adherenceNum += Math.min(16, w.wk30);
      roster.push({
        client_id: cid,
        workouts30d: w.wk30,
        workouts7d: w.wk7,
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

  const avgAdherencePct = adherenceDen ? Math.round((adherenceNum / adherenceDen) * 100) : 0;

  const stripeSummary = await loadStripe(
    trainerRow.stripe_account_id ?? null,
    trainerRow.stripe_account_status ?? null
  );

  return NextResponse.json({
    isTrainer: true,
    providerId,
    churn,
    byOrigin,
    metrics: {
      mrrGrossCents: grossCents,
      mrrNetCents: netCents,
      activeClients: subs.length,
      totalSessions: sessions.length,
      completedSessions,
      upcomingSessions,
    },
    clientProgress: {
      activeClients: subs.length,
      workouts30d: totalWorkouts30d,
      workouts7d: totalWorkouts7d,
      prs30d: totalPrs30d,
      avgAdherencePct,
      roster: roster
        .slice()
        .sort((a, b) => b.workouts30d - a.workouts30d)
        .slice(0, 12),
    },
    ticker: {
      bookedToday,
      upcomingSessions,
      activeClients: subs.length,
      programsCount: programsCount ?? 0,
      workouts7d: totalWorkouts7d,
      avgAdherencePct,
    },
    stripe: stripeSummary,
  });
}
