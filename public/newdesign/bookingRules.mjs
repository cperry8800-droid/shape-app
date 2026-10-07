// Booking rules — "Protect your time" (coach Schedule upgrade, step 3; owner-approved
// 2026-10-07: "I like everything that is proposed … Apply all the fixes first then proceed").
//
// ONE answer to "may this time be booked?", for every surface that asks it: the consultation
// route, the coach's create/reschedule paths, the member slot lists (website and app) and the
// Schedule grid's conflict warnings. Five rules, each measured against the coach's own clock:
//
//   · open hours  — the WHOLE session must sit inside the coach's provider_availability hours
//   · time off    — provider_time_off blocks (a vacation, an afternoon) close booking
//   · overlap     — no two active sessions at once
//   · buffer      — provider_booking_rules.buffer_min of clear time either side of a session
//   · daily limit — at most max_per_day sessions on one LOCAL date
//   · notice      — nothing sooner than min_notice_hours from now
//
// ⚠ WHY THIS EXISTS: TODAY NOTHING ENFORCES ANY OF IT. The consultation route resolves the
// member's wall clock in the coach's zone and inserts — it never asks whether that time is
// inside the coach's hours, so a crafted request lands at 3 AM; and the only conflict guard in
// the whole schema is a unique index on the exact start instant, so a 9:00 booking and a 9:15
// one sit on top of each other. The proposal names both ("Today nothing stops two sessions from
// overlapping"; "a crafted request can land at 3 AM").
//
// PURE: no DOM, no window, no fetch, no clock read. `now` is an INPUT. Canonical location is
// public/newdesign/ (the progressionGuardrail.mjs / workoutDocument.mjs precedent): Next routes
// import it by relative path, the website loads it as a native module, the app can import it
// by relative path, and the Node tests import it directly — one set of rules, so a member's
// slot list and the route that refuses a booking cannot disagree about the same minute.
//
// ── THE ZONE ARITHMETIC IS A FOURTH COPY, AND IT IS DELIBERATELY NOT AN IDENTICAL ONE ──────
// src/lib/time.ts (instantInZone), public/newdesign/bookingSlots.js (isoForSlot) and the
// app's coachAvailability.mjs (bsInstantInZone) carry one algorithm, held identical by
// tests/booking-timezone-parity.test.mjs. This file cannot import the TS one (it must run in a
// browser with no bundler) and it needs a TOTAL answer where those return NaN:
//
//   · They REFUSE a wall time the zone skips (02:30 on a spring-forward night), which is right
//     for a slot — nobody can be booked into an hour that does not happen. But an open-hours
//     WINDOW that starts or ends inside the skipped hour still has an edge, and dropping the
//     whole window would close a coach's evening because one of its ends fell in the gap.
//     `wallInstant` answers "the first instant at which the clock reads that time or later",
//     which for a skipped time is the moment of the jump.
//   · For a repeated time (01:30 on a fall-back night, which happens twice) the two-pass
//     algorithm returns whichever instant its probes land on, and that differs by hemisphere
//     (New York gets the first 01:30, Berlin the second). Here it is always the FIRST.
//
// Everywhere else — every wall time that happens exactly once, which is all but two hours a
// year — the answers are identical, and tests/booking-rules.test.mjs drives this copy over the
// parity matrix against src/lib/time.ts to prove it.
//
// ── A COACH WITH NO ZONE HAS NO BOOKABLE TIME (the 2026-09-11 rule) ───────────────────────
// provider_availability.start_minute is a bare wall-clock minute in the coach's day, so with no
// stored zone an open hour is an hour nothing can place. Every reader fails closed on it, and
// so does this one: the answer is `closed`, with a message that says the hours need a zone.

const DAY_MS = 86400000;
const MIN_MS = 60000;
const HOUR_MS = 3600000;

/** The ranges provider_booking_rules accepts (its CHECK constraints say the same). */
export const RULE_LIMITS = Object.freeze({
  bufferMin: Object.freeze({ min: 0, max: 120 }),
  maxPerDay: Object.freeze({ min: 1, max: 24 }),
  minNoticeHours: Object.freeze({ min: 0, max: 336 }),
});

/** @typedef {{ bufferMin: number, maxPerDay: number | null, minNoticeHours: number }} BookingRules */

/** A coach with no stored rules: no buffer, no daily limit, no notice. Today's behaviour.
 * @type {Readonly<BookingRules>} */
export const DEFAULT_RULES = Object.freeze({ bufferMin: 0, maxPerDay: null, minNoticeHours: 0 });

