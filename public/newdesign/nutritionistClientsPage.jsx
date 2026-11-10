// The roster's status filters, hoisted so their KEYS are derived rather than typed out a
// second time at the useRememberedChoice call below: a filter added here is remembered
// without anyone having to notice a second list exists. (2026-10-15: these six replaced
// the eight filter chips, whose "On track · all" / "On track" and "Needs attention" /
// "Needs you" + "Watch" pairs said the same thing twice. A remembered "eyes" or "ontrack"
// is no longer in the list, so it falls back to All. Since step 5a they are the parts of
// the roster-health bar, DashRosterHealth, and a remembered filter still applies there.)
const NCP_FILTERS = [["all", "All"], ["red", "Needs you"], ["amber", "Watch"], ["green", "On track"], ["new", "New"], ["unknown", "Progress unknown"]];
const NCP_FILTER_KEYS = NCP_FILTERS.map((f) => f[0]);

function NutritionistClientsPage() {
  const { loading, clients, triage, source, planCount, today, joint, dismissable, setDismissal, clearDismissal } = useDashboard("nutritionist");
  const [sharedBadge, setSharedBadge] = React.useState(0);
  // ⚠ THE SEARCH BOX IS DELIBERATELY NOT REMEMBERED. A filter is a standing preference
  // about how you read your roster; a half-typed name is a moment. Restoring one would
  // show a coach a roster mysteriously narrowed to "pri" a week later.
  const [q, setQ] = React.useState("");
  // ⚠ A ROSTER THAT COULD NOT BE READ (source "unread") IS NOT THE PREVIEW AND NOT EMPTY: no band, no
  // sample people, every count "—" and the list saying so, never "No clients yet" or 0.
  const unread = source === "unread";
  const prefs = useRememberedChoices(source === "live" || unread);
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
  const dismiss = { ok: !!dismissable, set: setDismissal, clear: clearDismissal };

  // The people with an open plan, as the Clients badge counts them (dashData.jsx dashPlanClientCount);
  // null when the plans could not be read. The list below keeps everyone, people from recent
  // sessions with no plan included, so search and the export still say how many rows there are.
  const activeCount = unread ? null : dashPlanClientCount(clients, planCount);
  const activeWord = activeCount == null ? "\u2014" : String(activeCount);
  const eyesCount = triage.filter((r) => r.severity === "red" || r.severity === "amber").length;
  // The bar's counts (unread is "—", never 0), and check-ins reviewed as Today's At a glance
  // reads it, over this page's roster: the same figure, never a second count of its own.
  const health = dashRosterHealth(triage, loading, unread);
  const reviewed = typeof dashGlanceCells === "function"
    ? dashGlanceCells("nutritionist", { live: source === "live" ? today || {} : null, clients, triage, role: "nutritionist", zone: today && today.dayZone, rosterUnread: unread }, ["reviewed"])[0]
    : null;
  // The panel's next session, from the schedule this page already reads (useDashboard's feed).
  const sessions = dashPeekSessions(today, source, "nutritionist");

  // ── A FIXED PAGE, NOT A BOARD (owner, 2026-10-15: "least overwhelming as possible, easy
  // to navigate", and the builder removed "like Programs"; the step 5 review: Clients is a
  // tool page and stays a fixed layout). The roster is the page: one switch between your
  // clients and the ones shared with you, the roster-health bar (its counts are its
  // filters), then search and the list, grouped by status. A client opens in the panel
  // beside the list at desktop widths, and ↑ ↓ move through the list (DashRosterPeek);
  // narrower, the panel is the slide-over. The five roster cards this page once offered as
  // optional widgets are still on Today, where the widget catalogue lives.
  return (
    <React.Fragment>
    {source === "demo" && <DashDemoBand />}
    <DashPage
      tourHero="hero-clients"
      navItems={nutriNavItems("clients")}
      // The sidebar shows Stripe's next payout on every coach page (DashSidebar, coach dashboard step 4a):
      // this page hands it the demo card, shown only to a signed-out viewer (Codex, #2633).
      payoutCard={nutriPayoutCard}
      eyebrow={activeWord + " ACTIVE CLIENT" + (activeCount === 1 ? "" : "S") + (eyesCount ? " · " + eyesCount + " NEED EYES" : "")}
      title="Clients"
      subtitle="Everyone you're feeding — tap a row for the quick consult: logs, macros, weigh-ins, training context."
      actions={<>
        <a href="NutritionistLiveConsole.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, textDecoration: "none", display: "inline-block" }}>Live console</a>
        {/* ⚠ INVITE IS THE NO-FEE LINK (owner, 2026-11-10: "do these work properly?"). It opened
            MemberProfile.html, whose Share copies the profile WITHOUT the `ref` token, so a client who
            joined through it counted as found on Shape and the coach paid the fee. Business · Growth's
            "Your profile link" card makes the referral link (create_coach_referral_link). */}
        <a href={typeof dashLinkedTab === "function" ? dashLinkedTab("business", "nutritionist", { section: "growth" }) : "NutritionistApp.html#business?section=growth"} data-invite-client="" title="Copy your profile link: clients who join through it pay no Shape fee" style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-block", textDecoration: "none" }}>Invite client</a>
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
          <DashRosterHealth health={health} filters={NCP_FILTERS} value={flt} onChange={setFlt} reviewed={reviewed} />
          <DashRosterPeek triage={triage} role="nutritionist" prefs={prefs} dismiss={dismiss} joint={joint} sessions={sessions}>
            {(peek) => (
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 10, minWidth: 0, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 10, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", padding: "10px 14px" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.5)" strokeWidth="2" style={{ flex: "none" }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
                    <input aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} placeholder={unread ? "Search clients" : `Search ${clients.length} clients`} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: INK, fontFamily: sans, fontSize: 14 }} />
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
                  : <DashRosterTable triage={triage} role="nutritionist" filter={flt} query={q} sort={sort} sortDir={sortDir} onSort={onSort} prefs={prefs} dismiss={dismiss} unread={unread} live={source === "live"}
                      selectedId={peek.selectedId} onSelect={peek.select} docked={peek.docked} />}
              </Card>
            )}
          </DashRosterPeek>
        </React.Fragment>
      )}
    </DashPage>
    </React.Fragment>
  );
}
