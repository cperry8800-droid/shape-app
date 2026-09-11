// useDashboard(role) — the single dashboard data layer (roadmap Phase 2.1/2.2).
//
// Returns { loading, clients, triage } where `clients` is an array of unified
// client records (shape documented in dashSignals.js) and `triage` is
// DashSignals.getTriageFeed(role, clients) — clients sorted red → amber →
// green with human-readable reasons.
//
// Source resolution (the UI never knows which it got):
//   1. LIVE — roster from /api/{role}/clients, then per-client enrichment from
//      /api/clients/{id}/shared-overview (share-gated RPCs), fetched through a
//      small concurrency pool with a 60s module cache, plus ONE read of the
//      coach's own notes doc for the whole roster. Fields the APIs still don't
//      expose (goal phase, milestones) stay null — the signal engine skips
//      rules with missing inputs, so a live account never gets a false alarm
//      from absent data.
//   2. DEMO — DashSignals.buildMockClients() when signed out / not this role /
//      the API is unreachable. Same record shape, fully populated.
//
// role: 'trainer' | 'nutritionist' | 'client' (client = one self record).
//
// Requires dashSignals.js to be loaded first (plain <script src="dashSignals.js">).

const DASH_CACHE_TTL = 60 * 1000;
const DASH_POOL_SIZE = 4;
const _dashCache = new Map(); // key -> { at, data }

async function _dashJson(url) {
  const hit = _dashCache.get(url);
  if (hit && Date.now() - hit.at < DASH_CACHE_TTL) return hit.data;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  _dashCache.set(url, { at: Date.now(), data });
  return data;
}

// Run tasks through a fixed-size pool so a 30-client roster doesn't fire 30
// parallel requests. Each task failure resolves null (enrichment is optional).
async function _dashPool(items, worker, size = DASH_POOL_SIZE) {
  const out = new Array(items.length).fill(null);
  let i = 0;
  const lane = async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); } catch (e) { out[idx] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  return out;
}

// Map one roster row + its (optional) shared-overview into a unified record.
//
// `notesByClient` is the coach's own `coach_client_notes` doc, read ONCE for
// the whole roster (a per-client read would be one round trip per row for a
// document that already holds every row).
function _dashRecordFromLive(row, ov, notesByClient) {
  const stats = ov && ov.stats ? ov.stats : null;
  const checkins = ov && Array.isArray(ov.checkins) ? ov.checkins : null;
  const goals = ov && ov.goals ? ov.goals : null;
  const weighIns = goals && goals.overall && Array.isArray(goals.overall.weighIns)
    ? goals.overall.weighIns
        .map((w) => ({ on: w.on || w.date || w.d || null, weight: w.w != null ? w.w : w.weight != null ? w.weight : w.kg, unit: w.unit || (w.kg != null ? "kg" : "lb") }))
        .filter((w) => w.on && w.weight != null)
    : null;
  const phases = ov && ov.programPhases ? ov.programPhases : null;
  // ── The R4 legs (review 2026-09-09). Each was hardcoded null here until
  // /api/clients/[id]/shared-overview started deriving it, which is why the
  // roster's SCORE · PROGRAM · STREAK · LAST CONTACT columns read "Not shared"
  // on every live row while the demo showed all four.
  const logs = ov && ov.logs ? ov.logs : null;
  // ⚠ "no logs" and "logs aren't shared" are DIFFERENT empties, and the drawer
  // renders a different sentence for each. A null `logs` from a response that
  // CARRIES the key means the window is genuinely empty ([]); a response
  // without the key is an older deploy and stays null.
  const logsKnown = !!(ov && Object.prototype.hasOwnProperty.call(ov, "logs"));
  const score = ov && ov.scoreHistory ? ov.scoreHistory : null;
  // ⚠ `partial` RIDES ALONG AND MUST NOT BE DROPPED. The newest bucket is the
  // week in progress, and DashSignals.scoreWeekReading uses the flag to keep a
  // week-over-week delta comparing two COMPLETE weeks — without it every
  // actively-logging client reads as a mid-week collapse on a Monday.
  const scoreWeeks = score && Array.isArray(score.weeks)
    ? score.weeks
        .filter((w) => w && w.weekOf && w.points != null && isFinite(Number(w.points)))
        .map((w) => ({ weekOf: w.weekOf, points: Number(w.points), partial: !!w.partial }))
        .slice(-8)
    : null;
  const streak = score && score.streak && score.streak.current != null ? score.streak : null;
  const targets = ov && ov.nutritionTargets ? ov.nutritionTargets : null;
  // One note per client today (the client page keeps a single running note),
  // carried as the engine's [{ on, text }] list so the drawer needs no special
  // case and a future multi-note store drops straight in.
  //
  // ⚠ FOUR STATES, one more than `recentLogs` needs: a list when there is a
  // note, [] when the doc was READ and holds none for this client, null when
  // the read FAILED, and undefined while it has not been attempted — which is
  // the fast-paint pass, before enrichment resolves. Without that fourth state
  // a coach who opens a drawer during the enrichment window is told the read
  // failed before it has been tried.
  const notesPending = notesByClient === undefined;
  const notesRead = !notesPending && notesByClient && typeof notesByClient === "object";
  const note = notesRead && row.id ? notesByClient[row.id] : null;
  const noteText = note && typeof note.text === "string" && note.text.trim() ? note.text.trim() : null;
  return {
    profile: { id: row.id, name: row.name, isNew: !!row.isNew, status: row.status || null },
    trainingAdherence: stats && stats.sessionsPlanned
      ? { pct: Math.round((stats.sessionsCompleted / stats.sessionsPlanned) * 100), done: stats.sessionsCompleted, planned: stats.sessionsPlanned }
      : null,
    // `daysLogged7d` stays the get_client_stats rollup where it exists — it is
    // the number every other surface already quotes, and two counts that
    // disagree is worse than one that is a day coarse. The snapshot leg only
    // supplies it when the rollup has none.
    foodLogs: stats && stats.daysLogged7d != null
      ? { lastLoggedOn: logs ? logs.lastLoggedOn : null, daysLogged7d: stats.daysLogged7d }
      : logs
        ? { lastLoggedOn: logs.lastLoggedOn, daysLogged7d: logs.daysLogged7d }
        : null,
    // Null until `2026-09-09-client-score-history-coach-read.sql` is applied —
    // the RPC 404s before that and the column keeps its honest "Not shared".
    shapeScoreHistory: scoreWeeks && scoreWeeks.length ? scoreWeeks : null,
    weighIns,
    streaks: streak
      ? { current: streak.current, best: streak.best != null ? streak.best : streak.current, lastActiveOn: streak.lastActiveOn || null }
      : null,
    lastContact: ov && ov.lastContact ? ov.lastContact : null,
    checkIn: checkins ? { lastWeekOf: checkins.length ? checkins[0].week_of || checkins[0].weekOf || null : null } : null,
    // The last few check-ins themselves (week_of · ratings · wins · struggles ·
    // question · weight), so the Week view can read a client's week without a
    // second round trip; the engine keeps reading the summary above.
    checkins: checkins || null,
    // The targets are the coach's own (client_programs.detail.nutrition) — the
    // ledger and protein rules need a value AND a target, so without these
    // they skipped every live client.
    nutrition: stats && (stats.avgCalories != null || stats.avgProtein != null)
      ? {
          avgCalories: stats.avgCalories,
          targetCalories: targets ? targets.calories : null,
          avgProtein: stats.avgProtein,
          targetProtein: targets ? targets.protein : null,
        }
      : null,
    goal: goals && goals.overall && goals.overall.target != null
      ? { target: Number(goals.overall.target), unit: goals.overall.unit || "lb", now: goals.overall.now != null ? Number(goals.overall.now) : null }
      : null,
    // Pro-set goals (client_programs.detail.goals) + the share-gated self doc,
    // normalized through the engine; the weight goal inherits live weigh-ins.
    goals: ov && (ov.coachGoals || goals)
      ? DashSignals.goalsFromDoc({
          coach: ov.coachGoals || null,
          overall: goals && goals.overall ? goals.overall : null,
          weighIns: weighIns || [],
          training: goals && goals.training, nutrition: goals && goals.nutrition,
        })
      : null,
    goalPhase: phases ? phases.nutrition || phases.training || null : null,
    // The block the CALLER assigned, and the week it is in — counted from the
    // assignment and capped at the template's length (src/lib/coach-client-legs.mjs).
    program: ov && ov.program ? ov.program : null,
    coachNotes: noteText
      ? [{ on: note.updatedAt ? String(note.updatedAt).slice(0, 10) : null, text: noteText }]
      : notesRead ? [] : notesPending ? undefined : null,
    recentLogs: logs ? logs.recent : logsKnown ? [] : null,
    milestones: null,
    // ⚠ `?? null`, NEVER `|| 0`. The roster route sends mrrCents: null when its
    // subscriptions read FAILED; `|| 0` would relabel that as a measured $0/mo
    // on every row. 0 stays 0 — a client on no paid plan is a real answer.
    // ⚠ `?? null` ON EVERY MONEY FIELD, NOT `|| 0`. The route sends null when the
    // subscriptions read FAILED, and the two are indistinguishable on every input
    // except the one that matters — a coerced zero publishes "this client pays
    // nothing" as a measurement. `feeCents`/`origin` are the R12 export's columns and
    // follow the same rule.
    payments: {
      mrrCents: row.mrrCents ?? null, status: "active",
      lastSessionAt: row.lastAt || null, joinedAt: row.joinedAt || null,
      feeCents: row.feeCents ?? null, origin: row.origin ?? null,
    },
  };
}

