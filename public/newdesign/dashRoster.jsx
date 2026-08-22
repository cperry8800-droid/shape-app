// Roster v2 + the shared client drilldown drawer (dashboard-v2 steps 6 + 11).
//
// DashRosterTable renders the triage feed with ROLE-CONFIGURED columns
// (nutritionist: food-log columns; trainer: score/adherence/program/streak/
// contact), and DashClientDrawer is the shared slide-over — opened from any
// roster row OR the Client Pulse feed — whose section set is role-configured
// (trainer: score history · adherence · coach notes · milestones · read-only
// nutrition summary; nutritionist: logs · macros · weigh-ins · read-only
// training context). Every value is real or a labelled honest empty state.
//
// Load order: pageShell → trainerDashboard.jsx → coachNav/clientNav →
// dashSignals.js → dashData.jsx → dashToday.jsx (DashPill/helpers) → this.

const DASH_ROSTER_INK50 = "rgba(242,237,228,0.55)";

function dashDaysSince(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(String(isoStr).length === 10 ? isoStr + "T00:00:00" : isoStr);
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  } catch (e) { return null; }
}
function dashRelShort(isoStr) {
  const d = dashDaysSince(isoStr);
  return d == null ? null : d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago";
}

// ── Honest cell values — real, or a labelled empty state, never a bare dash ──
function dashCellText(v) {
  return (
    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: v.dim ? "rgba(242,237,228,0.4)" : v.warn ? DASH_SEV_COLORS.amber : "rgba(242,237,228,0.85)", fontStyle: v.dim ? "italic" : "normal", whiteSpace: "nowrap" }}>{v.text}</span>
  );
}
function dashLastLogLabel(rec) {
  const f = rec.foodLogs;
  if (!f) return { text: "Not shared", dim: true };
  if (f.lastLoggedOn) {
    const d = dashDaysSince(f.lastLoggedOn);
    return { text: d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago", warn: d >= 3 };
  }
  if (f.daysLogged7d != null) return { text: f.daysLogged7d + "/7 this wk", warn: f.daysLogged7d === 0 };
  return { text: "Not shared", dim: true };
}
function dashComplianceLabel(rec) {
  const f = rec.foodLogs;
  if (!f || f.daysLogged7d == null) return { text: "Not shared", dim: true };
  const pct = Math.round((Math.min(7, f.daysLogged7d) / 7) * 100);
  return { text: pct + "%", warn: pct < 50 };
}
function dashPhaseLabel(rec) {
  return rec.goalPhase ? { text: rec.goalPhase } : { text: "Not set", dim: true };
}
function dashConsultLabel(rec) {
  const at = rec.payments && rec.payments.lastSessionAt;
  if (!at) return { text: "No consults yet", dim: true };
  const d = dashDaysSince(at);
  return { text: d === 0 ? "Today" : d + "d", warn: d >= 14 };
}
function dashAdherenceLabel(rec) {
  const a = rec.trainingAdherence;
  if (!a || a.pct == null) return { text: "Not shared", dim: true };
  return { text: a.pct + "%", warn: a.pct < 70 };
}
function dashProgramLabel(rec) {
  const pr = rec.program;
  if (!pr || !pr.name) return { text: "Not set", dim: true };
  return { text: pr.name + (pr.week ? " · Wk " + pr.week + (pr.weeks ? "/" + pr.weeks : "") : "") };
}
function dashStreakLabel(rec) {
  const s = rec.streaks;
  if (!s || s.current == null) return { text: "Not shared", dim: true };
  return { text: s.current + "d", warn: s.current === 0 && s.best >= 3 };
}
function dashContactLabel(rec, role) {
  const lc = rec.lastContact;
  const ts = lc ? (role === "nutritionist" ? lc.nutritionist : lc.trainer) : null;
  if (!ts) return { text: "Not shared", dim: true };
  const d = dashDaysSince(ts);
  return { text: d === 0 ? "Today" : d + "d ago", warn: d >= 5 };
}
function dashScoreCell(rec) {
  const h = rec.shapeScoreHistory;
  if (!Array.isArray(h) || !h.length) return dashCellText({ text: "Not shared", dim: true });
  const last = h[h.length - 1].points;
  const delta = h.length >= 2 ? last - h[h.length - 2].points : null;
  return (
    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.85)", whiteSpace: "nowrap" }}>
      {last}{delta != null && <span style={{ color: delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}> {delta >= 0 ? "▲+" + delta : "▼−" + Math.abs(delta)}</span>}
    </span>
  );
}

// ── Role-configured columns ──────────────────────────────────────────────────
const DASH_ROSTER_VIEWS = {
  nutritionist: {
    cols: "2fr 110px 110px 110px 120px",
    minWidth: 640,
    heads: ["LAST FOOD LOG", "COMPLIANCE · 7D", "GOAL PHASE", "LAST CONSULT"],
    cells: (rec, role) => [
      dashCellText(dashLastLogLabel(rec)),
      dashCellText(dashComplianceLabel(rec)),
      dashCellText(dashPhaseLabel(rec)),
      dashCellText(dashConsultLabel(rec)),
    ],
  },
  trainer: {
    cols: "1.8fr 110px 96px 170px 70px 100px",
    minWidth: 760,
    heads: ["SCORE · WK", "ADHERENCE", "PROGRAM", "STREAK", "LAST CONTACT"],
    cells: (rec, role) => [
      dashScoreCell(rec),
      dashCellText(dashAdherenceLabel(rec)),
      dashCellText(dashProgramLabel(rec)),
      dashCellText(dashStreakLabel(rec)),
      dashCellText(dashContactLabel(rec, role)),
    ],
  },
};

// ── The shared drilldown drawer ──────────────────────────────────────────────
function DashDrawerSection({ title, right, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#2ee0c4" }}>{title}</div>
        {right && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{right}</div>}
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, #2ee0c4, rgba(46,224,196,0.2) 45%, transparent 85%)", margin: "7px 0 12px" }} />
      {children}
    </div>
  );
}
function DashDrawerEmpty({ children }) {
  return <div style={{ fontSize: 12.5, color: DASH_ROSTER_INK50, lineHeight: 1.5 }}>{children}</div>;
}
function DashDrawerSpark({ data, color = "#2ee0c4", w = 120, h = 34 }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => ((i / (data.length - 1)) * (w - 4) + 2) + "," + (h - 4 - ((v - min) / span) * (h - 8)));
  return <svg width={w} height={h} style={{ flexShrink: 0 }}><polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Section bodies — each handles its own honest empty state.
function DashSecScore({ rec }) {
  const h = rec.shapeScoreHistory;
  if (!Array.isArray(h) || !h.length) return <DashDrawerEmpty>Score history isn't shared to coaches yet.</DashDrawerEmpty>;
  const last = h[h.length - 1].points;
  const delta = h.length >= 2 ? last - h[h.length - 2].points : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <DashDrawerSpark data={h.map((x) => x.points)} />
      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, letterSpacing: "-0.02em" }}>{last} <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>wk pts</span></div>
        {delta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, marginTop: 3, color: delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}>{delta >= 0 ? "▲ +" + delta : "▼ −" + Math.abs(delta)} wk/wk</div>}
      </div>
    </div>
  );
}
function DashSecAdherence({ rec }) {
  const a = rec.trainingAdherence;
  if (!a) return <DashDrawerEmpty>Session data isn't shared yet.</DashDrawerEmpty>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22 }}>{a.pct}%</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50 }}>{a.done}/{a.planned} sessions · 42d</span>
      </div>
      <div style={{ position: "relative", height: 6, background: "rgba(242,237,228,0.08)", borderRadius: 2, marginTop: 8 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, a.pct) + "%", background: a.pct < 70 ? DASH_SEV_COLORS.amber : "#2ee0c4", borderRadius: 2 }} />
      </div>
    </div>
  );
}
function DashSecNotes({ rec }) {
  const notes = rec.coachNotes;
  if (!Array.isArray(notes) || !notes.length) return <DashDrawerEmpty>No notes yet — console notes will sync here.</DashDrawerEmpty>;
  return (
    <div>
      {notes.slice(0, 3).map((n, i) => (
        <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(242,237,228,0.85)" }}>{n.text}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginTop: 3 }}>{dashRelShort(n.on) || ""}</div>
        </div>
      ))}
    </div>
  );
}
function DashSecMilestones({ rec }) {
  const ms = DashSignals.buildMilestones(rec);
  if (!ms.recent.length && !ms.next.length) return <DashDrawerEmpty>Milestones appear as they log and share progress.</DashDrawerEmpty>;
  return (
    <div>
      {ms.recent.map((m, i) => (
        <div key={"r" + i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "5px 0" }}>
          <span style={{ color: DASH_SEV_COLORS.green, fontSize: 12 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.label}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{m.active ? "active" : (dashRelShort(m.hitAt) || "earned")}</span>
        </div>
      ))}
      {ms.next.map((m, i) => (
        <div key={"n" + i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "5px 0" }}>
          <span style={{ color: DASH_ROSTER_INK50, fontSize: 12 }}>○</span>
          <span style={{ fontSize: 12.5, color: "rgba(242,237,228,0.75)" }}>{m.label}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: DASH_ROSTER_INK50 }}>{m.detail}</span>
        </div>
      ))}
    </div>
  );
}
function DashSecNutritionSummary({ rec }) {
  const f = rec.foodLogs;
  const weighIns = Array.isArray(rec.weighIns) ? rec.weighIns.filter((w) => w && w.weight != null) : [];
  const wDelta = weighIns.length >= 2 ? Math.round((weighIns[weighIns.length - 1].weight - weighIns[0].weight) * 10) / 10 : null;
  if (!f && !weighIns.length) return <DashDrawerEmpty>Nothing shared from the nutrition side yet.</DashDrawerEmpty>;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: weighIns.length ? 12 : 0 }}>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "11px 13px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Logging</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, marginTop: 4 }}>{f && f.daysLogged7d != null ? f.daysLogged7d + "/7 days" : "—"}</div>
          <div style={{ fontSize: 10, color: DASH_ROSTER_INK50, marginTop: 2 }}>{f && f.lastLoggedOn ? "last " + (dashRelShort(f.lastLoggedOn) || "").toLowerCase() : "no last-log date shared"}</div>
        </div>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "11px 13px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Compliance · 7d</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, marginTop: 4 }}>{f && f.daysLogged7d != null ? Math.round((Math.min(7, f.daysLogged7d) / 7) * 100) + "%" : "—"}</div>
          <div style={{ fontSize: 10, color: DASH_ROSTER_INK50, marginTop: 2 }}>food logs</div>
        </div>
      </div>
      {weighIns.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <DashDrawerSpark data={weighIns.map((w) => w.weight)} />
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>{weighIns[weighIns.length - 1].weight} <span style={{ fontSize: 11, color: DASH_ROSTER_INK50 }}>{weighIns[weighIns.length - 1].unit || "lb"}</span></div>
            {wDelta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: DASH_ROSTER_INK50, marginTop: 2 }}>{wDelta > 0 ? "+" : ""}{wDelta} since first shared weigh-in</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function DashSecLogs({ rec }) {
  if (Array.isArray(rec.recentLogs) && rec.recentLogs.length) {
    return (
      <div>
        {rec.recentLogs.slice(0, 3).map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50 }}>{dashRelShort(l.on)}</span>
            <span style={{ fontSize: 12.5 }}>{l.kcal != null ? l.kcal.toLocaleString() + " kcal" : "logged"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: DASH_ROSTER_INK50 }}>{l.protein != null ? l.protein + "g P" : ""}</span>
          </div>
        ))}
      </div>
    );
  }
  return rec.recentLogs
    ? <DashDrawerEmpty>No logs in the window — matches the flag above.</DashDrawerEmpty>
    : <DashDrawerEmpty>Per-day log detail isn't shared to the web yet — weekly compliance is in the roster column.</DashDrawerEmpty>;
}
function DashSecMacros({ rec }) {
  const n = rec.nutrition;
  if (!n || (n.avgCalories == null && n.avgProtein == null)) return <DashDrawerEmpty>No intake averages shared yet.</DashDrawerEmpty>;
  const row = (label, avg, target, overBad) => {
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
  return <div>{row("Calories", n.avgCalories, n.targetCalories, true)}{row("Protein", n.avgProtein, n.targetProtein, false)}</div>;
}
function DashSecWeighIns({ rec }) {
  const weighIns = Array.isArray(rec.weighIns) ? rec.weighIns.filter((w) => w && w.weight != null) : [];
  if (!weighIns.length) return <DashDrawerEmpty>No shared weigh-ins yet.</DashDrawerEmpty>;
  const wDelta = weighIns.length >= 2 ? Math.round((weighIns[weighIns.length - 1].weight - weighIns[0].weight) * 10) / 10 : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <DashDrawerSpark data={weighIns.map((w) => w.weight)} />
      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, letterSpacing: "-0.02em" }}>{weighIns[weighIns.length - 1].weight} <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>{weighIns[weighIns.length - 1].unit || "lb"}</span></div>
        {wDelta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50, marginTop: 2 }}>{wDelta > 0 ? "+" : ""}{wDelta} since first shared weigh-in</div>}
      </div>
    </div>
  );
}
function DashSecTrainingContext({ rec }) {
  const adh = rec.trainingAdherence;
  const hist = rec.shapeScoreHistory;
  const wkPts = Array.isArray(hist) && hist.length ? hist[hist.length - 1].points : null;
  const wkDelta = Array.isArray(hist) && hist.length >= 2 ? hist[hist.length - 1].points - hist[hist.length - 2].points : null;
  if (!adh && wkPts == null) return <DashDrawerEmpty>Training data isn't shared to coaches on the web yet.</DashDrawerEmpty>;
  return (
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
  );
}

