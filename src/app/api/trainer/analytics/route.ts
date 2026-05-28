// Live data for the newdesign Trainer "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// trainer's connected account. RLS scopes the Supabase queries to the
// signed-in trainer. The compliance / at-risk / correlation surfaces are
// intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeSummary = {
  connected: boolean;
  status: string;
  balanceCents: number | null;
  payouts: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    arrivalDate: number | null;
    created: number;
  }>;
};

async function loadStripe(
  accountId: string | null,
  accountStatus: string | null
): Promise<StripeSummary> {
  if (!accountId) {
    return { connected: false, status: accountStatus ?? 'not_connected', balanceCents: null, payouts: [] };
  }
  try {
    const [balance, payoutList] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),
    ]);
    const balanceCents = (balance.available ?? []).reduce((sum, b) => sum + b.amount, 0);
    const payouts = payoutList.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: p.arrival_date ? p.arrival_date * 1000 : null,
      created: p.created * 1000,
    }));
    return { connected: true, status: accountStatus ?? 'connected', balanceCents, payouts };
  } catch {
    return { connected: true, status: accountStatus ?? 'error', balanceCents: null, payouts: [] };
  }
}

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
    .select('client_id, price_cents, status')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);
  const subs = subRows ?? [];
  const grossCents = subs.reduce(
    (sum: number, r: { price_cents: number | null }) => sum + (r.price_cents ?? 0),
    0
  );
  const clientIds = subs.map((r: { client_id: string }) => r.client_id).filter(Boolean);

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('scheduled_at, status')
    .eq('provider_role', 'trainer')
    .eq('provider_id', providerId)
    .limit(1000);
  const sessions = sessRows ?? [];

  const now = Date.now();
  let completedSessions = 0;
  let upcomingSessions = 0;
  for (const s of sessions) {
    if (s.status === 'completed') {
      completedSessions += 1;
    } else if (
      (s.status === 'requested' || s.status === 'confirmed') &&
      new Date(s.scheduled_at).getTime() >= now
    ) {
      upcomingSessions += 1;
    }
  }

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
    const [workoutRes, snapRes, prRes, namesRes] = await Promise.all([
      supabase
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
      supabase
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

    const nameById = new Map<string, string>();
    for (const r of namesRes.data || []) nameById.set(String(r.id), String(r.full_name || ''));

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
      r.name = nameById.get(r.client_id) || 'Client';
    }
  }

  const avgAdherencePct = adherenceDen ? Math.round((adherenceNum / adherenceDen) * 100) : 0;

  const stripeSummary = await loadStripe(
    trainerRow.stripe_account_id ?? null,
    trainerRow.stripe_account_status ?? null
  );

  return NextResponse.json({
    isTrainer: true,
    metrics: {
      mrrGrossCents: grossCents,
      mrrNetCents: Math.round(grossCents * 0.85),
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
    stripe: stripeSummary,
  });
}
