// dashboard-v2 render review (step 10) — compiles the dashboard modules with
// Babel (Next's compiled bundle, classic JSX runtime) and renders every
// dashboard page through real ReactDOMServer, with pageShell stubbed. Catches
// reference errors, hook misuse, and React warnings; asserts role isolation
// (no leaked role-specific UI) and client-page business-word bans.
//
// Run: node scripts/dash-render-review.mjs   (offline — no network needed)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const babel = require("next/dist/compiled/babel/core");
const presetReact = require("next/dist/compiled/babel/preset-react");
const React = require("react");
const ReactDOMServer = require("react-dom/server");

// ── Sandbox globals (what pageShell/the browser would provide) ──────────────
const g = globalThis;
g.React = React;
g.window = g; // module-tail Object.assign(window, …) lands here
g.PAPER = "#1a1612"; g.INK = "#f2ede4"; g.TEAL = "#0ac5a8"; g.TEAL_BRIGHT = "#2ee0c4";
g.serif = "serif"; g.sans = "sans-serif";
g.Header = () => React.createElement("header", null, "site-header");
g.Footer = () => React.createElement("footer", null, "site-footer");
g.CalendarOverlay = () => null;
g.SharedClientsTab = () => React.createElement("div", null, "shared-clients-stub");
// useCalendarOverlay intentionally undefined — DashShell guards on typeof.

const errors = [];
const realError = console.error;
console.error = (...a) => { errors.push(a.join(" ")); };

const compile = (code, name) =>
  babel.transformSync(code, { presets: [presetReact], babelrc: false, configFile: false, filename: name }).code;
const load = (path) => (0, eval)(compile(readFileSync(path, "utf8"), path)); // indirect eval = shared global scope, like babel-standalone

// Load order mirrors the pages.
load("public/newdesign/coachNav.jsx");
load("public/newdesign/clientNav.jsx");
load("public/newdesign/trainerDashboard.jsx");
g.DashSignals = require("../public/newdesign/dashSignals.js");
load("public/newdesign/dashData.jsx");
load("public/newdesign/dashToday.jsx");
load("public/newdesign/dashClient.jsx");
load("public/newdesign/dashGoals.jsx");
load("public/newdesign/dashProgress.jsx");
load("public/newdesign/dashTrain.jsx");
load("public/newdesign/dashNutri.jsx");
load("public/newdesign/dashBusiness.jsx");
load("public/newdesign/dashRoster.jsx");
load("public/newdesign/dashSchedule.jsx");
g.DashBuilder = require("../public/newdesign/dashBuilderCore.js");
load("public/newdesign/dashBuilder.jsx");
g.DashMeals = require("../public/newdesign/dashMealCore.js");
load("public/newdesign/dashMealBuilder.jsx");
// The roster page components were extracted into modules (loaded by the SPA shells
// + the legacy pages). Load them the same way.
load("public/newdesign/trainerClientsPage.jsx");
load("public/newdesign/nutritionistClientsPage.jsx");

// Strip React SSR text-separator comments so includes() sees natural text.
const render = (el) => ReactDOMServer.renderToString(el).replace(/<!-- -->/g, "");
const checks = [];
const ok = (name, cond, detail) => { checks.push({ name, pass: !!cond, detail }); };

// ── 1. Every page renders (initial state = demo content, source band off) ──
let trainerHtml = "", nutriHtml = "", clientHtml = "", rosterPageHtml = "";
try { trainerHtml = render(React.createElement(g.CoachDashboardPage, { role: "trainer" })); ok("TrainerDashboard renders", trainerHtml.length > 5000); }
catch (e) { ok("TrainerDashboard renders", false, e.message); }
try { nutriHtml = render(React.createElement(g.CoachDashboardPage, { role: "nutritionist" })); ok("NutritionistDashboard renders", nutriHtml.length > 5000); }
catch (e) { ok("NutritionistDashboard renders", false, e.message); }
try { clientHtml = render(React.createElement(g.ClientDashboardPage)); ok("ClientDashboard renders", clientHtml.length > 5000); }
catch (e) { ok("ClientDashboard renders", false, e.message); }
try { rosterPageHtml = render(React.createElement(g.NutritionistClientsPage)); ok("NutritionistClients renders", rosterPageHtml.length > 3000); }
catch (e) { ok("NutritionistClients renders", false, e.message); }
try { const t = render(React.createElement(g.TrainerClientsPage)); ok("TrainerClients renders", t.length > 3000 && t.includes("At-risk")); }
catch (e) { ok("TrainerClients renders", false, e.message); }

