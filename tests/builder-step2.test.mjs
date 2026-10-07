// tests/builder-step2.test.mjs
//
// THE COACH'S DAY, REBUILT — step 2 of the builder plan the owner approved on 2026-10-07
// ("I like everything that is proposed for schedule and program builder. Apply all the fixes
// first then proceed with upgrades/improvements"), after calling the day editor
// "overwhelming and confusing". The drawn proposal is the target:
//
//   · one line per exercise — sets × reps, load, RPE and rest edited on the line — with the
//     blocks as labels inside one list, and the rest of a move in a detail beside it;
//   · the day's settings in its header: the name as the heading, the training day, the
//     playlist and the walkthrough as chips;
//   · type to add, with the picker's own sources, and Tab across a line;
//   · drag by the handle, within and between blocks, and Alt+↑/↓ from the keyboard;
//   · a readable selected day, plain labels, one control height.
//
// The real builder under jsdom. ⚠ EVERY DOM CHECK COMPARES A BOOLEAN OR A STRING, never a
// node (tests/assert-dom-value.test.mjs says why: a failing node comparison formats the
// whole document and stalls the run).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
const SRC = nd('dashBuilder.jsx');
Object.assign(globalThis, await loadRealModule(nd('coachBuilderLayouts.jsx'), { appendExports: 'export {COACH_BUILDER_LAYOUTS,CoachBuilderNav,CoachBuilderFooter,coachTemplateCopy};' }));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'), { appendExports: 'export {useDfbPopShift};' }));
const {
  DbuBuilder, dbuMoveRow, dbuStepTarget, dbuDropTarget, dbuPairState, dbuTogglePair, dbuRankMoves, dbuFlatRows,
} = await loadRealModule(SRC, { appendExports: 'export { DbuBuilder, dbuMoveRow, dbuStepTarget, dbuDropTarget, dbuPairState, dbuTogglePair, dbuRankMoves, dbuFlatRows };' });

// ── Harness ─────────────────────────────────────────────────────────────────
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
const key = (el, k, init = {}) => React.act(async () => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const focusOn = (el) => React.act(async () => { el.focus(); });
function capture() {
  const writes = [];
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(opts.body); writes.push(body); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: 1 } } }) }; };
  return writes;
}
const row = (name, id, extra) => ({ ...DashBuilder.newRow({ name }), id, ...extra });
function program() {
  const d = DashBuilder.newProgram('Lower');
  d.weeks[0].days[0] = {
    id: 'day-a', name: 'Lower', weekday: 0, playlist: { name: 'Heavy Day mix', meta: '12 tracks' },
    blocks: [
      { kind: 'warmup', rows: [row('Hip flow', 'r-hip')] },
      { kind: 'main', rows: [
        row('Back squat', 'r-squat', { load: 100, rest: '3:00', restSeconds: 180 }),
        row('Bench press', 'r-bench', { load: 80, loadType: 'lb', rpe: 8, video: 'https://shape.test/bench.mp4', cue: 'Feet down' }),
        row('Front squat', 'r-front', { loadText: 'bodyweight' }),
      ] },
      { kind: 'accessory', rows: [] },
    ],
  };
  return d;
}
const PLAYLISTS = [{ name: 'Easy flow', meta: '8 tracks' }];
async function mount(layout = 'Editor', extra = {}) {
  const writes = capture();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Lower', detail: { builder: program() } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: PLAYLISTS, clips: [], dayTemplates: [], onBack() {}, onSaved() {}, ...extra })));
  await click(button(layout));
  if (layout === 'Planner') await click(document.querySelector('.wg button.c:not(.rest)'));
  assert.ok(document.querySelector('.dday'), 'the day editor is not open — this test drives nothing');
  return writes;
}
const lines = () => [...document.querySelectorAll('.dr')];
const names = () => lines().map((l) => l.querySelector('.nm').textContent);
const line = (name) => lines().find((l) => l.querySelector('.nm').textContent === name);
const detailName = () => { const h = document.querySelector('aside.ddetail h3'); return h ? h.textContent : ''; };
const said = () => document.querySelector('.dday [role="status"]').textContent;
const savedDay = async (writes) => { await click(button('Save template')); return writes.at(-1).detail.builder.weeks[0].days[0]; };
const shape = (day) => day.blocks.map((b) => b.kind + ':' + b.rows.map((r) => r.id).join(','));
const activeLabel = () => (document.activeElement && document.activeElement.getAttribute('aria-label')) || '';

