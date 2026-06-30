// ClientDashboardPage — the rebuilt client Today (dashboard-v2 step 7).
// Prototype client-view language: instrument plates (dash.css .dash-plate),
// teal accents, mono eyebrows. Data via useDashboard('client'): the assigned
// plan drives the today rail, meal logging is REAL (/api/nutrition/meal-log,
// the same accumulating endpoint the app uses) and the macro ledger ticks
// live as meals are logged. Demo dataset is the centralized fallback —
// nothing business-flavored on this page (no MRR, no consult counts).
//
// Load order: pageShell → trainerDashboard.jsx → clientNav → dashSignals.js →
// dashData.jsx → this file.

const DCL_INK50 = "rgba(242,237,228,0.55)";
const DCL_TEAL = "#2ee0c4";
const DCL_GREEN = "#7bbf5a";
const DCL_RED = "#e0644b";
const DCL_MONO = "'JetBrains Mono', monospace";

// ── Demo dataset (signed-out / API unavailable) ─────────────────────────────
const DCL_DEMO = {
  firstName: "Priya",
  streak: 14,
  score: { total: 1284, tier: "Tempo", next: "Form", toNext: 716, pct: 0.43, weekGain: 41, spark: [22, 35, 28, 44, 38, 52, 47, 41], why: "Up 41 pts this week — your 14-day streak and 6/7 food logs did the lifting." },
  targets: { kcal: 2200, p: 175, c: 240, f: 70 },
  consumed: { kcal: 1340, p: 96, c: 142, f: 48 },
  workout: {
    title: "Lower Push — Peak", time: "5:45 PM", coach: "Maya",
    meta: "54 min · RPE 8",
    exercises: [
      { name: "Back squat", scheme: "4 × 5 · 31X1 tempo · 150s", load: "110 kg", cue: "Brace before the walkout" },
      { name: "Romanian deadlift", scheme: "3 × 8 · 3010 tempo · 120s", load: "90 kg", cue: "Push the hips back, bar on the thighs" },
      { prefix: "A1", name: "Split squat", scheme: "3 × 8 ea · 90s", load: "18 kg", cue: "Slow eccentric, drive through the heel" },
      { prefix: "A2", name: "Leg curl", scheme: "3 × 10 · 90s", load: "RPE 8" },
    ],
    playlist: { name: "Lower Push — Peak", meta: "95–138 BPM · 14 tracks", by: "Maya" },
  },
  meals: [
    { id: "demo-m1", slot: "Lunch", time: "12:30 PM", title: "Grilled chicken bowl", kcal: 620, p: 52, c: 68, f: 18, alts: [{ name: "Turkey & rice bowl", kcal: 610, p: 48, c: 66, f: 14 }, { name: "Tofu stir-fry + rice", kcal: 580, p: 34, c: 72, f: 16 }] },
    { id: "demo-m2", slot: "Snack", time: "4:00 PM", title: "Greek yogurt + berries", kcal: 240, p: 22, c: 28, f: 5 },
    { id: "demo-m3", slot: "Dinner", time: "7:00 PM", title: "Salmon, rice & greens", kcal: 680, p: 46, c: 64, f: 24, alts: [{ name: "Chicken thighs, rice & greens", kcal: 690, p: 45, c: 64, f: 26 }] },
  ],
  compliance: { workoutsDone: 4, workoutsPlanned: 6, mealsLogged: 6, mealDays: 7 },
  team: [
    { name: "Maya Okafor", role: "Trainer", color: "#c0533b" },
    { name: "Rae Lindqvist", role: "Nutritionist", color: "#d8a23a" },
  ],
  nextSession: { when: "Thu · 6:30 PM", what: "Weekly with Maya · 20 min video" },
  milestonesFeed: {
    recent: [
      { kind: "streak", label: "14-day streak", active: true },
      { kind: "pr", label: "Squat 245 lb PR", hitAt: null, when: "5d ago" },
      { kind: "goal", label: "50% to goal", hitAt: null, when: "2w ago" },
    ],
    next: [
      { kind: "goal", label: "Goal weight", detail: "2.8 lb away · pace Aug 3", progress: 0.8 },
      { kind: "streak", label: "30-day streak", detail: "16 days to go", progress: 14 / 30 },
      { kind: "workout_count", label: "Workout #100", detail: "14 away", progress: 86 / 100 },
    ],
  },
  checkinDue: true,
  membership: "demo",
};

// ── Small helpers ───────────────────────────────────────────────────────────
function dclTodayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dclRealDate() {
  return new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
}
function dclFmt12(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (isNaN(h)) return null;
  const ap = h >= 12 ? "PM" : "AM";
  return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m || 0).padStart(2, "0") + " " + ap;
}
function dclUnreadFor(name) {
  try {
    const tabs = window.clientChatTabs || [];
    for (const tab of tabs) for (const th of (tab.threads || [])) {
      if (th.who && name && th.who.split(" ")[0] === name.split(" ")[0]) return th.unread || 0;
    }
  } catch (e) {}
  return 0;
}

// "Why it moved" — plain language from the real score ledger when present.
function dclWhyItMoved(score) {
  if (!score) return null;
  const gain = score.week_gain || 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const byCat = {};
  for (const r of (score.recent || [])) {
    if (new Date(r.earned_at).getTime() >= weekAgo) byCat[r.category] = (byCat[r.category] || 0) + r.delta;
  }
  const LABELS = { workout: "workouts", nutrition: "meal logging", habit: "habits", checkin: "check-ins", other: "activity" };
  const top = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  if (gain > 0 && top) return "Up " + gain + " pts this week — mostly " + (LABELS[top[0]] || top[0]) + " (+" + top[1] + ").";
  if (gain > 0) return "Up " + gain + " pts this week.";
  if (gain < 0) return "Down " + Math.abs(gain) + " pts this week — likely a reward redemption.";
  return "Quiet week so far — log a workout or a meal to move it.";
}

