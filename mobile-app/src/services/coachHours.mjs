// A coach's weekly hours as the app's "Your hours" page edits them — pure, so it is tested
// without a phone (tests/coach-hours.test.mjs).
//
// The stored shape is provider_availability's: rows of { weekday (0 = Sun … 6 = Sat, getDay),
// start_minute, duration_min }, in the coach's own wall clock. The website's Schedule page
// (public/newdesign/dashSchedule.jsx) writes the same rows from a half-hour grid; this page edits
// them as blocks per day ("9:00 to 12:00, 14:00 to 18:00"), which is how a phone sets times.
// Both go through POST /api/my-availability, so either editor reads what the other saved.
//
// ⚠ A DAY'S BLOCKS ARE MERGED BEFORE THEY ARE STORED. Two blocks that touch or overlap are one
// span of open time; stored apart, the projection (coachAvailability.mjs) would offer the hour
// where they meet twice and the route would keep both rows.

export const BS_HOURS_DAYS = Object.freeze([[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']]);
export const BS_HOURS_STEP = 15;      // minutes a time moves by
export const BS_HOURS_MIN_BLOCK = 15; // the route stores nothing shorter (duration_min ≥ 15)
const DAY_MIN = 1440;

const isMinute = (m) => Number.isInteger(m) && m >= 0 && m <= DAY_MIN;

/** Seven empty days, keyed by getDay index. */
export function bsHoursEmpty() {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/** Stored rows → { weekday: [[start, end], …] }, each day sorted and merged. Junk rows drop. */
export function bsHoursFromRows(rows) {
  const days = bsHoursEmpty();
  for (const r of Array.isArray(rows) ? rows : []) {
    const wd = Number(r && r.weekday);
    const start = Number(r && r.start_minute);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6 || !Number.isInteger(start) || start < 0 || start > 1439) continue;
    const dur = Number(r.duration_min) > 0 ? Math.round(Number(r.duration_min)) : 60;
    days[wd].push([start, Math.min(DAY_MIN, start + dur)]);
  }
  for (let wd = 0; wd < 7; wd++) days[wd] = bsHoursMerge(days[wd]);
  return days;
}

/** One day's blocks sorted, with touching or overlapping ones joined. Invalid blocks drop. */
export function bsHoursMerge(blocks) {
  const ok = (Array.isArray(blocks) ? blocks : [])
    .filter((b) => Array.isArray(b) && isMinute(b[0]) && isMinute(b[1]) && b[1] > b[0])
    .map((b) => [b[0], b[1]])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const b of ok) {
    const last = out[out.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else out.push(b);
  }
  return out;
}

/**
 * What is wrong with a day's blocks as the coach typed them, before merging: one entry per
 * block, `null` when it is fine. 'order' = ends at or before it starts; 'short' = under the
 * shortest block the route stores; 'overlap' = runs into an earlier block of the same day.
 */
export function bsHoursProblems(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  return list.map((b, i) => {
    if (!Array.isArray(b) || !isMinute(b[0]) || !isMinute(b[1])) return 'order';
    if (b[1] <= b[0]) return 'order';
    if (b[1] - b[0] < BS_HOURS_MIN_BLOCK) return 'short';
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const o = list[j];
      if (!Array.isArray(o) || !(o[1] > o[0])) continue;
      // The later of two overlapping blocks carries the problem, so it is reported once.
      const later = b[0] > o[0] || (b[0] === o[0] && i > j);
      if (later && b[0] < o[1]) return 'overlap';
    }
    return null;
  });
}

/** True when no day has a problem. */
export function bsHoursValid(days) {
  for (let wd = 0; wd < 7; wd++) if (bsHoursProblems(days && days[wd]).some(Boolean)) return false;
  return true;
}

/** The days → the rows POST /api/my-availability stores, merged per day, Monday first. */
export function bsHoursToRows(days) {
  const out = [];
  for (const [wd] of BS_HOURS_DAYS) {
    for (const [s, e] of bsHoursMerge(days && days[wd])) {
      if (e - s < BS_HOURS_MIN_BLOCK) continue;
      out.push({ weekday: wd, start_minute: s, duration_min: e - s });
    }
  }
  return out;
}

/** Open minutes in a week. */
export function bsHoursTotal(days) {
  let n = 0;
  for (let wd = 0; wd < 7; wd++) for (const [s, e] of bsHoursMerge(days && days[wd])) n += e - s;
  return n;
}

/** Whether two weeks store the same rows. */
export function bsHoursSame(a, b) {
  return JSON.stringify(bsHoursToRows(a)) === JSON.stringify(bsHoursToRows(b));
}

/** The days a copy goes to: 'weekdays', 'weekend', 'all', or one weekday; never the source. */
export function bsHoursCopyTargets(to, from) {
  const days = to === 'weekdays' ? [1, 2, 3, 4, 5] : to === 'weekend' ? [6, 0] : to === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [Number(to)];
  return days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6 && d !== Number(from));
}

/** A copy of the week with `from`'s blocks put on each target day (replacing what was there). */
export function bsHoursCopy(days, from, to) {
  const next = bsHoursClone(days);
  const src = (days && days[from]) || [];
  for (const d of bsHoursCopyTargets(to, from)) next[d] = src.map((b) => [b[0], b[1]]);
  return next;
}

export function bsHoursClone(days) {
  const next = bsHoursEmpty();
  for (let wd = 0; wd < 7; wd++) next[wd] = ((days && days[wd]) || []).map((b) => [b[0], b[1]]);
  return next;
}

/**
 * The block "+ Add hours" puts on a day: 9 to 5 on an empty day; otherwise two hours starting an
 * hour after the day's last block ends, kept inside the day. null when the day has no room left.
 */
export function bsHoursNextBlock(blocks) {
  const merged = bsHoursMerge(blocks);
  if (!merged.length) return [9 * 60, 17 * 60];
  const lastEnd = merged[merged.length - 1][1];
  const start = Math.min(lastEnd + 60, DAY_MIN - 60);
  if (start < lastEnd) return lastEnd <= DAY_MIN - BS_HOURS_MIN_BLOCK ? [lastEnd, DAY_MIN] : null;
  return [start, Math.min(DAY_MIN, start + 120)];
}

/** A minute of the day → "HH:MM" for a time input. The day's end (1440) is "23:59". */
export function bsHoursToInput(m) {
  const v = Math.max(0, Math.min(DAY_MIN, Number(m) || 0));
  if (v >= DAY_MIN) return '23:59';
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** A time input's "HH:MM" → a minute of the day; "23:59" (the input's last value) is the day's end. */
export function bsHoursFromInput(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  if (h === 23 && mi === 59) return DAY_MIN;
  return h * 60 + mi;
}

/** "9:00 AM" style label for a minute of the day, in the reader's locale; the day's end reads as midnight. */
export function bsHoursLabel(m, locale) {
  const v = Math.max(0, Math.min(DAY_MIN, Number(m) || 0)) % DAY_MIN;
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(v / 60), v % 60));
  try { return d.toLocaleTimeString(locale || undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }); } catch (e) {
    return bsHoursToInput(v);
  }
}

