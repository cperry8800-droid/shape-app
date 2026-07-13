// Goals v2 — ClientGoal.html migrated onto the dashboard kit (dashboard-v2
// spec step). One card per goal: target, current value, sparkline trend, and
// the PROJECTED COMPLETION DATE at the current pace — the projection is the
// core feature ("goal weight by Aug 3"), and a week-over-week slip is the
// signal engine's goal_slip flag (dashSignals.js, pure + tested).
//
// Pros SET goals (the drawer's Goals section → POST /api/clients/[id]/goals →
// client_programs.detail.goals, coach-writable RLS); clients VIEW them here.
// At most DashSignals.MAX_GOALS (3) goals are visible per client.
//
// The page keeps the old ClientGoal wiring it migrated from: the self doc in
// user_goals('client_goals') (+ legacy fallback), the share-with-coaches
// toggle, and the log-weigh-in flow (doc + client_weigh_ins) — all via the
// page's own window.shapeDb session, demo doc when signed out.
//
// Load order: pageShell → trainerDashboard → coachNav/clientNav →
// dashSignals.js → dashToday.jsx (DashPill/DashDemoBand) → this file.
// dashRoster.jsx picks up DashGoalsSection lazily for the drawer.

const DGO_INK50 = "rgba(242,237,228,0.55)";
const DGO_MONO = "'JetBrains Mono', monospace";
const DGO_TEAL = "#2ee0c4";
const DGO_GREEN = "#7bbf5a";
const DGO_AMBER = "#d8a23a";
const DGO_RED = "#e0644b";

function dgoIso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dgoAgo(days) { return dgoIso(new Date(Date.now() - days * 86400000)); }

// Demo doc — the migrated page's example-of-a-live-account (the old page's
// "Lean by August" identity, reshaped to coach-set goals with clean linear
// histories so the projections demo on-pace, climbing, and achieved states).
function dgoDemoSrc() {
  const gh = (pairs) => pairs.map(([d, v]) => ({ on: dgoAgo(d), value: v }));
  return {
    coach: [
      { id: "demo-g1", label: "Lean by August", metric: "weight", unit: "kg", target: 76, start: 81.6, startedOn: dgoAgo(43), setBy: "nutritionist",
        history: gh([[43, 81.6], [36, 81.2], [29, 80.8], [22, 80.4], [15, 80.0], [8, 79.6], [1, 79.2]]) },
      { id: "demo-g2", label: "Back squat 1RM", metric: "strength", unit: "kg", target: 115, start: 90, startedOn: dgoAgo(84), setBy: "trainer",
        history: gh([[43, 102.5], [36, 103.75], [29, 105], [22, 106.25], [15, 107.5], [8, 108.75], [1, 110]]) },
      { id: "demo-g3", label: "5k under 25:00", metric: "endurance", unit: "min", target: 25, start: 28.5, startedOn: dgoAgo(120), setBy: "trainer",
        history: gh([[31, 26.1], [17, 25.5], [3, 24.9]]) },
    ],
    overall: { why: "Lean enough to feel quick on the bike again, strong enough that nothing slips. Wedding's in July — but really it's about staying this person after." },
    weighIns: [], training: [], nutrition: [],
    // The work domain (spec 2026-07-13) — a self-set work target demos beside
    // the coach-set goals, mobile WORK-station parity.
    work: [{ t: "Deep work 10 h/week", cur: 6, tgt: 10, sub: "focused hours · per week", cat: "skills" }],
    share: true,
  };
}

