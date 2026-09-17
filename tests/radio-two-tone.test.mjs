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
  BAR_HOT_FRAC, FIELD_HOT_V, FLOOD_KICK, HOT_PAPER, HOT_MIN_CONTRAST,
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
  const want = tableKeys(THEME, 'accents');
  const missed = want.filter((k) => !(k in out));
  assert.deepEqual(missed, [],
    `the accent parser read ${Object.keys(out).length} of ${want.length} entries and silently skipped ${missed.join(', ')} — widen it rather than lowering the floor`);
  return out;
}

/**
 * Every top-level key of a `const NAME = { ... }` table, found by walking braces
 * rather than by the same regex that reads the entries.
 * ⚠ THIS IS THE CONTROL FOR THE TWO PARSERS BELOW, AND IT IS THE POINT. A parser
 * that reads entries with one narrow pattern goes quietly blind to an entry
 * formatted any other way — across two lines, in double quotes, with a comment
 * between the key and the brace — and a floor of `>= 18` still passes on today's
 * table while the new paper is never exercised. So the entry parsers must
 * account for EVERY key this finds, not merely for enough of them.
 */
function tableKeys(src, name) {
  const at = src.indexOf('const ' + name + ' = {');
  assert.ok(at >= 0, `${name} is no longer declared — this sweep is looking at nothing`);
  const open = src.indexOf('{', at);
  let depth = 0; let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > open, `${name}'s braces do not balance — the walk cannot be trusted`);
  const body = src.slice(open + 1, end);
  // top-level keys only: depth 0 within the body, `key:` followed by a value
  const keys = []; depth = 0; let line = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    if (c === '\n') { line = ''; continue; }
    line += c;
    if (c === ':' && depth === 0) {
      const m = /(?:^|[,{\s])['"]?([A-Za-z_$][\w$-]*)['"]?\s*:$/.exec(line);
      if (m) keys.push(m[1]);
    }
  }
  assert.ok(keys.length > 0, `${name} parsed to zero keys — the brace walk stopped matching`);
  return keys;
}

/** `makePalette`'s paper table, parsed out of the theme rather than named here. */
function papers() {
  const block = /const PAPERS = \{([\s\S]*?)\n  \};/.exec(THEME);
  assert.ok(block, 'makePalette no longer declares a `PAPERS` table — this sweep is looking at nothing');
  const out = {};
  for (const m of block[1].matchAll(/(\w+)\s*:\s*\{ paper: '(#[0-9a-f]{6})'[^\n]*?light: (true|false)/gi)) {
    out[m[1]] = { paper: m[2], light: m[3] === 'true' };
  }
  const want = tableKeys(THEME, 'PAPERS');
  const missed = want.filter((k) => !(k in out));
  assert.deepEqual(missed, [],
    `the paper parser read ${Object.keys(out).length} of ${want.length} entries and silently skipped ${missed.join(', ')} — widen it rather than lowering the floor`);
  return out;
}

/** WCAG relative luminance + contrast, so the floor is measured, not eyeballed. */
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = lum(a); const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** What `makePalette` actually hands the Radio screen for a (paper, accent). */
function baseFor(paper, pair) {
  const base = paper.light ? pair.light : pair.dark;
  // the palette's own mono flip — an accent that cannot clear the paper is
  // replaced before the field ever sees it, so the sweep must apply it too.
  return contrast(base, paper.paper) < 1.6 ? (paper.light ? '#000000' : '#ffffff') : base;
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
      // ⚠ THE LIGHTNESS IS THE PAPER'S CALL, SO THIS SWEEP PINS ONLY THE
      // PAPERLESS DEFAULT — the wall's own dark ground, where the step is up.
      // The paper-aware behaviour is swept over the real PAPERS table below;
      // pinning `l + HOT_DL` here would have been the assertion that let a
      // 1.00:1 partner ship on manila.
      const wantL = Math.min(0.96, Math.max(0.04, l + HOT_DL));
      assert.ok(l2 >= wantL - 0.005, `${name}.${mode}: the partner's lightness is ${l2.toFixed(3)}, below the wall's own ${wantL.toFixed(3)}`);
      // and the two tones are actually distinguishable
      assert.notEqual(hot.toLowerCase(), base.toLowerCase(), `${name}.${mode} produced the same colour twice`);
    }
  }
  assert.ok(chromatic >= 12, 'only ' + chromatic + ' chromatic accents were exercised — the sweep is not reaching the table');
});

