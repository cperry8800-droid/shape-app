// The website's dashboards read in the reader's units (Settings → Units).
//
// ⚠ EVERY DASHBOARD PRINTED WEIGHTS AS STORED. The progress and train APIs
// normalize bodyweight, loads and volume to pounds, a check-in and a tape
// measurement carry whatever unit they were logged in, and a coach's goal
// document is in kilograms — so a metric member read "171 lb" on the website
// while the app showed them kilograms, and a coach could read one client in two
// systems on one page. `dashData.jsx` now reads `client_settings.units` once per
// page (`useDashUnits`) and converts through the app's own module,
// `public/newdesign/unitText.mjs`.
//
// These tests render the SHIPPED components (loadRealModule compiles the real
// files) with the real converter, under both systems, and read what a person
// would read. No figure is restated from the source.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as U from '../public/newdesign/unitText.mjs';

const require = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const METRIC = 'Metric · kg / km';
const IMPERIAL = 'Imperial · lb / mi';

let ctx = null;
async function setup() {
  if (ctx) return ctx;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.DashSignals = require('../public/newdesign/dashSignals.js');
  const React = require('react'); globalThis.React = React;
  const RDS = require('react-dom/server');
  const Pass = ({ children }) => React.createElement('div', null, children);
  // The page-shell globals these modules read at render — each a `pageShell.jsx` /
  // `dashShell.jsx` export every host page loads first. Stubbed, because what is
  // under test is the figures inside them.
  Object.assign(globalThis, {
    PAPER: '#1a1612', INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', serif: 'serif', sans: 'sans-serif', mono: 'monospace', ink50: 'rgba(0,0,0,.5)',
    Card: Pass, DashPage: Pass, DashShell: Pass, SectionTitle: Pass, Header: () => null, Footer: () => null, DashSidebar: () => null, DashTopbar: () => null,
    dashShellHref: (x) => '#' + x, clientNavItems: () => [], clientPayoutCard: () => null, ShapeVideoPlayer: () => null,
    ssAlpha: (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0'),
    // The grid renders each widget's body in place of the draggable layout, and skips
    // one that declares itself `empty`, as dgVisibleWidgets does.
    DashGrid: ({ widgets }) => React.createElement('div', null, widgets.filter((w) => w && !w.empty).map((w, i) => React.createElement('section', { key: i }, w.render ? w.render() : null))),
  });
  const registry = () => new Map([['/newdesign/unitText.mjs', U]]);
  const load = async (file, names) => {
    const mod = await loadRealModule(ND(file), { registry: registry(), appendExports: `export { ${names.join(', ')} };` });
    // A classic script's top-level functions are page globals; a sibling file reads them.
    for (const [k, v] of Object.entries(mod)) if (!(k in globalThis) || k.startsWith('dash')) globalThis[k] = v;
    for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } }
    return mod;
  };
  const D = await load('dashData.jsx', ['dashUnitsApi', 'dashUnitPrefs', 'dashGoalText', 'dashMilestonesIn', 'dashWeighIn', 'dashWeighInDelta', 'dashCheckinReviewed']);
  const T = await load('dashToday.jsx', ['dashContextLine', 'DashWinsPanel', 'ExpandableSchedule']);
  const R = await load('dashRoster.jsx', ['DashSecWeighIns', 'DashSecNutritionSummary', 'DashSecMilestones']);
  const W = await load('dashWeek.jsx', ['DwkRow']);
  const B = await load('dashBusiness.jsx', ['DbzOutcomesZone']);
  // The client file's host loads the shared live-workout panel before it.
  const clw = readFileSync(ND('coachLiveWorkout.jsx'), 'utf8');
  await load('coachLiveWorkout.jsx', [...clw.matchAll(/^function (\w+)\(/gm)].map((m) => m[1]));
  Object.assign(globalThis, { trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: null, nutriPayoutCard: null });
  const C = await load('coachClientDetail.jsx', ['GoalsCard', 'ckBodyweight', 'ckMeasure', 'ckLiftRows', 'CoachClientDetailPage']);
  const CL = await load('dashClient.jsx', ['DashWorkoutCard', 'ClientDashboardPage']);
  const TR = await load('dashTrain.jsx', ['DtrHistory', 'ClientWorkoutsPage']);
  const P = await load('dashProgress.jsx', ['dprPointsIn', 'dprSeriesIn', 'dprPrsIn', 'dprLiftsIn', 'DprMilestoneTimeline', 'DprCheckinHistory', 'DprCheckinForm', 'ClientProgressPage', 'dprCheckinUnits', 'dprCurrentCheckin']);
  // The Score page reads the score-record helpers its host loads before it.
  const csr = readFileSync(ND('clientScoreRecord.jsx'), 'utf8');
  await load('clientScoreRecord.jsx', [...csr.matchAll(/^function (\w+)\(/gm)].map((m) => m[1]));
  const S = await load('clientScore.jsx', ['ClientScorePage']);
  const LV = await load('livingProfilePage.jsx', ['lvTrajectory', 'lvLiftsIn']);
  const api = (system) => D.dashUnitsApi(U, D.dashUnitPrefs(system));
  // Every component reads the hook; the test sets what it answers.
  const as = (system) => { const a = system ? api(system) : D.dashUnitsApi(null, null); globalThis.useDashUnits = () => a; return a; };
  const text = (el) => RDS.renderToStaticMarkup(el).replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const html = (el) => RDS.renderToStaticMarkup(el);
  ctx = { React, RDS, D, T, R, W, B, C, CL, TR, P, S, LV, api, as, text, html };
  return ctx;
}

// ⚠ A MOUNTED PAGE THAT IS NEVER UNMOUNTED KEEPS THE TEST PROCESS ALIVE (its timers
// and subscriptions), so a test that fails before its own unmount turns a failure
// into a HANG — measured in the mutation round, where the first mutation ran out the
// runner's 400 s budget instead of failing. Every root is registered here and torn
// down after the file, whatever happened to the test that mounted it.
const LIVE_ROOTS = new Set();
after(async () => {
  for (const close of [...LIVE_ROOTS]) { try { await close(); } catch (e) { /* already gone */ } }
});
function track(React, root, el) {
  const close = async () => { LIVE_ROOTS.delete(close); await React.act(async () => root.unmount()); el.remove(); };
  LIVE_ROOTS.add(close);
  return close;
}

// Mount a page in jsdom with its API answered from `payloads`, and let its effects run.
async function mount(React, Page, payloads) {
  const { createRoot } = require('react-dom/client');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const prev = globalThis.fetch;
  globalThis.fetch = async (p) => {
    const body = payloads[String(p).split('?')[0]] || payloads['*'];
    return { ok: !!body, status: body ? 200 : 404, json: async () => body || {} };
  };
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el);
  const close = track(React, root, el);
  await React.act(async () => root.render(React.createElement(Page)));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  // Text nodes joined with a space: textContent runs adjacent figures together
  // ("−1.8 lb81.6 kg"), and a unit glued to the next number hides from \b.
  const text = readText(el);
  return { el, text, unmount: async () => { await close(); globalThis.fetch = prev; } };
}

