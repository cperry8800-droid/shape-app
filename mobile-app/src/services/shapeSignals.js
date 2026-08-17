// Phase 1 — share the website dashboard's signal ENGINE with the app.
//
// The engine (public/newdesign/dashSignals.js) is a pure UMD module: imported
// here for its side effect, it registers `window.DashSignals` (the same global
// the website uses). This is the ONE source of truth — website, Node tests, and
// this app all run the identical rules. We add a thin app-side layer that builds
// the unified client record from the app's existing data (ShapeClientStats /
// ShapeGoalsApi / ShapeProgress / …) and exposes `window.ShapeSignals` for the
// UI to consume in Phase 2. Nothing renders yet — this is the foundation.
import '../../../public/newdesign/dashSignals.js'; // → window.DashSignals
import { recordFromCoachData, recordFromSelfData, sleepRecoveryFromProgress, vitalsFromProgress } from './signalsMap.mjs';

const engine = () => (typeof window !== 'undefined' && window.DashSignals) || null;
const deps = () => { const e = engine(); return { goalsFromDoc: e && e.goalsFromDoc }; };
const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : null; } catch (e) { return null; } };

// Signed-out PREVIEW only: a demo coach-flagged sleep lever so the home "Your
// move" illustrates the cross-domain directive (the deficit's fine, sleep is the
// lever). Real signed-in accounts use only their own real signals + any real
// coach override — never this.
const DEMO_SLEEP_DIRECTIVE = {
  lever: 'sleep',
  verdict: 'Sleep is the lever',
  reason: "Deficit's fine — sleep is stalling recovery; tonight: lights out by 11.",
  action: { label: "Log last night's sleep", kind: 'log_sleep' },
  setBy: 'coach-demo',
};

// Run up to `cap` async tasks at a time (mirrors the website's shared-overview
// pool so a large roster doesn't fire N requests at once).
async function pooled(items, cap, worker) {
  const out = new Array(items.length);
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); } catch (e) { out[idx] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(cap, items.length || 1) }, run));
  return out;
}

// ── The signed-in member's own record (client "what to do" surfaces). ─────────
async function selfRecord() {
  const SP = (typeof window !== 'undefined' && window.ShapeProgress) || null;
  const uid = (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id) || null;
  const name = (typeof window !== 'undefined' && typeof window.bsMyName === 'function') ? window.bsMyName() : 'You';
  const [nutrition, train, weighIns, goalsDoc, checkins, prog, progress, hydro] = await Promise.all([
    SP && SP.nutrition ? SP.nutrition().catch(() => null) : null,
    SP && SP.train ? SP.train().catch(() => null) : null,
    window.ShapeWeighIns && window.ShapeWeighIns.list ? window.ShapeWeighIns.list().catch(() => null) : null,
    window.shapeDb && window.shapeDb.getUserGoals ? window.shapeDb.getUserGoals('client_goals').catch(() => null) : null,
    window.ShapeCheckins && window.ShapeCheckins.list ? window.ShapeCheckins.list().catch(() => null) : null,
    window.ShapeProgramApi && window.ShapeProgramApi.get ? window.ShapeProgramApi.get().catch(() => null) : null,
    SP && SP.progress ? SP.progress().catch(() => null) : null,
    // The member's REAL hydration target (user_goals client_nutrition_prefs via
    // /api/client/hydration GET). Only feeds vitals.hydration.targetL — a failed
    // read means no target, which means the hydration rule cannot fire (absence,
    // never a fabricated default).
    window.ShapeHydration && window.ShapeHydration.get ? window.ShapeHydration.get().catch(() => null) : null,
  ]);
  // Fold train's streak into the nutrition object the mapper reads.
  const nut = Object.assign({}, nutrition || {});
  if (train && train.stats && train.stats.currentStreak != null && nut.currentStreak == null) nut.currentStreak = train.stats.currentStreak;
  if (train && train.stats && train.stats.longestStreak != null && nut.longestStreak == null) nut.longestStreak = train.stats.longestStreak;
  // The coach's directive override (if any) rides on the client's program detail;
  // it WINS in buildDirective. Signed-out preview seeds the demo sleep lever.
  const signedIn = !!uid;
  const coachDirective = signedIn ? ((prog && prog.detail && prog.detail.directive) || null) : DEMO_SLEEP_DIRECTIVE;
  // Real sleep drives the engine's recovery lever for signed-in members
  // (signed-out keeps the demo seed so the preview still shows the lever).
  const recovery = signedIn
    ? sleepRecoveryFromProgress(progress)
    : { sleepHours: { avg7: 6.2, lastNight: null, target: 7.5 } };
  // The check-in vitals leg (spec §3A) — energy/hunger/hydration/rested from the
  // SAME cached progress response. Signed-in only: the signed-out preview never
  // fabricates gauge data it doesn't have.
  const vitals = signedIn ? vitalsFromProgress(progress, { hydrationTargetL: hydro && hydro.targetL }) : null;
  return recordFromSelfData({ uid, name, nutrition: nut, weighIns: Array.isArray(weighIns) ? weighIns : (weighIns && weighIns.weighIns) || null, goalsDoc, checkins, recovery, vitals, coachDirective }, deps());
}