// The coach's own client notes, one read for the whole roster.
//
// ⚠ getSession() BEFORE getUserGoals, ALWAYS. getUserGoals resolves the user
// through client.auth.getUser(), which does NOT bootstrap the Next.js
// cookie-session bridge — on a page where nothing in localStorage carries the
// session, a signed-in coach reads as ANON and every note silently reads
// empty. The same guard is on the writer in coachClientDetail.jsx.
//
// ⚠ NULL means "could not read", {} means "read it, nothing in it" — and
// getUserGoals returns null for BOTH "not signed in" and "the read failed", so
// every one of those is a can't-know. The record's `coachNotes` is null in the
// first case and [] in the second, which is what lets the drawer say "couldn't
// read your notes" instead of asserting the coach never wrote one.
//
// Never throws: notes are an enrichment, and a roster must never fail to paint
// because a note doc could not be read.
async function _dashCoachNotes() {
  try {
    const db = window.shapeDb;
    if (!db || !db.getUserGoals) return null;
    try { if (db.getSession) await db.getSession(); } catch (e) { /* fall through as anon */ }
    const doc = await db.getUserGoals("coach_client_notes");
    return doc && typeof doc === "object" ? doc : null;
  } catch (e) { return null; }
}

// The signed-in client's own record from their rollups.
function _dashRecordFromSelf(dash, kit) {
  const k = dash && dash.kpis ? dash.kpis : {};
  const checkins = kit && Array.isArray(kit.checkins) ? kit.checkins : null;
  return {
    profile: { id: "me", name: (dash && dash.user && dash.user.firstName) || "You", isNew: false, status: null },
    trainingAdherence: null,
    foodLogs: null,
    shapeScoreHistory: null,
    weighIns: null,
    streaks: k.streak != null ? { current: k.streak, best: k.streak, lastActiveOn: null } : null,
    totals: k.totalWorkouts != null ? { workouts: k.totalWorkouts } : null,
    nutrition: null,
    goal: null,
    goals: dash && dash.goals ? DashSignals.goalsFromDoc(dash.goals) : null,
    lastContact: null,
    checkIn: checkins ? { lastWeekOf: checkins.length ? checkins[0].week_of || null : null } : null,
    goalPhase: null,
    milestones: null,
    payments: null,
  };
}

// ── the coach's own tuning of the signal engine (review 2026-09-09, R14) ─────
// ⚠ THE TUNING TRAVELS AS A VALUE; NOTHING IS EVER GLOBALLY SET. dashSignals.js is a
// singleton, and `src/lib/ai/notify-core.ts` imports the SAME file server-side to
// build client_red / client_amber — so a mutable effective set would be one Node
// process shared by every coach. `resolveThresholds` returns a new object and the
// three entry points take it per call.
function dashResolveCoachThresholds(doc) {
  const t = (doc && doc.thresholds && typeof doc.thresholds === "object") ? doc.thresholds : null;
  try { return t ? DashSignals.resolveThresholds(t) : null; } catch (e) { return null; }
}
const DASH_THRESHOLDS_EVENT = "shape:coach-thresholds";

// Returns the resolved set to hand the engine, or null for house policy — which is
// every non-answer: signed out, unreadable, the client role, nothing tuned.
// ⚠ A NULL READ IS "SIGNED OUT OR UNREADABLE", NOT "TUNED NOTHING", and both land on
// house policy here deliberately. Running a coach's roster on a half-remembered
// tuning nobody could confirm is worse than running it on the policy every other
// coach gets; the panel is where the difference is stated.
// ⚠ ONE READ PER TAB SWITCH, NOT THREE. Every coach route component remounts on a
// hash change, so `useDashboard` — and therefore this hook — re-ran on every tab, and
// the Settings page adds two more reads of the same document (the shell's landing-tab
// resolve and useCoachDoc). It changes only from one page, so a short cache in the
// same shape as `_dashCache` collapses them. `dashInvalidateCoachSettings` is what the
// save path calls, so a write is never read back stale.
let _dashCoachSettings = null;   // { at, doc }
// ⚠ A GENERATION, AND ONE FLIGHT. Two races, both measured on this document:
//   · Two callers miss the cache together and both fetch. The LATE one writes the
//     cache — so a read started BEFORE a save, finishing after it, pins the stale
//     document for the whole TTL and the roster runs the old thresholds while the
//     server has already saved the new ones.
//   · A read in flight when a save invalidates must not then repopulate the cache
//     it was invalidated out of.
// The counter is bumped by every invalidation, and a read may only write the cache
// if the generation it started in is still current. `_flight` collapses concurrent
// callers onto one round trip and is dropped on invalidation, so the next caller
// starts a fresh read rather than joining a stale one.
let _dashCoachSettingsGen = 0;
let _dashCoachSettingsFlight = null;
async function dashReadCoachSettings() {
  if (_dashCoachSettings && Date.now() - _dashCoachSettings.at < DASH_CACHE_TTL) return _dashCoachSettings.doc;
  if (_dashCoachSettingsFlight) return _dashCoachSettingsFlight;
  const db = window.shapeDb;
  if (!db || !db.getUserGoals) return null;
  const gen = _dashCoachSettingsGen;
  const p = (async () => {
    await dashDocBridge();
    let doc = null;
    try { doc = await db.getUserGoals("coach_settings"); } catch (e) { doc = null; }
    // ⚠ ONLY A SUCCESSFUL READ IS CACHED. Caching a null would pin "we could not read
    // it" for a minute, so a coach who signs in mid-session runs on house policy until
    // the entry expires — and the panel would say their settings are unreadable.
    if (doc != null && gen === _dashCoachSettingsGen) _dashCoachSettings = { at: Date.now(), doc };
    return doc;
  })();
  _dashCoachSettingsFlight = p;
  try { return await p; } finally { if (_dashCoachSettingsFlight === p) _dashCoachSettingsFlight = null; }
}
function dashInvalidateCoachSettings() {
  _dashCoachSettings = null;
  _dashCoachSettingsGen += 1;
  _dashCoachSettingsFlight = null;   // the next caller re-reads rather than joining a stale flight
}

