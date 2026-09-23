// The coach libraries' filters, rendered: the shared bar and chip row, the workout
// library's tags, "In use" states and cards, the meal library's honest states, and the
// builder's tag picker. The REAL modules under jsdom + React 18. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); globalThis.React = React;
Object.assign(globalThis, await loadRealModule(fileURLToPath(new URL('../public/newdesign/coachBuilderLayouts.jsx', import.meta.url)), {appendExports:'export {COACH_BUILDER_LAYOUTS, CoachBuilderNav, CoachBuilderFooter, coachTemplateCopy};'}));
const { createRoot } = require('react-dom/client'); globalThis.ReactDOM = require('react-dom');
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.DashMeals = require('../public/newdesign/dashMealCore.js');
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashMealLedgerCard = () => null;
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live, doc: {}, accountId: null });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
globalThis.DashPage = ({ children }) => React.createElement('main', null, children);
globalThis.DashDemoBand = () => React.createElement('p', null, 'Demo band');
globalThis.trainerNavItems = () => []; globalThis.nutriNavItems = () => [];
globalThis.trainerPayoutCard = {}; globalThis.nutriPayoutCard = {};
globalThis.dashMoney = (c) => '$' + c; globalThis.dashQueueDone = () => false; globalThis.dashMessageClient = () => {};
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'),
  { appendExports: 'export { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift };' }));
const { TrainerProgramsPage, DbuTagPicker } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { TrainerProgramsPage, DbuTagPicker };' });
const { NutritionistPlansPage } = await loadRealModule(nd('dashMealBuilder.jsx'), { appendExports: 'export { NutritionistPlansPage };' });

