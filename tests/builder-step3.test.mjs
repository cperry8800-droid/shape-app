// tests/builder-step3.test.mjs
//
// FEWER MODES — step 3 of the builder plan the owner approved on 2026-10-07 ("I like
// everything that is proposed for schedule and program builder ... proceed with
// upgrades/improvements"):
//
//   · Grid ⇄ Sheet only: the Guided / Editor / Planner layouts and the day editor's panel
//     positions are retired (tests/coach-builder-layouts.test.mjs pins the stale-pref case);
//   · delete a day, behind a confirm built into the panel; copy a day to other weeks, into
//     its weekday's slot, naming any day it replaces before the coach confirms;
//   · the progression bar: one rule for the program, written into every later week's loads
//     so what the client is assigned climbs, not only a label.
//
// The rule's arithmetic is pure (`ShapeWorkoutDocument`) and is driven directly; the bar,
// the pins and the day tools are driven on the real builder under jsdom. ⚠ EVERY DOM CHECK
// COMPARES A BOOLEAN OR A STRING, never a node (tests/assert-dom-value.test.mjs).
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
const React = require('react'); globalThis.React = React; globalThis.ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
const W = globalThis.ShapeWorkoutDocument;
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'), { appendExports: 'export {useDfbPopShift};' }));
const { DbuBuilder, dbuCopyDayToWeeks, dbuDeleteDay, dbuWeekList } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuBuilder, dbuCopyDayToWeeks, dbuDeleteDay, dbuWeekList };' });

// ── Fixtures ────────────────────────────────────────────────────────────────
const row = (name, id, extra) => ({ ...DashBuilder.newRow({ name }), id, ...extra });
function week1() {
  return { deload: false, days: [
    { id: 'lower', name: 'Lower A', weekday: 0, playlist: null, blocks: [
      { kind: 'warmup', rows: [row('Hip flow', 'hip')] },
      { kind: 'main', rows: [row('Back squat', 'squat', { loadType: 'lb', load: 225, sets: 4 }), row('Bench press', 'bench', { loadType: 'kg', load: 100 })] },
      { kind: 'accessory', rows: [row('Leg curl', 'curl', { loadType: 'lb', load: 70 })] },
    ] },
    { id: 'upper', name: 'Upper A', weekday: 3, playlist: null, blocks: [
      { kind: 'main', rows: [row('Overhead press', 'ohp', { loadType: 'lb', load: 95 })] },
    ] },
  ] };
}
// Later weeks made the way a coach makes them, with Copy: the same rows, the same ids.
const program = (weeks = 4, extra = {}) => ({ version: 1, weeks: Array.from({ length: weeks }, () => JSON.parse(JSON.stringify(week1()))), ...extra });
const RULE = { amount: 5, unit: 'lb', kinds: ['main'], deloadEvery: 0 };
const squat = (b, wi) => b.weeks[wi].days[0].blocks[1].rows[0];
const loads = (b, pick) => b.weeks.map((_, wi) => pick(b, wi).load);

// ── The rule, as arithmetic ─────────────────────────────────────────────────
test('the rule is kept only in the shape the builder writes', () => {
  assert.deepEqual(W.normalizeProgression({ amount: '5', unit: 'lb' }), { amount: 5, unit: 'lb', kinds: ['main'], deloadEvery: 0 }, 'blocks default to main lifts');
  assert.deepEqual(W.normalizeProgression({ amount: 2.5, unit: 'kg', kinds: ['finisher', 'MAIN', 'nope'], deloadEvery: 4 }).kinds, ['main', 'finisher'], 'kinds are cleaned and put in the builder\'s order');
  for (const bad of [null, {}, { amount: 0, unit: 'lb' }, { amount: -5, unit: 'lb' }, { amount: 5, unit: 'stone' }, { amount: 5, unit: 'lb', kinds: [] }, { amount: 'x', unit: 'kg' }]) {
    assert.equal(W.normalizeProgression(bad), null, JSON.stringify(bad) + ' was read as a rule');
  }
  assert.equal(W.normalizeProgression({ amount: 5, unit: 'lb', deloadEvery: 1 }).deloadEvery, 0, 'a deload every week is no cadence');
  assert.equal(W.normalizeProgression({ amount: 5, unit: 'lb', deloadEvery: 4.5 }).deloadEvery, 0);
});

