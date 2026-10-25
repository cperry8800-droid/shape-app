// tests/profile-magazine-module.test.mjs
//
// BSProfileMagazine.jsx holds the profiles' pieces in the Wall's look (the pulled-out quote, and the coach
// profile's dock that hides on scroll), carved out of the client module the way BSIntegrationsPage.jsx,
// BSLeaderboard.jsx and BSEatFuel.jsx were (Codex, P1 on #2441: a PR that touches a self-contained piece
// moves it into its own module). The client imports it statically, so it evaluates BEFORE the client's body
// has published its window globals: the one way it breaks in production with parse, tsc and build all green
// is a window read at module top (React error #130 on first open). This pins that shape, the one-way
// import, and the seams the client relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const MOD = 'mobile-app/src/broadsheet/BSProfileMagazine.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const src = stripComments(fs.readFileSync(MOD, 'utf8'));
const EXPORTED = ['BSTPullQuote', 'BSProfileDock', 'useBSHideOnScrollDown'];

test('evaluating the module by itself reads NO window global, and it exports what the client imports', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(path.resolve(MOD));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(Object.keys(mod).sort(), [...EXPORTED].sort());
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated (React #130 on first open)`);
});

test('the theme is read at call time, and none of the client module\'s own helpers are reached for', () => {
  assert.match(src, /^export function BSTPullQuote\([^)]*\) \{\n  const t = window\.useBS\(\);/m, 'the quote takes the theme hook from window at call time');
  // Names the client module defines for itself (and the test harness happens to put on window): in the
  // app they are not there.
  assert.doesNotMatch(src, /\b(useStateBSC|bsTHexA|bsSdReduced|BST_SERIF|BST_MONO|useBSPinnedMastTop)\b/);
});

test('the module imports react and the magazine\'s colours only, and never the client module', () => {
  const imports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', './bsMagazine.mjs']);
  assert.doesNotMatch(src, /iosAppBroadsheetClient/);
});

test('the client imports both pieces, declares neither again, and renders them on the profiles', () => {
  const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));
  assert.match(client, /^import \{ BSTPullQuote, BSProfileDock \} from '\.\/BSProfileMagazine\.jsx';/m);
  assert.doesNotMatch(client, /^(?:export )?function (BSTPullQuote|BSProfileDock|useBSHideOnScrollDown)\(/m, 'a piece is declared in the client module again');
  const body = (marker) => { const at = client.indexOf(marker); return client.slice(at, client.indexOf('\nfunction ', at + marker.length)); };
  // The member's profile pulls no quote out at the top any more (owner, 2026-10-24); its
  // answers are pulled out by BSProfileExtras.
  assert.doesNotMatch(body('function BSTerrainProfile('), /<BSTPullQuote /);
  assert.match(body('function BSSignalCoachProfile('), /<BSTPullQuote /);
  assert.match(body('function BSSignalCoachProfile('), /<BSProfileDock /);
  assert.match(body('function BSTerrainProfile('), /<BSProfileDock /);
});
