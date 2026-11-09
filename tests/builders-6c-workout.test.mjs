// Coach dashboard step 6c, part 1 (the owner's coach review, 4 Nov 2026): the workout builder and
// the program builder. These mount the SHIPPED builder (dashBuilder.jsx's DbuBuilder) in jsdom with
// the real document, builder-core, tier marks (dashToday.jsx, after dashData.jsx) and filter-bar
// modules, and read what a coach reads:
//   1. a single workout opens a day canvas: no plan, no progression, no ＋ Week, no length; the
//      library open beside the list (search, Legs / Upper / Core, equipment, ✓, ＋ Main, drag);
//      whiteboard rows with tempo and cue in place; a superset as a bracket with "→ A2"; the
//      session's totals, read off the rows and the library's muscle tags; Client view as a tab;
//      one primary action, Assign; "Saved just now" where Save template was;
//   2. a program opens on its plan: weeks across, training days down, a strip of seven letters per
//      week, cards carrying that week's loads with the change on last week, a peek with Open in
//      builder, the progression drawn with its deload weeks and its Now from the roster's legs;
//   3. the program's length in one tap (shorter asks through ShapeConfirm, never confirm());
//   4. sessions to drag in, in their program's colour with the tag in words;
//   5. Assign on the same screen: who is on it from the usage read (never a sample), Update theirs,
//      add-client gems, one button that names them;
//   6. a day's playlist written with its soundtrack id, a legacy one matched by name;
//   7. the retired builder pages redirect to Programs.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/newdesign/TrainerApp.html#programs', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require_('react');
globalThis.React = React; globalThis.ReactDOM = require_('react-dom');
const { createRoot } = require_('react-dom/client');
const DashSignals = require_('../public/newdesign/dashSignals.js');
const ShapeWorkoutDocument = require_('../public/newdesign/workoutDocument.js');
const DashBuilder = require_('../public/newdesign/dashBuilderCore.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const U = await import('../public/newdesign/unitText.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors });
Object.assign(globalThis, {
  DashSignals, ShapeWorkoutDocument, DashBuilder, serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', PAPER: '#1a1612',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
  ShapeVideoAttachment: () => null, ShapeVideoLink: () => null, ShapeVideoPlayer: () => null,
  DashWorkoutCard: ({ workout }) => React.createElement('div', { 'data-client-card': '' }, workout ? workout.title || workout.name || 'card' : ''),
  useRememberedChoices: () => null, useRememberedChoice: (_s, _k, _a, fallback) => React.useState(fallback),
});
const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const share = (mod) => {
  for (const [k, v] of Object.entries(mod)) globalThis[k] = v;
  for (const k of Object.keys(window)) if (!(k in globalThis)) { try { globalThis[k] = window[k]; } catch (e) { /* read-only */ } }
};
share(await loadRealModule(ND('dashData.jsx'), { registry: new Map([['/newdesign/unitText.mjs', U]]), appendExports: 'export { useSignedIn };' }));
share(await loadRealModule(ND('dashToday.jsx'), { appendExports: 'export { DashClientGem, dashRecordTier, dashTierMark, dashRowKeyOpen, DashPill };' }));
share(await loadRealModule(ND('dashFilterBar.jsx'), { appendExports: 'export { useDfbPopShift };' }));
const B = await loadRealModule(ND('dashBuilder.jsx'), { appendExports: 'export { DbuBuilder, DbuDayChips, dbuPlaylistChoice, dbuIsSingle, dbuSavedWords };' });
const { DbuBuilder, DbuDayChips, dbuPlaylistChoice, dbuIsSingle, dbuSavedWords } = B;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const uid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let rid = 0;
const row = (name, sets, reps, loadType, load, extra = {}) => ({ id: 'r' + (++rid), name, sets, reps, loadType, load, rpe: '', tempo: '', rest: '90s', cue: '', video: '', group: null, ...extra });
const legDay = (name = 'Lower A', weekday = 0) => ({ id: 'd' + (++rid), name, weekday, playlist: null, blocks: [
  { kind: 'warmup', rows: [row('Hip 90/90 flow', 2, '5', 'kg', 0)] },
  { kind: 'main', rows: [row('Back squat', 4, '5', 'lb', 255, { rpe: 8, tempo: '3-1-X-1', rest: '2:30' }), row('Romanian deadlift', 3, '8', 'lb', 215)] },
  { kind: 'accessory', rows: [row('Walking lunge', 3, '10', 'lb', 40, { group: 'A', rest: '' }), row('Leg curl', 3, '12', 'lb', 90, { group: 'A', rest: '90s' })] },
  { kind: 'finisher', rows: [row('Plank', 3, '45s', 'kg', 0)] },
] });
const upperDay = () => ({ id: 'd' + (++rid), name: 'Upper A', weekday: 3, playlist: null, blocks: [{ kind: 'main', rows: [row('Bench press', 4, '5', 'lb', 185)] }] });
const single = () => ({ id: uid(102), name: 'Leg day', published: true, detail: { revision: 2, buildType: 'workout', builder: { version: 2, tags: ['hypertrophy'], weeks: [{ deload: false, days: [legDay('Leg day')] }] } } });
const program = (weeks = 4, extra = {}) => {
  const w1 = { deload: false, days: [legDay(), upperDay()] };
  return { id: uid(101), name: 'Strength Block 3', published: true, detail: { revision: 4, buildType: 'program', builder: { version: 3, tags: ['strength'], previewStart: '2026-11-16', progression: { amount: 5, unit: 'lb', kinds: ['main'], deloadEvery: 4 }, weeks: Array.from({ length: weeks }, () => JSON.parse(JSON.stringify(w1))), ...extra } } };
};
const ready = { state: 'ready', checkedAt: new Date().toISOString() };
const person = (n, name, points, week) => ({ profile: { id: uid(n), name }, rankPoints: points, progressRead: ready,
  programs: { trainer: week ? { name: 'Strength Block 3', templateId: uid(101), week, weeks: 4, status: 'active' } : null, nutritionist: null } });