function readText(el) {
  const out = [], walk = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.nodeValue);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// A unit word for the other system, anywhere in what is read.
const IMPERIAL_RE = /\d\s*(lb|lbs|mi|in)\b/;
const METRIC_RE = /\d\s*(kg|km|cm)\b/;

test('the converter: Settings → Units, the same module the app uses, and as stored until it is read', async () => {
  const { D, api } = await setup();
  assert.deepEqual(D.dashUnitPrefs(METRIC), { weight: 'kg', distance: 'km', length: 'cm' });
  assert.deepEqual(D.dashUnitPrefs(undefined), { weight: 'lb', distance: 'mi', length: 'in' }, 'no setting is the app default, imperial');
  assert.deepEqual(D.dashUnitPrefs('kg / km'), { weight: 'kg', distance: 'km', length: 'cm' }, 'the app’s rule: a kg or km setting is metric');
  const m = api(METRIC), i = api(IMPERIAL);
  assert.deepEqual(m.measure(171, 'lb'), { value: 77.6, unit: 'kg' });
  assert.deepEqual(i.measure(77.6, 'kg'), { value: 171, unit: 'lb' });
  assert.deepEqual(m.measure(33, 'in'), { value: 83.8, unit: 'cm' });
  assert.equal(m.fmt(171, 'lb'), '77.6 kg');
  // A series that is subtracted converts exactly; only display rounds.
  assert.ok(Math.abs(m.exact(176.3, 'lb').value - 79.9683) < 1e-3 && m.exact(176.3, 'lb').unit === 'kg');
  assert.deepEqual(i.exact(176.3, 'lb'), { value: 176.3, unit: 'lb' });
  assert.ok(Math.abs(m.exact(33, 'in').value - 83.82) < 1e-3);
  assert.equal(m.text('Squat PR · +5 lb'), 'Squat PR · +2.3 kg');
  assert.equal(m.label('lb'), 'kg');
  assert.equal(m.label('in'), 'cm', 'a bare unit field converts a length, which prose refuses');
  assert.equal(i.label('kg'), 'lb');
  assert.equal(i.label('reps'), 'reps');
  const none = D.dashUnitsApi(null, null);
  assert.equal(none.ready, false);
  assert.deepEqual(none.measure(171, 'lb'), { value: 171, unit: 'lb' }, 'before the module loads a figure shows as stored');
  assert.equal(none.text('245 lb'), '245 lb');
});

