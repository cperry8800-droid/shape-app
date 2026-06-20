// Pure trigger logic for the website spotlight tour's new-account auto-show.
// Imported by tests AND (as a plain script global, see dashTour.js) the dashboards.
// Show ONCE for an account younger than maxAgeHours that hasn't seen the tour.
export function shouldAutoShowTour(createdAtISO, seen, nowMs, maxAgeHours = 24) {
  if (seen) return false;
  if (!createdAtISO) return false;
  const t = Date.parse(createdAtISO);
  if (!Number.isFinite(t)) return false;
  const ageHours = (nowMs - t) / 3600000;
  return ageHours >= 0 && ageHours < maxAgeHours;
}
