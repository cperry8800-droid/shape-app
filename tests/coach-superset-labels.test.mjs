// A superset's GROUP KEY and its DISPLAY LABEL are two different things, and
// carrying them in one field is what was wrong.
//
// Reproduced end to end before the fix: a coach's editor read
// ["01","A1","A2","02"], the coach's own preview of the same day rendered
// "01 / A1 / A2 / 04", and the member's live card rendered "01 / A / A / 04" —
// three surfaces, three answers, with the pair indistinguishable on the one
// screen a member trains from.
//
// ⚠ AND THE OBVIOUS FIX WOULD HAVE BROKEN THE FEATURE. The mobile session player
// decides a superset by comparing the stored KEYS (`bsSameGroup` in
// workoutSession.mjs — a raw `move.group === moves[next].group` before this
// change), and only then is rest set to 0 and the pair alternated. Emitting
// "A1"/"A2" from `exerciseFromRow` makes those two unequal, so the pairing
// silently stops and full rest returns between the moves — i.e. the one
// behaviour the fix was asked to guarantee. The key stays the raw letter; the
// label is derived at render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const Signals = require('../public/newdesign/dashSignals.js');
const DashBuilder = require('../public/newdesign/dashBuilderCore.js');
const { supersetKey, normalizeWorkoutDetail, exerciseFromRow } = require('../public/newdesign/workoutDocument.js');
import { bsSameGroup, bsNextSessionMove } from '../mobile-app/src/services/workoutSession.mjs';
const ND = fileURLToPath(new URL('../public/newdesign/', import.meta.url));

const row = (name, group) => ({ id: name, name, muscle: '', equipment: '', sets: 3, reps: '8', loadType: 'kg', load: 20, tempo: '', rest: '90s', cue: '', group, progression: null });
const day = () => ({ name: 'Lower', playlist: null, blocks: [{ kind: 'main', rows: [row('Squat', null), row('Split squat', 'A'), row('Leg curl', 'A'), row('Plank', null)] }] });

test('the stored superset key is the pairing identity, never the label', () => {
  const rows = DashBuilder.buildAssignmentRows({ version: 1, goalTag: 'strength', weeks: [{ deload: false, days: [day()] }] }, { id: 't', name: 'T' }, '2026-06-15');
  const ex = rows[0].payload.exercises;
  assert.deepEqual(ex.map((e) => e.group), ['', 'A', 'A', ''], 'the assignment snapshot carries the raw letter');
  // The player's own pairing predicate — imported, not restated. (This read a local
  // copy of the old raw comparison, which is how a test can go on agreeing with a
  // rule the app has stopped using.)
  assert.ok(bsSameGroup(ex[1], ex[2]), 'the two moves of a superset still pair, so rest between them is still 0');
  assert.ok(!bsSameGroup(ex[0], ex[1]), 'and an ungrouped move does not pair with one');
  // ⚠ The failure this pins is a LABEL reaching the key. Spelled as the thing that
  // must not happen, so any future attempt to "fix" the display here fails loudly.
  for (const e of ex) assert.ok(!/^[A-Z]\d/.test(e.group || ''), `a display label reached the pairing key: ${e.group}`);
});

test('the editor, the coach preview and the member card number a day identically', () => {
  const d = day();
  const editor = DashBuilder.rowLabels(d);
  const preview = DashBuilder.dayToClientCard(d, {}).exercises.map((e) => e.prefix);
  const ex = DashBuilder.buildAssignmentRows({ version: 1, goalTag: 'strength', weeks: [{ deload: false, days: [d] }] }, { id: 't', name: 'T' }, '2026-06-15')[0].payload.exercises;
  const member = ex.map((e, i, all) => Signals.groupLabels(all)[i]);
  assert.deepEqual(editor, ['01', 'A1', 'A2', '02']);
  assert.deepEqual(preview, editor, 'the coach’s preview of a day must not number it differently from the coach’s editor');
  assert.deepEqual(member, editor, 'and the member’s own card must not number it differently again');
});

// ⚠ EVERY ROW CARRIES A LABEL, not only the grouped ones. `DashWorkoutCard` falls
// back to the ABSOLUTE index when `prefix` is null, which is where "04 Plank"
// came from — a member's card skipping 02 and 03 on a four-move day.
test('an ungrouped row after a superset is numbered in sequence, not by its index', () => {
  const labels = Signals.groupLabels([{ group: null }, { group: 'A' }, { group: 'A' }, { group: null }]);
  assert.equal(labels[3], '02', 'the second plain move is 02 — the absolute index would say 04');
  assert.deepEqual(Signals.groupLabels([]), []);
  assert.deepEqual(Signals.groupLabels(null), [], 'a missing list is not a crash — public/newdesign has no error boundary');
  assert.deepEqual(Signals.groupLabels([null, undefined, { group: 'B' }]), ['01', '02', 'B1'], 'a ragged list is numbered, not thrown on');
});