const ROSTER = [person(501, 'Samir D.', 420, 2), person(502, 'Nadine K.', 1250, 0), person(503, 'Pia N.', null, 0)];
const SAMPLE_NAMES = DashSignals.buildMockClients(new Date()).map((c) => c.profile.name);

// ── Harness ───────────────────────────────────────────────────────────────────
let root, calls = [], confirms = [];
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); });
function stubFetch() {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : null;
    calls.push([u, method, body]);
    if (u.includes('/api/trainer/workout')) return { ok: true, status: 200, json: async () => ({ results: (body.clientIds || []).map((clientId) => ({ clientId, status: 'accepted' })) }) };
    if (u.includes('/api/coach/plans') && (method === 'PATCH' || method === 'POST')) return { ok: true, status: 200, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: (body.expectedRevision || 0) + 1 } } }) };
    return { ok: true, status: 200, json: async () => ({ assignments: [], skipped: 0 }) };
  };
}
function stubConfirm(answer) {
  confirms = [];
  window.ShapeConfirm = { open: async (o) => { confirms.push(o); return answer; } };
  window.confirm = () => { throw new Error('window.confirm was called'); };
}
async function mount(template, extra = {}) {
  stubFetch();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], customMoves: [], customTags: [], onBack() {}, onSaved() {}, ...extra })));
}
const text = () => document.body.textContent.replace(/\s+/g, ' ');
const buttons = (scope = document) => [...scope.querySelectorAll('button')];
const button = (t, scope) => buttons(scope).find((b) => b.textContent.trim() === t || b.getAttribute('aria-label') === t);
const click = async (el) => { assert.ok(el, 'missing control'); await React.act(async () => { el.click(); }); };
const byAria = (l) => document.querySelector('[aria-label="' + l + '"]');
async function setValue(el, value) {
  assert.ok(el, 'missing field');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const fire = (el, type) => React.act(async () => { el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })); });
