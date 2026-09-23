// Per-set reps and weight, rendered: the mobile coach editor's per-set table, the
// website builder's per-set table, and the website Sheet's read-only ladder cell.
// The REAL modules under jsdom + React 18. node --test.
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); globalThis.React = React;
const { createRoot } = require('react-dom/client'); globalThis.ReactDOM = require('react-dom');
const W = require('../public/newdesign/workoutDocument.js');
globalThis.ShapeWorkoutDocument = W;
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.DashMeals = require('../public/newdesign/dashMealCore.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashMealLedgerCard = () => null;
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live, doc: {}, accountId: null });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
globalThis.DashPage = ({ children }) => React.createElement('main', null, children);
globalThis.DashDemoBand = () => null;
globalThis.trainerNavItems = () => []; globalThis.nutriNavItems = () => [];
globalThis.trainerPayoutCard = {}; globalThis.nutriPayoutCard = {};
globalThis.dashMoney = (c) => '$' + c; globalThis.dashQueueDone = () => false; globalThis.dashMessageClient = () => {};
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'),
  { appendExports: 'export { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift };' }));
const { DbuLadder, DbuSheet } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuLadder, DbuSheet };' });
const registry = new Map([['react', React]]);
registry.set('./BSWorkoutFutureUpdates.jsx', await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutFutureUpdates.jsx', import.meta.url)), { registry: new Map(registry) }));
const { default: Editor } = await loadRealModule(fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutDocumentEditor.jsx', import.meta.url)), { registry });

// ── helpers ─────────────────────────────────────────────────────────────────
let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
}
const buttons = () => [...document.querySelectorAll('button')];
const buttonStarting = (label) => buttons().find((b) => b.textContent.trim().startsWith(label));
const byAria = (label) => document.querySelector(`[aria-label="${label}"]`);
const click = (el) => React.act(async () => { el.click(); });
async function typeInto(input, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

// ── Website: the builder's per-set table ─────────────────────────────────────
function LadderHarness({ initial, onRow }) {
  const [row, setRow] = React.useState(initial);
  onRow(row);
  return React.createElement(DbuLadder, { row, onChange: setRow });
}
const squat = (extra) => ({ id: 'r1', name: 'Back squat', sets: 3, reps: '8', load: 60, loadType: 'kg', ...extra });

test('website: one row per set, each blank field showing what it inherits', async () => {
  let row;
  await mount(React.createElement(LadderHarness, { initial: squat(), onRow: (r) => { row = r; } }));
  const summary = document.querySelector('summary');
  assert.equal(summary.textContent, 'Per-set reps & weight', 'a row with no ladder says nothing after the name');
  assert.equal(document.querySelector('details').open, false, 'and starts closed');
  for (const i of [1, 2, 3]) {
    assert.equal(byAria(`Back squat set ${i} reps`).placeholder, '8');
    assert.equal(byAria(`Back squat set ${i} weight`).placeholder, '60 kg');
  }
  assert.ok(!byAria('Back squat set 4 reps'), 'no row for a set that does not exist');
  await typeInto(byAria('Back squat set 2 reps'), '6');
  await typeInto(byAria('Back squat set 2 weight'), '70');
  await typeInto(byAria('Back squat set 3 reps'), '4');
  await typeInto(byAria('Back squat set 3 weight'), '80');
  assert.deepEqual(row.perSet, [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }], 'the weight is a number, the reps as typed');
  assert.equal(summary.textContent, 'Per-set reps & weight · 8/6/4 · 60/70/80 kg', 'the summary reads the ladder back');
  // Emptying a weight makes it inherit again.
  await typeInto(byAria('Back squat set 3 weight'), '');
  assert.equal(row.perSet[2].load, '');
  assert.equal(W.loadLabel(row), '60/70/60 kg');
  const clear = buttonStarting('Clear per-set targets');
  assert.ok(clear, 'a row with targets offers the way back to straight sets');
  await click(clear);
  assert.ok(!('perSet' in row), 'clearing removes the key, not leaves an empty ladder');
  assert.ok(!buttonStarting('Clear per-set targets'));
});

// ⚠ FOCUS IS CHECKED AS A BOOLEAN, NEVER BY COMPARING TWO NODES: a failing
// assert.equal on a jsdom node formats the whole document and stalls the run.
test('website: Clear hands focus to the summary before it takes itself away', async () => {
  await mount(React.createElement(LadderHarness, { initial: squat({ perSet: [{}, { reps: '6' }] }), onRow() {} }));
  const clear = buttonStarting('Clear per-set targets');
  clear.focus();
  assert.ok(document.activeElement === clear, 'Clear has focus');
  await click(clear);
  assert.ok(!buttonStarting('Clear per-set targets'), 'the button is gone');
  assert.ok(document.activeElement === document.querySelector('summary'), 'focus is on the table\'s own control, not the page');
  assert.equal(document.querySelector('details').open, true, 'and the table stays open');
});

test('website: an unnamed row labels its fields as a new exercise, and each reps field stops where the save does', async () => {
  await mount(React.createElement(LadderHarness, { initial: squat({ name: '' }), onRow() {} }));
  assert.ok(byAria('New exercise set 1 reps'), 'labelled the way the mobile editor names an unnamed row');
  assert.ok(document.querySelector('[aria-label="New exercise per-set targets"]'));
  for (const el of document.querySelectorAll('[aria-label]')) assert.doesNotMatch(el.getAttribute('aria-label'), /^\s|undefined/, el.getAttribute('aria-label'));
  await mount(React.createElement(LadderHarness, { initial: squat(), onRow() {} }));
  assert.equal(byAria('Back squat set 1 reps').maxLength, W.SET_REPS_MAX, 'what the coach can type is what is saved');
  assert.equal(W.normalizePerSet([{ reps: 'x'.repeat(W.SET_REPS_MAX + 5) }])[0].reps.length, W.SET_REPS_MAX, 'the cap the field matches');
});

test('website: a row that already carries a ladder opens on it', async () => {
  await mount(React.createElement(LadderHarness, { initial: squat({ perSet: [{}, { reps: '6', load: 70 }] }), onRow() {} }));
  assert.equal(document.querySelector('details').open, true);
  assert.equal(byAria('Back squat set 2 reps').value, '6');
  assert.equal(byAria('Back squat set 1 reps').value, '', 'an inherited field is blank, never a copy of the row');
});

test('website: no set count, no table; more sets than the ladder holds says where it stops', async () => {
  await mount(React.createElement(LadderHarness, { initial: squat({ sets: '' }), onRow() {} }));
  assert.match(document.body.textContent, /Set the number of sets first\./);
  assert.ok(!byAria('Back squat set 1 reps'));
  await mount(React.createElement(LadderHarness, { initial: squat({ sets: 25 }), onRow() {} }));
  assert.ok(byAria(`Back squat set ${W.LADDER_MAX} reps`));
  assert.ok(!byAria(`Back squat set ${W.LADDER_MAX + 1} reps`));
  assert.match(document.body.textContent, new RegExp(`Per-set targets cover the first ${W.LADDER_MAX} sets\\.`));
});

// ── Website: the Sheet ──────────────────────────────────────────────────────
test('website Sheet: a ladder row is read, never edited, and opens its day', async () => {
  const sel = [];
  const weeks = [{ deload: false, days: [{ name: 'Lower', blocks: [{ kind: 'main', rows: [
    squat({ rpe: 8, perSet: [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }] }),
    { id: 'r2', name: 'Romanian deadlift', sets: 3, reps: '8', load: 90, loadType: 'kg' },
  ] }] }] }];
  await mount(React.createElement(DbuSheet, { doc: { weeks }, dates: {}, setSel: (s) => sel.push(s), setWeeks() {} }));
  const cell = document.querySelector('button.cell.ladder');
  assert.ok(cell, 'the ladder row renders as a button');
  assert.equal(cell.querySelector('.a').textContent, '3 × 8/6/4');
  assert.equal(cell.querySelector('.b').textContent, '60/70/80 kg');
  // ⚠ A WEEK COLUMN ON A PHONE IS ~105px, so the ladder may wrap — after a slash, never
  // mid-number, and never behind an ellipsis that hides the heaviest sets.
  assert.equal(cell.querySelectorAll('.b wbr').length, 2, 'a break opportunity after each slash');
  assert.equal(cell.querySelectorAll('.a wbr').length, 2);
  assert.match(cell.getAttribute('aria-label'), /Per-set targets, Back squat, week 1: 3 × 8\/6\/4, 60\/70\/80 kg\. Open the day to edit\./);
  // ⚠ NO BOX THAT WRITES THE ROW'S OWN VALUES on a ladder row: every set the coach wrote
  // would ignore it, an edit that reads as saved and changes nothing the member does.
  assert.equal(cell.closest('td').querySelectorAll('input').length, 0);
  assert.equal(document.querySelectorAll('button.cell.ladder').length, 1, 'the straight-sets row keeps its editable cell');
  await click(cell);
  assert.deepEqual(sel, [{ w: 0, d: 0 }]);
});