// ── The coach's roster as unified records (coach triage surfaces). ────────────
async function coachClients(role) {
  try {
    if (window.ShapeAssign && window.ShapeAssign.clients) {
      const list = await window.ShapeAssign.clients(role);
      return (Array.isArray(list) ? list : []).map((c) => ({ id: c.userId || c.id || c.user_id || null, name: c.name || c.full_name || 'Client' })).filter((c) => c.id);
    }
  } catch (e) { /* fall through */ }
  return [];
}
async function coachRecords(role) {
  const clients = await coachClients(role);
  if (!clients.length) return [];
  // Batch the roster's recent sleep + check-in vitals in ONE call (RLS-scoped to
  // this coach's clients) so the engine's sleep-recovery + energy/hunger rules can
  // flag in the "who needs you" feed. The widened /api/coach/roster-sleep response
  // rides each entry as { sleepHours?, vitals? } — a pre-widening server returns
  // sleepHours-only entries, which map through unchanged. Best-effort — {} on any
  // failure, so triage never blocks on it.
  let sleepByClient = {};
  try {
    if (window.ShapeRosterSleep && window.ShapeRosterSleep.get) {
      sleepByClient = (await window.ShapeRosterSleep.get(clients.map((c) => c.id))) || {};
    }
  } catch (e) { /* ignore */ }
  return pooled(clients, 4, async (c) => {
    const [stats, lifts, goalsDoc, checkins] = await Promise.all([
      window.ShapeClientStats && window.ShapeClientStats.get ? window.ShapeClientStats.get(c.id).catch(() => null) : null,
      window.ShapeClientStats && window.ShapeClientStats.getLifts ? window.ShapeClientStats.getLifts(c.id).catch(() => null) : null,
      window.ShapeGoalsApi && window.ShapeGoalsApi.getForClient ? window.ShapeGoalsApi.getForClient(c.id).catch(() => null) : null,
      window.ShapeClientKit && window.ShapeClientKit.checkins ? window.ShapeClientKit.checkins(c.id, 2).catch(() => null) : null,
    ]);
    // Split the roster entry into the two record legs: recovery carries ONLY the
    // sleepHours shape recoveryRead consumes; vitals is the engine's §3A leg.
    // An entry with vitals but no sleep must not fabricate a recovery leg.
    const rs = sleepByClient[c.id] || null;
    return recordFromCoachData({
      id: c.id, name: c.name, stats, lifts, goalsDoc, checkins,
      recovery: rs && rs.sleepHours ? { sleepHours: rs.sleepHours } : null,
      vitals: rs && rs.vitals ? rs.vitals : null,
    }, deps());
  });
}

// Live-roster triage, cached + de-duped per role (so the coach Today card and
// the Clients page share ONE fetch). NO mock fallback — returns [] when there's
// no live roster, so the UI can fall back to its own rich demo roster and keep
// the two surfaces in agreement.
const _triageCache = {}; // role → { at, promise }
async function triageLive(role) {
  const now = Date.now();
  const hit = _triageCache[role];
  if (hit && now - hit.at < 30000) return hit.promise;
  const promise = (async () => {
    const e = engine(); if (!e) return [];
    const records = await coachRecords(role);
    if (!records.length) return [];
    return call(e.getTriageFeed, role, records) || [];
  })();
  _triageCache[role] = { at: now, promise };
  promise.catch(() => { if (_triageCache[role] && _triageCache[role].promise === promise) delete _triageCache[role]; });
  return promise;
}

// ── Engine pass-throughs + the consumable API for Phase 2 ─────────────────────
window.ShapeSignals = {
  // The raw engine (same object the website's window.DashSignals exposes).
  engine,
  ready: () => !!engine(),

  // Record builders (live; null/[] when the data isn't there yet).
  selfRecord,
  coachRecords,

  // Live-roster triage feed (severity-ranked; NO mock fallback, cached 30s per
  // role). [] when there's no live roster → the UI shows its demo roster instead.
  triageLive,

  // Coach: severity-ranked at-risk feed ("who needs you and why"). Falls back to
  // the engine's demo personas when there's no live roster (signed-out preview).
  async triage(role) {
    const e = engine(); if (!e) return [];
    let records = await coachRecords(role);
    if (!records.length) records = call(e.buildMockClients) || [];
    return call(e.getTriageFeed, role, records) || [];
  },
  // Coach: clients flagged in BOTH training + nutrition → one joint note.
  async jointAttention(role) {
    const e = engine(); if (!e) return [];
    const records = await coachRecords(role);
    return call(e.findJointAttention, records.length ? records : (call(e.buildMockClients) || [])) || [];
  },

  // The ONE directive (verdict + cross-domain reason + single action) + the
  // coach read, from the shared engine — the coach override on the record wins.
  directive: (record) => { const e = engine(); return e ? call(e.buildDirective, record, new Date(), 'client') : null; },

  // Client: "next milestone" + goal pace/ETA from the engine (pure, sync).
  milestones: (record) => { const e = engine(); return e ? (call(e.buildMilestones, record) || { earned: [], next: [] }) : { earned: [], next: [] }; },
  goalProjection: (goal) => { const e = engine(); return e ? call(e.projectGoal, goal) : null; },
  goalSlipDays: (goal) => { const e = engine(); return e ? call(e.goalSlipDays, goal) : null; },
  goalsFromDoc: (doc) => { const e = engine(); return e ? (call(e.goalsFromDoc, doc) || []) : []; },
};