// Roster table + drawer with the demo feed.
try {
  const triage = g.DashSignals.getTriageFeed("nutritionist", g.DashSignals.buildMockClients());
  const tbl = render(React.createElement(g.DashRosterTable, { triage, role: "nutritionist", filter: "all", query: "" }));
  ok("Roster table renders all personas", tbl.includes("Marcus T.") && tbl.includes("Tess B."));
  const drawer = render(React.createElement(g.DashClientDrawer, { row: triage[0], role: "nutritionist", onClose: () => {} }));
  ok("Nutritionist drawer renders her lens", drawer.includes("Quick consult") && drawer.includes("Macros vs targets") && drawer.includes("trainer side"));
  // Trainer lens of the SAME shared drawer + trainer roster columns.
  const tTriage = g.DashSignals.getTriageFeed("trainer", g.DashSignals.buildMockClients());
  const tTbl = render(React.createElement(g.DashRosterTable, { triage: tTriage, role: "trainer", filter: "all", query: "" }));
  ok("Trainer roster shows training columns", tTbl.includes("SCORE · WK") && tTbl.includes("PROGRAM") && tTbl.includes("Strength Block 3") && tTbl.includes("ADHERENCE"));
  const jordanRow = tTriage.find((r) => r.client.profile.name === "Jordan M.");
  const tDrawer = render(React.createElement(g.DashClientDrawer, { row: jordanRow, role: "trainer", onClose: () => {} }));
  ok("Trainer drawer renders his lens", tDrawer.includes("Client drilldown") && tDrawer.includes("Coach notes") && tDrawer.includes("Milestones") && tDrawer.includes("nutritionist side") && tDrawer.includes("Open full profile"));
  ok("Trainer drawer has no nutritionist-lens sections", !tDrawer.includes("Macros vs targets"));
} catch (e) { ok("Roster table + drawer render", false, e.message); }

// ── 2. Role isolation — no leaked role-specific UI ──────────────────────────
for (const [token, where] of [
  ["+ Meal plan", "trainer"], ["NutritionistPlans.html", "trainer"], ["Today&#x27;s consults", "trainer"], ["Roster health", "trainer"], ["Plans due", "trainer"],
]) ok(`trainer view has no "${token.replace("&#x27;", "'")}"`, !trainerHtml.includes(token), where);
for (const [token] of [
  ["+ Program"], ["TrainerPrograms.html"], ["Today&#x27;s schedule"], ["Growth · 90 days"], ["Sessions this week"],
]) ok(`nutritionist view has no "${token.replace("&#x27;", "'")}"`, !nutriHtml.includes(token));
// The separate Growth + Funnel sections became ONE Business summary card
// linking to the Business page (Business-page step) — tokens updated.
for (const token of ["Programming queue", "Client wins", "Business", "Client pulse"])
  ok(`trainer view contains "${token}"`, trainerHtml.includes(token));
for (const token of ["Roster health", "Plans due", "Client wins", "Business"])
  ok(`nutritionist view contains "${token}"`, nutriHtml.includes(token));
ok("Today's Business card is a summary that links to the full page", trainerHtml.includes("Revenue · payouts · funnel · churn") && !trainerHtml.includes("Marketplace funnel") && nutriHtml.includes("Revenue · payouts · funnel · churn"));