test('+5 lb a week on main lifts: each later week climbs from week 1, and nothing else moves', () => {
  const input = program(4, { progression: RULE });
  const out = W.applyProgramProgression(input);
  assert.deepEqual(loads(out, squat), [225, 230, 235, 240]);
  assert.deepEqual(loads(out, (b, wi) => b.weeks[wi].days[1].blocks[0].rows[0]), [95, 100, 105, 110], 'every day of the week climbs');
  assert.deepEqual(loads(out, (b, wi) => b.weeks[wi].days[0].blocks[1].rows[1]), [100, 100, 100, 100], 'a move in kg is never converted or moved by an lb rule');
  assert.deepEqual(loads(out, (b, wi) => b.weeks[wi].days[0].blocks[2].rows[0]), [70, 70, 70, 70], 'an accessory is outside a main-lifts rule');
  assert.equal(out.weeks[0], input.weeks[0], 'week 1 is the source and is returned as it was');
  assert.equal(squat(input, 3).load, 225, 'the rule wrote into the document it was handed');
  assert.equal(W.applyProgramProgression(out), out, 'a document already in step comes back as itself, so opening it cannot mark it dirty');
  const none = program(2);
  assert.equal(W.applyProgramProgression(none), none, 'no rule, no change');
});

test('a deload every 4th week cuts sets 40%, holds the load, and the climb resumes after it', () => {
  const out = W.applyProgramProgression(program(8, { progression: { ...RULE, deloadEvery: 4 } }));
  assert.deepEqual(out.weeks.map((w) => !!w.deload), [false, false, false, true, false, false, false, true]);
  assert.deepEqual(loads(out, squat), [225, 230, 235, 235, 240, 245, 250, 250]);
  assert.deepEqual(out.weeks.map((_, wi) => squat(out, wi).sets), [4, 4, 4, 2, 4, 4, 4, 2], 'a deload week keeps 60% of the sets');
  // Moving the cadence gives week 4 its sets back rather than leaving it short with no flag.
  const moved = W.applyProgramProgression({ ...out, progression: { ...RULE, deloadEvery: 5 } });
  assert.deepEqual(moved.weeks.map((w) => !!w.deload), [false, false, false, false, true, false, false, false]);
  assert.equal(squat(moved, 3).sets, 4, 'week 4 left the cadence and kept its cut sets');
  assert.equal('deloadFrom' in squat(moved, 3), false);
});

test('per cent of 1RM stops at 100, and a ladder follows week 1 set by set with its own reps', () => {
  const b = program(3, { progression: { amount: 10, unit: 'pct', kinds: ['main'] } });
  b.weeks.forEach((w) => Object.assign(w.days[0].blocks[1].rows[0], { loadType: 'pct', load: 85, perSet: [{ load: 80 }, { load: 85 }, { load: 0 }] }));
  b.weeks[2].days[0].blocks[1].rows[0].perSet = [{ reps: '5', load: 1 }, { reps: '3' }];
  const out = W.applyProgramProgression(b);
  assert.deepEqual(loads(out, squat), [85, 95, 100]);
  assert.deepEqual(squat(out, 2).perSet, [{ reps: '5', load: 100 }, { reps: '3', load: 100 }, { load: 0 }], 'week 3\'s reps are its own; its weights are week 1\'s plus two steps; a set with no weight stays one');
});