// Is there a signed-in account? `undefined` while unknown, then true/false.
// ⚠ NOT DERIVED FROM THE ROSTER, AND THAT IS THE POINT. `useDashboard`'s `source` is
// about DATA — it is null while the roster request is in flight and "demo" when that
// request FAILS — so keying persistence on it meant a roster outage turned every
// settings edit tab-only and told a signed-in coach to sign in, while the settings
// backend was perfectly healthy. Authentication is its own question and gets its own
// answer.
// ⚠ IT RESOLVES AN IDENTITY, NOT A BOOLEAN, AND IT SUBSCRIBES. A one-shot `true` is
// the cross-account defect this file has now paid for five times: if account B signs in
// from another same-origin tab, A's open Settings tab keeps its `true`, keeps A's
// document on screen, and the write paths — which resolve `getUser()` at CLICK time —
// upsert the displayed change under B's id. The account is the thing the callers need,
// so it is the thing this returns.
//
// Four answers, three values:
//   undefined — still resolving, OR the read FAILED. Both mean "do not let an edit
//               land yet". Collapsing an unreadable read into `false` showed an
//               authenticated coach the preview UI with live controls, and their edits
//               went to a tab-local copy and disappeared.
//   null      — confirmed signed out.
//   "<uid>"   — signed in as this account.
function useSignedIn() {
  const [uid, setUid] = React.useState(undefined);
  // ⚠ AN AUTH EVENT IS ALWAYS NEWER THAN THE READ THAT WAS ALREADY IN FLIGHT. The
  // initial `getUser()` and the subscription race: if the read observed A, B signs in,
  // and the read THEN resolves, it put A back. The write-time check still refused the
  // cross-account write — but the page remounted A's settings under B's session, and
  // refused B's own writes until another event or a reload repaired the identity. So a
  // stale answer is dropped rather than merely out-voted.
  const authGenRef = React.useRef(0);
  React.useEffect(() => {
    let on = true;
    const resolve = async () => {
      const gen = authGenRef.current;
      const db = window.shapeDb;
      if (!db || !db.getUser) { if (on && gen === authGenRef.current) setUid(null); return; }
      await dashDocBridge();
      // ⚠ `dashDocUid` SWALLOWS ITS FAILURE and returns null, so a transient network or
      // bridge fault is indistinguishable from a signed-out visitor at that layer. The
      // session is asked directly: a session that reads back carries an id, and a read
      // that THROWS leaves the answer unresolved rather than answering "signed out".
      try {
        const u = await db.getUser();
        if (on && gen === authGenRef.current) setUid(u && u.id ? u.id : null);
      } catch (e) {
        if (on && gen === authGenRef.current) setUid(undefined);
      }
    };
    resolve().catch(() => { if (on) setUid(undefined); });
    // The same capability guard dashProgress uses — this runs on pages whose supabase
    // client may not be present at all.
    let sub = null;
    try {
      const db = window.shapeDb;
      if (db && db.client && db.client.auth && db.client.auth.onAuthStateChange) {
        sub = db.client.auth.onAuthStateChange((_event, session) => {
          if (!on) return;
          // Bump FIRST: an in-flight read that resolves after this must not win.
          authGenRef.current += 1;
          const next = session && session.user && session.user.id ? session.user.id : null;
          setUid(next);
        });
      }
    } catch (e) { /* no subscription is a stale tab, not a broken one */ }
    return () => {
      on = false;
      try { if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); } catch (e) {}
    };
  }, []);
  return uid;
}

function useCoachThresholds(role) {
  const [resolved, setResolved] = React.useState(null);
  // ⚠ AND THE CONSUMER NEEDS ITS OWN GENERATION, because the read it awaits may not be
  // the newest one. A mount read still in flight when a save fires the change event
  // resolves AFTER the post-save read and would set the OLD tuning as the answer.
  const genRef = React.useRef(0);
  const load = React.useCallback(async () => {
    // ⚠ THE CLIENT ROLE NEVER READS THIS. A member's own pages load DashSignals too,
    // and on a DUAL-ROLE account the coach's roster tuning would otherwise decide how
    // their own data reads back to them.
    const gen = (genRef.current += 1);
    if (role === "client") { setResolved(null); return; }
    const doc = await dashReadCoachSettings();
    if (gen !== genRef.current) return;   // a newer load started — this answer is stale
    setResolved(dashResolveCoachThresholds(doc));
  }, [role]);
  React.useEffect(() => { let on = true; load().catch(() => { if (on) setResolved(null); }); return () => { on = false; }; }, [load]);
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = () => { dashInvalidateCoachSettings(); load().catch(() => {}); };
    window.addEventListener(DASH_THRESHOLDS_EVENT, onChange);
    return () => window.removeEventListener(DASH_THRESHOLDS_EVENT, onChange);
  }, [load]);
  return resolved;
}

function useDashboard(role) {
  const [state, setState] = React.useState({ loading: true, clients: [], source: null, today: null, client: null });

  React.useEffect(() => {
    let on = true;
    // `today` = the raw role dashboard feed (/api/{role}/dashboard) when the
    // viewer is live; null otherwise (callers render their demo Today panels).
    // It resolves independently of the roster so one failing API can't take
    // down the other half of the page.
    const demo = (today, clientExtras) => { if (on) setState({ loading: false, clients: DashSignals.buildMockClients(), source: "demo", today: today || null, client: clientExtras || null }); };
    (async () => {
      try {
        if (role === "client") {
          // The client Today page needs the full picture: dashboard KPIs, the
          // check-in kit, the assigned plan, today's nutrition ledger, the
          // Shape Score rollup, and membership status. All resolve
          // independently; absent pieces stay null (callers fall back to
          // their demo dataset).
          const [dash, kit, plan, nutrition, score, sub] = await Promise.all([
            _dashJson("/api/client/dashboard").catch(() => null),
            _dashJson("/api/client/checkin-kit").catch(() => null),
            _dashJson("/api/client/plan").catch(() => null),
            _dashJson("/api/client/nutrition").catch(() => null),
            _dashJson("/api/client/score").catch(() => null),
            _dashJson("/api/stripe/subscription").catch(() => null),
          ]);
          const extras = {
            plan: plan && plan.ok ? plan : null,
            nutrition: nutrition && nutrition.ok ? nutrition : null,
            score: score && score.points_total != null ? score : null,
            membership: sub && typeof sub.active === "boolean" ? sub : null,
          };
          if (!dash || !dash.kpis) return demo(null, extras);
          if (on) setState({ loading: false, clients: [_dashRecordFromSelf(dash, kit)], source: "live", today: dash, client: extras });
          return;
        }
        const roleKey = role === "trainer" ? "isTrainer" : "isNutritionist";
        // The notes doc is ONE read for the whole roster, so it starts with the
        // roster rather than behind the per-client pool — the window in which a
        // drawer can open on un-attempted notes is then a single round trip.
        const notesPromise = _dashCoachNotes();
        const [roster, todayRes] = await Promise.all([
          _dashJson("/api/" + role + "/clients").catch(() => null),
          _dashJson("/api/" + role + "/dashboard").catch(() => null),
        ]);
        const today = todayRes && todayRes[roleKey] ? todayRes : null;
        if (!roster || !roster[roleKey]) return demo(today);
        // Roster first (fast paint for callers), then enrich rows with ids.
        // ⚠ The third argument is deliberately absent, not null: undefined is
        // "the notes have not been read yet", null would claim the read failed.
        const base = (roster.clients || []).map((row) => _dashRecordFromLive(row, null));
        if (on) setState({ loading: false, clients: base, source: "live", today });
        const rows = roster.clients || [];
        // The per-client overviews and the ONE notes doc resolve together — the
        // notes read is a single round trip for the whole roster, so it must not
        // sit behind the pool.
        const [overviews, notes] = await Promise.all([
          _dashPool(rows, (row) =>
            row.id ? _dashJson("/api/clients/" + encodeURIComponent(row.id) + "/shared-overview") : null
          ),
          notesPromise,
        ]);
        if (!on) return;
        setState({
          loading: false,
          clients: rows.map((row, i) => _dashRecordFromLive(row, overviews[i], notes)),
          source: "live",
          today,
        });
      } catch (e) { demo(null); }
    })();
    return () => { on = false; };
  }, [role]);

  // ⚠ THE FEED DEPENDS ON THE TUNING, or a coach changes a threshold and their roster
  // goes on showing the flags the old one produced until something unrelated
  // re-renders. The dependency is a SIGNATURE of the resolved set rather than the
  // object, so an identical re-read does not invalidate the memo.
  const tuning = useCoachThresholds(role);
  const thresholds = tuning ? tuning.thresholds : null;
  const thresholdSig = tuning ? JSON.stringify(tuning.applied) : "";
  const triage = React.useMemo(
    () => DashSignals.getTriageFeed(role, state.clients, undefined, thresholds || undefined),
    // eslint-disable-next-line
    [role, state.clients, thresholdSig]
  );
  const queue = React.useMemo(
    () => DashSignals.buildProgrammingQueue(state.clients),
    [state.clients]
  );
  // ⚠ THIS ONE READS THE TUNING TOO, and less obviously: `findJointAttention` calls
  // `evaluateClient` internally. `buildProgrammingQueue` and `buildMilestones` do not
  // — checked rather than assumed, because adding a dependency that changes nothing is
  // cheap and MISSING one leaves a panel quietly showing the old thresholds' output.
  const joint = React.useMemo(
    () => (role === "client" ? [] : DashSignals.findJointAttention(state.clients, undefined, thresholds || undefined)),
    // eslint-disable-next-line
    [role, state.clients, thresholdSig]
  );
  // `tuning.refused` is carried out, not swallowed: a stored override the engine
  // rejected must not render in the panel as an active tuning while the roster runs
  // on the house default — which is exactly what refuse-don't-clamp exists to prevent.
  return { loading: state.loading, clients: state.clients, triage, queue, joint, today: state.today, client: state.client, source: state.source, tuning };
}