// Weekly sparkline buckets from the score ledger (whatever history it carries).
function dclScoreSpark(score) {
  if (!score || !Array.isArray(score.recent) || !score.recent.length) return null;
  const buckets = new Map();
  for (const r of score.recent) {
    const d = new Date(r.earned_at);
    const monday = new Date(d); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const k = monday.toISOString().slice(0, 10);
    buckets.set(k, (buckets.get(k) || 0) + r.delta);
  }
  const weeks = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
  return weeks.length >= 2 ? weeks.slice(-8) : null;
}

function DclSpark({ data, color = DCL_TEAL, w = 84, h = 26 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data, 0), max = Math.max(...data, 1), span = max - min || 1;
  const pts = data.map((v, i) => ((i / (data.length - 1)) * (w - 4) + 2) + "," + (h - 3 - ((v - min) / span) * (h - 6)));
  return <svg width={w} height={h}><polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DclRing({ pct, size = 92, stroke = 7, color = DCL_TEAL, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(242,237,228,0.09)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} transform={"rotate(-90 " + size / 2 + " " + size / 2 + ")"} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}


// The client workout card — SHARED: the client dashboard renders it live, and
// the trainer's builder preview renders this exact component, so "client
// preview" is literally the client's card. Exercises: { prefix?, name,
// scheme, load, cue? } — cues render verbatim, grouped rows show A1/A2.
function DashWorkoutCard({ workout, accent = "#c0533b", startHref = "ClientTrain.html", maxRows = 4, interactive = true }) {
  const ink50 = "rgba(242,237,228,0.55)";
  const mono = "'JetBrains Mono', monospace";
  if (!workout) return <div style={{ fontSize: 13, color: ink50, marginTop: 8 }}>Rest day — recovery counts. An easy walk keeps the streak alive.</div>;
  const rows = workout.exercises || [];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="dash-eyebrow" style={{ color: accent }}>Tonight's workout{workout.time ? " · " + workout.time : ""}</span>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.1em", color: ink50, textTransform: "uppercase" }}>{workout.meta || ""}</span>
      </div>
      <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.02em", margin: "8px 0 2px" }}>{workout.title}</div>
      <div style={{ fontSize: 11.5, color: ink50, marginBottom: 6 }}>with {workout.coach}</div>
      <div className="dash-ledger" style={{ "--dac": accent }} />
      {rows.slice(0, maxRows).map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10, alignItems: "start", padding: "7px 0", borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, color: e.prefix ? accent : ink50, fontWeight: e.prefix ? 700 : 400, marginTop: 2 }}>{e.prefix || String(i + 1).padStart(2, "0")}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.name}</div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.05em", color: ink50, marginTop: 2 }}>{e.scheme}</div>
            {e.cue && <div style={{ fontSize: 11.5, fontStyle: "italic", color: "rgba(242,237,228,0.7)", marginTop: 3 }}>“{e.cue}”</div>}
          </div>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(242,237,228,0.8)", marginTop: 2, whiteSpace: "nowrap" }}>{e.load}</span>
        </div>
      ))}
      {rows.length > maxRows && <div style={{ fontFamily: mono, fontSize: 9, color: ink50, padding: "6px 0 0 36px" }}>+ {rows.length - maxRows} more</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        {workout.playlist && workout.playlist.name ? (
          <a href={interactive ? "ClientPlaylists.html" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1DB954", background: "rgba(29,185,84,0.08)", border: "1px solid rgba(29,185,84,0.35)", borderLeft: "3px solid #1DB954", borderRadius: 4, padding: "6px 10px" }}>
            ♪ {workout.playlist.name}{workout.playlist.meta ? " · " + workout.playlist.meta : ""}
          </a>
        ) : (
          <a href={interactive ? "ClientPlaylists.html" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ink50, border: "1px solid rgba(242,237,228,0.16)", borderRadius: 4, padding: "6px 10px" }}>♪ Shape Radio</a>
        )}
        {interactive && <a href={startHref} style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fff", background: accent, borderRadius: 4, padding: "9px 14px", textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>Start →</a>}
      </div>
    </div>
  );
}