test('a load typed by hand in a later week stays, and the rule finds a move by name, not by place', () => {
  const b = program(3, { progression: RULE });
  squat(b, 2).load = 300; squat(b, 2).loadPinned = true;
  // A move added before Back squat in week 2's main block does not hand it someone else's weight.
  b.weeks[1].days[0].blocks[1].rows.unshift(row('Pause squat', 'pause', { loadType: 'lb', load: 185 }));
  const out = W.applyProgramProgression(b);
  assert.equal(out.weeks[1].days[0].blocks[1].rows[1].load, 230, 'the move after an inserted one is still matched to itself');
  assert.equal(out.weeks[1].days[0].blocks[1].rows[0].load, 185, 'a move week 1 does not have is left alone');
  assert.equal(squat(out, 2).load, 300, 'a pinned load was overwritten');
  assert.equal(W.progressionStatus(out, 2, 0, 1, 0), 'pinned');
  assert.equal(W.progressionStatus(out, 1, 0, 1, 1), 'follows');
  assert.equal(W.progressionStatus(out, 0, 0, 1, 0), 'source');
  assert.equal(W.progressionStatus(out, 1, 0, 1, 2), '', 'the kg move is not the rule\'s');
  // Week 1 moves the rest.
  squat(out, 0).load = 200;
  const again = W.applyProgramProgression(out);
  const backSquat = (b, wi) => b.weeks[wi].days[0].blocks[1].rows.find((r) => r.name === 'Back squat');
  assert.deepEqual(loads(again, backSquat), [200, 205, 300]);
});

// The Grid's identity for a day is its weekday; the place in the week is only the fallback.
test('a later week\'s day climbs from week 1\'s day on the same weekday, wherever either is listed', () => {
  const b = program(3, { progression: RULE });
  b.weeks[0].days.reverse(); // week 1 lists Thursday first; weeks 2 and 3 list Monday first
  const out = W.applyProgramProgression(b);
  assert.deepEqual(loads(out, (x, wi) => x.weeks[wi].days.find((d) => d.name === 'Lower A').blocks[1].rows[0]), [225, 230, 235]);
  assert.deepEqual(loads(out, (x, wi) => x.weeks[wi].days.find((d) => d.name === 'Upper A').blocks[0].rows[0]), [95, 100, 105]);
  // Deleting week 1's Monday leaves Thursday's climb where it was in every week.
  const gone = W.applyProgramProgression(dbuDeleteDay(W.applyProgramProgression(program(3, { progression: RULE })), 0, 0));
  assert.deepEqual(loads(gone, (x, wi) => x.weeks[wi].days.find((d) => d.name === 'Upper A').blocks[0].rows[0]), [95, 100, 105]);
  assert.equal(W.progressionStatus(gone, 2, 1, 0, 0), 'follows', 'week 3\'s Thursday lost its source when Monday went');
  // A day with no weekday falls back to its place in the week.
  const loose = program(2, { progression: RULE });
  loose.weeks.forEach((w) => w.days.forEach((d) => { delete d.weekday; }));
  assert.equal(squat(W.applyProgramProgression(loose), 1).load, 230);
});

test('an edit pins exactly the loads it changed, matched by id within the day', () => {
  const before = week1().days[0];
  const after = JSON.parse(JSON.stringify(before));
  after.blocks[1].rows[0].load = 250;
  after.blocks[1].rows.reverse();
  after.blocks[0].rows[0].reps = '12';
  const pinned = W.pinLoadEdits(before, after);
  const byId = Object.fromEntries(pinned.blocks.flatMap((b) => b.rows).map((r) => [r.id, r]));
  assert.equal(byId.squat.loadPinned, true);
  assert.equal('loadPinned' in byId.bench, false, 'a move that only moved was pinned');
  assert.equal('loadPinned' in byId.hip, false, 'a reps edit is not a load edit');
  const ladder = JSON.parse(JSON.stringify(before));
  ladder.blocks[1].rows[0].perSet = [{ load: 200 }];
  assert.equal(W.pinLoadEdits(before, ladder).blocks[1].rows[0].loadPinned, true, 'a ladder weight is a load');
  const same = JSON.parse(JSON.stringify(before));
  assert.equal(W.pinLoadEdits(before, same), same, 'nothing changed, yet a new day came back');
});

