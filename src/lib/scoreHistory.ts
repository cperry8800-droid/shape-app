// TS twin of mobile-app/src/services/scoreHistory.mjs — KEEP IN SYNC. The .mjs
// is the unit-tested source of truth (tests/score-record.test.mjs). Used by the
// /api/client/score-record route over the caller's score_ledger. Rank basis:
// store redemptions are excluded everywhere so the report reconciles with the
// Standing; penalties = negative non-redeem deltas.

const DAY_MS = 86400000;

export const RANGE_KEYS = ['1w', '1m', '3m', 'all'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
const RANGE_DAYS: Record<RangeKey, number | null> = { '1w': 7, '1m': 30, '3m': 90, all: null };
const RANGE_BUCKET: Record<RangeKey, 'day' | 'week'> = { '1w': 'day', '1m': 'day', '3m': 'week', all: 'week' };

export const RECORD_CATEGORY_LABELS: Record<string, string> = {
  workouts: 'Workouts', nutrition: 'Nutrition', adherence: 'Check-ins', habits: 'Habits',
  prs: 'PRs', career: 'Career', community: 'Community', endorsements: 'Endorsements', radio: 'Radio',
  referrals: 'Referrals', other: 'Other',
};

export function recordFilterBucket(category: string, delta: number, sourceKind: string | null): string {
  if (Number(delta) < 0 && sourceKind !== 'store_redeem') return 'penalty';
  switch (String(category || '')) {
    case 'workouts': return 'workouts';
    case 'habits': return 'habits';
    case 'nutrition': return 'nutrition';
    case 'adherence': return 'checkins';
    case 'prs': return 'prs';
    default: return 'other';
  }
}

export type LedgerRow = { category: string; source_kind: string | null; delta: number; note: string | null; earned_at: string };
export type SeriesPoint = { date: string; cumulative: number; dayDelta: number };
export type CategoryBar = { key: string; label: string; earned: number };
export type PenaltyRow = { note: string; total: number };
export type RangeReport = { series: SeriesPoint[]; byCategory: CategoryBar[]; earned: number; lost: number; net: number; penalties: PenaltyRow[] };
export type HistoryRow = { note: string; category: string; label: string; delta: number; earned_at: string; bucket: string; isPenalty: boolean };
export type HistoryDay = { date: string; subtotal: number; rows: HistoryRow[] };
export type ScoreRecord = { ranges: Record<RangeKey, RangeReport>; history: HistoryDay[]; lifetime: number };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStartMs = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const weekStartMs = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };

export function bsScoreRecord(rows: LedgerRow[], opts: { now?: Date | number } = {}): ScoreRecord {
  const nowMs = opts.now instanceof Date ? opts.now.getTime() : (typeof opts.now === 'number' ? opts.now : Date.now());

  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.source_kind !== 'store_redeem')
    .map((r) => ({
      category: String(r.category || 'other'), source_kind: r.source_kind || null,
      delta: Number(r.delta) || 0, note: r.note || null, earned_at: r.earned_at,
      ms: new Date(r.earned_at).getTime(),
    }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);

  const lifetime = clean.reduce((s, r) => s + r.delta, 0);

  const ranges = {} as Record<RangeKey, RangeReport>;
  for (const key of RANGE_KEYS) {
    const days = RANGE_DAYS[key];
    const cutoff = days == null ? -Infinity : nowMs - days * DAY_MS;
    const inWin = clean.filter((r) => r.ms >= cutoff);
    let running = clean.filter((r) => r.ms < cutoff).reduce((s, r) => s + r.delta, 0);

    const bucketOf = RANGE_BUCKET[key] === 'week' ? weekStartMs : dayStartMs;
    const byBucket = new Map<number, number>();
    for (const r of inWin) byBucket.set(bucketOf(r.ms), (byBucket.get(bucketOf(r.ms)) || 0) + r.delta);
    const series: SeriesPoint[] = [];
    for (const b of [...byBucket.keys()].sort((a, z) => a - z)) {
      running += byBucket.get(b)!;
      series.push({ date: isoDay(b), cumulative: running, dayDelta: byBucket.get(b)! });
    }

    const cat = new Map<string, number>(); const pen = new Map<string, number>();
    let earned = 0, lost = 0;
    for (const r of inWin) {
      if (r.delta >= 0) { earned += r.delta; cat.set(r.category, (cat.get(r.category) || 0) + r.delta); }
      else { lost += -r.delta; const k = r.note || RECORD_CATEGORY_LABELS[r.category] || 'Penalty'; pen.set(k, (pen.get(k) || 0) + r.delta); }
    }
    const byCategory: CategoryBar[] = [...cat.entries()]
      .map(([k, e]) => ({ key: k, label: RECORD_CATEGORY_LABELS[k] || k, earned: e }))
      .sort((a, b) => b.earned - a.earned);
    const penalties: PenaltyRow[] = [...pen.entries()].map(([note, total]) => ({ note, total })).sort((a, b) => a.total - b.total);

    ranges[key] = { series, byCategory, earned, lost, net: earned - lost, penalties };
  }

  const dayMap = new Map<string, HistoryRow[]>();
  for (const r of clean) {
    const d = isoDay(r.ms);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push({
      note: r.note || RECORD_CATEGORY_LABELS[r.category] || 'Points',
      category: r.category, label: RECORD_CATEGORY_LABELS[r.category] || r.category,
      delta: r.delta, earned_at: r.earned_at,
      bucket: recordFilterBucket(r.category, r.delta, r.source_kind), isPenalty: r.delta < 0,
    });
  }
  const history: HistoryDay[] = [...dayMap.keys()].sort((a, b) => (a < b ? 1 : -1)).map((d) => {
    const dayRows = dayMap.get(d)!.slice().reverse();
    return { date: d, subtotal: dayRows.reduce((s, r) => s + r.delta, 0), rows: dayRows };
  });

  return { ranges, history, lifetime };
}