// The client meals + macro ledger card — SHARED: the client dashboard renders
// it live, and the nutritionist's meal-builder preview renders this exact
// component. Meals: { id, slot, time?, title, kcal, p, c, f, alts?: [≤3
// approved alternates {name,kcal,p,c,f}] }. A meal with alternates carries a
// ⇄ Swap chip that cycles base → alt1 → … → base; the displayed macros AND
// what gets logged follow the chosen alternate, so swapping never breaks the
// ledger math. Bars go red when a macro runs over target (the builder's
// running total mirrors this exact treatment).
function DashMealLedgerCard({ meals = [], targets, ledger, logged = {}, onLog, headerNote, swapStorageKey, interactive = true }) {
  const ink50 = "rgba(242,237,228,0.55)";
  const mono = "'JetBrains Mono', monospace";
  const teal = "#2ee0c4", green = "#7bbf5a", red = "#e0644b";
  const [swapSel, setSwapSel] = React.useState(() => {
    if (!swapStorageKey) return {};
    try { return JSON.parse(localStorage.getItem(swapStorageKey) || "{}"); } catch (e) { return {}; }
  });
  const cycleSwap = (m) => {
    const n = (m.alts || []).length;
    const cur = swapSel[m.id] == null ? -1 : swapSel[m.id];
    const nxt = cur + 1 >= n ? -1 : cur + 1; // -1 = the base meal
    const next = { ...swapSel, [m.id]: nxt };
    setSwapSel(next);
    if (swapStorageKey) { try { localStorage.setItem(swapStorageKey, JSON.stringify(next)); } catch (e) {} }
  };
  // The effective meal — base, or the chosen approved alternate.
  const effective = (m) => {
    const i = swapSel[m.id];
    const alt = i != null && i >= 0 && m.alts && m.alts[i];
    return alt ? { ...m, title: alt.name, kcal: alt.kcal, p: alt.p, c: alt.c, f: alt.f, _swapped: true } : m;
  };
  const remaining = targets.kcal - ledger.kcal;
  const ghost = { fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span className="dash-eyebrow">Today's meals{headerNote ? " · " + headerNote : ""}</span>
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.08em", color: remaining > 0 ? ink50 : remaining < 0 ? red : green, textTransform: "uppercase" }}>
          {remaining > 0 ? remaining.toLocaleString() + " kcal left" : remaining < 0 ? "Over by " + Math.abs(remaining).toLocaleString() + " kcal" : "Target hit"}
        </span>
      </div>
      <div className="dash-ledger" style={{ marginTop: 9 }} />
      {/* The ledger — ticks live as meals are logged; red when a macro runs over */}
      {[["Calories", ledger.kcal, targets.kcal, teal], ["Protein", ledger.p, targets.p, "#7ed4ff"], ["Carbs", ledger.c, targets.c, "#f6c177"], ["Fat", ledger.f, targets.f, "#ff8a6d"]].map(([l, v, t, c2]) => {
        const over = v > t;
        return (
          <div key={l} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 10, alignItems: "center", padding: "4px 0" }}>
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: ink50 }}>{l}</span>
            <div style={{ position: "relative", height: 5, background: "rgba(242,237,228,0.08)", borderRadius: 2 }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, Math.round((v / Math.max(1, t)) * 100)) + "%", background: over ? red : c2, borderRadius: 2, transition: "width .35s ease, background .35s ease" }} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 10, whiteSpace: "nowrap", color: over ? red : undefined }}>{Math.round(v)}<span style={{ color: ink50 }}>/{t}{l === "Calories" ? "" : "g"}</span></span>
          </div>
        );
      })}
      <div style={{ marginTop: 10 }}>
        {meals.length ? meals.map((base) => {
          const m = effective(base);
          const isLogged = !!logged[m.id];
          const canSwap = interactive && !isLogged && (base.alts || []).length > 0;
          return (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: teal }}>{m.slot}{m.time ? " · " + m.time : ""}{m._swapped ? " · swapped" : ""}</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 3, opacity: isLogged ? 0.55 : 1 }}>{m.title}</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: ink50, marginTop: 2 }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {canSwap && (
                  <button onClick={() => cycleSwap(base)} title={"Approved alternates: " + base.alts.map((a) => a.name).join(", ")} style={{ ...ghost, padding: "8px 10px", borderColor: m._swapped ? "rgba(46,224,196,0.45)" : "rgba(242,237,228,0.18)", color: m._swapped ? teal : "rgba(242,237,228,0.7)" }}>⇄ Swap</button>
                )}
                {isLogged
                  ? <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: green, textTransform: "uppercase" }}>✓ Logged</span>
                  : interactive && <button onClick={() => onLog && onLog(m)} style={ghost}>Log meal</button>}
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 12.5, color: ink50, padding: "10px 0" }}>No meals assigned today — your nutritionist's next push lands here.</div>
        )}
      </div>
    </div>
  );
}