const letter = (wk, wd) => buttons().find((b) => (b.getAttribute('aria-label') || '').startsWith(wd + ', week ' + wk + ':'));
const lineNames = () => [...document.querySelectorAll('.dr .nm')].map((n) => n.textContent);
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// ── 1. The pure rules ─────────────────────────────────────────────────────────
test('the session adds itself up from its rows: working sets, volume per unit, muscles, one note', () => {
  const t = DashBuilder.sessionTotals(legDay());
  assert.equal(t.workingSets, 16, 'the warm-up was counted as working sets');
  // 4×5×255 + 3×8×215 + 3×10×40 + 3×12×90 = 5100 + 5160 + 1200 + 3240
  assert.equal(t.volume.lb, 14700);
  assert.equal(t.volume.kg, 0, 'a move with no weight added kg volume');
  assert.equal(t.unweighed, 1, 'the plank (no weight, a time) is not said to be left out');
  assert.deepEqual(t.muscles.map((m) => m.label + ' ' + m.sets), ['Quads 7', 'Hamstrings 6', 'Core 3']);
  assert.equal(t.pairWith, 'Legs and core only, so pair it with an upper day.');
  assert.equal(t.minutes, null, 'a duration was invented for a day that plans none');
  assert.equal(DashBuilder.sessionTotals({ ...legDay(), plannedMinutes: 55 }).minutes, 55);
  // A ladder counts set by set, and a move the library does not know adds to no muscle.
  const ladder = DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Back squat', 3, '5', 'kg', 100, { perSet: [{ reps: '5', load: 100 }, { reps: '3', load: 110 }, { reps: '1', load: 120 }] }), row('Zercher carry', 2, '20', 'kg', 0)] }] });
  assert.equal(ladder.volume.kg, 5 * 100 + 3 * 110 + 120);
  assert.equal(ladder.untagged, 2);
  assert.equal(DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Bench press', 3, '8', 'lb', 135)] }] }).pairWith, 'Upper body only, so pair it with a legs day.');
  // A day that trains both halves earns no note; the muscles rank by sets, not by the order met;
  // a rep range and a per cent of 1RM have no volume to count.
  const mixed = DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [
    row('Plank', 2, '30s', 'kg', 0), row('Bench press', 3, '8-10', 'lb', 135), row('Back squat', 5, '5', 'pct', 70), row('Leg press', 4, '10', 'kg', 100),
  ] }] });
  assert.equal(mixed.pairWith, '', 'a day with legs and upper body is told to pair with one of them');
  assert.deepEqual(mixed.muscles.map((m) => m.label), ['Quads', 'Chest', 'Core']);
  assert.deepEqual(mixed.volume, { lb: 0, kg: 4000 }, 'a rep range or a per cent of 1RM was counted as volume');
  assert.equal(mixed.unweighed, 3);
  // RPE is an effort, not a weight: a per-set entry on an RPE row adds no kg.
  const effort = DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Back squat', 3, '5', 'rpe', 8, { perSet: [{ reps: '5', load: 8 }, { reps: '5', load: 8 }, { reps: '5', load: 9 }] })] }] });
  assert.deepEqual(effort.volume, { lb: 0, kg: 0 }, 'an RPE was counted as kilograms');
  // Every delivered set counts, past the ladder's 20 (Codex on #2648): 25 straight sets of 5 at 100 kg.
  assert.equal(DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Back squat', 25, '5', 'kg', 100)] }] }).volume.kg, 25 * 5 * 100, 'sets past the 20th added no volume');
  // …and no more than are delivered: WorkoutDoc sends a row 50 sets at most, so 60 reads 50 everywhere.
  const sixty = DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Back squat', 60, '5', 'kg', 100)] }] });
  assert.equal(sixty.workingSets, 50, '60 sets were counted though the client gets 50');
  assert.equal(sixty.volume.kg, 50 * 5 * 100);
  assert.equal(sixty.muscles.reduce((n, m) => n + m.sets, 0) + sixty.untagged, 50, 'the muscle sets were not capped with the rest');
  // A ladder with a set the volume can't count is named, though its other sets count (Codex on #2648).
  const gap = DashBuilder.sessionTotals({ blocks: [{ kind: 'main', rows: [row('Back squat', 3, '5', 'kg', null, { perSet: [{ reps: '5', load: 100 }, { reps: '5', load: null }, { reps: '5', load: 120 }] })] }] });
  assert.equal(gap.volume.kg, 5 * 100 + 5 * 120);
  assert.equal(gap.unweighed, 1, 'a partly counted ladder read as the whole session\'s volume');
});

test('a card\'s change is on the same move in the same unit', () => {
  const doc = ShapeWorkoutDocument.applyProgramProgression(program(2).detail.builder);
  doc.weeks[0].days[0].blocks[1].rows[1].loadType = 'kg';
  assert.deepEqual(DashBuilder.sessionLoadLines(doc, 1, 0).map((l) => l.delta), [5, null], 'a change was worked out across lb and kg');
});

test('a single workout\'s volume reads in each unit it is written in', async () => {
  const t = single();
  t.detail.builder.weeks[0].days[0].blocks = [{ kind: 'main', rows: [row('Leg press', 4, '10', 'kg', 100), row('Back squat', 2, '5', 'lb', 200)] }];
  await mount(t);
  assert.match(document.querySelector('.dtot').textContent, /2k lb · 4k kg volume/);
});

test('the library lists every move, filters by region and equipment, and the bracket counts rounds', () => {
  assert.equal(DashBuilder.libraryMoves([], '', '', '').shape.length, DashBuilder.EXERCISES.length, 'the library is capped');
  const legs = DashBuilder.libraryMoves([], '', 'lower', 'barbell').shape.map((e) => e.name);
  assert.ok(legs.includes('Back squat') && !legs.includes('Bench press') && !legs.includes('Leg press'));
  assert.ok(DashBuilder.libraryMoves([], 'core', 'core', '').shape.length > 0);
  const own = DashBuilder.libraryMoves([{ name: 'Sled drag', muscle: '', equipment: '' }], 'sled', 'lower', '');
  assert.equal(own.mine.length, 0, 'a move with no tag passed a region filter');
  const b = DashBuilder.supersetBracket({ blocks: [{ kind: 'main', rows: [row('A', 4, '8', 'kg', 0, { group: 'a' }), row('B', 3, '8', 'kg', 0, { group: 'A', rest: '2:00' })] }] }, 'A');
  assert.deepEqual({ rounds: b.rounds, last: b.last, rest: b.rest }, { rounds: 3, last: 'A2', rest: '2:00' });
  assert.equal(DashBuilder.supersetBracket({ blocks: [{ kind: 'main', rows: [row('A', 4, '8', 'kg', 0, { group: 'A' })] }] }, 'A'), null, 'a superset of one drew a bracket');
});

