// A member's break quiets the habit reminders their own device schedules (Codex on #2705).
//
// A habit reminder has two halves (shapeBackend.js): the server's push, which a break already quiets
// (notify-core: memberPaused), and the device's own weekly notifications, which the OS fires with no
// server in the loop. So while the member's break holds, the device keeps none of them, and once it no
// longer holds, the ones it took down are scheduled again from habit_reminders. shapeBackend.js runs this
// when an account signs in, when the app comes to the front, and after a break or a reminder is saved on
// the device. A break a coach sets while the app is closed reaches the device the next time it opens.
import { readClientPause, pauseHolds } from './clientPause.mjs';

// Which of the member's habit reminders this device took down for a break: their habit ids, or ['*'] when
// it couldn't tell which were on it (then every one switched on goes back up). null: none taken down.
const KEY = (uid) => `shape.habits.awayFor:${uid}`;
const ALL = '*';
function takenDown(storage, uid) {
  try {
    const raw = storage ? storage.getItem(KEY(uid)) : null;
    if (raw == null) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(String) : [ALL];
  } catch { return null; }
}
function markTakenDown(storage, uid, ids) {
  try {
    if (!storage) return;
    if (ids) storage.setItem(KEY(uid), JSON.stringify(ids));
    else storage.removeItem(KEY(uid));
  } catch { /* the next run decides again */ }
}

// { db, uid, isCurrent, pendingIds, cancelAll, readRows, schedule, storage, now } → what it did:
//   'away'     the break holds, and the device's habit reminders are taken down;
//   'restored' it no longer holds, and the ones taken down for it are scheduled again;
//   'present'  no break, and none were taken down: nothing to do;
//   'unread'   the break or the reminders couldn't be read: the device stays as it is, for the next run;
//   'skipped'  nothing to run with, or the account changed under it.
// `pendingIds` resolves the habit ids the device has scheduled now (null: it can't tell); `readRows` the
// member's habit_reminders rows (null: they couldn't be read).
export async function syncHabitsToBreak({ db, uid, isCurrent = () => true, pendingIds = async () => null, cancelAll, readRows, schedule, storage = null, now = () => new Date() } = {}) {
  if (!db || !uid || typeof cancelAll !== 'function' || typeof readRows !== 'function' || typeof schedule !== 'function') return 'skipped';
  const read = await readClientPause(db, uid);
  if (!isCurrent()) return 'skipped';
  // Couldn't read it, or the table isn't there yet: never a reason to take reminders down or put them up.
  if (!read.ok || !read.ready) return 'unread';
  const before = takenDown(storage, uid);
  if (pauseHolds(read.pause, now())) {
    // The ones on the device now, with any taken down by an earlier run of this break.
    let onDevice = null;
    try { onDevice = await pendingIds(); } catch { onDevice = null; }
    if (!isCurrent()) return 'skipped';
    await cancelAll();
    if (!isCurrent()) return 'skipped';
    const ids = new Set(before || []);
    if (Array.isArray(onDevice)) onDevice.forEach((id) => ids.add(String(id)));
    else ids.add(ALL);
    markTakenDown(storage, uid, [...ids]);
    return 'away';
  }
  if (!before) return 'present';
  const rows = await readRows();
  if (!isCurrent()) return 'skipped';
  // Kept marked, so the next run puts them back rather than leaving them down for good.
  if (!Array.isArray(rows)) return 'unread';
  const back = new Set(before);
  for (const row of rows) {
    if (!isCurrent()) return 'skipped';
    if (!row || row.enabled === false) continue;
    if (!back.has(ALL) && !back.has(String(row.habit_id))) continue;
    // One row the device refuses (a time it can't read) doesn't keep the rest down.
    try { await schedule(row); } catch { /* that one */ }
  }
  if (!isCurrent()) return 'skipped';
  markTakenDown(storage, uid, null);
  return 'restored';
}