// ── The coach's own live figures (review 2026-09-09, R9) ────────────────────
// The Goal page's numbers were ALL typed: `cur` on every goal, the calculator's
// "current pace", and every row of the momentum card. A coach who set them in
// March was still being shown March in September, under headings that read as
// measurements. This binds the ones the practice can answer for itself.
//
// Shares `_dashJson`'s 60s cache, so a page that already read /analytics for a
// chart pays nothing here.
//
// `kind` is the honest three-way: "live" when the payload came back for this
// role, "demo" when the viewer is signed out or is not this role (the page's
// own sample state), and "unknown" when the read FAILED — which must not be
// rendered as a zero, because "you have no clients" and "we could not ask" are
// different sentences.
function useCoachLiveFigures(role) {
  const [state, setState] = React.useState({ kind: "loading" });
  React.useEffect(() => {
    let on = true;
    const roleKey = role === "trainer" ? "isTrainer" : "isNutritionist";
    (async () => {
      let a = null;
      try { a = await _dashJson("/api/" + role + "/analytics"); }
      catch (e) { if (on) setState({ kind: "unknown" }); return; }
      if (!on) return;
      if (!a || !a[roleKey]) return setState({ kind: "demo" });
      const m = a.metrics || {};
      const net = m.mrrNetCents;
      setState({
        kind: "live",
        activeClients: m.activeClients != null ? m.activeClients : null,
        mrrNetCents: net != null ? net : null,
        // 4.33 weeks/month — the same divisor the Goal page's own calculator
        // uses, so the pace it compares against is on its scale.
        weeklyNetCents: net != null ? Math.round(net / 4.33) : null,
        // ⚠ THE TWO ROLES MEASURE DIFFERENT THINGS AND NAME THEM DIFFERENTLY.
        // The trainer route returns `avgAdherencePct` (sessions completed vs
        // planned); the nutritionist route returns `proteinAdherencePct` and has
        // no avgAdherencePct at all — so reading one field for both roles left
        // the nutritionist binding permanently unreadable.
        adherencePct: (() => {
          const cp = a.clientProgress || {};
          const v = role === "trainer" ? cp.avgAdherencePct : cp.proteinAdherencePct;
          return v == null ? null : v;
        })(),
        trajectory: a.trajectory || null,
      });
    })();
    return () => { on = false; };
  }, [role]);
  return state;
}

// ── What a goal's CURRENT can be bound to (review 2026-09-09, R9) ──────────
// ⚠ PER ROLE, because the two analytics routes measure different things: the
// trainer has session adherence, the nutritionist has protein adherence. One
// shared list offered the nutritionist a binding their own payload can never
// answer, so the goal read "Couldn't read…" forever.
//
// Defined HERE rather than in each Goal page: the two pages are near-identical
// and were drifting a copy each.
// ── The weekly readout, shared by both surfaces ───────────────────────
// The member's own card and the coach's Week row read the SAME payload shape, so
// the stamp lives here rather than being written twice — the pattern P1-C removed
// for `GOAL_METRICS`, with a test written to police the duplication rather than
// end it. A future change to what the stamp may claim (the next `source` value,
// say) has to land once, or the two surfaces disagree about the same row.
//
// `dense` is the coach's row, which sits inside a line of running text; the
// member's card gets the full sentence.
function readoutStamp(r, dense) {
  const bits = [
    r && r.window_days != null ? r.window_days + (dense ? "d window" : "-day window") : null,
    r && r.sample_size != null ? r.sample_size + " days logged" : null,
    // ⚠ THE DETERMINISTIC READOUT SAYS SO. It is real evidence, honestly
    // rendered — but it is not the AI reading of it, and a reader who cannot tell
    // the two apart has been told something untrue about where the words came from.
    r && r.source === "fallback" ? (dense ? "computed, not written" : "Computed, not written") : null,
  ].filter(Boolean);
  return bits.join(" \u00b7 ");
}

// ⚠ THE ROUTE KEYS A READOUT BY THE **UTC** DATE'S MONDAY, NOT THE MEMBER'S OWN.
// `weeklyReadoutWeekStart` floors `new Date(ts).toISOString().slice(0,10)`, so a
// member at UTC+10 generating on their local Monday 08:00 files the row under the
// PREVIOUS Monday — UTC is still Sunday. A surface that queries by a LOCAL Monday
// therefore misses that row on the week it belongs to and finds it on the week
// before, which is a readout attributed to a week it was not run in.
//
// So a consumer must key the way the route keys: this week's UTC Monday, stepped
// back a whole number of weeks. The offset is taken in weeks (not by re-flooring a
// local date), because that is the only part both calendars agree on.
//
// ⚠ `nowMs` IS AN INPUT SO THIS CAN BE DRIVEN, exactly as the route's own
// `weeklyReadoutWeekStart` takes one. Without it the only clock is the test
// runner's, and this container runs UTC — where a LOCAL-calendar rewrite of this
// function is indistinguishable from a correct one. Measured: that mutation
// survived a suite that looked right, because the two calendars coincide here.
function readoutWeekKey(weeksBack, nowMs) {
  const utcToday = new Date(typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now())
    .toISOString().slice(0, 10);
  const d = new Date(utcToday + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (Number(weeksBack) || 0) * 7);
  return d.toISOString().slice(0, 10);
}

// ── A coach's own whole-doc store ────────────────────────────────
// ONE `user_goals` document per coach, read before every write so a change to
// one key never clobbers another, bound to the account that made the change, and
// declined when the read cannot be trusted.
//
// ⚠ THIS IS THE THIRD COPY OF THIS SHAPE, AND SAYING SO IS THE POINT.
// `useWeekReviews` (dashWeek.jsx) and `CKCoachNote` (coachClientDetail.jsx) each
// carry their own line-for-line equivalent. This one is written here, where both
// could reach it, but neither has been migrated — so a fix made here (the failed
// -write rollback below is already one) does NOT reach them. Migrating those two
// onto this hook is registered work, not something this comment may claim has
// happened: an earlier draft of it said all three shared this, which would have
// left the next reader believing a fix had landed in three places when it landed
// in one.
//
// ⚠ getSession() BEFORE getUserGoals, ALWAYS. `getUserGoals` resolves the user
// through `client.auth.getUser()`, which does NOT bootstrap the Next.js
// cookie-session bridge — a coach signed in that way with nothing in
// localStorage reads as ANON, `getUserGoals` returns null, and the surface tells
// a signed-in coach their work will not be kept while silently discarding it.
async function dashDocBridge() {
  try { if (window.shapeDb && window.shapeDb.getSession) await window.shapeDb.getSession(); } catch (e) { /* fall through as anon */ }
}
async function dashDocUid() {
  try { const u = await window.shapeDb.getUser(); return u && u.id ? u.id : null; } catch (e) { return null; }
}
const _dashDocLane = { p: Promise.resolve() };
function dashDocSerial(fn) { const run = _dashDocLane.p.then(fn, fn); _dashDocLane.p = run.catch(() => {}); return run; }