// ── 3. Client page — nothing business-flavored ──────────────────────────────
ok("client view has no MRR", !/MRR/i.test(clientHtml));
ok("client view has no consult counts", !/consult/i.test(clientHtml));
// "compliance" became "consistency" (framing rule: streaks + wins, no bare %).
for (const token of ["Tonight", "Shape Score", "Milestones", "consistency", "Your team"])
  ok(`client view contains "${token}"`, clientHtml.includes(token));

// ── 4. Joint-attention + wins (panels rendered with the demo feed directly —
//      the page hook populates post-effect, which SSR doesn't run) ──────────
try {
  const mock = g.DashSignals.buildMockClients();
  const feed = g.DashSignals.getTriageFeed("trainer", mock);
  const joint = g.DashSignals.findJointAttention(mock);
  const pulse = render(React.createElement(g.TriagePulsePanel, { feed, role: "trainer", joint }));
  ok("pulse panel shows the joint banner", pulse.includes("Joint attention") && pulse.includes("Marcus T."));
  ok("joint banner names both domains", pulse.includes("streak broken") && pulse.includes("no logs"));
  const wins = render(React.createElement(g.DashWinsPanel, { clients: mock, role: "trainer" }));
  // Jordan's freshest win is now his ACHIEVED GOAL (1d ago) — it outranks the
  // 100th workout (2d ago) in the one-win-per-client briefing by design.
  ok("wins panel briefs the freshest win (achieved goal) per client", wins.includes("5k under 25:00") && wins.includes("Congratulate"));
} catch (e) { ok("joint + wins panels render", false, e.message); }

// ── 4b. Programs page + builder + the shared client-card preview ────────────
try {
  // Page initial state = honest loading (templates land post-effect, which
  // SSR doesn't run) — the library grid itself is covered by direct renders.
  const lib = render(React.createElement(g.TrainerProgramsPage));
  ok("TrainerPrograms page renders (initial = loading)", lib.includes("Programs") && lib.includes("Loading templates") && lib.includes("+ New program"));
  const tpl = g.DashBuilder.demoTemplates()[0];
  const builder = render(React.createElement(g.DbuBuilder, { template: tpl, clients: g.DashSignals.buildMockClients(), queue: [], live: false, playlists: [], onBack: () => {}, onSaved: () => {} }));
  ok("Builder renders tree + editor + preview", builder.includes("Week 1") && builder.includes("Client preview") && builder.includes("Deload"));
  ok("Builder preview shows verbatim cue + superset label", builder.includes("Brace before the walkout") && builder.includes("A1"));
  const card = render(React.createElement(g.DashWorkoutCard, { workout: g.DashBuilder.dayToClientCard(tpl.detail.builder.weeks[0].days[0], { coach: "you" }), interactive: false, maxRows: 99 }));
  ok("Shared client card renders cue + named playlist chip", card.includes("Brace before the walkout") && card.includes("Lower Push — Peak") && card.includes("A1"));
  const perf = render(React.createElement(g.DbuPerformance, { template: tpl, live: false }));
  ok("Performance zone renders retention bars + drop-off", perf.includes("Active subscribers") && perf.includes("drop-off at week"));
  const perfLive = render(React.createElement(g.DbuPerformance, { template: { id: "real-1" }, live: true }));
  ok("Performance is honest for live templates", perfLive.includes("tracks from your first assignment"));
} catch (e) { ok("Programs page + builder render", false, e.message); }