// ⚠ THE LOADER IS DRIVEN FROM THE SHIPPED SOURCE WITH ONE CHANGE: the module's
// site path, `/newdesign/unitText.mjs`, is pointed at the file, as the feed's test
// does. Each evaluation is a fresh page, so the one-load-per-page state starts empty.
function freshLoader() {
  const SRC = readFileSync(ND('dashData.jsx'), 'utf8');
  const cut = (from, to) => { const a = SRC.indexOf(from), b = SRC.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return SRC.slice(a, b); };
  const chunk = cut('const DASH_UNITS_IMPERIAL', '// The engine')
    .replace('import("/newdesign/unitText.mjs")', `import(${JSON.stringify(new URL('../public/newdesign/unitText.mjs', import.meta.url).href)})`);
  assert.ok(!chunk.includes('"/newdesign/unitText.mjs"'), 'the module path was pointed at the file');
  const bridge = cut('async function dashDocBridge()', 'async function dashDocUid()');
  // eslint-disable-next-line no-new-func
  return new Function('window', 'React', bridge + chunk + '; return { useDashUnits, dashLoadUnits };')(window, React);
}

test('the loader reads the signed-in member’s setting once, and never a signed-out visitor’s', async () => {
  const { React } = await setup();
  const { createRoot } = require('react-dom/client');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const asked = [];
  window.shapeDb = { getSession: async () => ({}), getUser: async () => ({ id: 'u-1' }), getUserGoals: async (k) => { asked.push(k); return { units: METRIC }; } };
  const L = freshLoader();
  const seen = [];
  const Probe = () => { const u = L.useDashUnits(); seen.push(u.ready + ':' + u.fmt(171, 'lb')); return null; };
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el);
  const close = track(React, root, el);
  await React.act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(Probe))));
  await React.act(async () => { await L.dashLoadUnits(); });
  assert.equal(seen[0], 'false:171 lb', 'before the setting is read a figure shows as stored');
  assert.deepEqual(seen.slice(-2), ['true:77.6 kg', 'true:77.6 kg'], 'every component re-renders in the member’s units once the setting arrives');
  assert.deepEqual(asked, ['client_settings'], 'one read per page, shared by every component that asks');
  await close();

  // Signed out: nobody's settings are read, and the page shows the app default.
  asked.length = 0;
  window.shapeDb = { getSession: async () => null, getUser: async () => null, getUserGoals: async (k) => { asked.push(k); return { units: METRIC }; } };
  const L2 = freshLoader();
  await L2.dashLoadUnits();
  assert.deepEqual(asked, [], 'a signed-out visitor’s page reads no settings');
  // A failed read falls back to the default rather than breaking the page.
  window.shapeDb = { getSession: async () => ({}), getUser: async () => ({ id: 'u-1' }), getUserGoals: async () => { throw new Error('offline'); } };
  const L3 = freshLoader();
  await L3.dashLoadUnits();
  let last = null;
  // The converter stays loaded on the app default, imperial: a check-in logged in kg
  // still reads in pounds, so the page never mixes systems because a read failed.
  const Probe3 = () => { last = L3.useDashUnits().fmt(80, 'kg'); return null; };
  const el3 = document.createElement('div'); document.body.appendChild(el3);
  const root3 = createRoot(el3);
  const close3 = track(React, root3, el3);
  await React.act(async () => root3.render(React.createElement(Probe3)));
  assert.equal(last, '176 lb');
  await close3();
  delete window.shapeDb;
});