/** The longest window `openSlots` walks, and the longest a busy read may ask for. */
// ⚠ 60, NOT 62 (Codex, the review of #2225). openSlots says to read busy blocks from a day before
// `from` to a day after `to`, and provider_busy_blocks refuses a window longer than
// BUSY_READ_MAX_DAYS. A 62-day slot range padded by a day each side was a 64-day read the
// function refuses, leaving a caller to either fail or drop the padding and miscount the first
// and last local days. tests/booking-rules.test.mjs holds MAX_WINDOW_DAYS + 2 within the
// function's limit, and the function's limit equal to the migration's.
export const MAX_WINDOW_DAYS = 60;
export const BUSY_READ_MAX_DAYS = 62;
/** The most slot starts `openSlots` returns. */
export const MAX_SLOTS = 2000;
/** The longest single block of time off. A longer leave is two entries. */
export const TIME_OFF_MAX_DAYS = 90;
/** The longest a time-off note may be (the column's CHECK says the same). */
export const TIME_OFF_NOTE_MAX = 500;

/** Every reason `checkSlot` can refuse with, in the order it checks them. */
export const REASONS = Object.freeze(['invalid', 'past', 'notice', 'closed', 'time_off', 'overlap', 'buffer', 'daily_limit']);

// ── Small readers ───────────────────────────────────────────────────────────────────────

// ⚠ `Number(null)` IS 0 AND SO IS `Number("")`, AND BOTH ARE FINITE — so `Number.isFinite`
// alone cannot tell an absent field from a measured zero. bookingSlots.js found that the hard
// way (a row with no `start_minute` became a bookable midnight); the same guard here.
function num(v) {
  if (v == null || v === '' || typeof v === 'boolean') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// ⚠ A STRING INSTANT MUST NAME ITS OFFSET. `Date.parse('2026-10-07T09:00')` reads the wall
// clock in the RUNTIME's zone — UTC on the server, the member's zone in a browser — which is
// the defect class this whole feature is built on top of the fix for. So an ISO string counts
// only with a `Z` or a `±hh:mm` (Postgres's short `+00` is accepted too); anything else is not
// an instant.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;
/** Epoch ms for a Date, a finite number or an ISO instant with an offset; NaN otherwise.
 * @param {unknown} v @returns {number} */
export function toMs(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (!ISO_INSTANT.test(s)) return NaN;
  // `+00` → `+00:00`, and Postgres's space separator → `T`, so every runtime parses it.
  const norm = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const t = Date.parse(norm);
  return Number.isFinite(t) ? t : NaN;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

// ── The zone ────────────────────────────────────────────────────────────────────────────

const FMT = new Map();
function fmtFor(zone) {
  // ⚠ AN ABSENT ZONE IS REFUSED HERE, BECAUSE `Intl` DOES NOT REFUSE IT. `timeZone: undefined`
  // means "the runtime's own zone" — UTC on Vercel, the member's in a browser — which is the
  // read-it-somewhere-else defect, with no throw to notice it by. Refused at the formatter so
  // every path is safe, not only the ones that remembered to ask.
  if (typeof zone !== 'string' || zone.length === 0) return null;
  if (FMT.has(zone)) return FMT.get(zone);
  let f = null;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    f = null; // RangeError — not a zone this runtime knows
  }
  FMT.set(zone, f);
  return f;
}

/** Whether `zone` is an IANA zone this runtime can do arithmetic in. */
export function isZone(zone) {
  return fmtFor(zone) != null;
}

function partsAt(t, zone) {
  const f = fmtFor(zone);
  if (!f || !Number.isFinite(t)) return null;
  const p = {};
  for (const part of f.formatToParts(new Date(t))) p[part.type] = part.value;
  const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  let h = Number(p.hour);
  const mi = Number(p.minute), s = Number(p.second);
  if (h === 24) h = 0; // some ICU builds spell midnight "24"
  if (![y, mo, d, h, mi, s].every((n) => Number.isFinite(n))) return null;
  return { y, mo, d, h, mi, s };
}

// The wall clock `zone` shows at instant `t`, as if that wall clock were a UTC instant —
// comparable with `Date.UTC(...)` of a civil time. Seconds resolution (Intl has no ms).
function wallAt(t, zone) {
  const p = partsAt(t, zone);
  return p ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) : NaN;
}

function zoneOffsetMs(t, zone) {
  const w = wallAt(t, zone);
  return Number.isFinite(w) ? w - Math.floor(t / 1000) * 1000 : NaN;
}