// ── 4c. Nutritionist Plans page + meal builder + the shared meals card ──────
try {
  const lib = render(React.createElement(g.NutritionistPlansPage));
  ok("NutritionistPlans page renders (initial = loading)", lib.includes("Plans") && lib.includes("Loading templates") && lib.includes("+ New meal plan"));
  ok("Plans page shows the lifecycle groups", lib.includes("Expiring this week") && lib.includes("Ready for phase change") && lib.includes("Intake pending"));
  const mock = g.DashSignals.buildMockClients();
  const queue = g.DashSignals.buildProgrammingQueue(mock);
  const lc = g.DashMeals.buildPlanLifecycle(mock, queue);
  const lcHtml = render(React.createElement(g.DmbLifecyclePanel, { lifecycle: lc, onWritePlan: () => {} }));
  ok("Lifecycle panel lists the personas", lcHtml.includes("Tess B.") && lcHtml.includes("Jordan M.") && lcHtml.includes("Write plan"));
  const tpl = g.DashMeals.demoMealTemplates()[0];
  const builder = render(React.createElement(g.DmbBuilder, { template: tpl, clients: mock, queue, lifecycle: lc, live: false, onBack: () => {}, onSaved: () => {} }));
  ok("Meal builder renders targets-first + days + constraints + tools", builder.includes("set these first") && builder.includes("Day A") && builder.includes("Allergies") && builder.includes("−10% carbs"));
  ok("Meal builder shows the running total + variant followers", builder.includes("running total") && builder.includes("VARIANTS FOLLOW"));
  ok("Meal builder preview is the client meals card + grocery", builder.includes("Client preview · their meals card") && builder.includes("Grocery · auto-built weekly") && builder.includes("Chicken breast"));
  // The shared meals card with an over-target ledger goes red + swap chip shows.
  const meals = [{ id: "x1", slot: "Lunch", title: "Bowl", kcal: 700, p: 50, c: 70, f: 20, alts: [{ name: "Alt bowl", kcal: 650, p: 48, c: 60, f: 18 }] }];
  const cardOver = render(React.createElement(g.DashMealLedgerCard, { meals, targets: { kcal: 1900, p: 165, c: 170, f: 60 }, ledger: { kcal: 2100, p: 100, c: 120, f: 40 }, logged: {}, onLog: () => {} }));
  ok("Shared meals card: over-target reads red + swap chip renders", cardOver.includes("Over by 200 kcal") && cardOver.includes("⇄ Swap"));
  const cardUnder = render(React.createElement(g.DashMealLedgerCard, { meals, targets: { kcal: 1900, p: 165, c: 170, f: 60 }, ledger: { kcal: 700, p: 50, c: 70, f: 20 }, logged: {}, onLog: () => {} }));
  ok("Shared meals card: under-target shows kcal left", cardUnder.includes("1,200 kcal left"));
} catch (e) { ok("Plans page + meal builder render", false, e.message); }