test('a goal line, a milestone and a weigh-in change read in one system', async () => {
  const { D, api } = await setup();
  const m = api(METRIC), i = api(IMPERIAL);
  assert.equal(D.dashGoalText('2.8 lb to “Goal weight” · pace Jul 17', m), '1.3 kg to “Goal weight” · pace Jul 17');
  assert.equal(D.dashGoalText('3 in away', m), '7.6 cm away', 'the engine’s length head converts, where prose would refuse "in"');
  assert.equal(D.dashGoalText('8 cm away · pace stalled', i), '3.1 in away · pace stalled');
  assert.equal(D.dashGoalText('3 in the bag', m), '3 in the bag', 'only the engine’s own head is read as a unit');
  assert.equal(D.dashGoalText('5 kg away', i), '11 lb away');
  const rec = { goal: { target: 170, now: 176, unit: 'lb' }, streaks: { current: 12 }, milestones: [{ kind: 'pr', label: 'Squat 245 lb PR', hitAt: new Date().toISOString() }] };
  const ms = D.dashMilestonesIn(DashSignals.buildMilestones(rec), m);
  assert.deepEqual(ms.next.find((x) => x.label === 'Goal weight').detail, '2.7 kg away');
  assert.equal(ms.recent.find((x) => /Squat/.test(x.label)).label, 'Squat 111 kg PR');
  assert.equal(D.dashWeighInDelta({ weight: 180, unit: 'lb' }, { weight: 176, unit: 'lb' }, m), -1.8);
  assert.equal(D.dashWeighInDelta({ weight: 81, unit: 'kg' }, { weight: 176, unit: 'lb' }, m), -1.2, 'two units: each reading converts first');
  // One unit: the change is converted once. 81 → 80.6 kg reads 179 → 178 lb (whole
  // pounds), but the change is 0.4 kg, which is 0.9 lb, not the 1 the readings imply.
  assert.equal(D.dashWeighInDelta({ weight: 81, unit: 'kg' }, { weight: 80.6, unit: 'kg' }, i), -0.9);
});

test('coach pages: roster drawer, week review, business outcomes and Today read in the coach’s units', async () => {
  const { React, R, W, B, T, as, text } = await setup();
  const rec = { profile: { id: 'c-1', name: 'Ada L' }, weighIns: [{ on: '2026-09-01', weight: 180, unit: 'lb' }, { on: '2026-09-29', weight: 176, unit: 'lb' }], checkins: [], foodLogs: { daysLogged7d: 5 },
    goal: { target: 170, now: 176, unit: 'lb' }, milestones: [{ kind: 'pr', label: 'Deadlift 405 lb PR', hitAt: new Date().toISOString() }] };
  for (const [system, own, other, figures] of [
    [METRIC, METRIC_RE, IMPERIAL_RE, ['79.8 kg', '-1.8 since', 'Alex −2.8 kg', '2.7 kg from goal weight', 'Deadlift 184 kg PR']],
    [IMPERIAL, IMPERIAL_RE, METRIC_RE, ['176 lb', '-4 since', 'Alex −6.2 lb', '6 lb from goal weight', 'Deadlift 405 lb PR']],
  ]) {
    const units = as(system);
    const out = [
      text(React.createElement(R.DashSecWeighIns, { rec })),
      text(React.createElement(R.DashSecNutritionSummary, { rec })),
      text(React.createElement(R.DashSecMilestones, { rec })),
      text(React.createElement(W.DwkRow, { row: { severity: 'green', flags: [], client: rec }, role: 'trainer', weekOf: '2026-09-28', thisMonday: '2026-09-28', live: true, review: null, adherence: null, readout: null, onReview() {}, onNote() {}, canPersist: false, editable: false })),
      text(React.createElement(B.DbzOutcomesZone, { role: 'trainer', cp: { roster: [{ name: 'Alex', weightChangeLb: -6.2, workouts30d: 3 }] } })),
      T.dashContextLine(rec, units),
      text(React.createElement(T.DashWinsPanel, { clients: [rec], role: 'trainer' })),
    ].join(' | ');
    for (const f of figures) assert.ok(out.includes(f), `${system}: "${f}" in ${out}`);
    assert.ok(own.test(out));
    // Each surface carries its own change, read on its own (one surface's figure must
    // not stand in for another's).
    const change = system === METRIC ? '-1.8 since' : '-4 since';
    assert.ok(text(React.createElement(R.DashSecWeighIns, { rec })).includes(change), 'the drawer’s weigh-ins');
    assert.ok(text(React.createElement(R.DashSecNutritionSummary, { rec })).includes(change), 'the drawer’s nutrition summary');
    assert.ok(text(React.createElement(W.DwkRow, { row: { severity: 'green', flags: [], client: rec }, role: 'trainer', weekOf: '2026-09-28', thisMonday: '2026-09-28', live: true, review: null, adherence: null, readout: null, onReview() {}, onNote() {}, canPersist: false, editable: false })).includes(change + ' the one before'), 'the week review');
    assert.ok(!other.test(out), `${system}: no figure in the other system — ${out.match(other)}`);
  }
});

