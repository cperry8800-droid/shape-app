// Mobile → unified-client-record mappers (Phase 1 of porting the website's
// dashboard engine to the app). PURE ESM: no window, no fetch, no DOM — so the
// same record shape the website's dashSignals engine consumes is built from the
// app's existing data, and the mappers are unit-testable in Node.
//
// The unified record shape + nullability rules live in
// public/newdesign/dashSignals.js (a rule whose inputs are null is SKIPPED, so a
// sparse mobile record never produces a false signal). `goalsFromDoc` is passed
// in (dependency injection) so this module stays engine-free and testable.

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function firstNum(...vals) {
  for (const v of vals) { const n = num(v); if (n != null) return n; }
  return null;
}
// Monday (UTC) of a 'YYYY-MM-DD' or ISO date, as a 'YYYY-MM-DD' key.
export function mondayKey(dateish) {
  if (!dateish) return null;
  const d = new Date(dateish);
  if (isNaN(d.getTime())) return null;
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
function normalizeWeighIns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      const on = (w && (w.on || w.date || w.logged_on || w.d)) || null;
      const weight = num(w && (w.weight ?? w.value ?? w.lb ?? w.kg));
      // Null-unit default must match the data layer (ShapeWeighIns.list) + the
      // backend (logWeighIn) + the goal default below — all 'kg' — so the engine
      // never compares a weigh-in series against a goal in a different unit.
      return on && weight != null ? { on: String(on).slice(0, 10), weight, unit: (w && w.unit) || 'kg' } : null;
    })
    .filter(Boolean);
}

// ── Coach view: one client's record from the get_client_* rollups the coach
// app already fetches (ShapeClientStats.get / .getLifts, ShapeGoalsApi). ───────
export function recordFromCoachData(raw = {}, deps = {}) {
  const { id, name, stats, lifts, goalsDoc, checkins, lastContact, recovery, vitals, coachDirective } = raw;
  const rec = { profile: { id: id || null, name: name || 'Client' } };

  if (stats && typeof stats === 'object') {
    const done = firstNum(stats.sessionsCompleted, stats.sessions && stats.sessions.completed);
    const planned = firstNum(stats.sessionsPlanned, stats.sessions && stats.sessions.planned);
    if (planned != null) {
      rec.trainingAdherence = { done: done == null ? 0 : done, planned, pct: planned ? Math.round(((done || 0) / planned) * 100) : null };
    }
    const days7 = firstNum(stats.daysLogged7d, stats.nutrition && stats.nutrition.daysLogged7d);
    if (days7 != null) rec.foodLogs = { lastLoggedOn: null, daysLogged7d: days7 };
    const avgCalories = firstNum(stats.avgCalories, stats.nutrition && stats.nutrition.avgCalories);
    const avgProtein = firstNum(stats.avgProtein, stats.nutrition && stats.nutrition.avgProtein);
    if (avgCalories != null || avgProtein != null) {
      rec.nutrition = {
        avgCalories, avgProtein,
        targetCalories: firstNum(stats.targetCalories, stats.nutrition && stats.nutrition.targetCalories),
        targetProtein: firstNum(stats.targetProtein, stats.nutrition && stats.nutrition.targetProtein),
      };
    }
    const totalWorkouts = firstNum(stats.workoutsLogged42d, stats.totalWorkouts, lifts && lifts.workoutsLogged42d);
    if (totalWorkouts != null) rec.totals = { workouts: totalWorkouts };
  }

  applyGoals(rec, goalsDoc, deps);
  applyCheckIn(rec, checkins);
  if (lastContact && typeof lastContact === 'object') rec.lastContact = lastContact;
  if (recovery && typeof recovery === 'object') rec.recovery = recovery;
  if (vitals && typeof vitals === 'object') rec.vitals = vitals;
  if (coachDirective && typeof coachDirective === 'object') rec.coachDirective = coachDirective;
  return rec;
}

// ── Client (self) view: the signed-in member's own record, from the live client
// APIs the app already calls (dashboard / nutrition / weigh-ins / goals). ──────
export function recordFromSelfData(raw = {}, deps = {}) {
  const { uid, name, dashboard, nutrition, weighIns, goalsDoc, checkins, recovery, vitals, coachDirective } = raw;
  const rec = { profile: { id: uid || null, name: name || 'You' } };

  const streak = firstNum(dashboard && dashboard.kpis && dashboard.kpis.streak, nutrition && nutrition.currentStreak);
  if (streak != null) {
    rec.streaks = { current: streak, best: firstNum(nutrition && nutrition.longestStreak) ?? streak };
  }

  const wi = normalizeWeighIns(weighIns || (dashboard && dashboard.goals && dashboard.goals.weighIns));
  if (wi.length) rec.weighIns = wi;

  if (nutrition && typeof nutrition === 'object') {
    const avgCalories = firstNum(nutrition.avgCalories, nutrition.kpis && nutrition.kpis.avgCalories);
    const avgProtein = firstNum(nutrition.avgProtein, nutrition.kpis && nutrition.kpis.avgProtein);
    if (avgCalories != null || avgProtein != null) {
      rec.nutrition = {
        avgCalories, avgProtein,
        targetCalories: firstNum(nutrition.targetCalories, nutrition.kpis && nutrition.kpis.targetCalories),
        targetProtein: firstNum(nutrition.targetProtein, nutrition.kpis && nutrition.kpis.targetProtein),
      };
    }
    const days7 = firstNum(nutrition.daysLogged7d, nutrition.kpis && nutrition.kpis.daysLogged7d);
    if (days7 != null) rec.foodLogs = { lastLoggedOn: null, daysLogged7d: days7 };
  }

  applyGoals(rec, goalsDoc, deps);
  applyCheckIn(rec, checkins);
  if (recovery && typeof recovery === 'object') rec.recovery = recovery;
  if (vitals && typeof vitals === 'object') rec.vitals = vitals;
  if (coachDirective && typeof coachDirective === 'object') rec.coachDirective = coachDirective;
  return rec;
}

