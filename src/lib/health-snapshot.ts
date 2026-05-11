// Cross-domain daily health snapshot.
//
// Whoop, Strava, workout_sessions, and manual nutrition all upsert into
// public.daily_health_snapshot keyed on (user_id, snapshot_date). Each source
// owns a defined column subset; the `sources` jsonb tracks provenance so a
// missing field is distinguishable from "no integration connected".

import type { SupabaseClient } from '@supabase/supabase-js';

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
  stress?: number | null;
  soreness?: number | null;
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
  for (const field of fields) sources[field] = params.source;

  const row: SnapshotRow = {
    user_id: params.userId,
    snapshot_date,
    ...params.patch,
    sources,
  };

  const result = existing?.id
    ? await client.from('daily_health_snapshot').update(row).eq('id', existing.id)
    : await client.from('daily_health_snapshot').insert(row);

  if (result.error) return { written: 0, error: result.error.message };
  return { written: fields.length };
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
