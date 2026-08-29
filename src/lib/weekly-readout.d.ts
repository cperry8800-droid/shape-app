// Types for the pure weekly-readout helpers (src/lib/weekly-readout.mjs).
//
// The implementation is .mjs so `node --test` can drive it directly; this is
// what the route sees. A .d.ts is NOT checked against its .mjs by the compiler,
// so tests/weekly-readout.test.mjs asserts the shapes against the real module —
// a hand-typed drift fails CI instead of surfacing as a wrong `any`.

/** Monday (UTC) of the week containing `nowMs`, `YYYY-MM-DD`; null if unusable. */
export function weeklyReadoutWeekStart(nowMs: number): string | null;

export type StoredReadout = {
  readout: unknown;
  correlations: unknown;
  source: 'openai' | 'fallback';
  window_days: number | null;
  sample_size: number | null;
  generated_at: string | null;
};

export type LiveReadout = {
  readout: unknown;
  correlations: unknown;
  source: 'openai' | 'fallback';
  window_days: number;
  sample_size: number;
  generated_at: string;
};

export function buildReadoutResponse(input: {
  subjectId: string;
  weekStart: string | null;
  stored: StoredReadout | null | undefined;
  live: LiveReadout;
}): {
  source: 'openai' | 'fallback';
  cached: boolean;
  user_id: string;
  week_start: string | null;
  window_days: number | null;
  sample_size: number | null;
  generated_at: string | null;
  correlations: unknown;
  readout: unknown;
};