// `merge(doc)` returns the next whole document. It runs TWICE on purpose: once
// against the rendered copy for the optimistic paint, and once against the
// freshly-read server copy inside the lane, which is the copy that is written.
// `accountId` is optional and exists for one reason: a document read for account A must
// be re-read when B signs in, or A's settings stay on screen under B's session.
function useCoachDoc(goalKind, live, accountId) {
  const [state, setState] = React.useState({ kind: "loading", doc: {} });
  // The write path must read the CURRENT kind, not the one captured when the
  // handler was created: a change made during the load would otherwise take the
  // stale "loading" branch, skip the write, and then be erased by the load.
  const kindRef = React.useRef("loading");
  kindRef.current = state.kind;
  const uidRef = React.useRef(null);
  // How many writes are still in the lane. A success reconciles the document to
  // what it wrote only when this reaches 0 — otherwise it would erase the paint
  // of a write queued behind it that has not run yet.
  const pendingRef = React.useRef(0);
  React.useEffect(() => {
    let on = true;
    kindRef.current = "loading";
    pendingRef.current = 0;
    if (!live) { setState({ kind: "demo", doc: {} }); return undefined; }
    setState({ kind: "loading", doc: {} });
    (async () => {
      const db = window.shapeDb;
      if (!db || !db.getUserGoals) { if (on) setState({ kind: "unavailable", doc: {} }); return; }
      await dashDocBridge();
      if (!on) return;
      uidRef.current = await dashDocUid();
      let doc = null;
      try { doc = await db.getUserGoals(goalKind); } catch (e) { doc = null; }
      if (!on) return;
      setState(doc == null ? { kind: "signedout", doc: {} } : { kind: "ready", doc: doc || {} });
    })();
    return () => { on = false; };
  }, [goalKind, live, accountId]);
  // ⚠ THE OPTIMISTIC PAINT IS ROLLED BACK WHEN THE WRITE FAILS, and it does NOT
  // clear an existing error. An earlier cut did both wrong, and the two combined
  // into a silent data loss: a failed mark stayed on screen as saved, the next
  // mark flipped the state back to "ready" (hiding the notice), and the lane
  // then re-read the SERVER document — which never received the first mark —
  // merged only the second, and wrote that. The screen claimed two marks and
  // saving was healthy; the row reloaded with one. A surface that keeps painting
  // a write it knows failed is worse than one that never accepted it.
  const apply = (merge) => {
    if (kindRef.current !== "ready" && kindRef.current !== "error") return Promise.resolve(false);
    setState((s) => ({ ...s, doc: merge(s.doc) }));
    pendingRef.current += 1;
    return dashDocSerial(async () => {
      const db = window.shapeDb;
      // ⚠ BOUND TO THE ACCOUNT THAT ACTED, AND AN UNKNOWN ACCOUNT IS NOT A PASS.
      // getUserGoals and saveUserGoals each resolve the user independently at
      // their own call time, and the save REPLACES the whole document — so an
      // account switch between them would upsert coach A's blob into B's row.
      // An earlier cut skipped the comparison when the INITIATING id had not
      // resolved (`startUid && …`), which is exactly the case that cannot be
      // checked: a transient failure of the hydrate's own uid read left every
      // later write unguarded. It is resolved here when it is missing, and the
      // comparison is unconditional; an id that still will not resolve refuses
      // the write rather than guessing whose row it belongs in.
      let startUid = uidRef.current;
      if (!startUid) { startUid = await dashDocUid(); uidRef.current = startUid; }
      if (!startUid) { pendingRef.current -= 1; setState((s) => ({ ...s, kind: "error" })); return false; }
      let doc = null;
      try { doc = await db.getUserGoals(goalKind); } catch (e) { doc = null; }
      // The read is the last known truth. When it succeeds, a failed save can be
      // rolled back onto it exactly; when it fails there is nothing to roll back
      // TO, so the paint is left standing and the caller is told it is unsaved.
      if (doc == null) { pendingRef.current -= 1; setState((s) => ({ ...s, kind: "error" })); return false; }
      const nowUid = await dashDocUid();
      if (!nowUid || nowUid !== startUid) { pendingRef.current -= 1; setState((s) => ({ ...s, doc, kind: "error" })); return false; }
      const written = merge(doc);
      let res = null;
      try { res = await db.saveUserGoals(goalKind, written); } catch (e) { res = null; }
      pendingRef.current -= 1;
      if (!res || res.error) { setState((s) => ({ ...s, doc, kind: "error" })); return false; }
      // ⚠ A SUCCESS RECONCILES; IT DOES NOT SIMPLY CLEAR THE ERROR. An earlier
      // write whose READ failed leaves its optimistic paint standing (there was
      // nothing to roll back to), so flipping the state to "ready" on a LATER
      // write's success would show both as saved while the server holds only the
      // second — and the first would vanish on reload. The document is set to
      // what was actually written, and only once the lane is empty, so a write
      // still queued behind this one does not have its own paint erased.
      setState((s) => (pendingRef.current === 0 ? { ...s, doc: written, kind: "ready" } : { ...s, kind: "ready" }));
      return true;
    });
  };
  return { ...state, apply };
}

// The unit a bound metric intrinsically carries. The goal CARD formats through
// `g.money` / `g.pct`, so binding a metric without setting these renders the
// live figure in the wrong unit: MRR as a bare `12000`, adherence as a bare
// `88`, or an active-client count as `$12` on a goal that used to be revenue.
// A bound goal's unit is not a free choice — it is a property of the thing
// being measured.
function goalMetricUnit(metric) {
  if (metric === "mrrNetMonthly") return { money: true, pct: false };
  if (metric === "adherencePct") return { money: false, pct: true };
  if (metric === "activeClients") return { money: false, pct: false };
  return {};
}
function goalMetricsFor(role) {
  return [
    ["", "Type it in"],
    ["activeClients", "Active clients"],
    ["mrrNetMonthly", "MRR · net per month"],
    ["adherencePct", role === "trainer" ? "Avg session adherence %" : "Avg protein adherence %"],
  ];
}
// undefined = not bound (use the typed number) · null = bound but unreadable
// (show "—", NEVER the stale typed value) · a number = live.
//
// ⚠ "loading" IS NOT "unreadable". Returning null while the fetch is still in
// flight painted "Couldn't read active clients" on every page load until
// /analytics came back — a false failure message on a healthy account.
function goalLiveValue(metric, live) {
  if (!metric || !live) return undefined;
  if (live.kind === "loading") return "loading";
  if (live.kind !== "live") return null;
  if (metric === "activeClients") return live.activeClients;
  if (metric === "mrrNetMonthly") return live.mrrNetCents == null ? null : Math.round(live.mrrNetCents / 100);
  if (metric === "adherencePct") return live.adherencePct;
  return null;
}

