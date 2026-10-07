// tests/builder-followups.test.mjs
//
// Two follow-ups to step 3 of the builder plan (the program's progression), asked for by the
// owner on 2026-10-07: "complete this — The app's coach editor doesn't know the progression
// rule. If week 1 is edited in the app, the later weeks catch up the next time the program is
// opened on the website. — There's no progression for RPE."
//
//   · the RPE climb: `progression.rpe = { step, cap }`, "RPE +0.5 a week, up to 9", on the
//     moves of the rule's blocks that have an RPE in week 1, matched as loads are; deload
//     weeks go back to week 1's RPE; an RPE picked by hand in a later week is pinned
//     (`rpePinned`) and can follow the rule again;
//   · the app's coach editor runs every edit through the same rule (`applyProgramProgression`,
//     `pinLoadEdits`), states the rule in a read-only line, and the app's save door
//     (`persistCoachWorkout`) leaves every saved program in step.
//
// The arithmetic is driven directly; the website's bar and day editor and the app's editor
// are mounted for real under jsdom. ⚠ EVERY DOM CHECK COMPARES A BOOLEAN OR A STRING, never a
// node (tests/assert-dom-value.test.mjs).
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
const { DbuBuilder } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuBuilder };' });
// The app's editor, as tests/coach-mobile-editor.test.mjs mounts it.
const app = (f) => fileURLToPath(new URL('../mobile-app/src/' + f, import.meta.url));
const registry = new Map([['react', React]]);
registry.set('./BSWorkoutFutureUpdates.jsx', await loadRealModule(app('broadsheet/BSWorkoutFutureUpdates.jsx'), { registry: new Map(registry) }));
const { default: AppEditor } = await loadRealModule(app('broadsheet/BSWorkoutDocumentEditor.jsx'), { registry });
const { persistCoachWorkout } = await import('../mobile-app/src/services/coachWorkoutLibrary.mjs');
window.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-a' } }) };

// ── Fixtures ────────────────────────────────────────────────────────────────
const row = (name, id, extra) => ({ ...DashBuilder.newRow({ name }), id, ...extra });
function week1() {
  return { deload: false, days: [
    { id: 'lower', name: 'Lower A', weekday: 0, playlist: null, blocks: [
      { kind: 'warmup', rows: [row('Hip flow', 'hip', { rpe: 5 })] },
      { kind: 'main', rows: [row('Back squat', 'squat', { loadType: 'lb', load: 225, sets: 4, rpe: 7 }), row('Bench press', 'bench', { loadType: 'kg', load: 100, rpe: 7.5 }), row('Push-up', 'push', { load: '', rpe: '' })] },
      { kind: 'accessory', rows: [row('Leg curl', 'curl', { loadType: 'lb', load: 70, rpe: 8 })] },
    ] },
    { id: 'upper', name: 'Upper A', weekday: 3, playlist: null, blocks: [
      { kind: 'main', rows: [row('Overhead press', 'ohp', { loadType: 'lb', load: 95, rpe: 6 })] },
    ] },
  ] };
}
const program = (weeks = 4, extra = {}) => ({ version: 1, weeks: Array.from({ length: weeks }, () => JSON.parse(JSON.stringify(week1()))), ...extra });
const RULE = { amount: 5, unit: 'lb', kinds: ['main'], deloadEvery: 0 };
const CLIMB = { ...RULE, rpe: { step: 0.5, cap: 9 } };
const at = (b, wi, di, bi, ri) => b.weeks[wi].days[di].blocks[bi].rows[ri];
const squat = (b, wi) => at(b, wi, 0, 1, 0);
const series = (b, pick, field) => b.weeks.map((_, wi) => pick(b, wi)[field]);

