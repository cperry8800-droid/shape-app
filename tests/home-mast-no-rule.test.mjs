// The Home masthead closes on no rule (owner, 2026-11-04: "remove this border line abobe the ticker on home
// page for all profiles"). The flag layout is member Home's and coach Today's (trainer and nutritionist) alone,
// so its own style is the one line every profile's Home drew above the ticker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const CHROME = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');

test('the flag masthead draws no rule under it', () => {
  const fn = CHROME.slice(CHROME.indexOf('function BSMastLayout('), CHROME.indexOf('function BSMasthead('));
  assert.ok(fn.length > 100, 'BSMastLayout moved');
  const open = fn.slice(fn.indexOf('<div data-bs-mast-layout="flag"'));
  const tag = open.slice(0, open.indexOf('>') + 1);
  assert.doesNotMatch(tag, /border(Bottom)?:/, 'the masthead closes on a rule again');
});

test('every Home that carries the ticker uses that masthead', () => {
  for (const f of ['mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx']) {
    const src = read(f);
    const mast = src.indexOf('layout="flag"');
    const ticker = src.indexOf('<BSTicker');
    assert.ok(mast > 0 && ticker > mast, `${f}: the ticker no longer follows the flag masthead`);
  }
});
