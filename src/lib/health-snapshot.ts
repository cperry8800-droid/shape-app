// Cross-domain daily health snapshot.
//
// Whoop, Strava, workout_sessions, and manual nutrition all upsert into
// public.daily_health_snapshot keyed on (user_id, snapshot_date). Each source
// owns a defined column subset; the `sources` jsonb tracks provenance so a
// missing field is distinguishable from "no integration connected".

import type { SupabaseClient } from '@supabase/supabase-js';
import { METRICS } from '@/lib/integrations/reconcile.mjs';

// The provider-sourced metrics we track per-source for reconciliation (INT2).
const RECONCILABLE = new Set(Object.keys(METRICS as Record<string, unknown>));

export type SnapshotPatch = {
  sleep_hours?: number | null;
  sleep_performance_pct?: number | null;
  sleep_efficiency_pct?: number | null;
  recovery_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  strain?: number | null;
  workout_minutes?: number | null;
  workout_volume_lb?: number | null;
  steps?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  hydration_l?: number | null;
  weight_lb?: number | null;
  body_fat_pct?: number | null;
  mood?: number | null;
  energy?: number | null;
  hunger?: number | null;
  stress?: number | null;
  soreness?: number | null;
  sleep_quality?: number | null;
  // Sleep architecture detail (fast-follow) — device-sourced (currently Oura);
  // null for providers that don't expose them.
  sleep_deep_min?: number | null;
  sleep_rem_min?: number | null;
  sleep_light_min?: number | null;
  sleep_awake_min?: number | null;
  sleep_latency_min?: number | null;
  respiratory_rate?: number | null;
  sleep_start?: string | null;
  sleep_end?: string | null;
};

type SnapshotRow = SnapshotPatch & {
  user_id: string;
  snapshot_date: string;
  sources: Record<string, string>;
  updated_at?: string;
};

function isoDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function definedKeys(patch: SnapshotPatch): string[] {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key]) => key);
}

// Upsert a partial snapshot. Merges with any existing row for the same
// (user_id, date), only overwriting fields the caller actually provided.
// Tags every written field with `source` so consumers can show provenance.
export async function upsertSnapshot(
  client: SupabaseClient,
  params: {
    userId: string;
    date: string | Date;
    source: string;
    patch: SnapshotPatch;
  }
): Promise<{ written: number; error?: string }> {
  const fields = definedKeys(params.patch);
  if (fields.length === 0) return { written: 0 };

  const snapshot_date = isoDate(params.date);

  // (INT2) record every provider's raw value as an observation, so a conflict is
  // recoverable later — independent of which source "won" the snapshot column.
  const obsRows = fields
    .filter((f) => RECONCILABLE.has(f))
    .map((f) => ({ user_id: params.userId, snapshot_date, metric: f, source: params.source, value: (params.patch as Record<string, number>)[f], observed_at: new Date().toISOString() }));
  if (obsRows.length) {
    await client.from('health_metric_observations').upsert(obsRows, { onConflict: 'user_id,snapshot_date,metric,source' });
  }

  // (INT2) honor the per-metric authoritative-source override: a sync from a
  // different source must NOT overwrite a metric the user/coach pinned to another
  // provider. The observation above is still recorded.
  const { data: ovr } = await client
    .from('metric_source_overrides')
    .select('metric, source')
    .eq('user_id', params.userId);
  const overrideBy = new Map<string, string>((ovr ?? []).map((r: { metric: string; source: string }) => [r.metric, r.source]));

  const effective: SnapshotPatch = {};
  const writtenFields: string[] = [];
  for (const field of fields) {
    const pinned = overrideBy.get(field);
    if (pinned && pinned !== params.source) continue; // pinned elsewhere → don't clobber
    (effective as Record<string, unknown>)[field] = (params.patch as Record<string, unknown>)[field];
    writtenFields.push(field);
  }
  if (writtenFields.length === 0) return { written: 0 };

  const { data: existing, error: lookupError } = await client
    .from('daily_health_snapshot')
    .select('id, sources')
    .eq('user_id', params.userId)
    .eq('snapshot_date', snapshot_date)
    .maybeSingle();

  if (lookupError && lookupError.code !== 'PGRST116') {
    return { written: 0, error: lookupError.message };
  }

  const sources: Record<string, string> = { ...(existing?.sources ?? {}) };
  for (const field of writtenFields) sources[field] = params.source;

  const row: SnapshotRow = {
    user_id: params.userId,
    snapshot_date,
    ...effective,
    sources,
  };

  // Atomic upsert: the unique (user_id, snapshot_date) constraint serializes concurrent
  // first-writes (two provider syncs starting at once) — the loser does an UPDATE
  // instead of hitting a duplicate-key error. (The read above is only for the
  // sources-provenance merge.)
  const result = await client
    .from('daily_health_snapshot')
    .upsert(row, { onConflict: 'user_id,snapshot_date' });

  if (result.error) return { written: 0, error: result.error.message };
  return { written: writtenFields.length };
}

