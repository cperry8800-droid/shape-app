// Coach dashboard step 6a (the owner's coach review, step 6: "The calmer library"): the Programs and
// Meal plans libraries. These mount the SHIPPED pages (dashBuilder.jsx's TrainerProgramsPage and
// dashMealBuilder.jsx's NutritionistPlansPage) in jsdom, with the shared pieces (dashFilterBar.jsx),
// the tier marks (dashToday.jsx), and the real signals, builder, meal, zone and tier modules, and
// read what a coach reads:
//   1. each library's top line (Lift 2): the week's job, "—" while unread, an empty state in words,
//      a roster that could not be read said so ("unread"), and its Review drawer;
//   2. the cards: one primary and a ⋯ for the rest (Edit, Use as template, Update future
//      assignments, Delete through ShapeConfirm), the card opening the builder, no nested buttons;
//   3. who is on a program: tier marks (hollow when unknown) and "No clients yet", the most-used chip;
//   4. the one filter row: search (recipes inside plans too), type with counts, sort;
//   5. the to-do line counting each client once, however many reasons;
//   6. the allergen line naming only the plan's own meals, never a swap;
//   7. sample data only under the band, never on a signed-in coach's page.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const read = (f) => readFileSync(new URL('../public/newdesign/' + f, import.meta.url), 'utf8');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#programs', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
const React = require_('react');
const ReactDOM = require_('react-dom');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const preset = require_('next/dist/compiled/babel/preset-react');
const compile = (src) => babel.transformSync(src, { presets: [preset], babelrc: false, configFile: false }).code;
const DashSignals = require_('../public/newdesign/dashSignals.js');
const ShapeWorkoutDocument = require_('../public/newdesign/workoutDocument.js');
const DashBuilder = require_('../public/newdesign/dashBuilderCore.js');
const DashMeals = require_('../public/newdesign/dashMealCore.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors });

// The page-shell globals these modules read at render, each a pageShell.jsx / dashData.jsx export the
// shells load first, stubbed: what is under test is the two libraries.
const Pass = ({ children }) => React.createElement('main', null, children);
let messaged = [];
Object.assign(globalThis, {
  React, ReactDOM, DashSignals, ShapeWorkoutDocument, DashBuilder, DashMeals,
  ShapeVideoAttachment: () => null, ShapeVideoLink: () => null, ShapeVideoPlayer: () => null, ssAlpha: (c) => c,
  serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', PAPER: '#1a1612', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4',
  useDashUnits: () => null, useDashFocusRefresh: () => {}, useDashPaper: () => {},
  DashPage: Pass, trainerNavItems: () => [], nutriNavItems: () => [], trainerPayoutCard: {}, nutriPayoutCard: {},
  DashWorkoutCard: () => null, DashMealLedgerCard: () => null,
  useRememberedChoices: () => null, useRememberedChoice: (_s, _k, _a, fallback) => React.useState(fallback),
});
const TODAY_NAMES = ['DashPill', 'DashDemoBand', 'dashRouteParam', 'dashClientHref', 'dashClientPageHref', 'dashRecordTier', 'dashTierMark', 'DashTierDot', 'DashClientGem', 'DashClientName', 'DashPeekLink', 'dashPeekClick', 'dashRowKeyOpen', 'dashMessageClient'];
Object.assign(globalThis, new Function(compile(read('dashToday.jsx')) + ';return {' + TODAY_NAMES.join(',') + '};')());
globalThis.dashMessageClient = (name, role, draft, id) => { messaged.push([name, role, id]); };
const KIT = ['DashFilterBar', 'DashFacetMenu', 'DashTagChips', 'DFB_EMPTY', 'dfbRun', 'dfbToggle', 'dfbClearFacet', 'dfbSelected', 'dfbCountLabel', 'dfbPopShift', 'useDfbPopShift',
  'DashLibSort', 'DashLibStatus', 'DashLibMenu', 'DashLibTopLine', 'DashLibDrawer', 'DashLibPeople', 'DashLibCard', 'DASH_LIB_ROSTER_UNREAD', 'dashLibRosterState', 'dashLibWeekEnd', 'dashLibKind'];
Object.assign(globalThis, new Function(compile(read('dashFilterBar.jsx')) + ';return {' + KIT.join(',') + '};')());
Object.assign(globalThis, new Function(compile(read('coachBuilderLayouts.jsx')) + ';return { coachTemplateCopy, CoachBuilderNav, CoachBuilderFooter, COACH_BUILDER_LAYOUTS };')());
const { TrainerProgramsPage } = new Function(compile(read('dashBuilder.jsx')) + ';return { TrainerProgramsPage };')();
const { NutritionistPlansPage } = new Function(compile(read('dashMealBuilder.jsx')) + ';return { NutritionistPlansPage };')();
const UNREAD = DASH_LIB_ROSTER_UNREAD;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const NOW = new Date();
const uid = (i) => String(i).padStart(8, '0') + '-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ready = { state: 'ready', checkedAt: NOW.toISOString() };
const person = (i, name, over = {}) => ({ profile: { id: uid(i), name, isNew: false }, rankPoints: 2240, progressRead: ready, checkIn: null, milestones: null, goal: null, goalPhase: null, ...over });
const leg = (over) => ({ trainer: { name: 'Glute Builder', templateId: 'p1', week: 3, weeks: 8, status: 'active', overdue: false, nextAssigned: null, estimatedEndAt: '2026-12-28T00:00:00.000Z', ...over }, nutritionist: null });
const ROSTER = () => [
  person(1, 'Priya S.', { programs: leg({}) }),                                                                           // ready: week 4 of 8 next
  person(2, 'Tess B.', { rankPoints: null, programs: leg({ name: 'Home Sweat', templateId: 'p2', week: 4, weeks: 4 }) }),   // final week, nothing after
  person(3, 'Jonah W.', { programs: leg({ week: 6, weeks: 6, overdue: true, estimatedEndAt: '2026-11-02T00:00:00.000Z' }) }), // ended
  person(4, 'Sam R.', { programs: leg({ week: 4, weeks: 4, nextAssigned: 'Block 2' }) }),                                // ready: next assigned
  person(5, 'Elena R.', { programs: { trainer: null, nutritionist: null } }),                                           // on no program
  person(6, 'Marcus T.', { progressRead: { state: 'unavailable', checkedAt: null } }),                                  // unread
];
const SAMPLE_NAMES = DashSignals.buildMockClients(NOW).map((c) => c.profile.name);

const row = (name) => ({ id: name, name, sets: 3, reps: '8', loadType: 'kg', load: 0 });
const tpl = (id, name, rows, over = {}) => ({
  id, name, kind: 'program', published: over.published !== false,
  detail: { revision: 1, buildType: over.type || 'program', builder: { version: 1, tags: over.tags, weeks: over.weeks || [{ deload: false, days: [
    { id: id + '-d1', name: 'Day 1', blocks: [{ kind: 'main', rows: rows.map(row) }] }, { id: id + '-d2', name: 'Day 2', blocks: [{ kind: 'main', rows: rows.map(row) }] }] }] } },
});
const LIB = [
  tpl('p1', 'Glute Builder', ['Hip thrust', 'Back squat'], { tags: ['hypertrophy', 'Postnatal'] }),
  tpl('p2', 'Home Sweat', ['Push-up', 'Goblet squat'], { tags: ['cut'] }),
  tpl('p3', 'Quick Mobility', ['Couch stretch'], { type: 'workout', published: false }),
];

let calls = [];
let confirms = [];
function stubFetch({ owner = 'coach-a', plans = LIB, usage = { usage: {}, capped: false }, usageStatus = 200, libraryOk = true, meals = null, deleteOk = true } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET';
    calls.push([u, method, opts.body ? JSON.parse(opts.body) : null]);
    if (u.includes('soundtracks')) return { ok: true, json: async () => ({ soundtracks: [] }) };
    if (u.includes('/api/coach/plans/usage')) return { ok: usageStatus === 200, status: usageStatus, json: async () => usage };
    if (method === 'POST' || method === 'PATCH') { const b = JSON.parse(opts.body); return { ok: true, json: async () => ({ plan: { ...b, id: b.id || 'saved-1', detail: { ...b.detail, revision: 1 } } }) }; }
    if (method === 'DELETE') return { ok: deleteOk, status: deleteOk ? 200 : 500, json: async () => (deleteOk ? { ok: true } : { error: 'Could not delete.' }) };
    if (!libraryOk) return { ok: false, status: 401, json: async () => ({ error: 'Authentication required.' }) };
    if (u.includes('kind=meal_plan')) return { ok: true, json: async () => ({ ownerId: owner, plans: meals || [] }) };
    return { ok: true, json: async () => ({ ownerId: owner, plans }) };
  };
}
function dashboard(source, clients, role = 'trainer') {
  const list = source === 'unread' || source == null ? [] : clients;
  globalThis.useDashboard = () => ({ loading: source == null, clients: list, triage: [], queue: DashSignals.buildProgrammingQueue(list), today: source === 'live' ? { isTrainer: true, isNutritionist: true } : null, source, planCount: undefined });
}
function stubConfirm(answer) {
  confirms = [];
  window.ShapeConfirm = { open: async (opts) => { confirms.push(opts); return answer; } };
  // ⚠ The browser's own confirm is never the gate.
  window.confirm = () => { throw new Error('window.confirm was called'); };
}

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await settle();
}
async function settle() { for (let i = 0; i < 5; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const text = () => document.body.textContent.replace(/\s+/g, ' ');
// An element's words as a reader meets them: each text run once, a space between runs.
const words = (el) => {
  const out = [];
  const walk = document.createTreeWalker(el, 4);
  let n;
  while ((n = walk.nextNode())) { const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.push(s); }
  return out.join(' ');
};
const buttons = (scope = document) => [...scope.querySelectorAll('button')];
const button = (label, scope) => buttons(scope).find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
const click = (el) => React.act(async () => { el.click(); });
const top = () => document.querySelector('.dash-lib-top');
const topText = () => (top() ? words(top()) : '');
const cardOf = (name) => [...document.querySelectorAll('[data-lib-card]')].find((c) => c.querySelector('h2')?.textContent === name);
const cardNames = () => [...document.querySelectorAll('[data-lib-card] h2')].map((h) => h.textContent);
const whoOf = (name) => words(cardOf(name).querySelector('.dash-lib-who'));
const drawer = () => document.querySelector('.dash-lib-drawer');
async function typeInto(input, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function choose(select, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, value);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function openMenu(card) { await click(card.querySelector('.dash-lib-more-btn')); return [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent); }
const menuItem = (label) => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === label);
const noNestedButtons = () => document.querySelectorAll('button button, [role="button"] button').length === 0;

// ── 1. Programs: the week's job ───────────────────────────────────────────────
test('Programs: the top line says who is on a program next week, how many are ready and how many need the coach', async () => {
  dashboard('live', ROSTER()); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  const t = topText();
  assert.equal(t, 'Next week 4 programs due ✓ 2 ready ! 2 need you 1 client’s program couldn’t be read Review');
  assert.equal(top().querySelector('[data-tone="need"]').getAttribute('title'), 'Their program ends with nothing assigned after it', 'a status in words, not a bare colour');
  assert.doesNotMatch(t, /Send/, 'nothing here sends a week: assigning already published it');
  assert.equal(top().getAttribute('aria-label'), 'Next week');
});

test('Programs: Review opens the drawer, the ones that need you first, and Choose a program sets the client', async () => {
  dashboard('live', ROSTER()); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  await click(button('Review', top()));
  const d = drawer();
  assert.ok(!!d, 'the drawer opened');
  assert.equal(d.getAttribute('role'), 'dialog');
  const rows = [...d.querySelectorAll('.dash-lib-row')].map((r) => r.getAttribute('data-next') + ':' + r.querySelector('b').textContent);
  assert.deepEqual(rows, ['need:Jonah W.', 'need:Tess B.', 'ready:Priya S.', 'ready:Sam R.']);
  const dt = d.textContent.replace(/\s+/g, ' ');
  assert.match(dt, /Ended Nov 2 · nothing assigned after it/);
  assert.match(dt, /Final week · nothing assigned after it/);
  assert.match(dt, /Week 4 of 8 is on their calendar/);
  assert.match(dt, /Block 2 is assigned after it/);
  // Tess's tier is unknown: a hollow mark that claims nothing; Priya's is drawn.
  const tess = [...d.querySelectorAll('.dash-lib-row')].find((r) => /Tess B\./.test(r.textContent));
  assert.equal(!!tess.querySelector('[data-tier-unknown]'), true);
  const priya = [...d.querySelectorAll('.dash-lib-row')].find((r) => /Priya S\./.test(r.textContent));
  assert.equal(!!priya.querySelector('.sh-tier-mark[data-tier]'), true);
  await click(button('Choose a program', tess));
  assert.equal(!!drawer(), false, 'choosing closes the drawer');
  assert.match(text(), /Choose a program for Tess B\. The assignment will have this client selected\./, 'a name ending in an initial closes the sentence');
  await click(button('Not now'));
  assert.doesNotMatch(text(), /Choose a program for Tess B\./);
});

test('Programs: Escape closes the drawer', async () => {
  dashboard('live', ROSTER()); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  await click(button('Review', top()));
  await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(!!drawer(), false);
});

test('Programs: unread is "—", loading is "—", and empty is said in words', async () => {
  dashboard(null, []); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(topText(), 'Next week — programs due Reading your roster…');
  dashboard('unread', ROSTER()); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(topText(), 'Next week — programs due ' + UNREAD);
  // A roster still loading its overviews: "—", and how many are still loading.
  dashboard('live', ROSTER().map((c) => ({ ...c, progressRead: { state: 'loading' } }))); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(topText(), 'Next week — programs due 6 clients are still loading Review');
  // Read, and nobody on a program: a measured 0, said in words.
  dashboard('live', [person(5, 'Elena R.', { programs: { trainer: null, nutritionist: null } })]); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(topText(), 'Next week 0 programs due None of your clients is on one of your programs. Review');
  dashboard('live', []); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.match(topText(), /No clients on your roster yet\./);
  assert.equal(button('Review', top()).disabled, true, 'nothing to review');
});

// ── 2. Programs: the cards ────────────────────────────────────────────────────
test('Programs: every card has one primary, Assign, and the rest in its ⋯', async () => {
  dashboard('live', ROSTER()); stubFetch({ usage: { usage: {}, capped: false } }); stubConfirm(false);
  await mount(React.createElement(TrainerProgramsPage));
  assert.deepEqual(cardNames(), ['Glute Builder', 'Home Sweat', 'Quick Mobility']);
  for (const name of cardNames()) {
    const actions = cardOf(name).querySelector('.dash-lib-actions');
    assert.deepEqual(buttons(actions).filter((b) => !b.classList.contains('dash-lib-more-btn')).map((b) => b.textContent), ['Assign'], name);
  }
  assert.ok(noNestedButtons(), 'a button inside a button');
  const glute = cardOf('Glute Builder');
  assert.equal(glute.querySelector('.dash-lib-more-btn').getAttribute('aria-label'), 'More for Glute Builder');
  assert.deepEqual(await openMenu(glute), ['Edit', 'Use as template', 'Update future assignments', 'Delete']);
  assert.ok(document.activeElement === menuItem('Edit'), 'the keyboard lands on the first item');
  await React.act(async () => { document.querySelector('[role="menu"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  assert.ok(document.activeElement === menuItem('Use as template'));
  await React.act(async () => { document.querySelector('[role="menu"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(!!document.querySelector('[role="menu"]'), false);
  assert.ok(document.activeElement === glute.querySelector('.dash-lib-more-btn'), 'Escape hands focus back');
  // The cover is the program's goal in its colour, and in words.
  assert.equal(glute.querySelector('.dash-lib-kind').textContent, 'Hypertrophy');
  assert.equal(cardOf('Home Sweat').querySelector('.dash-lib-cover').hasAttribute('data-kind-tone'), true, 'Cut takes the plan type colour');
  assert.equal(cardOf('Quick Mobility').querySelector('.dash-lib-kind').textContent, 'Single day');
  assert.match(cardOf('Quick Mobility').textContent, /Draft/);
  assert.match(glute.textContent, /Program · 1 week · 2 days a week/);
  assert.match(cardOf('Quick Mobility').textContent, /Single day · 2 moves/);
  assert.match(glute.textContent, /Postnatal/);
});

test('Programs: the ⋯ actions open the builder, a copy, and the future update; a click on the card opens the builder', async () => {
  dashboard('live', ROSTER()); stubFetch(); stubConfirm(false);
  await mount(React.createElement(TrainerProgramsPage));
  await openMenu(cardOf('Glute Builder'));
  await click(menuItem('Edit'));
  assert.ok(button('← Library'), 'Edit opened the builder');
  assert.equal(document.querySelector('[aria-label="Workout or program name"]').value, 'Glute Builder');
  await click(button('← Library'));
  await settle();
  await openMenu(cardOf('Glute Builder'));
  await click(menuItem('Use as template'));
  assert.equal(document.querySelector('[aria-label="Workout or program name"]').value, 'Glute Builder (copy)');
  await click(button('← Library'));
  await settle();
  await openMenu(cardOf('Home Sweat'));
  await click(menuItem('Update future assignments'));
  assert.match(text(), /Update future workouts/);
  await click(button('Close'));
  // The card itself: a click on its body opens the builder; its own buttons do their own thing.
  await click(cardOf('Home Sweat').querySelector('.dash-lib-meta'));
  assert.equal(document.querySelector('[aria-label="Workout or program name"]').value, 'Home Sweat');
  await click(button('← Library'));
  await settle();
  await click(button('Assign', cardOf('Home Sweat')));
  assert.match(text(), /Put clients on it\./);
  assert.ok(!button('← Library'), 'Assign is not a click on the card');
});

test('Programs: Delete goes through ShapeConfirm and the plans route, and a No deletes nothing', async () => {
  dashboard('live', ROSTER()); stubFetch({ usage: { usage: { p1: { clients: 2, clientIds: [uid(1), uid(4)] } }, capped: false } }); stubConfirm(false);
  await mount(React.createElement(TrainerProgramsPage));
  await openMenu(cardOf('Glute Builder'));
  await click(menuItem('Delete'));
  await settle();
  assert.equal(confirms.length, 1);
  assert.deepEqual([confirms[0].title, confirms[0].name, confirms[0].confirmLabel], ['Delete this program?', 'Glute Builder', 'Delete program']);
  assert.match(confirms[0].message, /The 2 clients on it keep every session already on their calendar\./);
  assert.ok(!calls.some(([, m]) => m === 'DELETE'), 'a No deletes nothing');
  assert.ok(!!cardOf('Glute Builder'));
  stubConfirm(true);
  await openMenu(cardOf('Glute Builder'));
  await click(menuItem('Delete'));
  await settle();
  const del = calls.find(([, m]) => m === 'DELETE');
  assert.deepEqual([del[0], del[2]], ['/api/coach/plans', { id: 'p1' }]);
  assert.equal(!!cardOf('Glute Builder'), false);
  assert.match(text(), /Glute Builder is deleted\./);
});

test('Programs: a failed delete keeps the card and says why', async () => {
  dashboard('live', ROSTER()); stubFetch({ deleteOk: false }); stubConfirm(true);
  await mount(React.createElement(TrainerProgramsPage));
  await openMenu(cardOf('Home Sweat'));
  await click(menuItem('Delete'));
  await settle();
  assert.ok(!!cardOf('Home Sweat'));
  assert.match(text(), /Could not delete\./);
});

// ── 3. Programs: who is on it ─────────────────────────────────────────────────
test('Programs: who is on a program, as tier marks and names; nobody is "No clients yet"', async () => {
  // uid(9) is on Glute Builder's calendar and not on the roster: counted, never dropped.
  dashboard('live', ROSTER()); stubFetch({ usage: { usage: { p1: { clients: 3, clientIds: [uid(1), uid(2), uid(9)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  const who = cardOf('Glute Builder').querySelector('.dash-lib-who');
  assert.equal(words(who), 'On it Priya S. Tess B. +1 more');
  assert.equal(who.querySelectorAll('.sh-tier-mark[data-tier]').length, 1, 'Priya\'s tier is drawn');
  assert.equal(who.querySelectorAll('[data-tier-unknown]').length, 1, 'Tess\'s unknown tier is hollow');
  assert.equal(whoOf('Home Sweat'), 'On it No clients yet');
  // The most-used program gets a chip, not a bigger card.
  assert.match(cardOf('Glute Builder').querySelector('.dash-lib-cover').textContent, /Most used · 3 clients/);
  assert.equal(document.querySelectorAll('[data-most]').length, 1);
});

test('Programs: a tie, a single client or a capped read names no most-used program', async () => {
  dashboard('live', ROSTER()); stubFetch({ usage: { usage: { p1: { clients: 2, clientIds: [uid(1), uid(4)] }, p2: { clients: 2, clientIds: [uid(2), uid(3)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(document.querySelectorAll('[data-most]').length, 0, 'a tie');
  stubFetch({ usage: { usage: { p1: { clients: 1, clientIds: [uid(1)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(document.querySelectorAll('[data-most]').length, 0, 'one client is not "most used"');
  stubFetch({ usage: { usage: { p1: { clients: 5, clientIds: [uid(1)] } }, capped: true } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(document.querySelectorAll('[data-most]').length, 0, 'a capped read under-counts, so it cannot rank');
  assert.equal(whoOf('Glute Builder'), 'On it Priya S. +4 more · not every calendar was read');
  assert.equal(whoOf('Home Sweat'), 'On it None found on the calendars read', 'a capped read never says "No clients yet"');
});

test('Programs: who is on it while unread says so, never nobody', async () => {
  dashboard('live', ROSTER()); stubFetch({ usageStatus: 500, usage: { error: 'x' } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(whoOf('Glute Builder'), 'On it Couldn’t read who’s on it');
  // The usage answered and the roster did not: the count stands, the names wait for the roster.
  dashboard('unread', ROSTER()); stubFetch({ usage: { usage: { p1: { clients: 2, clientIds: [uid(1), uid(4)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(whoOf('Glute Builder'), 'On it 2 clients · ' + UNREAD);
  assert.equal(whoOf('Home Sweat'), 'On it No clients yet');
});

test('Programs: the programs on one client\'s calendar are a plain list, the ones that need you first', async () => {
  dashboard('live', ROSTER());
  stubFetch({ usage: { usage: { p1: { clients: 1, clientIds: [uid(1)] }, p2: { clients: 1, clientIds: [uid(2)] }, p3: { clients: 1, clientIds: [uid(4)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  const list = document.querySelector('[aria-label="On one client only"]');
  assert.ok(!!list);
  const rows = [...list.querySelectorAll('.dash-lib-row')].map(words);
  assert.deepEqual(rows, [
    'Home Sweat Tess B. · Week 4 of 4 ! Needs you Final week · nothing assigned after it',
    // Sam's current program is Glute Builder (with Block 2 after it): his week is not this one's.
    'Quick Mobility Sam R. Not their current program',
    'Glute Builder Priya S. · Week 3 of 8 ✓ Ready Week 4 of 8 is on their calendar',
  ]);
  await click(button('Quick Mobility', list));
  assert.ok(button('← Library'), 'a row opens its program');
});

// ── 4. Programs: one filter row ───────────────────────────────────────────────
test('Programs: one row holds search, type, goal and sort; the rest wait behind More filters', async () => {
  dashboard('live', ROSTER()); stubFetch({ usage: { usage: { p2: { clients: 2, clientIds: [uid(2), uid(3)] }, p1: { clients: 1, clientIds: [uid(1)] } }, capped: false } });
  await mount(React.createElement(TrainerProgramsPage));
  const bar = document.querySelector('.dash-filterbar');
  const chips = [...bar.querySelectorAll(':scope > .dash-facet .dash-chip-main')].map((b) => b.textContent.replace('▾', ''));
  assert.deepEqual(chips, ['Type', 'Tags']);
  assert.ok(!!bar.querySelector(':scope > .dash-lib-sort select'), 'the sort is in the row');
  assert.ok(!document.querySelector('.dash-chiprow'), 'no second row of chips');
  assert.ok(!!button('More filters▾'));
  const sort = bar.querySelector('select');
  await choose(sort, 'name');
  assert.deepEqual(cardNames(), ['Glute Builder', 'Home Sweat', 'Quick Mobility']);
  await choose(sort, 'used');
  assert.deepEqual(cardNames(), ['Home Sweat', 'Glute Builder', 'Quick Mobility']);
  await typeInto(bar.querySelector('input[type="search"]'), 'home');
  assert.deepEqual(cardNames(), ['Home Sweat']);
});

test('Programs: Most used cannot be chosen before the usage is read', async () => {
  dashboard('live', ROSTER()); stubFetch({ usageStatus: 500, usage: { error: 'x' } });
  await mount(React.createElement(TrainerProgramsPage));
  const used = [...document.querySelectorAll('.dash-lib-sort option')].find((o) => o.value === 'used');
  assert.equal(used.disabled, true);
});

// ── 7. Programs: sample data only under the band ──────────────────────────────
test('Programs: the preview shows its sample under the band; a signed-in coach never sees it', async () => {
  dashboard('demo', DashSignals.buildMockClients(NOW)); stubFetch({ libraryOk: false });
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(!!document.querySelector('.dash-demo-band'), 'the band');
  assert.equal(topText(), 'Next week 10 programs due ✓ 10 ready Review');
  assert.ok(!!cardOf('Strength Block 3'), 'the preview\'s programs');
  assert.equal(whoOf('Strength Block 3'), 'On it Preview · no client calendars to read');
  assert.ok(!calls.some(([u]) => u.includes('/usage')), 'no account, no read');
  assert.deepEqual(await openMenu(cardOf('Strength Block 3')), ['Edit', 'Use as template'], 'an example is not the visitor\'s to delete or update');
  // A signed-in coach whose roster came back as the demo: the library is theirs, the roster unread.
  dashboard('demo', DashSignals.buildMockClients(NOW)); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(!document.querySelector('.dash-demo-band'));
  assert.equal(topText(), 'Next week — programs due ' + UNREAD);
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), 'a sample person on a signed-in page: ' + n);
  assert.ok(!cardOf('Strength Block 3'), 'no sample program');
  // The roster useDashboard handed over is the sample cast: the assign sheet must not list it.
  await click(button('Assign', cardOf('Glute Builder')));
  assert.match(text(), /No clients loaded\./, 'the assign sheet names nobody from the sample cast');
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), 'a sample person in the assign sheet: ' + n);
  // And "unread" itself: no band, no sample.
  dashboard('unread', DashSignals.buildMockClients(NOW)); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(!document.querySelector('.dash-demo-band'));
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), n);
  await click(button('Assign', cardOf('Glute Builder')));
  assert.match(text(), /No clients loaded\./, 'the assign sheet lists nobody it could not read');
});

test('Programs: who is on it counts an id the roster does not hold, and never drops one', () => {
  const who = DashBuilder.programWho({ clients: 1, clientIds: [uid(1), uid(9), uid(1)] }, ROSTER());
  assert.deepEqual([who.count, who.people.map((p) => p.name), who.elsewhere], [2, ['Priya S.'], 1]);
  assert.deepEqual(DashBuilder.programWho({ clients: 4 }, ROSTER()), { count: 4, people: null, elsewhere: 0 }, 'an older server: how many, not who');
});

test('Programs: before the library answers, a roster that came back as the demo shows no band and no sample', async () => {
  dashboard('demo', DashSignals.buildMockClients(NOW));
  globalThis.fetch = (url) => (String(url).includes('kind=program') ? new Promise(() => {}) : Promise.resolve({ ok: true, json: async () => ({ soundtracks: [] }) }));
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(!document.querySelector('.dash-demo-band'), 'not yet known to be the preview');
  assert.equal(topText(), 'Next week — programs due Reading your roster…');
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), n);
});

// ── Meal plans ────────────────────────────────────────────────────────────────
const mealPlan = (id, name, phase, slots, over = {}) => {
  const doc = { ...DashMeals.newPlan(name, phase), ...over };
  doc.days = [{ ...DashMeals.newDay('Day A'), slots: slots.map(([fid, swaps = []]) => {
    const m = DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === fid), 'Lunch');
    for (const s of swaps) { const f = DashMeals.FOODS.find((x) => x.id === s); m.swaps.push({ name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f }); }
    return m;
  }) }];
  return { id, name, kind: 'meal_plan', published: true, detail: { mealBuilder: doc } };
};
const MEALS = [
  // Lean Week's own meals hold no allergen Shape checks; one approved swap is shrimp tacos.
  mealPlan('m1', 'Lean Week', 'cut', [['f5', ['f10']], ['f8']], { targets: { kcal: 1700, p: 160, c: 150, f: 50 } }),
  mealPlan('m2', 'Bulk Base', 'build', [['f18'], ['f6']], { targets: { kcal: 2900, p: 180, c: 350, f: 90 } }),
  mealPlan('m3', 'Steady Maintain', 'maintain', [['f10']], { targets: { kcal: 2300, p: 160, c: 250, f: 75 } }),
];
const mondayKey = (() => { const m = DashSignals._internals.mondayOf(NOW); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0'); })();
const HALF = [{ key: 'm50', kind: 'goal', label: '50% to goal', hitAt: NOW.toISOString() }];
const NUTRI = () => [
  person(1, 'Priya S.', { checkIn: { lastWeekOf: mondayKey }, milestones: HALF, goalPhase: 'Cut' }),    // two reasons, one row
  person(2, 'Tess B.', { rankPoints: null, checkIn: { lastWeekOf: mondayKey }, goalPhase: 'maintain' }), // checked in
  person(3, 'Jonah W.', { checkIn: { lastWeekOf: '2026-01-05' }, milestones: HALF, goalPhase: 'Race' }), // phase, no plan of its type
  person(4, 'Sam R.', { checkIn: { lastWeekOf: '2026-01-05' } }),                                        // nothing due
  person(5, 'Nadia P.', { profile: { id: uid(5), name: 'Nadia P.', isNew: true } }),                     // intake
  person(6, 'Marcus T.', { progressRead: { state: 'unavailable', checkedAt: null } }),                   // unread
];
const mealCard = cardOf;

test('Meal plans: the to-do line counts each client once, names a plan in their phase, and says why', async () => {
  dashboard('live', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  const t = topText();
  // Priya is expiring AND ready for a phase change: one entry, both reasons.
  assert.equal(t, 'Plans due this week 3 need a new plan by ' + dashLibWeekEnd()
    + ' Priya S. → Lean Week Checked in this week · Near their goal · time for the next phase'
    + ' Tess B. → Steady Maintain Checked in this week'
    + ' Jonah W. → no plan in their phase yet Near their goal · time for the next phase'
    + ' 1 client’s check-ins couldn’t be read · 1 client is waiting on their first check-in Assign all 2 Review');
  assert.equal((t.match(/Priya S\./g) || []).length, 1, 'counted once');
  assert.doesNotMatch(text(), /Plan lifecycle|Write plan/);
  assert.ok(!!button('Assign all 2', top()), 'only the clients with a plan named');
});

test('Meal plans: the core counts a client once however many reasons, and keeps the reasons', () => {
  const clients = NUTRI();
  const lc = DashMeals.buildPlanLifecycle(clients.filter((c) => c.progressRead.state === 'ready'), DashSignals.buildProgrammingQueue(clients));
  assert.ok(lc.expiring.some((c) => c.profile.name === 'Priya S.') && lc.phaseChange.some((c) => c.profile.name === 'Priya S.'), 'the fixture puts Priya in both');
  const todo = DashMeals.planTodo(clients, DashSignals.buildProgrammingQueue(clients), MEALS);
  assert.deepEqual(todo.rows.map((r) => r.name + ':' + r.reasons.join('+') + ':' + (r.suggestion ? r.suggestion.name : '-')),
    ['Priya S.:checked-in+phase:Lean Week', 'Tess B.:checked-in:Steady Maintain', 'Jonah W.:phase:-']);
  assert.deepEqual([todo.intake.map((r) => r.name), todo.assignable, todo.unread, todo.pending, todo.total], [['Nadia P.'], 2, 1, 0, 6]);
});

test('Meal plans: Assign all opens each client\'s own sheet in turn, preselected', async () => {
  dashboard('live', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  await click(button('Assign all 2', top()));
  assert.match(text(), /Assign · Lean Week/);
  const checked = () => [...document.querySelectorAll('input[type="checkbox"]')].filter((i) => i.checked).map((i) => i.closest('label').querySelector('span').textContent);
  assert.deepEqual(checked(), ['Priya S.']);
  await click(button('Cancel'));
  assert.match(text(), /Assign all · 1 of 2 opened\. Next: Tess B\. → Steady Maintain/);
  await click(button('Open'));
  assert.match(text(), /Assign · Steady Maintain/);
  await click(button('Cancel'));
  assert.doesNotMatch(text(), /Assign all · /, 'the walk ends after the last');
});

test('Meal plans: Review lists each client with every reason, Assign, and intake with Message', async () => {
  messaged = [];
  dashboard('live', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  await click(button('Review', top()));
  const d = drawer();
  const rows = [...d.querySelectorAll('.dash-lib-row')];
  assert.deepEqual(rows.map((r) => r.querySelector('b').textContent), ['Priya S.', 'Tess B.', 'Jonah W.', 'Nadia P.']);
  assert.deepEqual([...rows[0].querySelectorAll('.dash-lib-status')].map((s) => s.textContent), ['! Checked in this week', '! Near their goal · time for the next phase']);
  await click(button('Message', rows[3]));
  assert.deepEqual(messaged, [['Nadia P.', 'nutritionist', uid(5)]]);
  await click(button('Choose a plan', rows[2]));
  assert.match(text(), /Choose a plan for Jonah W\./);
  await click(button('Review', top()));
  await click(button('Assign', drawer().querySelectorAll('.dash-lib-row')[1]));
  assert.match(text(), /Assign · Steady Maintain/);
});

test('Meal plans: unread is "—", and empty is said in words', async () => {
  dashboard('unread', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  assert.equal(topText(), 'Plans due this week — need a new plan by ' + dashLibWeekEnd() + ' ' + UNREAD);
  assert.ok(!!mealCard('Lean Week'), 'the library is its own read, and it worked');
  dashboard(null, [], 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  assert.equal(topText(), 'Plans due this week — need a new plan by ' + dashLibWeekEnd() + ' Reading your roster…');
  dashboard('live', [person(4, 'Sam R.', { checkIn: { lastWeekOf: '2026-01-05' } })], 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  assert.equal(topText(), 'Plans due this week 0 need a new plan by ' + dashLibWeekEnd() + ' Nobody needs a new plan this week. Review');
  assert.ok(!button('Assign all 0'));
  dashboard('live', NUTRI().map((c) => ({ ...c, progressRead: { state: 'loading' } })), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  assert.equal(topText(), 'Plans due this week — need a new plan by ' + dashLibWeekEnd() + ' 6 clients are still loading Review');
});

test('Meal plans: one action per card, Edit and Use as template in the ⋯, Delete through ShapeConfirm', async () => {
  dashboard('live', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS }); stubConfirm(false);
  await mount(React.createElement(NutritionistPlansPage));
  for (const name of ['Lean Week', 'Bulk Base', 'Steady Maintain']) {
    const actions = mealCard(name).querySelector('.dash-lib-actions');
    assert.deepEqual(buttons(actions).filter((b) => !b.classList.contains('dash-lib-more-btn')).map((b) => b.textContent), ['Assign'], name);
  }
  assert.ok(noNestedButtons());
  const lean = mealCard('Lean Week');
  assert.equal(lean.querySelector('.dash-lib-kind').textContent, 'Cut');
  assert.equal(lean.querySelector('.dash-lib-cover').style.getPropertyValue('--lib-cl'), ShapeClientColors.PROGRAM_TYPES.cut.light, 'Cut\'s own colour');
  assert.match(lean.textContent, /1-day rotation · 1700 kcal · 160 g protein/);
  assert.deepEqual(await openMenu(lean), ['Edit', 'Use as template', 'Delete']);
  await click(menuItem('Delete'));
  await settle();
  assert.deepEqual([confirms[0].title, confirms[0].name, confirms[0].confirmLabel], ['Delete this meal plan?', 'Lean Week', 'Delete plan']);
  assert.ok(!calls.some(([, m]) => m === 'DELETE'));
  stubConfirm(true);
  await openMenu(mealCard('Lean Week'));
  await click(menuItem('Delete'));
  await settle();
  const del = calls.find(([, m]) => m === 'DELETE');
  assert.deepEqual([del[0], del[2]], ['/api/coach/plans', { id: 'm1' }]);
  assert.equal(!!mealCard('Lean Week'), false);
  // Edit, the copy, and the card itself all open the builder.
  await openMenu(mealCard('Bulk Base'));
  await click(menuItem('Use as template'));
  assert.ok(button('← Library'));
  assert.match(text(), /Based on Bulk Base\. You’re editing a new copy/);
  await click(button('← Library'));
  await settle();
  await click(mealCard('Bulk Base').querySelector('.dash-lib-facts'));
  assert.ok(button('← Library'), 'a click on the card opens the builder');
  await click(button('← Library'));
  await settle();
  await openMenu(mealCard('Steady Maintain'));
  await click(menuItem('Edit'));
  assert.ok(button('← Library'));
});

test('Meal plans: the allergen line names only the plan\'s own meals, never a swap', async () => {
  dashboard('live', [], 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  const lean = mealCard('Lean Week').querySelector('.dash-lib-facts').textContent;
  assert.match(lean, new RegExp('^None of the ' + DashMeals.ALLERGENS.length + ' allergens Shape checks'));
  assert.doesNotMatch(lean, /shellfish/, 'the swap\'s shrimp is not the plan\'s');
  assert.match(mealCard('Steady Maintain').querySelector('.dash-lib-facts').textContent, /^Contains gluten, shellfish/, 'a planned meal\'s allergens are named');
  // The Diet filter still holds "free of" to every meal a client can be served, swaps included.
  await click(button('More filters▾'));
  await click(button('Diet▾'));
  const opt = [...document.querySelectorAll('.dash-facet-opt')].find((l) => l.querySelector('.dash-facet-l').textContent === 'No shellfish');
  assert.equal(opt.querySelector('.dash-facet-n').textContent, '1', 'only Bulk Base is free of shellfish with its alternates');
  // The core, directly.
  const plan = MEALS[0].detail.mealBuilder;
  assert.deepEqual(DashMeals.planOwnDiet(plan).contains, []);
  assert.ok(DashMeals.planDiet(plan).contains.includes('shellfish'));
});

test('Meal plans: one row — a search that finds recipes inside plans, a type control with counts, and sort', async () => {
  dashboard('live', [], 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  const bar = document.querySelector('.dash-filterbar');
  assert.deepEqual([...bar.querySelectorAll(':scope > .dash-facet .dash-chip-main')].map((b) => b.textContent.replace('▾', '')), ['Type']);
  assert.ok(!document.querySelector('.dash-chiprow'), 'no row of phase chips');
  await click(button('Type▾'));
  const counts = [...document.querySelectorAll('.dash-facet-opt')].map((l) => l.querySelector('.dash-facet-l').textContent + ' ' + l.querySelector('.dash-facet-n').textContent);
  assert.deepEqual(counts, ['Cut 1', 'Maintain 1', 'Build 1']);
  await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  const search = bar.querySelector('input[type="search"]');
  assert.equal(search.getAttribute('aria-label'), 'Find a plan by its name or a recipe in it');
  await typeInto(search, 'salmon');
  assert.deepEqual(cardNames(), ['Bulk Base'], 'a recipe inside a plan');
  await typeInto(search, 'shrimp');
  assert.deepEqual(cardNames().sort(), ['Lean Week', 'Steady Maintain'], 'an approved alternate is a recipe in the plan too');
  await typeInto(search, '');
  await choose(bar.querySelector('select'), 'kcal');
  assert.deepEqual(cardNames(), ['Lean Week', 'Steady Maintain', 'Bulk Base']);
  await choose(bar.querySelector('select'), 'name');
  assert.deepEqual(cardNames(), ['Bulk Base', 'Lean Week', 'Steady Maintain']);
});

test('Meal plans: no plan claims who is on it — the assignment stores no plan id to read', async () => {
  dashboard('live', NUTRI(), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  for (const name of ['Lean Week', 'Bulk Base']) {
    assert.ok(!mealCard(name).querySelector('.dash-lib-who'), name);
    assert.doesNotMatch(mealCard(name).textContent, /No clients yet/);
  }
});

test('Meal plans: the preview shows its sample under the band; a signed-in nutritionist never sees it', async () => {
  dashboard('demo', DashSignals.buildMockClients(NOW), 'nutritionist'); stubFetch({ libraryOk: false });
  await mount(React.createElement(NutritionistPlansPage));
  assert.ok(!!document.querySelector('.dash-demo-band'), 'the band');
  assert.ok(!!mealCard('Summer Cut · 1900'));
  assert.match(topText(), /^Plans due this week 9 need a new plan by /);
  dashboard('demo', DashSignals.buildMockClients(NOW), 'nutritionist'); stubFetch({ meals: MEALS });
  await mount(React.createElement(NutritionistPlansPage));
  assert.ok(!document.querySelector('.dash-demo-band'));
  assert.equal(topText(), 'Plans due this week — need a new plan by ' + dashLibWeekEnd() + ' ' + UNREAD);
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), 'a sample person on a signed-in page: ' + n);
  assert.ok(!mealCard('Summer Cut · 1900'));
  await click(button('Assign', mealCard('Lean Week')));
  assert.match(text(), /No clients loaded\./);
});

test('Meal plans: before the library answers, a roster that came back as the demo shows no band and no sample; an example is not the visitor\'s to delete', async () => {
  dashboard('demo', DashSignals.buildMockClients(NOW), 'nutritionist');
  globalThis.fetch = () => new Promise(() => {});
  await mount(React.createElement(NutritionistPlansPage));
  assert.ok(!document.querySelector('.dash-demo-band'));
  assert.equal(topText(), 'Plans due this week — need a new plan by ' + dashLibWeekEnd() + ' Reading your roster…');
  for (const n of SAMPLE_NAMES) assert.ok(!text().includes(n), n);
  dashboard('demo', DashSignals.buildMockClients(NOW), 'nutritionist'); stubFetch({ libraryOk: false }); stubConfirm(true);
  await mount(React.createElement(NutritionistPlansPage));
  assert.deepEqual(await openMenu(mealCard('Summer Cut · 1900')), ['Edit', 'Use as template']);
});

test('the week ends on Sunday, on the account\'s clock', () => {
  // Monday 9 November 2026, noon UTC: the week ends Sunday the 15th.
  assert.equal(dashLibWeekEnd(Date.UTC(2026, 10, 9, 12)), 'Sun · Nov 15');
  assert.equal(dashLibWeekEnd(Date.UTC(2026, 10, 15, 12)), 'Sun · Nov 15', 'on Sunday it is today');
});

test('the roster state: a signed-in library never reads as the preview', () => {
  assert.deepEqual([dashLibRosterState('live', true), dashLibRosterState('demo', false), dashLibRosterState('demo', true), dashLibRosterState('unread', false), dashLibRosterState(null, false)],
    ['live', 'demo', 'unread', 'unread', 'loading']);
});

test.after(async () => { if (root) await React.act(async () => root.unmount()); });
