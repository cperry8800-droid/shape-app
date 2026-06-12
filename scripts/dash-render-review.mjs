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
load("public/newdesign/dashRoster.jsx");
// The roster page component lives inline in its HTML.
const rosterHtml = readFileSync("public/newdesign/NutritionistClients.html", "utf8");
const inline = [...rosterHtml.matchAll(/<script type="text\/babel"[^>]*>\n?([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).filter((s) => !s.includes("ReactDOM.createRoot") || true)
  .map((s) => s.replace(/ReactDOM\.createRoot[\s\S]*$/, ""));
for (const block of inline) if (block.trim()) (0, eval)(compile(block, "NutritionistClients-inline"));

const render = (el) => ReactDOMServer.renderToString(el);
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

// Roster table + drawer with the demo feed.
try {
  const triage = g.DashSignals.getTriageFeed("nutritionist", g.DashSignals.buildMockClients());
  const tbl = render(React.createElement(g.DashRosterTable, { triage, role: "nutritionist", filter: "all", query: "" }));
  ok("Roster table renders all personas", tbl.includes("Marcus T.") && tbl.includes("Tess B."));
  const drawer = render(React.createElement(g.DashConsultDrawer, { row: triage[0], role: "nutritionist", onClose: () => {} }));
  ok("Consult drawer renders", drawer.includes("Quick consult") && drawer.includes("Macros vs targets"));
} catch (e) { ok("Roster table + drawer render", false, e.message); }

// ── 2. Role isolation — no leaked role-specific UI ──────────────────────────
for (const [token, where] of [
  ["+ Meal plan", "trainer"], ["NutritionistPlans.html", "trainer"], ["Today&#x27;s consults", "trainer"], ["Roster health", "trainer"], ["Plans due", "trainer"],
]) ok(`trainer view has no "${token.replace("&#x27;", "'")}"`, !trainerHtml.includes(token), where);
for (const [token] of [
  ["+ Program"], ["TrainerPrograms.html"], ["Today&#x27;s schedule"], ["Growth · 90 days"], ["Sessions this week"],
]) ok(`nutritionist view has no "${token.replace("&#x27;", "'")}"`, !nutriHtml.includes(token));
for (const token of ["Programming queue", "Client wins", "Marketplace funnel", "Client pulse"])
  ok(`trainer view contains "${token}"`, trainerHtml.includes(token));
for (const token of ["Roster health", "Plans due", "Client wins", "Marketplace funnel"])
  ok(`nutritionist view contains "${token}"`, nutriHtml.includes(token));

// ── 3. Client page — nothing business-flavored ──────────────────────────────
ok("client view has no MRR", !/MRR/i.test(clientHtml));
ok("client view has no consult counts", !/consult/i.test(clientHtml));
for (const token of ["Tonight", "Shape Score", "Milestones", "compliance", "Your team"])
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
  ok("wins panel shows the 100th-workout brief", wins.includes("100th workout") && wins.includes("Congratulate"));
} catch (e) { ok("joint + wins panels render", false, e.message); }

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
