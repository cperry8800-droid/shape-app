// Server-side analytics aggregations on top of daily_health_snapshot.
//
// Two consumers:
//   1. ClientProgressAnalytics: needs the current user's last 8 weeks of
//      data, bucketed weekly, for line charts.
//   2. CoachCompliancePanel: needs per-client overlays (sleep avg, recovery
//      avg, workouts last 7d, etc.) for an arbitrary list of subscribers.
//
// Both run as server components and rely on RLS — clients see their own
// rows; trainers/nutritionists see active subscribers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export type SnapshotRow = {
  user_id: string;
  snapshot_date: string;
  sleep_hours: number | null;
  sleep_performance_pct: number | null;
  recovery_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  strain: number | null;
  workout_minutes: number | null;
  workout_volume_lb: number | null;
  avg_heart_rate: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  hydration_l: number | null;
  weight_lb: number | null;
  body_fat_pct: number | null;
  mood: number | null;
  stress: number | null;
  soreness: number | null;
};

const SNAPSHOT_FIELDS =
  'user_id,snapshot_date,sleep_hours,sleep_performance_pct,recovery_score,hrv_ms,resting_hr,strain,workout_minutes,workout_volume_lb,avg_heart_rate,calories,protein_g,carbs_g,fat_g,hydration_l,weight_lb,body_fat_pct,mood,stress,soreness';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function fetchRows(
  supabase: SupabaseClient,
  userIds: string[],
  windowDays: number
): Promise<SnapshotRow[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase
    .from('daily_health_snapshot')
    .select(SNAPSHOT_FIELDS)
    .in('user_id', userIds)
    .gte('snapshot_date', isoDaysAgo(windowDays))
    .order('snapshot_date', { ascending: true })
    .returns<SnapshotRow[]>();
  return data ?? [];
}

export async function getMySnapshots(windowDays: number): Promise<SnapshotRow[]> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return [];
  return fetchRows(supabase, [authData.user.id], windowDays);
}

export async function getSnapshotsForUsers(
  userIds: string[],
  windowDays: number
): Promise<Map<string, SnapshotRow[]>> {
  const supabase = await createClient();
  const rows = await fetchRows(supabase, userIds, windowDays);
  const byUser = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const existing = byUser.get(row.user_id) ?? [];
    existing.push(row);
    byUser.set(row.user_id, existing);
  }
  return byUser;
}

// === Weekly bucketing for ClientProgressAnalytics ===========================

export type WeeklySeries = {
  label: string;
  values: Array<number | null>;
};

const PROGRESS_FIELDS = [
  'weight_lb',
  'body_fat_pct',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'sleep_performance_pct',
  'sleep_hours',
] as const;

type ProgressField = (typeof PROGRESS_FIELDS)[number];

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Bucket the last `weeks` weeks ending today. Returns one value per week
// per field — the within-week average, or null if no data that week.
export function buildWeeklySeries(
  rows: SnapshotRow[],
  weeks = 8
): Record<ProgressField, Array<number | null>> {
  const buckets = {} as Record<ProgressField, number[][]>;
  for (const field of PROGRESS_FIELDS) {
    buckets[field] = Array.from({ length: weeks }, () => [] as number[]);
  }

  const now = Date.now();
  for (const row of rows) {
    const ageDays = Math.floor((now - new Date(row.snapshot_date).getTime()) / 86_400_000);
    const weekIndex = weeks - 1 - Math.floor(ageDays / 7);
    if (weekIndex < 0 || weekIndex >= weeks) continue;
    for (const field of PROGRESS_FIELDS) {
      const value = row[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        buckets[field][weekIndex].push(value);
      }
    }
  }

  const result = {} as Record<ProgressField, Array<number | null>>;
  for (const field of PROGRESS_FIELDS) {
    result[field] = buckets[field].map(average);
  }
  return result;
}

export function countNonNull<T>(values: Array<T | null>): number {
  return values.filter((v) => v !== null).length;
}

// === Per-client overlays for CoachCompliancePanel ===========================