test('Today’s schedule opens on a context line in the coach’s units, from a coach-set goal too', async () => {
  const { React, T, as } = await setup();
  const goals = [{ id: 'g', label: 'Goal weight', metric: 'weight', unit: 'lb', target: 170, now: 176, history: [] }];
  const rec = { profile: { id: 'c-1', name: 'Ada L' }, goals };
  const units = as(METRIC);
  assert.equal(T.dashContextLine(rec, units), '2.7 kg to “Goal weight”', 'the engine’s goal brief');
  as(IMPERIAL);
  assert.equal(T.dashContextLine({ ...rec, goals: [{ ...goals[0], unit: 'kg', target: 80, now: 83 }] }, as(IMPERIAL)), '6.6 lb to “Goal weight”');
  // The schedule row the coach opens.
  as(METRIC);
  const page = await mount(React, () => React.createElement(T.ExpandableSchedule, { schedule: [{ time: '9:00', who: 'Ada L', sub: 'Lower', status: 'NEXT' }], clients: [rec], role: 'trainer' }), {});
  const row = page.el.querySelector('[role="button"][aria-expanded="false"]');
  assert.ok(row, 'the schedule row is expandable');
  await React.act(async () => row.click());
  const text = page.el.textContent;
  assert.ok(text.includes('2.7 kg to “Goal weight”'), text);
  await page.unmount();
});

test('the week review reads a check-in’s own weight when no weigh-in is shared', async () => {
  const { React, W, as, text } = await setup();
  const rec = { profile: { id: 'c-1', name: 'Ada L' }, weighIns: [], checkins: [{ week_of: '2026-09-28', weight: 80, unit: 'kg', ratings: {} }] };
  const row = (system) => { as(system); return text(React.createElement(W.DwkRow, { row: { severity: 'green', flags: [], client: rec }, role: 'trainer', weekOf: '2026-09-28', thisMonday: '2026-10-05', live: true, review: null, adherence: null, readout: null, onReview() {}, onNote() {}, canPersist: false, editable: false })); };
  assert.match(row(IMPERIAL), /Weigh-in 176 lb/);
  assert.match(row(METRIC), /Weigh-in 80 kg/);
});

test('the coach’s client file: bodyweight, key lifts, girths and the goal card', async () => {
  const { React, C, as, text } = await setup();
  const ov = { unit: 'kg', start: 90, now: 85, target: 80, title: 'Cut', weighIns: [{ kg: 90 }, { kg: 87.5 }, { kg: 85 }] };
  const L = { unit: 'lb', keyLifts: [{ name: 'Back squat', best: 315, delta: 10, e1rm: 350 }, { name: 'Row', best: 135, unit: '' }] };
  const imp = as(IMPERIAL);
  assert.deepEqual(C.ckBodyweight(ov, imp), { series: [90, 87.5, 85], trend: [198, 193, 187], unit: 'lb', now: 187, delta: -11, weeks: 3 });
  assert.deepEqual(C.ckLiftRows(L, imp).map((r) => [r.v, r.d]), [['315 lb · 350 e1RM', '+10'], ['135 lb', '—']]);
  assert.deepEqual(C.ckMeasure({ value: 84, unit: 'cm' }, imp), { value: 33.1, unit: 'in' });
  const goals = text(React.createElement(C.GoalsCard, { data: { client: { name: 'Ada L' }, goals: { overall: ov } }, teal: 't', rust: 'r', gold: 'g' }));
  assert.match(goals, /-11 lb so far · 11 lb to go · now 187lb · target 176lb/);
  assert.ok(!METRIC_RE.test(goals), goals);

  const met = as(METRIC);
  assert.equal(C.ckBodyweight(ov, met).unit, 'kg');
  assert.equal(C.ckBodyweight(ov, met).delta, -5);
  assert.deepEqual(C.ckLiftRows(L, met).map((r) => [r.v, r.d]), [['143 kg · 159 e1RM', '+4.5'], ['61.2 kg', '—']]);
  // ⚠ AN UNLABELLED LIFT STAYS UNLABELLED AND UNCONVERTED: the RPC returns a bare
  // max across mixed units before its migration, and converting it would be a claim.
  assert.deepEqual(C.ckLiftRows({ keyLifts: [{ name: 'Bench', best: 100 }] }, met).map((r) => r.v), ['100']);
  assert.match(text(React.createElement(C.GoalsCard, { data: { client: { name: 'Ada L' }, goals: { overall: ov } }, teal: 't', rust: 'r', gold: 'g' })), /-5 kg so far · 5 kg to go · now 85kg · target 80kg/);
});