// Goals (dashGoals.jsx) — pros SET goals from this drawer; loaded lazily so
// pages without the goals module keep rendering the rest of the drawer.
function DashSecGoals({ rec, role }) {
  if (typeof window !== "undefined" && typeof window.DashGoalsSection === "function") {
    return <DashGoalsSection rec={rec} role={role} />;
  }
  return <DashDrawerEmpty>Goal cards live on pages that load dashGoals.jsx.</DashDrawerEmpty>;
}

// Role section sets. The drawer is ONE component; the role decides the lens.
const DASH_DRAWER_VIEWS = {
  trainer: {
    eyebrow: "Client drilldown",
    sections: [
      ["Shape Score · 8 weeks", DashSecScore],
      ["Goals · projections", DashSecGoals],
      ["Session adherence", DashSecAdherence],
      ["Coach notes", DashSecNotes],
      ["Milestones", DashSecMilestones],
      ["From the nutritionist side · read-only", DashSecNutritionSummary],
    ],
  },
  nutritionist: {
    eyebrow: "Quick consult",
    sections: [
      ["Last 3 days · food logs", DashSecLogs],
      ["Goals · projections", DashSecGoals],
      ["Macros vs targets · 7d avg", DashSecMacros],
      ["Weigh-in trend", DashSecWeighIns],
      ["From the trainer side · read-only", DashSecTrainingContext],
    ],
  },
};

