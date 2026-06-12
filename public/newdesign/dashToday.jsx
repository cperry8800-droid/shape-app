// CoachDashboardPage — the role-parameterized coach Today page (roadmap 2.4).
//
// TrainerDashboard.html and NutritionistDashboard.html were copy-paste twins;
// both are now thin wrappers rendering <CoachDashboardPage role="…" />. The
// role config below decides which labels/panels render; the data flows
// through useDashboard(role) (dashData.jsx). PIXEL PARITY with the old pages
// is the contract of this step — the mock constants are copied verbatim, the
// live mapping logic is identical, only deduplicated.
//
// Load order: pageShell → trainerDashboard.jsx (DashShell/RecentPayouts) →
// coachNav → dashSignals.js (plain) → dashData.jsx → this file.

// ── Shared formatters (were duplicated per page as td*/nd*) ─────────────────
function dashFmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch (e) { return ""; }
}
function dashCalDate(iso) {
  try { const d = new Date(iso); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  catch (e) { return ""; }
}
function dashCalTime(iso) {
  try { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  catch (e) { return ""; }
}
function dashMoney(cents) {
  try { return "$" + Math.round((cents || 0) / 100).toLocaleString(); }
  catch (e) { return "$0"; }
}
const DASH_FLAT_TREND = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

// ── Role config — labels, CTAs, and the verbatim demo data per role ─────────
const DASH_TODAY_ROLES = {
  trainer: {
    flag: "isTrainer",
    triagePulse: true,      // Client Pulse = the signal-engine triage feed (step 3)
    expandSchedule: true,   // expandable schedule rows w/ context + actions (step 4.1)
    programmingQueue: true, // who needs next week's plan (step 4.2)
    mockName: "Maya",
    date: "WEDNESDAY APR 18", // parity with the old page; real dates land with roadmap 1.2
    greeting: (n) => "Good morning, " + n + ".",
    primaryCta: ["+ Program", "TrainerPrograms.html"],
    secondaryCta: ["New session", "TrainerClients.html"],
    navItems: () => trainerNavItems("today"),
    payoutCard: () => trainerPayoutCard,
    scheduleTitle: "Today's schedule",
    weekLabel: "Sessions this week",
    upcomingLabel: "Upcoming sessions",
    kpiKeys: { week: "sessionsThisWeek", upcoming: "upcomingSessions" },
    unit: "session",
    emptySchedule: { time: "—", who: "No sessions today", sub: "Your schedule is clear" },
    emptyPulse: { who: "No clients yet", sub: "Sessions will appear here", trend: DASH_FLAT_TREND },
    mockKpis: [
      { k: "$2,847.50", l: "Current balance" },
      { k: "Apr 21", l: "Next payout", sub: "in 3 days" },
      { k: "$4,192.00", l: "This month" },
      { k: "$38,420", l: "Lifetime" },
    ],
    mockSchedule: [
      { time: "07:00", who: "Priya S.", sub: "Lower pull · remote", status: "DONE" },
      { time: "09:30", who: "Deandre K.", sub: "Upper push · Brooklyn", status: "DONE" },
      { time: "14:00", who: "Sam O.", sub: "Intake call · new", status: "NEXT" },
      { time: "17:30", who: "Priya S.", sub: "Upper push · remote" },
      { time: "19:00", who: "Jaya P.", sub: "Nutrition review" },
    ],
    mockPulse: [
      { who: "Maya", sub: "2 workouts · 4d streak", trend: [0.2, 0.4, 0.3, 0.5, 0.4, 0.6, 0.5] },
      { who: "Diego", sub: "4 workouts · 7d streak", trend: [0.3, 0.5, 0.4, 0.7, 0.6, 0.8, 0.7] },
      { who: "Rae", sub: "6 workouts · 10d streak", trend: [0.4, 0.6, 0.5, 0.8, 0.7, 0.9, 0.85] },
      { who: "Jordan", sub: "8 workouts · 13d streak", trend: [0.5, 0.4, 0.6, 0.5, 0.7, 0.6, 0.65] },
      { who: "Nadia", sub: "10 workouts · 16d streak", trend: [0.6, 0.7, 0.65, 0.8, 0.75, 0.9, 0.88] },
    ],
    mockCalendar: [
      { date: "2026-04-13", time: "07:00", kind: "SESSION", title: "Priya S. · Lower pull", sub: "Remote · 60 min" },
      { date: "2026-04-13", time: "09:30", kind: "SESSION", title: "Deandre K. · Upper push", sub: "Brooklyn studio" },
      { date: "2026-04-13", time: "15:00", kind: "ADMIN",   title: "Program writing", sub: "Block 2 of 2 clients" },
      { date: "2026-04-14", time: "08:00", kind: "SESSION", title: "Ana P. · Marathon base", sub: "Remote · 45 min" },
      { date: "2026-04-14", time: "11:00", kind: "REVIEW",  title: "Video form review", sub: "Jonah W." },
      { date: "2026-04-15", time: "07:00", kind: "SESSION", title: "Marcus L. · Deload", sub: "Studio · 60 min" },
      { date: "2026-04-15", time: "14:00", kind: "CHECKIN", title: "Weekly w/ Priya", sub: "20 min · video" },
      { date: "2026-04-16", time: "06:30", kind: "SESSION", title: "Ana P. · Long run", sub: "Tempo 12k" },
      { date: "2026-04-16", time: "15:00", kind: "ADMIN",   title: "Payout review", sub: "Apr 21 cycle" },
      { date: "2026-04-17", time: "09:00", kind: "SESSION", title: "Priya S. · Upper pull", sub: "Remote · 45 min" },
      { date: "2026-04-17", time: "18:00", kind: "CHECKIN", title: "Weekly w/ Marcus", sub: "Video · 20 min" },
      { date: "2026-04-18", time: "07:00", kind: "SESSION", title: "Priya S. · Lower pull", sub: "Remote" },
      { date: "2026-04-18", time: "09:30", kind: "SESSION", title: "Deandre K. · Upper push", sub: "Brooklyn" },
      { date: "2026-04-18", time: "14:00", kind: "CHECKIN", title: "Sam O. · Intake call", sub: "30 min" },
      { date: "2026-04-18", time: "17:30", kind: "SESSION", title: "Priya S. · Upper push", sub: "Remote" },
      { date: "2026-04-18", time: "19:00", kind: "REVIEW",  title: "Jaya P. · nutrition review", sub: "20 min" },
      { date: "2026-04-19", time: "10:00", kind: "ADMIN",   title: "Programming block", sub: "Focus time" },
      { date: "2026-04-20", time: "07:00", kind: "SESSION", title: "Jonah W. · Foundations", sub: "Studio" },
      { date: "2026-04-20", time: "18:00", kind: "CHECKIN", title: "Jen K. · Intake", sub: "New client" },
      { date: "2026-04-21", time: "10:00", kind: "ADMIN",   title: "Payout day", sub: "Apr 21 · $2,847" },
      { date: "2026-04-22", time: "09:00", kind: "SESSION", title: "Ana P. · Tempo", sub: "Remote" },
      { date: "2026-04-23", time: "17:00", kind: "REVIEW",  title: "Quarterly client review", sub: "With Rae" },
      { date: "2026-04-24", time: "08:00", kind: "SESSION", title: "Marcus L. · Squat work", sub: "Studio" },
      { date: "2026-04-26", time: "10:00", kind: "SESSION", title: "Priya S. · Assessment", sub: "Monthly test" },
      { date: "2026-04-28", time: "17:30", kind: "CHECKIN", title: "Monthly review · Priya", sub: "With Rae" },
      { date: "2026-04-30", time: "15:00", kind: "ADMIN",   title: "Month close-out", sub: "Admin" },
    ],
    payoutRows: [
      { date: "Apr 7, 2026",  mid: "32 subscribers", amount: "$2,612.00" },
      { date: "Mar 31, 2026", mid: "31 subscribers", amount: "$2,530.50" },
      { date: "Mar 24, 2026", mid: "30 subscribers", amount: "$2,449.00" },
      { date: "Mar 17, 2026", mid: "30 subscribers", amount: "$2,449.00" },
    ],
  },

  nutritionist: {
    flag: "isNutritionist",
    mockName: "Rae",
    date: "WEDNESDAY APR 18",
    greeting: (n) => "Good morning, " + n + ".",
    primaryCta: ["+ Meal plan", "NutritionistPlans.html"],
    secondaryCta: ["New consult", "NutritionistClients.html"],
    navItems: () => nutriNavItems("today"),
    payoutCard: () => nutriPayoutCard,
    scheduleTitle: "Today's consults",
    weekLabel: "Consults this week",
    upcomingLabel: "Upcoming consults",
    kpiKeys: { week: "consultsThisWeek", upcoming: "upcomingConsults" },
    unit: "consult",
    emptySchedule: { time: "—", who: "No consults today", sub: "Your schedule is clear" },
    emptyPulse: { who: "No clients yet", sub: "Consults will appear here", trend: DASH_FLAT_TREND },
    mockKpis: [
      { k: "$1,864.00", l: "Current balance" },
      { k: "Apr 21", l: "Next payout", sub: "in 3 days" },
      { k: "$2,948.00", l: "This month" },
      { k: "$24,160", l: "Lifetime" },
    ],
    mockSchedule: [
      { time: "08:30", who: "Elena R.", sub: "Weekly check · remote", status: "DONE" },
      { time: "11:00", who: "Marcus L.", sub: "Meal plan refresh", status: "DONE" },
      { time: "13:30", who: "Priya S.", sub: "Sleep + macros", status: "NEXT" },
      { time: "16:00", who: "Jonah W.", sub: "Race fueling" },
    ],
    mockPulse: [
      { who: "Elena R.",  sub: "7 days logged · −14% BF", trend: [0.3, 0.4, 0.5, 0.4, 0.6, 0.7, 0.8] },
      { who: "Marcus L.", sub: "5 days · protein short",   trend: [0.5, 0.4, 0.6, 0.5, 0.4, 0.5, 0.45] },
      { who: "Priya S.",  sub: "Flagged: sleep low",       trend: [0.7, 0.6, 0.5, 0.4, 0.5, 0.4, 0.3] },
      { who: "Jonah W.",  sub: "Long-run carbs missed",    trend: [0.4, 0.5, 0.45, 0.6, 0.5, 0.7, 0.6] },
      { who: "Ana P.",    sub: "On plan · no flags",       trend: [0.5, 0.6, 0.55, 0.7, 0.65, 0.8, 0.75] },
    ],
    mockCalendar: [
      { date: "2026-04-13", time: "09:00", kind: "CONSULT", title: "Elena R. · weekly check", sub: "Remote · 30 min" },
      { date: "2026-04-13", time: "14:00", kind: "PLAN",    title: "Marcus L. · meal plan", sub: "Protein shortfall" },
      { date: "2026-04-14", time: "10:00", kind: "CONSULT", title: "Ana P. · marathon fueling", sub: "Race week" },
      { date: "2026-04-14", time: "15:00", kind: "REVIEW",  title: "Bloodwork review", sub: "Priya S." },
      { date: "2026-04-15", time: "08:30", kind: "CONSULT", title: "Jonah W. · intake", sub: "New client" },
      { date: "2026-04-15", time: "13:00", kind: "PLAN",    title: "Weekly plan drops", sub: "5 clients" },
      { date: "2026-04-16", time: "09:00", kind: "CONSULT", title: "Priya S. · sleep + macros", sub: "20 min" },
      { date: "2026-04-16", time: "16:00", kind: "REVIEW",  title: "Log review · Elena", sub: "30 min" },
      { date: "2026-04-17", time: "10:00", kind: "CONSULT", title: "Marcus L. · refeed plan", sub: "30 min" },
      { date: "2026-04-17", time: "14:00", kind: "ADMIN",   title: "Insurance billing", sub: "Admin block" },
      { date: "2026-04-18", time: "08:30", kind: "CONSULT", title: "Elena R. · weekly check", sub: "Remote" },
      { date: "2026-04-18", time: "11:00", kind: "PLAN",    title: "Marcus L. · meal plan refresh", sub: "30 min" },
      { date: "2026-04-18", time: "13:30", kind: "CONSULT", title: "Priya S. · sleep + macros", sub: "30 min" },
      { date: "2026-04-18", time: "16:00", kind: "CONSULT", title: "Jonah W. · race fueling", sub: "20 min" },
      { date: "2026-04-19", time: "11:00", kind: "ADMIN",   title: "Content block", sub: "Newsletter" },
      { date: "2026-04-20", time: "09:00", kind: "CONSULT", title: "Ana P. · race debrief", sub: "30 min" },
      { date: "2026-04-21", time: "10:00", kind: "ADMIN",   title: "Payout day", sub: "Apr 21 · $1,864" },
      { date: "2026-04-22", time: "14:00", kind: "REVIEW",  title: "Bloodwork · Priya S.", sub: "30 min" },
      { date: "2026-04-23", time: "10:00", kind: "CONSULT", title: "Elena R. · monthly", sub: "Body-comp retest" },
      { date: "2026-04-24", time: "13:00", kind: "PLAN",    title: "Weekly plan drops", sub: "6 clients" },
      { date: "2026-04-28", time: "17:30", kind: "CONSULT", title: "Monthly review · Priya", sub: "With Maya" },
      { date: "2026-04-30", time: "11:00", kind: "ADMIN",   title: "Month close-out", sub: "Admin" },
    ],
    payoutRows: [
      { date: "Apr 7, 2026",  mid: "26 subscribers", amount: "$1,820.00" },
      { date: "Mar 31, 2026", mid: "25 subscribers", amount: "$1,750.00" },
      { date: "Mar 24, 2026", mid: "24 subscribers", amount: "$1,680.00" },
      { date: "Mar 17, 2026", mid: "24 subscribers", amount: "$1,680.00" },
    ],
  },
};

// ── Triage pulse panel (roadmap 2.3 → first visible use of the signal engine)
// Replaces the old name+sparkline rows for roles with cfg.triagePulse. Rows
// come from getTriageFeed(role) regrouped at-risk → new → on-track, each with
// a severity-colored reason pill, streak / weekly score + delta / last
// contact, and a one-tap Message. Visual language per the prototype: dark
// panel, squared spine-left pills, mono metas, teal accents.

const DASH_SEV_COLORS = { red: "#e0644b", amber: "#d8a23a", new: "#2ee0c4", green: "#7bbf5a" };

function DashPill({ c, children }) {
  return (
    <span style={{ display: "inline-block", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c, background: c + "1c", border: "1px solid " + c + "55", borderLeft: "3px solid " + c, borderRadius: 4, padding: "3px 8px" }}>
      {children}
    </span>
  );
}

function dashRelDay(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(String(isoStr).length === 10 ? isoStr + "T00:00:00" : isoStr);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? "today" : days + "d ago";
  } catch (e) { return null; }
}

function dashMessageClient(name, role) {
  try { if (window.__openChat) { window.__openChat({ who: name }); return; } } catch (e) {}
  const b = document.getElementById("shape-global-chat-button");
  if (b) { b.click(); return; }
  window.location.href = role === "nutritionist" ? "NutritionistMessages.html" : "TrainerMessages.html";
}

// Pre-session context from the unified record — the two most useful facts.
// Priority: distance from goal weight → check-in state → streak → adherence.
function dashContextLine(rec) {
  if (!rec) return null;
  const parts = [];
  if (rec.goal && rec.goal.target != null) {
    const now = rec.goal.now != null
      ? rec.goal.now
      : (Array.isArray(rec.weighIns) && rec.weighIns.length ? rec.weighIns[rec.weighIns.length - 1].weight : null);
    if (now != null) {
      const dist = Math.round(Math.abs(now - rec.goal.target) * 10) / 10;
      parts.push(dist + " " + (rec.goal.unit || "lb") + " from goal weight");
    }
  }
  if (rec.checkIn) {
    const thisMonday = DashSignals._internals.mondayOf(new Date());
    const mondayIso = thisMonday.getFullYear() + "-" + String(thisMonday.getMonth() + 1).padStart(2, "0") + "-" + String(thisMonday.getDate()).padStart(2, "0");
    parts.push(rec.checkIn.lastWeekOf === mondayIso ? "check-in reviewed" : "no check-in this week");
  }
  if (parts.length < 2 && rec.streaks && rec.streaks.current != null) parts.push(rec.streaks.current + "d streak");
  if (parts.length < 2 && rec.trainingAdherence && rec.trainingAdherence.pct != null) parts.push(rec.trainingAdherence.pct + "% adherence");
  return parts.length ? parts.slice(0, 2).join(" · ") : null;
}

function dashFindRecord(clients, who) {
  const key = String(who || "").trim().toLowerCase();
  if (!key) return null;
  return (clients || []).find((c) => String(c.client ? c.client.profile.name : c.profile.name).trim().toLowerCase() === key) || null;
}

function dashClientSlugHref(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return "ClientProfile.html?client=" + encodeURIComponent(slug);
}

// Expandable schedule rows (step 4.1) — same anatomy as DashShell's default
// rows (time / who+sub / DONE-NEXT pill), tap to reveal the pre-session
// context line + inline actions: Message · Last notes · Start log.
function ExpandableSchedule({ schedule, clients, role }) {
  const [openIdx, setOpenIdx] = React.useState(null);
  const actionStyle = { display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer", textDecoration: "none" };
  return (
    <div>
      {schedule.map((s, i) => {
        const open = openIdx === i;
        const rec = dashFindRecord(clients, s.who);
        const context = dashContextLine(rec);
        const expandable = s.time !== "—"; // skip the "No sessions today" placeholder
        return (
          <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
            <div onClick={() => expandable && setOpenIdx(open ? null : i)} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "14px 4px", cursor: expandable ? "pointer" : "default" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{s.time}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {expandable && <span style={{ display: "inline-block", width: 14, color: "rgba(242,237,228,0.45)", fontSize: 10 }}>{open ? "▾" : "▸"}</span>}
                  {s.who}
                </div>
                <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2, paddingLeft: expandable ? 14 : 0 }}>{s.sub}</div>
              </div>
              {s.status && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 4,
                  background: s.status === "DONE" ? "rgba(242,237,228,0.08)" : s.status === "NEXT" ? TEAL : "rgba(242,237,228,0.08)",
                  color: s.status === "NEXT" ? PAPER : "rgba(242,237,228,0.65)",
                  border: s.status === "DONE" ? "1px solid rgba(242,237,228,0.12)" : "none",
                }}>{s.status}</span>
              )}
            </div>
            {open && (
              <div style={{ padding: "0 4px 14px 80px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "#2ee0c4", marginBottom: 9 }}>
                  {context || "No shared history yet"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => dashMessageClient(s.who, role)} style={actionStyle}>Message</button>
                  <a href={dashClientSlugHref(s.who)} style={{ ...actionStyle, color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)" }}>Last notes</a>
                  <a href={role === "nutritionist" ? "NutritionistLiveConsole.html" : "TrainerLiveConsole.html"} style={{ ...actionStyle, color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)" }}>Start log</a>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Programming queue (step 4.2) — who needs next week's plan, from the hook's
// checkIn-derived queue. "Write plan" marks the item done for this week
// (localStorage, keyed by the week's Monday, so it survives reloads and
// resets cleanly next week).
function dashQueueWeekKey() {
  const m = DashSignals._internals.mondayOf(new Date());
  return "shape.dashQueueDone." + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
}
function ProgrammingQueuePanel({ queue, role }) {
  const [done, setDone] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(dashQueueWeekKey()) || "[]")); } catch (e) { return new Set(); }
  });
  const toggle = (id) => setDone((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    try { localStorage.setItem(dashQueueWeekKey(), JSON.stringify([...next])); } catch (e) {}
    return next;
  });
  const ink50 = "rgba(242,237,228,0.55)";
  const rows = [...queue].sort((a, b) => {
    const da = done.has(a.client.profile.id) ? 1 : 0, db = done.has(b.client.profile.id) ? 1 : 0;
    return da - db; // done items sink; the queue's ready→blocked order holds otherwise
  });
  if (!rows.length) return <div style={{ fontSize: 13, color: ink50 }}>No one in the queue — check-in data will populate it.</div>;
  const remaining = rows.filter((r) => !done.has(r.client.profile.id) && r.state === "ready").length;
  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: ink50, marginBottom: 10 }}>
        {remaining} ready to program · week of {dashQueueWeekKey().slice(-10)}
      </div>
      {rows.map((r, i) => {
        const id = r.client.profile.id;
        const isDone = done.has(id);
        const blocked = r.state === "blocked";
        const c = isDone ? DASH_SEV_COLORS.green : blocked ? DASH_SEV_COLORS.amber : "#2ee0c4";
        return (
          <div key={id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", opacity: isDone ? 0.6 : 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, textDecoration: isDone ? "line-through" : "none" }}>{r.client.profile.name}</span>
                <DashPill c={c}>{isDone ? "✓ Plan written" : blocked ? "Waiting on check-in" : "Ready"}</DashPill>
              </div>
              <div style={{ marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.05em", color: ink50 }}>{r.reason}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <a href={role === "nutritionist" ? "NutritionistPlans.html" : "TrainerPrograms.html"} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "7px 11px", textDecoration: "none" }}>Template</a>
              <button onClick={() => toggle(id)} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: isDone ? "rgba(242,237,228,0.55)" : "#06231f", background: isDone ? "transparent" : "#2ee0c4", border: isDone ? "1px solid rgba(242,237,228,0.18)" : "0", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>
                {isDone ? "Undo" : "Write plan"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TriagePulsePanel({ feed, role }) {
  // Urgency order: at-risk (red, then amber — the feed is already sorted),
  // then brand-new clients, then on-track.
  const atRisk = feed.filter((r) => r.severity !== "green");
  const fresh = feed.filter((r) => r.severity === "green" && r.client.profile.isNew);
  const ok = feed.filter((r) => r.severity === "green" && !r.client.profile.isNew);
  const rows = [...atRisk, ...fresh, ...ok];
  const ink50 = "rgba(242,237,228,0.55)";

  return (
    <div>
      <style>{"@keyframes dashTick{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}"}</style>
      {rows.map((r, i) => {
        const c = r.client;
        const isNew = r.severity === "green" && c.profile.isNew;
        const sevColor = isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS[r.severity];
        const hist = c.shapeScoreHistory;
        const wkPts = Array.isArray(hist) && hist.length ? hist[hist.length - 1].points : null;
        const delta = Array.isArray(hist) && hist.length >= 2 ? hist[hist.length - 1].points - hist[hist.length - 2].points : null;
        const streak = c.streaks && c.streaks.current != null ? c.streaks.current + "d streak" : null;
        const contact = c.lastContact ? dashRelDay(role === "nutritionist" ? c.lastContact.nutritionist : c.lastContact.trainer) : null;
        const pills = r.flags.slice(0, 2).map((f) => f.label);
        const extra = r.flags.length - 2;
        return (
          <div key={c.profile.id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
            <span title={r.severity} style={{ width: 7, height: 7, borderRadius: 2, background: sevColor, animation: r.severity === "red" ? "dashTick 1.6s ease-in-out infinite" : "none" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{c.profile.name}</span>
                {pills.map((p, j) => <DashPill key={j} c={sevColor}>{p}</DashPill>)}
                {extra > 0 && <DashPill c={sevColor}>+{extra}</DashPill>}
                {isNew && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}
                {r.severity === "green" && !isNew && <DashPill c={DASH_SEV_COLORS.green}>On track</DashPill>}
              </div>
              <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.05em", color: ink50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[
                  streak,
                  wkPts != null ? <span key="p">{wkPts} wk pts{delta != null && <span style={{ color: delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}>{" "}{delta >= 0 ? "▲+" + delta : "▼−" + Math.abs(delta)}</span>}</span> : null,
                  contact ? "spoke " + contact : null,
                ].filter(Boolean).map((part, j, arr) => <React.Fragment key={j}>{part}{j < arr.length - 1 ? " · " : ""}</React.Fragment>)}
                {streak == null && wkPts == null && contact == null && "—"}
              </div>
            </div>
            <button onClick={() => dashMessageClient(c.profile.name, role)} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>
              Message
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── The shared page ─────────────────────────────────────────────────────────
function CoachDashboardPage({ role }) {
  const cfg = DASH_TODAY_ROLES[role];
  const { today: live, triage, clients, queue } = useDashboard(role);

  const firstName = live ? live.user.firstName : cfg.mockName;
  const kpis = live ? [
    { k: String(live.kpis.activeClients), l: "Active clients" },
    { k: dashMoney(live.kpis.monthlyNetCents), l: "Monthly (net)", sub: "after 15% fee" },
    { k: String(live.kpis[cfg.kpiKeys.week]), l: cfg.weekLabel },
    { k: String(live.kpis[cfg.kpiKeys.upcoming]), l: cfg.upcomingLabel },
  ] : cfg.mockKpis;

  const todayRows = live && Array.isArray(live.today) ? live.today : null;
  const schedule = !todayRows
    ? cfg.mockSchedule
    : todayRows.length
      ? todayRows.map((s, i) => ({
          time: dashFmtTime(s.scheduledAt),
          who: s.clientName || "Client",
          sub: [s.topic, (s.durationMin || 15) + " min", s.type].filter(Boolean).join(" · "),
          status: i === 0 ? (s.status === "confirmed" ? "NEXT" : "PENDING") : undefined,
        }))
      : [cfg.emptySchedule];

  const calendarEvents = live && Array.isArray(live.calendar)
    ? live.calendar.map(e => ({ date: dashCalDate(e.at), time: dashCalTime(e.at), kind: e.kind, title: e.title, sub: e.sub }))
    : cfg.mockCalendar;

  const pulseRows = live && Array.isArray(live.pulse) ? live.pulse : null;
  const pulse = !pulseRows
    ? cfg.mockPulse
    : pulseRows.length
      ? pulseRows.map(c => ({ who: c.name, sub: c.sessions + (c.sessions === 1 ? " " + cfg.unit : " " + cfg.unit + "s"), trend: DASH_FLAT_TREND }))
      : [cfg.emptyPulse];

  return (
    <DashShell
      role={role}
      userName={firstName}
      date={cfg.date}
      greeting={cfg.greeting(firstName)}
      primaryCta={cfg.primaryCta}
      secondaryCta={cfg.secondaryCta}
      navItems={cfg.navItems()}
      payoutCard={cfg.payoutCard()}
      kpis={kpis}
      scheduleTitle={cfg.scheduleTitle}
      calendarEvents={calendarEvents}
      schedule={schedule}
      pulseTitle="Client pulse"
      pulse={pulse}
      pulseRender={cfg.triagePulse ? () => <TriagePulsePanel feed={triage} role={role} /> : undefined}
      scheduleRender={cfg.expandSchedule ? () => <ExpandableSchedule schedule={schedule} clients={clients} role={role} /> : undefined}
      extraSections={[
        ...(cfg.programmingQueue ? [{
          title: "Programming queue",
          render: () => <ProgrammingQueuePanel queue={queue} role={role} />,
        }] : []),
        {
          title: "Recent payouts",
          render: () => <RecentPayouts rows={cfg.payoutRows} />,
        },
      ]}
    />
  );
}

Object.assign(window, { CoachDashboardPage, DASH_TODAY_ROLES });
