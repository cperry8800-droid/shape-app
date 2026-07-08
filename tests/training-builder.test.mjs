import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_BUILDER_CAP,
  bsProgramRowCount,
  bsProgramFits,
  bsMoveRow,
  bsMaterializeProgram,
  bsRepeatSpec,
  bsSlotRepeats,
} from '../mobile-app/src/services/trainingBuilder.mjs';

test('cap: 26x7 = 182 fits; over the product is rejected', () => {
  assert.equal(BS_BUILDER_CAP, 182);
  assert.equal(bsProgramRowCount(26, 7), 182);
  assert.ok(bsProgramFits(26, 7));
  assert.ok(!bsProgramFits(27, 7)); // weeks > 26
  assert.ok(!bsProgramFits(26, 8)); // days > 7
  assert.ok(!bsProgramFits(0, 3)); // weeks < 1
  assert.ok(!bsProgramFits(4, 0)); // days < 1
});

test('bsMoveRow: lift keeps sets/reps/load, segment keeps seg', () => {
  assert.deepEqual(bsMoveRow({ name: 'Squat', sets: 4, reps: '6', load: '185 lb' }),
    { name: 'Squat', sets: '4', reps: '6', load: '185 lb', seg: '' });
  assert.deepEqual(bsMoveRow({ name: 'Run', seg: '10 mi · Z2' }),
    { name: 'Run', sets: '', reps: '', load: '', seg: '10 mi · Z2' });
});

test('materialize: dates land on the right weekdays from the start Monday', () => {
  const rows = bsMaterializeProgram({
    name: 'Marathon', discipline: 'run', startISO: '2026-07-13', runId: 'r1', // Mon
    weeks: [{ week: 1, days: [
      { dow: 0, title: 'Easy', moves: [{ name: 'Run', seg: '5 mi · Z2' }] },
      { dow: 5, title: 'Long', moves: [{ name: 'Run', seg: '12 mi · Z2' }] },
    ] }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].scheduledDate, '2026-07-13'); // Mon
  assert.equal(rows[1].scheduledDate, '2026-07-18'); // Sat
  assert.equal(rows[0].title, 'Easy');
  assert.equal(rows[0].payload.program.runId, 'r1');
  assert.equal(rows[0].payload.program.name, 'Marathon');
  assert.equal(rows[0].payload.program.week, 1);
  assert.equal(rows[0].payload.program.weeks, 1);
  assert.equal(rows[0].payload.exercises[0].seg, '5 mi · Z2');
});

test('materialize: week 2 lands 7 days later', () => {
  const rows = bsMaterializeProgram({
    name: 'P', discipline: 'run', startISO: '2026-07-13', runId: 'r',
    weeks: [
      { week: 1, days: [{ dow: 0, title: 'A', moves: [] }] },
      { week: 2, days: [{ dow: 0, title: 'B', moves: [] }] },
    ],
  });
  assert.equal(rows[0].scheduledDate, '2026-07-13');
  assert.equal(rows[1].scheduledDate, '2026-07-20');
});

test('materialize: days strictly before startISO are skipped', () => {
  const rows = bsMaterializeProgram({
    name: 'P', discipline: 'run', startISO: '2026-07-15', runId: 'r', // Wed
    weeks: [{ week: 1, days: [
      { dow: 0, title: 'A', moves: [] }, // Mon 7-13 (before Wed) → dropped
      { dow: 3, title: 'B', moves: [] }, // Thu 7-16 → kept
    ] }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scheduledDate, '2026-07-16');
});

test('materialize: id prefix carries through when given (purchased plan)', () => {
  const rows = bsMaterializeProgram({
    name: 'PPL', programId: 'plan:p9', discipline: 'strength', startISO: '2026-07-13', runId: 'r2',
    weeks: [{ week: 1, days: [{ dow: 0, title: 'Push', moves: [] }] }],
  });
  assert.equal(rows[0].payload.program.id, 'plan:p9');
});

test('bsRepeatSpec: one-row weekly-repeat shape, no scheduledDate', () => {
  const spec = bsRepeatSpec({ name: 'Push', discipline: 'strength', repeatDow: [0, 3], moves: [{ name: 'Bench', sets: 4, reps: '8' }] });
  assert.equal(spec.title, 'Push');
  assert.deepEqual(spec.payload.repeatDow, [0, 3]);
  assert.equal(spec.payload.exercises[0].name, 'Bench');
  assert.equal(spec.scheduledDate, undefined);
});

test('slotRepeats places a repeatDow row on each weekday; dated rows are not overwritten', () => {
  const week = bsSlotRepeats([{ title: 'Push', payload: { repeatDow: [0, 3], exercises: [] } }], '2026-07-13');
  assert.equal(week[0].title, 'Push');
  assert.equal(week[3].title, 'Push');
  assert.equal(week[1], null);
  assert.equal(week[6], null);
});

test('slotRepeats: first repeat wins a contested slot; non-array repeatDow ignored', () => {
  const week = bsSlotRepeats([
    { title: 'A', payload: { repeatDow: [0] } },
    { title: 'B', payload: { repeatDow: [0] } },
    { title: 'C', payload: { repeatDow: 'nope' } },
  ], '2026-07-13');
  assert.equal(week[0].title, 'A');
});