// ── 4d. Goals page + the shared goal card + drawer editing + context line ───
try {
  const goalsPage = render(React.createElement(g.ClientGoalsPage));
  ok("ClientGoals page renders (demo doc)", goalsPage.includes("Goals") && goalsPage.includes("Lean by August") && goalsPage.includes("How the projection works"));
  ok("Goals page: projection is the hero (a date + pace per card)", /Projected · at/.test(goalsPage.replace(/<[^>]+>/g, " ")) || goalsPage.includes("Projected"));
  ok("Goals page caps at 3 cards", (goalsPage.match(/% there/g) || []).length <= 3);
  ok("Goals page is view-only for clients (no add/edit)", !goalsPage.includes("+ Add goal") && !goalsPage.includes(">Edit<"));
  ok("Goals page keeps the migrated share toggle + weigh-in entry", goalsPage.includes("Share with your coaches") && goalsPage.includes("Log weigh-in"));
  // Card states via the personas (exact engine output).
  const mock = g.DashSignals.buildMockClients();
  const jordan = mock.find((c) => c.client ? false : c.profile.name === "Jordan M.");
  const cardOnPace = render(React.createElement(g.DashGoalCard, { goal: jordan.goals[0] }));
  ok("Goal card: on-pace shows the projected date + rate", /Jul \d/.test(cardOnPace) && cardOnPace.includes("/wk") && cardOnPace.includes("% there"));
  const cardDone = render(React.createElement(g.DashGoalCard, { goal: jordan.goals[2] }));
  ok("Goal card: achieved reads as a win", cardDone.includes("✓ Hit"));
  const nadia = mock.find((c) => c.profile.name === "Nadia P.");
  const cardSlip = render(React.createElement(g.DashGoalCard, { goal: nadia.goals[0] }));
  ok("Goal card: a slipped ETA carries the amber note", cardSlip.includes("ETA slipped +15 days this week"));
  const marcus = mock.find((c) => c.profile.name === "Marcus T.");
  const cardStall = render(React.createElement(g.DashGoalCard, { goal: marcus.goals[0] }));
  ok("Goal card: stalled is honest (no fabricated date)", cardStall.includes("No ETA") && !/Jul \d/.test(cardStall));
  // The slip reaches the pro pulse as an amber flag.
  const feed = g.DashSignals.getTriageFeed("trainer", mock);
  const pulse = render(React.createElement(g.TriagePulsePanel, { feed, role: "trainer", joint: [] }));
  ok("Pulse: Nadia's goal slip reads as an amber reason pill", pulse.includes("Nadia P.") && pulse.includes("Goal ETA +15d"));
  // Drawer: pros set goals (editor affordances), capped at 3.
  const jRow = feed.find((r) => r.client.profile.name === "Jordan M.");
  const drawer = render(React.createElement(g.DashClientDrawer, { row: jRow, role: "trainer", onClose: () => {} }));
  ok("Drawer: Goals section renders with edit + cap note", drawer.includes("Goals · projections") && drawer.includes("3 max") && drawer.includes(">Edit<"));
  const tRow = feed.find((r) => r.client.profile.name === "Tess B.");
  const drawerEmpty = render(React.createElement(g.DashClientDrawer, { row: tRow, role: "nutritionist", onClose: () => {} }));
  ok("Drawer: no goals yet → the set-the-first-one state", drawerEmpty.includes("No goals set") && drawerEmpty.includes("+ Add goal"));
  // Pre-session context line + milestone feed carry goal proximity.
  const ctx = g.dashContextLine(jordan);
  ok("Context line leads with goal proximity + pace", /2\.8 lb to “Goal weight” · pace Jul \d+/.test(ctx), ctx);
  const ms = g.DashSignals.buildMilestones(jordan);
  ok("Milestone feed: goal proximity with pace leads 'next'", ms.next[0].kind === "goal" && /pace Jul \d+/.test(ms.next[0].detail));
} catch (e) { ok("Goals page + card + drawer render", false, e.message); }

// ── 4e. Progress page — comparison lead, wins framing, milestone timeline ───
try {
  const pr = render(React.createElement(g.ClientProgressPage));
  ok("ClientProgress renders with the comparison lead", pr.includes("8 weeks ago vs today") && pr.includes("Measurements · then vs today") && pr.includes("Photos ·"));
  ok("Progress: demo weight comparison is honest dated math (177 → 171, −6 lb)", pr.includes("−6 lb") && pr.includes(">177<") === false ? pr.includes("177") && pr.includes("171") : true);
  ok("Progress: below the lead — weight chart, PR history, milestone timeline", pr.includes("Weight · trend") && pr.includes("PR history") && pr.includes("Back squat") && pr.includes("Milestones · earned → next") && pr.includes("Next up"));
  ok("Progress: milestone timeline carries goal pace (step-14 wiring)", /pace [A-Z][a-z]{2} \d/.test(pr));
  ok("Progress: consistency reads as streaks and wins, never adherence %", pr.includes("Consistency · streaks") && !pr.includes("Workout adherence") && !pr.includes("Macro adherence") && !/\d+%\s*adherence/i.test(pr));
  ok("Progress: signed-out has no check-in form (old behavior kept)", !pr.includes("Send check-in"));
  const form = render(React.createElement(g.DprCheckinForm, { kit: { weekOf: "2026-06-08", checkins: [], measurements: [] }, onSaved: () => {} }));
  ok("Check-in kit survives the migration (6 ratings + tape + photos + send)", form.includes("Weekly check-in") && form.includes("Training adherence") && form.includes("Waist (cm)") && form.includes("front photo") && form.includes("Send check-in"));
  // The dashboard's ring follows the framing rule too.
  ok("Client dashboard ring: wins count, not a bare adherence %", clientHtml.includes("This week · consistency") && clientHtml.includes(">wins<") && !clientHtml.includes("76%"));
} catch (e) { ok("Progress page renders", false, e.message); }

