// Live data for the newdesign Nutritionist "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// nutritionist's connected account. RLS scopes the Supabase queries to the
// signed-in nutritionist. The compliance / at-risk / correlation surfaces
// are intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!nutriRow) {
    return NextResponse.json({ isNutritionist: false });
  }

  const providerId = nutriRow.id;

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB (webhook-fallback parity)
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);
  const subs = subRows ?? [];
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

  // Churn (Business page): canceled subscriptions, newest first. No
  // cancellation survey yet → exit reasons are always null and the UI says so.
  const { data: churnRows } = await supabase
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
  const churn = (churnRows ?? []).map((r) => ({
    name: churnNames.get(String(r.client_id)) || 'Former client',
    startedAt: r.created_at ?? null,
    endedAt: r.current_period_end ?? null,
    priceCents: r.price_cents ?? null,
    reason: null, // collects once the cancellation survey ships
  }));

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('scheduled_at, status')
    .eq('provider_role', 'nutritionist')
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

  type RosterRow = {
    client_id: string;
    name?: string;
    daysLogged30d: number;
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

  if (clientIds.length) {
    const [snapRes, namesRes] = await Promise.all([
      supabase
        .from('daily_health_snapshot')
        .select('user_id, snapshot_date, protein_g, calories, weight_lb')
        .in('user_id', clientIds)
        .gte('snapshot_date', since30Date)
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds),
    ]);

    type Snap = { user_id: string; snapshot_date: string; protein_g: number | null; calories: number | null; weight_lb: number | null };
    const byClient = new Map<string, Snap[]>();
    for (const r of (snapRes.data || []) as Snap[]) {
      const list = byClient.get(r.user_id) || [];
      list.push(r);
      byClient.set(r.user_id, list);
    }
    for (const r of namesRes.data || []) activeNames.set(String(r.id), String(r.full_name || '').trim());

    for (const cid of clientIds) {
      const rows = byClient.get(cid) || [];
      const proteins = rows.map((r) => r.protein_g).filter((v) => v != null) as number[];
      const cals = rows.map((r) => r.calories).filter((v) => v != null) as number[];
      const weights = rows.map((r) => r.weight_lb).filter((v) => v != null) as number[];
      const wStart = weights.length ? Number(weights[0]) : null;
      const wLatest = weights.length ? Number(weights[weights.length - 1]) : null;
      const wDelta = wStart != null && wLatest != null ? wLatest - wStart : null;
      totalDaysLogged += rows.length;
      for (const p of proteins) { totalProteinDays += 1; if (Number(p) >= 120) proteinHits += 1; }
      roster.push({
        client_id: cid,
        daysLogged30d: rows.length,
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

  const proteinAdherencePct = totalProteinDays ? Math.round((proteinHits / totalProteinDays) * 100) : 0;
  const avgLogsPerClient = clientIds.length ? Math.round(totalDaysLogged / clientIds.length) : 0;

  const stripeSummary = await loadStripe(
    nutriRow.stripe_account_id ?? null,
    nutriRow.stripe_account_status ?? null
  );

  return NextResponse.json({
    isNutritionist: true,
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
      proteinAdherencePct,
      avgLogsPerClient,
      totalDaysLogged,
      roster: roster
        .slice()
        .sort((a, b) => b.daysLogged30d - a.daysLogged30d)
        .slice(0, 12),
    },
    ticker: {
      consultsToday: bookedToday,
      upcomingSessions,
      activeClients: subs.length,
      proteinAdherencePct,
      newClients7d: newClients7d ?? 0,
      avgLogsPerClient,
    },
    stripe: stripeSummary,
  });
}
