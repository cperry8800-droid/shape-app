import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsAssignExercise,
  bsAssignDayLine,
  bsAssignWeekLine,
  bsWeekUnits,
  bsWeekSpan,
  bsAssignMeal,
  bsMaterializeOutline,
  bsPlannedMinutes,
  bsPlannedRpe,
  bsBlockIsSession,
  bsAssignIso,
  bsAssignMonday,
  bsAssignKey,
  bsAssignWeeks,
  BS_TIME_DISTANCE_UNITS,
} from '../mobile-app/src/services/planOutline.mjs';
import { bsPlanPreview } from '../mobile-app/src/services/planPreview.mjs';
import { bsMoveTotalReps } from '../mobile-app/src/services/workoutSession.mjs';
import { builderToOutlineBlocks, repsLabel, loadLabel, exerciseFromRow } from '../public/newdesign/workoutDocument.mjs';

test('exercise parse: "Back squat — 4 × 6 · RPE 8"', () => {
  const e = bsAssignExercise('Back squat — 4 × 6 · RPE 8');
  assert.equal(e.name, 'Back squat');
  assert.equal(e.sets, '4');
  assert.equal(e.reps, '6');
  assert.equal(e.load, 'RPE 8');
});

test('exercise parse: dot-only form "Secondary compound · 4×8"', () => {
  const e = bsAssignExercise('Secondary compound · 4×8');
  assert.equal(e.name, 'Secondary compound');
  assert.equal(e.sets, '4');
  assert.equal(e.reps, '8');
});

// ⚠ A SINGLE TIMED OR DISTANCE VALUE KEEPS ITS UNIT. The plain pattern stopped at the
// first non-digit, so "3 × 30s" read as 30 reps and a load of "s" in a plan's public
// preview and in a text-outline plan's member rows.
test('exercise parse: a single timed or distance value keeps its unit, and the load after it', () => {
  const cases = [
    ['Plank — 3 × 30s', '3', '30s', ''],
    ['Run — 3 × 400m', '3', '400m', ''],
    ['Hold — 3 × 45 sec', '3', '45 sec', ''],
    ['Row — 4 × 2 min', '4', '2 min', ''],
    ['Carry — 3 × 40 m · 32 kg', '3', '40 m', '32 kg'],
    ['Carry — 3 × 40m·32 kg', '3', '40m', '32 kg'],
    ['Run — 1 × 1 km', '1', '1 km', ''],
    ['Run — 2 × 1 mi', '2', '1 mi', ''],
    ['Run — 3 × 1.5 km · RPE 7', '3', '1.5 km', 'RPE 7'],
    ['Plank — 3 × 30-45s', '3', '30-45s', ''],
    ['Sled — 4 × 20 yd · heavy', '4', '20 yd', 'heavy'],
    ['Hold — 3 × 30 seconds each side', '3', '30 seconds', 'each side'],
    ['Run — 5 × 400m, 90s rest', '5', '400m', '90s rest'],
    ['Bike — 4 × 5 minutes; easy spin', '4', '5 minutes', 'easy spin'],
    ['Hold — 3 × 45 Sec', '3', '45 Sec', ''],
  ];
  for (const [line, sets, reps, load] of cases) {
    const e = bsAssignExercise(line);
    assert.deepEqual({ sets: e.sets, reps: e.reps, load: e.load }, { sets, reps, load }, line);
  }
});