test('a card\'s loads change on last week\'s same day, and the series follows one move across the weeks', () => {
  const doc = ShapeWorkoutDocument.applyProgramProgression(program(4).detail.builder);
  const w2 = DashBuilder.sessionLoadLines(doc, 1, 0);
  assert.deepEqual(w2.map((l) => l.name + ' ' + l.weight + ' ' + l.delta), ['Back squat 260 lb 5', 'Romanian deadlift 220 lb 5']);
  assert.deepEqual(DashBuilder.sessionLoadLines(doc, 0, 0).map((l) => l.delta), [null, null], 'week 1 has no last week to change on');
  assert.deepEqual(DashBuilder.sessionLoadLines(doc, 3, 0).map((l) => l.delta), [0, 0], 'a deload week holds its loads');
  assert.deepEqual(DashBuilder.progressionSeries(doc, 'Back squat', 0).map((p) => [p.load, p.deload]), [[255, false], [260, false], [265, false], [265, true]]);
});

test('a ladder\'s loads are the card\'s and the chart\'s, not the row\'s base load (Codex on #2648)', () => {
  const ladderDay = (loads, base) => ({ id: 'd' + (++rid), name: 'Lower A', weekday: 0, playlist: null, blocks: [{ kind: 'main', rows: [
    row('Back squat', 3, '5', 'kg', base, { perSet: loads.map((l) => ({ reps: '5', load: l })) }),
  ] }] });
  const doc = { weeks: [{ days: [ladderDay([100, 110, 120], '')] }, { days: [ladderDay([105, 115, 125], 100)] }] };
  const [w1] = DashBuilder.sessionLoadLines(doc, 0, 0), [w2] = DashBuilder.sessionLoadLines(doc, 1, 0);
  assert.match(w1.weight, /^100\/110\/120 ?kg$/, 'a ladder with no base load drew no weight');
  assert.match(w2.weight, /^105\/115\/125 ?kg$/, 'a ladder read as its base load');
  assert.equal(w2.delta, 5, 'the change ignored the ladder (its top set went 120 → 125)');
  assert.deepEqual(DashBuilder.progressionSeries(doc, 'Back squat', 0).map((p) => p.load), [120, 125]);
});

test('a longer program copies its last week, released to the progression; a shorter one says what goes', () => {
  const base = program(2).detail.builder;
  base.weeks[1].days[0].blocks[1].rows[0].loadPinned = true;
  const out = DashBuilder.resizeProgram(base, 4);
  assert.equal(out.builder.weeks.length, 4);
  assert.equal(out.removed, null);
  const added = out.builder.weeks[3].days[0].blocks[1].rows[0];
  assert.equal('loadPinned' in added, false, 'a new week kept the source week\'s hand-typed pin');
  assert.notEqual(added.id, base.weeks[1].days[0].blocks[1].rows[0].id, 'a new week shares row ids with the week it copies');
  assert.equal(out.builder.weeks[3].deload, false);
  const climbed = ShapeWorkoutDocument.applyProgramProgression(out.builder);
  assert.equal(climbed.weeks[2].days[0].blocks[1].rows[0].load, 265, 'the new weeks do not take the progression');
  const cut = DashBuilder.resizeProgram(out.builder, 1);
  assert.deepEqual(cut.removed, { from: 2, to: 4, sessions: 6, moves: 21 });
  assert.equal(DashBuilder.resizeProgram(out.builder, 4).builder, out.builder, 'the same length rewrote the document');
});

test('which template is a single workout', () => {
  const one = single();
  assert.equal(dbuIsSingle(one, one.detail.builder), true);
  const p = program(1); p.detail.builder.weeks[0].days.pop();
  assert.equal(dbuIsSingle(p, p.detail.builder), false, 'a program of one day opened as a single workout');
  const untyped = { detail: { builder: single().detail.builder } };
  assert.equal(dbuIsSingle(untyped, untyped.detail.builder), true, 'one day with no type is a workout, as the shared normaliser says');
  const many = { detail: { buildType: 'workout', builder: program(2).detail.builder } };
  assert.equal(dbuIsSingle(many, many.detail.builder), false, 'a stored "workout" of eight days hid seven of them');
  assert.equal(dbuSavedWords(0, Date.now()), 'Saved');
  assert.equal(dbuSavedWords(Date.now() - 5000, Date.now()), 'Saved just now');
  assert.equal(dbuSavedWords(Date.now() - 4 * 60000, Date.now()), 'Saved 4 min ago');
});