test('the coach’s client file, live: one system on the whole page', async () => {
  const { React, C, as } = await setup();
  const body = {
    me: { trainerId: 7 }, client: { name: 'Ada Lovelace' }, careTeam: [], sessions: [], stats: {},
    lifts: { unit: 'lb', keyLifts: [{ name: 'Back squat', best: 315, delta: 10, e1rm: 350 }] },
    goals: { overall: { unit: 'kg', start: 90, now: 85, target: 80, title: 'Cut', weighIns: [{ kg: 90 }, { kg: 87.5 }, { kg: 85 }] } },
    measurements: [{ site: 'waist', value: 84, unit: 'cm', measured_on: '2026-10-01' }], progressPhotos: [],
  };
  for (const [system, other, figures] of [
    [IMPERIAL, METRIC_RE, ['315 lb · 350 e1RM', '187 lb', '-11', '33.1', '-11 lb so far']],
    [METRIC, IMPERIAL_RE, ['143 kg · 159 e1RM', '85 kg', '84', '-5 kg so far']],
  ]) {
    as(system);
    const page = await mount(React, () => React.createElement(C.CoachClientDetailPage, { clientId: 'c-1', role: 'trainer' }), { '*': body });
    assert.ok(!/Loading client overview|Try refreshing/.test(page.text), 'the page left its loading state');
    for (const f of figures) assert.ok(page.text.includes(f), `${system}: "${f}"`);
    assert.ok(!other.test(page.text), `${system}: ${page.text.match(other)}`);
    await page.unmount();
  }
});

test('the member’s pages: workout card, history, milestones and check-ins', async () => {
  const { React, CL, TR, P, as, text, html } = await setup();
  const card = { title: 'Lower', coach: 'Maya', exercises: [{ name: 'Back squat', scheme: '4 × 5', load: '110 kg' }] };
  as(IMPERIAL);
  assert.match(text(React.createElement(CL.DashWorkoutCard, { workout: card, interactive: false })), /243 lb/);
  as(METRIC);
  assert.match(text(React.createElement(CL.DashWorkoutCard, { workout: { ...card, exercises: [{ name: 'Bench', load: '225 lb' }] }, interactive: false })), /102 kg/);

  const sessions = [{ title: 'Upper', at: '2026-10-01T10:00:00Z', durationMin: 50, moves: [{ name: 'Bench', setsLogged: 3, setsPrescribed: 3, target: '6 @ 185 lb', best: '185 lb × 6' }] }];
  const hist = text(React.createElement(TR.DtrHistory, { sessions, prDates: new Set() }));
  assert.ok(/83\.9 kg/.test(hist) && !IMPERIAL_RE.test(hist), hist);

  const rec = { goal: { target: 170, now: 176, unit: 'lb' }, streaks: { current: 12 } };
  const tl = text(React.createElement(P.DprMilestoneTimeline, { rec }));
  assert.ok(tl.includes('2.7 kg away') && !IMPERIAL_RE.test(tl), tl);

  const kit = { weekOf: '2026-10-05', checkins: [{ week_of: '2026-09-28', weight: 176, unit: 'lb', ratings: {} }, { week_of: '2026-09-21', weight: 80, unit: 'kg', ratings: {} }] };
  const ch = text(React.createElement(P.DprCheckinHistory, { kit }));
  assert.ok(ch.includes('79.8 kg') && ch.includes('80 kg') && !IMPERIAL_RE.test(ch), ch);

  // The check-in form asks in the member's units and pre-fills a saved week in them.
  const imp = as(IMPERIAL);
  const form = html(React.createElement(P.DprCheckinForm, { kit: { weekOf: '2026-10-05', checkins: [{ week_of: '2026-10-05', weight: 80, unit: 'kg', ratings: {} }] }, units: imp, onSaved() {} }));
  assert.match(form, /Weight \(lb\)/);
  assert.match(form, /value="176"/);
  assert.match(form, /Waist \(in\)|\(in\)/);
  assert.ok(!/\((kg|cm)\)/.test(form), 'no field asks in the other system');
});

