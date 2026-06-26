// TS twin of mobile-app/src/services/recoveryReadiness.mjs — KEEP IN SYNC.
// The .mjs is the tested source of truth (tests/recovery-readiness.test.mjs);
// this twin lets the Next API routes (progress, clients/[id]/shared-overview)
// compute the same 0-100 recovery-readiness score server-side. See the .mjs for
// the component weighting + rationale.

export type ReadinessInput = {
  sleepHours?: number | null;
  target?: number | null;
  efficiency?: number | null;
  restingHr?: number | null;
  rhrBaseline?: number | null;
  hrv?: number | null;
  hrvBaseline?: number | null;
  deviceScore?: number | null;
};

export type ReadinessBand = { label: string; tone: 'good' | 'ok' | 'warn' | 'low' };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pos = (v: unknown): number | null => { const n = fin(v); return n != null && n > 0 ? n : null; };

export function computeRecoveryReadiness(input: ReadinessInput = {}): number | null {
  const target = pos(input.target) ?? 7.5;
  const parts: Array<[number, number]> = [];

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

export function readinessBand(score: number | null): ReadinessBand | null {
  if (score == null) return null;
  if (score >= 80) return { label: 'Primed', tone: 'good' };
  if (score >= 60) return { label: 'Ready', tone: 'ok' };
  if (score >= 40) return { label: 'Run down', tone: 'warn' };
  return { label: 'Depleted', tone: 'low' };
}

type Pt = { date: string; value: number };

// Compute readiness from per-metric series (tonight's value vs a trailing baseline
// of the prior nights). Mirrors recoveryReadinessFromSeries in the .mjs.
export function readinessFromSeries(series: {
  sleep?: Pt[];
  sleepEfficiency?: Pt[];
  restingHr?: Pt[];
  hrv?: Pt[];
  recovery?: Pt[];
}): { score: number; band: ReadinessBand } | null {
  const last = (arr?: Pt[]) => (Array.isArray(arr) && arr.length ? fin(Number(arr[arr.length - 1].value)) : null);
  const baseline = (arr?: Pt[]) => {
    if (!Array.isArray(arr)) return null;
    const v = arr.map((p) => Number(p && p.value)).filter((x) => Number.isFinite(x) && x > 0);
    if (v.length < 4) return null;
    const prior = v.slice(0, -1).slice(-30);
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
  const band = readinessBand(score);
  return score == null || band == null ? null : { score, band };
}
