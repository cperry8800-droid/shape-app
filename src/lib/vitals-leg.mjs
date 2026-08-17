// Case-file DAILY vitals derivation (check-in engine spec §3B) — the pure half
// of the shared-overview route's `vitals` leg, extracted so the per-metric
// filtering is testable under node --test (the call-rpc.mjs / guardrail-health
// pattern: the TS route imports THIS module, tests import it too — one
// implementation, no twin drift).
//
// Contract:
//   - Input rows are daily_health_snapshot rows in CHRONOLOGICAL order
//     (oldest → newest), exactly how the route builds `snapRows`.
//   - A metric exists for a row only when the column holds a real finite
//     number. `Number(null)` and `Number('')` are both finite 0 — the
//     documented fabrication class — so null/undefined/'' are ABSENCE and are
//     dropped, never coerced (the route's own `num()` rule, applied per row).
//     Numeric STRINGS pass (the PostgREST numeric-as-string shape); any other
//     junk is dropped. A real 0 is a real value and is kept (colSeries keeps
//     0 for the sleep leg; same semantics here).
//   - The 7-day window is the 7 most recent snapshot DAYS carrying a real
//     value for THAT metric (within the caller's 30-row window), matching how
//     the sleep leg's avg7/series7 treat sleep_hours — NOT the last 7 calendar
//     days, and never padded with fabricated zeros.
//   - No data for a metric ⇒ null, and bsVitals OMITS that sub-leg entirely —
//     a client who has never logged (say) hunger shows nothing for it rather
//     than a fabricated 0 (honest-absent doctrine). All three absent ⇒ null.

/**
 * One metric's 7-day leg from chronological snapshot rows.
 * Returns { avg7, n, series7 } or null when the client has no real data for
 * the metric. avg7 is rounded to 1 decimal (the sleep leg's rounding); n is
 * the number of logged days inside the window (≤ 7); series7 is the window's
 * [{ date, value }] points, chronological.
 */
export function bsVitalsLeg(rows, key) {
  if (!Array.isArray(rows) || typeof key !== 'string' || !key) return null;
  const series = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const raw = r[key];
    // Absence stays absent: null/undefined/'' never coerce ('' → Number 0 is
    // the fabrication class), and non-finite junk is dropped, not clamped.
    if (raw == null || raw === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    series.push({ date: typeof r.snapshot_date === 'string' ? r.snapshot_date : null, value: v });
  }
  if (!series.length) return null;
  const series7 = series.slice(-7);
  const avg = series7.reduce((a, p) => a + p.value, 0) / series7.length;
  return { avg7: Math.round(avg * 10) / 10, n: series7.length, series7 };
}

/**
 * The whole vitals leg: { energy?, hunger?, hydration? } with each sub-leg
 * present ONLY when that client has real data for it. Hydration reads the
 * `hydration_l` column and reports `avg7L` (liters) per the spec's shape.
 * Returns null when no metric has any data, so the response's `vitals` key
 * reads as honest absence rather than an empty object.
 */
export function bsVitals(rows) {
  const energy = bsVitalsLeg(rows, 'energy');
  const hunger = bsVitalsLeg(rows, 'hunger');
  const hyd = bsVitalsLeg(rows, 'hydration_l');
  if (!energy && !hunger && !hyd) return null;
  const out = {};
  if (energy) out.energy = energy;
  if (hunger) out.hunger = hunger;
  if (hyd) out.hydration = { avg7L: hyd.avg7, n: hyd.n, series7: hyd.series7 };
  return out;
}