test('before the setting is read, the check-in form asks in the unit the week was saved in', async () => {
  const { React, P, D, as, html } = await setup();
  const kit = { weekOf: '2026-10-05', checkins: [{ week_of: '2026-10-05', weight: 80, unit: 'kg', ratings: {} }] };
  const pending = D.dashUnitsApi(null, null);
  const form = html(React.createElement(P.DprCheckinForm, { kit, units: pending, onSaved() {} }));
  assert.match(form, /Weight \(kg\)/);
  assert.match(form, /value="80"/, 'the saved figure, in the unit it was saved in');
  // The page re-keys the form only when the system really changes: an imperial member
  // with nothing saved this week keeps what they are typing when the setting arrives.
  assert.deepEqual(P.dprCheckinUnits(pending, null), { w: 'lb', l: 'in' });
  assert.deepEqual(P.dprCheckinUnits(as(IMPERIAL), null), { w: 'lb', l: 'in' });
  assert.deepEqual(P.dprCheckinUnits(as(METRIC), P.dprCurrentCheckin({ weekOf: 'w', checkins: [{ week_of: 'w', weight: 180, unit: 'lb' }] })), { w: 'kg', l: 'cm' });
  const src = readFileSync(ND('dashProgress.jsx'), 'utf8');
  assert.match(src, /<DprCheckinForm key=\{"u-" \+ dprCheckinUnits\(units, dprCurrentCheckin\(kit\)\)\.w\}/);
});

test('the check-in form sends the unit it asked in', async () => {
  const { React, P, as } = await setup();
  const src = readFileSync(ND('dashProgress.jsx'), 'utf8');
  const body = src.slice(src.indexOf('function DprCheckinForm('), src.indexOf('\nfunction ', src.indexOf('function DprCheckinForm(') + 10));
  assert.match(body, /unit: wUnit, measurements/, 'the weight goes with the unit the field asked in');
  assert.match(body, /value: parseFloat\(v\), unit: lUnit/, 'each girth goes with the length unit the field asked in');
  assert.ok(!/unit: "kg"|unit: "cm"/.test(body), 'no unit is hardcoded in what is sent');
  void React; void P; void as;
});

test('the member’s Progress page, live: bodyweight, strength, PRs, lifts and girths in one system', async () => {
  const { React, P, as } = await setup();
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const payloads = {
    '/api/client/progress': { ok: true, weightSeries: [{ date: day(40), value: 180 }, { date: day(2), value: 176.3 }],
      series: { weight: [{ date: day(40), value: 180 }, { date: day(2), value: 176.3 }], strength: [{ date: day(40), value: 300 }, { date: day(2), value: 320 }] },
      prs: [{ move: 'Back squat', best: 265, bestReps: 5, unit: 'lb', bestAt: day(3) }] },
    '/api/client/checkin-kit': { ok: true, weekOf: day(0), checkins: [], measurements: [{ site: 'waist', value: 34, unit: 'in', measured_on: day(40) }, { site: 'waist', value: 33, unit: 'in', measured_on: day(2) }] },
    '/api/client/progress-photos': { ok: true, photos: [] },
    '/api/client/dashboard': { kpis: { streak: 3 } },
    '/api/client/strength': { ok: true, lifts: [{ name: 'Back squat', currentE1rm: 298, bestE1rm: 298, status: 'progressing', unit: 'lb', topSet: { load: 265, reps: 5 }, series: [{ date: day(40), e1rm: 290 }, { date: day(2), e1rm: 298 }] }] },
  };
  // 180 → 176.3 lb is −3.7 lb, which is −1.7 kg. Converting each reading first gives
  // 81.6 → 80.0, a change of −1.6: the comparison and the trend take the change once.
  for (const [system, other, figures] of [
    [METRIC, IMPERIAL_RE, [/120 kg/, /waist 86\.4 → 83\.8 cm −2\.5 cm/, /−1\.7 kg/, /80 kg · −1\.7 since start|80\.0 kg · −1\.7 since start/]],
    [IMPERIAL, METRIC_RE, [/265 lb/, /waist 34 → 33 in −1 in/, /−3\.7 lb/, /176 lb · −4 since start/]],
  ]) {
    as(system);
    const page = await mount(React, P.ClientProgressPage, payloads);
    for (const f of figures) assert.match(page.text, f, `${system}: ${f} in ${page.text}`);
    assert.ok(!other.test(page.text), `${system}: a figure in the other system — ${page.text.match(other)}`);
    await page.unmount();
  }
});

test('the member dashboard, Train page and Score ledger, as their demo previews', async () => {
  const { React, CL, TR, S, as, text } = await setup();
  for (const [system, other, figures] of [
    [METRIC, IMPERIAL_RE, ['110 kg', 'Squat 111 kg PR', 'Goal weight 1.3 kg away', '6 @ 82.5 kg']],
    [IMPERIAL, METRIC_RE, ['243 lb', 'Squat 245 lb PR', 'Goal weight 2.8 lb away', '6 @ 182 lb']],
  ]) {
    as(system);
    const out = [CL.ClientDashboardPage, TR.ClientWorkoutsPage, S.ClientScorePage].map((Page) => {
      try { return text(React.createElement(Page)); } catch (e) { return 'RENDER FAILED: ' + e.message; }
    }).join(' | ');
    assert.ok(!/RENDER FAILED/.test(out), out.match(/RENDER FAILED: [^|]*/));
    for (const f of figures) assert.ok(out.includes(f), `${system}: "${f}"`);
    assert.ok(!other.test(out), `${system}: ${out.match(other)} in ${out.slice(Math.max(0, out.search(other) - 80), out.search(other) + 40)}`);
  }
});

