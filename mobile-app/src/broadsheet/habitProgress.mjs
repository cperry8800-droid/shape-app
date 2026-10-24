// ─── HABIT PROGRESS: THE WEEK AND THE MONTH ─────────────────────────────────────────────────────
// The habits page's Progress card (owner, 2026-10-24: "members to be able to see weekly chart and
// also monthly"). Pure, so tests drive it with fixed dates. A day is a local 'YYYY-MM-DD' string,
// the same as a habit's history.
//
// ⚠ A DAY THE APP KNOWS NOTHING ABOUT IS NOT A MISS. The habits route sends 90 days of history,
// and a habit has a day it was made: a day before either is 'none' and counts in no total, so a
// habit added on Thursday does not open the week three days down.

const pad = (n) => String(n).padStart(2, '0');
const parts = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return { y, m, d }; };
const utc = (ymd) => { const { y, m, d } = parts(ymd); return new Date(Date.UTC(y, m - 1, d)); };
const fromUtc = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export function hpLocalYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function hpAddDays(ymd, n) { const dt = utc(ymd); dt.setUTCDate(dt.getUTCDate() + n); return fromUtc(dt); }
export function hpDow(ymd) { return utc(ymd).getUTCDay(); }
export function hpWeekStart(ymd, firstDay = 0) { return hpAddDays(ymd, -((hpDow(ymd) - firstDay + 7) % 7)); }
export function hpMonthStart(ymd) { const { y, m } = parts(ymd); return `${y}-${pad(m)}-01`; }
export function hpAddMonths(ymd, n) { const { y, m } = parts(ymd); return fromUtc(new Date(Date.UTC(y, m - 1 + n, 1))); }
export function hpDaysInMonth(ymd) { const { y, m } = parts(ymd); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// The habits route reads completions from 90 days back (src/app/api/client/habits/route.ts). The
// first day held is one later than that, so a day the route's UTC cut-off left out is never read
// as a miss in a time zone ahead of UTC.
export const HP_HISTORY_DAYS = 90;
export function hpWindowStart(today) { return hpAddDays(today, -(HP_HISTORY_DAYS - 1)); }

// One habit on one day: 'kept' (a to-don't: ticked as stayed clean), 'open' (today, not ticked
// yet), 'missed', 'future', or 'none' (before the habit existed, after it was deleted, or before
// the history held). A deleted habit (`archivedOn`, its local day) keeps the days it was kept,
// the day it went included, and counts no miss from that day on.
export function hpStatus(habit, day, { today, windowStart }) {
  if (day > today) return 'future';
  if (habit.archivedOn && day > habit.archivedOn) return 'none';
  if ((habit.history || []).includes(day)) return 'kept';
  if (habit.archivedOn && day === habit.archivedOn) return 'none';
  if (day === today) return 'open';
  if ((habit.createdOn && day < habit.createdOn) || (windowStart && day < windowStart)) return 'none';
  return 'missed';
}

// A day's shade on the calendar: 0 none kept, 1 up to half, 2 more than half, 3 all of them.
export function hpLevel(kept, active) {
  if (!active) return null;
  if (kept === 0) return 0;
  if (kept >= active) return 3;
  return kept / active <= 0.5 ? 1 : 2;
}

const byType = (list) => [...list.filter((h) => h.type !== 'avoid'), ...list.filter((h) => h.type === 'avoid')];

function dayOf(habits, day, opts) {
  const kept = [], open = [], missed = [];
  for (const h of habits) {
    const s = hpStatus(h, day, opts);
    if (s === 'kept') kept.push(h); else if (s === 'open') open.push(h); else if (s === 'missed') missed.push(h);
  }
  // To-dos first, then to-don'ts, so a stacked column reads the same way every day.
  return { day, kept: byType(kept), open: byType(open), missed: byType(missed), active: kept.length + open.length + missed.length, future: day > opts.today, isToday: day === opts.today };
}

function tally(cols) {
  let kept = 0, slots = 0;
  for (const c of cols) { kept += c.kept.length; slots += c.active; }
  return { kept, slots, pct: slots ? Math.round((kept / slots) * 100) : null };
}

// Each habit's row for the period. A deleted habit has one only for a period it was part of.
function perHabit(habits, days, opts) {
  return habits.map((h) => {
    const cells = days.map((d) => hpStatus(h, d, opts));
    let kept = 0, of = 0, run = 0, best = 0;
    for (const s of cells) {
      if (s === 'kept') { kept++; of++; run++; best = Math.max(best, run); } else { if (s === 'missed' || s === 'open') of++; if (s !== 'open') run = 0; }
    }
    return { habit: h, cells, kept, of, pct: of ? Math.round((kept / of) * 100) : null, best };
  }).filter((r) => !r.habit.archivedOn || r.of > 0);
}

// The week holding `anchor`, against the week before it.
export function hpWeek(habits, { anchor, today, firstDay = 0, windowStart = null }) {
  const opts = { today, windowStart };
  const start = hpWeekStart(anchor, firstDay);
  const days = Array.from({ length: 7 }, (_, i) => hpAddDays(start, i));
  const cols = days.map((d) => dayOf(habits, d, opts));
  const prevCols = days.map((d) => dayOf(habits, hpAddDays(d, -7), opts));
  const prev = tally(prevCols);
  const prevDays = prevCols.filter((c) => c.active > 0).length;
  const most = Math.max(0, ...cols.map((c) => c.active));
  return {
    start, end: days[6], days: cols, ...tally(cols),
    prev: prev.slots ? { ...prev, avgPerDay: prev.kept / prevDays } : null,
    scale: Math.max(1, most || habits.filter((h) => !h.archivedOn).length),
    perHabit: perHabit(habits, days, opts),
    isCurrent: days.includes(today),
  };
}

// The calendar month holding `anchor`. `lead` is the blank cells before the 1st.
export function hpMonth(habits, { anchor, today, firstDay = 0, windowStart = null }) {
  const opts = { today, windowStart };
  const start = hpMonthStart(anchor);
  const days = Array.from({ length: hpDaysInMonth(start) }, (_, i) => hpAddDays(start, i));
  const cells = days.map((d, i) => { const c = dayOf(habits, d, opts); return { ...c, date: i + 1, level: hpLevel(c.kept.length, c.active) }; });
  const rows = perHabit(habits, days, opts);
  let bestRun = null;
  for (const r of rows) if (r.best > 0 && (!bestRun || r.best > bestRun.days)) bestRun = { habit: r.habit, days: r.best };
  return {
    start, lead: (hpDow(start) - firstDay + 7) % 7, cells, ...tally(cells),
    perHabit: rows, bestRun, isCurrent: start === hpMonthStart(today),
  };
}

// Paging. Back stops once the period before holds no day of the history the app has; forward
// stops at the period holding today.
export function hpPeriodStart(mode, anchor, firstDay = 0) {
  return mode === 'month' ? hpMonthStart(anchor) : hpWeekStart(anchor, firstDay);
}
export function hpStep(mode, anchor, n, firstDay = 0) {
  return mode === 'month' ? hpAddMonths(anchor, n) : hpAddDays(hpWeekStart(anchor, firstDay), 7 * n);
}
export function hpCanGoBack(mode, anchor, { firstDay = 0, windowStart }) {
  return hpPeriodStart(mode, anchor, firstDay) > windowStart;
}
export function hpCanGoForward(mode, anchor, { firstDay = 0, today }) {
  return hpStep(mode, anchor, 1, firstDay) <= today;
}
