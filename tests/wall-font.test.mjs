// One headline face across the app (owner, 2026-10-24: "Font needs to be same on whole app" and "The
// font on Chat page needs to not be so tall"). The Wall, the chat page and the session page set their
// headlines in Oswald from 2026-10-23 ("use oswald"); they take the app's own face now, Saira, as every
// other page does. The proof that the headlines still get the weights they set is each Saira file's
// own `fvar` table, as cook-font-axes.test.mjs does for the cooking faces.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { woff2Table, fvarAxes } from './helpers/woff2-fvar.mjs';

const SRC = new URL('../mobile-app/src/', import.meta.url);
const CSS = readFileSync(new URL('fonts.css', SRC), 'utf8');
const file = (n) => readFileSync(new URL(`assets/fonts/font-${n}.woff2`, SRC));
const faces = (family) => CSS.split('@font-face').slice(1)
  .map((b) => b.slice(0, b.indexOf('}')))
  .filter((b) => b.includes(`font-family: '${family}'`))
  .map((b) => ({ block: b, n: (b.match(/font-(\d+)\.woff2/) || [])[1] }));

test('no Oswald ships: every headline is in the app\'s own face', () => {
  assert.equal(faces('Oswald').length, 0, 'an Oswald face is back in fonts.css');
  // Nothing in the app names it as a font any more.
  const dir = new URL('broadsheet/', SRC);
  for (const f of readdirSync(dir).filter((x) => /\.(jsx|mjs|js)$/.test(x))) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /'Oswald'/, `${f} names Oswald as a font`);
  }
  const theme = readFileSync(new URL('broadsheet/iosAppBroadsheet.jsx', SRC), 'utf8');
  assert.doesNotMatch(theme, /HEADLINE_BS|HEADLINE:/, 'a second headline token in the theme');
});

test('the magazine\'s headline face is the theme\'s display face, Saira', async () => {
  const { bsWsHead } = await import(new URL('broadsheet/bsMagazine.mjs', SRC).href);
  assert.equal(bsWsHead({ DISPLAY: "'Saira', sans-serif", HEADLINE: "'Oswald'" }), "'Saira', sans-serif");
  const theme = readFileSync(new URL('broadsheet/iosAppBroadsheet.jsx', SRC), 'utf8');
  assert.match(theme, /const DISPLAY_BS = "'Saira', /);
  assert.doesNotMatch(readFileSync(new URL('broadsheet/BSWallLive.jsx', SRC), 'utf8'), /t\.HEADLINE/);
});

test('Saira ships with its whole weight range, so the headlines\' 500 and 600 are real weights', () => {
  const found = faces('Saira');
  assert.ok(found.length >= 3, 'expected Saira faces for latin, latin-ext and vietnamese');
  for (const { n, block } of found) {
    const wght = new Map(fvarAxes(woff2Table(file(n), 'fvar')).map((a) => [a.tag, a])).get('wght');
    assert.ok(wght, `font-${n} has no wght axis`);
    assert.ok(wght.min <= 400 && wght.max >= 700, `font-${n}: wght ${wght.min}..${wght.max}`);
    // A single declared weight clamps a variable face and the axis goes inert.
    assert.match(block, /font-weight:\s*100\s+900/, `font-${n}: the face does not declare the weight range`);
  }
});