// ── The RPE climb, as arithmetic ────────────────────────────────────────────
test('the RPE climb is kept only as a valid one, on the editors\' half-point scale', () => {
  assert.deepEqual(W.normalizeProgression(CLIMB).rpe, { step: 0.5, cap: 9 });
  assert.deepEqual(W.normalizeProgression({ ...RULE, rpe: { step: '1', cap: '8.5' } }).rpe, { step: 1, cap: 8.5 }, 'stored strings are read');
  assert.deepEqual(W.normalizeProgression({ ...RULE, rpe: { step: 0.3, cap: 9.2 } }).rpe, { step: 0.5, cap: 9 }, 'values off the half-point grid are put on it');
  assert.deepEqual(W.normalizeProgression({ ...RULE, rpe: { step: 5, cap: 14 } }).rpe, { step: 2, cap: 10 }, 'a step past 2 or a cap past 10 is clamped');
  assert.deepEqual(W.normalizeProgression({ ...RULE, rpe: { step: 1 } }).rpe, { step: 1, cap: 10 }, 'no cap is the top of the scale');
  assert.equal(W.normalizeProgression({ ...RULE, rpe: { step: 1, cap: -3 } }).rpe.cap, 1);
  for (const bad of [null, 'fast', { step: 0 }, { step: -1 }, { step: 0.2 }, { step: 'x' }, {}]) {
    const r = W.normalizeProgression({ ...RULE, rpe: bad });
    assert.equal('rpe' in r, false, JSON.stringify(bad) + ' was read as a climb');
    assert.equal(r.amount, 5, 'a broken RPE climb dropped the load rule beside it');
  }
  assert.deepEqual(W.normalizeProgression(RULE), RULE, 'a rule with no climb grew an rpe key');
  assert.deepEqual(W.normalizeProgression(W.normalizeProgression(CLIMB)), W.normalizeProgression(CLIMB), 'not idempotent');
});

test('RPE +0.5 a week climbs from week 1 to the cap, on the rule\'s blocks only, matched as loads are', () => {
  const out = W.applyProgramProgression(program(6, { progression: CLIMB }));
  assert.deepEqual(series(out, squat, 'rpe'), [7, 7.5, 8, 8.5, 9, 9], 'the squat does not climb half a point a week to 9');
  assert.deepEqual(series(out, squat, 'load'), [225, 230, 235, 240, 245, 250], 'the load climb changed');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 0, 1, 1), 'rpe'), [7.5, 8, 8.5, 9, 9, 9], 'a kg move under an lb rule climbs by RPE, not by load');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 0, 1, 1), 'load'), [100, 100, 100, 100, 100, 100]);
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 0, 1, 2), 'rpe'), ['', '', '', '', '', ''], 'a move with no RPE in week 1 was given one');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 0, 2, 0), 'rpe'), [8, 8, 8, 8, 8, 8], 'an accessory is outside a main-lifts rule');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 0, 0, 0), 'rpe'), [5, 5, 5, 5, 5, 5], 'a warm-up is outside a main-lifts rule');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 1, 0, 0), 'rpe'), [6, 6.5, 7, 7.5, 8, 8.5], 'every day of the week climbs');
  // Never below week 1's own RPE, whatever the cap.
  const high = program(3, { progression: { ...RULE, rpe: { step: 1, cap: 6 } } });
  assert.deepEqual(series(W.applyProgramProgression(high), squat, 'rpe'), [7, 7, 7], 'a cap below week 1 lowered the RPE');
  // Matched by name within the block kind, not by place: a move inserted before it in week 2.
  const moved = program(2, { progression: CLIMB });
  moved.weeks[1].days[0].blocks[1].rows.unshift(row('Pause squat', 'pause', { loadType: 'lb', load: 185, rpe: 6 }));
  const m = W.applyProgramProgression(moved);
  assert.equal(m.weeks[1].days[0].blocks[1].rows[1].rpe, 7.5, 'the squat lost its climb to a move inserted before it');
  assert.equal(m.weeks[1].days[0].blocks[1].rows[0].rpe, 6, 'a move week 1 does not have was given an RPE');
  assert.equal(W.applyProgramProgression(out), out, 'a program in step with its climb came back as a new object');
});

