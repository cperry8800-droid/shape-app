// Workouts v2 — ClientTrain.html migrated into the FULL assigned program view
// (dashboard-v2 gap step). Structure: tonight's session up top (the Today
// card deep-links here), then the program by week — current week expanded,
// past weeks collapsed with per-day completion marks, upcoming weeks visible
// but LOCKED ("{coach} fine-tunes it after your check-in" — the human loop is
// the product), then session history with logged-vs-prescribed set detail and
// inline PR badges.
//
// Data: /api/client/plan (assigned workouts; builder snapshots carry a
// template {week, day} stamp → week grouping), /api/client/train
// (recentSessions now include per-move target vs logged), /api/client/dashboard
// (completed-workout calendar → completion marks), /api/client/progress
// (PR dates → inline badges). Demo dataset under the band when signed out.
//
// Load order: pageShell → trainerDashboard → clientNav → dashSignals →
// dashToday (DashDemoBand/DashPill) → dashClient (DashWorkoutCard) → this.

const DTR_INK50 = "rgba(242,237,228,0.55)";
const DTR_MONO = "'JetBrains Mono', monospace";
const DTR_TEAL = "#2ee0c4";
const DTR_GREEN = "#7bbf5a";
const DTR_RUST = "#c0533b";
const DTR_DAY = 86400000;

function dtrIso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dtrMonday(d) {
  const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x;
}
function dtrDate(v) {
  if (!v) return "";
  try { return new Date(String(v).length === 10 ? v + "T00:00:00" : v).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return ""; }
}
function dtrAgo(days) { return dtrIso(new Date(Date.now() - days * DTR_DAY)); }

// ── Week grouping — template stamps first, ISO weeks as the fallback ────────
// Returns [{ week:n|null, label, status:'past'|'current'|'upcoming', days:[
//   { workout, done, isToday } ], doneCount }], plus the undated leftovers.
function dtrBuildWeeks(workouts, completedDates, now) {
  now = now || new Date();
  const todayIso = dtrIso(now);
  const thisMonday = dtrMonday(now).getTime();
  const dated = workouts.filter((w) => w.scheduledDate);
  const anytime = workouts.filter((w) => !w.scheduledDate);
  const byKey = new Map();
  for (const w of dated) {
    const stamped = w.template && w.template.week != null;
    const key = stamped ? "w" + w.template.week : "d" + dtrIso(dtrMonday(new Date(w.scheduledDate + "T00:00:00")));
    if (!byKey.has(key)) byKey.set(key, { week: stamped ? w.template.week : null, days: [] });
    byKey.get(key).days.push(w);
  }
  const weeks = [...byKey.values()].map((g) => {
    g.days.sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
    const first = new Date(g.days[0].scheduledDate + "T00:00:00");
    const weekMonday = dtrMonday(first).getTime();
    const status = weekMonday < thisMonday ? "past" : weekMonday === thisMonday ? "current" : "upcoming";
    const days = g.days.map((w) => ({
      workout: w,
      done: completedDates.has(w.scheduledDate),
      isToday: w.scheduledDate === todayIso,
    }));
    return {
      week: g.week,
      sortKey: weekMonday,
      label: (g.week != null ? "Week " + g.week : dtrDate(g.days[0].scheduledDate) + " – " + dtrDate(g.days[g.days.length - 1].scheduledDate)),
      range: dtrDate(g.days[0].scheduledDate) + " – " + dtrDate(g.days[g.days.length - 1].scheduledDate),
      status,
      days,
      doneCount: days.filter((d) => d.done).length,
    };
  }).sort((a, b) => a.sortKey - b.sortKey);
  return { weeks, anytime };
}

// Today's (or the next upcoming) workout — the page hero.
function dtrTonight(weeks) {
  for (const w of weeks) {
    for (const d of w.days) if (d.isToday) return { day: d, when: "Tonight" };
  }
  const todayMs = Date.now();
  let best = null;
  for (const w of weeks) for (const d of w.days) {
    if (w.status === "upcoming" && !d.done) continue; // locked weeks don't preview
    const t = new Date(d.workout.scheduledDate + "T00:00:00").getTime();
    if (t > todayMs && (!best || t < best.t)) best = { day: d, t };
  }
  return best ? { day: best.day, when: dtrDate(best.day.workout.scheduledDate) } : null;
}

// DashWorkoutCard shape from a plan workout.
function dtrToCard(w, coach) {
  return {
    title: w.title,
    time: w.time ? (() => { const [h, m] = w.time.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m || 0).padStart(2, "0") + " " + ap; })() : null,
    coach: coach || "your coach",
    meta: [w.durationMin ? w.durationMin + " min" : null, (w.exercises || []).length + " moves"].filter(Boolean).join(" · "),
    exercises: (w.exercises || []).map((e) => ({
      prefix: e.group || null,
      name: e.name,
      scheme: [[e.sets, e.reps].filter(Boolean).join(" × "), e.tempo ? e.tempo + " tempo" : null, e.rest].filter(Boolean).join(" · "),
      load: e.load || "",
      cue: e.cue || "",
    })),
    playlist: w.playlist || null,
  };
}

