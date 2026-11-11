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
import { screeningState } from './coachIntake.mjs';

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
  const signedIn = !!uid;
  // §3D opt-out gate: when the member turned the daily check-in OFF, the vitals
  // leg AND the weekly check-in leg drop IMMEDIATELY on the client — home
  // directives and the persisted notify_snapshot go quiet at once instead of
  // waiting for data to age out. Absent module reads as ON.
  const checkinOff = typeof window !== 'undefined' && window.ShapeCheckinPref && typeof window.ShapeCheckinPref.on === 'function' && window.ShapeCheckinPref.on() === false;
  const CK = (typeof window !== 'undefined' && window.ShapeCheckins) || null;
  const [nutrition, train, weighIns, goalsDoc, checkins, prog, progress, hydro] = await Promise.all([
    SP && SP.nutrition ? SP.nutrition().catch(() => null) : null,
    SP && SP.train ? SP.train().catch(() => null) : null,
    window.ShapeWeighIns && window.ShapeWeighIns.list ? window.ShapeWeighIns.list().catch(() => null) : null,
    window.shapeDb && window.shapeDb.getUserGoals ? window.shapeDb.getUserGoals('client_goals').catch(() => null) : null,
    // ⚠ `mine`, NOT `list`. This read asked for `ShapeCheckins.list`, which never
    // existed (shapeBackend.js exports submit / mine / weekOf), so the guard
    // quietly answered null and the member's record never carried a check-in: the
    // engine's checkin_overdue could not fire, in the app's lead or in a push,
    // while the score cron charged −7 for every missed week. `mine` reads
    // client_checkins newest first, and the newest is all applyCheckIn reads.
    // A failed read answers [] or null, which leaves checkIn unset: no nag on a guess.
    signedIn && !checkinOff && CK && typeof CK.mine === 'function' ? CK.mine(1).catch(() => null) : null,
    window.ShapeProgramApi && window.ShapeProgramApi.get ? window.ShapeProgramApi.get().catch(() => null) : null,
    SP && SP.progress ? SP.progress().catch(() => null) : null,
    // The member's REAL hydration target. The GET returns TWO fields: `targetL`
    // is display-defaulted to 3.0 L for the hydration card, `targetStoredL` is
    // null until the member actually sets one. Only `targetStoredL` may feed the
    // engine — passing the display default would make the rule fire against a
    // target nobody chose, defeating its own absence gate. A failed read is
    // absence too, so the hydration rule simply cannot fire.
    window.ShapeHydration && window.ShapeHydration.get ? window.ShapeHydration.get().catch(() => null) : null,
  ]);
  // Fold train's streak into the nutrition object the mapper reads.
  const nut = Object.assign({}, nutrition || {});
  if (train && train.stats && train.stats.currentStreak != null && nut.currentStreak == null) nut.currentStreak = train.stats.currentStreak;
  if (train && train.stats && train.stats.longestStreak != null && nut.longestStreak == null) nut.longestStreak = train.stats.longestStreak;
  // The coach's directive override (if any) rides on the client's program detail;
  // it WINS in buildDirective. Signed-out preview seeds the demo sleep lever.
  const coachDirective = signedIn ? ((prog && prog.detail && prog.detail.directive) || null) : DEMO_SLEEP_DIRECTIVE;
  // Real sleep drives the engine's recovery lever for signed-in members
  // (signed-out keeps the demo seed so the preview still shows the lever).
  const recovery = signedIn
    ? sleepRecoveryFromProgress(progress)
    : { sleepHours: { avg7: 6.2, lastNight: null, target: 7.5, n: 5 } };
  // The check-in vitals leg (spec §3A) — energy/hunger/hydration/rested from the
  // SAME cached progress response. Signed-in only: the signed-out preview never
  // fabricates gauge data it doesn't have. Gated on `checkinOff` above.
  const vitals = signedIn && !checkinOff ? vitalsFromProgress(progress, { hydrationTargetL: hydro && hydro.targetStoredL }) : null;
  return recordFromSelfData({ uid, name, nutrition: nut, weighIns: Array.isArray(weighIns) ? weighIns : (weighIns && weighIns.weighIns) || null, goalsDoc, checkins, recovery, vitals, coachDirective }, deps());
}