// ── helpers ─────────────────────────────────────────────────────────────────
let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await settle();
}
async function settle() { for (let i = 0; i < 4; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const text = () => document.body.textContent;
const buttons = () => [...document.querySelectorAll('button')];
const button = (label) => buttons().find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
const buttonStarting = (label) => buttons().find((b) => b.textContent.trim().startsWith(label));
const click = (el) => React.act(async () => { el.click(); });
async function typeInto(input, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const option = (label) => [...document.querySelectorAll('.dash-facet-opt')].find((l) => l.querySelector('.dash-facet-l')?.textContent === label);
const count = () => document.querySelector('.dash-filter-count')?.textContent;
const chip = (label) => [...document.querySelectorAll('.dash-chiprow .dash-chip')].find((b) => b.firstChild?.textContent === label);

// ── The bar and the chip row ────────────────────────────────────────────────
const ITEMS = [
  { id: 'a', search: 'lower power', keys: { kit: ['home'], focus: ['lower'] } },
  { id: 'b', search: 'upper day', keys: { kit: ['barbell'], focus: ['upper'] } },
  { id: 'c', search: 'full body', keys: { kit: ['home', 'barbell'], focus: ['lower', 'upper'] } },
  { id: 'd', search: 'mobility', keys: { kit: [], focus: ['mobility'] } },
];
const FACETS = [
  { key: 'kit', label: 'Kit', help: 'What the moves need.', options: [{ key: 'home', label: 'Home' }, { key: 'barbell', label: 'Barbell' }] },
  { key: 'focus', label: 'Focus', options: [{ key: 'lower', label: 'Lower', c: '#c0533b' }, { key: 'upper', label: 'Upper', c: '#8a5cf6' }, { key: 'mobility', label: 'Mobility', c: '#5ec8e0' }] },
];
function Harness() {
  const [state, setState] = React.useState(DFB_EMPTY);
  const run = dfbRun(ITEMS, FACETS, state);
  return React.createElement(React.Fragment, null,
    React.createElement(DashFilterBar, { facets: FACETS.slice(0, 1), run, state, setState, one: 'program', many: 'programs', placeholder: 'Find…' }),
    React.createElement(DashTagChips, { facet: FACETS[1], run, onToggle: (k) => setState((s) => dfbToggle(s, 'focus', k)), onClear: () => setState((s) => dfbClearFacet(s, 'focus')) }),
    React.createElement('ol', { id: 'out' }, run.shown.map((it) => React.createElement('li', { key: it.id }, it.id))));
}
const shown = () => [...document.querySelectorAll('#out li')].map((l) => l.textContent).join('');

test('a filter opens its options, each saying what it would leave', async () => {
  await mount(React.createElement(Harness));
  assert.equal(count(), '4 programs');
  const kit = button('Kit▾');
  assert.equal(kit.getAttribute('aria-expanded'), 'false');
  await click(kit);
  assert.equal(kit.getAttribute('aria-expanded'), 'true');
  const pop = document.querySelector('.dash-facet-pop');
  assert.ok(pop && !pop.closest('.dash-chip'), 'the panel is OUTSIDE the clipped chip, or the clip cuts it off');
  assert.equal(kit.getAttribute('aria-controls'), pop.id);
  assert.match(pop.textContent, /What the moves need\./);
  assert.equal(option('Home').querySelector('.dash-facet-n').textContent, '2');
  // ⚠ A BOOLEAN, NOT THE NODE: a failing assert.equal on two elements formats both
  // documents and stalls the file for over a minute (tests/assert-dom-value.test.mjs).
  assert.ok(document.activeElement === option('Home').querySelector('input'), 'the keyboard lands on the first option');
});

test('choosing narrows, a second choice in one filter widens, and × clears', async () => {
  await mount(React.createElement(Harness));
  await click(button('Kit▾'));
  await click(option('Home').querySelector('input'));
  assert.equal(shown(), 'ac');
  assert.equal(count(), '2 of 4 programs');
  assert.match(button('Kit · Home▾')?.textContent || '', /Kit · Home/);
  await click(option('Barbell').querySelector('input'));
  assert.equal(shown(), 'abc');
  assert.ok(buttonStarting('Kit · Home +1'), 'a second choice is summarised, not hidden');
  await click(button('Clear the Kit filter'));
  assert.equal(shown(), 'abcd');
  assert.ok(!button('Clear the Kit filter'), 'the × leaves with the choice');
});

test('an option that would leave nothing is dimmed and cannot be switched on — and a chosen one can always be switched off', async () => {
  await mount(React.createElement(Harness));
  await click(chip('Mobility'));
  assert.equal(shown(), 'd');
  await click(button('Kit▾'));
  const home = option('Home');
  assert.ok(home.classList.contains('is-zero'), 'dimmed, not hidden');
  assert.equal(home.querySelector('input').getAttribute('aria-disabled'), 'true');
  await click(home.querySelector('input'));
  assert.equal(shown(), 'd', 'a dead option does nothing');
  assert.equal(home.querySelector('input').checked, false);
  // Chosen, then made empty by a search: it stays switchable OFF.
  await click(chip('All'));
  await click(option('Home').querySelector('input'));
  await typeInto(document.querySelector('.dash-filter-search input'), 'upper');
  assert.equal(shown(), '');
  const on = option('Home');
  assert.equal(on.querySelector('.dash-facet-n').textContent, '0');
  assert.ok(!on.classList.contains('is-zero'));
  await click(on.querySelector('input'));
  assert.equal(shown(), 'b');
});

test('Escape closes a filter and hands focus back; a click elsewhere closes it too', async () => {
  await mount(React.createElement(Harness));
  const kit = button('Kit▾');
  await click(kit);
  await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.ok(!document.querySelector('.dash-facet-pop'));
  assert.ok(document.activeElement === kit, 'Escape hands focus back to the menu button');
  await click(kit);
  await React.act(async () => { document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })); });
  assert.ok(!document.querySelector('.dash-facet-pop'));
});