// ── Demo dataset (signed out / API down — under the band) ───────────────────
const DTR_DEMO = (() => {
  const mk = (week, dayN, daysAgo, title, moves) => ({
    id: "demo-" + week + "-" + dayN, title, kind: "template",
    scheduledDate: dtrAgo(daysAgo), time: "17:45", durationMin: 52,
    template: { id: "demo-tpl", name: "Strength Block 3", version: 2, week, day: dayN },
    playlist: { name: "Lower Push — Peak", meta: "95–138 BPM" },
    exercises: moves,
  });
  const lower = [
    { name: "Back squat", sets: "4", reps: "5", tempo: "31X1", rest: "150s", load: "110 kg", cue: "Brace before the walkout", group: null },
    { name: "Romanian deadlift", sets: "3", reps: "8", rest: "120s", load: "90 kg", cue: "Push the hips back, bar on the thighs", group: null },
    { name: "Split squat", sets: "3", reps: "8 ea", rest: "90s", load: "18 kg", cue: "", group: "A" },
    { name: "Leg curl", sets: "3", reps: "10", rest: "90s", load: "RPE 8", cue: "", group: "A" },
  ];
  const upper = [
    { name: "Bench press", sets: "4", reps: "6", tempo: "30X1", rest: "150s", load: "82.5 kg", cue: "Feet planted, bar over wrists", group: null },
    { name: "Weighted pull-up", sets: "4", reps: "6", rest: "150s", load: "+10 kg", cue: "", group: null },
    { name: "Incline DB press", sets: "3", reps: "10", rest: "90s", load: "28 kg", cue: "", group: "A" },
    { name: "Chest-supported row", sets: "3", reps: "10", rest: "90s", load: "30 kg", cue: "", group: "A" },
  ];
  // Today sits mid-week-2: week 1 fully behind, week 3 assigned + locked.
  const dow = (new Date().getDay() + 6) % 7; // Mon=0
  const off = (week, day) => dow + 7 * week - day; // days ago for week offsets
  const workouts = [
    mk(1, 1, off(1, 0), "Lower Push — Build", lower), mk(1, 2, off(1, 2), "Upper Push — Build", upper),
    mk(1, 3, off(1, 4), "Lower Pull — Build", lower), mk(1, 4, off(1, 5), "Upper Pull — Build", upper),
    mk(2, 1, off(0, 0), "Lower Push — Peak", lower), mk(2, 2, off(0, 2), "Upper Push — Peak", upper),
    mk(2, 3, off(0, 4), "Lower Pull — Peak", lower), mk(2, 4, off(0, 5), "Upper Pull — Peak", upper),
    mk(3, 1, off(-1, 0), "Lower Push — Wave 2", lower), mk(3, 2, off(-1, 2), "Upper Push — Wave 2", upper),
    mk(3, 3, off(-1, 4), "Lower Pull — Wave 2", lower), mk(3, 4, off(-1, 5), "Upper Pull — Wave 2", upper),
  ];
  // Done: all of week 1 + week 2 days strictly before today.
  const completed = new Set(workouts.filter((w) => {
    const wk = w.template.week;
    return wk === 1 || (wk === 2 && w.scheduledDate < dtrIso(new Date()));
  }).map((w) => w.scheduledDate));
  const history = [
    { title: "Upper Push — Peak", at: dtrAgo(1), durationMin: 49, pr: false, moves: [
      { name: "Bench press", setsLogged: 4, setsPrescribed: 4, target: "6 @ 82.5 kg", best: "82.5 kg × 6" },
      { name: "Weighted pull-up", setsLogged: 4, setsPrescribed: 4, target: "6 @ +10 kg", best: "+10 kg × 7" },
      { name: "Incline DB press", setsLogged: 3, setsPrescribed: 3, target: "10 @ 28 kg", best: "28 kg × 10" },
    ] },
    { title: "Lower Push — Peak", at: dtrAgo(3), durationMin: 54, pr: true, moves: [
      { name: "Back squat", setsLogged: 4, setsPrescribed: 4, target: "5 @ 110 kg", best: "112.5 kg × 5" },
      { name: "Romanian deadlift", setsLogged: 3, setsPrescribed: 3, target: "8 @ 90 kg", best: "90 kg × 8" },
      { name: "Split squat", setsLogged: 2, setsPrescribed: 3, target: "8 ea @ 18 kg", best: "18 kg × 8" },
    ] },
    { title: "Upper Pull — Build", at: dtrAgo(6), durationMin: 47, pr: false, moves: [
      { name: "Weighted pull-up", setsLogged: 4, setsPrescribed: 4, target: "6 @ +7.5 kg", best: "+7.5 kg × 6" },
      { name: "Chest-supported row", setsLogged: 3, setsPrescribed: 3, target: "10 @ 30 kg", best: "30 kg × 10" },
    ] },
  ];
  return { coach: "Maya", program: "Strength Block 3", weeksTotal: 4, workouts, completed, history,
    stats: { thisWeekCount: 2, completedCount: 42, volume7dLb: 9120 } };
})();

// ── Pieces ──────────────────────────────────────────────────────────────────
function DtrDayRow({ d, coach }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
      <span style={{ color: d.done ? DTR_GREEN : DTR_INK50, fontSize: 12 }}>{d.done ? "✓" : "○"}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, opacity: d.done ? 0.75 : 1 }}>{d.workout.title}{d.isToday && <DashPill c={DTR_TEAL}>Tonight</DashPill>}</div>
        <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DTR_INK50, marginTop: 2 }}>
          {dtrDate(d.workout.scheduledDate)} · {(d.workout.exercises || []).length} moves{d.workout.durationMin ? " · " + d.workout.durationMin + " min" : ""}
        </div>
      </div>
      <span style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: d.done ? DTR_GREEN : DTR_INK50 }}>{d.done ? "Done" : d.isToday ? "Up next" : "Scheduled"}</span>
    </div>
  );
}