// ── Sparkline with a dashed target line ──────────────────────────────────────
function DgoSpark({ goal, color = DGO_TEAL, w = 120, h = 38 }) {
  const series = (Array.isArray(goal.history) ? goal.history : [])
    .map((p) => ({ t: new Date(String(p.on || p.date || p.d || p.logged_on || "") + "T00:00:00").getTime(), v: Number(p.value != null ? p.value : p.v != null ? p.v : p.weight != null ? p.weight : p.kg) }))
    .filter((p) => isFinite(p.t) && isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (series.length < 2) return null;
  const target = Number(goal.target);
  const vals = series.map((p) => p.v).concat(isFinite(target) ? [target] : []);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const t0 = series[0].t, t1 = series[series.length - 1].t, tSpan = t1 - t0 || 1;
  const x = (t) => ((t - t0) / tSpan) * (w - 6) + 3;
  const y = (v) => h - 4 - ((v - min) / span) * (h - 8);
  const line = series.map((p) => x(p.t) + "," + y(p.v)).join(" ");
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }} aria-hidden="true">
      {isFinite(target) && <line x1="3" x2={w - 3} y1={y(target)} y2={y(target)} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.45" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(series[series.length - 1].t)} cy={y(series[series.length - 1].v)} r="2.5" fill={color} />
    </svg>
  );
}

// State → accent + projection copy. The projection block is the card's hero.
function dgoStateView(p) {
  if (!p) return { c: DGO_INK50, head: "—", sub: "No usable data yet" };
  switch (p.state) {
    case "achieved": return { c: DGO_GREEN, head: "✓ Hit" + (p.achievedOn ? " " + DashSignals.goalDateLabel(p.achievedOn) : ""), sub: "Banked — time for the next one" };
    case "on-pace": return { c: DGO_TEAL, head: p.projectedLabel, sub: p.toGo + (p.unit ? " " + p.unit : "") + " to go · " + p.daysOut + " days at the current pace" };
    case "stalled": return { c: DGO_INK50, head: "No ETA", sub: "The pace has flattened — the next check-ins move this" };
    case "far": return { c: DGO_INK50, head: "1y+ out", sub: "At the current pace — a small weekly change moves this a lot" };
    case "stale": return { c: DGO_AMBER, head: "Pace outdated", sub: "Last entry " + (p.lastOn || "a while back") + " — log to re-project" };
    default: return { c: DGO_INK50, head: "Needs history", sub: "Projects after 2+ entries at least a week apart" };
  }
}

