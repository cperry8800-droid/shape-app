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