// ── Mobile: the coach editor ────────────────────────────────────────────────
const theme = { INK: '#fff', INK50: '#bbb', RULE: '#555', PAPER: '#111', RUST: '#f88', MONO: 'monospace', DISPLAY: 'serif', BODY: 'sans-serif' };
const tr = (_key, options) => options.defaultValue.replace(/\{(\w+)\}/g, (_all, name) => options[name] ?? name);
const plan = (row) => ({ id: 'plan-1', name: 'Strength', detail: { revision: 1, builder: { weeks: [{ days: [{ id: 'day-a', name: 'Lower', blocks: [{ kind: 'main', rows: [{ id: 'row-a', name: 'Back squat', sets: 3, reps: '8', load: 60, loadType: 'kg', ...row }] }] }] }] } } });
window.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-a' } }) };
const toggle = () => buttons().find((b) => b.textContent.startsWith('Per-set reps & load'));

test('mobile: the per-set table opens, writes the same document field, and saves', async () => {
  localStorage.clear(); const saved = [];
  await mount(React.createElement(Editor, { plan: plan(), plans: [], t: theme, tr, onClose() {}, onSave: async (p) => { saved.push(p); } }));
  assert.equal(toggle().getAttribute('aria-expanded'), 'false', 'a row with no ladder starts closed');
  assert.ok(!byAria('Set 1 reps'));
  await click(toggle());
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  const region = document.getElementById(toggle().getAttribute('aria-controls'));
  assert.ok(region, 'the button names the table it opens');
  assert.equal(byAria('Set 1 load').placeholder, '60 kg', 'a blank field shows what it inherits');
  await typeInto(byAria('Set 2 reps'), '6');
  await typeInto(byAria('Set 2 load'), '70');
  assert.equal(toggle().textContent, 'Per-set reps & load · 8/6/8 · 60/70/60 kg');
  await click(buttons().find((b) => b.textContent === 'Save draft'));
  const row = saved[0].detail.builder.weeks[0].days[0].blocks[0].rows[0];
  assert.deepEqual(row.perSet, [{}, { reps: '6', load: 70 }]);
  // The server normalizes on every save; the ladder it keeps is the one the coach wrote.
  const stored = W.normalizeWorkoutDetail(saved[0].detail).builder.weeks[0].days[0].blocks[0].rows[0];
  assert.deepEqual(stored.perSet, [{ reps: '', load: '' }, { reps: '6', load: 70 }]);
  assert.equal(W.exerciseFromRow(stored).reps, '8/6/8');
});

