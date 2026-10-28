// The coach Today, Clients and Programs pages pair two faces (owner, 2026-10-25, "I want both"):
// Geist for the titles and section heads, Inter Tight for the words. The member's Home takes the
// same type (owner, 2026-10-28: "Member/client home page font needs to match coaches"). The app
// bundles the files, so the proof that they carry the weights the pages set is the files' own
// `fvar` tables, and the proof that every locale stays in the face is a Cyrillic and a Vietnamese
// file for each.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { woff2Table, fvarAxes } from './helpers/woff2-fvar.mjs';

const CSS = readFileSync(new URL('../mobile-app/src/fonts.css', import.meta.url), 'utf8');
const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const CLEAN = readFileSync(new URL('../mobile-app/src/broadsheet/bsCleanType.jsx', import.meta.url), 'utf8');
const file = (n) => readFileSync(new URL(`../mobile-app/src/assets/fonts/font-${n}.woff2`, import.meta.url));
const faces = (family) => CSS.split('@font-face').slice(1)
  .map((b) => b.slice(0, b.indexOf('}')))
  .filter((b) => b.includes(`font-family: '${family}'`))
  .map((b) => ({ block: b, n: (b.match(/font-(\d+)\.woff2/) || [])[1] }));

for (const family of ['Inter Tight', 'Geist']) {
  test(`${family} ships its weight axis across 100..900, in every script the app's locales use`, () => {
    const found = faces(family);
    assert.equal(found.length, 5, `expected latin, latin-ext, cyrillic, cyrillic-ext and vietnamese ${family} faces`);
    for (const { n, block } of found) {
      const wght = new Map(fvarAxes(woff2Table(file(n), 'fvar')).map((a) => [a.tag, a])).get('wght');
      assert.ok(wght, `font-${n} has no wght axis`);
      assert.ok(wght.min <= 400 && wght.max >= 800, `font-${n}: wght ${wght.min}..${wght.max}`);
      // A single declared weight clamps a variable face and the axis goes inert.
      assert.match(block, /font-weight:\s*100\s+900/, `font-${n}: the face does not declare the weight range`);
    }
    const ranges = found.map(({ block }) => block).join('\n');
    assert.match(ranges, /U\+0400-045F/, `${family}: no face covers basic Cyrillic (ru, uk)`);
    assert.match(ranges, /U\+1EA0-1EF9/, `${family}: no face covers Vietnamese`);
  });
}

test('every new face is a real subset, not an empty file', () => {
  for (const { n } of [...faces('Inter Tight'), ...faces('Geist')]) {
    const maxp = woff2Table(file(n), 'maxp');
    assert.ok(maxp && maxp.length >= 6, `font-${n}: maxp is missing`);
    assert.ok(maxp.readUInt16BE(4) >= 50, `font-${n}: only ${maxp.readUInt16BE(4)} glyphs`);
  }
});

test('the clean type names the two bundled faces', () => {
  assert.match(CLEAN, /export const BS_CLEAN_HEAD = "'Geist',/);
  assert.match(CLEAN, /export const BS_CLEAN_SANS = "'Inter Tight',/);
});

test('the coach pages and the member Home share the one clean type', () => {
  assert.match(PROS, /import \{[^}]*\buseBSClean\b[^}]*\} from '\.\/bsCleanType\.jsx';/);
  const home = CLIENT.slice(CLIENT.indexOf('function BSClientHome('));
  const body = home.slice(0, home.indexOf('\n}\n'));
  assert.match(CLIENT, /import \{ useBSClean, BSCleanType \} from '\.\/bsCleanType\.jsx';/);
  assert.match(body, /const t = useBSClean\(\);/, 'Home reads the clean theme');
  // The clean area opens below the top bars and closes before the footer, as on the coach's Today.
  const open = body.indexOf('<BSCleanType t={t}>');
  const close = body.indexOf('</BSCleanType>');
  assert.ok(open > body.indexOf('<BSNowPlaying') && open < body.indexOf('<BSHomeGoal'), 'the clean area starts under Shape Radio');
  assert.ok(close > body.indexOf('<BSShortcuts') && close < body.indexOf('<BSFooter'), 'the clean area ends before the footer');
});