test('every RPE the climb writes is one both editors can show', () => {
  const STEPS = Array.from({ length: 19 }, (_, i) => Math.round((1 + i * 0.5) * 10) / 10);
  const long = program(20, { progression: { ...RULE, kinds: ['warmup', 'main', 'accessory', 'finisher'], rpe: { step: 1, cap: 10 }, deloadEvery: 5 } });
  const out = W.applyProgramProgression(long);
  const written = out.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.rows.map((r) => r.rpe)))).filter((v) => v !== '');
  assert.equal(written.length, 100, 'the five moves with an RPE, over twenty weeks');
  assert.equal(written.every((v) => STEPS.includes(v) && W.rpeValue({ rpe: v }) === v), true, 'an RPE off the 1–10 half-point scale: ' + written.filter((v) => !STEPS.includes(v)).join(', '));
  assert.equal(Math.max(...written), 10);
});

test('a deload week goes back to week 1\'s RPE and takes no step; the climb resumes after it', () => {
  const out = W.applyProgramProgression(program(8, { progression: { ...CLIMB, deloadEvery: 4 } }));
  assert.deepEqual(out.weeks.map((w) => !!w.deload), [false, false, false, true, false, false, false, true]);
  assert.deepEqual(series(out, squat, 'rpe'), [7, 7.5, 8, 7, 8.5, 9, 9, 7]);
  assert.deepEqual(series(out, squat, 'load'), [225, 230, 235, 235, 240, 245, 250, 250], 'loads still hold the week before');
  assert.deepEqual(series(out, (b, wi) => at(b, wi, 1, 0, 0), 'rpe'), [6, 6.5, 7, 6, 7.5, 8, 8.5, 6]);
});

test('an RPE picked by hand in a later week is pinned and kept; following the rule again puts the climb back', () => {
  const b = W.applyProgramProgression(program(3, { progression: CLIMB }));
  const before = b.weeks[2].days[0];
  const after = JSON.parse(JSON.stringify(before));
  after.blocks[1].rows[0].rpe = 9.5;
  const pinned = W.pinLoadEdits(before, after, b.progression);
  assert.equal(pinned.blocks[1].rows[0].rpePinned, true);
  assert.equal('loadPinned' in pinned.blocks[1].rows[0], false, 'an RPE edit pinned the load');
  b.weeks[2].days[0] = pinned;
  assert.equal(W.rpeProgressionStatus(b, 2, 0, 1, 0), 'pinned');
  assert.equal(W.rpeProgressionStatus(b, 1, 0, 1, 0), 'follows');
  assert.equal(W.rpeProgressionStatus(b, 0, 0, 1, 0), 'source');
  assert.equal(W.rpeProgressionStatus(b, 1, 0, 1, 2), '', 'a move with no RPE in week 1 reads as the climb\'s');
  assert.equal(W.rpeProgressionStatus(b, 1, 0, 2, 0), '', 'an accessory reads as a main-lifts climb\'s');
  // Week 1 moves the rest, around the pin.
  b.weeks[0].days[0].blocks[1].rows[0].rpe = 6;
  const again = W.applyProgramProgression(b);
  assert.deepEqual(series(again, squat, 'rpe'), [6, 6.5, 9.5]);
  assert.equal(squat(again, 2).load, 235, 'a pinned RPE stopped the load climbing');
  // Follow the progression again, for the RPE only.
  again.weeks[2].days[0].blocks[1].rows[0] = W.unpinned(squat(again, 2), 'rpe');
  assert.deepEqual(series(W.applyProgramProgression(again), squat, 'rpe'), [6, 6.5, 7]);
  // Without a climb an RPE edit pins nothing: nothing would put it back.
  assert.equal('rpePinned' in W.pinLoadEdits(before, after, RULE).blocks[1].rows[0], false);
  assert.equal('rpePinned' in W.pinLoadEdits(before, after).blocks[1].rows[0], false);
  // Clearing an RPE in a later week is a choice too.
  const cleared = JSON.parse(JSON.stringify(before)); cleared.blocks[1].rows[0].rpe = '';
  assert.equal(W.pinLoadEdits(before, cleared, CLIMB).blocks[1].rows[0].rpePinned, true);
  // unpinned takes off only the axis it names.
  const both = { id: 'x', loadPinned: true, rpePinned: true };
  assert.deepEqual([W.unpinned(both, 'load'), W.unpinned(both, 'rpe'), W.unpinned(both)], [{ id: 'x', rpePinned: true }, { id: 'x', loadPinned: true }, { id: 'x' }]);
});

