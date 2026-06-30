
function TrainerClientsPage() {
  const { loading, clients, triage, today: liveToday, source } = useDashboard("trainer");
  const [tab, setTab] = React.useState("all");
  const [sharedBadge, setSharedBadge] = React.useState(0);
  const [q, setQ] = React.useState("");
  const [flt, setFlt] = React.useState("all");

  const activeCount = clients.length;
  const mrrCents = clients.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0);
  const avgCents = activeCount ? Math.round(mrrCents / activeCount) : 0;
  const eyesCount = triage.filter((r) => r.severity !== "green").length;

  const tabStyle = (on) => ({ background: on ? "rgba(46,224,196,0.14)" : "transparent", color: on ? "#2ee0c4" : "rgba(242,237,228,0.65)", border: on ? "1px solid rgba(46,224,196,0.35)" : "1px solid rgba(242,237,228,0.12)", padding: "8px 16px", borderRadius: 999, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, fontWeight: 500, cursor: "pointer", letterSpacing: "0.02em" });
  const fltStyle = (on, warn) => ({ background: on ? (warn ? "rgba(216,162,58,0.16)" : "rgba(46,224,196,0.14)") : "transparent", color: on ? (warn ? "#d8a23a" : "#2ee0c4") : warn ? "rgba(216,162,58,0.85)" : "rgba(242,237,228,0.7)", border: on ? (warn ? "1px solid rgba(216,162,58,0.4)" : "1px solid rgba(46,224,196,0.35)") : "1px solid rgba(242,237,228,0.12)", padding: "7px 14px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" });
  // Needs Eyes leads — it's the signal-engine severity now, not a stale-sessions guess.
  const FILTERS = [["eyes", "At-risk · " + eyesCount, true], ["all", "All"], ["new", "New"], ["ontrack", "On track"]];

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
      subtitle="Your full roster — tap a row for the drilldown: score, adherence, notes, milestones, nutrition context."
      actions={
        <a href="MemberProfile.html" title="Share your public page - how clients find and subscribe to you" style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-block" }}>Invite client</a>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        {[
          { k: String(activeCount), l: "Active clients" },
          { k: dashMoney(mrrCents), l: "Monthly recurring" },
          { k: dashMoney(avgCents), l: "Avg / client" },
        ].map((x, i) => (
          <Card key={i} style={{ padding: "22px 22px 20px" }}>
            <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1 }}>{x.k}</div>
            <div style={{ fontSize: 13, marginTop: 12 }}>{x.l}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setTab("all")} style={tabStyle(tab === "all")}>All clients</button>
        <button onClick={() => setTab("shared")} style={tabStyle(tab === "shared")}>
          Shared clients{sharedBadge > 0 ? ` · ${sharedBadge} new` : ""}
        </button>
        <a href="TrainerLiveConsole.html" style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Console</a>
        <a href="TrainerAnalytics.html" style={{ ...tabStyle(false), textDecoration: "none", display: "inline-block" }}>Business</a>
      </div>
      <Card>
        {tab === "shared" ? (
          <SharedClientsTab role="trainer" onCountChange={setSharedBadge} />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, border: "1px solid rgba(242,237,228,0.12)", borderRadius: 12, background: "rgba(242,237,228,0.04)", padding: "11px 14px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,0.5)" strokeWidth="2" style={{ flex: "none" }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${clients.length} clients`} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", color: INK, fontFamily: sans, fontSize: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {FILTERS.map(([k, l, warn]) => <button key={k} onClick={() => setFlt(k)} style={fltStyle(flt === k, warn)}>{l}</button>)}
            </div>
            {loading
              ? <div style={{ padding: "34px 4px", textAlign: "center", color: "rgba(242,237,228,0.55)", fontSize: 13.5 }}>Loading roster…</div>
              : <DashRosterTable triage={triage} role="trainer" filter={flt} query={q} />}
          </>
        )}
      </Card>
    </DashPage>
    </React.Fragment>
  );
}