// ⚠ AND EVERY OTHER LINE READS EXACTLY AS IT DID BEFORE THE RULE. The expected values
// were recorded from the parser on main before the change, not written by hand.
test('exercise parse: a line with no single timed or distance value reads exactly as before', () => {
  const before = [
    // the three the unit rule must not reach
    ['Squat — 3 × 5 · 60 kg', '3', '5', '60 kg'],
    ['Bench — 3 × 70/75/80% 1RM', '3', '70', '/75/80% 1RM'],
    ['Back squat — 4 × 6 · RPE 8', '4', '6', 'RPE 8'],
    // plain numbers, ranges and the separators that end them
    ['Secondary compound · 4×8', '4', '8', ''],
    ['Bench — 4 × 6-8 · RPE 8', '4', '6-8', 'RPE 8'],
    ['Squat — 3 × 12-15 · 90s rest', '3', '12-15', '90s rest'],
    ['Squat — 3 × 5; rest 2 min', '3', '5', 'rest 2 min'],
    ['Squat — 3 × 5 · 60 kg · RPE 8', '3', '5', '60 kg · RPE 8'],
    // a word that starts with a unit's letters is not a unit
    ['Squat — 3 × 5 sets', '3', '5', 'sets'],
    ['Bench — 3 × 8 max', '3', '8', 'max'],
    ['Walk — 3 × 10 steps', '3', '10', 'steps'],
    ['Row — 3 × 12 slow', '3', '12', 'slow'],
    ['Row — 3 × 10 mph', '3', '10', 'mph'],
    // ladders belong to the two ladder readers
    ['Back squat — 3 × 8/6/4 · 60/70/80 kg · RPE 8', '3', '8/6/4', '60/70/80 kg · RPE 8', true],
    ['Plank — 3 × 30s/45s/60s', '3', '30s/45s/60s', '', true],
    ['Run — 3 × 400m/800m/1200m', '3', '400m/800m/1200m', '', true],
    ['Back squat — 3 × 8/6/AMRAP · 60 kg', '3', '8/6/AMRAP', '60 kg', true],
    // an uppercase X is not the multiplication sign, a weight unit is not a hold, and a
    // decimal with no unit after it reads as it always has
    ['Squat — 3 X 5 · 60 kg', '', '', '3 X 5 · 60 kg'],
    ['Squat — 3 × 5 kg', '3', '5', 'kg'],
    ['Row — 3 × 1.5', '3', '1', '.5'],
    // ⚠ KNOWN LEFTOVERS, STILL SPLIT IN TWO AND PINNED AS THEY WERE READ. A unit run into a
    // list, a range or a rate, a per-side suffix, a trailing period, m:ss, spelled-out
    // distances the list does not name, and a decimal comma. Reading one of them whole is its own
    // change, and it should change this table on purpose rather than as a side effect.
    ['Plank — 3 × 30s/45s', '3', '30', 's/45s'],
    ['Plank — 3 × 30s-45s', '3', '30', 's-45s'],
    ['Plank — 3 × 30s/side', '3', '30', 's/side'],
    ['Row — 3 × 10 m/s', '3', '10', 'm/s'],
    ['Hold — 3 × 10 sec.', '3', '10', 'sec.'],
    ['Plank — 3 × 1:30', '3', '1', ':30'],
    ['Run — 3 × 1 mile', '3', '1', 'mile'],
    ['Run — 3 × 400 meters', '3', '400', 'meters'],
    ['Run — 3 × 1,5 km', '3', '1', '5 km'],
    ['Lunge — 3 × 10/side · 20 kg', '3', '10', '/side · 20 kg'],
  ];
  assert.ok(before.length >= 30, `expected the recorded table; found ${before.length} lines`);
  for (const [line, sets, reps, load, ladder] of before) {
    const e = bsAssignExercise(line);
    assert.deepEqual({ sets: e.sets, reps: e.reps, load: e.load, ladder: !!e.perSet }, { sets, reps, load, ladder: !!ladder }, line);
  }
});