test('a program without an RPE climb keeps every RPE as written', () => {
  const b = program(3, { progression: RULE });
  squat(b, 2).rpe = 9;
  const out = W.applyProgramProgression(b);
  assert.deepEqual(series(out, squat, 'rpe'), [7, 7, 9]);
  assert.deepEqual(series(out, squat, 'load'), [225, 230, 235]);
  assert.equal(W.rpeProgressionStatus(out, 1, 0, 1, 0), '');
});

test('the save route\'s normaliser keeps the climb and the pins, and what the client is assigned climbs', () => {
  const built = W.applyProgramProgression(program(4, { progression: { ...CLIMB, deloadEvery: 4 } }));
  squat(built, 1).rpePinned = true; squat(built, 2).rpePinned = 'yes';
  const saved = W.normalizeWorkoutDetail({ builder: built });
  assert.deepEqual(saved.builder.progression, { ...CLIMB, deloadEvery: 4 }, 'the RPE climb did not survive the save');
  assert.equal(squat(saved.builder, 1).rpePinned, true);
  assert.equal('rpePinned' in squat(saved.builder, 2), false, 'a pin is true or absent');
  assert.deepEqual(W.normalizeWorkoutDetail(saved), saved, 'normalising stays idempotent');
  const rows = W.builderToAssignmentRows(saved.builder, { id: 'p', name: 'Strength' }, '2026-10-12');
  const squatOf = (week) => rows.find((r) => r.payload.template.week === week && r.title === 'Lower A').payload.exercises.find((e) => e.name === 'Back squat');
  assert.deepEqual([1, 2, 3, 4].map((w) => squatOf(w).rpe), [7, 7.5, 8, 7]);
  assert.deepEqual([1, 2, 3, 4].map((w) => squatOf(w).load), ['225 lb · RPE 7', '230 lb · RPE 7.5', '235 lb · RPE 8', '235 lb · RPE 7']);
  assert.equal(Object.keys(squatOf(2)).some((k) => /Pinned/.test(k)), false, 'a builder mark leaks into what the client gets');
});

// ── The website's bar and day editor ────────────────────────────────────────
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); });
const buttons = () => [...document.querySelectorAll('button')];
const button = (t) => buttons().find((b) => b.textContent === t);
const click = async (el) => { assert.ok(el, 'missing control'); await React.act(async () => el.click()); };
const byAria = (label) => document.querySelector('[aria-label="' + label + '"]');
async function setValue(el, value) {
  assert.ok(el, 'missing field');
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function mountWebsite(builder) {
  const writes = [];
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(opts.body); writes.push(body); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: 1 } } }) }; };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Strength', detail: { builder } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {} })));
  return writes;
}
const save = async (writes) => { await click(button('Save template')); return writes.at(-1).detail.builder; };
const bar = () => document.querySelector('.dprog[aria-label="Progression"]');