// ── The week's grid on Your hours: its span, its hour scale, and each day's ranges in words ──────
// Owner, 2026-11-04, of the lit grid: "make it so you can tell more specifically what times certain
// bars sit on". The grid spans the coach's own hours, an hour scale labels them closely, and each
// day says its ranges in words. All of it follows the reader's clock (12- or 24-hour) through Intl.

/** The shortest span the grid shows, so one short block doesn't stretch into two giant cells. */
export const BS_HOURS_SPAN_MIN = 4 * 60;

/**
 * The span the week's grid covers: the earliest start to the latest end, rounded out to whole
 * hours and at least BS_HOURS_SPAN_MIN long. An empty week shows 9 to 5, the hours ＋ Add hours puts
 * on a day.
 */
export function bsHoursSpan(days) {
  let lo = Infinity, hi = -Infinity;
  for (let wd = 0; wd < 7; wd++) {
    for (const [s, e] of bsHoursMerge(days && days[wd])) { if (s < lo) lo = s; if (e > hi) hi = e; }
  }
  if (!Number.isFinite(lo)) return [9 * 60, 17 * 60];
  lo = Math.floor(lo / 60) * 60;
  hi = Math.ceil(hi / 60) * 60;
  if (hi - lo < BS_HOURS_SPAN_MIN) {
    hi = Math.min(DAY_MIN, lo + BS_HOURS_SPAN_MIN);
    lo = Math.max(0, hi - BS_HOURS_SPAN_MIN);
  }
  return [lo, hi];
}

