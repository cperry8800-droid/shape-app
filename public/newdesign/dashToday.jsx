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
// The payouts strip in the signed-out preview. ⚠ EVERY FIGURE COMES OUT OF THE DEMO
// ROSTER ON THE SAME PAGE (review 2026-09-09, V5): it used to read
// "$4,192.00 this month" beside a practice strip saying "$1,820 monthly recurring" from
// those same ten clients, with a next payout frozen at "Apr 21 · in 3 days" — text that
// was wrong on every day but one, even in April.
// ⚠ THE DEMO CALENDAR WAS FROZEN IN APRIL 2026 — 48 entries across the two roles, on a
// page whose own dateline renders today (review 2026-09-09, V5). A September visitor saw
// a month that had already happened, and two of the entries quoted payout figures the
// strip beside them no longer shows.
//
// Both blocks start on Monday 2026-04-13, so the whole thing shifts by whole weeks onto
// the current week: every weekday, every time and every ordering is preserved, and only
// the calendar's position in the year moves.
const DASH_DEMO_CAL_BASE = "2026-04-13";   // a Monday, and the first date in both blocks
let _dashDemoCal = null;
function dashDemoCalendar(rows, now) {
  const at = now instanceof Date ? now : new Date();
  const key = at.toDateString() + ":" + (rows && rows.length);
  if (_dashDemoCal && _dashDemoCal.key === key) return _dashDemoCal.v;
  const parts = DASH_DEMO_CAL_BASE.split("-").map(Number);
  const base = new Date(parts[0], parts[1] - 1, parts[2]);
  // This week's Monday, in LOCAL time — the dateline and every other date on this page
  // are local, and mixing the two is how a demo lands a day out west of UTC.
  const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const shiftDays = Math.round((monday - base) / 86400000);
  const p = DashSignals.demoPayouts(DashSignals.buildMockClients(at), at);
  const v = (rows || []).map((e) => {
    const d = e.date.split("-").map(Number);
    const moved = new Date(d[0], d[1] - 1, d[2] + shiftDays);
    const iso = moved.getFullYear() + "-" + String(moved.getMonth() + 1).padStart(2, "0") + "-" + String(moved.getDate()).padStart(2, "0");
    // ⚠ THE PAYOUT ENTRIES FOLLOW THE STRIP, not a date of their own. They used to read
    // "Apr 21 · $2,847" beside a strip that now derives both from the demo roster.
    if (/^Payout day/.test(e.title)) {
      const po = new Date(at.getFullYear(), at.getMonth() + 1, 0);
      const poIso = po.getFullYear() + "-" + String(po.getMonth() + 1).padStart(2, "0") + "-" + String(po.getDate()).padStart(2, "0");
      return { ...e, date: poIso, sub: p.payoutShort + " · " + dashMoney(p.thisMonthCents) };
    }
    if (/^Payout review/.test(e.title)) return { ...e, date: iso, sub: "This cycle" };
    return { ...e, date: iso };
  });
  _dashDemoCal = { key, v };
  return v;
}

let _dashDemoKpis = null;
function dashDemoKpis(now) {
  const at = now instanceof Date ? now : new Date();
  // Keyed on the DAY: this runs on every Today render, and rebuilding the ten-client
  // roster each time to reach a figure that only moves at midnight is waste.
  const key = at.toDateString();
  if (_dashDemoKpis && _dashDemoKpis.key === key) return _dashDemoKpis.v;
  const p = DashSignals.demoPayouts(DashSignals.buildMockClients(at), at);
  const v = [
    { k: dashMoney(p.balanceCents), l: "Current balance", sub: "settled · 7-day hold" },
    { k: p.payoutShort, l: "Next payout", sub: p.daysToPayout === 0 ? "today" : "in " + p.daysToPayout + " day" + (p.daysToPayout === 1 ? "" : "s") },
    { k: dashMoney(p.thisMonthCents), l: "This month", sub: "net · after 15% fee" },
    { k: dashMoney(p.lifetimeCents), l: "Lifetime", sub: p.months + " month" + (p.months === 1 ? "" : "s") + " on Shape" },
  ];
  _dashDemoKpis = { key, v };
  return v;
}

function dashMoney(cents) {
  try { return "$" + Math.round((cents || 0) / 100).toLocaleString(); }
  catch (e) { return "$0"; }
}

// ── The KPI picker (review 2026-09-09, R15) ─────────────────────────────────
// Which four figures each Today stat strip shows, chosen per account and per role.
// The pool and every derivation live in dashSignals.js; this file owns the FORMATTING,
// because `dashMoney` and the strip's typography are its own.
const DASH_OVERVIEW_DEFAULT = ["activeClients", "monthlyNet", "weekSessions", "upcoming"];
const DASH_PRACTICE_DEFAULT = ["todaySessions", "due", "compliance", "mrr"];

function dashKpiCell(key, role, ctx) {
  const label = DashSignals.dashKpiLabel(key, role);
  const out = DashSignals.dashKpiValue(key, ctx);
  // ⚠ A KEY THIS BUILD DOES NOT RECOGNISE RENDERS AS A REDACTION, NEVER AS A GAP. The
  // stored choice is validated at the hook, but a strip handed a retired key directly
  // still has to draw something honest rather than an empty column.
  if (!label || !out) return { k: "\u2014", l: "Not available", sub: "this metric was retired" };
  if (out.value == null) return { k: "\u2014", l: label, sub: out.why || null };
  const n = out.value;
  const k = out.unit === "money" ? dashMoney(n)
    : out.unit === "pct" ? n + "%"
    // ⚠ "500+" RATHER THAN "500". The count is taken over a capped window, so past the
    // cap it is a floor — printing the bare number would state a total nobody measured.
    : out.capped ? String(n) + "+"
    : String(n);
  return { k, l: label, sub: out.sub || null };
}