// jsdom lays nothing out, so the drag's geometry is drawn here: every block label and line
// in the list is 40px tall, in document order, from the list's top at 0.
function drawRows() {
  const proto = window.HTMLElement.prototype, orig = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () {
    if (this.classList.contains('dlist')) return { top: 0, bottom: 2000, height: 2000, left: 0, right: 600, width: 600, x: 0, y: 0 };
    const list = this.closest('.dlist');
    if (list && (this.hasAttribute('data-bk') || this.hasAttribute('data-rk'))) {
      const i = [...list.querySelectorAll('[data-bk],[data-rk]')].indexOf(this);
      return { top: i * 40, bottom: i * 40 + 40, height: 40, left: 0, right: 600, width: 600, x: 0, y: i * 40 };
    }
    return orig.call(this);
  };
  return () => { proto.getBoundingClientRect = orig; };
}
const pointer = (el, type, init) => React.act(async () => { el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });

// ── The rules, as functions ─────────────────────────────────────────────────
const day3 = () => ({ name: 'D', blocks: [
  { kind: 'warmup', rows: [{ id: 'a' }] },
  { kind: 'main', rows: [{ id: 'b' }, { id: 'c' }] },
  { kind: 'accessory', rows: [] },
] });
const ids = (d) => d.blocks.map((b) => b.rows.map((r) => r.id).join(''));

test('a move is moved by its id, within a block, across one and into an empty one', () => {
  const d = day3(), before = JSON.stringify(d);
  assert.deepEqual(ids(dbuMoveRow(d, 'c', 1, 0)), ['a', 'cb', ''], 'within its block');
  assert.deepEqual(ids(dbuMoveRow(d, 'b', 0, 1)), ['ab', 'c', ''], 'into the block above, at its end');
  assert.deepEqual(ids(dbuMoveRow(d, 'a', 2, 0)), ['', 'bc', 'a'], 'into an empty block');
  assert.deepEqual(ids(dbuMoveRow(d, 'a', 1, 99)), ['', 'bca', ''], 'an index past the end lands at the end');
  assert.equal(dbuMoveRow(d, 'b', 1, 0), d, 'a move to where it already is returns the same day, so nothing is written');
  assert.equal(dbuMoveRow(d, 'nope', 0, 0), d, 'an unknown move changes nothing');
  assert.equal(dbuMoveRow(d, 'a', 9, 0), d, 'a block that does not exist changes nothing');
  assert.equal(JSON.stringify(d), before, 'the day handed in was mutated');
});

test('Alt+arrow steps one place, and off the end of a block into the next one', () => {
  const d = day3();
  assert.deepEqual(dbuStepTarget(d, 'c', -1), { bi: 1, index: 0 });
  assert.deepEqual(dbuStepTarget(d, 'b', -1), { bi: 0, index: 1 }, 'up from a block\'s first lands at the END of the block above');
  assert.deepEqual(dbuStepTarget(d, 'b', 1), { bi: 1, index: 1 });
  assert.deepEqual(dbuStepTarget(d, 'c', 1), { bi: 2, index: 0 }, 'down from a block\'s last lands at the START of the next, empty or not');
  assert.equal(dbuStepTarget(d, 'a', -1), null, 'nothing above the first move');
  assert.equal(dbuStepTarget({ blocks: [{ kind: 'main', rows: [{ id: 'z' }] }] }, 'z', 1), null, 'nothing below the last');
  // And a step always lands somewhere dbuMoveRow accepts.
  assert.deepEqual(ids(dbuMoveRow(d, 'b', 0, dbuStepTarget(d, 'b', -1).index)), ['ab', 'c', '']);
});