// ⚠ THE BUILDER'S OWN TEXT READS BACK WHOLE. builderToOutlineBlocks writes a timed or
// distance row, and this parser reads that text in the Listing preview and in a
// text-outline plan, so the two must agree on the reps, the load and a weight ladder.
test('a timed or distance row written by the builder reads back with its unit intact', () => {
  const rows = [
    { name: 'Plank', sets: 3, reps: '30s' },
    { name: 'Hold', sets: 3, reps: '45 sec', rpe: 7 },
    { name: 'Row', sets: 4, reps: '2 min' },
    { name: 'Run', sets: 5, reps: '400m' },
    { name: 'Carry', sets: 3, reps: '40 m', load: 32 },
    { name: 'Run', sets: 3, reps: '1.5 km' },
    { name: 'Sled', sets: 4, reps: '20 yd', load: 100, loadType: 'lb' },
    { name: 'Carry', sets: 3, reps: '40 m', load: 60, perSet: [{ load: 60 }, { load: 70 }, { load: 80 }] },
  ].map((r, i) => ({ id: 'r' + i, load: 0, loadType: 'kg', ...r }));
  assert.ok(rows.some((r) => exerciseFromRow(r).perSet), 'a weight ladder is among them');
  for (const row of rows) {
    const [block] = builderToOutlineBlocks({ weeks: [{ days: [{ name: 'D', blocks: [{ kind: 'main', rows: [row] }] }] }] });
    assert.ok(block.text.includes(' × ' + row.reps), 'the builder wrote the unit: ' + block.text);
    const e = bsAssignExercise(block.text);
    assert.equal(e.sets, String(row.sets), block.text);
    assert.equal(e.reps, repsLabel(row), block.text);
    assert.equal(e.load, loadLabel(row), block.text);
    assert.deepEqual(e.perSet, exerciseFromRow(row).perSet, block.text);
  }
});

// ⚠ THE PARSER AND THE REP TOTAL READ ONE RULE. Every spelling the list names, run on,
// spaced and with a decimal part, is kept whole by the parser and is not a count to
// bsMoveTotalReps. The controls are numbers with no unit, which both read as before.
test('the rep total declines to count every value the parser keeps whole', () => {
  const forms = BS_TIME_DISTANCE_UNITS.split('|').flatMap((u) => (u.endsWith('?') ? [u.slice(0, -2), u.slice(0, -1)] : [u]));
  assert.ok(forms.length >= 16, `expected every spelling of the list; expanded ${forms.length}`);
  for (const unit of forms) {
    for (const value of [`30${unit}`, `30 ${unit}`, `1.5 ${unit}`]) {
      const e = bsAssignExercise(`Move — 3 × ${value}`);
      assert.equal(e.reps, value, `the parser keeps "${value}" whole`);
      assert.equal(e.load, '', `and leaves no piece of "${value}" in the load`);
      assert.equal(bsMoveTotalReps({ s: `3 × ${e.reps}` }), 0, `"${value}" is not a count`);
    }
  }
  assert.equal(bsMoveTotalReps({ s: '3 × 30' }), 90, 'a number with no unit still counts');
  assert.equal(bsMoveTotalReps({ s: '3 × 1.5' }), 3, 'a decimal with no unit reads as it always has');
});

test('day line: "Mon — Upper (push)" → dow 0; non-day → null', () => {
  assert.equal(bsAssignDayLine('Mon — Upper (push)').dow, 0);
  assert.equal(bsAssignDayLine('Fri — Rest').rest, true);
  assert.equal(bsAssignDayLine('Back squat — 4×6'), null);
});

test('meal parse: "Breakfast — Greek yogurt bowl · 420 kcal"', () => {
  const m = bsAssignMeal('Breakfast — Greek yogurt bowl · 420 kcal');
  assert.equal(m.slot, 'BREAKFAST');
  assert.equal(m.title, 'Greek yogurt bowl · 420 kcal');
  assert.equal(m.kcal, 420);
});

test('materializeOutline: a 3-day split schedules across N weeks, stamped plan runId', () => {
  const plan = { id: 'p9', name: 'PPL', detail: { blocks: [
    { text: 'Mon — Push' }, { text: 'Wed — Pull' }, { text: 'Fri — Legs' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 2, runId: 'r1' }); // Mon
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.payload.program.id === 'plan:p9' && r.payload.program.runId === 'r1'));
  assert.equal(rows[0].scheduledDate, '2026-07-13'); // Mon wk1
  assert.equal(rows[1].scheduledDate, '2026-07-15'); // Wed wk1
  assert.equal(rows[3].scheduledDate, '2026-07-20'); // Mon wk2
});

