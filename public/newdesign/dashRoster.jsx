// Roster v2 components (dashboard-v2 step 6) — shared by the coach Clients
// pages. Data comes from useDashboard(role); rows are the triage feed (so
// "Needs eyes" is the signal engine, not a stale-sessions heuristic), and
// clicking a row opens the quick-consult slide-over — no navigation.
//
// Load order: pageShell → trainerDashboard.jsx → coachNav → dashSignals.js →
// dashData.jsx → dashToday.jsx (DashPill/helpers) → this file.

const DASH_ROSTER_INK50 = "rgba(242,237,228,0.55)";

function dashDaysSince(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(String(isoStr).length === 10 ? isoStr + "T00:00:00" : isoStr);
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  } catch (e) { return null; }
}

// Honest column values — a real value, or a labelled empty state. Never a
// bare dash that looks like missing plumbing.
function dashLastLogLabel(rec) {
  const f = rec.foodLogs;
  if (!f) return { text: "Not shared", dim: true };
  if (f.lastLoggedOn) {
    const d = dashDaysSince(f.lastLoggedOn);
    return { text: d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago", dim: false, warn: d >= 3 };
  }
  if (f.daysLogged7d != null) return { text: f.daysLogged7d + "/7 this wk", dim: false, warn: f.daysLogged7d === 0 };
  return { text: "Not shared", dim: true };
}
function dashComplianceLabel(rec) {
  const f = rec.foodLogs;
  if (!f || f.daysLogged7d == null) return { text: "Not shared", dim: true };
  const pct = Math.round((Math.min(7, f.daysLogged7d) / 7) * 100);
  return { text: pct + "%", dim: false, warn: pct < 50 };
}
function dashPhaseLabel(rec) {
  return rec.goalPhase ? { text: rec.goalPhase, dim: false } : { text: "Not set", dim: true };
}
function dashConsultLabel(rec) {
  const at = rec.payments && rec.payments.lastSessionAt;
  if (!at) return { text: "No consults yet", dim: true };
  const d = dashDaysSince(at);
  return { text: d === 0 ? "Today" : d + "d", dim: false, warn: d >= 14 };
}

// ── Quick-consult slide-over ─────────────────────────────────────────────────
function DashDrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#2ee0c4" }}>{title}</div>
      <div style={{ height: 2, background: "linear-gradient(90deg, #2ee0c4, rgba(46,224,196,0.2) 45%, transparent 85%)", margin: "7px 0 12px" }} />
      {children}
    </div>
  );
}
function DashDrawerEmpty({ children }) {
  return <div style={{ fontSize: 12.5, color: DASH_ROSTER_INK50, lineHeight: 1.5 }}>{children}</div>;
}

