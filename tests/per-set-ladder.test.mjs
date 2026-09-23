// Per-set reps and weight: the full ladder. Owner: "i also should be able to
// customize as a coach the numbers of reps for each set and weight if I want to";
// the pick was a full ladder (Back squat 3 × 8/6/4 · 60/70/80 kg).
//
// ⚠ ONE LADDER, MANY READERS. The builder row carries `perSet`; the document writes it
// out ("8/6/4", "60/70/80 kg") for every card AND resolves it per set for the player;
// the outline text, the builder's fallback, the unit converter, Adjust, the member's
// plan route and Nora each read it on their own. Every one of them is driven here
// against the shipped code, and the ones that restate a rule are held equal to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsPerSetLabels, bsHasLadder, bsSetPrefill, bsSetPlan, bsLadderRemoveSet, bsMoveTotalReps, bsLoggedSet, bsPreviewSession, bsLoadPrefill } from '../mobile-app/src/services/workoutSession.mjs';
import { bsSdUnitizeText } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsScaleLoad, bsAdjustRegen } from '../mobile-app/src/services/adjustRegen.mjs';
import { bsAssignExercise, bsTextLadder, bsMaterializeOutline } from '../mobile-app/src/services/planOutline.mjs';

const require = createRequire(import.meta.url);
const W = require('../public/newdesign/workoutDocument.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// [row, reps written out, load written out]. Every row has 3 sets unless it says.
const kg = (extra) => ({ id: 'r', name: 'Back squat', sets: 3, reps: '8', load: 60, loadType: 'kg', ...extra });
const VECTORS = [
  // The owner's example: reps and weight both vary, the RPE is the row's, printed once.
  [kg({ rpe: 8, perSet: [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }] }), '8/6/4', '60/70/80 kg · RPE 8'],
  [kg({ perSet: [{}, { reps: '6' }, { reps: '4' }] }), '8/6/4', '60 kg'],
  [kg({ reps: '5', load: 100, perSet: [{}, { load: 105 }, { load: 110 }] }), '5', '100/105/110 kg'],
  // ⚠ A set with no weight, or one inheriting an imported text, is written in full,
  // so every weight still carries its own unit.
  [kg({ reps: '5', load: '', perSet: [{}, { load: 70 }, { load: 80 }] }), '5', '— / 70 kg / 80 kg'],
  [kg({ reps: '10', load: 0, loadText: 'bodyweight', perSet: [{}, { load: 10 }, { load: 20 }] }), '10', 'bodyweight / 10 kg / 20 kg'],
  [kg({ reps: '5', perSet: [{}, { load: 0 }, { load: 80 }] }), '5', '60 kg / — / 80 kg'],
  [kg({ reps: '3', load: 70, loadType: 'pct', perSet: [{}, { load: 75 }, { load: 80 }] }), '3', '70/75/80% 1RM'],
  [kg({ reps: '5', load: 135, loadType: 'lb', perSet: [{}, { load: 155 }, { load: 175 }] }), '5', '135/155/175 lb'],
  [kg({ sets: 2, reps: '5', load: 70, perSet: [{}, { load: '72.5' }] }), '5', '70/72.5 kg'],
  [kg({ reps: '', perSet: [{ reps: '8' }, {}, { reps: '4' }] }), '8/—/4', '60 kg'],
  // A ladder whose every set agrees reads as the one value.
  [kg({ reps: '5', perSet: [{ reps: '5', load: 60 }] }), '5', '60 kg'],
  // Not a ladder: entries only past the set count, and entries that say nothing.
  [kg({ sets: 2, reps: '5', perSet: [{}, {}, { load: 80 }] }), '5', '60 kg'],
  [kg({ reps: '5', perSet: [{ load: -5 }, { load: 'abc' }, 'junk', null] }), '5', '60 kg'],
  [kg({ reps: '5', perSet: [] }), '5', '60 kg'],
  [kg({ reps: '5' }), '5', '60 kg'],
];

