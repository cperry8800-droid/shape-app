// The member's OWN profile, signed in (BSTerrainProfile's Signals tab): its live figures, each read
// from the route that serves it. The streak, key lifts and disciplines are the website profile's
// reads too (livingProfilePage.jsx), so the two profiles show one member the same numbers. Each
// returns null when its read gave nothing, and the profile then shows its empty state. The
// signed-out demo never comes here.
// No React, no window, so Node tests run it as written.
import { bsHwIso, bsHwShift, bsHwSeriesOf } from './homeWeek.mjs';

// The day streak: consecutive days with a finished workout, /api/client/dashboard's
// `kpis.streak` (the website profile's and the app splash's figure).
export function bsProfileStreak(dashboard) {
  const s = dashboard && dashboard.kpis ? dashboard.kpis.streak : null;
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : null;
}

// Weekly momentum: workout minutes on each of the seven days ending `todayIso`, oldest first, from
// /api/client/progress's `series.volume` (one row per member day; a finished session adds its
// minutes, and so does a device). A day with no row trained 0 minutes. `days` carries the dates so
// the bars are labelled with their real weekdays. Null when the progress read did not answer.
export function bsProfileWeek(progress, todayIso = bsHwIso(new Date())) {
  const series = bsHwSeriesOf(progress);
  if (!series) return null;
  const byDay = new Map();
  for (const p of Array.isArray(series.volume) ? series.volume : []) {
    const v = p && Number(p.value);
    if (p && typeof p.date === 'string' && Number.isFinite(v)) byDay.set(p.date, Math.max(0, v));
  }
  const days = Array.from({ length: 7 }, (_, i) => bsHwShift(todayIso, i - 6));
  return { days, minutes: days.map((d) => byDay.get(d) || 0) };
}

// The trajectory: the last seven weigh-ins in pounds, oldest first, from /api/client/progress's
// `series.weight` ({ date, value } rows, already pounds). Null under two weigh-ins.
export function bsProfileTrajectory(progress) {
  const rows = progress && progress.series && Array.isArray(progress.series.weight) ? progress.series.weight : [];
  const vals = rows.map((p) => Number(p && typeof p === 'object' ? p.value : p)).filter(Number.isFinite).slice(-7);
  return vals.length >= 2 ? vals : null;
}

// Key lifts: the first three of /api/client/profile-stats's `lifts` ([name, "245 lb"], the unit
// travelling with the figure, converted at render). Null when none are logged.
export function bsProfileLifts(stats) {
  const rows = stats && Array.isArray(stats.lifts) ? stats.lifts : [];
  const lifts = rows.filter((l) => Array.isArray(l) && l[0] && l[1] != null).slice(0, 3).map(([n, v]) => [String(n), String(v)]);
  return lifts.length ? lifts : null;
}

// Disciplines: /api/client/profile-stats's `disciplines` ([label, 0..1]), only the ones with a
// signal. Null when none have one.
export function bsProfileDisciplines(stats) {
  const rows = stats && Array.isArray(stats.disciplines) ? stats.disciplines : [];
  const disc = rows.filter((d) => Array.isArray(d) && d[0] && Number.isFinite(Number(d[1]))).map(([k, v]) => [String(k), Math.max(0, Math.min(1, Number(v)))]);
  return disc.length ? disc : null;
}