test('the bar\'s RPE group turns the climb on, caps it, names it, and turns it off with every RPE kept', async () => {
  const writes = await mountWebsite(program(4, { progression: RULE }));
  const step = byAria('RPE added each week');
  assert.equal(step.value, '0');
  assert.deepEqual([...step.options].map((o) => o.textContent), ['RPE as typed', 'RPE +0.5 a week', 'RPE +1 a week']);
  assert.ok(!byAria('Highest RPE'), 'a cap is offered for a climb that is off');
  assert.equal(/RPE/.test(bar().querySelector('.dp-s').textContent), false, 'the sentence names a climb that is off');
  await setValue(step, '0.5');
  assert.equal(byAria('Highest RPE').value, '9', 'the climb does not start capped at 9');
  assert.match(bar().textContent, /RPE goes up 0\.5 a week on 3 moves, up to 9\./, 'the squat, the kg bench and the press: the climb is not tied to the load unit');
  let b = await save(writes);
  assert.deepEqual(b.progression, { ...RULE, rpe: { step: 0.5, cap: 9 } });
  assert.deepEqual(series(b, squat, 'rpe'), [7, 7.5, 8, 8.5]);
  await setValue(byAria('Highest RPE'), '8');
  await setValue(byAria('Deload weeks'), '4');
  assert.match(bar().textContent, /Week 4 deloads: about 40% fewer sets, loads hold, and RPE goes back to week 1’s\./);
  b = await save(writes);
  assert.deepEqual(b.progression.rpe, { step: 0.5, cap: 8 });
  assert.deepEqual(series(b, squat, 'rpe'), [7, 7.5, 8, 7]);
  await setValue(byAria('Deload weeks'), '0');
  await setValue(byAria('RPE added each week'), '0');
  b = await save(writes);
  assert.equal('rpe' in b.progression, false, 'turning the climb off kept it');
  assert.deepEqual(series(b, squat, 'rpe'), [7, 7.5, 8, 8], 'turning the climb off rewrote the RPEs');
  assert.ok(!byAria('Highest RPE'), 'the cap outlived the climb');
  // One bar, one more group: the RPE controls sit in the bar's own row.
  assert.equal(document.querySelectorAll('.dprog').length, 1);
});

test('an RPE picked in a later week\'s day editor is pinned, marked, said in the detail, and follows again', async () => {
  const writes = await mountWebsite(program(3, { progression: CLIMB }));
  await click([...document.querySelectorAll('.wg button.c:not(.rest)')][2]); // week 2, Monday
  const squatLine = () => [...document.querySelectorAll('.dr')].find((l) => l.querySelector('.nm').textContent === 'Back squat');
  await setValue(byAria('Back squat target RPE'), '9.5');
  let b = await save(writes);
  assert.equal(squat(b, 1).rpe, 9.5);
  assert.equal(squat(b, 1).rpePinned, true);
  assert.equal('loadPinned' in squat(b, 1), false, 'picking an RPE pinned the load');
  assert.ok(squatLine().querySelector('.mk [title="This week’s RPE was picked by hand"]'), 'the line does not mark the hand-picked RPE');
  assert.match(bar().textContent, /1 RPE you picked by hand stays as picked\./);
  await click(squatLine().querySelector('.nm'));
  assert.match(document.querySelector('aside.ddetail').textContent, /You picked this week’s RPE by hand\./);
  await click(byAria('Follow the progression for this RPE'));
  b = await save(writes);
  assert.equal(squat(b, 1).rpe, 7.5);
  assert.equal('rpePinned' in squat(b, 1), false);
  assert.match(document.querySelector('aside.ddetail').textContent, /This week’s RPE is set by the progression\./);
  // A move whose load the rule leaves alone still shows that its RPE climbs.
  const bench = [...document.querySelectorAll('.dr')].find((l) => l.querySelector('.nm').textContent === 'Bench press');
  assert.ok(bench.querySelector('.mk [title="This week’s RPE is set by the program’s progression"]'), 'the kg move\'s RPE climb is not marked');
});