test('a ladder is written the way a coach writes one, and straight sets are unchanged', () => {
  for (const [row, reps, load] of VECTORS) {
    assert.equal(W.repsLabel(row), reps, 'reps: ' + JSON.stringify(row));
    assert.equal(W.loadLabel(row), load, 'load: ' + JSON.stringify(row));
  }
  // ⚠ THE CONTROL: the rows that are not ladders must return null, or a check that
  // only compares labels would pass on a `ladder` that always returned something.
  assert.equal(W.ladder(kg({ reps: '5' })), null);
  assert.equal(W.ladder(kg({ sets: 2, perSet: [{}, {}, { load: 80 }] })), null, 'an entry past the set count is not delivered');
  assert.equal(W.ladder(kg({ sets: '', perSet: [{ load: 70 }] })), null, 'no set count, no ladder');
  assert.ok(W.ladder(kg({ perSet: [{}, { load: 70 }] })), 'and a real one is one');
});

test('each set resolves to its own target, inheriting the row where the coach left it blank', () => {
  const row = kg({ rpe: 8, perSet: [{}, { reps: '6', load: 70 }, { reps: '4' }] });
  assert.deepEqual([0, 1, 2].map((i) => W.setTarget(row, i)), [
    { reps: '8', label: '60 kg', num: 60 },
    { reps: '6', label: '70 kg', num: 70 },
    { reps: '4', label: '60 kg', num: 60 },
  ]);
  // ⚠ A SET'S WEIGHT NEVER CARRIES THE RPE. The row prints it once; a per-set label
  // with it would pre-fill "70 kg · RPE 8" into a weight box.
  assert.ok(![0, 1, 2].some((i) => /RPE/.test(W.setTarget(row, i).label)));
});

test('the stored ladder is cleaned, and a row that never had one does not grow one', () => {
  const detail = W.normalizeWorkoutDetail({ builder: { version: 1, weeks: [{ deload: false, days: [{ name: 'D', blocks: [{ kind: 'main', rows: [
    { id: 'a', name: 'A', sets: 3, reps: '5' },
    { id: 'b', name: 'B', sets: 3, reps: '5', perSet: [] },
    { id: 'c', name: 'C', sets: 3, reps: '5', perSet: [{}, { reps: '  ', load: '' }] },
    { id: 'd', name: 'D', sets: 3, reps: '5', perSet: [{ reps: ' 6 ' }, {}, {}] },
    { id: 'e', name: 'E', sets: 3, reps: '5', perSet: Array.from({ length: 25 }, (_, i) => ({ load: i + 1 })) },
    { id: 'f', name: 'F', sets: 2, reps: '5', perSet: [{}, {}, { load: 80 }] },
    { id: 'g', name: 'G', sets: 3, reps: '5', perSet: 'not a list' },
  ] }] }] }] } });
  const [a, b, c, d, e, f, g] = detail.builder.weeks[0].days[0].blocks[0].rows;
  assert.ok(!('perSet' in a), 'untouched');
  assert.ok(!('perSet' in b), 'an empty list is no ladder');
  assert.ok(!('perSet' in c), 'nor is a list of blanks');
  assert.deepEqual(d.perSet, [{ reps: '6', load: '' }], 'trailing blanks go, text is trimmed');
  assert.equal(e.perSet.length, W.LADDER_MAX, 'capped');
  assert.equal(e.perSet[19].load, 20);
  // ⚠ ENTRIES PAST THE SET COUNT ARE KEPT: a coach passing through "1" on the way to
  // "12" sets would otherwise lose the entries they are about to see again.
  assert.deepEqual(f.perSet, [{ reps: '', load: '' }, { reps: '', load: '' }, { reps: '', load: 80 }]);
  assert.ok(!('perSet' in g), 'a stored non-list is dropped, not carried');
});

test('delivery carries each set\'s own target beside the written-out ladder', () => {
  const ex = W.exerciseFromRow(kg({ rpe: 8, perSet: [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }] }));
  assert.equal(ex.reps, '8/6/4');
  assert.equal(ex.load, '60/70/80 kg · RPE 8');
  assert.equal(ex.rpe, 8);
  assert.deepEqual(ex.perSet, [{ reps: '8', load: '60 kg' }, { reps: '6', load: '70 kg' }, { reps: '4', load: '80 kg' }]);
  const plain = W.exerciseFromRow(kg({ reps: '5' }));
  assert.equal(plain.reps, '5');
  assert.ok(!('perSet' in plain), 'straight sets carry no key — an absent ladder is not an empty one');
  // A row with more sets than stored entries delivers every set, the rest inheriting.
  const long = W.exerciseFromRow(kg({ sets: 25, reps: '3', perSet: [{ load: 70 }] }));
  assert.equal(long.perSet.length, 25);
  assert.deepEqual(long.perSet[24], { reps: '3', load: '60 kg' });
});