test('what the client is assigned climbs: the rule survives the save route\'s normaliser and reaches every week\'s rows', () => {
  const built = W.applyProgramProgression(program(4, { progression: { ...RULE, deloadEvery: 4 } }));
  squat(built, 2).loadPinned = 'yes';
  const saved = W.normalizeWorkoutDetail({ builder: built });
  assert.deepEqual(saved.builder.progression, { ...RULE, deloadEvery: 4 }, 'the rule did not survive the save');
  assert.equal('loadPinned' in squat(saved.builder, 2), false, 'a pin is true or absent');
  assert.equal(squat(saved.builder, 3).deloadFrom, 4, 'the deload remembers what it cut');
  assert.equal(W.normalizeWorkoutDetail({ builder: { ...built, progression: { amount: 'lots' } } }).builder.progression, undefined, 'a broken rule is dropped, not half-read');
  assert.deepEqual(W.normalizeWorkoutDetail(saved), saved, 'normalising stays idempotent');
  const rows = W.builderToAssignmentRows(saved.builder, { id: 'p', name: 'Strength' }, '2026-10-12');
  const squatLoad = (week) => rows.find((r) => r.payload.template.week === week && r.title === 'Lower A').payload.exercises.find((e) => e.name === 'Back squat');
  assert.deepEqual([1, 2, 3, 4].map((w) => squatLoad(w).load), ['225 lb', '230 lb', '235 lb', '235 lb']);
  assert.equal(squatLoad(4).sets, '2', 'the deload week is assigned its cut sets');
  assert.equal('loadPinned' in squatLoad(2) || 'deloadFrom' in squatLoad(4), false, 'builder marks leak into what the client gets');
});

test('taking a deload off gives the sets back, unless the coach changed them during it', () => {
  const w = week1();
  const cut = W.deloadWeek(w);
  assert.equal(cut.days[0].blocks[1].rows[0].sets, 2);
  assert.equal(W.deloadWeek(cut).days[0].blocks[1].rows[0].sets, 2, 'deloading a deload cut it twice');
  assert.equal(W.undeloadWeek(cut).days[0].blocks[1].rows[0].sets, 4);
  cut.days[0].blocks[1].rows[0].sets = 3;
  assert.equal(W.undeloadWeek(cut).days[0].blocks[1].rows[0].sets, 3, 'a set count changed during the deload is the coach\'s');
  assert.equal(DashBuilder.undeloadWeek(DashBuilder.deloadWeek(w)).days[0].blocks[1].rows[0].sets, 4, 'the week tools use the same rule');
});

// ── Copy and delete, as functions ───────────────────────────────────────────
test('a week list reads the way a coach says it', () => {
  assert.equal(dbuWeekList([4]), 'week 4');
  assert.equal(dbuWeekList([3, 2]), 'weeks 2 and 3');
  assert.equal(dbuWeekList([2, 3, 4, 5, 6, 7, 8]), 'weeks 2–8');
  assert.equal(dbuWeekList([2, 3, 5]), 'weeks 2, 3 and 5');
  assert.equal(dbuWeekList([2, 3, 4, 7]), 'weeks 2–4 and 7');
});

