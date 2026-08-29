// Types for the pure correlations module (src/lib/correlations.mjs).
//
// The implementation is .mjs so `node --test` can drive it directly; this file
// is what the TypeScript consumers (the insights route, the AI weekly readout)
// see. Keep the two in step — the shapes here are asserted against the real
// module by tests/correlations.test.mjs, so a drift fails CI rather than
// surfacing as an `any`.

export type MetricKey =
  | 'sleep_hours'
  | 'sleep_performance_pct'
  | 'recovery_score'
  | 'hrv_ms'
  | 'resting_hr'
  | 'strain'
  | 'workout_minutes'
  | 'workout_volume_lb'
  | 'avg_heart_rate'
  | 'calories'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'hydration_l'
  | 'weight_lb'
  | 'body_fat_pct'
  | 'mood'
  | 'stress'
  | 'soreness'
  | 'energy'
  | 'hunger'
  | 'sleep_quality'
  | 'steps';

/**
 * One day's snapshot as it arrives from PostgREST.
 *
 * ⚠ A METRIC VALUE MAY BE A STRING, and the type has to say so or it lies about
 * its own input. PostgREST serialises `numeric` columns as JSON STRINGS
 * (browser-verified in this repo, #1769), and 14 of these metrics are numeric —
 * which is precisely how the already-shipped /api/insights/correlations came to
 * compute 8 of its 10 pairs over zero rows. `computeCorrelations` now coerces
 * numeric strings deliberately (see `toNumber`), so a caller casting a raw
 * PostgREST row through this type is doing the correct thing; narrowing the
 * value to `number | null` would make that cast look wrong and invite someone
 * to "fix" it back into the defect.
 */
export type SnapshotPoint = { snapshot_date: string } & Partial<
  Record<MetricKey, number | string | null>
>;

/** The fewest overlapping days a pair may be scored on. */
export const MIN_DAYS: number;

/** The metric columns, and the single source the select is derived from. */
export const SNAPSHOT_METRICS: readonly MetricKey[];

/** The PostgREST select for a correlation read — derived, never hand-typed. */
export const SNAPSHOT_SELECT: string;

export const CORRELATION_PAIRS: ReadonlyArray<{
  x: MetricKey;
  y: MetricKey;
  lagDays: 0 | 1;
  label: string;
  explanation: string;
}>;

export type CorrelationResult = {
  x: MetricKey;
  y: MetricKey;
  lagDays: 0 | 1;
  label: string;
  explanation: string;
  r: number;
  n: number;
  pValue: number;
  /** Benjamini–Hochberg FDR across the pairs in THIS response. */
  qValue: number;
  strength: 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative';
  series: Array<{ date: string; x: number; y: number }>;
};

export function computeCorrelations(rows: SnapshotPoint[]): CorrelationResult[];
