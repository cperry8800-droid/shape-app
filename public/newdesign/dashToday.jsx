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
// ⚠ AN INSTANT PRINTS ON THE VIEWER'S CLOCK (P9, owner 2026-11-05: "all time zones should be set by
// user"): the account's zone, from shapeZone.mjs (window.ShapeZone, a module script read at call
// time, so it may land after this file). Without it, this browser's clock, as before.
// ⚠ TODAY'S CLOCKS READ IN THE ZONE ITS DAY WAS CUT IN (Codex on #2620). The dashboard routes pick
// Today's sessions on the coach's clock (`dayZone`: the listing's zone, which the database copies
// from the account's), so a New York coach in London sees New York's day; its times print in that
// zone too. No zone, or one this browser can't read, prints the viewer's clock.
function dashZoneLib() {
  try {
    const Z = typeof window !== "undefined" ? window.ShapeZone : null;
    return Z && typeof Z.partsInZone === "function" && typeof Z.viewerZone === "function" ? Z : null;
  } catch (e) { return null; }
}
function dashFmtTime(iso, zone) {
  const Z = dashZoneLib();
  if (Z) { const s = Z.formatTime(iso, { zone: zone || undefined, hour12: false }); if (s) return s; }
  const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
  try { return new Date(iso).toLocaleTimeString([], zone ? { ...opts, timeZone: zone } : opts); }
  catch (e) {
    try { return new Date(iso).toLocaleTimeString([], opts); } catch (e2) { return ""; }
  }
}
// A local Date's own calendar fields as "YYYY-MM-DD": for the days this page builds itself.
function dashLocalDate(d) {
  try { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  catch (e) { return ""; }
}
// An instant's calendar date and "HH:MM" on the viewer's clock (the calendar and the week ahead).
function dashCalDate(iso) {
  const Z = dashZoneLib();
  if (Z) return Z.dayKey(iso);
  try { return dashLocalDate(new Date(iso)); } catch (e) { return ""; }
}
function dashCalTime(iso) {
  const Z = dashZoneLib();
  if (Z) return Z.clockHM(iso);
  try { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  catch (e) { return ""; }
}
// Today on the viewer's clock, as a local Date at noon whose own fields are that day: the week
// ahead (DashSignals.dashWeekAhead) walks local days from it. This browser's today without ShapeZone.
function dashViewerToday() {
  const Z = dashZoneLib();
  const p = Z ? Z.partsInZone(Date.now(), Z.viewerZone()) : null;
  return p ? new Date(p.y, p.mo - 1, p.d, 12) : new Date();
}
// "YYYY-MM-DD" `n` days from today on `zone`'s clock; this browser's without ShapeZone or a zone.
function dashDayKeyFrom(zone, n) {
  const Z = zone ? dashZoneLib() : null;
  const p = Z && Z.normalizeZone(zone) ? Z.partsInZone(Date.now(), zone) : null;
  if (!p) { const t = new Date(); return dashLocalDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n)); }
  const u = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
  return u.getUTCFullYear() + "-" + String(u.getUTCMonth() + 1).padStart(2, "0") + "-" + String(u.getUTCDate()).padStart(2, "0");
}
// The instant `zone`'s wall clock reads `minute` past midnight on y-mo-d. Two passes, as
// src/lib/time.ts instantInZone: an offset can only be asked for at an instant, and the second ask,
// at the corrected one, is what makes a clock-change day right.
function dashWallInstant(Z, zone, y, mo, d, minute) {
  const naive = Date.UTC(y, mo - 1, d, 0, minute);
  const o1 = Z.offsetMinutes(zone, naive);
  let t = naive - o1 * 60000;
  const o2 = Z.offsetMinutes(zone, t);
  if (o2 !== o1) t = naive - o2 * 60000;
  return t;
}
// Re-render when the viewer's zone is set or changes (shapeZone.mjs's event, sent by the Settings
// control and the once-a-page account read).
function useDashZoneTick() {
  const [, setN] = React.useState(0);
  React.useEffect(() => {
    const h = () => setN((n) => n + 1);
    window.addEventListener("shape:timezone", h);
    return () => window.removeEventListener("shape:timezone", h);
  }, []);
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
    { k: dashMoney(p.thisMonthCents), l: "This month", sub: "net · after Shape's fee" },
    { k: dashMoney(p.lifetimeCents), l: "Lifetime", sub: p.months + " month" + (p.months === 1 ? "" : "s") + " on Shape" },
  ];
  _dashDemoKpis = { key, v };
  return v;
}

function dashMoney(cents) {
  try { return "$" + Math.round((cents || 0) / 100).toLocaleString(); }
  catch (e) { return "$0"; }
}

// ⚠ THE SIDEBAR'S MONEY CARD IS THE NEXT PAYOUT (coach dashboard step 4a). It was "MONTHLY · NET ·
// 10 clients · payouts connect soon" (dashLivePayoutCard) long after payouts connected; every coach
// page now hands the sidebar its demo card, and the sidebar (trainerDashboard.jsx DashSidebar) shows
// Stripe's next payout through the read Today's Money card makes (useDashNextPayout), in the same
// states: next, none, setup, unread, loading, and the preview's sample (dashPayoutSidebarCard below).

// ── The KPI picker (review 2026-09-09, R15) ─────────────────────────────────
// Which four figures each Today stat strip shows, chosen per account and per role.
// The pool and every derivation live in dashSignals.js; this file owns the FORMATTING,
// because `dashMoney` and the strip's typography are its own.
const DASH_OVERVIEW_DEFAULT = ["activeClients", "monthlyNet", "weekSessions", "upcoming"];
const DASH_PRACTICE_DEFAULT = ["todaySessions", "due", "compliance", "mrr"];

// ⚠ A ROSTER THAT COULD NOT BE READ IS NOT AN EMPTY ONE (useDashboard's source "unread", handed in
// as `ctx.rosterUnread`). The pool's figures built on the roster, its programming queue or its pulse
// would count 0 over the empty list it hands back; each is "—", couldn't be read. The day feed's own
// figures (its KPIs, today's sessions) still show when that read answered: the client count and the
// net are the feed's when it sent them, the roster's only without it. ⚠ AND "live only" IS THE
// PREVIEW'S WORD: on a page that is not the preview, a figure the feed didn't send couldn't be read.
// Before the page's first read lands (`ctx.waiting`, source null) every figure is still loading.
const DASH_KPI_FROM_ROSTER = ["due", "compliance", "mrr", "reviewed", "needsEyes", "newClients"];
function dashKpiFromRoster(key, ctx) {
  if (DASH_KPI_FROM_ROSTER.indexOf(key) !== -1) return true;
  return (key === "activeClients" || key === "monthlyNet") && !(ctx && ctx.live && ctx.live.kpis);
}
function dashKpiOut(key, ctx) {
  const out = DashSignals.dashKpiValue(key, ctx);
  if (!out || !ctx) return out;
  if (ctx.waiting) return { value: null, unit: out.unit, why: "loading" };
  if (ctx.rosterUnread) {
    if (dashKpiFromRoster(key, ctx)) return { value: null, unit: out.unit, why: "couldn't be read" };
    if (out.value == null && out.why === "live only") return { ...out, why: "couldn't be read" };
  }
  return out;
}

function dashKpiCell(key, role, ctx) {
  const label = DashSignals.dashKpiLabel(key, role);
  const out = dashKpiOut(key, ctx);
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

const DASH_INK50 = "var(--sh-ink2, #a09b94)";
const DASH_MONO_EYEBROW = { fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_INK50 };
// An in-card text link is a control, so it gets the 24px hit area the chrome has —
// the glyph does not move (the vertical padding is cancelled by a negative margin).
const DASH_MONO_LINK = { ...DASH_MONO_EYEBROW, display: "inline-flex", alignItems: "center", minHeight: 24, margin: "-5px 0", textDecoration: "none", whiteSpace: "nowrap" };

// ⚠ THESE STAY LITERAL, BY RULE RATHER THAN BY OVERSIGHT. Each colour below is
// handed to DashPill, which composes its tint and its two borders by APPENDING a
// hex-alpha suffix to it (`c + "1c"`, `c + "55"`), so a var() here is not a colour
// and CSS drops the whole declaration — measured, every severity pill on both coach
// Today tabs lost its tint, its border and its padding, and the page got 16px
// shorter. Tokenising them means teaching DashPill to take a triplet, which is a
// change of behaviour rather than a rename, and it belongs with the light-paper
// values where the tint actually has to move. They are also SEMANTIC rather than
// paper colours (severity, not ground), so they do not follow the paper anyway.
// tests/newdesign-paper-tokens.test.mjs holds the rule.
// ⚠ CORRECTED with the light paper: the severity colours DO follow it now. On white
// the dark paper's #e0644b reads at 3.3:1 and its teal at 1.6:1, so each severity
// reads the role/state token whose light value clears AA as text (rust #b24c36,
// gold #86662a, teal #0a7a72, green #387a2b; tests/newdesign-paper-pairs.test.mjs
// holds the floors — the first light values, #c0533b / #a07a2e / #0a8f87, did NOT,
// at 4.26 / 3.64 / 3.66:1 on the ground); the dark switch resolves every one
// back to the literal it carried before. DashPill composes its tint through
// ssAlpha, which keeps a token as rgba(var(--x-rgb, …), a).
const DASH_SEV_COLORS = { red: "var(--sh-rust, #e0644b)", amber: "var(--sh-gold, #d8a23a)", new: "var(--sh-accent, #2ee0c4)", green: "var(--sh-green, #7bbf5a)", unknown: "var(--sh-ink2, #a09b94)" };

function DashPill({ c, children }) {
  return (
    <span style={{ display: "inline-block", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c, background: ssAlpha(c, 0.09), border: "1px solid " + ssAlpha(c, 0.33), borderLeft: "3px solid " + c, borderRadius: 4, padding: "3px 8px" }}>
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
// ⚠ EXCEPT A COACH WITH THE CLIENT'S ID (client-onboarding review, fix 3a, H7). The bubble lists a
// coach's OWN coaches, never their clients' threads, so a coach's Message opened an empty thread
// that nobody else could see. With the id, it opens the Messages page on the thread the client
// sees (TrainerMessages.html / NutritionistMessages.html ?client=), created if it is not there yet.
// Only a real account id (a uuid): a demo client ("demo-3") or the member's own "me" keeps the bubble.
function dashMessageHref(role, clientId, draft) {
  if ((role !== "trainer" && role !== "nutritionist") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(clientId || ""))) return null;
  const page = role === "nutritionist" ? "NutritionistMessages.html" : "TrainerMessages.html";
  return "/newdesign/" + page + "?client=" + encodeURIComponent(clientId) + (draft ? "&draft=" + encodeURIComponent(String(draft).slice(0, 1000)) : "");
}
function dashMessageClient(name, role, draft, clientId) {
  const href = dashMessageHref(role, clientId, draft);
  if (href) { window.location.href = href; return; }
  const opts = { who: name || undefined, draft: draft || undefined, tab: !name && role === "client" ? "trainers" : undefined };
  try { if (typeof window.__openChatTo === "function") { window.__openChatTo(opts); return; } } catch (e) {}
  try { if (typeof window.__openChat === "function") { window.__openChat(opts, opts.tab); return; } } catch (e) {}
  // Bubble script not ready yet: stash the request and click the launcher —
  // the widget consumes __openChatRequest the moment it mounts.
  const b = document.getElementById("shape-global-chat-button");
  if (b) { window.__openChatRequest = opts; b.click(); }
}

// One-tap drafts — the coach's opener for the client.
// ⚠ WRITTEN TO THE CLIENT, NEVER FROM THE COACH'S REASON (P2, 2026-11-05). This pasted the engine's
// reason into the opener, lower-cased into the coach's voice, so a client read "I'm seeing answered
// yes on the health screening — read it before programming": a note to the coach, sent to them. The
// draft is the coach action's own member wording (DashSignals.memberDraft, on the row's `lead`), and a
// row whose move is not a message drafts nothing. tests/coach-actions.test.mjs holds every draft free
// of every reason the engine can write.
function dashMessageDraft(row) {
  if (!row || !row.client) return null;
  const action = row.lead && row.lead.action;
  return action && action.kind === "message" && action.draft ? action.draft : null;
}
function dashCongratsDraft(client, hit) {
  const first = String(client.profile.name).split(" ")[0];
  return first + " — " + hit.label + ". That's earned, not given. What are we pointing at next?";
}
// Joint attention's note goes to the CO-COACH in the private care-team thread (P2): coach to coach, so
// it may name what each side sees. It was a message to the client that told the other coach nothing.
function dashJointDraft(j, role) {
  const client = String(j.client.profile.name).split(" ")[0];
  const coach = j.coCoach && j.coCoach.name ? " " + String(j.coCoach.name).split(" ")[0] : "";
  const labels = j.trainingFlags.concat(j.nutritionFlags).slice(0, 2).map((f) => f.label.toLowerCase());
  return "Hi" + coach + " — " + client + " is slipping on both sides this week (" + labels.join(" + ") + "). Can we agree one plan before either of us messages them?";
}
// Open the private care-team thread with the co-coach (the route the client page's Care team uses),
// with the joint draft in the composer. False when it cannot: a preview client, or the route refused.
async function dashOpenCareTeam(j, role) {
  const co = j && j.coCoach;
  const id = j && j.client && j.client.profile ? j.client.profile.id : null;
  if (!co || !co.userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""))) return false;
  try {
    const res = await fetch("/api/me/shared-clients/" + encodeURIComponent(id) + "/thread", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counterpartUserId: co.userId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.conversationId) return false;
    const who = co.role === "trainer" ? "Trainer" : "Nutritionist";
    const opts = { who: co.name || who, role: who + " · re: " + j.client.profile.name, conversationId: d.conversationId, draft: dashJointDraft(j, role) };
    if (typeof window.__openChatTo === "function") window.__openChatTo(opts);
    else if (typeof window.__openChat === "function") window.__openChat(opts);
    return true;
  } catch (e) { return false; }
}
// The coach's move for a row (DashSignals.COACH_ACTIONS through row.lead.action), made from the
// website: a message opens the client's thread with the member's draft; a reply opens it bare; the
// rest go where that work is done. One table for every surface, instead of one-size Message.
function dashCoachActionGo(action, row, role) {
  const c = row && row.client;
  if (!c || !c.profile) return;
  const id = c.profile.id, name = c.profile.name;
  const kind = action && action.kind;
  const go = (href) => { if (href) window.location.href = href; };
  if (kind === "review_checkin") return go(dashTabHref("week", role));
  if (kind === "read_screening") return go(dashWidgetClientHref(id, role, "health") || dashTabHref("clients", role));
  if (kind === "adjust_program") return go(dashTabHref("programs", role));
  if (kind === "adjust_plan") return go(dashTabHref("plans", role));
  if (kind === "schedule") return go(dashTabHref("schedule", role));
  return dashMessageClient(name, role, kind === "message" ? action.draft || null : null, id);
}

// Pre-session context from the unified record — the two most useful facts.
// Priority: goal proximity + projected pace (the engine's goalBrief, e.g.
// '2.8 lb to "Goal weight" · pace Jul 17') → check-in state → streak →
// adherence. Records without goals[] fall back to the legacy distance line.
function dashContextLine(rec, units) {
  if (!rec) return null;
  const parts = [];
  const brief = DashSignals.goalBrief ? DashSignals.goalBrief(rec, new Date()) : null;
  if (brief) {
    parts.push(dashGoalText(brief, units));
  } else if (rec.goal && rec.goal.target != null) {
    const now = rec.goal.now != null
      ? rec.goal.now
      : (Array.isArray(rec.weighIns) && rec.weighIns.length ? rec.weighIns[rec.weighIns.length - 1].weight : null);
    if (now != null) {
      const dist = Math.round(Math.abs(now - rec.goal.target) * 10) / 10;
      parts.push(dashGoalText(dist + " " + (rec.goal.unit || "lb") + " from goal weight", units));
    }
  }
  if (rec.checkIn) {
    const thisMonday = DashSignals._internals.mondayOf(new Date());
    const mondayIso = thisMonday.getFullYear() + "-" + String(thisMonday.getMonth() + 1).padStart(2, "0") + "-" + String(thisMonday.getDate()).padStart(2, "0");
    parts.push(rec.checkIn.lastWeekOf === mondayIso ? "check-in received" : "no check-in this week");
  }
  if (parts.length < 2 && rec.streaks && rec.streaks.current != null) parts.push(rec.streaks.current + "d streak");
  // Sessions kept over 42 days with any of their coaches, not an adherence figure (dashRoster.jsx DASH_KEPT_LABEL).
  if (parts.length < 2 && rec.trainingAdherence && rec.trainingAdherence.pct != null) parts.push(rec.trainingAdherence.pct + "% of sessions kept");
  return parts.length ? parts.slice(0, 2).join(" · ") : null;
}

