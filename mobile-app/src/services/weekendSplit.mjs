// Weekday-vs-weekend adherence split — the single source of truth for the member
// Weekends card and the coach roster/plate. PURE + TIMEZONE-FREE by contract:
// callers pass pre-bucketed weekly counts (client bucket builder for self, the
// get_roster_weekend_split SQL RPC for coaches). Mirrored verbatim in
// src/lib/weekendSplit.ts. Unit-tested in tests/weekend-split.test.mjs.

export const MIN_WEEKENDS = 3;            // weekends of data before leaving 'insufficient'
export const FLAG_GAP_PP = 15;            // practical floor for a flag (tunable)
export const MIN_DIM_DAYS = { nutrition: 12, habits: 12 }; // weekend-side denominator floor
export const SE_Z = 1.65;                 // one-sided ~95%
export const CONSISTENCY = 0.60;          // gap must be positive in ≥60% of observed weeks
export const NUTRITION_PROTEIN_FLOOR_G = 10; // a "meaningful" food log (used by the bucket builder)
export const STATUS = { OK: 'ok', BUILDING: 'building', INSUFFICIENT: 'insufficient' };

const sum = (arr, f) => arr.reduce((a, b) => a + f(b), 0);

function dimResult(buckets, minDays) {
  const wdDen = sum(buckets, (b) => b.weekdayDen);
  const weDen = sum(buckets, (b) => b.weekendDen);
  if (!(weDen >= minDays && wdDen > 0)) return null; // absent — never rendered 0%
  const wdNum = sum(buckets, (b) => b.weekdayNum);
  const weNum = sum(buckets, (b) => b.weekendNum);
  const pWk = wdNum / wdDen;
  const pWe = weNum / weDen;
  const gapPp = (pWk - pWe) * 100;
  const se = Math.sqrt(pWk * (1 - pWk) / wdDen + pWe * (1 - pWe) / weDen) * 100;
  // per-week consistency: only weeks with data on BOTH sides count
  const weeks = buckets.filter((b) => b.weekdayDen > 0 && b.weekendDen > 0);
  const weeksObserved = weeks.length;
  const positive = weeks.filter((b) => (b.weekdayNum / b.weekdayDen) - (b.weekendNum / b.weekendDen) > 0).length;
  const weekPositiveShare = weeksObserved ? positive / weeksObserved : 0;
  const lowerCi = gapPp - SE_Z * se;
  const flagged = gapPp >= FLAG_GAP_PP && gapPp >= SE_Z * se && weeksObserved > 0 && weekPositiveShare >= CONSISTENCY;
  return {
    present: true,
    weekdayRate: pWk, weekendRate: pWe, gapPp, se, lowerCi,
    flagged, weeksObserved, weekPositiveShare,
    nWeekdayDays: wdDen, nWeekendDays: weDen,
  };
}

function compositeOf(dims) {
  const present = dims.filter(Boolean);
  if (!present.length) return null;
  // inverse-variance weighted blend of the gaps (display only, never flags)
  let wsum = 0, gsum = 0;
  for (const d of present) {
    const w = d.se > 0 ? 1 / (d.se * d.se) : 1;
    wsum += w; gsum += w * d.gapPp;
  }
  return { present: true, gapPp: wsum ? gsum / wsum : 0 };
}

export function computeWeekendSplit(input, options = {}) {
  const minDays = { ...MIN_DIM_DAYS, ...(options.minDimDays || {}) };
  const nutrition = dimResult(input.nutrition || [], minDays.nutrition);
  const habits = dimResult(input.habits || [], minDays.habits);
  const training = null; // v1: no scheduled_date source

  // distinct weeks with any weekend data
  const weekSet = new Set();
  for (const b of [...(input.nutrition || []), ...(input.habits || [])]) {
    if (b.weekendDen > 0) weekSet.add(b.weekStart);
  }
  const weekends = weekSet.size;

  const present = [nutrition, habits].filter(Boolean);
  let status = STATUS.OK;
  if (weekends < (options.minWeekends ?? MIN_WEEKENDS)) status = STATUS.INSUFFICIENT;
  else if (!present.length) status = STATUS.BUILDING;

  // worstDimension: present, positive-gap, flagged, ranked by lower-CI bound
  const named = [['nutrition', nutrition], ['habits', habits]]
    .filter(([, d]) => d && d.flagged && d.gapPp > 0)
    .sort((a, b) => b[1].lowerCi - a[1].lowerCi);
  const worstDimension = named.length ? named[0][0] : null;

  return {
    status,
    dimensions: { nutrition, habits, training, composite: compositeOf(present) },
    worstDimension,
    weekends,
  };
}

