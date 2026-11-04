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
  assert.match(week, /padding: `8px \$\{t\.padX - 6\}px 0`/);
  assert.match(week, /minHeight: 52, padding: '4px 0 5px'/);
  assert.match(week, /fontSize: 17, lineHeight: 1\.05/);
  assert.match(week, /gap: 1\.5, height: 11 \}/);
  // Month keeps its 44px tap target, pulled into the head's line by negative margins (no marginLeft beside
  // the shorthand, which React warns about).
  assert.match(week, /style=\{\{ minHeight: 44, margin: '-12px 0 -12px auto', padding: 0,/);
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

test('the calendar: no Section · Calendar eyebrow on your own; Month | Weeks a compact track, each tab still a 44px tap', () => {
  // A coach reading a client's calendar keeps whose it is; your own has no eyebrow.
  assert.match(CAL, /kicker=\{forClient\s*\? tr\('calendar:client\.kicker'[^]*?\)\s*: null\}/);
  assert.doesNotMatch(CAL, /calendar:view\.kicker/);
  const tabs = between(CAL, '<div role="tablist" aria-label={tr(\'calendar:view.label\'', '</div>\n      </div>');
  assert.match(tabs, /maxWidth: 260, margin: '0 auto'/);
  assert.match(tabs, /data-cal-track="" style=\{\{ position: 'absolute', left: 0, right: 0, top: 6, bottom: 6,/);
  assert.match(tabs, /role="tab" aria-selected=\{on\}/);
  assert.match(tabs, /position: 'relative', minHeight: 44, padding: 0,/);
  assert.match(tabs, /width: '100%', height: 26, borderRadius: 8,/);
});
