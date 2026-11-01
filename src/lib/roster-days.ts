// ⚠ A CLIENT'S LAST 30 DAYS ARE THEIR OWN 30 DAYS (get_client_stats' rule since #2547).
// /api/nutritionist/analytics read `snapshot_date >=` the UTC date 30 days back: 31 dates, with no
// upper bound, so a client who logged every day read 31 "days logged" in 30, and the protein,
// calorie and weight figures took in the 31st day too. A client's window is now the `n` days
// ending on their own today, read in their zone: client_profiles.timezone, which the app posts on
// open (/api/client/timezone), or the UTC day without one, as get_client_stats reads it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeZone } from '@/lib/time';
import { memberDay, shiftDay } from '@/lib/workout-days';

// One row per id, far under the 1,000-row cap, and about 3.7 KB of uuids in the query string
// (src/lib/client-names.ts' batch).
export const ZONE_BATCH = 100;

/**
 * Each client's zone on file, a batch of ids at a time, through the caller's own client (RLS: a
 * coach reads the profiles of their active, trialing and past-due clients,
 * providers_read_subscriber_profiles). An id with no zone, or one whose batch failed, is absent and
 * counts in UTC: the zone moves a window by a day at most, so a failed read is logged, not a figure
 * the coach is told is unread.
 */
export async function rosterZones(
  supabase: SupabaseClient,
  ids: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const zones = new Map<string, string>();
  const want = [...new Set(ids.filter((id) => id != null && id !== '').map(String))];
  for (let i = 0; i < want.length; i += ZONE_BATCH) {
    const batch = want.slice(i, i + ZONE_BATCH);
    const { data, error } = await supabase.from('client_profiles').select('user_id, timezone').in('user_id', batch);
    if (error) {
      console.warn(`[shape-app] roster zones: a client_profiles read failed — ${batch.length} clients count in UTC:`, error.message);
      continue;
    }
    for (const r of (data ?? []) as { user_id: string; timezone: string | null }[]) {
      const zone = normalizeZone(r.timezone);
      if (zone) zones.set(String(r.user_id), zone);
    }
  }
  return zones;
}

/** The first and last date ('YYYY-MM-DD') of the `n` days ending on the member's today in `zone` (UTC when none). */
export function memberWindow(now: number, zone: string | null | undefined, n: number): { first: string; last: string } {
  // A zone that cannot be read on the clock counts in UTC, as no zone does, never as no window.
  const last = (memberDay(now, zone || null) ?? memberDay(now, null)) as string;
  return { first: shiftDay(last, 1 - n), last };
}

/**
 * The dates one read must span to hold every client's `n` days: any zone's today is the UTC date
 * or a day either side of it, so from the UTC date minus `n` to the UTC date plus one. Each
 * client's rows are then cut to their own memberWindow.
 */
export function rosterReadBounds(now: number, n: number): { first: string; last: string } {
  const utc = memberDay(now, null) as string;
  return { first: shiftDay(utc, -n), last: shiftDay(utc, 1) };
}
