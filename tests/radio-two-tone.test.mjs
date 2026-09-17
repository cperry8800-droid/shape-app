// THE RADIO SPECTRUM'S TWO TONES, AND THE ONE PICKER THAT MOVES BOTH.
//
// WHY THIS FILE EXISTS: the website's Radio wall draws one instrument in two
// tones — a lit column is the base tone for its lower four fifths and a hot one
// for the top fifth, the kick flood goes hot, a loud cloud dot goes hot. The app
// drew the same instrument in ONE tone with a cream tip. Owner, 2026-09-17:
// "can you make the look of shape radio on app match the colors on website ... i
// like the 2 different color schemes", and then the half that decides the whole
// design: "make sure when you adjust colors on the settings app in still applies
// to the app on shape radio, both color sections".
//
// So the hot tone is DERIVED from the Settings accent rather than picked — one
// picker, two tones — by the same move that turns the website's teal into its
// amber. The rules below are the ones that keep that true:
//   · the derivation reproduces the website's own pair exactly, with BOTH hexes
//     re-read from the website's file rather than copied into this test;
//   · every accent the theme offers gets a partner, and the mono ones get none;
//   · the draw sites actually use it, which a correct derivation says nothing
//     about.
//
// Spec: docs/BUILD-2026-09-17-radio-two-tone.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hotFor, rgbToHsl, hexToRgb, hslToHex,
  WEB_TEAL, WEB_HOT, HOT_DH, HOT_S, HOT_DL, HOT_ACHROMATIC_S,
  BAR_HOT_FRAC, FIELD_HOT_V, FLOOD_KICK,
} from '../public/newdesign/radioSignalField.mjs';
import { WALL_FLOOD_KICK } from '../public/newdesign/radioField.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const WEB = readFileSync(new URL('../public/newdesign/radioInstrument.jsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url), 'utf8');
const THEME = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url), 'utf8');

/** One declared constant out of a source file, or a failure naming it. */
function decl(src, name, where) {
  const m = new RegExp('const ' + name + ' = "(#[0-9a-f]{6})"', 'i').exec(src);
  assert.ok(m, name + ' is no longer declared in ' + where + ' — this comparison is moot');
  return m[1].toLowerCase();
}

// ── the pair this is all derived from ────────────────────────────────────────
test('the derivation reproduces the website\'s own pair, exactly', () => {
  // ⚠ READ FROM THE WEBSITE, NEVER TYPED HERE. The whole point is that the app
  // matches what the wall draws; a test carrying its own copy of the two hexes
  // would go on passing the day the wall is repainted.
  const teal = decl(WEB, 'RD_TEAL', 'radioInstrument.jsx');
  const hot = decl(WEB, 'RD_HOT', 'radioInstrument.jsx');
  assert.equal(WEB_TEAL.toLowerCase(), teal, 'the module\'s WEB_TEAL is not the wall\'s RD_TEAL any more');
  assert.equal(WEB_HOT.toLowerCase(), hot, 'the module\'s WEB_HOT is not the wall\'s RD_HOT any more');

  // Feeding the base tone back through the derivation must return the hot one,
  // byte for byte — the offsets ARE that pair, so anything else means the
  // round trip through HSL has stopped being exact.
  assert.equal(hotFor(teal), hot, `hotFor(${teal}) is ${hotFor(teal)}, not the wall's ${hot}`);
});

test('the three placements are the website\'s own numbers', () => {
  // `col = fromBottom > level * 0.8 ? RD_HOT : RD_TEAL` — the top fifth.
  const bar = /fromBottom > level \* ([0-9.]+) \? RD_HOT : RD_TEAL/.exec(WEB);
  assert.ok(bar, 'the wall no longer splits a lit column between two tones — re-derive BAR_HOT_FRAC');
  assert.equal(BAR_HOT_FRAC, Number((1 - Number(bar[1])).toFixed(10)),
    `the wall paints its top ${(1 - Number(bar[1])) * 100}% hot and the app paints ${BAR_HOT_FRAC * 100}%`);

  // `rdRgba(v > 0.7 ? RD_HOT : RD_TEAL, ...)` — the cloud's own threshold.
  const dot = /v > ([0-9.]+) \? RD_HOT : RD_TEAL/.exec(WEB);
  assert.ok(dot, 'the wall\'s cloud no longer picks a tone by band level — re-derive FIELD_HOT_V');
  assert.equal(FIELD_HOT_V, Number(dot[1]), 'the app and the wall disagree about when a dot goes hot');

  // and the flood threshold, imported rather than restated
  assert.equal(FLOOD_KICK, WALL_FLOOD_KICK, 'the app\'s flood threshold is not the wall\'s');
});