// WHOOP sync helper. Pulls the most recent recovery, sleep, cycle (strain),
// and workout records and upserts them onto the day each record falls on.
//
// Input shape is intentionally loose (`unknown` records) because upstream
// types in the sync route use a generic WhoopCollection<unknown>. We narrow
// each record defensively below.
type WhoopSyncShape = {
  recoveries?: { records?: unknown[] };
  sleeps?: { records?: unknown[] };
  cycles?: { records?: unknown[] };
  workouts?: { records?: unknown[] };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// Seconds → whole minutes (for Oura's stage / latency durations, which are in sec).
function secToMin(value: unknown): number | null {
  const n = asNumber(value);
  return n !== null ? Math.round(n / 60) : null;
}

function pickDate(record: Record<string, unknown>): string | null {
  return asString(record.start) ?? asString(record.created_at) ?? null;
}

export async function writeWhoopSnapshots(
  client: SupabaseClient,
  userId: string,
  whoop: WhoopSyncShape
): Promise<{ days: number }> {
  const byDate = new Map<string, SnapshotPatch>();
  const merge = (date: string, patch: SnapshotPatch) => {
    const existing = byDate.get(date) ?? {};
    byDate.set(date, { ...existing, ...patch });
  };

  for (const raw of whoop.recoveries?.records ?? []) {
    const record = asRecord(raw);
    const date = pickDate(record);
    if (!date) continue;
    const score = asRecord(record.score);
    merge(isoDate(date), {
      recovery_score: asNumber(score.recovery_score),
      resting_hr: asNumber(score.resting_heart_rate),
      hrv_ms: asNumber(score.hrv_rmssd_milli),
    });
  }

  for (const raw of whoop.sleeps?.records ?? []) {
    const record = asRecord(raw);
    const date = pickDate(record);
    if (!date) continue;
    const score = asRecord(record.score);
    const stage = asRecord(score.stage_summary);
    const inBedMs = asNumber(stage.total_in_bed_time_milli) ?? 0;
    const awakeMs = asNumber(stage.total_awake_time_milli) ?? 0;
    const sleepHours = inBedMs > 0 ? Number(((inBedMs - awakeMs) / 3_600_000).toFixed(2)) : null;
    merge(isoDate(date), {
      sleep_hours: sleepHours,
      sleep_performance_pct: asNumber(score.sleep_performance_percentage),
      sleep_efficiency_pct: asNumber(score.sleep_efficiency_percentage),
    });
  }

  for (const raw of whoop.cycles?.records ?? []) {
    const record = asRecord(raw);
    const date = pickDate(record);
    if (!date) continue;
    const score = asRecord(record.score);
    merge(isoDate(date), { strain: asNumber(score.strain) });
  }

  for (const raw of whoop.workouts?.records ?? []) {
    const record = asRecord(raw);
    const start = asString(record.start);
    if (!start) continue;
    const end = asString(record.end);
    const minutes = end
      ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
      : null;
    const score = asRecord(record.score);
    const avgHr = asNumber(score.average_heart_rate);
    merge(isoDate(start), {
      workout_minutes: minutes,
      avg_heart_rate: avgHr !== null ? Math.round(avgHr) : null,
      max_heart_rate: asNumber(score.max_heart_rate),
      strain: asNumber(score.strain),
    });
  }

  let written = 0;
  for (const [date, patch] of byDate) {
    const result = await upsertSnapshot(client, {
      userId,
      date,
      source: 'whoop',
      patch,
    });
    if (result.written > 0) written += 1;
  }
  return { days: written };
}

// Oura sync helper. Oura v2 records are keyed by a `day` (YYYY-MM-DD) field, so
// mapping onto the snapshot date is direct. Readiness → recovery_score; the
// detailed sleep session → hours / efficiency / resting HR / HRV / avg HR;
// daily_sleep → Oura's sleep score (sleep_performance_pct); daily_activity →
// active calories; workouts → workout minutes.
type OuraCollection = { data?: unknown[] };
type OuraSyncShape = {
  readiness?: OuraCollection;
  sleep?: OuraCollection;
  dailySleep?: OuraCollection;
  dailyActivity?: OuraCollection;
  workouts?: OuraCollection;
};

export async function writeOuraSnapshots(
  client: SupabaseClient,
  userId: string,
  oura: OuraSyncShape
): Promise<{ days: number }> {
  const byDate = new Map<string, SnapshotPatch>();
  const merge = (date: string, patch: SnapshotPatch) => {
    byDate.set(date, { ...(byDate.get(date) ?? {}), ...patch });
  };
  // Oura records carry an explicit `day`; fall back to a timestamp field.
  const dayOf = (record: Record<string, unknown>): string | null => {
    const day = asString(record.day);
    if (day) return day;
    const ts = asString(record.bedtime_start) ?? asString(record.start_datetime) ?? asString(record.timestamp);
    return ts ? isoDate(ts) : null;
  };

  for (const raw of oura.readiness?.data ?? []) {
    const record = asRecord(raw);
    const date = dayOf(record);
    if (!date) continue;
    merge(date, { recovery_score: asNumber(record.score) });
  }

  for (const raw of oura.dailySleep?.data ?? []) {
    const record = asRecord(raw);
    const date = dayOf(record);
    if (!date) continue;
    merge(date, { sleep_performance_pct: asNumber(record.score) });
  }

  for (const raw of oura.sleep?.data ?? []) {
    const record = asRecord(raw);
    const date = dayOf(record);
    if (!date) continue;
    const totalSec = asNumber(record.total_sleep_duration);
    const avgHr = asNumber(record.average_heart_rate);
    merge(date, {
      sleep_hours: totalSec !== null ? Number((totalSec / 3600).toFixed(2)) : null,
      sleep_efficiency_pct: asNumber(record.efficiency),
      resting_hr: asNumber(record.lowest_heart_rate),
      hrv_ms: asNumber(record.average_hrv),
      avg_heart_rate: avgHr !== null ? Math.round(avgHr) : null,
    });
    // Detailed sleep architecture — only from the main nightly sleep (Oura `type`
    // 'long_sleep'; absent for older records), so a daytime nap can't overwrite the
    // night's stage breakdown. Durations are seconds in the API.
    const sleepType = asString(record.type);
    if (sleepType == null || sleepType === 'long_sleep') {
      merge(date, {
        sleep_deep_min: secToMin(record.deep_sleep_duration),
        sleep_rem_min: secToMin(record.rem_sleep_duration),
        sleep_light_min: secToMin(record.light_sleep_duration),
        sleep_awake_min: secToMin(record.awake_time),
        sleep_latency_min: secToMin(record.latency),
        respiratory_rate: asNumber(record.average_breath),
        sleep_start: asString(record.bedtime_start),
        sleep_end: asString(record.bedtime_end),
      });
    }
  }

  for (const raw of oura.dailyActivity?.data ?? []) {
    const record = asRecord(raw);
    const date = dayOf(record);
    if (!date) continue;
    merge(date, { calories: asNumber(record.active_calories) });
  }

  for (const raw of oura.workouts?.data ?? []) {
    const record = asRecord(raw);
    const date = dayOf(record);
    if (!date) continue;
    const start = asString(record.start_datetime);
    const end = asString(record.end_datetime);
    const minutes = start && end
      ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
      : null;
    if (minutes !== null) merge(date, { workout_minutes: minutes });
  }

  let written = 0;
  for (const [date, patch] of byDate) {
    const result = await upsertSnapshot(client, { userId, date, source: 'oura', patch });
    if (result.written > 0) written += 1;
  }
  return { days: written };
}

// Strava sync helper. Each activity contributes workout minutes / HR to its
// start date. Multiple activities on the same day sum the minutes and keep
// the highest avg HR.
type StravaActivity = {
  start_date?: string;
  moving_time?: number;
  average_heartrate?: number;
  max_heartrate?: number;
};

export async function writeStravaSnapshots(
  client: SupabaseClient,
  userId: string,
  activities: StravaActivity[]
): Promise<{ days: number }> {
  const byDate = new Map<string, { minutes: number; avgHr: number | null; maxHr: number | null }>();

  for (const activity of activities) {
    if (!activity.start_date) continue;
    const date = isoDate(activity.start_date);
    const minutes = activity.moving_time ? Math.round(activity.moving_time / 60) : 0;
    const existing = byDate.get(date) ?? { minutes: 0, avgHr: null, maxHr: null };
    existing.minutes += minutes;
    if (activity.average_heartrate) {
      existing.avgHr = Math.max(existing.avgHr ?? 0, Math.round(activity.average_heartrate));
    }
    if (activity.max_heartrate) {
      existing.maxHr = Math.max(existing.maxHr ?? 0, Math.round(activity.max_heartrate));
    }
    byDate.set(date, existing);
  }

  let written = 0;
  for (const [date, totals] of byDate) {
    const result = await upsertSnapshot(client, {
      userId,
      date,
      source: 'strava',
      patch: {
        workout_minutes: totals.minutes || null,
        avg_heart_rate: totals.avgHr,
        max_heart_rate: totals.maxHr,
      },
    });
    if (result.written > 0) written += 1;
  }
  return { days: written };
}
