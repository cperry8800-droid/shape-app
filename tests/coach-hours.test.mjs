// The app's "Your hours" model (mobile-app/src/services/coachHours.mjs): what a coach types as
// blocks per day becomes exactly the rows POST /api/my-availability stores, and back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_HOURS_DAYS, bsHoursEmpty, bsHoursFromRows, bsHoursMerge, bsHoursProblems, bsHoursValid,
  bsHoursToRows, bsHoursTotal, bsHoursSame, bsHoursCopy, bsHoursCopyTargets, bsHoursNextBlock,
  bsHoursToInput, bsHoursFromInput,
} from '../mobile-app/src/services/coachHours.mjs';

test('days run Monday first and store getDay indexes', () => {
  assert.deepEqual(BS_HOURS_DAYS.map(([wd]) => wd), [1, 2, 3, 4, 5, 6, 0]);
});

test('stored rows round-trip through the blocks', () => {
  const rows = [
    { weekday: 1, start_minute: 540, duration_min: 180 },
    { weekday: 1, start_minute: 840, duration_min: 240 },
    { weekday: 6, start_minute: 600, duration_min: 120 },
  ];
  const days = bsHoursFromRows(rows);
  assert.deepEqual(days[1], [[540, 720], [840, 1080]]);
  assert.deepEqual(days[6], [[600, 720]]);
  assert.deepEqual(bsHoursToRows(days), rows);
});

test('junk rows drop, a missing duration is an hour, a block is clamped to the day', () => {
  const days = bsHoursFromRows([
    { weekday: 9, start_minute: 60 },
    { weekday: 2, start_minute: -5, duration_min: 60 },
    { weekday: 2, start_minute: 1380 },
    { weekday: 3, start_minute: 1380, duration_min: 300 },
  ]);
  assert.deepEqual(days[2], [[1380, 1440]]);
  assert.deepEqual(days[3], [[1380, 1440]]);
  assert.equal(bsHoursToRows(days).length, 2);
});

test('touching and overlapping blocks merge into one stored row', () => {
  assert.deepEqual(bsHoursMerge([[600, 720], [540, 600], [700, 800]]), [[540, 800]]);
  const days = bsHoursEmpty();
  days[4] = [[540, 600], [600, 660]];
  assert.deepEqual(bsHoursToRows(days), [{ weekday: 4, start_minute: 540, duration_min: 120 }]);
});

test('problems: end before start, too short, and the later of two overlapping blocks', () => {
  assert.deepEqual(bsHoursProblems([[600, 540]]), ['order']);
  assert.deepEqual(bsHoursProblems([[600, 610]]), ['short']);
  assert.deepEqual(bsHoursProblems([[540, 720], [700, 800]]), [null, 'overlap']);
  assert.deepEqual(bsHoursProblems([[700, 800], [540, 720]]), ['overlap', null]);
  assert.deepEqual(bsHoursProblems([[540, 600], [600, 660]]), [null, null], 'touching is not overlapping');
  const days = bsHoursEmpty();
  days[0] = [[600, 540]];
  assert.equal(bsHoursValid(days), false);
  days[0] = [[540, 600]];
  assert.equal(bsHoursValid(days), true);
});

test('totals and sameness read the merged week', () => {
  const a = bsHoursEmpty();
  a[1] = [[540, 720]];
  a[2] = [[540, 600], [600, 660]];
  assert.equal(bsHoursTotal(a), 180 + 120);
  const b = bsHoursEmpty();
  b[1] = [[540, 720]];
  b[2] = [[540, 660]];
  assert.ok(bsHoursSame(a, b));
  b[2] = [[540, 690]];
  assert.ok(!bsHoursSame(a, b));
});

test('copying a day replaces the targets and never the source', () => {
  assert.deepEqual(bsHoursCopyTargets('weekdays', 1), [2, 3, 4, 5]);
  assert.deepEqual(bsHoursCopyTargets('weekend', 1), [6, 0]);
  assert.deepEqual(bsHoursCopyTargets('all', 3), [0, 1, 2, 4, 5, 6]);
  assert.deepEqual(bsHoursCopyTargets('5', 1), [5]);
  const days = bsHoursEmpty();
  days[1] = [[540, 1020]];
  days[3] = [[600, 660]];
  const next = bsHoursCopy(days, 1, 'weekdays');
  for (const wd of [2, 3, 4, 5]) assert.deepEqual(next[wd], [[540, 1020]]);
  assert.deepEqual(next[6], []);
  assert.deepEqual(days[3], [[600, 660]], 'the original week is left alone');
  next[2][0][0] = 0;
  assert.equal(next[1][0][0], 540, 'copies do not share blocks');
});

test('+ Add hours: 9 to 5 on an empty day, then after the last block, never past midnight', () => {
  assert.deepEqual(bsHoursNextBlock([]), [540, 1020]);
  assert.deepEqual(bsHoursNextBlock([[540, 720]]), [780, 900]);
  assert.deepEqual(bsHoursNextBlock([[540, 1380]]), [1380, 1440]);
  assert.equal(bsHoursNextBlock([[0, 1440]]), null);
});

test('time inputs: HH:MM both ways, and 23:59 stands for the end of the day', () => {
  assert.equal(bsHoursToInput(540), '09:00');
  assert.equal(bsHoursToInput(1440), '23:59');
  assert.equal(bsHoursFromInput('09:15'), 555);
  assert.equal(bsHoursFromInput('23:59'), 1440);
  assert.equal(bsHoursFromInput('25:00'), null);
  assert.equal(bsHoursFromInput(''), null);
});

// Codex on #2483: a coach whose phone is now in another zone could not move unchanged hours to
// it. The page offers that as its own action, which saves the stored hours as they are.
test('a coach in a new zone can move their hours to it without editing them', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/BSCoachHours.jsx', import.meta.url), 'utf8');
  assert.match(src, /const zoneMoved = live && load === 'ready' && !!phoneZone && !!zone && phoneZone !== zone;/);
  assert.match(src, /const save = async \(\{ force = false \} = \{\}\) => \{\n\s+if \(!live \|\| saving \|\| \(!dirty && !force\) \|\| !valid\) return false;/);
  assert.match(src, /\{zoneMoved && !dirty \? <div[^>]*><Chip t=\{t\} disabled=\{saving\} onClick=\{\(\) => save\(\{ force: true \}\)\}>\{tr\('coach:hours\.zoneMove'/);
});
