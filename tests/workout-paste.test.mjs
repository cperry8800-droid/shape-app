// Paste a workout as text (2026-10-07, owner-approved coach-tools plan, "Build faster":
// "Paste 'Back squat 4x5 @225, RDL 3x8 @185' and get rows. Coaches already keep programs in
// Notes and spreadsheets.").
//
// DashBuilder.parseWorkoutText is pure, so these drive the SHIPPED function with text and read
// the rows it builds — in the builder's own row shape (`newRow`), which is what the UI will
// insert. Two rules the table below exists for:
//   · NOTHING THE COACH WROTE IS DROPPED: an unreadable word is the name, the load text or the
//     cue, and every row carries the line it came from;
//   · NOTHING IS INVENTED SILENTLY: a guess (a unit, "@8" as RPE, the 3 × 8 default) comes
//     with a warning naming the line.
// Run: node --test tests/workout-paste.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DB = require('../public/newdesign/dashBuilderCore.js');
const WD = require('../public/newdesign/workoutDocument.js');
const parse = (text, opts) => DB.parseWorkoutText(text, opts);
const rows = (text, opts) => parse(text, opts).blocks.flatMap((b) => b.rows);
const one = (text, opts) => {
  const r = rows(text, opts);
  assert.equal(r.length, 1, 'expected one row from ' + JSON.stringify(text) + ', got ' + r.length);
  return r[0];
};
// The fields a coach reads, without the random id.
const FIELDS = ['name', 'muscle', 'equipment', 'sets', 'reps', 'loadType', 'load', 'loadText', 'rpe', 'rest', 'tempo', 'cue', 'group', 'perSet'];
const view = (r) => Object.fromEntries(FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));

