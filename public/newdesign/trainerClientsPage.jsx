
// The roster filter set, hoisted so its KEYS can be derived rather than typed out a
// second time at the useRememberedChoice call below: a filter added here is
// remembered without anyone having to notice a second list exists.
const TCP_FILTERS = (n) => [["eyes", "Needs attention · " + n, true], ["all", "All"], ["new", "New"], ["ontrack", "On track"], ["unknown", "Progress unknown"]];
const TCP_FILTER_KEYS = TCP_FILTERS(0).map((f) => f[0]);

function TrainerClientsPage() {
  const { loading, clients, triage, today: liveToday, source } = useDashboard("trainer");
  const [sharedBadge, setSharedBadge] = React.useState(0);
  // ⚠ THE SEARCH BOX IS DELIBERATELY NOT REMEMBERED. A filter is a standing preference
  // about how you read your roster; a half-typed name is a moment. Restoring one would
  // show a coach a roster mysteriously narrowed to "pri" a week later.
  const [q, setQ] = React.useState("");
  const prefs = useRememberedChoices(source === "live");
  const [tab, setTab] = useRememberedChoice(prefs, "clientsTab", ["all", "shared"], "all");
  const [flt, setFlt] = useRememberedChoice(prefs, "rosterFilter", TCP_FILTER_KEYS, "all");
  // The sort R16's memory was waiting on. `triage` — the engine's severity order — is
  // the default and is what the roster has always shown, so a coach who never touches a
  // header sees no change at all.
  const [sort, setSort] = useRememberedChoice(prefs, "rosterSort", DASH_ROSTER_SORT_KEYS, "triage");
  const [sortDir, setSortDir] = useRememberedChoice(prefs, "rosterSortDir", ["asc", "desc"], "desc");
  const onSort = (k, d) => { setSort(k); setSortDir(d); };

  const activeCount = clients.length;
  const mrrCents = clients.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0);
  const eyesCount = triage.filter((r) => r.severity === "red" || r.severity === "amber").length;
  const unknownCount = triage.filter((r) => r.severity === "unknown").length;

  const tabStyle = (on) => ({ background: on ? "rgba(46,224,196,0.14)" : "transparent", color: on ? "#2ee0c4" : "rgba(242,237,228,0.65)", border: on ? "1px solid rgba(46,224,196,0.35)" : "1px solid rgba(242,237,228,0.12)", padding: "8px 16px", borderRadius: 999, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, fontWeight: 500, cursor: "pointer", letterSpacing: "0.02em" });
  const fltStyle = (on, warn) => ({ background: on ? (warn ? "rgba(216,162,58,0.16)" : "rgba(46,224,196,0.14)") : "transparent", color: on ? (warn ? "#d8a23a" : "#2ee0c4") : warn ? "rgba(216,162,58,0.85)" : "rgba(242,237,228,0.7)", border: on ? (warn ? "1px solid rgba(216,162,58,0.4)" : "1px solid rgba(46,224,196,0.35)") : "1px solid rgba(242,237,228,0.12)", padding: "7px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" });
  // Needs Eyes leads — it's the signal-engine severity now, not a stale-sessions guess.
  const FILTERS = TCP_FILTERS(eyesCount);

  // ⚠ THE OPTIONAL CARDS READ THE SAME BUILDERS THE TODAY BOARD READS, and are
  // gated on the same `sigOk` — a roster that has not loaded (or could not be
  // read) yields null, which the `empty`/`emptyWhy` contract states honestly
  // rather than drawing an empty card. `DashSignals` is loaded by every host of
  // this page, before it (tests/dash-widget-catalog.test.mjs pins the order).
  // ⚠ A FEATURE TEST, NOT A PRESENCE TEST — the rule #2137 wrote down for the Today
  // board (tests/dash-widget-catalog.test.mjs) and this page has to follow, because it
  // calls the same five producers. dashSignals.js is a plain <script> whose ?v= the
  // precompile does NOT rewrite (it hashes text/babel tags only), so a warm cache can
  // hand us a copy that predates these functions while `typeof DashSignals` is still
  // "object". Asking only that would pass and then throw on the first call — and there
  // is no error boundary in public/newdesign, so that is a blank Clients page.
  const sigReady = typeof DashSignals !== "undefined"
    && ["dashRosterStatus", "dashTopMovers", "dashTenureMilestones", "dashRevenueByClient", "dashProgramsEnding"]
      .every((fn) => typeof DashSignals[fn] === "function");
  const sigOk = !loading && sigReady;
  // Two different reasons a card is empty, kept apart: the roster is still arriving, or
  // the module is stale. Telling a coach to wait for a roster that has already loaded is
  // the same class of wrong answer as telling them to reload for one that is loading.
  const staleWhy = sigReady ? "appears once your roster loads" : "reload the page to enable this widget";
  const rosterStatus = sigOk ? DashSignals.dashRosterStatus(triage) : null;
  const movers = sigOk ? DashSignals.dashTopMovers(clients) : null;
  const tenureMarks = sigOk ? DashSignals.dashTenureMilestones(clients) : null;
  const revenue = sigOk ? DashSignals.dashRevenueByClient(clients) : null;
  const ending = sigOk ? DashSignals.dashProgramsEnding(clients) : null;
  // The Today board's own panel frame, so a card looks the same on both tabs.
  const rosterPanel = (title, children) => (
    <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <React.Fragment>
    {source === "demo" && <DashDemoBand />}
    <DashPage
      tourHero="hero-clients"
      navItems={trainerNavItems("clients")}
      payoutCard={liveToday
        ? { label: "MONTHLY · MRR", amount: dashMoney(mrrCents), sub: activeCount + " active subs · payouts connect soon" }
        : trainerPayoutCard}
      eyebrow={activeCount + " ACTIVE CLIENT" + (activeCount === 1 ? "" : "S") + (eyesCount ? " · " + eyesCount + " AT-RISK" : "")}
      title="Clients"
      subtitle="Find a client, review their progress, and open their plan or private notes."
      actions={
        <a href="MemberProfile.html" title="Share your public page - how clients find and subscribe to you" style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-block" }}>Invite client</a>
      }
    >
      <div role="status" style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>
        <span>{activeCount} active clients</span>
        <span>{eyesCount} need attention</span>
        {unknownCount > 0 && <span>{unknownCount} awaiting progress data</span>}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setTab("all")} style={tabStyle(tab === "all")}>All clients</button>
        <button onClick={() => setTab("shared")} style={tabStyle(tab === "shared")}>
          Shared clients{sharedBadge > 0 ? ` · ${sharedBadge} new` : ""}
        </button>
        <a href="TrainerLiveConsole.html" style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Console</a>
        <a href={dashShellHref("TrainerAnalytics.html")} style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Business</a>
      </div>
      {/* ── The roster board (role-scoped, tab="clients"). The roster itself is the
          default widget; the roster-shaped cards below are optional, off until the
          coach adds them — each reuses the SAME panel the Today board renders, so a
          roster view cannot come to mean two different things on two tabs.
          ⚠ LAYOUT IS STORED PER role + tab, so adding "Roster by status" here does
          not put it on Today, and hiding it on Today does not take it off here. */}
      <DashGrid role="trainer" tab="clients" widgets={[
        { key: "roster", title: "Roster", size: "full",
          blurb: "Search, filter and sort every client, and open one for the full file.",
          render: () => (
            <React.Fragment>
        <Card>
          {tab === "shared" ? (
            <SharedClientsTab role="trainer" onCountChange={setSharedBadge} />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 12, background: "rgba(242,237,228,0.04)", padding: "11px 14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,0.5)" strokeWidth="2" style={{ flex: "none" }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
                <input aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${clients.length} clients`} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: INK, fontFamily: sans, fontSize: 14 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                {FILTERS.map(([k, l, warn]) => <button key={k} aria-pressed={flt === k} onClick={() => setFlt(k)} style={fltStyle(flt === k, warn)}>{l}</button>)}
                {/* ⚠ THE EXPORT IS THE WHOLE ROSTER, NOT THE FILTERED VIEW, AND IT SAYS SO.
                    A file that silently held whichever filter happened to be on is how a
                    coach hands their accountant three of their clients — the CSV carries a
                    Status column, so filtering belongs in the spreadsheet. */}
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {source === "live" && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.4)" }}>ALL {clients.length}</span>}
                  <DashExportButton kind="roster" label="your roster" live={source === "live"}
                    build={() => window.DashExport.rosterCsv(clients, new Date())} />
                </span>
              </div>
              {loading
                ? <div style={{ padding: "34px 4px", textAlign: "center", color: "rgba(242,237,228,0.55)", fontSize: 13.5 }}>Loading roster…</div>
                : <DashRosterTable triage={triage} role="trainer" filter={flt} query={q} sort={sort} sortDir={sortDir} onSort={onSort} prefs={prefs} />}
            </>
          )}
        </Card>
            </React.Fragment>
          ) },
        // ── Optional (off until added) ──
        { key: "status", title: "Roster by status", blurb: "How many clients need you, need watching, and are on track.", optional: true, size: "half",
          empty: !rosterStatus, emptyWhy: sigOk ? "the pulse could not be read" : staleWhy,
          render: () => rosterPanel("Roster by status", <DashRosterStatusPanel status={rosterStatus} role="trainer" />) },
        { key: "movers", title: "Top movers", blurb: "The biggest Shape Score moves, week over week.", optional: true, size: "half",
          empty: !movers || movers.known === 0, emptyWhy: sigOk ? "appears once clients share two full weeks of Shape Score" : staleWhy,
          render: () => rosterPanel("Top movers", <DashTopMoversPanel movers={movers} />) },
        { key: "anniversaries", title: "Client anniversaries", blurb: "Who reaches a tenure mark on Shape in the next 30 days.", optional: true, size: "half",
          empty: !tenureMarks || tenureMarks.total === 0 || tenureMarks.unknown === tenureMarks.total, emptyWhy: sigOk ? "appears once a client's start date is shared" : staleWhy,
          render: () => rosterPanel("Client anniversaries", <DashAnniversariesPanel marks={tenureMarks} />) },
        { key: "revenue", title: "Revenue by client", blurb: "Who pays what per month, from their subscriptions.", optional: true, size: "half",
          empty: !revenue || revenue.total === 0, emptyWhy: sigOk ? "appears once you have clients" : staleWhy,
          render: () => rosterPanel("Revenue by client", <DashRevenueByClientPanel rev={revenue} />) },
        { key: "ending", title: "Programs ending soon", blurb: "Whose current block runs out in the next three weeks — write the next one before the last session.", optional: true, size: "half",
          empty: !ending || ending.total === 0 || ending.unknown === ending.total, emptyWhy: sigOk ? "appears once a client is on one of your programs" : staleWhy,
          render: () => rosterPanel("Programs ending soon", <DashProgramsEndingPanel ending={ending} role="trainer" />) },
      ]} />
    </DashPage>
    </React.Fragment>
  );
}