function DashConsultDrawer({ row, role, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!row) return null;
  const rec = row.client;
  const n = rec.nutrition;
  const sevColor = row.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[row.severity];

  const macroRow = (label, avg, target, overBad) => {
    if (avg == null) return null;
    const pct = target ? Math.round((avg / target) * 100) : null;
    const bad = pct != null && (overBad ? pct > 110 : pct < 85);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: DASH_ROSTER_INK50, textTransform: "uppercase" }}>{label}</span>
        <div style={{ position: "relative", height: 5, background: "rgba(242,237,228,0.08)", borderRadius: 2 }}>
          {pct != null && <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, pct) + "%", background: bad ? DASH_SEV_COLORS.red : "#2ee0c4", borderRadius: 2 }} />}
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: bad ? DASH_SEV_COLORS.red : "#f2ede4", whiteSpace: "nowrap" }}>
          {avg}{target ? <span style={{ color: DASH_ROSTER_INK50 }}>/{target} ({pct}%)</span> : <span style={{ color: DASH_ROSTER_INK50 }}> · no target set</span>}
        </span>
      </div>
    );
  };

  const weighIns = Array.isArray(rec.weighIns) ? rec.weighIns.filter((w) => w && w.weight != null) : [];
  const wDelta = weighIns.length >= 2 ? Math.round((weighIns[weighIns.length - 1].weight - weighIns[0].weight) * 10) / 10 : null;
  const hist = rec.shapeScoreHistory;
  const wkPts = Array.isArray(hist) && hist.length ? hist[hist.length - 1].points : null;
  const wkDelta = Array.isArray(hist) && hist.length >= 2 ? hist[hist.length - 1].points - hist[hist.length - 2].points : null;
  const adh = rec.trainingAdherence;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(440px, 92vw)", background: "#14110e", borderLeft: "1px solid rgba(242,237,228,0.12)", boxShadow: "-24px 0 60px rgba(0,0,0,0.5)", overflowY: "auto", padding: "26px 26px 40px", fontFamily: "'Space Grotesk', sans-serif", color: "#f2ede4" }}>
        {/* Head */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Quick consult</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, letterSpacing: "-0.02em", marginTop: 5 }}>{rec.profile.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: DASH_ROSTER_INK50, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 22 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: sevColor }} />
          {row.flags.length
            ? row.flags.map((f, i) => <DashPill key={i} c={sevColor}>{f.label}</DashPill>)
            : <DashPill c={sevColor}>{rec.profile.isNew ? "New" : "On track"}</DashPill>}
          {rec.goalPhase && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{rec.goalPhase} phase</span>}
        </div>

        {/* Last 3 days of logs */}
        <DashDrawerSection title="Last 3 days · food logs">
          {Array.isArray(rec.recentLogs) && rec.recentLogs.length ? rec.recentLogs.slice(0, 3).map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50 }}>{(() => { const d = dashDaysSince(l.on); return d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago"; })()}</span>
              <span style={{ fontSize: 12.5 }}>{l.kcal != null ? l.kcal.toLocaleString() + " kcal" : "logged"}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: DASH_ROSTER_INK50 }}>{l.protein != null ? l.protein + "g P" : ""}</span>
            </div>
          )) : rec.recentLogs ? (
            <DashDrawerEmpty>No logs in the window — matches the flag above.</DashDrawerEmpty>
          ) : (
            <DashDrawerEmpty>Per-day log detail isn't shared to the web yet — weekly compliance is in the roster column.</DashDrawerEmpty>
          )}
        </DashDrawerSection>

        {/* Macros vs targets */}
        <DashDrawerSection title="Macros vs targets · 7d avg">
          {n && (n.avgCalories != null || n.avgProtein != null) ? (
            <div>
              {macroRow("Calories", n.avgCalories, n.targetCalories, true)}
              {macroRow("Protein", n.avgProtein, n.targetProtein, false)}
            </div>
          ) : (
            <DashDrawerEmpty>No intake averages shared yet.</DashDrawerEmpty>
          )}
        </DashDrawerSection>

        {/* Weigh-in trend */}
        <DashDrawerSection title="Weigh-in trend">
          {weighIns.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg width="120" height="34" viewBox="0 0 120 34" style={{ flexShrink: 0 }}>
                {(() => {
                  const ws = weighIns.map((w) => w.weight);
                  const min = Math.min(...ws), max = Math.max(...ws), span = max - min || 1;
                  const pts = ws.map((w, i) => (ws.length === 1 ? "60,17" : (i / (ws.length - 1)) * 116 + 2 + "," + (30 - ((w - min) / span) * 26)));
                  return <polyline points={pts.join(" ")} fill="none" stroke="#2ee0c4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
                })()}
              </svg>
              <div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, letterSpacing: "-0.02em" }}>
                  {weighIns[weighIns.length - 1].weight} <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>{weighIns[weighIns.length - 1].unit || "lb"}</span>
                </div>
                {wDelta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50, marginTop: 2 }}>{wDelta > 0 ? "+" : ""}{wDelta} since first shared weigh-in</div>}
              </div>
            </div>
          ) : (
            <DashDrawerEmpty>No shared weigh-ins yet.</DashDrawerEmpty>
          )}
        </DashDrawerSection>

        {/* Training context — read-only, from the trainer side */}
        <DashDrawerSection title="Training context · read-only">
          {adh || wkPts != null ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Volume · 42d</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, marginTop: 5 }}>{adh ? adh.done + "/" + adh.planned : "—"}</div>
                <div style={{ fontSize: 10.5, color: DASH_ROSTER_INK50, marginTop: 2 }}>{adh ? adh.pct + "% adherence" : "not shared"}</div>
              </div>
              <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Shape Score · wk</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, marginTop: 5 }}>{wkPts != null ? wkPts + " pts" : "—"}</div>
                <div style={{ fontSize: 10.5, color: wkDelta == null ? DASH_ROSTER_INK50 : wkDelta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red, marginTop: 2 }}>{wkDelta != null ? (wkDelta >= 0 ? "▲ +" + wkDelta : "▼ −" + Math.abs(wkDelta)) + " wk/wk" : "history not shared"}</div>
              </div>
            </div>
          ) : (
            <DashDrawerEmpty>Training data isn't shared to coaches on the web yet.</DashDrawerEmpty>
          )}
        </DashDrawerSection>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <button onClick={() => dashMessageClient(rec.profile.name, role)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#06231f", background: "#2ee0c4", border: 0, borderRadius: 4, padding: "11px 18px", cursor: "pointer" }}>Send note</button>
          <a href={dashClientSlugHref(rec.profile.name)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DASH_ROSTER_INK50, textDecoration: "none" }}>Full profile →</a>
        </div>
      </div>
    </div>
  );
}

