// Client analytics summary.
//
// Pulls a rolling 14 days of daily_health_snapshot rows, workout sessions,
// and score_ledger entries and turns them into the KPIs + sparkline trend
// signals the ClientAnalytics page already expects:
//   kpis: workout adherence %, macro (protein) adherence %, avg sleep,
//         weekly points
//   pulse: 7-day sparkline for workout consistency, nutrition compliance,
//          sleep + recovery

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cookie session OR Bearer token (the native app sends a Bearer; /m/ uses the
// bridged cookie). Without this the native shell 401s and the home cards stay
// empty.
type Snap = {
  snapshot_date: string;
  sleep_hours: number | null;
  protein_g: number | null;
  calories: number | null;
  recovery_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  weight_lb: number | null;
  mood: number | null;
  workout_minutes: number | null;
};

function isoDateUTC(d: Date) { return d.toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const since14 = isoDateUTC(daysAgo(13));
  const weekStart = daysAgo(6);

  const [snapsRes, sessionsRes, ledgerRes, nutriGoalRes, trainGoalRes] = await Promise.all([
    supabase
      .from('daily_health_snapshot')
      .select('snapshot_date, sleep_hours, protein_g, calories, recovery_score, hrv_ms, resting_hr, weight_lb, mood, workout_minutes')
      .eq('user_id', user.id)
      .gte('snapshot_date', since14)
      .order('snapshot_date', { ascending: true }),
    supabase
      .from('workout_sessions')
      .select('started_at, status')
      .eq('client_id', user.id)
      .eq('status', 'completed')
      .gte('started_at', daysAgo(13).toISOString()),
    supabase
      .from('score_ledger')
      .select('delta, earned_at')
      .eq('user_id', user.id)
      .gte('earned_at', weekStart.toISOString()),
    supabase.from('user_goals').select('data').eq('user_id', user.id).eq('kind', 'client_nutrition_prefs').maybeSingle(),
    supabase.from('user_goals').select('data').eq('user_id', user.id).eq('kind', 'client_training_prefs').maybeSingle(),
  ]);

  const snaps = (snapsRes.data || []) as Snap[];
  const sessions = sessionsRes.data || [];
  const ledger = ledgerRes.data || [];

  // Recent activities (typed: run/ride/tennis/… with distance + minutes) for
  // the Training card's "today" rollup. Best-effort; empty if table absent.
  type Act = { activity_type: string; started_at: string | null; duration_min: number | null; distance_km: number | null };
  let activities: Act[] = [];
  {
    const { data } = await supabase
      .from('activities')
      .select('activity_type, started_at, duration_min, distance_km')
      .eq('user_id', user.id)
      .gte('started_at', daysAgo(2).toISOString())
      .order('started_at', { ascending: false });
    activities = (data || []) as Act[];
  }

  // Goal-derived targets. Read the user's primary goal (nutrition + training)
  // and a body weight to scale protein; fall back to sensible defaults.
  const nutriGoal = ((nutriGoalRes.data as { data?: Record<string, unknown> } | null)?.data) || {};
  const trainGoal = ((trainGoalRes.data as { data?: Record<string, unknown> } | null)?.data) || {};
  const goalRaw = `${String(nutriGoal.primary_goal || '')} ${String(trainGoal.primary_goal || trainGoal.goal || '')}`.toLowerCase();
  const goalKind: 'cut' | 'build' | 'maintain' =
    /fat ?loss|cut|lean|weight ?loss|shred/.test(goalRaw) ? 'cut'
    : /hypertroph|build|bulk|mass|muscle|strength|gain/.test(goalRaw) ? 'build'
    : 'maintain';

  // Build a date-indexed map of the last 14 days.
  const byDate = new Map<string, Snap>();
  for (const s of snaps) byDate.set(s.snapshot_date, s);

  // 7-day sparklines: each cell = normalized value in [0..1].
  const last7Dates: string[] = [];
  for (let i = 6; i >= 0; i--) last7Dates.push(isoDateUTC(daysAgo(i)));

  // Workout days in the last 7 (binary).
  const workoutDays = new Set<string>();
  for (const s of sessions) {
    const dt = s.started_at ? new Date(String(s.started_at)) : null;
    if (dt) workoutDays.add(isoDateUTC(dt));
  }
  const workoutTrend = last7Dates.map(d => (workoutDays.has(d) ? 1 : 0.15));
  const workoutsThisWeek = last7Dates.reduce((a, d) => a + (workoutDays.has(d) ? 1 : 0), 0);
  const workoutAdherencePct = Math.min(100, Math.round((workoutsThisWeek / 5) * 100)); // 5 target/wk, capped at 100

  // Nutrition trend: protein hit (>=120g) as proxy for macro adherence.
  const nutritionTrend = last7Dates.map(d => {
    const s = byDate.get(d);
    if (!s || s.protein_g == null) return 0.15;
    return Math.max(0.2, Math.min(1, Number(s.protein_g) / 160));
  });
  const proteinHits = last7Dates.reduce((a, d) => {
    const s = byDate.get(d);
    return a + (s && s.protein_g != null && Number(s.protein_g) >= 120 ? 1 : 0);
  }, 0);
  const macroAdherencePct = Math.round((proteinHits / 7) * 100);

  // Sleep + recovery trend.
  const sleepTrend = last7Dates.map(d => {
    const s = byDate.get(d);
    if (!s || s.sleep_hours == null) return 0.15;
    return Math.max(0.2, Math.min(1, Number(s.sleep_hours) / 9));
  });
  const sleepSamples = last7Dates
    .map(d => byDate.get(d))
    .filter(s => s && s.sleep_hours != null) as Snap[];
  const avgSleepHours = sleepSamples.length
    ? sleepSamples.reduce((a, s) => a + Number(s.sleep_hours), 0) / sleepSamples.length
    : null;

  // Weekly points: ledger sum.
  const weeklyPoints = ledger.reduce((a, r) => a + (r.delta || 0), 0);

  const fmtSleep = (h: number | null) => {
    if (h == null) return '—';
    const whole = Math.floor(h);
    const min = Math.round((h - whole) * 60);
    return `${whole}h ${String(min).padStart(2, '0')}m`;
  };

  // Most recent snapshot per metric (for the home masthead ticker).
  const latestOf = (pick: (s: Snap) => number | null) => {
    for (let i = snaps.length - 1; i >= 0; i--) {
      const v = pick(snaps[i]);
      if (v != null) return v;
    }
    return null;
  };
  const todaySnap = snaps[snaps.length - 1] || null;
  const yest = snaps[snaps.length - 2] || null;
  // Goal-derived targets. Calorie target shifts with goal; protein target
  // scales with body weight (≈1g/lb, nudged by goal), falling back to 150g.
  const latestWeight = latestOf((s) => (s.weight_lb != null ? Number(s.weight_lb) : null));
  const calorieTarget = goalKind === 'cut' ? 1900 : goalKind === 'build' ? 2400 : 2100;
  const proteinTarget = latestWeight
    ? Math.round(latestWeight * (goalKind === 'cut' ? 1.1 : goalKind === 'build' ? 1.0 : 0.9))
    : 150;

  // Today's training, from the activities log (real miles / minutes / type).
  const todayIso = isoDateUTC(daysAgo(0));
  const todaysActivities = (activities || []).filter((a) => (a.started_at || '').slice(0, 10) === todayIso);
  const trainedToday = todaysActivities.length > 0 || (todaySnap?.workout_minutes != null && Number(todaySnap.workout_minutes) > 0);
  const todayDistanceKm = todaysActivities.reduce((sum, a) => sum + (a.distance_km != null ? Number(a.distance_km) : 0), 0);
  const todayActivityMin = todaysActivities.reduce((sum, a) => sum + (a.duration_min != null ? Number(a.duration_min) : 0), 0)
    || (todaySnap?.workout_minutes != null ? Number(todaySnap.workout_minutes) : 0);
  const topActivity = todaysActivities[0] || null;

  const tickerSnapshot = {
    cal: todaySnap?.calories != null ? Math.round(Number(todaySnap.calories)) : null,
    cal_target: calorieTarget,
    protein_g: todaySnap?.protein_g != null ? Math.round(Number(todaySnap.protein_g)) : null,
    protein_target: proteinTarget,
    goal_kind: goalKind,
    mood: todaySnap?.mood != null ? Number(todaySnap.mood) : null,
    trained_today: trainedToday,
    today_distance_km: todayDistanceKm > 0 ? Math.round(todayDistanceKm * 10) / 10 : null,
    today_activity_min: todayActivityMin > 0 ? Math.round(todayActivityMin) : null,
    today_activity_type: topActivity ? String(topActivity.activity_type || '') : null,
    sleep_hours: latestOf((s) => (s.sleep_hours != null ? Number(s.sleep_hours) : null)),
    recovery_score: latestOf((s) => (s.recovery_score != null ? Number(s.recovery_score) : null)),
    hrv_ms: latestOf((s) => (s.hrv_ms != null ? Number(s.hrv_ms) : null)),
    resting_hr: latestOf((s) => (s.resting_hr != null ? Number(s.resting_hr) : null)),
    weight_lb: latestOf((s) => (s.weight_lb != null ? Number(s.weight_lb) : null)),
    weight_delta_7d: (() => {
      const latest = latestOf((s) => (s.weight_lb != null ? Number(s.weight_lb) : null));
      const wk = snaps.slice(-7).find((s) => s.weight_lb != null);
      if (latest == null || !wk || wk.weight_lb == null) return null;
      return Math.round((latest - Number(wk.weight_lb)) * 10) / 10;
    })(),
    sleep_delta_min: yest?.sleep_hours != null && todaySnap?.sleep_hours != null
      ? Math.round((Number(todaySnap.sleep_hours) - Number(yest.sleep_hours)) * 60)
      : null,
  };

  return NextResponse.json({
    has_data: snaps.length > 0 || sessions.length > 0 || ledger.length > 0,
    kpis: {
      workout_adherence_pct: workoutAdherencePct,
      macro_adherence_pct: macroAdherencePct,
      avg_sleep_label: fmtSleep(avgSleepHours),
      weekly_points: weeklyPoints,
    },
    pulse: {
      workout: workoutTrend,
      nutrition: nutritionTrend,
      sleep: sleepTrend,
    },
    workouts_this_week: workoutsThisWeek,
    protein_hits_this_week: proteinHits,
    ticker: tickerSnapshot,
  });
}
