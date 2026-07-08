import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsAssignExercise,
  bsAssignDayLine,
  bsAssignMeal,
  bsMaterializeOutline,
} from '../mobile-app/src/services/planOutline.mjs';

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