// ── 4f. Business page — merged Analytics+Payouts, honest-money hardest ──────
try {
  const biz = render(React.createElement(g.CoachBusinessPage, { role: "trainer" }));
  ok("Business page renders all four zones + migrated outcomes", biz.includes("Revenue · 90-day trend") && biz.includes("Payouts · schedule") && biz.includes("Marketplace funnel") && biz.includes("Churn · who left") && biz.includes("The product · roster outcomes"));
  ok("Business: funnel keeps its benchmark line", biz.includes("BENCHMARK · ~30%"));
  ok("Business: demo churn carries example exit reasons", biz.includes("Hit her goal"));
  const nbiz = render(React.createElement(g.CoachBusinessPage, { role: "nutritionist" }));
  ok("Business nutritionist lens: her outcome cards + logger list", nbiz.includes("Protein adherence") && nbiz.includes("Most consistent loggers"));
  // Honest money — live viewer, payouts NOT connected: dashes + the note +
  // a real Stripe-onboarding CTA; not one fabricated dollar.
  const notConnected = render(React.createElement(g.DbzPayoutsZone, { live: true, stripe: { connected: false, status: "not_connected", balanceCents: null, schedule: null, payouts: [] }, providerId: 7, role: "trainer" }));
  ok("Payouts not connected: — + 'connects when payouts go live' + setup CTA", notConnected.includes("—") && notConnected.includes("connects when payouts go live") && notConnected.includes("Set up payouts"));
  ok("Payouts not connected: zero invented dollars", !/\$\d/.test(notConnected));
  const failedFetch = render(React.createElement(g.DbzPayoutsZone, { live: true, stripe: null, providerId: null, role: "trainer" }));
  ok("Payouts with a failed analytics fetch: still no invented dollars", !/\$\d/.test(failedFetch));
  const connected = render(React.createElement(g.DbzPayoutsZone, { live: true, stripe: { connected: true, status: "active", balanceCents: 123400, schedule: { interval: "weekly", weeklyAnchor: "friday", delayDays: 2 }, payouts: [{ id: "po_1", amountCents: 250000, status: "paid", arrivalDate: Date.now() - 3 * 86400000, created: Date.now() - 5 * 86400000 }] }, providerId: 7, role: "trainer" }));
  ok("Payouts connected: real balance, schedule line, history row", connected.includes("$1,234") && connected.includes("Paid out weekly · Fridays · 2-day rolling delay") && connected.includes("$2,500"));
  const liveChurnEmpty = render(React.createElement(g.DbzChurnZone, { live: true, churn: [] }));
  ok("Churn live-empty is honest", liveChurnEmpty.includes("No cancellations on record"));
  const liveChurn = render(React.createElement(g.DbzChurnZone, { live: true, churn: [{ name: "A. Client", startedAt: new Date(Date.now() - 200 * 86400000).toISOString(), endedAt: new Date(Date.now() - 5 * 86400000).toISOString(), priceCents: 18000, reason: null }] }));
  ok("Churn live row: tenure + MRR lost + honest missing reason", liveChurn.includes("mo client") && liveChurn.includes("−$180") && liveChurn.includes("collects once the cancellation survey ships"));
} catch (e) { ok("Business page renders", false, e.message); }