// ── The coach's roster as unified records (coach triage surfaces). ────────────
async function coachClients(role, { strict = false } = {}) {
  try {
    if (window.ShapeAssign && window.ShapeAssign.clients) {
      const list = await window.ShapeAssign.clients(role, { strict });
      // paymentRetrying: a renewal Stripe is retrying (past_due); still a client, marked on the roster.
      return (Array.isArray(list) ? list : []).map((c) => ({ id: c.userId || c.id || c.user_id || null, name: c.name || c.full_name || 'Client', isNew: !!c.isNew, joinedAt: c.joinedAt || null, paymentRetrying: c.paymentRetrying === true })).filter((c) => c.id);
    }
  } catch (e) { if (strict) throw e; }
  if (strict) throw new Error('Client roster unavailable');
  return [];
}
// ⚠ ONE RECORD PER CLIENT, BUILT THE WAY THE WEBSITE BUILDS IT (P2, 2026-11-05). The app built its
// record from the get_client_* rollups, so it had no streak, Shape Score, calorie or protein targets
// or last-logged day, and a client red on the website read on track here. The roster's overviews
// (the website's own batch read) now go through the engine's one builder,
// DashSignals.recordFromOverview, for every client whose overview came back. A client whose overview
// did not come back is read the older way, so one failed build never hides a client.
function fromOverview(c, ov) {
  const e = engine();
  if (!ov || typeof ov !== 'object' || !e || typeof e.recordFromOverview !== 'function') return null;
  const rec = call(e.recordFromOverview, { id: c.id, name: c.name, isNew: c.isNew, joinedAt: c.joinedAt, paymentRetrying: c.paymentRetrying }, ov);
  if (!rec) return null;
  // ⚠ THE OVERVIEW ANSWERED, SO THE ENGINE JUDGES ITS DATES (F9, the engine audit), as the website's
  // record does: without this mark it took the record as current, and a client with nothing in two
  // weeks read "On plan — nothing needed" here and "Insufficient recent data" on the website.
  rec.progressRead = { state: 'ready', checkedAt: new Date().toISOString() };
  // What the app's rows show beside the engine's inputs: the retrying mark on the profile (as the
  // rollup path sets it) and the six-week workout count (get_client_lifts, on the overview too).
  if (c.paymentRetrying === true) rec.profile.paymentRetrying = true;
  const lifts = ov.lifts && typeof ov.lifts === 'object' ? ov.lifts : null;
  const wk = lifts && Number.isFinite(Number(lifts.workoutsLogged42d)) && lifts.workoutsLogged42d !== null ? Number(lifts.workoutsLogged42d) : null;
  if (wk != null) rec.totals = { workouts: wk };
  return rec;
}
async function coachRecords(role, options) {
  const clients = await coachClients(role, options);
  if (!clients.length) return [];
  // Last contact and the onboarding board, from the roster's overviews (fix 4, and L8: the app never
  // passed last contact, so a client nobody had written to was never flagged here, and the two views
  // disagreed). Best-effort: a missing overview leaves both unset, which the engine reads as not shared.
  let overviews = {};
  try {
    if (window.ShapeCareTeam && window.ShapeCareTeam.overviews) overviews = (await window.ShapeCareTeam.overviews(clients.map((c) => c.id))) || {};
  } catch (e) { /* ignore */ }
  // Batch the roster's recent sleep + check-in vitals in ONE call (RLS-scoped to
  // this coach's clients) so the engine's sleep-recovery + energy/hunger rules can
  // flag in the "who needs you" feed — only for the clients whose overview (which
  // carries both) did not come back. The widened /api/coach/roster-sleep response
  // rides each entry as { sleepHours?, vitals? } — a pre-widening server returns
  // sleepHours-only entries, which map through unchanged. Best-effort — {} on any
  // failure, so triage never blocks on it.
  const rest = clients.filter((c) => !(overviews[c.id] && typeof overviews[c.id] === 'object'));
  let sleepByClient = {};
  try {
    if (rest.length && window.ShapeRosterSleep && window.ShapeRosterSleep.get) {
      sleepByClient = (await window.ShapeRosterSleep.get(rest.map((c) => c.id))) || {};
    }
  } catch (e) { /* ignore */ }
  return pooled(clients, 4, async (c) => {
    const built = fromOverview(c, overviews[c.id]);
    if (built) return built;
    const kit = window.ShapeClientKit || {};
    const [stats, lifts, goalsDoc, checkins, health, intake] = await Promise.all([
      window.ShapeClientStats && window.ShapeClientStats.get ? window.ShapeClientStats.get(c.id).catch(() => null) : null,
      window.ShapeClientStats && window.ShapeClientStats.getLifts ? window.ShapeClientStats.getLifts(c.id).catch(() => null) : null,
      window.ShapeGoalsApi && window.ShapeGoalsApi.getForClient ? window.ShapeGoalsApi.getForClient(c.id).catch(() => null) : null,
      // ⚠ THREE STATES, AND ONLY FOR A SUBSCRIBER (Fable on fix 4). An empty list is the claim "no
      // check-in" (red past the new weeks), so it must come from a read that answered: kit.checkins
      // returns [] on an error too. And a booking-only client (no joinedAt: no subscription) is one
      // get_client_checkins answers [] by design, which is "not shared", so it is not read at all.
      kit.checkinsKnown && c.joinedAt ? kit.checkinsKnown(c.id, 2).catch(() => null) : null,
      // The health screening for Needs you (review M17): { ok, data }, so a failed read is
      // 'unknown' and never "missing". "Missing" also needs the coach-only intake read to have
      // answered, which says this coach IS theirs (the website's overview applies the same rule).
      kit.healthRead ? kit.healthRead(c.id).then((data) => ({ ok: true, data }), () => ({ ok: false })) : null,
      kit.intake ? kit.intake(c.id).then((data) => ({ ok: true, data }), () => ({ ok: false })) : null,
    ]);
    const screening = health && health.ok && health.data
      ? screeningState(health.data, false)
      : screeningState(null, !(health && health.ok) || !(intake && intake.ok && intake.data));
    // Split the roster entry into the two record legs: recovery carries ONLY the
    // sleepHours shape recoveryRead consumes; vitals is the engine's §3A leg.
    // An entry with vitals but no sleep must not fabricate a recovery leg.
    const rs = sleepByClient[c.id] || null;
    const ov = overviews[c.id] || null;
    return recordFromCoachData({
      id: c.id, name: c.name, isNew: c.isNew, joinedAt: c.joinedAt, stats, lifts, goalsDoc, checkins, screening, paymentRetrying: c.paymentRetrying,
      lastContact: ov && ov.lastContact ? ov.lastContact : null,
      onboarding: ov && ov.onboarding ? ov.onboarding : null,
      recovery: rs && rs.sleepHours ? { sleepHours: rs.sleepHours } : null,
      vitals: rs && rs.vitals ? rs.vitals : null,
    }, deps());
  });
}