// ── one line → one row ───────────────────────────────────────────────────────
const CASES = [
  // [line, opts, expected subset]
  ['Back squat 4x5 @225', {}, { name: 'Back squat', muscle: 'Quads', equipment: 'Barbell', sets: 4, reps: '5', loadType: 'kg', load: 225 }],
  ['Back squat 4x5 @225', { unit: 'lb' }, { sets: 4, reps: '5', loadType: 'lb', load: 225 }],
  ['Back squat 4 x 5 @ 225 lb', {}, { name: 'Back squat', sets: 4, reps: '5', loadType: 'lb', load: 225 }],
  ['Back squat 4 X 5 @ 100 kg', { unit: 'lb' }, { sets: 4, reps: '5', loadType: 'kg', load: 100 }],
  ['Back squat 4×5 225#', {}, { sets: 4, reps: '5', loadType: 'lb', load: 225 }],
  ['RDL 3x8 185lb RPE 7', {}, { name: 'Romanian deadlift', muscle: 'Hamstrings', sets: 3, reps: '8', loadType: 'lb', load: 185, rpe: 7 }],
  ['Bench 5x5 @ 80%', {}, { name: 'Bench press', sets: 5, reps: '5', loadType: 'pct', load: 80 }],
  ['Bench press 3x5 80% 1RM', {}, { loadType: 'pct', load: 80 }],
  ['Plank 3 x 45s', {}, { name: 'Plank', muscle: 'Core', sets: 3, reps: '45s' }],
  ['Plank 3x30 sec', {}, { sets: 3, reps: '30s' }],
  ['Run 5 x 400m', {}, { name: 'Run', sets: 5, reps: '400m' }],
  ['Bike 5 min easy', {}, { name: 'Bike', sets: 1, reps: '5 min', loadText: 'easy' }],
  ['Row 2,000m', {}, { name: 'Row', sets: 1, reps: '2000m' }],
  ['Squat 3x8-10', {}, { name: 'Back squat', sets: 3, reps: '8-10' }],
  ['Walking lunge 3 x 12/side bodyweight', {}, { name: 'Walking lunge', sets: 3, reps: '12/side', loadText: 'bodyweight' }],
  ['Push-up 3x15 BW', {}, { name: 'Push-up', loadText: 'bodyweight' }],
  ['Split squat 3x10 per leg @ 20 kg', {}, { sets: 3, reps: '10/leg', loadType: 'kg', load: 20 }],
  ['Pull-up 3 x AMRAP', {}, { name: 'Pull-up', sets: 3, reps: 'AMRAP' }],
  ['4 sets of 5 front squat tempo 31X1', {}, { name: 'Front squat', sets: 4, reps: '5', tempo: '31X1' }],
  ['Front squat 3 sets 6 reps', {}, { name: 'Front squat', sets: 3, reps: '6' }],
  ['Back squat 4x5 @ RPE 8, rest 3 min', {}, { sets: 4, reps: '5', rpe: 8, rest: '3 min' }],
  ['Back squat 4x5 (90s rest)', {}, { rest: '90s' }],
  ['Seated leg curl 3 x 12 70 lb, rest 1:00', {}, { name: 'Seated leg curl', sets: 3, reps: '12', loadType: 'lb', load: 70, rest: '1:00' }],
  ['Sled push 4 x 20m +90 lb', {}, { name: 'Sled push', sets: 4, reps: '20m', loadText: '+90 lb' }],
  ['Pull-up 3x8 +20kg', {}, { name: 'Pull-up', loadText: '+20 kg' }],
  ['Back squat 3x5 205-225 lb', {}, { loadText: '205-225 lb' }],
  ['Back squat 4x5 heavy', {}, { loadText: 'heavy' }],
  ['Back squat 4x5 @225 pause at the bottom', {}, { load: 225, cue: 'pause at the bottom' }],
  ['Push-ups x20', {}, { name: 'Push-up', sets: 1, reps: '20' }],
  ['Face pulls 15 reps', {}, { name: 'Face pull', sets: 1, reps: '15' }],
  ['Rest-pause curl 3x10', {}, { name: 'Rest-pause curl', sets: 3, reps: '10' }],
  ['back squat 4x5', {}, { name: 'Back squat' }],
  ['bulgarian thing 3x8', {}, { name: 'Bulgarian thing', muscle: '', sets: 3, reps: '8' }],
  ['4x5 Back squat @225', {}, { name: 'Back squat', sets: 4, reps: '5', load: 225 }],
  ['Squat 3x5 @8', {}, { name: 'Back squat', rpe: 8, load: 0 }],
  ['Goblet squat 3 x 10 @ 24 kg tempo 3-1-x-1', {}, { load: 24, tempo: '3-1-X-1' }],
  ['- Back squat 4x5', {}, { name: 'Back squat' }],
  ['• Back squat 4x5', {}, { name: 'Back squat' }],
  ['1. Back squat 4x5', {}, { name: 'Back squat' }],
  ['2) Back squat 4x5', {}, { name: 'Back squat' }],
  ['[ ] Back squat 4x5', {}, { name: 'Back squat' }],
  ['**Back squat** 4x5', {}, { name: 'Back squat' }],
  ['Back squat: 4 × 6 · RPE 8', {}, { name: 'Back squat', sets: 4, reps: '6', rpe: 8 }],
  ['Back squat — 4 × 6 · 100 kg', {}, { name: 'Back squat', sets: 4, reps: '6', load: 100, loadType: 'kg' }],
  ['Bench 3 x 5 @ 2,5 kg', {}, { load: 2.5, loadType: 'kg' }],
];

for (const [line, opts, want] of CASES) {
  test('reads ' + JSON.stringify(line) + (opts.unit ? ' (unit ' + opts.unit + ')' : ''), () => {
    const r = view(one(line, opts));
    for (const [k, v] of Object.entries(want)) assert.deepEqual(r[k], v, k + ' of ' + JSON.stringify(line) + ' — got ' + JSON.stringify(r));
  });
}

test('every row is a builder row: newRow\'s keys, its defaults where the text said nothing, and the line it came from', () => {
  const base = DB.newRow();
  const r = one('Back squat 4x5 @225');
  for (const k of Object.keys(base)) assert.ok(k in r, 'the row is missing newRow\'s ' + k);
  assert.equal(r.rest, base.rest, 'a row with no rest written takes the builder\'s default, as the + button does');
  assert.equal(r.tempo, '');
  assert.equal(r.group, null);
  assert.equal(r.sourceLine, 'Back squat 4x5 @225');
  // and it is a row the shared document reads as the coach wrote it
  assert.equal(WD.loadLabel(r), '225 kg');
  assert.equal(WD.repsLabel(r), '5');
  assert.equal(DB.schemeLabel(r), '4 × 5 · 90s');
});

