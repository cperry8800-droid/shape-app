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
import { wallClockInZone } from '@/lib/time';

/** The member's date ('YYYY-MM-DD') at an instant, in `zone` (UTC when none), or null. */
export function memberDay(at: string | number | null | undefined, zone: string | null): string | null {
  const t = typeof at === 'number' ? at : Date.parse(String(at ?? ''));
  if (!Number.isFinite(t)) return null;
  return wallClockInZone(t, zone || 'UTC')?.date ?? null;
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
