// TS twin of mobile-app/src/services/weekendSplit.mjs — KEEP IN SYNC. The .mjs is
// the unit-tested source of truth (tests/weekend-split.test.mjs). Used by the
// /api/coach/roster-weekend route over buckets from get_roster_weekend_split.
export const MIN_WEEKENDS = 3;
export const FLAG_GAP_PP = 15;
export const MIN_DIM_DAYS = { nutrition: 12, habits: 12, training: 6 };
export const SE_Z = 1.65;
export const CONSISTENCY = 0.60;
export const STATUS = { OK: 'ok', BUILDING: 'building', INSUFFICIENT: 'insufficient' } as const;

export type WeeklyBucket = { weekStart: string; weekdayNum: number; weekdayDen: number; weekendNum: number; weekendDen: number };
export type DimResult = {
  present: true; weekdayRate: number; weekendRate: number; gapPp: number; se: number; lowerCi: number;
  flagged: boolean; weeksObserved: number; weekPositiveShare: number; nWeekdayDays: number; nWeekendDays: number;
};
export type WeekendSplitInput = { nutrition?: WeeklyBucket[]; habits?: WeeklyBucket[]; training?: WeeklyBucket[] };
export type WeekendSplitOptions = { minWeekends?: number; minDimDays?: { nutrition?: number; habits?: number; training?: number } };
export type DimKey = 'nutrition' | 'habits' | 'training';
export type WeekendSplitResult = {
  status: string;
  dimensions: { nutrition: DimResult | null; habits: DimResult | null; training: DimResult | null; composite: { present: true; gapPp: number } | null };
  worstDimension: DimKey | null;
  weekends: number;
};

const sum = (arr: WeeklyBucket[], f: (b: WeeklyBucket) => number) => arr.reduce((a, b) => a + f(b), 0);

function dimResult(buckets: WeeklyBucket[], minDays: number): DimResult | null {
  const wdDen = sum(buckets, (b) => b.weekdayDen);
  const weDen = sum(buckets, (b) => b.weekendDen);
  if (!(weDen >= minDays && wdDen > 0)) return null; // absent — never rendered 0%
  const wdNum = sum(buckets, (b) => b.weekdayNum);
  const weNum = sum(buckets, (b) => b.weekendNum);
  const pWk = wdNum / wdDen;
  const pWe = weNum / weDen;
  const gapPp = (pWk - pWe) * 100;
  const se = Math.sqrt(pWk * (1 - pWk) / wdDen + pWe * (1 - pWe) / weDen) * 100;
  // per-week consistency: only weeks with data on BOTH sides count
  const weeks = buckets.filter((b) => b.weekdayDen > 0 && b.weekendDen > 0);
  const weeksObserved = weeks.length;
  const positive = weeks.filter((b) => (b.weekdayNum / b.weekdayDen) - (b.weekendNum / b.weekendDen) > 0).length;
  const weekPositiveShare = weeksObserved ? positive / weeksObserved : 0;
  const lowerCi = gapPp - SE_Z * se;
  const flagged = gapPp >= FLAG_GAP_PP && gapPp >= SE_Z * se && weeksObserved > 0 && weekPositiveShare >= CONSISTENCY;
  return {
    present: true,
    weekdayRate: pWk, weekendRate: pWe, gapPp, se, lowerCi,
    flagged, weeksObserved, weekPositiveShare,
    nWeekdayDays: wdDen, nWeekendDays: weDen,
  };
}

function compositeOf(dims: (DimResult | null)[]): { present: true; gapPp: number } | null {
  const present = dims.filter(Boolean) as DimResult[];
  if (!present.length) return null;
  // inverse-variance weighted blend of the gaps (display only, never flags)
  let wsum = 0, gsum = 0;
  for (const d of present) {
    const w = d.se > 0 ? 1 / (d.se * d.se) : 1;
    wsum += w; gsum += w * d.gapPp;
  }
  return { present: true, gapPp: wsum ? gsum / wsum : 0 };
}

export function computeWeekendSplit(input: WeekendSplitInput, options: WeekendSplitOptions = {}): WeekendSplitResult {
  const minDays = { ...MIN_DIM_DAYS, ...(options.minDimDays || {}) };
  const nutrition = dimResult(input.nutrition || [], minDays.nutrition);
  const habits = dimResult(input.habits || [], minDays.habits);
  // Training: scheduled-workout days (denominator) vs trained-on-those-days
  // (numerator) — the coach roster RPC supplies these buckets. The self bucket
  // builder doesn't emit training yet, so input.training is absent there and the
  // dimension renders nothing (never a fabricated 0%).
  const training = dimResult(input.training || [], minDays.training);

  // distinct weeks with any weekend data
  const weekSet = new Set<string>();
  for (const b of [...(input.nutrition || []), ...(input.habits || []), ...(input.training || [])]) {
    if (b.weekendDen > 0) weekSet.add(b.weekStart);
  }
  const weekends = weekSet.size;

  const present = [nutrition, habits, training].filter(Boolean) as DimResult[];
  let status: string = STATUS.OK;
  if (weekends < (options.minWeekends ?? MIN_WEEKENDS)) status = STATUS.INSUFFICIENT;
  else if (!present.length) status = STATUS.BUILDING;

  // worstDimension: present, positive-gap, flagged, ranked by lower-CI bound
  const byKey: Record<DimKey, DimResult | null> = { nutrition, habits, training };
  const named = (['nutrition', 'habits', 'training'] as const)
    .map((k) => [k, byKey[k]] as [DimKey, DimResult | null])
    .filter((pair): pair is [DimKey, DimResult] => {
      const d = pair[1];
      return d !== null && d.flagged && d.gapPp > 0;
    })
    .sort((a, b) => b[1].lowerCi - a[1].lowerCi);
  const worstDimension: DimKey | null = named.length ? named[0][0] : null;

  return {
    status,
    dimensions: { nutrition, habits, training, composite: compositeOf(present) },
    worstDimension,
    weekends,
  };
}