test('the assignment snapshot a member receives carries the ladder', () => {
  const builder = W.normalizeWorkoutDetail({ builder: { version: 1, weeks: [{ deload: false, days: [{ name: 'Lower', weekday: 'mon', blocks: [{ kind: 'main', rows: [
    kg({ rpe: 8, perSet: [{}, { reps: '6', load: 70 }, { reps: '4', load: 80 }] }),
  ] }] }] }] } }).builder;
  const [row] = W.builderToAssignmentRows(builder, { id: 'p', name: 'Plan', revision: 1 }, '2026-09-21');
  const [ex] = row.payload.exercises;
  assert.equal(ex.reps, '8/6/4');
  assert.deepEqual(ex.perSet.map((s) => s.load), ['60 kg', '70 kg', '80 kg']);
});

// ⚠ THE OUTLINE TEXT AND THE STRUCTURED DELIVERY MUST AGREE. The Listing preview and a
// text-outline plan read the ladder back out of `builderToOutlineBlocks`' text; the
// structured path reads `exerciseFromRow`. Round-tripped over every ladder vector.
test('the outline text reads back to the same per-set targets the structured delivery sends', () => {
  const ladders = VECTORS.filter(([row]) => W.ladder(row));
  assert.ok(ladders.length >= 10, `expected the ladder vectors; found ${ladders.length}`);
  for (const [row] of ladders) {
    const builder = { weeks: [{ days: [{ name: 'D', blocks: [{ kind: 'main', rows: [row] }] }] }] };
    const [block] = W.builderToOutlineBlocks(builder);
    const parsed = bsAssignExercise(block.text);
    const delivered = W.exerciseFromRow(row);
    // The collapsed rows (every set agreeing) have no ladder to write, so no text
    // can carry one; the structured path still resolves them.
    const written = W.repsLabel(row).includes('/') || W.ladder(row).weight.includes('/');
    if (!written) { assert.ok(!parsed.perSet, 'no list in the text, no ladder read'); continue; }
    assert.deepEqual(parsed.perSet, delivered.perSet, 'round trip: ' + block.text);
    assert.equal(parsed.reps, delivered.reps);
  }
});

test('a hand-typed text ladder becomes a structured one, and a list that does not fit is not guessed', () => {
  const read = (t) => bsAssignExercise(t);
  assert.deepEqual(read('Back squat — 3 × 8/6/4 · 60/70/80 kg · RPE 8').perSet,
    [{ reps: '8', load: '60 kg' }, { reps: '6', load: '70 kg' }, { reps: '4', load: '80 kg' }]);
  assert.deepEqual(read('Back squat — 3 × 5 · 100/105/110 kg').perSet,
    [{ reps: '5', load: '100 kg' }, { reps: '5', load: '105 kg' }, { reps: '5', load: '110 kg' }]);
  assert.deepEqual(read('Row — 3 × 8-10/6-8/4-6 · 60 kg').perSet.map((s) => s.reps), ['8-10', '6-8', '4-6']);
  assert.deepEqual(read('Row — 3x8/6/4').perSet.map((s) => s.load), ['', '', ''], 'no weight named, none invented');
  // ⚠ NOT LADDERS. Per-side reps, a range, straight sets, two weights for three sets,
  // and a weight list typed where the reps go are all read exactly as they were before.
  for (const t of ['Lunge — 3 × 10/10 · 20 kg', 'Bench — 4 × 6-8 · RPE 8', 'Squat — 3 × 5 · 60 kg · RPE 8', 'Squat — 3 × 5 · 60/70 kg', 'Bench — 3 × 70/75/80% 1RM', 'Bench — 3 × 60/70/80 kg']) {
    assert.ok(!('perSet' in read(t)), t);
  }
  assert.equal(read('Lunge — 3 × 10/10 · 20 kg').reps, '10', 'the per-side scheme parses as it always has');
  assert.equal(read('Back squat — 3 × 8/6/4 · 60 kg').load, '60 kg', 'the rep ladder does not leak into the load');
  // ⚠ AN AUTHORED BLOCK'S OWN FIELDS OUTRANK ITS TEXT, so a ladder read out of text they
  // overrule would describe a prescription the row no longer carries.
  assert.ok(!('perSet' in read({ text: 'Back squat — 3 × 8/6/4 · 60/70/80 kg', reps: '8', load: 60 })));
  assert.ok(read({ text: 'Back squat — 3 × 8/6/4 · 60/70/80 kg', id: 'x' }).perSet, 'an authored block with no prescription of its own keeps the text\'s');
  assert.equal(bsTextLadder('1', '5', '60 kg'), null, 'one set is no ladder');
  assert.equal(bsTextLadder('3', '5', '60 kg'), null, 'nor are straight sets');
});

