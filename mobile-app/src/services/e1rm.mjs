// Estimated 1-rep max (Epley) + a strength progression verdict, folded over a
// per-lift series of best-set e1RMs. The /api/client/strength route, the TS
// twin src/lib/e1rm.ts, and the get_client_lifts SQL ALL mirror this — keep
// them in sync. Pure (no deps, no I/O) so it's the tested source of truth.
// Run: node --test

export const E1RM_MAX_REPS = 12;        // Epley is unreliable beyond ~12 reps
export const PROGRESS_DEADBAND = 0.02;  // within ±2% of prior best = "holding"
export const STALL_WEEKS = 3;           // no new all-time high for ≥3 wks → "stalled"
export const RECENT_WINDOW_DAYS = 14;

const DAY_MS = 86400000;
const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
const dayMs = (d) => new Date(String(d) + 'T00:00:00Z').getTime();

export function epleyE1rm(load, reps) {
  const w = Number(load);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r < 1 || r > E1RM_MAX_REPS) return null;
  if (r <= 1) return w;                  // a true single — no estimate inflation
  return w * (1 + r / 30);
}

// rows: [{ key|move_name|moveName, name, date:'YYYY-MM-DD', load, reps, rpe, completed }]
// → [{ key, name, series:[{date,e1rm,load,reps,rpe}] }]  (best qualifying set per day)
export function buildLiftSeries(rows) {
  const byLift = new Map();
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
    const pt = {
      date: day,
      e1rm: round1(e1),
      load: Number(r.load),
      reps: Number(r.reps),
      rpe: Number.isFinite(Number(r.rpe)) ? Number(r.rpe) : null,
    };
    const cur = lift.days.get(day);
    if (!cur || pt.e1rm > cur.e1rm) lift.days.set(day, pt);
  }
  return [...byLift.values()].map((l) => ({
    key: l.key,
    name: l.name || l.key,
    series: [...l.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export function progressionStatus(series, opts = {}) {
  const pts = (series || []).filter((p) => p && Number.isFinite(p.e1rm));
  const now = opts.now != null ? Number(opts.now) : Date.now();
  if (pts.length < 2) {
    return {
      status: 'building',
      deltaPct: null,
      recentBest: pts.length ? pts[pts.length - 1].e1rm : null,
      priorBest: null,
      lastImprovedAt: pts.length ? pts[pts.length - 1].date : null,
    };
  }
  const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
  let runMax = -Infinity, lastImprovedAt = sorted[0].date;
  for (const p of sorted) { if (p.e1rm > runMax) { runMax = p.e1rm; lastImprovedAt = p.date; } }
  const recentCut = now - RECENT_WINDOW_DAYS * DAY_MS;
  const recent = sorted.filter((p) => dayMs(p.date) >= recentCut);
  const prior = sorted.filter((p) => dayMs(p.date) < recentCut);
  const maxOf = (arr) => (arr.length ? Math.max(...arr.map((p) => p.e1rm)) : null);
  const recentBest = maxOf(recent);
  const priorBest = maxOf(prior);
  const stale = (now - dayMs(lastImprovedAt)) / (7 * DAY_MS) >= STALL_WEEKS;

  if (priorBest == null) {
    const first = recent[0].e1rm, last = recent[recent.length - 1].e1rm;
    const dp = (last - first) / first;
    return { status: dp > PROGRESS_DEADBAND ? 'progressing' : 'holding', deltaPct: dp, recentBest, priorBest: first, lastImprovedAt };
  }
  if (recentBest == null) {
    return { status: stale ? 'stalled' : 'holding', deltaPct: null, recentBest: null, priorBest, lastImprovedAt };
  }
  const deltaPct = (recentBest - priorBest) / priorBest;
  let status;
  if (deltaPct > PROGRESS_DEADBAND) status = 'progressing';
  else if (deltaPct < -PROGRESS_DEADBAND || stale) status = 'stalled';
  else status = 'holding';
  return { status, deltaPct, recentBest, priorBest, lastImprovedAt };
}

export function summarizeLift(lift, opts = {}) {
  const series = (lift && lift.series) || [];
  const st = progressionStatus(series, opts);
  const bestPt = series.reduce((b, p) => (!b || p.e1rm > b.e1rm ? p : b), null);
  const current = series.length ? series[series.length - 1] : null;
  return {
    key: lift.key,
    name: lift.name,
    currentE1rm: current ? current.e1rm : null,
    bestE1rm: bestPt ? bestPt.e1rm : null,
    status: st.status,
    deltaPct: st.deltaPct,
    lastImprovedAt: st.lastImprovedAt,
    topSet: bestPt ? { load: bestPt.load, reps: bestPt.reps, rpe: bestPt.rpe, e1rm: bestPt.e1rm } : null,
    series,
  };
}
