// Compliance variance band (spec 2026-07-19): steady-vs-variable weekly
// adherence for the coach roster + Case File + website line. CANONICAL COPY —
// web loads it as a native ES module, mobile imports it, Node tests import it
// directly. Pure; never throws.
//
// Pipeline (deterministic, the spec's exact order):
//  1. the input IS the trailing ≤8-closed-week window (the RPC's window);
//  2. drop non-qualifying weeks: malformed, or < 6 scheduled units (zero and
//     thin alike — too noisy for a rate); duplicate week_start → last wins;
//  3. the survivors are the series; ≥4 or the whole call returns null.
// Band: POPULATION stdev of the weekly rates in pp, compared UNROUNDED —
// steady ≤ 8.0 · variable ≥ 18.0 · between = band null (a real result, no chip).
const MIN_UNITS = 6;
const MIN_WEEKS = 4;
const STEADY_PP = 8;
const VARIABLE_PP = 18;

const numOrNull = (v) => {
  // STRICT (review round): Number(null)/Number('') are 0 — reject non-number,
  // non-numeric-string inputs outright instead of letting them read as zero.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

export function bsVarianceBand(weeks) {
  if (!Array.isArray(weeks)) return null;
  const byWeek = new Map();
  for (const w of weeks) {
    if (!w || typeof w !== 'object') continue;
    const ws = String(w.week_start || '').slice(0, 10);
    // Anchored full-date parse — no trailing garbage, no invalid dates.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || !Number.isFinite(Date.parse(ws))) continue;
    const sched = numOrNull(w.scheduled); const done = numOrNull(w.completed);
    if (sched === null || done === null) continue;
    if (sched < MIN_UNITS || done < 0 || done > sched) continue;
    byWeek.set(ws, done / sched);                 // duplicate week_start → last wins
  }
  const rates = [...byWeek.values()];
  if (rates.length < MIN_WEEKS) return null;
  const pp = rates.map((r) => r * 100);
  const mean = pp.reduce((s, v) => s + v, 0) / pp.length;
  const stdev = Math.sqrt(pp.reduce((s, v) => s + (v - mean) * (v - mean), 0) / pp.length);
  const band = stdev <= STEADY_PP ? 'steady' : stdev >= VARIABLE_PP ? 'variable' : null;
  return { band, mean, stdev, min: Math.min(...pp), max: Math.max(...pp), weeks: pp.length };
}

// The ONE copy source (crossoverCopy no-drift rule): words and figures from a
// single function, so the Case File and the web line can never disagree.
// Display rounds HERE; comparisons upstream stay unrounded.
export function bsVarianceCopy(result) {
  if (!result) return null;
  const lo = Math.round(result.min); const hi = Math.round(result.max);
  if (result.band === 'variable') {
    return { chip: 'VARIABLE', line: `Week-to-week: swings ${lo}–${hi}% — steady the floor before raising the target.` };
  }
  if (result.band === 'steady') {
    return { chip: null, line: `Week-to-week: holds ${lo}–${hi}%.` };
  }
  return { chip: null, line: `Week-to-week: ${lo}–${hi}% across ${result.weeks} weeks.` };
}