// ── Roster table — triage-ordered rows + roadmap columns ────────────────────
const DASH_ROSTER_COLS = "2fr 110px 110px 110px 120px";

function DashRosterTable({ triage, role, filter, query }) {
  const [open, setOpen] = React.useState(null); // triage row in the drawer
  const ink50 = DASH_ROSTER_INK50;

  const matchesFilter = (r) => {
    if (filter === "eyes") return r.severity !== "green";
    if (filter === "new") return !!r.client.profile.isNew;
    if (filter === "ontrack") return r.severity === "green" && !r.client.profile.isNew;
    return true;
  };
  const q = (query || "").trim().toLowerCase();
  const rows = triage.filter(matchesFilter).filter((r) => !q || r.client.profile.name.toLowerCase().includes(q));

  const cell = (v) => (
    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: v.dim ? "rgba(242,237,228,0.4)" : v.warn ? DASH_SEV_COLORS.amber : "rgba(242,237,228,0.85)", fontStyle: v.dim ? "italic" : "normal" }}>{v.text}</span>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: DASH_ROSTER_COLS, gap: 12, padding: "6px 4px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: ink50, borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <span>CLIENT</span><span>LAST FOOD LOG</span><span>COMPLIANCE · 7D</span><span>GOAL PHASE</span><span>LAST CONSULT</span>
      </div>
      {rows.length === 0 && (
        <div style={{ padding: "34px 4px", textAlign: "center", color: ink50, fontSize: 13.5 }}>
          {triage.length === 0 ? "No clients yet. Share your public profile to start getting subscribers." : "No clients match this search or filter."}
        </div>
      )}
      {rows.map((r, i) => {
        const rec = r.client;
        const sevColor = r.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[r.severity];
        return (
          <div
            key={rec.profile.id || i}
            onClick={() => setOpen(r)}
            role="button"
            aria-label={"Open " + rec.profile.name + " quick consult"}
            style={{ display: "grid", gridTemplateColumns: DASH_ROSTER_COLS, gap: 12, padding: "14px 4px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)", cursor: "pointer" }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 2, background: sevColor }} />
              <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.profile.name}</span>
              {r.flags.length > 0 && <DashPill c={sevColor}>{r.flags[0].label}</DashPill>}
              {rec.profile.isNew && r.severity === "green" && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}
            </div>
            {cell(dashLastLogLabel(rec))}
            {cell(dashComplianceLabel(rec))}
            {cell(dashPhaseLabel(rec))}
            {cell(dashConsultLabel(rec))}
          </div>
        );
      })}
      {open && <DashConsultDrawer row={open} role={role} onClose={() => setOpen(null)} />}
    </div>
  );
}

Object.assign(window, { DashRosterTable, DashConsultDrawer });