test('the Score ledger and the Train page’s volume, live', async () => {
  const { React, TR, S, as } = await setup();
  const payloads = {
    '/api/client/score': { points_total: 1284, week_gain: 41, recent: [{ earned_at: new Date().toISOString(), note: 'Squat PR · +5 lb', delta: 32 }] },
    '/api/client/train': { ok: true, stats: { completedCount: 12, thisWeekCount: 2, volume7dLb: 9120, totalVolumeLb: 41000 }, recentSessions: [], assignedWorkouts: [] },
  };
  for (const [system, ledger, vol] of [[METRIC, 'Squat PR · +2.3 kg', /4k kg/], [IMPERIAL, 'Squat PR · +5 lb', /9k lb/]]) {
    as(system);
    const score = await mount(React, S.ClientScorePage, payloads);
    assert.ok(score.text.includes(ledger), `${system}: the ledger reads "${ledger}"`);
    await score.unmount();
    const train = await mount(React, TR.ClientWorkoutsPage, payloads);
    assert.match(train.text, vol, `${system}: the week's volume`);
    await train.unmount();
  }
});

test('the living profile’s own trajectory, lifts and setting', async () => {
  const { LV } = await setup();
  const Um = { T: U, prefs: { weight: 'kg', distance: 'km', length: 'cm' } };
  const wi = [{ weight: 180, unit: 'lb' }, { weight: 178, unit: 'lb' }, { weight: 176, unit: 'lb' }];
  assert.deepEqual(LV.lvTrajectory(wi, Um), { traj: [81.6, 80.7, 79.8], trajDelta: '−1.8 kg' });
  assert.deepEqual(LV.lvTrajectory(wi, null), { traj: [180, 178, 176], trajDelta: '−4 lb' }, 'unread setting: as stored');
  assert.deepEqual(LV.lvLiftsIn([['Back squat', '245 lb'], ['Pull-up', '12']], Um), [['Back squat', '111 kg'], ['Pull-up', '12']]);
  const src = readFileSync(ND('livingProfilePage.jsx'), 'utf8');
  assert.match(src, /out\.lifts = lvLiftsIn\(stats\.lifts, U\)/);
  assert.match(src, /const t = lvTrajectory\(wi, U\);/);
  assert.match(src, /j\("\/api\/client\/profile-stats"\), lvLoadUnits\(\)\]\)/, 'the setting is read beside the stats');
  // The page's own reading of the setting, driven from the source with the module's
  // site path pointed at the file.
  const a = src.indexOf('function lvLoadUnits()'), b = src.indexOf('\n}\n', a) + 2;
  const load = (db) => new Function('window', src.slice(a, b).replace('import("/newdesign/unitText.mjs")', `import(${JSON.stringify(new URL('../public/newdesign/unitText.mjs', import.meta.url).href)})`) + '; return lvLoadUnits();')({ shapeDb: db });
  assert.deepEqual((await load({ getUserGoals: async () => ({ units: METRIC }) })).prefs, { weight: 'kg', distance: 'km', length: 'cm' });
  assert.deepEqual((await load({ getUserGoals: async () => ({ units: IMPERIAL }) })).prefs, { weight: 'lb', distance: 'mi', length: 'in' });
  assert.deepEqual((await load({ getUserGoals: async () => ({ units: 'kg / km' }) })).prefs, { weight: 'kg', distance: 'km', length: 'cm' }, 'the app’s rule');
  const failed = await load({ getUserGoals: async () => { throw new Error('offline'); } });
  assert.deepEqual(failed.prefs, { weight: 'lb', distance: 'mi', length: 'in' }, 'a failed read keeps the converter on the default');
  assert.equal(typeof failed.T.bsSdMeasure, 'function');
});

// Which pages may call `useDashUnits()` at all is `dashboard-remembered-choices`'
// derived guard: every module that calls a dashData export unguarded must be loaded
// only by pages that load dashData.jsx first. It caught `clientScore.jsx`, whose
// ClientScore.html redirect stub does not, so that call is guarded like the shared
// workout card's.