test('a text-outline plan carries its ladder into the member\'s rows', () => {
  const rows = bsMaterializeOutline({ plan: { id: 'p', name: 'Plan', detail: { blocks: ['Back squat — 3 × 8/6/4 · 60/70/80 kg', 'Plank — 3 × 30s'] } }, startISO: '2026-09-21', weeks: 1, runId: 'r' });
  const [squat, plank] = rows[0].payload.exercises;
  assert.deepEqual(squat.perSet.map((s) => s.reps), ['8', '6', '4'], 'the whitelist names `perSet`, or it never arrives');
  assert.ok(!('perSet' in plank));
});

// ⚠ THE BUILDER'S FALLBACK SAYS THE SAME THING. `dashBuilderCore.js` restates the ladder
// for a host without the document module. Run the way such a host would run it.
test('the builder\'s fallback labels agree with the document on every ladder', async () => {
  const { runInNewContext } = await import('node:vm');
  const sandbox = { DashSignals: require('../public/newdesign/dashSignals.js'), console };
  sandbox.window = sandbox;
  runInNewContext(readFileSync(join(ROOT, 'public/newdesign/dashBuilderCore.js'), 'utf8'), sandbox);
  assert.equal(sandbox.ShapeWorkoutDocument, undefined, 'the document module is absent, so the fallback is what runs');
  const F = sandbox.DashBuilder;
  const extra = [
    kg({ sets: Infinity, perSet: [{}, { load: 70 }] }), kg({ sets: '3', perSet: [{ load: '70' }] }), kg({ sets: 2.5, perSet: [{ load: 70 }] }),
    kg({ perSet: [{ load: NaN }, { load: Infinity }, { load: true }] }), kg({ loadType: 'lb', perSet: [{ reps: 12 }] }),
  ];
  for (const row of [...VECTORS.map(([r]) => r), ...extra]) {
    assert.equal(F.loadLabel(row), W.loadLabel(row), 'load: ' + JSON.stringify(row));
    assert.equal(String(F.repsLabel(row)), W.repsLabel(row), 'reps: ' + JSON.stringify(row));
    // The preview card's scheme: the row's sets over the ladder's reps.
    if (row.sets && W.repsLabel(row)) assert.equal(F.schemeLabel(row), row.sets + ' × ' + W.repsLabel(row), 'scheme: ' + JSON.stringify(row));
    else assert.doesNotMatch(F.schemeLabel(row), /×/, 'scheme: ' + JSON.stringify(row));
  }
});

test('progression moves every set the coach wrote, not only the row', () => {
  const B = require('../public/newdesign/dashBuilderCore.js');
  const program = { weeks: [{ deload: false, days: [{ name: 'D', blocks: [{ kind: 'main', rows: [
    { ...kg({ perSet: [{}, { load: 70 }, { load: 0 }, { reps: '3' }] }), sets: 4, progression: { rule: 'all-reps', incKg: 2.5 } },
    { ...kg({ loadType: 'pct', load: 70, perSet: [{ load: 99 }, { load: 75 }] }), sets: 2, progression: { rule: 'all-reps', incPct: 2.5 } },
  ] }] }] }] };
  const next = B.applyProgression(program.weeks[0]);
  const [squat, pct] = next.days[0].blocks[0].rows;
  assert.equal(squat.load, 62.5, 'the row moves');
  assert.deepEqual(squat.perSet.map((e) => e.load), [undefined, 72.5, 0, undefined], 'each written weight moves; a set written as no weight stays one');
  assert.equal(squat.perSet[3].reps, '3');
  assert.deepEqual(pct.perSet.map((e) => e.load), [100, 77.5], 'a percentage stops at 100');
  assert.equal(W.loadLabel(squat), '62.5 kg / 72.5 kg / — / 62.5 kg', 'the week reads as the moved ladder');
  assert.equal(W.loadLabel({ ...squat, sets: 2 }), '62.5/72.5 kg');
});

