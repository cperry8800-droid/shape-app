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
    payments: { mrrCents: row.mrrCents ?? null, status: "active", lastSessionAt: row.lastAt || null, joinedAt: row.joinedAt || null },
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

  const triage = React.useMemo(
    () => DashSignals.getTriageFeed(role, state.clients),
    [role, state.clients]
  );
  const queue = React.useMemo(
    () => DashSignals.buildProgrammingQueue(state.clients),
    [state.clients]
  );
  const joint = React.useMemo(
    () => (role === "client" ? [] : DashSignals.findJointAttention(state.clients)),
    [role, state.clients]
  );
  return { loading: state.loading, clients: state.clients, triage, queue, joint, today: state.today, client: state.client, source: state.source };
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
function useCoachDoc(goalKind, live) {
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
  }, [goalKind, live]);
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
Object.assign(window, { useDashboard, dashJson: _dashJson, useCoachLiveFigures, coachLiveMomentum, goalMetricsFor, goalMetricUnit, goalLiveValue, useCoachDoc, readoutStamp, readoutWeekKey });
