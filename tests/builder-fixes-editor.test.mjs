// tests/builder-fixes-editor.test.mjs
//
// THE COACH'S DAY EDITOR, QUIETER — the approved pass of 2026-10-07 (owner: "Apply all
// the fixes first"). Four kinds of clutter, each pinned on the real builder under jsdom:
//
//   · empty defaults that read as values: a "0" in every new move's Load, a Unit for a
//     weight nobody wrote, and "None" in RPE. Display only — the stored row is untouched;
//   · the move's number and name said twice, in the summary and again on the card;
//   · the demo-video block always open under every move, attached or not;
//   · Editor and Planner forcing every move open, so a day read as a wall of forms.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url), { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const React = require('react'); globalThis.React = React; globalThis.ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('coachBuilderLayouts.jsx'), { appendExports: 'export {COACH_BUILDER_LAYOUTS,CoachBuilderNav,CoachBuilderFooter,coachTemplateCopy};' }));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'), { appendExports: 'export {useDfbPopShift};' }));
const { DbuBuilder } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export {DbuBuilder};' });

let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); delete window.shapeDb; });
const buttons = () => [...document.querySelectorAll('button')];
const button = (t) => buttons().find((b) => b.textContent === t);
const click = async (el) => { assert.ok(el, 'missing control'); await React.act(async () => el.click()); };
const byAria = (label) => document.querySelector('[aria-label="' + label + '"]');
async function setValue(el, value) {
  assert.ok(el, 'missing field');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
function capture() {
  const writes = [];
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(opts.body); writes.push(body); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: 1 } } }) }; };
  return writes;
}
const CLIPS = [{ name: 'Squat demo', url: 'https://shape.test/squat-demo.mp4' }];
function program() {
  const d = DashBuilder.newProgram('Lower');
  d.weeks[0].days[0].blocks = [
    { kind: 'warmup', rows: [{ ...DashBuilder.newRow({ name: 'Hip flow' }), id: 'r-hip' }] },
    { kind: 'main', rows: [
      { ...DashBuilder.newRow({ name: 'Back squat' }), id: 'r-squat' },
      { ...DashBuilder.newRow({ name: 'Bench press' }), id: 'r-bench', load: 80, loadType: 'lb', rpe: 8, video: 'https://shape.test/bench.mp4' },
      { ...DashBuilder.newRow({ name: 'Front squat' }), id: 'r-front', loadType: 'pct' },
    ] },
  ];
  return d;
}
async function mount(layout) {
  const writes = capture();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Lower', detail: { builder: program() } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: CLIPS, dayTemplates: [], onBack() {}, onSaved() {} })));
  await click(button(layout));
  if (layout === 'Guided') await click(button('Continue →'));
  if (layout === 'Planner') await click(document.querySelector('.wg button.c:not(.rest)'));
  assert.ok(document.querySelector('#dbu-day-name'), 'the day editor is not open — this test drives nothing');
  return writes;
}
const moves = () => [...document.querySelectorAll('details.cb-exercise')];
const openOf = () => moves().map((d) => d.open);
const move = (name) => moves().find((d) => d.querySelector(':scope > summary').textContent.includes(name));
const saved = async (writes) => { await click(button('Save template')); return writes.at(-1).detail.builder.weeks[0].days[0].blocks; };

// ── Folded by default, one open at a time ───────────────────────────────────
for (const layout of ['Guided', 'Editor', 'Planner']) {
  test(`${layout}: every move starts folded, and one opens at a time`, async () => {
    await mount(layout);
    assert.equal(moves().length, 4);
    assert.deepEqual(openOf(), [false, false, false, false], 'a move opened on its own');
    await click(move('Back squat').querySelector('summary'));
    assert.deepEqual(openOf(), [false, true, false, false]);
    await click(move('Bench press').querySelector('summary'));
    assert.deepEqual(openOf(), [false, false, true, false], 'opening a move folds the last one');
    await click(move('Bench press').querySelector('summary'));
    assert.deepEqual(openOf(), [false, false, false, false], 'and its own summary folds it again');
  });
}

