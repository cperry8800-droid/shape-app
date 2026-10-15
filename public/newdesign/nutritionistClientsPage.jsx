
// The roster's status tiles, hoisted so their KEYS are derived rather than typed out a
// second time at the useRememberedChoice call below: a tile added here is remembered
// without anyone having to notice a second list exists. (2026-10-15: these six replace
// the eight filter chips, whose "On track · all" / "On track" and "Needs attention" /
// "Needs you" + "Watch" pairs said the same thing twice. A remembered "eyes" or "ontrack"
// is no longer in the list, so it falls back to All.)
const NCP_FILTERS = [["all", "All"], ["red", "Needs you"], ["amber", "Watch"], ["green", "On track"], ["new", "New"], ["unknown", "Progress unknown"]];
const NCP_FILTER_KEYS = NCP_FILTERS.map((f) => f[0]);

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
  const requestedStatus = dashRouteParam("status");
  React.useEffect(() => {
    if (["red", "amber", "green", "unknown"].includes(requestedStatus)) { setTab("all"); setFlt(requestedStatus); }
  }, [requestedStatus]);
  // The sort R16's memory was waiting on. `triage` — the engine's severity order — is
  // the default and is what the roster has always shown, so a coach who never touches a
  // header sees no change at all.
  const [sort, setSort] = useRememberedChoice(prefs, "rosterSort", DASH_ROSTER_SORT_KEYS, "triage");
  const [sortDir, setSortDir] = useRememberedChoice(prefs, "rosterSortDir", ["asc", "desc"], "desc");
  const onSort = (k, d) => { setSort(k); setSortDir(d); };

  const activeCount = clients.length;
  const mrrCents = clients.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0);
  const eyesCount = triage.filter((r) => r.severity === "red" || r.severity === "amber").length;

  // ── A FIXED PAGE, NOT A BOARD (owner, 2026-10-15: "least overwhelming as possible, easy
  // to navigate", and the builder removed "like Programs"). The roster is the page: one
  // switch between your clients and the ones shared with you, the status tiles (count and
  // filter in one), then search and the table. The five roster cards this page offered as
  // optional widgets are still on Today, where the widget catalogue lives.
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
      actions={<>
        <a href="NutritionistLiveConsole.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, textDecoration: "none", display: "inline-block" }}>Live console</a>
        <a href="MemberProfile.html" title="Share your public page - how clients find and subscribe to you" style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-block", textDecoration: "none" }}>Invite client</a>
      </>}
    >
      <div style={{ marginBottom: 16 }}>
        <DashSegmented label="Which clients" value={tab} onChange={setTab} items={[
          { key: "all", label: "Your clients", count: loading ? null : activeCount },
          { key: "shared", label: "Shared with you", count: sharedBadge > 0 ? sharedBadge + " new" : null },
        ]} />
      </div>
      {tab === "shared" ? (
        <Card><SharedClientsTab role="nutritionist" onCountChange={setSharedBadge} /></Card>
      ) : (
        <React.Fragment>
          <DashRosterTiles triage={triage} filters={NCP_FILTERS} value={flt} onChange={setFlt} loading={loading} />
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 10, minWidth: 0, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 10, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", padding: "10px 14px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.5)" strokeWidth="2" style={{ flex: "none" }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
                <input aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${clients.length} clients`} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: INK, fontFamily: sans, fontSize: 14 }} />
              </div>
              {/* ⚠ THE EXPORT IS THE WHOLE ROSTER, NOT THE FILTERED VIEW, AND IT SAYS SO.
                  A file that silently held whichever filter happened to be on is how a
                  coach hands their accountant three of their clients — the CSV carries a
                  Status column, so filtering belongs in the spreadsheet. */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {source === "live" && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--sh-ink3, #75706a)" }}>ALL {clients.length}</span>}
                <DashExportButton kind="roster" label="your roster" live={source === "live"}
                  build={() => window.DashExport.rosterCsv(clients, new Date())} />
              </span>
            </div>
            {loading
              ? <div style={{ padding: "34px 4px", textAlign: "center", color: "var(--sh-ink2, #a09b94)", fontSize: 13.5 }}>Loading roster…</div>
              : <DashRosterTable triage={triage} role="nutritionist" filter={flt} query={q} sort={sort} sortDir={sortDir} onSort={onSort} prefs={prefs} />}
          </Card>
        </React.Fragment>
      )}
    </DashPage>
    </React.Fragment>
  );
}