test('a ladder is one value per set, and the shared document writes it back the way it was pasted', () => {
  const r = one('Back squat 3 × 8/6/4 · 60/70/80 kg');
  assert.equal(r.sets, 3);
  assert.deepEqual(r.perSet, [{ reps: '8', load: 60 }, { reps: '6', load: 70 }, { reps: '4', load: 80 }]);
  assert.equal(WD.repsLabel(r), '8/6/4');
  assert.equal(WD.loadLabel(r), '60/70/80 kg');
  // reps alone, and loads alone
  assert.equal(WD.repsLabel(one('Bench 3x10/8/6')), '10/8/6');
  assert.equal(WD.loadLabel(one('Bench 3x5 @ 70/75/80%')), '70/75/80% 1RM');
  // ⚠ "3 x 10/10" IS TEN A SIDE, NOT A LADDER: two values on three sets is not one per set
  const side = one('Split squat 3 x 10/10');
  assert.equal(side.reps, '10/10');
  assert.ok(!side.perSet, 'a per-side count was read as a ladder');
  // and a load list that does not match the sets is kept as written, never spread
  assert.equal(one('Bench 3x5 60/70 kg').loadText, '60/70 kg');
});

// ── several rows, blocks and supersets ───────────────────────────────────────
test('a pasted session lands in its blocks, in the builder\'s block order, with rest lines applied', () => {
  const text = [
    'Warm-up:',
    '- Bike 5 min easy',
    '- Band pull-apart 2x15',
    '',
    'Main',
    '1. Back squat 4x5 @225 lb',
    'Rest 3 min',
    'A1 Pull-up 3x8 / A2 Dip 3x10',
    'Rest 2 min',
    'Accessory',
    'Seated leg curl 3x12',
    'Finisher',
    'Sled push 4 x 20m +90 lb',
  ].join('\n');
  const { blocks, warnings } = parse(text, { unit: 'lb' });
  assert.deepEqual(blocks.map((b) => b.kind), ['warmup', 'main', 'accessory', 'finisher']);
  assert.deepEqual(blocks.map((b) => b.rows.map((r) => r.name)), [
    ['Bike', 'Band pull-apart'],
    ['Back squat', 'Pull-up', 'Dip'],
    ['Seated leg curl'],
    ['Sled push'],
  ]);
  const main = blocks[1].rows;
  assert.equal(main[0].rest, '3 min', 'the rest line did not reach the row above it');
  assert.deepEqual(main.slice(1).map((r) => [r.group, r.rest]), [['A', '2 min'], ['A', '2 min']], 'a superset line\'s rest is every row on it');
  assert.equal(warnings.length, 0, 'a clean paste raised: ' + JSON.stringify(warnings));
});

test('a heading on the same line as its first exercise, a dash for a colon, and the order blocks come back in', () => {
  const { blocks, warnings } = parse('Finisher: Burpee 3x10\nWarm up (10 min): Bike 5 min\nStrength - \nBack squat 5x5\n## Accessories\nCurl 3x12');
  // listed finisher-first, returned in the builder's block order
  assert.deepEqual(blocks.map((b) => b.kind), ['warmup', 'main', 'accessory', 'finisher']);
  assert.deepEqual(blocks.map((b) => b.rows.map((r) => r.name)), [['Bike'], ['Back squat'], ['Curl'], ['Burpee']]);
  assert.equal(warnings.length, 0, JSON.stringify(warnings));
});

test('commas split exercises, but a piece with no name of its own stays with the one before it', () => {
  const r = rows('Back squat 4x5 @225, RDL 3x8 @185; Bench 5x5 @ 80%');
  assert.deepEqual(r.map((x) => [x.name, x.sets, x.reps, x.load]), [
    ['Back squat', 4, '5', 225], ['Romanian deadlift', 3, '8', 185], ['Bench press', 5, '5', 80],
  ]);
  const kept = rows('Back squat 4x5 @225, rest 3 min, tempo 31X1, heavy, RPE 8');
  assert.equal(kept.length, 1, 'a continuation was read as a new exercise');
  assert.deepEqual([kept[0].rest, kept[0].tempo, kept[0].rpe, kept[0].cue], ['3 min', '31X1', 8, 'heavy']);
  const sup = rows('A1 Pull-up 3x8, A2 Dip 3x10');
  assert.deepEqual(sup.map((x) => [x.name, x.group]), [['Pull-up', 'A'], ['Dip', 'A']]);
});