test('on a phone a panel slides back inside the screen instead of being cut off', async () => {
  // jsdom has no layout, so give it the measured phone case: a chip 213px in on a 390px
  // screen, a 300px panel. Without the slide the panel ended at 513px and was clipped.
  const proto = window.HTMLElement.prototype, real = proto.getBoundingClientRect;
  const vw = Object.getOwnPropertyDescriptor(window.Element.prototype, 'clientWidth');
  proto.getBoundingClientRect = function () {
    if (this.classList.contains('dash-facet')) return { left: 213, right: 300, top: 0, bottom: 34, width: 87, height: 34 };
    if (this.classList.contains('dash-facet-pop')) return { left: 213, right: 513, top: 40, bottom: 300, width: 300, height: 260 };
    return real.call(this);
  };
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 390 });
  try {
    await mount(React.createElement(Harness));
    await click(button('Kit▾'));
    assert.equal(document.querySelector('.dash-facet-pop').style.left, '-139px', 'right edge on the 16px gutter');
    await mount(React.createElement(PickerHarness));
    await click(button('＋ Tag'));
    assert.equal(document.querySelector('.dash-facet-pop').style.left, '-139px', 'the tag picker takes the same rule');
  } finally {
    proto.getBoundingClientRect = real;
    delete document.documentElement.clientWidth;
    if (vw) Object.defineProperty(window.Element.prototype, 'clientWidth', vw);
  }
});

test('the search narrows by name, and Clear puts everything back', async () => {
  await mount(React.createElement(Harness));
  await typeInto(document.querySelector('.dash-filter-search input'), 'BODY');
  assert.equal(shown(), 'c');
  assert.equal(count(), '1 of 4 programs');
  await click(button('Clear'));
  assert.equal(shown(), 'abcd');
  assert.equal(document.querySelector('.dash-filter-search input').value, '');
  assert.ok(!button('Clear'), 'nothing to clear, no Clear');
});

test('the chip row: All is pressed until a chip is, and every chip counts', async () => {
  await mount(React.createElement(Harness));
  assert.equal(chip('All').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('All').querySelector('.dash-chip-n').textContent, '4');
  assert.equal(chip('Upper').style.getPropertyValue('--c'), '#8a5cf6', 'the tag colour is on the chip at rest');
  await click(chip('Upper'));
  assert.equal(chip('Upper').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('All').getAttribute('aria-pressed'), 'false');
  assert.equal(shown(), 'bc');
  await click(chip('Lower'));
  assert.equal(shown(), 'abc', 'two chips widen, like two options in one filter');
  await click(chip('All'));
  assert.equal(shown(), 'abcd');
});

// ── The workout library ─────────────────────────────────────────────────────
const row = (name) => ({ id: name, name, sets: 3, reps: '8', loadType: 'kg', load: 0 });
const tpl = (id, name, rows, over = {}) => ({
  id, name, kind: 'program', published: over.published !== false,
  detail: { revision: 1, buildType: over.type || 'program', builder: { version: 1, goalTag: over.goalTag || 'strength', tags: over.tags,
    weeks: over.weeks || [{ deload: false, days: [{ id: id + '-d1', name: 'Day 1', blocks: [{ kind: 'main', rows: rows.map(row) }] }, { id: id + '-d2', name: 'Day 2', blocks: [{ kind: 'main', rows: rows.map(row) }] }] }] } },
});
const LIB = [
  tpl('p1', 'Glute Builder', ['Hip thrust', 'Back squat'], { tags: ['hypertrophy', 'Postnatal'] }),
  tpl('p2', 'Home Sweat', ['Push-up', 'Goblet squat'], { tags: ['cut'] }),
  tpl('p3', 'Quick Mobility', ['Couch stretch'], { type: 'workout', goalTag: 'cut', weeks: [{ deload: false, days: [{ id: 'q', name: 'Flow', blocks: [{ kind: 'main', rows: [row('Couch stretch'), row('Cat-cow')] }] }] }] }),
];
let calls = [];
function stubFetch({ owner = 'coach-a', plans = LIB, usage = { usage: { p1: { clients: 2 } }, capped: false }, usageStatus = 200, libraryOk = true } = {}) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('soundtracks')) return { ok: true, json: async () => ({ soundtracks: [] }) };
    if (String(url).includes('/api/coach/plans/usage')) return { ok: usageStatus === 200, status: usageStatus, json: async () => usage };
    if (!libraryOk) return { ok: false, status: 401, json: async () => ({ error: 'Authentication required.' }) };
    return { ok: true, json: async () => ({ ownerId: owner, plans }) };
  };
}
const dashboard = (source) => { globalThis.useDashboard = () => ({ clients: [], queue: [], today: null, source }); };
const cardOf = (name) => [...document.querySelectorAll('.dash-plate')].find((c) => c.querySelector('h2')?.textContent === name);