test('materializeOutline: rest days are skipped in a split', () => {
  const plan = { id: 'p', name: 'X', detail: { blocks: [
    { text: 'Mon — Upper' }, { text: 'Tue — Rest' }, { text: 'Wed — Lower' }, { text: 'Thu — Full' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 1, runId: 'r' });
  assert.equal(rows.length, 3); // 4 day lines, Tue rest dropped → still ≥3 so it's a split
  assert.ok(!rows.some((r) => /rest/i.test(r.title)));
});

test('materializeOutline: a non-split exercise outline becomes one weekly session', () => {
  const plan = { id: 'p2', name: 'Strength', detail: { blocks: [
    { text: 'Back squat — 4×6' }, { text: 'Bench press — 4×8' }], note: 'Progress weekly' } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 3, runId: 'rr' });
  assert.equal(rows.length, 3); // one session/week × 3
  assert.equal(rows[0].title, 'Strength');
  assert.equal(rows[0].payload.exercises.length, 2);
  assert.equal(rows[0].payload.exercises[0].name, 'Back squat');
  assert.equal(rows[1].scheduledDate, '2026-07-20');
});

// ── Week-block outlines ─────────────────────────────────────────────────────
// NOT malformed input: the trainer's paid `plan` builder and the nutritionist's
// `program` builder both emit exactly this shape (and label the field "Weeks").
// A week label describes HOW HARD over time; it is not a movement.

test('week line: "Week 3 — Intensification" parses; weekday / exercise lines do not', () => {
  const w = bsAssignWeekLine('Week 3 — Intensification');
  assert.equal(w.week, 3);
  assert.equal(w.title, 'Intensification');
  assert.equal(bsAssignWeekLine('Week 1').week, 1);   // a bare label still parses
  assert.equal(bsAssignWeekLine('Week 1').title, ''); // …with no stated phase
  assert.equal(bsAssignWeekLine('Mon — Upper (push)'), null);
  assert.equal(bsAssignWeekLine('Back squat — 4×6'), null);
  assert.equal(bsAssignWeekLine('Weekly conditioning — 3×10'), null); // "Weekly" is not "Week N"
});

test('materializeOutline: a week label is NEVER turned into an exercise (the regression)', () => {
  const plan = { id: 'pw', name: 'Hypertrophy Block', detail: { blocks: [
    { text: 'Week 1 — Accumulation' }, { text: 'Week 2 — Accumulation' },
    { text: 'Week 3 — Intensification' }, { text: 'Week 4 — Deload' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 4, runId: 'r' });
  const names = rows.flatMap((r) => r.payload.exercises.map((e) => e.name));
  assert.equal(names.length, 0, `week labels leaked in as exercises: ${JSON.stringify(names)}`);
  // and the old bug's exact signature — a "load" of Intensification — is gone
  const loads = rows.flatMap((r) => r.payload.exercises.map((e) => e.load));
  assert.ok(!loads.includes('Intensification'));
});

test('materializeOutline: a week-block outline schedules ONE session per stated week, titled by phase', () => {
  const plan = { id: 'pw', name: 'Hypertrophy Block', detail: { blocks: [
    { text: 'Week 1 — Accumulation' }, { text: 'Week 2 — Accumulation' },
    { text: 'Week 3 — Intensification' }, { text: 'Week 4 — Deload' }], note: 'Bring the log.' } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 4, runId: 'r' });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.title),
    ['Accumulation', 'Accumulation', 'Intensification', 'Deload']);
  assert.deepEqual(rows.map((r) => r.scheduledDate),
    ['2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03']);
  assert.deepEqual(rows.map((r) => r.payload.program.week), [1, 2, 3, 4]);
  assert.equal(rows[2].payload.program.phase, 'Intensification');
  assert.ok(rows.every((r) => r.payload.program.id === 'plan:pw' && r.payload.program.runId === 'r'));
});

