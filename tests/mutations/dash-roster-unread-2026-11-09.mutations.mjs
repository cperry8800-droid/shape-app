// Mutation spec for the roster's unread (tests/dash-roster-unread.test.mjs): useDashboard's split of a
// failed roster read into the preview (a 401, or 200 without this role) and "unread" (any other failure),
// and each coach page's gate on "unread": no band, no sample person, "couldn't be read" or "—" where it
// would otherwise claim nobody or count a 0, and its own reads still showing.
// Data: every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/dash-roster-unread-2026-11-09.mutations.mjs --fail-on-skipped
const DATA = 'public/newdesign/dashData.jsx';
const TODAY = 'public/newdesign/dashToday.jsx';
const ROSTER = 'public/newdesign/dashRoster.jsx';
const TCP = 'public/newdesign/trainerClientsPage.jsx';
const NCP = 'public/newdesign/nutritionistClientsPage.jsx';
const BIZ = 'public/newdesign/dashBusiness.jsx';
const SCHED = 'public/newdesign/dashSchedule.jsx';
const WEEK = 'public/newdesign/dashWeek.jsx';

export default {
  test: 'node --test tests/dash-roster-unread.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The hook: 401 / 200-not-this-role / 500 / network
    { name: 'hook: a 401 is unread', file: DATA,
      find: 'const preview = rosterRead.status === 401 || (', replace: 'const preview = rosterRead.status === 499 || (' },
    { name: 'hook: signed in without this role is unread', file: DATA,
      find: '(!!roster && typeof roster === "object" && roster[roleKey] === false)', replace: '(false)' },
    { name: 'hook: any 4xx is the preview', file: DATA,
      find: 'const preview = rosterRead.status === 401 || (', replace: 'const preview = rosterRead.status >= 400 || (' },
    { name: 'hook: a failed roster read is the preview again', file: DATA,
      find: 'return preview ? demo(today) : unread(today);', replace: 'return demo(today);' },
    { name: 'hook: the roster\'s status is dropped (every failure reads as signed out)', file: DATA,
      find: '(err) => ({ body: null, status: err && typeof err.status === "number" ? err.status : null })', replace: '() => ({ body: null, status: 401 })' },
    { name: 'hook: a network error reads as signed out', file: DATA,
      find: 'status: err && typeof err.status === "number" ? err.status : null })', replace: 'status: err && typeof err.status === "number" ? err.status : 401 })' },
    { name: 'hook: a throw after the roster read is the preview', file: DATA,
      find: '        else unread(todaySeen);', replace: '        else demo(null);' },
    { name: 'hook: a throw drops the day feed', file: DATA,
      find: '        else unread(todaySeen);', replace: '        else unread(null);' },
    { name: 'hook: unread hands back the sample\'s people', file: DATA,
      find: 'setState({ loading: false, clients: [], source: "unread"', replace: 'setState({ loading: false, clients: DashSignals.buildMockClients(), source: "unread"' },
    { name: 'hook: unread drops the day feed', file: DATA,
      find: 'source: "unread", today: today || null, client: null', replace: 'source: "unread", today: null, client: null' },
    { name: 'hook: unread is still loading', file: DATA,
      find: 'setState({ loading: false, clients: [], source: "unread"', replace: 'setState({ loading: true, clients: [], source: "unread"' },
    { name: 'hook: a failed quiet re-read leaves live', file: DATA,
      find: 'const had = quiet && stateRef.current.source === "live" ? stateRef.current : null;', replace: 'const had = null;' },

    // ── Today
    { name: 'today: unread is a sample', file: TODAY,
      find: 'const sample = source === "demo";', replace: 'const sample = source !== "live";' },
    { name: 'today: the brief and Needs you read an unread roster as nobody', file: TODAY,
      find: 'const needSplit = !rosterUnread && Array.isArray(triage)', replace: 'const needSplit = Array.isArray(triage)' },
    { name: 'today: the sample\'s day stands in for an unread roster', file: TODAY,
      find: 'const dayDemoRows = nowRows ? null : sample ? cfg.mockSchedule : [];', replace: 'const dayDemoRows = nowRows ? null : source === "live" ? [] : cfg.mockSchedule;' },
    { name: 'today: a roster card shows its empty sentence', file: TODAY,
      find: 'renderPanel(title, rosterUnread ? <DashRosterUnread /> : children)', replace: 'renderPanel(title, children)' },
    { name: 'today: a Work queues tab shows its empty sentence', file: TODAY,
      find: '(rosterUnread ? { key: tab.key, label: tab.label, render: () => <DashRosterUnread /> } : tab)', replace: '(tab)' },
    { name: 'today: a roster figure counts 0 over an unread roster', file: TODAY,
      find: '    if (dashKpiFromRoster(key, ctx)) return { value: null, unit: out.unit, why: "couldn\'t be read" };\n', replace: '' },
    { name: 'today: the feed\'s client count and net read as the roster\'s', file: TODAY,
      find: 'return (key === "activeClients" || key === "monthlyNet") && !(ctx && ctx.live && ctx.live.kpis);', replace: 'return key === "activeClients" || key === "monthlyNet";' },
    { name: 'today: "live only" on a page that is not the preview', file: TODAY,
      find: '    if (out.value == null && out.why === "live only") return { ...out, why: "couldn\'t be read" };\n', replace: '' },
    { name: 'today: figures still loading read as failed', file: TODAY,
      find: '  if (ctx.waiting) return { value: null, unit: out.unit, why: "loading" };\n', replace: '' },
    { name: 'today: the page\'s own reads are the live page\'s only', file: TODAY,
      find: 'const ownReads = source === "live" || rosterUnread;', replace: 'const ownReads = source === "live";' },
    { name: 'today: a day still loading reads as unread', file: TODAY,
      find: 'const dayUnread = waiting ? "loading" : !scheduleRead;', replace: 'const dayUnread = !scheduleRead;' },
    { name: 'today: Up next says no shared history over an unread roster', file: TODAY,
      find: '{context || (rosterUnread ? DASH_ROSTER_UNREAD : "No shared history yet")}</div>', replace: '{context || "No shared history yet"}</div>' },
    { name: 'today: a roster card leaves the board (revenue)', file: TODAY,
      find: 'empty: rosterUnread ? !sigOk : !revenue || revenue.total === 0', replace: 'empty: !revenue || revenue.total === 0' },
    { name: 'today: a roster card leaves the board (logging trend)', file: TODAY,
      find: 'empty: !rosterUnread && (!logTrend || logTrend.held === 0),', replace: 'empty: !logTrend || logTrend.held === 0,' },
    { name: 'today: the Business card draws the sample\'s growth without a feed', file: TODAY,
      find: 'const g = live ? (live.growth || null) : preview ? DASH_DEMO_GROWTH[role] : null;', replace: 'const g = live ? (live.growth || null) : DASH_DEMO_GROWTH[role];' },
    { name: 'today: the Business card is handed no preview flag', file: TODAY,
      find: '<DashBusinessSummary live={live} role={role} clients={clients} preview={sample} />) },', replace: '<DashBusinessSummary live={live} role={role} clients={clients} />) },' },

    // ── Clients
    { name: 'roster: the health bar counts 0 over an unread roster', file: ROSTER,
      find: '  if (unread) return { state: "unread", counts: none, reading: null, total: null };\n', replace: '' },
    { name: 'roster: the panel\'s schedule ignores the feed for an unread roster', file: ROSTER,
      find: 'if (source !== "live" && source !== "unread") return { state: "unread" };', replace: 'if (source !== "live") return { state: "unread" };' },
    { name: 'roster: the list says "No clients yet"', file: ROSTER,
      find: '{unread ? "Your roster couldn\'t be read just now · reload to try again" : triage.length === 0', replace: '{triage.length === 0' },
    { name: 'clients (trainer): the bar is not told', file: TCP, find: 'dashRosterHealth(triage, loading, unread)', replace: 'dashRosterHealth(triage, loading)' },
    { name: 'clients (nutritionist): the bar is not told', file: NCP, find: 'dashRosterHealth(triage, loading, unread)', replace: 'dashRosterHealth(triage, loading)' },
    { name: 'clients (trainer): 0 active clients', file: TCP,
      find: 'const activeCount = unread ? null : dashPlanClientCount(clients, planCount);', replace: 'const activeCount = dashPlanClientCount(clients, planCount);' },
    { name: 'clients (nutritionist): 0 active clients', file: NCP,
      find: 'const activeCount = unread ? null : dashPlanClientCount(clients, planCount);', replace: 'const activeCount = dashPlanClientCount(clients, planCount);' },
    { name: 'clients (trainer): the table is not told', file: TCP,
      find: 'prefs={prefs} dismiss={dismiss} unread={unread}', replace: 'prefs={prefs} dismiss={dismiss}' },
    { name: 'clients (nutritionist): the table is not told', file: NCP,
      find: 'prefs={prefs} dismiss={dismiss} unread={unread}', replace: 'prefs={prefs} dismiss={dismiss}' },
    { name: 'clients (trainer): check-ins reviewed over an unread roster', file: TCP,
      find: 'zone: today && today.dayZone, rosterUnread: unread }', replace: 'zone: today && today.dayZone }' },
    { name: 'clients (nutritionist): check-ins reviewed over an unread roster', file: NCP,
      find: 'zone: today && today.dayZone, rosterUnread: unread }', replace: 'zone: today && today.dayZone }' },
    { name: 'clients (trainer): "Search 0 clients"', file: TCP,
      find: 'placeholder={unread ? "Search clients" : `Search ${clients.length} clients`}', replace: 'placeholder={`Search ${clients.length} clients`}' },

    // ── Business
    { name: 'business: an unread roster waits on the analytics', file: BIZ,
      find: ' : source === "unread" ? "unread" : source == null', replace: ' : source == null' },
    { name: 'business: the payout waits on the analytics for an unread roster', file: BIZ,
      find: 'const askPayout = !preview && (source === "live" || source === "unread" || !!live', replace: 'const askPayout = !preview && (source === "live" || !!live' },

    // ── Schedule
    { name: 'schedule: live is the day feed again', file: SCHED,
      find: 'const isLive = !!live || source === "live" || rosterUnread;', replace: 'const isLive = !!live;' },
    { name: 'schedule: an unread roster is not live', file: SCHED,
      find: 'const isLive = !!live || source === "live" || rosterUnread;', replace: 'const isLive = !!live || source === "live";' },
    { name: 'schedule: the hours wait on a roster', file: SCHED,
      find: 'const hoursState = isLive ?', replace: 'const hoursState = source === "live" ?' },
    { name: 'schedule: the book sheet says "No clients on your roster yet"', file: SCHED,
      find: 'onBook={bookSession} rosterUnread={rosterUnread}', replace: 'onBook={bookSession}' },

    // ── Week
    { name: 'week: an unread roster is the preview', file: WEEK,
      find: 'const preview = source === "demo";', replace: 'const preview = source === "demo" || source === "unread";' },
    { name: 'week: an unread roster reads as an empty one', file: WEEK,
      find: 'const rosterUnread = source === "unread";', replace: 'const rosterUnread = false;' },
    { name: 'week: the roster counts 0 clients', file: WEEK,
      find: '{rosterUnread ? "The roster · —" : "The roster · "', replace: '{"The roster · "' },
  ],
};
