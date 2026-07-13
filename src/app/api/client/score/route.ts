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
import { deriveScore } from '@/lib/score-derive';
import { requireMembership } from '@/lib/require-membership';

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

type SnapRow = {
  snapshot_date: string;
  calories: number | null;
  sleep_hours: number | null;
  workout_minutes: number | null;
};

// The four composite pillars (0–100) — derived from the user's OWN
// daily_health_snapshot over the trailing window. Each returns null (rendered as
// an honest '—', never a fake 0) when its underlying data is too sparse to score.
//   Recovery    = 7-day average sleep, normalized (8h+ = 100).
//   Nutrition   = meal-logging adherence over 14 days (days with calories).
//   Train       = training days over 14 days (target ~8 sessions / 2 weeks).
//   Consistency = any-activity days over 14 days (showing up at all).
function computeComposite(rows: SnapRow[], now: Date) {
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const cut = (days: number) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - days); return isoDay(d); };
  const d7 = cut(7), d14 = cut(14);
  const last14 = rows.filter(r => r.snapshot_date >= d14);
  const last7 = rows.filter(r => r.snapshot_date >= d7);
  const basis14 = last14.length;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const num = (v: number | null) => (typeof v === 'number' && v > 0 ? v : 0);

  const sleeps = last7.map(r => num(r.sleep_hours)).filter(v => v > 0);
  const recovery = sleeps.length < 2 ? null : clamp((sleeps.reduce((a, b) => a + b, 0) / sleeps.length / 8) * 100);

  const logged = last14.filter(r => num(r.calories) > 0).length;
  const nutrition = logged < 3 ? null : clamp((logged / 14) * 100);

  const trained = last14.filter(r => num(r.workout_minutes) > 0).length;
  const train = basis14 < 3 ? null : clamp((trained / 8) * 100);

  const active = last14.filter(r => num(r.calories) > 0 || num(r.workout_minutes) > 0 || num(r.sleep_hours) > 0).length;
  const consistency = basis14 < 3 ? null : clamp((active / 14) * 100);

  return { train, nutrition, recovery, consistency };
}