export type ClientOverlay = {
  hasData: boolean;
  daysOfData: number;
  sleep: number | null; // average sleep_performance_pct, 0-100
  recovery: number | null; // average recovery_score, 0-100
  stress: number | null; // average stress (1-10) mapped to 0-100
  workoutAdherence: number | null; // % of last 28 days with a workout
  workoutsCompletedWeek: number | null; // count last 7 days
  missedWorkouts7d: number | null; // 7 - workoutsCompletedWeek (target = 7 days)
  sessionVolume: number | null; // count last 7 days
  previousVolume: number | null; // count days 8-14
  sessionLoad: number | null; // sum strain last 7 days x 100, or workout_minutes if no strain
  previousLoad: number | null;
  lastCheckInDays: number | null; // days since most recent snapshot
};

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function rangeBy(rows: SnapshotRow[], from: number, to: number): SnapshotRow[] {
  const now = Date.now();
  return rows.filter((row) => {
    const ageDays = Math.floor((now - new Date(row.snapshot_date).getTime()) / 86_400_000);
    return ageDays >= from && ageDays < to;
  });
}

export function buildClientOverlay(rows: SnapshotRow[]): ClientOverlay {
  if (rows.length === 0) {
    return {
      hasData: false,
      daysOfData: 0,
      sleep: null,
      recovery: null,
      stress: null,
      workoutAdherence: null,
      workoutsCompletedWeek: null,
      missedWorkouts7d: null,
      sessionVolume: null,
      previousVolume: null,
      sessionLoad: null,
      previousLoad: null,
      lastCheckInDays: null,
    };
  }

  const last28 = rangeBy(rows, 0, 28);
  const last7 = rangeBy(rows, 0, 7);
  const prev7 = rangeBy(rows, 7, 14);

  const sleepAvg = avg(last28.map((r) => r.sleep_performance_pct));
  const recoveryAvg = avg(last28.map((r) => r.recovery_score));
  const stressAvgRaw = avg(last28.map((r) => r.stress));
  const stress = stressAvgRaw === null ? null : Math.round(stressAvgRaw * 10);

  const workoutDays28 = last28.filter((r) => (r.workout_minutes ?? 0) > 0).length;
  const adherence = last28.length > 0 ? Math.round((workoutDays28 / last28.length) * 100) : null;

  const workoutsLast7 = last7.filter((r) => (r.workout_minutes ?? 0) > 0).length;
  const workoutsPrev7 = prev7.filter((r) => (r.workout_minutes ?? 0) > 0).length;

  const loadLast7 = last7.reduce((sum, r) => sum + (r.strain ?? 0) * 100 + (r.workout_minutes ?? 0), 0);
  const loadPrev7 = prev7.reduce((sum, r) => sum + (r.strain ?? 0) * 100 + (r.workout_minutes ?? 0), 0);

  const latestDate = rows[rows.length - 1].snapshot_date;
  const lastCheckInDays = Math.floor((Date.now() - new Date(latestDate).getTime()) / 86_400_000);

  return {
    hasData: true,
    daysOfData: rows.length,
    sleep: sleepAvg === null ? null : Math.round(sleepAvg),
    recovery: recoveryAvg === null ? null : Math.round(recoveryAvg),
    stress,
    workoutAdherence: adherence,
    workoutsCompletedWeek: workoutsLast7,
    missedWorkouts7d: Math.max(0, 7 - workoutsLast7),
    sessionVolume: workoutsLast7,
    previousVolume: workoutsPrev7,
    sessionLoad: Math.round(loadLast7),
    previousLoad: Math.round(loadPrev7),
    lastCheckInDays,
  };
}

export async function getClientOverlays(
  userIds: string[],
  windowDays = 28
): Promise<Record<string, ClientOverlay>> {
  const byUser = await getSnapshotsForUsers(userIds, windowDays);
  const result: Record<string, ClientOverlay> = {};
  for (const userId of userIds) {
    result[userId] = buildClientOverlay(byUser.get(userId) ?? []);
  }
  return result;
}