// Today — the home daily check-in (energy/hunger/sleep/rested) + hydration on ONE
// instrument plate; web parity with the mobile BSTodayCard. Energy/Hunger/Rested are
// tap-to-set 1-10 gauges; Sleep is device-first (read-only snapshot when a wearable
// synced last night, else manual hour chips). Hydration folds in as a dot-progress +
// quick-add row that STAYS LIVE after the check-in collapses to its one-line summary.
// Reads today's values from /api/client/progress + /api/client/hydration; writes via
// /api/client/checkin + /api/client/hydration (cookie session). Demo = signed-out
// preview (band on top) — taps work locally and nothing persists.
function DashTodayCard({ live }) {
  const teal = DCL_TEAL, amber = "#d8a23a", blue = "#7ed4ff";
  const ink50 = DCL_INK50, mono = DCL_MONO;
  const sleepHM = (h) => { const m = Math.round(Number(h) * 60); return Math.floor(m / 60) + "h " + (m % 60) + "m"; };
  const todayISO = dclTodayISO();
  const localDay = () => new Date().toLocaleDateString("en-CA"); // user's calendar day, matches meal-log

  // ── check-in state (demo seeds a logged example so the preview reads alive) ──
  const [energy, setEnergy] = React.useState(live ? null : 7);
  const [hunger, setHunger] = React.useState(live ? null : 4);
  const [sleepHours, setSleepHours] = React.useState(live ? null : 7.5);
  const [rested, setRested] = React.useState(live ? null : 8);
  const [sleepMeta, setSleepMeta] = React.useState(null);
  const [sleepSynced, setSleepSynced] = React.useState(false);
  const [logged, setLogged] = React.useState(!live);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [readiness, setReadiness] = React.useState(null);
  const [readinessLabel, setReadinessLabel] = React.useState(null);

  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    fetch("/api/client/progress", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!on || !p || !p.series) return;
        if (p.kpis) { if (p.kpis.readiness != null) setReadiness(Number(p.kpis.readiness)); if (p.kpis.readinessLabel) setReadinessLabel(p.kpis.readinessLabel); }
        const find = (k) => (p.series[k] || []).find((s) => s.date === todayISO);
        const e = find("energy"), h = find("hunger");
        if (e) setEnergy(Math.round(Number(e.value)));
        if (h) setHunger(Math.round(Number(h.value)));
        const s = find("sleep"), q = find("sleepQuality");
        const eff = find("sleepEfficiency"), rhr = find("restingHr"), hrv = find("hrv");
        const meta = { efficiency: eff ? Math.round(Number(eff.value)) : null, rhr: rhr ? Math.round(Number(rhr.value)) : null, hrv: hrv ? Math.round(Number(hrv.value)) : null };
        const hasDeviceMeta = meta.efficiency != null || meta.rhr != null || meta.hrv != null;
        // Logged from a MANUAL signal only — energy/hunger, the rested rating, or
        // manually-entered sleep hours — never a passive device sync alone.
        if (e || h || q || (s && !hasDeviceMeta)) setLogged(true);
        if (s) { setSleepHours(Number(s.value)); setSleepSynced(hasDeviceMeta); if (hasDeviceMeta) setSleepMeta(meta); }
        if (q) setRested(Math.round(Number(q.value)));
      })
      .catch(() => {});
    return () => { on = false; };
  }, [live]);

  // ── hydration state (always live) ──
  const [hyd, setHyd] = React.useState(live ? null : 1.5);
  const [hydTarget, setHydTarget] = React.useState(3.0);
  const [lastDelta, setLastDelta] = React.useState(0);
  const [hydBusy, setHydBusy] = React.useState(false);
  const hydSeq = React.useRef(0);
  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    fetch("/api/client/hydration?date=" + localDay(), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d && d.ok) { setHyd(Number(d.hydrationL) || 0); setHydTarget(Number(d.targetL) || 3.0); } })
      .catch(() => {});
    return () => { on = false; };
  }, [live]);

  // When the dashboard resolves to a LIVE account (today: null → dash), drop the
  // demo seeds so a signed-in member with nothing logged today never sees a
  // fabricated "logged ✓" — the fetch effects above repopulate from real data (or
  // leave it honestly empty). Runs once on the false→true transition.
  React.useEffect(() => {
    if (!live) return;
    setEnergy(null); setHunger(null); setSleepHours(null); setRested(null);
    setSleepMeta(null); setSleepSynced(false); setLogged(false); setEditing(false);
    setHyd(null); setLastDelta(0);
  }, [live]);

  // Optimistic + rollback + stale-response guard (hydSeq) + in-flight lock (hydBusy).
  const addWater = (deltaL) => {
    if (hydBusy) return;
    const prev = Number(hyd) || 0;
    const optimistic = Math.max(0, Math.round((prev + deltaL) * 1000) / 1000);
    setHyd(optimistic); setLastDelta(deltaL);
    if (!live) return; // preview — local only
    const seq = ++hydSeq.current;
    setHydBusy(true);
    fetch("/api/client/hydration", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deltaL, date: localDay() }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { if (seq === hydSeq.current && d && d.ok) setHyd(Number(d.hydrationL) || 0); })
      .catch(() => { if (seq === hydSeq.current) { setHyd(prev); setLastDelta(0); } })
      .then(() => { if (seq === hydSeq.current) setHydBusy(false); });
  };
  const undoWater = () => { if (lastDelta && !hydBusy) { addWater(-lastDelta); setLastDelta(0); } };

  const nothingSet = energy == null && hunger == null && sleepHours == null && rested == null;
  const showForm = !logged || editing;
  const doLog = () => {
    if (nothingSet || saving) return;
    if (!live) { setLogged(true); setEditing(false); return; } // preview — local only
    setSaving(true);
    fetch("/api/client/checkin", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ energy, hunger, sleepHours, sleepQuality: rested, date: localDay() }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => { setLogged(true); setEditing(false); })
      .catch(() => {})
      .then(() => setSaving(false));
  };

  // ── gauge (tap-to-set 1-10, filled with an end-anchor knob over 10 tap zones) ──
  const Gauge = ({ label, val, set, c }) => {
    const pct = Math.max(0, Math.min(1, (val || 0) / 10));
    return (
      <div style={{ marginBottom: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
          <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50 }}>{label}</span>
          <span style={{ fontFamily: serif, fontSize: 18, lineHeight: 1, color: val ? c : ink50 }}>{val || "—"}<span style={{ fontFamily: mono, fontSize: 9, color: ink50 }}> /10</span></span>
        </div>
        <div style={{ position: "relative", height: 44 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 9, borderRadius: 999, background: "rgba(242,237,228,0.08)", overflow: "hidden" }}>
            <div style={{ width: (pct * 100) + "%", height: "100%", background: c, transition: "width .16s ease" }} />
          </div>
          {[...Array(9)].map((_, i) => (<div key={i} aria-hidden="true" style={{ position: "absolute", left: (((i + 1) / 10) * 100) + "%", top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 9, background: PAPER, opacity: 0.6 }} />))}
          {val ? <div aria-hidden="true" style={{ position: "absolute", left: (pct * 100) + "%", top: "50%", transform: "translate(-50%,-50%)", width: 13, height: 13, borderRadius: 999, background: c, border: "2px solid " + PAPER, boxShadow: "0 0 6px " + c }} /> : null}
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(10,1fr)" }}>
            {[...Array(10)].map((_, i) => { const v = i + 1; return <button key={v} onClick={() => set(v)} aria-pressed={val === v ? "true" : "false"} aria-label={label + " " + v + " of 10"} style={{ height: "100%", minHeight: 44, border: 0, background: "transparent", cursor: "pointer", padding: 0 }} />; })}
          </div>
        </div>
      </div>
    );
  };

  const cur = Number(hyd) || 0;
  const hpct = hydTarget > 0 ? Math.min(1, cur / hydTarget) : 0;
  const Ln = (n) => "" + (Math.round(n * 100) / 100);
  const dotCount = Math.max(6, Math.min(14, Math.round((hydTarget || 3) / 0.25)));
  const filledDots = Math.max(0, Math.min(dotCount, Math.round(hpct * dotCount)));
  const hydDisplay = Ln(cur) + " / " + Ln(hydTarget) + " L";
  const waterBtn = { fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", border: "1px solid rgba(46,224,196,0.4)", background: "rgba(46,224,196,0.08)", color: INK, borderRadius: 5, padding: "10px", cursor: "pointer", flex: 1 };

  return (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": teal, paddingLeft: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: showForm ? 10 : 8 }}>
        <span className="dash-eyebrow">Today · how are you</span>
        {logged && !editing && <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: "7px 8px", margin: "-7px -8px", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: ink50 }}>Edit</button>}
      </div>

      {showForm ? (
        <>
          <Gauge label="Energy" val={energy} set={setEnergy} c={teal} />
          <Gauge label="Hunger" val={hunger} set={setHunger} c={amber} />
          {/* SLEEP — device-first hours + an always-on Rested gauge */}
          <div style={{ marginTop: 2, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
              <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50 }}>Sleep · last night</span>
              {sleepHours != null && <span style={{ fontFamily: serif, fontSize: 15, color: blue }}>{sleepHM(sleepHours)}</span>}
            </div>
            {sleepSynced ? (
              <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.04em", textTransform: "uppercase", color: ink50 }}>
                {[sleepMeta && sleepMeta.efficiency != null ? sleepMeta.efficiency + "% efficient" : null, sleepMeta && sleepMeta.rhr != null ? "RHR " + sleepMeta.rhr : null, sleepMeta && sleepMeta.hrv != null ? "HRV " + sleepMeta.hrv : null].filter(Boolean).join(" · ") || "Synced from your device"}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[6, 6.5, 7, 7.5, 8, 8.5].map((h) => { const sel = sleepHours === h; return (
                  <button key={h} onClick={() => setSleepHours(sel ? null : h)} aria-label={h + " hours of sleep"} aria-pressed={sel ? "true" : "false"} style={{ flex: 1, minWidth: 44, borderRadius: 5, border: "1px solid " + (sel ? blue : "rgba(242,237,228,0.18)"), background: sel ? "rgba(126,212,255,0.14)" : "transparent", color: sel ? blue : INK, cursor: "pointer", padding: "8px 0", fontFamily: mono, fontSize: 10, fontWeight: 700 }}>{h}</button>
                ); })}
              </div>
            )}
            <div style={{ marginTop: 10 }}><Gauge label="Rested" val={rested} set={setRested} c={blue} /></div>
          </div>
          <button onClick={doLog} disabled={nothingSet || saving} style={{ marginTop: 2, width: "100%", border: 0, background: (nothingSet || saving) ? "rgba(242,237,228,0.12)" : teal, color: (nothingSet || saving) ? ink50 : "#06231f", cursor: saving ? "default" : "pointer", padding: "11px", fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>{saving ? "Saving…" : "Log today"}</button>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(242,237,228,0.78)", lineHeight: 1.5 }}>Energy <b style={{ color: teal }}>{energy ?? "—"}</b> · Hunger <b style={{ color: amber }}>{hunger ?? "—"}</b>{sleepHours != null ? <> · Sleep <b style={{ color: blue }}>{sleepHM(sleepHours)}</b></> : null}{rested != null ? <> · Rested <b style={{ color: blue }}>{rested}</b></> : null} · logged ✓</div>
      )}

      {/* HYDRATION — folded in, STAYS LIVE whether or not the check-in is logged */}
      <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span className="dash-eyebrow">Hydration</span>
          <span style={{ fontFamily: serif, fontSize: 16, color: INK }}>{hyd == null ? "—" : <>{hydDisplay}<span style={{ fontFamily: mono, fontSize: 9, color: ink50 }}> · {Math.round(hpct * 100)}%</span></>}</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {[...Array(dotCount)].map((_, i) => (<div key={i} aria-hidden="true" style={{ flex: "1 1 0", minWidth: 6, height: 9, borderRadius: 2, background: i < filledDots ? teal : "transparent", border: "1px solid " + (i < filledDots ? teal : "rgba(242,237,228,0.18)") }} />))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => addWater(0.25)} disabled={hydBusy} style={{ ...waterBtn, opacity: hydBusy ? 0.5 : 1 }}>+250 ml</button>
          <button onClick={() => addWater(0.5)} disabled={hydBusy} style={{ ...waterBtn, opacity: hydBusy ? 0.5 : 1 }}>+500 ml</button>
          <button onClick={undoWater} disabled={!lastDelta || hydBusy} aria-label="Undo last water" style={{ width: 44, borderRadius: 5, border: "1px solid rgba(242,237,228,0.18)", background: "transparent", color: (lastDelta && !hydBusy) ? INK : ink50, cursor: (lastDelta && !hydBusy) ? "pointer" : "default", fontFamily: mono, fontSize: 13, fontWeight: 700 }}>↶</button>
        </div>
      </div>

      {/* recovery readiness + the door to the trends page */}
      {live && (
        <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: ink50 }}>
            {readiness != null ? <>Recovery <b style={{ color: blue, fontSize: 12 }}>{readiness}</b>{readinessLabel ? <span style={{ color: blue }}> · {readinessLabel}</span> : null}</> : "Sleep & recovery"}
          </span>
          <a href="ClientProgress.html" style={{ display: "inline-block", padding: "7px 8px", margin: "-7px -8px", fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: blue, textDecoration: "none" }}>Trends →</a>
        </div>
      )}
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
function ClientDashboardPage() {
  const { today: dash, clients, client: extras, source } = useDashboard("client");
  const live = !!dash;
  const plan = extras && extras.plan;
  const nutrition = extras && extras.nutrition;
  const score = extras && extras.score;
  const membership = extras && extras.membership;
  const selfRec = clients && clients[0];

  const firstName = live ? dash.user.firstName : DCL_DEMO.firstName;
  const streak = live ? (dash.kpis.streak || 0) : DCL_DEMO.streak;

  // ── Today's plan: workout + meals (live plan → demo fallback) ──
  const todayIso = dclTodayISO();
  const dow = (new Date().getDay() + 6) % 7;
  // Signed-out preview shows the demo plan; a SIGNED-IN account with no assigned
  // plan shows EMPTY — there are no coaches on Shape yet, so never show a real
  // user another coach's demo workout/meals. Only a real assigned plan fills these.
  let workout = live ? null : DCL_DEMO.workout;
  let meals = live ? [] : DCL_DEMO.meals;
  let targets = live ? { kcal: 0, p: 0, c: 0, f: 0 } : DCL_DEMO.targets;
  let planLive = false;
  if (plan && (plan.training.hasPlan || plan.meals.hasPlan)) {
    planLive = true;
    const w = (plan.training.workouts || []).find((x) => x.scheduledDate === todayIso)
      || (plan.training.workouts || []).find((x) => !x.scheduledDate) || null;
    workout = w ? {
      title: w.title, time: dclFmt12(w.time), coach: plan.training.coach || "your coach",
      meta: [w.durationMin ? w.durationMin + " min" : null, (w.exercises || []).length + " moves"].filter(Boolean).join(" · "),
      exercises: (w.exercises || []).map((e) => ({
        prefix: e.group || null,
        name: e.name,
        scheme: [[e.sets, e.reps].filter(Boolean).join(" × "), e.tempo ? e.tempo + " tempo" : null, e.rest].filter(Boolean).join(" · "),
        load: e.load || "",
        cue: e.cue || "",
      })),
      playlist: w.playlist || null,
    } : null;
    const byDow = {}; const seq = [];
    for (const d of (plan.meals.days || [])) { if (Number.isInteger(d.dow) && byDow[d.dow] == null) byDow[d.dow] = d; else seq.push(d); }
    for (let i = 0; i < 7 && seq.length; i++) if (byDow[i] == null) byDow[i] = seq.shift();
    const day = byDow[dow];
    meals = day && Array.isArray(day.meals) ? day.meals.map((m, j) => ({
      id: m.id || "live-" + j, slot: m.slot || "Meal", time: dclFmt12(m.time), title: m.title || "Meal",
      kcal: m.kcal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0,
      alts: Array.isArray(m.alts) ? m.alts : [], // approved swap alternates from the plan
    })) : [];
    const tgt = day && day.targets;
    if (tgt && tgt.cal) targets = { kcal: Number(tgt.cal) || DCL_DEMO.targets.kcal, p: Number(tgt.p) || DCL_DEMO.targets.p, c: Number(tgt.c) || DCL_DEMO.targets.c, f: Number(tgt.f) || DCL_DEMO.targets.f };
  }

  // ── Macro ledger — seeds from today's real snapshot, ticks on each log ──
  const seeded = live && nutrition && nutrition.today && nutrition.today.date === todayIso
    ? { kcal: nutrition.today.calories || 0, p: nutrition.today.protein || 0, c: nutrition.today.carbs || 0, f: nutrition.today.fat || 0 }
    : live ? { kcal: 0, p: 0, c: 0, f: 0 } : DCL_DEMO.consumed;
  const [ledger, setLedger] = React.useState(seeded);
  React.useEffect(() => { setLedger(seeded); }, [JSON.stringify(seeded)]);
  const logKey = "shape.dashMealLog." + todayIso;
  const [logged, setLogged] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(logKey) || "{}"); } catch (e) { return {}; }
  });
  const logMeal = (m) => {
    if (logged[m.id]) return;
    const next = { ...logged, [m.id]: true };
    setLogged(next);
    try { localStorage.setItem(logKey, JSON.stringify(next)); } catch (e) {}
    setLedger((l) => ({ kcal: l.kcal + (m.kcal || 0), p: l.p + (m.p || 0), c: l.c + (m.c || 0), f: l.f + (m.f || 0) }));
    if (live) {
      fetch("/api/nutrition/meal-log", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kcal: m.kcal || 0, protein: m.p || 0, carbs: m.c || 0, fat: m.f || 0, date: new Date().toLocaleDateString("en-CA") }),
      }).catch(() => {});
    }
  };
  // ── Hero numbers ──
  const hero = live
    ? (score ? (() => {
        const cur = score.current_tier, next = score.next_tier;
        const pct = next ? Math.min(1, Math.max(0, (score.points_total - cur.threshold) / (next.threshold - cur.threshold))) : 1;
        return { total: score.points_total, tier: cur.name, next: next ? next.name : null, toNext: score.points_to_next, pct, weekGain: score.week_gain, spark: dclScoreSpark(score), why: dclWhyItMoved(score) };
      })() : { total: 0, tier: "Base", next: null, toNext: 0, pct: 0, weekGain: 0, spark: [0, 0, 0, 0, 0, 0, 0, 0], why: "Start training and logging to build your Shape Score." })
    : DCL_DEMO.score;

  // ── Weekly compliance ──
  const weekPlanned = (() => {
    if (!planLive) return 5;
    const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const sun = new Date(mon.getTime() + 6 * 86400000);
    const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const n = (plan.training.workouts || []).filter((w) => w.scheduledDate && w.scheduledDate >= iso(mon) && w.scheduledDate <= iso(sun)).length;
    return n || 5; // unscheduled plans fall back to the 5/wk default
  })();
  const comp = live ? {
    workoutsDone: dash.kpis.workoutsThisWeek || 0,
    workoutsPlanned: weekPlanned,
    mealsLogged: nutrition ? nutrition.loggedDays7 || 0 : 0,
    mealDays: 7,
  } : DCL_DEMO.compliance;
  const compPct = ((comp.workoutsDone / Math.max(1, comp.workoutsPlanned)) + (comp.mealsLogged / comp.mealDays)) / 2;

  // ── Team / check-in / secondary ──
  // No coaches on Shape yet → a signed-in account's team is EMPTY (never the
  // demo coaches). Only a real linked coach shows here.
  const team = live
    ? (Array.isArray(dash.team) ? dash.team.map((m) => ({ name: m.name, role: m.role, color: /nutri/i.test(m.role || "") ? "#d8a23a" : "#c0533b" })) : [])
    : DCL_DEMO.team;
  const checkinDue = live
    ? !!(selfRec && selfRec.checkIn && selfRec.checkIn.lastWeekOf !== (() => { const m = new Date(); m.setHours(0,0,0,0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0"); })())
    : DCL_DEMO.checkinDue;
  const nextSession = live
    ? (Array.isArray(dash.upcoming) && dash.upcoming[0]
        ? { when: new Date(dash.upcoming[0].scheduledAt).toLocaleDateString([], { weekday: "short" }) + " · " + new Date(dash.upcoming[0].scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), what: dash.upcoming[0].topic || "Coaching session" }
        : null)
    : DCL_DEMO.nextSession;
  // Milestones (step 9.1) — earned + what's next, derived from the self record.
  const msFeed = live
    ? (selfRec ? DashSignals.buildMilestones(selfRec) : { recent: [], next: [] })
    : DCL_DEMO.milestonesFeed;

  const memberPill = live
    ? (membership ? (membership.active ? { text: "Membership · active", c: DCL_TEAL } : { text: "Membership · inactive", c: DCL_RED }) : { text: "Membership · —", c: DCL_INK50 })
    : { text: "Membership · demo", c: DCL_INK50 };

  const plate = (ac) => ({ "--dac": ac });
  const btn = { fontFamily: DCL_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: DCL_TEAL, border: 0, borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
  const ghost = { ...btn, color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", textDecoration: "none", display: "inline-block" };

  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: sans, display: "flex", flexDirection: "column" }}>
      {source === "demo" && <DashDemoBand />}
      <Header />
      <div className="dash-shell-grid" style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1 }}>
        <DashSidebar navItems={clientNavItems("today")} payoutCard={live && score
          ? { label: "SHAPE SCORE", amount: hero.total.toLocaleString(), sub: hero.tier + (hero.next ? " · " + hero.toNext + " to " + hero.next : "") }
          : clientPayoutCard} />
        <main style={{ padding: "24px 44px 80px", minWidth: 0 }}>
          {/* Greeting — real date, not a hardcoded one */}
          <div data-tour="hero-today" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: DCL_MONO, fontSize: 10.5, letterSpacing: "0.14em", color: DCL_INK50 }}>{dclRealDate()}</div>
              <h1 style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.025em", fontWeight: 400, margin: "8px 0 0", lineHeight: 1.02 }}>Welcome back, {firstName}.</h1>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href="ClientTrain.html" style={{ ...btn, textDecoration: "none", display: "inline-block", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)", padding: "10px 16px" }}>Log workout</a>
              <a href="ClientTeam.html" style={{ ...ghost, padding: "10px 16px" }}>Book session</a>
            </div>
          </div>

          {/* Check-in CTA — only when due */}
          {checkinDue && (
            <div className="dash-plate dash-plate--tick" style={{ ...plate("#d8a23a"), marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", paddingLeft: 24 }}>
              <div>
                <div className="dash-eyebrow" style={{ color: "#d8a23a" }}>Weekly check-in · due</div>
                <div style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.015em", marginTop: 6 }}>2 minutes, 6 sliders — your coaches see it.</div>
              </div>
              <a href="ClientProgress.html" style={{ ...btn, background: "#d8a23a", textDecoration: "none" }}>Check in →</a>
            </div>
          )}

          <DashGrid role="client" widgets={[
            { key: "score", title: "Shape Score", size: "full", render: () => (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  {/* The ring IS the link to the Score deep-dive */}
                  <a href="ClientScore.html" aria-label="Open your Shape Score" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                    <DclRing pct={hero.pct} color={DCL_TEAL}>
                      <div style={{ fontFamily: serif, fontSize: 22, lineHeight: 1 }}>{hero.total.toLocaleString()}</div>
                      <div style={{ fontFamily: DCL_MONO, fontSize: 7.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_INK50, marginTop: 3 }}>{hero.tier}</div>
                    </DclRing>
                  </a>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div className="dash-eyebrow">Shape Score{hero.next ? " · " + hero.toNext + " to " + hero.next : ""}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                      <span style={{ fontFamily: serif, fontSize: 21, color: hero.weekGain >= 0 ? DCL_GREEN : DCL_RED }}>{hero.weekGain >= 0 ? "▲ +" + hero.weekGain : "▼ −" + Math.abs(hero.weekGain)}</span>
                      <DclSpark data={hero.spark} />
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(242,237,228,0.78)", lineHeight: 1.5, marginTop: 7 }}>{hero.why || "Log workouts and meals to move your score."}</div>
                  </div>
                  <div style={{ textAlign: "center", borderLeft: "1px solid rgba(242,237,228,0.08)", paddingLeft: 20 }}>
                    <div style={{ fontFamily: serif, fontSize: 30, lineHeight: 1 }}>{streak}<span style={{ fontSize: 14, color: DCL_INK50 }}>d</span></div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: DCL_INK50, marginTop: 5 }}>Streak</div>
                  </div>
                </div>
              </div>
            ) },
            { key: "today", title: "Today", size: "full", render: () => <DashTodayCard live={live} /> },
            { key: "workout", title: "Tonight's Workout", size: "full", render: () => (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate("#c0533b"), paddingLeft: 24 }}>
{(() => {
                  const w = workout ? { ...workout, meta: workout.meta } : null;
                  return <DashWorkoutCard workout={w} />;
                })()}
              </div>
            ) },
            { key: "meals", title: "Today's Meals", size: "full", render: () => (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <DashMealLedgerCard
                  meals={meals} targets={targets} ledger={ledger} logged={logged}
                  onLog={logMeal} headerNote={planLive ? "from your plan" : null}
                  swapStorageKey={"shape.dashMealSwap." + todayIso}
                />
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)", textAlign: "right" }}>
                  <a href="ClientNutri.html" style={{ fontFamily: DCL_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_TEAL, textDecoration: "none" }}>Full meal plan · week &amp; swaps →</a>
                </div>
              </div>
            ) },
            { key: "consistency", title: "This week", size: "half", render: () => (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_GREEN), paddingLeft: 24 }}>
                <div className="dash-eyebrow" style={{ color: DCL_GREEN }}>This week · consistency</div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
                  <DclRing pct={compPct} color={DCL_GREEN} size={84}>
                    <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1 }}>{comp.workoutsDone + comp.mealsLogged}</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>wins</div>
                  </DclRing>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1 }}>{comp.workoutsDone}<span style={{ color: DCL_INK50, fontSize: 12 }}>/{comp.workoutsPlanned}</span></div>
                      <div style={{ fontFamily: DCL_MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>Workouts done</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1 }}>{comp.mealsLogged}<span style={{ color: DCL_INK50, fontSize: 12 }}>/{comp.mealDays}</span></div>
                      <div style={{ fontFamily: DCL_MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>Days meals logged</div>
                    </div>
                  </div>
                </div>
              </div>
            ) },
            { key: "milestones", title: "Milestones", size: "half", render: () => ((msFeed.recent.length > 0 || msFeed.next.length > 0) ? (
                <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate("#d8a23a"), paddingLeft: 24 }}>
                  <div className="dash-eyebrow" style={{ color: "#d8a23a" }}>Milestones</div>
                  <div className="dash-ledger" style={{ "--dac": "#d8a23a", marginTop: 9 }} />
                  {msFeed.recent.map((m, i) => (
                    <div key={"r" + i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "6px 0" }}>
                      <span style={{ color: DCL_GREEN, fontSize: 12 }}>✓</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</span>
                      <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DCL_INK50 }}>{m.active ? "active" : (m.when || (m.hitAt ? (() => { const d = Math.floor((Date.now() - new Date(m.hitAt + (String(m.hitAt).length === 10 ? "T00:00:00" : "")).getTime()) / 86400000); return d <= 0 ? "today" : d + "d ago"; })() : "earned"))}</span>
                    </div>
                  ))}
                  {msFeed.next.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
                      <div style={{ fontFamily: DCL_MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DCL_INK50, marginBottom: 6 }}>Next up</div>
                      {msFeed.next.map((m, i) => (
                        <div key={"n" + i} style={{ padding: "5px 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <span style={{ fontSize: 12.5 }}>{m.label}</span>
                            <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DCL_INK50 }}>{m.detail}</span>
                          </div>
                          {m.progress != null && (
                            <div style={{ position: "relative", height: 4, background: "rgba(242,237,228,0.08)", borderRadius: 2, marginTop: 4 }}>
                              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, Math.round(m.progress * 100)) + "%", background: "#d8a23a", borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null) },
            { key: "team", title: "Your Team", size: "half", render: () => (
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <div className="dash-eyebrow">Your team</div>
                <div className="dash-ledger" style={{ marginTop: 9 }} />
                {team.length === 0 && (
                  <div style={{ fontSize: 12.5, color: DCL_INK50, padding: "10px 0" }}>
                    No coaches yet — <a href="Marketplace.html" style={{ color: DCL_TEAL, textDecoration: "none" }}>find a trainer or nutritionist →</a>
                  </div>
                )}
                {team.map((m, i) => {
                  const unread = dclUnreadFor(m.name);
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: m.color }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</span>
                          {unread > 0 && <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, fontWeight: 700, color: "#06231f", background: DCL_TEAL, borderRadius: 999, padding: "2px 7px" }}>{unread}</span>}
                        </div>
                        <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>{m.role}</div>
                      </div>
                      <button onClick={() => dashMessageClient(m.name, "client")} style={ghost}>Message</button>
                    </div>
                  );
                })}
              </div>
            ) },
            { key: "secondary", title: "Links", size: "half", render: () => (
              <div className="dash-plate dash-plate--bracket" style={{ ...plate("rgba(242,237,228,0.35)"), paddingLeft: 24 }}>
                <a href="ClientGrocery.html" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", color: INK }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>Grocery list</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>Auto-built from your plan</div>
                  </div>
                  <span style={{ color: DCL_TEAL, padding: "8px 10px", margin: "-8px -10px" }}>→</span>
                </a>
                <div style={{ borderTop: "1px solid rgba(242,237,228,0.05)", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{nextSession ? nextSession.when : "No session booked"}</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>{nextSession ? nextSession.what : "Book one with your coach"}</div>
                  </div>
                  <a href="ClientTeam.html" aria-label="Book a session" style={{ color: DCL_TEAL, textDecoration: "none", padding: "8px 10px", margin: "-8px -10px" }}>→</a>
                </div>
                <div style={{ borderTop: "1px solid rgba(242,237,228,0.05)", paddingTop: 10, marginTop: 2 }}>
                  <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: memberPill.c, border: "1px solid " + (memberPill.c === DCL_INK50 ? "rgba(242,237,228,0.18)" : memberPill.c + "55"), borderRadius: 4, padding: "4px 9px" }}>{memberPill.text}</span>
                </div>
              </div>
            ) },
          ]} />
        </main>
      </div>
      <Footer />
    </div>
  );
}

Object.assign(window, { ClientDashboardPage, DashWorkoutCard, DashMealLedgerCard, DashTodayCard });