test('Programs: the tag row offers Shape\'s goals and this coach\'s own tags, and files by them', async () => {
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.equal(count(), '3 programs');
  assert.ok(chip('Postnatal'), 'the coach\'s own tag is in the row');
  assert.equal(chip('Cut').querySelector('.dash-chip-n').textContent, '1', 'goalTag "cut" on Quick Mobility is not a tag anyone chose');
  await click(chip('Postnatal'));
  assert.deepEqual([...document.querySelectorAll('.dash-plate h2')].map((h) => h.textContent), ['Glute Builder']);
  assert.equal(count(), '1 of 3 programs');
  assert.doesNotMatch(text(), /Tag a program under its name/, 'the hint is for a library with no tags at all');
});

test('Programs: who is on each program narrows the library and badges the card', async () => {
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(calls.some((u) => /\/api\/coach\/plans\/usage\?today=\d{4}-\d{2}-\d{2}$/.test(u)), 'asked with the coach\'s own day');
  assert.match(cardOf('Glute Builder').textContent, /In use · 2 clients/);
  assert.doesNotMatch(cardOf('Home Sweat').textContent, /In use/);
  await click(button('In use▾'));
  assert.equal(option('Yes').querySelector('.dash-facet-n').textContent, '1');
  assert.equal(option('No').querySelector('.dash-facet-n').textContent, '2');
  await click(option('No').querySelector('input'));
  assert.ok(button('In use · No▾'), 'the chip names the filter once and the answer once');
  assert.deepEqual([...document.querySelectorAll('.dash-plate h2')].map((h) => h.textContent).sort(), ['Home Sweat', 'Quick Mobility']);
});

test('Programs: a capped read may say "in use" and never "not in use"', async () => {
  dashboard('live'); stubFetch({ usage: { usage: { p1: { clients: 5 } }, capped: true } });
  await mount(React.createElement(TrainerProgramsPage));
  assert.match(cardOf('Glute Builder').textContent, /In use · 5\+ clients/);
  await click(button('In use▾'));
  assert.ok(option('Yes'));
  assert.ok(!option('No'), 'a capped read never offers No');
  assert.match(document.querySelector('.dash-facet-pop').textContent, /too many upcoming sessions/);
});

test('Programs: an In use · No chosen before a refresh comes back capped stops filtering', async () => {
  // The bar drops No from a capped read; the count must run on the same facets,
  // or the old choice narrows the library to nothing with no chip left to undo it.
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  await click(button('In use▾'));
  await click(option('No').querySelector('input'));
  assert.equal(count(), '2 of 3 programs');
  stubFetch({ usage: { usage: { p1: { clients: 5 } }, capped: true } });
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.equal(count(), '3 programs');
  assert.equal(document.querySelectorAll('.dash-plate h2').length, 3);
});

test('Programs: an unread calendar says why, and Retry reads it again', async () => {
  dashboard('live'); stubFetch({ usageStatus: 500, usage: { error: 'x' } });
  await mount(React.createElement(TrainerProgramsPage));
  await click(button('In use▾'));
  const pop = document.querySelector('.dash-facet-pop');
  assert.match(pop.textContent, /Couldn’t read who is on each program just now/);
  assert.equal(pop.querySelectorAll('input').length, 0, 'no options to choose from a read that failed');
  const before = calls.filter((u) => u.includes('/usage')).length;
  await click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Retry'));
  await settle();
  assert.equal(calls.filter((u) => u.includes('/usage')).length, before + 1);
});

test('Programs: in the preview nobody is on anything, and it says so', async () => {
  dashboard('demo'); stubFetch({ libraryOk: false });
  await mount(React.createElement(TrainerProgramsPage));
  assert.ok(chip('Strength'), 'the preview\'s programs carry their tags');
  assert.ok(!calls.some((u) => u.includes('/usage')), 'no account, no read');
  await click(button('In use▾'));
  assert.match(document.querySelector('.dash-facet-pop').textContent, /Live only — in the preview no program is on anyone’s calendar\./);
});