test('supersets on separate lines keep their letters, and a label never eats a name', () => {
  const r = rows('A1. Bench 4x6\na2) Row erg 4 x 250m\nB1 Curl 3x10\nB2 - Triceps pushdown 3x12\nT2B 3x10');
  assert.deepEqual(r.map((x) => [x.name, x.group]), [
    ['Bench press', 'A'], ['Rower', 'A'], ['Curl', 'B'], ['Triceps pushdown', 'B'], ['T2B', null],
  ]);
});

test('the default block is main, opts.block moves it, and an unknown block is refused', () => {
  assert.equal(parse('Back squat 4x5').blocks[0].kind, 'main');
  assert.equal(parse('Bike 5 min', { block: 'warmup' }).blocks[0].kind, 'warmup');
  assert.equal(parse('Bike 5 min', { block: 'sauna' }).blocks[0].kind, 'main');
});

// ── the warnings: every guess is named ───────────────────────────────────────
const messages = (text, opts) => parse(text, opts).warnings.map((w) => [w.line, w.message]);

test('a load with no unit says which unit it was read in, once, naming every line', () => {
  const { warnings } = parse('Back squat 4x5 @225\nBench 5x5 @ 100 kg\nDeadlift 1x5 @315', { unit: 'lb' });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].line, 1);
  assert.match(warnings[0].message, /lines 1, 3\) was read as lb/);
});

test('"@8" is read as RPE and says so; a load with a unit is never read as effort', () => {
  const w = messages('Squat 3x5 @8');
  assert.equal(w.length, 1);
  assert.match(w[0][1], /Read @8 as RPE 8/);
  assert.equal(one('Lateral raise 3x12 @ 8 kg').rpe, '', 'a weight with its unit was read as RPE');
  assert.equal(one('Lateral raise 3x12 @ 8 kg').load, 8);
  // a row that already has an RPE keeps "@n" as a load
  const both = one('Squat 3x5 @9 RPE 8', { unit: 'kg' });
  assert.deepEqual([both.rpe, both.load], [8, 9]);
});