// ── The goal card (shared: client page + the pro drawer) ─────────────────────
function DashGoalCard({ goal, now, editable, onEdit, compact }) {
  const nowD = now || new Date();
  const p = DashSignals.projectGoal(goal, nowD);
  const slip = DashSignals.goalSlipDays(goal, nowD);
  const slipped = slip != null && slip >= DashSignals.THRESHOLDS.GOAL_SLIP_DAYS;
  const view = dgoStateView(p);
  const accent = slipped ? DGO_AMBER : view.c;
  const unit = goal.unit ? " " + goal.unit : "";
  const setBy = goal.setBy === "you" ? "set by you" : "set by your " + (goal.setBy === "nutritionist" ? "nutritionist" : goal.setBy === "trainer" ? "trainer" : "coach");
  const lastValue = p ? p.lastValue : goal.now;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="dash-eyebrow" style={{ color: accent }}>{(goal.metric || "goal")} · {setBy}</span>
        {editable
          ? <button onClick={onEdit} style={{ fontFamily: DGO_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "4px 9px", cursor: "pointer" }}>Edit</button>
          : goal.startedOn && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DGO_INK50 }}>since {DashSignals.goalDateLabel(goal.startedOn)}</span>}
      </div>
      <div style={{ fontFamily: serif, fontSize: compact ? 17 : 21, letterSpacing: "-0.015em", margin: "7px 0 2px" }}>{goal.label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: serif, fontSize: compact ? 22 : 28, letterSpacing: "-0.02em" }}>
          {lastValue != null ? lastValue : "—"}<span style={{ fontSize: 13, color: DGO_INK50 }}>{unit}</span>
          <span style={{ fontSize: 14, color: DGO_INK50 }}> → {goal.target}{unit}</span>
        </div>
        <DgoSpark goal={goal} color={accent === DGO_INK50 ? "rgba(242,237,228,0.45)" : accent} w={compact ? 96 : 130} h={compact ? 30 : 40} />
      </div>
      {p && p.pct != null && (
        <div style={{ margin: "9px 0 0" }}>
          <div style={{ position: "relative", height: 5, background: "rgba(242,237,228,0.08)", borderRadius: 2 }}>
            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.round(p.pct * 100) + "%", background: accent === DGO_INK50 ? "rgba(242,237,228,0.35)" : accent, borderRadius: 2 }} />
          </div>
          <div style={{ fontFamily: DGO_MONO, fontSize: 8.5, letterSpacing: "0.1em", color: DGO_INK50, marginTop: 4, textTransform: "uppercase" }}>{Math.round(p.pct * 100)}% there</div>
        </div>
      )}
      {/* The projection — the hero of the card */}
      <div style={{ marginTop: compact ? 9 : 12, paddingTop: compact ? 9 : 11, borderTop: "1px solid rgba(242,237,228,0.07)" }}>
        <div style={{ fontFamily: DGO_MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: DGO_INK50 }}>
          Projected{p && p.ratePerWeek != null && p.state !== "achieved" ? " · at " + (p.ratePerWeek > 0 ? "+" : "") + p.ratePerWeek + unit + "/wk" : ""}
        </div>
        <div style={{ fontFamily: serif, fontSize: compact ? 19 : 24, letterSpacing: "-0.02em", color: view.c, marginTop: 4 }}>{view.head}</div>
        <div style={{ fontSize: compact ? 11 : 12, color: DGO_INK50, lineHeight: 1.45, marginTop: 3 }}>{view.sub}</div>
        {slipped && p && p.state !== "achieved" && (
          <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(216,162,58,0.07)", border: "1px solid rgba(216,162,58,0.3)", borderLeft: "3px solid " + DGO_AMBER, borderRadius: 4, fontFamily: DGO_MONO, fontSize: 9, letterSpacing: "0.04em", color: DGO_AMBER }}>
            {isFinite(slip) ? "ETA slipped +" + slip + " days this week" : "ETA lost this week — the pace flattened"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pro editor (modal) ───────────────────────────────────────────────────────
const dgoField = { boxSizing: "border-box", padding: "7px 9px", borderRadius: 4, border: "1px solid rgba(242,237,228,0.16)", background: "rgba(242,237,228,0.04)", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, outline: "none", width: "100%" };
const dgoLabel = { fontFamily: DGO_MONO, fontSize: 7.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DGO_INK50, display: "block", margin: "10px 0 3px" };
const DGO_METRICS = ["weight", "strength", "endurance", "habit", "custom"];

function DashGoalEditor({ goal, role, onSave, onRemove, onClose }) {
  const isNew = !goal;
  const g = goal || { label: "", metric: "weight", unit: "lb", target: "", start: "", history: [] };
  const last = (g.history || []).length ? g.history[g.history.length - 1] : null;
  const [form, setForm] = React.useState({
    label: g.label || "", metric: g.metric || "weight", unit: g.unit || "",
    target: g.target != null ? String(g.target) : "",
    start: g.start != null ? String(g.start) : "",
    current: "", // logs a dated history point on save — this is what moves the projection
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    const target = Number(form.target);
    if (!form.label.trim() || !isFinite(target)) return;
    const next = {
      id: g.id || "goal-" + Date.now().toString(36),
      label: form.label.trim(), metric: form.metric, unit: form.unit.trim(),
      target,
      start: form.start !== "" && isFinite(Number(form.start)) ? Number(form.start) : (g.start != null ? g.start : (form.current !== "" ? Number(form.current) : null)),
      startedOn: g.startedOn || dgoIso(new Date()),
      setBy: g.setBy || role || "coach",
      history: Array.isArray(g.history) ? g.history.slice() : [],
    };
    if (form.current !== "" && isFinite(Number(form.current))) {
      const today = dgoIso(new Date());
      const cur = Number(form.current);
      const lastPt = next.history.length ? next.history[next.history.length - 1] : null;
      if (lastPt && (lastPt.on || lastPt.d) === today) next.history[next.history.length - 1] = { on: today, value: cur };
      else next.history.push({ on: today, value: cur });
    }
    onSave(next);
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 260 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 94vw)", maxHeight: "86vh", overflowY: "auto", background: "#14110e", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10, padding: 22, color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontFamily: DGO_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DGO_TEAL }}>{isNew ? "New goal" : "Edit goal"}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: "6px 0 2px" }}>{isNew ? "Point them somewhere." : form.label || "Goal"}</div>
        <span style={dgoLabel}>Goal</span>
        <input value={form.label} onChange={set("label")} placeholder='e.g. "Goal weight" or "Back squat 1RM"' style={dgoField} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
          <div>
            <span style={dgoLabel}>Metric</span>
            <select value={form.metric} onChange={set("metric")} style={dgoField}>
              {DGO_METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><span style={dgoLabel}>Unit</span><input value={form.unit} onChange={set("unit")} placeholder="lb" style={dgoField} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><span style={dgoLabel}>Target</span><input type="number" value={form.target} onChange={set("target")} style={dgoField} /></div>
          <div><span style={dgoLabel}>Start value</span><input type="number" value={form.start} onChange={set("start")} placeholder={last ? String(last.value) : "—"} style={dgoField} /></div>
          <div><span style={dgoLabel}>Current · logs today</span><input type="number" value={form.current} onChange={set("current")} placeholder={last ? String(last.value) : "—"} style={dgoField} /></div>
        </div>
        <div style={{ fontSize: 11, color: DGO_INK50, lineHeight: 1.5, marginTop: 10 }}>
          The projection fits the last 8 weeks of logged values — update "current" at each check-in and the ETA stays honest. A weight goal also reads their live weigh-ins automatically.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button onClick={save} disabled={!form.label.trim() || form.target === ""} style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: DGO_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer", opacity: !form.label.trim() || form.target === "" ? 0.6 : 1 }}>{isNew ? "Set goal" : "Save"}</button>
          <button onClick={onClose} style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "10px 14px", cursor: "pointer" }}>Cancel</button>
          {!isNew && <button onClick={onRemove} style={{ fontFamily: DGO_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DGO_RED, background: "transparent", border: 0, cursor: "pointer", marginLeft: "auto" }}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

// ── Drawer section — pros set goals here (roster + pulse drilldown) ─────────
function DashGoalsSection({ rec, role }) {
  const isDemo = String(rec.profile.id || "").indexOf("demo-") === 0;
  const draftKey = "shape.dashGoals." + rec.profile.id;
  const [goals, setGoals] = React.useState(() => {
    if (isDemo && typeof localStorage !== "undefined") {
      try { const d = JSON.parse(localStorage.getItem(draftKey) || "null"); if (Array.isArray(d)) return d; } catch (e) {}
    }
    return Array.isArray(rec.goals) ? rec.goals : [];
  });
  const [editing, setEditing] = React.useState(null); // null | "new" | index
  const [saveState, setSaveState] = React.useState("");
  const visible = DashSignals.visibleGoals(goals);
  const atCap = visible.length >= DashSignals.MAX_GOALS;

  const persist = async (next) => {
    setGoals(next);
    setEditing(null);
    if (isDemo) {
      try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch (e) {}
      setSaveState("demo");
      return;
    }
    setSaveState("saving");
    try {
      const res = await fetch("/api/clients/" + encodeURIComponent(rec.profile.id) + "/goals", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: next }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      setSaveState("saved");
    } catch (e) { setSaveState("error"); }
  };
  const onSave = (g) => {
    if (editing === "new") { persist(goals.concat([g]).slice(0, DashSignals.MAX_GOALS)); return; }
    // `editing` indexes the VISIBLE list (same as the editor + onRemove); map the
    // edit onto the matching goal in the full array by identity so a filtered view
    // can't save over a different goal.
    const target = visible[editing];
    const next = target ? goals.map((x) => ((target.id ? x.id === target.id : x === target) ? g : x)) : goals;
    persist(next.slice(0, DashSignals.MAX_GOALS));
  };
  const onRemove = async () => {
    if (editing === "new" || editing == null) { setEditing(null); return; }
    // `editing` indexes the VISIBLE list; resolve the actual goal and remove it
    // by identity so a hidden/filtered entry can't make us delete the wrong one.
    const g = visible[editing];
    if (!g) { setEditing(null); return; }
    if (!(await window.ShapeConfirm.open({ title: "Delete this goal?", name: g.t || g.title, message: "This removes the goal you set for this client.", confirmLabel: "Delete goal" }))) return;
    persist(goals.filter((x) => (g.id ? x.id !== g.id : x !== g)));
  };

  return (
    <div>
      {visible.map((g, i) => (
        <div key={g.id || i} style={{ border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 10, background: "rgba(242,237,228,0.02)" }}>
          <DashGoalCard goal={g} compact editable onEdit={() => setEditing(i)} />
        </div>
      ))}
      {!visible.length && (
        <div style={{ fontSize: 12.5, color: DGO_INK50, lineHeight: 1.5, marginBottom: 10 }}>
          {rec.goals == null && !isDemo
            ? "Goals aren't shared to the dashboard for this client yet."
            : "No goals set — point " + (rec.profile.name || "them").split(" ")[0] + " at something measurable."}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={() => !atCap && setEditing("new")} disabled={atCap}
          style={{ fontFamily: DGO_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: atCap ? DGO_INK50 : "#06231f", background: atCap ? "transparent" : DGO_TEAL, border: atCap ? "1px solid rgba(242,237,228,0.18)" : 0, borderRadius: 4, padding: "8px 13px", cursor: atCap ? "default" : "pointer" }}>
          + Add goal
        </button>
        {atCap && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, color: DGO_INK50 }}>3 max — one focus per front</span>}
        {saveState === "saving" && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, color: DGO_INK50 }}>Saving…</span>}
        {saveState === "saved" && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, color: DGO_GREEN }}>Saved — on their Goals page now</span>}
        {saveState === "demo" && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, color: DGO_INK50 }}>DEMO · saves locally</span>}
        {saveState === "error" && <span style={{ fontFamily: DGO_MONO, fontSize: 8.5, color: DGO_RED }}>Couldn't save — try again</span>}
      </div>
      {editing != null && (
        <DashGoalEditor
          goal={editing === "new" ? null : visible[editing]}
          role={role}
          onSave={onSave} onRemove={onRemove} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ── The migrated client page (ClientGoal.html) — view-only goals ────────────
function ClientGoalsPage() {
  const [src, setSrc] = React.useState(() => dgoDemoSrc());
  const [rawDoc, setRawDoc] = React.useState(null); // the live user_goals doc, persisted whole
  const [source, setSource] = React.useState(null); // null=loading · 'live' · 'demo'
  const [signedIn, setSignedIn] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    let on = true;
    (async () => {
      const demo = () => { if (on) setSource("demo"); };
      if (!window.shapeDb) return demo();
      const user = await window.shapeDb.getUser().catch(() => null);
      if (!user) return demo();
      if (!on) return;
      setSignedIn(true);
      // The doc the old page read/wrote (canonical key + legacy fallback).
      let remote = null;
      try { remote = await window.shapeDb.getUserGoals("client_goals"); } catch (e) {}
      if (!remote || Object.keys(remote).length === 0) {
        try { remote = await window.shapeDb.getUserGoals("client"); } catch (e) {}
      }
      // Coach-set goals (own client_programs row) + live weigh-in series.
      let coach = null, weighIns = [];
      try {
        const { data } = await window.shapeDb.client.from("client_programs").select("detail").eq("user_id", user.id).maybeSingle();
        if (data && data.detail && Array.isArray(data.detail.goals)) coach = data.detail.goals;
      } catch (e) {}
      try {
        const { data } = await window.shapeDb.client.from("client_weigh_ins").select("logged_on, weight, unit").eq("user_id", user.id).order("logged_on", { ascending: true }).limit(104);
        if (Array.isArray(data)) weighIns = data.map((w) => ({ on: w.logged_on, weight: w.weight, unit: w.unit }));
      } catch (e) {}
      if (!on) return;
      const doc = remote && Object.keys(remote).length ? remote : {};
      setRawDoc(doc);
      setSrc({
        coach,
        overall: doc.overall || null,
        training: Array.isArray(doc.training) ? doc.training : null,
        nutrition: Array.isArray(doc.nutrition) ? doc.nutrition : null,
        work: Array.isArray(doc.work) ? doc.work : null,
        weighIns,
        share: doc.share !== false,
      });
      setSource("live");
    })();
    return () => { on = false; };
  }, []);

  const goals = DashSignals.goalsFromDoc(src);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const persistDoc = async (nextDoc) => {
    setRawDoc(nextDoc);
    if (signedIn && window.shapeDb && window.shapeDb.saveUserGoals) {
      const res = await window.shapeDb.saveUserGoals("client_goals", nextDoc);
      showToast(res && res.error ? (res.error.message || "Save failed") : "Saved.");
    } else {
      showToast("Sample view — sign in to save.");
    }
  };
  const toggleShare = () => {
    const nextShare = !(src.share !== false);
    setSrc({ ...src, share: nextShare });
    persistDoc({ ...(rawDoc || {}), share: nextShare });
  };
  const logWeighIn = async (value, unit) => {
    setLogOpen(false);
    const today = dgoIso(new Date());
    const doc = rawDoc || {};
    const prev = (doc.overall && Array.isArray(doc.overall.weighIns)) ? doc.overall.weighIns.filter((x) => x) : [];
    const wi = prev.length && prev[prev.length - 1].d === today
      ? prev.slice(0, -1).concat([{ d: today, kg: value }])
      : prev.concat([{ d: today, kg: value }]);
    const nextDoc = { ...doc, overall: { ...(doc.overall || {}), weighIns: wi, now: value } };
    const nextSeries = (src.weighIns || []).filter((w) => w.on !== today).concat([{ on: today, weight: value, unit }]);
    setSrc({ ...src, overall: nextDoc.overall, weighIns: nextSeries });
    persistDoc(nextDoc);
    if (signedIn && window.shapeDb) {
      try {
        await window.shapeDb.client.from("client_weigh_ins").upsert(
          { user_id: (await window.shapeDb.getUser()).id, logged_on: today, weight: value, unit },
          { onConflict: "user_id,logged_on" }
        );
      } catch (e) {}
    }
  };

  const unit = (goals[0] && goals[0].metric === "weight" && goals[0].unit) || (src.overall && src.overall.unit) || "lb";
  const share = src.share !== false;
  const why = src.overall && src.overall.why;
  const accentFor = (g) => {
    const p = DashSignals.projectGoal(g, new Date());
    const slip = DashSignals.goalSlipDays(g, new Date());
    if (slip != null && slip >= DashSignals.THRESHOLDS.GOAL_SLIP_DAYS && p && p.state !== "achieved") return DGO_AMBER;
    return dgoStateView(p).c === DGO_INK50 ? "rgba(242,237,228,0.35)" : dgoStateView(p).c;
  };

  // Each card below becomes a draggable/resizable DashGrid widget (role=client, tab=goal),
  // mirroring the client Score rollout. The DashPage hero stays as the page header; only
  // the card stack is gridded. Each goal is its own half-width widget; the empty state is a
  // single full-width widget when there are no goals.
  const goalWidgets = goals.length
    ? goals.map((g) => ({ key: "goal-" + g.id, title: g.label || "Goal", size: "half", render: () => (
        <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": accentFor(g), paddingLeft: 24 }}>
          <DashGoalCard goal={g} />
        </div>
      ) }))
    : [{ key: "goal-empty", title: "Goals", size: "full", render: () => (
        <div className="dash-plate dash-plate--tick" style={{ "--dac": DGO_TEAL, paddingLeft: 24 }}>
          <div className="dash-eyebrow">Goals</div>
          <div style={{ fontFamily: serif, fontSize: 22, margin: "8px 0 6px" }}>Nothing on the board yet.</div>
          <div style={{ fontSize: 13, color: DGO_INK50, lineHeight: 1.55, maxWidth: 520 }}>
            Goals are set with your coach so the target, the pace, and the plan all agree. Ask in your next session — or message them now.
          </div>
          <button onClick={() => dashMessageClient("", "client", "Could we set up my goals? I want a target with a date on it.")} style={{ marginTop: 12, fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#06231f", background: DGO_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer" }}>Message your coach</button>
        </div>
      ) }];

  const widgets = goalWidgets.concat([
    { key: "projection", title: "How the projection works", size: "half", render: () => (
      <div className="dash-plate" style={{ "--dac": "rgba(242,237,228,0.35)", padding: "18px 20px" }}>
        <div className="dash-eyebrow">How the projection works</div>
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.78)", lineHeight: 1.6, marginTop: 9 }}>
          Each date is your pace over the last 8 weeks of entries, run forward from your latest one — not a promise, a trajectory.
          It firms up with every weigh-in and check-in, and your coaches see the same number. If a projection slips week-over-week, they get nudged before it becomes a month.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 13, flexWrap: "wrap" }}>
          <button onClick={() => setLogOpen(true)} style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#06231f", background: DGO_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>Log weigh-in</button>
          <a href="ClientProgress.html" style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "10px 16px", textDecoration: "none" }}>Weekly check-in →</a>
        </div>
      </div>
    ) },
    { key: "share", title: "Share with your coaches", size: "half", render: () => (
      <div className="dash-plate" style={{ "--dac": share ? DGO_TEAL : "rgba(242,237,228,0.35)", padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Share with your coaches</div>
            <div style={{ fontSize: 11.5, color: DGO_INK50, lineHeight: 1.45, marginTop: 3 }}>
              {share ? "Your coaches see your self-set goals and weigh-in trend." : "Private — coaches only see the goals they set themselves."}
            </div>
          </div>
          <button onClick={toggleShare} role="switch" aria-checked={share} aria-label="Share goals with coaches"
            style={{ flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: 0, cursor: "pointer", padding: 3, background: share ? DGO_TEAL : "rgba(242,237,228,0.18)", display: "flex", justifyContent: share ? "flex-end" : "flex-start", alignItems: "center" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#14110e", display: "block" }} />
          </button>
        </div>
      </div>
    ) },
    why ? { key: "why", title: "Your why", size: "half", render: () => (
      <div className="dash-plate" style={{ "--dac": "rgba(242,237,228,0.35)", padding: "16px 18px" }}>
        <div className="dash-eyebrow">Your why</div>
        <div style={{ fontSize: 12.5, fontStyle: "italic", color: "rgba(242,237,228,0.75)", lineHeight: 1.6, marginTop: 8 }}>“{why}”</div>
      </div>
    ) } : null,
  ]).filter(Boolean);

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        navItems={clientNavItems("goal")}
        payoutCard={clientPayoutCard}
        eyebrow={goals.length + " OF " + DashSignals.MAX_GOALS + " · SET WITH YOUR COACHES"}
        title="Goals"
        subtitle="Where you're headed and what the current pace says. Your coaches set these — every check-in and weigh-in sharpens the projection."
      >
        <DashGrid role="client" tab="goal" widgets={widgets} />
      </DashPage>

      {logOpen && <DgoWeighInModal unit={unit} onLog={logWeighIn} onClose={() => setLogOpen(false)} />}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300, background: "#14110e", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 8, padding: "10px 18px", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13 }}>{toast}</div>
      )}
    </React.Fragment>
  );
}

function DgoWeighInModal({ unit, onLog, onClose }) {
  const [val, setVal] = React.useState("");
  const ok = val !== "" && isFinite(Number(val)) && Number(val) > 0;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 260 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.65)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(340px, 92vw)", background: "#14110e", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10, padding: 22, color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontFamily: DGO_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DGO_TEAL }}>Log weigh-in</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: "6px 0 12px" }}>This morning's number.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input autoFocus type="number" step="0.1" value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && ok) onLog(Number(val), unit); }}
            style={{ ...dgoField, fontSize: 17, width: 130 }} />
          <span style={{ fontFamily: DGO_MONO, fontSize: 11, color: DGO_INK50 }}>{unit}</span>
        </div>
        <div style={{ fontSize: 11, color: DGO_INK50, marginTop: 9 }}>One a day — today's replaces today's. Each one sharpens the projection.</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => ok && onLog(Number(val), unit)} disabled={!ok} style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: DGO_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer", opacity: ok ? 1 : 0.6 }}>Log it</button>
          <button onClick={onClose} style={{ fontFamily: DGO_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "10px 14px", cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ClientGoalsPage, DashGoalCard, DashGoalsSection, DashGoalEditor });
