// services/weekBurn.mjs
//
// CALORIES BURNED THIS WEEK (owner, 2026-10-24: "add a total calories burned each week appearing
// below the week calendar like eat tab"). The Train tab's week strip runs Monday to Sunday; this is
// that week's burn, a figure a day and the total. Pure, so the tests drive it; BSTrainBurn.jsx draws
// it and shapeBackend.js (window.ShapeBurn) reads the rows.
//
// ⚠ A DAY IS COUNTED ONCE. A device's daily snapshot (daily_health_snapshot.calories: Apple Health's
// active energy, Garmin's and Oura's active calories) covers the whole day, its workouts included.
// A day that has one takes it; only a day without one adds up its logged activities
// (activities.calories: Strava, WHOOP, a workout logged by hand). Adding both would count a run the
// watch tracked twice.
//
// ⚠ ONE WORKOUT, TWO PROVIDERS, COUNTED ONCE (Codex P2 on #2437). A WHOOP strap and Strava on the
// same run each keep their row (the feed's cross-source guard drops only the second post), so
// activities from different sources that start within 20 minutes of each other, the guard's window,
// are one workout at the larger reading. Two workouts from one source are always two.
//
// ⚠ NOTHING TRACKED IS NOT ZERO. A day with no reading is null, and a week with none has no total,
// so the panel says "—" and offers to connect a source instead of claiming 0 kcal.

import { bsHwShift, bsHwLocalDayOf } from './homeWeek.mjs';

// The provider keys the snapshot's `sources.calories` and an activity's `source` carry, as the
// panel names them. Brand names stay as they are in every language; 'manual' is the member's own log.
export const BS_BURN_SOURCES = { apple_health: 'Apple Health', apple: 'Apple Health', garmin: 'Garmin', oura: 'Oura', strava: 'Strava', whoop: 'WHOOP', manual: 'manual' };

const TWIN_MS = 20 * 60 * 1000;
// The calendar shows a synced workout once by the same rule (src/lib/calendar-activities.ts).
export const BS_BURN_TWIN_MS = TWIN_MS;

const kcalOf = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function bsBurnWeek({ monday, todayIso, snaps = [], acts = [] }) {
  const days = Array.from({ length: 7 }, (_, i) => bsHwShift(monday, i));
  const inWeek = new Set(days);
  const snapBy = new Map();
  for (const s of Array.isArray(snaps) ? snaps : []) {
    const day = String((s && s.snapshot_date) || '').slice(0, 10);
    const v = kcalOf(s && s.calories);
    if (inWeek.has(day) && v != null) snapBy.set(day, { kcal: v, source: (s.sources && s.sources.calories) || null });
  }
  const workouts = [];
  const timed = (Array.isArray(acts) ? acts : [])
    .map((a) => ({ a, t: Date.parse((a && a.started_at) || '') }))
    .filter((x) => Number.isFinite(x.t))
    .sort((x, y) => x.t - y.t);
  for (const { a, t } of timed) {
    const day = bsHwLocalDayOf(a.started_at);
    const v = kcalOf(a.calories);
    if (!day || !inWeek.has(day) || v == null) continue;
    const twin = a.source && workouts.find((w) => !w.sources.has(a.source) && Math.abs(w.t - t) <= TWIN_MS);
    if (twin) { twin.kcal = Math.max(twin.kcal, v); twin.sources.add(a.source); continue; }
    workouts.push({ t, day, kcal: v, sources: new Set(a.source ? [a.source] : []) });
  }
  const actBy = new Map();
  for (const w of workouts) {
    const cur = actBy.get(w.day) || { kcal: 0, sources: new Set() };
    cur.kcal += w.kcal;
    w.sources.forEach((x) => cur.sources.add(x));
    actBy.set(w.day, cur);
  }
  const used = new Set();
  // `from` names where a day's figure came from, as `sources` names the week's (the week page's rows).
  const named = (keys) => [...new Set(keys.map((k) => BS_BURN_SOURCES[k] || null).filter(Boolean))];
  const out = days.map((day) => {
    const future = day > todayIso;
    let kcal = null;
    let keys = [];
    if (!future && snapBy.has(day)) { const s = snapBy.get(day); kcal = Math.round(s.kcal); if (s.source) keys = [s.source]; }
    else if (!future && actBy.has(day)) { const a = actBy.get(day); kcal = Math.round(a.kcal); keys = [...a.sources]; }
    keys.forEach((x) => used.add(x));
    return { day, kcal, future, isToday: day === todayIso, from: named(keys) };
  });
  const counted = out.filter((d) => d.kcal != null);
  const total = counted.length ? counted.reduce((s, d) => s + d.kcal, 0) : null;
  const names = named([...used]);
  return {
    monday, days: out, total,
    daysCounted: counted.length,
    avg: counted.length ? Math.round(total / counted.length) : null,
    max: counted.length ? Math.max(...counted.map((d) => d.kcal)) : null,
    sources: names,
  };
}
