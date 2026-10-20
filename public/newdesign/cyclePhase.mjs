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
// The floors are the engine's own units and never reach the member: the copy
// below says none of them.
const READ_METRICS = [
  { key: 'sleepH', metric: 'sleep', floor: 0.5 },
  { key: 'energy', metric: 'energy', floor: 1.0 },
  { key: 'rested', metric: 'rested', floor: 1.0 },
  { key: 'adherence', metric: 'adherence', floor: 0.12 },
];

// Sleep's gap as the member reads it: whole minutes, rounded to 5 ("about 40
// min"), never "0.6h". The floor is 30 min, so a read that fires says 30 or more.
const readMinutes = (gapH) => Math.round(Math.abs(gapH) * 12) * 5;
// "40 min" · "1h 10" · "1h": the app's own English durations (home:checkin
// mOnly / hm / hOnly, with bsCiHM's padded minutes), so this fallback and the
// app's en sentence read the same.
const readDuration = (min) => (min < 60
  ? `${min} min`
  : `${Math.floor(min / 60)}h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`);

// Never-shaming copy, framed as the body working WITH her, per doctrine; `lo`
// is the lower-valued phase, `hi` the higher.
// ⚠ No figure on the check-in scale. A member is never quoted the 1-10 scale, a
// "/10" or "points" (ruling 11, docs/REVIEW-2026-10-19-morning-checkin.md §6),
// and "12pp" is the same leak for habits, so energy, rested and adherence say
// only which phase runs lower. Sleep keeps its gap, said as a duration.
// ⚠ This English is the FALLBACK, for a consumer with no translator. The app
// composes cycle:read.* in the member's language from the read's hi, lo and
// minutes (bsCycleReadText), and tests/cycle-phase.test.mjs holds the en
// catalog to these exact sentences, so the two Englishes cannot drift apart.
const READ_COPY = {
  sleep: (r) => `Your sleep runs about ${readDuration(r.minutes)} shorter in your ${r.lo} phase than your ${r.hi} — that's your body moving through the cycle, not a slip. Protect the wind-down there.`,
  energy: (r) => `Your energy check-ins run lower in your ${r.lo} phase than your ${r.hi} — plan the heavier work where the energy already is.`,
  rested: (r) => `You wake less rested in your ${r.lo} phase than your ${r.hi} — recovery is doing different work there, and that's normal.`,
  adherence: (r) => `Your habits land less often in your ${r.lo} phase than your ${r.hi} — shaving the load there keeps the streak honest, not smaller.`,
};

// A missing observation must NEVER read as a zero-value day (review: Codex P1
// — the food-search lesson again: Number(null) and Number('') are BOTH finite
// 0, so a bare coercion turns 8 null-sleep rows into a fabricated significant
// gap). Real values are finite numbers, or non-empty numeric strings (the
// PostgREST numeric-as-string shape); everything else — null, undefined, '',
// booleans, Symbols — is absence and drops the DAY, not the module.
const valOf = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && v.trim() !== '') { const n = numOf(v); return Number.isFinite(n) ? n : NaN; }
  return NaN;
};

// Doctrine (review: Codex P2): 'late' and 'paused' are INTERNAL engine states,
// not physiological phases — they must never form a compared bucket or appear
// in read copy ("in your paused phase" would speculate exactly where the
// doctrine forbids it). Reads compare the four real phases only.
const READ_PHASES = new Set(['menstrual', 'follicular', 'ovulatory', 'luteal']);

export function bsCycleRead(days, cycle) {
  if (!Array.isArray(days) || !cycle || !(numOf(cycle.completeCycles) >= 2)) return null;
  let best = null;
  for (const m of READ_METRICS) {
    const buckets = new Map();
    for (const d of days) {
      if (!d || typeof d !== 'object' || typeof d.phase !== 'string') continue;
      if (!READ_PHASES.has(d.phase)) continue;
      const v = valOf(d[m.key]);
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
      // hi/lo are what a translator needs: the higher- and lower-valued phase
      // codes, so each language can inflect them in its own sentence.
      const hi = gap >= 0 ? phaseA : phaseB;
      const lo = gap >= 0 ? phaseB : phaseA;
      const read = { metric: m.metric, phaseA, phaseB, gap, se, hi, lo };
      if (m.metric === 'sleep') read.minutes = readMinutes(gap);
      read.copy = READ_COPY[m.metric](read);
      best = { standardized, read };
    }
  }
  return best ? best.read : null;
}