// ── 2. The single workout ─────────────────────────────────────────────────────
test('one workout opens a day canvas, not the program builder', async () => {
  await mount(single());
  assert.equal(document.querySelector('.dbu2').getAttribute('data-mode'), 'workout');
  assert.equal(!!document.querySelector('.dday'), true, 'the day is not open');
  for (const gone of ['.dpl', '.dprog', '.dlen', '.dtray', '.das', '.sh']) assert.equal(!!document.querySelector(gone), false, gone + ' is on a single workout');
  for (const t of ['＋ Week', '＋ Add a day', 'Save template', 'Preview as client', 'Close the day editor', 'Back to the plan', 'Delete day', 'Copy to weeks']) assert.equal(!!button(t), false, t + ' is on a single workout');
  const acts = buttons(document.querySelector('.hd .acts')).map((b) => b.textContent);
  assert.deepEqual(acts, ['Publish', 'Assign'], 'the header carries more than one primary');
  assert.equal(button('Assign').getAttribute('style').includes('background'), true);
  assert.equal(document.querySelector('.hd .chip.q').textContent, 'Single workout · 6 moves');
  // The library is open beside the list, adding to Main.
  const lib = document.querySelector('aside.dlib');
  assert.equal(!!lib, true, 'the library is not open beside the list');
  assert.equal(lib.querySelectorAll('.lib-row').length, DashBuilder.EXERCISES.length);
  assert.equal(button('Add Bench press to Main').textContent, '＋ Main');
});

test('the library\'s ✓, ＋ and drag all write the day', async () => {
  await mount(single());
  const lib = document.querySelector('aside.dlib');
  const libRow = (n) => [...lib.querySelectorAll('.lib-row')].find((r) => r.querySelector('b').textContent === n);
  assert.equal(!!libRow('Back squat').querySelector('.lib-in'), true, 'a move already in carries no ✓');
  assert.equal(!!libRow('Bench press').querySelector('.lib-in'), false);
  await click(button('Add Bench press to Main'));
  assert.equal(lineNames().includes('Bench press'), true);
  assert.equal(lineNames().indexOf('Bench press'), lineNames().indexOf('Romanian deadlift') + 1, '＋ Main did not add to the end of Main');
  assert.equal(!!libRow('Bench press').querySelector('.lib-in'), true, 'the ✓ did not follow the add');
  // The region filter and the equipment filter.
  await click(button('Upper', lib));
  assert.equal(!!libRow('Back squat'), false, 'Upper kept a legs move');
  await setValue(lib.querySelector('select[aria-label="Equipment"]'), 'cable');
  assert.equal(!!libRow('Bench press'), false, 'the equipment filter kept a barbell move');
  assert.equal(!!libRow('Face pull'), true);
  // Drag: the move lands in the list.
  const before = lineNames().length;
  await fire(libRow('Face pull'), 'dragstart');
  await fire(document.querySelector('.dlist'), 'dragover');
  await fire(document.querySelector('.dlist'), 'drop');
  assert.equal(lineNames().length, before + 1, 'a dropped move did not land');
  assert.equal(lineNames().includes('Face pull'), true);
  // + Exercise on a block points the library at it.
  await click(buttons().filter((b) => b.textContent === '+ Exercise')[3]);
  assert.equal(button('Add Face pull to Finisher').textContent, '＋ Finisher');
});

test('a whiteboard line edits tempo and cue in place, and a superset is a bracket', async () => {
  await mount(single());
  assert.equal(byAria('Back squat Tempo').value, '3-1-X-1', 'the tempo hides behind the detail');
  await setValue(byAria('Back squat Coach cue'), 'Brace before the walkout');
  await setValue(byAria('Back squat Tempo'), '4-0-1-0');
  assert.equal(byAria('Back squat Coach cue').value, 'Brace before the walkout');
  const lunge = [...document.querySelectorAll('.dr')].find((l) => l.querySelector('.nm').textContent === 'Walking lunge');
  assert.equal(lunge.querySelector('.ssb').textContent, 'Superset A · 3 rounds, rest 90s after A2');
  assert.equal(lunge.querySelector('.ci.to').textContent.replace(/\s+/g, ' ').startsWith('→ A2'), true, 'A1\'s rest does not read → A2');
  assert.equal(!!byAria('Walking lunge Rest'), false, 'A1 still offers a rest it does not take');
  assert.equal(!!byAria('Leg curl Rest'), true, 'the last move of the round lost its rest');
  await click(lunge.querySelector('.nm'));
  assert.equal(!!byAria('Walking lunge superset'), false, 'the Superset select is back beside the one button');
  assert.equal(!!button('Unpair from next'), true);
  // The saved row carries what the line wrote, and the stored rest of A1 is kept.
  await click(button('Save now'));
  const saved = calls.filter((c) => c[0].includes('/api/coach/plans')).at(-1)[2].detail.builder.weeks[0].days[0].blocks;
  assert.equal(saved[1].rows[0].cue, 'Brace before the walkout');
  assert.equal(saved[1].rows[0].tempo, '4-0-1-0');
  assert.equal(saved[2].rows[0].rest, '', 'A1\'s stored rest was rewritten');
  assert.equal(text().includes('Saved just now'), true, 'Saved just now does not replace Save template');
});