/**
 * The first instant at which `zone`'s clock reads the civil date y-mo-d plus `minute` minutes
 * (which may run past 1440 into the next days), or later. NaN only for an unusable zone/date.
 *
 * ⚠ WALL CLOCKS ARE RESOLVED PER DATE, NEVER BY ADDING HOURS TO AN INSTANT. "09:00 to 12:00"
 * on a fall-back Sunday is four real hours and on a spring-forward Sunday two, and only
 * resolving each end on its own date gets that right; start + 180 minutes gets it wrong twice
 * a year, in opposite directions.
 *
 * ⚠ THREE PROBES, NOT TWO PASSES. The offsets a day either side of the naive instant bracket
 * any transition that could touch this wall time, so every instant that reads it is among the
 * candidates; the earliest that round-trips wins (the FIRST 01:30 of a fall-back night). When
 * none round-trips the time was skipped, and the answer is the instant of the jump, found by
 * bisection between the two candidates — the first moment the clock reads it or later.
 */
export function wallInstant(y, mo, d, minute, zone) {
  if (!isZone(zone)) return NaN;
  const naive = Date.UTC(num(y), num(mo) - 1, num(d), 0, num(minute), 0);
  if (!Number.isFinite(naive)) return NaN;
  const offs = [];
  let best = NaN;
  for (const probe of [naive - DAY_MS, naive, naive + DAY_MS]) {
    const o = zoneOffsetMs(probe, zone);
    if (!Number.isFinite(o)) return NaN;
    offs.push(o);
    const t = naive - o;
    if (wallAt(t, zone) === naive && !(t >= best)) best = t;
  }
  if (Number.isFinite(best)) return best;
  // The skipped hour: `lo` still reads before it, `hi` already reads after it.
  let lo = naive - Math.max(...offs);
  let hi = naive - Math.min(...offs);
  if (!(wallAt(lo, zone) < naive && wallAt(hi, zone) >= naive)) return NaN;
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (wallAt(mid, zone) >= naive) hi = mid; else lo = mid;
  }
  return hi;
}

/** The civil date `zone` is on at instant `t`, as 'YYYY-MM-DD', or null. */
export function localDate(t, zone) {
  const p = partsAt(toMs(t), zone);
  return p ? `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}` : null;
}

// 'YYYY-MM-DD' → [y, mo, d] when it names a real date, else null (Feb 30 is refused, not rolled).
function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/**
 * Whole local days `fromDate`..`toDate` (inclusive) in `zone`, as [startsAt, endsAt) epoch ms:
 * from the first moment of the first day to the first moment of the day after the last.
 * null when either date is not a real date, the range runs backwards or the zone is unusable.
 *
 * ⚠ "MIDNIGHT" IS `wallInstant(…, 0)`, NOT `T00:00`. A handful of zones change their clocks AT
 * midnight (Havana, Santiago in some years), where 00:00 never happens on the switch day;
 * the first moment of that day is the jump, and that is what a whole day off has to start at.
 */
export function localDayRange(fromDate, toDate, zone) {
  const a = parseDate(fromDate), b = parseDate(toDate ?? fromDate);
  if (!a || !b || !isZone(zone)) return null;
  const startsAt = wallInstant(a[0], a[1], a[2], 0, zone);
  const endsAt = wallInstant(b[0], b[1], b[2], 1440, zone);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) return null;
  return { startsAt, endsAt };
}

// ── Display, in the coach's zone ────────────────────────────────────────────────────────

const LABEL = new Map();
function label(t, zone, kind) {
  const key = zone + '|' + kind;
  let f = LABEL.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', kind === 'time'
      ? { timeZone: zone, hour: 'numeric', minute: '2-digit' }
      : { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' });
    LABEL.set(key, f);
  }
  return f.format(new Date(t));
}
const timeLabel = (t, zone) => (isZone(zone) ? label(t, zone, 'time') : new Date(t).toISOString().slice(11, 16) + ' UTC');
const dayLabel = (t, zone) => (isZone(zone) ? label(t, zone, 'day') : new Date(t).toISOString().slice(0, 10));

// "12 hours'" · "1 hour's" · "2 days'" · "1 day's" — the possessive is the English, not a typo.
function noticeText(hours) {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "1 day's" : `${days} days'`;
  }
  return hours === 1 ? "1 hour's" : `${hours} hours'`;
}

// What a MEMBER is told for each refusal. One copy, read by evaluate() below and by
// bookingRuleRefusal(), so the sentence a member reads is the same whether the page, the route or
// the database (2026-10-07-booking-rules-enforced.sql) said no.
const MEMBER_SAYS = Object.freeze({
  time_off: 'This coach is away then.',
  buffer: "That's too close to another of this coach's sessions.",
  daily_limit: 'This coach is fully booked that day.',
});
const memberNotice = (hours) => `This coach needs at least ${noticeText(hours)} notice. Pick a later time.`;