// ── The member's player ────────────────────────────────────────────────────
const ladderMove = () => ({ m: 'Back squat', s: '3 × 8/6/4', reps: '8/6/4', l: '60/70/80 kg · RPE 8', sets: 3,
  perSet: [{ reps: '8', load: '60 kg' }, { reps: '6', load: '70 kg' }, { reps: '4', load: '80 kg' }] });

test('each set pre-fills its own target, and a set past the ladder repeats its last', () => {
  const m = ladderMove();
  assert.deepEqual([0, 1, 2, 3].map((i) => bsSetPrefill(m, i)),
    [{ reps: '8', load: '60 kg' }, { reps: '6', load: '70 kg' }, { reps: '4', load: '80 kg' }, { reps: '4', load: '80 kg' }]);
  // ⚠ THE CONTROL: straight sets pre-fill exactly as they always did — the move's reps
  // and its weight without the RPE.
  const plain = { m: 'Squat', reps: '5', l: '100 kg · RPE 8', sets: 3 };
  assert.deepEqual(bsSetPrefill(plain, 2), { reps: '5', load: bsLoadPrefill(plain) });
  assert.equal(bsLoadPrefill(plain), '100 kg');
  assert.equal(bsHasLadder(plain), false);
  assert.equal(bsHasLadder({ perSet: [] }), false);
});

test('a logged set records its own plan, with the move\'s RPE beside the weight', () => {
  const m = ladderMove();
  const log = (i, input) => bsLoggedSet({ move: m, moveIndex: 0, setIndex: i, input, now: Date.parse('2026-09-23T10:00:00Z'), unit: 'kg' });
  const second = log(1, { reps: '6', load: '70 kg', rpe: '' });
  assert.equal(second.targetReps, '6');
  assert.equal(second.targetLoad, '70 kg · RPE 8');
  assert.equal(second.actualReps, 6);
  assert.equal(second.actualLoad, 70);
  assert.equal(log(0, { reps: '8', load: '60 kg' }).targetLoad, '60 kg · RPE 8');
  const plain = { m: 'Squat', reps: '5', l: '100 kg · RPE 8', sets: 3 };
  const p = bsLoggedSet({ move: plain, moveIndex: 0, setIndex: 2, input: { reps: '5', load: '100' }, now: 0, unit: 'kg' });
  assert.equal(p.targetReps, '5');
  assert.equal(p.targetLoad, '100 kg · RPE 8', 'straight sets record what they always did');
});

test('adding and removing a set keeps every later set on its own target', () => {
  const m = ladderMove();
  // An added set needs no new entry: past the end, a set reads the last one.
  assert.deepEqual(bsSetPrefill({ ...m, sets: 4 }, 3), { reps: '4', load: '80 kg' });
  // ⚠ THE ENTRY LEAVES WITH ITS SET, or set 3 would read set 2's target after set 1 goes.
  assert.deepEqual(bsLadderRemoveSet(m, 0).map((s) => s.load), ['70 kg', '80 kg']);
  assert.deepEqual(bsLadderRemoveSet(m, 1).map((s) => s.load), ['60 kg', '80 kg']);
  assert.deepEqual(bsLadderRemoveSet({ ...m, sets: 1 }, 0), m.perSet, 'an exercise never drops to zero sets');
  assert.equal(bsLadderRemoveSet({ m: 'X', sets: 3 }, 0), undefined, 'straight sets stay straight');
  // A member who added a set first: the ladder is aligned to the set count before the
  // removal, so the added set keeps the target it was showing.
  assert.deepEqual(bsLadderRemoveSet({ ...m, sets: 4 }, 0).map((s) => s.load), ['70 kg', '80 kg', '80 kg']);
});