test('a move just added opens, and the one open before it folds', async () => {
  await mount('Editor');
  await click(move('Back squat').querySelector('summary'));
  await click(buttons().filter((b) => b.textContent === '+ Exercise')[1]);
  const dialog = document.querySelector('[role="dialog"][aria-label="Add exercises"]');
  await setValue(dialog.querySelector('input[aria-label="Search exercises"]'), 'Deadlift');
  const deadlift = [...dialog.querySelectorAll('.pk-row')].find((r) => r.textContent.startsWith('Deadlift'));
  await click(deadlift.querySelector('input[type="checkbox"]'));
  await click(button('Add 1 exercise'));
  assert.equal(moves().length, 5);
  assert.equal(move('Deadlift').open, true, 'the new move is folded — the coach has to hunt for what they just added');
  assert.equal(move('Back squat').open, false);
});

// ── Empty defaults read empty ───────────────────────────────────────────────
test('an empty load reads empty, and the unit waits for a weight', async () => {
  const writes = await mount('Editor');
  const load = byAria('Back squat load');
  assert.equal(load.value, '', 'a new move\'s 0 still shows as a prescribed "0"');
  assert.equal(load.placeholder, '—');
  assert.equal(byAria('Back squat load unit'), null, 'a unit for a weight nobody wrote');
  // A written weight keeps both, in its own unit.
  assert.equal(byAria('Bench press load').value, '80');
  assert.equal(byAria('Bench press load unit').value, 'lb');
  // ⚠ DISPLAY ONLY: the stored rows are what they were, so no assignment reads differently.
  const before = await saved(writes);
  assert.equal(before[1].rows[0].load, 0, 'the empty field rewrote the stored default');
  assert.equal(before[1].rows[0].loadType, 'kg');
  assert.equal(before[1].rows[2].loadType, 'pct', 'a hidden unit keeps its saved value');
  // Writing a weight brings the unit, in the unit the row already had.
  await setValue(byAria('Back squat load'), '100');
  assert.equal(byAria('Back squat load unit').value, 'kg');
  await setValue(byAria('Front squat load'), '75');
  assert.equal(byAria('Front squat load unit').value, 'pct', 'the hidden unit came back as something other than what was saved');
  await setValue(byAria('Back squat load'), '');
  assert.equal(byAria('Back squat load unit'), null, 'and clearing it puts the unit away again');
  const after = await saved(writes);
  assert.equal(after[1].rows[2].load, 75);
  assert.equal(after[1].rows[2].loadType, 'pct');
});

test('a load being typed keeps its leading 0 until the field is left', async () => {
  await mount('Editor');
  const load = byAria('Back squat load');
  await React.act(async () => load.focus());
  await setValue(load, '0');
  assert.equal(load.value, '0', 'the 0 of "0.5" vanished as it was typed');
  await React.act(async () => load.blur());
  assert.equal(load.value, '', 'a load left at 0 is no load, and reads empty again');
});

test('the unit shows for an imported load instruction and for a ladder\'s weights', async () => {
  const d = program();
  d.weeks[0].days[0].blocks[1].rows[0].loadText = 'bodyweight';
  d.weeks[0].days[0].blocks[1].rows[2].perSet = [{ reps: '5', load: 60 }];
  capture();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Lower', detail: { builder: d } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {} })));
  await click(button('Editor'));
  assert.ok(byAria('Back squat load unit'), 'an imported instruction may be replaced by a weight in a unit');
  assert.equal(byAria('Front squat load unit').value, 'pct', 'the ladder\'s weights read in this unit, so it stays in reach');
  assert.equal(byAria('Hip flow load unit'), null);
});

test('no target RPE reads as a dash, not as a word', async () => {
  await mount('Editor');
  const rpe = byAria('Back squat target RPE');
  assert.equal(rpe.value, '');
  assert.equal(rpe.options[0].textContent, '—');
  assert.ok(![...rpe.options].some((o) => o.textContent === 'None'));
  assert.equal(byAria('Bench press target RPE').value, '8', 'a set RPE still reads as itself');
});