test('materializeOutline: the outline states its own length — a trailing non-week block is not a week', () => {
  // The nutritionist `program` builder emits exactly this (4 weeks + a guide).
  const plan = { id: 'pn', name: 'Reset', detail: { blocks: [
    { text: 'Week 1 — Reset & habits' }, { text: 'Week 2 — Build routine' },
    { text: 'Week 3 — Dial macros' }, { text: 'Week 4 — Lock it in' },
    { text: 'Grocery + prep guide' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 4, runId: 'r' });
  assert.equal(rows.length, 4, 'the guide block must not schedule a 5th week');
  assert.ok(!rows.some((r) => /grocery/i.test(r.title)));
});

test('materializeOutline: a split keeps its phase label instead of silently dropping it', () => {
  const plan = { id: 'ps', name: 'PPL', detail: { blocks: [
    { text: 'Week 1 — Base' }, { text: 'Mon — Push' }, { text: 'Wed — Pull' }, { text: 'Fri — Legs' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 2, runId: 'r' });
  assert.equal(rows.length, 6, 'split still wins (>=3 day lines) — 3 sessions x 2 weeks');
  assert.ok(!rows.some((r) => /^week/i.test(r.title)), 'a week label is not a session title here');
  assert.equal(rows[0].payload.program.phase, 'Base', 'week 1 sessions carry the phase');
  assert.equal(rows[3].payload.program.phase, undefined, 'week 2 has no stated phase');
});

test('materializeOutline: duration is the STATED SPAN, not the number of labels', () => {
  // "Week 1" + "Week 6" is a six-week plan with two authored weeks. Counting
  // labels would persist weeks:2 while the last session lands five weeks out.
  const plan = { id: 'sp', name: 'Sparse', detail: { blocks: [
    { text: 'Week 1 — Base' }, { text: 'Week 6 — Peak' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 4, runId: 'r' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.scheduledDate), ['2026-07-13', '2026-08-17']); // +0 and +5 weeks
  assert.ok(rows.every((r) => r.payload.program.weeks === 6), 'persisted duration is the span');
  assert.equal(bsPlanPreview(plan).weeks, 6, 'and the preview agrees');
});

test('week units: duplicates collapse and out-of-order lines sort ascending', () => {
  const lines = ['Week 3 — Peak', 'Week 1 — Base', 'Week 3 — Duplicate', 'Week 2 — Build'].map(bsAssignWeekLine);
  const u = bsWeekUnits(lines);
  assert.deepEqual(u.map((x) => x.week), [1, 2, 3]);
  assert.equal(u[2].title, 'Peak', 'the first stated title for a week wins');
  assert.equal(bsWeekSpan(u), 3);
  assert.deepEqual(bsWeekUnits([]), []);
  assert.equal(bsWeekSpan([]), 0);
});

// The preview module's stated contract: "one implementation, so a preview can
// never describe a plan differently from how it is delivered." Pin it.
test('preview and materialize AGREE on the built-in 6-week plan outline', () => {
  const blocks = ['Week 1 — Accumulation', 'Week 2 — Accumulation', 'Week 3 — Intensification',
    'Week 4 — Deload', 'Week 5 — Peak', 'Week 6 — Retest'].map((text, i) => ({ id: 'b' + i, text }));
  const plan = { id: 'pb', name: 'Hypertrophy Plan', detail: { blocks } };
  const pv = bsPlanPreview(plan);
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 6, runId: 'r' });
  assert.equal(pv.kind, 'block');
  assert.equal(pv.weeks, 6, 'preview reads 6 weeks');
  assert.equal(rows.length, 6, 'delivery must produce the 6 weeks the preview promised');
  assert.equal(pv.units.length, rows.length);
});

test('preview and materialize agree on a MESSY outline (duplicate + out of order)', () => {
  // A clean 1..6 sequence can't catch the two modules aggregating differently.
  // Before bsWeekUnits was shared, the preview neither deduped nor sorted, so it
  // listed 4 units in authored order while delivery built 3 in week order —
  // a different unit count AND a different paid-content `locked` count.
  const blocks = ['Week 3 — Peak', 'Week 1 — Base', 'Week 3 — Duplicate', 'Week 2 — Build']
    .map((text, i) => ({ id: 'b' + i, text }));
  const plan = { id: 'pm', name: 'Messy', detail: { blocks } };
  const pv = bsPlanPreview(plan);
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 3, runId: 'r' });
  assert.equal(pv.units.length, rows.length, 'same unit count');
  assert.deepEqual(pv.units.map((u) => u.label), ['WEEK 1', 'WEEK 2', 'WEEK 3']);
  assert.deepEqual(rows.map((r) => r.payload.program.week), [1, 2, 3], 'same order');
  assert.deepEqual(pv.units.map((u) => u.title), rows.map((r) => r.title), 'same titles');
  assert.equal(pv.weeks, 3);
  assert.ok(rows.every((r) => r.payload.program.weeks === 3));
});

// ── Deploy 2b: the planned-load pair (SPEC-guardrails.md §3.2a, capture design §2)
//
// plannedMinutes is an ENUM MAPPING over the LENGTH chip's own closed list, not
// a parse. The hazard these fixtures pin is the one that loosens ceilings
// silently: resolving a range by picking an end, or letting a failed mapping
// become 0.

test('bsPlannedMinutes maps the four chip values and nothing else', () => {
  assert.equal(bsPlannedMinutes('30 min'), 30);
  assert.equal(bsPlannedMinutes('45 min'), 45);
  assert.equal(bsPlannedMinutes('60 min'), 60);
  assert.equal(bsPlannedMinutes('75 min'), 75);
});

test('a RANGED length is ABSENT — never resolved to an end', () => {
  // A 45-vs-60 resolution is a 33% swing in that session's load, silently, in
  // the direction that loosens ceilings.
  assert.equal(bsPlannedMinutes('45-60 minutes'), undefined);
  assert.equal(bsPlannedMinutes('45–60 min'), undefined);
});

test('prose, empty and foreign values are ABSENT', () => {
  for (const v of ['', '   ', 'about an hour', '45', '45 min ', 'PT45M', null, undefined, 45, {}]) {
    assert.equal(bsPlannedMinutes(v), undefined, String(v));
  }
});

test('a failed mapping yields ABSENT, never 0', () => {
  // A zero-minute session scores as ZERO LOAD and reads as a rest day the coach
  // never wrote — the single most dangerous wrong answer this function has.
  assert.notEqual(bsPlannedMinutes('nonsense'), 0);
  assert.equal(bsPlannedMinutes('nonsense'), undefined);
});

test('the mapping cannot be reached through the prototype chain', () => {
  // A bare `LOOKUP[value]` would return Object.prototype.toString for
  // 'toString'. hasOwnProperty is the reason it does not.
  assert.equal(bsPlannedMinutes('toString'), undefined);
  assert.equal(bsPlannedMinutes('constructor'), undefined);
  assert.equal(bsPlannedMinutes('__proto__'), undefined);
});

test('bsPlannedRpe maps the four effort chips and nothing else', () => {
  assert.equal(bsPlannedRpe('RPE 6'), 6);
  assert.equal(bsPlannedRpe('RPE 9'), 9);
  assert.equal(bsPlannedRpe('RPE 8.5'), undefined);   // not on the chip list
  assert.equal(bsPlannedRpe('8'), undefined);
  assert.equal(bsPlannedRpe(''), undefined);
  assert.equal(bsPlannedRpe('__proto__'), undefined);
});

test('bsBlockIsSession is true only where a block IS a session', () => {
  // capture design §6, read through the ONE classifier. Three surfaces already
  // classify through planOutline and a fourth opinion is how they disagree.
  assert.equal(bsBlockIsSession('Mon — Upper (push)'), true);
  assert.equal(bsBlockIsSession('Week 1 — Accumulation'), true);
  assert.equal(bsBlockIsSession('Main lift · 4×8'), false);
  assert.equal(bsBlockIsSession('Warm-up · 8 min'), false);
  assert.equal(bsBlockIsSession(''), false);
  assert.equal(bsBlockIsSession(null), false);
});

test('a REST day line is not a session — nothing is scheduled to capture', () => {
  assert.equal(bsBlockIsSession('Sun — Rest'), false);
});

// ── The week-shaped publish boundary's caller-side helpers (§9.4) ────────────

test('bsAssignMonday: every day of a week resolves to the SAME Monday', () => {
  // Mon 2026-07-27 .. Sun 2026-08-02. A session can only ride the week it
  // actually falls in, so this is what decides which publish it joins.
  const days = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
  for (const d of days) {
    const [y, m, day] = d.split('-').map(Number);
    assert.equal(bsAssignIso(bsAssignMonday(new Date(y, m - 1, day))), '2026-07-27', d);
  }
  // ...and the next day starts a NEW week, or a Sunday session would be
  // published into the week that just ended.
  assert.equal(bsAssignIso(bsAssignMonday(new Date(2026, 7, 3))), '2026-08-03');
});

test('bsAssignMonday: a Monday is its own Monday, and the input is not mutated', () => {
  const d = new Date(2026, 6, 27);
  assert.equal(bsAssignIso(bsAssignMonday(d)), '2026-07-27');
  assert.equal(bsAssignIso(d), '2026-07-27');
});

test('bsAssignKey: UUID-shaped, or the boundary rejects the whole publish', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  // Sweep, not a single sample: the version/variant nibbles are STAMPED, but
  // the surrounding hex is hash output — a padding slip only shows on some seeds.
  for (let i = 0; i < 500; i += 1) {
    const key = bsAssignKey(`client-${i} plan-${i * 7} 2026-07-${(i % 28) + 1}`);
    assert.match(key, UUID, `seed ${i} produced ${key}`);
  }
  assert.match(bsAssignKey(''), UUID);
});

test('bsAssignKey: the SAME assignment always mints the same key (a retry replays)', () => {
  // This is the whole offline-replay guarantee: an app killed mid-publish must
  // re-derive the identical key, or the retry reads as a second publish.
  const seed = 'coach-a plan-hypertrophy 2026-07-27';
  assert.equal(bsAssignKey(seed), bsAssignKey(seed));
});

test('bsAssignKey: a DIFFERENT assignment mints a different key', () => {
  // Each part of the seed must move the key — a week, a client or a start date
  // that collides would silently publish one assignment as another.
  const keys = new Set([
    bsAssignKey('client-a plan-x 2026-07-27'),
    bsAssignKey('client-b plan-x 2026-07-27'), // different client
    bsAssignKey('client-a plan-y 2026-07-27'), // different plan
    bsAssignKey('client-a plan-x 2026-08-03'), // different week
  ]);
  assert.equal(keys.size, 4);
});

test('bsAssignKey: no collisions across a realistic assignment space', () => {
  // 20 clients x 12 plans x 8 weeks. A collision here would publish one
  // client's week under another's key and the boundary would call it delivered.
  const seen = new Set();
  for (let c = 0; c < 20; c += 1) {
    for (let p = 0; p < 12; p += 1) {
      for (let w = 0; w < 8; w += 1) {
        seen.add(bsAssignKey(`client-${c} plan-${p} 2026-07-${w + 1}`));
      }
    }
  }
  assert.equal(seen.size, 20 * 12 * 8);
});

// ── bsAssignWeeks: grouping + the capture stamp ─────────────────────────────

const row = (iso, over = {}) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { date: new Date(y, m - 1, d), title: `S ${iso}`, description: 'note', block: null, ...over };
};
const PAIR = { block: { plannedMinutes: 60, plannedRpe: 7 } };

