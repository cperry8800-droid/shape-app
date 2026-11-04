// tests/radio-page-horizon.test.mjs
//
// The Shape Radio page as option E, "the horizon". Owner, 2026-11-04: "now lets redesign shape radio page.
// Also make sure it has new masthead", "make it futuristic", "again being creative futuristic and unique",
// then of five designs "option e is best but can we center shape radio logo".
//
// The 32 bands stand as a skyline of tile towers on a floor that recedes to a horizon. Every tower is a
// reading: no towers without a signal (the horizon is dashed instead), and the floor steps only on a
// measured beat, never under Reduce Motion. The top row carries the masthead's slim tool pill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const RADIO = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url), 'utf8'));
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `${a} is gone`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `${b} is gone`); return src.slice(i, j); };

test('the top row carries the masthead\'s slim tool pill, read at call time', () => {
  const corner = between(RADIO, 'function bsRadioCorner(ink) {', '\n}\n');
  assert.match(corner, /const Pill = typeof window !== 'undefined' \? window\.BSMastToolPill : null;/);
  assert.match(corner, /return Pill \? <Pill ink=\{ink\}>\{tools\}<\/Pill> : tools;/);
  const screen = between(RADIO, 'function BSRadioScreen(', '\nfunction ');
  assert.match(screen, /\{bsRadioCorner\(CREAM\)\}/);
});

test('the wordmark is centred and the mode sits under it', () => {
  const screen = between(RADIO, 'function BSRadioScreen(', '\nfunction ');
  const head = between(screen, '<div data-radio-wordmark=""', '</div>\n          </div>');
  assert.match(head, /flexDirection: 'column', alignItems: 'center', textAlign: 'center'/);
  assert.match(head, /<BSRadioWordmark width="min\(76%, 290px\)" style=\{\{ margin: '0 auto' \}\} \/>/);
  assert.match(head, /radio:screen\.listening/);
});

test('the skyline is a reading: towers only over a signal, the floor still without a measured beat', () => {
  const screen = between(RADIO, 'function BSRadioScreen(', '\nfunction ');
  assert.match(screen, /ground="horizon"/, 'the page does not draw the horizon');
  const field = between(RADIO, 'function BSRadioSignalField(', '\nfunction ');
  const horizon = between(field, "if (cfg.ground === 'horizon') {", '} else if (live) {');
  // The floor steps one spacing per measured beat; no tempo, no air or Reduce Motion, it holds still.
  assert.match(horizon, /const beatFrac = \(live && read && read\.bpm > 0 && !reduced\) \?/);
  // Nothing on the air: a dashed horizon and no city.
  assert.match(horizon, /if \(!live\) \{[\s\S]*?ctx\.setLineDash\(\[3, 5\]\);/);
  // The towers are the bands' smoothed levels, the top fifth the hot tone, the peak a cap.
  assert.match(horizon, /const th = barHeight\(smH\[i\], towerMax\);/);
  assert.match(horizon, /const hotFrom = Math\.floor\(tiles \* \(1 - BAR_HOT_FRAC\)\);/);
  assert.match(horizon, /if \(capVisible\(pkH\[i\], smH\[i\], towerMax\)\) \{/);
  // The dot field and the beat counter stay off under the horizon (it draws its own floor).
  assert.match(field, /if \(cfg\.ground !== 'horizon' \|\| kx > 0\) for \(let y = FIELD_STEP \/ 2;/);
  assert.match(field, /ctx\.globalAlpha = \(cfg\.ground === 'horizon' \? 0 : 1 - kx\) \* \(on \? 0\.95 : 0\.2\);/);
});

test('the horizon is opt-in: the field keeps its bars unless asked for the horizon', () => {
  const field = between(RADIO, 'function BSRadioSignalField(', '\nfunction ');
  assert.match(field, /function BSRadioSignalField\(\{ paused, matching, heartBpm, teal, hot, heart, paper, figureRef, preview, onRead, onSignal, onRail, ground \}\)/);
  // Only the Radio page asks for the horizon.
  assert.equal((RADIO.match(/ground="horizon"/g) || []).length, 1);
});