test('a preview counts each set\'s own reps', () => {
  assert.equal(bsMoveTotalReps(ladderMove()), 18, '8 + 6 + 4, not 3 × 8');
  assert.equal(bsMoveTotalReps({ ...ladderMove(), perSet: [{ reps: '8' }, { reps: 'AMRAP' }, { reps: '30s' }] }), 8, 'a set that is not a count adds nothing');
  assert.equal(bsMoveTotalReps({ ...ladderMove(), perSet: [{ reps: '8-10' }, { reps: '6 reps' }, { reps: '4' }] }), 18, 'a range counts its low end, as the scheme line does');
  assert.equal(bsMoveTotalReps({ s: '4 × 6 · 90s' }), 24, 'straight sets as they always were');
  assert.equal(bsMoveTotalReps({ s: '3 × 8-10 · 60s' }), 24);
  assert.equal(bsMoveTotalReps({ s: '30 min zone 2' }), 0);
  // ⚠ ONE RULE IN BOTH BRANCHES: a hold or a distance is not a rep count.
  for (const s of ['3 × 30s', '3 × 45 sec', '4 × 1 min', '5 × 400m', '6 × 200 m · 60s']) assert.equal(bsMoveTotalReps({ s }), 0, s);
});

test('the per-set weights go through the member\'s unit with the label', () => {
  const lb = (v) => bsSdUnitizeText(v, { weight: 'lb', distance: 'mi' });
  assert.deepEqual(bsPerSetLabels(ladderMove().perSet, lb).map((s) => s.load), ['132 lb', '154 lb', '176 lb']);
  assert.equal(bsPerSetLabels([], lb), undefined);
  assert.equal(bsPerSetLabels(null, lb), undefined);
  assert.deepEqual(bsPerSetLabels([null, { reps: 5 }], lb), [{ reps: '', load: '' }, { reps: '5', load: '' }]);
  const session = bsPreviewSession({ exercises: [{ name: 'Back squat', sets: 3, reps: '8/6/4', load: '60/70/80 kg · RPE 8', perSet: ladderMove().perSet }, { name: 'Plank', sets: 3, reps: '30s' }] }, lb);
  assert.deepEqual(session.moves[0].perSet.map((s) => s.load), ['132 lb', '154 lb', '176 lb']);
  assert.equal(session.moves[0].l, '132/154/176 lb · RPE 8');
  assert.ok(!('perSet' in session.moves[1]), 'a move without a ladder is handed on without the key');
});

// ⚠ A LADDER CONVERTS EXACTLY AS ITS SETS WOULD ONE AT A TIME. Converting only the number
// the unit touches read "60/70/176 lb": two kilogram figures under a pound label.
test('a ladder of weights converts together, and each weight as it would alone', () => {
  for (const [ladder, unit, want] of [['60/70/80', 'kg', 'lb'], ['135/155/175', 'lb', 'kg'], ['102.5/107.5', 'kg', 'lb'], ['1,000/1,100', 'lb', 'kg']]) {
    const one = (n) => bsSdUnitizeText(`${n} ${unit}`, { weight: want }).replace(/\s*(lb|kg)$/, '');
    const out = bsSdUnitizeText(`${ladder} ${unit} · RPE 8`, { weight: want });
    assert.equal(out, `${ladder.split('/').map(one).join('/')} ${want} · RPE 8`, ladder + ' ' + unit);
    assert.equal(bsSdUnitizeText(out, { weight: want }), out, 'and a second pass changes nothing');
  }
  assert.equal(bsSdUnitizeText('60/70/80 kg', { weight: 'kg' }), '60/70/80 kg', 'already the reader\'s unit');
  assert.equal(bsSdUnitizeText('60/70/80 kg', { distance: 'km' }), '60/70/80 kg', 'a reader with no weight preference is left alone');
  assert.equal(bsSdUnitizeText('70/75/80% 1RM', { weight: 'lb' }), '70/75/80% 1RM', 'a percentage has no unit to convert');
  assert.equal(bsSdUnitizeText('— / 70 kg / 80 kg', { weight: 'lb' }), '— / 154 lb / 176 lb', 'the long form converts set by set');
});

