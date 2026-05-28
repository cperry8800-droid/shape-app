// Shape Score for the signed-in client.
//
// GET: returns { points_month, breakdown_month, recent, tiers, current_tier,
//                next_tier, points_to_next, week_gain }
//
// Breakdown is aggregated by category for the current calendar month.
// `recent` returns the most recent 20 ledger entries (any time).

import { NextResponse } from 'next/server';
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

  const { data: monthRows, error: monthErr } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .gte('earned_at', monthStart.toISOString());

  if (monthErr) return NextResponse.json({ error: monthErr.message }, { status: 500 });

  const { data: recent, error: recentErr } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
    .limit(20);

  if (recentErr) return NextResponse.json({ error: recentErr.message }, { status: 500 });

  const rows = (monthRows || []) as LedgerRow[];
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) || 0) + r.delta);

  const points_month = rows.reduce((a, r) => a + r.delta, 0);
  const week_gain = rows
    .filter(r => new Date(r.earned_at) >= weekStart)
    .reduce((a, r) => a + r.delta, 0);

  const breakdown = Object.keys(CATEGORY_LABELS).map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    points: totals.get(cat) || 0,
  })).filter(r => r.points !== 0);

  let currentIdx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points_month >= TIERS[i][1]) { currentIdx = i; break; }
  }
  const current_tier = TIERS[currentIdx];
  const next_tier = TIERS[currentIdx + 1] || null;
  const points_to_next = next_tier ? next_tier[1] - points_month : 0;

  return NextResponse.json({
    points_month,
    week_gain,
    breakdown_month: breakdown,
    recent: (recent || []) as LedgerRow[],
    tiers: TIERS.map(([name, threshold, display, benefit]) => ({ name, threshold, display, benefit })),
    current_tier: { name: current_tier[0], threshold: current_tier[1] },
    next_tier: next_tier ? { name: next_tier[0], threshold: next_tier[1] } : null,
    points_to_next,
  });
}
