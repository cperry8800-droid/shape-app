// The app's "Your hours" model (mobile-app/src/services/coachHours.mjs): what a coach types as
// blocks per day becomes exactly the rows POST /api/my-availability stores, and back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_HOURS_DAYS, bsHoursEmpty, bsHoursFromRows, bsHoursMerge, bsHoursProblems, bsHoursValid,
  bsHoursToRows, bsHoursTotal, bsHoursSame, bsHoursCopy, bsHoursCopyTargets, bsHoursNextBlock,
  bsHoursToInput, bsHoursFromInput, bsHoursSpan, bsHoursScale, bsHoursShort, bsHoursRangeWords, bsHoursMark,
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

// Owner, 2026-11-04, of the lit grid: "make it so you can tell more specifically what times certain
// bars sit on". The grid spans the coach's own hours, the scale labels them closely, and each day
// reads its ranges in words on the reader's own clock.
test('the grid spans the coach\'s own hours, rounded out to whole hours, 9 to 5 for an empty week', () => {
  const week = bsHoursEmpty();
  assert.deepEqual(bsHoursSpan(week), [540, 1020], 'an empty week: the hours ＋ Add hours puts on a day');
  week[1] = [[555, 720], [840, 1050]];
  assert.deepEqual(bsHoursSpan(week), [540, 1080], '9:15 to 5:30 rounds out to 9 to 6');
  week[6] = [[450, 600]];
  assert.deepEqual(bsHoursSpan(week), [420, 1080], 'the earliest start of any day: 7:30 → 7');
  // A block that ends before it starts is no open time and moves nothing.
  week[0] = [[1300, 200]];
  assert.deepEqual(bsHoursSpan(week), [420, 1080]);
  // One short block keeps four hours of scale, never past midnight.
  const short = bsHoursEmpty(); short[3] = [[600, 630]];
  assert.deepEqual(bsHoursSpan(short), [600, 840]);
  const late = bsHoursEmpty(); late[3] = [[1380, 1440]];
  assert.deepEqual(bsHoursSpan(late), [1200, 1440]);
});