// The picker's groups for one strip, in the shape DashGrid's ⚙ already renders.
function dashKpiSettings(chosen, role, onPick) {
  const options = DashSignals.DASH_KPI_KEYS.map((key) => ({ v: key, label: DashSignals.dashKpiLabel(key, role) }));
  return chosen.map((key, i) => ({
    key: "kpi" + i,
    label: ["First", "Second", "Third", "Fourth"][i] || "Slot " + (i + 1),
    options,
    value: key,
    onPick: (v) => onPick(DashSignals.dashKpiPick(chosen, i, v)),
  }));
}
// The coach Today masthead eyebrow — the real current date (replaces the old
// hardcoded "WEDNESDAY APR 18" placeholder). Local browser day = the coach's day.
function dashTodayDate(d) {
  try {
    d = d || new Date();
    var wd = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][d.getDay()];
    var mo = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()];
    return wd + " " + mo + " " + d.getDate();
  } catch (e) { return ""; }
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
    date: dashTodayDate, // lazy (called per render like greeting) so it stays fresh across a long-lived tab; was a hardcoded roadmap-1.2 placeholder
    greeting: (n) => "Good morning, " + n + ".",
    primaryCta: ["+ Program", "TrainerPrograms.html"],
    secondaryCta: ["New session", "TrainerClients.html"],
    navItems: () => trainerNavItems("today"),
    payoutCard: () => trainerPayoutCard,
    scheduleTitle: "Today's schedule",
    // Which payload field answers each strip metric. The LABELS are no longer here: they
    // live once in `DashSignals.DASH_KPI_METRICS`, beside the derivation, because the ⚙
    // lists every metric by name and two spellings of one label would disagree in it.
    kpiKeys: { week: "sessionsThisWeek", upcoming: "upcomingSessions", total: "totalSessions" },
    unit: "session",
    emptySchedule: { time: "—", who: "No sessions today", sub: "Your schedule is clear" },
    emptyPulse: { who: "No clients yet", sub: "Sessions will appear here", trend: DASH_FLAT_TREND },
    mockKpis: () => dashDemoKpis(),
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
      { date: "2026-04-16", time: "15:00", kind: "ADMIN",   title: "Payout review", sub: "" },   // sub is derived — dashDemoCalendar
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
      { date: "2026-04-21", time: "10:00", kind: "ADMIN",   title: "Payout day", sub: "" },   // date + sub are derived — dashDemoCalendar
      { date: "2026-04-22", time: "09:00", kind: "SESSION", title: "Ana P. · Tempo", sub: "Remote" },
      { date: "2026-04-23", time: "17:00", kind: "REVIEW",  title: "Quarterly client review", sub: "With Rae" },
      { date: "2026-04-24", time: "08:00", kind: "SESSION", title: "Marcus L. · Squat work", sub: "Studio" },
      { date: "2026-04-26", time: "10:00", kind: "SESSION", title: "Priya S. · Assessment", sub: "Monthly test" },
      { date: "2026-04-28", time: "17:30", kind: "CHECKIN", title: "Monthly review · Priya", sub: "With Rae" },
      { date: "2026-04-30", time: "15:00", kind: "ADMIN",   title: "Month close-out", sub: "Admin" },
    ],
  },

  nutritionist: {
    flag: "isNutritionist",
    triagePulse: true,      // nutrition-aware triage feed (step 5)
    expandSchedule: true,   // consult rows expand w/ context + actions (step 5)
    programmingQueue: true, // plan drops due (feeds the "Plans due" stat)
    derivedKpis: true,      // true-Today stat bar from the data layer (step 5)
    mockName: "Rae",
    date: dashTodayDate,
    greeting: (n) => "Good morning, " + n + ".",
    primaryCta: ["+ Meal plan", "NutritionistPlans.html"],
    secondaryCta: ["New consult", "NutritionistClients.html"],
    navItems: () => nutriNavItems("today"),
    payoutCard: () => nutriPayoutCard,
    scheduleTitle: "Today's consults",
    kpiKeys: { week: "consultsThisWeek", upcoming: "upcomingConsults", total: "totalConsults" },
    unit: "consult",
    emptySchedule: { time: "—", who: "No consults today", sub: "Your schedule is clear" },
    emptyPulse: { who: "No clients yet", sub: "Consults will appear here", trend: DASH_FLAT_TREND },
    mockKpis: () => dashDemoKpis(),
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
      { date: "2026-04-21", time: "10:00", kind: "ADMIN",   title: "Payout day", sub: "" },   // date + sub are derived — dashDemoCalendar
      { date: "2026-04-22", time: "14:00", kind: "REVIEW",  title: "Bloodwork · Priya S.", sub: "30 min" },
      { date: "2026-04-23", time: "10:00", kind: "CONSULT", title: "Elena R. · monthly", sub: "Body-comp retest" },
      { date: "2026-04-24", time: "13:00", kind: "PLAN",    title: "Weekly plan drops", sub: "6 clients" },
      { date: "2026-04-28", time: "17:30", kind: "CONSULT", title: "Monthly review · Priya", sub: "With Maya" },
      { date: "2026-04-30", time: "11:00", kind: "ADMIN",   title: "Month close-out", sub: "Admin" },
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

// Every one-tap Message button routes through the EXISTING chat bubble,
// deep-linked to that client's thread — there is no standalone messages page
// (audit decision). `draft` pre-fills the composer when a reason pill
// triggered the tap; it's an editable opener, never an auto-send.
function dashMessageClient(name, role, draft) {
  const opts = { who: name || undefined, draft: draft || undefined, tab: !name && role === "client" ? "trainers" : undefined };
  try { if (typeof window.__openChatTo === "function") { window.__openChatTo(opts); return; } } catch (e) {}
  try { if (typeof window.__openChat === "function") { window.__openChat(opts, opts.tab); return; } } catch (e) {}
  // Bubble script not ready yet: stash the request and click the launcher —
  // the widget consumes __openChatRequest the moment it mounts.
  const b = document.getElementById("shape-global-chat-button");
  if (b) { window.__openChatRequest = opts; b.click(); }
}

// One-tap drafts — the coach's opener, grounded in the engine's ONE cross-domain
// directive reason (which already reasons across training/nutrition/sleep), with
// a fallback to stitching the raw flag reasons.
function dashMessageDraft(row) {
  if (!row || !row.client) return null;
  const dir = row.directive;
  const hasFlags = Array.isArray(row.flags) && row.flags.length > 0;
  const leverActionable = dir && dir.lever && dir.lever !== "none";
  // A clean row (no flags, no actionable lever) drafts nothing.
  if (!hasFlags && !leverActionable) return null;
  const first = String(row.client.profile.name).split(" ")[0];
  if (dir && dir.reason && dir.reason !== "—") {
    const r = dir.reason.charAt(0).toLowerCase() + dir.reason.slice(1);
    return "Hey " + first + " — checking in. I'm seeing " + r + ". What's getting in the way this week?";
  }
  if (!hasFlags) return null;
  const reasons = row.flags.slice(0, 2).map((f) => f.reason.charAt(0).toLowerCase() + f.reason.slice(1));
  return "Hey " + first + " — checking in. I'm seeing " + reasons.join(", and ") + ". What's getting in the way this week?";
}
function dashCongratsDraft(client, hit) {
  const first = String(client.profile.name).split(" ")[0];
  return first + " — " + hit.label + ". That's earned, not given. What are we pointing at next?";
}
function dashJointDraft(j, role) {
  const first = String(j.client.profile.name).split(" ")[0];
  const other = role === "nutritionist" ? "trainer" : "nutritionist";
  const labels = j.trainingFlags.concat(j.nutritionFlags).slice(0, 2).map((f) => f.label.toLowerCase());
  return "Hey " + first + " — your " + other + " and I compared notes: " + labels.join(" + ") + " in the same week. One reset plan from both of us. Quick call tomorrow?";
}

// Pre-session context from the unified record — the two most useful facts.
// Priority: goal proximity + projected pace (the engine's goalBrief, e.g.
// '2.8 lb to "Goal weight" · pace Jul 17') → check-in state → streak →
// adherence. Records without goals[] fall back to the legacy distance line.
function dashContextLine(rec) {
  if (!rec) return null;
  const parts = [];
  const brief = DashSignals.goalBrief ? DashSignals.goalBrief(rec, new Date()) : null;
  if (brief) {
    parts.push(brief);
  } else if (rec.goal && rec.goal.target != null) {
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

// The per-client deep dive — the REAL coach client page, by id. Only a live
// record (a real user id) has one: a demo record and a live client with no
// linked account resolve to null, and callers hide the link. This used to build
// a name-slug into ClientProfile.html, a demo persona page with no backend calls
// that fell back to "Priya Shah" for any real client (review 2026-09-09, R1) —
// a live coach must never be routed there again.
// Inside a coach shell (TrainerApp / NutritionistApp set window.__shapeCoachShell)
// the page is the `#client/<id>` route — an instant, same-document switch that
// keeps the sidebar. Anywhere else it is the standalone page.
function dashClientPageHref(id, role) {
  if (!id) return null;
  if (typeof window !== "undefined" && window.__shapeCoachShell) return "#client/" + encodeURIComponent(id);
  return (role === "nutritionist" ? "NutritionistClient.html" : "TrainerClient.html") + "?id=" + encodeURIComponent(id);
}
function dashClientHref(rec, role) {
  const r = rec && rec.client ? rec.client : rec;
  const id = r && r.profile ? r.profile.id : null;
  if (!id || /^demo-/.test(String(id))) return null;
  return dashClientPageHref(id, role);
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
            <div onClick={() => expandable && setOpenIdx(open ? null : i)} onKeyDown={(e) => { if (expandable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenIdx(open ? null : i); } }} role={expandable ? "button" : undefined} tabIndex={expandable ? 0 : undefined} aria-expanded={expandable ? open : undefined} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "14px 4px", cursor: expandable ? "pointer" : "default" }}>
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
                  {dashClientHref(rec, role) && <a href={dashClientHref(rec, role)} style={{ ...actionStyle, color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)" }}>Client file</a>}
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
// checkIn-derived queue.
//
// ⚠ THE "DONE" MARK USED TO LIVE IN ONE BROWSER'S localStorage, AND IT WAS
// WRONG TWICE (review 2026-09-09, R6). A queue that lives in one browser is not
// a queue — a coach who programs on their laptop and checks on their phone saw
// two different lists, and clearing site data emptied the week's work. And a
// tick is not a publish: the row read "✓ Plan written" whether or not a single
// session had been assigned, while a week genuinely published from the Assign
// flow left the queue looking untouched.
//
// So the panel now reads TWO sources and keeps them apart, because they are
// different claims:
//   PUBLISHED — `coach_week_publishes`, the server-side ledger the week-shaped
//     publish boundary writes. This is a fact about the system, so it cannot be
//     undone from here.
//   MARKED — the coach's own note that they handled someone outside the Assign
//     flow. An account-level `user_goals` document, so it follows them between
//     devices. Undoable, because it is a claim they made.
// A failed read of either says so rather than rendering the client as
// unprogrammed — "we could not check" is not "nobody has been programmed".
function dashQueueMonday() {
  return DashSignals._internals.mondayOf(new Date());
}
function dashQueueKeyOf(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dashQueueWeekKey() { return dashQueueKeyOf(dashQueueMonday()); }
// ⚠ THE WINDOW THE ROUTE FILTERS ON IS AN INSTANT, NOT THIS LABEL. `weekKey` is
// a local calendar date and a bare date is read at UTC midnight, which EXCLUDES a
// publish made east of UTC early on the coach's own Monday (UTC+10, local 08:00 =
// Sunday 22:00Z). The label stays the marks bucket; the query gets the moment.
function dashQueueSince() { return dashQueueMonday().toISOString(); }
// How many weeks of marks the document keeps. Only the current bucket is ever
// read; the rest are kept briefly so a clock skew or a late tap cannot land in a
// bucket that was just pruned.
const DASH_QUEUE_KEEP_WEEKS = 6;
// One frozen empty set, so an absent week bucket does not allocate per render.
const DASH_QUEUE_NO_MARKS = new Set();
function dashQueueWeekKeyAgo(weeks) {
  const m = dashQueueMonday();
  m.setDate(m.getDate() - weeks * 7);
  return dashQueueKeyOf(m);
}

// The ledger, scoped to the caller by the route.
//
// ⚠ TRAINER ONLY, AND THAT IS A PROPERTY OF THE TABLE. `coach_week_publishes`
// has no role column and its ONLY writer is the trainer week-publish route, so
// for a nutritionist it can never hold anything — a fetch there is a service-role
// round trip that answers nothing and blocks the Mark button behind `settling`
// while it resolves. Worse for a DUAL-ROLE coach, who is one auth user id: a
// training week published for a client would render as delivered on the
// NUTRITIONIST queue, which is the cross-role misattribution the R4 round fixed
// in coach-client-legs. A nutritionist's queue is marks-only until the meal-plan
// side grows a ledger of its own.
//
// ⚠ KEYED ON THE WEEK, NOT JUST ON `live`. `weekKey` is recomputed every render
// but an effect keyed only on `live` freezes its `since` — so a tab left open
// across Sunday midnight would read the NEW week's marks against the OLD week's
// ledger, and every client programmed last week would render as done for a week
// nobody had started. It also means a week published from the phone during the
// office day reaches the panel on the next week roll rather than never.
function useWeekPublishes(live, weekKey, role) {
  const [state, setState] = React.useState({ kind: "loading", published: {} });
  React.useEffect(() => {
    let on = true;
    if (!live) { setState({ kind: "demo", published: {} }); return undefined; }
    if (role !== "trainer") { setState({ kind: "none", published: {} }); return undefined; }
    setState({ kind: "loading", published: {} });
    (async () => {
      let j = null;
      try { j = await dashJson("/api/coach/week-publishes?since=" + encodeURIComponent(dashQueueSince())); }
      catch (e) { if (on) setState({ kind: "error", published: {} }); return; }
      if (!on) return;
      setState({ kind: "ready", published: (j && j.published) || {} });
    })();
    return () => { on = false; };
  }, [live, weekKey, role]);
  return state;
}

// ⚠ THE ROW'S STATE IS A PURE FUNCTION, so it can be driven rather than grepped.
// An earlier test pinned the SPELLING of these branches and would have passed a
// `toggle` that called the store before the published bail — the same class of
// hollow guard this wave has now paid for three times.
//   published — a fact the server recorded. Not undoable from here.
//   marked    — the coach's own note that they handled someone another way.
//   local     — the same note, kept on this device because it cannot be stored.
function dashQueueRowState(id, ctx) {
  const published = !!(ctx.published && ctx.published[id]);
  const marked = ctx.storeKind === "ready" || ctx.storeKind === "error"
    ? !!(ctx.marked && ctx.marked[id])
    : ctx.localMarks.has(id);
  return {
    published,
    marked,
    done: published || marked,
    // Only a stored mark is undoable through the store; a local one toggles
    // locally; a publish is neither.
    canToggle: !published,
    pill: published ? "\u2713 Week published" : (published || marked) ? "\u2713 Marked written" : null,
  };
}

// ⚠ PRUNED, because `saveUserGoals` is a blind WHOLE-DOCUMENT upsert and
// nothing else ever drops a bucket: a year of office days would put ~52 weeks ×
// a roster of marks in one JSONB, re-downloaded and re-uploaded to change a
// single key. Only `doc[weekKey]` is ever read, so anything older than the
// retention window is dead weight.
//
// Pure, and separate from the handler, so the prune can be DRIVEN. A source
// check that the cutoff is computed says nothing about whether it is applied —
// measured: deleting the `k >= cutoff` comparison left every assertion green.
function dashQueueMergeMarks(doc, weekKey, id, on, cutoff, nowISO) {
  const wk = { ...((doc && doc[weekKey]) || {}) };
  if (on) wk[id] = { markedAt: nowISO };
  else delete wk[id];
  const next = { [weekKey]: wk };
  for (const k of Object.keys(doc || {})) if (k >= cutoff && k !== weekKey) next[k] = doc[k];
  return next;
}

// ⚠ EVERY UNREADABLE STATE IS NAMED, AND THEY DO NOT MASK EACH OTHER. An
// exclusive chain showed only the ledger's failure when BOTH reads had failed,
// so a coach marking rows offline watched each one paint and was never told the
// marks were not saving — the notice that actually costs them work.
function dashQueueNotices(ledgerKind, storeKind) {
  const out = [];
  if (ledgerKind === "loading" || storeKind === "loading") out.push("Checking what\u2019s already been published\u2026");
  if (ledgerKind === "error") out.push("Couldn\u2019t check what\u2019s already been published \u2014 rows may look unprogrammed");
  // ⚠ "Not signed in" and "the read failed" are ONE state here whether we like
  // it or not: getUserGoals returns null for both. So the sentence must be true
  // of both, which "Sign in to keep your marks" is not — it tells a signed-in
  // coach with a transient read error to do something that will not help.
  if (storeKind === "signedout" || storeKind === "unavailable") out.push("Marks are kept on this device only \u2014 sign in, or check back, to carry them across devices");
  if (storeKind === "error") out.push("That mark didn\u2019t save \u2014 tap it again to retry");
  return out;
}

// ⚠ THE WEEK KEY NEEDS A CLOCK, NOT JUST A DEPENDENCY. Computing it during
// render does not cause a render — so a dashboard left open and idle across
// local Monday midnight keeps showing last week's marks and last week's ledger
// indefinitely, and the dependency added to `useWeekPublishes` only helps once
// something unrelated re-renders the page. This polls rather than scheduling a
// single timeout to the boundary, because a timeout is wrong after a laptop
// sleeps through it or the system clock moves; a comparison that costs a string
// a minute is self-correcting either way, and it only sets state when the key
// has ACTUALLY changed, so an idle panel re-renders 52 times a year.
function useQueueWeekKey() {
  const [key, setKey] = React.useState(dashQueueWeekKey);
  React.useEffect(() => {
    const id = setInterval(() => setKey((k) => {
      const next = dashQueueWeekKey();
      return next === k ? k : next;
    }), 60000);
    return () => clearInterval(id);
  }, []);
  return key;
}

function ProgrammingQueuePanel({ queue, role, live }) {
  const weekKey = useQueueWeekKey();
  const ledger = useWeekPublishes(live, weekKey, role);
  // { [weekOf]: { [clientId]: { markedAt } } } — one document per coach.
  const marks = useCoachDoc("coach_week_plans", live);
  const marked = (marks.doc && marks.doc[weekKey]) || {};
  // ⚠ A TICK THE STORE CANNOT KEEP STILL HAS TO DO SOMETHING. Signed out, or
  // when the doc could not be read, `apply` refuses before any paint — so an
  // enabled button did nothing at all, silently, where the localStorage this
  // change removed at least kept the week's work. It ticks locally now, with the
  // notice above saying so. Same precedent as the Week view.
  // ⚠ KEYED BY WEEK. These are the device-only marks used when the store cannot
  // keep one, and the panel's clock now advances `weekKey` on its own across
  // Monday midnight — so an unkeyed Set carried every one of last week's marks
  // into the new queue and reported those clients as already handled.
  const [localByWeek, setLocalByWeek] = React.useState(() => ({}));
  const localMarks = localByWeek[weekKey] || DASH_QUEUE_NO_MARKS;
  // ⚠ AND THE FAILED-WRITE INTENTS ARE KEYED WITH THEM, for the same reason and
  // because a retry belongs to the week it was made in.
  const intentRef = React.useRef({});
  const intentKeyRef = React.useRef(weekKey);
  if (intentKeyRef.current !== weekKey) { intentKeyRef.current = weekKey; intentRef.current = {}; }
  const storeKind = marks.kind;
  const rowState = (id) => dashQueueRowState(id, { published: ledger.published, marked, storeKind, localMarks });

  const toggle = (id) => {
    const st = rowState(id);
    if (!st.canToggle) return; // a publish is a fact, not a preference
    if (storeKind !== "ready" && storeKind !== "error") {
      setLocalByWeek((prev) => {
        const set = new Set(prev[weekKey] || []);
        set.has(id) ? set.delete(id) : set.add(id);
        return { ...prev, [weekKey]: set };
      });
      return;
    }
    // ⚠ A RETRY RE-ISSUES THE FAILED INTENT; IT DOES NOT INVERT THE PAINT. When a
    // write's own READ fails there is nothing to roll back to, so the optimistic
    // mark stays on screen and the notice says to tap again. Deriving `on` from
    // that paint makes the retry compute `on = false` — so a recovered read would
    // save a DELETION of the mark the coach was trying to keep. The intent is
    // held until a write for it actually succeeds.
    const held = Object.prototype.hasOwnProperty.call(intentRef.current, id);
    const on = held ? intentRef.current[id] : !marked[id];
    intentRef.current[id] = on;
    const cutoff = dashQueueWeekKeyAgo(DASH_QUEUE_KEEP_WEEKS);
    Promise.resolve(marks.apply((doc) => dashQueueMergeMarks(doc, weekKey, id, on, cutoff, new Date().toISOString())))
      .then((ok) => { if (ok) delete intentRef.current[id]; })
      .catch(() => {});
  };

  const ink50 = "rgba(242,237,228,0.55)";
  const notices = dashQueueNotices(ledger.kind, storeKind);
  const settling = ledger.kind === "loading" || storeKind === "loading";
  const noticeBlock = notices.length ? (
    <div style={{ fontSize: 11.5, fontStyle: "italic", color: ink50, marginBottom: 10 }}>
      {notices.map((n, i) => <div key={i}>{n}</div>)}
    </div>
  ) : null;
  const rows = [...queue].sort((a, b) => {
    const da = rowState(a.client.profile.id).done ? 1 : 0, db = rowState(b.client.profile.id).done ? 1 : 0;
    return da - db; // done items sink; the queue's ready→blocked order holds otherwise
  });
  // ⚠ THE EMPTY BRANCH CARRIES THE NOTICES TOO. It used to return above them,
  // so the panel asserted "No one in the queue" on the very first paint — before
  // any roster read had resolved — and again after one had failed. That is the
  // one place the panel says the most, and it was the one place it could not say
  // it did not know.
  if (!rows.length) {
    return (
      <div>
        {noticeBlock}
        <div style={{ fontSize: 13, color: ink50 }}>
          {settling ? "Loading your roster\u2026" : "No one in the queue \u2014 check-in data will populate it."}
        </div>
      </div>
    );
  }
  const remaining = rows.filter((r) => !rowState(r.client.profile.id).done && r.state === "ready").length;
  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: ink50, marginBottom: notices.length ? 5 : 10 }}>
        {settling ? "\u2014" : remaining} ready to program · week of {weekKey}
      </div>
      {noticeBlock}
      {rows.map((r, i) => {
        const id = r.client.profile.id;
        const st = rowState(id);
        const blocked = r.state === "blocked";
        const c = st.done ? DASH_SEV_COLORS.green : blocked ? DASH_SEV_COLORS.amber : "#2ee0c4";
        const pillText = st.pill || (blocked ? "Waiting on check-in" : "Ready");
        return (
          <div key={id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", opacity: st.done ? 0.6 : 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500, textDecoration: st.done ? "line-through" : "none" }}>{r.client.profile.name}</span>
                <DashPill c={c}>{pillText}</DashPill>
              </div>
              <div style={{ marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.05em", color: ink50 }}>
                {st.published ? "Week of " + ledger.published[id].weekStart + " · delivered" : r.reason}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <a href={dashShellHref(role === "nutritionist" ? "NutritionistPlans.html" : "TrainerPrograms.html")} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "7px 11px", textDecoration: "none" }}>Template</a>
              {st.canToggle && (
                <button onClick={() => toggle(id)} disabled={settling} style={{ opacity: settling ? 0.45 : 1, cursor: settling ? "default" : "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: st.done ? "rgba(242,237,228,0.55)" : "#06231f", background: st.done ? "transparent" : "#2ee0c4", border: st.done ? "1px solid rgba(242,237,228,0.18)" : "0", borderRadius: 4, padding: "7px 11px" }}>
                  {Object.prototype.hasOwnProperty.call(intentRef.current, id) ? "Retry" : st.done ? "Undo" : "Mark written"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Client-wins briefing (step 9.1) — milestone hits across the roster, with a
// one-tap congratulate. Live coach-side milestone data is sparse today, so
// the empty state explains itself instead of inventing wins.
function DashWinsPanel({ clients, role }) {
  const ink50 = "rgba(242,237,228,0.55)";
  const rows = [];
  for (const c of clients) {
    const ms = DashSignals.buildMilestones(c);
    const hit = ms.recent.find((m) => m.hitAt); // dated hits only (not active-streak fills)
    if (hit) rows.push({ client: c, hit });
  }
  rows.sort((a, b) => String(b.hit.hitAt).localeCompare(String(a.hit.hitAt)));
  if (!rows.length) return <div style={{ fontSize: 13, color: ink50 }}>Milestones appear here as clients log and share progress.</div>;
  return (
    <div>
      {rows.slice(0, 4).map((r, i) => (
        <div key={r.client.profile.id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "#7bbf5a" }} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.client.profile.name}</span>
            <span style={{ fontSize: 13, color: "rgba(242,237,228,0.8)" }}> — {r.hit.label}</span>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ink50, marginTop: 2 }}>{dashRelDay(r.hit.hitAt)}</div>
          </div>
          <button onClick={() => dashMessageClient(r.client.profile.name, role, dashCongratsDraft(r.client, r.hit))} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7bbf5a", background: "rgba(123,191,90,0.08)", border: "1px solid rgba(123,191,90,0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>Congratulate</button>
        </div>
      ))}
    </div>
  );
}

function TriagePulsePanel({ feed, role, joint = [], pinned, onTogglePin, prefs }) {
  // Urgency order: at-risk (red, then amber — the feed is already sorted),
  // then brand-new clients, then on-track — with the coach's own pins lifted above it.
  //
  // ⚠ THE ORDER IS A PURE FUNCTION IN `dashSignals.js`, NOT THREE FILTERS HERE, because
  // the rule a pin has to obey ("a row appears exactly once, and a pin never removes a
  // flag from the list") is the kind of thing a filter chain gets wrong silently. It is
  // driven in tests/dash-pulse-pins.test.mjs rather than eyeballed on a card.
  const order = DashSignals.pulseOrder(feed, pinned);
  const pinnedRows = order.pinned;
  const rows = order.rest;
  const canPin = typeof onTogglePin === "function";
  const pinSet = new Set(Array.isArray(pinned) ? pinned : []);
  const ink50 = "rgba(242,237,228,0.55)";
  // A HEX muted ink for DashPill: the pill composes its bg/border by appending hex
  // suffixes (c + "1c" / "55"), so an rgba() value would produce invalid CSS.
  const inkMutedPill = "#9b968d";
  // Rows open the shared client drilldown (step 11) when dashRoster.jsx is
  // loaded on the page; the Message button keeps working either way.
  const [openRow, setOpenRow] = React.useState(null);
  const drawerReady = typeof window !== "undefined" && typeof window.DashClientDrawer === "function";
  const openDrawer = (r) => { if (drawerReady) setOpenRow(r); };

  const renderRow = (r, i) => {
        const c = r.client;
        const isNew = r.severity === "green" && c.profile.isNew;
        const sevColor = isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS[r.severity];
        // One reading, shared with the roster cell, the drawer and the rule —
        // it compares the two newest COMPLETE weeks, so the current week in
        // progress shows its live number without reading as a collapse.
        const wk = DashSignals.scoreWeekReading(c.shapeScoreHistory);
        const wkPts = wk ? wk.points : null;
        const delta = wk ? wk.delta : null;
        // The `*` marks a week still in progress — without it this line reads
        // "12 wk pts ▲+2" as though the 12 and the +2 were the same comparison.
        const wkPartial = !!(wk && wk.partial);
        const streak = c.streaks && c.streaks.current != null ? c.streaks.current + "d streak" : null;
        const contact = c.lastContact ? dashRelDay(role === "nutritionist" ? c.lastContact.nutritionist : c.lastContact.trainer) : null;
        // Owned = this pro acts on it; routed = the other discipline's signal,
        // shown read-only (or owned when this pro is the only one on the client).
        const ownedFlags = r.flags.filter((f) => f.owned);
        const routedFlags = r.flags.filter((f) => !f.owned).concat(r.readOnly || []);
        const pills = ownedFlags.slice(0, 2).map((f) => f.label);
        const extra = ownedFlags.length - 2;
        return (
          <div key={c.profile.id || i}
            onClick={() => openDrawer(r)}
            onKeyDown={(e) => { if (drawerReady && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDrawer(r); } }}
            role={drawerReady ? "button" : undefined}
            tabIndex={drawerReady ? 0 : undefined}
            aria-label={drawerReady ? "Open " + c.profile.name + " drilldown" : undefined}
            style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", cursor: drawerReady ? "pointer" : "default" }}>
            <span title={r.severity} style={{ width: 7, height: 7, borderRadius: 2, background: sevColor, animation: r.severity === "red" ? "dashTick 1.6s ease-in-out infinite" : "none" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{c.profile.name}</span>
                {pills.map((p, j) => <DashPill key={j} c={sevColor}>{p}</DashPill>)}
                {extra > 0 && <DashPill c={sevColor}>+{extra}</DashPill>}
                {routedFlags.slice(0, 2).map((f, j) => f.owned
                  ? <DashPill key={"ro" + j} c={sevColor}>{f.label}</DashPill>
                  : <DashPill key={"ro" + j} c={inkMutedPill}>{f.label} {f.routeTo === "nutritionist" ? "→ dietitian" : "→ trainer"}</DashPill>)}
                {isNew && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}
                {r.severity === "green" && !isNew && <DashPill c={DASH_SEV_COLORS.green}>On track</DashPill>}
              </div>
              <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.05em", color: ink50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[
                  streak,
                  wkPts != null ? <span key="p" title={wkPartial ? "Week in progress · the delta is the last two full weeks" : undefined}>{wkPts}{wkPartial ? "*" : ""} wk pts{delta != null && <span style={{ color: delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}>{" "}{delta >= 0 ? "▲+" + delta : "▼−" + Math.abs(delta)}</span>}</span> : null,
                  contact ? "spoke " + contact : null,
                ].filter(Boolean).map((part, j, arr) => <React.Fragment key={j}>{part}{j < arr.length - 1 ? " · " : ""}</React.Fragment>)}
                {streak == null && wkPts == null && contact == null && "—"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* ⚠ THE PIN IS ON THE ROW, NOT IN THE CARD'S ⚙, and that is a reading of
                  what the control IS rather than a shortcut. The gear holds settings that
                  belong to the card; pinning is an act about ONE client, and routing it
                  through a popover listing the whole roster would be a worse control for
                  the same preference. It is also why the pulse gets no gear at all: a
                  card with nothing card-level to configure gets none (R18's rule). */}
              {canPin && (
                <button
                  type="button"
                  aria-pressed={pinSet.has(c.profile.id)}
                  title={pinSet.has(c.profile.id) ? "Unpin " + c.profile.name : "Pin " + c.profile.name + " to the top"}
                  onClick={(e) => { e.stopPropagation(); onTogglePin(c.profile.id); }}
                  style={{ flexShrink: 0, background: "transparent", border: 0, padding: "7px 4px", lineHeight: 1, fontSize: 13, cursor: "pointer", color: pinSet.has(c.profile.id) ? "#2ee0c4" : "rgba(242,237,228,0.3)" }}
                >{pinSet.has(c.profile.id) ? "\u2691" : "\u2690"}</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); dashMessageClient(c.profile.name, role, dashMessageDraft(r)); }} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", background: "rgba(46,224,196,0.08)", border: "1px solid rgba(46,224,196,0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>
                Message
              </button>
            </div>
          </div>
        );
  };


  return (
    <div>
      <style>{"@keyframes dashTick{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}"}</style>
      {/* Joint attention (step 9.2): the same client is slipping on BOTH the
          training and nutrition side — one coordinated message, not two nudges. */}
      {joint.slice(0, 2).map((j, i) => (
        <div key={"joint-" + i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10, padding: "10px 13px", background: "rgba(224,100,75,0.07)", border: "1px solid rgba(224,100,75,0.3)", borderLeft: "3px solid #e0644b", borderRadius: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#e0644b" }}>Joint attention · with their {role === "nutritionist" ? "trainer" : "nutritionist"}</div>
            <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.85)", marginTop: 4, lineHeight: 1.45 }}>
              <b>{j.client.profile.name}</b> is slipping on both sides — {j.trainingFlags.map((f) => f.label.toLowerCase()).join(", ")} and {j.nutritionFlags.map((f) => f.label.toLowerCase()).join(", ")}. One coordinated message beats two separate nudges.
            </div>
          </div>
          <button onClick={() => dashMessageClient(j.client.profile.name, role, dashJointDraft(j, role))} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", background: "#e0644b", border: 0, borderRadius: 4, padding: "8px 12px", cursor: "pointer" }}>Start joint note</button>
        </div>
      ))}
      {pinnedRows.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {/* ⚠ LABELLED AS THE COACH'S OWN PICKS, not as a verdict. Without the heading a
              green pinned row sitting above a red one reads as the engine getting triage
              wrong; with it, it reads as the coach saying "keep these in front of me",
              which is what it is — and every unpinned at-risk row is still directly
              below, so nothing is hidden. */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ink50, padding: "2px 4px 6px" }}>
            Pinned · {pinnedRows.length}
          </div>
          {pinnedRows.map((r, i) => renderRow(r, i))}
          <div aria-hidden style={{ height: 1, background: "rgba(242,237,228,0.1)", margin: "10px 4px 2px" }} />
        </div>
      )}
      {rows.map((r, i) => renderRow(r, i))}
      {openRow && <DashClientDrawer row={openRow} role={role} onClose={() => setOpenRow(null)} prefs={prefs} />}
    </div>
  );
}


// Demo-mode band — whenever the data layer fell back to the demo dataset
// (signed out, wrong role, or the API is down) the page SAYS so, exactly like
// the profiles' preview band. Demo data must never look like real tracking.
function DashDemoBand() {
  // Fixed BOTTOM banner (not a top strip). It's placed before the position:fixed
  // header on every dash page, so an in-flow top band was hidden behind the header
  // yet still pushed the whole dashboard down — a phantom gap under the nav bar.
  // Pinning it to the bottom (like the mobile preview banner) keeps the demo
  // notice visible while letting content sit flush under the header.
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 16px", background: "rgba(16,20,18,0.92)", borderTop: "1px solid rgba(30,192,168,0.3)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", textAlign: "center" }}>
      <span>Preview · demo data — an example of a live account</span>
      <a href="/login" style={{ flexShrink: 0, color: "#06110e", background: "#1ec0a8", borderRadius: 999, padding: "4px 12px", textDecoration: "none" }}>Sign in →</a>
    </div>
  );
}

// ── Step 8 business panels — real data or an honest "connects soon" state ───

// 90-day growth: weekly subscriber adds + the MRR they brought. Live series
// is REAL (subscriptions.created_at); payout-flavored history stays "—" until
// payouts go live. Demo shows the example series.
const DASH_DEMO_GROWTH = {
  trainer: { weeklyAdds: [1, 0, 2, 1, 3, 1, 2, 2, 1, 3, 2, 4, 3].map((c, i) => ({ weekOf: "w" + i, count: c, addedCents: c * 20000 })), momPct: 9 },
  nutritionist: { weeklyAdds: [0, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 2].map((c, i) => ({ weekOf: "w" + i, count: c, addedCents: c * 16000 })), momPct: 12 },
};
function DashGrowthPanel({ live, role }) {
  const g = live ? (live.growth || null) : DASH_DEMO_GROWTH[role];
  const ink50 = "rgba(242,237,228,0.55)";
  if (!g || !Array.isArray(g.weeklyAdds) || !g.weeklyAdds.length) {
    return <div style={{ fontSize: 13, color: ink50 }}>Growth history connects when payouts go live — current numbers are in the stat bar.</div>;
  }
  const counts = g.weeklyAdds.map((w) => w.count);
  const max = Math.max(...counts, 1);
  const totalAdds = counts.reduce((s, c) => s + c, 0);
  const addedCents = g.weeklyAdds.reduce((s, w) => s + (w.addedCents || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 56, flex: 1, minWidth: 200 }}>
          {counts.map((c, i) => (
            <div key={i} title={c + " new"} style={{ flex: 1, height: Math.max(6, Math.round((c / max) * 100)) + "%", background: c ? "#2ee0c4" : "rgba(242,237,228,0.1)", opacity: c ? 0.4 + 0.6 * (i / counts.length) : 1, borderRadius: 1 }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 22, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1 }}>{totalAdds}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 4 }}>New subscribers · 90d</div>
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1 }}>{dashMoney(addedCents)}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 4 }}>MRR added · gross</div>
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1, color: g.momPct == null ? ink50 : g.momPct >= 0 ? "#7bbf5a" : "#e0644b" }}>{g.momPct == null ? "—" : (g.momPct >= 0 ? "+" : "") + g.momPct + "%"}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 4 }}>Adds · MoM</div>
          </div>
        </div>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", color: ink50, marginTop: 10 }}>
        Weekly subscriber adds · payout history connects when payouts go live
      </div>
    </div>
  );
}

// Marketplace funnel: profile views → consults → signed. Views aren't tracked
// yet → honest "connects soon"; consults + signings are real on live.
const DASH_DEMO_FUNNEL = { views: 1240, consults90: 86, signed90: 34 };
const DASH_FUNNEL_BENCHMARK = 30; // % consult→signed close rate, marketplace norm
function DashFunnelPanel({ live }) {
  const f = live ? (live.funnel || null) : DASH_DEMO_FUNNEL;
  const ink50 = "rgba(242,237,228,0.55)";
  if (!f) return <div style={{ fontSize: 13, color: ink50 }}>Funnel data connects soon.</div>;
  const stages = [
    { l: "Profile views", v: f.views, note: f.views == null ? "view tracking connects soon" : null },
    { l: "Consults · 90d", v: f.consults90 },
    { l: "Signed clients · 90d", v: f.signed90 },
  ];
  const maxV = Math.max(...stages.map((s) => s.v || 0), 1);
  const close = f.consults90 > 0 ? Math.round((f.signed90 / f.consults90) * 100) : null;
  const insight = close != null
    ? close >= DASH_FUNNEL_BENCHMARK
      ? "Your consult→client close rate is " + close + "% — above the ~" + DASH_FUNNEL_BENCHMARK + "% marketplace benchmark. The lever now is more consults at the top."
      : "Your consult→client close rate is " + close + "% vs the ~" + DASH_FUNNEL_BENCHMARK + "% benchmark — tightening the intake call converts more of the consults you already get."
    : "Book consults from the marketplace to start the funnel — signings are tracked automatically.";
  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 12, alignItems: "center", padding: "7px 0" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: ink50 }}>{s.l}</span>
          <div style={{ position: "relative", height: 9, background: "rgba(242,237,228,0.07)", borderRadius: 2 }}>
            {s.v != null && <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.max(3, Math.round((s.v / maxV) * 100)) + "%", background: "#2ee0c4", opacity: 0.45 + i * 0.27, borderRadius: 2 }} />}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: s.v == null ? ink50 : "#f2ede4", fontStyle: s.v == null ? "italic" : "normal" }}>{s.v == null ? s.note : s.v.toLocaleString()}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed rgba(242,237,228,0.16)", marginTop: 8, paddingTop: 9, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", color: ink50 }}>BENCHMARK · ~{DASH_FUNNEL_BENCHMARK}% CONSULT→SIGNED</span>
        {close != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: close >= DASH_FUNNEL_BENCHMARK ? "#7bbf5a" : "#d8a23a" }}>YOU · {close}%</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.75)", lineHeight: 1.55, marginTop: 9 }}>{insight}</div>
    </div>
  );
}

