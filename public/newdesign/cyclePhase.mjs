// The Cycle — phase engine (spec 2026-07-19, owner-approved). CANONICAL COPY
// (shareCard pattern): website loads it as a native ES module, mobile imports
// the services shim, tests import directly. Pure; deterministic; never throws.
// DOCTRINE (binding): the 'paused'/'late' phases NEVER speculate about causes;
// predictions are windows, not dates; no fabricated precision — empty windows
// stay null.
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
// Calendar-date semantics (review round): logged starts are DATE-ONLY strings
// (UTC-midnight epoch under Date.parse). A `today` passed as a Date object is
// therefore normalized to its LOCAL calendar date first — the member's wall
// clock decides what "today" is — then parsed the same UTC-midnight way, so
// day arithmetic never drifts ±1 near local midnight.
// numOf: Number() RAISES on a Symbol rather than returning NaN (the nora-sets
// lesson — proven twice there). Every numeric coercion of caller-shaped data
// routes through this, so one hostile field drops the value, never the module.
const numOf = (v) => { try { return Number(v); } catch (e) { return NaN; } };
const parse = (d) => {
  if (d instanceof Date) {
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Date.parse(local);
  }
  // Coercion discipline (the nora-sets lesson): Date.parse RAISES on a Symbol.
  try { return Date.parse(d); } catch (e) { return NaN; }
};

export function bsDeriveCycle(starts, today) {
  const t = parse(today);
  const s = (Array.isArray(starts) ? starts : []).map(parse)
    .filter(Number.isFinite).sort((a, b) => b - a);          // newest first
  if (!s.length || !Number.isFinite(t)) return { phase: null };
  const rawIntervals = [];
  for (let i = 0; i + 1 < s.length && rawIntervals.length < 12; i++) {
    rawIntervals.push(Math.round((s[i] - s[i + 1]) / DAY));
  }
  const kept = rawIntervals.filter((x) => x >= 15 && x <= 60); // outliers discarded, never mutated
  const n = kept.length;
  const mean = n ? kept.reduce((a, b) => a + b, 0) / n : 28;
  const L = Math.min(60, Math.max(15, Math.floor(mean + 0.5)));  // round half-up, clamp
  const stdev = n >= 2 ? Math.sqrt(kept.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n) : null;
  // confidence — the ordered ladder (first match wins)
  let confidence;
  if (n === 0) confidence = 'low';
  else if (n === 1) confidence = 'low';
  else if (stdev > 5) confidence = 'low';
  else if (n >= 3 && stdev <= 3) confidence = 'high';
  else confidence = 'medium';
  const wide = n >= 2 && stdev > 5;
  // windows — menstrual > luteal > ovulatory > follicular, inclusive ints
  const menstrual = [1, 5];
  const luteal = [Math.max(6, L - 11), L];
  const oLo = Math.max(6, L - (wide ? 18 : 16));
  const oHi = Math.min(L - (wide ? 10 : 12), luteal[0] - 1);
  const ovulatory = oHi >= oLo ? [oLo, oHi] : null;
  const fHi = (ovulatory ? ovulatory[0] : luteal[0]) - 1;
  const follicular = fHi >= 6 ? [6, fHi] : null;
  const windows = { menstrual, follicular, ovulatory, luteal };
  const day = Math.floor((t - s[0]) / DAY) + 1;
  if (day > L + 7) return { phase: 'paused', day, L, confidence, windows, predictedStart: null, starts: s.map(iso) };
  let phase = 'late';                                          // L < day ≤ L+7 (see PR-body note)
  if (day <= 5) phase = 'menstrual';
  else if (follicular && day <= follicular[1]) phase = 'follicular';
  else if (ovulatory && day <= ovulatory[1]) phase = 'ovulatory';
  else if (day <= L) phase = 'luteal';
  const slop = confidence === 'high' ? 1 : confidence === 'medium' ? 2 : 4;
  const predicted = s[0] + L * DAY;
  return {
    phase, day, L, confidence, windows,
    predictedStart: { from: iso(predicted - slop * DAY), to: iso(predicted + slop * DAY) },
    starts: s.map(iso),
  };
}