// ── The app's coach editor ──────────────────────────────────────────────────
const theme = { INK: '#fff', INK50: '#bbb', RULE: '#555', PAPER: '#111', RUST: '#f88', MONO: 'monospace', DISPLAY: 'serif', BODY: 'sans-serif' };
const tr = (_key, options) => options.defaultValue.replace(/\{(\w+)\}/g, (_all, name) => options[name] ?? name);
async function mountApp(builder, extra = {}) {
  localStorage.clear();
  const saves = [];
  root = createRoot(document.getElementById('root'));
  const plan = { id: 'plan-1', name: 'Strength', detail: { revision: 2, builder }, ...extra };
  await React.act(async () => root.render(React.createElement(AppEditor, { plan, plans: [], t: theme, tr, onClose() {}, onSave: async (p) => { saves.push(JSON.parse(JSON.stringify(p))); } })));
  return saves;
}
const appSave = async (saves) => { await click(button('Save draft')); return saves.at(-1).detail.builder; };
const week = (n) => click(button('Week ' + n));
// A field of one move, by the move's legend ("1. Back squat") and the field's caption.
function field(legend, caption) {
  const set = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector(':scope > legend')?.textContent === legend);
  assert.ok(set, 'no move ' + legend);
  const label = [...set.querySelectorAll('label')].find((l) => l.firstChild?.textContent === caption);
  assert.ok(label, 'no field ' + caption + ' on ' + legend);
  return label.querySelector('input, select, textarea');
}
const moveLine = (legend) => [...document.querySelectorAll('fieldset')].find((f) => f.querySelector(':scope > legend')?.textContent === legend).querySelector('[data-progression-row]');

test('the app states the rule in one read-only line, and says nothing for a program without one', async () => {
  await mountApp(program(4, { progression: { ...CLIMB, deloadEvery: 4 } }));
  const note = document.querySelector('[data-progression]');
  assert.ok(note, 'no progression line');
  assert.match(note.textContent, /Progression · \+5 lb a week on main lifts · deload every 4 weeks · RPE \+0\.5 a week, up to 9/);
  assert.match(note.textContent, /Set the rule in the program builder on the website\./);
  assert.equal(note.querySelectorAll('input, select, button').length, 0, 'the line is not read-only');
  await React.act(async () => root.unmount()); root = null;
  await mountApp(program(2, { progression: { amount: 2.5, unit: 'pct', kinds: ['main', 'accessory'] } }));
  assert.match(document.querySelector('[data-progression]').textContent, /\+2\.5% 1RM a week on main and accessory lifts/);
  await React.act(async () => root.unmount()); root = null;
  await mountApp(program(2));
  assert.ok(!document.querySelector('[data-progression]'), 'a program with no rule shows one');
  assert.ok(!document.querySelector('[data-progression-row]'), 'a move of a program with no rule is marked');
});

test('a week 1 edit in the app moves the later weeks before the save, loads and RPEs both', async () => {
  const saves = await mountApp(program(4, { progression: { ...CLIMB, deloadEvery: 4 } }));
  assert.match(moveLine('1. Back squat').textContent, /Later weeks climb from this/);
  await setValue(field('1. Back squat', 'Load'), '200');
  await setValue(field('1. Back squat', 'Target · RPE'), '6');
  await week(3);
  assert.equal(field('1. Back squat', 'Load').value, '210', 'week 3 did not move when week 1 did');
  assert.equal(field('1. Back squat', 'Target · RPE').value, '7');
  assert.match(moveLine('1. Back squat').textContent, /Load set by the progression · RPE set by the progression/);
  const b = await appSave(saves);
  assert.deepEqual(series(b, squat, 'load'), [200, 205, 210, 210]);
  assert.deepEqual(series(b, squat, 'rpe'), [6, 6.5, 7, 6]);
  assert.deepEqual(b.progression, { ...CLIMB, deloadEvery: 4 }, 'the app dropped the rule');
});