// ── Self bucket builder ──────────────────────────────────────────────────────
// Turns the member's own cached payloads (already on their local calendar day)
// into the weekly buckets computeWeekendSplit consumes. No tz lookup needed: the
// device's own data is already local-dated.

const DAY_MS = 86400000;
function isoDay( d) { return d.toISOString().slice(0, 10); }
function dowUTCnoon(day) { return new Date(`${day}T12:00:00Z`).getUTCDay(); } // 0=Sun..6=Sat
function isWeekendDay(day) { const d = dowUTCnoon(day); return d === 0 || d === 6; }
function mondayOf(day) {
  const dt = new Date(`${day}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return isoDay(dt);
}

// 56-day window of local YYYY-MM-DD strings, ending at todayLocal (inclusive).
function windowDays(todayLocal, n = 56) {
  const end = new Date(`${todayLocal}T12:00:00Z`);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(isoDay(new Date(end.getTime() - i * DAY_MS)));
  return out;
}

function emptyWeek(weekStart) { return { weekStart, weekdayNum: 0, weekdayDen: 0, weekendNum: 0, weekendDen: 0 }; }

export function buildSelfWeekendBuckets(habitsPayload, progressPayload, { todayLocal }) {
  const allDays = windowDays(todayLocal);     // 56 calendar days, oldest→newest
  const winSet = new Set(allDays);

  // Nutrition: presence in the protein series = a snapshot existed that day;
  // "logged" = that day's protein clears the meaningful-food floor.
  const series = (progressPayload && progressPayload.series) || {};
  const proteinByDay = new Map();
  for (const pt of (series.protein || [])) {
    if (pt && pt.date && winSet.has(String(pt.date))) proteinByDay.set(String(pt.date), Number(pt.value) || 0);
  }

  // Habits: daily-cadence habits only; scheduled = every day, done = completion that day.
  const allHabits = (habitsPayload && habitsPayload.habits) || [];
  const daily = allHabits.filter((h) => {
    const c = String(h.cadence || 'daily').toLowerCase();
    return c === 'daily' || c === 'everyday';
  });
  const dailyCount = daily.length;
  const doneByDay = new Map(); // day → count of daily habits completed
  for (const h of daily) {
    // /api/client/habits returns each habit's completion dates as `history`.
    // De-dupe per habit so a repeated date can't push a day's numerator above
    // dailyCount (the DB enforces unique(habit_id, done_on), but be defensive).
    for (const done of new Set((h.history || []).map(String))) {
      if (winSet.has(done)) doneByDay.set(done, (doneByDay.get(done) || 0) + 1);
    }
  }

  // Clamp the window to the member's FIRST observed activity (any snapshot or
  // completion). Without this a brand-new account reads 54 empty days as a giant
  // weekend "gap." No activity at all → no buckets → 'insufficient'.
  const activityDays = [...proteinByDay.keys(), ...doneByDay.keys()];
  if (!activityDays.length) return { nutrition: [], habits: [] };
  const earliest = activityDays.reduce((a, b) => (a < b ? a : b)); // lexicographic min of YYYY-MM-DD
  const days = allDays.filter((d) => d >= earliest);

  const nutritionWeeks = new Map();
  const habitWeeks = new Map();
  for (const day of days) {
    const ws = mondayOf(day);
    const weekend = isWeekendDay(day);
    // nutrition — denominator is every day in the (clamped) window
    const nb = nutritionWeeks.get(ws) || emptyWeek(ws);
    const logged = (proteinByDay.get(day) || 0) >= NUTRITION_PROTEIN_FLOOR_G ? 1 : 0;
    if (weekend) { nb.weekendDen += 1; nb.weekendNum += logged; } else { nb.weekdayDen += 1; nb.weekdayNum += logged; }
    nutritionWeeks.set(ws, nb);
    // habits — denominator is (#daily habits) per day
    if (dailyCount > 0) {
      const hb = habitWeeks.get(ws) || emptyWeek(ws);
      const done = doneByDay.get(day) || 0;
      if (weekend) { hb.weekendDen += dailyCount; hb.weekendNum += done; } else { hb.weekdayDen += dailyCount; hb.weekdayNum += done; }
      habitWeeks.set(ws, hb);
    }
  }

  return {
    nutrition: [...nutritionWeeks.values()],
    habits: dailyCount > 0 ? [...habitWeeks.values()] : [],
  };
}