test('copying a day lands in its weekday\'s slot, replaces only that slot, and is a day of its own', () => {
  const d = program(3);
  d.weeks[1].days = [d.weeks[1].days[1]]; // week 2: only Thursday; Monday is free
  d.weeks[2].days[0] = { id: 'lb', name: 'Lower B', weekday: 0, blocks: [{ kind: 'main', rows: [row('Deadlift', 'dl')] }] };
  const out = dbuCopyDayToWeeks(d, 0, 0, [1, 2]);
  assert.deepEqual(out.weeks[1].days.map((x) => x.name), ['Lower A', 'Upper A'], 'the copy is not in weekday order');
  assert.deepEqual(out.weeks[2].days.map((x) => x.name), ['Lower A', 'Upper A'], 'Lower B was not replaced in its slot');
  const ids = [out.weeks[0].days[0], out.weeks[1].days[0], out.weeks[2].days[0]].map((x) => x.id);
  assert.equal(new Set(ids).size, 3, 'a copy shares its source\'s day id');
  assert.equal(out.weeks[1].days[0].blocks[1].rows.some((r) => r.id === 'squat'), false, 'a copied move shares its source\'s id');
  assert.equal(out.weeks[0], d.weeks[0], 'the source week changed');
  assert.equal(dbuCopyDayToWeeks(d, 0, 0, [0]), d, 'copying a day onto its own week does nothing');
  // A day with no weekday takes the target's next free one, as Duplicate does.
  const loose = program(2); delete loose.weeks[0].days[0].weekday;
  const placed = dbuCopyDayToWeeks(loose, 0, 0, [1]);
  assert.equal(placed.weeks[1].days.length, 3);
  assert.equal(new Set(placed.weeks[1].days.map((x) => x.weekday)).size, 3, 'the copy collided with a day already there');
  // Out of a deload week into a training week, the copy has its full sets.
  const dl = program(2); dl.weeks[0] = W.deloadWeek(dl.weeks[0]);
  assert.equal(dbuCopyDayToWeeks(dl, 0, 0, [1]).weeks[1].days[0].blocks[1].rows[0].sets, 4);
  assert.deepEqual(dbuDeleteDay(d, 0, 1).weeks[0].days.map((x) => x.name), ['Lower A']);
  assert.equal(dbuDeleteDay(d, 0, 1).weeks[1], d.weeks[1], 'deleting touched another week');
});

// ── The real builder ────────────────────────────────────────────────────────
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); });
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
const key = (el, k) => React.act(async () => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
function capture() {
  const writes = [];
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(opts.body); writes.push(body); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: 1 } } }) }; };
  return writes;
}
async function mount(builder) {
  const writes = capture();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Strength', detail: { builder } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {} })));
  return writes;
}
const save = async (writes) => { await click(button('Save template')); return writes.at(-1).detail.builder; };
const bar = () => document.querySelector('.dprog[aria-label="Progression"]');
const cells = () => [...document.querySelectorAll('.wg button.c:not(.rest)')];

test('the bar sets one rule, and every later week of the saved program carries its loads', async () => {
  const writes = await mount(program(4));
  assert.match(bar().textContent, /Off\. Each week’s loads are the ones you type\./);
  await click(button('＋ Add a progression'));
  // The unit most of week 1's main lifts are typed in: two in lb, one in kg.
  assert.equal(byAria('Unit of the weekly increase').value, 'lb');
  assert.equal(byAria('Load added each week').value, '5');
  assert.match(bar().textContent, /2 moves from week 1 go up 5 lb each week\. Back squat reaches 240 lb in week 4\./);
  assert.match(bar().textContent, /1 move in another unit stays as written\./, 'the bar does not say the kg move is left alone');
  await setValue(byAria('Load added each week'), '10');
  await setValue(byAria('Deload weeks'), '4');
  assert.match(bar().textContent, /Week 4 deloads: about 40% fewer sets, and loads hold\./);
  const b = await save(writes);
  assert.deepEqual(b.progression, { amount: 10, unit: 'lb', kinds: ['main'], deloadEvery: 4 });
  assert.deepEqual(loads(b, squat), [225, 235, 245, 245]);
  assert.equal(squat(b, 3).sets, 2);
  assert.deepEqual(loads(b, (x, wi) => x.weeks[wi].days[0].blocks[1].rows[1]), [100, 100, 100, 100]);
  await setValue(byAria('Moves the progression applies to'), 'main,accessory');
  assert.deepEqual(loads(await save(writes), (x, wi) => x.weeks[wi].days[0].blocks[2].rows[0]), [70, 80, 90, 90], 'widening the rule to accessories did not reach them');
  // The week's own Deload belongs to the cadence now, and Progress is gone.
  assert.ok(!button('Progress'), 'the retired Progress tool is back');
  assert.ok(buttons().filter((x) => x.textContent === 'Deload').every((x) => x.disabled), 'a week\'s Deload fights the cadence');
});

