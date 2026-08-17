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
//   - The window is the last 7 CALENDAR days (today − 6 … today, inclusive,
//     UTC), keeping only the in-window rows that carry a real value for THAT
//     metric. It is NOT "the 7 most recent populated rows": the caller fetches
//     30 rows, so for a sparse logger that would serve a reading from weeks ago
//     as the current average under a cell labeled "7D". Gaps are simply absent
//     — the window is never padded with fabricated zeros, so `n` reports how
//     many of the 7 days were actually logged.
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
export function bsVitalsLeg(rows, key, opts = {}) {
  if (!Array.isArray(rows) || typeof key !== 'string' || !key) return null;
  // The cell is LABELED "7D", so it must mean seven DAYS. Taking the last 7
  // populated readings out of the route's 30-row window would let a single
  // reading from weeks ago render as the current 7-day average — a figure
  // contradicting its own label. `snapshot_date` is an ISO 'YYYY-MM-DD'
  // string, so a lexicographic >= compare is exact and needs no date maths;
  // a row whose date is missing or not a string is DROPPED, because recency
  // it cannot prove is absence (the under-firing, safe direction).
  const cutoff = vitalsCutoffISO(opts.now);
  const series = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const day = typeof r.snapshot_date === 'string' ? r.snapshot_date : '';
    if (!day || day < cutoff) continue;
    const raw = r[key];
    // Absence stays absent: null/undefined/'' never coerce ('' → Number 0 is
    // the fabrication class), and non-finite junk is dropped, not clamped.
    if (raw == null || raw === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    series.push({ date: day, value: v });
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
export const VITALS_WINDOW_DAYS = 7;

// Inclusive ISO cutoff for the 7-day window: today − 6, in UTC. The route has
// no per-member timezone (snapshot_date is written from the member's local
// day), so this shares the UTC basis the route's own queries use and carries
// the same documented tolerance of at most ONE boundary day.
export function vitalsCutoffISO(now = new Date()) {
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const cut = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  cut.setUTCDate(cut.getUTCDate() - (VITALS_WINDOW_DAYS - 1));
  return cut.toISOString().slice(0, 10);
}

export function bsVitals(rows, opts = {}) {
  const energy = bsVitalsLeg(rows, 'energy', opts);
  const hunger = bsVitalsLeg(rows, 'hunger', opts);
  const hyd = bsVitalsLeg(rows, 'hydration_l', opts);
  if (!energy && !hunger && !hyd) return null;
  const out = {};
  if (energy) out.energy = energy;
  if (hunger) out.hunger = hunger;
  if (hyd) out.hydration = { avg7L: hyd.avg7, n: hyd.n, series7: hyd.series7 };
  return out;
}