test('the drop target reads the rows as drawn: midpoints split, a label opens its block', () => {
  // [label 0][a][label 1][b][c][label 2] — each 40px from 0.
  const els = [['bk', 0], ['rk', 'a'], ['bk', 1], ['rk', 'b'], ['rk', 'c'], ['bk', 2]].map(([k, v], i) => ({
    hasAttribute: (n) => n === 'data-' + k,
    getAttribute: (n) => (n === 'data-' + k ? String(v) : null),
    getBoundingClientRect: () => ({ top: 100 + i * 40, bottom: 140 + i * 40, height: 40 }),
  }));
  const list = { getBoundingClientRect: () => ({ top: 100 }), querySelectorAll: () => els };
  const at = (key, y) => { const t = dbuDropTarget(list, key, 100 + y); return t && [t.bi, t.index, t.y]; };
  assert.deepEqual(at('c', 5), [0, 0, 40], 'above everything: the top of the first block');
  assert.deepEqual(at('c', 59), [0, 0, 40], 'above a row\'s midpoint: before it');
  assert.deepEqual(at('c', 70), [0, 1, 80], 'below the last row of a block, above the next label\'s midpoint: its end');
  assert.deepEqual(at('c', 130), [1, 0, 120], 'below a label\'s midpoint: the start of that block');
  assert.deepEqual(at('b', 150), [1, 0, 160], 'the row being dragged is not counted: the line goes above the next one');
  assert.deepEqual(at('b', 230), [2, 0, 240], 'below the last label: into that block, empty or not');
  assert.equal(dbuDropTarget(null, 'a', 0), null);
});

test('superset with next takes a free letter, and unpairing leaves no superset of one', () => {
  const d = { blocks: [
    { kind: 'main', rows: [{ id: 'a', group: 'A' }, { id: 'b', group: 'A' }, { id: 'c' }, { id: 'd' }] },
    { kind: 'accessory', rows: [{ id: 'e' }] },
  ] };
  const groups = (x) => x.blocks.map((b) => b.rows.map((r) => r.group || '-').join(''));
  assert.deepEqual(dbuPairState(d, 'a'), { canPair: true, paired: true });
  assert.deepEqual(dbuPairState(d, 'd'), { canPair: false, paired: false }, 'the last move of a block has no next to pair with');
  assert.deepEqual(dbuPairState(d, 'e'), { canPair: false, paired: false }, 'and a pair never crosses into another block');
  assert.deepEqual(groups(dbuTogglePair(d, 'c')), ['AABB', '-'], 'A is taken, so the new pair is B');
  assert.deepEqual(groups(dbuTogglePair(d, 'b')), ['AAA-', '-'], 'a move already in a superset brings the next one into it');
  assert.deepEqual(groups(dbuTogglePair(d, 'a')), ['----', '-'], 'unpairing the first of two leaves its partner alone, so it leaves too');
  assert.equal(dbuTogglePair(d, 'd'), d, 'nothing to pair with changes nothing');
});

test('type-ahead puts the exact name first, then names that start with it', () => {
  const list = [{ name: 'Romanian deadlift' }, { name: 'Deadlift jumps' }, { name: 'Deadlift' }, { name: 'Trap-bar deadlift' }];
  assert.deepEqual(dbuRankMoves(list, 'deadlift').map((e) => e.name), ['Deadlift', 'Deadlift jumps', 'Romanian deadlift', 'Trap-bar deadlift']);
  assert.deepEqual(dbuRankMoves(list, 'zzz').map((e) => e.name), list.map((e) => e.name), 'no match keeps the library\'s order');
});

test('the flat list carries each move\'s block and the member card\'s labels', () => {
  const flat = dbuFlatRows({ blocks: [{ kind: 'main', rows: [{ id: 'a', group: 'A' }, { id: 'b', group: 'A' }] }, { kind: 'finisher', rows: [{ id: 'c' }] }] });
  assert.deepEqual(flat.map((x) => [x.key, x.bi, x.ri, x.label]), [['a', 0, 0, 'A1'], ['b', 0, 1, 'A2'], ['c', 1, 0, '01']]);
  assert.equal(dbuFlatRows({ blocks: [{ kind: 'main', rows: [{ name: 'legacy' }] }] })[0].key, 'pos:0:0', 'a row with no id is found by its place');
});

// ── One line per exercise ───────────────────────────────────────────────────
for (const layout of ['Guided', 'Editor', 'Planner']) {
  test(`${layout}: the day is one list of lines with the blocks as its labels, and a detail beside it`, async () => {
    if (layout === 'Guided') {
      capture();
      root = createRoot(document.getElementById('root'));
      await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Lower', detail: { builder: program() } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: PLAYLISTS, clips: [], dayTemplates: [], onBack() {}, onSaved() {} })));
      await click(button('Continue →'));
    } else await mount(layout);
    assert.deepEqual(names(), ['Hip flow', 'Back squat', 'Bench press', 'Front squat']);
    assert.deepEqual([...document.querySelectorAll('.dlist .dbk .kind')].map((s) => s.value), ['warmup', 'main', 'accessory'], 'every block is a label in the one list');
    assert.equal(document.querySelectorAll('.dlist').length, 1);
    assert.equal(document.querySelectorAll('.dlist section').length, 0, 'a block is a <section> again — pageShell pads every section 18px on a phone');
    for (const n of names()) for (const cell of ['Sets', 'Reps', 'load', 'target RPE', 'Rest']) assert.ok(byAria(n + ' ' + cell), n + ' has no ' + cell + ' on its line');
    assert.equal(document.querySelectorAll('.dr.on').length, 1, 'one move is open at a time');
    assert.equal(detailName(), 'Hip flow', 'the day opens on its first move');
    assert.ok(line('Bench press').querySelector('.ix').textContent === '03');
    assert.ok(document.querySelector('.dlist .dempty'), 'the empty block says it is empty, so it reads as a place to drop');
  });
}