test('Adjust scales every set of a ladder and never the RPE', () => {
  assert.equal(bsScaleLoad('60/70/80 kg · RPE 8', 0.85), '50/60/70 kg · RPE 8');
  assert.equal(bsScaleLoad('— / 70 kg / 80 kg', 0.85), '— / 60 kg / 70 kg');
  assert.equal(bsScaleLoad('60 kg · RPE 8', 0.85), '50 kg · RPE 8', 'a single weight as before');
  assert.equal(bsScaleLoad('RPE 8', 0.85), 'RPE 7', 'an effort-only load as before');
  const rows = [{ id: 'a', scheduled_date: '2026-07-14', title: 'W', description: '', kind: 'custom',
    payload: { exercises: [{ name: 'Back squat', sets: '3', reps: '8/6/4', load: '60/70/80 kg · RPE 8', perSet: ladderMove().perSet }] } }];
  // The same week shape tests/adjust-regen.test.mjs drives: a Tuesday row lands on Pull day.
  const adj = { intensity: 'deload', sessions: 4, weeks: 4, days: ['Push day', 'Pull day', 'Legs day', 'Rest', 'Push day', 'Pull day', 'Rest'] };
  const first = bsAdjustRegen({ rows, adjustment: adj, todayISO: '2026-07-13', gen: 1 });
  const ex = first.inserts[0].payload.exercises[0];
  assert.equal(ex.load, '50/60/70 kg · RPE 8');
  assert.deepEqual(ex.perSet.map((s) => s.load), ['50 kg', '60 kg', '70 kg'], 'the sets the player pre-fills move with the label');
  assert.deepEqual(ex.basePerSet.map((s) => s.load), ['60 kg', '70 kg', '80 kg'], 'the base is stamped once');
  // ⚠ A SECOND APPLY RE-DERIVES FROM THE BASE, never compounds on the deloaded sets.
  const again = bsAdjustRegen({ rows: [{ ...rows[0], id: 'a2', payload: first.inserts[0].payload }], adjustment: { ...adj, intensity: 'progress' }, todayISO: '2026-07-13', gen: 2 });
  const ex2 = again.inserts[0].payload.exercises[0];
  assert.deepEqual(ex2.perSet.map((s) => s.load), ['60 kg', '70 kg', '80 kg'].map((l) => bsScaleLoad(l, 1.025)));
  assert.deepEqual(ex2.basePerSet, ex.basePerSet);
});

test('the member\'s plan route delivers the ladder, and only a ladder-shaped one', async () => {
  const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
  const route = await loadRealModule(join(ROOT, 'src/app/api/client/plan/route.ts'), {
    typescript: true,
    appendExports: 'export { mapExercises };',
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => null, currentUser: async () => null }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
    ]),
  });
  const deliver = (perSet) => route.mapExercises({ exercises: [{ name: 'X', sets: 3, reps: '8/6/4', perSet }] })[0];
  assert.deepEqual(deliver(ladderMove().perSet).perSet, ladderMove().perSet);
  assert.ok(!('perSet' in deliver(undefined)), 'straight sets carry no key');
  assert.ok(!('perSet' in deliver([])));
  assert.ok(!('perSet' in deliver('8/6/4')), 'anything that is not a list is no ladder');
  // ⚠ THE PAYLOAD IS CLIENT-WRITTEN JSONB: only strings and finite numbers become text.
  assert.deepEqual(deliver([{ reps: 8, load: 60 }, { reps: { x: 1 }, load: NaN }, 'junk', null, [1, 2]]).perSet,
    [{ reps: '8', load: '60' }, { reps: '', load: '' }, { reps: '', load: '' }, { reps: '', load: '' }, { reps: '', load: '' }]);
  assert.equal(deliver(Array.from({ length: 80 }, () => ({ reps: '5' }))).perSet.length, 50, 'capped');
  assert.equal(deliver([{ reps: 'x'.repeat(100), load: 'y'.repeat(100) }]).perSet[0].reps.length, 24);
  assert.equal(deliver([{ reps: 'x'.repeat(100), load: 'y'.repeat(100) }]).perSet[0].load.length, 40);
});

