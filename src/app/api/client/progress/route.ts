// Live data for the newdesign Client "Progress" page.
// Read-only over daily_health_snapshot (body / recovery signals) and
// workout_set_logs (strength PRs). RLS scopes every row to the signed-in
// user. A brand-new account comes back empty — the correct "real" state.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: snapRows } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, weight_lb, body_fat_pct, resting_hr, sleep_hours')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })
    .limit(400);

  const snaps = snapRows ?? [];

  const weightSeries = snaps
    .filter((s) => s.weight_lb != null)
    .map((s) => ({ date: s.snapshot_date, value: Number(s.weight_lb) }));

  const bodyFats = snaps.filter((s) => s.body_fat_pct != null).map((s) => Number(s.body_fat_pct));
  const restingHrs = snaps.filter((s) => s.resting_hr != null).map((s) => Number(s.resting_hr));
  const sleeps = snaps.filter((s) => s.sleep_hours != null).map((s) => Number(s.sleep_hours));

  const restingRecent = avg(restingHrs.slice(-7));
  const restingPrior = avg(restingHrs.slice(-14, -7));
  const sleepAvg = avg(sleeps.slice(-30));

  const kpis = {
    weightChange:
      weightSeries.length >= 2
        ? weightSeries[weightSeries.length - 1].value - weightSeries[0].value
        : null,
    weightLatest: weightSeries.length ? weightSeries[weightSeries.length - 1].value : null,
    bodyFatLatest: bodyFats.length ? bodyFats[bodyFats.length - 1] : null,
    bodyFatFirst: bodyFats.length ? bodyFats[0] : null,
    restingHr: restingRecent != null ? Math.round(restingRecent) : null,
    restingHrDelta:
      restingRecent != null && restingPrior != null
        ? Math.round(restingRecent - restingPrior)
        : null,
    sleepAvg: sleepAvg != null ? Math.round(sleepAvg * 10) / 10 : null,
  };

  // ---- Strength PRs from logged sets --------------------------------------
  const { data: setRows } = await supabase
    .from('workout_set_logs')
    .select('move_name, actual_load, actual_reps, load_unit, created_at, completed')
    .eq('client_id', user.id)
    .order('created_at', { ascending: true })
    .limit(3000);

  type PR = {
    move: string;
    best: number;
    bestReps: number | null;
    unit: string;
    bestAt: string;
  };
  const prMap = new Map<string, PR>();
  for (const r of setRows ?? []) {
    if (r.completed === false) continue;
    const load = Number(r.actual_load);
    if (!Number.isFinite(load) || load <= 0) continue;
    const key = String(r.move_name || '').trim();
    if (!key) continue;
    const pr = prMap.get(key);
    if (!pr) {
      prMap.set(key, {
        move: key,
        best: load,
        bestReps: r.actual_reps ?? null,
        unit: r.load_unit || 'lb',
        bestAt: r.created_at,
      });
    } else if (load > pr.best) {
      pr.best = load;
      pr.bestReps = r.actual_reps ?? null;
      pr.bestAt = r.created_at;
    }
  }

  const prs = [...prMap.values()]
    .sort((a, b) => b.best - a.best)
    .slice(0, 6);

  return NextResponse.json({ ok: true, weightSeries, kpis, prs });
}
