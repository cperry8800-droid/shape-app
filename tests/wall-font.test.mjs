// The Wall's magazine headlines are Oswald (owner, 2026-10-23, picking among six faces: "use
// oswald"). The app bundles the files, so the proof that the headlines get the weights they set
// is each file's own `fvar` table, as cook-font-axes.test.mjs does for the cooking faces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { woff2Table, fvarAxes } from './helpers/woff2-fvar.mjs';

const CSS = readFileSync(new URL('../mobile-app/src/fonts.css', import.meta.url), 'utf8');
const file = (n) => readFileSync(new URL(`../mobile-app/src/assets/fonts/font-${n}.woff2`, import.meta.url));
const faces = (family) => CSS.split('@font-face').slice(1)
  .map((b) => b.slice(0, b.indexOf('}')))
  .filter((b) => b.includes(`font-family: '${family}'`))
  .map((b) => ({ block: b, n: (b.match(/font-(\d+)\.woff2/) || [])[1] }));

test('Oswald ships for every script the app is read in, each file carrying its weights', () => {
  const found = faces('Oswald');
  // Latin and latin-ext for the Latin locales, Cyrillic for ru and uk, Vietnamese for vi.
  assert.equal(found.length, 5, 'expected cyrillic-ext, cyrillic, vietnamese, latin-ext and latin Oswald faces');
  for (const { n, block } of found) {
    const wght = new Map(fvarAxes(woff2Table(file(n), 'fvar')).map((a) => [a.tag, a])).get('wght');
    assert.ok(wght, `font-${n} has no wght axis`);
    assert.ok(wght.min <= 400 && wght.max >= 700, `font-${n}: wght ${wght.min}..${wght.max}`);
    // A single declared weight clamps a variable face and the axis goes inert.
    assert.match(block, /font-weight:\s*200\s+700/, `font-${n}: the face does not declare the weight range`);
    const maxp = woff2Table(file(n), 'maxp');
    assert.ok(maxp && maxp.readUInt16BE(4) >= 50, `font-${n}: only ${maxp && maxp.readUInt16BE(4)} glyphs`);
  }
});

test('the theme names Oswald as the headline face, falling back to the app\'s own', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheet.jsx', import.meta.url), 'utf8');
  assert.match(src, /const HEADLINE_BS = "'Oswald', 'Saira', /);
  assert.match(src, /HEADLINE: HEADLINE_BS,/);
});