test('Nora reads a six-set ladder whole', async () => {
  const src = readFileSync(join(ROOT, 'src/lib/ai/memberReads.mjs'), 'utf8');
  const m = /function exerciseLine\(e\)[\s\S]*?\n}/.exec(src);
  assert.ok(m, 'exerciseLine is gone — this guard reads nothing');
  const helpers = /(?:const|function) (?:str|txt)\b[\s\S]*?\n/g;
  const deps = src.match(helpers) || [];
  assert.ok(deps.length >= 2, 'the text helpers moved — this guard would run a restatement');
  // eslint-disable-next-line no-new-func
  const exerciseLine = new Function(`${deps.join('')}\n${m[0]}\nreturn exerciseLine;`)();
  // Past the old caps on both fields (12 and 40 characters), or the guard proves nothing.
  const reps = '12/10/8/6/4/3', load = '102.5/107.5/112.5/117.5/122.5/127.5 kg · RPE 8';
  assert.ok(reps.length > 12 && load.length > 40, 'the vector is long enough to be cut');
  const line = exerciseLine({ name: 'Back squat', sets: 6, reps, load });
  assert.equal(line.scheme, '6 × ' + reps);
  assert.equal(line.load, load);
});

// ⚠ NO SUGGESTION ON A LADDER. The suggester autoregulates off the LAST set of the last
// session, which on a pyramid is the top set — offering 82.5 for a set written at 60.
// The shipped expression is lifted out of the player and run, with a control that the
// same lift and history DO produce a suggestion for straight sets.
test('the player offers no load suggestion on a ladder, and still does on straight sets', async () => {
  const { parse } = require('@babel/parser');
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  let init = null;
  (function walk(node) {
    if (init || !node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id && node.id.name === '_bsSug') { init = src.slice(node.init.start, node.init.end); return; }
    for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast.program);
  assert.ok(init, 'the suggestion expression moved — this guard reads nothing');
  const { suggestNextLoad } = await import('../mobile-app/src/services/suggestNextLoad.mjs');
  // eslint-disable-next-line no-new-func
  const run = new Function('move', '_bsStrength', 'suggestNextLoad', 'identity', 'bsHasLadder', `return ${init};`);
  const strength = { lifts: [{ key: 'back squat', unit: 'kg', currentE1rm: 110, series: [{ load: 80, reps: 4, rpe: 7 }] }] };
  const plain = { m: 'Back squat', reps: '4', l: '80 kg', sets: 3 };
  const sug = run(plain, strength, suggestNextLoad, { loadUnit: 'kg' }, bsHasLadder);
  assert.ok(sug && sug.load > 80, 'the control: this history suggests a bump for straight sets');
  assert.equal(run({ ...plain, ...ladderMove() }, strength, suggestNextLoad, { loadUnit: 'kg' }, bsHasLadder), null);
});

test('the Train deck\'s Adjust scales every set with the label', async () => {
  const { bsApplyTrainAdjust } = await import('../mobile-app/src/broadsheet/bsClientWeekDemo.js');
  const program = [{ tag: 'STR', meta: '4 moves · 60 min · RPE 8', moves: [{ ...ladderMove() }, { m: 'Plank', s: '3 × 30s', l: '—' }] }];
  const out = bsApplyTrainAdjust(program, { updatedAt: '2026-09-23T00:00:00Z', intensity: 'deload' }, { GREEN: '#0f0' }, (k, o) => (o && o.defaultValue) || k);
  const [squat, plank] = out[0].moves;
  assert.equal(squat.l, '50/60/70 kg · RPE 8');
  assert.deepEqual(squat.perSet.map((s) => s.load), ['50 kg', '60 kg', '70 kg'], 'the player pre-fills the deloaded sets, not the old ones');
  assert.deepEqual(squat.perSet.map((s) => s.reps), ['8', '6', '4'], 'reps do not scale');
  assert.ok(!('perSet' in plank));
});

test('a delivered ladder is bounded like the route that serves it', () => {
  const ex = W.exerciseFromRow(kg({ sets: 80, reps: '3', perSet: [{ load: 70 }] }));
  assert.equal(ex.perSet.length, 50, 'no more sets than the plan route will pass on');
  assert.equal(ex.sets, '80', 'the row itself is not rewritten');
});