// The coach's own tuning of the signals (Settings → "Flags · when a client reaches you", the same
// `coach_settings` doc the website's Settings writes), re-validated by the engine. ⚠ The app ran on
// the house thresholds while the website and the push ran on the coach's, so a coach who raised the
// food-log gap still saw those clients flagged on the phone. null = house policy.
// Resolved for the role the roster is: the house values under the tuning are that role's (a trainer's
// food-log gap is 5 days).
async function coachThresholds(role) {
  try {
    const e = engine();
    const db = window.shapeDb;
    if (!e || typeof e.resolveThresholds !== 'function' || !db || !db.getUserGoals) return null;
    const doc = await db.getUserGoals('coach_settings');
    const t = doc && typeof doc === 'object' && doc.thresholds && typeof doc.thresholds === 'object' ? doc.thresholds : null;
    return t ? e.resolveThresholds(t, role).thresholds : null;
  } catch (e) { return null; }
}
// The coach's dismissals (coach_signal_dismissals, via ShapeSignalDismissals) and check-in reviews
// (coach_week_reviews), which the engine reads off each record (attachCoachContext). Each null when
// unread, which hides nothing and keeps "check-in waiting" quiet.
async function coachContext() {
  const [dismissals, reviews] = await Promise.all([
    (async () => { try { return window.ShapeSignalDismissals && window.ShapeSignalDismissals.list ? await window.ShapeSignalDismissals.list() : null; } catch (e) { return null; } })(),
    (async () => { try { const db = window.shapeDb; const d = db && db.getUserGoals ? await db.getUserGoals('coach_week_reviews') : null; return d && typeof d === 'object' ? d : null; } catch (e) { return null; } })(),
  ]);
  return { dismissals: Array.isArray(dismissals) ? dismissals : null, reviews };
}

