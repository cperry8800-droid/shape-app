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
import { recordFromCoachData, recordFromSelfData } from './signalsMap.mjs';

const engine = () => (typeof window !== 'undefined' && window.DashSignals) || null;
const deps = () => { const e = engine(); return { goalsFromDoc: e && e.goalsFromDoc }; };
const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : null; } catch (e) { return null; } };

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
  const [nutrition, train, weighIns, goalsDoc, checkins] = await Promise.all([
    SP && SP.nutrition ? SP.nutrition().catch(() => null) : null,
    SP && SP.train ? SP.train().catch(() => null) : null,
    window.ShapeWeighIns && window.ShapeWeighIns.list ? window.ShapeWeighIns.list().catch(() => null) : null,
    window.shapeDb && window.shapeDb.getUserGoals ? window.shapeDb.getUserGoals('client_goals').catch(() => null) : null,
    window.ShapeCheckins && window.ShapeCheckins.list ? window.ShapeCheckins.list().catch(() => null) : null,
  ]);
  // Fold train's streak into the nutrition object the mapper reads.
  const nut = Object.assign({}, nutrition || {});
  if (train && train.stats && train.stats.currentStreak != null && nut.currentStreak == null) nut.currentStreak = train.stats.currentStreak;
  if (train && train.stats && train.stats.longestStreak != null && nut.longestStreak == null) nut.longestStreak = train.stats.longestStreak;
  return recordFromSelfData({ uid, name, nutrition: nut, weighIns: Array.isArray(weighIns) ? weighIns : (weighIns && weighIns.weighIns) || null, goalsDoc, checkins }, deps());
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
  return pooled(clients, 4, async (c) => {
    const [stats, lifts, goalsDoc, checkins] = await Promise.all([
      window.ShapeClientStats && window.ShapeClientStats.get ? window.ShapeClientStats.get(c.id).catch(() => null) : null,
      window.ShapeClientStats && window.ShapeClientStats.getLifts ? window.ShapeClientStats.getLifts(c.id).catch(() => null) : null,
      window.ShapeGoalsApi && window.ShapeGoalsApi.getForClient ? window.ShapeGoalsApi.getForClient(c.id).catch(() => null) : null,
      window.ShapeClientKit && window.ShapeClientKit.checkins ? window.ShapeClientKit.checkins(c.id, 2).catch(() => null) : null,
    ]);
    return recordFromCoachData({ id: c.id, name: c.name, stats, lifts, goalsDoc, checkins }, deps());
  });
}

// ── Engine pass-throughs + the consumable API for Phase 2 ─────────────────────
window.ShapeSignals = {
  // The raw engine (same object the website's window.DashSignals exposes).
  engine,
  ready: () => !!engine(),

  // Record builders (live; null/[] when the data isn't there yet).
  selfRecord,
  coachRecords,

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

  // Client: "next milestone" + goal pace/ETA from the engine (pure, sync).
  milestones: (record) => { const e = engine(); return e ? (call(e.buildMilestones, record) || { earned: [], next: [] }) : { earned: [], next: [] }; },
  goalProjection: (goal) => { const e = engine(); return e ? call(e.projectGoal, goal) : null; },
  goalSlipDays: (goal) => { const e = engine(); return e ? call(e.goalSlipDays, goal) : null; },
  goalsFromDoc: (doc) => { const e = engine(); return e ? (call(e.goalsFromDoc, doc) || []) : []; },
};
