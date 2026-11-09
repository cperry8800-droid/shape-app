// Goal and Score — the coach's two progress tabs as widget boards (coach dashboard step 4c), one module
// for both roles. trainerGoalPage.jsx and nutritionistGoalPage.jsx mount CoachGoalBoard, and
// trainerScorePage.jsx and nutritionistScorePage.jsx mount CoachScoreBoard, each with its role.
//
// ── BOARDS OF WIDGETS, LEAN AND EASY TO NAVIGATE (the owner's coach review, step 4: "Today, every
// Business tab, Goal and Score are boards of widgets ... Each page ships a lean default board of 4–6
// widgets"). It supersedes the 2026-10-15 ruling that made these two tabs fixed pages ("least
// overwhelming as possible, easy to navigate"), and keeps its spirit: one question a card (one figure
// or one list) with at most one action, the one thing to act on at Lift 2 while lists rest, and what
// the pages carried before in each board's catalogue, off until a coach adds it.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals.js → coachForecast.js → dashData.jsx
// → dashToday.jsx → dashGrid.jsx → dashBusiness.jsx (DbzCard, DbzChip, DbzGem, DBZ_FILLED, DbzGoalEarn,
// the account's clock) → this → leaderboards.jsx → the four page files. Every global is read at call time.

const CGS_DAY_MS = 86400000;
const cgsNum = (v) => (v === "" || v == null || typeof v === "boolean" || !Number.isFinite(Number(v)) ? null : Number(v));

// ── Calendar days ─────────────────────────────────────────────────────────────
// A goal's due date is a calendar day ("YYYY-MM-DD", from the edit modal's date field) and its start an
// instant (`startAt`), read as the day it fell on ON THE ACCOUNT'S CLOCK (dashBusiness.jsx dbzPartsOf,
// shapeZone.mjs). Pace counts whole days between the two, so a coach west of Greenwich is never a day out.
function cgsDayNum(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key == null ? "" : key));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const x = new Date(t);
  if (x.getUTCFullYear() !== y || x.getUTCMonth() !== mo - 1 || x.getUTCDate() !== d) return null;
  return Math.round(t / CGS_DAY_MS);
}
function cgsDayKey(n) { return new Date(n * CGS_DAY_MS).toISOString().slice(0, 10); }
function cgsToday(now = Date.now()) {
  const p = typeof dbzTodayParts === "function" ? dbzTodayParts(now) : null;
  if (p && p.key) return cgsDayNum(p.key);
  const d = new Date(now);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / CGS_DAY_MS);
}
function cgsDayOfInstant(v) {
  const p = typeof dbzPartsOf === "function" ? dbzPartsOf(v) : null;
  if (p) return Math.round(Date.UTC(p.y, p.mo - 1, p.d) / CGS_DAY_MS);
  const t = v == null || v === "" ? NaN : Date.parse(String(v));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / CGS_DAY_MS);
}
// A calendar day as "Dec 31", with the year when it isn't this year's.
function cgsDayLabel(n, today) {
  if (n == null) return "—";
  const d = new Date(n * CGS_DAY_MS);
  const opts = { month: "short", day: "numeric", timeZone: "UTC" };
  if (today != null && new Date(today * CGS_DAY_MS).getUTCFullYear() !== d.getUTCFullYear()) opts.year = "numeric";
  try { return d.toLocaleDateString("en-US", opts); } catch (e) { return cgsDayKey(n); }
}
// The quarter's last day: a new goal's due date until the coach picks one (the tab is this quarter's goals).
function cgsQuarterEnd(today) {
  const d = new Date(today * CGS_DAY_MS);
  return Math.round(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 0) / CGS_DAY_MS);
}

// ── A goal: what it reads now, and its pace ──────────────────────────────────
// What a goal reads now: a bound goal its live figure (dashData.jsx goalLiveValue: undefined is unbound,
// "loading" is still reading, null is unreadable), a typed one the figure the coach typed, and the
// signed-out sample its own figure (the sample practice is not this viewer's, so nothing is bound).
function cgsGoalReading(g, live, sample) {
  if (!g) return { state: "unread" };
  if (!sample && g.metric) {
    const v = typeof goalLiveValue === "function" ? goalLiveValue(g.metric, live) : null;
    if (v === "loading") return { state: "loading" };
    if (v !== undefined) return cgsNum(v) == null ? { state: "unread" } : { state: "ready", cur: Number(v) };
  }
  const c = cgsNum(g.cur);
  return { state: "ready", cur: c == null ? 0 : c };
}

// ⚠ PACE NEEDS A START AND A DUE DATE, AND IS NEVER GUESSED ("Nothing says whether a goal is on track").
// A goal saved since step 4c keeps `start` (its figure on the day it was set), `startAt` and `due`; the
// pace line runs straight from the start to the target on the due date. A goal saved before has neither,
// says so, and asks for a due date. The statuses:
//   done     the target is reached (down goals, whose start is above the target, reach it from above);
//   nodue    no start or no due date: its pace can't be read;
//   early    set under a week ago (and under a quarter of its span): the pace reads after the first week;
//   ontrack  at or past the line today;
//   atrisk   behind the line, but today's pace still reaches CGS_AT_RISK of the way by the due date;
//   behind   further behind than that, or the due date has passed short of the target;
//   reading  a bound figure still loading; unread  a bound figure that couldn't be read.
const CGS_EARLY_DAYS = 7;
const CGS_AT_RISK = 0.75;
function cgsGoalPace(g, reading, today) {
  const tgt = cgsNum(g && g.tgt);
  const start = cgsNum(g && g.start);
  const startDay = g && g.startAt ? cgsDayOfInstant(g.startAt) : null;
  const dueDay = cgsDayNum(g && g.due);
  // A figure still reading, or unreadable, keeps the goal's dates (its card still says when it is due).
  if (!reading || reading.state === "loading") return { status: "reading", tgt, start, startDay, dueDay };
  if (reading.state !== "ready" || tgt == null) return { status: "unread", tgt, start, startDay, dueDay };
  const cur = reading.cur;
  const down = start != null && start > tgt;
  const from = start != null ? start : 0;
  const reached = down ? cur <= tgt : cur >= tgt;
  const progress = reached ? 1 : tgt === from ? 0 : Math.max(0, Math.min(1, (cur - from) / (tgt - from)));
  const out = { cur, tgt, start, startDay, dueDay, down, progress };
  if (reached) return { ...out, status: "done" };
  if (start == null || startDay == null || dueDay == null || dueDay <= startDay) return { ...out, status: "nodue" };
  const total = dueDay - startDay;
  const daysLeft = dueDay - today;
  if (daysLeft <= 0) return { ...out, status: "behind", overdue: true, daysLeft: 0, elapsed: total, f: 1, expected: tgt, reach: progress };
  const elapsed = Math.max(0, Math.min(total, today - startDay));
  const f = elapsed / total;
  const expected = start + (tgt - start) * f;
  if (elapsed < CGS_EARLY_DAYS && f < 0.25) return { ...out, status: "early", daysLeft, elapsed, f, expected };
  const p = (cur - start) / (tgt - start);
  const reach = f > 0 ? p / f : 1;
  const status = p >= f - 1e-9 ? "ontrack" : reach >= CGS_AT_RISK ? "atrisk" : "behind";
  return {
    ...out, status, daysLeft, elapsed, f, expected, reach,
    // Where today's pace lands on the due date, and the pace made and needed, a week at a time.
    projected: elapsed > 0 ? start + (cur - start) * (total / elapsed) : null,
    madePerWeek: elapsed > 0 ? (cur - start) / (elapsed / 7) : null,
    needPerWeek: (tgt - cur) / (daysLeft / 7),
  };
}

// The goal the board raises (Lift 2) and opens with its pace chart: the one furthest behind its line — a
// missed due date first, then behind, then at risk. null when none is.
function cgsFocusGoal(rows) {
  const rank = (p) => (p.status === "behind" ? (p.overdue ? 0 : 1) : p.status === "atrisk" ? 2 : null);
  let best = null;
  for (const r of rows || []) {
    const k = r && r.pace ? rank(r.pace) : null;
    if (k == null) continue;
    const reach = r.pace.reach != null ? r.pace.reach : r.pace.progress;
    if (!best || k < best.k || (k === best.k && reach < best.reach)) best = { id: r.id, k, reach };
  }
  return best ? best.id : null;
}

// A figure in the goal's unit: "$14,820", "92%", "34".
function cgsFig(g, v, whole) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (g && g.money) return "$" + Math.round(v).toLocaleString("en-US");
  const r = whole && !(g && g.pct) ? Math.round(v) : Math.round(v * 10) / 10;
  return r.toLocaleString("en-US") + (g && g.pct ? "%" : "");
}
// A weekly pace: "+0.3 pts", "+$410", "−1.2".
function cgsRate(g, v) {
  const r = g && g.money ? Math.round(v) : Math.round(v * 10) / 10;
  if (!r) return "0" + (g && g.pct ? " pts" : "");
  return (r > 0 ? "+" : "−") + (g && g.money ? "$" : "") + Math.abs(r).toLocaleString("en-US") + (g && g.pct ? " pts" : "");
}
function cgsMetricLabel(role, metric) {
  const list = typeof goalMetricsFor === "function" ? goalMetricsFor(role) : [];
  return ((list.find((x) => x[0] === metric) || [])[1]) || null;
}

