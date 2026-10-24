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
// ⚠ NOTHING TRACKED IS NOT ZERO. A day with no reading is null, and a week with none has no total,
// so the panel says "—" and offers to connect a source instead of claiming 0 kcal.

import { bsHwShift, bsHwLocalDayOf } from './homeWeek.mjs';

// The provider keys the snapshot's `sources.calories` and an activity's `source` carry, as the
// panel names them. Brand names stay as they are in every language; 'manual' is the member's own log.
export const BS_BURN_SOURCES = { apple_health: 'Apple Health', apple: 'Apple Health', garmin: 'Garmin', oura: 'Oura', strava: 'Strava', whoop: 'WHOOP', manual: 'manual' };

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
  const actBy = new Map();
  for (const a of Array.isArray(acts) ? acts : []) {
    const day = a && a.started_at ? bsHwLocalDayOf(a.started_at) : null;
    const v = kcalOf(a && a.calories);
    if (!day || !inWeek.has(day) || v == null) continue;
    const cur = actBy.get(day) || { kcal: 0, sources: new Set() };
    cur.kcal += v;
    if (a.source) cur.sources.add(a.source);
    actBy.set(day, cur);
  }
  const used = new Set();
  const out = days.map((day) => {
    const future = day > todayIso;
    let kcal = null;
    if (!future && snapBy.has(day)) { const s = snapBy.get(day); kcal = Math.round(s.kcal); if (s.source) used.add(s.source); }
    else if (!future && actBy.has(day)) { const a = actBy.get(day); kcal = Math.round(a.kcal); a.sources.forEach((x) => used.add(x)); }
    return { day, kcal, future, isToday: day === todayIso };
  });
  const counted = out.filter((d) => d.kcal != null);
  const total = counted.length ? counted.reduce((s, d) => s + d.kcal, 0) : null;
  const names = [...new Set([...used].map((k) => BS_BURN_SOURCES[k] || null).filter(Boolean))];
  return {
    monday, days: out, total,
    daysCounted: counted.length,
    avg: counted.length ? Math.round(total / counted.length) : null,
    max: counted.length ? Math.max(...counted.map((d) => d.kcal)) : null,
    sources: names,
  };
}