function DtrWeekPlate({ w, coach, defaultOpen }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const locked = w.status === "upcoming";
  const accent = w.status === "current" ? DTR_RUST : w.status === "past" ? "rgba(242,237,228,0.35)" : DTR_INK50;
  return (
    <div className={"dash-plate" + (w.status === "current" ? " dash-plate--tick dash-plate--bracket" : "")} style={{ "--dac": accent, paddingLeft: 24, opacity: locked ? 0.82 : 1 }}>
      <div
        onClick={() => !locked && setOpen(!open)}
        onKeyDown={(e) => { if (!locked && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(!open); } }}
        role={locked ? undefined : "button"} tabIndex={locked ? undefined : 0}
        aria-expanded={locked ? undefined : open}
        style={{ display: "flex", alignItems: "center", gap: 12, cursor: locked ? "default" : "pointer", flexWrap: "wrap" }}
      >
        <span className="dash-eyebrow" style={{ color: w.status === "current" ? DTR_RUST : DTR_INK50 }}>
          {!locked && <span style={{ display: "inline-block", width: 13, fontSize: 10 }}>{open ? "▾" : "▸"}</span>}
          {locked && <span style={{ display: "inline-block", width: 15 }}>🔒︎</span>}
          {w.label} · {w.status === "current" ? "this week" : w.status === "past" ? "done" : "locked"}
        </span>
        <span style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DTR_INK50, textTransform: "uppercase" }}>{w.range}</span>
        <span style={{ flex: 1 }} />
        {/* Per-day completion marks */}
        <span style={{ display: "inline-flex", gap: 4 }}>
          {w.days.map((d, i) => (
            <span key={i} title={d.workout.title + (d.done ? " · done" : "")} style={{ width: 9, height: 9, borderRadius: 2, background: d.done ? DTR_GREEN : "transparent", border: "1px solid " + (d.done ? DTR_GREEN : d.isToday ? DTR_TEAL : "rgba(242,237,228,0.3)") }} />
          ))}
        </span>
        <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: w.doneCount === w.days.length && w.days.length ? DTR_GREEN : DTR_INK50 }}>{w.doneCount}/{w.days.length}</span>
      </div>
      {locked ? (
        <div style={{ fontSize: 12, color: DTR_INK50, lineHeight: 1.5, marginTop: 9 }}>
          {w.days.map((d) => d.workout.title).join(" · ")}
          <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DTR_INK50, marginTop: 5 }}>
            UNLOCKS {dtrDate(w.days[0].workout.scheduledDate).toUpperCase()} — {coach.toUpperCase()} FINE-TUNES IT AFTER YOUR CHECK-IN
          </div>
        </div>
      ) : open && (
        <div style={{ marginTop: 8 }}>
          {w.days.map((d, i) => <DtrDayRow key={i} d={d} coach={coach} />)}
        </div>
      )}
    </div>
  );
}

