
// The roster filter set, hoisted so its KEYS can be derived rather than typed out a
// second time at the useRememberedChoice call below: a filter added here is
// remembered without anyone having to notice a second list exists.
const NCP_FILTERS = (n) => [["eyes", "Needs attention · " + n, true], ["all", "All"], ["new", "New"], ["ontrack", "On track"], ["unknown", "Progress unknown"]];
const NCP_FILTER_KEYS = NCP_FILTERS(0).map((f) => f[0]);

function NutritionistClientsPage() {
  const { loading, clients, triage, today: liveToday, source } = useDashboard("nutritionist");
  const [sharedBadge, setSharedBadge] = React.useState(0);
  // ⚠ THE SEARCH BOX IS DELIBERATELY NOT REMEMBERED. A filter is a standing preference
  // about how you read your roster; a half-typed name is a moment. Restoring one would
  // show a coach a roster mysteriously narrowed to "pri" a week later.
  const [q, setQ] = React.useState("");
  const prefs = useRememberedChoices(source === "live");
  const [tab, setTab] = useRememberedChoice(prefs, "clientsTab", ["all", "shared"], "all");
  const [flt, setFlt] = useRememberedChoice(prefs, "rosterFilter", NCP_FILTER_KEYS, "all");
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
  const FILTERS = NCP_FILTERS(eyesCount);

  return (
    <React.Fragment>
    {source === "demo" && <DashDemoBand />}
    <DashPage
      tourHero="hero-clients"
      navItems={nutriNavItems("clients")}
      payoutCard={liveToday
        ? { label: "MONTHLY · MRR", amount: dashMoney(mrrCents), sub: activeCount + " active subs · payouts connect soon" }
        : nutriPayoutCard}
      eyebrow={activeCount + " ACTIVE CLIENT" + (activeCount === 1 ? "" : "S") + (eyesCount ? " · " + eyesCount + " NEED EYES" : "")}
      title="Clients"
      subtitle="Everyone you're feeding — tap a row for the quick consult: logs, macros, weigh-ins, training context."
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
        <a href="NutritionistLiveConsole.html" style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Console</a>
        <a href={dashShellHref("NutritionistAnalytics.html")} style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Business</a>
      </div>
      <Card>
        {tab === "shared" ? (
          <SharedClientsTab role="nutritionist" onCountChange={setSharedBadge} />
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
              : <DashRosterTable triage={triage} role="nutritionist" filter={flt} query={q} sort={sort} sortDir={sortDir} onSort={onSort} prefs={prefs} />}
          </>
        )}
      </Card>
    </DashPage>
    </React.Fragment>
  );
}