// Live-roster triage, cached + de-duped per role (so the coach Today card and
// the Clients page share ONE fetch). NO mock fallback — returns [] when there's
// no live roster, so the UI can fall back to its own rich demo roster and keep
// the two surfaces in agreement.
const _triageCache = {}; // role → { at, promise }
async function triageLive(role, { force = false } = {}) {
  const now = Date.now();
  const uid = window.ShapeAuth?.getCachedState?.().user?.id;
  if (!uid) return [];
  const key = `${uid}:${role}`;
  const hit = _triageCache[key];
  if (!force && hit && now - hit.at < 30000) return hit.promise;
  const promise = (async () => {
    const e = engine(); if (!e) throw new Error('Client signals unavailable');
    const [records, thresholds, ctx] = await Promise.all([coachRecords(role, { strict: true }), coachThresholds(role), coachContext()]);
    if (!records.length) return [];
    // This role's dismissals only (a coach with both listings sets a reason aside per role).
    const withCtx = typeof e.attachCoachContext === 'function' ? (call(e.attachCoachContext, records, ctx, role) || records) : records;
    return call(e.getTriageFeed, role, withCtx, undefined, thresholds || undefined) || [];
  })();
  _triageCache[key] = { at: now, promise };
  promise.catch(() => { if (_triageCache[key]?.promise === promise) delete _triageCache[key]; });
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
  // Coach: clients flagged in BOTH training + nutrition, with a co-coach on the other side → one joint note.
  // ⚠ THE VIEWER'S OWN SIDE AT THEIR OWN TUNING, as the website reads it (dashData's joint): the
  // co-coach's side reads at the co-coach's (the overview's flagLines, #2691), so a house-line own side
  // had a trainer who moved MISSED_SESSIONS to 6 find a joint case at the house 3 that their
  // nutritionist, reading the trainer's 6, did not (Codex on #2691). Unread tuning is the house line.
  async jointAttention(role) {
    const e = engine(); if (!e) return [];
    const [records, thresholds] = await Promise.all([coachRecords(role), coachThresholds(role)]);
    return call(e.findJointAttention, records.length ? records : (call(e.buildMockClients) || []), undefined, thresholds || null, role) || [];
  },

  // Dismiss (until the reason changes: `until` null) or snooze (until an ISO time) one reason on one
  // client, or undo it (P2), as `role` (the coach role the client is read as: a coach with both
  // listings sets a reason aside per role; no role saves nothing). The next triage reads it; the cached
  // feed is dropped so Today and Clients re-read at once. Resolves true when saved.
  async dismiss(clientId, flag, until, role) {
    const D = window.ShapeSignalDismissals;
    const ok = !!(role && D && D.set && await D.set(clientId, flag, until || null, role).catch(() => false));
    if (ok) { for (const k of Object.keys(_triageCache)) delete _triageCache[k]; try { window.dispatchEvent(new CustomEvent('shape:signalsChanged')); } catch (e) {} }
    return ok;
  },
  async restore(clientId, key, role) {
    const D = window.ShapeSignalDismissals;
    const ok = !!(role && D && D.clear && await D.clear(clientId, key, role).catch(() => false));
    if (ok) { for (const k of Object.keys(_triageCache)) delete _triageCache[k]; try { window.dispatchEvent(new CustomEvent('shape:signalsChanged')); } catch (e) {} }
    return ok;
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