// ⚠ BY ID WHEN THE ROW HAS ONE, AND A NAME ONLY WHEN IT IS ONE CLIENT'S (Codex on #2639). Two clients
// can share a display name, and the first match opened the other one's panel and file from Up next.
// A row that carries its client's id (the dashboard routes send it) finds that client or nobody; a
// row with none (the preview, an older feed) finds a name only when exactly one client has it.
function dashFindRecord(clients, who, id) {
  const list = clients || [];
  const prof = (c) => (c && c.client ? c.client.profile : c && c.profile) || null;
  if (id != null && id !== "") {
    return list.find((c) => { const p = prof(c); return !!p && p.id != null && String(p.id) === String(id); }) || null;
  }
  const key = String(who || "").trim().toLowerCase();
  if (!key) return null;
  const hits = list.filter((c) => { const p = prof(c); return !!p && String(p.name || "").trim().toLowerCase() === key; });
  return hits.length === 1 ? hits[0] : null;
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
// `rosterUnread`: the roster couldn't be read (useDashboard's "unread"), so a session's client has no
// record here to say anything about: never "No shared history yet".
function ExpandableSchedule({ schedule, clients, role, rosterUnread = false }) {
  const [openIdx, setOpenIdx] = React.useState(null);
  const units = useDashUnits();
  const actionStyle = { display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)", background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer", textDecoration: "none" };
  return (
    <div>
      {schedule.map((s, i) => {
        const open = openIdx === i;
        const rec = dashFindRecord(clients, s.who);
        const context = dashContextLine(rec, units);
        const expandable = s.time !== "—"; // skip the "No sessions today" placeholder
        return (
          <div key={i} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
            <div onClick={() => expandable && setOpenIdx(open ? null : i)} onKeyDown={(e) => { if (expandable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenIdx(open ? null : i); } }} role={expandable ? "button" : undefined} tabIndex={expandable ? 0 : undefined} aria-expanded={expandable ? open : undefined} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "14px 4px", cursor: expandable ? "pointer" : "default" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--sh-ink2, #a09b94)" }}>{s.time}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {expandable && <span style={{ display: "inline-block", width: 14, color: "var(--sh-ink3, #75706a)", fontSize: 10 }}>{open ? "▾" : "▸"}</span>}
                  {s.who}
                </div>
                <div style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)", marginTop: 2, paddingLeft: expandable ? 14 : 0 }}>{s.sub}</div>
              </div>
              {s.status && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 4,
                  background: s.status === "DONE" ? "rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : s.status === "NEXT" ? TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)",
                  color: s.status === "NEXT" ? PAPER : "var(--sh-ink2, #a09b94)",
                  border: s.status === "DONE" ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)" : "none",
                }}>{s.status}</span>
              )}
            </div>
            {open && (
              <div style={{ padding: "0 4px 14px 80px" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", color: "var(--sh-accent, #2ee0c4)", marginBottom: 9 }}>
                  {context || (rosterUnread ? DASH_ROSTER_UNREAD : "No shared history yet")}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => dashMessageClient(s.who, role, undefined, rec && rec.profile && rec.profile.id)} style={actionStyle}>Message</button>
                  {dashClientHref(rec, role) && <a href={dashClientHref(rec, role)} style={{ ...actionStyle, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)" }}>Client file</a>}
                  <a href={role === "nutritionist" ? "NutritionistLiveConsole.html" : "TrainerLiveConsole.html"} style={{ ...actionStyle, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)" }}>Start log</a>
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

  const ink50 = "var(--sh-ink2, #a09b94)"; // the paper's secondary ink; 55% of the light ink reads 3.77:1 on white
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
        const c = st.done ? DASH_SEV_COLORS.green : blocked ? DASH_SEV_COLORS.amber : DASH_SEV_COLORS.new;
        const pillText = st.pill || (blocked ? "Waiting on check-in" : "Ready");
        return (
          <div key={id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)", opacity: st.done ? 0.6 : 1 }}>
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
              <a href={dashShellHref(role === "nutritionist" ? "NutritionistPlans.html" : "TrainerPrograms.html")} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "7px 11px", textDecoration: "none" }}>Template</a>
              {st.canToggle && (
                <button onClick={() => toggle(id)} disabled={settling} style={{ opacity: settling ? 0.45 : 1, cursor: settling ? "default" : "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: st.done ? "var(--sh-ink2, #a09b94)" : "var(--sh-deep, #06231f)", background: st.done ? "transparent" : "var(--sh-accent, #2ee0c4)", border: st.done ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)" : "0", borderRadius: 4, padding: "7px 11px" }}>
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
  const ink50 = "var(--sh-ink2, #a09b94)";
  const units = useDashUnits();
  const rows = dashWinRows(clients, units);
  if (!rows.length) return <div style={{ fontSize: 13, color: ink50 }}>Milestones appear here as clients log and share progress.</div>;
  return (
    <div>
      {rows.slice(0, 4).map((r, i) => (
        <div key={r.client.profile.id || i} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none" }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--sh-green, #7bbf5a)" }} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.client.profile.name}</span>
            <span style={{ fontSize: 13, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.8)" }}> — {r.hit.label}</span>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: ink50, marginTop: 2 }}>{dashRelDay(r.hit.hitAt)}</div>
          </div>
          <button onClick={() => dashMessageClient(r.client.profile.name, role, dashCongratsDraft(r.client, r.hit), r.client.profile.id)} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-green, #7bbf5a)", background: "rgba(123,191,90,0.08)", border: "1px solid rgba(123,191,90,0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>Congratulate</button>
        </div>
      ))}
    </div>
  );
}

function TriagePulsePanel({ feed, role, joint = [], pinned, onTogglePin, prefs, dismiss }) {
  // Urgency order: at-risk (red, then amber — the feed is already sorted),
  // then brand-new clients, then on-track — with the coach's own pins lifted above it.
  //
  // ⚠ THE ORDER IS A PURE FUNCTION IN `dashSignals.js`, NOT THREE FILTERS HERE, because
  // the rule a pin has to obey ("a row appears exactly once, and a pin never removes a
  // flag from the list") is the kind of thing a filter chain gets wrong silently. It is
  // driven in tests/dash-pulse-pins.test.mjs rather than eyeballed on a card.
  const order = DashSignals.pulseOrder(feed, pinned);
  const brief = feed && feed.length && typeof DashSignals.coachBrief === "function" ? DashSignals.coachBrief(feed) : null;
  const pinnedRows = order.pinned;
  const rows = order.rest;
  const canPin = typeof onTogglePin === "function";
  const pinSet = new Set(Array.isArray(pinned) ? pinned : []);
  const ink50 = "var(--sh-ink2, #a09b94)";
  // The muted pill takes the severity table's own "unknown" ink. It was a hex literal
  // while DashPill appended hex suffixes; the pill composes through ssAlpha now, so a
  // token is valid and follows the paper (#5a6763 on the light card, 5.91:1).
  const inkMutedPill = DASH_SEV_COLORS.unknown;
  // Rows open the shared client drilldown (step 11) when dashRoster.jsx is
  // loaded on the page; the Message button keeps working either way.
  const [selectedId, setSelectedId] = React.useState(null);
  const openRow = feed.find((r) => r.client.profile.id === selectedId) || null;
  const drawerReady = typeof window !== "undefined" && typeof window.DashClientDrawer === "function";
  const openDrawer = (r) => { if (drawerReady) setSelectedId(r.client.profile.id); };

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
        // The coach's one move for this client (P2): the lead reason, in words, and its action.
        const lead = r.lead || null;
        const act = lead && lead.action;
        return (
          <div key={c.profile.id || i}
            onClick={() => openDrawer(r)}
            onKeyDown={(e) => { if (drawerReady && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDrawer(r); } }}
            role={drawerReady ? "button" : undefined}
            tabIndex={drawerReady ? 0 : undefined}
            aria-label={drawerReady ? "Open " + c.profile.name + " drilldown" : undefined}
            style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)", cursor: drawerReady ? "pointer" : "default" }}>
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
                {r.severity === "unknown" && <DashPill c={DASH_SEV_COLORS.unknown}>{(r.progress || DashSignals.progressStatus(c)).label}</DashPill>}
              </div>
              {lead && <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.4, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>{lead.reason}</div>}
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
                  style={{ flexShrink: 0, background: "transparent", border: 0, padding: "7px 4px", minWidth: 24, lineHeight: 1, fontSize: 13, cursor: "pointer", color: pinSet.has(c.profile.id) ? "var(--sh-accent, #2ee0c4)" : "var(--sh-ink3, #75706a)" }}
                >{pinSet.has(c.profile.id) ? "\u2691" : "\u2690"}</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); if (act) dashCoachActionGo(act, r, role); else dashMessageClient(c.profile.name, role, null, c.profile.id); }} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)", background: "rgba(var(--sh-accent-rgb, 46,224,196),0.08)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", borderRadius: 4, padding: "7px 11px", cursor: "pointer" }}>
                {act ? act.label : "Message"}
              </button>
            </div>
          </div>
        );
  };


  return (
    <div>
      <style>{"@keyframes dashTick{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}"}</style>
      {/* The brief (P2): "{name} first — {reason}", the engine's own sentence for who to start with. */}
      {brief && <div data-dash-brief="" style={{ fontSize: 13.5, lineHeight: 1.45, marginBottom: 12 }}>{brief.text}{brief.more > 0 ? <span style={{ color: ink50 }}>{" · " + brief.more + " more need" + (brief.more === 1 ? "s" : "") + " you"}</span> : null}</div>}
      {/* Joint attention (step 9.2): the same client is slipping on BOTH the
          training and nutrition side — one coordinated message, not two nudges. */}
      {joint.slice(0, 2).map((j, i) => (
        <div key={"joint-" + i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10, padding: "10px 13px", background: "rgba(224,100,75,0.07)", border: "1px solid rgba(224,100,75,0.3)", borderLeft: "3px solid var(--sh-rust, #e0644b)", borderRadius: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-rust, #e0644b)" }}>Joint attention · with their {role === "nutritionist" ? "trainer" : "nutritionist"}{j.coCoach && j.coCoach.name ? " " + j.coCoach.name : ""}</div>
            <div style={{ fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", marginTop: 4, lineHeight: 1.45 }}>
              <b>{j.client.profile.name}</b> is slipping on both sides — {j.trainingFlags.map((f) => f.label.toLowerCase()).join(", ")} and {j.nutritionFlags.map((f) => f.label.toLowerCase()).join(", ")}. One coordinated message beats two separate nudges.
            </div>
          </div>
          <button onClick={() => { dashOpenCareTeam(j, role); }} title={"Opens your private thread with their " + (role === "nutritionist" ? "trainer" : "nutritionist") + " — the client doesn't see it"} style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", background: "var(--sh-rust, #e0644b)", border: 0, borderRadius: 4, padding: "8px 12px", cursor: "pointer" }}>Start joint note</button>
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
          <div aria-hidden style={{ height: 1, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.1)", margin: "10px 4px 2px" }} />
        </div>
      )}
      {rows.map((r, i) => renderRow(r, i))}
      {openRow && <DashClientDrawer row={openRow} role={role} onClose={() => setSelectedId(null)} prefs={prefs} dismiss={dismiss} />}
    </div>
  );
}


// ⚠ A ROSTER THAT COULD NOT BE READ (useDashboard's source "unread") IS NOT AN EMPTY ONE, AND NOT THE
// PREVIEW: a card built on it says so in these words, never "nobody", "no clients yet" or a 0.
const DASH_ROSTER_UNREAD = "Your roster couldn't be read just now · reload to try again";
function DashRosterUnread() {
  return <div data-dash-roster="unread" role="status" style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", lineHeight: 1.5 }}>{DASH_ROSTER_UNREAD}</div>;
}

// Demo-mode band — whenever the data layer resolved the demo dataset (signed
// out, or signed in without this role) the page SAYS so, exactly like the
// profiles' preview band. Demo data must never look like real tracking.
function DashDemoBand() {
  // The band is a FIXED near-black fill on every skin, so its ink is the fixed
  // bright teal — the paper's accent is the light paper's dark teal, which read
  // 3.85:1 on this band and would only get darker. Night repaints it amber by its
  // class (dash.css).
  // Fixed BOTTOM banner (not a top strip). It's placed before the position:fixed
  // header on every dash page, so an in-flow top band was hidden behind the header
  // yet still pushed the whole dashboard down — a phantom gap under the nav bar.
  // Pinning it to the bottom (like the mobile preview banner) keeps the demo
  // notice visible while letting content sit flush under the header.
  return (
    <div className="dash-demo-band" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 16px", background: "rgba(16,20,18,0.92)", borderTop: "1px solid rgba(30,192,168,0.3)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2ee0c4", textAlign: "center" }}>
      <span>Preview · demo data — an example of a live account</span>
      <a href="/login" style={{ flexShrink: 0, color: "#06110e", background: "#1ec0a8", borderRadius: 999, padding: "4px 12px", textDecoration: "none" }}>Sign in →</a>
    </div>
  );
}

// ── Step 8 business panels — real data or an honest "connects soon" state ───

// 90-day growth: new clients a week + the monthly price they brought, and the last 30
// days against the 30 before (src/lib/coach-growth.ts). Read by the Business summary
// card below; the Business page's own Money tab draws from its trajectory instead.
// Demo shows the example series.
// The preview's new clients over 90 days are its weeks summed (it has no clients before them).
const dashDemoGrowth = (counts, centsEach, momPct) => ({
  weeklyAdds: counts.map((c, i) => ({ weekOf: "w" + i, count: c, addedCents: c * centsEach })),
  added90: counts.reduce((s, c) => s + c, 0), momPct,
});
const DASH_DEMO_GROWTH = {
  trainer: dashDemoGrowth([1, 0, 2, 1, 3, 1, 2, 2, 1, 3, 2, 4, 3], 20000, 9),
  nutritionist: dashDemoGrowth([0, 1, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 2], 16000, 12),
};
// Marketplace funnel: profile views → consults → signed. Views aren't tracked
// yet → honest "connects soon"; consults + signings are real on live.
// The preview's signings are some of its new clients (18 for a nutritionist, 25 for a trainer), never more.
const DASH_DEMO_FUNNEL = { views: 1240, consults90: 40, signed90: 14 };
const DASH_FUNNEL_BENCHMARK = 30; // % consult→signed close rate, marketplace norm
// Consult → signed, as a percent. "Signed" is the clients who found the coach on Shape.
// Unread signings (the dashboards send signed90 null when the subscriptions could not be read)
// are no rate, not 0%.
// ⚠ MORE SIGNED THAN CONSULTED IS NO CLOSE RATE, NOT 100% (the sweep after #2394 round 10). A
// client can sign without a consult, so the signings can outnumber the consults. The rate was capped
// at 100 there, and the funnel and Today printed it as a measurement, "100% — above the ~30%
// marketplace benchmark". It is null, and dashCloseWhy says which of the reasons it is.
function dashCloseRate(f) {
  return f && f.consults90 > 0 && f.signed90 != null && f.signed90 <= f.consults90 ? Math.round((f.signed90 / f.consults90) * 100) : null;
}
// Why there is no close rate, or null when there is one: "unread" (the consults or the signings
// couldn't be read; the dashboards send either as null), "over" (more clients signed than booked a
// consult), "none" (nothing to measure yet).
function dashCloseWhy(f) {
  if (!f || dashCloseRate(f) != null) return null;
  if (f.signed90 == null || f.consults90 == null) return "unread";
  return f.signed90 > (f.consults90 || 0) ? "over" : "none";
}
function DashFunnelPanel({ live }) {
  const f = live ? (live.funnel || null) : DASH_DEMO_FUNNEL;
  const ink50 = "var(--sh-ink2, #a09b94)";
  if (!f) return <div style={{ fontSize: 13, color: ink50 }}>Funnel data connects soon.</div>;
  const stages = [
    { l: "Profile views", v: f.views, note: f.views == null ? "view tracking connects soon" : null },
    // Intro sessions the coach took on (2026-11-05), not every session; null when uncounted.
    { l: "Consults · 90d", v: f.consults90, note: f.consults90 == null ? "couldn't be read just now" : null },
    { l: "Signed from Shape · 90d", v: f.signed90, note: f.signed90 == null ? "couldn't be read just now" : null },
  ];
  const maxV = Math.max(...stages.map((s) => s.v || 0), 1);
  const close = dashCloseRate(f);
  const why = dashCloseWhy(f);
  const insight = close != null
    ? close >= DASH_FUNNEL_BENCHMARK
      ? "Your consult→client close rate is " + close + "% — above the ~" + DASH_FUNNEL_BENCHMARK + "% marketplace benchmark. The lever now is more consults at the top."
      : "Your consult→client close rate is " + close + "% vs the ~" + DASH_FUNNEL_BENCHMARK + "% benchmark — tightening the intake call converts more of the consults you already get."
    : why === "unread" ? "Your " + (f.consults90 == null ? "consults" : "signings") + " couldn't be read just now, so there's no close rate to show. Nothing is lost; reload to try again."
    : why === "over" ? "More clients signed than booked a consult, so there's no close rate to show: some signed without one."
    : "Book consults from the marketplace to start the funnel — signings are tracked automatically.";
  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 12, alignItems: "center", padding: "7px 0" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: ink50 }}>{s.l}</span>
          <div style={{ position: "relative", height: 9, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.07)", borderRadius: 2 }}>
            {s.v != null && <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.max(3, Math.round((s.v / maxV) * 100)) + "%", background: "var(--sh-accent, #2ee0c4)", opacity: 0.45 + i * 0.27, borderRadius: 2 }} />}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: s.v == null ? ink50 : "var(--sh-ink, #f2ede4)", fontStyle: s.v == null ? "italic" : "normal" }}>{s.v == null ? s.note : s.v.toLocaleString()}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.16)", marginTop: 8, paddingTop: 9, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", color: ink50 }}>BENCHMARK · ~{DASH_FUNNEL_BENCHMARK}% CONSULT→SIGNED</span>
        {close != null && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: close >= DASH_FUNNEL_BENCHMARK ? "var(--sh-green, #7bbf5a)" : "var(--sh-gold, #d8a23a)" }}>YOU · {close}%</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)", lineHeight: 1.55, marginTop: 9 }}>{insight}</div>
    </div>
  );
}

// The dashboard's Business card (Business-page step) — ONE summary plate that
// replaces the separate Growth + Funnel sections on Today and links to the
// full Business page (revenue trend · payouts · funnel · churn). Money
// honesty: monthly net derives from real subscriptions; payout-flavored
// numbers never appear here — the Business page owns those (real or "—").
// ⚠ THE PREVIEW'S NET IS EACH CLIENT AFTER THEIR OWN FEE, NOT THE ROSTER AT 15% (the sweep after
// #2394 round 10). This took 15% off all ten demo clients ($1,547) while Business's origin list
// and Plan said half of them were brought at 0%, and Business quoted its own figure. The rule is
// dashSignals.js `rosterNetCents`, which the sidebar card and Business read too, so the preview
// states one net; and since a brought client pays no fee, the line no longer says "after 15%".
// `preview`: the page is the signed-out preview (its own source "demo"), the only viewer the sample's
// growth, funnel and net are for. A page that is not the preview and has no feed (the day feed failed,
// or the roster couldn't be read either) says each couldn't be read. Without it, no feed is the preview,
// as before.
function DashBusinessSummary({ live, role, clients, preview = !live }) {
  const ink50 = "var(--sh-ink2, #a09b94)";
  const g = live ? (live.growth || null) : preview ? DASH_DEMO_GROWTH[role] : null;
  const f = live ? (live.funnel || null) : preview ? DASH_DEMO_FUNNEL : null;
  const counts = g && Array.isArray(g.weeklyAdds) ? g.weeklyAdds.map((w) => w.count) : null;
  // ⚠ THE 90 DAYS THE SIGNINGS COVER, NOT THE SUMMED WEEKS (the sweep after #2394 round 10): the
  // weekly buckets open up to six days after them, so the sum could fall below "Signed from Shape ·
  // 90d", a subset of these clients (src/lib/coach-growth.ts added90). The weeks draw the sparkline.
  const adds90 = g && g.added90 != null ? g.added90 : null;
  const close = dashCloseRate(f);
  const why = dashCloseWhy(f);
  const netCents = live
    ? (live.kpis && live.kpis.monthlyNetCents != null ? live.kpis.monthlyNetCents : null)
    : preview ? DashSignals.rosterNetCents(clients) : null;
  const href = role === "nutritionist" ? "NutritionistAnalytics.html" : "TrainerAnalytics.html";
  const max = counts ? Math.max(...counts, 1) : 1;
  const stat = (k, l, sub, color) => (
    <div>
      <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1, color: color || (k === "—" ? ink50 : "var(--sh-ink, #f2ede4)") }}>{k}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: ink50, marginTop: 4 }}>{l}</div>
      {sub && <div style={{ fontSize: 10, color: ink50, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
        {/* ⚠ NOT "AFTER 15%" (the sweep after #2394 round 10): a client the coach brought pays no fee, and
            the net is each plan's own; the clients are today's, as Business counts them (the routes' practiceToday).
            ⚠ AND A NULL NET IS A READ THAT FAILED, NOT "no subscription data" (the dashboards after #2395):
            the routes send null only then, and the preview's net is always a figure. */}
        {stat(netCents != null ? dashMoney(netCents) : "—", "Monthly · net", netCents != null ? "today's clients · after Shape's fee" : "couldn't be read just now")}
        {stat(adds90 != null ? "+" + adds90 : "—", "New clients · 90d", !g ? "couldn't be read just now" : g.momPct != null ? (g.momPct >= 0 ? "+" : "") + g.momPct + "% vs the 30 days before" : "none in the 30 days before to compare")}
        {stat(close != null ? close + "%" : "—", "Consult → signed",
          why === "over" ? "more signed than booked a consult" : why === "unread" ? "couldn't be read just now" : "benchmark ~" + DASH_FUNNEL_BENCHMARK + "%",
          close == null ? null : close >= DASH_FUNNEL_BENCHMARK ? "var(--sh-green, #7bbf5a)" : "var(--sh-gold, #d8a23a)")}
        {counts && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, flex: 1, minWidth: 120 }}>
            {counts.map((c, i) => (
              <div key={i} style={{ flex: 1, height: Math.max(5, Math.round((c / max) * 100)) + "%", background: c ? "var(--sh-accent, #2ee0c4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.1)", opacity: c ? 0.4 + 0.6 * (i / counts.length) : 1, borderRadius: 1 }} />
            ))}
          </div>
        )}
      </div>
      <a href={href} style={{ ...DASH_MONO_LINK, marginTop: 12, fontSize: 9, fontWeight: 700, color: "var(--sh-accent, #2ee0c4)" }}>
        Revenue · payouts · funnel · churn →
      </a>
    </div>
  );
}

