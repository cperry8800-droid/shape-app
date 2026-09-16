// tests/radio-module-cache-keys.test.mjs
//
// WHY THIS FILE EXISTS: the Radio page loads three ES modules through a
// `<script type="module">` tag, and `scripts/build-newdesign.mjs` DOES NOT VERSION
// THEM. Its rewrite matches `<script type="text/babel">` and nothing else, so every
// .jsx on the page ships under a content-hashed `nd/<name>?v=<hash>` URL and is
// re-fetched the moment it changes — while a module import keeps whatever `?v=` a
// human last typed.
//
// That asymmetry is a silent trap rather than an inconvenience. A .jsx and a .mjs
// that must agree about an export can be deployed together and still be PAIRED WRONG
// in a returning browser: the hashed .jsx is fetched fresh, the dated .mjs is served
// from cache. It happened here — `rdLib` in radioInstrument.jsx requires
// `F.wallWordFit`, which exists only in the current radioField.mjs, and against a
// cached older copy the guard correctly returns null, the field effect bails, and the
// hero renders its chrome over an empty canvas. radio.jsx's own RdSetsComingUp comment
// cites the same lesson from #1772, one script tag away.
//
// So the keys are CONTENT HASHES and this file recomputes them from the bytes. Editing
// a module without re-hashing its key fails here instead of shipping a stale pairing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HTML = readFileSync(new URL('../public/newdesign/Radio.html', import.meta.url), 'utf8');

// ⚠ DERIVED FROM THE PAGE, NOT LISTED HERE. A hand-written list of modules would go
// stale the day a fifth is added — which is the same class of defect this file is
// about, one level up.
//
// ⚠ AND IT IS COUNTED TWICE, BECAUSE A FIXED VACUITY FLOOR IS NOT ONE. A first draft
// asserted `IMPORTS.length >= 3` against a page carrying FOUR module imports, so an
// import that fell out of the strict pattern left three behind and passed — measured,
// that mutation SURVIVED its round. The floor has to come from the page too: EVERY
// module this page imports must also appear in the versioned set, so one dropping out
// of the strict parse is a failure rather than a smaller corpus.
const ANY_MODULE = /from\s+"\/newdesign\/([^"]+?\.[Mm][Jj][Ss])(\?[^"]*)?"/g;
const VERSIONED = /from\s+"\/newdesign\/([A-Za-z0-9_-]+\.mjs)\?v=([A-Za-z0-9]+)"/g;

const ALL = [...HTML.matchAll(ANY_MODULE)].map((m) => m[1]);
const IMPORTS = [...HTML.matchAll(VERSIONED)].map((m) => ({ file: m[1], key: m[2] }));

const hashOf = (file) =>
  createHash('sha256')
    .update(readFileSync(new URL(`../public/newdesign/${file}`, import.meta.url)))   // BYTES
    .digest('hex')
    .slice(0, 10);

test('every versioned module import on the Radio page carries its own content hash', () => {
  // vacuity floor, derived: every module the page imports must be in the versioned set
  assert.ok(ALL.length > 0, 'found no /newdesign/*.mjs imports at all — this guard has stopped reading the page');
  assert.equal(IMPORTS.length, ALL.length,
    `the page imports ${ALL.length} modules (${ALL.join(', ')}) but only ${IMPORTS.length} carry a ?v= content hash: ` +
    `${ALL.filter((f) => !IMPORTS.some((i) => i.file === f)).join(', ')} would be cached by date or forever`);

  for (const { file, key } of IMPORTS) {
    const want = hashOf(file);
    assert.equal(key, want,
      `${file} is served as ?v=${key} but its bytes hash to ${want}.\n` +
      'The module changed and its cache key did not, so a returning browser would pair ' +
      'the freshly-hashed .jsx with its own cached copy of the OLD module.\n' +
      `FIX: in public/newdesign/Radio.html, change ${file}?v=${key} to ${file}?v=${want}\n` +
      'Re-hash LAST, after the module edit is final — editing it again moves the hash.');
  }
});

test('the build really does leave module tags alone, which is why the hashes are needed', () => {
  // ⚠ GUARD THE PREMISE, NOT JUST THE CONCLUSION. If the build ever starts versioning
  // module imports the hashes above become redundant busywork, and the next reader
  // should be told so here rather than discovering it. This asserts the build's rewrite
  // is still babel-only — the reason this file exists.
  const build = readFileSync(new URL('../scripts/build-newdesign.mjs', import.meta.url), 'utf8');
  const tag = /const BABEL_TAG = [^\n]*/.exec(build);
  assert.ok(tag, 'build-newdesign.mjs no longer declares BABEL_TAG — re-read what it rewrites');
  assert.ok(/text\\?\/babel/.test(tag[0]),
    `the build's rewrite is no longer scoped to text/babel: ${tag[0]}`);
  assert.ok(!/type="module"/.test(tag[0]),
    'the build now rewrites module tags too — the hand-written content hashes here are redundant');
});

test('the instrument guards on an export the shipped module actually has', () => {
  // The other half of the pairing: a guard naming a symbol radioField.mjs does not
  // export would make rdLib return null for EVERY visitor, cached or not, and the page
  // would draw nothing at all while every test still passed.
  const instr = readFileSync(new URL('../public/newdesign/radioInstrument.jsx', import.meta.url), 'utf8');
  const field = readFileSync(new URL('../public/newdesign/radioField.mjs', import.meta.url), 'utf8');
  const guarded = [...instr.matchAll(/!F\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(guarded.length >= 3, `rdLib guards on ${guarded.length} symbols — the parse has stopped matching`);
  for (const name of guarded) {
    assert.ok(new RegExp(`export (?:function|const) ${name}\\b`).test(field),
      `rdLib guards on F.${name}, which radioField.mjs does not export: the page would draw nothing`);
  }
});
