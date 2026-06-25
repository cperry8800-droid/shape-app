// TS twin of mobile-app/src/services/e1rm.mjs — KEEP IN SYNC. Used by the
// /api/client/strength route and the /api/client/progress PR e1RM. The .mjs is
// the unit-tested source of truth (tests/e1rm.test.mjs).

export const E1RM_MAX_REPS = 12;
export const PROGRESS_DEADBAND = 0.02;
export const STALL_WEEKS = 3;
export const RECENT_WINDOW_DAYS = 14;

const DAY_MS = 86400000;
const round1 = (n: number | null) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const dayMs = (d: string) => new Date(String(d) + 'T00:00:00Z').getTime();

export type LiftRow = {
  key?: string; move_name?: string; moveName?: string; name?: string;
  date: string; load: unknown; reps: unknown; rpe?: unknown; completed?: boolean;
};
export type SeriesPoint = { date: string; e1rm: number; load: number; reps: number; rpe: number | null };
export type Lift = { key: string; name: string; series: SeriesPoint[] };
export type Status = 'progressing' | 'holding' | 'stalled' | 'building';
export type LiftSummary = {
  key: string; name: string; currentE1rm: number | null; bestE1rm: number | null;
  status: Status; deltaPct: number | null; lastImprovedAt: string | null;
  topSet: { load: number; reps: number; rpe: number | null; e1rm: number } | null;
  series: SeriesPoint[];
};

export function epleyE1rm(load: unknown, reps: unknown): number | null {
  const w = Number(load);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r < 1 || r > E1RM_MAX_REPS) return null;
  if (r <= 1) return w;
  return w * (1 + r / 30);
}

export function buildLiftSeries(rows: LiftRow[]): Lift[] {
  const byLift = new Map<string, { key: string; name: string; nameAt: string; days: Map<string, SeriesPoint> }>();
  for (const r of rows || []) {
    if (!r || r.completed === false) continue;
    const e1 = epleyE1rm(r.load, r.reps);
    if (e1 == null) continue;
    const key = String(r.key ?? r.move_name ?? r.moveName ?? '').trim().toLowerCase();
    const day = String(r.date ?? '').slice(0, 10);
    if (!key || !day) continue;
    let lift = byLift.get(key);
    if (!lift) { lift = { key, name: '', nameAt: '', days: new Map() }; byLift.set(key, lift); }
    const disp = String(r.name ?? r.move_name ?? r.moveName ?? '').trim();
    if (disp && day > lift.nameAt) { lift.name = disp; lift.nameAt = day; }
    const pt: SeriesPoint = {
      date: day, e1rm: round1(e1) as number, load: Number(r.load), reps: Number(r.reps),
      rpe: Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
    };
    const cur = lift.days.get(day);
    if (!cur || pt.e1rm > cur.e1rm) lift.days.set(day, pt);
  }
  return [...byLift.values()].map((l) => ({
    key: l.key, name: l.name || l.key,
    series: [...l.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function progressionStatus(series: SeriesPoint[], opts: { now?: number } = {}) {
  const pts = (series || []).filter((p) => p && Number.isFinite(p.e1rm));
  const now = opts.now != null ? Number(opts.now) : Date.now();
  if (pts.length < 2) {
    return { status: 'building' as Status, deltaPct: null as number | null, recentBest: pts.length ? pts[pts.length - 1].e1rm : null, priorBest: null as number | null, lastImprovedAt: pts.length ? pts[pts.length - 1].date : null };
  }
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  let runMax = -Infinity, lastImprovedAt = sorted[0].date;
  for (const p of sorted) { if (p.e1rm > runMax) { runMax = p.e1rm; lastImprovedAt = p.date; } }
  const recentCut = now - RECENT_WINDOW_DAYS * DAY_MS;
  const recent = sorted.filter((p) => dayMs(p.date) >= recentCut);
  const prior = sorted.filter((p) => dayMs(p.date) < recentCut);
  const maxOf = (arr: SeriesPoint[]) => (arr.length ? Math.max(...arr.map((p) => p.e1rm)) : null);
  const recentBest = maxOf(recent);
  const priorBest = maxOf(prior);
  const stale = (now - dayMs(lastImprovedAt)) / (7 * DAY_MS) >= STALL_WEEKS;
  if (priorBest == null) {
    const first = recent[0].e1rm, last = recent[recent.length - 1].e1rm;
    const dp = (last - first) / first;
    return { status: (dp > PROGRESS_DEADBAND ? 'progressing' : 'holding') as Status, deltaPct: dp, recentBest, priorBest: first, lastImprovedAt };
  }
  if (recentBest == null) {
    return { status: (stale ? 'stalled' : 'holding') as Status, deltaPct: null as number | null, recentBest: null as number | null, priorBest, lastImprovedAt };
  }
  const deltaPct = (recentBest - priorBest) / priorBest;
  let status: Status;
  if (deltaPct > PROGRESS_DEADBAND) status = 'progressing';
  else if (deltaPct < -PROGRESS_DEADBAND || stale) status = 'stalled';
  else status = 'holding';
  return { status, deltaPct, recentBest, priorBest, lastImprovedAt };
}

export function summarizeLift(lift: Lift, opts: { now?: number } = {}): LiftSummary {
  const series = (lift && lift.series) || [];
  const st = progressionStatus(series, opts);
  const bestPt = series.reduce<SeriesPoint | null>((b, p) => (!b || p.e1rm > b.e1rm ? p : b), null);
  const current = series.length ? series[series.length - 1] : null;
  return {
    key: lift.key, name: lift.name,
    currentE1rm: current ? current.e1rm : null,
    bestE1rm: bestPt ? bestPt.e1rm : null,
    status: st.status, deltaPct: st.deltaPct, lastImprovedAt: st.lastImprovedAt,
    topSet: bestPt ? { load: bestPt.load, reps: bestPt.reps, rpe: bestPt.rpe, e1rm: bestPt.e1rm } : null,
    series,
  };
}