// Nutritionist roster aggregates + the recipe-publishing insight.
// `preview` as DashBusinessSummary's: the sample's renewals are the preview's only.
function DashNutriAggPanel({ clients, live, preview = !live }) {
  const ink50 = "var(--sh-ink2, #a09b94)";
  const withLogs = clients.filter((c) => c.foodLogs && c.foodLogs.daysLogged7d != null);
  const avgCompliance = withLogs.length
    ? Math.round((withLogs.reduce((s, c) => s + Math.min(7, c.foodLogs.daysLogged7d), 0) / (withLogs.length * 7)) * 100)
    : null;
  const pctLogged = withLogs.length
    ? Math.round((withLogs.filter((c) => c.foodLogs.daysLogged7d > 0).length / withLogs.length) * 100)
    : null;
  const renewals = preview ? 4 : null; // billing dates aren't exposed yet
  const cellStyle = { background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: "13px 15px" };
  const stat = (k, l, sub) => (
    <div style={cellStyle}>
      <div style={{ fontFamily: serif, fontSize: 23, lineHeight: 1, color: k === "—" ? ink50 : "var(--sh-ink, #f2ede4)" }}>{k}</div>
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
      <div style={{ marginTop: 12, padding: "12px 15px", background: "rgba(var(--sh-gold-rgb, 216,162,58),0.07)", border: "1px solid rgba(var(--sh-gold-rgb, 216,162,58),0.25)", borderLeft: "3px solid var(--sh-gold, #d8a23a)", borderRadius: 4 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-gold, #d8a23a)" }}>Insight · recipes</div>
        <div style={{ fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.8)", lineHeight: 1.55, marginTop: 6 }}>
          Clients with fresh recipes in their plan log meals more consistently — your lowest-compliance clients are the first place a new recipe drop pays off.
        </div>
        <a href={dashShellHref("NutritionistPlans.html")} style={{ display: "inline-block", marginTop: 9, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-gold, #d8a23a)", textDecoration: "none" }}>Publish a recipe →</a>
      </div>
    </div>
  );
}

// One strip's four remembered slots.
//
// ⚠ ONE HOOK, A FIXED FOUR KEYS — not four hooks and not a loop over a count. The hook
// count is fixed by construction rather than by a constant somebody could later derive
// from data (the rules-of-hooks class this repo post-mortems, which neither the build nor
// `tsc` nor the suite catches), and the ONE hook is what makes a swap atomic. The reason
// is written out at the call site below; this header exists so a reader who never opens
// the function does not "restore" the four.
//
// ⚠ AND ONE KEY PER SLOT RATHER THAN ONE ARRAY, because the hook validates each stored
// value against the pool on its own key and ignores what it does not recognise: a retired
// metric then costs that ONE slot its default, where a stored array would have to be
// validated element by element or discarded whole.
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

// ── Optional Today widgets (review 2026-09-21) ──────────────────────────────
// Off the board until a coach adds them from the widget catalogue (DashGrid's
// "＋ Add widget"), so nobody's Today changes unasked. Every one derives from state
// the page already holds — the derivations live in dashSignals.js beside the KPI
// pool, for the same reason the pool does: a widget that needed a request would be
// a figure nobody on this screen had measured. Each card says how many rows it
// could NOT read rather than publishing a total over the ones that answered.

// A hash route inside the shell this page renders in; the shell document otherwise.
// `dashShellRole()` is null outside TrainerApp / NutritionistApp — the legacy tab
// pages are redirect stubs and never render Today — so the fallback is for a host
// this file cannot foresee, never the ordinary path.
function dashTabHref(slug, role) {
  try { if (typeof dashShellRole === "function" && dashShellRole()) return "#" + slug; } catch (e) {}
  return (role === "nutritionist" ? "NutritionistApp.html" : "TrainerApp.html") + "#" + slug;
}

function dashRouteParam(key) {
  const hash = window.location.hash || "";
  return new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : window.location.search).get(key);
}
function dashLinkedTab(slug, role, params) {
  return dashTabHref(slug, role) + "?" + new URLSearchParams(params).toString();
}
function dashWidgetClientHref(id, role, section) {
  if (!id || /^demo-/.test(id)) return null;
  const base = dashClientPageHref(id, role);
  return base + (base.includes("?") ? "&" : "?") + "section=" + encodeURIComponent(section || "progress");
}
function DashWidgetClient({ id, name, role, section }) {
  const href = dashWidgetClientHref(id, role, section);
  return href ? <a href={href} className="dw-client-link">{name}</a> : <span>{name}</span>;
}
function DashWidgetList({ rows, renderRow, label = "clients" }) {
  const [all, setAll] = React.useState(false);
  return <div className="dw-list">{rows.map((row, i) => <div key={row.id || row.key || (row.name + "|" + i)} className={!all && i >= 6 ? "dw-extra" : ""}>{renderRow(row)}</div>)}
    {rows.length > 6 && <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => setAll(!all)} aria-expanded={all}>{all ? "Show fewer" : "View all " + rows.length + " " + label}</button>}
  </div>;
}
const DASH_WIDGET_BUTTON = { background: "transparent", border: "1px solid var(--sh-line2, #413d38)", borderRadius: 6, padding: "6px 10px", minHeight: 36, font: "inherit", fontSize: 12, color: "var(--sh-accent-ink, #2ee0c4)", cursor: "pointer" };

function DashWeekAheadPanel({ week, role }) {
  if (!week) return null;
  return <div>
    <div className="dw-week">{week.days.map((d) => <a key={d.date} href={dashLinkedTab("schedule", role, { date: d.date })} className="dw-day" aria-label={d.dow + " " + d.date + ", " + d.count + " calendar events"}>
      <span className="dw-day-date">{d.dow} <strong>{d.day}</strong></span>
      <span className="dw-day-count">{d.count}<small> events</small></span>
      <span className="dw-day-time">{d.bookedMin != null ? d.bookedMin + " min booked" : "Duration not shared"}{d.first ? " · " + d.first : ""}</span>
    </a>)}</div>
    <p className="dw-note">{week.total} calendar events in the next 7 days. Select a date to open Schedule.{week.skipped ? " " + week.skipped + " have no readable date." : ""}</p>
  </div>;
}

function DashRosterStatusPanel({ status, role }) {
  if (!status) return null;
  const segs = [["red", "Needs you"], ["amber", "Watch"], ["green", "On track"], ["unknown", "Not enough data"]];
  return <div>
    <div className="dw-status">{segs.map(([key, label]) => <a key={key} className="dw-status-cell" href={dashLinkedTab("clients", role, { status: key })}>
      <span style={{ color: DASH_SEV_COLORS[key], fontSize: 26 }}>{status[key].length}</span><span>{label}</span>
      {status[key].length > 0 && <small>{status[key].slice(0, 3).join(" · ")}{status[key].length > 3 ? " +" + (status[key].length-3) : ""}</small>}
    </a>)}</div>
    <p className="dw-note">{status.total} clients on the pulse. Open a group to see its clients and the reason for each status.</p>
  </div>;
}

function DashTopMoversPanel({ movers, role }) {
  if (!movers) return null;
  const row = (m, up) => <div key={(up ? "u:" : "d:") + (m.id || m.name)} className="dw-row">
    <div><DashWidgetClient id={m.id} name={m.name} role={role} section="progress" />
      <div className="dw-note">{m.compareFrom && m.compareTo ? "Weeks of " + m.compareFrom + " → " + m.compareTo : "Two completed weeks"}</div>
      <div className="dw-note">{m.partial ? "This week so far" : "Latest completed week"}: {m.points} points{m.weekOf ? " · " + m.weekOf : ""}</div>
    </div>
    <div><strong style={{ color: up ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}>{m.delta > 0 ? "+" : ""}{m.delta}</strong>
      <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => dashMessageClient(m.name, role, up ? "Hi " + m.name.split(" ")[0] + " — your score rose " + m.delta + " points between the last two completed weeks. Well done!" : undefined, m.id)}>{up ? "Congratulate" : "Message"}</button>
    </div>
  </div>;
  return <div className="dw-movers">
    <section><div style={DASH_MONO_EYEBROW}>Up · completed weeks</div>{movers.up.length ? movers.up.map((m) => row(m,true)) : <p className="dw-note">Nobody up this week.</p>}</section>
    <section><div style={DASH_MONO_EYEBROW}>Down · completed weeks</div>{movers.down.length ? movers.down.map((m) => row(m,false)) : <p className="dw-note">Nobody down this week.</p>}</section>
    <p className="dw-note">{movers.known} of {movers.total} clients have two comparable completed weeks.</p>
  </div>;
}

function DashAnniversariesPanel({ marks, role }) {
  if (!marks) return null;
  const when = (h) => h.inDays === 0 ? "today" : h.inDays === 1 ? "tomorrow" : "in " + h.inDays + " days";
  return <div><DashWidgetList rows={marks.soon} renderRow={(h) => <div className="dw-row" key={h.id || (h.name + "|" + h.label)}>
    <div><DashWidgetClient id={h.id} name={h.name} role={role} /><div className="dw-note">{h.label} with your practice · {when(h)} · {h.on}</div></div>
    <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => dashMessageClient(h.name, role, "Hi " + h.name.split(" ")[0] + " — " + h.label + " working together " + when(h) + ". Thank you for showing up. What are you proudest of so far?", h.id)}>Message draft</button>
  </div>} />
    {!marks.soon.length && <p className="dw-note">No coaching anniversaries in the next 30 days.</p>}
    <p className="dw-note">Based on the earliest subscription visible to your practice.{marks.unknown ? " " + marks.unknown + " start dates are not shared." : ""}</p>
  </div>;
}

function DashRevenueByClientPanel({ rev, role }) {
  if (!rev) return null;
  if (!rev.total) return <p className="dw-note">No clients yet.</p>;
  if (!rev.known) return <p className="dw-note">Subscriptions could not be read just now.</p>;
  return <div><DashWidgetList rows={rev.allRows || rev.rows} renderRow={(r) => <div className="dw-row" key={r.id || (r.name + "|" + r.cents)}>
    <div><DashWidgetClient id={r.id} name={r.name} role={role} />
      <details><summary style={{ cursor: "pointer", minHeight: 28, fontSize: 12 }}>Billing details</summary><p className="dw-note">Gross {dashMoney(r.cents)}/month{r.feeCents != null ? " · platform fee " + dashMoney(r.feeCents) + " · net " + dashMoney(r.cents-r.feeCents) : " · fee and net not shared"}. Subscription totals; not a payout statement.</p></details>
    </div>
    <div style={{ whiteSpace: "nowrap", fontSize: 13 }}>{dashMoney(r.cents)}/mo <span className="dw-note">· {Math.round(r.share*100)}%</span></div>
  </div>} />
    <p className="dw-note">Gross recurring revenue: {dashMoney(rev.sumCents)}/month. Percentages use the {rev.known} readable subscriptions{rev.unknown ? "; " + rev.unknown + " clients excluded because their amounts are unavailable" : ""}. Fees have not been deducted.</p>
  </div>;
}

function DashProgramsEndingPanel({ ending, role }) {
  if (!ending) return null;
  const noun = role === "nutritionist" ? "plan" : "program";
  return <div><DashWidgetList rows={ending.soon} renderRow={(r) => <div className="dw-row" key={r.id || r.name}>
    <div><DashWidgetClient id={r.id} name={r.name} role={role} section="plans" /><div>{r.program || "Current " + noun}</div>
      <div className="dw-note">{r.overdue ? "Past estimated end" : r.left === 0 ? "Final week" : r.left + " weeks left"}{r.endDate ? " · estimated end " + r.endDate : " · end date not shared"}</div>
      {r.nextAssigned && <div className="dw-note">Another {noun} already assigned: {r.nextAssigned}</div>}
    </div>
    {r.id && <a className="dw-action" href={dashLinkedTab(role === "nutritionist" ? "plans" : "programs", role, { client: r.id })}>Next {noun} →</a>}
  </div>} />
    {!ending.soon.length && <p className="dw-note">Nothing ends in the next {ending.weeks} weeks.</p>}
    <p className="dw-note">{ending.paused} paused · {ending.later} mid-plan · {ending.unknown} unavailable. Estimated dates use the assignment date and template duration; pauses can change the actual finish.</p>
  </div>;
}


// A private scratchpad, kept in the same per-account `dashboard_prefs` document the
// roster filter and the KPI picker use — so it follows the coach between devices with
// no second mechanism, and the store's account binding, serial lane and rollback are
// inherited rather than re-implemented.
//
// ⚠ THE DRAFT OUTRANKS THE DOCUMENT FOR THE SESSION, AND THE WRITE IS A DEBOUNCED
// RECONCILIATION — the same shape as `useRememberedChoice`. A keystroke made while the
// store is still loading has nowhere to go; a handler would drop it, and the effect
// simply retries the moment the store opens. One attempt per draft (`askedRef`), so a
// failed write cannot loop against the rollback.
function DashNotesPanel({ prefs, role }) {
  const key = "todayNote:" + role;
  const kind = prefs && prefs.kind ? prefs.kind : "demo";
  const doc = (prefs && prefs.doc) || {};
  const stored = typeof doc[key] === "string" ? doc[key] : "";
  const acct = prefs && prefs.accountId != null ? prefs.accountId : null;
  // ⚠ THE DRAFT CARRIES THE ACCOUNT IT WAS TYPED UNDER, rather than being cleared by a ref
  // compared during render. That shape was wrong twice. `useSignedIn` publishes null on
  // sign-out while this page is still mounted and the redirect has not run, so a guard that
  // only fired on a non-null change left the previous coach's private note sitting in the
  // box over a signed-out document — on a shared machine, for whoever is handed it next.
  // And a ref written during render leaks from work React is free to discard: #2046 is this
  // exact shape writing one account's arrangement into another's row. A draft that does not
  // belong to the account on screen is simply not read, which is self-correcting and leaves
  // no render-phase mutation to tear.
  // A draft typed BEFORE the account resolved carries null and is adopted by the first
  // account that does resolve — nobody else's data is on screen in that window, and it is
  // the keystroke-while-loading the debounced reconciliation below exists to keep.
  const [draft, setDraft] = React.useState(null);
  const askedRef = React.useRef(null);
  const mine = draft && (draft.acct == null || draft.acct === acct) ? draft.text : null;
  const value = mine != null ? mine : stored;
  const writable = kind === "ready" || kind === "error";
  // The write the debounce is holding, so the flushes below send the CURRENT draft rather
  // than the one their own effect closed over.
  const pendingRef = React.useRef(null);
  const writeRef = React.useRef(null);
  const writeNote = (text) => {
    if (!prefs || typeof prefs.apply !== "function") return;
    askedRef.current = { acct: acct, text: text };
    pendingRef.current = null;
    prefs.apply((d) => { const out = { ...d }; if (text.trim() === "") delete out[key]; else out[key] = text; return out; });
  };
  // Committed-only, so the unmount flush calls the latest write rather than the first
  // render's — and so nothing is assigned during render.
  React.useEffect(() => { writeRef.current = writeNote; });
  React.useEffect(() => {
    // Cleared first: whatever is pending is what THIS evaluation decides, or a draft the
    // member has since typed back to its stored value would still be flushed on unmount.
    pendingRef.current = null;
    if (mine == null || !writable) return undefined;
    if (stored === mine) return undefined;
    const asked = askedRef.current;
    if (asked && asked.acct === acct && asked.text === mine) return undefined;
    pendingRef.current = mine;
    const t = setTimeout(() => writeNote(mine), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [mine, acct, writable, stored, key]);
  // ⚠ AN EDIT MADE INSIDE THE DEBOUNCE SURVIVES LEAVING THE SCREEN. Hiding this widget from
  // the catalogue unmounts the panel, and so does switching tab; the draft lives nowhere
  // else, so a cleanup that only cleared the timer lost the last 700ms of typing with
  // nothing saying so. This effect runs on UNMOUNT alone — empty deps — never on the
  // per-keystroke cleanup above, which would defeat the debounce it is protecting.
  // ⚠ The pagehide leg is BEST-EFFORT AND SAYS SO RATHER THAN CLAIMING OTHERWISE: the write
  // ends in an ordinary async request and a browser tearing the page down need not finish
  // it. There is no unload-safe path to reach for here — `sendBeacon` cannot carry the auth
  // header this write needs — so trying is the honest option, not a guarantee.
  React.useEffect(() => {
    const flush = () => { const t = pendingRef.current; if (t != null && writeRef.current) writeRef.current(t); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
    // eslint-disable-next-line
  }, []);
  // "Saved" is the store's optimistic paint, as every remembered control's is; a write
  // that fails moves the store to `error`, which is the line above the others.
  const status = kind === "error" ? "Couldn't save — your note is still here"
    : !writable ? (kind === "loading" ? "Loading your notes…" : "Preview — notes save on your live dashboard")
    : mine != null && mine !== stored ? "Unsaved…" : "Saved with your account";
  return (
    <div>
      <textarea className="dash-notes-ta" value={value} onChange={(e) => setDraft({ acct: acct, text: e.target.value })} rows={5} aria-label="Notes to self"
        placeholder="Anything to remember — a client to call, a block to tweak, a note for Friday."
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 96, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", borderRadius: 8, color: "var(--sh-ink, #f2ede4)", fontFamily: sans, fontSize: 13.5, lineHeight: 1.5, padding: "10px 12px" }} />
      <div style={{ fontSize: 11, color: kind === "error" ? DASH_SEV_COLORS.amber : DASH_INK50, marginTop: 8 }} role="status">{status}{kind === "error" && <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => writeNote(value)}>Retry</button>}</div>
    </div>
  );
}

function dashCheckinRows(clients, reviews) {
  const rows = [];
  for (const client of clients || []) for (const checkin of client.checkins || []) {
    const week = checkin.week_of || checkin.weekOf;
    if (!week || !client.profile || !client.profile.id) continue;
    const key = client.profile.id + ":" + week;
    const signature = JSON.stringify(checkin);
    if (dashCheckinReviewed(reviews && reviews[week] && reviews[week][client.profile.id], checkin)) continue;
    rows.push({ key, id: key, clientId: client.profile.id, name: client.profile.name, week, checkin, signature,
      at: checkin.created_at || checkin.submitted_at || week });
  }
  return rows.sort((a,b) => String(a.at).localeCompare(String(b.at)) || a.name.localeCompare(b.name));
}
function DashCheckinQueuePanel({ clients, role, live }) {
  const reviews = useCoachWeekReviews(live);
  const [selected, setSelected] = React.useState(null);
  const [failedReview, setFailedReview] = React.useState(null);
  const [state, setState] = React.useState("");
  const [preview, setPreview] = React.useState({});
  const ready = !live || ["ready", "error"].includes(reviews.kind);
  const rows = ready ? dashCheckinRows(clients, live ? reviews.doc : preview) : [];
  const unknown = clients.filter((c) => !Array.isArray(c.checkins)).length;
  const open = rows.find((row) => row.key === selected);
  const mark = async (row) => {
    if (!row) return;
    const accountId = reviews.accountId;
    const value = { checkinSignature: row.signature, reviewedAt: new Date().toISOString() };
    if (!live) { setPreview({ ...preview, [row.week]: { ...preview[row.week], [row.clientId]: value } }); setSelected(null); setState("Preview · review not saved"); return; }
    setFailedReview(null);
    setState("Saving review…");
    const ok = await reviews.apply([{ weekOf: row.week, clientId: row.clientId, patch: value }]);
    setState(ok ? "Review saved" : "Couldn't save review.");
    if (!ok) setFailedReview({ row, accountId });
    if (ok) setSelected(null);
  };
  return <div>
    <p className="dw-note">Oldest first · the latest 4 shared check-ins per client. {unknown ? unknown + " clients' check-ins are unavailable." : ""}</p>
    {!ready ? <p>{reviews.kind === "loading" ? "Loading your reviews…" : "Reviews unavailable. Reload to try again."}</p> : !rows.length && !(failedReview && failedReview.accountId === reviews.accountId) && state !== "Saving review…" && <p>No unreviewed check-ins in this recent window.</p>}
    <DashWidgetList rows={rows} label="check-ins" renderRow={(row) => <div className="dw-row"><div>{row.name}<div className="dw-note">Week of {row.week}</div></div><button type="button" style={DASH_WIDGET_BUTTON} aria-expanded={selected === row.key} onClick={() => setSelected(selected === row.key ? null : row.key)}>Review {row.name}</button></div>} />
    {open && <section aria-label={"Check-in from " + open.name} style={{ marginTop: 12, padding: 16, border: "1px solid var(--sh-line2, #413d38)", borderRadius: 8 }}>
      <strong>{open.name} · week of {open.week}</strong>
      {Object.entries(open.checkin.ratings || {}).map(([label, value]) => <p className="dw-note" key={label}>{label.replace(/([A-Z])/g, " $1")}: {String(value)}</p>)}
      {[["wins", "Wins"], ["struggles", "Struggles"], ["question", "Question"], ["notes", "Notes"]].map(([field,label]) => open.checkin[field] ? <p key={field} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>{label}: </strong>{String(open.checkin[field])}</p> : null)}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => dashMessageClient(open.name, role, "Hi " + open.name.split(" ")[0] + " — thanks for your check-in for the week of " + open.week + ". ", open.clientId)}>Draft response</button>
        <button type="button" style={DASH_WIDGET_BUTTON} disabled={state === "Saving review…" || !ready} onClick={() => mark(open)}>Mark reviewed</button>
        <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => setSelected(null)}>Close</button>
      </div>
    </section>}
    <p className="dw-note" role="status">{state}</p>
    {failedReview && failedReview.accountId === reviews.accountId && <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => mark(failedReview.row)}>Retry review save</button>}
  </div>;
}

// ── New clients: the onboarding board (client-onboarding review, fix 4) ─────────────────────────
// One board per client in their first 30 days with this coach, read from the overview's
// `onboarding` leg (src/lib/coach-client-legs.mjs bsOnboardingLeg). ⚠ EVERY TICK IS A RECORD, NEVER A
// BOX THE COACH TICKS: the setup card this replaces asked the coach to "Confirm intake", and its
// "First plan" read a table nothing writes, so it could never tick (M14). A step whose read failed
// says so ("couldn't read"), never "to do".
const DASH_OB_STEPS = {
  joined: "Subscribed",
  welcome: "Shape welcome",
  hello: "Your first message",
  plan: "Plan live",
  checkin: "First check-in",
  checkin2: "Second check-in",
  progress: "Day-30 measurements",
};
function dashObKey(role) { return role === "nutritionist" || role === "dietitian" ? "nutritionist" : "trainer"; }
// A day ('YYYY-MM-DD' or an ISO instant) as "Mon 13 Oct". A bare day is read at noon so no zone moves it.
function dashObDay(v) {
  if (!v || typeof v !== "string") return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
// The clients in their first 30 days with this coach, newest first.
// ⚠ A CLIENT WHOSE OVERVIEW DID NOT ARRIVE IS STILL A NEW CLIENT (Fable on fix 4). The board comes
// with the overview, so a client whose overview failed (or is still loading) used to vanish from
// the tab, which then said "No clients in their first 30 days". Their join date is on the roster, so
// they stay, as a row that says it couldn't read the board (`unread`), never as an empty one.
function dashOnboardingRows(clients, role) {
  const key = dashObKey(role);
  const now = Date.now();
  const rows = [];
  for (const c of clients || []) {
    if (!c || !c.profile || !c.profile.id) continue;
    const ob = c.onboarding && c.onboarding[key];
    if (ob && Array.isArray(ob.steps)) { rows.push({ c, day: ob.day }); continue; }
    // ⚠ AN OVERVIEW THAT ARRIVED WITHOUT THIS BOARD IS NOT PROOF OF "NOT NEW" (Codex on #2378). The
    // overview leaves the board out when its own subscriptions read fails, and the page then reads
    // as ready. The roster's join date is the same subscription's, so inside 30 days the missing
    // board is a read the overview could not make: the row stays, unread.
    const read = c.progressRead && c.progressRead.state;
    const joined = c.profile.joinedAt ? Date.parse(c.profile.joinedAt) : NaN;
    if (!Number.isFinite(joined) || joined > now) continue;
    const day = Math.floor((now - joined) / 86400000) + 1;
    if (day <= 30) rows.push({ c: { ...c, unread: read === "loading" ? "loading" : "unavailable" }, day });
  }
  return rows.sort((a, b) => a.day - b.day).map((r) => r.c);
}
// What the board asks for next: the first step not done, with its date when it has one.
function dashOnboardingNext(ob, role) {
  const steps = ob && Array.isArray(ob.steps) ? ob.steps : [];
  const next = steps.find((s) => s.done === false);
  if (!next) return steps.some((s) => s.done == null) ? "Some steps couldn't be read" : "Set up";
  const label = next.key === "plan" && dashObKey(role) === "nutritionist" ? "Meal plan live" : DASH_OB_STEPS[next.key] || next.key;
  return label + (next.due ? " · due " + dashObDay(next.due) : "");
}
function DashObStage({ n, title, children }) {
  return <div style={{ border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: 12, minWidth: 0 }}>
    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sh-ink2, #a09b94)", marginBottom: 8 }}>{n} · {title}</div>
    {children}
  </div>;
}
function DashObLine({ label, value }) {
  return <div className="dw-row" style={{ gap: 8 }}><span style={{ color: "var(--sh-ink2, #a09b94)" }}>{label}</span><span style={{ textAlign: "right", overflowWrap: "anywhere" }}>{value}</span></div>;
}
function DashOnboardingBoard({ client, ob, role, live }) {
  const key = dashObKey(role);
  const nutri = key === "nutritionist";
  const id = client.profile.id;
  const first = String(client.profile.name || "They").split(" ")[0];
  const step = (k) => ob.steps.find((s) => s.key === k) || null;
  const stepText = (s, doneText, todoText) => !s ? "—" : s.done == null ? "Couldn't read" : s.done ? doneText : todoText;
  const it = client.intake;
  const intakeRows = it ? [
    ...(it.goal ? [{ key: "goal", label: "Goal", value: it.goal }] : []),
    ...((nutri ? it.nutrition : it.training) || []).slice(0, 5),
  ] : [];
  const screening = client.screening === "flagged" ? "Flagged · read it first" : client.screening === "clear" ? "On file" : client.screening === "missing" ? "Not completed" : "Not shared";
  const weights = Array.isArray(client.weighIns) ? client.weighIns.slice().sort((a, b) => String(a.on).localeCompare(String(b.on))) : [];
  const plan = step("plan"), hello = step("hello"), welcome = step("welcome"), checkin = step("checkin");
  // The week-one target: the coach's, saved through /api/clients/[id]/week-one.
  const [target, setTarget] = React.useState(ob.weekOne || null);
  // Who set it, when it was another coach of this discipline (a member may pay two; owner, 2026-10-16):
  // they share the target, so it is this board's too. Null once this coach saves their own.
  const [targetBy, setTargetBy] = React.useState(ob.weekOneBy || null);
  const [editing, setEditing] = React.useState(false);
  const [count, setCount] = React.useState(String((ob.weekOne && ob.weekOne.count) || ob.suggested || (nutri ? 5 : 3)));
  // The days week one can start on: the board's 30 days, as the route checks them (Codex on #2378).
  const obJoined = ob.joinedAt ? Date.parse(ob.joinedAt) : NaN;
  const firstDay = Number.isFinite(obJoined) ? new Date(obJoined).toISOString().slice(0, 10) : undefined;
  const lastDay = Number.isFinite(obJoined) ? new Date(obJoined + 29 * 86400000).toISOString().slice(0, 10) : undefined;
  const nextMonday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); const v = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); return firstDay && v < firstDay ? firstDay : lastDay && v > lastDay ? lastDay : v; })();
  const [startsOn, setStartsOn] = React.useState((ob.weekOne && ob.weekOne.startsOn) || nextMonday);
  const [state, setState] = React.useState("");
  const unit = nutri ? "days logged" : "workouts";
  // Days logged run to seven (weekOneMax in coach-client-legs.mjs; Codex on #2378).
  const max = nutri ? 7 : 14;
  const save = async () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > max) { setState("Enter a whole number from 1 to " + max + "."); return; }
    setState("Saving…");
    try {
      const r = await fetch("/api/clients/" + encodeURIComponent(id) + "/week-one", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: key, count: n, startsOn: startsOn || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setState(j.error || "Couldn't save. Try again."); return; }
      setTargetBy(null); setTarget(j.weekOne); setEditing(false); setState("Saved");
      // The board's dates follow the target (Codex on #2378): read this client's overview again, so
      // the plan and check-in deadlines, and the row's next step, are the server's new ones.
      try { window.dispatchEvent(new CustomEvent("shape:coach-progress-refresh", { detail: { clientId: id } })); } catch (e) {}
    } catch (e) { setState("Couldn't save. Try again."); }
  };
  return <div style={{ padding: "4px 0 14px" }}>
    <p className="dw-note" style={{ margin: "0 0 10px" }}>
      Joined your roster {dashObDay(ob.joinedAt)} · {nutri ? "Nutritionist" : "Trainer"} · screening {screening.toLowerCase()} · <a className="dw-action" href={dashWidgetClientHref(id, role) || dashTabHref("clients", role)}>Client page →</a>
    </p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
      <DashObStage n="01" title="Who they are">
        {intakeRows.length ? intakeRows.map((r) => <DashObLine key={r.key} label={r.label} value={r.value} />) : <p className="dw-note" style={{ margin: 0 }}>{it ? "They haven't filled this in." : "Not shared yet."}</p>}
        <DashObLine label="Screening" value={screening} />
      </DashObStage>
      <DashObStage n="02" title="Starting point">
        {weights.length ? <DashObLine label="Weight" value={weights[0].weight + " " + weights[0].unit + (weights.length > 1 ? " → " + weights[weights.length - 1].weight + " " + weights[weights.length - 1].unit : "")} /> : <DashObLine label="Weight" value="No weigh-in yet" />}
        <DashObLine label="Days logged, 7d" value={client.foodLogs && client.foodLogs.daysLogged7d != null ? client.foodLogs.daysLogged7d : "Not shared"} />
        {!nutri && <DashObLine label="Workouts done" value={client.trainingAdherence ? client.trainingAdherence.done + " of " + client.trainingAdherence.planned : "None planned yet"} />}
      </DashObStage>
      <DashObStage n="03" title="Your plan">
        <DashObLine label={nutri ? "Meal plan" : "Week 1"} value={stepText(plan, (plan && plan.title ? plan.title + " · " : "") + "published " + dashObDay(plan && plan.at), "Not published" + (plan && plan.due ? " · due " + dashObDay(plan.due) : ""))} />
        <a className="dw-action" href={dashLinkedTab(nutri ? "plans" : "programs", role, { client: id })}>{nutri ? "Open meal plans →" : "Open program builder →"}</a>
      </DashObStage>
      <DashObStage n="04" title="Go live">
        <DashObLine label="Shape welcome" value={stepText(welcome, "Sent " + dashObDay(welcome && welcome.at), "Not sent")} />
        <DashObLine label="Your first message" value={stepText(hello, dashObDay(hello && hello.at), "Not yet")} />
        <DashObLine label="First check-in" value={stepText(checkin, checkin && checkin.at ? "Week of " + dashObDay(checkin.at) : "Done", "Due " + dashObDay(checkin && checkin.due))} />
        {hello && hello.done === false && <button type="button" style={{ ...DASH_WIDGET_BUTTON, marginTop: 8 }} onClick={() => dashMessageClient(client.profile.name, role, "Hi " + first + ", welcome — ", id)}>Say hello</button>}
      </DashObStage>
    </div>
    <ol aria-label="First 30 days" style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12.5 }}>
      {ob.steps.map((s) => <li key={s.key} style={{ color: s.done ? "var(--sh-accent-ink, #2ee0c4)" : "var(--sh-ink2, #a09b94)" }}>
        {s.done ? "✓ " : s.done == null ? "? " : "○ "}{s.key === "plan" && nutri ? "Meal plan live" : DASH_OB_STEPS[s.key] || s.key}
        {s.done && s.at ? " · " + dashObDay(s.at) : !s.done && s.due ? " · due " + dashObDay(s.due) : s.done == null ? " · couldn't read" : ""}
      </li>)}
    </ol>
    <div style={{ marginTop: 12, borderTop: "1px solid var(--sh-line, #302c27)", paddingTop: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--sh-ink2, #a09b94)", marginBottom: 6 }}>Week-one target</div>
      {!editing && <p style={{ margin: 0, fontSize: 13 }}>
        {target
          ? <>{first}'s target: {target.count} {unit} in week 1{target.startsOn ? " · starts " + dashObDay(target.startsOn) : ""} · set by {targetBy ? targetBy.name || "their other coach" : "you"}</>
          : ob.weekOneUnread ? <>Couldn't read it</>
          : <>Not set{ob.suggested ? " · they said " + ob.suggested + " sessions a week" : ""}</>}
        {" "}<button type="button" style={DASH_WIDGET_BUTTON} disabled={!live} onClick={() => { setEditing(true); setState(""); }}>{target ? "Change" : "Set target"}</button>
      </p>}
      {editing && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
        <label>{unit[0].toUpperCase() + unit.slice(1)} in week 1 <input type="number" min="1" max={max} step="1" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 64, font: "inherit" }} /></label>
        <label>Week 1 starts <input type="date" min={firstDay} max={lastDay} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={{ font: "inherit" }} /></label>
        <button type="button" style={DASH_WIDGET_BUTTON} disabled={state === "Saving…"} onClick={save}>Save</button>
        <button type="button" style={DASH_WIDGET_BUTTON} onClick={() => setEditing(false)}>Cancel</button>
      </div>}
      <p className="dw-note" role="status" style={{ margin: "6px 0 0" }}>{state || (!live ? "Preview · targets save after sign-in" : "")}</p>
    </div>
  </div>;
}
function DashOnboardingPanel({ clients, role, live }) {
  const rows = dashOnboardingRows(clients, role);
  const key = dashObKey(role);
  const [open, setOpen] = React.useState(null);
  const firstBoard = rows.find((c) => !c.unread);
  const openId = open || (firstBoard ? firstBoard.profile.id : null);
  if (!rows.length) return <p className="dw-note">No clients in their first 30 days with you.</p>;
  return <div>
    <p className="dw-note" style={{ marginTop: 0 }}>Each new client's first 30 days. A step ticks when its record exists: your message, a published plan, a check-in.</p>
    {rows.map((c) => {
      if (c.unread) return <section key={c.profile.id} style={{ borderTop: "1px solid var(--sh-line, #302c27)", padding: "12px 0", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <strong style={{ fontWeight: 600 }}>{c.profile.name}</strong>
        <span style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)" }}>{c.unread === "loading" ? "Loading their first 30 days…" : "Couldn't read their first 30 days. Reload to try again."}</span>
      </section>;
      const ob = c.onboarding[key];
      const isOpen = openId === c.profile.id;
      return <section key={c.profile.id} style={{ borderTop: "1px solid var(--sh-line, #302c27)" }}>
        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "none" : c.profile.id)}
          style={{ display: "flex", width: "100%", gap: 12, alignItems: "baseline", flexWrap: "wrap", padding: "12px 0", background: "transparent", border: 0, color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
          <strong style={{ fontWeight: 600 }}>{c.profile.name}</strong>
          <span style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)" }}>Day {ob.day} of {ob.days}</span>
          <span style={{ fontSize: 12, marginLeft: "auto", color: "var(--sh-accent-ink, #2ee0c4)" }}>{dashOnboardingNext(ob, role)} {isOpen ? "▴" : "▾"}</span>
        </button>
        {isOpen && <DashOnboardingBoard client={c} ob={ob} role={role} live={live} />}
      </section>;
    })}
  </div>;
}