test('the hour scale: a tick at every hour, a label on every hour that fits, AM/PM only where it changes', () => {
  const nine = bsHoursScale([540, 1080], { width: 260, locale: 'en-US' });
  assert.equal(nine.step, 1, 'nine hours label every hour at 390 wide');
  assert.deepEqual(nine.ticks, [540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080]);
  assert.deepEqual(nine.labels.map((l) => l.text), ['9 AM', '10', '11', '12 PM', '1', '2', '3', '4', '5', '6']);
  // A 24-hour clock has no day period.
  assert.deepEqual(bsHoursScale([540, 1080], { width: 260, locale: 'de' }).labels.map((l) => l.text), ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18']);
  // Thirteen hours don't fit every hour at 390: every other one, on even hours so noon is labelled;
  // every hour keeps its tick.
  const long = bsHoursScale([420, 1200], { width: 260, locale: 'en-US' });
  assert.equal(long.step, 2);
  assert.equal(long.ticks.length, 14);
  assert.deepEqual(long.labels.map((l) => l.text), ['8 AM', '10', '12 PM', '2', '4', '6', '8']);
  // Wider, the same span labels every hour.
  assert.equal(bsHoursScale([420, 1200], { width: 400, locale: 'en-US' }).step, 1);
  // The whole day still labels, more sparsely, and its end is midnight.
  const day = bsHoursScale([0, 1440], { width: 260, locale: 'en-US' });
  assert.ok(day.step > 2);
  assert.equal(day.labels[day.labels.length - 1].text, '12 AM');
  assert.equal(bsHoursMark(1440, 'de').hour, '24');
});

test('a day\'s ranges in words: "9–12 · 2–6", minutes only where they are, on the reader\'s clock', () => {
  assert.equal(bsHoursRangeWords([[540, 720], [840, 1080]], 'en-US'), '9–12 · 2–6');
  assert.equal(bsHoursRangeWords([[540, 720], [840, 1080]], 'de'), '9–12 · 14–18');
  assert.equal(bsHoursRangeWords([[570, 735]], 'en-US'), '9:30–12:15');
  assert.equal(bsHoursRangeWords([[570, 735]], 'id'), '9.30–12.15', 'the locale\'s own separator');
  assert.equal(bsHoursRangeWords([[1320, 1440]], 'de'), '22–24', 'the day\'s end on a 24-hour clock');
  assert.equal(bsHoursRangeWords([[1320, 1440]], 'en-US'), '10–12');
  // Merged as stored: touching blocks read as one range; a closed day reads nothing.
  assert.equal(bsHoursRangeWords([[540, 600], [600, 660]], 'en-US'), '9–11');
  assert.equal(bsHoursRangeWords([], 'en-US'), '');
  assert.equal(bsHoursShort(540, 'en-GB'), '9', 'no leading zero');
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
  // A stored zone that differs, or none at all (hours saved before zones were), with hours to place.
  assert.match(src, /const zoneMoved = live && load === 'ready' && !!phoneZone && phoneZone !== zone && bsHoursTotal\(seed\) > 0;/);
  assert.match(src, /tr\('coach:hours\.zoneSet', \{ defaultValue: 'Save my hours in \{zone\}', zone: phoneZone \}\)/);
  assert.match(src, /const save = async \(\{ force = false \} = \{\}\) => \{\n\s+if \(!live \|\| saving \|\| \(!dirty && !force\) \|\| !valid\) return false;/);
  assert.match(src, /\{zoneMoved && !dirty \? <div[^>]*><Chip t=\{t\} disabled=\{saving\} onClick=\{\(\) => save\(\{ force: true \}\)\}>\{zone\n\s+\? tr\('coach:hours\.zoneMove'/);
});

// Codex on #2483: a save that landed but lost its answer read back as "partly saved". The catch
// path now calls it saved when what is stored is what was sent (and, for a zone-only save, the
// zone moved too), before it compares with what was there before.
test('a save whose answer was lost, but whose hours were stored, reads as saved', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/BSCoachHours.jsx', import.meta.url), 'utf8');
  const i = src.indexOf('const sentChange = !bsHoursSame(days, seed);');
  assert.ok(i > 0);
  const tail = src.slice(i, i + 900);
  assert.match(tail, /if \(stored && bsHoursSame\(stored, days\) && \(sentChange \|\| \(!!phoneZone && storedZone === phoneZone\)\)\) \{\n\s+setSeed\(bsHoursClone\(days\)\);/);
  assert.ok(tail.indexOf("coach:hours.saved") < tail.indexOf('bsHoursSame(stored, seed)'), 'the landed save is checked first');
});

// Codex on #2483: the header's corner opens the profile, which unmounts this page with no ask.
// With unsaved hours the page has no corner (noCorner also takes the pinned strip's off).
test('with unsaved hours the page offers no corner that would drop them', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/BSCoachHours.jsx', import.meta.url), 'utf8');
  assert.match(src, /<BSDetailHeader onBack=\{back\} noCorner=\{dirty && live && load === 'ready'\}/);
});

// Owner, 2026-10-31: "these times are cut off", and "the toggles arent working" in the preview.
test('the times read whole, the remove key keeps a full target, and the preview\'s week works', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/BSCoachHours.jsx', import.meta.url), 'utf8');
  const input = src.slice(src.indexOf('function TimeInput('), src.indexOf('\n}\n', src.indexOf('function TimeInput(')));
  assert.match(input, /fontFamily: t\.DISPLAY, fontVariantNumeric: 'tabular-nums'/, 'the narrower face, not the mono that cut "AM" off');
  // Codex on #2535: the × keeps 44 × 44 and reaches into the plate's padding rather than shrinking.
  assert.match(src, /style=\{\{ flex: 'none', width: 44, height: 44, marginRight: -10, padding: 0, border: 0/);
  assert.match(src, /<WeekGrid t=\{t\} tr=\{tr\} days=\{days\} setDays=\{[^}]*\}\} disabled=\{false\} accent=\{accent\} perWeek=\{perWeek\} \/>/, 'the preview\'s week is not disabled');
});
