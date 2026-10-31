// A watch's or ring's nights, as its provider reported them, for sleep points.
//
// award_sleep_points pays +5 for a 7–12 hour night from a connected provider. It used to read the
// night from daily_health_snapshot, a row the member writes, so a forged night stamped 'oura' was
// paid. It now reads device_sleep_nights (supabase-migrations/2026-10-31-device-sleep-nights.sql),
// which no member can write: only these server paths record into it, with the service key, after
// they fetch the night from the provider (Oura, WHOOP), receive it from the provider (the Garmin
// webhook), or take it from the app's Health sync (Apple Health, whatever the app posts).
//
// A failed record never fails the sync: the snapshot is the member's data and is already written.
// Before the migration runs the table is missing, and every record logs and carries on.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type DeviceSleepProvider = 'apple_health' | 'garmin' | 'oura' | 'whoop';
export type DeviceNight = { date: string; hours: number | null | undefined };
export type DeviceNightRow = { user_id: string; night: string; provider: DeviceSleepProvider; hours: number; recorded_at: string };

const PROVIDERS: ReadonlySet<string> = new Set(['apple_health', 'garmin', 'oura', 'whoop']);

// A real calendar day, YYYY-MM-DD (no rollover: 2026-02-30 is no day).
function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

// The rows to record: a real day and hours over 0 and at most 24 (the table's own check), one per
// night, the last report of a night standing.
export function deviceNightRows(userId: string, provider: string, nights: readonly DeviceNight[] | null | undefined, now: Date = new Date()): DeviceNightRow[] {
  if (!userId || !PROVIDERS.has(provider) || !Array.isArray(nights)) return [];
  const byNight = new Map<string, DeviceNightRow>();
  for (const n of nights) {
    if (!n || !isDay(n.date)) continue;
    const hours = typeof n.hours === 'number' ? n.hours : NaN;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
    byNight.set(n.date, { user_id: userId, night: n.date, provider: provider as DeviceSleepProvider, hours: Number(hours.toFixed(2)), recorded_at: now.toISOString() });
  }
  return [...byNight.values()];
}

// Record the nights with the service key. `admin` is the caller's service client when it has one
// (the Garmin webhook); otherwise one is made here.
export async function recordDeviceNights(
  admin: SupabaseClient | null,
  userId: string,
  provider: DeviceSleepProvider,
  nights: readonly DeviceNight[] | null | undefined,
): Promise<{ recorded: number; error?: string }> {
  const rows = deviceNightRows(userId, provider, nights);
  if (rows.length === 0) return { recorded: 0 };
  let db = admin;
  if (!db) {
    try { db = createAdminClient(); } catch (e) {
      console.warn('[shape-app] device nights not recorded (no service client):', e instanceof Error ? e.message : e);
      return { recorded: 0, error: 'no service client' };
    }
  }
  try {
    const { error } = await db.from('device_sleep_nights').upsert(rows, { onConflict: 'user_id,night,provider' });
    if (error) {
      console.warn('[shape-app] device nights not recorded:', error.message);
      return { recorded: 0, error: error.message };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[shape-app] device nights not recorded:', message);
    return { recorded: 0, error: message };
  }
  return { recorded: rows.length };
}