// The unwritten week — the human loop, sold honestly.
function DtrNextWeekLocked({ coach, weekN }) {
  return (
    <div className="dash-plate" style={{ "--dac": "#d8a23a", paddingLeft: 24, border: "1px dashed rgba(216,162,58,0.35)" }}>
      <div className="dash-eyebrow" style={{ color: "#d8a23a" }}>🔒︎ {weekN != null ? "Week " + weekN : "Next week"} · not written yet</div>
      <div style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.015em", margin: "8px 0 4px" }}>{coach} writes this after your check-in.</div>
      <div style={{ fontSize: 12.5, color: DTR_INK50, lineHeight: 1.55, maxWidth: 520 }}>
        Your next block isn't generated — it's built from what this week's check-in says. Send it and the plan lands here.
      </div>
      <a href="ClientProgress.html" style={{ display: "inline-block", marginTop: 11, fontFamily: DTR_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#231803", background: "#d8a23a", borderRadius: 4, padding: "10px 16px", textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>Check in →</a>
    </div>
  );
}

function DtrHistory({ sessions, prDates }) {
  const [open, setOpen] = React.useState(0);
  if (!sessions.length) return <div style={{ fontSize: 12.5, color: DTR_INK50 }}>No completed sessions yet — your first one starts the history.</div>;
  return (
    <div>
      {sessions.map((s, i) => {
        const isPr = s.pr != null ? s.pr : prDates.has(String(s.at).slice(0, 10));
        const on = open === i;
        const hasMoves = Array.isArray(s.moves) && s.moves.length > 0;
        return (
          <div key={i} style={{ borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
            <div
              onClick={() => hasMoves && setOpen(on ? -1 : i)}
              onKeyDown={(e) => { if (hasMoves && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(on ? -1 : i); } }}
              role={hasMoves ? "button" : undefined} tabIndex={hasMoves ? 0 : undefined} aria-expanded={hasMoves ? on : undefined}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "11px 0", cursor: hasMoves ? "pointer" : "default" }}
            >
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {hasMoves && <span style={{ color: DTR_INK50, fontSize: 10, width: 12 }}>{on ? "▾" : "▸"}</span>}
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{s.title}</span>
                {isPr && <DashPill c={DTR_GREEN}>▲ PR</DashPill>}
              </div>
              <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_INK50 }}>{dtrDate(s.at)}</span>
              <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_INK50 }}>{s.durationMin ? s.durationMin + " min" : ""}</span>
            </div>
            {on && hasMoves && (
              <div style={{ padding: "0 0 11px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, padding: "0 0 6px", fontFamily: DTR_MONO, fontSize: 7.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DTR_INK50 }}>
                  <span>Move</span><span>Prescribed</span><span>Logged · best</span>
                </div>
                {s.moves.map((m, j) => {
                  const short = m.setsLogged < m.setsPrescribed;
                  return (
                    <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "5px 0", borderTop: "1px solid rgba(242,237,228,0.04)" }}>
                      <span style={{ fontSize: 12.5 }}>{m.name}</span>
                      <span style={{ fontFamily: DTR_MONO, fontSize: 9.5, color: DTR_INK50 }}>{m.setsPrescribed} × {m.target || "—"}</span>
                      <span style={{ fontFamily: DTR_MONO, fontSize: 9.5, color: short ? "#d8a23a" : "rgba(242,237,228,0.85)" }}>{m.setsLogged}/{m.setsPrescribed} sets{m.best ? " · " + m.best : ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Build your week — self-serve training parity (#1618 → website) ─────────
// The mobile builder's core capabilities on the dashboard: starter sessions +
// programs, a custom weekly SESSION (repeatDow moves), a custom N-week PROGRAM
// (this week's pattern replicated — the per-week hand-editor stays a mobile
// strength), and ✦ Draft it for me (POST /api/ai/draft-program, human-in-the-
// loop: nothing persists until Save). All writes go through
// /api/client/self-training, which imports the SAME pure builder modules the
// app uses — one implementation, no drift. Self-serve is the floor; coaching
// stays the pitch (the marketplace leader keeps its pinned spot).
const DTR_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index 0 = Monday (the builder convention)
const DTR_AMBER = "#d8a23a";
const DTR_BUILDER_CAP = 182;

function dtrDayLetters(dows) {
  return (Array.isArray(dows) ? dows : [])
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b)
    .map((d) => DTR_DOW[d].slice(0, 2))
    .join(" ");
}

const DTR_BTN = { fontFamily: DTR_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", color: DTR_INK50, border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" };
const DTR_BTN_ON = { ...DTR_BTN, color: DTR_TEAL, borderColor: DTR_TEAL };
const DTR_CTA = { ...DTR_BTN, background: DTR_TEAL, color: "#08221f", border: 0, padding: "10px 16px", clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" };
const DTR_FIELD = { background: "rgba(242,237,228,0.04)", color: "#f2ede4", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 6, padding: "9px 11px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, outline: "none" };

function dtrEmptyMove() { return { name: "", sets: "3", reps: "8", load: "", seg: "", isSeg: false }; }
function dtrMoveOut(m) {
  return m.isSeg
    ? { name: m.name.trim(), seg: String(m.seg || "").trim() }
    : { name: m.name.trim(), sets: String(m.sets || "").trim(), reps: String(m.reps || "").trim(), load: String(m.load || "").trim(), seg: "" };
}
function dtrMoveValid(m) {
  if (!m.name.trim()) return false;
  return m.isSeg ? !!String(m.seg || "").trim() : (!!String(m.sets || "").trim() && !!String(m.reps || "").trim());
}

function DtrMoveRows({ moves, setMoves }) {
  const upd = (i, patch) => setMoves(moves.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {moves.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={m.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Move (e.g. Back squat · or 10 mi run)" style={{ ...DTR_FIELD, flex: "1 1 180px", minWidth: 0 }} />
          {m.isSeg ? (
            <input value={m.seg} onChange={(e) => upd(i, { seg: e.target.value })} placeholder="Segment · e.g. 10 mi · Z2" style={{ ...DTR_FIELD, flex: "1 1 140px", minWidth: 0 }} />
          ) : (
            <React.Fragment>
              <input value={m.sets} onChange={(e) => upd(i, { sets: e.target.value })} aria-label="Sets" placeholder="Sets" style={{ ...DTR_FIELD, width: 56 }} />
              <input value={m.reps} onChange={(e) => upd(i, { reps: e.target.value })} aria-label="Reps" placeholder="Reps" style={{ ...DTR_FIELD, width: 64 }} />
              <input value={m.load} onChange={(e) => upd(i, { load: e.target.value })} aria-label="Load" placeholder="Load" style={{ ...DTR_FIELD, width: 84 }} />
            </React.Fragment>
          )}
          <button type="button" onClick={() => upd(i, { isSeg: !m.isSeg })} title="Toggle lift ↔ segment" style={m.isSeg ? DTR_BTN_ON : DTR_BTN}>{m.isSeg ? "Segment" : "Lift"}</button>
          <button type="button" onClick={() => setMoves(moves.filter((_, j) => j !== i))} aria-label={"Remove " + (m.name || "move")} style={{ ...DTR_BTN, borderColor: "transparent", color: DTR_INK50 }}>×</button>
        </div>
      ))}
      {moves.length < 20 && <button type="button" onClick={() => setMoves([...moves, dtrEmptyMove()])} style={{ ...DTR_BTN, alignSelf: "flex-start" }}>＋ Add move</button>}
    </div>
  );
}

function DtrDowToggles({ dows, setDows }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {DTR_DOW.map((d, i) => {
        const on = dows.includes(i);
        return (
          <button key={d} type="button" onClick={() => setDows(on ? dows.filter((x) => x !== i) : [...dows, i].sort((a, b) => a - b))} aria-pressed={on} style={on ? DTR_BTN_ON : DTR_BTN}>{d}</button>
        );
      })}
    </div>
  );
}

function DtrBuilder({ self, onChanged }) {
  const templates = (self && self.templates) || { sessions: [], programs: [] };
  const mine = (self && self.mine) || [];
  const [mode, setMode] = React.useState("starters"); // starters | session | program | draft
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  // Shared weekly pattern (SESSION + custom PROGRAM reuse it).
  const [name, setName] = React.useState("");
  const [dows, setDows] = React.useState([0, 2, 4]);
  const [moves, setMoves] = React.useState([dtrEmptyMove()]);
  const [editId, setEditId] = React.useState(null);
  // PROGRAM extras.
  const [weeksN, setWeeksN] = React.useState(8);
  const [startISO, setStartISO] = React.useState(dtrIso(new Date()));
  // Starter-program pick.
  const [starterId, setStarterId] = React.useState(null);
  const [starterWeeks, setStarterWeeks] = React.useState(8);
  // ✦ Draft.
  const [draftGoal, setDraftGoal] = React.useState("");
  const [draftWeeks, setDraftWeeks] = React.useState(8);
  const [draftDays, setDraftDays] = React.useState(4);
  const [draft, setDraft] = React.useState(null); // the reviewed program
  const [draftState, setDraftState] = React.useState("idle"); // idle | drafting | unavailable

  const post = async (payload, savedMsg) => {
    setBusy(true); setErr(null); setNotice(null);
    try {
      const res = await fetch("/api/client/self-training", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr((data && data.error) || "Could not save — try again."); return null; }
      if (savedMsg) setNotice(savedMsg);
      if (onChanged) onChanged();
      return data;
    } catch (e) { setErr("Could not save — try again."); return null; }
    finally { setBusy(false); }
  };

  const movesOk = moves.length > 0 && moves.every(dtrMoveValid);
  const saveSession = () => {
    if (!name.trim()) { setErr("Name the session."); return; }
    if (!dows.length) { setErr("Pick at least one weekday."); return; }
    if (!movesOk) { setErr("Every move needs a name plus sets × reps (or a segment)."); return; }
    post({ action: "session", name: name.trim(), repeatDow: dows, moves: moves.map(dtrMoveOut), editId: editId || undefined },
      editId ? "Session updated." : "Session saved — it repeats weekly.").then((d) => { if (d) { setEditId(null); setName(""); setMoves([dtrEmptyMove()]); } });
  };

  // Custom PROGRAM = this weekly pattern replicated across N weeks (the
  // per-week hand-editor is the mobile builder's; ✦ Draft covers varied weeks
  // here). The cap gate BLOCKS the save honestly — it never truncates.
  const programRows = weeksN * dows.length;
  const programFits = weeksN >= 1 && weeksN <= 26 && dows.length >= 1 && programRows <= DTR_BUILDER_CAP;
  const saveProgram = () => {
    if (!name.trim()) { setErr("Name the program."); return; }
    if (!movesOk) { setErr("Every move needs a name plus sets × reps (or a segment)."); return; }
    if (!programFits) { setErr("That's more than the " + DTR_BUILDER_CAP + "-session cap — shorten the block."); return; }
    const weeks = Array.from({ length: weeksN }, (_, i) => ({
      week: i + 1,
      days: dows.map((dow) => ({ dow, title: name.trim(), moves: moves.map(dtrMoveOut) })),
    }));
    post({ action: "program", name: name.trim(), weeks, startISO }, "Program saved — " + programRows + " sessions on the calendar.")
      .then((d) => { if (d) { setName(""); setMoves([dtrEmptyMove()]); } });
  };

  const runDraft = async () => {
    if (!draftGoal.trim()) { setErr("Describe the goal — e.g. \"first marathon in October, 4 days a week\"."); return; }
    setErr(null); setDraft(null); setDraftState("drafting");
    try {
      const res = await fetch("/api/ai/draft-program", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: draftGoal.trim(), weeks: draftWeeks, daysPerWeek: draftDays }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.program && Array.isArray(data.program.weeks) && data.program.weeks.length) { setDraft(data.program); setDraftState("idle"); }
      else setDraftState("unavailable");
    } catch (e) { setDraftState("unavailable"); }
  };
  const saveDraft = () => {
    if (!draft) return;
    post({ action: "program", name: draft.name || draftGoal.trim().slice(0, 80) || "Your program", weeks: draft.weeks, startISO },
      "Program saved — it lands on your week.").then((d) => { if (d) { setDraft(null); setDraftGoal(""); } });
  };

  const removeOne = async (row) => {
    const ok = window.ShapeConfirm && window.ShapeConfirm.open
      ? await window.ShapeConfirm.open({ title: "Remove this session?", name: row.title, message: "It comes off your week. This can't be undone.", confirmLabel: "Remove" })
      : window.confirm("Remove " + row.title + "?");
    if (ok) post({ action: "remove", id: row.id }, "Removed.");
  };
  const removeProgram = async (p) => {
    const ok = window.ShapeConfirm && window.ShapeConfirm.open
      ? await window.ShapeConfirm.open({ title: "Remove this program?", name: p.name, message: "Every remaining session of it comes off the calendar. This can't be undone.", confirmLabel: "Remove program" })
      : window.confirm("Remove the whole program " + p.name + "?");
    if (ok) post({ action: "removeProgram", programId: p.id }, "Program removed.");
  };

  // Yours — group the member's self rows for the manage list.
  const yours = React.useMemo(() => {
    const progs = new Map();
    const repeats = [];
    let oneOffs = 0;
    for (const r of mine) {
      if (r.program && r.program.id) {
        const g = progs.get(r.program.id) || { id: r.program.id, name: r.program.name || r.title, weeks: r.program.weeks || null, count: 0 };
        g.count += 1; progs.set(r.program.id, g);
      } else if (Array.isArray(r.repeatDow) && r.repeatDow.length) repeats.push(r);
      else oneOffs += 1;
    }
    return { programs: [...progs.values()], repeats, oneOffs };
  }, [mine]);

  const seg = (id, label) => (
    <button type="button" onClick={() => { setMode(id); setErr(null); setNotice(null); }} aria-pressed={mode === id} style={mode === id ? DTR_BTN_ON : DTR_BTN}>{label}</button>
  );

  return (
    <div className="dash-plate dash-plate--tick" style={{ "--dac": DTR_TEAL, paddingLeft: 24 }}>
      <div className="dash-eyebrow" style={{ color: DTR_TEAL }}>Build your week · self-serve training</div>
      <div style={{ fontSize: 12.5, color: DTR_INK50, lineHeight: 1.55, margin: "8px 0 12px", maxWidth: 560 }}>
        A coach writes this <em>for</em> you — until then, build your own. Starter templates, a custom week, or ✦ a drafted program you approve before it lands. <a href="Marketplace.html" style={{ color: DTR_TEAL, textDecoration: "none" }}>Find a coach →</a>
      </div>

      {(yours.programs.length > 0 || yours.repeats.length > 0 || yours.oneOffs > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DTR_INK50, marginBottom: 6 }}>Yours · programmed by you</div>
          {yours.programs.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{p.name}</span>
              <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_INK50 }}>{p.count} sessions{p.weeks ? " · " + p.weeks + " wks" : ""}</span>
              <button type="button" onClick={() => removeProgram(p)} disabled={busy} style={{ ...DTR_BTN, color: DTR_RUST, borderColor: "rgba(192,83,59,0.4)" }}>Remove</button>
            </div>
          ))}
          {yours.repeats.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{r.title}</span>
              <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_INK50 }}>{dtrDayLetters(r.repeatDow)} · weekly</span>
              <button type="button" onClick={() => { setMode("session"); setEditId(r.id); setName(r.title); setDows(r.repeatDow.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)); setErr(null); setNotice("Editing " + r.title + " — save to replace it."); }} style={DTR_BTN}>Edit</button>
              <button type="button" onClick={() => removeOne(r)} disabled={busy} style={{ ...DTR_BTN, color: DTR_RUST, borderColor: "rgba(192,83,59,0.4)" }}>Remove</button>
            </div>
          ))}
          {yours.oneOffs > 0 && <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DTR_INK50, padding: "7px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>+ {yours.oneOffs} dated one-off{yours.oneOffs === 1 ? "" : "s"}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {seg("starters", "Starters")}
        {seg("session", "Custom session")}
        {seg("program", "Custom program")}
        {seg("draft", "✦ Draft it for me")}
      </div>

      {mode === "starters" && (
        <div>
          <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DTR_INK50, marginBottom: 6 }}>Sessions · repeat weekly</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {templates.sessions.map((s) => (
              <button key={s.id} type="button" style={DTR_BTN} onClick={() => {
                setMode("session"); setEditId(null); setName(s.name);
                setMoves((s.moves || []).map((m) => ({ name: m.name || "", sets: m.sets != null ? String(m.sets) : "", reps: m.reps != null ? String(m.reps) : "", load: m.load != null ? String(m.load) : "", seg: m.seg || "", isSeg: !!(m.seg && String(m.seg).length) })));
                setErr(null); setNotice(s.name + " loaded — pick the weekdays and save.");
              }}>{s.name}</button>
            ))}
          </div>
          <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DTR_INK50, marginBottom: 6 }}>Programs · race &amp; block schedules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.programs.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setStarterId(starterId === p.id ? null : p.id); setStarterWeeks(p.defaultWeeks); setErr(null); }} aria-pressed={starterId === p.id} style={starterId === p.id ? DTR_BTN_ON : DTR_BTN}>{p.name}</button>
                <span style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50 }}>{p.defaultWeeks} wks · {p.daysPerWeek}d/wk</span>
                {starterId === p.id && (
                  <React.Fragment>
                    <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Weeks
                      <input type="number" min="1" max="26" value={starterWeeks} onChange={(e) => setStarterWeeks(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} style={{ ...DTR_FIELD, width: 60 }} />
                    </label>
                    <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Start
                      <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} style={{ ...DTR_FIELD, width: 140 }} />
                    </label>
                    <button type="button" disabled={busy} onClick={() => post({ action: "starter_program", id: p.id, weeks: starterWeeks, startISO }, p.name + " scheduled — it lands on your calendar.").then((d) => { if (d) setStarterId(null); })} style={DTR_CTA}>{busy ? "Saving…" : "Start this plan"}</button>
                  </React.Fragment>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(mode === "session" || mode === "program") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "session" ? "Session name · e.g. Upper day" : "Program name · e.g. Fall strength block"} style={{ ...DTR_FIELD, maxWidth: 340 }} />
          <DtrDowToggles dows={dows} setDows={setDows} />
          <DtrMoveRows moves={moves} setMoves={setMoves} />
          {mode === "program" && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Weeks
                <input type="number" min="1" max="26" value={weeksN} onChange={(e) => setWeeksN(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} style={{ ...DTR_FIELD, width: 60 }} />
              </label>
              <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Start
                <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} style={{ ...DTR_FIELD, width: 140 }} />
              </label>
              <span style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: programFits ? DTR_INK50 : DTR_RUST }}>{programRows} sessions{programFits ? "" : " · over the " + DTR_BUILDER_CAP + " cap"}</span>
            </div>
          )}
          <div>
            <button type="button" disabled={busy} onClick={mode === "session" ? saveSession : saveProgram} style={DTR_CTA}>
              {busy ? "Saving…" : mode === "session" ? (editId ? "Save changes" : "Save · repeats weekly") : "Save program"}
            </button>
            {editId && <button type="button" onClick={() => { setEditId(null); setName(""); setMoves([dtrEmptyMove()]); setNotice(null); }} style={{ ...DTR_BTN, marginLeft: 10 }}>Cancel edit</button>}
          </div>
        </div>
      )}

      {mode === "draft" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={draftGoal} onChange={(e) => setDraftGoal(e.target.value)} placeholder={"The goal · e.g. \"first half-marathon in 12 weeks, 4 days a week\""} style={{ ...DTR_FIELD, maxWidth: 480 }} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Weeks
              <input type="number" min="1" max="26" value={draftWeeks} onChange={(e) => setDraftWeeks(Math.max(1, Math.min(26, Number(e.target.value) || 1)))} style={{ ...DTR_FIELD, width: 60 }} />
            </label>
            <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Days/wk
              <input type="number" min="1" max="7" value={draftDays} onChange={(e) => setDraftDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} style={{ ...DTR_FIELD, width: 56 }} />
            </label>
            <label style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, display: "inline-flex", alignItems: "center", gap: 6 }}>Start
              <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} style={{ ...DTR_FIELD, width: 140 }} />
            </label>
            <button type="button" disabled={draftState === "drafting"} onClick={runDraft} style={DTR_CTA}>{draftState === "drafting" ? "Drafting…" : "✦ Draft it"}</button>
          </div>
          {draftState === "unavailable" && <div style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_AMBER, letterSpacing: "0.06em" }}>The draft assistant is unavailable right now — build it by hand, or try again.</div>}
          {draft && (
            <div style={{ border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{draft.name || "Your program"}</div>
              <div style={{ fontFamily: DTR_MONO, fontSize: 8.5, color: DTR_INK50, letterSpacing: "0.08em", textTransform: "uppercase", margin: "4px 0 8px" }}>
                {draft.weeks.length} weeks · {draft.weeks.reduce((a, w) => a + ((w.days && w.days.length) || 0), 0)} sessions — nothing is saved until you approve
              </div>
              <div style={{ fontSize: 12, color: DTR_INK50, lineHeight: 1.6, maxHeight: 180, overflowY: "auto" }}>
                {draft.weeks.slice(0, 26).map((w) => (
                  <div key={w.week}>W{w.week}: {(w.days || []).map((d) => DTR_DOW[d.dow] + " · " + d.title).join("  ·  ")}</div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" disabled={busy} onClick={saveDraft} style={DTR_CTA}>{busy ? "Saving…" : "Approve & save"}</button>
                <button type="button" onClick={() => setDraft(null)} style={{ ...DTR_BTN, marginLeft: 10 }}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      {(err || notice) && (
        <div style={{ marginTop: 10, fontFamily: DTR_MONO, fontSize: 9, letterSpacing: "0.06em", color: err ? DTR_RUST : DTR_TEAL }} role="status">{err || notice}</div>
      )}
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
function ClientWorkoutsPage() {
  const [plan, setPlan] = React.useState(null);
  const [train, setTrain] = React.useState(null);
  const [dash, setDash] = React.useState(null);
  const [prs, setPrs] = React.useState(null);
  const [source, setSource] = React.useState(null);
  const [selfData, setSelfData] = React.useState(null); // /api/client/self-training (builder)
  const [reloadTick, setReloadTick] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [pl, tr, db, pg, st] = await Promise.all([
        j("/api/client/plan"), j("/api/client/train"), j("/api/client/dashboard"), j("/api/client/progress"), j("/api/client/self-training"),
      ]);
      if (!on) return;
      if (pl && pl.ok) setPlan(pl);
      if (tr && tr.ok) setTrain(tr);
      if (db && db.kpis) setDash(db);
      if (pg && pg.ok) setPrs(pg.prs || []);
      if (st && st.ok) setSelfData(st);
      setSource((pl && pl.ok && pl.training && pl.training.hasPlan) || (tr && tr.ok) ? "live" : "demo");
    })();
    return () => { on = false; };
  }, [reloadTick]);
  const live = source === "live";
  // A builder save/remove re-reads everything — the new rows ride the same
  // plan feed the weeks view renders.
  const reloadAll = React.useCallback(() => setReloadTick((t) => t + 1), []);

  // Completed dates: the dashboard's completed-workout calendar (80 deep).
  const completedDates = React.useMemo(() => {
    if (!live) return DTR_DEMO.completed;
    const s = new Set();
    for (const e of (dash && dash.calendar) || []) {
      if (e.kind === "WORKOUT" && e.at) s.add(String(e.at).slice(0, 10));
    }
    return s;
  }, [live, dash]);

  const coach = live ? ((plan && plan.training && plan.training.coach) || "your coach") : DTR_DEMO.coach;
  const workouts = live ? ((plan && plan.training && plan.training.workouts) || []) : DTR_DEMO.workouts;
  const { weeks, anytime } = dtrBuildWeeks(workouts, completedDates, new Date());
  const tonight = dtrTonight(weeks);
  const stamped = workouts.find((w) => w.template && w.template.name);
  const programName = live ? (stamped ? stamped.template.name : (plan && plan.training && plan.training.hasPlan ? "Assigned program" : null)) : DTR_DEMO.program;
  const currentWeek = weeks.find((w) => w.status === "current");
  const weeksTotal = live
    ? (stamped && stamped.template.week != null ? Math.max(...workouts.filter((w) => w.template).map((w) => w.template.week || 0)) : weeks.length)
    : DTR_DEMO.weeksTotal;
  const lastWeekN = weeks.length && weeks[weeks.length - 1].week != null ? weeks[weeks.length - 1].week : null;

  const history = live ? ((train && train.recentSessions) || []) : DTR_DEMO.history;
  const prDates = React.useMemo(() => {
    const s = new Set();
    for (const p of (live ? prs || [] : [])) if (p.bestAt) s.add(String(p.bestAt).slice(0, 10));
    return s;
  }, [live, prs]);
  const stats = live ? (train && train.stats) || {} : DTR_DEMO.stats;

  const eyebrow = programName
    ? programName.toUpperCase() + (currentWeek && currentWeek.week != null ? " · WEEK " + currentWeek.week + (weeksTotal ? " OF " + weeksTotal : "") : "")
    : "YOUR ASSIGNED PROGRAM";

  // Each card below becomes a draggable/resizable DashGrid widget (role=client, tab=workouts),
  // mirroring the client Score rollout. The DashPage hero (title/subtitle) stays as the page
  // header; only the card stack is gridded. The Tonight session hero is its own full widget;
  // the program by week is one cohesive full widget; consistency + session history pair as halves.
  const widgets = [
    tonight ? { key: "tonight", title: "Tonight's session", size: "full", render: () => (
      <div data-tour="hero-workouts" className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DTR_RUST, paddingLeft: 24 }}>
        <DashWorkoutCard workout={{ ...dtrToCard(tonight.day.workout, coach), time: tonight.when === "Tonight" ? dtrToCard(tonight.day.workout, coach).time : tonight.when }} interactive={false} maxRows={99} />
      </div>
    ) } : null,

    { key: "program", title: "The program, by week", size: "full", render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {weeks.length === 0 && anytime.length === 0 && (
          <div className="dash-plate dash-plate--tick" style={{ "--dac": DTR_RUST, paddingLeft: 24 }}>
            <div className="dash-eyebrow" style={{ color: DTR_RUST }}>No program assigned yet</div>
            <div style={{ fontSize: 13, color: DTR_INK50, lineHeight: 1.55, marginTop: 8, maxWidth: 480 }}>
              Your trainer assigns the block and it lands here, week by week — ask in chat, or browse the marketplace for a coach.
            </div>
          </div>
        )}
        {weeks.map((w) => (
          <DtrWeekPlate key={w.label} w={w} coach={coach} defaultOpen={w.status === "current"} />
        ))}
        {/* The unwritten NEXT block — always after the assigned weeks (the
            program is never "fully written"; the next one is earned at
            check-in). This is the human-loop sell, kept always-visible. */}
        {weeks.length > 0 && (
          <DtrNextWeekLocked coach={coach} weekN={lastWeekN != null ? lastWeekN + 1 : null} />
        )}
        {anytime.length > 0 && (
          <div className="dash-plate" style={{ "--dac": "rgba(242,237,228,0.35)", paddingLeft: 24 }}>
            <div className="dash-eyebrow">Anytime · unscheduled assignments</div>
            <div style={{ marginTop: 6 }}>
              {anytime.map((w, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)", alignItems: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{w.title}</span>
                  <span style={{ fontFamily: DTR_MONO, fontSize: 9, color: DTR_INK50 }}>{(w.exercises || []).length} moves</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) },

    // Self-serve builder — renders only for an authenticated member (the GET
    // 401s signed-out); coach-assigned weeks above always win the page lead.
    selfData && selfData.ok ? { key: "builder", title: "Build your week", size: "full", render: () => (
      <DtrBuilder self={selfData} onChanged={reloadAll} />
    ) } : null,

    { key: "consistency", title: "Consistency", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick" style={{ "--dac": DTR_GREEN, paddingLeft: 24 }}>
        <div className="dash-eyebrow" style={{ color: DTR_GREEN }}>Consistency · streaks &amp; wins</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
          {[[stats.thisWeekCount ?? "—", "This week"], [stats.completedCount ?? "—", "All-time sessions"], [stats.volume7dLb != null ? Math.round(stats.volume7dLb / 1000) + "k lb" : "—", "7-day volume"]].map(([k, l], i) => (
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: DTR_MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: DTR_INK50, marginTop: 5 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ) },

    { key: "history", title: "Session history", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DTR_RUST, paddingLeft: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span className="dash-eyebrow" style={{ color: DTR_RUST }}>Session history · logged vs prescribed</span>
          <a href="ClientProgress.html" style={{ fontFamily: DTR_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: DTR_INK50, textDecoration: "none" }}>PR history →</a>
        </div>
        <div className="dash-ledger" style={{ "--dac": DTR_RUST, marginTop: 9 }} />
        <DtrHistory sessions={history} prDates={prDates} />
      </div>
    ) },
  ].filter(Boolean);

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        navItems={clientNavItems("workouts")}
        payoutCard={clientPayoutCard}
        eyebrow={eyebrow}
        title="Workouts"
        subtitle={"The whole program, week by week — what's done, what's tonight, and what " + coach + " writes next. Log sessions in the app; sets sync here."}
      >
        <DashGrid role="client" tab="workouts" widgets={widgets} />
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { ClientWorkoutsPage, dtrBuildWeeks });