function DashClientDrawer({ row, role, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!row) return null;
  const rec = row.client;
  const view = DASH_DRAWER_VIEWS[role] || DASH_DRAWER_VIEWS.trainer;
  const sevColor = row.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[row.severity];
  const programLine = rec.program && rec.program.name
    ? rec.program.name + (rec.program.week ? " · Wk " + rec.program.week + (rec.program.weeks ? "/" + rec.program.weeks : "") : "")
    : rec.goalPhase ? rec.goalPhase + " phase" : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(440px, 92vw)", background: "#14110e", borderLeft: "1px solid rgba(242,237,228,0.12)", boxShadow: "-24px 0 60px rgba(0,0,0,0.5)", overflowY: "auto", padding: "26px 26px 40px", fontFamily: "'Space Grotesk', sans-serif", color: "#f2ede4" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{view.eyebrow}</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, letterSpacing: "-0.02em", marginTop: 5 }}>{rec.profile.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: DASH_ROSTER_INK50, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 22 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: sevColor }} />
          {row.flags.length
            ? row.flags.map((f, i) => <DashPill key={i} c={sevColor}>{f.label}</DashPill>)
            : <DashPill c={sevColor}>{rec.profile.isNew ? "New" : "On track"}</DashPill>}
          {programLine && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{programLine}</span>}
        </div>
        {view.sections.map(([title, Body], i) => (
          <DashDrawerSection key={i} title={title}><Body rec={rec} role={role} /></DashDrawerSection>
        ))}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <button onClick={() => dashMessageClient(rec.profile.name, role, row.flags.length ? dashMessageDraft(row) : null)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#06231f", background: "#2ee0c4", border: 0, borderRadius: 4, padding: "11px 18px", cursor: "pointer" }}>Message</button>
          <a href={dashClientSlugHref(rec.profile.name)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DASH_ROSTER_INK50, textDecoration: "none" }}>Open full profile →</a>
        </div>
      </div>
    </div>
  );
}
// Back-compat alias (step 6 name).
const DashConsultDrawer = DashClientDrawer;