// The dashboard's Business card (Business-page step) — ONE summary plate that
// replaces the separate Growth + Funnel sections on Today and links to the
// full Business page (revenue trend · payouts · funnel · churn). Money
// honesty: monthly net derives from real subscriptions; payout-flavored
// numbers never appear here — the Business page owns those (real or "—").
function DashBusinessSummary({ live, role, clients }) {
  const ink50 = "rgba(242,237,228,0.55)";
  const g = live ? (live.growth || null) : DASH_DEMO_GROWTH[role];
  const f = live ? (live.funnel || null) : DASH_DEMO_FUNNEL;
  const counts = g && Array.isArray(g.weeklyAdds) ? g.weeklyAdds.map((w) => w.count) : null;
  const adds90 = counts ? counts.reduce((s, c) => s + c, 0) : null;
  const close = f && f.consults90 > 0 ? Math.round((f.signed90 / f.consults90) * 100) : null;
  const netCents = live
    ? (live.kpis && live.kpis.monthlyNetCents != null ? live.kpis.monthlyNetCents : null)
    : Math.round(clients.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0) * 0.85);
  const href = role === "nutritionist" ? "NutritionistAnalytics.html" : "TrainerAnalytics.html";
  const max = counts ? Math.max(...counts, 1) : 1;
  const stat = (k, l, sub, color) => (
    <div>
      <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1, color: color || (k === "—" ? ink50 : "#f2ede4") }}>{k}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 4 }}>{l}</div>
      {sub && <div style={{ fontSize: 10, color: ink50, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
        {stat(netCents != null ? dashMoney(netCents) : "—", "Monthly · net", netCents != null ? "from active subs · after 15%" : "no subscription data")}
        {stat(adds90 != null ? "+" + adds90 : "—", "New subs · 90d", g && g.momPct != null ? (g.momPct >= 0 ? "+" : "") + g.momPct + "% MoM" : "MoM needs 2 months")}
        {stat(close != null ? close + "%" : "—", "Consult → signed", "benchmark ~" + DASH_FUNNEL_BENCHMARK + "%", close == null ? null : close >= DASH_FUNNEL_BENCHMARK ? "#7bbf5a" : "#d8a23a")}
        {counts && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, flex: 1, minWidth: 120 }}>
            {counts.map((c, i) => (
              <div key={i} style={{ flex: 1, height: Math.max(5, Math.round((c / max) * 100)) + "%", background: c ? "#2ee0c4" : "rgba(242,237,228,0.1)", opacity: c ? 0.4 + 0.6 * (i / counts.length) : 1, borderRadius: 1 }} />
            ))}
          </div>
        )}
      </div>
      <a href={href} style={{ display: "inline-block", marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", textDecoration: "none" }}>
        Revenue · payouts · funnel · churn →
      </a>
    </div>
  );
}