test('the totals are on the canvas, and Client view is a tab on the sheet', async () => {
  await mount(single());
  const tot = document.querySelector('.dtot');
  assert.equal(!!tot, true, 'the session does not add itself up');
  assert.match(tot.textContent.replace(/\s+/g, ' '), /16 working sets/);
  assert.match(tot.textContent, /14\.7k lb volume/);
  assert.equal(tot.querySelector('.mbar').getAttribute('aria-label'), 'Working sets by muscle: Quads 7, Hamstrings 6, Core 3');
  assert.match(tot.textContent, /Legs and core only, so pair it with an upper day\./);
  assert.equal(/ min /.test(tot.textContent), false, 'a duration was shown with no source');
  const tab = (t) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent === t);
  await click(tab('Client view'));
  assert.equal(tab('Client view').getAttribute('aria-selected'), 'true');
  assert.equal(!!document.querySelector('[data-client-card]'), true, 'Client view draws no client card');
  assert.equal(!!document.querySelector('.pop'), false, 'the floating preview is back');
});

test('the single workout\'s Assign opens the sheet, after a save', async () => {
  await mount(single(), { clients: ROSTER });
  await click(button('Assign'));
  await settle();
  assert.match(text(), /Put clients on it\./);
});

// ── 3. The program ────────────────────────────────────────────────────────────
test('a program is weeks across and training days down, with each week\'s loads on its cards', async () => {
  await mount(program(4));
  assert.equal(document.querySelector('.dbu2').getAttribute('data-mode'), 'program');
  assert.equal(!!document.querySelector('.dday'), false, 'a program opened on a day instead of its plan');
  assert.equal(document.querySelectorAll('.dpl .wkh').length, 4, 'four weeks are not four cards');
  assert.equal(document.querySelectorAll('.dpl .ses:not(.empty)').length, 8, 'the plan draws more than the sessions');
  assert.deepEqual([...document.querySelectorAll('.dpl .rl')].map((r) => r.textContent).filter(Boolean), ['Monday', 'Thursday'], 'a row is not a training weekday');
  assert.equal(/Rest/.test(document.querySelector('.dpl').textContent), false, 'the plan still draws Rest cells');
  const strip = [...[...document.querySelectorAll('.dpl .wkh')][1].querySelectorAll('.wst button')];
  assert.deepEqual(strip.map((b) => b.textContent).join(''), 'MTWTFSS');
  assert.deepEqual(strip.map((b) => b.classList.contains('on')), [true, false, false, true, false, false, false]);
  const card = [...document.querySelectorAll('.dpl .ses:not(.empty)')].find((c) => /23 Nov/.test(c.textContent) && /Lower A/.test(c.textContent));
  assert.equal(!!card, true, 'week 2\'s Lower A is not on the plan');
  assert.match(card.textContent.replace(/\s+/g, ' '), /Back squat\s*260 ▲5, up 5 lb on last week\s*Romanian deadlift\s*220 ▲5/, 'the card does not carry its week\'s loads');
  // Length in the header, Week N of M on the open day.
  assert.equal(button('4').getAttribute('aria-pressed'), 'true');
  await click(letter(3, 'Monday'));
  const peek = document.querySelector('.dpeek');
  assert.equal(!!peek, true, 'a click did not peek at the session');
  assert.match(peek.textContent.replace(/\s+/g, ' '), /Week 3 of 4 · Mon 30 Nov/);
  assert.match(peek.textContent.replace(/\s+/g, ' '), /Back squat4 × 5 @ 265 lb · RPE 8 · 3-1-X-1 · 2:30/);
  await click(button('Open in builder'));
  assert.equal(!!document.querySelector('.dday'), true, 'Open in builder did not open the session');
  assert.equal(!!document.querySelector('.dpl'), false, 'the plan stayed under the open day');
  assert.match(document.querySelector('.drawer .when').textContent, /^Week 3 of 4 · Mon 30 Nov$/);
  assert.equal(!!document.querySelector('aside.dlib'), true, 'a program\'s session does not open the same canvas');
  await click(button('Back to the plan'));
  assert.equal(!!document.querySelector('.dpeek'), true, 'Back did not return to the session it left');
});

test('the progression is drawn: one move across the weeks, its deload hatched, Now from the roster', async () => {
  // A client on another program, in its week 3, is not this program's Now.
  const elsewhere = { ...person(504, 'Ola B.', 600, 3), programs: { trainer: { name: 'Summer Cut', templateId: uid(103), week: 3, weeks: 6, status: 'active' }, nutritionist: null } };
  await mount(program(4), { clients: [...ROSTER, elsewhere] });
  const fig = document.querySelector('.dprog .dpc');
  assert.equal(!!fig, true, 'no chart under the progression\'s sentence');
  assert.equal(fig.querySelector('figcaption').textContent, 'Back squat 255 → 265 lb across the 4 weeks, deload weeks hatched. Now at week 2 (Samir D.).');
  assert.equal(fig.querySelectorAll('.dpc-dl').length, 1, 'the deload week is not hatched');
  assert.equal(fig.querySelectorAll('.dpc-p').length, 4);
  assert.equal(fig.querySelectorAll('.dpc-now').length, 1);
  await React.act(async () => root.unmount()); root = null;
  await mount(program(4));
  assert.equal(document.querySelectorAll('.dpc-now').length, 0, 'a program nobody is on has a Now');
  assert.equal(/Now at/.test(document.querySelector('.dpc figcaption').textContent), false);
});

