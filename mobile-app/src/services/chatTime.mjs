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