test('an RPE off the scale is kept as written and named, never clamped', () => {
  const r = one('Squat 3x5 RPE 11');
  assert.equal(r.rpe, '');
  assert.equal(r.loadText, 'RPE 11');
  assert.ok(messages('Squat 3x5 RPE 11').some(([, m]) => /isn't on the 1–10 scale/.test(m)));
  assert.equal(one('Squat 3x5 RPE 8.5').rpe, 8.5);
  assert.equal(one('Squat 3x5 RPE 7.3').rpe, '');
});

test('a known move with no prescription gets 3 × 8 and a warning; an unknown line keeps empty sets and reps', () => {
  const known = one('Face pulls');
  assert.deepEqual([known.name, known.sets, known.reps], ['Face pull', 3, '8']);
  assert.match(messages('Face pulls')[0][1], /No sets × reps for Face pull; used the builder's 3 × 8/);
  const prose = one('Focus on bracing today');
  assert.deepEqual([prose.name, prose.sets, prose.reps, prose.sourceLine], ['Focus on bracing today', '', '', 'Focus on bracing today']);
  assert.match(messages('Focus on bracing today')[0][1], /kept the line as an exercise named/);
  const setsOnly = one('Back squat 3 sets');
  assert.deepEqual([setsOnly.sets, setsOnly.reps], [3, '']);
});

test('a bare number nobody can place is kept and named', () => {
  const r = one('Back squat 4x5 225');
  assert.equal(r.loadText, '225');
  assert.ok(messages('Back squat 4x5 225').some(([, m]) => /Couldn't tell what “225” is/.test(m)));
});

test('rest lines: a time is required, an exercise must come before, and "Rest 90" says it read seconds', () => {
  assert.deepEqual(messages('Rest 90s'), [[1, 'Rest 90s has no exercise above it; skipped.']]);
  assert.deepEqual(messages('Back squat 4x5\nRest day'), [[2, 'A rest line needs a time, like “Rest 90s”; skipped.']]);
  const { blocks, warnings } = parse('Back squat 4x5\nRest 90');
  assert.equal(blocks[0].rows[0].rest, '90s');
  assert.match(warnings[0].message, /Read Rest 90 as seconds/);
  assert.equal(parse('Back squat 4x5\nRest: 2-3 min between sets').blocks[0].rows[0].rest, '2-3 min');
  // a heading resets what a rest line can reach
  assert.ok(messages('Back squat 4x5\nAccessory\nRest 90s').some(([, m]) => /no exercise above it/.test(m)));
});

test('a day heading is skipped and named; one day is read at a time', () => {
  const { blocks, warnings } = parse('Day 1 - Lower\nBack squat 4x5\nMonday: Upper\nBench 4x5');
  assert.deepEqual(blocks[0].rows.map((r) => r.name), ['Back squat', 'Bench press']);
  assert.deepEqual(warnings.map((w) => w.line), [1, 3]);
  // a line that merely starts with a weekday is not a heading
  assert.equal(one('Sunday long run 90 min').name, 'Sunday long run');
});

test('the caps: 200 lines and 60 exercises, each named when it bites', () => {
  const many = Array.from({ length: 70 }, (_, i) => 'Curl ' + (i + 1) + ' 3x10').join('\n');
  const capped = parse(many);
  assert.equal(capped.blocks[0].rows.length, 60);
  assert.ok(capped.warnings.some((w) => /first 60 exercises/.test(w.message)));
  const long = Array.from({ length: 205 }, () => '').concat(['Back squat 4x5']).join('\n');
  const cut = parse(long);
  assert.equal(cut.blocks.length, 0);
  assert.ok(cut.warnings.some((w) => /first 200 lines/.test(w.message)));
});

test('empty and junk input', () => {
  assert.deepEqual(parse(''), { blocks: [], warnings: [] });
  assert.deepEqual(parse(null), { blocks: [], warnings: [] });
  assert.deepEqual(parse('\n  \n\t\n'), { blocks: [], warnings: [] });
  assert.equal(parse('\r\nBack squat 4x5\r\n').blocks[0].rows.length, 1, 'Windows line endings');
});

// ── names resolve to the library, never by a guess ───────────────────────────
test('a name resolves to a move by its name, an alias or a plural — and otherwise stays as typed', () => {
  assert.equal(one('OHP 5x5').name, 'Overhead press');
  assert.equal(one('pullups 3x8').name, 'Pull-up');
  assert.equal(one("Farmer's walk 3 x 40m").name, 'Farmer carry');
  assert.equal(one('Hex bar deadlift 3x5').name, 'Trap-bar deadlift');
  // ⚠ no fuzzy matching: a near miss is the coach's own move
  assert.equal(one('Back squats paused 3x3').name, 'Back squats paused');
  assert.equal(one('Romanian dead 3x8').name, 'Romanian dead');
  // the library a UI passes (e.g. the table plus the coach's own moves) is the one used
  const own = [{ name: 'Sissy squat', muscle: 'Quads', equipment: 'Bodyweight', aliases: ['Sissy'] }];
  const r = one('Sissy 3x12', { library: own });
  assert.deepEqual([r.name, r.muscle, r.equipment], ['Sissy squat', 'Quads', 'Bodyweight']);
  assert.equal(one('Sissy 3x12').name, 'Sissy', 'the default library has no such alias');
});

test('the parser\'s unit list is the shared one', () => {
  // ⚠ ONE RULE FOR "A REP VALUE THAT IS A HOLD OR A DISTANCE". The parser reads it from
  // ShapeWorkoutDocument when that is loaded; the literal it falls back to must not drift.
  const src = readFileSync(new URL('../public/newdesign/dashBuilderCore.js', import.meta.url), 'utf8');
  const m = /var PASTE_UNITS = \(WorkoutDoc && WorkoutDoc\.TIME_DISTANCE_UNITS\) \|\| "([^"]+)";/.exec(src);
  assert.ok(m, 'the fallback unit list moved');
  assert.equal(m[1], WD.TIME_DISTANCE_UNITS);
});

test('no lookbehind in the builder core — Safari before 16.4 refuses the whole script for one', () => {
  const src = readFileSync(new URL('../public/newdesign/dashBuilderCore.js', import.meta.url), 'utf8');
  assert.ok(!/\(\?<[=!]/.test(src), 'a lookbehind would take the builder down on older iPads');
});