/**
 * A refusal raised by the database's booking-rules trigger (`booking_rule:<reason>`, SQLSTATE
 * P0001; for `notice` the error's details carry the hours), as { reason, message } in the
 * member's words. Null for any other error, so a caller falls through to its own handling.
 * @param {unknown} error a Supabase/PostgREST error { code, message, details }
 * @returns {{ reason: string, message: string } | null}
 */
export function bookingRuleRefusal(error) {
  if (!error || typeof error !== 'object') return null;
  const m = /^booking_rule:(notice|time_off|buffer|daily_limit)$/.exec(String(error.message ?? '').trim());
  if (!m) return null;
  const reason = m[1];
  if (reason !== 'notice') return { reason, message: MEMBER_SAYS[reason] };
  const hours = Number(error.details);
  return { reason, message: Number.isInteger(hours) && hours > 0 ? memberNotice(hours) : 'This coach needs more notice. Pick a later time.' };
}

// ── Rules ───────────────────────────────────────────────────────────────────────────────

const clampInt = (v, lim, fallback) => {
  const n = num(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(lim.max, Math.max(lim.min, Math.round(n)));
};

/**
 * A stored rules row (snake_case, from provider_booking_rules) or a camelCase object, as
 * `{ bufferMin, maxPerDay, minNoticeHours }`. LENIENT — this is the READ side: an out-of-range
 * value is clamped into range and an absent one takes the default, so a row written by hand
 * cannot make the rules throw. The WRITE side is `validateRules`, which refuses instead.
 * @param {unknown} raw @returns {BookingRules}
 */
export function normalizeRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pick = (camel, snake) => (r[camel] !== undefined ? r[camel] : r[snake]);
  const max = num(pick('maxPerDay', 'max_per_day'));
  return {
    bufferMin: clampInt(pick('bufferMin', 'buffer_min'), RULE_LIMITS.bufferMin, DEFAULT_RULES.bufferMin),
    // ⚠ NO LIMIT IS `null`, AND 0 IS NOT A LIMIT OF ZERO. A coach who wants no bookings at all
    // closes their hours; a stored 0 is read as "no limit" rather than "closed every day", which
    // would silently empty their calendar.
    maxPerDay: Number.isFinite(max) && max >= 1 ? clampInt(max, RULE_LIMITS.maxPerDay, null) : null,
    minNoticeHours: clampInt(pick('minNoticeHours', 'min_notice_hours'), RULE_LIMITS.minNoticeHours, DEFAULT_RULES.minNoticeHours),
  };
}

const WHOLE = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  return NaN;
};

/**
 * The write side: `{ bufferMin, maxPerDay, minNoticeHours }` from a form or a request body,
 * each optional, merged over `base` (the coach's stored rules). Refuses rather than clamps — a
 * coach who types 200 minutes of buffer is told the limit, not quietly given 120.
 * @param {unknown} input @param {unknown} [base]
 * @returns {{ ok: true, rules: BookingRules } | { ok: false, field: string, error: string }}
 */
export function validateRules(input, base = DEFAULT_RULES) {
  const src = input && typeof input === 'object' ? input : {};
  const rules = { ...normalizeRules(base) };
  if (src.bufferMin !== undefined) {
    const n = WHOLE(src.bufferMin);
    const { min, max } = RULE_LIMITS.bufferMin;
    if (!(n >= min && n <= max)) return { ok: false, field: 'bufferMin', error: `The buffer has to be a whole number of minutes from ${min} to ${max}.` };
    rules.bufferMin = n;
  }
  if (src.maxPerDay !== undefined) {
    if (src.maxPerDay === null || src.maxPerDay === '') {
      rules.maxPerDay = null;
    } else {
      const n = WHOLE(src.maxPerDay);
      const { min, max } = RULE_LIMITS.maxPerDay;
      if (!(n >= min && n <= max)) return { ok: false, field: 'maxPerDay', error: `The daily limit has to be from ${min} to ${max} sessions, or no limit.` };
      rules.maxPerDay = n;
    }
  }
  if (src.minNoticeHours !== undefined) {
    const n = WHOLE(src.minNoticeHours);
    const { min, max } = RULE_LIMITS.minNoticeHours;
    if (!(n >= min && n <= max)) return { ok: false, field: 'minNoticeHours', error: `Notice has to be a whole number of hours from ${min} to ${max} (two weeks).` };
    rules.minNoticeHours = n;
  }
  return { ok: true, rules };
}