test('clearing the amount to type a new one never writes a rule of nothing', async () => {
  const writes = await mount(program(3, { progression: RULE }));
  const amount = byAria('Load added each week');
  await React.act(async () => amount.focus());
  await setValue(amount, '');
  assert.equal(amount.value, '', 'the field does not hold what is being typed');
  await setValue(amount, '2.5');
  const b = await save(writes);
  assert.equal(b.progression.amount, 2.5);
  assert.deepEqual(loads(b, squat), [225, 227.5, 230]);
});

test('a load typed over the rule in a later week is pinned, marked, and can follow the rule again', async () => {
  const writes = await mount(program(3, { progression: RULE }));
  await click(document.querySelector('.seg button[title="Sheet view"]'));
  await setValue(byAria('Load, Back squat, week 3'), '250');
  let b = await save(writes);
  assert.equal(squat(b, 2).load, '250'); assert.equal(squat(b, 2).loadPinned, true);
  assert.match(bar().textContent, /1 load you typed by hand stays as typed\./);
  // Week 1 still moves the rest, around the pin.
  await setValue(byAria('Load, Back squat, week 1'), '200');
  b = await save(writes);
  assert.deepEqual(loads(b, squat), ['200', 205, '250']);
  await click(byAria('Follow the progression again, Back squat, week 3'));
  b = await save(writes);
  assert.deepEqual(loads(b, squat), ['200', 205, 210]);
  assert.equal('loadPinned' in squat(b, 2), false);
});

test('in a later week\'s day editor too: a typed load is pinned, said in the detail, and released', async () => {
  const writes = await mount(program(3, { progression: RULE }));
  await click(cells()[2]); // week 2, Monday
  assert.match(document.querySelector('.drawer .when').textContent, /^Week 2/);
  const squatLine = () => [...document.querySelectorAll('.dr')].find((l) => l.querySelector('.nm').textContent === 'Back squat');
  assert.ok(squatLine().querySelector('.mk [title="This week’s load is set by the program’s progression"]'), 'the line does not say the rule sets it');
  await setValue(byAria('Back squat load'), '300');
  assert.equal(squat(await save(writes), 1).loadPinned, true);
  assert.ok(squatLine().querySelector('.mk [title="This week’s load was typed by hand"]'));
  await click(squatLine().querySelector('.nm'));
  assert.match(document.querySelector('aside.ddetail .dprg').textContent, /You set this week’s load by hand\./);
  await click(button('Follow the progression'));
  const b = await save(writes);
  assert.equal(squat(b, 1).load, 230);
  assert.equal('loadPinned' in squat(b, 1), false);
});

test('turning the progression off keeps every load where it is and drops the marks', async () => {
  const start = W.applyProgramProgression(program(3, { progression: RULE }));
  squat(start, 2).loadPinned = true; squat(start, 2).load = 260;
  const writes = await mount(start);
  await click(button('Turn off'));
  const b = await save(writes);
  assert.equal('progression' in b, false);
  assert.deepEqual(loads(b, squat), [225, 230, 260], 'turning it off rewrote the loads');
  assert.equal(b.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((x) => x.rows))).some((r) => 'loadPinned' in r), false);
  assert.match(bar().textContent, /^↗︎ProgressionOff/);
});

test('Delete day asks first, inside the panel; Keep it and Escape change nothing', async () => {
  const writes = await mount(program(2));
  await click(button('Delete day'));
  const strip = document.querySelector('.drawer .dtool.warn');
  assert.ok(strip, 'no confirm');
  assert.equal(strip.querySelector('p').textContent, 'Delete Lower A from week 1? Its 4 moves go with it. Other weeks keep theirs.');
  assert.equal(document.activeElement.textContent, 'Keep it', 'the safe answer does not have the focus');
  await click(button('Keep it'));
  assert.ok(!document.querySelector('.dtool'));
  await click(button('Delete day'));
  await key(document.querySelector('.dtool.warn button'), 'Escape');
  assert.ok(!document.querySelector('.dtool'), 'Escape did not keep the day');
  assert.ok(document.querySelector('.drawer'), 'Escape on the confirm closed the whole day editor');
  assert.equal((await save(writes)).weeks[0].days.length, 2, 'a cancelled delete deleted');
});