const CATEGORY_LABELS: Record<string, string> = {
  workouts: 'Workouts logged',
  nutrition: 'Meals logged',
  adherence: 'Plan adherence',
  habits: 'Habits',
  prs: 'PRs hit',
  career: 'Career milestones',
  community: 'Community',
  endorsements: 'Coach endorsements',
  radio: 'Radio participation',
  referrals: 'Referrals',
  other: 'Other',
};

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
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
    .select('category, delta, earned_at, source_kind')
    .eq('user_id', user.id);

  if (allErr) return dbError(allErr, 'score ledger read', 500);

  const { data: recent, error: recentErr } = await supabase
    .from('score_ledger')
    .select('category, delta, note, earned_at, source_kind')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: false })
    .limit(20);

  if (recentErr) return dbError(recentErr, 'recent score read', 500);

  // Composite pillars from the trailing 30 days of the user's own snapshots.
  const since30 = new Date(now);
  since30.setUTCDate(since30.getUTCDate() - 30);
  const { data: snaps } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, calories, sleep_hours, workout_minutes')
    .eq('user_id', user.id)
    .gte('snapshot_date', since30.toISOString().slice(0, 10));
  const composite = computeComposite((snaps || []) as SnapRow[], now);

  const rows = (allRows || []) as Array<{ category: string; delta: number; earned_at: string; source_kind: string | null }>;
  // Two-number split + high-water rank (shared pure helper).
  const derived = deriveScore(rows);
  const points_total = derived.shapeScore; // the RANK number (excludes redemptions)

  const totals = new Map<string, number>();
  let points_month = 0;
  let week_gain = 0;
  const monthIso = monthStart.toISOString();
  for (const r of rows) {
    // Breakdown is rank-basis ("how I reached this tier") — exclude redemptions.
    if (r.source_kind !== 'store_redeem') totals.set(r.category, (totals.get(r.category) || 0) + r.delta);
    if (r.earned_at >= monthIso) points_month += r.delta;
    if (new Date(r.earned_at) >= weekStart) week_gain += r.delta;
  }

  // Lifetime breakdown — matches the tier basis ("how I reached this tier").
  const breakdown = Object.keys(CATEGORY_LABELS).map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    points: totals.get(cat) || 0,
  })).filter(r => r.points !== 0);

  // The DISPLAYED tier is high-water-marked: it tracks the highest the rank has
  // EVER reached, so penalties dent the number + push the next tier away but never
  // demote the rank. at_risk = the current rank has slipped below that tier's line.
  let currentIdx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (derived.highWaterScore >= TIERS[i][1]) { currentIdx = i; break; }
  }
  const current_tier = TIERS[currentIdx];
  const next_tier = TIERS[currentIdx + 1] || null;
  const points_to_next = next_tier ? next_tier[1] - derived.highWaterScore : 0;
  const at_risk = derived.shapeScore < current_tier[1];

  // Momentum meter (0–100) — the caller's own "don't break the streak" value from
  // compute_momentum (auth.uid()-scoped). null only when the RPC is absent
  // (pre-migration). streakWeeks = consecutive ISO weeks (incl. this one when banked)
  // that earned the bonus; points = the escalated amount banked this week.
  let momentum: { value: number; bonusThisWeek: boolean; streakWeeks: number; points: number } | null = null;
  {
    const { data: mv, error: mErr } = await supabase.rpc('compute_momentum');
    if (!mErr && mv !== null && mv !== undefined) {
      // Monday 00:00 UTC of a date's ISO week (ISO weeks start Monday).
      const DAY = 86400000;
      const weekMonday = (d: Date) => {
        const m = new Date(d);
        m.setUTCHours(0, 0, 0, 0);
        m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
        return m.getTime();
      };
      const bonusMondays = new Set(
        rows.filter((r) => r.source_kind === 'momentum_bonus').map((r) => weekMonday(new Date(r.earned_at))),
      );
      const thisMonday = weekMonday(now);
      const bonusThisWeek = bonusMondays.has(thisMonday);
      // Count consecutive bonus weeks walking back from this week.
      let streakWeeks = 0;
      for (let k = 0; ; k++) {
        if (bonusMondays.has(thisMonday - k * 7 * DAY)) streakWeeks += 1;
        else break;
      }
      // Mirror of momentum.mjs momentumBonus(streakWeeks - 1) — the escalated amount.
      const points = bonusThisWeek ? Math.min(100, 25 + 15 * Math.max(0, streakWeeks - 1)) : 0;
      momentum = { value: Number(mv) || 0, bonusThisWeek, streakWeeks, points };
    }
  }

  return NextResponse.json({
    // points_total drives the headline + tier; points_month kept for back-compat.
    points_total,
    points_month,
    week_gain,
    // What you can REDEEM with (earns − penalties − redemptions); the rank
    // (points_total) excludes redemptions so spending never demotes.
    spendable_balance: derived.spendableBalance,
    // True when the rank has slipped below the line of the (high-water) tier.
    at_risk,
    breakdown_total: breakdown,
    breakdown_month: breakdown, // back-compat alias; both now reflect lifetime
    recent: (recent || []) as LedgerRow[],
    tiers: TIERS.map(([name, threshold, display, benefit]) => ({ name, threshold, display, benefit })),
    current_tier: { name: current_tier[0], threshold: current_tier[1] },
    next_tier: next_tier ? { name: next_tier[0], threshold: next_tier[1] } : null,
    points_to_next,
    // Train/Nutrition/Recovery/Consistency 0–100, or null (honest '—') when sparse.
    composite,
    // { value 0–100, bonusThisWeek } — null until the momentum migration is applied.
    momentum,
  });
}