test('mobile: a stored ladder opens on it, and clearing returns the row to straight sets', async () => {
  localStorage.clear(); const saved = [];
  await mount(React.createElement(Editor, { plan: plan({ perSet: [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }] }), plans: [], t: theme, tr, onClose() {}, onSave: async (p) => { saved.push(p); } }));
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  assert.equal(byAria('Set 3 load').value, '80');
  await click(buttons().find((b) => b.textContent === 'Clear per-set targets'));
  assert.equal(toggle().textContent, 'Per-set reps & load', 'the summary drops the ladder');
  await click(buttons().find((b) => b.textContent === 'Save draft'));
  assert.ok(!('perSet' in saved[0].detail.builder.weeks[0].days[0].blocks[0].rows[0]));
});

// ⚠ THE TABLE MAY NOT CLOSE UNDER THE COACH'S HANDS. A stored ladder opens because it
// IS a ladder; emptying its last value used to make it none and unmount the table,
// the focused field with it, mid-keystroke.
test('mobile: emptying a stored ladder\'s last value keeps the table, and the field, in place', async () => {
  localStorage.clear();
  await mount(React.createElement(Editor, { plan: plan({ perSet: [{}, { reps: '6' }] }), plans: [], t: theme, tr, onClose() {}, onSave: async () => {} }));
  assert.equal(toggle().getAttribute('aria-expanded'), 'true', 'a stored ladder opens on it');
  const field = byAria('Set 2 reps');
  field.focus();
  await typeInto(field, '');
  assert.equal(toggle().getAttribute('aria-expanded'), 'true', 'still open with the ladder momentarily empty');
  assert.ok(byAria('Set 2 reps') === field, 'the same field, not a remounted one');
  assert.ok(document.activeElement === field, 'and it keeps focus');
  await typeInto(field, '5');
  assert.equal(toggle().textContent, 'Per-set reps & load · 8/5/8 · 60 kg');
  // The same for the last weight.
  await mount(React.createElement(Editor, { plan: plan({ perSet: [{}, {}, { load: 80 }] }), plans: [], t: theme, tr, onClose() {}, onSave: async () => {} }));
  await typeInto(byAria('Set 3 load'), '');
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  assert.ok(byAria('Set 3 load'));
  // A coach's own close still closes it.
  await click(toggle());
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
});

test('mobile: Clear keeps the table open and hands focus to its button', async () => {
  localStorage.clear();
  await mount(React.createElement(Editor, { plan: plan({ perSet: [{}, { reps: '6', load: 70 }] }), plans: [], t: theme, tr, onClose() {}, onSave: async () => {} }));
  const clear = buttons().find((b) => b.textContent === 'Clear per-set targets');
  clear.focus();
  await click(clear);
  assert.ok(!buttons().find((b) => b.textContent === 'Clear per-set targets'), 'nothing left to clear');
  assert.equal(toggle().getAttribute('aria-expanded'), 'true', 'the empty table stays, ready for a new ladder');
  assert.ok(document.activeElement === toggle(), 'focus is on the table\'s button, not the page');
  assert.equal(byAria('Set 2 reps').value, '');
  assert.equal(byAria('Set 1 reps').maxLength, W.SET_REPS_MAX, 'each reps field stops where the save does');
});

test('mobile: no set count, no table', async () => {
  localStorage.clear();
  await mount(React.createElement(Editor, { plan: plan({ sets: '' }), plans: [], t: theme, tr, onClose() {}, onSave: async () => {} }));
  await click(toggle());
  assert.match(document.body.textContent, /Set the number of sets first\./);
  assert.ok(!byAria('Set 1 reps'));
});
