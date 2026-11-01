// ─── CHAT TIMES ──────────────────────────────────────────────────────────────────────────────
// When a message was sent, as a chat prints it, in the app's language: the clock for today, the
// weekday and clock this past week, else the date and clock (the year only when it isn't this one).
// A list row says the shorter of the two: the clock, the weekday or the date. A channel's messages
// read SYNCED under every bubble before this (shapeBackend kept no time for them).

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function format(d, locale, opts) {
  try { return new Intl.DateTimeFormat(locale || undefined, opts).format(d); }
  catch (e) { return new Intl.DateTimeFormat(undefined, opts).format(d); }
}

/** A message's time from its ISO stamp, or '' when it has none. `list` is a thread row's shorter form. */
export function bsChatStamp(iso, locale, { list = false, now = new Date() } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const clock = { hour: 'numeric', minute: '2-digit' };
  // Whole days between the two midnights (a daylight-saving day is 23 or 25 hours long).
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return format(d, locale, clock); // today, or a sender's clock a little ahead
  if (days < 7) return format(d, locale, list ? { weekday: 'short' } : { weekday: 'short', ...clock });
  const date = { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) };
  return format(d, locale, list ? date : { ...date, ...clock });
}

// ─── DAY DIVIDERS (owner, 2026-11-01: "build the day dividers and swipe to reply") ──────────────
// A thread says each day once, centred between its messages, and a message under it says only its
// clock. The day key is the reader's local date, so a message sent at 23:50 and one at 00:10 sit
// under two dividers.

const pad2 = (n) => String(n).padStart(2, '0');

/** The local day an ISO stamp falls on, as 'YYYY-MM-DD', or '' when it has none. */
export function bsChatDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * A divider's words for the day of an ISO stamp: { kind: 'today' | 'yesterday' } for the two the
 * caller translates, else { kind: 'weekday' | 'date', text } formatted in `locale` (the weekday this
 * past week, else the date, with the year only when it isn't this one). null with no stamp.
 */
export function bsChatDayLabel(iso, locale, { now = new Date() } = {}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return { kind: 'today' };
  if (days === 1) return { kind: 'yesterday' };
  if (days < 7) return { kind: 'weekday', text: format(d, locale, { weekday: 'long' }) };
  return { kind: 'date', text: format(d, locale, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }) };
}

/** A message's clock alone, for a thread whose dividers say the day; '' with no stamp. */
export function bsChatClock(iso, locale) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return format(d, locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The indexes a divider goes before: the first message that has a stamp, then each one whose day
 * differs from the last stamped message's. A message with no stamp (a demo thread, a preview's last
 * line) neither draws one nor breaks the day it sits in.
 */
export function bsChatDividerIndexes(messages) {
  const out = new Set();
  let last = '';
  (messages || []).forEach((m, i) => {
    const key = m ? bsChatDayKey(m.at) : '';
    if (!key) return;
    if (key !== last) out.add(i);
    last = key;
  });
  return out;
}