test('the length is one tap: longer copies the last week, shorter asks first through ShapeConfirm', async () => {
  stubConfirm(false);
  await mount(program(4));
  await click(button('6'));
  assert.equal(document.querySelectorAll('.dpl .wkh').length, 6);
  const w6 = [...document.querySelectorAll('.dpl .ses:not(.empty)')].find((c) => /Lower A/.test(c.textContent) && /21 Dec/.test(c.textContent));
  assert.match(w6.textContent.replace(/\s+/g, ' '), /Back squat\s*275 ▲5/, 'a new week did not climb with the progression');
  await click(button('4'));
  assert.equal(confirms.length, 1, 'shortening dropped weeks with moves in them without asking');
  assert.match(confirms[0].message, /^Weeks 5–6 go, with 4 sessions in them\./);
  assert.equal(confirms[0].confirmLabel, 'Remove 2 weeks');
  assert.equal(document.querySelectorAll('.dpl .wkh').length, 6, 'a cancelled confirm shortened the program');
  stubConfirm(true);
  await click(button('4'));
  await settle();
  assert.equal(document.querySelectorAll('.dpl .wkh').length, 4);
  await click(button('Custom'));
  await setValue(byAria('Program length in weeks'), '5');
  await fire(byAria('Program length in weeks'), 'blur');
  await React.act(async () => { byAria('Program length in weeks').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })); });
  assert.equal(document.querySelectorAll('.dpl .wkh').length, 5, 'Custom did not set the length');
});

test('sessions drag in from this program and the others, in their program\'s colour with the tag in words', async () => {
  const other = { name: 'Summer Cut · Full body', dayName: 'Full body', program: 'Summer Cut', programId: uid(103), tags: ['cut'], day: { id: 'fb', name: 'Full body', weekday: 1, blocks: [{ kind: 'main', rows: [row('Goblet squat', 3, '12', 'lb', 50)] }] } };
  const plain = { name: 'Old · Mobility', dayName: 'Mobility', program: 'Old', programId: uid(104), tags: [], day: { id: 'mb', name: 'Mobility', blocks: [{ kind: 'main', rows: [] }] } };
  const self = { name: 'Strength Block 3 · Lower A', dayName: 'Lower A', program: 'Strength Block 3', programId: uid(101), tags: ['strength'], day: legDay() };
  await mount(program(2), { dayTemplates: [other, plain, self] });
  const tray = document.querySelector('.dtray');
  assert.deepEqual([...tray.querySelectorAll('.tray-c b')].map((b) => b.textContent), ['Lower A', 'Upper A', 'Full body', 'Mobility'], 'this program\'s own saved days were listed twice');
  const card = (n) => [...tray.querySelectorAll('.tray-c')].find((c) => c.querySelector('b').textContent === n);
  assert.equal(card('Full body').querySelector('.tk').textContent, 'Cut');
  assert.equal(card('Full body').style.getPropertyValue('--c'), DashBuilder.tagInfo('cut').c);
  assert.equal(card('Mobility').querySelector('.tk').textContent, 'No tag');
  // Dropped on a free day: it lands there. Dropped on a taken one: it is refused, with why.
  const tue2 = buttons().find((b) => b.getAttribute('aria-label') === 'Add a session on Tuesday of week 2');
  await fire(card('Full body'), 'dragstart');
  await fire(tue2, 'drop');
  assert.equal(!!letter(2, 'Tuesday'), true, 'the dropped session did not land on Tuesday of week 2');
  assert.match(document.querySelector('.dmsg').textContent, /^Full body added to week 2, Tuesday\.$/);
  await fire(card('Mobility'), 'dragstart');
  await fire(letter(1, 'Monday'), 'drop');
  assert.match(document.querySelector('.dmsg').textContent, /^Week 1 already has Lower A on Monday\. Drop Mobility on a free day\.$/);
  // Pressed: the week being looked at, on the saved day's own weekday when it is free.
  await click(button('Add Full body to week 1'));
  assert.equal(!!letter(1, 'Tuesday'), true, 'a pressed card did not land on its own weekday');
  assert.equal(!!document.querySelector('select[aria-label="Add a saved day to week 1"]'), false, 'the dropdown the tray replaced is back');
});