// ── The name once ───────────────────────────────────────────────────────────
test('an open move says its number and name once, in its summary', async () => {
  await mount('Editor');
  const squat = move('Back squat');
  await click(squat.querySelector('summary'));
  assert.match(squat.querySelector(':scope > summary').textContent, /^02 · Back squat/);
  const card = squat.querySelector(':scope > div');
  assert.equal(card.firstElementChild.textContent, '↑↓Duplicate×', 'the card header names the move again');
  // Every word of the move outside its demo (whose link field is labelled for it).
  const outside = card.textContent.replace(card.querySelector('.cb-demo').textContent, '');
  assert.ok(!outside.includes('Back squat'), 'the name is repeated on the open card');
  for (const aria of ['Move Back squat up', 'Move Back squat down', 'Remove Back squat']) assert.ok(byAria(aria), aria + ' lost its name');
});

// ── The demo behind one control ─────────────────────────────────────────────
test('the demo is folded, says whether one is attached, and keeps every way to set it', async () => {
  const writes = await mount('Editor');
  const demo = (name) => move(name).querySelector('details.cb-demo');
  assert.equal(demo('Back squat').open, false, 'the demo block is open under the move');
  assert.equal(demo('Bench press').open, false);
  assert.match(demo('Back squat').querySelector('summary').textContent, /^Demo video\s*Optional$/);
  assert.match(demo('Bench press').querySelector('summary').textContent, /^Demo video\s*Attached$/);
  assert.match(move('Bench press').querySelector(':scope > summary').textContent, /· demo$/, 'the move\'s own line says it carries a demo');
  assert.doesNotMatch(move('Back squat').querySelector(':scope > summary').textContent, /demo/);
  // Upload, library, link and the player are all inside it.
  const squat = demo('Back squat');
  assert.ok([...squat.querySelectorAll('button')].some((b) => b.textContent === 'Upload demo'));
  assert.ok(squat.querySelector('input[type="file"]'));
  assert.ok(squat.querySelector('select[aria-label="Choose demo for Back squat"]'));
  assert.match(squat.textContent, /Video link for Back squat/);
  const bench = demo('Bench press');
  assert.ok([...bench.querySelectorAll('button')].some((b) => b.textContent === '▷ Watch · Bench press'));
  // The library pick and the remove both still write the row.
  await setValue(squat.querySelector('select[aria-label="Choose demo for Back squat"]'), CLIPS[0].url);
  assert.match(demo('Back squat').querySelector('summary').textContent, /Attached$/);
  await click([...bench.querySelectorAll('button')].find((b) => b.textContent === 'Remove demo'));
  assert.match(demo('Bench press').querySelector('summary').textContent, /Optional$/);
  const rows = (await saved(writes))[1].rows;
  assert.equal(rows[0].video, CLIPS[0].url);
  assert.equal(rows[1].video, '');
});

test('a folded demo still says when its upload is running, and when it failed', async () => {
  let finish, fail;
  window.shapeDb = { client: {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-a' } } }) },
    storage: { from: () => ({
      upload: () => new Promise((resolve, reject) => { finish = () => resolve({ error: null }); fail = () => reject(new Error('Network down')); }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://shape.test/uploaded.mp4' } }),
    }) },
  } };
  await mount('Editor');
  const pick = async () => {
    const input = move('Back squat').querySelector('details.cb-demo input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new window.File(['video'], 'squat.mp4', { type: 'video/mp4' })], configurable: true });
    await React.act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  };
  const state = () => move('Back squat').querySelector('details.cb-demo > summary').textContent;
  await pick();
  assert.match(state(), /Uploading…$/);
  await React.act(async () => fail());
  assert.match(state(), /Upload failed$/);
  await pick();
  await React.act(async () => finish());
  assert.match(state(), /Attached$/);
});
