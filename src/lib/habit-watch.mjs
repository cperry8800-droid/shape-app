// Shared habits: who is told, and what they read, when a habit is not done by evening.
//
// Owner, 2026-10-20: "habits can be public so that friends on app will be notified if you don't
// complete a habit". The member picks the people per habit (habit_watchers, written only by
// set_habit_watchers in supabase-migrations/2026-10-20-habit-watchers.sql), and at 8 pm in the
// member's own timezone each of them hears about a shared habit that is not checked off yet, so
// there is still time to nudge. /api/cron/habit-watch runs this every hour; it is pure so the
// rules are tested without a database.

// 8 pm, the member's time: late enough that the day was theirs to use, early enough to act on
// it, and before the default quiet hours (22:00).
import { np, phrase } from '../../mobile-app/src/services/noticeCopy.mjs';

export const HABIT_WATCH_HOUR = 20;
// The hours after it in which a notice that did not land (a failed write, or a run that ran out
// of time) is tried again (Codex on #2413). One that did land is never sent twice: the cron reads
// the evening's notices first, and the dedupe index refuses a second row.
export const HABIT_WATCH_CATCHUP = 2;

// The notices owed this hour, one per (shared habit, person), for a habit whose owner is between
// HABIT_WATCH_HOUR and the end of the catch-up hours and has not checked it off on their own
// calendar day.
//   habits     the shared habits: { id, user_id, name, type, cadence, archived_at }
//   watchers   { habit_id, owner_id, watcher_id }
//   doneOn     a Set of `${habitId}|${YYYY-MM-DD}`: the check-offs that exist
//   zoneOf     userId -> IANA zone, or null for none on file (read as UTC)
//   hourOf     zone -> the hour there now; dayOf: zone -> the date there now
//   connected  (a, b) -> whether an accepted follow joins them, either way round, right now
// ⚠ CONNECTED IS RE-CHECKED AT SEND TIME. A person was connected when picked; if either side has
// since unfollowed, they are no longer told. set_habit_watchers cannot see the future.
export function habitWatchDue({ habits, watchers, doneOn, zoneOf, hourOf, dayOf, connected, hour = HABIT_WATCH_HOUR, through = HABIT_WATCH_HOUR + HABIT_WATCH_CATCHUP }) {
  const out = [];
  const byHabit = new Map();
  for (const w of watchers || []) {
    if (!w || !w.habit_id || !w.watcher_id) continue;
    const list = byHabit.get(w.habit_id) || [];
    list.push(w);
    byHabit.set(w.habit_id, list);
  }
  for (const h of habits || []) {
    if (!h || !h.id || !h.user_id || h.archived_at) continue;
    // Every habit in the app is daily today; anything else is not this rule's to judge.
    if (h.cadence && h.cadence !== 'daily') continue;
    const tz = zoneOf(h.user_id) || 'UTC';
    const at = hourOf(tz);
    if (at < hour || at > through) continue;
    const day = dayOf(tz);
    if (doneOn.has(`${h.id}|${day}`)) continue;
    const seen = new Set();
    for (const w of byHabit.get(h.id) || []) {
      // The row's owner must be the habit's: a row can never speak for someone else's habit.
      if (w.owner_id !== h.user_id || w.watcher_id === h.user_id || seen.has(w.watcher_id)) continue;
      if (!connected(h.user_id, w.watcher_id)) continue;
      seen.add(w.watcher_id);
      out.push({ habitId: h.id, ownerId: h.user_id, watcherId: w.watcher_id, day, name: h.name, type: h.type === 'avoid' ? 'avoid' : 'do' });
    }
  }
  return out;
}

const clamp = (s, n) => {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  return v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v;
};

// What the person reads. The owner by first name; a "to-don't" habit is one they check off at
// the end of a clean day, so it is "hasn't checked in on", not "hasn't done".
// The English is what the notifications table keeps; the bell and the push say it in the reader's
// language from habitWatchCopy (below, noticeCopy.mjs).
export function habitWatchText({ ownerName, habitName, type }) {
  const first = clamp(String(ownerName || '').trim().split(/\s+/)[0] || '', 40) || 'Your friend';
  const habit = clamp(habitName, 60) || 'a habit';
  return type === 'avoid'
    ? { title: `${first} hasn't checked in on “${habit}” today`, body: 'Their day isn’t over yet. A quick message could help them stay on track.' }
    : { title: `${first} hasn't done “${habit}” yet today`, body: 'Their day isn’t over yet. A quick message could help them get it done.' };
}

// The same notice as copy: the friend's first name and the habit's name as written, or the catalog's
// stand-ins when either is missing, as habitWatchText has them.
export function habitWatchCopy({ ownerName, habitName, type }) {
  const first = clamp(String(ownerName || '').trim().split(/\s+/)[0] || '', 40);
  const habit = clamp(habitName, 60);
  const vars = { name: first || phrase('word.yourFriend'), habit: habit || phrase('word.aHabit') };
  return type === 'avoid'
    ? { title: np('friend.avoidTitle', vars), body: np('friend.avoidBody') }
    : { title: np('friend.title', vars), body: np('friend.body') };
}

// One notice per person, per habit, per the owner's day: the notifications dedupe index
// (user_id, type, data->>'dedupe') rejects a second run's insert for the same evening.
export const habitWatchDedupe = (habitId, day) => `habit:${habitId}:${day}`;
