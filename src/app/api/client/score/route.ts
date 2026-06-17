// Shape Score for the signed-in client.
//
// GET: returns { points_month, breakdown_month, recent, tiers, current_tier,
//                next_tier, points_to_next, week_gain }
//
// Breakdown is aggregated by category for the current calendar month.
// `recent` returns the most recent 20 ledger entries (any time).

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type LedgerRow = {
  category: string;
  delta: number;
  note: string | null;
  earned_at: string;
  source_kind: string | null;
};

const TIERS: Array<[name: string, threshold: number, display: string, benefit: string]> = [
  ['Raw',    0,     '0+',      'Starting level'],
  ['Tempo',  750,   '750+',    '2× redemption value'],
  ['Form',   2000,  '2,000+',  'Early access drops + streak boosts'],
  ['Peak',   5000,  '5,000+',  'Priority booking + 1 free intro / mo'],
  ['Legend', 15000, '15,000+', 'Annual Shape merch + service credit'],
];

const CATEGORY_LABELS: Record<string, string> = {
  workouts: 'Workouts logged',
  adherence: 'Plan adherence',
  habits: 'Habits',
  prs: 'PRs hit',
  community: 'Community',
  endorsements: 'Coach endorsements',
  radio: 'Radio participation',
  referrals: 'Referrals',
  other: 'Other',
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  // Tier is based on LIFETIME points so a member's standing never resets on
  // the 1st of the month (a monthly basis silently demoted everyone). Month
  // and week sums stay as secondary "activity" stats. One fetch covers all
  // three windows plus the lifetime breakdown.
  const { data: allRows, error: allErr } = await supabase
    .from('score_ledger')
    .select('category, delta, earned_at')
    .eq('user_id', user.id);

  if (allErr) return dbError(allErr, 'score ledger read', 500);

  const { data: recent, error: recentErr } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
    .limit(20);

  if (recentErr) return dbError(recentErr, 'recent score read', 500);

  const rows = (allRows || []) as Array<{ category: string; delta: number; earned_at: string }>;
  const totals = new Map<string, number>();
  let points_total = 0;
  let points_month = 0;
  let week_gain = 0;
  const monthIso = monthStart.toISOString();
  for (const r of rows) {
    points_total += r.delta;
    totals.set(r.category, (totals.get(r.category) || 0) + r.delta);
    if (r.earned_at >= monthIso) points_month += r.delta;
    if (new Date(r.earned_at) >= weekStart) week_gain += r.delta;
  }

  // Lifetime breakdown — matches the tier basis ("how I reached this tier").
  const breakdown = Object.keys(CATEGORY_LABELS).map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    points: totals.get(cat) || 0,
  })).filter(r => r.points !== 0);

  let currentIdx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points_total >= TIERS[i][1]) { currentIdx = i; break; }
  }
  const current_tier = TIERS[currentIdx];
  const next_tier = TIERS[currentIdx + 1] || null;
  const points_to_next = next_tier ? next_tier[1] - points_total : 0;

  return NextResponse.json({
    // points_total drives the headline + tier; points_month kept for back-compat.
    points_total,
    points_month,
    week_gain,
    breakdown_total: breakdown,
    breakdown_month: breakdown, // back-compat alias; both now reflect lifetime
    recent: (recent || []) as LedgerRow[],
    tiers: TIERS.map(([name, threshold, display, benefit]) => ({ name, threshold, display, benefit })),
    current_tier: { name: current_tier[0], threshold: current_tier[1] },
    next_tier: next_tier ? { name: next_tier[0], threshold: next_tier[1] } : null,
    points_to_next,
  });
}