test('bsAssignWeeks: sessions group by their OWN Monday, not the first one', () => {
  // Fri 2026-07-31 and Sat 2026-08-01 share a week; Mon 2026-08-03 starts a new
  // one. Grouping the Monday into the first week would put it inside a replace
  // that deletes a week it was never part of.
  const out = bsAssignWeeks([row('2026-07-31'), row('2026-08-01'), row('2026-08-03')]);
  assert.deepEqual(out.map(w => w.weekStartISO), ['2026-07-27', '2026-08-03']);
  assert.equal(out[0].sessions.length, 2);
  assert.equal(out[1].sessions.length, 1);
});

test('bsAssignWeeks: weeks come back in calendar order whatever order they arrive', () => {
  // The boundary is called in sequence and a rejection stops the run, so the
  // coach must be shown the EARLIEST offending week, not an arbitrary one.
  const out = bsAssignWeeks([row('2026-08-10'), row('2026-07-27'), row('2026-08-03')]);
  assert.deepEqual(out.map(w => w.weekStartISO), ['2026-07-27', '2026-08-03', '2026-08-10']);
});

test('bsAssignWeeks: a fully-paired week declares per_session on the week AND every session', () => {
  const out = bsAssignWeeks([row('2026-07-27', PAIR), row('2026-07-29', PAIR)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].capture, 'per_session');
  for (const s of out[0].sessions) {
    assert.equal(s.loadCapture, 'per_session');
    assert.equal(s.plannedMinutes, 60);
    assert.equal(s.plannedRpe, 7);
  }
});