/**
 * A request to block time off, in any of the three shapes the coach's form sends:
 *   { startsAt, endsAt }          two ISO instants WITH an offset
 *   { date, allDay: true }        one whole local day in the coach's zone
 *   { fromDate, toDate }          whole local days, both inclusive
 * plus an optional private `note`. → { ok: true, startsAt, endsAt, note } (epoch ms) or
 * { ok: false, error, detail }.
 *
 * ⚠ WHOLE DAYS ARE THE COACH'S DAYS, so they need the coach's zone, and with none the request
 * is refused (`timezone_required`) rather than read as UTC days — "Oct 12" off in New York read
 * as UTC would open the evening of Oct 11 and close the evening of Oct 12.
 * @param {unknown} input @param {{ zone?: unknown, now?: unknown }} [opts]
 * @returns {{ ok: true, startsAt: number, endsAt: number, note: string | null } | { ok: false, error: string, detail: string }}
 */
export function parseTimeOff(input, { zone, now } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const nowMs = toMs(now);
  let startsAt = NaN, endsAt = NaN, dayCount = 0;
  const wholeDays = src.allDay === true || src.date != null || src.fromDate != null || src.toDate != null;
  if (wholeDays) {
    if (!isZone(zone)) {
      return { ok: false, error: 'timezone_required', detail: 'Time off by the day is kept in your local time, so we need your time zone first. Save your hours on Schedule once, then try again.' };
    }
    const from = src.fromDate ?? src.date;
    const to = src.toDate ?? src.date ?? src.fromDate;
    const a = parseDate(from), b = parseDate(to);
    if (!a || !b) return { ok: false, error: 'invalid_time_off', detail: 'Pick a real date for your time off.' };
    const range = localDayRange(from, to, zone);
    if (!range) return { ok: false, error: 'invalid_time_off', detail: 'Time off has to end after it starts.' };
    ({ startsAt, endsAt } = range);
    dayCount = Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY_MS) + 1;
  } else {
    startsAt = toMs(src.startsAt);
    endsAt = toMs(src.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || typeof src.startsAt === 'number' || typeof src.endsAt === 'number') {
      return { ok: false, error: 'invalid_time_off', detail: 'Time off needs a start and an end, each a date and time with its time zone.' };
    }
    if (!(endsAt > startsAt)) return { ok: false, error: 'invalid_time_off', detail: 'Time off has to end after it starts.' };
  }
  // ⚠ COUNTED IN DAYS FOR WHOLE DAYS, IN HOURS FOR INSTANTS. Ninety local days across a DST
  // change are 90 days ± an hour of real time, so a real-time test would refuse a 90-day leave
  // that crosses November and accept one that crosses March.
  if (wholeDays ? dayCount > TIME_OFF_MAX_DAYS : endsAt - startsAt > TIME_OFF_MAX_DAYS * DAY_MS) {
    return { ok: false, error: 'invalid_time_off', detail: `One block of time off can be at most ${TIME_OFF_MAX_DAYS} days. Add a longer break as two.` };
  }
  if (Number.isFinite(nowMs) && endsAt <= nowMs) {
    return { ok: false, error: 'invalid_time_off', detail: 'That time off has already ended.' };
  }
  let note = null;
  if (src.note != null) {
    if (typeof src.note !== 'string') return { ok: false, error: 'invalid_time_off', detail: 'The note has to be text.' };
    const n = src.note.trim();
    if (n.length > TIME_OFF_NOTE_MAX) return { ok: false, error: 'invalid_time_off', detail: `Keep the note under ${TIME_OFF_NOTE_MAX} characters.` };
    note = n || null;
  }
  return { ok: true, startsAt, endsAt, note };
}

// ── Open hours ──────────────────────────────────────────────────────────────────────────

/**
 * The coach's open hours between two instants, as merged [start, end) epoch-ms windows.
 * `availability` is provider_availability rows: { weekday (0=Sun), start_minute, duration_min },
 * each a WALL-CLOCK block in `zone` that repeats every week. Empty for an unusable zone.
 *
 * ⚠ ADJACENT BLOCKS MERGE, SO A SESSION MAY SPAN TWO OF THEM. The editor stores contiguous
 * cells as one block, but two saves, two editors or a block that runs to midnight next to one
 * that starts at it all leave touching rows — 9–10 and 10–11 are one open morning, and a
 * 9:30–10:30 session inside it must not be refused for crossing a seam nobody can see.
 */