test('Assign is on the same screen: who is on it from the usage read, then gems and one button', async () => {
  const usage = { state: 'ready', map: { [uid(101)]: { clients: 1, clientIds: [uid(501)] } }, capped: false };
  await mount(program(2), { clients: ROSTER, usage });
  const panel = document.querySelector('.das');
  assert.match(panel.querySelector('.das-on').textContent, /^Samir D\.$/);
  assert.equal(panel.querySelectorAll('.das-on [data-tier], .das-on [data-tier-unknown]').length, 1, 'the person on it wears no tier mark');
  assert.equal(!!button('Update theirs', panel), true);
  const gems = [...panel.querySelectorAll('.das-gem')];
  assert.deepEqual(gems.map((g) => g.textContent), ['Nadine K.', 'Pia N.'], 'a client already on it is offered again');
  assert.equal(gems[1].querySelectorAll('[data-tier-unknown]').length, 1, 'an unknown tier is not hollow');
  assert.equal(button('Pick clients to assign', panel).disabled, true);
  for (const g of gems) await click(g);
  assert.equal(!!button('Assign to Nadine K. and Pia N.', panel), true, 'the one button does not name who it assigns');
  await click(button('Assign to Nadine K. and Pia N.', panel));
  await settle();
  const posts = calls.filter((c) => c[0] === '/api/trainer/workout');
  assert.equal(posts.length, 2, 'one publish per week');
  assert.deepEqual(posts[0][2].clientIds, [uid(502), uid(503)]);
  assert.equal(posts[0][2].sessions[0].payload.template.id, uid(101));
  assert.equal(posts[0][2].sessions[0].payload.template.version, 4, 'the publish does not name the saved revision');
  assert.match(panel.textContent, /Assigned ✓/);
});

test('who is on it is never a sample, and an unread usage says so', async () => {
  await mount(program(2), { clients: ROSTER, usage: { state: 'loading' } });
  assert.match(document.querySelector('.das').textContent, /Checking who’s on it…/);
  for (const n of SAMPLE_NAMES) assert.equal(text().includes(n), false, 'a sample client (' + n + ') shows on a signed-in coach\'s builder');
  await React.act(async () => root.unmount()); root = null;
  await mount(program(2), { clients: [], usage: { state: 'error' }, emptyNote: 'Your roster couldn’t be read.' });
  assert.match(document.querySelector('.das').textContent, /Couldn’t read who’s on it/);
  assert.match(document.querySelector('.das').textContent, /Your roster couldn’t be read\./);
  await React.act(async () => root.unmount()); root = null;
  await mount(program(2), { live: false, clients: ROSTER });
  assert.match(document.querySelector('.das').textContent, /Preview · no client calendars to read/);
});

// ── 4. The day's playlist ─────────────────────────────────────────────────────
test('a day\'s playlist is written with its soundtrack id, and a legacy one is matched by name', async () => {
  const lists = [{ id: 'pl-1', name: 'Heavy Day Fuel', tracks: 28 }, { id: 'pl-2', name: 'Upper Push Power', tracks: 0 }].map(dbuPlaylistChoice);
  assert.deepEqual(lists[0], { id: 'pl-1', name: 'Heavy Day Fuel', meta: '28 tracks' });
  const written = [];
  root = createRoot(document.getElementById('root'));
  const day = { name: 'Lower', weekday: 0, playlist: { name: 'Heavy Day Fuel', meta: '28 tracks' }, blocks: [] };
  await React.act(async () => root.render(React.createElement(DbuDayChips, { day, onChange: (d) => written.push(d.playlist), onWeekday() {}, playlists: lists, clips: [], onUploading() {} })));
  const sel = byAria('Playlist on the client\'s card');
  assert.equal(sel.value, 'id:pl-1', 'a day saved before ids does not match its playlist by name');
  assert.equal(sel.options.length, 3, 'the legacy playlist was offered twice');
  await setValue(sel, 'id:pl-2');
  assert.deepEqual(written.at(-1), { id: 'pl-2', name: 'Upper Push Power', meta: '' });
  await setValue(sel, '');
  assert.equal(written.at(-1), null);
  // Matched by id: a renamed playlist is still the day's.
  await React.act(async () => root.render(React.createElement(DbuDayChips, { day: { ...day, playlist: { id: 'pl-2', name: 'Old name', meta: '' } }, onChange() {}, onWeekday() {}, playlists: lists, clips: [], onUploading() {} })));
  assert.equal(byAria('Playlist on the client\'s card').value, 'id:pl-2');
  assert.equal(byAria('Playlist on the client\'s card').options.length, 3, 'a renamed playlist was offered as a second one');
});

// ── 5. The retired pages ──────────────────────────────────────────────────────
test('the old builder pages redirect to Programs', () => {
  for (const f of ['TrainerNewWorkout.html', 'TrainerNewProgram.html']) {
    const html = readFileSync(ND(f), 'utf8');
    // The house's redirect stub (TrainerPrograms.html's shape): the redirect first, the query kept.
    assert.match(html, /location\.replace\("TrainerApp\.html#programs"\+\(location\.search\|\|""\)\)/, f + ' does not redirect');
    assert.equal(/newWorkout\.jsx|newProgram\.jsx/.test(html), false, f + ' still loads the retired builder');
  }
});
