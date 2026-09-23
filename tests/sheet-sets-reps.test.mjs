// The website builder's Sheet shows one "sets × reps" box per row and week. Each keystroke
// rewrites both fields from what the box holds, so the split decides what a row keeps.
// The REAL module under jsdom + React 18. node --test.
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
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live, doc: {}, accountId: null });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'),
  { appendExports: 'export { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift };' }));
const { DbuSheet, dbuSplitSetsReps } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuSheet, dbuSplitSetsReps };' });

// Every row was read with main's split before this change. A row with a third value is
// one main cut short at a second × or at a letter x, and the third value is what the box
// stores now. Every other row must store exactly what it did.
const ROWS = [
  // Values that work today.
  ['3 × 10', { sets: '3', reps: '10' }],
  ['3x10', { sets: '3', reps: '10' }],
  ['4 × 8-10', { sets: '4', reps: '8-10' }],
  ['3 × AMRAP', { sets: '3', reps: 'AMRAP' }],
  ['3 × 30s', { sets: '3', reps: '30s' }],
  ['3 × 30 s', { sets: '3', reps: '30 s' }],
  ['5 × 5', { sets: '5', reps: '5' }],
  ['3 × 8-10 reps', { sets: '3', reps: '8-10 reps' }],
  ['3 × 10 each', { sets: '3', reps: '10 each' }],
  // An empty cell, and a box with one side cleared.
  [' × ', { sets: '', reps: '' }],
  ['', { sets: '', reps: '' }],
  ['4', { sets: '4', reps: '' }],
  ['4 ×', { sets: '4', reps: '' }],
  ['× 10', { sets: '', reps: '10' }],
  // A capital X is not a separator, today or now (registered, not changed here).
  ['3X10', { sets: '3X10', reps: '' }],
  // An x or a second × inside the reps: main dropped everything from it on.
  ['3 × max', { sets: '3', reps: 'ma' }, { sets: '3', reps: 'max' }],
  ['3 × 1 max', { sets: '3', reps: '1 ma' }, { sets: '3', reps: '1 max' }],
  ['3x max', { sets: '3', reps: 'ma' }, { sets: '3', reps: 'max' }],
  ['3 × Max', { sets: '3', reps: 'Ma' }, { sets: '3', reps: 'Max' }],
  ['3 × 2x10', { sets: '3', reps: '2' }, { sets: '3', reps: '2x10' }],
  ['3 × 10 × 2', { sets: '3', reps: '10' }, { sets: '3', reps: '10 × 2' }],
  ['3 × 5 · extra', { sets: '3', reps: '5 · e' }, { sets: '3', reps: '5 · extra' }],
  // A stray x typed into the sets: main kept the 3 and lost the reps.
  ['3x × 10', { sets: '3', reps: '' }, { sets: '3x', reps: '10' }],
];

test('the box splits at its first ×, or its first x when it has no ×, and keeps the rest as the reps', () => {
  for (const [value, before, now] of ROWS) {
    assert.deepEqual(dbuSplitSetsReps(value), now || before, `${JSON.stringify(value)}: ${now ? 'the reps it keeps now' : 'main stored it this way'}`);
  }
  const changed = ROWS.filter((row) => row.length === 3);
  assert.equal(changed.length, 8, 'the number of values the box stores differently now');
  // The box drops its separator and nothing else: every other character the coach typed
  // is kept in the sets or the reps. Main failed this on every changed row.
  const kept = (text) => String(text).replace(/\s+/g, '');
  for (const [value] of ROWS) {
    const { sets, reps } = dbuSplitSetsReps(value);
    assert.equal(kept(sets + reps).length, kept(value).length - (/[×x]/.test(value) ? 1 : 0), `${JSON.stringify(value)} lost text`);
  }
});

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
}
async function typeInto(input, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function SheetHarness({ onWeeks }) {
  const [weeks, setWeeks] = React.useState([{ deload: false, days: [{ name: 'Lower', blocks: [{ kind: 'main', rows: [
    { id: 'r1', name: 'Push-up', sets: 3, reps: 'max', load: '', loadType: 'kg' },
    { id: 'r2', name: 'Back squat', sets: 3, reps: '10', load: 60, loadType: 'kg' },
  ] }] }] }]);
  onWeeks(weeks);
  return React.createElement(DbuSheet, { doc: { weeks }, dates: {}, setSel() {}, setWeeks });
}

test('editing the sets of a 3 × max row keeps its reps as max, through the Sheet itself', async () => {
  let weeks;
  await mount(React.createElement(SheetHarness, { onWeeks: (w) => { weeks = w; } }));
  const box = document.querySelector('[aria-label="Sets and reps, Push-up, week 1"]');
  assert.ok(box, 'the Sheet renders the sets and reps box');
  assert.equal(box.value, '3 × max');
  await typeInto(box, '4 × max');
  const row = () => weeks[0].days[0].blocks[0].rows[0];
  assert.equal(row().sets, '4');
  assert.equal(row().reps, 'max');
  assert.equal(document.querySelector('[aria-label="Sets and reps, Push-up, week 1"]').value, '4 × max');
  // The other row, and the load box beside this one, are untouched.
  assert.equal(weeks[0].days[0].blocks[0].rows[1].reps, '10');
  await typeInto(document.querySelector('[aria-label="Load, Push-up, week 1"]'), 'bodyweight');
  assert.equal(row().load, 'bodyweight');
  assert.equal(row().reps, 'max');
  await React.act(async () => root.unmount()); root = null;
});