test('Programs: the card states what it is and what it trains', async () => {
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  const glute = cardOf('Glute Builder').textContent, mob = cardOf('Quick Mobility').textContent, home = cardOf('Home Sweat').textContent;
  assert.match(glute, /1 week · 2 days a week/);
  assert.match(mob, /2 moves/);
  // Push-up is bodyweight but the goblet squat needs a dumbbell: Home, not Bodyweight only.
  assert.match(home, /Full body · Home/);
  assert.doesNotMatch(home, /Bodyweight only/);
  assert.match(glute, /Postnatal/);
});

test('Programs: a library with no tags anywhere says where tags come from', async () => {
  dashboard('live'); stubFetch({ plans: [tpl('p9', 'Plain', ['Back squat'])] });
  await mount(React.createElement(TrainerProgramsPage));
  assert.match(text(), /Tag a program under its name in the builder to file it here\./);
});

test('Programs: filters that match nothing say so and offer to clear them', async () => {
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  await typeInto(document.querySelector('.dash-filter-search input'), 'zzz');
  assert.match(text(), /No programs match these filters\./);
  await click(button('Clear filters'));
  assert.equal(count(), '3 programs');
});

test('Programs: another account is another library — its filters do not carry over', async () => {
  dashboard('live'); stubFetch();
  await mount(React.createElement(TrainerProgramsPage));
  await click(chip('Postnatal'));
  assert.equal(count(), '1 of 3 programs');
  stubFetch({ owner: 'coach-b', plans: LIB.slice(0, 2) });
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.equal(count(), '2 programs');
});

// ⚠ "＋ PROGRAM" WORKS WHILE THE LIBRARY IS STILL LOADING, and the first answer is not
// an account CHANGE. It read as one (owner null → this coach) and closed the builder the
// coach had just opened. Only the library read is held back; everything else answers.
test('Programs: a program started while the library loads survives the first answer', async () => {
  dashboard('live');
  let answer = null;
  globalThis.fetch = (url, opts) => {
    const u = String(url);
    if (u.includes('/api/coach/plans?kind=program') && !(opts && opts.method && opts.method !== 'GET')) {
      return new Promise((r) => { answer = () => r({ ok: true, json: async () => ({ ownerId: 'coach-a', plans: LIB }) }); });
    }
    if (u.includes('/api/coach/plans/usage')) return Promise.resolve({ ok: true, json: async () => ({ usage: {}, capped: false }) });
    return Promise.resolve({ ok: true, json: async () => ({ soundtracks: [] }) });
  };
  await mount(React.createElement(TrainerProgramsPage));
  assert.match(text(), /Loading workouts…/);
  await click(button('＋ Program'));
  assert.ok(button('← Library'), 'the builder opened');
  assert.ok(answer, 'the library read is still in flight');
  await React.act(async () => { answer(); });
  await settle();
  assert.ok(button('← Library'), 'the first answer is not an account change — the builder stays open');
});

// And the preview's own branch marks the library answered, or signing in would leave a
// visitor editing one of Shape's example programs inside their real account.
test('Programs: signing in closes an example program the preview had open', async () => {
  dashboard('demo'); stubFetch({ libraryOk: false });
  await mount(React.createElement(TrainerProgramsPage));
  await click(buttonStarting('Edit template'));
  assert.ok(button('← Library'));
  stubFetch();
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.ok(!button('← Library'), 'the example closed when the account answered');
  assert.equal(count(), '3 programs');
});

// ── The tag picker ──────────────────────────────────────────────────────────
function PickerHarness() {
  const [tags, setTags] = React.useState(['cut']);
  return React.createElement(React.Fragment, null,
    React.createElement(DbuTagPicker, { tags, customTags: ['Beginner'], onChange: setTags }),
    React.createElement('output', { id: 'tags' }, JSON.stringify(tags)));
}
const saved = () => JSON.parse(document.getElementById('tags').textContent);

