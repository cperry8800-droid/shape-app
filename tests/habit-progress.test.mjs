// The habits page's Progress card model (habitProgress.mjs): the week against the week before,
// the month as a calendar, and paging inside the 90 days of history the habits route sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hpStatus, hpLevel, hpWeek, hpMonth, hpWeekStart, hpAddDays, hpAddMonths, hpDaysInMonth,
  hpCanGoBack, hpCanGoForward, hpStep, hpWindowStart, hpLocalYmd,
} from '../mobile-app/src/broadsheet/habitProgress.mjs';

const TODAY = '2026-10-24'; // a Saturday; 1 October 2026 is a Thursday
const days = (from, to, skip = []) => {
  const out = [];
  for (let d = from; d <= to; d = hpAddDays(d, 1)) if (!skip.includes(d.slice(8))) out.push(d);
  return out;
};
const water = { id: 'w', name: 'Water', type: 'do', history: days('2026-10-01', '2026-10-24', ['02', '06', '11', '14', '15', '20']) };
const vit = { id: 'v', name: 'Vitamins', type: 'do', history: days('2026-10-01', '2026-10-23', ['01', '04', '05', '09', '10', '11', '12', '13', '16', '18', '21']) };
const smoke = { id: 's', name: 'Smoking', type: 'avoid', history: days('2026-10-01', '2026-10-23', ['03', '17']) };
const HABITS = [smoke, water, vit];
const opts = { today: TODAY, firstDay: 0, windowStart: '2026-07-27' };

test('a day is kept, open, missed, ahead, or unknown', () => {
  assert.equal(hpStatus(water, '2026-10-24', opts), 'kept');
  assert.equal(hpStatus(vit, '2026-10-24', opts), 'open');
  assert.equal(hpStatus(vit, '2026-10-21', opts), 'missed');
  assert.equal(hpStatus(vit, '2026-10-25', opts), 'future');
  assert.equal(hpStatus({ ...vit, createdOn: '2026-10-14' }, '2026-10-13', opts), 'none', 'before the habit existed');
  assert.equal(hpStatus({ ...vit, createdOn: '2026-10-14' }, '2026-10-14', opts), 'kept');
  assert.equal(hpStatus({ ...vit, createdOn: '2026-10-14' }, '2026-10-16', opts), 'missed');
  assert.equal(hpStatus({ ...vit, history: [] }, '2026-07-26', opts), 'none', 'before the history the app holds');
  assert.equal(hpStatus({ ...vit, history: [] }, '2026-07-27', opts), 'missed');
});

test('the week counts kept against every live slot, today’s open ones included', () => {
  const w = hpWeek(HABITS, { ...opts, anchor: TODAY });
  assert.equal(w.start, '2026-10-18');
  assert.equal(w.end, '2026-10-24');
  assert.deepEqual([w.kept, w.slots, w.pct], [16, 21, 76]);
  assert.deepEqual(w.days.map((d) => d.kept.length), [2, 3, 2, 2, 3, 3, 1]);
  const sat = w.days[6];
  assert.ok(sat.isToday);
  assert.deepEqual(sat.open.map((h) => h.id), ['v', 's'], 'to-dos first, then to-don’ts');
  assert.deepEqual(w.days[1].kept.map((h) => h.id), ['w', 'v', 's']);
  assert.deepEqual([w.prev.kept, w.prev.slots, w.prev.pct], [13, 21, 62]);
  assert.equal(w.prev.avgPerDay.toFixed(2), '1.86');
  assert.equal(w.scale, 3);
  assert.ok(w.isCurrent);
  const byId = Object.fromEntries(w.perHabit.map((r) => [r.habit.id, r]));
  assert.deepEqual([byId.w.kept, byId.w.of], [6, 7]);
  assert.deepEqual([byId.v.kept, byId.v.of], [4, 7]);
  assert.deepEqual([byId.s.kept, byId.s.of], [6, 7]);
});

