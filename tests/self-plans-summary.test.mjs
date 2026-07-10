// Self-plans summary (coach Case File read of self-authored training):
//   node --test tests/self-plans-summary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsSelfPlansSummary, bsSelfPlanDays } from '../mobile-app/src/services/selfPlansSummary.mjs';

const TODAY = '2026-07-10';

test('day letters: week order, dedupe, invalid entries dropped', () => {
  assert.equal(bsSelfPlanDays([5, 1, 3]), 'Mo We Fr');
  assert.equal(bsSelfPlanDays([1, 1, '2', 9, -1, null]), 'Mo Tu');
  assert.equal(bsSelfPlanDays(null), '');
});

test('groups program rows per RUN with the next dated session >= today', () => {
  const prog = { id: 'p1', runId: 'run-a', name: 'Marathon 16wk', weeks: 16 };
  const rows = [
    { title: 'Long run', scheduled_date: '2026-07-08', program: { ...prog, week: 2 } }, // past
    { title: 'Tempo', scheduled_date: '2026-07-12', program: { ...prog, week: 3 } },
    { title: 'Intervals', scheduled_date: '2026-07-15', program: { ...prog, week: 3 } },
  ];
  const s = bsSelfPlansSummary(rows, TODAY);
  assert.equal(s.programs.length, 1);
  assert.deepEqual(s.programs[0], { name: 'Marathon 16wk', weeks: 16, sessions: 3, nextDate: '2026-07-12', nextWeek: 3 });
  assert.equal(s.total, 3);
});

test('a fully-past program keeps its name with an honest null nextDate', () => {
  const rows = [
    { title: 'W1', scheduled_date: '2026-06-01', program: { runId: 'r', name: 'Old block', weeks: 4, week: 1 } },
  ];
  const s = bsSelfPlansSummary(rows, TODAY);
  assert.equal(s.programs[0].nextDate, null);
  assert.equal(s.programs[0].nextWeek, null);
});

test('two RUNS of the same program stay separate lines (re-started plan)', () => {
  const rows = [
    { title: 'A', scheduled_date: '2026-07-11', program: { runId: 'r1', name: 'Strength block', weeks: 4, week: 4 } },
    { title: 'B', scheduled_date: '2026-07-20', program: { runId: 'r2', name: 'Strength block', weeks: 4, week: 1 } },
  ];
  assert.equal(bsSelfPlansSummary(rows, TODAY).programs.length, 2);
});

test('weekly repeats dedupe by title+days; snake_case and camelCase both read', () => {
  const rows = [
    { title: 'Upper day', repeat_dow: [1, 4] },
    { title: 'Upper day', repeatDow: [4, 1] }, // same session, same days
    { title: 'Run', repeat_dow: [6] },
  ];
  const s = bsSelfPlansSummary(rows, TODAY);
  assert.deepEqual(s.repeats, [
    { title: 'Upper day', days: 'Mo Th' },
    { title: 'Run', days: 'Sa' },
  ]);
});

test('upcoming one-offs: dated, future-or-today, sorted, capped at 5; past dropped', () => {
  const rows = [
    { title: 'Past ride', scheduled_date: '2026-07-01' },
    { title: 'Race', scheduled_date: '2026-08-01' },
    { title: 'Shakeout', scheduled_date: '2026-07-10' }, // today counts
    ...Array.from({ length: 6 }, (_, i) => ({ title: `S${i}`, scheduled_date: `2026-07-2${i}` })),
  ];
  const s = bsSelfPlansSummary(rows, TODAY);
  assert.equal(s.upcoming.length, 5);
  assert.equal(s.upcoming[0].title, 'Shakeout');
  assert.ok(!s.upcoming.some((u) => u.title === 'Past ride'));
});

test('empty / junk input reads as an honest zero', () => {
  assert.deepEqual(bsSelfPlansSummary(null, TODAY), { total: 0, programs: [], repeats: [], upcoming: [] });
  assert.equal(bsSelfPlansSummary([null, 'x', 42], TODAY).total, 0);
});