export function openWindows(availability, zone, fromMs, toMs_) {
  if (!isZone(zone)) return [];
  const a = toMs(fromMs), b = toMs(toMs_);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || b - a > 400 * DAY_MS) return [];
  const byDay = new Map();
  for (const row of Array.isArray(availability) ? availability : []) {
    const wd = num(row && row.weekday);
    const start = num(row && row.start_minute);
    const dur = num(row && row.duration_min);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) continue;
    if (!Number.isInteger(start) || start < 0 || start > 1439) continue;
    // ⚠ A ROW WITH NO USABLE LENGTH OPENS NOTHING. The column is NOT NULL, so this is a
    // hand-written or corrupt row; guessing an hour would open time the coach never declared.
    if (!Number.isFinite(dur) || dur <= 0) continue;
    const list = byDay.get(wd) || [];
    list.push([start, start + Math.min(Math.round(dur), 1440)]);
    byDay.set(wd, list);
  }
  if (!byDay.size) return [];
  // A block starts on its own date and ends at most a day later (start ≤ 23:59, length ≤ 24 h),
  // so blocks touching [a, b) start on a date from two days before a's to b's own.
  const first = partsAt(a, zone), last = partsAt(b, zone);
  if (!first || !last) return [];
  const base = Date.UTC(first.y, first.mo - 1, first.d) - 2 * DAY_MS;
  const end = Date.UTC(last.y, last.mo - 1, last.d);
  const raw = [];
  // ⚠ THE CIVIL DATES ARE STEPPED IN UTC ON PURPOSE: a civil date has no offset, so stepping it
  // with Date.UTC cannot be bitten by the DST it is being used to resolve — and the weekday is
  // read off the CIVIL date, which is the coach's Monday, not UTC's.
  for (let c = base; c <= end; c += DAY_MS) {
    const civil = new Date(c);
    const blocks = byDay.get(civil.getUTCDay());
    if (!blocks) continue;
    const y = civil.getUTCFullYear(), mo = civil.getUTCMonth() + 1, d = civil.getUTCDate();
    for (const [s, e] of blocks) {
      const ws = wallInstant(y, mo, d, s, zone);
      const we = wallInstant(y, mo, d, e, zone);
      if (Number.isFinite(ws) && Number.isFinite(we) && we > ws) raw.push([ws, we]);
    }
  }
  raw.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged = [];
  for (const [s, e] of raw) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev.end) { if (e > prev.end) prev.end = e; }
    else merged.push({ start: s, end: e });
  }
  return merged.filter((w) => w.end > a && w.start < b);
}

// ── Busy time ───────────────────────────────────────────────────────────────────────────

const ACTIVE = new Set(['requested', 'confirmed']);

// One reader for every shape a busy row arrives in: a `sessions` row (scheduled_at +
// duration_min), a provider_busy_blocks row (starts_at + ends_at + kind) or a camelCase copy.
function readBusy(ctx) {
  const timeOff = [];
  const sessions = [];
  const ignore = ctx.ignoreId == null || ctx.ignoreId === '' ? null : String(ctx.ignoreId);
  const pushOff = (r) => {
    const s = toMs(r.starts_at ?? r.startsAt ?? r.start);
    const e = toMs(r.ends_at ?? r.endsAt ?? r.end);
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) timeOff.push({ start: s, end: e });
  };
  for (const r of Array.isArray(ctx.timeOff) ? ctx.timeOff : []) if (r && typeof r === 'object') pushOff(r);
  for (const r of Array.isArray(ctx.busy) ? ctx.busy : []) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'time_off') { pushOff(r); continue; }
    // A cancelled, declined or completed session holds no time.
    if (r.status != null && !ACTIVE.has(String(r.status))) continue;
    // ⚠ THE SESSION BEING MOVED IS NOT ITS OWN CONFLICT. A reschedule that checked against its
    // own current slot would refuse every move of less than its own length — and count itself
    // toward the day's limit.
    if (ignore != null && r.id != null && String(r.id) === ignore) continue;
    const s = toMs(r.scheduled_at ?? r.scheduledAt ?? r.starts_at ?? r.startsAt ?? r.start);
    if (!Number.isFinite(s)) continue;
    let e = toMs(r.ends_at ?? r.endsAt ?? r.end);
    if (!Number.isFinite(e)) {
      const dur = num(r.duration_min ?? r.durationMin);
      // ⚠ AN UNKNOWN LENGTH BLOCKS AN HOUR, NOT NOTHING. The column is NOT NULL (default 15),
      // so this is a caller that forgot to select it; reading it as zero minutes would turn a
      // real booking into free time, which is the one direction this module must never err in.
      e = s + (Number.isFinite(dur) && dur > 0 ? dur : 60) * MIN_MS;
    }
    if (e > s) sessions.push({ start: s, end: e });
  }
  timeOff.sort((x, y) => x.start - y.start);
  sessions.sort((x, y) => x.start - y.start);
  return { timeOff, sessions };
}

// ── The check ───────────────────────────────────────────────────────────────────────────

