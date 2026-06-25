// Source reconciliation (INT2) — the on-demand "these two disagree, which do you
// trust?" logic. Pure & dependency-free so node:test runs the exact logic the
// route + the mobile view use.
//
// The daily snapshot keeps ONE value per metric (last-writer-wins). We also
// record every provider's value as an OBSERVATION; this module compares them to
// surface only the metrics where real sources genuinely DISAGREE, and resolves
// the authoritative value from the user/coach's per-metric source OVERRIDE
// (INT1's ranking), falling back to a sensible default device ranking.
//
// HONEST DATA: a conflict needs ≥2 real sources with materially different values
// on the same day. No data, or agreement, → nothing to reconcile.

// Human labels + display units for the reconcilable metrics (the snapshot's
// device-sourced numeric fields). Manual/derived-only fields are omitted.
export const METRICS = {
  sleep_hours:           { label: 'Sleep', unit: 'h', tol: 0.25 },
  recovery_score:        { label: 'Recovery', unit: '%', tol: 3 },
  hrv_ms:                { label: 'HRV', unit: 'ms', tol: 3 },
  resting_hr:            { label: 'Resting HR', unit: 'bpm', tol: 2 },
  strain:                { label: 'Strain', unit: '', tol: 0.5 },
  sleep_performance_pct: { label: 'Sleep score', unit: '%', tol: 3 },
  sleep_efficiency_pct:  { label: 'Sleep efficiency', unit: '%', tol: 3 },
  workout_minutes:       { label: 'Workout minutes', unit: 'min', tol: 5 },
  avg_heart_rate:        { label: 'Avg HR', unit: 'bpm', tol: 2 },
  calories:              { label: 'Calories', unit: 'kcal', tol: 25 },
  steps:                 { label: 'Steps', unit: '', tol: 250 },
};

// Default ranking when the user hasn't picked an authoritative source: dedicated
// wearables over phone/manual. Lower index = more trusted.
export const DEFAULT_SOURCE_RANK = ['whoop', 'oura', 'garmin', 'apple_health', 'strava', 'manual'];
function rankOf(source) {
  const i = DEFAULT_SOURCE_RANK.indexOf(String(source));
  return i === -1 ? DEFAULT_SOURCE_RANK.length : i;
}

export function metricLabel(metric) { return (METRICS[metric] && METRICS[metric].label) || metric; }
export function metricUnit(metric) { return (METRICS[metric] && METRICS[metric].unit) || ''; }
function tol(metric) { return (METRICS[metric] && METRICS[metric].tol) || 0; }

// Two readings "disagree" when they differ by more than the metric's tolerance
// (so rounding noise isn't flagged as a conflict).
export function disagree(metric, a, b) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) > tol(metric);
}

// The latest reading per source for one metric, newest first.
function latestPerSource(obs) {
  const bySource = new Map();
  for (const o of obs) {
    if (o == null || o.value == null) continue;
    const prev = bySource.get(o.source);
    if (!prev || String(o.observed_at || o.snapshot_date) > String(prev.observed_at || prev.snapshot_date)) {
      bySource.set(o.source, { source: o.source, value: Number(o.value), date: o.snapshot_date, observed_at: o.observed_at || null });
    }
  }
  return [...bySource.values()];
}

// The authoritative reading for a metric: the override's source if it has a
// reading, else the highest-ranked source present. Returns the winning reading.
export function authoritativeReading(metric, readings, override) {
  if (!readings.length) return null;
  if (override) {
    const hit = readings.find((r) => r.source === override);
    if (hit) return hit;
  }
  return readings.slice().sort((a, b) => rankOf(a.source) - rankOf(b.source))[0];
}

// Build the reconcile list: for each metric, the per-source readings, the current
// authoritative source, and whether they DISAGREE. `conflictsOnly` (default true)
// returns only the metrics worth reconciling.
//   observations: [{ snapshot_date, metric, source, value, observed_at }]
//   overrides:    { [metric]: source }
export function buildReconciliation(observations = [], overrides = {}, opts = {}) {
  const conflictsOnly = opts.conflictsOnly !== false;
  const pinnedDate = opts.snapshotDate || null;
  const byMetric = new Map();
  for (const o of observations) {
    if (!o || !o.metric || !METRICS[o.metric]) continue;
    if (!byMetric.has(o.metric)) byMetric.set(o.metric, []);
    byMetric.get(o.metric).push(o);
  }
  const out = [];
  for (const [metric, obsAll] of byMetric) {
    // SAME-DAY reconciliation: only compare readings from ONE snapshot date — the
    // caller's pinned date, else the most recent date present for this metric.
    // (Comparing today's Whoop against a 3-day-old Oura would surface a false
    // conflict and pick a stale "authoritative" source.)
    const day = pinnedDate || obsAll.reduce((m, o) => {
      const d = String((o && o.snapshot_date) || '');
      return d > m ? d : m;
    }, '');
    const obs = day ? obsAll.filter((o) => String((o && o.snapshot_date) || '') === day) : obsAll;
    const readings = latestPerSource(obs);
    if (readings.length < 2) {
      if (!conflictsOnly && readings.length) out.push(row(metric, readings, overrides[metric], false));
      continue;
    }
    // do any two of the latest readings materially differ?
    let differ = false;
    for (let i = 0; i < readings.length && !differ; i++) {
      for (let j = i + 1; j < readings.length; j++) {
        if (disagree(metric, readings[i].value, readings[j].value)) { differ = true; break; }
      }
    }
    if (differ || !conflictsOnly) out.push(row(metric, readings, overrides[metric], differ));
  }
  // conflicts first, then by label
  return out.sort((a, b) => (Number(b.differ) - Number(a.differ)) || a.label.localeCompare(b.label));
}

function row(metric, readings, override, differ) {
  const authoritative = authoritativeReading(metric, readings, override);
  return {
    metric,
    label: metricLabel(metric),
    unit: metricUnit(metric),
    differ,
    override: override || null,                 // the user/coach-chosen source, if any
    authoritativeSource: authoritative ? authoritative.source : null,
    sources: readings
      .slice()
      .sort((a, b) => rankOf(a.source) - rankOf(b.source))
      .map((r) => ({ source: r.source, value: r.value, date: r.date, isAuthoritative: authoritative && r.source === authoritative.source })),
  };
}