// Build the engine's recovery.sleepHours from the progress rollup's sleep series
// (the same `series.sleep` the progress route returns). null when there is no
// real sleep data — never fabricated. Target is the engine default (7.5h).
export function sleepRecoveryFromProgress(progress) {
  const pts = (progress && progress.series && Array.isArray(progress.series.sleep)) ? progress.series.sleep : [];
  const vals = pts.map((p) => Number(p && p.value)).filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  const lastNight = vals[vals.length - 1];
  const last7 = vals.slice(-7);
  const avg7 = last7.reduce((a, b) => a + b, 0) / last7.length;
  return { sleepHours: { avg7, lastNight, target: 7.5 } };
}

// Build the engine's `vitals` leg from the SAME cached progress response the
// sleep leg reads (spec §3A): series.energy / series.hunger (1-10 gauges),
// series.hydration (liters), series.sleepQuality (the "rested" 1-10 gauge).
// A missing value is ABSENCE — junk rows are DROPPED, never coerced (Number(null)
// is a finite 0: the documented fabrication class). Each present leg carries the
// average of the LAST 7 real values + n (how many real values fed it) so the
// engine's minimum-days gates can refuse to fire on thin data. The `v > 0`
// filter is absence-safe for every leg: energy/hunger/rested carry a DB CHECK
// of 1-10, and a 0-liter hydration row is indistinguishable from a row another
// metric's write created (the sleep precedent — under-firing is the safe
// direction). `opts.hydrationTargetL` is the member's REAL stored target
// (user_goals client_nutrition_prefs, read via /api/client/hydration) — passed
// in and never defaulted here, so the hydration rule cannot fire against a
// fabricated target. Returns null when NO leg has real data.
export function vitalsFromProgress(progress, opts = {}) {
  const series = (progress && progress.series && typeof progress.series === 'object') ? progress.series : null;
  if (!series) return null;
  // The window is the last 7 CALENDAR DAYS, not the last 7 observations.
  // /api/client/progress returns up to 400 chronological snapshots with no
  // recency filter, so a bare .slice(-7) would let three low-energy readings
  // from MONTHS ago keep satisfying n >= 3 and fire a "this week" directive
  // (and a persisted notify snapshot) forever. Points carry an ISO
  // 'YYYY-MM-DD' date, so a lexicographic >= cutoff compare is exact and
  // tz-arithmetic-free; the cutoff is built from LOCAL date parts because
  // snapshot_date is written from the member's local day (_localDate()).
  // A point with no usable date is DROPPED — recency it cannot prove is
  // absence, which is the safe direction (under-firing, never over-firing).
  const now = opts.now instanceof Date ? opts.now : new Date();
  const cut = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const cutoff = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-${String(cut.getDate()).padStart(2, '0')}`;
  const leg = (key) => {
    const pts = Array.isArray(series[key]) ? series[key] : [];
    const vals = pts
      .filter((p) => p && typeof p.date === 'string' && p.date >= cutoff)
      .map((p) => num(p && p.value))
      .filter((v) => v != null && v > 0);
    if (!vals.length) return null;
    // Still cap at 7 — one day per date is the norm, but a duplicated date
    // must not let an 8th reading widen the "7-day" average it claims to be.
    const last7 = vals.slice(-7);
    return { avg7: last7.reduce((a, b) => a + b, 0) / last7.length, n: last7.length };
  };
  const energy = leg('energy');
  const hunger = leg('hunger');
  const rested = leg('sleepQuality');
  const hyd = leg('hydration');
  const targetL = num(opts.hydrationTargetL);
  const hydration = hyd ? { avg7L: hyd.avg7, targetL: targetL != null && targetL > 0 ? targetL : null, n: hyd.n } : null;
  if (!energy && !hunger && !hydration && !rested) return null;
  const out = {};
  if (energy) out.energy = energy;
  if (hunger) out.hunger = hunger;
  if (hydration) out.hydration = hydration;
  if (rested) out.rested = rested;
  return out;
}

// ── shared helpers ──────────────────────────────────────────────────────────
function applyGoals(rec, goalsDoc, deps) {
  if (!goalsDoc) return;
  if (typeof deps.goalsFromDoc === 'function') {
    try { const g = deps.goalsFromDoc(goalsDoc); if (Array.isArray(g) && g.length) rec.goals = g; } catch (e) { /* ignore */ }
  }
  const overall = goalsDoc.overall;
  if (overall && typeof overall === 'object') {
    const wi = normalizeWeighIns(overall.weighIns);
    if (wi.length && !rec.weighIns) rec.weighIns = wi;
    const target = num(overall.target);
    if (target != null) rec.goal = { target, unit: overall.unit || 'kg', now: num(overall.now) };
  }
}
function applyCheckIn(rec, checkins) {
  if (!Array.isArray(checkins) || !checkins.length) return;
  const c = checkins[0] || {};
  const wk = c.week_of || c.weekOf || c.on || c.created_at || c.date;
  const key = mondayKey(wk);
  if (key) rec.checkIn = { lastWeekOf: key };
}