// The momentum card's four rows, computed from the trajectory R8 already
// ships. Returns null when there is nothing measured to say — an empty card is
// better than four rows of zeroes that read as a flat quarter.
function coachLiveMomentum(live) {
  if (!live || live.kind !== "live" || !live.trajectory || !live.trajectory.summary) return null;
  const s = live.trajectory.summary;
  // ⚠ GUARD ON HAVING MEASURED SOMETHING, not on the fields being present.
  // `buildTrajectory` always returns a summary — for a coach with no
  // subscriptions every field is a legitimate 0, all of them pass a `!= null`
  // check, and the card renders "+0 net new · 0 active" under a MEASURED
  // eyebrow for someone who has never had a client. That is the exact "four
  // rows of zeroes that read as a flat quarter" this function promises to
  // suppress.
  if (!s.totalEverSubscribed) return null;
  const rows = [];
  const net = (s.addsThisMonth || 0) - (s.endedThisMonth || 0);
  if (s.addsThisMonth != null && s.endedThisMonth != null) {
    rows.push([(net >= 0 ? "+" : "") + net, "Net new · this month", s.addsThisMonth + " joined · " + s.endedThisMonth + " left"]);
  }
  if (s.activeNow != null && s.active30dAgo != null) {
    const d = s.activeNow - s.active30dAgo;
    rows.push([String(s.activeNow), "Active clients", (d >= 0 ? "+" : "") + d + " vs 30d ago"]);
  }
  if (s.churnRate30dPct != null) rows.push([s.churnRate30dPct + "%", "Churn · 30d", "of " + s.active30dAgo + " active a month ago"]);
  if (s.medianTenureDays != null) {
    const t = s.medianTenureDays;
    // ⚠ QUOTES THE SPAN COUNT, NOT THE CLIENT COUNT. `medianTenureDays` is
    // measured over every membership span; `totalEverSubscribed` now counts
    // people, so pairing the two would print a median beside a denominator it
    // was not taken over.
    const spans = s.totalSpans != null ? s.totalSpans : s.totalEverSubscribed;
    rows.push([t < 62 ? t + "d" : Math.round(t / 30.44) + "mo", "Median tenure · per membership", "across " + spans + " ever started"]);
  }
  return rows.length ? rows : null;
}

// `dashJson` is exposed so other modules on the page share this 60s cache
// rather than re-fetching the same endpoint. DashSidebar (trainerDashboard.jsx)
// wants the same /api/{role}/dashboard payload the page hook already asks for;
// without the shared cache that is a second round trip on every dashboard load.
// ⚠ A KEY DERIVED FROM THE CLOCK NEEDS A CLOCK, NOT JUST A DEPENDENCY. Computing
// one during render does not CAUSE a render — so a page left open and idle across
// the week boundary keeps querying last week's key indefinitely, and a dependency
// on it only helps once something unrelated re-renders. This polls rather than
// scheduling a single timeout to the boundary, because a timeout is wrong after a
// laptop sleeps through it or the system clock moves; a comparison that costs a
// string a minute is self-correcting either way.
//
// The value is computed during RENDER and returned fresh, so it also tracks an
// ordinary dependency change (a coach paging to the previous week) in the same
// commit; the state tick exists only to force a render when the boundary moves,
// and only fires when the key has ACTUALLY changed — an idle page re-renders 52
// times a year.
//
// ⚠ dashToday.jsx's `useQueueWeekKey` is the same pattern over the LOCAL Monday.
// Converging the two is REGISTERED, NOT DONE — a fix believed to have landed in
// two places when it landed in one is worse than an honest duplicate.
function useWeekClock(compute) {
  const [, force] = React.useState(0);
  const fnRef = React.useRef(compute); fnRef.current = compute;
  const lastRef = React.useRef(null);
  const value = compute();
  lastRef.current = value;
  React.useEffect(() => {
    const id = setInterval(() => {
      let next = null;
      try { next = fnRef.current(); } catch (e) { return; }
      if (next !== lastRef.current) force((n) => n + 1);
    }, 60000);
    return () => clearInterval(id);
  }, []);
  return value;
}

// ── REMEMBERED CHOICES (review 2026-09-09, R16) ──────────────────────────
// The dashboard remembered a member's card LAYOUT and nothing else, so a coach who
// filtered their roster to "needs eyes", a member who set Progress to strength, and
// anyone who preferred the week view of Schedule had to say so again on every visit.
//
// ⚠ IT IS BUILT ON `useCoachDoc` RATHER THAN BESIDE IT. That store already carries the
// account binding, the serial write lane, the optimistic rollback and the three read
// states — nine review rounds' worth — and this file already post-mortems having THREE
// line-for-line copies of it. A fourth would be the same mistake with a new name.
//
// ⚠ THE STORE IS OPENED ONCE PER PAGE AND SHARED ACROSS KEYS, which is why it is a
// separate hook from the choice. A page with two remembered controls that opened two
// stores would issue two reads of the same document and hold two copies of it: the
// writes would still be safe (every write re-reads the server document inside the
// serial lane), but each copy would be blind to the other's key, and the second read
// buys nothing.
//
// ⚠ R16 ALSO ASKS FOR ROSTER SORT, AND THERE IS NO SORT CONTROL TO REMEMBER. Measured
// in `dashRoster.jsx`: it has a filter (all · needs eyes · new · on track) and a search,
// and no sort of any kind. A default for a control that does not exist is a preference
// for a feature that does not exist — R15 is where the control belongs, and the memory
// follows it.
//
// ⚠ IT IS BOUND TO THE ACCOUNT, NOT ONLY TO `live` (CodeRabbit, #2029), AND THE HOLE
// WAS BIGGER THAN A STALE READ. `useCoachDoc`'s hydrate deps are `[goalKind, live,
// accountId]`, so an A→B switch that leaves `live` true never re-runs it: B reads A's
// document, and — because `uidRef` is also set by that hydrate — every write B makes
// resolves `startUid` as A, fails the unconditional identity comparison inside `apply`,
// and is REFUSED. B's own preferences become silently unsaveable until a reload. (The
// guard does its job: A's document is never upserted into B's row. It just leaves B
// unable to save.) The account is a dependency now, so the store re-hydrates for B.
function useRememberedChoices(live) {
  // One `useSignedIn` per page, not one per read: it takes a getUser() round trip and
  // an auth subscription, and calling it twice in the same expression would take two.
  const accountId = useSignedIn();
  // ⚠ AND IT DOES NOT OPEN UNTIL THE ACCOUNT IS KNOWN, which is one read rather than
  // two AND is the same rule the fix is about: reading a per-account document before
  // knowing whose it is was the defect. `useSignedIn` publishes `undefined` until it
  // resolves and `null` for a confirmed signed-out visitor — both leave the store
  // closed, so nothing is read and nothing is written, and a choice made in that window
  // is retried by the reconciliation effect the moment it opens. An account that never
  // resolves degrades to remembering nothing, which is the honest failure.
  const store = useCoachDoc("dashboard_prefs", !!live && accountId != null, accountId);
  return { ...store, accountId };
}

