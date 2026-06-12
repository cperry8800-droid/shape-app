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
      { name: "Back squat", scheme: "4 × 5 · 31X1 tempo", load: "185 lb" },
      { name: "Front-foot split squat", scheme: "3 × 8 ea · slow eccentric", load: "40 lb" },
      { name: "Leg press", scheme: "3 × 10 · 2s pause", load: "270 lb" },
      { name: "Standing calf raise", scheme: "3 × 12 · full stretch", load: "95 lb" },
    ],
    playlist: { name: "Lower Push — Peak", meta: "95–138 BPM · 14 tracks", by: "Maya" },
  },
  meals: [
    { id: "demo-m1", slot: "Lunch", time: "12:30 PM", title: "Grilled chicken bowl", kcal: 620, p: 52, c: 68, f: 18 },
    { id: "demo-m2", slot: "Snack", time: "4:00 PM", title: "Greek yogurt + berries", kcal: 240, p: 22, c: 28, f: 5 },
    { id: "demo-m3", slot: "Dinner", time: "7:00 PM", title: "Salmon, rice & greens", kcal: 680, p: 46, c: 64, f: 24 },
  ],
  compliance: { workoutsDone: 4, workoutsPlanned: 6, mealsLogged: 6, mealDays: 7 },
  team: [
    { name: "Maya Okafor", role: "Trainer", color: "#c0533b" },
    { name: "Rae Lindqvist", role: "Nutritionist", color: "#d8a23a" },
  ],
  nextSession: { when: "Thu · 6:30 PM", what: "Weekly with Maya · 20 min video" },
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