test('two separate supersets each count from 1', () => {
  assert.deepEqual(
    Signals.groupLabels([{ group: 'A' }, { group: 'A' }, { group: null }, { group: 'B' }, { group: 'B' }, { group: 'B' }]),
    ['A1', 'A2', '01', 'B1', 'B2', 'B3']);
});

test('a plain row is zero-padded to two digits and then is not', () => {
  const many = Signals.groupLabels(Array.from({ length: 11 }, () => ({ group: null })));
  assert.equal(many[0], '01');
  assert.equal(many[8], '09');
  assert.equal(many[9], '10', 'the tenth move is 10, not 010');
});

// ⚠ ONE RULE, NOT A COPY OF IT — and it has to live somewhere every surface can
// reach. `rowLabels` delegates rather than re-deriving, because a builder that
// numbered rows its own way is exactly the disagreement this closes.
test('the builder derives its labels from the shared rule rather than its own', async () => {
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  const code = stripComments(readFileSync(ND + 'dashBuilderCore.js', 'utf8'));
  const fn = /function rowLabels\(day\) \{([\s\S]*?)\n  \}/.exec(code);
  assert.ok(fn, 'rowLabels is gone — this guard is reading nothing');
  assert.match(fn[1], /Signals\.groupLabels\(/, 'rowLabels must delegate, not re-derive');
  assert.ok(!/counters\[/.test(fn[1]), 'a second copy of the counting rule has come back');
});

// ⚠ THE LOAD ORDER IS THE WHOLE REASON THIS LIVES IN `dashSignals.js`. SIX of the
// eight pages that render a workout card do not load `dashBuilderCore.js` at all
// (every Client* page), and `public/newdesign` has NO ERROR BOUNDARY — so a bare
// global that is not there is a blank page for every member, not a missing label.
//
// Derived from the source rather than enumerated, so a third consumer added later
// is covered with nobody remembering this file exists.
test('every page that derives a superset label loads the module that defines it, first', () => {
  const files = readdirSync(ND);
  const consumers = files.filter((f) => /\.jsx$/.test(f) && /DashSignals\.workoutCardExercises\(/.test(readFileSync(ND + f, 'utf8')));
  assert.ok(consumers.length >= 2, `expected the member-facing mappings to call the shared rule; found ${consumers.length}`);
  const pages = files.filter((f) => /\.html$/.test(f) && consumers.some((c) => readFileSync(ND + f, 'utf8').includes(c)));
  assert.ok(pages.length >= 6, `expected the client pages among the hosts; found ${pages.length}`);
  for (const page of pages) {
    const html = readFileSync(ND + page, 'utf8');
    const sig = html.indexOf('dashSignals.js');
    assert.ok(sig >= 0, `${page} renders a workout card and never loads dashSignals.js — a blank page, not a missing label`);
    for (const c of consumers) {
      const at = html.indexOf(c);
      if (at >= 0) assert.ok(sig < at, `${page} loads ${c} before dashSignals.js`);
    }
  }
});

// ⚠ THE RULE BEING RIGHT SAYS NOTHING ABOUT THE CARD USING IT — the
// `bsIbSetRowsFor` class this log records by name. Measured: with the mapping
// written inline in both files, a mutation that CALLS the shared rule and then
// discards its answer (`prefix: (groupLabels(all), e.group || null)`) SURVIVED
// every test above. So the mapping is one function now, and it is DRIVEN through
// the shipped `dtrToCard` rather than restated here.
test('the member’s own card renders the derived label, not the raw key', async () => {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { JSDOM } = req('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.DashSignals = Signals;
  // The page-shell globals these modules read at render. Named rather than
  // guessed: each is a `pageShell.jsx` export every host page loads first.
  Object.assign(globalThis, { PAPER: '#1a1612', INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', serif: 'serif', sans: 'sans-serif', mono: 'monospace', ink50: 'rgba(0,0,0,.5)' });
  const React = req('react'); globalThis.React = React;
  const RDS = req('react-dom/server');
  const TRAIN = fileURLToPath(new URL('../public/newdesign/dashTrain.jsx', import.meta.url));
  const { dtrToCard } = await loadRealModule(TRAIN, { appendExports: 'export { dtrToCard };' });
  const CLIENT = fileURLToPath(new URL('../public/newdesign/dashClient.jsx', import.meta.url));
  const { DashWorkoutCard } = await loadRealModule(CLIENT, { appendExports: 'export { DashWorkoutCard };' });

  const ex = DashBuilder.buildAssignmentRows({ version: 1, goalTag: 'strength', weeks: [{ deload: false, days: [day()] }] }, { id: 't', name: 'T' }, '2026-06-15')[0].payload.exercises;
  const card = dtrToCard({ title: 'Lower', exercises: ex }, 'your coach');
  const html = RDS.renderToStaticMarkup(React.createElement(DashWorkoutCard, { workout: card, interactive: false, maxRows: 99 }));
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const seen = text.match(/\b(\d{2}|[A-D]\d?)\s+(Squat|Split squat|Leg curl|Plank)/g);
  assert.deepEqual(seen, ['01 Squat', 'A1 Split squat', 'A2 Leg curl', '02 Plank'],
    'what the member actually reads — the pair distinguishable, the numbering unbroken');
  // ⚠ GUARD-THE-GUARD: without a superset in the fixture this asserts nothing
  // about pairing, and without a trailing plain row it asserts nothing about the
  // absolute-index fallback that produced "04".
  assert.ok(ex.some((e) => e.group) && ex.some((e) => !e.group), 'the fixture must carry both a grouped and an ungrouped row');
});

// ⚠ A RAGGED STORED PLAN IS NOT A BLANK PAGE. `client_workouts.payload` is
// jsonb, `public/newdesign` has no error boundary, and a null entry in an
// exercise list would otherwise throw during the render of a member's Today.
test('a ragged exercise list is rendered, not thrown on', () => {
  const out = Signals.workoutCardExercises([null, { name: 'Squat', group: 'A' }, undefined, { name: 'Split', group: 'A' }]);
  assert.deepEqual(out.map((e) => e.prefix), ['01', 'A1', '02', 'A2']);
  assert.equal(out[0].name, undefined, 'a missing row names nothing rather than inventing a name');
  assert.equal(out[0].load, '');
  assert.deepEqual(Signals.workoutCardExercises(null), [], 'and a missing list is an empty card');
});

// And neither mapping may hand-roll its own copy again.
test('both workout-card surfaces map their exercises through the one rule', async () => {
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  for (const f of ['dashTrain.jsx', 'dashClient.jsx']) {
    const code = stripComments(readFileSync(ND + f, 'utf8'));
    assert.match(code, /exercises: DashSignals\.workoutCardExercises\(/, `${f} must not build a card's exercise list itself`);
    assert.ok(!/prefix: e\.group/.test(code), `${f} still reads the pairing key as a display prefix`);
  }
});

// ── One key rule, wherever a key is read ────────────────────────────────────
// ⚠ THERE WERE TWO, AND THEY DISAGREED. The player's navigation TRIMMED the key and
// its rest decision compared it RAW, so 'A' and 'A ' (reachable from the mobile
// editor's free-text field) jumped the member to the partner AND made them sit a full
// rest. Case was significant everywhere, so 'A' and 'a' were two groups while reading
// as one pair to the coach. Every reader now goes through one rule — and the labels'
// module restates it (it loads without the document module on the member's pages),
// so the two copies are driven over one vector set here.
const KEY_VECTORS = ['A', 'a', ' A', 'A ', ' a ', '\tb\n', 'B', 'AA', '', '   ', null, undefined,
  0, 1, 2.5, NaN, Infinity, -Infinity, false, true, {}, [], ['A'], '__proto__', 'constructor', 'é'];

test('the document\'s key rule and the labels\' copy of it agree on every value', () => {
  for (const v of KEY_VECTORS) {
    assert.equal(Signals.groupKey(v), supersetKey(v), `the two key rules disagree on ${String(v)} (${typeof v})`);
  }
});

test('whitespace and case do not split a superset, and a value that is not a key never forms one', () => {
  assert.equal(supersetKey(' a '), 'A');
  assert.equal(supersetKey('\tb\n'), 'B');
  assert.equal(supersetKey(3), '3', 'a number keeps its digits');
  // ⚠ `String(false)` is "false": through the old `text()` a stray boolean became a
  // group called FALSE, pairing with every other stray boolean in the day.
  for (const v of [false, true, {}, [], ['A'], NaN, Infinity, null, undefined, '', '   ']) {
    assert.equal(supersetKey(v), '', `${String(v)} (${typeof v}) is not a superset key`);
  }
  assert.deepEqual(Signals.groupLabels([{ group: 'A' }, { group: 'a ' }, { group: false }, { group: ' b' }]), ['A1', 'A2', '01', 'B1']);
});

test('storage and delivery both hold the normalized key', () => {
  const detail = normalizeWorkoutDetail({ builder: { version: 1, weeks: [{ deload: false, days: [{ name: 'D', blocks: [{ kind: 'main', rows: [
    { name: 'Split squat', group: ' a ' }, { name: 'Leg curl', group: 'A' }, { name: 'Plank', group: '   ' }, { name: 'Carry', group: false },
  ] }] }] }] } });
  const rows = detail.builder.weeks[0].days[0].blocks[0].rows;
  assert.deepEqual(rows.map((r) => r.group), ['A', 'A', null, null], 'the stored document keeps one spelling of the key');
  assert.deepEqual(rows.map((r) => exerciseFromRow(r).group), ['A', 'A', '', ''], 'and the assignment snapshot delivers it');
  // ⚠ AND DELIVERY NORMALIZES ON ITS OWN. The rows above were already normalized, so
  // they could not tell a delivery that normalizes from one that copies — the first
  // version of this test let `group: text(row.group)` straight through. An assignment
  // can be built from the editor's in-memory document before any save has run it
  // through `normalizeWorkoutDetail`, so the raw spellings are handed in directly.
  assert.deepEqual([' a ', 'A', '\tb', '   ', false, null].map((group) => exerciseFromRow({ name: 'X', group }).group),
    ['A', 'A', 'B', '', '', ''], 'a raw key is delivered in its one spelling, and a non-key as none');
});

test('the player pairs under the same rule across case and whitespace', () => {
  assert.equal(bsSameGroup({ group: 'A' }, { group: 'a ' }), true);
  assert.equal(bsSameGroup({ group: 'A' }, { group: 'A ' }), true);
  assert.equal(bsSameGroup({ group: 'A' }, { group: 'B' }), false);
  assert.equal(bsSameGroup({ group: '' }, { group: '' }), false, 'two ungrouped moves are not a superset');
  assert.equal(bsSameGroup({ group: null }, { group: undefined }), false);
  assert.equal(bsSameGroup({ group: false }, { group: false }), false, 'nor are two stray booleans');
  assert.equal(bsSameGroup(null, { group: 'A' }), false, 'a missing move is not a partner');
  const moves = [{ sets: 2, group: 'A' }, { sets: 2, group: 'a ' }, { sets: 1 }];
  assert.equal(bsNextSessionMove(moves, { '0-0': true }, 0), 1, 'the partner is found across case and whitespace');
  assert.equal(bsNextSessionMove(moves, { '0-0': true, '1-0': true }, 1), 0, 'and the pair alternates back');
});

// ⚠ THE BUILDER'S FALLBACK WROTE THE LABEL INTO THE KEY. `buildAssignmentRows` hands
// off to workoutDocument.js when it is loaded, and fell back to its own loop when it
// is not — which wrote `labels[li]` ("A1"/"A2") into `group`, the one field the player
// pairs on. Unreachable on today's two hosts (both load workoutDocument.js first), so
// it is run here the way a host WITHOUT that module would run it: in a fresh global
// with no `module` and no ShapeWorkoutDocument.
test('the builder\'s fallback assignment writes the key, not the label', async () => {
  const { runInNewContext } = await import('node:vm');
  const sandbox = { DashSignals: Signals, console };
  sandbox.window = sandbox;
  runInNewContext(readFileSync(ND + 'dashBuilderCore.js', 'utf8'), sandbox);
  const Core = sandbox.DashBuilder;
  assert.ok(Core && typeof Core.buildAssignmentRows === 'function', 'the core did not load in a bare global — this test is running nothing');
  assert.equal(sandbox.ShapeWorkoutDocument, undefined, 'the document module is absent, so the fallback is what ran');
  // One half of the pair typed ' a' — the key rule has to hold here too, not only the
  // key-vs-label split.
  const d = day(); d.blocks[0].rows[2].group = ' a';
  const out = Core.buildAssignmentRows({ version: 1, goalTag: 'strength', weeks: [{ deload: false, days: [d] }] }, { id: 't', name: 'T' }, '2026-06-15');
  // ⚠ Copied into THIS realm before comparing: an array built inside the sandbox has
  // the sandbox's Array.prototype, and a strict deep-equal fails on the prototype
  // with every element identical — a harness failure that reads like a code one.
  const ex = Array.from(out[0].payload.exercises);
  assert.deepEqual(ex.map((e) => e.group), ['', 'A', 'A', ''], 'the fallback carries the pairing key');
  assert.ok(bsSameGroup(ex[1], ex[2]), 'so the pair still pairs in the player');
});

