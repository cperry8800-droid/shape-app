// Coach Home's Your day: To do and the Schedule as one list.
//
// Owner, 2026-11-04, of the To do ledger and the Schedule under it: "also can we combine these? figure out a
// design to show both condensed more together to take up less space". One head, one time rail: a To do lane
// first (what no session carries), then the day's sessions, a session's client's to-do folded under it as
// one line that opens their file, so nobody is listed twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsProBookingWho, bsProTodoFor, bsProFoldTodos } from '../mobile-app/src/services/proLedger.mjs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');

// The sample trainer's day as the page has it: Riley's review, Devon's session, Marcus's intake.
const TRIAGE = [
  { clientId: null, name: 'Priya Singh', severity: 'red', directive: 'Missed — no check-in. Reach out.' },
  { clientId: null, name: 'Riley Kim', severity: 'amber', directive: 'Check-in form waiting on your review.' },
  { clientId: null, name: 'Devon Pierce', severity: 'amber', directive: 'Deload due — adjust the block.' },
  { clientId: null, name: 'Marcus Lee', severity: 'new', directive: 'New — send the intake + first plan.' },
];
const DAY = [
  { time: '07:00', title: 'Alex Rivera', state: 'done' },
  { time: '10:00', title: 'Riley Kim · review' },
  { time: '13:00', title: 'Devon Pierce' },
  { time: '16:00', title: 'New: Marcus Lee' },
  { time: '19:00', title: 'Block 3 release' },
];

test('a booking names its client without "New:" or a " · review" after it', () => {
  assert.equal(bsProBookingWho({ title: 'Riley Kim · review' }), 'Riley Kim');
  assert.equal(bsProBookingWho({ title: 'New: Marcus Lee' }), 'Marcus Lee');
  assert.equal(bsProBookingWho({ client: 'Devon Pierce', title: 'Lower Pull' }), 'Devon Pierce');
  assert.equal(bsProBookingWho(null), '');
});

test('a to-do matches its session by client id first, else the exact name, never a substring', () => {
  const triage = [{ clientId: 'u-1', name: 'Sam Lee' }, { clientId: null, name: 'Sam' }];
  assert.equal(bsProTodoFor(triage, { clientId: 'u-1', title: 'Someone else' }), triage[0]);
  // Both carry an id and they differ: no match by name.
  assert.equal(bsProTodoFor([{ clientId: 'u-2', name: 'Sam Lee' }], { clientId: 'u-1', title: 'Sam Lee' }), null);
  assert.equal(bsProTodoFor(triage, { title: 'Sam Leeson' }), null, 'a substring is not a match');
  assert.equal(bsProTodoFor(triage, { title: 'sam' }), triage[1]);
});

test('today, each open session takes its client\'s to-do in, and the lane keeps the rest in order', () => {
  const { foldAt, anytime } = bsProFoldTodos(TRIAGE, DAY, { today: true });
  assert.deepEqual([...foldAt.entries()].map(([i, w]) => [i, w.name]), [[1, 'Riley Kim'], [2, 'Devon Pierce'], [3, 'Marcus Lee']]);
  assert.deepEqual(anytime.map((w) => w.name), ['Priya Singh']);
  // A done session takes nothing: the to-do stays where it can be seen.
  const done = bsProFoldTodos(TRIAGE, DAY.map((b, i) => (i === 2 ? { ...b, state: 'done' } : b)), { today: true });
  assert.ok(done.anytime.some((w) => w.name === 'Devon Pierce'));
  // Two sessions of one client: the first carries the to-do, once.
  const twice = bsProFoldTodos(TRIAGE, [{ title: 'Devon Pierce' }, { title: 'Devon Pierce' }], { today: true });
  assert.deepEqual([...twice.foldAt.keys()], [0]);
});

test('on another day nothing folds: To do is today\'s', () => {
  const { foldAt, anytime } = bsProFoldTodos(TRIAGE, DAY, { today: false });
  assert.equal(foldAt.size, 0);
  assert.equal(anytime.length, TRIAGE.length);
});