function prepare(ctx, fromMs, toMs_) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const zone = c.zone;
  const zoneOk = isZone(zone);
  const { timeOff, sessions } = readBusy(c);
  const avail = Array.isArray(c.availability) ? c.availability : [];
  const dayCounts = new Map();
  if (zoneOk) {
    for (const s of sessions) {
      const k = localDate(s.start, zone);
      if (k) dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }
  }
  return {
    nowMs: toMs(c.now),
    zone,
    zoneOk,
    windows: zoneOk ? openWindows(avail, zone, fromMs, toMs_) : [],
    hasHours: avail.length > 0,
    timeOff,
    sessions,
    dayCounts,
    rules: normalizeRules(c.rules),
    member: c.audience === 'member',
    skip: new Set(Array.isArray(c.skip) ? c.skip : []),
  };
}

function evaluate(s, e, P, firstOnly) {
  const out = [];
  const z = P.zone;
  // `add` returns true when the caller wants only the first problem, which ends the walk.
  const add = (reason, coach, member) => { out.push({ reason, message: P.member ? member : coach }); return firstOnly; };
  const on = (reason) => !P.skip.has(reason);

  if (on('past') && Number.isFinite(P.nowMs) && s <= P.nowMs) {
    if (add('past', 'That time has already passed.', 'That time has already passed.')) return out;
  }
  const notice = P.rules.minNoticeHours;
  if (on('notice') && notice > 0 && Number.isFinite(P.nowMs) && s > P.nowMs && s < P.nowMs + notice * HOUR_MS) {
    if (add('notice',
      `That's less than your ${noticeText(notice)} minimum notice.`,
      memberNotice(notice))) return out;
  }
  if (on('closed')) {
    let hit = false;
    if (!P.zoneOk) {
      hit = add('closed',
        'Your open hours need a time zone before anyone can book them. Save your hours on Schedule once to set it.',
        "This coach's calendar isn't ready for bookings yet.");
    } else if (!P.hasHours) {
      hit = add('closed', "You haven't opened any hours yet.", "This coach hasn't opened any hours yet.");
    } else {
      const w = P.windows.find((x) => x.start <= s && s < x.end);
      if (!w) {
        hit = add('closed', "That's outside your open hours.", "That's outside this coach's open hours.");
      } else if (e > w.end) {
        // ⚠ THE WHOLE SESSION, NOT ITS START. bookingSlots.js offered any start inside a block,
        // so a 60-minute session could begin at 11:45 in hours that close at 12:00.
        hit = add('closed',
          `That runs past the end of your open hours at ${timeLabel(w.end, z)}.`,
          "That runs past the end of this coach's open hours.");
      }
    }
    if (hit) return out;
  }
  if (on('time_off')) {
    // ⚠ ANY OVERLAP, NOT CONTAINMENT. A session that starts before a vacation and runs into it
    // is still a session during the vacation.
    const off = P.timeOff.find((x) => x.start < e && x.end > s);
    if (off && add('time_off',
      `That's during your time off, which runs until ${dayLabel(off.end, z)} at ${timeLabel(off.end, z)}.`,
      MEMBER_SAYS.time_off)) return out;
  }
  if (on('overlap')) {
    const clash = P.sessions.find((x) => x.start < e && x.end > s);
    if (clash && add('overlap',
      `That overlaps your ${timeLabel(clash.start, z)} session.`,
      'That time is already booked.')) return out;
  }
  const buf = P.rules.bufferMin;
  if (on('buffer') && buf > 0) {
    const gap = buf * MIN_MS;
    // The nearest neighbour on each side that does not overlap (an overlap is its own reason).
    let before = null, after = null;
    for (const x of P.sessions) {
      if (x.end <= s && s - x.end < gap && (!before || x.end > before.end)) before = x;
      if (x.start >= e && x.start - e < gap && (!after || x.start < after.start)) after = x;
    }
    if (before && add('buffer',
      `That's inside your ${buf}-minute buffer after the ${timeLabel(before.start, z)} session.`,
      MEMBER_SAYS.buffer)) return out;
    if (after && add('buffer',
      `That's inside your ${buf}-minute buffer before the ${timeLabel(after.start, z)} session.`,
      MEMBER_SAYS.buffer)) return out;
  }
  const max = P.rules.maxPerDay;
  if (on('daily_limit') && max != null && P.zoneOk) {
    // ⚠ THE COACH'S LOCAL DATE, NOT UTC'S. A New York session at 11:30 PM is 03:30Z the next
    // day; counting by UTC date would charge it to tomorrow and let a seventh one in tonight.
    const key = localDate(s, z);
    const count = (key && P.dayCounts.get(key)) || 0;
    if (count >= max) {
      const n = `${count} session${count === 1 ? '' : 's'}`;
      if (add('daily_limit',
        `You already have ${n} on ${dayLabel(s, z)}, your daily limit.`,
        MEMBER_SAYS.daily_limit)) return out;
    }
  }
  return out;
}