// The goal's one sentence, beside its status chip.
function cgsGoalSentence(g, pace, today, metricLabel) {
  const what = (metricLabel || "this figure").toLowerCase();
  const due = pace.dueDay != null ? cgsDayLabel(pace.dueDay, today) : null;
  switch (pace.status) {
    case "reading": return "Reading " + what + "…";
    case "unread": return "Couldn't read " + what + " just now, so its progress isn't shown.";
    case "done": return "Reached: " + cgsFig(g, pace.cur) + " of " + cgsFig(g, pace.tgt) + (due ? ", due " + due : "") + ".";
    case "nodue":
      if (pace.start == null || pace.startDay == null) {
        return pace.dueDay != null ? "Its starting figure couldn't be read when it was set, so its pace can't be read."
          : "Saved before goals kept a start and a due date, so its pace can't be read.";
      }
      return "It has no due date after its start, so its pace can't be read.";
    case "early": return "Set " + cgsDayLabel(pace.startDay, today) + ": its pace reads after the first week.";
    case "ontrack": return cgsFig(g, pace.cur) + " now; the line to " + cgsFig(g, pace.tgt) + " by " + due + " needs " + cgsFig(g, pace.expected, true) + " today.";
    case "atrisk":
    case "behind": {
      if (pace.overdue) return due + " has passed at " + cgsFig(g, pace.cur) + " of " + cgsFig(g, pace.tgt) + ".";
      const gain = pace.madePerWeek != null && (pace.down ? pace.madePerWeek < 0 : pace.madePerWeek > 0);
      return (gain ? cgsRate(g, pace.madePerWeek) + " a week so far" : "No gain since " + cgsDayLabel(pace.startDay, today))
        + "; " + cgsFig(g, pace.tgt) + " by " + due + " needs " + cgsRate(g, pace.needPerWeek) + " a week.";
    }
    default: return "";
  }
}

// ── The action says who ───────────────────────────────────────────────────────
// The client flag that pulls an adherence goal down, by role, as goalMetricsFor names each binding: a
// trainer's is session adherence (dashSignals.js ruleMissedSessions), a nutritionist's protein
// adherence (ruleProteinUnder).
const CGS_ADHERENCE_FLAG = { trainer: "missed_sessions", nutritionist: "protein_under" };
// ⚠ ONLY REAL READS ARE NAMED. `roster` is useDashboard's { source, triage }: the signed-out sample's
// people only for the sample, and a coach's own only once the roster read live (a roster that fell back
// to the demo is unread, never someone else's clients). A client whose progress is still loading or
// couldn't be read is not named.
function cgsNudgeModel({ role, roster, sample }) {
  if (!roster || roster.source == null) return { state: "loading" };
  if (roster.source !== (sample ? "demo" : "live") || !Array.isArray(roster.triage)) return { state: "unread" };
  const key = CGS_ADHERENCE_FLAG[role];
  const onPlan = (c) => !!(c && c.profile) && !(c.payments && c.payments.onPlan === false);
  const readOf = (c) => (c && c.progressRead && c.progressRead.state) || "ready";
  const clients = [];
  let pending = 0;
  for (const r of roster.triage) {
    if (!r || !onPlan(r.client)) continue;
    const read = readOf(r.client);
    if (read === "loading") { pending += 1; continue; }
    if (read !== "ready") continue;
    const flag = (r.flags || []).find((f) => f && f.key === key);
    if (!flag) continue;
    const id = r.client.profile.id != null ? String(r.client.profile.id) : null;
    const draft = typeof DashSignals !== "undefined" && typeof DashSignals.memberDraft === "function" ? DashSignals.memberDraft(key, r.client, role, flag) : null;
    clients.push({ id, name: r.client.profile.name || "A client", rec: r.client, reason: flag.reason || null, draft: draft || null });
  }
  return { state: "ready", clients, pending };
}
function cgsNames(list) {
  const n = (list || []).map((c) => c.name);
  if (n.length <= 1) return n[0] || "";
  if (n.length === 2) return n[0] + " and " + n[1];
  if (n.length === 3) return n[0] + ", " + n[1] + " and " + n[2];
  return n[0] + ", " + n[1] + " and " + (n.length - 2) + " more";
}
function cgsBusinessHref(role, section) {
  return typeof dashLinkedTab === "function" ? dashLinkedTab("business", role, { section })
    : (role === "nutritionist" ? "NutritionistApp.html" : "TrainerApp.html") + "#business?section=" + section;
}
function cgsTabHref(role, slug) {
  return typeof dashTabHref === "function" ? dashTabHref(slug, role) : (role === "nutritionist" ? "NutritionistApp.html" : "TrainerApp.html") + "#" + slug;
}
// A goal's one action: who to nudge on an adherence goal, Business · Growth for a client count, Business ·
// Plan for revenue, the figure for a typed goal, and a due date for one with no pace. A reached goal, and
// a figure being read or unreadable, ask nothing.
function cgsGoalAction(g, pace, { role, nudge }) {
  if (pace.status === "nodue") return { kind: "edit", label: pace.start == null && pace.dueDay != null ? "Start its pace" : "Add a due date" };
  if (pace.status === "reading" || pace.status === "unread" || pace.status === "done") return null;
  if (g.metric === "adherencePct") {
    return nudge && nudge.state === "ready" && nudge.clients.length ? { kind: "nudge", label: "Nudge " + cgsNames(nudge.clients), clients: nudge.clients } : null;
  }
  if (g.metric === "activeClients") return { kind: "link", label: "Open Business · Growth", href: cgsBusinessHref(role, "growth") };
  if (g.metric === "mrrNetMonthly") return { kind: "link", label: "Open Business · Plan", href: cgsBusinessHref(role, "plan") };
  return { kind: "edit", label: "Update the figure" };
}
// The catalogue's group (dashGrid.jsx dgCatalogGroups): a bound goal's metric, else its unit. A typed count
// is a programs (or plans) goal: clients, revenue and adherence are the bindable three.
function cgsGoalGroup(g) {
  if (g.metric === "mrrNetMonthly" || g.money) return "money";
  if (g.metric === "activeClients" || g.metric === "adherencePct" || g.pct) return "clients";
  return "programs";
}

// ── Saving a goal ─────────────────────────────────────────────────────────────
// ⚠ A GOAL KEEPS THE START IT WAS SET WITH. An edit to its title, target or due date keeps `start` and
// `startAt`, so its pace still runs from the day it was set; a goal with no start yet (new, or saved
// before 4c), or one whose binding or unit changed (its old start is in another unit), starts today
// from the figure it reads now. A bound figure that can't be read gives no start, and the card says so
// rather than guessing one.
function cgsKeepsStart(prev, next) {
  return !!prev && cgsNum(prev.start) != null && !!prev.startAt && (prev.metric || "") === (next.metric || "")
    && !!prev.money === !!next.money && !!prev.pct === !!next.pct;
}
function cgsStampGoal(prev, next, reading, nowIso) {
  const g = { ...next };
  delete g.start; delete g.startAt; delete g.due;
  if (cgsKeepsStart(prev, next)) { g.start = prev.start; g.startAt = prev.startAt; }
  else if (reading && reading.state === "ready") { g.start = reading.cur; g.startAt = nowIso; }
  if (cgsDayNum(next.due) != null) g.due = next.due;
  return g;
}

// Stable goal ids: each goal is a widget keyed by its id, so an id is the goal's identity, never its
// place in the list. A goal saved without one gets its position's, unless another goal holds it.
let cgsGoalSeq = 0;
function cgsNewGoalId() { return "g" + Date.now().toString(36) + "_" + (cgsGoalSeq++).toString(36); }
function cgsGoalIds(goals) {
  const list = Array.isArray(goals) ? goals.filter((g) => g && typeof g === "object") : [];
  const taken = new Set(list.map((g) => g.id).filter(Boolean));
  return list.map((g, i) => {
    if (g.id) return g;
    let id = "goal" + i;
    while (taken.has(id)) id += "x";
    taken.add(id);
    return { ...g, id };
  });
}
// The most recent archived quarter that still holds goals, or null.
function cgsLastArchive(state) {
  const a = Array.isArray(state && state.archived) ? state.archived : [];
  const last = a[a.length - 1];
  return last && Array.isArray(last.goals) && last.goals.length ? last : null;
}