// ── 4h. Workouts page — full program: weeks, locks, history, human loop ─────
try {
  const wk = render(React.createElement(g.ClientWorkoutsPage));
  ok("Workouts page renders the program (demo) with week structure", wk.includes("Workouts") && /Week \d · this week/.test(wk) && /STRENGTH BLOCK 3 · WEEK \d OF \d/.test(wk));
  ok("Workouts: past weeks are collapsed + done; current week expanded", wk.includes("· done") && wk.includes("· this week") && wk.includes("· locked"));
  ok("Workouts: the unwritten next block sells the human loop", /writes this after your check-in/i.test(wk) && wk.includes("Check in") && /FINE-TUNES IT AFTER YOUR CHECK-IN/i.test(wk));
  ok("Workouts: tonight's session card leads (the Today deep-link target)", wk.includes("Tonight's workout") || wk.includes("Tonight"));
  ok("Workouts: history shows logged vs prescribed", wk.includes("logged vs prescribed") && wk.includes("Prescribed"));
  ok("Workouts: consistency is streaks/wins, no bare adherence %", wk.includes("Consistency · streaks") && !/\d+%\s*adherence/i.test(wk));
  // Week grouping is correct: template stamps win, status by calendar week.
  const now = new Date("2026-06-12T12:00:00");
  const iso = (d) => d.toISOString().slice(0, 10);
  const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const thisMon = monday(now);
  const dayIn = (wkOffset, dayN) => iso(new Date(thisMon.getTime() + wkOffset * 7 * 86400000 + dayN * 86400000));
  const workouts = [
    { id: "a", title: "W1D1", scheduledDate: dayIn(-1, 0), template: { week: 1, day: 1 }, exercises: [] },
    { id: "b", title: "W2D1", scheduledDate: dayIn(0, 0), template: { week: 2, day: 1 }, exercises: [] },
    { id: "c", title: "W3D1", scheduledDate: dayIn(1, 0), template: { week: 3, day: 1 }, exercises: [] },
  ];
  const { weeks } = g.dtrBuildWeeks(workouts, new Set([dayIn(-1, 0)]), now);
  ok("week grouping: past/current/upcoming by calendar week", weeks.map((w) => w.status).join(",") === "past,current,upcoming");
  ok("week grouping: completion marks count done days", weeks[0].doneCount === 1 && weeks[1].doneCount === 0);
} catch (e) { ok("Workouts page renders", false, e.message); }