test('a line\'s cells write the row, with the old row editor\'s rules', async () => {
  const writes = await mount();
  await setValue(byAria('Back squat Sets'), '5');
  await setValue(byAria('Back squat Reps'), '3');
  await setValue(byAria('Back squat Rest'), '2:30');
  await setValue(byAria('Back squat target RPE'), '8.5');
  await setValue(byAria('Front squat load'), '40');
  const rows = (await savedDay(writes)).blocks[1].rows;
  assert.equal(rows[0].sets, '5'); assert.equal(rows[0].reps, '3'); assert.equal(rows[0].rpe, 8.5);
  assert.equal(rows[0].rest, '2:30');
  assert.equal('restSeconds' in rows[0], false, 'a new Rest replaces the imported numeric override');
  assert.equal(rows[2].load, 40);
  assert.equal('loadText' in rows[2], false, 'a new weight replaces an imported load instruction');
  assert.equal(rows[1].loadType, 'lb', 'an untouched move is untouched');
});

test('focus anywhere on a line selects it, and the detail follows', async () => {
  await mount();
  const nm = line('Bench press').querySelector('.nm');
  assert.equal(nm.getAttribute('aria-expanded'), 'false');
  await focusOn(byAria('Bench press Rest'));
  assert.equal(detailName(), 'Bench press', 'tabbing into a line did not open it');
  assert.equal(nm.getAttribute('aria-expanded'), 'true');
  assert.equal(nm.getAttribute('aria-controls'), document.querySelector('aside.ddetail').id, 'the open line names the detail it controls');
  await click(line('Front squat').querySelector('.ix'));
  assert.equal(detailName(), 'Front squat', 'a click on the line itself, not a control, selects it');
  assert.ok(line('Bench press').querySelector('.mk [title="Has a coaching cue"]'), 'the line marks a cue');
  assert.ok(line('Bench press').querySelector('.mk [title="Has a demo video"]'), 'and a demo');
  assert.ok(!line('Back squat').querySelector('.mk'), 'and a move with neither carries no marks');
});