function dashReplyRows(threads) {
  return (threads || []).filter((thread) => {
    const messages = thread.messages || [];
    return thread.latestKnown !== false && messages.length && messages[messages.length-1].mine === false;
  }).map((thread) => ({ ...thread, waitingSince: thread.messages[thread.messages.length-1].createdAt }))
    .sort((a,b) => String(a.waitingSince).localeCompare(String(b.waitingSince)));
}
function useDashWidgetRead(paths, enabled) {
  const account = useSignedIn();
  const [attempt, retry] = React.useReducer((n) => n+1,0);
  const [state, setState] = React.useState({ loading: true, data: null, error: false });
  const key = paths.join("|");
  React.useEffect(() => {
    let on = true;
    if (!enabled) { setState({ loading:false, data:null, error:false, account }); return; }
    if (account === undefined) { setState({ loading:true, data:null, error:false, account }); return; }
    if (account === null) { setState({ loading:false, data:null, error:true, account }); return; }
    setState({ loading:true, data:null, error:false });
    Promise.all(paths.map(async (path) => { const res = await fetch(path,{credentials:"same-origin",cache:"no-store"}); if (!res.ok) throw new Error("unavailable"); return res.json(); }))
      .then((data) => { if (on) setState({ loading:false, data, error:false, account }); })
      .catch(() => { if (on) setState({ loading:false,data:null,error:true,account }); });
    return () => { on=false; };
  }, [key, enabled, attempt, account]);
  return { ...state, loading: state.loading || (enabled && state.account !== account), data: state.account === account ? state.data : null, retry };
}
function DashRepliesPanel({ role, live }) {
  const read = useDashWidgetRead(["/api/" + role + "/messages"],live);
  const rows = read.data ? dashReplyRows(read.data[0].threads) : [];
  const unknown = read.data ? (read.data[0].threads || []).filter((t) => t.latestKnown === false).length : 0;
  return <div>
    {!live ? <p className="dw-note">Replies appear from your client conversations after sign-in.</p> : read.loading ? <p>Loading conversations…</p> : read.error ? <p>Couldn't read conversations. <button type="button" style={DASH_WIDGET_BUTTON} onClick={read.retry}>Retry</button></p> : <>
      <p className="dw-note">Latest message is incoming · oldest first · up to 50 recent conversations.</p>
      {!!unknown && <p className="dw-note">Latest message unavailable for {unknown} conversations. Open Messages to check them.</p>}
      {!rows.length && <p>No replies waiting in the conversations we could read.</p>}
      <DashWidgetList rows={rows} label="conversations" renderRow={(row) => <div className="dw-row"><div>{row.clientName}<div className="dw-note">Waiting since {new Date(row.waitingSince).toLocaleString()}</div></div><button type="button" style={DASH_WIDGET_BUTTON} onClick={() => {
        const opts = { conversationId: row.id, who: row.clientName };
        if (window.__openChatTo) window.__openChatTo(opts); else if (window.__openChat) window.__openChat(opts);
      }}>Open conversation</button></div>} />
      <button type="button" style={DASH_WIDGET_BUTTON} onClick={read.retry}>Refresh replies</button>
    </>}
  </div>;
}

// Union working-hour intervals and subtract booking intervals, never event counts.
// Intersect actual instants, including overnight sessions and clock changes.
// Working hours in another/unknown zone are explicitly unavailable.
// ⚠ THE DAYS ARE `zone`'S (P9): the hours are wall-clock minutes in the account's zone, so the week
// is walked on that clock, whatever this browser's is. Without a zone or ShapeZone, this browser's.
function dashCapacity(events, slots, now = new Date(), zone = null) {
  const merge = (ranges) => {
    const out = [];
    for (const [start,end] of ranges.sort((a,b) => a[0]-b[0])) {
      const last = out[out.length-1];
      if (last && start <= last[1]) last[1] = Math.max(last[1],end); else out.push([start,end]);
    }
    return out;
  };
  const Z = zone ? dashZoneLib() : null;
  const zoned = !!(Z && Z.normalizeZone(zone));
  const base = zoned ? Z.partsInZone(now, zone) : null;
  // Day i's calendar fields; civil dates step in UTC, which has no clock change to trip on.
  const dayAt = (i) => {
    if (!zoned) { const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()+i); return { y: d.getFullYear(), mo: d.getMonth()+1, d: d.getDate(), wd: d.getDay() }; }
    const u = new Date(Date.UTC(base.y, base.mo-1, base.d+i));
    return { y: u.getUTCFullYear(), mo: u.getUTCMonth()+1, d: u.getUTCDate(), wd: u.getUTCDay() };
  };
  const instant = (c, minute) => zoned ? dashWallInstant(Z, zone, c.y, c.mo, c.d, minute) : new Date(c.y,c.mo-1,c.d,0,minute).getTime();
  const keyOf = (c) => c.y + "-" + String(c.mo).padStart(2,"0") + "-" + String(c.d).padStart(2,"0");
  const dateOf = (t) => zoned ? Z.dayKey(t, zone) : dashLocalDate(new Date(t));
  const minuteOf = (t) => { if (zoned) { const p = Z.partsInZone(t, zone); return p.h*60+p.mi; } const d = new Date(t); return d.getHours()*60+d.getMinutes(); };
  const offsetAt = (t) => zoned ? Z.offsetMinutes(zone, t) : -new Date(t).getTimezoneOffset();
  const days = []; let available = 0, booked = 0, unreadable = 0;
  for (let i=0;i<7;i++) {
    const c = dayAt(i);
    const dayStart = instant(c, 0), dayEnd = instant(dayAt(i+1), 0);
    const date = keyOf(c);
    const at = (minute) => instant(c, minute);
    const hours = merge((slots || []).filter((s) => s.weekday === c.wd && Number.isFinite(s.start_minute) && s.start_minute >= 0 && s.start_minute < 1440 && Number.isFinite(s.duration_min) && s.duration_min > 0).map((s) => [Math.max(at(s.start_minute), Math.ceil(now.getTime()/60000)*60000),at(Math.min(1440,s.start_minute+s.duration_min))]).filter(([a,b]) => b>a));
    const bookings = [];
    for (const event of events || []) {
      if (!["SESSION","CONSULT"].includes(event.kind) || ["cancelled","canceled","declined"].includes(event.status)) continue;
      const wall = /^\d{4}-\d{2}-\d{2}$/.test(event.date || "") && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || "") ? event.date.split("-").map(Number).concat(event.time.split(":").map(Number)) : null;
      const start = event.scheduledAt ? new Date(event.scheduledAt).getTime() : wall ? instant({ y: wall[0], mo: wall[1], d: wall[2] }, wall[3]*60+wall[4]) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(Number(event.durationMin)) || !(Number(event.durationMin)>0)) { if (event.date === date || (Number.isFinite(start) && dateOf(start) === date)) unreadable++; continue; }
      const end = start + Number(event.durationMin)*60000;
      if (start < dayEnd && end > dayStart) bookings.push([Math.max(dayStart,start),Math.min(dayEnd,end)]);
    }
    const busy = merge(bookings);
    const free = [];
    for (const [start,end] of hours) {
      available += (end-start)/60000;
      let cursor = start;
      for (const [a,b] of busy) {
        if (a >= end || b <= cursor) continue;
        if (a>cursor) free.push([cursor,Math.min(a,end)]);
        booked += Math.max(0,Math.min(end,b)-Math.max(cursor,a))/60000;
        cursor = Math.max(cursor,Math.min(end,b));
      }
      if (cursor<end) free.push([cursor,end]);
    }
    const minute = (stamp) => stamp === dayEnd ? 1440 : minuteOf(stamp);
    days.push({date,free:free.map(([a,b]) => [minute(a),minute(b)]),freeInstants:free,clockChange:offsetAt(dayStart) !== offsetAt(dayEnd)});
  }
  return { available, booked, free:available-booked, unreadable, days };
}
// ⚠ CAPACITY IS COUNTED ON THE ACCOUNT'S CLOCK (P9). The hours are stored against the listing's zone,
// which the database copies from the account's, so the two normally agree, wherever this browser
// is. Without shapeZone.mjs this browser's zone stands in, as before.
function DashCapacityPanel({ role, live }) {
  useDashZoneTick();
  const Z = dashZoneLib();
  const zone = Z ? Z.viewerZone() : (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; } })();
  const from = dashDayKeyFrom(zone, -1);
  const to = dashDayKeyFrom(zone, 7);
  const read = useDashWidgetRead(["/api/calendar?capacityRole="+role+"&from="+from+"&to="+to, "/api/my-availability?role="+role],live);
  const comparable = read.data && read.data[0].bookingsReadable === true && read.data[1].timezone === zone;
  const capacity = comparable ? dashCapacity(read.data[0].events,read.data[1].slots,new Date(),zone) : null;
  const hm = (minute) => String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0");
  const zonedTime = (stamp) => Z ? Z.formatTime(stamp, { zone, hour12: false, withZone: true }) : new Date(stamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",timeZoneName:"short"});
  const label = (z) => (Z && Z.zoneLabel(z)) || z;
  const hoursZone = read.data && read.data[1] ? read.data[1].timezone : null;
  return <div>
    {!live ? <p className="dw-note">Capacity appears once your bookings and working hours are saved.</p> : read.loading ? <p>Loading capacity…</p> : read.error || !read.data ? <p>Couldn't read capacity. <button type="button" style={DASH_WIDGET_BUTTON} onClick={read.retry}>Retry</button></p> : !comparable ? <p className="dw-note">{hoursZone && hoursZone !== zone ? "Your working hours are saved in " + label(hoursZone) + ", not your time zone (" + label(zone) + "). Open Schedule and save them to count capacity on your clock." : "Open Schedule and save your working hours to see capacity."}</p> : !capacity.available ? <p>Set your working hours in Schedule to see capacity.</p> : capacity.unreadable ? <p>Capacity unavailable: {capacity.unreadable} bookings have an unreadable time or duration.</p> : <>
      <div style={{ fontSize:22 }}>{(capacity.booked/60).toFixed(1)} of {(capacity.available/60).toFixed(1)} hours booked</div>
      <p className="dw-note">Rest of today and the next 6 days · {label(zone)} · {(capacity.free/60).toFixed(1)} hours free within working hours. Overlapping bookings count once.</p>
      {capacity.days.filter((d) => d.free.length).map((d) => <div className="dw-row" key={d.date}><a className="dw-action" href={dashLinkedTab("schedule",role,{date:d.date})}>{d.date}</a><span className="dw-note">{d.clockChange ? d.freeInstants.map(([a,b]) => zonedTime(a)+"–"+zonedTime(b)).join(" · ") : d.free.map(([a,b]) => hm(a)+"–"+hm(b)).join(" · ")}</span></div>)}
    </>}
    <a className="dw-action" href={dashTabHref("schedule",role)}>Open Schedule →</a>
  </div>;
}