// Nutritionist roster aggregates + the recipe-publishing insight.
function DashNutriAggPanel({ clients, live }) {
  const ink50 = "rgba(242,237,228,0.55)";
  const withLogs = clients.filter((c) => c.foodLogs && c.foodLogs.daysLogged7d != null);
  const avgCompliance = withLogs.length
    ? Math.round((withLogs.reduce((s, c) => s + Math.min(7, c.foodLogs.daysLogged7d), 0) / (withLogs.length * 7)) * 100)
    : null;
  const pctLogged = withLogs.length
    ? Math.round((withLogs.filter((c) => c.foodLogs.daysLogged7d > 0).length / withLogs.length) * 100)
    : null;
  const renewals = live ? null : 4; // billing dates aren't exposed yet
  const cellStyle = { background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 8, padding: "13px 15px" };
  const stat = (k, l, sub) => (
    <div style={cellStyle}>
      <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1, color: k === "—" ? ink50 : "#f2ede4" }}>{k}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 5 }}>{l}</div>
      {sub && <div style={{ fontSize: 10, color: ink50, marginTop: 3 }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {stat(avgCompliance != null ? avgCompliance + "%" : "—", "Avg compliance · 7d", avgCompliance == null ? "no shared logs yet" : null)}
        {stat(pctLogged != null ? pctLogged + "%" : "—", "Logged this week", pctLogged == null ? "no shared logs yet" : null)}
        {stat(renewals != null ? String(renewals) : "—", "Renewals due · 30d", renewals == null ? "connects when billing dates go live" : null)}
      </div>
      <div style={{ marginTop: 12, padding: "12px 15px", background: "rgba(216,162,58,0.07)", border: "1px solid rgba(216,162,58,0.25)", borderLeft: "3px solid #d8a23a", borderRadius: 4 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d8a23a" }}>Insight · recipes</div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.8)", lineHeight: 1.55, marginTop: 6 }}>
          Clients with fresh recipes in their plan log meals more consistently — your lowest-compliance clients are the first place a new recipe drop pays off.
        </div>
        <a href={dashShellHref("NutritionistPlans.html")} style={{ display: "inline-block", marginTop: 9, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d8a23a", textDecoration: "none" }}>Publish a recipe →</a>
      </div>
    </div>
  );
}

// One strip's four remembered slots.
//
// ⚠ FOUR HOOKS, WRITTEN OUT, NOT A LOOP. The count is fixed by construction rather than
// by a constant somebody could later derive from data — the rules-of-hooks class this
// repo post-mortems, which neither the build nor `tsc` nor the suite catches.
//
// ⚠ AND ONE KEY PER SLOT RATHER THAN ONE ARRAY, because `useRememberedChoice` validates a
// stored value against the pool and ignores what it does not recognise: a retired metric
// then costs that ONE slot its default, where a stored array would have to be validated
// element by element or discarded whole.
function useDashKpiStrip(prefs, strip, role, defaults) {
  const base = "kpi:" + role + ":" + strip + ":";
  // ⚠ ONE HOOK OVER FOUR KEYS, NOT FOUR HOOKS — because a swap changes TWO slots and
  // four independent hooks would take that to the document as two separate
  // whole-document writes. A first that lands beside a second that fails leaves the
  // same metric in both slots on the next reload, which is the one thing the swap
  // exists to prevent. `useRememberedSlots` writes the whole arrangement in one
  // operation and still validates each slot on its own key, so a retired metric costs
  // only its own slot. (Codex, #2046.)
  return useRememberedSlots(prefs, [base + "0", base + "1", base + "2", base + "3"], DashSignals.DASH_KPI_KEYS, defaults);
}

// ── The shared page ─────────────────────────────────────────────────────────
function CoachDashboardPage({ role }) {
  const cfg = DASH_TODAY_ROLES[role];
  const { today: live, triage, clients, queue, joint, source } = useDashboard(role);
  // The coach's pinned clients, per ACCOUNT (review 2026-09-09, R15) — the same
  // `dashboard_prefs` document the roster filter and the Schedule view already use, so a
  // pin follows them between devices and costs no second mechanism.
  //
  // ⚠ THE KEY IS PER ROLE. One auth user can own both a trainer and a nutritionist row,
  // and the two Todays show different rosters; a shared key would put a nutrition client
  // at the top of the training pulse. The same split `coach_week_publishes` needed.
  const prefs = useRememberedChoices(source === "live");
  const [pinned, togglePin] = useRememberedSet(prefs, "pulsePinned:" + role, 12);

  // Which four figures each strip shows (review 2026-09-09, R15) — per account AND per
  // role, because one auth user can own a trainer row and a nutritionist row and the two
  // Todays measure different practices. `useRememberedChoice` deletes a key whose value
  // equals the default, so a coach who never opens the ⚙ stores nothing at all.
  const [overviewKpis, setOverviewKpis] = useDashKpiStrip(prefs, "overview", role, DASH_OVERVIEW_DEFAULT);
  const [practiceChosen, setPracticeKpis] = useDashKpiStrip(prefs, "practice", role, DASH_PRACTICE_DEFAULT);

  const firstName = live ? live.user.firstName : cfg.mockName;

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

  // Everything the KPI pool derives from, gathered once. Nothing here is fetched for the
  // strips — it is the state Today already holds — which is the constraint that decides
  // what may be in the pool at all.
  const kpiCtx = { live, clients, triage, queue, schedule, role, kpiKeys: cfg.kpiKeys };

  // ⚠ THE OVERVIEW STRIP IS THE PAYOUT PREVIEW WHEN THERE IS NO LIVE PAYLOAD, AND IT IS
  // NOT CONFIGURABLE THERE. Those four demo figures are a preview of the money card, not
  // a reading of this account, so offering a picker over them would let a visitor
  // rearrange numbers that describe nobody. R18's rule from the other side: the ⚙ is
  // withheld where there is nothing card-level to configure.
  const kpis = live ? overviewKpis.map((k) => dashKpiCell(k, role, kpiCtx)) : cfg.mockKpis();
  // The practice strip derives from the roster, the queue and today's schedule, all of
  // which the preview has — so its picker works in both states (unsaved when signed out,
  // exactly as every other remembered control on this page behaves).
  const practiceKpis = practiceChosen.map((k) => dashKpiCell(k, role, kpiCtx));

  const calendarEvents = live && Array.isArray(live.calendar)
    ? live.calendar.map(e => ({ date: dashCalDate(e.at), time: dashCalTime(e.at), kind: e.kind, title: e.title, sub: e.sub }))
    : dashDemoCalendar(cfg.mockCalendar);

  const pulseRows = live && Array.isArray(live.pulse) ? live.pulse : null;
  const pulse = !pulseRows
    ? cfg.mockPulse
    : pulseRows.length
      ? pulseRows.map(c => ({ who: c.name, sub: c.sessions + (c.sessions === 1 ? " " + cfg.unit : " " + cfg.unit + "s"), trend: DASH_FLAT_TREND }))
      : [cfg.emptyPulse];

  // ── Coach Today as a draggable DashGrid (role-scoped, tab="today"). Each section below
  // becomes a widget; the date/greeting/CTAs stay as the page header (DashShell topbar).
  const dashPanelStyle = { background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24 };
  const renderPanel = (title, children) => (
    <div style={dashPanelStyle}>
      {title && <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{title}</div>}
      {children}
    </div>
  );
  const renderKpiStrip = (row) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${row.length},1fr)`, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, overflow: "hidden" }}>
      {row.map((k, i) => (
        <div key={i} style={{ padding: "20px 20px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none", minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", marginBottom: 10, textTransform: "uppercase" }}>{k.l}</div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{k.k}</div>
          {k.sub && <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 6 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
  const gridWidgets = [
    { key: "kpis", title: "Overview", size: "full", render: () => renderKpiStrip(kpis),
      settings: live ? dashKpiSettings(overviewKpis, role, setOverviewKpis) : undefined },
    { key: "practice", title: "Practice", size: "full", render: () => renderKpiStrip(practiceKpis),
      settings: dashKpiSettings(practiceChosen, role, setPracticeKpis) },
    { key: "schedule", title: cfg.scheduleTitle, size: "half", render: () => renderPanel(cfg.scheduleTitle, <ExpandableSchedule schedule={schedule} clients={clients} role={role} />) },
    { key: "pulse", title: "Client pulse", size: "half", render: () => renderPanel("Client pulse", <TriagePulsePanel feed={triage} role={role} joint={joint} pinned={pinned} onTogglePin={togglePin} prefs={prefs} />) },
    ...(cfg.programmingQueue ? [{ key: "queue", title: "Programming queue", size: "full", render: () => renderPanel("Programming queue", <ProgrammingQueuePanel queue={queue} role={role} live={source === "live"} />) }] : []),
    { key: "wins", title: "Client wins", size: "full", render: () => renderPanel("Client wins", <DashWinsPanel clients={clients} role={role} />) },
    ...(role === "nutritionist" ? [{ key: "roster", title: "Roster health", size: "full", render: () => renderPanel("Roster health", <DashNutriAggPanel clients={clients} live={live} />) }] : []),
    { key: "business", title: "Business", size: "full", render: () => renderPanel("Business", <DashBusinessSummary live={live} role={role} clients={clients} />) },
  ];

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
    <DashShell
      tourHero="hero-today"
      role={role}
      gridWidgets={gridWidgets}
      userName={firstName}
      date={cfg.date()}
      greeting={cfg.greeting(firstName)}
      primaryCta={cfg.primaryCta}
      secondaryCta={cfg.secondaryCta}
      navItems={cfg.navItems()}
      payoutCard={live
        ? { label: "MONTHLY · NET", amount: live.kpis.monthlyNetCents != null ? dashMoney(live.kpis.monthlyNetCents) : "—", sub: live.kpis.activeClients + " active subs · payouts connect soon" }
        : cfg.payoutCard()}
      kpis={kpis}
      kpis2={practiceKpis}
      scheduleTitle={cfg.scheduleTitle}
      calendarEvents={calendarEvents}
      schedule={schedule}
      pulseTitle="Client pulse"
      pulse={pulse}
      pulseRender={cfg.triagePulse ? () => <TriagePulsePanel feed={triage} role={role} joint={joint} pinned={pinned} onTogglePin={togglePin} prefs={prefs} /> : undefined}
      scheduleRender={cfg.expandSchedule ? () => <ExpandableSchedule schedule={schedule} clients={clients} role={role} /> : undefined}
      extraSections={[
        ...(cfg.programmingQueue ? [{
          title: "Programming queue",
          render: () => <ProgrammingQueuePanel queue={queue} role={role} live={source === "live"} />,
        }] : []),
        {
          title: "Client wins",
          render: () => <DashWinsPanel clients={clients} role={role} />,
        },
        ...(role === "nutritionist" ? [{
          title: "Roster health",
          render: () => <DashNutriAggPanel clients={clients} live={live} />,
        }] : []),
        // The Business summary card — the full zones (revenue trend, payout
        // schedule + history, funnel, churn) moved to the Business page.
        {
          title: "Business",
          render: () => <DashBusinessSummary live={live} role={role} clients={clients} />,
        },
      ]}
    />
    </React.Fragment>
  );
}

Object.assign(window, { CoachDashboardPage, dashQueueRowState, dashQueueNotices, dashQueueMergeMarks, DASH_TODAY_ROLES, DASH_SEV_COLORS, DASH_FUNNEL_BENCHMARK, DashPill, DashDemoBand, TriagePulsePanel, DashWinsPanel, ProgrammingQueuePanel, DashGrowthPanel, DashFunnelPanel, DashNutriAggPanel, DashBusinessSummary, dashMessageClient, dashMessageDraft, dashCongratsDraft, dashJointDraft, dashClientHref, dashClientPageHref, dashRelDay, dashContextLine, dashMoney, dashFmtTime, dashCalDate, dashCalTime });