// ── the paper the instrument is drawn on ─────────────────────────────────────
// ⚠ THIS SWEEP EXISTS BECAUSE THE ONE ABOVE READ THE ACCENT TABLE IN ISOLATION.
// The partner was derived with a FIXED +HOT_DL, which is only "away from the
// ground" while the ground is dark — and this screen is theme-adaptive, so it is
// frequently light. Measured across all 18 papers x 9 accents, that shipped 14
// pairs between 1.00:1 and 1.55:1, every one a light paper on Blue or Violet,
// with manila + violet landing on 1.00:1: the loudest fifth of the instrument,
// the peak caps and the loud field dots drawn in the paper's own colour. Found
// by review on 2026-09-17.
test('on every paper the theme offers, the hot tone clears its floor', () => {
  const P = papers(); const A = accents();
  const pk = Object.keys(P); const ak = Object.keys(A);
  assert.ok(pk.length >= 18, 'parsed only ' + pk.length + ' papers — the table parse stopped matching');
  assert.ok(ak.length >= 9, 'parsed only ' + ak.length + ' accents — the table parse stopped matching');
  assert.ok(pk.some((k) => P[k].light) && pk.some((k) => !P[k].light),
    'the sweep reached only one kind of paper — the light ones are the whole point');

  let worst = Infinity; let worstAt = '';
  let chromatic = 0;
  for (const [pname, paper] of Object.entries(P)) {
    for (const [aname, pair] of Object.entries(A)) {
      const base = baseFor(paper, pair);
      const hot = hotFor(base, paper.paper);
      const [, s] = rgbToHsl(hexToRgb(base));
      if (s < HOT_ACHROMATIC_S) {
        assert.equal(hot, base, `${pname}/${aname}: an achromatic base got a second tone`);
        continue;
      }
      chromatic += 1;
      const ch = contrast(hot, paper.paper);
      // ⚠ THE FLOOR IS CAPPED BY THE BASE, AND THAT IS NOT SLACK. On the wall's
      // own ground the approved pair reads teal 10.8 and amber 8.8, so the hot
      // tone is ALREADY the lower-contrast half. Demanding it beat a base that
      // is itself marginal would invert the relationship the owner picked.
      const floor = Math.min(contrast(base, paper.paper), HOT_MIN_CONTRAST);
      assert.ok(ch >= floor - 1e-9,
        `${pname}/${aname}: base ${base} reads ${contrast(base, paper.paper).toFixed(2)}:1 and its partner ${hot} only ${ch.toFixed(2)}:1`);
      if (ch < worst) { worst = ch; worstAt = `${pname}/${aname}`; }
    }
  }
  assert.ok(chromatic >= 100, 'only ' + chromatic + ' pairs were exercised — the sweep is not reaching the tables');
  // A measured backstop, so a rule that technically clears each cap but
  // collapses the set cannot pass. Measured 3.03 on steel/rose at the fix.
  assert.ok(worst >= 1.6, `the worst pair in the whole matrix is ${worstAt} at ${worst.toFixed(2)}:1`);
});

test('the partner steps AWAY from the paper, never towards it', () => {
  // The one-line statement of the defect: on a light paper a fixed +HOT_DL
  // walks the partner towards the ground it has to be read against.
  const P = papers(); const A = accents();
  for (const [pname, paper] of Object.entries(P)) {
    const pl = rgbToHsl(hexToRgb(paper.paper))[2];
    for (const [aname, pair] of Object.entries(A)) {
      const base = baseFor(paper, pair);
      const [, s, l] = rgbToHsl(hexToRgb(base));
      if (s < HOT_ACHROMATIC_S) continue;
      const [, , l2] = rgbToHsl(hexToRgb(hotFor(base, paper.paper)));
      if (pl > 0.5) assert.ok(l2 <= l + 1e-9, `${pname}/${aname}: a light paper and the partner went LIGHTER (${l.toFixed(3)} -> ${l2.toFixed(3)})`);
      else assert.ok(l2 >= l - 1e-9, `${pname}/${aname}: a dark paper and the partner went DARKER (${l.toFixed(3)} -> ${l2.toFixed(3)})`);
    }
  }
});