// One control's memory, read out of a store opened by `useRememberedChoices`.
// Returns `[value, choose]` and is a drop-in for the `React.useState` it replaces.
function useRememberedChoice(store, key, allowed, fallback) {
  // The choice made in THIS session, if any. Null means "nobody has touched it here".
  const [chosen, setChosen] = React.useState(null);
  // The value this hook last asked the document to hold. It is never reset on
  // success, only replaced by the next choice — see the loop note on the effect.
  const askedRef = React.useRef(null);

  // ⚠ A DIFFERENT ACCOUNT GETS A CLEAN SLATE, and re-hydrating the store is not enough
  // on its own: `chosen` outranks the document by design, so A's session choice would
  // have gone on governing B's screen after B signed in — and `askedRef` would have
  // suppressed B's first write of the same value.
  //
  // ⚠ IT RESETS BETWEEN TWO KNOWN ACCOUNTS ONLY, which is why the last KNOWN one is
  // tracked rather than the last value seen. `useSignedIn` publishes `undefined` for
  // "not resolved yet" and `null` for "confirmed signed out", so resetting on every
  // change would discard a choice made during the load — the one case the whole
  // reconciliation effect exists to keep. Tracking the last known account also closes
  // A → signed out → B on a shared browser, which a plain previous-value comparison
  // would wave through.
  const acct = store && store.accountId != null ? store.accountId : null;
  const knownRef = React.useRef(null);
  if (acct != null && knownRef.current != null && acct !== knownRef.current) {
    // Adjusting state during render rather than in an effect: an effect resets a frame
    // late, and that frame is the one that shows B the control A left behind. React
    // discards this render and re-runs it, and the ref assignment below has already
    // happened by then, so the condition is false on the retry and it terminates.
    setChosen(null);
    askedRef.current = null;
  }
  if (acct != null) knownRef.current = acct;
  const doc = (store && store.doc) || {};
  const kind = (store && store.kind) || "loading";
  const apply = store && store.apply;
  const stored = Object.prototype.hasOwnProperty.call(doc, key) ? doc[key] : undefined;
  // ⚠ A STORED VALUE IS VALIDATED AGAINST WHAT EXISTS TODAY. A filter renamed or
  // retired since it was written would otherwise select nothing, and the roster would
  // look empty for a reason the member cannot see. An unknown value is ignored, not
  // applied — and it is left in the document rather than deleted, because a key this
  // build does not recognise may belong to a build that does.
  const remembered = allowed.indexOf(stored) >= 0 ? stored : null;
  // ⚠ AND A LATE READ NEVER YANKS SOMEONE WHO HAS ALREADY CHOSEN. The document
  // resolves after the first paint, so preferring it unconditionally would move a
  // control out from under a hand already on it.
  const value = chosen != null ? chosen : (remembered != null ? remembered : fallback);
  // Wrapped rather than handed out raw so that a caller passing a function gets their
  // function stored, not React's updater semantics applied to it.
  const choose = React.useCallback((next) => { setChosen(next); }, []);

  // ⚠ THE WRITE IS A RECONCILIATION, NOT A CLICK HANDLER, AND THAT IS THE WHOLE
  // REASON IT IS AN EFFECT. A choice made before the document is writable — during the
  // load, or while `useDashboard` still reads demo on a page that is about to resolve
  // live — had nowhere to go, so a handler would have dropped it silently and the
  // member's preference would simply not have been there next time. Stating the goal
  // ("the document should say what they chose") instead of the action ("write on
  // click") makes the store becoming writable retry it for free.
  const allowedKey = allowed.join("\u0000");
  React.useEffect(() => {
    if (chosen == null) return;                     // nobody has chosen on this page
    if (allowed.indexOf(chosen) < 0) return;        // never persist a value we would refuse to read back
    if (kind !== "ready" && kind !== "error") return;
    if (typeof apply !== "function") return;
    // The fallback is not a preference — storing it would pin today's default into the
    // member's own data, so tomorrow's default could never reach them. Choosing it back
    // means "no preference", which is what an absent key says.
    const want = chosen === fallback ? undefined : chosen;
    if (stored === want) return;                    // the document already says it
    // ⚠ ONE ATTEMPT PER CHOICE, AND THE REF IS WHAT MAKES THAT TRUE. `apply` paints
    // optimistically and rolls the paint back when the write fails, so `stored` moves
    // to the wanted value and then back again — which is a dependency change, which
    // re-runs this effect, which would write again, forever. Keying on the choice
    // rather than on the document breaks that: a failed write leaves the preference in
    // force for the session and simply unsaved, which is exactly what the page did
    // before it remembered anything.
    if (askedRef.current === chosen) return;
    askedRef.current = chosen;
    apply((d) => {
      const out = { ...d };
      if (want === undefined) delete out[key]; else out[key] = want;
      return out;
    });
    // eslint-disable-next-line
  }, [chosen, kind, stored, key, fallback, allowedKey]);

  return [value, choose];
}

// A STRIP of related choices, written in ONE document operation.
//
// ⚠ WHY THIS IS NOT FOUR `useRememberedChoice`s, and the reason is atomicity rather
// than tidiness. The KPI picker SWAPS when a coach chooses a metric that already sits in
// another slot, which changes two entries at once — and four independent hooks take that
// to the document as two separate whole-document writes. If the first lands and the
// second fails (a dropped request, an account switch mid-flight), the stored strip holds
// the same metric in BOTH slots, and the swap's whole reason for existing is gone on the
// next reload. One `apply` for the whole arrangement cannot half-land.
//
// The keys on disk are still one per slot, so VALIDATION stays per slot: a metric retired
// since it was chosen costs THAT slot its default and leaves the other three alone. What
// changes is the number of writes, not the stored shape.
//
// Everything else is `useRememberedChoice`'s mechanism unchanged — the session's choice
// outranks the document, a different account gets a clean slate, a slot equal to its
// default is stored as an ABSENT key rather than as a value, and the write is a
// reconciliation effect so a choice made before the store is writable is retried rather
// than dropped.
function useRememberedSlots(store, keys, allowed, defaults) {
  // ⚠ THE CHOICE CARRIES THE ACCOUNT IT WAS MADE UNDER, rather than being reset by a ref
  // written during render. The sibling hooks do the latter — `if (acct !== knownRef.current)
  // { setChosen(null) } ; knownRef.current = acct` — and on a concurrent root (these pages
  // mount with `createRoot`) React may DISCARD an interrupted render after that ref write
  // has already landed. The committed state then still holds A's arrangement while
  // `knownRef` says B, so the reset never fires on the retry and the reconciliation below
  // writes A's arrangement into B's document: the exact cross-account leak the block exists
  // to prevent. Pairing the choice with its account is self-correcting instead — a choice
  // made under A simply stops matching when the account is B, with nothing to leak from a
  // render that never committed, and no render-phase mutation at all. (CodeRabbit, #2046.)
  //
  // ⚠ REGISTERED, NOT SWEPT: `useRememberedChoice` and `useRememberedSet` carry the older
  // shape and predate this PR. Same class, same fix; widening this diff to three hooks is
  // the author's call, not a side effect of adding a fourth.
  const [chosen, setChosen] = React.useState(null);   // { acct, slots } | null
  const askedRef = React.useRef(null);
  const acct = store && store.accountId != null ? store.accountId : null;
  const mine = chosen && chosen.acct === acct && Array.isArray(chosen.slots) ? chosen.slots : null;

  const doc = (store && store.doc) || {};
  const kind = (store && store.kind) || "loading";
  const apply = store && store.apply;
  const readSlot = (k) => (Object.prototype.hasOwnProperty.call(doc, k) ? doc[k] : undefined);
  const values = keys.map((k, i) => {
    if (mine != null && mine.length === keys.length) return mine[i];
    const stored = readSlot(k);
    return allowed.indexOf(stored) >= 0 ? stored : defaults[i];
  });
  const choose = React.useCallback((next) => { setChosen({ acct: acct, slots: next }); }, [acct]);

  // The present/absent marker is prefixed so a stored value can never be mistaken for
  // "this key is absent" — the two have to be distinguishable for the no-op check below.
  const storedKey = keys.map((k) => (Object.prototype.hasOwnProperty.call(doc, k) ? "v" + String(doc[k]) : "-")).join("\u0000");
  const keysKey = keys.join("\u0000");
  const defaultsKey = defaults.join("\u0000");
  const allowedKey = allowed.join("\u0000");
  React.useEffect(() => {
    if (mine == null) return;
    if (kind !== "ready" && kind !== "error") return;
    if (typeof apply !== "function") return;
    // ⚠ A VALUE WE WOULD REFUSE TO READ BACK STOPS THE WHOLE WRITE, not just its own
    // slot. A strip is ONE arrangement, and writing three of its four keys is precisely
    // the partial write this hook exists to prevent.
    if (mine.length !== keys.length) return;
    for (let i = 0; i < mine.length; i++) if (allowed.indexOf(mine[i]) < 0) return;
    const want = mine.map((v, i) => (v === defaults[i] ? undefined : v));
    let differs = false;
    for (let i = 0; i < keys.length; i++) {
      const had = Object.prototype.hasOwnProperty.call(doc, keys[i]) ? doc[keys[i]] : undefined;
      if (had !== want[i]) { differs = true; break; }
    }
    if (!differs) return;                            // the document already says it
    // One attempt per arrangement — the optimistic paint and its rollback are a
    // dependency change, so keying on the document instead would write forever.
    // Keyed on the ACCOUNT as well as the arrangement, so the same four metrics chosen
    // under a second account are a different attempt rather than a suppressed repeat.
    const asked = String(acct) + "\u0001" + mine.join("\u0000");
    if (askedRef.current === asked) return;
    askedRef.current = asked;
    apply((d) => {
      const out = { ...d };
      for (let i = 0; i < keys.length; i++) {
        if (want[i] === undefined) delete out[keys[i]]; else out[keys[i]] = want[i];
      }
      return out;
    });
    // eslint-disable-next-line
  }, [mine, acct, kind, storedKey, keysKey, defaultsKey, allowedKey]);

  return [values, choose];
}

