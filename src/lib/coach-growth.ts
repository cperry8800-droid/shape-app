// Real 90-day growth + marketplace-funnel rollups for the coach dashboards
// (dashboard-v2 step 8). Derived ONLY from data we actually have:
//   - growth: subscriber ADDS per ISO week (subscriptions.created_at) + the
//     MRR those adds brought, and month-over-month adds growth. This is NOT
//     payout history (Stripe payouts aren't wired yet) — the UI labels it as
//     adds, and payout-flavored numbers stay "—" until payouts go live.
//   - funnel: consults (sessions) and signings (subscriber adds) over 90d.
//     Profile views aren't tracked anywhere yet → always null (the UI shows
//     an honest "connects soon" state, never an invented number).

import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachGrowth = {
  weeklyAdds: Array<{ weekOf: string; count: number; addedCents: number }>;
  momPct: number | null; // adds this calendar month vs last; null when last = 0
};
export type CoachFunnel = { views: null; consults90: number; signed90: number };

function mondayISO(d: Date): string {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export async function coachGrowthAndFunnel(
  supabase: SupabaseClient,
  role: 'trainer' | 'nutritionist',
  providerId: number,
  consults90: number
): Promise<{ growth: CoachGrowth; funnel: CoachFunnel }> {
  const since = new Date(Date.now() - 90 * 86400000);
  const { data: addRows } = await supabase
    .from('subscriptions')
    .select('price_cents, created_at')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  // 13 weekly buckets, zero-filled so the sparkline never has holes.
  const buckets = new Map<string, { count: number; addedCents: number }>();
  for (let i = 12; i >= 0; i--) {
    buckets.set(mondayISO(new Date(Date.now() - i * 7 * 86400000)), { count: 0, addedCents: 0 });
  }
  const now = new Date();
  const monthKey = (d: Date) => d.getUTCFullYear() + '-' + d.getUTCMonth();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  let addsThisMonth = 0;
  let addsLastMonth = 0;
  for (const r of addRows ?? []) {
    const d = new Date(r.created_at as string);
    const b = buckets.get(mondayISO(d));
    if (b) { b.count += 1; b.addedCents += (r.price_cents as number | null) ?? 0; }
    const mk = monthKey(d);
    if (mk === thisMonth) addsThisMonth += 1;
    else if (mk === lastMonth) addsLastMonth += 1;
  }
  const weeklyAdds = [...buckets.entries()].map(([weekOf, b]) => ({ weekOf, ...b }));
  const momPct = addsLastMonth > 0
    ? Math.round(((addsThisMonth - addsLastMonth) / addsLastMonth) * 100)
    : null;

  return {
    growth: { weeklyAdds, momPct },
    funnel: { views: null, consults90, signed90: (addRows ?? []).length },
  };
}