test('a load or an RPE typed in a later week in the app is pinned, said on the move, and follows again', async () => {
  const saves = await mountApp(program(3, { progression: CLIMB }));
  await week(2);
  await setValue(field('1. Back squat', 'Load'), '300');
  await setValue(field('1. Back squat', 'Target · RPE'), '9');
  assert.match(moveLine('1. Back squat').textContent, /Load typed by hand · RPE picked by hand/);
  let b = await appSave(saves);
  assert.equal(squat(b, 1).load, 300); assert.equal(squat(b, 1).loadPinned, true);
  assert.equal(squat(b, 1).rpe, 9); assert.equal(squat(b, 1).rpePinned, true);
  // Week 1 still moves the rest, around the pins.
  await week(1);
  await setValue(field('1. Back squat', 'Load'), '200');
  b = await appSave(saves);
  assert.deepEqual(series(b, squat, 'load'), [200, 300, 210]);
  await week(2);
  await click(moveLine('1. Back squat').querySelector('button'));
  assert.ok(!moveLine('1. Back squat').querySelector('button'), 'the follow button stayed');
  b = await appSave(saves);
  assert.equal(squat(b, 1).load, 205); assert.equal(squat(b, 1).rpe, 7.5);
  assert.equal('loadPinned' in squat(b, 1) || 'rpePinned' in squat(b, 1), false);
});

test('the app\'s Copy week copies a week that climbs, not one held by the source week\'s pins', async () => {
  const start = W.applyProgramProgression(program(2, { progression: CLIMB }));
  squat(start, 1).load = 400; squat(start, 1).loadPinned = true;
  const saves = await mountApp(start);
  await week(2);
  await click(button('Copy week'));
  const b = await appSave(saves);
  assert.equal(b.weeks.length, 3);
  assert.equal(squat(b, 1).load, 400, 'the source week lost its pin');
  assert.equal(squat(b, 2).load, 235, 'the copy kept a load typed for another week');
  assert.equal(squat(b, 2).rpe, 8);
});

test('a program with no progression saves from the app exactly as before', async () => {
  const plain = program(3);
  squat(plain, 2).rpe = 9; squat(plain, 2).load = 260;
  const saves = await mountApp(plain);
  await week(1);
  await setValue(field('1. Back squat', 'Load'), '230');
  await week(2);
  await setValue(field('1. Back squat', 'Load'), '240');
  const b = await appSave(saves);
  const want = W.normalizeWorkoutDetail({ builder: plain }).builder;
  squat(want, 0).load = 230; squat(want, 1).load = 240;
  assert.deepEqual(b, want, 'a program with no rule was changed by the rule');
});

test('the app\'s save door leaves every saved program in step, and leaves one with no rule alone', async () => {
  const sent = [];
  const gateway = { create: async (body) => { sent.push(body); return { id: 'new', ...body }; }, update: async (body) => { sent.push(body); return body; } };
  // A program the website left behind: week 1 moved, the later weeks did not.
  const behind = W.applyProgramProgression(program(3, { progression: CLIMB }));
  squat(behind, 0).load = 200; squat(behind, 0).rpe = 6;
  await persistCoachWorkout(gateway, { id: 'p', name: 'Strength', detail: { revision: 1, builder: behind } });
  assert.deepEqual(series(sent[0].detail.builder, squat, 'load'), [200, 205, 210]);
  assert.deepEqual(series(sent[0].detail.builder, squat, 'rpe'), [6, 6.5, 7]);
  assert.match(sent[0].detail.blocks.find((x) => x.week === 2 && x.name === 'Back squat').text, /210 lb · RPE 7/, 'the outline was written from the stale weeks');
  const plain = program(2); squat(plain, 1).load = 999;
  await persistCoachWorkout(gateway, { name: 'Plain', detail: { builder: plain } });
  assert.deepEqual(sent[1].detail.builder, W.normalizeWorkoutDetail({ builder: plain }).builder);
});