// ── The shared page ─────────────────────────────────────────────────────────
// ── Today, laid out as B (owner, 2026-10-14) ─────────────────────────────────
// "i like option B": the day on the left — what is up next and the timeline it sits in —
// and the work on the right, led by one "Needs you" card whose tabs are the queues a
// coach works through. Both are composed from what this page already holds; neither
// fetches anything of its own.

// "2H 10M", "45M", "1M". Never "0M": a session starting inside the minute is "1M" away.
function dashCountdown(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? h + "H" + (m ? " " + m + "M" : "") : m + "M";
}

// The day column. `rows` is the live schedule with real instants ({ at, end, time, who,
// sub, status }), or null for the signed-out preview, which passes its own rows as
// `demoRows` and marks the next one with status "NEXT" — the preview has no clock to measure.
// ⚠ A LIVE ROW IS DONE WHEN IT HAS ENDED, NOT WHEN IT HAS STARTED (or once it is marked
// completed). A session in progress is still the one up next: it is the one the coach is in.
// ⚠ AND A CANCELLED OR DECLINED BOOKING IS NOT ON THE DAY AT ALL. The role dashboard routes
// return every booking in today's window whatever its status (Codex, #2343), so without this
// a cancelled 3pm read "UP NEXT" with a Message button. The set is the calendar's own
// (`.in('status', ['confirmed', 'requested', 'completed'])` in both routes).
const DASH_NOW_STATUSES = ["requested", "confirmed", "completed"];
// The day's rows with each one's state, and which is up next. Shared by the day column and by
// the board's Up next and Today widgets, so all three agree on the same rule.
function useDashNowState(rows, demoRows) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!rows) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [!!rows]);
  const items = rows
    ? rows.filter((r) => !r.status || DASH_NOW_STATUSES.indexOf(r.status) !== -1)
        .map((r) => ({ ...r, done: r.status === "completed" || +r.end <= now, live: r.status !== "completed" && +r.at <= now && now < +r.end }))
    : (demoRows || []).filter((r) => r && r.time !== "—").map((r) => ({ ...r, done: r.status === "DONE", live: false }));
  let nextIdx = rows ? items.findIndex((r) => !r.done) : items.findIndex((r) => r.status === "NEXT");
  if (!rows && nextIdx < 0) nextIdx = items.findIndex((r) => !r.done);
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  return { now, items, nextIdx, next };
}
const DASH_NOW_EYEBROW = { fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase" };

// Up next: the session the coach is in or goes to next, what they know about the client, and a
// way to reach them. `single` is the board's widget: one action (Message), the name opens the file.
// `peek` (the board's card): the name opens the client panel, and keeps the file's address.
// `unread`: true when the day feed failed, "loading" before the page's first read has landed (neither
// may say the day is clear). `rosterUnread`: the roster couldn't be read, so the client's history
// is unread, never "No shared history yet".
function DashUpNextCard({ rows, state, clients, role, unit, zone, single = false, unread = false, peek, rosterUnread = false }) {
  const units = useDashUnits();
  const { now, items, next } = state;
  const rec = next ? dashFindRecord(clients, next.who, next.clientId) : null;
  const context = rec ? dashContextLine(rec, units) : "";
  const fileHref = rec ? dashClientHref(rec, role) : null;
  const lead = !next ? null
    : !rows ? "UP NEXT"
    : next.live ? "ON NOW · UNTIL " + dashFmtTime(next.end, zone)
    : "UP NEXT · IN " + dashCountdown(+next.at - now);
  const eyebrow = DASH_NOW_EYEBROW;
  const btn = { flex: 1, minHeight: 38, borderRadius: 9, font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" };
  // The board's card marks the client's tier beside the name; the name keeps the card's ink.
  const name = next ? <DashClientName points={single ? dashRecordTier(rec) : null} size={10} weight={null}>{next.who}</DashClientName> : null;
  return (
    <section aria-label="Up next" style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line2, #413d38)", borderRadius: single ? 12 : 14, padding: single ? "16px 18px" : 18 }}>
      {next ? (
        <React.Fragment>
          <div style={{ display: "flex", alignItems: "center", justifyContent: single ? "flex-start" : "space-between", gap: 10, paddingRight: single ? 52 : 0 }}>
            <span style={{ ...eyebrow, color: "var(--sh-accent, #2ee0c4)" }}>{lead}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: "var(--sh-ink3, #75706a)" }}>{next.time}</span>
          </div>
          <div style={{ fontFamily: serif, fontSize: single ? 22 : 24, fontWeight: 650, letterSpacing: "-0.01em", fontVariationSettings: "'wdth' 112", marginTop: single ? 8 : 10, lineHeight: 1.1 }}>
            {single && rec ? <DashPeekLink id={rec.profile ? rec.profile.id : null} rec={rec} role={role} peek={peek}>{name}</DashPeekLink> : name}
          </div>
          {next.sub && <div style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", marginTop: 4 }}>{next.sub}</div>}
          <div style={{ fontSize: 12.5, color: "var(--sh-ink2, #a09b94)", marginTop: single ? 10 : 12, paddingTop: single ? 10 : 12, borderTop: "1px solid var(--sh-line, #302c27)" }}>{context || (rosterUnread ? DASH_ROSTER_UNREAD : "No shared history yet")}</div>
          <div style={{ display: "flex", gap: 8, marginTop: single ? 12 : 14 }}>
            {fileHref && !single
              ? <a href={fileHref} style={{ ...btn, border: 0, background: TEAL_BRIGHT, color: "var(--sh-deep, #06231f)" }}>Client file</a>
              : null}
            <button type="button" className={single ? "sh-key" : undefined} onClick={() => dashMessageClient(next.who, role, undefined, rec && rec.profile && rec.profile.id)} style={{ ...btn, border: "1px solid var(--sh-line2, #413d38)", background: fileHref && !single ? "transparent" : TEAL_BRIGHT, color: fileHref && !single ? INK : "var(--sh-deep, #06231f)" }}>Message</button>
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <span style={{ ...eyebrow, color: "var(--sh-ink3, #75706a)" }}>{unread ? "Today" : items.length ? "Done for today" : "Nothing booked today"}</span>
          <div data-dash-upnext={unread === "loading" ? "loading" : unread ? "unread" : items.length ? "done" : "clear"} style={{ fontFamily: serif, fontSize: 22, fontWeight: 650, fontVariationSettings: "'wdth' 112", marginTop: 10 }}>{unread === "loading" ? "Reading today's " + unit + "s…" : unread ? "Today's " + unit + "s couldn't be read just now." : items.length ? "Every " + unit + " is behind you." : "Your schedule is clear."}</div>
          <a href={dashTabHref("schedule", role)} style={{ display: "inline-block", fontSize: 13, marginTop: 10, color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none" }}>Open the schedule →</a>
        </React.Fragment>
      )}
    </section>
  );
}

// Today's timeline, marked where the day is. `clients` (the board's widget) marks each name still
// to come with its client's tier when the row's client is on the roster.
function DashTimelineCard({ rows, state, unit, onOpenCalendar, zone, clients, role, card = false, unread = false }) {
  const { now, items, nextIdx } = state;
  const eyebrow = DASH_NOW_EYEBROW;
  const plural = unit + (items.length === 1 ? "" : "s");
  const tierOf = (who) => (clients ? dashRecordTier(dashFindRecord(clients, who)) : null);
  const marker = (label) => (
    <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "var(--sh-accent, #2ee0c4)" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--sh-accent, #2ee0c4)" }} />
    </div>
  );
  return (
    <section aria-label="Today" style={card ? { background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: 18 } : undefined}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: card ? "flex-start" : "space-between", gap: 12, marginBottom: 4, paddingRight: card ? 52 : 0 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Today</h2>
        {onOpenCalendar
          ? <button type="button" onClick={onOpenCalendar} style={{ background: "transparent", border: 0, padding: "6px 0", cursor: "pointer", ...eyebrow, color: "var(--sh-accent-ink, #2ee0c4)" }}>Calendar →</button>
          : <span style={{ ...eyebrow, color: "var(--sh-ink3, #75706a)" }}>{unread ? "—" : items.length + " " + plural}</span>}
      </div>
      {items.length === 0 && <div data-dash-timeline={unread === "loading" ? "loading" : unread ? "unread" : "empty"} style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", padding: "9px 0" }}>{unread === "loading" ? "Reading today's timeline… " : unread ? "Today's timeline couldn't be read just now. " : "No " + unit + "s on today's timeline. "}<a href={dashTabHref("schedule", role)} style={{ color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none" }}>Open the schedule →</a></div>}
      {items.map((r, i) => {
        const points = r.done ? null : tierOf(r.who);
        return (
          <React.Fragment key={i}>
            {i === nextIdx && (rows || r.status === "NEXT") && marker(rows ? "NOW " + dashFmtTime(new Date(now).toISOString(), zone) : "NOW")}
            <div style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 10, padding: "9px 0", color: r.done ? "var(--sh-ink3, #75706a)" : INK }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: i === nextIdx ? "var(--sh-accent, #2ee0c4)" : "var(--sh-ink3, #75706a)" }}>{r.time}</span>
              <span style={{ fontSize: 13, fontWeight: i === nextIdx ? 600 : 400, minWidth: 0 }}>
                <DashClientName points={points} size={7} weight={null}>{r.who}</DashClientName>{r.sub ? <span style={{ color: "var(--sh-ink3, #75706a)", fontWeight: 400 }}>{" · " + r.sub}</span> : null}
              </span>
            </div>
          </React.Fragment>
        );
      })}
      {rows && items.length > 0 && nextIdx < 0 && marker("NOW " + dashFmtTime(new Date(now).toISOString(), zone))}
    </section>
  );
}

function DashNowColumn({ rows, demoRows, clients, role, unit, onOpenCalendar, zone }) {
  const state = useDashNowState(rows, demoRows);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <DashUpNextCard rows={rows} state={state} clients={clients} role={role} unit={unit} zone={zone} />
      {state.items.length > 0 && <DashTimelineCard rows={rows} state={state} unit={unit} onOpenCalendar={onOpenCalendar} zone={zone} role={role} />}
    </div>
  );
}

// ── Today as a board (coach dashboard step 3; the owner's design, 2026-11-06) ──────────────
// Six widgets, one question each, and the first screen is the whole page: the Brief and Up next,
// At a glance and Money, Needs you and the Today timeline (the default board below). Every figure
// is one this page already reads; a figure it cannot read says so, never a stand-in (the owner's
// rollout rule). Height means priority: Needs you, the one thing to act on, stands at Lift 2, the
// timeline (a list) rests at Lift 0, and the rest sit at the cell's resting Lift 1 (dashGrid.jsx).

// ⚠ A CLIENT'S COLOUR IS THEIR SHAPE SCORE TIER'S (the owner, 2026-11-06), ON A MARK, NEVER ON THE
// NAME: the name keeps the page's ink, and a gem or a dot beside it takes the tier's own colour,
// with the tier in words for hover and assistive tech ("Form tier"). clientColors.mjs is read at
// CALL time (window.ShapeClientColors, as dashRoster.jsx's dashClientTierMark). An unknown tier
// (not read, a failed read, the preview's client without one, no module on the page) draws no
// colour at all: never Raw, and never a severity colour, since red, gold and green are tiers too.
// A record's rank points (useDashboard's `rankPoints`, a triage row's client's), or null.
function dashRecordTier(rec) {
  const r = rec && rec.client && typeof rec.client === "object" ? rec.client : rec;
  const v = r && typeof r === "object" ? r.rankPoints : null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}
