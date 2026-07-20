// Progress v2 — ClientProgress.html migrated onto the dashboard kit
// (dashboard-v2 spec step). Leads with COMPARISONS, not tables: "8 weeks ago
// vs today" for weight, measurements, and photos side-by-side. Below: the
// weight chart (trend switcher kept from the old page), PR history, and the
// milestone timeline (earned ✓ → what's next ○, goal paces included via
// DashSignals.buildMilestones).
//
// FRAMING RULE: no bare adherence percentages anywhere on the client side —
// consistency reads as streaks and wins. (The old Insights card's
// "82% workout adherence" grid is gone; the consistency strip replaces it.)
// This page is motivation, not administration — but the weekly CHECK-IN KIT
// stays (migrated intact below the fold): it's the ritual that feeds every
// comparison above it.
//
// Data (all cookie APIs the old page already used): /api/client/progress
// (dated weight/body-fat series + PRs), /api/client/checkin-kit
// (measurements + this week's check-in), /api/client/progress-photos, and
// /api/client/dashboard (streak · totals · goals → the milestone feed).
//
// Load order: pageShell → trainerDashboard → clientNav → dashSignals.js →
// dashToday.jsx (DashDemoBand) → this file.

const DPR_INK50 = "rgba(242,237,228,0.55)";
const DPR_MONO = "'JetBrains Mono', monospace";
const DPR_TEAL = "#2ee0c4";
const DPR_GREEN = "#7bbf5a";
const DPR_AMBER = "#d8a23a";
const DPR_DAY = 86400000;

function dprIso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dprAgo(days) { return dprIso(new Date(Date.now() - days * DPR_DAY)); }
function dprDate(v) {
  if (!v) return "";
  try { return new Date(String(v).length === 10 ? v + "T00:00:00" : v).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return ""; }
}
function dprWeeksBetween(a, b) {
  try { return Math.round((new Date(String(b).slice(0, 10) + "T00:00:00") - new Date(String(a).slice(0, 10) + "T00:00:00")) / (7 * DPR_DAY)); } catch (e) { return null; }
}

// ── Comparison core: latest point vs the point nearest 8 weeks before it ────
// Returns null when there's nothing honest to compare (one point, or the
// series spans under 2 weeks) — the UI says so instead of inventing a "then".
const DPR_COMPARE_WEEKS = 8;
function dprCompare(series) {
  const pts = (Array.isArray(series) ? series : [])
    .map((p) => ({ on: String(p.date || p.on || p.measured_on || p.week_of || "").slice(0, 10), value: Number(p.value != null ? p.value : p.weight) }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.on) && isFinite(p.value))
    .sort((a, b) => a.on.localeCompare(b.on));
  if (pts.length < 2) return null;
  const now = pts[pts.length - 1];
  const targetMs = new Date(now.on + "T00:00:00").getTime() - DPR_COMPARE_WEEKS * 7 * DPR_DAY;
  let then = pts[0];
  for (const p of pts.slice(0, -1)) {
    if (Math.abs(new Date(p.on + "T00:00:00").getTime() - targetMs) < Math.abs(new Date(then.on + "T00:00:00").getTime() - targetMs)) then = p;
  }
  const weeks = dprWeeksBetween(then.on, now.on);
  if (weeks == null || weeks < 2) return null;
  return { then, now, weeks, delta: Math.round((now.value - then.value) * 10) / 10 };
}
function dprThenLabel(cmp) {
  return cmp.weeks === DPR_COMPARE_WEEKS ? "8 weeks ago" : cmp.weeks + " weeks ago";
}

// ── Demo dataset (signed out / API down) — dated so the comparisons work ────
const DPR_DEMO = (() => {
  const weights = [184, 183, 184, 182, 181, 181, 180, 179, 178, 178, 177, 177, 176, 175, 176, 174, 173, 173, 172, 171];
  const weightSeries = weights.map((v, i) => ({ date: dprAgo(7 * (weights.length - 1 - i)), value: v }));
  return {
    weightSeries,
    series: {
      weight: weightSeries,
      bodyFat: [26.4, 25.8, 25.3, 24.8, 24.4, 23.8, 23.3, 22.8, 22.4, 22.1].map((v, i, a) => ({ date: dprAgo(14 * (a.length - 1 - i)), value: v })),
      strength: [205, 215, 225, 230, 235, 245, 250, 255, 260, 265].map((v, i, a) => ({ date: dprAgo(14 * (a.length - 1 - i)), value: v })),
      sleep: [6.4, 6.8, 7.0, 7.2, 7.1, 7.3, 7.4, 7.2, 7.4, 7.5].map((v, i, a) => ({ date: dprAgo(14 * (a.length - 1 - i)), value: v })),
    },
    prs: [
      { move: "Back squat", best: 265, bestReps: 5, unit: "lb", bestAt: dprAgo(12) },
      { move: "Deadlift", best: 345, bestReps: 2, unit: "lb", bestAt: dprAgo(26) },
      { move: "Bench press", best: 200, bestReps: 3, unit: "lb", bestAt: dprAgo(40) },
      { move: "Overhead press", best: 135, bestReps: 5, unit: "lb", bestAt: dprAgo(61) },
    ],
    lifts: [
      { name: "Back squat", currentE1rm: 298, bestE1rm: 298, status: "progressing", unit: "lb", topSet: { load: 265, reps: 5 }, series: [255, 262, 270, 278, 285, 290, 298].map((v, i, a) => ({ date: dprAgo(7 * (a.length - 1 - i)), e1rm: v })) },
      { name: "Bench press", currentE1rm: 218, bestE1rm: 222, status: "holding", unit: "lb", topSet: { load: 200, reps: 3 }, series: [210, 214, 222, 219, 216, 220, 218].map((v, i, a) => ({ date: dprAgo(7 * (a.length - 1 - i)), e1rm: v })) },
      { name: "Deadlift", currentE1rm: 366, bestE1rm: 372, status: "stalled", unit: "lb", topSet: { load: 345, reps: 2 }, series: [372, 370, 368, 366, 367, 365, 366].map((v, i, a) => ({ date: dprAgo(7 * (a.length - 1 - i)), e1rm: v })) },
      { name: "Overhead press", currentE1rm: 152, bestE1rm: 152, status: "building", unit: "lb", topSet: { load: 135, reps: 5 }, series: [148, 152].map((v, i, a) => ({ date: dprAgo(7 * (a.length - 1 - i)), e1rm: v })) },
    ],
    measurements: [
      { site: "waist", unit: "cm", series: [{ on: dprAgo(56), value: 88 }, { on: dprAgo(28), value: 86 }, { on: dprAgo(2), value: 84 }] },
      { site: "chest", unit: "cm", series: [{ on: dprAgo(56), value: 104 }, { on: dprAgo(2), value: 103 }] },
      { site: "hips", unit: "cm", series: [{ on: dprAgo(56), value: 100 }, { on: dprAgo(2), value: 97.5 }] },
    ],
    photoPair: { pose: "front", then: { on: dprAgo(57) }, now: { on: dprAgo(1) } }, // placeholder tiles (demo)
    kpis: { streak: 14, workoutsThisWeek: 4, totalWorkouts: 86 },
  };
})();