// The parts of a minute of the day as the reader's clock writes it.
function clockParts(v, locale, withMinute) {
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(v / 60), v % 60));
  const opts = withMinute ? { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' } : { hour: 'numeric', timeZone: 'UTC' };
  try { return new Intl.DateTimeFormat(locale || undefined, opts).formatToParts(d); } catch (e) { return null; }
}
const partOf = (parts, type) => { const p = parts && parts.find((x) => x.type === type); return p ? p.value : ''; };

/**
 * An hour mark on the scale: the hour as the reader's clock says it ("9", "14") and its day period
 * ("AM", or '' on a 24-hour clock). The day's end is 12 AM on a 12-hour clock and 24 on a 24-hour one.
 */
export function bsHoursMark(m, locale) {
  const v = Math.max(0, Math.min(DAY_MIN, Math.round(Number(m) || 0)));
  const parts = clockParts(v % DAY_MIN, locale, false);
  const period = partOf(parts, 'dayPeriod');
  let hour = (partOf(parts, 'hour') || String(Math.floor((v % DAY_MIN) / 60))).replace(/^0(?=\d)/, '');
  if (v >= DAY_MIN && !period) hour = '24';
  return { hour, period };
}

/**
 * A minute of the day as short as the reader's clock writes it: "9", "9:30", "14", "14.30" (the
 * locale's own separator). No AM/PM: the hour scale over the grid carries it. The day's end is "12" on
 * a 12-hour clock and "24" on a 24-hour one.
 */
export function bsHoursShort(m, locale) {
  const v = Math.max(0, Math.min(DAY_MIN, Math.round(Number(m) || 0)));
  const { hour } = bsHoursMark(v - (v % 60), locale);
  if (v % 60 === 0) return hour;
  const parts = clockParts(v, locale, true);
  const i = parts ? parts.findIndex((p) => p.type === 'hour') : -1;
  const sep = i >= 0 && parts[i + 1] && parts[i + 1].type === 'literal' ? parts[i + 1].value : ':';
  return `${hour}${sep}${partOf(parts, 'minute') || String(v % 60).padStart(2, '0')}`;
}

/** A day's open ranges in words, merged as they are stored: "9–12 · 2–6". '' for a closed day. */
export function bsHoursRangeWords(blocks, locale) {
  return bsHoursMerge(blocks).map(([s, e]) => `${bsHoursShort(s, locale)}–${bsHoursShort(e, locale)}`).join(' · ');
}

/**
 * The hour scale over the grid: a tick at every hour of the span, and a label on every hour when the
 * labels fit `width` px, else on every 2nd (3rd, 4th, 6th, 12th) hour, taken on whole multiples so
 * noon stays among them. On a 12-hour clock a label carries its AM/PM only where that changes
 * ("9 AM", "10", "11", "12 PM", "1"). `charPx` is the label face's advance per character, `gap` the
 * least space between two labels.
 */
export function bsHoursScale(span, { width = 260, locale, charPx = 5.5, gap = 4 } = {}) {
  const [lo, hi] = span;
  const ticks = [];
  for (let m = lo; m <= hi; m += 60) ticks.push(m);
  const marks = new Map(ticks.map((m) => [m, bsHoursMark(m, locale)]));
  const x = (m) => ((m - lo) / ((hi - lo) || 60)) * width;
  const steps = [1, 2, 3, 4, 6, 12];
  for (const step of steps) {
    let last = null;
    const labels = ticks.filter((m) => (m / 60) % step === 0).map((m) => {
      const { hour, period } = marks.get(m);
      const text = period && period !== last ? `${hour} ${period}` : hour;
      last = period;
      return { at: m, text };
    });
    const fits = labels.every((l, i) => i === 0
      || x(l.at) - x(labels[i - 1].at) >= ((l.text.length + labels[i - 1].text.length) * charPx) / 2 + gap);
    if (fits || step === steps[steps.length - 1]) return { step, ticks, labels };
  }
  return { step: 1, ticks, labels: [] };
}