// ── The page ────────────────────────────────────────────────────────────────
function ClientDashboardPage() {
  const { today: dash, clients, client: extras } = useDashboard("client");
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
  let workout = DCL_DEMO.workout, meals = DCL_DEMO.meals, targets = DCL_DEMO.targets, planLive = false;
  if (plan && (plan.training.hasPlan || plan.meals.hasPlan)) {
    planLive = true;
    const w = (plan.training.workouts || []).find((x) => x.scheduledDate === todayIso)
      || (plan.training.workouts || []).find((x) => !x.scheduledDate) || null;
    workout = w ? {
      title: w.title, time: dclFmt12(w.time), coach: plan.training.coach || "your coach",
      meta: [w.durationMin ? w.durationMin + " min" : null, (w.exercises || []).length + " moves"].filter(Boolean).join(" · "),
      exercises: (w.exercises || []).map((e) => ({ name: e.name, scheme: [[e.sets, e.reps].filter(Boolean).join(" × "), e.rest].filter(Boolean).join(" · "), load: e.load || "" })),
      playlist: null,
    } : null;
    const byDow = {}; const seq = [];
    for (const d of (plan.meals.days || [])) { if (Number.isInteger(d.dow) && byDow[d.dow] == null) byDow[d.dow] = d; else seq.push(d); }
    for (let i = 0; i < 7 && seq.length; i++) if (byDow[i] == null) byDow[i] = seq.shift();
    const day = byDow[dow];
    meals = day && Array.isArray(day.meals) ? day.meals.map((m, j) => ({
      id: m.id || "live-" + j, slot: m.slot || "Meal", time: dclFmt12(m.time), title: m.title || "Meal",
      kcal: m.kcal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0,
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
        body: JSON.stringify({ kcal: m.kcal || 0, protein: m.p || 0, carbs: m.c || 0, fat: m.f || 0 }),
      }).catch(() => {});
    }
  };
  const remaining = Math.max(0, targets.kcal - ledger.kcal);

  // ── Hero numbers ──
  const hero = live && score ? (() => {
    const cur = score.current_tier, next = score.next_tier;
    const pct = next ? Math.min(1, Math.max(0, (score.points_total - cur.threshold) / (next.threshold - cur.threshold))) : 1;
    return { total: score.points_total, tier: cur.name, next: next ? next.name : null, toNext: score.points_to_next, pct, weekGain: score.week_gain, spark: dclScoreSpark(score), why: dclWhyItMoved(score) };
  })() : DCL_DEMO.score;

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
  const team = live && Array.isArray(dash.team) && dash.team.length
    ? dash.team.map((m) => ({ name: m.name, role: m.role, color: /nutri/i.test(m.role || "") ? "#d8a23a" : "#c0533b" }))
    : DCL_DEMO.team;
  const checkinDue = live
    ? !!(selfRec && selfRec.checkIn && selfRec.checkIn.lastWeekOf !== (() => { const m = new Date(); m.setHours(0,0,0,0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0"); })())
    : DCL_DEMO.checkinDue;
  const nextSession = live
    ? (Array.isArray(dash.upcoming) && dash.upcoming[0]
        ? { when: new Date(dash.upcoming[0].scheduledAt).toLocaleDateString([], { weekday: "short" }) + " · " + new Date(dash.upcoming[0].scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), what: dash.upcoming[0].topic || "Coaching session" }
        : null)
    : DCL_DEMO.nextSession;
  const memberPill = live
    ? (membership ? (membership.active ? { text: "Membership · active", c: DCL_TEAL } : { text: "Membership · inactive", c: DCL_RED }) : { text: "Membership · —", c: DCL_INK50 })
    : { text: "Membership · demo", c: DCL_INK50 };

  const plate = (ac) => ({ "--dac": ac });
  const btn = { fontFamily: DCL_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: DCL_TEAL, border: 0, borderRadius: 4, padding: "8px 13px", cursor: "pointer" };
  const ghost = { ...btn, color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", textDecoration: "none", display: "inline-block" };

  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: sans, display: "flex", flexDirection: "column" }}>
      <Header />
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1 }}>
        <DashSidebar navItems={clientNavItems("today")} payoutCard={clientPayoutCard} />
        <main style={{ padding: "36px 44px 80px", minWidth: 0 }}>
          {/* Greeting — real date, not a hardcoded one */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 16, alignItems: "start" }}>
            {/* ── Left column ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              {/* Hero — Shape Score ring + why it moved + streak */}
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <DclRing pct={hero.pct} color={DCL_TEAL}>
                    <div style={{ fontFamily: serif, fontSize: 22, lineHeight: 1 }}>{hero.total.toLocaleString()}</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 7.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_INK50, marginTop: 3 }}>{hero.tier}</div>
                  </DclRing>
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

              {/* Tonight's workout */}
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate("#c0533b"), paddingLeft: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span className="dash-eyebrow" style={{ color: "#c0533b" }}>Tonight's workout{workout && workout.time ? " · " + workout.time : ""}</span>
                  <span style={{ fontFamily: DCL_MONO, fontSize: 9, letterSpacing: "0.1em", color: DCL_INK50, textTransform: "uppercase" }}>{workout ? workout.meta : ""}</span>
                </div>
                {workout ? (
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.02em", margin: "8px 0 2px" }}>{workout.title}</div>
                    <div style={{ fontSize: 11.5, color: DCL_INK50, marginBottom: 6 }}>with {workout.coach}</div>
                    <div className="dash-ledger" style={{ "--dac": "#c0533b" }} />
                    {workout.exercises.slice(0, 4).map((e, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
                        <span style={{ fontFamily: DCL_MONO, fontSize: 9.5, color: DCL_INK50 }}>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.name}</div>
                          <div style={{ fontFamily: DCL_MONO, fontSize: 9, letterSpacing: "0.05em", color: DCL_INK50, marginTop: 2 }}>{e.scheme}</div>
                        </div>
                        <span style={{ fontFamily: DCL_MONO, fontSize: 10.5, color: "rgba(242,237,228,0.8)" }}>{e.load}</span>
                      </div>
                    ))}
                    {workout.exercises.length > 4 && <div style={{ fontFamily: DCL_MONO, fontSize: 9, color: DCL_INK50, padding: "6px 0 0 32px" }}>+ {workout.exercises.length - 4} more</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      {workout.playlist ? (
                        <a href="ClientPlaylists.html" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", fontFamily: DCL_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1ED760", background: "rgba(30,215,96,0.08)", border: "1px solid rgba(30,215,96,0.35)", borderLeft: "3px solid #1ED760", borderRadius: 4, padding: "6px 10px" }}>
                          ♪ {workout.playlist.name} · {workout.playlist.meta}
                        </a>
                      ) : (
                        <a href="ClientPlaylists.html" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", fontFamily: DCL_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DCL_INK50, border: "1px solid rgba(242,237,228,0.16)", borderRadius: 4, padding: "6px 10px" }}>♪ Shape Radio</a>
                      )}
                      <a href="ClientTrain.html" style={{ ...btn, background: "#c0533b", color: "#fff", textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>Start →</a>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: DCL_INK50, marginTop: 8 }}>Rest day — recovery counts. An easy walk keeps the streak alive.</div>
                )}
              </div>

              {/* Today's meals + live macro ledger */}
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span className="dash-eyebrow">Today's meals{planLive ? " · from your plan" : ""}</span>
                  <span style={{ fontFamily: DCL_MONO, fontSize: 9, letterSpacing: "0.08em", color: remaining > 0 ? DCL_INK50 : DCL_GREEN, textTransform: "uppercase" }}>{remaining > 0 ? remaining.toLocaleString() + " kcal left" : "Target hit"}</span>
                </div>
                <div className="dash-ledger" style={{ marginTop: 9 }} />
                {/* The ledger — ticks live as meals are logged */}
                {[["Calories", ledger.kcal, targets.kcal, DCL_TEAL], ["Protein", ledger.p, targets.p, "#7ed4ff"], ["Carbs", ledger.c, targets.c, "#f6c177"], ["Fat", ledger.f, targets.f, "#ff8a6d"]].map(([l, v, t, c2]) => (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 10, alignItems: "center", padding: "4px 0" }}>
                    <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50 }}>{l}</span>
                    <div style={{ position: "relative", height: 5, background: "rgba(242,237,228,0.08)", borderRadius: 2 }}>
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, Math.round((v / Math.max(1, t)) * 100)) + "%", background: c2, borderRadius: 2, transition: "width .35s ease" }} />
                    </div>
                    <span style={{ fontFamily: DCL_MONO, fontSize: 10, whiteSpace: "nowrap" }}>{Math.round(v)}<span style={{ color: DCL_INK50 }}>/{t}{l === "Calories" ? "" : "g"}</span></span>
                  </div>
                ))}
                <div style={{ marginTop: 10 }}>
                  {meals.length ? meals.map((m, i) => {
                    const isLogged = !!logged[m.id];
                    return (
                      <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DCL_TEAL }}>{m.slot}{m.time ? " · " + m.time : ""}</div>
                          <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 3, opacity: isLogged ? 0.55 : 1 }}>{m.title}</div>
                          <div style={{ fontFamily: DCL_MONO, fontSize: 9, color: DCL_INK50, marginTop: 2 }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F</div>
                        </div>
                        {isLogged
                          ? <span style={{ fontFamily: DCL_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: DCL_GREEN, textTransform: "uppercase" }}>✓ Logged</span>
                          : <button onClick={() => logMeal(m)} style={ghost}>Log meal</button>}
                      </div>
                    );
                  }) : (
                    <div style={{ fontSize: 12.5, color: DCL_INK50, padding: "10px 0" }}>No meals assigned today — your nutritionist's next push lands here.</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right column ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              {/* Weekly compliance ring */}
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_GREEN), paddingLeft: 24 }}>
                <div className="dash-eyebrow" style={{ color: DCL_GREEN }}>This week · compliance</div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
                  <DclRing pct={compPct} color={DCL_GREEN} size={84}>
                    <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1 }}>{Math.round(compPct * 100)}%</div>
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

              {/* Messages from your pros */}
              <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ ...plate(DCL_TEAL), paddingLeft: 24 }}>
                <div className="dash-eyebrow">Your team</div>
                <div className="dash-ledger" style={{ marginTop: 9 }} />
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

              {/* Secondary — grocery / next session / membership */}
              <div className="dash-plate dash-plate--bracket" style={{ ...plate("rgba(242,237,228,0.35)"), paddingLeft: 24 }}>
                <a href="ClientGrocery.html" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", color: INK }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>Grocery list</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>Auto-built from your plan</div>
                  </div>
                  <span style={{ color: DCL_TEAL }}>→</span>
                </a>
                <div style={{ borderTop: "1px solid rgba(242,237,228,0.05)", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{nextSession ? nextSession.when : "No session booked"}</div>
                    <div style={{ fontFamily: DCL_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DCL_INK50, marginTop: 2 }}>{nextSession ? nextSession.what : "Book one with your coach"}</div>
                  </div>
                  <a href="ClientTeam.html" style={{ color: DCL_TEAL, textDecoration: "none" }}>→</a>
                </div>
                <div style={{ borderTop: "1px solid rgba(242,237,228,0.05)", paddingTop: 10, marginTop: 2 }}>
                  <span style={{ fontFamily: DCL_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: memberPill.c, border: "1px solid " + (memberPill.c === DCL_INK50 ? "rgba(242,237,228,0.18)" : memberPill.c + "55"), borderRadius: 4, padding: "4px 9px" }}>{memberPill.text}</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

Object.assign(window, { ClientDashboardPage });