// The mark for a tier: { tier, title, style }, or null when it is unknown.
function dashTierMark(points) {
  try {
    const CC = typeof window !== "undefined" ? window.ShapeClientColors : null;
    if (points == null || !CC || typeof CC.clientTier !== "function" || typeof CC.clientTierVars !== "function") return null;
    const t = CC.clientTier(points), vars = CC.clientTierVars(points);
    return t && vars ? { tier: t.key, title: t.title, style: vars } : null;
  } catch (e) { return null; }
}
// A dot before a name where no gem is drawn. Nothing for an unknown tier.
function DashTierDot({ points, size = 8 }) {
  const m = dashTierMark(points);
  if (!m) return null;
  return <span className="sh-tier-mark" data-tier={m.tier} role="img" aria-label={m.title} title={m.title}
    style={{ ...m.style, display: "inline-block", width: size, height: size, borderRadius: "50%", flexShrink: 0, verticalAlign: "0.08em", marginRight: Math.round(size * 0.7) }} />;
}
// ⚠ ANY CLIENT NAME OPENS THE SAME PANEL (the owner's coach review, step 5a): a plain click on a name
// opens the client panel on this page (DashClientDrawer) rather than leaving it, and the name keeps
// its own address (dashClientHref), so ⌘/Ctrl-click, Shift-click and a middle click still open the
// full client file in a tab or a window, as any link does. `peek` is the page's { can(id), open(id) }.
// A name with no address (the preview's people have no file) is a button that opens the panel; one
// the panel can't open (not on the roster) keeps its plain link, or is just the name.
function dashPeekClick(e, open) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  e.stopPropagation();
  open();
  return true;
}
function DashPeekLink({ id, rec, role, peek, label, style, children }) {
  const href = rec ? dashClientHref(rec, role) : id != null ? dashClientHref({ profile: { id } }, role) : null;
  const can = !!(peek && typeof peek.can === "function" && typeof peek.open === "function" && id != null && peek.can(id));
  const base = { color: "inherit", textDecoration: "none", ...(style || {}) };
  if (href) {
    return <a href={href} data-dash-peek-name={can ? "" : undefined} aria-label={label} onClick={can ? (e) => dashPeekClick(e, () => peek.open(id)) : undefined} style={base}>{children}</a>;
  }
  if (can) {
    return <button type="button" data-dash-peek-name="" aria-label={label} onClick={(e) => { e.stopPropagation(); peek.open(id); }}
      style={{ ...base, font: "inherit", letterSpacing: "inherit", background: "none", border: 0, padding: 0, margin: 0, cursor: "pointer", textAlign: "inherit" }}>{children}</button>;
  }
  return <React.Fragment>{children}</React.Fragment>;
}
// A client's name in the page's ink, their tier's dot before it, the tier in words on hover. The
// dot is held to the name's first word, so a narrow card wraps the name but never strands the dot.
// `link` ({ id, rec, role, peek }) makes the name open the client panel (DashPeekLink).
function DashClientName({ points, size, weight = 600, children, link }) {
  const m = dashTierMark(points);
  const text = typeof children === "string" ? children : null;
  const cut = text ? text.indexOf(" ") : -1;
  const head = cut > 0 ? text.slice(0, cut) : children;
  const tail = cut > 0 ? text.slice(cut) : null;
  const inner = <React.Fragment>{m ? <span style={{ whiteSpace: "nowrap" }}><DashTierDot points={points} size={size} />{head}</span> : head}{tail}</React.Fragment>;
  return (
    <span title={m ? m.title : undefined} style={weight == null ? undefined : { fontWeight: weight }}>
      {link ? <DashPeekLink {...link}>{inner}</DashPeekLink> : inner}
    </span>
  );
}
// A gem: a small square in the tier's colour, the tier in words (`title`, the label for assistive
// tech unless `decorative`, inside a control that already names itself). An unknown tier is a
// hollow square that claims nothing.
function DashClientGem({ points, title, decorative = false }) {
  const m = dashTierMark(points);
  const box = { display: "inline-block", width: 9, height: 9, borderRadius: 3, flexShrink: 0 };
  if (!m) return <span aria-hidden="true" title={title} data-tier-unknown="" style={{ ...box, boxShadow: "inset 0 0 0 1px var(--sh-line2, #413d38)" }} />;
  const words = title ? title + " · " + m.title : m.title;
  return <span className="sh-tier-mark" data-tier={m.tier} title={words} {...(decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": m.title })} style={{ ...m.style, ...box }} />;
}

// The brief's clock, in prose: the next session's start on the coach's own day (the route's
// `dayZone`), through ShapeZone in the viewer's clock style ("2:00 PM", or "14:00" where the
// locale writes 24 hours). Without ShapeZone, this browser's clock in that zone.
function dashBriefTime(iso, zone) {
  const Z = dashZoneLib();
  if (Z && typeof Z.formatTime === "function") {
    const s = Z.formatTime(iso, { zone: zone || undefined });
    if (s) return s;
  }
  const opts = { hour: "numeric", minute: "2-digit" };
  try { return new Date(iso).toLocaleTimeString([], zone ? { ...opts, timeZone: zone } : opts); }
  catch (e) { try { return new Date(iso).toLocaleTimeString([], opts); } catch (e2) { return ""; } }
}

// ⚠ THE NEXT APPOINTMENT IS THE NEXT ONE STILL TO COME TODAY, ON THE COACH'S DAY (owner,
// 2026-11-06). A booking on the day (not cancelled or declined, not marked done) that starts after
// `now` and falls on today's date in `zone`; one that has started is no longer "next up", and one
// earlier today is never named. The preview has no clock: its row marked NEXT, at its own time.
function dashNextToday(rows, demoRows, now, zone) {
  if (!rows) {
    const r = (demoRows || []).find((x) => x && x.status === "NEXT" && x.time && x.time !== "—");
    return r ? { who: r.who, time: r.time } : null;
  }
  const Z = dashZoneLib();
  const tz = Z && zone && Z.normalizeZone(zone) ? zone : (Z ? Z.viewerZone() : null);
  const dayOf = (t) => (Z ? Z.dayKey(t, tz) : dashLocalDate(new Date(t)));
  const today = dayOf(now);
  let best = null;
  for (const r of rows) {
    const at = r && r.at != null ? +new Date(r.at) : NaN;
    if (!Number.isFinite(at)) continue;
    if (r.status && (DASH_NOW_STATUSES.indexOf(r.status) === -1 || r.status === "completed")) continue;
    if (at <= now || dayOf(at) !== today) continue;
    if (!best || at < best.at) best = { at, who: r.who, clientId: r.clientId != null ? r.clientId : null };
  }
  return best ? { who: best.who, clientId: best.clientId, time: dashBriefTime(new Date(best.at).toISOString(), zone) } : null;
}

// ⚠ THE BRIEF NAMES WHO NEEDS THE COACH, NEVER A TIME (owner, 2026-11-06): "3 clients need your
// attention", each name in the card's ink with their tier's dot before it; then, as its own
// sentence, the next appointment still to come today. The count is the engine's "Needs you"
// (coachNeeds' `now`: red, with a lead of the coach's own), the same set the roster's status calls
// "Needs you". One reading, as pieces:
// the card marks the named ones' tiers, and dashBriefText is the same words as plain text.
// `needNow` null is a pulse that could not be read: the brief says so, never "nobody". With nothing
// left today it says "No more sessions today." (owner, 2026-11-06), but only over a day that was
// read (`day.read`): the preview has no clock, and an unread day is not an empty one.
function dashBriefModel(needNow, next, day) {
  const read = Array.isArray(needNow);
  const rows = read ? needNow : [];
  const names = rows.slice(0, 3).map((r) => {
    const p = r && r.client && r.client.profile ? r.client.profile : {};
    return { id: p.id != null ? p.id : null, name: p.name || "A client", points: dashRecordTier(r && r.client) };
  });
  const unit = day && typeof day.unit === "string" && day.unit ? day.unit : "session";
  return { count: read ? rows.length : null, names, more: rows.length - names.length, next: next && next.who ? next : null, dayRead: !!(day && day.read), unit, loading: !!(day && day.loading) };
}
function dashBriefPieces(model) {
  const out = [];
  const n = model ? model.count : 0;
  // Before the page's first read lands nothing has been read: neither "nobody" nor a failure.
  if (n == null) out.push({ t: model && model.loading ? "Reading who needs your attention…" : "Who needs your attention couldn't be read just now." });
  else if (!n) out.push({ t: "Nobody needs your attention right now." });
  else {
    out.push({ t: (n === 1 ? "1 client needs" : n + " clients need") + " your attention: " });
    const names = model.names.map((x) => ({ t: x.name, id: x.id, points: x.points != null ? x.points : null, name: true }));
    if (model.more > 0) names.push({ t: model.more + " more" });
    names.forEach((p, i) => {
      if (i > 0) out.push({ t: i === names.length - 1 ? " and " : ", " });
      out.push(p);
    });
    // A name that ends in an initial ("Elena R.") already closes the sentence.
    if (!/\.$/.test(names[names.length - 1].t)) out.push({ t: "." });
  }
  if (model && model.next) {
    out.push({ t: " Next up today: " });
    out.push({ t: model.next.who, id: model.next.id != null ? model.next.id : null, points: model.next.points != null ? model.next.points : null, name: true });
    out.push({ t: " at " + model.next.time + "." });
  } else if (model && model.dayRead) {
    out.push({ t: (out.length ? " " : "") + "No more " + model.unit + "s today." });
  }
  return out;
}
function dashBriefText(model) { return dashBriefPieces(model).map((p) => p.t).join(""); }

// ⚠ ONLY THE ROW'S OWN KEYS OPEN THE DRAWER (#2628 review). Enter or Space on the row's action
// button (Message, Congratulate) bubbles up to the row; taking it there would cancel the button's
// own activation and open the drawer instead.
function dashRowKeyOpen(e, canOpen, open) {
  if (!canOpen || e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  open();
}

// The widget: the brief over the engine's `now` (null when the pulse could not be read) and the
// day's rows, re-read every 30 seconds so a session that starts drops out of "next up".
function DashBriefWidget({ needNow, rows, demoRows, zone, clients, unit, role, peek, loading = false }) {
  const { now } = useDashNowState(rows, demoRows);
  const next = dashNextToday(rows, demoRows, now, zone);
  const rec = next ? dashFindRecord(clients, next.who, next.clientId) : null;
  const model = dashBriefModel(needNow, next ? { ...next, id: rec && rec.profile ? rec.profile.id : null, points: dashRecordTier(rec) } : null, { read: Array.isArray(rows), unit, loading });
  return <DashBriefCard model={model} role={role} peek={peek} />;
}
// With a `role`, each named client is a name that opens the client panel (`peek`), or their file.
function DashBriefCard({ model, role, peek }) {
  return (
    <section aria-label="Brief" style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: "18px 22px" }}>
      <div style={{ ...DASH_MONO_EYEBROW, marginBottom: 10 }}>Brief</div>
      <p data-dash-brief="" style={{ margin: 0, fontFamily: serif, fontSize: 22, lineHeight: 1.35, fontWeight: 500, letterSpacing: "-0.01em", fontVariationSettings: "'wdth' 108" }}>
        {dashBriefPieces(model).map((p, i) => p.name
          ? <DashClientName key={i} points={p.points} size={10} link={role && p.id != null ? { id: p.id, role, peek } : null}>{p.t}</DashClientName>
          : <React.Fragment key={i}>{p.t}</React.Fragment>)}
      </p>
    </section>
  );
}

// ⚠ NEEDS YOU SHOWS THREE, THEN FOLDS THE REST (owner, 2026-11-06). The rows are the engine's
// (coachNeeds): who needs the coach now (red), who to look at this week (amber), then good news (a
// client's dated milestone, the Client wins rule), each client once, in that order. Each row is the
// client's tier gem, their name in ink, one reason and one action, with its status as a labelled
// chip; the rest fold into one row of tier gems with what they are ("4 this week", "2 good news").
const DASH_NEEDS_SHOWN = 3;
const DASH_NEEDS_KINDS = {
  now: { chip: "Needs you", fold: (n) => n + " more need" + (n === 1 ? "s" : "") + " you", color: DASH_SEV_COLORS.red },
  week: { chip: "This week", fold: (n) => n + " this week", color: DASH_SEV_COLORS.amber },
  good: { chip: "Good news", fold: (n) => n + " good news", color: DASH_SEV_COLORS.green },
};
// The win rows Client wins lists: each client's newest dated milestone, newest first.
function dashWinRows(clients, units) {
  const rows = [];
  for (const c of clients || []) {
    const ms = dashMilestonesIn(DashSignals.buildMilestones(c), units);
    const hit = ms && Array.isArray(ms.recent) ? ms.recent.find((m) => m.hitAt) : null; // dated hits only (not active-streak fills)
    if (hit) rows.push({ client: c, hit });
  }
  return rows.sort((a, b) => String(b.hit.hitAt).localeCompare(String(a.hit.hitAt)));
}
// ⚠ A CLIENT A TRAINER AND A NUTRITIONIST SHARE, SLIPPING ON BOTH SIDES, IS FLAGGED HERE (the owner's
// answer to #2628, 2026-11-06). Joint attention (DashSignals.findJointAttention: a co-coach of the
// other discipline on the client's care team, and the client slipping in training and in nutrition)
// was only in the optional Work queues and Client attention cards. Here its client's row carries a
// "Shared" chip naming the other coach's role and, as its one reason and action, the joint ones: the
// private care-team note to that coach (dashOpenCareTeam), one plan before either of them messages
// the client. The row keeps the place the engine gave it; a joint client the engine did not list (the
// coach's own flag set aside) comes in after those who need the coach now, as one for this week.
// ⚠ THE NOTE TAKES THE ROW ONLY WHEN THE COACH'S OWN LEAD IS PART OF THE SLIP (one of the joint's
// flags), or there is no lead. A lead the engine ranks above it (a flagged health screening, a
// reply the client is waiting on) keeps its reason and its action, and the chip still says shared:
// a joint note must never stand where a screening read was.
function dashJointReason(j) {
  const words = (fs) => (Array.isArray(fs) ? fs : []).map((f) => String(f.label || "").toLowerCase()).filter(Boolean).join(", ");
  return "Slipping on both sides: " + words(j.trainingFlags) + " and " + words(j.nutritionFlags) + ".";
}
function dashNeedsItems(split, wins, joint) {
  const jointById = new Map();
  for (const j of Array.isArray(joint) ? joint : []) {
    const id = j && j.client && j.client.profile ? j.client.profile.id : null;
    if (id != null && j.coCoach && j.coCoach.role && !jointById.has(id)) jointById.set(id, j);
  }
  const seen = new Set();
  const out = [];
  const add = (kind, client, extra) => {
    const p = client && client.profile ? client.profile : {};
    const id = p.id != null ? p.id : null;
    if (id != null && seen.has(id)) return;
    if (id != null) seen.add(id);
    const j = id != null ? jointById.get(id) : null;
    let shared = null;
    if (j) {
      const lead = extra && extra.row && extra.row.lead ? extra.row.lead.key : null;
      const slip = (j.trainingFlags || []).concat(j.nutritionFlags || []).map((f) => f && f.key);
      shared = !lead || slip.includes(lead)
        ? { joint: j, shared: j.coCoach.role, sharedWith: j.coCoach, reason: dashJointReason(j), action: j.action || { kind: "care_team", label: "Start joint note" } }
        : { shared: j.coCoach.role, sharedWith: j.coCoach };
    }
    out.push({ kind, client, id, name: p.name || "A client", ...extra, ...(shared || {}) });
  };
  const listed = new Set([...((split && split.now) || []), ...((split && split.week) || [])].map((r) => r && r.client && r.client.profile ? r.client.profile.id : null));
  for (const r of (split && split.now) || []) add("now", r.client, { row: r, reason: r.lead.reason, action: r.lead.action || null });
  for (const [id, j] of jointById) if (!listed.has(id)) add("week", j.client, { row: null });
  for (const r of (split && split.week) || []) add("week", r.client, { row: r, reason: r.lead.reason, action: r.lead.action || null });
  for (const w of wins || []) add("good", w.client, { hit: w.hit, reason: w.hit.label, action: null });
  return out;
}
function dashNeedsFold(items, shown = DASH_NEEDS_SHOWN) {
  const list = Array.isArray(items) ? items : [];
  const rest = list.slice(shown);
  const groups = {};
  for (const k of Object.keys(DASH_NEEDS_KINDS)) groups[k] = rest.filter((x) => x.kind === k).length;
  // A shared client folded away is still named in the fold line, so the flag never leaves the board.
  return { shown: list.slice(0, shown), rest, groups, shared: rest.filter((x) => x.shared).length };
}
function dashNeedsFoldText(fold) {
  const parts = Object.keys(DASH_NEEDS_KINDS).filter((k) => fold.groups[k] > 0).map((k) => DASH_NEEDS_KINDS[k].fold(fold.groups[k]));
  if (fold.shared > 0) parts.push(fold.shared + " shared");
  return parts.join(" · ");
}

// `peek` is the page's client panel ({ can, open }: Today's one panel for every name on it); without
// one the board opens its own, as it did before step 5a.
function DashNeedsBoard({ items, feed, role, prefs, dismiss, peek, joint }) {
  const [all, setAll] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const fold = dashNeedsFold(items);
  const rows = all ? items : fold.shown;
  const Drawer = typeof window !== "undefined" && typeof window.DashClientDrawer === "function" ? window.DashClientDrawer : null;
  const rowOf = (id) => (Array.isArray(feed) ? feed.find((r) => r && r.client && r.client.profile && r.client.profile.id === id) : null) || null;
  const pk = peek || { can: (id) => !!(Drawer && id != null && rowOf(id)), open: setSelectedId };
  const openRow = !peek && selectedId != null ? rowOf(selectedId) : null;
  // ⚠ THE JOINT NOTE NEVER FAILS IN SILENCE. dashOpenCareTeam answers false when the thread can't be
  // opened (the route refused, the network) and for a client who is not a real account (the
  // preview's): the row then says so, instead of a button that did nothing.
  const [noteFail, setNoteFail] = React.useState(null);
  const go = (it) => {
    // A shared client's note goes to the other coach, never to the client (dashOpenCareTeam).
    if (it.joint) {
      setNoteFail(null);
      const real = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(it.id || "")) && !!(it.joint.coCoach && it.joint.coCoach.userId);
      const whose = "Your private thread with " + it.name + "'s " + it.shared;
      const say = real ? whose + " couldn't be opened just now." : whose + " opens on a live account.";
      Promise.resolve(dashOpenCareTeam(it.joint, role)).then((ok) => { if (!ok) setNoteFail(say); }, () => setNoteFail(say));
    }
    else if (it.kind === "good") dashMessageClient(it.name, role, dashCongratsDraft(it.client, it.hit), it.id);
    else if (it.action) dashCoachActionGo(it.action, it.row, role);
    else dashMessageClient(it.name, role, null, it.id);
  };
  const chipStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid currentColor", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" };
  const chip = (kind) => {
    const k = DASH_NEEDS_KINDS[kind];
    return <span style={{ ...chipStyle, color: k.color }}>{k.chip}</span>;
  };
  // The other coach's role, in the joint card's own rust (TriagePulsePanel's joint attention).
  const sharedChip = (it) => (
    <span data-dash-shared={it.shared} title={it.sharedWith && it.sharedWith.name ? "Shared with their " + it.shared + ", " + it.sharedWith.name : undefined}
      style={{ ...chipStyle, color: "var(--sh-rust, #e0644b)" }}>{"Shared · " + it.shared}</span>
  );
  // ⚠ THE NAME IS THE ROW'S OPENER, BESIDE ITS ACTION, NEVER AROUND IT (step 5a). The row used to be
  // a role="button" holding the action button; a name that is a link could not sit inside it as
  // well. The name now opens the panel (a plain click) or the file (⌘/Ctrl or a middle click), the
  // keyboard reaches it with Tab, and a click on the rest of the row still opens the panel.
  const renderRow = (it, i) => {
    const canOpen = !!(it.id != null && pk.can(it.id));
    const points = dashRecordTier(it.client);
    const tier = dashTierMark(points);
    return (
      <div key={(it.id != null ? it.id : "x") + ":" + i} data-dash-need={it.kind}
        // A click on the row's own surface opens the panel; one on the name or the action is theirs,
        // so a ⌘/Ctrl-click on the name opens the file in a tab and nothing here.
        onClick={(e) => { if (!canOpen || (e.target && e.target.closest && e.target.closest("a, button"))) return; pk.open(it.id); }}
        style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 2px", borderTop: i === 0 ? "none" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)", cursor: canOpen ? "pointer" : "default" }}>
        <DashClientGem points={points} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span title={tier ? tier.title : undefined} style={{ fontSize: 14, fontWeight: 600 }}>
              <DashPeekLink id={it.id} rec={it.client} role={role} peek={pk} label={canOpen ? "Open " + it.name + (tier ? ", " + tier.title : "") : undefined}>{it.name}</DashPeekLink>
            </span>
            {chip(it.kind)}
            {it.shared && sharedChip(it)}
          </div>
          <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.4, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>{it.reason}</div>
        </div>
        <button type="button" className="sh-key" onClick={(e) => { e.stopPropagation(); go(it); }}
          title={it.joint ? "Opens your private thread with their " + it.shared + " — the client doesn't see it" : undefined}
          style={{ flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)", background: "var(--sh-card, #25211d)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", borderRadius: 6, padding: "8px 11px", minHeight: 32, cursor: "pointer" }}>
          {it.joint ? it.action.label : it.kind === "good" ? "Congratulate" : it.action ? it.action.label : "Message"}
        </button>
      </div>
    );
  };
  return (
    <section aria-label="Needs you" data-dash-lift="2" style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, paddingRight: 52 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Needs you</h2>
        {items.length > 0 && <span style={DASH_MONO_EYEBROW}>{items.length} {items.length === 1 ? "client" : "clients"}</span>}
      </div>
      {items.length === 0
        ? <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--sh-ink2, #a09b94)" }}>Nobody needs you right now. Clients appear here when their logs, check-ins or Shape Score slip, and when they hit a milestone.</p>
        : rows.map(renderRow)}
      {/* Outside the rows: a live region inside a role="button" row is flattened, and never heard. */}
      {/* Always in the tree (empty and zero-high until it speaks), so its first message is announced. */}
      <div role="status" data-dash-note-fail={noteFail ? "" : undefined} style={{ marginTop: noteFail ? 6 : 0, fontSize: 12, lineHeight: 1.4, color: "var(--sh-ink2, #a09b94)" }}>{noteFail || ""}</div>
      {!all && fold.rest.length > 0 && (
        <button type="button" data-dash-fold="" aria-expanded={false} onClick={() => setAll(true)}
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: "100%", marginTop: 6, padding: "10px 2px 2px", background: "transparent", border: 0, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", font: "inherit", textAlign: "left", cursor: "pointer", color: "var(--sh-ink2, #a09b94)" }}>
          <span style={{ display: "inline-flex", gap: 4 }}>{fold.rest.map((it, i) => <DashClientGem key={i} points={dashRecordTier(it.client)} title={it.name} decorative />)}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sh-accent-ink, #2ee0c4)" }}>{fold.rest.length} more</span>
          <span style={{ fontSize: 12 }}>{dashNeedsFoldText(fold)}</span>
        </button>
      )}
      {all && items.length > DASH_NEEDS_SHOWN && <button type="button" aria-expanded={true} onClick={() => setAll(false)} style={{ ...DASH_WIDGET_BUTTON, marginTop: 8 }}>Show fewer</button>}
      {openRow && Drawer && <Drawer row={openRow} role={role} onClose={() => setSelectedId(null)} prefs={prefs} dismiss={dismiss} joint={joint} />}
    </section>
  );
}

// The widget: the engine's split (null when the pulse could not be read), the roster's wins, in the
// reader's units, and the shared clients' joint attention (useDashboard's `joint`).
// `loading`: the page's first read hasn't landed (source null), so nobody has been read yet.
function DashNeedsWidget({ split, clients, feed, joint, role, prefs, dismiss, peek, loading = false }) {
  const units = useDashUnits();
  if (!split) {
    return <section aria-label="Needs you" data-dash-lift="2" data-dash-needs={loading ? "loading" : "unread"} style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, padding: "18px 20px" }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>Needs you</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--sh-ink2, #a09b94)" }}>{loading ? "Reading who needs you…" : "Who needs you couldn't be read just now. Reload to try again."}</p>
    </section>;
  }
  return <DashNeedsBoard items={dashNeedsItems(split, dashWinRows(clients, units), joint)} feed={feed} role={role} prefs={prefs} dismiss={dismiss} peek={peek} joint={joint} />;
}
// `unread`: a signed-in coach's day feed failed (rows null on a live page). Neither card may then
// say the day is clear or done; that is a claim about a day nobody read.
function DashUpNextWidget({ rows, demoRows, clients, role, unit, zone, unread = false, peek, rosterUnread = false }) {
  const state = useDashNowState(rows, demoRows);
  return <DashUpNextCard rows={rows} state={state} clients={clients} role={role} unit={unit} zone={zone} single unread={unread} peek={peek} rosterUnread={rosterUnread} />;
}
function DashTimelineWidget({ rows, demoRows, clients, role, unit, zone, onOpenCalendar, unread = false }) {
  const state = useDashNowState(rows, demoRows);
  return <div data-dash-lift="0"><DashTimelineCard rows={rows} state={state} unit={unit} zone={zone} clients={clients} role={role} onOpenCalendar={onOpenCalendar} card unread={unread} /></div>;
}

// At a glance: three figures, each from the KPI pool's own derivation (dashSignals.js), so a figure
// it cannot read is a dash with the reason under it, as on the strips.
function DashGlanceCard({ cells }) {
  return (
    <section aria-label="At a glance" style={{ display: "grid", gridTemplateColumns: "repeat(" + cells.length + ", minmax(0,1fr))", background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, overflow: "hidden" }}>
      {cells.map((k, i) => (
        <div key={i} style={{ padding: "18px 20px", borderLeft: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : "none", minWidth: 0 }}>
          <div style={{ ...DASH_MONO_EYEBROW, fontSize: 10, marginBottom: 10 }}>{k.l}</div>
          <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: k.k === "—" ? "var(--sh-ink2, #a09b94)" : INK }}>{k.k}</div>
          {k.sub && <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 7 }}>{k.sub}</div>}
        </div>
      ))}
    </section>
  );
}
// ⚠ ITS THREE FIGURES ARE THE COACH'S TO CHOOSE (coach dashboard step 4a): the ⚙ picks each slot
// from the KPI pool, as the Practice and Business overview strips' gear does (dashKpiSettings), and
// a pick already shown swaps the two. Remembered per account and per role, three slots of their own
// (useRememberedSlots, one hook over fixed keys, for the strips' reason); the preview's picker works
// unsaved, as every other remembered control does there. The pool's "Roster compliance" reads
// "Roster logging" here, the card's own word for it, on the card and in its picker alike.
const DASH_GLANCE_DEFAULT = ["due", "reviewed", "compliance"];
const DASH_GLANCE_RENAME = { compliance: "Roster logging" };
function useDashGlanceKpis(prefs, role) {
  const base = "kpi:" + role + ":glance:";
  return useRememberedSlots(prefs, [base + "0", base + "1", base + "2"], DashSignals.DASH_KPI_KEYS, DASH_GLANCE_DEFAULT);
}
function dashGlanceCells(role, ctx, chosen) {
  const keys = Array.isArray(chosen) && chosen.length ? chosen : DASH_GLANCE_DEFAULT;
  return keys.map((key) => {
    const c = dashKpiCell(key, role, ctx);
    return DASH_GLANCE_RENAME[key] && DashSignals.dashKpiLabel(key, role) ? { ...c, l: DASH_GLANCE_RENAME[key] } : c;
  });
}
function dashGlanceSettings(chosen, role, onPick) {
  return dashKpiSettings(chosen, role, onPick).map((g) => ({ ...g, options: g.options.map((o) => (DASH_GLANCE_RENAME[o.v] ? { ...o, label: DASH_GLANCE_RENAME[o.v] } : o)) }));
}