test('the line will not change while a demo upload runs, so the video lands on its own move', async () => {
  let finish;
  window.shapeDb = { client: {
    auth: { getUser: async () => ({ data: { user: { id: 'coach-a' } } }) },
    storage: { from: () => ({ upload: () => new Promise((resolve) => { finish = () => resolve({ error: null }); }), getPublicUrl: () => ({ data: { publicUrl: 'https://shape.test/up.mp4' } }) }) },
  } };
  const writes = await mount();
  await click(line('Back squat').querySelector('.nm'));
  const input = document.querySelector('aside.ddetail .cb-demo input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new window.File(['v'], 'squat.mp4', { type: 'video/mp4' })], configurable: true });
  await React.act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  await click(line('Bench press').querySelector('.ix'));
  assert.equal(detailName(), 'Back squat', 'the selection moved mid-upload, unmounting the upload that owns the result');
  await React.act(async () => finish());
  const rows = (await savedDay(writes)).blocks[1].rows;
  assert.equal(rows[0].video, 'https://shape.test/up.mp4');
  assert.equal(rows[1].video, 'https://shape.test/bench.mp4');
});

// ── Day settings in the header ──────────────────────────────────────────────
test('the day\'s name is the heading and the field, under its date line', async () => {
  const writes = await mount();
  const name = document.querySelector('#dbu-day-name');
  assert.ok(name.closest('.dh'), 'the day name is not in the panel\'s heading');
  assert.match(document.querySelector('.dh .when').textContent, /^Week 1( · \w{3} \d+ \w{3})?$/);
  assert.equal(document.querySelectorAll('.drawer .dh b').length, 1, 'the name is shown a second time as a bold title (the date\'s <b> is the one expected)');
  await setValue(name, 'Lower A');
  assert.equal((await savedDay(writes)).name, 'Lower A');
});

test('three full-width day fields became chips', async () => {
  await mount();
  assert.ok(!/Shape Radio playlist|Chips on the client card/.test(document.querySelector('.drawer').textContent), 'a full-width playlist field or its old hint is back');
  const chips = document.querySelector('.dchips');
  assert.ok(chips, 'no chip row');
  assert.ok(chips.querySelector('select[aria-label="Training day"]'));
  assert.ok(chips.querySelector('select[aria-label="Playlist on the client\'s card"]'), 'the playlist does not say where it shows, in plain words');
  assert.ok([...chips.querySelectorAll('button')].some((b) => /Walkthrough video/.test(b.textContent)));
  assert.ok(!document.querySelector('.drawer details.cb-details'), 'the walkthrough is a fold again');
});

test('the playlist chip shows the day\'s playlist even when the list has not loaded it, and writes a pick', async () => {
  const writes = await mount();
  const sel = byAria('Playlist on the client\'s card');
  const chip = sel.closest('.dchip');
  assert.equal(sel.value, 'Heavy Day mix', 'a stored playlist missing from the list reads as "No playlist"');
  assert.equal(chip.textContent.startsWith('♫ Heavy Day mix'), true);
  await setValue(sel, 'Easy flow');
  assert.deepEqual((await savedDay(writes)).playlist, { name: 'Easy flow', meta: '8 tracks' });
  assert.equal(sel.closest('.dchip').textContent.startsWith('♫ Easy flow'), true);
  await setValue(sel, '');
  assert.equal((await savedDay(writes)).playlist, null);
  assert.equal(sel.closest('.dchip').classList.contains('dim'), true, 'no playlist reads as an offer, dashed');
  assert.equal(sel.closest('.dchip').textContent.startsWith('＋ Playlist'), true);
});

test('the walkthrough chip opens its panel, and Escape closes it without closing the day', async () => {
  await mount('Planner');
  const chip = [...document.querySelectorAll('.dchips button')].find((b) => /Walkthrough video/.test(b.textContent));
  const panel = document.getElementById(chip.getAttribute('aria-controls'));
  assert.equal(panel.hidden, true);
  assert.equal(chip.textContent, '＋ Walkthrough video');
  await click(chip);
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /this day's workout/);
  await key(panel.querySelector('button'), 'Escape');
  assert.equal(panel.hidden, true, 'Escape did not close the panel');
  assert.ok(document.activeElement === chip, 'focus did not go back to the chip');
  assert.ok(document.querySelector('.dday'), 'Escape inside the panel closed the whole day editor');
});

// ── Type to add ─────────────────────────────────────────────────────────────
test('type to add: Enter adds the first match to the current block and lands in its Sets', async () => {
  const writes = await mount();
  await click(line('Back squat').querySelector('.nm')); // the current block is Main
  const add = document.querySelector('.dqa input[role="combobox"]');
  assert.equal(add.getAttribute('aria-label'), 'Add an exercise to Main', 'the line does not say which block it adds to');
  await focusOn(add);
  await setValue(add, 'deadlift');
  const opts = [...document.querySelectorAll('.dqa-list [role="option"]')];
  assert.equal(opts[0].textContent.startsWith('Deadlift'), true, 'the exact name is not first');
  assert.equal(opts[0].getAttribute('aria-selected'), 'true');
  assert.equal(add.getAttribute('aria-activedescendant'), opts[0].id);
  await key(add, 'Enter');
  assert.deepEqual(names(), ['Hip flow', 'Back squat', 'Bench press', 'Front squat', 'Deadlift'], 'it did not land at the end of Main');
  assert.equal(detailName(), 'Deadlift', 'the new move is not the selected one');
  assert.equal(activeLabel(), 'Deadlift Sets', 'Enter did not hand the keyboard to the new line\'s Sets');
  assert.equal(add.value, '', 'the line keeps what was typed');
  const main = (await savedDay(writes)).blocks[1].rows;
  assert.equal(main.at(-1).name, 'Deadlift');
  assert.equal(main.at(-1).muscle, 'Posterior chain', 'the library row brought its descriptors, as the picker does');
});

test('type to add: arrows choose, a new name is offered last, and the coach\'s own moves come first', async () => {
  await mount('Editor', { customMoves: [{ id: 'own-sled drag', name: 'Sled drag', muscle: 'Conditioning', equipment: 'Sled', own: true }] });
  const add = document.querySelector('.dqa input[role="combobox"]');
  await focusOn(add);
  await setValue(add, 'sled');
  const opts = () => [...document.querySelectorAll('.dqa-list [role="option"]')].map((o) => o.textContent);
  assert.equal(opts()[0].startsWith('Sled drag'), true, 'the coach\'s own move is not first');
  assert.equal(opts().at(-1), '＋ Add “sled” as a new exercise', 'the new-name offer is not last');
  await key(add, 'ArrowDown');
  await key(add, 'Enter');
  assert.equal(detailName(), 'Sled push', 'ArrowDown did not move the choice');
  assert.deepEqual(names().slice(0, 2), ['Hip flow', 'Sled push'], 'it did not land in the current block (Warmup, the open move\'s)');
  await focusOn(add);
  await setValue(add, 'Zercher carry');
  assert.deepEqual(opts(), ['＋ Add “Zercher carry” as a new exercise']);
  await key(add, 'Enter', { isComposing: true });
  assert.equal(names().includes('Zercher carry'), false, 'the Enter that confirms an IME candidate added a move');
  await key(add, 'Enter');
  assert.equal(detailName(), 'Zercher carry');
  assert.equal(line('Zercher carry').querySelector('.nm').textContent, 'Zercher carry');
});

test('type to add ranks what the library lists: a name that starts with the text beats one that only contains it', async () => {
  await mount();
  const add = document.querySelector('.dqa input[role="combobox"]');
  await focusOn(add);
  await setValue(add, 'row');
  const first = document.querySelector('.dqa-list [role="option"]').textContent;
  assert.equal(first.startsWith('Rower'), true, 'the library lists Barbell row first; the type-ahead should offer Rower');
});

test('removing the block that holds the open move opens the first move left', async () => {
  await mount();
  assert.equal(detailName(), 'Hip flow');
  await click(byAria('Remove the Warmup block'));
  assert.equal(detailName(), 'Back squat', 'the detail went blank with moves still on the day');
  assert.equal(line('Back squat').classList.contains('on'), true);
});

test('type to add: Escape closes the list, and only an empty line lets it close the day', async () => {
  await mount('Planner');
  const add = document.querySelector('.dqa input[role="combobox"]');
  await focusOn(add);
  await setValue(add, 'row');
  assert.ok(document.querySelector('.dqa-list'));
  await key(add, 'Escape');
  assert.ok(!document.querySelector('.dqa-list'), 'Escape did not close the list');
  assert.ok(document.querySelector('.dday'), 'the Escape meant for the list closed the day editor');
  await key(add, 'Escape');
  assert.equal(add.value, '', 'a second Escape clears what was typed');
  assert.ok(document.querySelector('.dday'));
  await key(add, 'Escape');
  assert.ok(!document.querySelector('.dday'), 'on an empty line Escape is the panel\'s again');
});

test('the picker stays one click away on every block, for ticking several', async () => {
  await mount();
  assert.equal(buttons().filter((b) => b.textContent === '+ Exercise').length, 3, 'a block lost its picker');
});

// ── Reorder ─────────────────────────────────────────────────────────────────
test('no ↑ ↓ buttons; Alt+↓ moves a line across a block boundary, says so, and keeps focus', async () => {
  const writes = await mount();
  assert.ok(!buttons().some((b) => b.textContent === '↑' || b.textContent === '↓'), 'the ↑ ↓ buttons are back');
  await focusOn(byAria('Front squat Rest'));
  await key(byAria('Front squat Rest'), 'ArrowDown', { altKey: true });
  assert.deepEqual(shape(await savedDay(writes)), ['warmup:r-hip', 'main:r-squat,r-bench', 'accessory:r-front'], 'Alt+↓ off the end of Main did not land in Accessory');
  assert.equal(said(), 'Front squat moved to Accessory, 1 of 1.');
  assert.equal(activeLabel(), 'Front squat Rest', 'focus did not follow the moved line to the same cell');
  await key(byAria('Front squat Rest'), 'ArrowUp', { altKey: true });
  await key(byAria('Front squat Rest'), 'ArrowUp', { altKey: true });
  assert.deepEqual(names(), ['Hip flow', 'Back squat', 'Front squat', 'Bench press']);
  await focusOn(line('Hip flow').querySelector('.nm'));
  await key(line('Hip flow').querySelector('.nm'), 'ArrowUp', { altKey: true });
  assert.equal(said(), 'Hip flow is already first.');
  await key(line('Hip flow').querySelector('.nm'), 'ArrowDown');
  assert.deepEqual(names(), ['Hip flow', 'Back squat', 'Front squat', 'Bench press'], 'a plain arrow moved a line');
});

test('dragging the handle moves a line between blocks, into an empty one too, and the line shows where', async () => {
  const restore = drawRows();
  try {
    const writes = await mount();
    // [0 warmup][40 hip][80 main][120 squat][160 bench][200 front][240 accessory]
    const handle = () => line('Front squat').querySelector('.rh');
    await pointer(handle(), 'pointerdown', { pointerId: 1, clientY: 220 });
    assert.equal(detailName(), 'Front squat', 'grabbing a line does not select it');
    await pointer(handle(), 'pointermove', { pointerId: 1, clientY: 50 });
    assert.ok(document.querySelector('.dline'), 'no insertion line while dragging');
    assert.equal(line('Front squat').classList.contains('drag'), true);
    await pointer(handle(), 'pointerup', { pointerId: 1, clientY: 50 });
    assert.ok(!document.querySelector('.dline'));
    assert.deepEqual(shape(await savedDay(writes)), ['warmup:r-front,r-hip', 'main:r-squat,r-bench', 'accessory:'], 'the drop above Hip flow did not land there');
    assert.match(said(), /^Front squat moved to Warmup, 1 of 2\.$/);
    // Into the empty block: below its label's midpoint (now [0][40 front][80 hip][120 main][160][200][240 accessory]).
    const squat = () => line('Back squat').querySelector('.rh');
    await pointer(squat(), 'pointerdown', { pointerId: 2, clientY: 180 });
    await pointer(squat(), 'pointermove', { pointerId: 2, clientY: 270 });
    await pointer(squat(), 'pointerup', { pointerId: 2, clientY: 270 });
    assert.deepEqual(shape(await savedDay(writes)), ['warmup:r-front,r-hip', 'main:r-bench', 'accessory:r-squat']);
  } finally { restore(); }
});

test('a drag that is abandoned, or touched by a second pointer, writes nothing it was not asked to', async () => {
  const restore = drawRows();
  try {
    const writes = await mount();
    const before = shape(await savedDay(writes));
    const h = () => line('Front squat').querySelector('.rh');
    await pointer(h(), 'pointerdown', { pointerId: 1, clientY: 220 });
    await pointer(h(), 'pointermove', { pointerId: 1, clientY: 50 });
    await key(document.body, 'Escape');
    assert.ok(!document.querySelector('.dline'), 'Escape left the drag drawn');
    await pointer(h(), 'pointerup', { pointerId: 1, clientY: 50 });
    assert.deepEqual(shape(await savedDay(writes)), before, 'an abandoned drag still moved the line');
    // A second pointer neither steers nor ends the drag the first one started.
    await pointer(h(), 'pointerdown', { pointerId: 1, clientY: 220 });
    await pointer(h(), 'pointermove', { pointerId: 1, clientY: 130 });
    await pointer(h(), 'pointermove', { pointerId: 9, clientY: 50 });
    await pointer(h(), 'pointerup', { pointerId: 9, clientY: 50 });
    assert.ok(document.querySelector('.dline'), 'a foreign pointer ended the drag');
    await pointer(h(), 'pointerup', { pointerId: 1, clientY: 130 });
    assert.deepEqual(shape(await savedDay(writes)), ['warmup:r-hip', 'main:r-front,r-squat,r-bench', 'accessory:'], 'the drop is not where the first pointer left it');
  } finally { restore(); }
});

// ── The detail's own actions ────────────────────────────────────────────────
test('superset with next pairs the line with the one after it, and the labels follow', async () => {
  const writes = await mount();
  await click(line('Back squat').querySelector('.nm'));
  await click(button('Superset with next'));
  assert.deepEqual(lines().map((l) => l.querySelector('.ix').textContent), ['01', 'A1', 'A2', '02']);
  assert.deepEqual((await savedDay(writes)).blocks[1].rows.map((r) => r.group), ['A', 'A', null]);
  await click(button('Unpair from next'));
  assert.deepEqual((await savedDay(writes)).blocks[1].rows.map((r) => r.group), [null, null, null], 'a superset of one was left behind');
  await click(line('Front squat').querySelector('.nm'));
  assert.equal(button('Superset with next').disabled, true, 'the last move in a block offered to pair with nothing');
});

test('duplicate copies a move under itself; remove selects its neighbour, and the last one hands focus to the add line', async () => {
  const writes = await mount();
  await click(line('Bench press').querySelector('.nm'));
  await click(button('Duplicate'));
  const main = (await savedDay(writes)).blocks[1].rows;
  assert.deepEqual(main.map((r) => r.name), ['Back squat', 'Bench press', 'Bench press', 'Front squat']);
  assert.notEqual(main[2].id, main[1].id, 'the copy shares its original\'s id');
  assert.deepEqual({ ...main[2], id: 0 }, { ...main[1], id: 0 }, 'the copy is not a copy');
  await click(byAria('Remove Bench press'));
  assert.equal(detailName(), 'Bench press', 'removing a move did not select the one after it');
  assert.equal(document.activeElement.classList.contains('nm'), true, 'focus was left on a button that no longer exists');
  for (const n of ['Hip flow', 'Back squat', 'Bench press', 'Front squat']) {
    await click(line(n).querySelector('.nm'));
    await click(byAria('Remove ' + n));
  }
  assert.equal(lines().length, 0);
  assert.equal(document.activeElement.getAttribute('role'), 'combobox', 'an emptied day left focus nowhere');
  assert.match(document.querySelector('aside.ddetail').textContent, /Type an exercise/);
});

// ── The saved document is the one it always was ────────────────────────────
test('a session of list edits saves the same document shape: no UI state leaks into a row, block or day', async () => {
  const restore = drawRows();
  try {
    const writes = await mount();
    const before = await savedDay(writes);
    await focusOn(byAria('Back squat Rest'));
    await key(byAria('Back squat Rest'), 'ArrowUp', { altKey: true });
    const add = document.querySelector('.dqa input[role="combobox"]');
    await focusOn(add); await setValue(add, 'plank'); await key(add, 'Enter');
    await click(line('Bench press').querySelector('.nm')); await click(button('Superset with next'));
    const after = await savedDay(writes);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'the day gained or lost a field');
    for (const b of after.blocks) assert.deepEqual(Object.keys(b).sort(), ['kind', 'rows']);
    // The row format is `newRow`'s, plus the three optional fields the document already knows.
    const rowKeys = new Set([...Object.keys(DashBuilder.newRow({ name: 'x', muscle: 'm', equipment: 'e' })), 'perSet', 'loadText', 'restSeconds']);
    for (const r of after.blocks.flatMap((b) => b.rows)) for (const k of Object.keys(r)) assert.ok(rowKeys.has(k), 'a row gained the field "' + k + '"');
  } finally { restore(); }
});

