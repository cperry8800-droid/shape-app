// Types for vitals-leg.mjs (hand-written — the .mjs + .d.ts pattern used by
// age-derive / console-flight / funnel, because `node --test` cannot import
// TypeScript and the per-metric filtering needs real test vectors).

export type VitalsPoint = { date: string | null; value: number };

export type VitalsLeg = { avg7: number; n: number; series7: VitalsPoint[] };

export type Vitals = {
  energy?: VitalsLeg;
  hunger?: VitalsLeg;
  hydration?: { avg7L: number; n: number; series7: VitalsPoint[] };
};

/**
 * One metric's 7-day leg from CHRONOLOGICAL snapshot rows, or null when the
 * client has no real finite value for that column (absence stays absent —
 * null/''/junk are dropped, never coerced to 0).
 */
export declare function bsVitalsLeg(rows: unknown, key: string): VitalsLeg | null;

/**
 * The shared-overview `vitals` leg: each sub-leg present ONLY when that client
 * has real data for it; null when no metric has any data at all.
 */
export declare function bsVitals(rows: unknown): Vitals | null;