test('a habit added mid-week does not open the week down, and last week needs live days', () => {
  const fresh = { id: 'n', name: 'New', type: 'do', createdOn: '2026-10-22', history: ['2026-10-22'] };
  const w = hpWeek([fresh], { ...opts, anchor: TODAY });
  assert.deepEqual([w.kept, w.slots], [1, 3], 'Thu kept, Fri missed, Sat open; Sun–Wed count for nothing');
  assert.equal(w.prev, null, 'no week before to compare with');
  const mid = { id: 'm', name: 'Mid', type: 'do', createdOn: '2026-10-15', history: ['2026-10-15', '2026-10-16'] };
  assert.equal(hpWeek([mid], { ...opts, anchor: TODAY }).prev.avgPerDay, 2 / 3, 'averaged over the days it was live');
});

test('the week starts on the day asked for (the page asks for Monday, as the week strip runs)', () => {
  assert.equal(hpWeekStart(TODAY, 1), '2026-10-19');
  const w = hpWeek(HABITS, { ...opts, anchor: TODAY, firstDay: 1 });
  assert.equal(w.start, '2026-10-19');
  assert.equal(w.days[6].future, true, 'Sunday the 25th is still ahead');
});

test('the month is a calendar of shades, with each habit’s rate and the best run', () => {
  const m = hpMonth(HABITS, { ...opts, anchor: TODAY });
  assert.equal(m.start, '2026-10-01');
  assert.equal(m.lead, 4, 'the 1st is a Thursday');
  assert.equal(m.cells.length, 31);
  assert.deepEqual([m.kept, m.slots, m.pct], [51, 72, 71]);
  assert.equal(m.cells[10].level, 1, '11th: one of three kept');
  assert.equal(m.cells[18].level, 3, '19th: all kept');
  assert.equal(m.cells[19].level, 2, '20th: two of three');
  assert.equal(m.cells[24].level, null, 'the 25th is ahead');
  assert.ok(m.cells[23].isToday);
  const byId = Object.fromEntries(m.perHabit.map((r) => [r.habit.id, r]));
  assert.deepEqual([byId.w.kept, byId.w.of, byId.w.pct], [18, 24, 75]);
  assert.deepEqual([byId.v.kept, byId.v.of, byId.v.pct], [12, 24, 50]);
  assert.deepEqual([byId.s.kept, byId.s.of, byId.s.pct], [21, 24, 88]);
  assert.deepEqual([m.bestRun.habit.id, m.bestRun.days], ['s', 13], 'clean 4–16 October');
  assert.ok(m.isCurrent);
});

test('levels: none, up to half, more than half, all', () => {
  assert.equal(hpLevel(0, 0), null);
  assert.equal(hpLevel(0, 4), 0);
  assert.equal(hpLevel(2, 4), 1);
  assert.equal(hpLevel(3, 4), 2);
  assert.equal(hpLevel(4, 4), 3);
});

test('paging stays inside the history held and stops at today', () => {
  const ws = hpWindowStart(TODAY);
  assert.equal(ws, '2026-07-27');
  const o = { firstDay: 0, today: TODAY, windowStart: ws };
  assert.equal(hpCanGoForward('week', TODAY, o), false);
  assert.equal(hpCanGoForward('week', '2026-10-17', o), true);
  assert.equal(hpCanGoForward('month', '2026-09-30', o), true);
  assert.equal(hpCanGoForward('month', TODAY, o), false);
  assert.equal(hpStep('week', TODAY, -1, 0), '2026-10-11');
  assert.equal(hpStep('month', TODAY, -1, 0), '2026-09-01');
  assert.equal(hpCanGoBack('month', '2026-08-15', o), true, 'July still holds days 27–31');
  assert.equal(hpCanGoBack('month', '2026-07-15', o), false);
  assert.equal(hpCanGoBack('week', '2026-08-03', o), true, 'the week before (26 July – 1 August) holds 27 July on');
  assert.equal(hpCanGoBack('week', '2026-07-28', o), false, 'the week before 26 July is all before the window');
});

test('date helpers cross month and year ends', () => {
  assert.equal(hpAddDays('2026-12-31', 1), '2027-01-01');
  assert.equal(hpAddMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(hpAddMonths('2026-01-31', -1), '2025-12-01');
  assert.equal(hpDaysInMonth('2028-02-10'), 29);
  assert.equal(hpLocalYmd(new Date(2026, 9, 24, 23, 30)), '2026-10-24');
});
