// Recovery-readiness: a single 0-100 "how recovered are you today" score, blended
// from whatever sleep + cardio signals are present. PURE ESM (no IO/DOM) so it's
// unit-testable and shared by the mobile check-in card, the sleep detail page, the
// coach view (via the TS twin recovery-readiness.ts), and the directive engine.
//
// Returns null when there is nothing to score — never a fabricated 0.
//
// Components (each scored 0-100), weighted; the result is the weighted MEAN over
// the components actually present, so a missing input drops out of the blend
// rather than penalizing the score:
//   duration   0.30  sleep hours vs target  (>= target = 100, half = 50, capped)
//   efficiency 0.15  sleep efficiency %     (60% = 0, 90%+ = 100)
//   rhr        0.12  resting HR vs baseline (at/below = 100, -10 per bpm above)
//   hrv        0.18  HRV vs baseline        (at baseline = 80, +/-40% = +/-20)
//   device     0.25  the wearable's own recovery/readiness score, when present

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pos = (v) => { const n = fin(v); return n != null && n > 0 ? n : null; };

export function computeRecoveryReadiness(input = {}) {
  const target = pos(input.target) ?? 7.5;
  const parts = []; // [weight, score]

  const hours = pos(input.sleepHours);
  if (hours != null) parts.push([0.30, clamp((hours / target) * 100, 0, 100)]);

  const eff = fin(input.efficiency);
  if (eff != null && eff >= 0) parts.push([0.15, clamp(((eff - 60) / 30) * 100, 0, 100)]);

  const rhr = pos(input.restingHr);
  const rhrBase = pos(input.rhrBaseline);
  if (rhr != null && rhrBase != null) parts.push([0.12, clamp(100 - Math.max(0, rhr - rhrBase) * 10, 0, 100)]);

  const hrv = pos(input.hrv);
  const hrvBase = pos(input.hrvBaseline);
  if (hrv != null && hrvBase != null) parts.push([0.18, clamp(80 + ((hrv - hrvBase) / hrvBase) * 50, 0, 100)]);

  const dev = fin(input.deviceScore);
  if (dev != null && dev >= 0) parts.push([0.25, clamp(dev, 0, 100)]);

  if (!parts.length) return null;
  const wsum = parts.reduce((a, [w]) => a + w, 0);
  const score = parts.reduce((a, [w, s]) => a + w * s, 0) / wsum;
  return Math.round(score);
}

// Map a 0-100 readiness to a short label + tone for the card + coach copy.
export function readinessBand(score) {
  if (score == null) return null;
  if (score >= 80) return { label: 'Primed', tone: 'good' };
  if (score >= 60) return { label: 'Ready', tone: 'ok' };
  if (score >= 40) return { label: 'Run down', tone: 'warn' };
  return { label: 'Depleted', tone: 'low' };
}

// Build readiness from the progress rollup's `series` (the shape the progress
// route returns): tonight's hours / efficiency / RHR / HRV vs a trailing baseline
// (the prior nights, excluding tonight), plus the device recovery score. Returns
// { score, band } or null. Shared by the card + sleep page + coach so the score is
// computed identically everywhere.
export function recoveryReadinessFromSeries(series = {}) {
  const last = (arr) => (Array.isArray(arr) && arr.length ? fin(Number(arr[arr.length - 1].value)) : null);
  const baseline = (arr) => {
    if (!Array.isArray(arr)) return null;
    const v = arr.map((p) => Number(p && p.value)).filter((x) => Number.isFinite(x) && x > 0);
    if (v.length < 4) return null;          // need a few prior nights to baseline
    const prior = v.slice(0, -1).slice(-30); // up to 30 nights, excluding tonight
    return prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  };
  const score = computeRecoveryReadiness({
    sleepHours: last(series.sleep),
    efficiency: last(series.sleepEfficiency),
    restingHr: last(series.restingHr),
    rhrBaseline: baseline(series.restingHr),
    hrv: last(series.hrv),
    hrvBaseline: baseline(series.hrv),
    deviceScore: last(series.recovery),
  });
  return score == null ? null : { score, band: readinessBand(score) };
}