const DPR_TREND_TABS = [
  { k: "weight", label: "Weight", unit: "lb", color: "#0ac5a8", fmt: (v) => Math.round(v) },
  { k: "bodyFat", label: "Body fat", unit: "%", color: "#7ed4ff", fmt: (v) => v.toFixed(1) },
  { k: "strength", label: "Strength", unit: "lb", color: "#e8b14a", fmt: (v) => Math.round(v) },
  { k: "restingHr", label: "Resting HR", unit: "bpm", color: "#d2693f", fmt: (v) => Math.round(v) },
  { k: "sleep", label: "Sleep", unit: "h", color: "#a86bc4", fmt: (v) => v.toFixed(1) },
  { k: "hrv", label: "HRV", unit: "ms", color: "#9be3a8", fmt: (v) => Math.round(v) },
  { k: "volume", label: "Volume", unit: "min/d", color: "#f5a0c8", fmt: (v) => Math.round(v) },
  { k: "protein", label: "Protein", unit: "g", color: "#ffb46b", fmt: (v) => Math.round(v) },
  { k: "hydration", label: "Hydration", unit: "L", color: "#6ec8ff", fmt: (v) => v.toFixed(1) },
];

// Big trend chart — migrated from the old page.
function DprChart({ points, height = 180, color = DPR_TEAL, gradId = "g" }) {
  const W = 1000, H = height, pad = 24;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const path = points.map((v, i) => {
    const x = pad + i * step;
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = path + ` L${pad + (points.length - 1) * step},${H - pad} L${pad},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={pad} x2={W - pad} y1={pad + t * (H - pad * 2)} y2={pad + t * (H - pad * 2)} stroke="rgba(242,237,228,0.06)" />
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ── Strength / e1RM progression (web mirror of the mobile Strength page) ──
const DPR_STR_STATUS = {
  progressing: { c: DPR_GREEN, label: "Progressing" },
  holding: { c: DPR_TEAL, label: "Holding" },
  stalled: { c: DPR_AMBER, label: "Stalled" },
  building: { c: DPR_INK50, label: "Building" },
};
// Tiny e1RM trend line for a per-lift row.
function DprSpark({ points, color = DPR_TEAL }) {
  const pts = (points || []).map(Number).filter((v) => isFinite(v));
  if (pts.length < 2) return null;
  const W = 72, H = 24, pad = 2;
  const max = Math.max(...pts), min = Math.min(...pts), range = max - min || 1;
  const step = (W - pad * 2) / (pts.length - 1);
  const d = pts.map((v, i) => (i ? "L" : "M") + (pad + i * step).toFixed(1) + "," + (H - pad - ((v - min) / range) * (H - pad * 2)).toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Comparison strip pieces ──────────────────────────────────────────────────
function DprThenNow({ then, now, unit, fmt }) {
  const f = fmt || ((v) => Math.round(v * 10) / 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div>
        <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", color: "rgba(242,237,228,0.6)" }}>{f(then.value)}<span style={{ fontSize: 12, color: DPR_INK50 }}> {unit}</span></div>
        <div style={{ fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DPR_INK50, marginTop: 3 }}>{dprDate(then.on)}</div>
      </div>
      <span style={{ color: DPR_INK50, fontSize: 16 }}>→</span>
      <div>
        <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em" }}>{f(now.value)}<span style={{ fontSize: 13, color: DPR_INK50 }}> {unit}</span></div>
        <div style={{ fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DPR_INK50, marginTop: 3 }}>today · {dprDate(now.on)}</div>
      </div>
    </div>
  );
}
function DprDeltaChip({ delta, unit }) {
  if (delta == null) return null;
  const c = delta === 0 ? DPR_INK50 : delta < 0 ? DPR_TEAL : DPR_AMBER;
  return (
    <span style={{ fontFamily: DPR_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: c, background: c + "1a", border: "1px solid " + c + "55", borderLeft: "3px solid " + c, borderRadius: 4, padding: "4px 9px", whiteSpace: "nowrap" }}>
      {delta === 0 ? "held steady" : (delta > 0 ? "+" : "−") + Math.abs(delta) + " " + unit}
    </span>
  );
}
function DprCompareEmpty({ children }) {
  return <div style={{ fontSize: 12.5, color: DPR_INK50, lineHeight: 1.55 }}>{children}</div>;
}

function DprPhotoTile({ url, label, demo }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
          <div style={{ height: 150, borderRadius: 6, border: "1px solid rgba(242,237,228,0.1)", background: `url(${url}) center/cover` }} />
        </a>
      ) : (
        <div style={{ height: 150, borderRadius: 6, border: "1px dashed rgba(242,237,228,0.18)", background: demo ? "repeating-linear-gradient(45deg, rgba(242,237,228,0.05), rgba(242,237,228,0.05) 6px, transparent 6px, transparent 12px)" : "rgba(242,237,228,0.03)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DPR_INK50 }}>{demo ? "demo" : "—"}</div>
      )}
      <div style={{ marginTop: 5, fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DPR_INK50 }}>{label}</div>
    </div>
  );
}

// ── Milestone timeline: earned ✓ above, what's next ○ below ─────────────────
function DprMilestoneTimeline({ rec }) {
  const ms = DashSignals.buildMilestones(rec);
  if (!ms.recent.length && !ms.next.length) {
    return <DprCompareEmpty>Milestones land here as you log — streak landmarks, workout counts, PRs, and goal targets.</DprCompareEmpty>;
  }
  const node = (filled, color) => (
    <span style={{ position: "relative", zIndex: 1, width: 13, height: 13, borderRadius: "50%", flexShrink: 0, background: filled ? color : "#14110e", border: "2px solid " + color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#14110e", fontWeight: 700 }}>{filled ? "✓" : ""}</span>
  );
  return (
    <div style={{ position: "relative", paddingLeft: 2 }}>
      <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 1, background: "rgba(242,237,228,0.12)" }} />
      {ms.recent.map((m, i) => (
        <div key={"r" + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
          {node(true, DPR_GREEN)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{m.label}</span>
          </div>
          <span style={{ fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50 }}>{m.active ? "active" : dprDate(m.hitAt) || "earned"}</span>
        </div>
      ))}
      {ms.next.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0 4px" }}>
          <span style={{ position: "relative", zIndex: 1, width: 13, textAlign: "center", fontFamily: DPR_MONO, fontSize: 9, color: DPR_INK50, background: "#14110e" }}>↓</span>
          <span style={{ fontFamily: DPR_MONO, fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: DPR_INK50 }}>Next up</span>
        </div>
      )}
      {ms.next.map((m, i) => (
        <div key={"n" + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
          {node(false, "rgba(242,237,228,0.4)")}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "rgba(242,237,228,0.85)" }}>{m.label}</span>
            <div style={{ fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.04em", color: DPR_INK50, marginTop: 2 }}>{m.detail}</div>
            {m.progress != null && (
              <div style={{ position: "relative", height: 3, background: "rgba(242,237,228,0.08)", borderRadius: 2, marginTop: 5, maxWidth: 220 }}>
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.round(Math.min(1, m.progress) * 100) + "%", background: DPR_TEAL, borderRadius: 2 }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── THE CHECK-IN KIT (migrated intact — the ritual that feeds the page) ─────
const CK_RATINGS = [
  ["trainingAdherence", "Training adherence", "#d2693f"],
  ["nutritionAdherence", "Nutrition adherence", "#d8b25a"],
  ["sleep", "Sleep quality", "#a86bc4"],
  ["energy", "Energy", "#0ac5a8"],
  ["stress", "Stress · 10 = calm", "#7ed4ff"],
  ["hunger", "Hunger control", "#e8b14a"],
];
const CK_SITES = [["waist", "Waist"], ["hips", "Hips"], ["chest", "Chest"], ["arm", "Upper arm"], ["thigh", "Thigh"], ["calf", "Calf"]];

function DprCheckinForm({ kit, onSaved }) {
  const cur = (kit.checkins || []).find((c) => String(c.week_of) === kit.weekOf);
  const [ratings, setRatings] = React.useState((cur && cur.ratings) || {});
  const [wins, setWins] = React.useState((cur && cur.wins) || "");
  const [struggles, setStruggles] = React.useState((cur && cur.struggles) || "");
  const [question, setQuestion] = React.useState((cur && cur.question) || "");
  const [weight, setWeight] = React.useState(cur && cur.weight != null ? String(cur.weight) : "");
  const [meas, setMeas] = React.useState({});
  const [files, setFiles] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");

  const submit = async () => {
    setBusy(true); setNote("");
    try {
      const measurements = Object.entries(meas).filter(([, v]) => v).map(([site, v]) => ({ site, value: parseFloat(v), unit: "cm" }));
      const res = await fetch("/api/client/checkin-kit", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin", ratings, wins, struggles, question, weight: weight || null, unit: "kg", measurements, date: new Date().toLocaleDateString("en-CA") }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      for (const pose of ["front", "side", "back"]) {
        const f = files[pose];
        if (!f) continue;
        const fd = new FormData();
        fd.append("photo", f); fd.append("pose", pose);
        await fetch("/api/client/progress-photos", { method: "POST", credentials: "same-origin", body: fd }).catch(() => {});
      }
      setNote("Check-in saved — your coach can see it, and the comparisons above just got sharper.");
      onSaved && onSaved();
    } catch (e) {
      setNote(e.message || "Could not save the check-in.");
    } finally { setBusy(false); }
  };

  const taStyle = { width: "100%", boxSizing: "border-box", minHeight: 56, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.04)", color: INK, fontFamily: sans, fontSize: 13, outline: "none", resize: "vertical" };
  const inStyle = { width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.04)", color: INK, fontFamily: serif, fontSize: 16, outline: "none", textAlign: "center" };
  const lbl = { fontFamily: DPR_MONO, fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)", textTransform: "uppercase", marginBottom: 8 };

  return (
    <Card>
      <SectionTitle right={`WEEK OF ${kit.weekOf}`}>Weekly check-in</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px 24px", marginBottom: 16 }}>
        {CK_RATINGS.map(([k, label, c]) => (
          <div key={k}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
              <span style={{ fontFamily: DPR_MONO, fontSize: 11, color: c }}>{ratings[k] || "—"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const v = i + 1; const on = Number(ratings[k]) >= v; const sel = Number(ratings[k]) === v;
                return <button key={v} onClick={() => setRatings((r) => ({ ...r, [k]: v }))} aria-label={label + " " + v} style={{ height: 18, borderRadius: 3, border: `1px solid ${sel ? c : "rgba(242,237,228,0.14)"}`, background: on ? (sel ? c : c + "66") : "transparent", cursor: "pointer", padding: 0 }} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "120px repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={lbl}>Weight (kg)</div>
          <input value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="—" style={inStyle} />
        </div>
        {CK_SITES.map(([site, label]) => (
          <div key={site}>
            <div style={lbl}>{label} (cm)</div>
            <input value={meas[site] || ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setMeas((m) => ({ ...m, [site]: v })); }} placeholder="—" style={inStyle} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {["front", "side", "back"].map((pose) => (
          <label key={pose} style={{ cursor: "pointer" }}>
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) setFiles((p) => ({ ...p, [pose]: f })); }} />
            <div style={{ padding: "14px 10px", textAlign: "center", borderRadius: 10, border: `1px ${files[pose] ? "solid #0ac5a8" : "dashed rgba(242,237,228,0.18)"}`, fontFamily: DPR_MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: files[pose] ? "#0ac5a8" : "rgba(242,237,228,0.5)" }}>
              {files[pose] ? `✓ ${pose} attached` : `＋ ${pose} photo`}
            </div>
          </label>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div><div style={lbl}>Wins</div><textarea value={wins} onChange={(e) => setWins(e.target.value)} style={taStyle} /></div>
        <div><div style={lbl}>Struggles</div><textarea value={struggles} onChange={(e) => setStruggles(e.target.value)} style={taStyle} /></div>
        <div><div style={lbl}>Question for your coach</div><textarea value={question} onChange={(e) => setQuestion(e.target.value)} style={taStyle} /></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={submit} disabled={busy} style={{ background: "#0ac5a8", color: "#1a1612", border: 0, padding: "11px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: busy ? "wait" : "pointer" }}>{busy ? "Saving…" : "Send check-in →"}</button>
        {note && <span style={{ fontFamily: DPR_MONO, fontSize: 10.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.65)" }}>{note}</span>}
      </div>
    </Card>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
// ── THE CYCLE — member card + calendar + opt-in/out (spec 2026-07-19) ────────
// Web parity of the mobile Progress card + calendar. Reads/writes cycle_events
// + the GUC-gated settings RPCs directly via window.shapeDb.client (owner RLS —
// a direct settings write would RAISE, correctly; only cycle_events is a plain
// owner upsert/delete). Phase derivation is the ONE canonical engine
// (window.ShapeCycleLib.bsDeriveCycle). English-only (the website isn't
// localized). Doctrine: verbatim disclaimer (ONE constant), absence-not-a-
// padlock (signed-out/pre-migration → nothing), no points, confirm-gated deletes.
const DPR_CYCLE_DISCLAIMER = "The Cycle is for training and recovery context only. It is not medical advice, not a diagnostic tool, and must never be used for contraception or fertility planning. Predictions are estimates from the dates you log.";
const DPR_CYCLE_HEAT = "#34d6c5"; // house teal (line-only) — deliberately NOT pink; the spec names no cycle colour and a pink would gender the surface.
function dprCycleShortDate(isoStr) {
  try {
    const d = new Date(`${String(isoStr).slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) return String(isoStr);
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  } catch (e) { return String(isoStr); }
}
function DprCycleCard() {
  const client = (typeof window !== "undefined" && window.shapeDb && window.shapeDb.client) || null;
  const lib = (typeof window !== "undefined" && window.ShapeCycleLib) || null;
  const [uid, setUid] = React.useState(null);
  const [settings, setSettings] = React.useState(undefined); // undefined=loading | {optIn,share}
  const [starts, setStarts] = React.useState([]);
  const [unavailable, setUnavailable] = React.useState(false); // RPC pre-migration
  const [calOpen, setCalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const now0 = new Date();
  const [view, setView] = React.useState({ y: now0.getFullYear(), m: now0.getMonth() });
  const [optimistic, setOptimistic] = React.useState({});

  const load = React.useCallback(async () => {
    if (!client) { setSettings({ optIn: false, share: false }); setStarts([]); return; }
    let id = null;
    try { const { data } = await client.auth.getUser(); id = data && data.user && data.user.id; } catch (e) {}
    setUid(id || null);
    if (!id) { setSettings({ optIn: false, share: false }); setStarts([]); return; }
    let s = { optIn: false, share: false };
    try {
      const { data } = await client.from("user_goals").select("data").eq("user_id", id).eq("kind", "cycle_settings").maybeSingle();
      if (data && data.data) s = { optIn: !!data.data.optIn, share: !!data.data.share };
    } catch (e) {}
    setSettings(s);
    if (s.optIn) {
      try {
        const { data } = await client.from("cycle_events").select("event_date").eq("user_id", id).eq("kind", "period_start").order("event_date", { ascending: false }).limit(60);
        setStarts((data || []).map((r) => r.event_date));
      } catch (e) { setStarts([]); }
    } else setStarts([]);
  }, [client]);
  React.useEffect(() => { load(); }, [load]);

  const startSet = React.useMemo(() => {
    const set = new Set((starts || []).map(String));
    Object.entries(optimistic).forEach(([iso, on]) => { if (on) set.add(iso); else set.delete(iso); });
    return set;
  }, [starts, optimistic]);
  const startList = React.useMemo(() => Array.from(startSet).sort().reverse(), [startSet]);
  const cycle = (lib && lib.bsDeriveCycle && settings && settings.optIn)
    ? (() => { try { return lib.bsDeriveCycle(startList, new Date()); } catch (e) { return null; } })() : null;

  const confirm = (opts) => (window.ShapeConfirm && window.ShapeConfirm.open) ? window.ShapeConfirm.open(opts) : Promise.resolve(false);
  const setSharePref = async (optIn, share, consentKind) => {
    if (!client) return { unavailable: true };
    try {
      const { error } = await client.rpc("cycle_set_settings", { p_opt_in: !!optIn, p_share: !!share, p_consent_kind: consentKind, p_granted: !!(consentKind === "cycle_tracking" ? optIn : share), p_consent_text: DPR_CYCLE_DISCLAIMER });
      if (error) {
        const m = String(error.message || "");
        if (m.includes("cycle_set_settings") || error.code === "PGRST202" || error.code === "42883") return { unavailable: true };
        return { error: true };
      }
      return { ok: true };
    } catch (e) { return { error: true }; }
  };
  const startTracking = async () => {
    if (!client || busy) return;
    setBusy(true); setMsg(null);
    const r = await setSharePref(true, false, "cycle_tracking");
    if (r.unavailable) setUnavailable(true); else if (r.error) setMsg("That didn't save. Try again."); else await load();
    setBusy(false);
  };
  const toggleShare = async () => {
    if (!client || busy || !settings) return;
    setBusy(true); setMsg(null);
    const r = await setSharePref(true, !settings.share, "cycle_coach_share");
    if (r.unavailable) setUnavailable(true); else if (r.error) setMsg("That didn't save. Try again."); else await load();
    setBusy(false);
  };
  const stopDelete = async () => {
    if (!client || busy) return;
    const ok = await confirm({ title: "Stop & delete?", message: "This turns off cycle tracking and permanently deletes every date you've logged.", confirmLabel: "Stop & delete" });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await client.rpc("cycle_opt_out");
      if (error) setMsg("That didn't save. Try again."); else { setCalOpen(false); setOptimistic({}); setStarts([]); await load(); }
    } catch (e) { setMsg("That didn't save. Try again."); }
    setBusy(false);
  };
  const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tapDay = async (d) => {
    if (!client || busy || !uid) return;
    const iso = isoOf(view.y, view.m, d);
    const logged = startSet.has(iso);
    if (logged) {
      const ok = await confirm({ title: "Remove this date?", message: "This removes the period start you logged on this day.", confirmLabel: "Remove" });
      if (!ok) return;
      setBusy(true); setMsg(null); setOptimistic((o) => ({ ...o, [iso]: false }));
      let err = null;
      try { const r = await client.from("cycle_events").delete().eq("user_id", uid).eq("event_date", iso).eq("kind", "period_start"); err = r.error; } catch (e) { err = e; }
      setBusy(false); setOptimistic((o) => { const n = { ...o }; delete n[iso]; return n; });
      if (err) { setMsg("That didn't save. Try again."); return; }
      await load(); return;
    }
    setBusy(true); setMsg(null); setOptimistic((o) => ({ ...o, [iso]: true }));
    let err = null;
    try { const r = await client.from("cycle_events").upsert({ user_id: uid, event_date: iso, kind: "period_start" }, { onConflict: "user_id,event_date,kind" }); err = r.error; } catch (e) { err = e; }
    setBusy(false); setOptimistic((o) => { const n = { ...o }; delete n[iso]; return n; });
    if (err) { setMsg(String(err.message || "").includes("future_event_date") ? "Can't log a future date." : "That didn't save. Try again."); return; }
    await load();
  };

  if (settings === undefined) return null; // loading — no flash

  const PHASE = { menstrual: "Menstrual", follicular: "Follicular", ovulatory: "Ovulatory", luteal: "Luteal" };
  const eyebrow = <span className="dash-eyebrow" style={{ color: DPR_CYCLE_HEAT }}>The cycle · private to you</span>;

  // ── Opt-in prompt (never opted in) — the ONLY cycle entry on web (no settings page) ──
  if (!settings.optIn) {
    return (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_CYCLE_HEAT, paddingLeft: 24 }}>
        {eyebrow}
        <div style={{ marginTop: 12, fontFamily: "Fraunces, serif", fontSize: 18, letterSpacing: "-0.015em", lineHeight: 1.3 }}>Cycle-aware training & recovery.</div>
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: DPR_INK50 }}>{DPR_CYCLE_DISCLAIMER}</div>
        {unavailable ? (
          <div style={{ marginTop: 12, fontFamily: DPR_MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50 }}>Setup isn't available yet.</div>
        ) : (
          <button type="button" onClick={startTracking} disabled={busy}
            style={{ marginTop: 14, background: DPR_CYCLE_HEAT, color: "#0b0f0f", border: 0, borderRadius: 8, padding: "9px 16px", fontFamily: DPR_MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>Start tracking</button>
        )}
        {msg ? <div style={{ marginTop: 10, fontSize: 12, color: DPR_AMBER }}>{msg}</div> : null}
      </div>
    );
  }

  // ── Opted in — the card (+ calendar toggle + settings) ──
  const cyclesN = Math.max(0, startList.length - 1);
  const head = !cycle ? "Log a period start to begin."
    : cycle.phase === "paused" ? "Cycle running long"
      : cycle.phase === "late" ? `Cycle day ${cycle.day}`
        : `${PHASE[cycle.phase] || ""} · day ${cycle.day}`;
  const conf = cycle ? ({ high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[cycle.confidence] || "") : "";
  const meta = cycle ? [`Your cycle ~${cycle.L} days`, `${cyclesN} cycles of data`, conf].filter(Boolean).join(" · ") : "";
  const pred = cycle && cycle.predictedStart ? cycle.predictedStart : null;

  // calendar cells (Mon-first)
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayIso = isoOf(now0.getFullYear(), now0.getMonth(), now0.getDate());
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const inPred = (iso) => !!(pred && iso >= pred.from && iso <= pred.to);
  const step = (delta) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_CYCLE_HEAT, paddingLeft: 24 }}>
      {eyebrow}
      <div style={{ marginTop: 12, fontFamily: "Fraunces, serif", fontSize: 20, letterSpacing: "-0.015em", lineHeight: 1.25 }}>{head}</div>
      {meta ? <div style={{ marginTop: 5, fontFamily: DPR_MONO, fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DPR_INK50 }}>{meta}</div> : null}
      {pred ? <div style={{ marginTop: 6, fontFamily: DPR_MONO, fontSize: 9.5, letterSpacing: "0.06em", color: DPR_INK50 }}>Next period window · {dprCycleShortDate(pred.from)} – {dprCycleShortDate(pred.to)}</div> : null}
      {cycle && cycle.phase === "luteal" && pred ? <div style={{ marginTop: 7, fontFamily: "Fraunces, serif", fontSize: 13, fontStyle: "italic", color: "rgba(242,237,228,0.7)" }}>Week of the {dprCycleShortDate(pred.from)} is a natural deload window.</div> : null}

      <button type="button" onClick={() => setCalOpen((o) => !o)}
        style={{ marginTop: 14, background: "transparent", border: 0, padding: "6px 0", fontFamily: DPR_MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DPR_CYCLE_HEAT, cursor: "pointer" }}>
        {calOpen ? "Close calendar ▴" : "Open calendar ▾"}
      </button>

      {calOpen ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => step(-1)} style={{ background: "transparent", border: 0, color: DPR_INK50, cursor: "pointer", fontSize: 14, padding: "4px 8px" }}>‹</button>
            <div style={{ fontFamily: DPR_MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{monthName}</div>
            <button type="button" onClick={() => step(1)} style={{ background: "transparent", border: 0, color: DPR_INK50, cursor: "pointer", fontSize: 14, padding: "4px 8px" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontFamily: DPR_MONO, fontSize: 8, color: "rgba(242,237,228,0.4)" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = isoOf(view.y, view.m, d);
              const isStart = startSet.has(iso);
              const isToday = iso === todayIso;
              const isPred = !isStart && inPred(iso);
              return (
                <button key={i} type="button" onClick={() => tapDay(d)} disabled={busy}
                  style={{ aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DPR_MONO, fontSize: 11, fontVariantNumeric: "tabular-nums",
                    background: isStart ? DPR_CYCLE_HEAT : "transparent", color: isStart ? "#0b0f0f" : (isToday ? DPR_CYCLE_HEAT : "rgba(242,237,228,0.75)"),
                    border: isPred ? `1px dotted ${DPR_CYCLE_HEAT}` : (isToday ? `1px solid ${DPR_CYCLE_HEAT}66` : "1px solid transparent"),
                    borderRadius: 7, cursor: busy ? "default" : "pointer" }}>{d}</button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase", color: DPR_INK50 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: DPR_CYCLE_HEAT, verticalAlign: "middle", marginRight: 5 }} />Logged start</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, border: `1px dotted ${DPR_CYCLE_HEAT}`, verticalAlign: "middle", marginRight: 5 }} />Predicted window</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: DPR_INK50, lineHeight: 1.5 }}>Tap any past day to log or remove a period start.</div>
        </div>
      ) : null}

      {msg ? <div style={{ marginTop: 10, fontSize: 12, color: DPR_AMBER }}>{msg}</div> : null}

      {/* Settings footer — share with coaches + stop & delete (the web opt-out entry). */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={toggleShare} disabled={busy}
          style={{ background: "transparent", border: `1px solid ${settings.share ? DPR_CYCLE_HEAT : "rgba(242,237,228,0.25)"}`, color: settings.share ? DPR_CYCLE_HEAT : DPR_INK50, borderRadius: 999, padding: "5px 12px", fontFamily: DPR_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "default" : "pointer" }}>
          {settings.share ? "Shared with coaches ✓" : "Share with coaches"}
        </button>
        <button type="button" onClick={stopDelete} disabled={busy}
          style={{ background: "transparent", border: 0, color: "#c0533b", fontFamily: DPR_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: busy ? "default" : "pointer" }}>Stop &amp; delete</button>
      </div>
    </div>
  );
}
function ClientProgressPage() {
  const [progress, setProgress] = React.useState(null);
  const [kit, setKit] = React.useState(null);
  const [photos, setPhotos] = React.useState(null);
  const [dash, setDash] = React.useState(null);
  const [strength, setStrength] = React.useState(null);
  const [source, setSource] = React.useState(null); // null=loading · 'live' · 'demo'
  const [trend, setTrend] = React.useState("weight");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let on = true;
    const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [pg, ck, ph, db, st] = await Promise.all([
        j("/api/client/progress"), j("/api/client/checkin-kit"), j("/api/client/progress-photos"), j("/api/client/dashboard"), j("/api/client/strength"),
      ]);
      if (!on) return;
      if (pg && pg.ok) setProgress(pg);
      if (ck && ck.ok) setKit(ck);
      if (ph && ph.ok) setPhotos(ph.photos || []);
      if (db && db.kpis) setDash(db);
      if (st && st.ok) setStrength(st);
      setSource((pg && pg.ok) || (db && db.kpis) ? "live" : "demo");
    })();
    return () => { on = false; };
  }, [reloadKey]);
  const live = source === "live";

  // THE CROSSOVER (spec 2026-07-13) — mobile parity: assemble pre-bucketed
  // days from the progress series (trained = workout minutes that day; sleep
  // hours) + the member's work-domain habits, read through the ONE shared
  // implementation (DashSignals.crossoverRead — website, mobile, and tests).
  // Below the module's floors it stays null and the widget never renders —
  // live only, and the copy binds the COMPUTED gap (never a demo figure).
  const [crossover, setCrossover] = React.useState(null);
  React.useEffect(() => {
    if (!live || !progress || !(window.DashSignals && window.DashSignals.crossoverRead)) return;
    let on = true;
    (async () => {
      const hj = await fetch("/api/client/habits", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const habits = ((hj && hj.habits) || []).filter((h) => h && h.domain === "work");
      if (!on || !habits.length) return;
      const volume = (progress.series && Array.isArray(progress.series.volume)) ? progress.series.volume : [];
      const sleep = (progress.series && Array.isArray(progress.series.sleep)) ? progress.series.sleep : [];
      const trainedBy = new Map(volume.map((r) => [r.date, Number(r.value) > 0]));
      const sleepBy = new Map(sleep.map((r) => [r.date, Number(r.value)]));
      const days = [];
      const now = new Date();
      for (let i = 89; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString("en-CA"); // the member's LOCAL day — matches habit done_on + snapshot_date
        const scheduled = habits.filter((h) => String(h.created_at || "").slice(0, 10) <= key).length;
        if (!scheduled) continue;
        const done = habits.reduce((a, h) => a + ((Array.isArray(h.history) && h.history.includes(key)) ? 1 : 0), 0);
        days.push({ d: key, workHabitScheduled: scheduled, workHabitDone: done, trained: !!trainedBy.get(key), sleepHours: sleepBy.has(key) ? sleepBy.get(key) : null });
      }
      const r = window.DashSignals.crossoverRead(days);
      if (on && r && (r.training || r.sleep)) setCrossover(r);
    })();
    return () => { on = false; };
  }, [live, progress]);

  // ── Comparisons (live → honest states; demo dataset signed out) ──
  const weightCmp = live
    ? dprCompare(progress && (progress.weightSeries || (progress.series && progress.series.weight)))
    : dprCompare(DPR_DEMO.weightSeries);
  const measCmps = (() => {
    if (!live) return DPR_DEMO.measurements.map((m) => ({ site: m.site, unit: m.unit, cmp: dprCompare(m.series) })).filter((m) => m.cmp);
    const bySite = new Map();
    ((kit && kit.measurements) || []).forEach((r) => {
      if (!bySite.has(r.site)) bySite.set(r.site, []);
      bySite.get(r.site).push({ on: r.measured_on, value: Number(r.value), unit: r.unit });
    });
    return [...bySite.entries()]
      .map(([site, rows]) => ({ site, unit: (rows[0] && rows[0].unit) || "cm", cmp: dprCompare(rows) }))
      .filter((m) => m.cmp)
      .slice(0, 6);
  })();
  const photoPair = (() => {
    if (!live) return DPR_DEMO.photoPair;
    const rows = (photos || []).slice().sort((a, b) => String(a.taken_on).localeCompare(String(b.taken_on)));
    for (const pose of ["front", "side", "back"]) {
      const ofPose = rows.filter((p) => p.pose === pose);
      if (ofPose.length >= 2) {
        const now = ofPose[ofPose.length - 1];
        const targetMs = new Date(String(now.taken_on).slice(0, 10) + "T00:00:00").getTime() - DPR_COMPARE_WEEKS * 7 * DPR_DAY;
        let then = ofPose[0];
        for (const p of ofPose.slice(0, -1)) {
          if (Math.abs(new Date(String(p.taken_on).slice(0, 10) + "T00:00:00").getTime() - targetMs) < Math.abs(new Date(String(then.taken_on).slice(0, 10) + "T00:00:00").getTime() - targetMs)) then = p;
        }
        if (then !== now) return { pose, then: { on: then.taken_on, url: then.url }, now: { on: now.taken_on, url: now.url } };
      }
    }
    return null;
  })();

  // ── Below-the-fold data ──
  const series = live && progress && progress.series ? progress.series : DPR_DEMO.series;
  const prs = live ? ((progress && progress.prs) || []) : DPR_DEMO.prs;
  const lifts = live ? ((strength && strength.lifts) || []) : DPR_DEMO.lifts;
  const activeTab = DPR_TREND_TABS.find((t) => t.k === trend) || DPR_TREND_TABS[0];
  const activeSeries = (series[activeTab.k] || []).map((s) => Number(s.value)).filter((v) => isFinite(v));
  const latestVal = activeSeries.length ? activeSeries[activeSeries.length - 1] : null;
  const deltaVal = activeSeries.length >= 2 ? latestVal - activeSeries[0] : null;
  const availableTabs = DPR_TREND_TABS.filter((t) => (series[t.k] || []).length >= 2);

  // Consistency = streaks and wins (NEVER a bare adherence percentage).
  const kpis = live && dash ? dash.kpis : DPR_DEMO.kpis;
  const prsThisQuarter = prs.filter((p) => p.bestAt && Date.now() - new Date(p.bestAt).getTime() < 90 * DPR_DAY).length;
  const winStrip = [
    { k: (kpis.streak != null ? kpis.streak : "—") + (kpis.streak != null ? "d" : ""), l: "Current streak" },
    { k: kpis.workoutsThisWeek != null ? kpis.workoutsThisWeek : "—", l: "Workouts this week" },
    { k: prsThisQuarter, l: "PRs this quarter" },
    { k: kpis.totalWorkouts != null ? kpis.totalWorkouts : "—", l: "Workouts all-time" },
  ];

  // Milestone timeline record — live from the dashboard rollup (+ goals with
  // pace via goalsFromDoc); the demo uses the engine's first persona.
  const msRec = live && dash
    ? {
        profile: { id: "me", name: "You" },
        streaks: dash.kpis.streak != null ? { current: dash.kpis.streak, best: dash.kpis.streak } : null,
        totals: dash.kpis.totalWorkouts != null ? { workouts: dash.kpis.totalWorkouts } : null,
        goals: dash.goals ? DashSignals.goalsFromDoc(dash.goals) : null,
        milestones: null, goal: null, weighIns: null,
      }
    : DashSignals.buildMockClients()[0];

  const fmtCmpDelta = (cmp, unit) => cmp ? <DprDeltaChip delta={cmp.delta} unit={unit} /> : null;

  // Each card below becomes a draggable/resizable DashGrid widget (role=client, tab=progress),
  // mirroring the client Score rollout. The DashPage hero (title/subtitle) + the demo band stay
  // outside; only the card stack is gridded. The 8-weeks-ago lead trio sit side-by-side → "half";
  // the consistency KPI strip stays ONE "full" widget; the trend chart + PR history (left column)
  // + milestones (right column) become individual widgets; the check-in kit + photo timeline are
  // conditional fulls.
  const progressWidgets = [
    // THE CROSSOVER — conditional: exists only when the shared read fired
    // (work habits + enough data past the statistical floors). Slate accent
    // (#7aa7dc), the work domain's color.
    crossover ? { key: "crossover", title: "The crossover · work × body", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "#7aa7dc", paddingLeft: 24 }}>
        <span className="dash-eyebrow" style={{ color: "#7aa7dc" }}>The crossover · work × body</span>
        <div style={{ marginTop: 12 }}>
          {/* Words + numbers both from the shared engine (crossoverCopy) —
              the mobile card renders the identical rows, no wording drift. */}
          {(window.DashSignals.crossoverCopy(crossover) || []).map((r, i) => (
            <div key={r.k} style={{ paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0, borderTop: i ? "1px solid rgba(242,237,228,0.08)" : 0 }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 16.5, letterSpacing: "-0.01em", lineHeight: 1.35 }}>{r.text}</div>
              <div style={{ marginTop: 5, fontFamily: DPR_MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50 }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>
    ) } : null,
    // THE CYCLE — member card + calendar + opt-in/out (spec 2026-07-19). Shows
    // for any signed-in member (the opt-in prompt or the card); DprCycleCard
    // self-manages settings/starts + the GUC-gated RPC writes. Absence for the
    // signed-out demo (gated on `live`).
    live ? { key: "cycle", title: "The cycle", size: "half", render: () => <DprCycleCard /> } : null,
    { key: "weight", title: "Weight · then vs today", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_TEAL, paddingLeft: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span className="dash-eyebrow">Weight · {weightCmp ? dprThenLabel(weightCmp) + " vs today" : "the comparison"}</span>
          {fmtCmpDelta(weightCmp, "lb")}
        </div>
        <div style={{ marginTop: 14 }}>
          {weightCmp
            ? <DprThenNow then={weightCmp.then} now={weightCmp.now} unit="lb" fmt={(v) => Math.round(v * 10) / 10} />
            : <DprCompareEmpty>Two weigh-ins at least two weeks apart start this comparison — log one at your weekly check-in below.</DprCompareEmpty>}
        </div>
      </div>
    ) },

    { key: "measurements", title: "Measurements · then vs today", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_AMBER, paddingLeft: 24 }}>
        <span className="dash-eyebrow" style={{ color: DPR_AMBER }}>Measurements · then vs today</span>
        <div style={{ marginTop: 12 }}>
          {measCmps.length ? measCmps.map((m) => (
            <div key={m.site} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
              <span style={{ fontFamily: DPR_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: DPR_INK50 }}>{m.site}</span>
              <span style={{ fontFamily: DPR_MONO, fontSize: 11.5 }}>
                <span style={{ color: DPR_INK50 }}>{m.cmp.then.value}</span> → {m.cmp.now.value} <span style={{ color: DPR_INK50 }}>{m.unit}</span>
              </span>
              <DprDeltaChip delta={m.cmp.delta} unit={m.unit} />
            </div>
          )) : <DprCompareEmpty>Tape numbers compare here once two check-ins carry them — waist, hips, chest, arm, thigh, calf.</DprCompareEmpty>}
        </div>
      </div>
    ) },

    { key: "photos", title: "Photos · then vs today", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "rgba(242,237,228,0.35)", paddingLeft: 24 }}>
        <span className="dash-eyebrow">Photos · {photoPair ? photoPair.pose + " · then vs today" : "side by side"}</span>
        <div style={{ marginTop: 12 }}>
          {photoPair ? (
            <div style={{ display: "flex", gap: 10 }}>
              <DprPhotoTile url={photoPair.then.url} demo={!live} label={dprDate(photoPair.then.on)} />
              <DprPhotoTile url={photoPair.now.url} demo={!live} label={"today · " + dprDate(photoPair.now.on)} />
            </div>
          ) : (
            <DprCompareEmpty>Your second photo set unlocks this — the first one is the hardest, and future-you will want it. Attach them at check-in below.</DprCompareEmpty>
          )}
          <div style={{ fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50, marginTop: 8 }}>Private · you + your coaches</div>
        </div>
      </div>
    ) },

    { key: "consistency", title: "Consistency · streaks & wins", size: "full", render: () => (
      <div className="dash-plate dash-plate--tick" style={{ "--dac": DPR_GREEN, paddingLeft: 24 }}>
        <span className="dash-eyebrow" style={{ color: DPR_GREEN }}>Consistency · streaks &amp; wins</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginTop: 12 }}>
          {winStrip.map((m, i) => (
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1 }}>{m.k}</div>
              <div style={{ fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DPR_INK50, marginTop: 6 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </div>
    ) },

    { key: "trend", title: "Trend", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": activeTab.color, paddingLeft: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="dash-eyebrow" style={{ color: activeTab.color }}>{activeTab.label} · trend</span>
          {latestVal != null && (
            <span style={{ fontFamily: DPR_MONO, fontSize: 10, color: DPR_INK50 }}>
              <span style={{ fontFamily: serif, fontSize: 19, color: activeTab.color }}>{activeTab.fmt(latestVal)}</span> {activeTab.unit}
              {deltaVal != null && " · " + (deltaVal > 0 ? "+" : deltaVal < 0 ? "−" : "") + activeTab.fmt(Math.abs(deltaVal)) + " since start"}
            </span>
          )}
        </div>
        <div className="dash-ledger" style={{ "--dac": activeTab.color, margin: "9px 0 10px" }} />
        {activeSeries.length >= 2 ? (
          <DprChart points={activeSeries} color={activeTab.color} gradId={"g-" + activeTab.k} />
        ) : (
          <div style={{ padding: "40px 4px", textAlign: "center", color: DPR_INK50, fontSize: 13 }}>
            {live ? "Log more " + activeTab.label.toLowerCase() + " data to draw this trend." : "Not enough data yet."}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {(availableTabs.length ? availableTabs : [DPR_TREND_TABS[0]]).map((t) => {
            const on = trend === t.k;
            return (
              <button key={t.k} onClick={() => setTrend(t.k)} style={{ fontFamily: DPR_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 4, cursor: "pointer", background: "transparent", color: on ? t.color : "rgba(242,237,228,0.6)", border: "1px solid " + (on ? t.color + "77" : "rgba(242,237,228,0.14)"), borderLeft: "3px solid " + (on ? t.color : "rgba(242,237,228,0.18)") }}>{t.label}</button>
            );
          })}
        </div>
      </div>
    ) },

    { key: "prs", title: "PR history", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "#c0533b", paddingLeft: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span className="dash-eyebrow" style={{ color: "#c0533b" }}>PR history · from your logged sets</span>
          <span style={{ fontFamily: DPR_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50 }}>{prs.length ? prs.length + " lifts" : ""}</span>
        </div>
        <div className="dash-ledger" style={{ "--dac": "#c0533b", marginTop: 9 }} />
        {prs.length ? prs.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
            <span style={{ color: DPR_GREEN, fontSize: 11 }}>▲</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.move}</div>
              <div style={{ fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50, marginTop: 2 }}>{dprDate(p.bestAt)}{p.e1rm != null ? <span style={{ color: DPR_TEAL }}> · e1RM {Math.round(p.e1rm)}</span> : ""}</div>
            </div>
            <span style={{ fontFamily: serif, fontSize: 18 }}>{Math.round(p.best)} <span style={{ fontSize: 11, color: DPR_INK50 }}>{p.unit}</span></span>
            <span style={{ fontFamily: DPR_MONO, fontSize: 10.5, color: DPR_TEAL }}>{p.bestReps != null ? "× " + p.bestReps : ""}</span>
          </div>
        )) : (
          <div style={{ fontSize: 12.5, color: DPR_INK50, padding: "12px 0" }}>No logged sets yet — your heaviest lifts collect here as you train.</div>
        )}
      </div>
    ) },

    { key: "strength", title: "Strength · e1RM", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_TEAL, paddingLeft: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span className="dash-eyebrow" style={{ color: DPR_TEAL }}>Strength · estimated 1RM</span>
          <span style={{ fontFamily: DPR_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DPR_INK50 }}>{lifts.length ? lifts.length + " lifts" : ""}</span>
        </div>
        <div className="dash-ledger" style={{ "--dac": DPR_TEAL, marginTop: 9 }} />
        {lifts.length ? lifts.map((l, i) => {
          const st = DPR_STR_STATUS[l.status] || DPR_STR_STATUS.building;
          const e1 = l.currentE1rm != null ? Math.round(l.currentE1rm) : null;
          const best = l.bestE1rm != null ? Math.round(l.bestE1rm) : null;
          const trend = (l.series || []).map((s) => Number(s.e1rm));
          const top = l.topSet;
          return (
            <div key={l.name || i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.05)" : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{l.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DPR_MONO, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: st.c, border: "1px solid " + st.c, borderRadius: 999, padding: "2px 7px" }}>{st.label}</span>
                  {top ? <span style={{ fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.04em", textTransform: "uppercase", color: DPR_INK50 }}>top {Math.round(top.load)} {l.unit} × {top.reps}</span> : null}
                </div>
              </div>
              <div style={{ width: 72, opacity: trend.filter((v) => isFinite(v)).length >= 2 ? 1 : 0 }}><DprSpark points={trend} color={st.c} /></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: serif, fontSize: 18, lineHeight: 1 }}>{e1 != null ? e1 : "—"} <span style={{ fontSize: 10, color: DPR_INK50 }}>e1RM</span></div>
                {best != null && e1 != null && best > e1 ? <div style={{ fontFamily: DPR_MONO, fontSize: 8, letterSpacing: "0.04em", textTransform: "uppercase", color: DPR_INK50, marginTop: 2 }}>best {best}</div> : null}
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 12.5, color: DPR_INK50, padding: "12px 0" }}>Log a few sets and your per-lift estimated 1RM, trend, and progression status appear here.</div>
        )}
      </div>
    ) },

    { key: "milestones", title: "Milestones · earned → next", size: "half", render: () => (
      <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DPR_AMBER, paddingLeft: 24 }}>
        <span className="dash-eyebrow" style={{ color: DPR_AMBER }}>Milestones · earned → next</span>
        <div className="dash-ledger" style={{ "--dac": DPR_AMBER, margin: "9px 0 12px" }} />
        <DprMilestoneTimeline rec={msRec} />
      </div>
    ) },

    kit ? { key: "checkin", title: "Weekly check-in", size: "full", render: () => (
      <DprCheckinForm kit={kit} onSaved={() => setReloadKey((k) => k + 1)} />
    ) } : null,

    (live && (photos || []).length > 0) ? { key: "phototimeline", title: "Photo timeline", size: "full", render: () => (
      <Card>
        <SectionTitle right="PRIVATE · YOU + YOUR COACHES">Photo timeline</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          {(photos || []).slice(0, 12).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none" }}>
              <div style={{ height: 120, borderRadius: 10, border: "1px solid rgba(242,237,228,0.1)", background: `url(${p.url}) center/cover` }} />
              <div style={{ marginTop: 5, fontFamily: DPR_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DPR_INK50, textTransform: "uppercase" }}>{p.pose} · {String(p.taken_on).slice(5)}</div>
            </a>
          ))}
        </div>
      </Card>
    ) } : null,
  ].filter(Boolean);

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
      <DashPage
        navItems={clientNavItems("progress")}
        payoutCard={clientPayoutCard}
        eyebrow="EARNED, NOT PROMISED"
        title="Progress"
        subtitle="Eight weeks ago next to today — then the receipts: your weight trend, PR history, and what you've banked."
      >
        <DashGrid role="client" tab="progress" widgets={progressWidgets} />
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { ClientProgressPage, DprMilestoneTimeline, DprChart, DprCheckinForm });