// ── Small fixes ─────────────────────────────────────────────────────────────
const code = readFileSync(SRC, 'utf8');
const rule = (sel) => { const at = code.indexOf('\n' + sel + '{'); assert.ok(at >= 0, 'no rule for ' + sel); return code.slice(at, code.indexOf('}', at)); };
test('one control height in the day editor: 36px, or 44 on a coarse pointer', () => {
  assert.match(code, /\.dbu2 \.drawer\{--dbu-ctl:36px;/);
  assert.match(code, /@media \(pointer:coarse\)\{\.dbu2 \.drawer\{--dbu-ctl:44px;/);
  for (const sel of ['.dbu2 .drawer .dh .x', '.dbu2 .dday .dbtn', '.dbu2 .dchip', '.dbu2 .dbk .dq', '.dbu2 .dqa input', '.dbu2 .ddetail .df']) {
    assert.match(rule(sel), /height:var\(--dbu-ctl\)/, sel + ' has a height of its own');
  }
  // The shared video controls carry 44px inline, so the day editor overrides them.
  assert.match(code, /:is\(\.cb-demo,\.dpop\) :is\(button,select,input\[type="url"\]\)\{min-height:var\(--dbu-ctl\)!important/);
});

test('the selected day\'s subtitle takes the fill\'s own ink', () => {
  const layouts = readFileSync(nd('coachBuilderLayouts.jsx'), 'utf8');
  assert.match(layouts, /\.cbuilder \.cb-days \.cb-button\[aria-pressed=true\] small\{color:inherit\}/);
});