// ── The statistical reads (crossoverRead's shape) ───────────────────────────
// Buckets caller-labeled days by phase and compares the two most-populated
// buckets per metric. Fires only past ALL of: ≥2 complete cycles · ≥8 days in
// EACH compared bucket · the per-metric materiality floor · 1.65·SE. Below any
// floor → null (honest-null; the card states how many cycles exist).
//
// ⚠ Metric roster (spec-exact): sleep (0.5h = 30 min) · energy/rested (1.0 on
// the 1–10 check-in scale) · adherence (0.12 = 12pp). The spec ALSO names
// training volume as a bucketed series but ratifies NO materiality floor for
// it — and volume arrives in caller units (lbs·reps, minutes), so any floor we
// picked here would be fabricated precision. Volume therefore CANNOT fire in
// v1; it stays out of the roster until the owner ratifies a floor. Flagged in
// the PR body alongside phase:'late'.
const READ_METRICS = [
  { key: 'sleepH', metric: 'sleep', floor: 0.5, fmt: (g) => `${Math.abs(g).toFixed(1)}h` },
  { key: 'energy', metric: 'energy', floor: 1.0, fmt: (g) => `${Math.abs(g).toFixed(1)} points` },
  { key: 'rested', metric: 'rested', floor: 1.0, fmt: (g) => `${Math.abs(g).toFixed(1)} points` },
  { key: 'adherence', metric: 'adherence', floor: 0.12, fmt: (g) => `${Math.round(Math.abs(g) * 100)}pp` },
];

// Never-shaming copy, figures baked in-module (the crossoverCopy rule — words
// and numbers share one no-drift source). Framed as the body working WITH her,
// per doctrine; `lo` is the lower-valued phase.
const READ_COPY = {
  sleep: (hi, lo, f) => `Your sleep runs ${f} shorter in your ${lo} phase than your ${hi} — that's your body moving through the cycle, not a slip. Protect the wind-down there.`,
  energy: (hi, lo, f) => `Your energy check-ins run ${f} lower in your ${lo} phase than your ${hi} — plan the heavier work where the energy already is.`,
  rested: (hi, lo, f) => `You wake ${f} less rested in your ${lo} phase than your ${hi} — recovery is doing different work there, and that's normal.`,
  adherence: (hi, lo, f) => `Your habits land ${f} less often in your ${lo} phase than your ${hi} — shaving the load there keeps the streak honest, not smaller.`,
};

export function bsCycleRead(days, cycle) {
  if (!Array.isArray(days) || !cycle || !(numOf(cycle.completeCycles) >= 2)) return null;
  let best = null;
  for (const m of READ_METRICS) {
    const buckets = new Map();
    for (const d of days) {
      if (!d || typeof d !== 'object' || typeof d.phase !== 'string') continue;
      const v = numOf(d[m.key]);
      if (!Number.isFinite(v)) continue;
      if (!buckets.has(d.phase)) buckets.set(d.phase, []);
      buckets.get(d.phase).push(v);
    }
    // The two most-populated phase buckets; deterministic tie-break by name.
    const ranked = [...buckets.entries()]
      .sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1));
    if (ranked.length < 2) continue;
    const [[phaseA, va], [phaseB, vb]] = ranked;
    if (va.length < 8 || vb.length < 8) continue;             // bucket floor
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const variance = (a, mu) => a.reduce((s, x) => s + (x - mu) * (x - mu), 0) / a.length;
    const ma = mean(va); const mb = mean(vb);
    const gap = ma - mb;
    const se = Math.sqrt(variance(va, ma) / va.length + variance(vb, mb) / vb.length);
    if (Math.abs(gap) < m.floor) continue;                    // materiality floor
    if (Math.abs(gap) < 1.65 * se) continue;                  // significance
    // Standardized by the metric's own floor (unit-free), so cross-metric
    // ranking is total even when a zero-variance bucket makes |gap|/se infinite.
    const standardized = Math.abs(gap) / m.floor;
    if (!best || standardized > best.standardized) {
      const hi = gap >= 0 ? phaseA : phaseB;
      const lo = gap >= 0 ? phaseB : phaseA;
      best = {
        standardized,
        read: { metric: m.metric, phaseA, phaseB, gap, se, copy: READ_COPY[m.metric](hi, lo, m.fmt(gap)) },
      };
    }
  }
  return best ? best.read : null;
}