test('bsAssignWeeks: a PARTIALLY paired week publishes UNSTAMPED (F158)', () => {
  // The rule this whole function exists for. A partial stamp is malformed, one
  // malformed row makes the evaluation `unknown`, and `unknown` never blocks —
  // so stamping here would silently switch the guardrail OFF. Unstamped reads
  // as `incomplete_week`, which is what actually happened: a skipped field.
  const out = bsAssignWeeks([row('2026-07-27', PAIR), row('2026-07-29')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].capture, undefined);
  for (const s of out[0].sessions) {
    assert.equal(s.loadCapture, undefined);
    assert.equal(s.plannedMinutes, undefined);
    assert.equal(s.plannedRpe, undefined);
  }
});

test('bsAssignWeeks: HALF a pair is not a pair — minutes without an effort is unstamped', () => {
  const out = bsAssignWeeks([row('2026-07-27', { block: { plannedMinutes: 60 } })]);
  assert.equal(out[0].capture, undefined);
  assert.equal(out[0].sessions[0].plannedMinutes, undefined);
});

test('bsAssignWeeks: the stamp is decided PER WEEK, not across the assignment', () => {
  // A coach who captured week 1 and skipped week 2 must not lose week 1's
  // measurement, and must not have week 2 report a hole it never had.
  const out = bsAssignWeeks([row('2026-07-27', PAIR), row('2026-08-03')]);
  assert.equal(out[0].capture, 'per_session');
  assert.equal(out[1].capture, undefined);
});