// ── Roster table — triage-ordered rows + role-configured columns ─────────────
function DashRosterTable({ triage, role, filter, query }) {
  const [open, setOpen] = React.useState(null);
  const ink50 = DASH_ROSTER_INK50;

  // Client AGES (never birthdates) — a coach always sees them for their own
  // clients, which is the SERVER's rule (member_dobs_for_viewer answers on the
  // active-subscription link), not this table's. ONE request for the whole
  // table rather than one per row, and it lives HERE rather than in the two
  // role pages above so trainer and nutritionist cannot drift apart.
  //
  // ⚠ KEYED ON THE IDS, NOT THE ARRAY. `triage` is a fresh array identity on
  // every parent render, so depending on it directly would refetch forever.
  // The joined id string changes only when the roster actually changes.
  const idKey = triage.map((r) => r.client.profile.id).filter(Boolean).join(",");
  const [ages, setAges] = React.useState({});
  React.useEffect(() => {
    setAges({});                       // reset FIRST — never show one roster's ages over another
    const ids = idKey ? idKey.split(",") : [];
    if (!ids.length) return undefined;
    let on = true;
    fetch("/api/members/ages", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d && d.ages) setAges(d.ages); })
      .catch(() => {});
    return () => { on = false; };
  }, [idKey]);
  const view = DASH_ROSTER_VIEWS[role] || DASH_ROSTER_VIEWS.nutritionist;

  const matchesFilter = (r) => {
    if (filter === "eyes") return r.severity !== "green";
    if (filter === "new") return !!r.client.profile.isNew;
    if (filter === "ontrack") return r.severity === "green" && !r.client.profile.isNew;
    return true;
  };
  const q = (query || "").trim().toLowerCase();
  const rows = triage.filter(matchesFilter).filter((r) => !q || r.client.profile.name.toLowerCase().includes(q));

  return (
    <div className="dash-roster-scroll">
    <div style={{ minWidth: view.minWidth }}>
      <div style={{ display: "grid", gridTemplateColumns: view.cols, gap: 12, padding: "6px 4px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: ink50, borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <span>CLIENT</span>{view.heads.map((h) => <span key={h}>{h}</span>)}
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
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r); } }}
            role="button"
            tabIndex={0}
            aria-label={"Open " + rec.profile.name + " drilldown"}
            style={{ display: "grid", gridTemplateColumns: view.cols, gap: 12, padding: "14px 4px", alignItems: "center", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.05)", cursor: "pointer" }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <span style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 2, background: sevColor }} />
              <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.profile.name}</span>
              {/* ⚠ typeof, not truthiness — 0 is a real age. Absence renders as
                  nothing, never as a placeholder or "private". */}
              {typeof ages[rec.profile.id] === "number" && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: ink50, flexShrink: 0 }}>{ages[rec.profile.id]}</span>
              )}
              {r.flags.length > 0 && <DashPill c={sevColor}>{r.flags[0].label}</DashPill>}
              {rec.profile.isNew && r.severity === "green" && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}
            </div>
            {view.cells(rec, role).map((cell, j) => <React.Fragment key={j}>{cell}</React.Fragment>)}
          </div>
        );
      })}
      {open && <DashClientDrawer row={open} role={role} onClose={() => setOpen(null)} />}
    </div>
    </div>
  );
}

Object.assign(window, { DashRosterTable, DashClientDrawer, DashConsultDrawer, DASH_ROSTER_VIEWS });
