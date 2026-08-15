// Sign-out scrub inventory sync — the KEEP-IN-SYNC comment as an enforced gate
// (the store-catalogue-sync pattern). The canonical union inventory lives in
// public/newdesign/localScrub.mjs; the mobile app IMPORTS it (cannot drift),
// but the two website copies — pageShell.jsx's window.shapeClearLocalUserContent
// and supabase.js's clearLocalUserContent fallback twin — are classic scripts
// that cannot import an ES module and carry inline lists. /m/ ships under the
// website's origin, so all three scrub the SAME physical localStorage: a key
// present in one inventory and missing from another is a shared-device privacy
// hole. This test fails on any one-key drift, in either direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHAPE_SCRUB_KEYS,
  SHAPE_SCRUB_PREFIXES,
  SHAPE_SCRUB_SESSION_KEYS,
} from '../public/newdesign/localScrub.mjs';

const UNION = new Set([...SHAPE_SCRUB_KEYS, ...SHAPE_SCRUB_PREFIXES, ...SHAPE_SCRUB_SESSION_KEYS]);

// The website keeps shape.storeCart (device-personal carve-out, documented in
// pageShell.jsx); the mobile sign-out clears it as an extraKey. It is the one
// sanctioned per-surface divergence and must stay OUT of the union.
test('shape.storeCart stays a per-surface extra, never in the union', () => {
  assert.ok(!UNION.has('shape.storeCart'));
});

// Extract every quoted key-like string from a function's source slice.
// Charset is deliberately tight (no spaces) so apostrophes inside comment
// prose can never produce a phantom match.
function extractKeys(src, startMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  // The slice runs through the sessionStorage removeItem line, which both
  // copies close with. Anchoring on the CALL (not the key name) matters:
  // both files also mention the session keys in comment prose ABOVE the
  // array, and anchoring there would truncate the slice before the real keys.
  const endIdx = src.indexOf('sessionStorage.removeItem', start);
  assert.ok(endIdx > start, 'sessionStorage block not found after marker');
  const slice = src.slice(start, endIdx);
  const found = new Set();
  for (const m of slice.matchAll(/["']([A-Za-z0-9._-]+)["']/g)) {
    const s = m[1];
    if (/^(shape|bs_|trainer|nutritionist)/i.test(s)) found.add(s);
  }
  return found;
}

function assertMatchesUnion(label, found) {
  const missing = [...UNION].filter((k) => !found.has(k));
  const extra = [...found].filter((k) => !UNION.has(k));
  assert.deepEqual(missing, [], `${label} is MISSING union keys: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `${label} carries keys the canonical union lacks: ${extra.join(', ')}`);
}

test('pageShell.jsx shapeClearLocalUserContent matches the canonical union', () => {
  const src = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  assertMatchesUnion('pageShell.jsx', extractKeys(src, 'window.shapeClearLocalUserContent = function'));
});

test('supabase.js clearLocalUserContent fallback twin matches the canonical union', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  assertMatchesUnion('supabase.js', extractKeys(src, 'clearLocalUserContent() {'));
});

test('mobile handleLogout imports the canonical scrub (no inline inventory)', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/services\/localScrub\.mjs'/);
  assert.match(src, /shapeScrubLocalUserContent\(\{ extraKeys: \['shape\.storeCart'\] \}\)/);
  // The old inline list must be gone — one representative key from each family:
  assert.ok(!src.includes("'shape.clientCoachThreads'"), 'inline mobile inventory resurfaced in Main');
});

test('the shim re-exports the canonical module', () => {
  const src = readFileSync(new URL('../mobile-app/src/services/localScrub.mjs', import.meta.url), 'utf8');
  assert.match(src, /export \* from '\.\.\/\.\.\/\.\.\/public\/newdesign\/localScrub\.mjs'/);
});
