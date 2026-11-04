// tests/home-deck-spacing.test.mjs
//
// Member Home's top, spaced (owner, 2026-11-04):
// - "there is some overlap with new home design and shape radio box, can we move the graph down a little"
// - "the week calendar can be condensed a little to create more space"
// - of the stats ticker under the masthead, "thin this bar slightly, make a little more narrow"
// - of the calendar page Month opens, "remove this from month calendar page" (the "Section · Calendar"
//   eyebrow) and "condense these tabs" (Month | Weeks)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const DECK = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/BSHomeDeck.jsx', import.meta.url), 'utf8'));
const CAL = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx', import.meta.url), 'utf8'));
const CHROME = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url), 'utf8'));
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `${a} is gone`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `${b} is gone`); return src.slice(i, j); };

test('the goal climb sits 22px under the radio box, clear of its foot', () => {
  const climb = between(DECK, 'export function BSHomeClimbView(', '\nfunction ');
  assert.match(climb, /style=\{\{ position: 'relative', margin: '22px 0 0', cursor:/);
});

test('the week is condensed: 52px days, 11px bars, the head\'s Month a 44px tap that does not stand the row tall', () => {
  const week = between(DECK, 'export function BSHomeWeekBarsView(', '\n}\n');
  assert.match(week, /padding: `8px \$\{t\.padX - 6\}px \$\{10\}px`/);
  assert.match(week, /minHeight: 52, padding: '4px 0 5px'/);
  assert.match(week, /fontSize: 17, lineHeight: 1\.05/);
  assert.match(week, /gap: 1\.5, height: 11 \}/);
  // Month keeps its 44px tap target, pulled into the head's line by negative margins (no marginLeft beside
  // the shorthand, which React warns about).
  assert.match(week, /style=\{\{ minHeight: 44, margin: '-12px 0 -6px auto', padding: 0,/);
  // ⚠ No tap box overlaps another (Codex P2 on #2593). Month hangs 6px under the head's line and the days
  // start 6px under it; the picked day's → hangs 6px above its line, which starts 6px under the days, and
  // 26px below its 12px line, into the section's 10px and the deck's 16px.
  assert.match(week, /gridTemplateColumns: 'repeat\(7, minmax\(0, 1fr\)\)', gap: 3, marginTop: 6 \}/);
  assert.match(week, /marginTop: 6, padding: '0 0 0 6px', height: 12,/);
  assert.match(week, /minHeight: 44, margin: '-6px 0 -26px', padding: '6px 0 0'/);
  assert.match(DECK, /padding: '2px 0 16px'/, 'the deck\'s foot the → reaches into');
  const bar = between(DECK, 'function BSHdBar(', '\n}\n');
  assert.match(bar, /data-bar="hit" style=\{\{ \.\.\.base, height: 11,/);
  assert.match(bar, /data-bar="ahead" style=\{\{ \.\.\.base, height: 11,/);
  // Every day stays a tap of at least 44px.
  assert.ok(Number(week.match(/minHeight: (\d+), padding: '4px 0 5px'/)[1]) >= 44);
});

test('the stats ticker is thin: 5px above and below its line, a 9px notch', () => {
  const ticker = between(CHROME, 'function BSTicker(', '\n}\n');
  assert.match(ticker, /clipPath: 'polygon\(0 0, calc\(100% - 9px\) 0, 100% 9px, 100% 100%, 0 100%\)'/);
  assert.match(ticker, /padding: '5px 0', overflow: 'hidden'/);
  assert.match(ticker, /fontSize: 10, letterSpacing: '0\.12em'/);
});

test('the calendar: no Section · Calendar eyebrow on your own; Month | Weeks two quiet words beside ← Back', () => {
  // A coach reading a client's calendar keeps whose it is; your own has no eyebrow.
  assert.match(CAL, /kicker=\{forClient\s*\? tr\('calendar:client\.kicker'[^]*?\)\s*: null\}/);
  assert.doesNotMatch(CAL, /calendar:view\.kicker/);
  // Two words, no box (owner, 2026-11-04: "make these boxes look different and smaller, looks weird below
  // icons above"): the lit one in ink over the accent's rule; each a 44px tap.
  const tabs = between(CAL, 'const viewTabs = (style = null) => (', '\n  );\n');
  assert.doesNotMatch(tabs, /data-cal-track|borderRadius: 10/, 'the switch is a box again');
  assert.match(tabs, /role="tab" aria-selected=\{on\}/);
  assert.match(tabs, /minHeight: 44, padding: 0, border: 0, background: 'transparent'/);
  assert.match(tabs, /color: on \? t\.INK : t\.INK50/);
  assert.match(tabs, /borderBottom: `2px solid \$\{on \? t\.ACCENT : 'transparent'\}`/);
  // With a Back, it rides the right of the back row and the month starts a row higher (owner, 2026-11-04:
  // "move the calendar higher on page, feel free to move back tab somewhere that fits better"); the ←
  // keeps its one place. Without one, the switch takes its own row.
  assert.match(CAL, /backTrailing=\{onBack \? viewTabs\(\) : null\}/);
  assert.match(CAL, /\{!onBack && \(\s*<div style=\{\{ padding: `2px \$\{t\.padX\}px[^`]*` \}\}>\s*\{viewTabs\(\)\}/);
});

test('coach Today: the deck\'s sessions follow the day picked in the strip', () => {
  // Owner, 2026-11-04: "click on different weeks on coaches profile home doesnt change anything".
  const PROS = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8'));
  // #2592 met #2593 here, both on this note: the deck reads the picked day's bookings (dayBookings), its
  // done count on today or a day gone by, and BOOKED with the count for a day ahead.
  assert.match(PROS, /const dayBookings = isToday \? todayBookings : bookings;/);
  assert.match(PROS, /const doneDay = dayBookings\.filter\(\(b\) => b\.state === 'done'\)\.length;/);
  assert.match(PROS, /\{calendarReady && dayBookings\.length > 0 && \(\s*<BSProDeckSegments t=\{t\} done=\{isToday \|\| dayPast \? doneDay : 0\} total=\{dayBookings\.length\}/);
  assert.match(PROS, /onSelectDay=\{setSelDay\}/);
});
