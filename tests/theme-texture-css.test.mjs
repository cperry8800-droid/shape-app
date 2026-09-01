// tests/theme-texture-css.test.mjs
//
// Every texture in the Appearance picker must compose into a VALID CSS
// `background` shorthand — because an invalid one is not a missing texture, it
// is a TRANSPARENT PAGE.
//
// BSPage paints the whole scroller with, verbatim:
//
//     background: t.TEXTURE ? `${t.TEXTURE}, ${t.PAPER_BG}` : t.PAPER_BG
//
// In the `background` shorthand a COLOUR may appear only in the FINAL layer.
// PAPER_BG always supplies that final colour, so every layer `makeTexture`
// returns must be an IMAGE (a gradient or a url) — never a bare colour. Put a
// colour in an earlier layer and CSS error-handling drops the ENTIRE
// declaration: no background at all.
//
// ⚠ WHY THIS SHIPPED UNNOTICED, and why the guard is worth more than the fix:
// on an ordinary page the app root still paints paper underneath, so the defect
// merely looks like "the texture didn't apply". It only becomes visible on an
// OVERLAY surface — Settings renders at zIndex 210 over a still-mounted tab
// tree (2026-07-07) — where the transparency reveals the page beneath and the
// two render superimposed. `blueprint` and `concrete` both shipped this way and
// broke the Settings page on ALL 18 papers.
//
// The module is a browser JSX file with React imports, so it cannot be
// imported. The house instrument is brace-matching the real function out of the
// shipped source and EVALUATING it — a spelling pin would survive any
// equivalent rewrite, and what matters is what the function ANSWERS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url);
const src = readFileSync(SRC, 'utf8');

function extractFn(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in the shipped source: ${marker}`);
  assert.equal(src.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

// eslint-disable-next-line no-new-func
const makeTexture = new Function(`${extractFn('function makeTexture')}; return makeTexture;`)();

// The picker's own list, read from the source rather than hand-copied, so a
// texture added later is covered here with nobody remembering this file exists.
const TEXTURE_KEYS = (() => {
  const body = extractFn('function makeTexture');
  const keys = [...body.matchAll(/case '([a-z0-9]+)':/g)].map((m) => m[1]);
  assert.ok(keys.length >= 24, `expected the full texture set, found ${keys.length}`);
  return keys;
})();

// Split a background list on TOP-LEVEL commas only (commas inside rgba()/
// gradient parens are not layer separators).
function layersOf(css) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of css) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// The real CSS rule, not a spelling of one shape of it: in `background`, every
// layer but the LAST must carry an <image>. Testing "is this layer exactly a
// colour?" is too narrow — verified in Chromium, `rgba(...) 0 0/5px 5px` and
// `rgba(...) repeat` are rejected just as hard as a bare `rgba(...)`, and a
// position/size suffix is precisely this file's house pattern (see `concrete`),
// so a colour wearing one is the likeliest way back into the bug.
const IMAGE = /(?:^|[\s,(])(?:repeating-)?(?:linear|radial|conic)-gradient\(|url\(|image-set\(|cross-fade\(|element\(|paint\(/i;
const lacksImage = (layer) => layer !== 'none' && !IMAGE.test(layer);

test('no texture layer is a bare colour — a colour outside the last layer voids the whole shorthand', () => {
  const offenders = [];
  for (const key of TEXTURE_KEYS) {
    for (const isLight of [true, false]) {
      const tex = makeTexture(key, '15,14,12', isLight);
      if (!tex) continue;                       // 'none' → null, BSPage uses PAPER_BG alone
      layersOf(tex).forEach((layer, i) => {
        if (lacksImage(layer)) offenders.push(`${key} (isLight=${isLight}) layer ${i}: ${layer}`);
      });
    }
  }
  assert.deepEqual(offenders, [],
    `these texture layers carry no image, so BSPage's \`\${TEXTURE}, \${PAPER_BG}\` is invalid `
    + `CSS and the page paints TRANSPARENT:\n  ${offenders.join('\n  ')}\n`
    + 'Wrap a flat wash as linear-gradient(C, C) — visually identical, valid in any layer.');
});

test('the composed background always ends in the paper colour, and only there', () => {
  // Mirrors BSPage exactly: TEXTURE first, PAPER_BG last.
  const PAPER_BG = '#000000';
  for (const key of TEXTURE_KEYS) {
    const tex = makeTexture(key, '15,14,12', false);
    const css = tex ? `${tex}, ${PAPER_BG}` : PAPER_BG;
    const layers = layersOf(css);
    assert.equal(layers[layers.length - 1], PAPER_BG, `${key}: paper colour must be the final layer`);
    layers.slice(0, -1).forEach((layer, i) => {
      assert.ok(!lacksImage(layer), `${key}: layer ${i} carries no image (${layer})`);
    });
  }
});

test('the two textures that shipped broken stay fixed', () => {
  // blueprint + concrete each opened their layer list with a bare rgba() wash.
  for (const key of ['blueprint', 'concrete']) {
    for (const isLight of [true, false]) {
      const first = layersOf(makeTexture(key, '15,14,12', isLight))[0];
      assert.match(first, /^linear-gradient\(/,
        `${key} must open with a flat gradient wash, not a bare colour — got: ${first}`);
    }
  }
});
