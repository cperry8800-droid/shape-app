// Live data for the newdesign Client "Progress" page.
// Read-only over daily_health_snapshot (body / recovery signals) and
// workout_set_logs (strength PRs). RLS scopes every row to the signed-in
// user. A brand-new account comes back empty — the correct "real" state.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { epleyE1rm } from '@/lib/e1rm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cookie session OR Bearer token (native app sends Bearer; /m/ uses the cookie).
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Parse a load/reps value that may be a number or free text ("230", "230 lb", "8").
function pnum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return parseFloat(String(v));
}

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // select('*') (not an explicit column list) so the route keeps working before a
  // new snapshot column's migration is applied — PostgREST 400s the WHOLE query on
  // an unknown explicit column, and `snapRows ?? []` would then silently empty every
  // series/KPI. (Same migration-safety reason as the weigh-ins query below.)
  const { data: snapRows } = await supabase
    .from('daily_health_snapshot')
    .select('*')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })
    .limit(400);

  const snaps = snapRows ?? [];

  // Per-metric trend series. Each row keeps both the date and the value so
  // the client can render time-aware sparklines without needing alignment.
  const seriesFor = (key: 'weight_lb' | 'body_fat_pct' | 'resting_hr' | 'sleep_hours' | 'hrv_ms' | 'workout_minutes' | 'protein_g' | 'hydration_l' | 'steps' | 'energy' | 'hunger') =>
    snaps
      .filter((s) => (s as Record<string, unknown>)[key] != null)
      .map((s) => ({ date: (s as Record<string, string>).snapshot_date, value: Number((s as Record<string, unknown>)[key]) }));

  // Weight + body fat come from the dedicated weigh-in table (what the Goals
  // page's "Log weigh-in" writes) — the snapshot columns have no writer, so
  // without this the Progress page never saw a real weigh-in. Values are
  // normalized to lb to match the page's labels; snapshot rows remain the
  // fallback for any account that only has device-synced data.
  // select('*') so the route keeps working before the body_fat_pct column
  // migration is applied (PostgREST errors on unknown explicit columns).
  const { data: weighRows } = await supabase
    .from('client_weigh_ins')
    .select('*')
    .eq('user_id', user.id)
    .order('logged_on', { ascending: true })
    .limit(400);
  const weighIns = (weighRows ?? []) as Array<Record<string, unknown>>;
  const toLb = (w: number, unit: unknown) =>
    Math.round((unit === 'lb' ? w : w * 2.20462) * 10) / 10;
  const weighInWeightSeries = weighIns
    .filter((r) => Number.isFinite(Number(r.weight)))
    .map((r) => ({ date: String(r.logged_on), value: toLb(Number(r.weight), r.unit) }));
  const weighInBodyFatSeries = weighIns
    .filter((r) => r.body_fat_pct != null && Number.isFinite(Number(r.body_fat_pct)))
    .map((r) => ({ date: String(r.logged_on), value: Number(r.body_fat_pct) }));

  const weightSeries = weighInWeightSeries.length ? weighInWeightSeries : seriesFor('weight_lb');
  const bodyFatSeries = weighInBodyFatSeries.length ? weighInBodyFatSeries : seriesFor('body_fat_pct');
  const restingHrSeries = seriesFor('resting_hr');
  const sleepSeries = seriesFor('sleep_hours');
  const hrvSeries = seriesFor('hrv_ms');
  const volumeSeries = seriesFor('workout_minutes');
  const proteinSeries = seriesFor('protein_g');
  const hydrationSeries = seriesFor('hydration_l');
  const stepsSeries = seriesFor('steps');
  const energySeries = seriesFor('energy');
  const hungerSeries = seriesFor('hunger');

  const bodyFats = bodyFatSeries.map((s) => s.value);
  const restingHrs = restingHrSeries.map((s) => s.value);
  const sleeps = sleepSeries.map((s) => s.value);

  const restingRecent = avg(restingHrs.slice(-7));
  const restingPrior = avg(restingHrs.slice(-14, -7));
  const sleepAvg = avg(sleeps.slice(-30));

  const stepsLast30 = stepsSeries.slice(-30);
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
    stepsLatest: stepsSeries.length ? Math.round(stepsSeries[stepsSeries.length - 1].value) : null,
    stepsAvg: stepsLast30.length
      ? Math.round(stepsLast30.reduce((s, p) => s + p.value, 0) / stepsLast30.length)
      : null,
  };

  // ---- Strength PRs from logged sets --------------------------------------
  // The in-app live-session writer stores actuals in `payload` (actualLoad /
  // actualReps), not the actual_load/actual_reps columns — read both.
  // Newest-first cap: order DESCENDING then limit, so a high-volume client keeps
  // their LATEST sets — a plain ascending + limit keeps the OLDEST 3000 and drops
  // recent PRs. The PR + weekly-trajectory math below is order-independent (it takes
  // maxes per move / per week), so no re-sort is needed. Mirrors /api/client/strength.
  const { data: setRows } = await supabase
    .from('workout_set_logs')
    .select('move_name, actual_load, actual_reps, load_unit, payload, created_at, completed')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3000);

  type PR = {
    move: string;
    best: number;
    bestReps: number | null;
    unit: string;
    bestAt: string;
    e1rm: number | null;
  };
  const prMap = new Map<string, PR>();
  for (const r of setRows ?? []) {
    if (r.completed === false) continue;
    const p = (r.payload ?? {}) as Record<string, unknown>;
    // A null OR zero column means "not set" → fall back to the payload.
    const colLoad = Number(r.actual_load);
    const load = colLoad > 0 ? colLoad : pnum(p.actualLoad ?? p.load ?? p.actual_load);
    if (!Number.isFinite(load) || load <= 0) continue;
    const colReps = Number(r.actual_reps);
    const repsN = colReps > 0 ? colReps : pnum(p.actualReps ?? p.reps ?? p.actual_reps);
    const reps = Number.isFinite(repsN) ? Math.round(repsN) : null;
    const key = String(r.move_name || '').trim();
    if (!key) continue;
    const pr = prMap.get(key);
    if (!pr) {
      prMap.set(key, {
        move: key,
        best: load,
        bestReps: reps,
        unit: r.load_unit || 'lb',
        bestAt: r.created_at,
        e1rm: null,
      });
    } else if (load > pr.best) {
      pr.best = load;
      pr.bestReps = reps;
      pr.bestAt = r.created_at;
    }
  }

  let prs = [...prMap.values()]
    .sort((a, b) => b.best - a.best)
    .slice(0, 6)
    .map((p) => {
      const e = epleyE1rm(p.best, p.bestReps);
      return { ...p, e1rm: e == null ? null : Math.round(e * 10) / 10 };
    });

  // Prefer all-time PRs from the aggregate RPC — it scans EVERY logged set, so a
  // high-volume athlete's old all-time best is never dropped by the newest-3000
  // window above (which still feeds the recent strength trajectory below). Falls
  // back to the windowed row-scan until the migration is applied.
  try {
    const { data: prRows, error: prErr } = await supabase.rpc('get_my_lift_prs', { p_limit: 12 });
    if (!prErr && Array.isArray(prRows) && prRows.length) {
      prs = (prRows as Array<Record<string, unknown>>).slice(0, 6).map((r) => {
        const best = Number(r.best);
        const repsN = r.best_reps == null ? null : Number(r.best_reps);
        const reps = repsN != null && Number.isFinite(repsN) ? repsN : null;
        const e = epleyE1rm(best, reps);
        return {
          move: String(r.move ?? ''),
          best,
          bestReps: reps,
          unit: String(r.unit ?? 'lb'),
          bestAt: String(r.best_at ?? ''),
          e1rm: e == null ? null : Math.round(e * 10) / 10,
        };
      });
    }
  } catch {
    // keep the windowed row-scan PRs (RPC not yet applied, or a transient error)
  }

  // Strength trajectory: top one-rep-equivalent across all logged sets,
  // bucketed weekly so the chart shows the trend instead of every spike.
  const weeklyTop = new Map<string, number>();
  for (const r of setRows ?? []) {
    if (r.completed === false) continue;
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const colLoad = Number(r.actual_load);
    const load = colLoad > 0 ? colLoad : pnum(p.actualLoad ?? p.load ?? p.actual_load);
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
      steps: stepsSeries,
      energy: energySeries,
      hunger: hungerSeries,
      strength: strengthSeries,
    },
  });
}