// A SET-shaped memory, for a control that remembers WHICH THINGS rather than WHICH ONE
// (review 2026-09-09, R15 — pinned clients, the drawer's sections).
//
// ⚠ IT IS NOT `useRememberedChoice` WITH AN ARRAY IN IT, and the difference that
// forces a second hook is the VALIDATION. That hook checks a stored value against a
// fixed `allowed` list and ignores anything else — right for a filter key, and wrong
// here: the members are client ids, and a coach's roster is filtered, searched and
// read one page at a time, so "not on the screen in front of me" is not evidence that
// a pin is stale. Dropping it would silently unpin someone every time the coach
// filtered. So the SHAPE is validated and membership never is.
//
// Everything else is deliberately the same mechanism: the session's choice outranks
// the document, a different account gets a clean slate, and the write is a
// reconciliation effect rather than a click handler so a choice made before the store
// is writable is retried instead of dropped.
function useRememberedSet(store, key, max) {
  const cap = Math.max(1, Math.min(200, Number(max) || 24));
  const [chosen, setChosen] = React.useState(null);   // null = nobody has touched it here
  const askedRef = React.useRef(null);

  // Same clean-slate rule as useRememberedChoice, and for the same reason: `chosen`
  // outranks the document, so A's session picks would otherwise govern B's screen.
  const acct = store && store.accountId != null ? store.accountId : null;
  const knownRef = React.useRef(null);
  let acctReset = false;
  if (acct != null && knownRef.current != null && acct !== knownRef.current) {
    setChosen(null);
    askedRef.current = null;
    // The fold below must sit this render out: `chosen` still holds A's list here, and
    // folding it into B's document would hand B the very list this block is discarding.
    acctReset = true;
  }
  if (acct != null) knownRef.current = acct;

  const doc = (store && store.doc) || {};
  const kind = (store && store.kind) || "loading";
  const apply = store && store.apply;

  // The SHAPE is what is checked: a list of non-empty strings, deduped, capped. A
  // document written by another build, or corrupted, degrades to "nothing pinned"
  // rather than throwing — and is left in place rather than deleted, because a key
  // this build cannot read may belong to one that can.
  const raw = Object.prototype.hasOwnProperty.call(doc, key) ? doc[key] : undefined;
  const stored = React.useMemo(() => {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
      if (typeof v !== "string" || !v) continue;
      if (out.indexOf(v) >= 0) continue;
      out.push(v);
      if (out.length >= cap) break;
    }
    return out;
  }, [JSON.stringify(raw), cap]);

  // ⚠ A CHOICE MADE BEFORE THE DOCUMENT ARRIVES IS A TOGGLE, NOT A SNAPSHOT, AND THAT
  // DISTINCTION IS THE WHOLE OF THIS BLOCK. `chosen` outranks the document by design —
  // a late read must never move a control out from under a hand already on it — but for
  // a SET that rule LOSES DATA: a coach who hides one section while the read is still in
  // flight picks from a list that reads EMPTY, and the reconciliation effect then writes
  // their one-item list over the four they hid last week, silently. So a choice made
  // before the store settled is FOLDED INTO the document when it arrives rather than
  // replacing it. A single value has no such hazard, which is why `useRememberedChoice`
  // keeps the plain snapshot rule.
  //
  // ⚠ AND THE FOLD CAN ONLY EVER ADD, which is why there is no removal arm to go with
  // it: until the store settles its doc is `{}`, so `stored` is [] and the control has
  // nothing on screen to un-toggle. A removal arm here would be a guard that cannot
  // fire, and the next reader would trust it.
  const settled = kind === "ready" || kind === "error";
  // Whether the CURRENT `chosen` was made BLIND — before the document had arrived. It
  // stops tracking the moment there is a choice, and resumes when there is none again.
  const blindRef = React.useRef(!settled);
  if (acctReset || chosen == null) {
    blindRef.current = !settled;
  } else if (blindRef.current && settled) {
    // ⚠ ASSIGNED BEFORE THE STATE SET, so the re-render React schedules sees the
    // condition already false and terminates — the shape of the account block above.
    // And ⚠ `acctReset` above is not decoration: React can batch the auth event and the
    // document's arrival into ONE render, and without it B's first settled frame would
    // fold A's session ids into B's document instead of discarding them.
    blindRef.current = false;
    setChosen(stored.concat(chosen.filter((x) => stored.indexOf(x) < 0)).slice(-cap));
  }

  const value = chosen != null ? chosen : stored;

  const storedRef = React.useRef(stored);
  storedRef.current = stored;
  // ⚠ THE UPDATER DERIVES FROM `prev`, NOT FROM A CAPTURED VALUE. Two toggles in one
  // tick both read the same captured array and the second would silently discard the
  // first; composing off `prev` is the only form that survives batching.
  const toggle = React.useCallback((id) => {
    if (typeof id !== "string" || !id) return;
    setChosen((prev) => {
      const cur = prev != null ? prev : storedRef.current;
      if (cur.indexOf(id) >= 0) return cur.filter((x) => x !== id);
      // The newest pin wins the last slot rather than being refused: a cap the coach
      // cannot see must not silently reject the thing they just asked for.
      return cur.concat([id]).slice(-cap);
    });
  }, [cap]);

  const clear = React.useCallback(() => { setChosen([]); }, []);

  const chosenKey = chosen == null ? null : chosen.join("\u0000");
  const storedKey = stored.join("\u0000");
  React.useEffect(() => {
    if (chosen == null) return;
    if (!settled) return;
    if (typeof apply !== "function") return;
    // An EMPTY set is "no preference", which is what an absent key says — the same
    // rule as choosing a default back in useRememberedChoice.
    const want = chosen.length ? chosen : undefined;
    if (chosenKey === storedKey) return;             // the document already says it
    if (askedRef.current === chosenKey) return;      // one attempt per chosen set
    askedRef.current = chosenKey;
    apply((d) => {
      const out = { ...d };
      if (want === undefined) delete out[key]; else out[key] = want;
      return out;
    });
    // eslint-disable-next-line
  }, [chosenKey, storedKey, kind, key]);

  return [value, toggle, clear];
}

// ⚠ `dashDemoPayouts` MOVED TO `dashSignals.js` on 2026-09-10 as `DashSignals.demoPayouts`.
// It derives from `buildMockClients`, which lives there, and the sidebar's payout card is
// rendered on pages that load NEITHER this file nor `dashToday.jsx` — so keeping the
// derivation here made the card's own getters throw on ten of them and report the failure
// as an em-dash. A pure derivation belongs with the data it derives from.
Object.assign(window, { useDashboard, useRememberedChoices, useRememberedChoice, useRememberedSet, useRememberedSlots, dashJson: _dashJson, useCoachLiveFigures, coachLiveMomentum, goalMetricsFor, goalMetricUnit, goalLiveValue, useCoachDoc, readoutStamp, readoutWeekKey, useWeekClock, dashResolveCoachThresholds, useCoachThresholds, useSignedIn, dashReadCoachSettings, dashInvalidateCoachSettings, DASH_THRESHOLDS_EVENT });