// ── every accent the theme can hand it ───────────────────────────────────────
/** `makePalette`'s accent table, parsed out of the theme rather than named here. */
function accents() {
  const block = /const accents = \{([\s\S]*?)\n  \};/.exec(THEME);
  assert.ok(block, 'makePalette no longer declares an `accents` table — this sweep is looking at nothing');
  const out = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*\{\s*light:\s*'(#[0-9a-f]{6})'\s*,\s*dark:\s*'(#[0-9a-f]{6})'/gi)) {
    out[m[1]] = { light: m[2], dark: m[3] };
  }
  return out;
}

test('every accent the theme offers gets a partner, and the mono ones get none', () => {
  const A = accents();
  const keys = Object.keys(A);
  assert.ok(keys.length >= 9, 'parsed only ' + keys.length + ' accents — the table parse stopped matching');
  assert.ok(A.teal && A.white && A.black, 'the accent table lost one of the three this test reasons about');

  let chromatic = 0;
  for (const [name, pair] of Object.entries(A)) {
    for (const mode of ['light', 'dark']) {
      const base = pair[mode];
      const hot = hotFor(base);
      assert.match(hot, /^#[0-9a-f]{6}$/i, `${name}.${mode} produced ${hot}, which is not a colour`);
      const [h, s, l] = rgbToHsl(hexToRgb(base));
      if (s < HOT_ACHROMATIC_S) {
        // ⚠ A GREY HAS NO HUE TO ROTATE. white and black are one hex for both
        // modes, and makePalette additionally flips any accent to #ffffff or
        // #000000 when it cannot clear the paper. Two tones there would be two
        // greys, which reads as the feature being broken rather than as a mono
        // theme doing what it says.
        assert.equal(hot, base, `${name}.${mode} is achromatic and still got a second tone`);
        continue;
      }
      chromatic += 1;
      const [h2, s2, l2] = rgbToHsl(hexToRgb(hot));
      const dh = ((h2 - h - HOT_DH) % 360 + 540) % 360 - 180;
      assert.ok(Math.abs(dh) < 0.5, `${name}.${mode}: the hue moved ${(h2 - h).toFixed(1)}, not ${HOT_DH.toFixed(1)}`);
      // ⚠ THE TOLERANCES ARE 8-BIT COLOUR QUANTISATION, MEASURED, NOT SLACK.
      // A hex has 256 levels per channel, so a colour that goes HSL -> hex ->
      // HSL lands near where it was asked to, not on it. Swept across this whole
      // table the worst deviations are 0.441 degrees of hue and 0.0075 of
      // saturation, with lightness exact; teal.dark comes back at 0.000 on all
      // three, because that is the pair the offsets were derived from. Anything
      // beyond these is the rule drifting rather than the hex rounding.
      assert.ok(Math.abs(s2 - HOT_S) < 0.01, `${name}.${mode}: the partner's saturation is ${s2.toFixed(4)}, not amber's ${HOT_S.toFixed(4)}`);
      const wantL = Math.min(0.92, Math.max(0.08, l + HOT_DL));
      assert.ok(Math.abs(l2 - wantL) < 0.005, `${name}.${mode}: the partner's lightness is ${l2.toFixed(3)}, not ${wantL.toFixed(3)}`);
      // and the two tones are actually distinguishable
      assert.notEqual(hot.toLowerCase(), base.toLowerCase(), `${name}.${mode} produced the same colour twice`);
    }
  }
  assert.ok(chromatic >= 12, 'only ' + chromatic + ' chromatic accents were exercised — the sweep is not reaching the table');
});

test('a value that is not a colour passes through rather than throwing', () => {
  // The field reads this off a live theme every frame. A palette that ever hands
  // it an rgba() string, a CSS variable or an undefined must not take the canvas
  // down mid-draw; it degrades to one tone, which is the honest failure.
  for (const junk of ['', 'rgba(1,2,3,0.5)', 'var(--x)', '#abc', 'nonsense', null, undefined, 0]) {
    assert.doesNotThrow(() => hotFor(junk), 'hotFor threw on ' + JSON.stringify(junk));
    assert.equal(hotFor(junk), junk, 'hotFor invented a colour for ' + JSON.stringify(junk));
  }
});

test('the hex round trip is lossless for every accent', () => {
  // hslToHex(rgbToHsl(x)) === x, or the derivation quietly shifts a tone that was
  // meant to be left alone.
  for (const pair of Object.values(accents())) {
    for (const base of [pair.light, pair.dark]) {
      assert.equal(hslToHex(rgbToHsl(hexToRgb(base))), base.toLowerCase(), base + ' does not survive the hex round trip');
    }
  }
});

// ── the draw sites ───────────────────────────────────────────────────────────
/** The Signal Field component's body, brace-free and by span. */
function fieldBody() {
  const i = APP.indexOf('function BSRadioSignalField(');
  const j = APP.indexOf('function BSRadioScreen(', i);
  assert.ok(i > 0 && j > i, 'BSRadioSignalField is gone — every rule below is about a component that no longer exists');
  const body = APP.slice(i, j);
  assert.ok(body.length > 4000, 'the field body came back ' + body.length + ' characters — the span is wrong');
  return stripComments(body);
}

test('the instrument draws in two tones, and the hot one lands where the wall puts it', () => {
  const body = fieldBody();

  // The bars: two rects, the hot one on top, sized by the wall's own fraction.
  assert.match(body, /const hHot = h \* BAR_HOT_FRAC;/, 'the bars no longer split at the wall\'s fraction');
  assert.match(body, /ctx\.fillStyle = cfg\.teal;\s*\n\s*ctx\.fillRect\(x, baseY - \(h - hHot\), wBar, h - hHot\);/, 'the bar\'s body is not drawn in the base tone');
  assert.match(body, /ctx\.fillStyle = cfg\.hot;\s*\n\s*ctx\.fillRect\(x, baseY - h, wBar, hHot\);/, 'the bar\'s top fifth is not drawn in the hot tone');

  // ⚠ AND THE GRADIENT TO THE INK IS GONE. It is what made the spectrum one tone
  // with a cream highlight; left in place beside the two rects it would paint
  // over them.
  assert.doesNotMatch(body, /createLinearGradient|addColorStop/, 'the retired ink gradient is still in the field');

  // the peak cap, the station's baseline on a kick, the beat counter, the field
  // ⚠ ANCHORED ON THE CAP'S OWN RECT, NOT ON THE COMMENT ABOVE IT. The first cut
  // matched the explanatory `// the highest this band ...` line — inside a body
  // this very test has just run through stripComments, so it could only ever
  // fail. A guard aimed at a comment is aimed at the one thing its reader deletes.
  assert.match(body, /ctx\.fillStyle = cfg\.hot;\s*\n\s*ctx\.fillRect\(x, baseY - hCap - 2, wBar, 1\.5\);/, 'the peak cap is not the hot tone');
  assert.match(body, /ctx\.fillStyle = kick > FLOOD_KICK \? cfg\.hot : cfg\.teal;/, 'the station baseline does not flood hot on a kick');
  assert.match(body, /ctx\.fillStyle = on \? cfg\.hot : cfg\.teal;/, 'the beat counter does not light in the hot tone');
  assert.match(body, /ctx\.fillStyle = v > FIELD_HOT_V \? cfg\.hot : cfg\.teal;/, 'the field\'s dots do not take the two tones');

  // ⚠ CONTROL: the change must NOT have reached the matching state or the scrim.
  // The heart is rust by design and the two rows exist to be told apart; the
  // scrim is the paper.
  assert.match(body, /ctx\.strokeStyle = cfg\.heart;/, 'the heart row stopped being drawn in its own colour');
  assert.match(body, /ctx\.fillStyle = cfg\.paper;/, 'the scrim stopped being the paper');
  assert.match(APP, /const BS_HEART = '#e06547';/, 'the strap\'s rust is no longer a fixed literal');
});

test('the hot tone is derived from the live accent and handed to the field', () => {
  // A correct derivation says nothing about whether anything uses it.
  assert.match(APP, /const HOT = useMemoBR\(\(\) => hotFor\(TEAL\), \[TEAL\]\);/,
    'the Radio screen does not derive its hot tone from the accent');
  assert.match(APP, /const TEAL = t\.ACCENT;/, 'the base tone is no longer the Settings accent');
  assert.match(APP, /teal=\{TEAL\} hot=\{HOT\}/, 'the field is not handed the hot tone');

  // ⚠ THE DEPS ARE THE POINT, NOT THE MEMO. `[TEAL]` is what makes the second
  // half of the ask true: the Appearance picker recolours a still-mounted tree,
  // so an empty dep array would freeze the hot tone at whatever the accent was
  // when the page mounted and only the base tone would follow the picker.
  const memo = /const HOT = useMemoBR\([^;]*\);/.exec(APP)[0];
  assert.match(memo, /\[TEAL\]\)/, 'the hot tone is memoised without the accent in its deps — it would not follow the picker');

  // and the field reads both off the live ref, so a new pair lands next frame
  const body = fieldBody();
  assert.match(body, /liveRef\.current = \{ paused, matching, heartBpm, teal, hot,/, 'the field does not keep the hot tone live');
  assert.match(body, /function BSRadioSignalField\(\{ paused, matching, heartBpm, teal, hot,/, 'the field does not take a hot tone at all');
});

test('the module is imported rather than re-derived in the app', () => {
  // ⚠ ONE RULE, ONE FILE. radioSignalField.mjs is canonical for both surfaces —
  // the website imports it and the app bundles it — so a second copy of the
  // derivation in the app is how the two come to disagree about a colour.
  assert.match(APP, /hotFor, BAR_HOT_FRAC, FIELD_HOT_V, FLOOD_KICK,\n\} from '\.\.\/\.\.\/\.\.\/public\/newdesign\/radioSignalField\.mjs';/,
    'the app does not import the two-tone rule from the shared module');
  const body = fieldBody();
  assert.doesNotMatch(body, /rgbToHsl|hslToHex|#e0a24a/, 'the field re-derives the hot tone instead of importing it');
});
