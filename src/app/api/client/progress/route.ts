// Live data for the newdesign Client "Progress" page.
// Read-only over daily_health_snapshot (body / recovery signals) and
// workout_set_logs (strength PRs). RLS scopes every row to the signed-in
// user. A brand-new account comes back empty — the correct "real" state.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cookie session OR Bearer token (native app sends Bearer; /m/ uses the cookie).
async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}
async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearer[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: snapRows } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, weight_lb, body_fat_pct, resting_hr, sleep_hours, hrv_ms, workout_minutes, protein_g, hydration_l')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })
    .limit(400);

  const snaps = snapRows ?? [];

  // Per-metric trend series. Each row keeps both the date and the value so
  // the client can render time-aware sparklines without needing alignment.
  const seriesFor = (key: 'weight_lb' | 'body_fat_pct' | 'resting_hr' | 'sleep_hours' | 'hrv_ms' | 'workout_minutes' | 'protein_g' | 'hydration_l') =>
    snaps
      .filter((s) => (s as Record<string, unknown>)[key] != null)
      .map((s) => ({ date: (s as Record<string, string>).snapshot_date, value: Number((s as Record<string, unknown>)[key]) }));

  const weightSeries = seriesFor('weight_lb');
  const bodyFatSeries = seriesFor('body_fat_pct');
  const restingHrSeries = seriesFor('resting_hr');
  const sleepSeries = seriesFor('sleep_hours');
  const hrvSeries = seriesFor('hrv_ms');
  const volumeSeries = seriesFor('workout_minutes');
  const proteinSeries = seriesFor('protein_g');
  const hydrationSeries = seriesFor('hydration_l');

  const bodyFats = bodyFatSeries.map((s) => s.value);
  const restingHrs = restingHrSeries.map((s) => s.value);
  const sleeps = sleepSeries.map((s) => s.value);

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

  // Strength trajectory: top one-rep-equivalent across all logged sets,
  // bucketed weekly so the chart shows the trend instead of every spike.
  const weeklyTop = new Map<string, number>();
  for (const r of setRows ?? []) {
    if (r.completed === false) continue;
    const load = Number(r.actual_load);
    if (!Number.isFinite(load) || load <= 0) continue;
    const week = new Date(r.created_at);
    const day = week.getUTCDay();
    // Anchor each week to Monday for stability.
    week.setUTCDate(week.getUTCDate() - ((day + 6) % 7));
    week.setUTCHours(0, 0, 0, 0);
    const key = week.toISOString().slice(0, 10);
    const prev = weeklyTop.get(key) || 0;
    if (load > prev) weeklyTop.set(key, load);
  }
  const strengthSeries = [...weeklyTop.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  return NextResponse.json({
    ok: true,
    weightSeries,
    kpis,
    prs,
    series: {
      weight: weightSeries,
      bodyFat: bodyFatSeries,
      restingHr: restingHrSeries,
      sleep: sleepSeries,
      hrv: hrvSeries,
      volume: volumeSeries,
      protein: proteinSeries,
      hydration: hydrationSeries,
      strength: strengthSeries,
    },
  });
}