test('Delete removes that week\'s day only, closes the editor, says so and hands focus back', async () => {
  const writes = await mount(program(2));
  await React.act(async () => { cells()[3].focus(); cells()[3].click(); }); // week 2, Thursday
  await click(button('Delete day'));
  await click(button('Delete Upper A'));
  const b = await save(writes);
  assert.deepEqual(b.weeks.map((w) => w.days.map((d) => d.name)), [['Lower A', 'Upper A'], ['Lower A']]);
  assert.ok(!document.querySelector('.drawer'), 'the editor stayed open on a day that is gone');
  assert.equal(document.querySelector('.dmsg[role="status"]').textContent, 'Upper A deleted from week 2.');
  assert.ok(document.activeElement && document.activeElement.classList.contains('c'), 'focus was left nowhere');
  assert.match(document.activeElement.textContent, /Add session/, 'focus is not on the cell the day left');
});

test('the only day in a program cannot be deleted, and a one-week program has nowhere to copy to', async () => {
  const one = program(1); one.weeks[0].days = [one.weeks[0].days[0]];
  await mount(one);
  assert.equal(button('Delete day').disabled, true);
  assert.equal(button('Copy to weeks').disabled, true);
});

test('Copy to weeks names what lands where before it copies, and the copies climb in their weeks', async () => {
  const d = program(4, { progression: RULE });
  d.weeks[1].days = [d.weeks[1].days[1]];
  d.weeks[2].days[0] = { id: 'empty', name: 'Day 1', weekday: 0, playlist: null, blocks: [{ kind: 'main', rows: [] }] };
  d.weeks[3].days[0] = { id: 'lb', name: 'Lower B', weekday: 0, playlist: null, blocks: [{ kind: 'main', rows: [row('Deadlift', 'dl'), row('Row', 'rw')] }] };
  const writes = await mount(d);
  await click(button('Copy to weeks'));
  const strip = document.querySelector('.drawer .dtool');
  assert.equal(strip.querySelector('p').textContent, 'Copy Lower A to the Monday of other weeks. A day already there is replaced.');
  assert.deepEqual([...strip.querySelectorAll('.dwk')].map((l) => l.textContent), ['Week 2Monday is free', 'Week 3replaces Day 1, empty', 'Week 4replaces Lower B, 2 moves']);
  assert.equal(button('Choose weeks').disabled, true);
  await click(button('All later weeks'));
  await click(button('Copy to 3 weeks · replaces 2 days'));
  const b = await save(writes);
  assert.deepEqual(b.weeks.map((w) => w.days.map((x) => x.name)), [['Lower A', 'Upper A'], ['Lower A', 'Upper A'], ['Lower A', 'Upper A'], ['Lower A', 'Upper A']]);
  assert.deepEqual(loads(b, squat), [225, 230, 235, 240], 'a copy did not take its own week\'s load from the progression');
  assert.equal(document.querySelector('.dmsg[role="status"]').textContent, 'Lower A copied to weeks 2–4.');
  assert.ok(!document.querySelector('.dtool'), 'the strip stayed open');
});

test('a week ticked by hand is the only one copied to', async () => {
  const writes = await mount(program(3));
  await click(button('Copy to weeks'));
  const [w2] = [...document.querySelectorAll('.dtool .dwk input')];
  await click(w2);
  await click(button('Copy to 1 week · replaces 1 day'));
  const b = await save(writes);
  assert.notEqual(b.weeks[1].days[0].id, 'lower', 'week 2 still holds its old Lower A');
  assert.equal(b.weeks[2].days[0].id, 'lower', 'week 3 was not ticked and changed anyway');
});