// ── Roster logging trend (coach dashboard step 4a: a catalogue widget on Today) ──────────────
// Each of the last seven days, how many clients logged, of those whose record holds that day.
// ⚠ ONLY WHAT IS READ IS DRAWN, AND THE CARD SAYS SO. A client's record holds the days they logged in
// its window (dashData.jsx `foodLogDays`: `days`, and `from`, the first day a full window holds); a
// day before `from` is not in it, and a client with no record (an overview not read, a failed read)
// is no evidence either way: counted apart and said, never as "didn't log". Seven days, because that
// is what every record holds; the days are the coach's (`today`, on the account's clock).
// The preview's people carry their week as a count (foodLogs.daysLogged7d, ending on lastLoggedOn),
// so `sample` lays that count on the days it ends on: its own figures, under the demo band. A live
// page never reads that field here.
const DASH_LOG_TREND_DAYS = 7;
const DASH_DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dashDayShift(key, n) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dashLogTrend(clients, opts) {
  const o = opts || {};
  const today = typeof o.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.today) ? o.today : null;
  if (!today) return null;
  const keys = [];
  for (let i = DASH_LOG_TREND_DAYS - 1; i >= 0; i--) keys.push(dashDayShift(today, -i));
  const rows = Array.isArray(clients) ? clients.filter(Boolean) : [];
  const held = [];
  let unread = 0, pending = 0;
  for (const c of rows) {
    const rec = c.foodLogDays;
    if (rec && Array.isArray(rec.days)) {
      held.push({ days: new Set(rec.days.filter((d) => typeof d === "string")), from: typeof rec.from === "string" ? rec.from : null });
      continue;
    }
    if (o.sample && c.foodLogs) {
      const n = Number(c.foodLogs.daysLogged7d);
      const last = typeof c.foodLogs.lastLoggedOn === "string" ? c.foodLogs.lastLoggedOn.slice(0, 10) : null;
      if (Number.isInteger(n) && n >= 0 && n <= 7 && (last || n === 0)) {
        const days = new Set();
        for (let i = 0; i < n; i++) days.add(dashDayShift(last, -i));
        held.push({ days, from: null });
        continue;
      }
    }
    // An overview still on its way is not a failed read (useDashboard's progressRead).
    if (c.progressRead && c.progressRead.state === "loading") pending += 1;
    else unread += 1;
  }
  const days = keys.map((key) => {
    let logged = 0, read = 0;
    for (const h of held) {
      if (h.from && key < h.from) continue;
      read += 1;
      if (h.days.has(key)) logged += 1;
    }
    return { key, dow: DASH_DOW_SHORT[new Date(key + "T12:00:00Z").getUTCDay()], logged, read };
  });
  return { days, clients: rows.length, held: held.length, unread, pending, sample: !!o.sample };
}
function DashLogTrendPanel({ trend }) {
  if (!trend) return null;
  const max = Math.max(1, ...trend.days.map((d) => d.read));
  return (
    <div>
      <div role="img" aria-label={"Clients who logged, the last 7 days: " + trend.days.map((d) => d.dow + " " + d.logged + " of " + d.read).join(", ")}
        style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 6, alignItems: "end", height: 96 }}>
        {trend.days.map((d) => (
          <div key={d.key} data-dash-logday={d.key} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
            <div style={{ height: Math.round((d.read / max) * 100) + "%", minHeight: 4, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 4, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
              <div style={{ width: "100%", height: (d.read ? Math.round((d.logged / d.read) * 100) : 0) + "%", background: "var(--sh-chart-teal, #12a899)", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 6, marginTop: 6 }}>
        {trend.days.map((d) => (
          <div key={d.key} style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ ...DASH_MONO_EYEBROW, fontSize: 9 }}>{d.dow}</div>
            <div style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{d.read ? d.logged + "/" + d.read : "—"}</div>
          </div>
        ))}
      </div>
      <p data-dash-logtrend-note="" style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--sh-ink2, #a09b94)" }}>
        Each day: the clients who logged, of those whose record holds it. Records hold the last 7 days, so the trend starts there.
        {trend.unread > 0 ? " " + (trend.unread === 1 ? "1 client's logs couldn't be read" : trend.unread + " clients' logs couldn't be read") + ", so they aren't counted." : ""}
        {trend.pending > 0 ? " " + (trend.pending === 1 ? "1 client's logs are" : trend.pending + " clients' logs are") + " still loading." : ""}
      </p>
    </div>
  );
}

// ── The next payout, from Stripe (the owner's answer to #2628, 2026-11-06) ────────────────────
// /api/coach/next-payout reads the Business page's source (src/lib/stripe.ts loadStripe on the
// listing's connected account) and answers the earliest payout pending or in transit. Its answer,
// as one of the card's states:
//   next     { amountCents, currency, arrivalDate, status }
//   none     connected, and nothing on its way: "No payout scheduled"
//   setup    no Stripe account linked: a link to set it up, where Business does (its Money section)
//   unread   any read that failed (Stripe, the listing, the sign-in check, the network, an answer it
//            cannot use): "couldn't be read just now", never "no payout"
//   loading  asked, not answered yet
// ⚠ NOTHING HERE IS A NUMBER THE ROUTE DID NOT SEND. An answer without an amount or a currency is
// unread, not a zero, and a coach page whose account holds no listing of this role is unread too.
function dashPayoutRead(status, body) {
  if (status !== 200 || !body || typeof body !== "object") return { state: "unread" };
  if (body.isProvider !== true) return { state: "unread" };
  if (body.connected === false) return { state: "setup" };
  if (body.connected !== true || body.error) return { state: "unread" };
  const n = body.next;
  if (n === null) return { state: "none" };
  if (!n || typeof n !== "object" || !Number.isFinite(n.amountCents) || typeof n.currency !== "string" || !n.currency) return { state: "unread" };
  return { state: "next", next: { amountCents: n.amountCents, currency: n.currency, arrivalDate: Number.isFinite(n.arrivalDate) ? n.arrivalDate : null, status: typeof n.status === "string" ? n.status : null } };
}
async function dashFetchNextPayout(role) {
  try {
    const res = await fetch("/api/coach/next-payout?role=" + encodeURIComponent(role), { credentials: "same-origin", cache: "no-store" });
    const body = res.ok ? await res.json().catch(() => null) : null;
    return dashPayoutRead(res.status, body);
  } catch (e) { return { state: "unread" }; }
}
// ⚠ ONE READ FOR THE PAGE, NOT ONE A CARD. The sidebar's money card, Today's Money card and the
// Business boards all ask for the same role's next payout in the same commit; reads begun within a
// few seconds of each other share one request. A later ask (a coach back on the tab) reads afresh.
const DASH_PAYOUT_SHARE_MS = 5000;
const _dashPayoutShared = new Map();   // role -> { at, promise }
function dashSharedNextPayout(role) {
  const hit = _dashPayoutShared.get(role);
  if (hit && Date.now() - hit.at < DASH_PAYOUT_SHARE_MS) return hit.promise;
  const promise = dashFetchNextPayout(role);
  _dashPayoutShared.set(role, { at: Date.now(), promise });
  return promise;
}
// The read, for a signed-in coach only (`live`): null in the preview, which keeps its sample. Asked
// again when the coach comes back to the tab (useDashboard's own rule), keeping what the card shows
// until the new answer lands.
function useDashNextPayout(role, live) {
  const [read, setRead] = React.useState(null);
  const [tick, bump] = React.useReducer((n) => n + 1, 0);
  // dashData.jsx loads on every page this one does, so the call is the same on every render.
  if (typeof useDashFocusRefresh === "function") useDashFocusRefresh(bump, !!live);
  React.useEffect(() => {
    if (!live) { setRead(null); return undefined; }
    let on = true;
    setRead((r) => (r && r.state !== "loading" ? r : { state: "loading" }));
    dashSharedNextPayout(role).then((r) => { if (on) setRead(r); });
    return () => { on = false; };
  }, [role, !!live, tick]);
  return live ? (read || { state: "loading" }) : null;
}

// The amount in its own currency. Stripe counts a currency's smallest unit: cents for most, the
// whole yen or won for its zero-decimal ones, thousandths for its three-decimal ones.
const DASH_ZERO_DECIMAL = ["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"];
const DASH_THREE_DECIMAL = ["bhd", "jod", "kwd", "omr", "tnd"];
function dashPayoutAmount(minor, currency) {
  const cur = String(currency || "").toLowerCase();
  const digits = DASH_ZERO_DECIMAL.includes(cur) ? 0 : DASH_THREE_DECIMAL.includes(cur) ? 3 : 2;
  const major = minor / Math.pow(10, digits);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major); }
  catch (e) { return major.toFixed(digits) + " " + cur.toUpperCase(); }
}
// When it lands, on the coach's day. ⚠ STRIPE'S ARRIVAL DATE IS A BANK DAY, NOT AN INSTANT: the
// timestamp is that day's midnight in UTC (Stripe's own examples), so it is read as that calendar
// day and printed as one (ShapeZone, in UTC, so a coach west of Greenwich is not told the day
// before). "Today" and "tomorrow" are the coach's: their day in `zone` (the route's dayZone), or
// the account's zone on this page.
function dashPayoutWhen(arrivalMs, zone, now) {
  if (!Number.isFinite(arrivalMs)) return null;
  const day = new Date(arrivalMs).toISOString().slice(0, 10);
  const Z = dashZoneLib();
  // The route's zone, else the account's (ShapeZone's viewer zone), as dashSignals' dayInZone reads it.
  const tz = Z ? (zone && Z.normalizeZone(zone) ? zone : Z.viewerZone()) : null;
  const today = Z ? Z.dayKey(now, tz) : dashLocalDate(new Date(now));
  const diff = Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
  if (diff === 0) return "arrives today";
  if (diff === 1) return "arrives tomorrow";
  const noon = Date.parse(day + "T12:00:00Z");
  const fields = { weekday: "short", month: "short", day: "numeric" };
  let label = Z && typeof Z.formatDate === "function" ? Z.formatDate(noon, { zone: "UTC", ...fields }) : "";
  if (!label) { try { label = new Date(noon).toLocaleDateString([], { timeZone: "UTC", ...fields }); } catch (e) { label = day; } }
  return (diff < 0 ? "was due " : "arrives ") + label;
}
// The card's next-payout cell for a read: the figure only for a payout the route named.
function dashPayoutView(read, zone, now) {
  if (!read || read.state !== "next") return { state: read ? read.state : "unread" };
  const n = read.next;
  const when = dashPayoutWhen(n.arrivalDate, zone, now) || "on its way, not landed yet";
  return { state: "next", k: dashPayoutAmount(n.amountCents, n.currency), sub: when + " · " + String(n.currency).toUpperCase() };
}

// The sidebar's money card for a coach (trainerDashboard.jsx DashSidebar), from the same read as
// the Money card, in its states. `read` null is a read not asked yet: loading. The preview keeps the
// demo card its page passes (coachNav.jsx), which the band labels; this is never asked for it.
// ⚠ A MEASURED NONE IS A WORD, AN UNREAD ONE A DASH: "None" is Stripe saying nothing is on its way,
// "—" is a read that failed or has not answered, and neither is ever "$0".
function dashPayoutSidebarCard(read, role, now = Date.now()) {
  const state = read && read.state ? read.state : "loading";
  if (state === "next") {
    const v = dashPayoutView(read, null, now);
    return { state: "next", label: "NEXT PAYOUT", amount: v.k, sub: v.sub };
  }
  if (state === "none") return { state, label: "NEXT PAYOUT", amount: "None", sub: "no payout scheduled right now" };
  if (state === "setup") return { state, label: "PAYOUTS", amount: "Not set up", sub: "set them up in Business →", href: dashLinkedTab("business", role, { section: "money" }) };
  if (state === "loading") return { state, label: "NEXT PAYOUT", amount: "—", sub: "reading your payouts…" };
  return { state: "unread", label: "NEXT PAYOUT", amount: "—", sub: "couldn't be read just now" };
}

