// Pearson correlation across daily_health_snapshot rows. Pure functions —
// no Supabase, no Next. Consumers (the /api/insights/correlations route,
// the AI weekly readout) load rows and pass them in.
//
// "Lag" matters: training quality on day D often depends on sleep from
// D-1. We compute correlations both same-day and one-day-lagged so the
// UI can show "Sleep last night → next-day strain" alongside "Same-day
// macros vs same-day workout".

export type SnapshotPoint = {
  snapshot_date: string;
  sleep_hours?: number | null;
  sleep_performance_pct?: number | null;
  recovery_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  strain?: number | null;
  workout_minutes?: number | null;
  workout_volume_lb?: number | null;
  avg_heart_rate?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  hydration_l?: number | null;
  weight_lb?: number | null;
  body_fat_pct?: number | null;
  mood?: number | null;
  stress?: number | null;
  soreness?: number | null;
};

export type MetricKey = Exclude<keyof SnapshotPoint, 'snapshot_date'>;

// Pairs we score. Each pair is (x, y, lagDays). lagDays = 1 means y is on the
// day AFTER x — e.g. sleep_hours[D-1] vs strain[D]. The label is what the UI
// surfaces; the explanation makes the AI prompt richer.
export const CORRELATION_PAIRS: Array<{
  x: MetricKey;
  y: MetricKey;
  lagDays: 0 | 1;
  label: string;
  explanation: string;
}> = [
  { x: 'sleep_hours', y: 'strain', lagDays: 1, label: 'Sleep → next-day strain capacity', explanation: 'Hours slept the night before vs the workload the body actually held the next day.' },
  { x: 'sleep_hours', y: 'recovery_score', lagDays: 0, label: 'Sleep ↔ same-day recovery', explanation: 'Hours slept vs WHOOP recovery score for the same morning.' },
  { x: 'sleep_performance_pct', y: 'workout_minutes', lagDays: 1, label: 'Sleep quality → next-day training volume', explanation: 'How much of training duration the next day tracks with sleep performance.' },
  { x: 'protein_g', y: 'recovery_score', lagDays: 1, label: 'Protein → next-day recovery', explanation: 'Daily protein intake vs the recovery score the following morning.' },
  { x: 'calories', y: 'workout_minutes', lagDays: 0, label: 'Calories ↔ training duration', explanation: 'Same-day calories vs same-day training minutes; energy availability.' },
  { x: 'carbs_g', y: 'strain', lagDays: 0, label: 'Carbs ↔ training strain', explanation: 'Same-day carbohydrate intake vs strain produced.' },
  { x: 'hydration_l', y: 'recovery_score', lagDays: 1, label: 'Hydration → next-day recovery', explanation: 'Daily hydration vs next-morning recovery.' },
  { x: 'stress', y: 'sleep_hours', lagDays: 0, label: 'Stress ↔ sleep', explanation: 'Subjective stress score vs hours slept that night.' },
  { x: 'workout_minutes', y: 'soreness', lagDays: 1, label: 'Training volume → next-day soreness', explanation: 'How much soreness shows up the morning after training.' },
  { x: 'protein_g', y: 'weight_lb', lagDays: 0, label: 'Protein ↔ weight', explanation: 'Trends in protein intake vs body weight across the window.' },
];

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 4) return null;
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// Approximate two-sided p-value for Pearson r using the t-distribution
// approximation. Good enough for "is this significant or noise" — we are
// not doing inference, just gating which insights surface.
function approxPValue(r: number, n: number): number {
  if (n <= 2 || Math.abs(r) >= 1) return 0;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1 - r * r, 1e-9));
  // Two-sided survival approximation via Abramowitz & Stegun 26.7.1.
  const x = Math.abs(t);
  const a = 1 / (1 + 0.2316419 * x);
  const phi =
    (1 / Math.sqrt(2 * Math.PI)) *
    Math.exp(-(x * x) / 2) *
    (a * (0.319381530 + a * (-0.356563782 + a * (1.781477937 + a * (-1.821255978 + a * 1.330274429)))));
  return Math.min(1, 2 * phi);
}

export type CorrelationResult = {
  x: MetricKey;
  y: MetricKey;
  lagDays: 0 | 1;
  label: string;
  explanation: string;
  r: number;
  n: number;
  pValue: number;
  strength: 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative';
  series: Array<{ date: string; x: number; y: number }>;
};

function strengthOf(r: number): 'weak' | 'moderate' | 'strong' {
  const abs = Math.abs(r);
  if (abs >= 0.5) return 'strong';
  if (abs >= 0.3) return 'moderate';
  return 'weak';
}

export function computeCorrelations(rows: SnapshotPoint[]): CorrelationResult[] {
  const byDate = new Map<string, SnapshotPoint>();
  for (const row of rows) byDate.set(row.snapshot_date, row);
  const dates = Array.from(byDate.keys()).sort();

  const results: CorrelationResult[] = [];
  for (const pair of CORRELATION_PAIRS) {
    const xs: number[] = [];
    const ys: number[] = [];
    const series: Array<{ date: string; x: number; y: number }> = [];

    for (const date of dates) {
      const xRow = byDate.get(date);
      const yDate =
        pair.lagDays === 0
          ? date
          : new Date(new Date(date).getTime() + 86_400_000).toISOString().slice(0, 10);
      const yRow = byDate.get(yDate);
      const xVal = xRow?.[pair.x];
      const yVal = yRow?.[pair.y];
      if (typeof xVal === 'number' && typeof yVal === 'number') {
        xs.push(xVal);
        ys.push(yVal);
        series.push({ date, x: xVal, y: yVal });
      }
    }

    const r = pearson(xs, ys);
    if (r === null) continue;
    const n = xs.length;
    results.push({
      x: pair.x,
      y: pair.y,
      lagDays: pair.lagDays,
      label: pair.label,
      explanation: pair.explanation,
      r: Number(r.toFixed(3)),
      n,
      pValue: Number(approxPValue(r, n).toFixed(4)),
      strength: strengthOf(r),
      direction: r >= 0 ? 'positive' : 'negative',
      series,
    });
  }

  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}
