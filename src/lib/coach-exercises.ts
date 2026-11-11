// A trainer's exercises pushed from the Live console ("+ Add to today's session"), read the same way
// by the console that wrote them and by the member they were written for.
//
// ⚠ AN EXERCISE BELONGS TO THE MEMBER'S DAY IT WAS SENT ON. coach_pushed_items has no date column: a
// row is "today's" when its sent_at falls on today in the member's zone (client_profiles.timezone,
// which the app posts on open; UTC with none, as src/lib/workout-days.ts counts). The console shows a
// client's today, and /api/client/coach-exercises the member's last EXERCISE_DAYS days, so the Train
// week can show each day's. Before 2026-11-10 the console listed every row never removed, from any
// day, as "today's session", and the member's app read none of them.
//
// The payload is coach-written JSONB from the console's form ({ name, sets, reps, tempo, cue }, an
// empty box saved as '—'). It is read as a shape, never trusted: only strings and finite numbers
// become text, a '—' is no value, and a row without a name is no exercise.
import { memberDay, shiftDay } from '@/lib/workout-days';

/** The member days /api/client/coach-exercises returns, today included: a Monday-first week reaches six back. */
export const EXERCISE_DAYS = 7;

export type PushedExercise = {
  id: string;
  providerId: string;
  name: string;
  sets: string | null;
  reps: string | null;
  tempo: string | null;
  cue: string | null;
  sentAt: string;
  /** The member's date ('YYYY-MM-DD') the coach sent it on. */
  day: string;
};

type Row = { id?: unknown; kind?: unknown; provider_id?: unknown; payload?: unknown; sent_at?: unknown };

const text = (v: unknown): string | null => {
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) return null;
  const s = String(v).trim();
  return s && s !== '—' && s !== '-' ? s : null;
};

/** A coach_pushed_items row as an exercise on the member's day in `zone`, or null when it is not one. */
export function pushedExerciseOf(row: Row | null | undefined, zone: string | null): PushedExercise | null {
  if (!row || row.kind !== 'exercise' || row.id == null) return null;
  const p = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};
  const name = text(p.name);
  if (!name) return null;
  const sentAt = typeof row.sent_at === 'string' ? row.sent_at : null;
  const day = sentAt ? memberDay(sentAt, zone) : null;
  if (!sentAt || !day) return null;
  return {
    id: String(row.id),
    providerId: String(row.provider_id ?? ''),
    name,
    sets: text(p.sets),
    reps: text(p.reps),
    tempo: text(p.tempo),
    cue: text(p.cue),
    sentAt,
    day,
  };
}

/**
 * The earliest sent_at a read must reach to hold the last `n` days of anyone's calendar: any zone's
 * today is the UTC date or a day either side of it, and its first instant at most 14 hours before
 * that date's UTC midnight, so the UTC midnight `n + 1` days back covers every zone. Each row is then
 * placed on its own member's day.
 */
export function exerciseReadSince(now: number, n: number): string {
  const utc = memberDay(now, null) as string;
  return `${shiftDay(utc, -(n + 1))}T00:00:00.000Z`;
}

/** The member's last `n` dates, oldest first, today last ('YYYY-MM-DD'). */
export function memberDays(now: number, zone: string | null, n: number): string[] {
  const today = (memberDay(now, zone) ?? memberDay(now, null)) as string;
  return Array.from({ length: n }, (_, i) => shiftDay(today, i - (n - 1)));
}