test('the page draws one Your day: a To do lane on the rail, the folded to-do under its session', () => {
  const at = PROS.indexOf('{/* YOUR DAY — To do and the Schedule as one list');
  const sec = PROS.slice(at, PROS.indexOf('{/* SHORTCUTS', at));
  assert.ok(at > 0);
  // One section and one head, no separate To do or Schedule section.
  assert.equal((sec.match(/<section /g) || []).length, 1);
  assert.doesNotMatch(PROS, /\{\/\* TO DO — paid sessions to book|\{\/\* SCHEDULE — the selected day/);
  assert.match(sec, /<h2 style=\{H2\}>\{tr\('coach:today\.dayList', \{ defaultValue: 'Your day' \}\)\}/);
  // The lane sits on the same rail as the sessions (the time column), dashed, labelled To do.
  assert.match(sec, /data-todo-lane="" style=\{\{[^\n]*gridTemplateColumns: `\$\{TIME_COL\}px minmax\(0, 1fr\)`/);
  assert.match(sec, /borderLeft: `2px dashed \$\{t\.RULE\}`/);
  assert.match(sec, /\{todoShown\.map\(\(w, i\) => \(\n\s*<button [^\n]*data-todo=\{w\.severity\} onClick=\{\(\) => openClientFile\(w\.clientId, w\.name\)\}/);
  assert.match(PROS, /const \{ foldAt, anytime: anytimeTodos \} = bsProFoldTodos\(triageRows, bookings, \{ today: isToday \}\);/);
  // The folded to-do: one line under its session, a 44px target that opens the client's file.
  const fold = sec.slice(sec.indexOf('{folded && ('));
  assert.match(fold, /data-rail-todo=\{folded\.severity\} onClick=\{\(\) => openClientFile\(folded\.clientId, folded\.name\)\}/);
  assert.match(fold, /minHeight: 44, margin: '-12px 0 -8px', padding: '12px 0 8px'/);
  // Every button in the list keeps a 44px target.
  for (const b of sec.match(/<button [^>]*?style=\{\{[^\n]*/g) || []) {
    if (/style=\{LINK\}|\.\.\.LINK/.test(b)) continue;
    assert.match(b, /minHeight: 44/, 'a button under 44: ' + b.slice(0, 80));
  }
  // Every to-do shows somewhere: the lane's rows, past five "See all", or folded into a session.
  assert.match(PROS, /const todoShown = anytimeTodos\.slice\(0, Math\.max\(0, TODO_MAX - paidShown\.length\)\);/);
  assert.match(sec, /\{todoMore > 0 && <button type="button" onClick=\{\(\) => onWidgetOpen\('clients'\)\} style=\{LINK\}>/);
});

test('a session in Your day opens its own details, not the month calendar', () => {
  // Owner, 2026-11-04: "when i click on the activity here on home page it should take be to details regarding
  // that activity, no month calendar".
  const at = PROS.indexOf('{/* YOUR DAY — To do and the Schedule as one list');
  const sec = PROS.slice(at, PROS.indexOf('{/* SHORTCUTS', at));
  assert.doesNotMatch(sec, /closest\('button'\)\) return; goCalendar\(\);/, 'a tap on the schedule goes to the month again');
  assert.match(sec, /<button type="button" data-rail-open="" onClick=\{\(\) => openBooking\(b\)\}/);
  assert.match(sec, /data-rail-open=""[^\n]*\n\s*style=\{\{[^\n]*minHeight: 44/, 'the session\'s target is under 44');
  // The calendar's own detail sheet: a real booking as the calendar maps it, live; the preview's sample as a sample.
  const fn = PROS.slice(PROS.indexOf('  const openBooking = (b) => {'), PROS.indexOf('  // Up next\'s buttons'));
  assert.match(fn, /window\.BSEventSheet/);
  assert.match(fn, /const live = !!\(b\.raw && mapEv\);/);
  assert.match(fn, /mapEv\(b\.raw, t, b\.rawZone\)/);
  assert.match(fn, /onChanged: \(\) => setCalendarReload\(\(n\) => n \+ 1\)/);
  assert.match(fn, /goCalendar\(\); return;/, 'with no sheet it does nothing');
  assert.match(PROS, /raw: ev, rawZone: typeof r\.zone === 'string' && r\.zone \? r\.zone : null,/);
  const CAL = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx', import.meta.url), 'utf8');
  assert.match(CAL, /Object\.assign\(window, \{[^}]*BSEventSheet, bsMapServerCalEvent: _bsMapServerCalEvent \}\);/);
});
