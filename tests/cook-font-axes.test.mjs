// The cooking screens' type is the website's: Schibsted Grotesk for words, Anybody for
// headings, Doto for figures (the approved burners-and-tracks design, 2026-09-28). The app
// bundles the files, so the proof that they carry the axes the screens set is the files'
// own `fvar` tables — a filename is not evidence (radio-font-axes.test.mjs says why).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { woff2Table, fvarAxes } from './helpers/woff2-fvar.mjs';

const CSS = readFileSync(new URL('../mobile-app/src/fonts.css', import.meta.url), 'utf8');
const file = (n) => readFileSync(new URL(`../mobile-app/src/assets/fonts/font-${n}.woff2`, import.meta.url));
const axesOf = (n) => new Map(fvarAxes(woff2Table(file(n), 'fvar')).map((a) => [a.tag, a]));
// Every @font-face block that names a family, with the file it points at.
const faces = (family) => CSS.split('@font-face').slice(1)
  .map((b) => b.slice(0, b.indexOf('}')))
  .filter((b) => b.includes(`font-family: '${family}'`))
  .map((b) => ({ block: b, n: (b.match(/font-(\d+)\.woff2/) || [])[1] }));

test('Anybody ships as the two-axis file: the headings set wdth, and a one-axis file would ignore it', () => {
  const found = faces('Anybody');
  assert.equal(found.length, 3, 'expected latin, latin-ext and vietnamese Anybody faces');
  for (const { n, block } of found) {
    const ax = axesOf(n);
    assert.ok(ax.size >= 2, `font-${n}: fvar reports ${ax.size} axes — the parser found nothing to check`);
    const wdth = ax.get('wdth');
    assert.ok(wdth && wdth.min <= 100 && wdth.max >= 112, `font-${n} has no wdth axis reaching 112 — this is the wght-only build`);
    const wght = ax.get('wght');
    assert.ok(wght && wght.min <= 500 && wght.max >= 700, `font-${n}: wght ${wght && wght.min}..${wght && wght.max}`);
    // A single declared weight clamps a variable face and the axis goes inert.
    assert.match(block, /font-weight:\s*100\s+900/, `font-${n}: the face does not declare the weight range`);
  }
});

test('Schibsted Grotesk ships with its weight axis across 400..900', () => {
  const found = faces('Schibsted Grotesk');
  assert.equal(found.length, 2, 'expected latin and latin-ext Schibsted Grotesk faces');
  for (const { n, block } of found) {
    const wght = axesOf(n).get('wght');
    assert.ok(wght, `font-${n} has no wght axis`);
    assert.ok(wght.min <= 400 && wght.max >= 800, `font-${n}: wght ${wght.min}..${wght.max}`);
    assert.match(block, /font-weight:\s*400\s+900/, `font-${n}: the face does not declare the weight range`);
  }
});

test('every new face is a real latin subset, not an empty file', () => {
  for (const n of [29, 31]) {
    const maxp = woff2Table(file(n), 'maxp');
    assert.ok(maxp && maxp.length >= 6, `font-${n}: maxp is missing`);
    assert.ok(maxp.readUInt16BE(4) >= 100, `font-${n}: only ${maxp.readUInt16BE(4)} glyphs`);
  }
});