test('the tag picker adds Shape\'s goals, the coach\'s own tags and new words — once each', async () => {
  await mount(React.createElement(PickerHarness));
  await click(button('＋ Tag'));
  const pop = document.querySelector('.dash-facet-pop');
  assert.match(pop.textContent, /Shape’s goals/);
  assert.match(pop.textContent, /Your tags/);
  await click(option('Strength').querySelector('input'));
  await click(option('Beginner').querySelector('input'));
  assert.deepEqual(saved(), ['cut', 'strength', 'Beginner']);
  const input = pop.querySelector('input[aria-label="New tag"]');
  await typeInto(input, '  Post   natal ');
  await click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Add'));
  assert.deepEqual(saved(), ['cut', 'strength', 'Beginner', 'Post natal']);
  await typeInto(input, 'STRENGTH');
  await click([...pop.querySelectorAll('button')].find((b) => b.textContent === 'Add'));
  assert.deepEqual(saved(), ['cut', 'strength', 'Beginner', 'Post natal'], 'a goal typed by name is that goal, and it is already there');
  await click(button('Remove the Cut tag'));
  assert.deepEqual(saved(), ['strength', 'Beginner', 'Post natal']);
});

test('the tag picker stops at the cap and says why', async () => {
  function Full() {
    const [tags, setTags] = React.useState(Array.from({ length: DashBuilder.TAG_MAX }, (_, i) => 'Tag ' + i));
    return React.createElement(DbuTagPicker, { tags, customTags: [], onChange: setTags });
  }
  await mount(React.createElement(Full));
  await click(button('＋ Tag'));
  assert.match(text(), new RegExp('A program can carry ' + DashBuilder.TAG_MAX + ' tags'));
  assert.equal(option('Strength').querySelector('input').getAttribute('aria-disabled'), 'true');
  // At the cap every goal row is dead, so the first choice the keyboard can USE is the
  // coach's own first tag (it can always be switched off), not the dimmed Cut above it.
  assert.ok(document.activeElement === option('Tag 0').querySelector('input'), 'focus skips the dimmed rows');
});

test('the tag picker keeps the menu contract: it names its panel, focus goes in, Escape hands it back', async () => {
  await mount(React.createElement(PickerHarness));
  const add = button('＋ Tag');
  assert.equal(add.getAttribute('aria-controls'), null, 'nothing to name while it is closed');
  await click(add);
  const pop = document.querySelector('.dash-facet-pop');
  assert.ok(!!pop.id && add.getAttribute('aria-controls') === pop.id, 'the button names the panel it opened');
  assert.ok(document.activeElement === option('Cut').querySelector('input'), 'the keyboard lands on the first choice');
  await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.ok(!document.querySelector('.dash-facet-pop'));
  assert.ok(document.activeElement === add, 'Escape hands focus back to the button');
  assert.equal(add.getAttribute('aria-controls'), null, 'and it stops naming a panel that is gone');
});

// ⚠ WHILE AN IME IS COMPOSING, ITS KEYSTROKES ARE ITS OWN. The Enter that confirms a
// candidate saved a half-typed tag, and the Escape that cancels one closed the picker.
// keyCode 229 is Safari's form of both (the composition has already ended by the time
// the keydown arrives, so `isComposing` reads false). (CodeRabbit, #2150.)
test('the tag picker leaves an IME\'s own Enter and Escape alone', async () => {
  await mount(React.createElement(PickerHarness));
  await click(button('＋ Tag'));
  const input = document.querySelector('.dash-facet-pop input[aria-label="New tag"]');
  assert.ok(input.classList.contains('dash-tag-new'), 'the box takes the coarse-pointer font floor');
  await typeInto(input, '日本');
  const press = (init) => React.act(async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ...init })); });
  await press({ key: 'Enter', isComposing: true });
  assert.deepEqual(saved(), ['cut'], 'the Enter that confirms a candidate adds nothing');
  await press({ key: 'Enter', keyCode: 229 });
  assert.deepEqual(saved(), ['cut'], 'nor does Safari\'s form of it');
  await press({ key: 'Escape', isComposing: true });
  assert.ok(!!document.querySelector('.dash-facet-pop'), 'cancelling a candidate leaves the picker open');
  await press({ key: 'Escape', keyCode: 229 });
  assert.ok(!!document.querySelector('.dash-facet-pop'), 'in Safari too');
  await press({ key: 'Enter' });
  assert.deepEqual(saved(), ['cut', '日本'], 'a plain Enter still adds the tag');
  await press({ key: 'Escape' });
  assert.ok(!document.querySelector('.dash-facet-pop'), 'and a plain Escape still closes the picker');
});