test('bsAssignWeeks: a null-valued pair is ABSENCE, never a zero', () => {
  // `Number(null)` is a finite 0. Reading it as captured would invent a
  // zero-load session and drag the client's baseline down with it.
  const out = bsAssignWeeks([row('2026-07-27', { block: { plannedMinutes: null, plannedRpe: null } })]);
  assert.equal(out[0].capture, undefined);
  assert.equal(out[0].sessions[0].plannedMinutes, undefined);
});

test('bsAssignWeeks: sessions carry NO id — the boundary excludes synthesized ids from the digest', () => {
  // An index-derived id would make a re-ordered retry hash to a different week
  // and read as a CONFLICT rather than a replay.
  const out = bsAssignWeeks([row('2026-07-27'), row('2026-07-29')]);
  for (const s of out[0].sessions) assert.equal('id' in s, false);
});

test('bsAssignWeeks: basePayload merges into every session, exercises default to []', () => {
  const out = bsAssignWeeks([row('2026-07-27'), row('2026-07-29', { exercises: [{ name: 'Squat' }] })], { time: '17:45' });
  assert.deepEqual(out[0].sessions[0].payload, { exercises: [], time: '17:45' });
  assert.deepEqual(out[0].sessions[1].payload, { exercises: [{ name: 'Squat' }], time: '17:45' });
});

test('bsAssignWeeks: basePayload cannot shadow the authored exercises', () => {
  // The base is spread FIRST so authored content always wins. Spread last, any
  // caller-supplied `exercises` key silently replaced the coach's own list — and
  // the publish would have reported success for a session nobody authored.
  const out = bsAssignWeeks(
    [row('2026-07-27', { exercises: [{ name: 'Squat' }] })],
    { time: '17:45', exercises: [{ name: 'INJECTED' }] },
  );
  assert.deepEqual(out[0].sessions[0].payload.exercises, [{ name: 'Squat' }]);
  assert.equal(out[0].sessions[0].payload.time, '17:45');
});

test('bsAssignWeeks: junk in cannot produce a junk publish', () => {
  assert.deepEqual(bsAssignWeeks(null), []);
  assert.deepEqual(bsAssignWeeks([]), []);
  assert.deepEqual(bsAssignWeeks([null, { date: 'nope' }, { date: new Date(NaN) }]), []);
});