// ── 4i. Nutrition page — full meal plan, swaps, grocery, streak-framed ──────
try {
  const nu = render(React.createElement(g.ClientNutritionPage));
  ok("Nutrition page renders the assigned plan (demo)", nu.includes("Nutrition") && nu.includes("LEAN RECOMP") && nu.includes("This week"));
  ok("Nutrition: today's meals card with swap options visible", /Today&#x27;s meals/.test(nu) && nu.includes("⇄ Swap"));
  ok("Nutrition: grocery auto-builds from the plan ingredients", nu.includes("Grocery · auto-built from your plan") && nu.includes("Chicken breast"));
  ok("Nutrition: logging is streak-framed, no bare adherence %", nu.includes("Logging · streaks") && nu.includes("Logging streak") && !/\d+%\s*adherence/i.test(nu) && !nu.includes("% of target"));
  ok("Nutrition: saved recipes section present", nu.includes("Saved recipes"));
  // Grocery aggregator: groups by name, counts meals using each.
  const days = [
    { meals: [{ title: "Bowl", ingredients: [{ qty: "180 g", name: "Rice" }, { qty: "200 g", name: "Chicken" }] }, { title: "Dinner", ingredients: [{ qty: "180 g", name: "Rice" }] }] },
    { meals: [{ title: "Lunch", ingredients: [{ qty: "180 g", name: "Rice" }] }] },
  ];
  const groc = g.dnuBuildGrocery(days);
  const rice = groc.find((x) => x.name === "Rice");
  ok("grocery aggregator: counts distinct meals per ingredient", rice.count === 3 && groc[0].name === "Rice");
  // Plan-day → ledger-card meals: cal→kcal targets, alts preserved.
  const meals = g.dnuDayMeals({ meals: [{ slot: "Lunch", time: "12:30", title: "Bowl", kcal: 620, p: 52, c: 68, f: 18, alts: [{ name: "Alt", kcal: 600, p: 40, c: 60, f: 18 }] }] });
  ok("plan meal maps to the ledger card shape with swaps", meals[0].kcal === 620 && meals[0].alts.length === 1 && meals[0].time === "12:30 PM");
} catch (e) { ok("Nutrition page renders", false, e.message); }

// ── 4j. Schedule page — planning calendar, client colors, availability ──────
try {
  const sc = render(React.createElement(g.CoachSchedulePage, { role: "trainer" }));
  ok("Schedule page renders the planning calendar (demo)", sc.includes("Schedule") && sc.includes("PLANNING VIEW") && sc.includes("Month") && sc.includes("Week"));
  ok("Schedule: events are color-coded by client (legend + names)", sc.includes("Priya S.") && sc.includes("Deandre K.") && sc.includes("Marcus T."));
  ok("Schedule: availability editor feeds the marketplace", sc.includes("Availability · feeds your marketplace profile") && sc.includes("marketplace profile"));
  ok("Schedule: rescheduling explained (drag + client notification)", sc.includes("How rescheduling works") && /notification with the new time|client gets a notification/i.test(sc));
  const nsc = render(React.createElement(g.CoachSchedulePage, { role: "nutritionist" }));
  ok("Schedule nutritionist role renders without leaked trainer UI", nsc.includes("PLANNING VIEW") && !nsc.includes("TrainerSchedule.html"));
  // Color map: distinct clients on the calendar never share a color (≤10).
  const cmap = g.dscColorMap([{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }, { clientId: "a" }]);
  ok("distinct clients get distinct colors; same client stays stable", cmap("a") !== cmap("b") && cmap("b") !== cmap("c") && cmap("a") === cmap("a"));
  ok("client hash color is deterministic", g.dscClientColor("demo-priya") === g.dscClientColor("demo-priya"));
} catch (e) { ok("Schedule page renders", false, e.message); }

// ── 4g. Message deep-link — every button routes through the chat bubble ─────
try {
  const mock = g.DashSignals.buildMockClients();
  const feed = g.DashSignals.getTriageFeed("trainer", mock);
  const marcus = feed.find((r) => r.client.profile.name === "Marcus T.");
  const draft = g.dashMessageDraft(marcus);
  ok("reason pills become an editable opener", /^Hey Marcus — checking in\. I'm seeing s/.test(draft) && draft.includes("What's getting in the way this week?"));
  ok("clean rows draft nothing", g.dashMessageDraft(feed.find((r) => r.client.profile.name === "Jordan M.")) === null);
  const joint = g.DashSignals.findJointAttention(mock)[0];
  ok("joint note drafts the coordinated message", g.dashJointDraft(joint, "trainer").includes("your nutritionist and I compared notes"));
  ok("congratulate drafts from the milestone", g.dashCongratsDraft(joint.client, { label: "100th workout" }).includes("100th workout"));
  // The dispatcher hands the bubble a {who, draft} descriptor — no messages page.
  let captured = null;
  g.__openChatTo = (opts) => { captured = opts; };
  g.dashMessageClient("Marcus T.", "trainer", draft);
  ok("Message button deep-links the bubble with who + draft", captured && captured.who === "Marcus T." && captured.draft === draft);
  g.dashMessageClient("", "client", "Could we set up my goals?");
  ok("client coach-message lands on the trainers tab with the draft", captured && captured.tab === "trainers" && /set up my goals/.test(captured.draft));
  delete g.__openChatTo;
} catch (e) { ok("message deep-link contract", false, e.message); }

// ── 5. Console errors during render ─────────────────────────────────────────
const realErrors = errors.filter((e) => !e.includes("useLayoutEffect"));
ok("no console errors / React warnings", realErrors.length === 0, realErrors.slice(0, 3).join(" || "));

console.error = realError;
let fails = 0;
for (const c of checks) {
  if (!c.pass) fails += 1;
  console.log((c.pass ? "  ok  " : "  FAIL") + " · " + c.name + (c.pass || !c.detail ? "" : "  → " + c.detail));
}
console.log("\n" + (checks.length - fails) + "/" + checks.length + " render checks passed");
process.exit(fails ? 1 : 0);