function slotBounds(slot) {
  const s = toMs(slot && slot.start);
  const dur = num(slot && slot.durationMin);
  if (!Number.isFinite(s) || !Number.isFinite(dur) || dur <= 0 || dur > 1440) return null;
  return [s, s + Math.round(dur) * MIN_MS];
}

const INVALID = { reason: 'invalid', message: "That isn't a valid time." };

/**
 * Every rule `{ start, durationMin }` breaks, in check order — for a coach-facing warning that
 * names all of them ("outside your hours, and inside your buffer"). `[]` means bookable.
 * Context as for `checkSlot`.
 */
export function slotProblems(slot, ctx) {
  const b = slotBounds(slot);
  if (!b) return [{ ...INVALID }];
  return evaluate(b[0], b[1], prepare(ctx, b[0] - 2 * DAY_MS, b[1] + 2 * DAY_MS), false);
}

/**
 * Whether one session may be booked at `start` for `durationMin` minutes.
 *
 * ctx: {
 *   now            Date | ms | ISO — required for `past` and `notice`
 *   zone           the coach's IANA zone (trainers/nutritionists.timezone); none → `closed`
 *   availability   provider_availability rows
 *   timeOff        provider_time_off rows ({ starts_at, ends_at })
 *   busy           sessions rows, or provider_busy_blocks rows (kind 'time_off' rows count as
 *                  time off, so one RPC answer can be passed straight in)
 *   rules          provider_booking_rules row or { bufferMin, maxPerDay, minNoticeHours }
 *   ignoreId       the session being rescheduled — neither a conflict nor counted for the day
 *   audience       'coach' (default: "your open hours") or 'member' ("this coach's")
 *   skip           reasons not to check, e.g. ['notice'] for a coach moving their own booking
 * }
 * → { ok: true } | { ok: false, reason, message } — `reason` is one of REASONS.
 * @param {{ start: unknown, durationMin: unknown }} slot @param {Record<string, unknown>} ctx
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
export function checkSlot(slot, ctx) {
  const b = slotBounds(slot);
  if (!b) return { ok: false, ...INVALID };
  const [p] = evaluate(b[0], b[1], prepare(ctx, b[0] - 2 * DAY_MS, b[1] + 2 * DAY_MS), true);
  return p ? { ok: false, reason: p.reason, message: p.message } : { ok: true };
}

/**
 * The bookable starts between `from` and `to`, as ISO strings, soonest first — for a booking
 * page. Candidates step through each open window from its own start every `step` minutes
 * (default 15), and each goes through the same evaluation `checkSlot` runs, so a time this
 * offers is a time the route will accept. Bounded: at most MAX_WINDOW_DAYS of window (a longer
 * one is cut short) and at most `limit` starts (default 500, at most MAX_SLOTS).
 *
 * ⚠ THE BUSY READ HAS TO COVER THE WHOLE LOCAL DAYS, not just [from, to): a daily limit counts
 * every session on the slot's date, including ones before `from`. Read busy blocks from a day
 * before `from` to a day after `to`.
 */
export function openSlots(range, ctx) {
  const r = range && typeof range === 'object' ? range : {};
  const from = toMs(r.from);
  let to = toMs(r.to);
  const dur = num(r.durationMin);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return [];
  if (!Number.isInteger(dur) || dur <= 0 || dur > 1440) return [];
  to = Math.min(to, from + MAX_WINDOW_DAYS * DAY_MS);
  const stepMin = Number.isInteger(num(r.step)) ? Math.min(240, Math.max(5, num(r.step))) : 15;
  const lim = Number.isInteger(num(r.limit)) ? Math.min(MAX_SLOTS, Math.max(1, num(r.limit))) : 500;
  const P = prepare(ctx, from - 2 * DAY_MS, to + 2 * DAY_MS);
  if (!P.zoneOk) return [];
  const out = [];
  const seen = new Set();
  for (const w of P.windows) {
    for (let s = w.start; s + dur * MIN_MS <= w.end; s += stepMin * MIN_MS) {
      if (s < from) continue;
      if (s >= to) break;
      if (seen.has(s)) continue;
      if (evaluate(s, s + dur * MIN_MS, P, true).length) continue;
      seen.add(s);
      out.push(new Date(s).toISOString());
      if (out.length >= lim) return out;
    }
  }
  return out;
}