// ── The meal library ────────────────────────────────────────────────────────
const mealPlan = (id, name, phase, slots, over = {}) => {
  const doc = { ...DashMeals.newPlan(name, phase), ...over };
  doc.days = [{ ...DashMeals.newDay('Day A'), slots: slots.map((fid) => DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === fid), 'Lunch')) }];
  return { id, name, kind: 'meal_plan', published: true, detail: { mealBuilder: doc } };
};
const MEALS = [
  mealPlan('m1', 'Lean Week', 'cut', ['f5', 'f6'], { targets: { kcal: 1700, p: 160, c: 150, f: 50 } }),
  mealPlan('m2', 'Bulk Base', 'build', ['f18', 'f14'], { targets: { kcal: 2900, p: 180, c: 350, f: 90 } }),
];
let mealCalls = [];
function stubMeals({ ok = true, plans = MEALS, status = 200 } = {}) {
  mealCalls = [];
  globalThis.fetch = async (url, opts) => {
    mealCalls.push([String(url), opts && opts.method || 'GET']);
    if (!ok) return { ok: false, status, json: async () => ({ error: 'Authentication required.' }) };
    return { ok: true, json: async () => ({ ownerId: 'nutri-a', plans }) };
  };
}
const dashboardN = (source, clients = []) => { globalThis.useDashboard = () => ({ clients, queue: [], today: null, source }); };
const reads = () => mealCalls.filter(([u, m]) => u.includes('kind=meal_plan') && m === 'GET').length;

test('Meal plans: a signed-in library with no website plans is EMPTY, not Shape\'s examples', async () => {
  dashboardN('live'); stubMeals({ plans: [] });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), /No meal plans on the website yet\./);
  assert.doesNotMatch(text(), /Summer Cut|Steady Maintain|Build Fuel/);
  assert.ok(!document.querySelector('.dash-filterbar'), 'no filters over nothing');
});

test('Meal plans: plans written in the app are counted, not passed off as absent', async () => {
  const appOnly = { id: 'a1', name: 'Phone plan', kind: 'meal_plan', detail: { buildType: 'mealplan', blocks: [] } };
  dashboardN('live'); stubMeals({ plans: [MEALS[0], appOnly, { ...appOnly, id: 'a2' }] });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), /2 meal plans you wrote in the app aren’t listed here/);
  assert.equal(count(), '1 plan');
});

test('Meal plans: a failed read says so and offers Retry; the preview gets the examples', async () => {
  dashboardN('live'); stubMeals({ ok: false });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(document.querySelector('[role="alert"]').textContent, /Authentication required\./, 'the route\'s own reason');
  assert.doesNotMatch(text(), /Summer Cut/);
  const before = reads();
  await click(button('Retry'));
  await settle();
  assert.equal(reads(), before + 1);
  dashboardN('demo'); stubMeals({ ok: false });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), /Summer Cut · 1900/);
  assert.doesNotMatch(text(), /Could not load/);
});

test('Meal plans: a failure that is not JSON reads as a sentence, never a parse error', async () => {
  dashboardN('live');
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); } });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(document.querySelector('[role="alert"]').textContent, /Could not load your meal plans\. Check your connection and retry\./);
  assert.doesNotMatch(text(), /Unexpected token/);
});

test('Meal plans: until the dashboard knows who is signed in, a failed read stays on Loading', async () => {
  dashboardN(null); stubMeals({ ok: false });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), /Loading plans…/);
  assert.ok(!document.querySelector('[role="alert"]'));
});

test('Meal plans: phase chips and the Diet filter narrow the library; the card says what was checked', async () => {
  dashboardN('live'); stubMeals();
  await mount(React.createElement(NutritionistPlansPage));
  assert.equal(count(), '2 plans');
  await click(chip('Build'));
  assert.equal(count(), '1 of 2 plans');
  assert.match(text(), /Bulk Base/);
  await click(chip('All'));
  await click(button('Diet▾'));
  await click(option('No fish').querySelector('input'));
  assert.equal(count(), '1 of 2 plans');
  assert.doesNotMatch([...document.querySelectorAll('.dash-plate')].map((c) => c.textContent).join('|'), /Lean Week/);
  assert.match(text(), /Contains nuts · Longest meal 20 min/);
});

