// The website builder's Sheet shows one "sets × reps" box per row and week. Each keystroke
// rewrites both fields from what the box holds, so the split decides what a row keeps.
// The REAL module under jsdom + React 18. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsSessionMoves } from '../mobile-app/src/services/workoutSession.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); globalThis.React = React;
Object.assign(globalThis, await loadRealModule(fileURLToPath(new URL('../public/newdesign/coachBuilderLayouts.jsx', import.meta.url)), {appendExports:'export {COACH_BUILDER_LAYOUTS, CoachBuilderNav, CoachBuilderFooter, coachTemplateCopy};'}));
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
const { DbuSheet, DbuRow, dbuSplitSetsReps } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuSheet, DbuRow, dbuSplitSetsReps };' });

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
function SheetHarness({ onWeeks, weekCount = 1 }) {
  const [weeks, setWeeks] = React.useState(() => Array.from({ length: weekCount }, () => ({ deload: false, days: [{ name: 'Lower', blocks: [{ kind: 'main', rows: [
    { id: 'r1', name: 'Push-up', sets: 3, reps: 'max', load: '', loadType: 'kg' },
    { id: 'r2', name: 'Back squat', sets: 3, reps: '10', load: 60, loadType: 'kg' },
  ] }] }] })));
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

test('typing each after a rep count keeps spaces in the focused Sheet cell and trims only the stored value', async () => {
  let weeks;
  await mount(React.createElement(SheetHarness, { weekCount: 2, onWeeks: (w) => { weeks = w; } }));
  try {
    const box = document.querySelector('[aria-label="Sets and reps, Back squat, week 1"]');
    assert.ok(box, 'the Sheet renders the sets and reps box');
    await React.act(async () => box.focus());
    assert.equal(box.value, '3 × 10');
    let typed = box.value;
    for (const key of ' each') {
      typed += key;
      // Read the controlled box back between keys, as real typing does. Passing
      // the entire final string would only test paste and miss the lost space.
      await typeInto(box, box.value + key);
      assert.equal(box.value, typed, 'a rerender discarded text before the next key');
    }
    const row = () => weeks[0].days[0].blocks[0].rows[1];
    assert.equal(row().sets, '3');
    assert.equal(row().reps, '10 each');
    const outline = ShapeWorkoutDocument.builderToOutlineBlocks({ weeks });
    await typeInto(box, box.value + '  ');
    assert.equal(box.value, '3 × 10 each  ', 'focused text keeps trailing spaces');
    assert.equal(row().reps, '10 each', 'saved reps are trimmed on every change');
    assert.deepEqual(ShapeWorkoutDocument.builderToOutlineBlocks({ weeks }), outline, 'draft whitespace must not reach the outline');
    await React.act(async () => box.blur());
    assert.equal(box.value, '3 × 10 each', 'blur returns to the canonical document value');
    assert.equal(row().load, 60);
    assert.equal(weeks[0].days[0].blocks[0].rows[0].reps, 'max', 'another row must stay unchanged');
    assert.equal(weeks[1].days[0].blocks[0].rows[1].reps, '10', 'another week must stay unchanged');
    const next = document.querySelector('[aria-label="Sets and reps, Back squat, week 2"]');
    await React.act(async () => next.focus());
    await typeInto(next, next.value + ' ');
    assert.equal(next.value, '3 × 10 ', 'each week owns its focused text');
    assert.equal(box.value, '3 × 10 each', 'a different focused cell must not overwrite this one');
  } finally { await React.act(async () => root.unmount()); root = null; }
});

test('a trainer can replace an imported rest override and send custom rest times to the player', async () => {
  let row;
  function TrainerHarness() {
    const [value, setValue] = React.useState({ id: 'r1', name: 'Back squat', sets: 3, reps: '8', load: 60, loadType: 'kg', rest: '75s', restSeconds: 75 });
    row = value;
    return React.createElement(DbuRow, { row: value, label: '01', onChange: setValue, onRemove() {}, onMove() {}, onDuplicate() {}, onUploading() {} });
  }
  await mount(React.createElement(TrainerHarness));
  try {
    await typeInto(document.querySelector('[aria-label="Back squat load"]'), '65');
    assert.equal(row.restSeconds, 75, 'unrelated edits preserve an explicit rest override');
    const rest = document.querySelector('[aria-label="Back squat Rest"]');
    assert.ok(rest, 'the trainer has a Rest field');
    for (const [text, seconds] of [['105', 105], ['45s', 45], ['2 min', 120], ['1:30', 90], ['0', 0], ['', null]]) {
      await typeInto(rest, text);
      assert.equal(row.rest, text);
      assert.equal('restSeconds' in row, false, 'the old override must not defeat the new trainer value');
      const builder = { weeks: [{ days: [{ name: 'Lower', blocks: [{ kind: 'main', rows: [row] }] }] }] };
      const exercise = ShapeWorkoutDocument.builderToAssignmentRows(builder, null, '2026-09-21')[0].payload.exercises[0];
      assert.equal(exercise.rest, text, 'the assignment keeps the trainer prescription');
      const [move] = bsSessionMoves([{ ...exercise, m: exercise.name, s: [exercise.sets + ' × ' + exercise.reps, exercise.rest].filter(Boolean).join(' · ') }]);
      assert.equal(move.restSeconds, seconds, 'the session timer uses the trainer prescription');
    }
  } finally { await React.act(async () => root.unmount()); root = null; }
});
