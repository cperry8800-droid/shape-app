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
//      small concurrency pool with a 60s module cache. Fields the APIs don't
//      expose yet (score history, last contact, goal phase, exact last-log
//      date) stay null — the signal engine skips rules with missing inputs.
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
function _dashRecordFromLive(row, ov) {
  const stats = ov && ov.stats ? ov.stats : null;
  const checkins = ov && Array.isArray(ov.checkins) ? ov.checkins : null;
  const goals = ov && ov.goals ? ov.goals : null;
  const weighIns = goals && goals.overall && Array.isArray(goals.overall.weighIns)
    ? goals.overall.weighIns.map((w) => ({ on: w.on || w.date || null, weight: w.w != null ? w.w : w.weight, unit: w.unit || "lb" }))
    : null;
  return {
    profile: { id: row.id, name: row.name, isNew: !!row.isNew, status: row.status || null },
    trainingAdherence: stats && stats.sessionsPlanned
      ? { pct: Math.round((stats.sessionsCompleted / stats.sessionsPlanned) * 100), done: stats.sessionsCompleted, planned: stats.sessionsPlanned }
      : null,
    foodLogs: stats && stats.daysLogged7d != null
      ? { lastLoggedOn: null, daysLogged7d: stats.daysLogged7d } // no last-log date in the rollup yet
      : null,
    shapeScoreHistory: null,   // needs a coach-gated weekly-score RPC (roadmap)
    weighIns,
    streaks: null,             // not exposed to coaches yet
    lastContact: null,         // needs a thread-timestamp lookup (roadmap)
    checkIn: checkins ? { lastWeekOf: checkins.length ? checkins[0].week_of || checkins[0].weekOf || null : null } : null,
    nutrition: stats && (stats.avgCalories != null || stats.avgProtein != null)
      ? { avgCalories: stats.avgCalories, targetCalories: null, avgProtein: stats.avgProtein, targetProtein: null }
      : null,
    goal: goals && goals.overall && goals.overall.target != null
      ? { target: Number(goals.overall.target), unit: goals.overall.unit || "lb", now: goals.overall.now != null ? Number(goals.overall.now) : null }
      : null,
    goalPhase: null,           // client_programs phase not in the overview yet
    milestones: null,
    payments: { mrrCents: row.mrrCents || 0, status: "active", lastSessionAt: row.lastAt || null },
  };
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
        const [roster, todayRes] = await Promise.all([
          _dashJson("/api/" + role + "/clients").catch(() => null),
          _dashJson("/api/" + role + "/dashboard").catch(() => null),
        ]);
        const today = todayRes && todayRes[roleKey] ? todayRes : null;
        if (!roster || !roster[roleKey]) return demo(today);
        // Roster first (fast paint for callers), then enrich rows with ids.
        const base = (roster.clients || []).map((row) => _dashRecordFromLive(row, null));
        if (on) setState({ loading: false, clients: base, source: "live", today });
        const rows = roster.clients || [];
        const overviews = await _dashPool(rows, (row) =>
          row.id ? _dashJson("/api/clients/" + encodeURIComponent(row.id) + "/shared-overview") : null
        );
        if (!on) return;
        setState({
          loading: false,
          clients: rows.map((row, i) => _dashRecordFromLive(row, overviews[i])),
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

Object.assign(window, { useDashboard });