// "Allergen-free" would be a claim about every allergen there is; the card names the list
// it was checked against, and reads its length from that list.
test('Meal plans: a plan clear of every allergen Shape checks names that list', async () => {
  dashboardN('live'); stubMeals({ plans: [mealPlan('m3', 'Clean Week', 'maintain', ['f5', 'f18'])] });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), new RegExp('None of the ' + DashMeals.ALLERGENS.length + ' allergens Shape checks'));
  assert.doesNotMatch(text(), /allergen-free|None of the seven/i);
});

test('Meal plans: Back from the builder reads the library again', async () => {
  dashboardN('live'); stubMeals();
  await mount(React.createElement(NutritionistPlansPage));
  const before = reads();
  await click(button('+ New meal plan'));
  await click(button('← Library'));
  await settle();
  assert.equal(reads(), before + 1, 'a plan saved in the builder is in the list without a reload');
});

test('Meal plans: a plan started while the library loads survives the first answer', async () => {
  dashboardN('live');
  let answer;
  globalThis.fetch = (url, opts) => (opts && opts.method) ? Promise.resolve({ ok: true, json: async () => ({ plan: { id: 'x' } }) })
    : new Promise((r) => { answer = () => r({ ok: true, json: async () => ({ ownerId: 'nutri-a', plans: MEALS }) }); });
  await mount(React.createElement(NutritionistPlansPage));
  assert.match(text(), /Loading plans…/);
  await click(button('+ New meal plan'));
  assert.ok(button('← Library'));
  await React.act(async () => { answer(); });
  await settle();
  assert.ok(button('← Library'), 'the first answer is not an account change — the builder stays open');
});

test('Meal plans: the preview and another account both close an open plan', async () => {
  // Preview → signed in (a session started in another tab) → the example plan closes.
  dashboardN('demo'); stubMeals({ ok: false });
  await mount(React.createElement(NutritionistPlansPage));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit template'));
  assert.ok(button('← Library'));
  stubMeals();
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.ok(!button('← Library'), 'the open plan closed');
  assert.match(text(), /Lean Week/);
  // Account A → account B.
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit template'));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ownerId: 'nutri-b', plans: [MEALS[1]] }) });
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.ok(!button('← Library'), 'the open plan closed');
  assert.doesNotMatch(text(), /Lean Week/);
});

// ⚠ AND A PAGE THAT OPENS SIGNED IN MUST RESET TOO. The case above passes through the
// preview first, whose branch marks the library resolved on its own — so it cannot tell
// whether a LIVE first answer does. A coach who loads the page already signed in and then
// switches account in another tab reaches the switch with no preview in between.
test('Meal plans: signed in from the start, another account still closes an open plan', async () => {
  dashboardN('live'); stubMeals();
  await mount(React.createElement(NutritionistPlansPage));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit template'));
  assert.ok(button('← Library'));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ownerId: 'nutri-b', plans: [MEALS[1]] }) });
  await React.act(async () => { window.dispatchEvent(new window.Event('focus')); });
  await settle();
  assert.ok(!button('← Library'), 'account B is not shown account A\'s open plan');
  assert.doesNotMatch(text(), /Lean Week/);
});

test('Meal plans: "Write plan" on an empty library opens a new plan, not nothing', async () => {
  const client = { profile: { id: 'c1', name: 'Jordan M.' }, goal: { target: 80, now: 81 }, goalPhase: 'build', checkIn: { lastWeekOf: '2026-09-15' } };
  dashboardN('live', [client]); stubMeals({ plans: [] });
  await mount(React.createElement(NutritionistPlansPage));
  await click(buttonStarting('Write plan'));
  assert.ok(button('← Library'), 'the builder opened');
  assert.equal(document.querySelector('select').value, 'build', 'in the client\'s phase');
});