// ⚠ MONEY SHOWS ONLY WHAT THIS PAGE READS (the owner's rollout rule: never a made-up figure).
// Recurring revenue is the KPI pool's monthly net (the route's own, or the preview roster's). The
// next payout is Stripe's, through the read above (`read`); the signed-out preview shows its own
// sample's, which the demo band already labels.
// ⚠ THE SAMPLE'S PAYOUT IS FOR THE PREVIEW ONLY (#2628 review). A signed-in coach whose day feed
// failed while the roster loaded has `live` null too: reading that as the preview put the sample's
// payout on their page as theirs. `preview` is the page's own source, never inferred from `live`;
// anywhere else the card shows what the payout read answered, and "couldn't be read" without one.
function dashMoneyModel(live, ctx, preview, read, now = Date.now()) {
  const out = dashKpiOut("monthlyNet", ctx);
  const recurring = out && out.value != null
    ? { k: dashMoney(out.value), sub: out.sub || null }
    : { k: "—", sub: (out && out.why) || "couldn't be read" };
  let payout;
  if (preview === true) {
    const d = dashDemoKpis().find((x) => x && x.l === "Next payout");
    payout = d ? { state: "sample", k: d.k, sub: d.sub } : { state: "unread" };
  } else if (read) payout = dashPayoutView(read, ctx && ctx.zone, now);
  else payout = { state: "unread" };
  return { recurring, payout, live: !!live };
}
const DASH_MONEY_CELL = 170;
function DashMoneyCard({ model, role }) {
  const p = model.payout || { state: "unread" };
  const note = { fontSize: 12.5, lineHeight: 1.45, color: "var(--sh-ink2, #a09b94)" };
  const link = { color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none", whiteSpace: "nowrap" };
  // Business's Money section, where its "Set up payouts" starts Stripe's onboarding.
  const setupHref = dashLinkedTab("business", role, { section: "money" });
  return (
    // ⚠ THE TWO HALVES STACK WHEN THE CARD CAN'T HOLD TWO 170px CELLS (measured: a "$12,483.12" payout
    // overran its half at a 1100px window and below). The divider is a shadow on the second cell's
    // left and top edges, so it falls between them side by side or stacked; the card's own edge
    // clips the other one.
    <section aria-label="Money" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(" + DASH_MONEY_CELL + "px, 1fr))", background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px 18px", minWidth: 0 }}>
      <div style={{ ...DASH_MONO_EYEBROW, fontSize: 10, marginBottom: 10, paddingRight: 44 }}>Recurring revenue</div>
      <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: model.recurring.k === "—" ? "var(--sh-ink2, #a09b94)" : INK }}>{model.recurring.k}<span style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", fontFamily: "inherit" }}>{model.recurring.k === "—" ? "" : " /mo"}</span></div>
      {model.recurring.sub && <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 7 }}>{model.recurring.sub}</div>}
      </div>
      <div style={{ padding: "18px 18px", minWidth: 0, boxShadow: "-1px 0 0 0 rgba(var(--sh-ink-rgb, 242,237,228),0.08), 0 -1px 0 0 rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
        <div style={{ ...DASH_MONO_EYEBROW, fontSize: 10, marginBottom: 10, paddingRight: 44 }}>Next payout</div>
        {p.state === "next" || p.state === "sample"
          ? <div data-dash-payout={p.state}><div style={{ fontFamily: serif, fontSize: 22, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.k}</div>{p.sub && <div style={{ fontSize: 11.5, color: "var(--sh-ink2, #a09b94)", marginTop: 7 }}>{p.sub}</div>}</div>
          : p.state === "none" ? <div style={note} data-dash-payout="none">No payout scheduled right now.</div>
          : p.state === "setup" ? <div style={note} data-dash-payout="setup">Payouts aren't set up yet. <a href={setupHref} style={link}>Set them up in Business →</a></div>
          : p.state === "loading" ? <div style={note} data-dash-payout="loading">Reading your payouts…</div>
          : <div style={note} data-dash-payout="unread">Your next payout couldn't be read just now.</div>}
      </div>
    </section>
  );
}

// The default board's six, in the design's order: three pairs of two thirds beside one third.
// ⚠ "needsyou", NOT "needs" (#2628 review): "needs" was the old tabbed card's key, and a saved
// layout matches geometry and visibility by key, so the new card would have taken the old one's
// width and place, or stayed hidden where the coach hid the old one. A saved "needs" is now stale.
const DASH_TODAY_BOARD = ["brief", "upnext", "glance", "money", "needsyou", "timeline"];

// One card, one tab per queue. The tab a coach left open is remembered per account and
// per role (a trainer and a nutritionist Today are different practices). A tab may declare
// `empty` with `emptyText` for a panel that renders nothing when it has nothing to show —
// a tab that opens onto a blank card reads as broken.
function DashNeedsYou({ tabs, prefs, role }) {
  const keys = tabs.map((t) => t.key);
  const [chosen, choose] = useRememberedChoice(prefs, "needsTab:" + role, keys, keys[0]);
  const cur = tabs.find((t) => t.key === chosen) || tabs[0];
  return (
    <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Needs you</div>
        <div role="tablist" aria-label="Needs you" style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--sh-rest, #221e19)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const on = t.key === cur.key;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => choose(t.key)}
                style={{ minHeight: 32, padding: "0 12px", borderRadius: 7, border: 0, cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: on ? 600 : 500,
                  background: on ? "var(--sh-card, #25211d)" : "transparent", color: on ? INK : "var(--sh-ink2, #a09b94)",
                  // The selected tab stands out of its track as a raised key (dash.css's lift).
                  boxShadow: on ? "var(--lift-key, 0 1px 2px rgba(0,0,0,0.18))" : "none" }}>{t.label}</button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" aria-label={cur.label}>
        {cur.empty
          ? <div style={{ fontSize: 13, color: "var(--sh-ink2, #a09b94)", lineHeight: 1.5 }}>{cur.emptyText}</div>
          : cur.render()}
      </div>
    </div>
  );
}

function CoachDashboardPage({ role }) {
  useDashZoneTick();
  const cfg = DASH_TODAY_ROLES[role];
  // Re-read when the coach comes back to the tab (dashData.jsx useDashFocusRefresh).
  const { today: live, triage, clients, queue, joint, source, dismissable, setDismissal, clearDismissal } = useDashboard(role, { refreshOnFocus: true });
  // Dismiss and snooze from the drawer (P2); `ok` false until the dismissals table answered.
  const dismiss = { ok: !!dismissable, set: setDismissal, clear: clearDismissal };
  // ⚠ THE SAMPLE IS FOR THE PREVIEW ONLY, AND THE PREVIEW IS useDashboard's "demo" ALONE (signed out,
  // or signed in without this role). `sample` was `source !== "live"`, so a signed-in coach whose
  // roster read failed (source "unread") was handed the sample's name, day, calendar and pulse; and
  // before that it was `!live`, so one whose day feed failed while the roster loaded was too.
  const sample = source === "demo";
  // ⚠ UNREAD IS NOT EMPTY: with the roster unread every card built on it (clients, triage, queue,
  // joint) says the roster couldn't be read, never "nobody" or a 0; the day feed, the payout, replies,
  // capacity and the notes are reads of their own and still show when they answer.
  const rosterUnread = source === "unread";
  // Before the first read lands nobody knows who is looking: neither the sample nor a failure.
  const waiting = source == null;
  // The page's own reads run for any viewer who is not the preview.
  const ownReads = source === "live" || rosterUnread;
  // The coach's pinned clients, per ACCOUNT (review 2026-09-09, R15) — the same
  // `dashboard_prefs` document the roster filter and the Schedule view already use, so a
  // pin follows them between devices and costs no second mechanism.
  //
  // ⚠ THE KEY IS PER ROLE. One auth user can own both a trainer and a nutritionist row,
  // and the two Todays show different rosters; a shared key would put a nutrition client
  // at the top of the training pulse. The same split `coach_week_publishes` needed.
  const prefs = useRememberedChoices(ownReads);
  const [pinned, togglePin] = useRememberedSet(prefs, "pulsePinned:" + role, 12);

  // ── The client panel (coach dashboard step 5a: "any client name opens the same side panel the
  // Clients page uses"). The Brief's, Up next's and Needs you's names open this one panel, the
  // slide-over here, over the engine's own row for the client, with the page's store (the drawer's
  // ⚙ rule), the joint list and this page's schedule. A name the panel can't open keeps its link.
  const [peekId, setPeekId] = React.useState(null);
  const peekRowOf = (id) => (Array.isArray(triage) ? triage.find((r) => r && r.client && r.client.profile && r.client.profile.id === id) : null) || null;
  const peekReady = typeof window !== "undefined" && typeof window.DashClientDrawer === "function";
  const peek = { can: (id) => peekReady && id != null && !!peekRowOf(id), open: (id) => setPeekId(id) };
  const peekRow = peekReady && peekId != null ? peekRowOf(peekId) : null;

  // Which four figures each strip shows (review 2026-09-09, R15) — per account AND per
  // role, because one auth user can own a trainer row and a nutritionist row and the two
  // Todays measure different practices. `useRememberedChoice` deletes a key whose value
  // equals the default, so a coach who never opens the ⚙ stores nothing at all.
  const [overviewKpis, setOverviewKpis] = useDashKpiStrip(prefs, "overview", role, DASH_OVERVIEW_DEFAULT);
  const [practiceChosen, setPracticeKpis] = useDashKpiStrip(prefs, "practice", role, DASH_PRACTICE_DEFAULT);
  // At a glance's three, chosen with its ⚙ (dashGlanceCells).
  const [glanceChosen, setGlanceKpis] = useDashGlanceKpis(prefs, role);

  // `sample` (above) is the page's own source, never `!live`: every `live ? … : mock` below draws the
  // sample's name, figures, calendar and pulse only in the preview.
  const firstName = live ? live.user.firstName : sample ? cfg.mockName : "";

  // ⚠ A FAILED SESSIONS READ IS UNREAD, NOT AN EMPTY DAY (Codex on #2639): the route says so with
  // sessionsRead false, and the day then reads "couldn't be read", as a failed feed does.
  const todayRows = live && Array.isArray(live.today) && live.sessionsRead !== false ? live.today : null;
  // The zone the route cut Today in, so its clocks print in it (dashFmtTime's note).
  const dayZone = live && typeof live.dayZone === "string" && live.dayZone ? live.dayZone : null;
  // ⚠ THE SAMPLE'S SESSIONS ARE FOR THE PREVIEW ONLY: a signed-in coach whose day feed failed gets
  // one row saying so, never the sample's day as theirs (the optional Schedule card, the KPI pool).
  const scheduleRead = !!todayRows || sample;
  // Up next's and the timeline's word for a day nobody has read: still loading, or unread.
  const dayUnread = waiting ? "loading" : !scheduleRead;
  const schedule = !todayRows
    ? (!sample ? [waiting ? { time: "—", who: "Reading today's " + cfg.unit + "s…", sub: "" } : { time: "—", who: "Today's " + cfg.unit + "s couldn't be read", sub: "Reload to try again" }] : cfg.mockSchedule)
    : todayRows.length
      ? todayRows.map((s, i) => ({
          time: dashFmtTime(s.scheduledAt, dayZone),
          who: s.clientName || "Client",
          sub: [s.topic, (s.durationMin || 15) + " min", s.type].filter(Boolean).join(" · "),
          status: i === 0 ? (s.status === "confirmed" ? "NEXT" : "PENDING") : undefined,
        }))
      : [cfg.emptySchedule];

  // The day column's rows, with real instants (null in the preview, which has no clock).
  const nowRows = todayRows
    ? todayRows.map((s) => {
        const at = new Date(s.scheduledAt);
        return { at, end: new Date(+at + (s.durationMin || 15) * 60000), time: dashFmtTime(s.scheduledAt, dayZone), status: s.status,
          clientId: s.clientId != null ? String(s.clientId) : null,
          who: s.clientName || "Client", sub: [s.topic, (s.durationMin || 15) + " min", s.type].filter(Boolean).join(" · ") };
      })
    : null;

  // Everything the KPI pool derives from, gathered once. Nothing here is fetched for the
  // strips — it is the state Today already holds — which is the constraint that decides
  // what may be in the pool at all.
  // `rosterUnread` and `waiting` are the pool's gates (dashKpiOut): a roster figure unread, or loading.
  const kpiCtx = { live, clients, triage, queue, schedule, scheduleRead, role, kpiKeys: cfg.kpiKeys, zone: dayZone, rosterUnread, waiting };

  // ⚠ THE OVERVIEW STRIP IS THE PAYOUT PREVIEW WHEN THERE IS NO LIVE PAYLOAD, AND IT IS
  // NOT CONFIGURABLE THERE. Those four demo figures are a preview of the money card, not
  // a reading of this account, so offering a picker over them would let a visitor
  // rearrange numbers that describe nobody. R18's rule from the other side: the ⚙ is
  // withheld where there is nothing card-level to configure.
  const kpis = live ? overviewKpis.map((k) => dashKpiCell(k, role, kpiCtx))
    : sample ? cfg.mockKpis()
    : overviewKpis.map((k) => { const c = dashKpiCell(k, role, kpiCtx); return c.k === "\u2014" ? { ...c, sub: waiting ? "loading" : "couldn't be read" } : c; });
  // The practice strip derives from the roster, the queue and today's schedule, all of
  // which the preview has — so its picker works in both states (unsaved when signed out,
  // exactly as every other remembered control on this page behaves).
  const practiceKpis = practiceChosen.map((k) => dashKpiCell(k, role, kpiCtx));

  const calendarEvents = live && Array.isArray(live.calendar)
    ? live.calendar.map(e => ({ date: dashCalDate(e.at), time: dashCalTime(e.at), kind: e.kind, title: e.title, sub: e.sub, durationMin: e.durationMin, sharedCoach: e.sharedCoach }))
    : sample ? dashDemoCalendar(cfg.mockCalendar) : null;

  const pulseRows = live && Array.isArray(live.pulse) ? live.pulse : null;
  const pulse = !pulseRows
    ? (sample ? cfg.mockPulse : [{ who: "Couldn't be read", sub: "Reload to try again", trend: DASH_FLAT_TREND }])
    : pulseRows.length
      ? pulseRows.map(c => ({ who: c.name, sub: c.sessions + (c.sessions === 1 ? " " + cfg.unit : " " + cfg.unit + "s"), trend: DASH_FLAT_TREND }))
      : [cfg.emptyPulse];

  // ── The optional widgets' derivations (review 2026-09-21), computed once per render
  // from state this page already holds, so `empty` and the panel read the same value.
  //
  // ⚠ `dashSignals.js` IS A PLAIN <script> WITH A HAND-TYPED `?v=`, so unlike this file
  // it is not content-hashed at deploy — a browser holding a cached copy from before these
  // derivations existed would pair it with a fresh dashToday.jsx and throw at render,
  // and there is no error boundary anywhere in public/newdesign to catch that. The two
  // shells bump the key; this is the belt for the browser that did not fetch it anyway:
  // the optional widgets declare themselves empty, with the reason, and nothing throws.
  const sigOk = ["dashWeekAhead", "dashRosterStatus", "dashTopMovers", "dashTenureMilestones", "dashRevenueByClient", "dashProgramsEnding"]
    .every((fn) => typeof DashSignals[fn] === "function");
  const staleWhy = "reload the page to enable this widget";
  // The week ahead starts on the viewer's today, the same clock its dates were printed on.
  const weekAhead = sigOk ? DashSignals.dashWeekAhead(calendarEvents, dashViewerToday()) : null;
  const rosterStatus = sigOk ? DashSignals.dashRosterStatus(triage) : null;
  const movers = sigOk ? DashSignals.dashTopMovers(clients) : null;
  const tenureMarks = sigOk ? DashSignals.dashTenureMilestones(clients) : null;
  const revenue = sigOk ? DashSignals.dashRevenueByClient(clients) : null;
  // This page's role's own programs (a coach with both listings has one per role).
  const ending = sigOk ? DashSignals.dashProgramsEnding(clients, undefined, role) : null;

  // ── The default board's derivations (step 3, the owner's design 2026-11-06). Who needs the coach
  // is the engine's one rule (coachNeeds), null when the pulse could not be read or the cached
  // signals module predates it; the day's rows are the day column's; the three figures and the
  // money are the KPI pool's, so each says why when it cannot be read.
  // A roster that couldn't be read is a pulse nobody read (null): the brief and Needs you say so.
  // Before the first read lands (`waiting`) the empty list is nobody read, not nobody: null, said as loading.
  const needSplit = !rosterUnread && !waiting && Array.isArray(triage) && typeof DashSignals.coachNeeds === "function" ? DashSignals.coachNeeds(triage) : null;
  // The sample's day is the preview's only: an unread roster, or a page still loading, has none.
  const dayDemoRows = nowRows ? null : sample ? cfg.mockSchedule : [];
  const glance = dashGlanceCells(role, kpiCtx, glanceChosen);
  // The roster's logging, day by day, over the days its records hold (dashLogTrend): today on the
  // account's clock, as the KPI pool's week is; the preview's from its own sample.
  const zoneLib = dashZoneLib();
  const logTrend = dashLogTrend(clients, { today: zoneLib ? zoneLib.dayKey(Date.now(), zoneLib.normalizeZone(dayZone) || zoneLib.viewerZone()) : dashLocalDate(new Date()), sample });
  // The next payout is read on any page that is not the preview (live, or a roster unread), and the
  // preview is the page's own source: a coach whose day feed or roster failed still gets their own
  // payout, never the sample's. ⚠ AND MONEY WAITS FOR THE
  // SOURCE: before the page's first read lands (`source` null) nobody knows whether this is the
  // preview, so the card says it is reading rather than flash the sample's payout at a coach.
  const payoutRead = useDashNextPayout(role, ownReads);
  const money = dashMoneyModel(live, kpiCtx, source === "demo", source == null ? { state: "loading" } : payoutRead);
  // The calendar overlay is DashShell's; it hands its opener back through this ref as it renders.
  const openCalRef = React.useRef(null);
  const openCalendar = () => { if (typeof openCalRef.current === "function") openCalRef.current(); };
  // ⚠ NO CALENDAR, NO "Calendar →" (#2628 review): the wrapper always exists, and the timeline draws
  // the button for any opener, so a page with no calendar read offered a button that did nothing.

  // ── Coach Today as a draggable DashGrid (role-scoped, tab="today"). Each section below
  // becomes a widget; the date/greeting/CTAs stay as the page header (DashShell topbar).
  const dashPanelStyle = { background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, padding: 24 };
  const renderPanel = (title, children) => (
    <div style={dashPanelStyle}>
      {title && <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{title}</div>}
      {children}
    </div>
  );
  // A card or a Work queues tab built on the roster: with the roster unread it says so, never its
  // empty sentence or a list of nobody (DashRosterUnread).
  const rosterPanel = (title, children) => renderPanel(title, rosterUnread ? <DashRosterUnread /> : children);
  const rosterTab = (tab) => (rosterUnread ? { key: tab.key, label: tab.label, render: () => <DashRosterUnread /> } : tab);
  const renderKpiStrip = (row) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${row.length},1fr)`, background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, overflow: "hidden" }}>
      {row.map((k, i) => (
        <div key={i} style={{ padding: "20px 20px", borderLeft: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : "none", minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--sh-ink2, #a09b94)", marginBottom: 10, textTransform: "uppercase" }}>{k.l}</div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{k.k}</div>
          {k.sub && <div style={{ fontSize: 11, color: "var(--sh-ink2, #a09b94)", marginTop: 6 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
  // `blurb` is the catalogue's one-line description; `optional: true` keeps a widget off
  // the board until the coach adds it (dashGrid.jsx, dgOptionalKeys); `empty` + `emptyWhy`
  // are the honest-absence contract — the entry stays in the array, and the catalogue
  // says why the card cannot be added yet.
  const gridWidgets = [
    // ⚠ THE DEFAULT BOARD IS SIX WIDGETS, ONE QUESTION EACH (the owner's design, 2026-11-06), in
    // three pairs of two thirds beside one third: the Brief and Up next, At a glance and Money,
    // Needs you and the Today timeline. Up next and the timeline were the day column beside the
    // grid; they are widgets now, so the coach can move, resize or hide them like the rest. Every
    // card the old default board carried (the tabbed queues, Practice, Client wins, Roster health,
    // the Business overview and summary) stays in the catalogue as an optional card.
    { key: "brief", title: "Brief", blurb: "One sentence: who needs your attention, then your next " + cfg.unit + " today.", group: "clients", size: "wide",
      render: () => <DashBriefWidget needNow={needSplit ? needSplit.now : null} rows={nowRows} demoRows={dayDemoRows} zone={dayZone} clients={clients} unit={cfg.unit} role={role} peek={peek} loading={waiting} /> },
    { key: "upnext", title: "Up next", blurb: "The " + cfg.unit + " you're in or going to next, with what you know and a message button.", group: "schedule", size: "narrow",
      render: () => <DashUpNextWidget rows={nowRows} demoRows={dayDemoRows} clients={clients} role={role} unit={cfg.unit} zone={dayZone} unread={dayUnread} peek={peek} rosterUnread={rosterUnread} /> },
    { key: "glance", title: "At a glance", blurb: "Three figures: " + (role === "nutritionist" ? "plans" : "programs") + " due, check-ins reviewed and roster logging, or pick your own with ⚙.", group: "clients", size: "wide",
      render: () => <DashGlanceCard cells={glance} />,
      settings: dashGlanceSettings(glanceChosen, role, setGlanceKpis) },
    { key: "money", title: "Money", blurb: "Recurring revenue, and your next payout from Stripe.", group: "money", size: "narrow",
      render: () => <DashMoneyCard model={money} role={role} /> },
    { key: "needsyou", title: "Needs you", blurb: "Who needs you now, who to look at this week, and good news: three rows, the rest folded.", group: "clients", size: "wide",
      render: () => <DashNeedsWidget split={needSplit} clients={clients} feed={triage} joint={joint} role={role} prefs={prefs} dismiss={dismiss} peek={peek} loading={waiting} /> },
    { key: "timeline", title: "Today", blurb: "Today's " + cfg.unit + "s in order, marked where the day is.", group: "schedule", size: "narrow",
      render: () => <DashTimelineWidget rows={nowRows} demoRows={dayDemoRows} clients={clients} role={role} unit={cfg.unit} zone={dayZone} onOpenCalendar={calendarEvents ? openCalendar : null} unread={dayUnread} /> },
    // ── Optional (off until added) ──
    // The tabbed queues that led the old board: client attention, new clients, check-ins, replies
    // and programs, one tab each.
    { key: "queues", title: "Work queues", blurb: "Attention, new clients, check-ins, replies" + (cfg.programmingQueue ? " and programs" : "") + ", one tab each.", optional: true, group: "clients", size: "full",
      render: () => <DashNeedsYou prefs={prefs} role={role} tabs={[
        rosterTab({ key: "attention", label: "Attention", empty: !triage || triage.length === 0,
          emptyText: "No one needs your attention right now. Clients appear here when their logs, check-ins or Shape Score slip.",
          render: () => <TriagePulsePanel feed={triage} role={role} joint={joint} pinned={pinned} onTogglePin={togglePin} prefs={prefs} dismiss={dismiss} /> }),
        // The onboarding board for clients in their first 30 days (client-onboarding review, fix 4).
        rosterTab({ key: "new", label: "New clients", empty: dashOnboardingRows(clients, role).length === 0,
          emptyText: "No clients in their first 30 days with you. A new client's board appears here the day they subscribe.",
          render: () => <DashOnboardingPanel clients={clients} role={role} live={source === "live"} /> }),
        rosterTab({ key: "checkins", label: "Check-ins", render: () => <DashCheckinQueuePanel clients={clients} prefs={prefs} role={role} live={source === "live"} /> }),
        { key: "replies", label: "Replies", render: () => <DashRepliesPanel role={role} live={ownReads} /> },
        ...(cfg.programmingQueue ? [rosterTab({ key: "programs", label: "Programs", render: () => <ProgrammingQueuePanel queue={queue} role={role} live={source === "live"} /> })] : []),
      ]} /> },
    { key: "checkins", title: "Check-ins to review", blurb: "Recent shared check-ins, oldest first, with your saved review status.", optional: true, group: "clients", size: "half",
      render: () => rosterPanel("Check-ins to review", <DashCheckinQueuePanel clients={clients} prefs={prefs} role={role} live={source === "live"} />) },
    // The onboarding board (fix 4) is the "New clients" tab of Needs you, which the Coaching preset
    // carries; this card is the same board for a coach who wants it on its own.
    { key: "setup", title: "New clients", blurb: "Each new client's first 30 days, ticked by real records.", optional: true, group: "clients", size: "full",
      render: () => rosterPanel("New clients", <DashOnboardingPanel clients={clients} role={role} live={source === "live"} />) },
    { key: "replies", title: "Replies needed", blurb: "Conversations where the latest message came from your client.", optional: true, group: "clients", size: "half",
      render: () => renderPanel("Replies needed", <DashRepliesPanel role={role} live={ownReads} />) },
    { key: "capacity", title: "Capacity this week", blurb: "Booked time, working hours and gaps over the next seven days.", optional: true, group: "schedule", size: "half",
      render: () => renderPanel("Capacity this week", <DashCapacityPanel role={role} live={ownReads} />) },
    { key: "pulse", title: "Client attention", blurb: "Who needs attention, ranked by the signal engine.", optional: true, group: "clients", size: "half", render: () => rosterPanel("Client attention", <TriagePulsePanel feed={triage} role={role} joint={joint} pinned={pinned} onTogglePin={togglePin} prefs={prefs} dismiss={dismiss} />) },
    { key: "schedule", title: cfg.scheduleTitle, blurb: "Today's " + cfg.unit + "s, in order, with context on each.", optional: true, group: "schedule", size: "half", render: () => renderPanel(cfg.scheduleTitle, <ExpandableSchedule schedule={schedule} clients={clients} role={role} rosterUnread={rosterUnread} />) },
    ...(cfg.programmingQueue ? [{ key: "queue", title: "Programming queue", blurb: "Who is ready for next week's programming.", optional: true, group: "programs", size: "full", render: () => rosterPanel("Programming queue", <ProgrammingQueuePanel queue={queue} role={role} live={source === "live"} />) }] : []),
    { key: "practice", title: "Practice", blurb: "Four figures about today's practice — pick them with ⚙.", optional: true, group: "clients", size: "full", render: () => renderKpiStrip(practiceKpis),
      settings: dashKpiSettings(practiceChosen, role, setPracticeKpis) },
    { key: "wins", title: "Client wins", blurb: "Milestones your clients just hit, with a one-tap congratulation.", optional: true, group: "clients", size: "full", render: () => rosterPanel("Client wins", <DashWinsPanel clients={clients} role={role} />) },
    ...(role === "nutritionist" ? [{ key: "roster", title: "Roster health", blurb: "Logging and protein across the whole roster.", optional: true, group: "clients", size: "full", render: () => rosterPanel("Roster health", <DashNutriAggPanel clients={clients} live={live} preview={sample} />) }] : []),
    { key: "kpis", title: "Business overview", blurb: "Four figures about the business — pick them with ⚙ once you're live.", optional: true, group: "money", size: "full", render: () => renderKpiStrip(kpis),
      settings: live ? dashKpiSettings(overviewKpis, role, setOverviewKpis) : undefined },
    { key: "business", title: "Business", blurb: "Revenue, payouts, funnel and churn at a glance.", optional: true, group: "money", size: "full", render: () => renderPanel("Business", <DashBusinessSummary live={live} role={role} clients={clients} preview={sample} />) },
    // ── Optional (off until added) ──
    { key: "week", title: "Week ahead", blurb: "The next seven days of your calendar, with links to each day.", optional: true, group: "schedule", size: "half",
      empty: !weekAhead, emptyWhy: staleWhy,
      render: () => renderPanel("Week ahead", <DashWeekAheadPanel week={weekAhead} role={role} />) },
    // ⚠ A ROSTER CARD STAYS ADDABLE WITH THE ROSTER UNREAD, AND SAYS SO: `empty` would take it off the
    // board, and its reason ("appears once you have clients") would be a claim about nobody read.
    { key: "status", title: "Roster by status", blurb: "How many clients need you, need watching, and are on track.", optional: true, group: "clients", size: "half",
      empty: rosterUnread ? !sigOk : !rosterStatus, emptyWhy: sigOk ? "the pulse could not be read" : staleWhy,
      render: () => rosterPanel("Roster by status", <DashRosterStatusPanel status={rosterStatus} role={role} />) },
    // Nothing to draw until a client's record holds a day (dashLogTrend): a card of empty bars
    // would read as nobody logging.
    { key: "logtrend", title: "Roster logging trend", blurb: "How many clients logged each of the last 7 days, the days their records hold.", optional: true, group: "clients", size: "half",
      empty: !rosterUnread && (!logTrend || logTrend.held === 0),
      emptyWhy: !(logTrend && logTrend.clients > 0) ? "appears once you have clients who log"
        : (clients || []).some((c) => c && c.progressRead && c.progressRead.state === "loading") ? "your clients' logs are still loading" : "your clients' logs couldn't be read just now",
      render: () => rosterPanel("Roster logging trend", <DashLogTrendPanel trend={logTrend} />) },
    { key: "movers", title: "Top movers", blurb: "The biggest Shape Score moves, week over week.", optional: true, group: "clients", size: "half",
      empty: rosterUnread ? !sigOk : !movers || movers.known === 0, emptyWhy: sigOk ? "appears once clients share two full weeks of Shape Score" : staleWhy,
      render: () => rosterPanel("Top movers", <DashTopMoversPanel movers={movers} role={role} />) },
    { key: "anniversaries", title: "Client anniversaries", blurb: "Who reaches a milestone with your practice in the next 30 days.", optional: true, group: "clients", size: "half",
      empty: rosterUnread ? !sigOk : !tenureMarks || tenureMarks.total === 0 || tenureMarks.unknown === tenureMarks.total, emptyWhy: sigOk ? "appears once a client's start date is shared" : staleWhy,
      render: () => rosterPanel("Client anniversaries", <DashAnniversariesPanel marks={tenureMarks} role={role} />) },
    { key: "revenue", title: "Revenue by client", blurb: "Who pays what per month, from their subscriptions.", optional: true, group: "money", size: "half",
      empty: rosterUnread ? !sigOk : !revenue || revenue.total === 0, emptyWhy: sigOk ? "appears once you have clients" : staleWhy,
      render: () => rosterPanel("Revenue by client", <DashRevenueByClientPanel rev={revenue} role={role} />) },
    { key: "ending", title: role === "nutritionist" ? "Plans ending soon" : "Programs ending soon", blurb: "Whose current block runs out in the next three weeks — write the next one before the last session.", optional: true, group: "programs", size: "half",
      empty: rosterUnread ? !sigOk : !ending || ending.total === 0 || ending.unknown === ending.total, emptyWhy: sigOk ? (role === "nutritionist" ? "appears once a client is on one of your plans" : "appears once a client is on one of your programs") : staleWhy,
      render: () => rosterPanel(role === "nutritionist" ? "Plans ending soon" : "Programs ending soon", <DashProgramsEndingPanel ending={ending} role={role} />) },
    { key: "notes", title: "Notes to self", blurb: "A private scratchpad, kept with your account.", optional: true, group: "schedule", size: "half",
      render: () => renderPanel("Notes to self", <DashNotesPanel prefs={prefs} role={role} />) },
  ];

  return (
    <React.Fragment>
      {source === "demo" && <DashDemoBand />}
    <DashShell
      tourHero="hero-today"
      role={role}
      gridWidgets={gridWidgets}
      dockCatalog
      keepEarlierToday
      calendarOpener={openCalRef}
      userName={firstName}
      date={cfg.date()}
      greeting={firstName ? cfg.greeting(firstName) : "Good morning."}
      primaryCta={cfg.primaryCta}
      secondaryCta={cfg.secondaryCta}
      navItems={cfg.navItems()}
      payoutCard={cfg.payoutCard()}
      kpis={kpis}
      kpis2={practiceKpis}
      scheduleTitle={cfg.scheduleTitle}
      calendarEvents={calendarEvents}
      schedule={schedule}
      pulseTitle="Client pulse"
      pulse={pulse}
      pulseRender={cfg.triagePulse ? () => <TriagePulsePanel feed={triage} role={role} joint={joint} pinned={pinned} onTogglePin={togglePin} prefs={prefs} dismiss={dismiss} /> : undefined}
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
    {peekRow && <DashClientDrawer row={peekRow} role={role} onClose={() => setPeekId(null)} prefs={prefs} dismiss={dismiss} joint={joint}
      sessions={typeof dashPeekSessions === "function" ? dashPeekSessions(live, source, role) : undefined} />}
    </React.Fragment>
  );
}

Object.assign(window, { CoachDashboardPage, DashNowColumn, DashNeedsYou, dashCountdown, dashQueueRowState, dashQueueNotices, dashQueueMergeMarks, DASH_TODAY_ROLES, DASH_SEV_COLORS, DASH_FUNNEL_BENCHMARK, DashPill, DashDemoBand, TriagePulsePanel, DashWinsPanel, ProgrammingQueuePanel, dashCloseRate, dashCloseWhy, DashFunnelPanel, DashNutriAggPanel, DashBusinessSummary, DashWeekAheadPanel, DashRosterStatusPanel, DashTopMoversPanel, DashAnniversariesPanel, DashRevenueByClientPanel, DashProgramsEndingPanel, DashNotesPanel, dashTabHref, dashMessageClient, dashMessageDraft, dashCongratsDraft, dashJointDraft, dashOpenCareTeam, dashCoachActionGo, dashClientHref, dashClientPageHref, dashRelDay, dashContextLine, dashMoney, dashFmtTime, dashCalDate, dashCalTime, useDashNextPayout, dashPayoutSidebarCard, dashPayoutView, dashPayoutAmount, dashPayoutWhen, dashGlanceCells, dashLogTrend, DashLogTrendPanel, dashRecordTier, dashTierMark, DashTierDot, DashClientGem, DashClientName, dashRowKeyOpen, dashLinkedTab, dashPeekClick, DashPeekLink });