// ── The signed-out sample, dated from today ──────────────────────────────────
// ⚠ ITS DATES ARE COMPUTED FROM TODAY, NEVER A FIXED MONTH. The sample read "50 active clients by July"
// and "+3/wk pace gets there Jun 29" in November: a page about this quarter showing goals already past.
// Each sample goal starts a span of days ago and is due a span ahead, so its status holds whatever the
// date: three on track, and the adherence goal at risk, with the sample roster's own people to nudge.
const CGS_ROLES = {
  trainer: {
    nav: (a) => trainerNavItems(a), payout: () => trainerPayoutCard,
    goals: [
      ["sample-clients", "50 active clients", { metric: "activeClients", cur: 34, tgt: 50, start: 16 }, 60, 60],
      ["sample-revenue", "$20k MRR", { metric: "mrrNetMonthly", money: true, cur: 14820, tgt: 20000, start: 9000 }, 60, 60],
      ["sample-programs", "Publish 2 new programs", { cur: 1, tgt: 2, start: 0 }, 24, 36],
      ["sample-adherence", "95% session adherence", { metric: "adherencePct", pct: true, cur: 92, tgt: 95, start: 90 }, 42, 42],
    ],
    momentum: [["+11", "Net new clients", "vs +6 last Q"], ["+$3.4k", "MRR growth", "vs +$1.8k last Q"], ["2", "Programs shipped", "vs 1 last Q"], ["+4 pts", "Adherence", "vs +2 pts last Q"]],
    kinds: "clients, revenue, programs, or adherence",
  },
  nutritionist: {
    nav: (a) => nutriNavItems(a), payout: () => nutriPayoutCard,
    goals: [
      ["sample-clients", "40 active clients", { metric: "activeClients", cur: 28, tgt: 40, start: 14 }, 60, 60],
      ["sample-revenue", "$15k MRR", { metric: "mrrNetMonthly", money: true, cur: 11240, tgt: 15000, start: 7000 }, 60, 60],
      ["sample-programs", "Publish 2 new plans", { cur: 1, tgt: 2, start: 0 }, 24, 36],
      ["sample-adherence", "92% protein adherence", { metric: "adherencePct", pct: true, cur: 88, tgt: 92, start: 85 }, 42, 42],
    ],
    momentum: [["+7", "Net new clients", "vs +4 last Q"], ["+$2.1k", "MRR growth", "vs +$1.2k last Q"], ["1", "Plan shipped", "vs 1 last Q"], ["+6 pts", "Adherence", "vs +3 pts last Q"]],
    kinds: "clients, revenue, plans, or adherence",
  },
};
function cgsSampleState(role, now = Date.now()) {
  const cfg = CGS_ROLES[role] || CGS_ROLES.trainer;
  const today = cgsToday(now);
  return {
    goals: cfg.goals.map(([id, t, fig, ago, ahead]) => ({ id, t, money: false, pct: false, sub: "", ...fig, startAt: new Date(now - ago * CGS_DAY_MS).toISOString(), due: cgsDayKey(today + ahead) })),
    momentum: cfg.momentum.map((r) => r.slice()),
  };
}

