import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ⚠ A PAGE THAT RENDERS <DashGrid> MUST LOAD dashGrid.jsx AND GRIDSTACK, BEFORE IT.
// These pages are classic scripts with no module loader, so a bare global exists only
// if an earlier tag defined it — and both failures are SILENT in different ways:
// a missing `dashGrid.jsx` is `ReferenceError: DashGrid is not defined` with no error
// boundary anywhere in public/newdesign (a blank page), and a missing GridStack makes
// the init effect return early, leaving an empty 60vh `.grid-stack` div with nothing on
// screen saying why.
//
// Found by converting the Business and Clients tabs: the four REDIRECT STUBS that mount
// those pages (TrainerAnalytics/Clients and the nutritionist pair) load neither, and a
// stub's script tags still execute — it mounts the page — until navigation commits.
//
// The corpus is DERIVED from what each page mounts, so a page added later is covered
// with nobody remembering this file exists.

const ND = path.resolve(import.meta.dirname, '../public/newdesign');
const jsx = fs.readdirSync(ND).filter((f) => f.endsWith('.jsx'));

// component name → the module that declares it
const DECLARES = new Map();
const RENDERS_GRID = new Set();
for (const f of jsx) {
  const src = fs.readFileSync(path.join(ND, f), 'utf8');
  if (/<DashGrid[\s/>]/.test(src)) RENDERS_GRID.add(f);
  for (const m of src.matchAll(/^function ([A-Z][A-Za-z0-9_]*)\s*\(/gm)) {
    if (!DECLARES.has(m[1])) DECLARES.set(m[1], f);
  }
}

test('the grid module list is derived and non-empty', () => {
  assert.ok(RENDERS_GRID.size >= 5, `expected >=5 newdesign modules rendering <DashGrid>, found ${RENDERS_GRID.size} — this sweep has stopped matching`);
  assert.ok(DECLARES.size > 100, `component index looks empty (${DECLARES.size}) — the declaration scan has stopped matching`);
});

// Every page, with its script tags in document order and where its inline mounts sit.
function hostsThatMountAGrid() {
  const out = [];
  for (const f of fs.readdirSync(ND).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(ND, f), 'utf8');
    // ⚠ THE MOUNT MAY BE SEVERAL LINES BELOW `render(`, AND OFTEN IS — a page that
    // mounts a page plus the chat widget wraps them in a fragment. A regex that
    // required the component immediately after `render(` under-reported, and the
    // pages it missed (ClientHabits) were the ones with the defect.
    const mounts = [];
    for (const r of html.matchAll(/\.render\(/g)) {
      const win = html.slice(r.index, r.index + 600);
      for (const c of win.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) mounts.push({ 1: c[1], index: r.index + c.index });
    }
    const need = [];
    for (const m of mounts) {
      const mod = DECLARES.get(m[1]);
      if (mod && RENDERS_GRID.has(mod)) need.push({ comp: m[1], mod, at: m.index });
    }
    if (need.length) out.push({ file: f, html, need });
  }
  return out;
}

const ALL = hostsThatMountAGrid();

// ⚠ A PAGE CAN BE BROKEN ONE LEVEL UP, AND THIS GUARD FOUND ONE.
// ClientDashboard-print.html mounts <ClientDashboardPage /> and never loads
// dashClient.jsx — the module that DECLARES it — so the component is undefined
// before DashGrid ever gets a chance to be. It loads three modules in total and
// is reachable only from the legacy public/mobile tree. PRE-EXISTING and left
// alone: making a print view work means deciding what it should print, which is
// its own change, not a side effect of converting two coach tabs.
// It is pinned by name rather than exempted by a rule, so a SECOND page joining
// it fails here — and so does fixing this one, which is the point: the list may
// only ever shrink, and shrinking it is a deliberate edit.
const KNOWN_UNLOADED = ['ClientDashboard-print.html'];

test('a page mounts no component whose declaring module it never loads', () => {
  const broken = ALL.filter(({ html, need }) => need.some((n) => !html.includes(`src="${n.mod}`)))
    .map((h) => h.file).sort();
  assert.deepEqual(broken, KNOWN_UNLOADED.slice().sort(),
    'a page mounts a grid-rendering component whose module it does not load — that is a ReferenceError on the component itself, before DashGrid is even reached');
});

// Everything below is about pages that DO load the declaring module.
const HOSTS = ALL.filter(({ html, need }) => need.every((n) => html.includes(`src="${n.mod}`)));

test('the host corpus is derived and non-empty', () => {
  assert.ok(HOSTS.length >= 6, `expected >=6 pages mounting a grid-rendering component, found ${HOSTS.length} — the mount scan has stopped matching`);
});

// ⚠ EVERY OFFENDER, NOT THE FIRST. A loop of bare assertions stops at the first
// failure, which is how a second broken page hides behind the first — measured:
// ClientGoal.html and ClientHabits.html were both missing these and only one was
// ever reported.
function missing(marker) {
  const out = [];
  for (const { file, html, need } of HOSTS) {
    const at = html.indexOf(marker);
    if (at < 0) { out.push(`${file} (mounts ${need.map((n) => n.comp).join(', ')}) — never loads it`); continue; }
    for (const n of need) if (at > n.at) out.push(`${file} — loads it AFTER mounting ${n.comp}`);
  }
  return out.sort();
}

test('every page that mounts a grid loads dashGrid.jsx before the mount', () => {
  assert.deepEqual(missing('src="dashGrid.jsx'), [],
    'a classic script defines its globals when it RUNS — without dashGrid.jsx this is `ReferenceError: DashGrid is not defined`, and there is no error boundary anywhere in public/newdesign, so it is a blank page');
});

test('every page that mounts a grid loads the GridStack vendor script before the mount', () => {
  assert.deepEqual(missing('/vendor/gridstack/'), [],
    "without GridStack, DashGrid's init effect returns early and the page shows an empty 60vh area with nothing on screen saying why");
});

// A page's layout is stored per role + tab, so two tabs asking for the same key would
// share a board. Derived from the call sites rather than a list somebody maintains.
test('no two DashGrid call sites in one module share a role+tab key', () => {
  for (const f of RENDERS_GRID) {
    const src = fs.readFileSync(path.join(ND, f), 'utf8');
    // ⚠ A CALL SITE WITH NO `tab` IS A KEY TOO (dashClient.jsx has one), so the tab
    // is optional here — matching only explicit tabs would let two tab-less sites
    // in one module share a board with the suite green.
    const keys = [...src.matchAll(/<DashGrid\s+([^>]*?)\/?>/g)].map((m) => {
      const a = m[1];
      const role = (a.match(/role=\{?["']?([^"'}\s]+)/) || [, ''])[1];
      const tab = (a.match(/tab=\{?["']?([^"'}\s]+)/) || [, ''])[1];
      return `${role}|${tab}`;
    });
    assert.equal(new Set(keys).size, keys.length, `${f} has two <DashGrid> call sites with the same role+tab — they would share one stored layout`);
  }
});

// ── which tabs ARE boards ─────────────────────────────────────────────────────
// ⚠ PINNED, BECAUSE "IS THIS TAB DRAGGABLE" IS A PRODUCT CLAIM AND NOTHING ELSE
// ASSERTS IT. A mutation that replaced `<DashGrid>` with a plain map of the same
// widgets rendered a visually similar page and passed every other guard in this
// repo — the coach silently loses hide/reorder/resize and their stored layout
// stops being read. The map may grow; a row leaving it is a deliberate edit.
const BOARDS = {
  'clientHabits.jsx': ['client|habits'],
  'clientScore.jsx': ['client|score'],
  'dashBusiness.jsx': ['role|business'],
  'dashClient.jsx': ['client|'],
  'dashGoals.jsx': ['client|goal'],
  'dashNutri.jsx': ['client|nutrition'],
  'dashProgress.jsx': ['client|progress'],
  'dashTrain.jsx': ['client|workouts'],
  'nutritionistClientsPage.jsx': ['nutritionist|clients'],
  'nutritionistGoalPage.jsx': ['nutritionist|goal'],
  'nutritionistScorePage.jsx': ['nutritionist|score'],
  'trainerClientsPage.jsx': ['trainer|clients'],
  'trainerDashboard.jsx': ['role|today'],
  'trainerGoalPage.jsx': ['trainer|goal'],
  'trainerScorePage.jsx': ['trainer|score'],
};

function gridKeys(src) {
  return [...src.matchAll(/<DashGrid\s+([^>]*?)\/?>/g)].map((m) => {
    const a = m[1];
    const role = (a.match(/role=\{?["']?([^"'}\s]+)/) || [, ''])[1];
    const tab = (a.match(/tab=\{?["']?([^"'}\s]+)/) || [, ''])[1];
    return `${role}|${tab}`;
  });
}

test('every tab that is a board still renders one, with its own role+tab key', () => {
  const actual = {};
  for (const f of jsx) {
    const keys = gridKeys(fs.readFileSync(path.join(ND, f), 'utf8'));
    if (keys.length) actual[f] = keys;
  }
  assert.deepEqual(actual, BOARDS,
    'a page stopped rendering <DashGrid> (its coach silently loses hide/reorder/resize and their stored layout stops being read), or gained one — either is a deliberate edit, so update BOARDS above with it');
});

test('no two modules claim the same role+tab board', () => {
  // Layout is stored at `dashboard_layout[role][tab]`, so two pages sharing a key
  // share one board: hiding a card on one would take it off the other.
  const seen = new Map();
  for (const [f, keys] of Object.entries(BOARDS)) {
    for (const k of keys) {
      assert.ok(!seen.has(k), `${f} and ${seen.get(k)} both render the ${k.replace('|', ' / ')} board — they would share one stored layout`);
      seen.set(k, f);
    }
  }
});

test('the Business outcomes widget declares `empty`, because its zone needs a rollup', () => {
  // DbzOutcomesZone is null-safe as a floor, but a card drawn with no rollup
  // claims a 30-day outcome nobody measured. The declaration is the honest half.
  const src = fs.readFileSync(path.join(ND, 'dashBusiness.jsx'), 'utf8');
  const at = src.indexOf('key: "outcomes"');
  assert.ok(at > 0, 'the outcomes widget is gone');
  const block = src.slice(at, at + 900);
  assert.match(block, /empty:\s*!cp\b/, 'the outcomes widget no longer declares `empty` — it would draw a roster-outcomes card with no rollup behind it');
  assert.match(block, /emptyWhy:/, 'the outcomes widget declares `empty` with no reason — the catalogue would say only "nothing to show yet"');
});
