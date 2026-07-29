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
} from '../mobile-app/src/services/planOutline.mjs';
import { bsPlanPreview } from '../mobile-app/src/services/planPreview.mjs';

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