// ── The goal card: one shape for every goal ──────────────────────────────────
const CGS_STATUS = {
  done: ["Done", "var(--sh-green, #7bbf5a)"],
  ontrack: ["On track", "var(--sh-chart-teal, #12a899)"],
  atrisk: ["At risk", "var(--sh-gold, #d8a23a)"],
  behind: ["Behind", "var(--sh-rust, #e0644b)"],
  early: ["Just set", "var(--sh-ink2, #a09b94)"],
  nodue: ["No due date", "var(--sh-ink2, #a09b94)"],
  reading: ["Reading", "var(--sh-ink2, #a09b94)"],
  unread: ["Not read", "var(--sh-ink2, #a09b94)"],
};
const CGS_QUIET = { fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", background: "transparent", border: 0, padding: "6px 4px", minHeight: 32, cursor: "pointer", color: "var(--sh-ink2, #a09b94)" };
const CGS_RING_TRACK = "rgba(var(--sh-ink-rgb, 242,237,228),0.10)";

function CgsRing({ frac, color, label, size = 68 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const f = frac == null ? null : Math.max(0, Math.min(1, frac));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} style={{ flex: "none", display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CGS_RING_TRACK} strokeWidth="6" />
      {f != null && f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={(c * f).toFixed(2) + " " + c.toFixed(2)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--sh-ink, #f2ede4)" fontFamily="'JetBrains Mono', monospace" fontSize="13">{f == null ? "—" : Math.round(f * 100) + "%"}</text>
    </svg>
  );
}

// The pace chart, only where it matters (the focus goal opens with it; the others on Expand): the line the
// goal needs from its start to the target on the due date, against what it has made, and where today's
// pace lands (dotted). Three dates under it: the start, today and the due date.
function CgsPaceChart({ g, pace, today }) {
  const ref = React.useRef(null);
  const W = typeof useDbzChartWidth === "function" ? useDbzChartWidth(ref, 520, 1200) : 520;
  const H = 170, padL = 50, padR = 56, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const { start, startDay, dueDay, cur, tgt } = pace;
  const nowDay = Math.max(startDay, Math.min(dueDay, today));
  const proj = pace.projected != null && Number.isFinite(pace.projected) ? pace.projected : null;
  const vals = [start, cur, tgt].concat(proj != null ? [proj] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const padV = (hi - lo) * 0.12;
  lo = g.pct || g.money || lo >= 0 ? Math.max(0, lo - padV) : lo - padV;
  hi = hi + padV;
  const x = (d) => padL + ((d - startDay) / (dueDay - startDay)) * plotW;
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const color = (CGS_STATUS[pace.status] || CGS_STATUS.ontrack)[1];
  const ink2 = "var(--sh-ink2, #a09b94)";
  const label = "Pace: " + cgsFig(g, start) + " on " + cgsDayLabel(startDay, today) + ", " + cgsFig(g, cur) + " today, "
    + cgsFig(g, tgt) + " needed by " + cgsDayLabel(dueDay, today) + (pace.expected != null ? "; the line needs " + cgsFig(g, pace.expected, true) + " today" : "") + ".";
  return (
    <svg ref={ref} data-cgs-chart="" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: "block", height: "auto", overflow: "visible" }}>
      <line x1={padL} x2={W - padR} y1={y(tgt)} y2={y(tgt)} stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.10)" strokeWidth="1" />
      <text x={W - padR + 6} y={y(tgt) + 3.5} fill={ink2} fontFamily="'JetBrains Mono', monospace" fontSize="10">{cgsFig(g, tgt)}</text>
      {/* the line needed: start → target on the due date */}
      <line x1={x(startDay)} y1={y(start)} x2={x(dueDay)} y2={y(tgt)} stroke={ink2} strokeWidth="1.5" strokeDasharray="5 4" />
      {/* what it has made: start → today, then where today's pace lands */}
      <line x1={x(startDay)} y1={y(start)} x2={x(nowDay)} y2={y(cur)} stroke={color} strokeWidth="3" strokeLinecap="round" />
      {proj != null && nowDay < dueDay && <line x1={x(nowDay)} y1={y(cur)} x2={x(dueDay)} y2={y(proj)} stroke={color} strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" />}
      <circle cx={x(nowDay)} cy={y(cur)} r="4.5" fill={color} />
      <text x={x(nowDay)} y={y(cur) - 9} textAnchor="middle" fill="var(--sh-ink, #f2ede4)" fontFamily="'JetBrains Mono', monospace" fontSize="10">{cgsFig(g, cur)}</text>
      {[[startDay, cgsDayLabel(startDay, today), "start"], [nowDay, "today", "middle"], [dueDay, cgsDayLabel(dueDay, today), "end"]].map(([d, t, a], i) => (
        <text key={i} x={x(d)} y={H - 6} textAnchor={a} fill={ink2} fontFamily="'JetBrains Mono', monospace" fontSize="10">{t}</text>
      ))}
    </svg>
  );
}

function CgsGoalCard({ row, focus, open, onToggle, onEdit, role, today }) {
  const { g, pace, action, sentence, metricLabel } = row;
  const [chip, color] = CGS_STATUS[pace.status] || CGS_STATUS.unread;
  const [list, setList] = React.useState(false);
  const fig = pace.status === "reading" || pace.status === "unread" ? "—" : cgsFig(g, pace.cur);
  const dueLine = pace.dueDay != null ? "due " + cgsDayLabel(pace.dueDay, today) : "no due date";
  const ringFrac = pace.progress != null ? pace.progress : null;
  const btn = focus ? DBZ_FILLED : DBZ_OUTLINE;
  const hasChart = pace.start != null && pace.startDay != null && pace.dueDay != null && pace.dueDay > pace.startDay && pace.cur != null;
  const doAction = () => {
    if (!action) return;
    if (action.kind === "edit") onEdit();
    else if (action.kind === "nudge") {
      if (action.clients.length === 1) { const c = action.clients[0]; if (typeof dashMessageClient === "function") dashMessageClient(c.name, role, c.draft, c.id); }
      else setList((v) => !v);
    }
  };
  return (
    <DbzCard label={"Goal · " + (metricLabel || "your own figure")} lift={focus ? 2 : undefined}
      right={<button type="button" data-cgs-edit="" onClick={onEdit} aria-label={"Edit " + (g.t || "this goal")} style={CGS_QUIET}>Edit</button>}>
      <div data-cgs-goal={g.id} data-cgs-status={pace.status} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px 28px", alignItems: "start" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }}>
          <CgsRing frac={ringFrac} color={color} label={ringFrac == null ? "Progress couldn't be read" : Math.round(ringFrac * 100) + "% of the way"} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: serif, fontSize: 21, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{g.t || "Untitled goal"}</div>
            <div style={{ ...DBZ_LBL, marginTop: 6 }}>{fig + " of " + cgsFig(g, cgsNum(g.tgt)) + " · " + dueLine}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 10, flexWrap: "wrap" }}>
              <DbzChip color={color}>{chip}</DbzChip>
              <span data-cgs-sentence="" style={{ fontSize: 13, lineHeight: 1.5, color: DBZ_INK50, flex: "1 1 180px", minWidth: 0 }}>{sentence}</span>
            </div>
          </div>
        </div>
        {open && (
          <div data-cgs-open="" style={{ minWidth: 0 }}>
            {hasChart ? <CgsPaceChart g={g} pace={pace} today={today} />
              : <div style={DBZ_NOTE}>{pace.status === "reading" || pace.status === "unread" ? "Its pace draws once " + (metricLabel || "its figure").toLowerCase() + " can be read." : "Add a due date and this card draws its pace: from the figure on the day you save it to the target."}</div>}
            {hasChart && <div style={{ ...DBZ_NOTE, fontSize: 11.5, marginTop: 6 }}>Dashed: the line it needs. Solid: what it has made. Dotted: where today's pace lands.</div>}
            {g.sub ? <div style={{ ...DBZ_NOTE, marginTop: 8 }}>Your note: {g.sub}</div> : null}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {!action ? <span />
          : action.kind === "link" ? <a data-cgs-action="" href={action.href} style={btn}>{action.label}</a>
          : <button type="button" data-cgs-action="" aria-expanded={action.kind === "nudge" && action.clients.length > 1 ? list : undefined} onClick={doAction} style={btn}>{action.label}</button>}
        <button type="button" data-cgs-expand="" aria-expanded={!!open} onClick={onToggle} style={CGS_QUIET}>{open ? "Collapse ▴" : "Expand ▾"}</button>
      </div>
      {action && action.kind === "nudge" && action.clients.length > 1 && list && (
        <div data-cgs-nudge="" style={{ marginTop: 10 }}>
          {action.clients.map((c, i) => {
            const href = typeof dbzClientHref === "function" ? dbzClientHref(c.id, role) : null;
            return (
              <div key={(c.id || "x") + ":" + i} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: DBZ_RULE }}>
                <DbzGem rec={c.rec} />
                <div style={{ minWidth: 0 }}>
                  {href ? <a href={href} style={{ fontSize: 14, fontWeight: 600, color: DBZ_INK, textDecoration: "none" }}>{c.name}</a> : <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>}
                  {c.reason && <div style={{ fontSize: 12, color: DBZ_INK50, marginTop: 3 }}>{c.reason}</div>}
                </div>
                <button type="button" data-cgs-message="" onClick={() => { if (typeof dashMessageClient === "function") dashMessageClient(c.name, role, c.draft, c.id); }} style={DBZ_OUTLINE}>{"Message " + String(c.name).split(" ")[0]}</button>
              </div>
            );
          })}
        </div>
      )}
    </DbzCard>
  );
}

// ── The edit modal ────────────────────────────────────────────────────────────
function CgsModalShell({ title, eyebrow, onClose, children, footer }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,8,6,0.7)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: PAPER, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)", borderRadius: 14, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>{eyebrow}</div>
        <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", margin: "6px 0 20px", color: INK }}>{title}</div>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>{footer}</div>
      </div>
    </div>
  );
}
function CgsField({ label, value, onChange, type }) {
  return (
    <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--sh-ink2, #a09b94)" }}>{label}</span>
      <input type={type || "text"} value={value == null ? "" : value} onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        style={{ background: "rgba(var(--sh-ink-rgb, 242,237,228),0.04)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", color: INK, padding: "10px 12px", borderRadius: 6, fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 13.5, colorScheme: "dark light" }}
      />
    </label>
  );
}
const CGS_PILL = { background: "transparent", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer" };
const CGS_PILL_ON = { background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" };

// `startFig`: what this save starts the goal's pace from ("90%"), or null when it keeps the start it has
// (`kept`) or the figure couldn't be read.
function CgsGoalModal({ goal, role, today, live, sample, onClose, onSave, onDelete }) {
  const METRICS = typeof goalMetricsFor === "function" ? goalMetricsFor(role) : [["", "Type it in"]];
  const [g, setG] = React.useState(() => (goal ? { ...goal, due: goal.due || "" } : { t: "", cur: 0, tgt: 100, sub: "", money: false, pct: false, due: cgsDayKey(cgsQuarterEnd(today)) }));
  const kept = cgsKeepsStart(goal, g);
  const startDay = kept ? cgsDayOfInstant(goal.startAt) : today;
  const dueN = cgsDayNum(g.due);
  const dueBad = !!g.due && (dueN == null || dueN <= startDay);
  const reading = cgsGoalReading(g, live, sample);
  const startLine = kept ? "Its pace runs from " + cgsFig(goal, cgsNum(goal.start)) + " on " + cgsDayLabel(startDay, today) + "."
    : reading.state === "ready" ? "Its pace starts today, from " + cgsFig(g, reading.cur) + "."
    : reading.state === "loading" ? "Its pace starts today, from the figure once it is read." : "Its figure can't be read just now, so its pace waits for one.";
  return (
    <CgsModalShell
      eyebrow={goal ? "EDIT · GOAL" : "NEW · GOAL"}
      title={goal ? "Edit goal." : "New goal."}
      onClose={onClose}
      footer={<>
        {onDelete && <button type="button" onClick={onDelete} style={{ background: "transparent", color: "var(--sh-danger, #e07856)", border: "1px solid rgba(255,138,109,0.35)", padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", marginRight: "auto" }}>Delete</button>}
        <button type="button" onClick={onClose} style={CGS_PILL}>Cancel</button>
        <button type="button" data-cgs-save="" disabled={dueBad} onClick={() => onSave(g)} style={{ ...CGS_PILL_ON, opacity: dueBad ? 0.5 : 1, cursor: dueBad ? "default" : "pointer" }}>Save</button>
      </>}
    >
      <CgsField label="TITLE" value={g.t} onChange={(v) => setG({ ...g, t: v })} />
      {/* ⚠ CURRENT DISAPPEARS ONCE THE GOAL IS BOUND. The card reads the live figure and ignores `cur`
          entirely, so leaving the input on screen was a control that accepted a number and silently
          discarded it. */}
      <div style={{ display: "grid", gridTemplateColumns: g.metric ? "1fr" : "1fr 1fr", gap: 12 }}>
        {!g.metric && <CgsField label="CURRENT" type="number" value={g.cur} onChange={(v) => setG({ ...g, cur: v })} />}
        <CgsField label="TARGET" type="number" value={g.tgt} onChange={(v) => setG({ ...g, tgt: v })} />
      </div>
      <div style={{ marginTop: 2, marginBottom: 12 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: "var(--sh-ink2, #a09b94)", marginBottom: 6 }}>CURRENT READS FROM</div>
        {/* ⚠ THE UNIT COMES WITH THE METRIC. The card formats through `g.money` and `g.pct`, so changing
            only `metric` rendered MRR as a bare 12000, adherence as a bare 88, or an active-client count
            as `$12` on a goal that had been a revenue one. */}
        <select aria-label="Current reads from" value={g.metric || ""} onChange={(e) => {
          const metric = e.target.value || undefined;
          setG({ ...g, metric, ...(metric ? goalMetricUnit(metric) : {}) });
        }}
          style={{ width: "100%", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.06)", color: INK, border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 8, padding: "9px 11px", fontFamily: sans, fontSize: 13 }}>
          {METRICS.map(([v, label]) => <option key={v} value={v} style={{ color: "#1a1612", background: "#ffffff" }}>{label}</option>)}
        </select>
      </div>
      {/* The due date sets the goal's pace: a straight line from the figure on the day it is set to the
          target on this day. */}
      <CgsField label="DUE DATE" type="date" value={g.due || ""} onChange={(v) => setG({ ...g, due: v || "" })} />
      <div data-cgs-start-line="" style={{ fontSize: 12, color: dueBad ? "var(--sh-danger, #e07856)" : "var(--sh-ink2, #a09b94)", margin: "-6px 0 12px", lineHeight: 1.5 }} role={dueBad ? "alert" : undefined}>
        {dueBad ? "Pick a due date after " + cgsDayLabel(startDay, today) + "." : g.due ? startLine : "With no due date its pace can't be read."}
      </div>
      <CgsField label="NOTE" value={g.sub} onChange={(v) => setG({ ...g, sub: v })} />
      {/* Locked while a metric is bound: the unit is then a property of the measurement, not a
          preference, and a control that accepts a change the card overrides is the same dead input the
          CURRENT field was. */}
      <div style={{ display: "flex", gap: 18, marginTop: 4, color: INK, fontSize: 13, opacity: g.metric ? 0.5 : 1 }}>
        <label style={{ display: "flex", gap: 8, cursor: g.metric ? "default" : "pointer" }}><input type="checkbox" disabled={!!g.metric} checked={!!g.money} onChange={(e) => setG({ ...g, money: e.target.checked, pct: e.target.checked ? false : g.pct })} /> Money ($)</label>
        <label style={{ display: "flex", gap: 8, cursor: g.metric ? "default" : "pointer" }}><input type="checkbox" disabled={!!g.metric} checked={!!g.pct} onChange={(e) => setG({ ...g, pct: e.target.checked, money: e.target.checked ? false : g.money })} /> Percent (%)</label>
      </div>
      {g.metric && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--sh-ink3, #75706a)" }}>Unit set by the metric</div>}
    </CgsModalShell>
  );
}

function CgsMomentumModal({ momentum, onClose, onSave }) {
  const [m, setM] = React.useState(momentum.map((row) => [...row]));
  const set = (i, k, v) => { const next = m.map((r) => [...r]); next[i][k] = v; setM(next); };
  return (
    <CgsModalShell eyebrow="EDIT · MOMENTUM" title="This quarter." onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} style={CGS_PILL}>Cancel</button>
        <button type="button" onClick={() => onSave(m)} style={CGS_PILL_ON}>Save</button>
      </>}>
      {m.map((row, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1.5fr", gap: 10, marginBottom: 10 }}>
          <CgsField label="VALUE" value={row[0]} onChange={(v) => set(i, 0, v)} />
          <CgsField label="LABEL" value={row[1]} onChange={(v) => set(i, 1, v)} />
          <CgsField label="COMPARE" value={row[2]} onChange={(v) => set(i, 2, v)} />
        </div>
      ))}
    </CgsModalShell>
  );
}

// The roster, read only while an adherence goal is on the board (its action names who): useDashboard's
// feed, handed up as { source, triage }.
function CgsRosterRead({ role, onRead }) {
  const d = useDashboard(role);
  React.useEffect(() => { onRead({ source: d.source, triage: d.triage }); }, [d.source, d.triage]);
  return null;
}

// Without dashGrid.jsx on the page (a stale cache), a board's default cards stack, never a blank page.
function cgsStack(widgets) {
  return <div style={{ display: "grid", gap: 16 }}>{widgets.filter((w) => !w.optional && !w.empty).map((w) => <React.Fragment key={w.key}>{w.render()}</React.Fragment>)}</div>;
}

// ── The Goal page ─────────────────────────────────────────────────────────────
function CoachGoalBoard({ role }) {
  const cfg = CGS_ROLES[role] || CGS_ROLES.trainer;
  // How the goals read ended: "pending"; "ok" (the coach's own, an empty list included); "sample"
  // (nobody is signed in: the sample, dated from today); or "failed" (the read errored).
  // ⚠ A FAILED READ IS NEVER THE SAMPLE, AND NEVER AN EMPTY LIST. getUserGoals answers null when the read
  // errors and {} for a coach with no saved goals; the page treated both as "no goals", so a coach whose
  // read failed was offered an empty quarter, and the first goal they added saved over the ones that
  // could not be read. A failed read shows that, and nothing can be saved until a read succeeds.
  const [read, setRead] = React.useState("pending");
  const [state, setState] = React.useState({ goals: [], momentum: [] });
  // ⚠ EVERY SAVE IS BOUND TO THE ACCOUNT THIS PAGE LOADED (Codex on #2626). saveUserGoals writes to
  // whoever is signed in at save time, so a sign-in to another account in another tab, while a question
  // was open here, wrote this page's goals over that account's. It now refuses instead.
  const ownerId = React.useRef(null);
  const [toast, setToast] = React.useState(null);
  const [edit, setEdit] = React.useState(null);          // goal id | "new" | null
  // Holds the ROWS to edit (or false): the modal is seeded with whatever the card shows, so opening it on
  // a computed card adopts those figures as the coach's own starting point rather than a blank grid.
  const [editMomentum, setEditMomentum] = React.useState(false);
  const [opened, setOpened] = React.useState({});        // goal id → open, once the coach has toggled it
  const [roster, setRoster] = React.useState(undefined);
  const live = useCoachLiveFigures(role);
  // ⚠ A SETUP IN NORA'S CHAT WRITES THE GOALS DOC TOO (WORKLOG: a screen holding a copy of a user_goals
  // doc reads it again when something else writes it). The chat widget announces shape:accountSetup.
  const [setupRev, setSetupRev] = React.useState(0);
  React.useEffect(() => { const again = () => setSetupRev((n) => n + 1); window.addEventListener("shape:accountSetup", again); return () => window.removeEventListener("shape:accountSetup", again); }, []);

  React.useEffect(() => {
    let on = true;
    (async () => {
      const db = window.shapeDb;
      const toSample = () => { if (on) { setState(cgsSampleState(role)); setRead("sample"); } };
      if (!db || typeof db.getUser !== "function" || typeof db.getUserGoals !== "function") return toSample();
      let user = null;
      try { user = await db.getUser(); } catch (e) { if (on) setRead((r) => (r === "pending" ? "failed" : r)); return; }
      if (!on) return;
      if (!user) return toSample();
      ownerId.current = user.id;
      let remote = null;
      try { remote = await db.getUserGoals(role, { expectedUserId: user.id }); } catch (e) { remote = null; }
      if (!on) return;
      // A re-read (after a setup) that fails keeps what the page shows.
      if (remote == null || typeof remote !== "object") { setRead((r) => (r === "ok" ? r : "failed")); return; }
      // Signed in with no saved goals → a clean empty state, never the sample's goals.
      setState({ ...remote, goals: cgsGoalIds(remote.goals), momentum: Array.isArray(remote.momentum) ? remote.momentum : [] });
      setRead("ok");
    })();
    return () => { on = false; };
  }, [role, setupRev]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  async function persist(next) {
    if (read !== "ok" && read !== "sample") { showToast("Your goals couldn't be read, so nothing was saved. Reload this page."); return; }
    setState(next);
    if (read === "sample" || !window.shapeDb || !window.shapeDb.saveUserGoals) { showToast("Sample view — sign in to save."); return; }
    const res = await window.shapeDb.saveUserGoals(role, next, ownerId.current ? { expectedUserId: ownerId.current } : undefined);
    showToast(res && res.error ? (res.error.message === "Account changed" ? "Not saved: another account is signed in now. Reload this page." : (res.error.message || "Save failed")) : "Saved.");
  }

  const sample = read === "sample";
  const today = cgsToday();
  function saveGoal(form) {
    const prev = edit === "new" ? null : (state.goals || []).find((x) => x.id === edit) || null;
    const stamped = cgsStampGoal(prev, form, cgsGoalReading(form, live, sample), new Date().toISOString());
    const goals = edit === "new" ? [...(state.goals || []), { ...stamped, id: cgsNewGoalId() }] : (state.goals || []).map((x) => (x.id === edit ? { ...stamped, id: edit } : x));
    setEdit(null);
    persist({ ...state, goals });
  }
  // ⚠ ARCHIVE ASKS FIRST AND KEEPS A COPY (coach review, 2026-11-04: "Archive" deleted every goal). It
  // saved an empty goal list at once, with no question and nothing kept, while deleting ONE goal asked
  // first. Now it asks, moves this quarter's goals into `archived` in the same saved document, and an
  // empty page offers them back.
  async function archiveGoals() {
    const current = state.goals || [];
    if (!current.length) return;
    if (!(await window.ShapeConfirm.open({ title: "Archive these goals?", message: "They leave this page and are kept, so you can restore them.", confirmLabel: "Archive goals" }))) return;
    const archived = [...(Array.isArray(state.archived) ? state.archived : []), { at: new Date().toISOString(), quarter: goalQuarterLabel(), goals: current }];
    persist({ ...state, goals: [], archived });
  }
  function restoreGoals() {
    const last = cgsLastArchive(state);
    if (!last) return;
    persist({ ...state, goals: cgsGoalIds(last.goals), archived: state.archived.slice(0, -1) });
  }
  async function deleteGoal() {
    const cur = (state.goals || []).find((x) => x.id === edit) || {};
    if (!(await window.ShapeConfirm.open({ title: "Delete this goal?", name: cur.t || cur.title, message: "This removes the goal from your saved goals.", confirmLabel: "Delete goal" }))) return;
    const goals = (state.goals || []).filter((x) => x.id !== edit);
    setEdit(null);
    persist({ ...state, goals });
  }

  // ── The rows: each goal's reading, pace, sentence and one action ──
  const goals = state.goals || [];
  const nudge = cgsNudgeModel({ role, roster, sample });
  const rows = goals.map((g) => {
    const pace = cgsGoalPace(g, cgsGoalReading(g, live, sample), today);
    const metricLabel = g.metric ? cgsMetricLabel(role, g.metric) : null;
    return { id: g.id, g, pace, metricLabel, sentence: cgsGoalSentence(g, pace, today, metricLabel), action: cgsGoalAction(g, pace, { role, nudge }) };
  });
  const focusId = cgsFocusGoal(rows);
  const needsRoster = rows.some((r) => r.g.metric === "adherencePct");
  // The board boots once the goals are read and, for a coach with bound goals, their figures too: its
  // default layout (the focus goal across the top) is decided at boot (dashGrid.jsx).
  const settled = (read === "ok" || read === "sample") && (sample || live.kind !== "loading" || !rows.some((r) => r.g.metric));
  const [booted, setBooted] = React.useState(false);
  React.useEffect(() => { if (settled && !booted) setBooted(true); }, [settled, booted]);
  const isOpen = (id) => (Object.prototype.hasOwnProperty.call(opened, id) ? opened[id] : id === focusId);

  const momentum = state.momentum || [];
  // ⚠ COMPUTED ONLY WHERE THERE IS NOTHING TO OVERWRITE. A signed-in coach with no saved rows gets the
  // trajectory's; a coach who HAS typed rows keeps them: silently replacing someone's own reading of their
  // quarter with a computed one is not a fix, it is data loss with a nicer label.
  const computedMomentum = momentum.length || sample ? null : (typeof coachLiveMomentum === "function" ? coachLiveMomentum(live) : null);
  const momentumRows = computedMomentum || momentum;
  const momentumCard = (
    <DbzCard label="Momentum" lift={0} right={<button type="button" onClick={() => setEditMomentum(momentumRows)} style={CGS_QUIET}>Edit</button>}>
      {momentumRows.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
          {momentumRows.map((m, i) => (
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1 }}>{m[0]}</div>
              <div style={{ fontSize: 12.5, marginTop: 8 }}>{m[1]}</div>
              <div style={{ fontSize: 11, color: DBZ_INK50, marginTop: 2 }}>{m[2]}</div>
            </div>
          ))}
        </div>
      ) : <div style={DBZ_NOTE}>Nothing measured yet this quarter. Edit to write your own.</div>}
      {computedMomentum && <div style={{ ...DBZ_LBL, marginTop: 12 }}>From your own subscriptions · edit to write your own</div>}
      {sample && <div style={{ ...DBZ_LBL, marginTop: 12 }}>Sample figures, not your own practice</div>}
    </DbzCard>
  );

  const ordered = focusId ? rows.filter((r) => r.id === focusId).concat(rows.filter((r) => r.id !== focusId)) : rows;
  // Every card names its catalogue group and a size: the focus goal across the board, the rest in pairs.
  // `optional` keeps a card in the catalogue, off the board until the coach adds it; `empty` keeps the
  // first-goal card off a board that has goals.
  const goalWidgets = ordered.map((r) => ({
    key: "goal-" + r.id, title: r.g.t || "Untitled goal", group: cgsGoalGroup(r.g), size: r.id === focusId ? "full" : "half",
    blurb: "Its ring, its status and one next step, with its pace a tap away.",
    render: () => <CgsGoalCard row={r} focus={r.id === focusId} open={isOpen(r.id)} onToggle={() => setOpened((o) => ({ ...o, [r.id]: !isOpen(r.id) }))} onEdit={() => setEdit(r.id)} role={role} today={today} />,
  }));
  const widgets = goalWidgets.concat([
    { key: "first", title: "Set a goal", blurb: "Your first goal for this quarter, with a due date so its card can say whether it's on track.", group: "clients", size: "full",
      empty: goals.length > 0, emptyWhy: "your goals are on the board",
      render: () => (
        <DbzCard label="Set a goal" lift={2}>
          <div data-cgs-first="" style={{ fontSize: 15, fontWeight: 500 }}>No goals for this quarter yet</div>
          <div style={{ ...DBZ_NOTE, fontSize: 13, marginTop: 4 }}>Set one with a due date and its card says whether it's on track: {cfg.kinds}.</div>
          <button type="button" onClick={() => setEdit("new")} style={{ ...DBZ_FILLED, marginTop: 14 }}>＋ New goal</button>
        </DbzCard>
      ) },
    // ── Optional: what the Goal tab carried before.
    { key: "momentum", title: "Momentum", blurb: "How this quarter is going: net new clients, revenue, what you shipped, adherence.", optional: true, group: "clients", size: "full",
      render: () => momentumCard },
    { key: "earn", title: "What clients earn you", blurb: "Type a client count and a rate, and read the net a month and a year.", optional: true, group: "money", size: "full",
      render: () => (
        <DbzCard label="What clients earn you" right={<span style={DBZ_LBL}>after Shape's fee</span>}>
          {typeof DbzGoalEarn === "function" ? <DbzGoalEarn role={role} live={live} /> : <div style={DBZ_NOTE}>The calculator is on Business → Plan.</div>}
        </DbzCard>
      ) },
  ]);

  const grid = typeof DashGrid === "function";
  const note = (text, attr) => <div role="status" data-cgs-read={attr} style={{ border: "1px dashed var(--sh-line2, #413d38)", borderRadius: 12, padding: "22px 24px", fontSize: 13.5, lineHeight: 1.5, color: DBZ_INK50 }}>{text}</div>;
  const body = read === "failed"
    ? note("Your goals couldn't be read just now. Nothing is shown in their place, and nothing can be saved over them: reload to try again.", "failed")
    : !booted ? note("Reading your goals…", "pending")
    // ⚠ ITS OWN TAB KEY ("goal-board"). The old Goal board (2026-06 to #2365) saved under "goal", with
    // other cards; no earlier build saved under this one (dashGrid.jsx dgBoards: doc[role][tab]).
    : grid ? <DashGrid key="goal-board" role={role} tab="goal-board" widgets={widgets} /> : cgsStack(widgets);
  const canEdit = read === "ok" || sample;
  const editing = edit == null ? null : edit === "new" ? null : goals.find((x) => x.id === edit) || null;

  return (
    <React.Fragment>
      {sample && typeof DashDemoBand === "function" && <DashDemoBand />}
      <DashPage
        navItems={cfg.nav("goal")}
        payoutCard={cfg.payout()}
        eyebrow={goalQuarterLabel()}
        title="Goal"
        subtitle={sample ? "Sample view — sign in to save your own goals." : "What you're building toward this quarter."}
        actions={canEdit ? <>
          {(state.goals || []).length > 0 && <button data-goal-archive onClick={archiveGoals} style={CGS_PILL}>Archive</button>}
          {!(state.goals || []).length && cgsLastArchive(state) && <button data-goal-restore onClick={restoreGoals} style={CGS_PILL}>Restore archived goals</button>}
          <button onClick={() => setEdit("new")} style={CGS_PILL_ON}>+ New goal</button>
        </> : null}
      >
        {needsRoster && typeof useDashboard === "function" && <CgsRosterRead role={role} onRead={setRoster} />}
        {body}
        {edit != null && (edit === "new" || editing) && (
          <CgsGoalModal key={edit} goal={editing} role={role} today={today} live={live} sample={sample}
            onClose={() => setEdit(null)} onSave={saveGoal} onDelete={edit === "new" ? null : deleteGoal} />
        )}
        {editMomentum && (
          <CgsMomentumModal momentum={Array.isArray(editMomentum) ? editMomentum : momentum}
            onClose={() => setEditMomentum(false)} onSave={(m) => { setEditMomentum(false); persist({ ...state, momentum: m }); }} />
        )}
        {toast && (
          <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, padding: "12px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, zIndex: 10000, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>{toast}</div>
        )}
      </DashPage>
    </React.Fragment>
  );
}

// ── Score ─────────────────────────────────────────────────────────────────────
// ⚠ HOW A COACH EARNS POINTS IS /api/coach/score's FORMULA, AND NOTHING ELSE (src/app/api/coach/score/
// route.ts, kept in sync with get_coach_scores): 50 for each active client, 10 for each point of the
// session completion rate over the last 90 days (so up to 1,000), and, for a trainer only, 80 for each
// published program. Tiers start at 750 (Pro), 2,000 (Elite), 5,000 (Master) and 15,000 (Icon). The
// page listed twelve "points by action" and a breakdown with reviews, Radio and endorsements once:
// scoring that never existed. The app's coach Score page prints the same terms (BS_COACH_SCORE_FORMULA
// in iosAppBroadsheetClient.jsx).
const CGS_TIERS = [["Certified", 0], ["Pro", 750], ["Elite", 2000], ["Master", 5000], ["Icon", 15000]];
const CGS_COACH_NAME = { Raw: "Certified", Base: "Certified", Tempo: "Pro", Form: "Elite", Peak: "Master", Legend: "Icon" };
const cgsTierName = (n) => CGS_COACH_NAME[n] || n;
const CGS_TERMS = [
  { key: "clients", label: "Active clients", short: "Clients", each: 50, sub: "Per client · each client subscribed to you now" },
  { key: "completion", label: "Session completion", short: "Completion", each: 10, cap: 1000, sub: "Per 1% completed · your sessions in the last 90 days, up to 1,000" },
  { key: "programs", label: "Programs published", short: "Programs", each: 80, sub: "Per program · each program you've published", trainer: true },
];
const cgsTermsFor = (role) => CGS_TERMS.filter((t) => !t.trainer || role === "trainer");
const cgsPts = (n) => Math.round(n).toLocaleString("en-US");
function cgsTierOf(total) {
  let i = 0;
  for (let k = CGS_TIERS.length - 1; k >= 0; k--) if (total >= CGS_TIERS[k][1]) { i = k; break; }
  return i;
}
// The coach's place on the five tiers, as a share of one line: each tier an equal fifth, and the score's
// way through its own tier (Icon's fifth runs to twice its floor).
function cgsLadderPlace(total) {
  const i = cgsTierOf(total);
  const lo = CGS_TIERS[i][1];
  const hi = CGS_TIERS[i + 1] ? CGS_TIERS[i + 1][1] : lo * 2;
  return { index: i, at: (i + Math.max(0, Math.min(1, (total - lo) / (hi - lo)))) / CGS_TIERS.length };
}

// The score as its parts. ⚠ EACH TERM'S COUNT IS ITS POINTS OVER WHAT ONE IS WORTH, never the sub-line's
// words: the route's points are exact multiples (50 a client, 10 a point of completion, 80 a program),
// so 700 points is 14 clients however the sub-line is worded. A row the formula doesn't know keeps its
// points and is drawn as its own part, so the parts always add to the route's total.
function cgsScoreModel(score, role) {
  if (!score || !Array.isArray(score.breakdown)) return null;
  const rows = score.breakdown.map((b) => ({ label: String((b && b.label) || ""), points: Number(b && b.points) || 0, sub: b && b.sub != null ? String(b.sub) : "" }));
  const pts = (key) => { const t = CGS_TERMS.find((x) => x.key === key); const r = rows.find((x) => x.label === t.label); return r ? r.points : null; };
  const clientsPts = pts("clients"), completionPts = pts("completion"), programsPts = role === "trainer" ? pts("programs") : null;
  const total = Number(score.total) || 0;
  const next = score.next_tier ? String(cgsTierName(score.next_tier)) : null;
  const parts = rows.map((r) => {
    const t = CGS_TERMS.find((x) => x.label === r.label && (!x.trainer || role === "trainer")) || null;
    return { ...r, term: t ? t.key : null, short: t ? t.short : r.label, n: t ? Math.round(r.points / t.each) : null, each: t ? t.each : null };
  });
  return {
    total, sum: rows.reduce((a, r) => a + r.points, 0), parts,
    tier: String(cgsTierName(score.current_tier)), next, toNext: next ? Math.max(0, Number(score.points_to_next) || 0) : 0,
    clients: clientsPts == null ? null : Math.round(clientsPts / 50), clientsPts,
    pct: completionPts == null ? null : Math.round(completionPts / 10), completionPts,
    programs: programsPts == null ? null : Math.round(programsPts / 80), programsPts,
  };
}
// "14 × 50 + 90 × 10 + 2 × 80": the score's own arithmetic.
function cgsScoreSum(m) {
  return m.parts.map((p) => (p.n != null ? p.n + " × " + p.each : cgsPts(p.points))).join(" + ");
}

// ── Fastest way up ────────────────────────────────────────────────────────────
// Each term's way to the next tier on its own, as the sum it is and where it lands: the clients it
// takes (50 each), the programs (80 each, a trainer's), and the points of completion (10 each), fewest
// steps first. ⚠ COMPLETION IS CAPPED AT 1,000: when what is left under the cap can't reach the next
// tier, it is not offered as a way up; the card says how little room it has, with the arithmetic, and
// that new clients (and a trainer's programs) carry the climb.
function cgsWayUp(m, role) {
  if (!m) return null;
  if (!m.next) return { top: true };
  const need = m.toNext;
  const steps = [];
  if (m.clientsPts != null) steps.push({ term: "clients", n: Math.ceil(need / 50), each: 50 });
  if (role === "trainer" && m.programsPts != null) steps.push({ term: "programs", n: Math.ceil(need / 80), each: 80 });
  let capped = null;
  if (m.completionPts != null && m.pct != null) {
    const room = Math.max(0, 1000 - m.completionPts);
    const n = Math.ceil(need / 10);
    if (n * 10 <= room) steps.push({ term: "completion", n, each: 10, from: m.pct, to: m.pct + n });
    else capped = { room, n: room / 10, from: m.pct, lands: m.total + room };
  }
  for (const s of steps) { s.add = s.n * s.each; s.lands = m.total + s.add; s.tier = CGS_TIERS[cgsTierOf(s.lands)][0]; }
  steps.sort((a, b) => a.n - b.n);
  return { steps, capped, next: m.next, need };
}
function cgsStepText(s) {
  if (s.term === "completion") return "Completion " + s.from + "% → " + s.to + "%: " + s.n + " × 10 = +" + cgsPts(s.add) + ", lands on " + cgsPts(s.lands) + " · " + s.tier;
  const word = s.term === "programs" ? (s.n === 1 ? "program" : "programs") : (s.n === 1 ? "new client" : "new clients");
  return s.n + " " + word + ": " + s.n + " × " + s.each + " = +" + cgsPts(s.add) + ", lands on " + cgsPts(s.lands) + " · " + s.tier;
}
function cgsWayUpAction(s, role) {
  if (!s) return null;
  if (s.term === "programs") return { label: "Open Programs", href: cgsTabHref(role, "programs") };
  if (s.term === "completion") return { label: "Open Schedule", href: cgsTabHref(role, "schedule") };
  return { label: "Open Business · Growth", href: cgsBusinessHref(role, "growth") };
}

const CGS_PART_COLORS = { clients: "var(--sh-chart-teal, #12a899)", completion: "var(--sh-chart-amber, #b8892f)", programs: "var(--sh-rust, #e0644b)" };
const CGS_PART_OTHER = "var(--sh-ink2, #a09b94)";

function CgsScoreCard({ model, state }) {
  const label = "Your score";
  if (!model) {
    return <DbzCard label={label}><div data-cgs-score={state} role="status" style={{ ...DBZ_NOTE, fontSize: 13.5 }}>{state === "failed" ? "Couldn't read your score just now. Nothing is shown in its place: reload to try again." : "Reading your score…"}</div></DbzCard>;
  }
  const place = cgsLadderPlace(model.total);
  return (
    <DbzCard label={label} right={state === "sample" ? <DbzChip color={DBZ_INK50}>Sample · an example coach</DbzChip> : null}>
      <div data-cgs-score={state} style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: serif, fontSize: 48, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{cgsPts(model.total)}</span>
        <span data-cgs-tierline="" style={{ fontSize: 15, color: DBZ_INK50 }}>
          <b style={{ color: DBZ_INK, fontWeight: 600 }}>{model.tier}</b>{model.next ? " · " + cgsPts(model.toNext) + " to " + model.next : " · the top tier"}
        </span>
      </div>
      <div data-cgs-ladder="" role="img" aria-label={"The five tiers: " + CGS_TIERS.map((t) => t[0] + " from " + cgsPts(t[1])).join(", ") + ". You are " + model.tier + "."} style={{ position: "relative", marginTop: 22, paddingTop: 14 }}>
        <div aria-hidden="true" style={{ position: "absolute", top: 0, left: (place.at * 100) + "%", transform: "translateX(-50%)", fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.1em", color: DBZ_INK, whiteSpace: "nowrap" }}>▼ you</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}>
          {CGS_TIERS.map(([t, floor], i) => {
            const cur = i === place.index, past = i < place.index;
            return (
              <div key={t} data-cgs-tier={t} data-cgs-current={cur ? "" : undefined} style={{ minWidth: 0 }}>
                <div style={{ height: 6, borderRadius: 3, background: cur ? "var(--sh-accent, #2ee0c4)" : past ? "rgba(var(--sh-ink-rgb, 242,237,228),0.35)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.10)" }} />
                <div style={{ fontSize: 12.5, marginTop: 7, fontWeight: cur ? 600 : 400, color: cur ? DBZ_INK : DBZ_INK50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</div>
                <div style={{ ...DBZ_LBL, fontSize: 8.5, marginTop: 2 }}>{cgsPts(floor)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </DbzCard>
  );
}

function CgsWayUpCard({ model, role }) {
  const way = cgsWayUp(model, role);
  const label = "Fastest way up";
  if (!way) return <DbzCard label={label} lift={2}><div style={DBZ_NOTE}>Waits on your score.</div></DbzCard>;
  if (way.top) {
    return (
      <DbzCard label={label} lift={2}>
        <div data-cgs-way="top" style={{ fontSize: 14, lineHeight: 1.55, color: DBZ_INK50 }}>
          <b style={{ color: DBZ_INK, fontWeight: 600 }}>Icon is the top tier.</b> Your score still grows: 50 a client, 10 a point of completion{role === "trainer" ? " and 80 a program" : ""}.
        </div>
      </DbzCard>
    );
  }
  const lead = way.steps[0] || null;
  const action = cgsWayUpAction(lead, role);
  const carry = role === "trainer" ? "New clients and programs carry the climb." : "New clients carry the climb.";
  return (
    <DbzCard label={label} lift={2} right={<span style={DBZ_LBL}>{cgsPts(way.need)} to {way.next}</span>}>
      <div data-cgs-way="ready">
        {way.steps.map((s, i) => (
          <div key={s.term} data-cgs-step={s.term} style={{ padding: "8px 0", borderTop: i ? DBZ_RULE : "none", fontSize: i ? 13 : 14.5, lineHeight: 1.45, color: i ? DBZ_INK50 : DBZ_INK, fontWeight: i ? 400 : 600, fontVariantNumeric: "tabular-nums" }}>{cgsStepText(s)}</div>
        ))}
        {way.capped && (
          <div data-cgs-capped="" style={{ ...DBZ_NOTE, fontSize: 12.5, marginTop: 8, paddingTop: 8, borderTop: DBZ_RULE }}>
            {"Your " + cgsPts(model.total) + " is " + cgsScoreSum(model) + ". Completion is at " + way.capped.from + "%, so it can add only " + cgsPts(way.capped.room) + " more"
              + (way.capped.room ? " (" + way.capped.n + " × 10, to " + cgsPts(way.capped.lands) + ")" : "") + ". " + carry}
          </div>
        )}
        {action && <a data-cgs-way-action="" href={action.href} style={{ ...DBZ_FILLED, marginTop: 12 }}>{action.label}</a>}
      </div>
    </DbzCard>
  );
}

// One bar that adds up: the score's own parts as segments of it, each with its arithmetic, summing to the
// total. Lists rest (Lift 0).
function CgsPartsCard({ model, role }) {
  const label = "What your score is made of";
  if (!model) return <DbzCard label={label} lift={0}><div style={DBZ_NOTE}>Waits on your score.</div></DbzCard>;
  const parts = model.parts.filter((p) => p.points > 0);
  const colorOf = (p) => CGS_PART_COLORS[p.term] || CGS_PART_OTHER;
  return (
    <DbzCard label={label} lift={0} right={<span style={DBZ_LBL}>{cgsPts(model.sum)} in all</span>}>
      <div data-cgs-bar="" role="img" aria-label={model.parts.map((p) => p.short + " " + cgsPts(p.points)).join(", ") + ": " + cgsPts(model.sum) + " in all."}
        style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", gap: parts.length > 1 ? 2 : 0 }}>
        {model.sum > 0 && parts.map((p) => <div key={p.label} data-cgs-seg={p.term || "other"} data-cgs-points={String(p.points)} style={{ flex: p.points + " 0 0", background: colorOf(p), minWidth: 2 }} />)}
      </div>
      <div style={{ marginTop: 12 }}>
        {model.parts.map((p, i) => (
          <div key={p.label} data-cgs-part={p.term || "other"} style={{ display: "grid", gridTemplateColumns: "10px minmax(0,1fr) auto", gap: 10, alignItems: "baseline", padding: "7px 0", borderTop: i ? DBZ_RULE : "none" }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(p), alignSelf: "center" }} />
            <span style={{ fontSize: 13.5 }}>{p.short}<span style={{ color: DBZ_INK50, fontSize: 12 }}>{p.term === "completion" ? " · " + p.n + "% × 10" : p.n != null ? " · " + p.n + " × " + p.each : ""}</span></span>
            <span style={{ fontFamily: DBZ_MONO, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{cgsPts(p.points)}</span>
          </div>
        ))}
        <div data-cgs-sum="" style={{ ...DBZ_NOTE, marginTop: 8, paddingTop: 8, borderTop: DBZ_RULE, fontVariantNumeric: "tabular-nums" }}>
          {model.parts.map((p) => cgsPts(p.points)).join(" + ") + " = " + cgsPts(model.sum)}
        </div>
      </div>
    </DbzCard>
  );
}

function CgsFormulaCard({ role }) {
  const terms = cgsTermsFor(role);
  return (
    <div id="score-earn" style={{ scrollMarginTop: 80 }}>
      <DbzCard label="How points are earned" right={<span style={DBZ_LBL}>{terms.length} TERMS</span>}>
        {terms.map((t, i) => (
          <div key={t.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, padding: "10px 0", borderTop: i ? DBZ_RULE : "none", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{t.label}</div>
              <div style={{ fontFamily: DBZ_MONO, fontSize: 10.5, color: DBZ_INK50, marginTop: 3, letterSpacing: "0.03em", lineHeight: 1.45 }}>{t.sub}</div>
            </div>
            <div style={{ fontFamily: DBZ_MONO, fontSize: 13, fontWeight: 700, color: "var(--sh-accent-ink, #2ee0c4)" }}>{"+" + t.each}</div>
          </div>
        ))}
        <div style={{ ...DBZ_NOTE, fontSize: 11.5, marginTop: 6 }}>Tiers: Pro from 750, Elite from 2,000, Master from 5,000, Icon from 15,000.</div>
      </DbzCard>
    </div>
  );
}

// The signed-out samples, on the route's formula. The trainer is the review's example coach: 14 × 50 +
// 90 × 10 + 2 × 80 = 1,760, a Pro, 240 to Elite. The nutritionist: 12 × 50 + 91 × 10 = 1,510, whose
// completion can add only 90 more, so new clients carry the climb.
const CGS_SCORE_SAMPLE = {
  trainer: { total: 1760, current_tier: "Pro", next_tier: "Elite", points_to_next: 240, breakdown: [
    { label: "Active clients", points: 700, sub: "14 clients" }, { label: "Session completion", points: 900, sub: "90% · last 90d" }, { label: "Programs published", points: 160, sub: "2 live" }] },
  nutritionist: { total: 1510, current_tier: "Pro", next_tier: "Elite", points_to_next: 490, breakdown: [
    { label: "Active clients", points: 600, sub: "12 clients" }, { label: "Session completion", points: 910, sub: "91% · last 90d" }] },
};

function CoachScoreBoard({ role }) {
  const cfg = CGS_ROLES[role] || CGS_ROLES.trainer;
  const SAMPLE = CGS_SCORE_SAMPLE[role] || CGS_SCORE_SAMPLE.trainer;
  // How the read ended: "pending"; "ok" (the coach's own score); "sample" (signed out: a 401, so the
  // labelled sample above); or "failed" (a 503 when the sign-in couldn't be checked, a 5xx, a 404 for an
  // account with no listing of this role, a thrown fetch, an answer that isn't a score).
  // ⚠ A FAILED READ IS NOT THE SAMPLE. The page started from static figures (6,420, Master, 34 clients)
  // and kept them when the read failed, so a signed-in coach whose read failed was shown the sample as
  // their own score. Only a 401 shows the sample, and it says it is one.
  const [read, setRead] = React.useState({ state: "pending", score: null });
  // Your score · Leaderboard (owner, 2026-10-15: "we should have a members and coaches leaderboard").
  // The board is leaderboards.jsx's; the subtitle reads your rank off it.
  const [view, setView] = React.useState("score");
  const standing = useCoachStanding(role);

  React.useEffect(() => {
    let alive = true;
    const signedOut = { signedOut: true };
    fetch('/api/coach/score?role=' + role, { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.status === 401 ? signedOut : r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        if (d === signedOut) setRead({ state: "sample", score: SAMPLE });
        else if (d && typeof d.total === 'number' && Number.isFinite(d.total) && typeof d.current_tier === 'string' && Array.isArray(d.breakdown)) setRead({ state: "ok", score: d });
        else setRead({ state: "failed", score: null });
      })
      .catch(() => { if (alive) setRead({ state: "failed", score: null }); });
    return () => { alive = false; };
  }, [role]);

  const score = read.score;
  const model = cgsScoreModel(score, role);
  const tierLabel = model ? model.tier.toUpperCase() : "—";
  const headline = score
    ? { title: score.total.toLocaleString(), eyebrow: `COACH SCORE · ${tierLabel}${read.state === "sample" ? " · SAMPLE" : ""}` }
    : { title: "—", eyebrow: read.state === "failed" ? "COACH SCORE · COULDN'T READ" : "COACH SCORE" };
  // The Score fix (2026-11-05): one line, for 30 days from the day it shipped, on a coach's own read
  // score (leaderboards.jsx coachScoreFixNote). Never on the sample.
  const fixNote = read.state === "ok" && typeof coachScoreFixNote === "function" ? coachScoreFixNote(role) : null;

  // The board: the score and its tier, the fastest way up (the one raised card), the parts adding up to
  // it, and how points are earned (the header's "How it works" scrolls to it). "What Master unlocks" left
  // the page and is in no catalogue: nothing grants those perks, and what they are is the owner's call.
  const unread = read.state === "failed";
  const why = unread ? "your score couldn't be read" : "your score is still loading";
  const scoreWidgets = [
    { key: "score", title: "Your score", blurb: "Your total, your tier and the points to the next, with the five tiers on one line.", group: "clients", size: "wide",
      render: () => <CgsScoreCard model={model} state={read.state} /> },
    { key: "wayup", title: "Fastest way up", blurb: "What reaches the next tier in the fewest steps, each with its sum and where it lands.", group: "clients", size: "narrow",
      empty: !model, emptyWhy: why, render: () => <CgsWayUpCard model={model} role={role} /> },
    { key: "parts", title: "What your score is made of", blurb: (role === "trainer" ? "Clients, completion and programs" : "Clients and completion") + " as parts of one bar that adds up to your score.", group: "clients", size: "wide",
      empty: !model, emptyWhy: why, render: () => <CgsPartsCard model={model} role={role} /> },
    { key: "earn", title: "How points are earned", blurb: "The terms your score counts, and what each is worth.", group: "clients", size: "narrow",
      render: () => <CgsFormulaCard role={role} /> },
  ];
  const grid = typeof DashGrid === "function";

  return (
    <DashPage
      navItems={cfg.nav("score")}
      payoutCard={cfg.payout()}
      eyebrow={headline.eyebrow}
      title={headline.title}
      subtitle={coachStandingLine(role, standing)}
      actions={<CoachScoreActions view={view} onView={setView} />}
    >
      {view === "board" ? <CoachLeaderboard role={role} /> : (
      <div style={{ display: "grid", gap: 16 }}>
        {fixNote && <div role="note" data-score-fix style={{ fontSize: 13.5, lineHeight: 1.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(var(--sh-accent2-rgb, 10,197,168),0.25)", background: "rgba(var(--sh-accent2-rgb, 10,197,168),0.06)" }}>{fixNote}</div>}
        {read.state === "pending"
          ? <div role="status" data-cgs-read="pending" style={{ border: "1px dashed var(--sh-line2, #413d38)", borderRadius: 12, padding: "22px 24px", fontSize: 13.5, color: DBZ_INK50 }}>Reading your score…</div>
          // ⚠ ITS OWN TAB KEY ("score-board"). The old Score board (2026-06 to #2365) saved under "score",
          // with the perks card among its own; no earlier build saved under this one.
          : grid ? <DashGrid key="score-board" role={role} tab="score-board" widgets={scoreWidgets} /> : cgsStack(scoreWidgets)}
      </div>
      )}
      {read.state === "sample" && typeof DashDemoBand === "function" && <DashDemoBand />}
    </DashPage>
  );
}

Object.assign(window, { CoachGoalBoard, CoachScoreBoard });
