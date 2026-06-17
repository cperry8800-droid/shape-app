// Day-bucketing strategy — timezone correctness.
//
// Data that belongs to a user's *calendar day* (meal logs, weigh-ins, habit
// check-offs, daily check-ins, body measurements) must be bucketed in the
// USER's local timezone, not the server's. The client is the only party that
// knows the user's timezone at write time, so the canonical approach is:
//
//   the client sends its local date (YYYY-MM-DD); the server uses it verbatim.
//
// If the date is missing or malformed (older clients, server-to-server callers)
// we fall back to the server's UTC date — the previous behavior — so nothing
// regresses. This fixes the classic bug where an evening log in the Americas
// (local time still "today", but UTC has already rolled to "tomorrow") lands on
// the wrong calendar day and breaks streaks / "today" cards.

/** A client-supplied local calendar day (YYYY-MM-DD), else today in UTC. */
export function clientLocalDay(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

/**
 * Monday (week start) of a YYYY-MM-DD day, as YYYY-MM-DD. The day is anchored
 * at noon UTC and shifted by whole days only, so the arithmetic can never slip
 * across a day/DST boundary. Accepts the same loose input as clientLocalDay.
 */
export function weekMondayOf(value: unknown): string {
  const day = clientLocalDay(value);
  const dt = new Date(`${day}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
