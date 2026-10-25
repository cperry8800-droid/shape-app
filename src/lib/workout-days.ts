// A member's training days, counted on THEIR calendar.
//
// The day streak is read in two places, and they must be one number:
//   · /api/client/dashboard (the app's splash, the website profile, and the app's Me page
//     Signals since #2445);
//   · /api/client/train (the Train page's Streak, which read a field the route never sent).
// The Train page's 14-day volume is bucketed by the same days. The zone is
// client_profiles.timezone, which the app posts on open (/api/client/timezone). A member
// with none on file is counted in UTC, which is what the dashboard's server-local midnight
// always was on the server.
import type { SupabaseClient } from '@supabase/supabase-js';
import { wallClockInZone } from '@/lib/time';

/** The member's date ('YYYY-MM-DD') at an instant, in `zone` (UTC when none), or null. */
export function memberDay(at: string | number | null | undefined, zone: string | null): string | null {
  const t = typeof at === 'number' ? at : Date.parse(String(at ?? ''));
  if (!Number.isFinite(t)) return null;
  return wallClockInZone(t, zone || 'UTC')?.date ?? null;
}

/**
 * The day a session was done on, as the app stored it when it finished (`summary.snapshotDate`,
 * the member's own date then), or null for a session saved without one.
 *
 * ⚠ PREFER THIS TO RE-READING THE INSTANT IN TODAY'S ZONE. /api/client/timezone overwrites the
 * zone whenever the app opens somewhere else, so a member who travels would otherwise see past
 * workouts move between days and their streak change (Codex P2 on #2451).
 */
export function storedDay(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** A 'YYYY-MM-DD' moved by `n` calendar days. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive days with a finished workout, ending today, or ending yesterday while today
 * has none yet (a streak isn't broken until the day is over).
 */
export function dayStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/** Finished sessions read per page by readDayStreak, and the most pages it reads. */
export const STREAK_PAGE = 500;
export const STREAK_PAGES = 20;

/**
 * The member's day streak over every finished session it needs, by one query for both routes.
 *
 * ⚠ NOT FROM A ROUTE'S CAPPED TIMELINE READ. The train route lists its newest 200 sessions of
 * any status and the dashboard its newest 500 finished ones, so a streak counted from either was
 * cut short for a member with more sessions in it, and the two could disagree (Codex P2 on
 * #2451). This reads finished sessions newest first, a page at a time, until the streak is
 * broken: once a page reaches sessions saved three days before the streak's first day, none
 * further down can extend it (a session is saved after it starts; the margin covers a device
 * clock and a day stored in another zone). It stops at STREAK_PAGES pages (10,000 sessions), and
 * on a failed read counts what it has. Each session counts on its stored day (storedDay) when it
 * has one, else on its start read in the member's zone.
 */
export async function readDayStreak(
  supabase: SupabaseClient,
  userId: string,
  zone: string | null,
  today: string
): Promise<number> {
  const days = new Set<string>();
  for (let i = 0; i < STREAK_PAGES; i += 1) {
    const from = i * STREAK_PAGE;
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('started_at, ended_at, created_at, local_day:summary->>snapshotDate')
      .eq('client_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(from, from + STREAK_PAGE - 1);
    if (error || !data) break;
    let oldestSave: string | null = null;
    for (const s of data as Array<{ started_at: string | null; ended_at: string | null; created_at: string; local_day: unknown }>) {
      const day = storedDay(s.local_day) ?? memberDay(s.started_at || s.ended_at || s.created_at, zone);
      if (day) days.add(day);
      const saved = memberDay(s.created_at, zone);
      if (saved && (oldestSave == null || saved < oldestSave)) oldestSave = saved;
    }
    if (data.length < STREAK_PAGE) break;
    const end = days.has(today) ? today : shiftDay(today, -1);
    const start = shiftDay(end, 1 - dayStreak(days, today));
    if (oldestSave != null && oldestSave < shiftDay(start, -3)) break;
  }
  return dayStreak(days, today);
}