test('the paperless default is the wall\'s own ground', () => {
  // So a call with no paper reproduces the website rather than guessing, and
  // the app's own call site is the thing that has to supply the real one.
  assert.equal(HOT_PAPER.toLowerCase(), decl(WEB, 'RD_BG', 'radioInstrument.jsx'),
    'HOT_PAPER is not the wall\'s own RD_BG any more');
  assert.equal(hotFor(WEB_TEAL), hotFor(WEB_TEAL, HOT_PAPER),
    'the paperless default is not the wall\'s ground');
  assert.equal(hotFor(WEB_TEAL, HOT_PAPER).toLowerCase(), WEB_HOT.toLowerCase(),
    'the wall\'s own pair no longer reproduces on the wall\'s own ground');
});

test('a value that is not a colour passes through rather than throwing', () => {
  // The field reads this off a live theme every frame. A palette that ever hands
  // it an rgba() string, a CSS variable or an undefined must not take the canvas
  // down mid-draw; it degrades to one tone, which is the honest failure.
  for (const junk of ['', 'rgba(1,2,3,0.5)', 'var(--x)', '#abc', 'nonsense', null, undefined, 0]) {
    assert.doesNotThrow(() => hotFor(junk), 'hotFor threw on ' + JSON.stringify(junk));
    assert.equal(hotFor(junk), junk, 'hotFor invented a colour for ' + JSON.stringify(junk));
    // ⚠ AND THE SAME FOR THE PAPER, WHICH IS ALSO READ OFF A LIVE THEME. An
    // unreadable ground must fall back to the wall's own, never to a light one:
    // guessing light would step the partner the wrong way on every dark paper,
    // which is the defect this whole sweep exists for, pointed backwards.
    assert.doesNotThrow(() => hotFor(WEB_TEAL, junk), 'hotFor threw on a paper of ' + JSON.stringify(junk));
    assert.equal(hotFor(WEB_TEAL, junk), hotFor(WEB_TEAL, HOT_PAPER),
      'an unreadable paper did not fall back to the wall\'s own ground: ' + JSON.stringify(junk));
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
  assert.match(APP, /const HOT = useMemoBR\(\(\) => hotFor\(TEAL, t\.PAPER\), \[TEAL, t\.PAPER\]\);/,
    'the Radio screen does not derive its hot tone from the accent');
  assert.match(APP, /const TEAL = t\.ACCENT;/, 'the base tone is no longer the Settings accent');
  assert.match(APP, /teal=\{TEAL\} hot=\{HOT\}/, 'the field is not handed the hot tone');

  // ⚠ THE DEPS ARE THE POINT, NOT THE MEMO. They are what make the second half
  // of the ask true: the Appearance picker recolours a still-mounted tree, so a
  // missing dep freezes the hot tone at whatever the theme was when the page
  // mounted while the base tone goes on following the picker — one tone live
  // and one stale, which is worse than either. BOTH the accent and the paper
  // are deps: the accent sets the hue, and the paper decides which way the
  // partner steps, so a paper change has to re-derive it too.
  const memo = /const HOT = useMemoBR\([^;]*\);/.exec(APP)[0];
  const deps = /\},?\s*\[([^\]]*)\]\)/.exec(memo);
  assert.ok(deps || /,\s*\[([^\]]*)\]\)/.test(memo), 'the hot tone memo has no dep array at all');
  const list = /\[([^\]]*)\]\)/.exec(memo)[1];
  assert.match(list, /\bTEAL\b/, 'the hot tone is memoised without the accent in its deps — it would not follow the picker');
  assert.match(list, /\bt\.PAPER\b/, 'the hot tone is memoised without the paper in its deps — it would not follow a paper change');

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
