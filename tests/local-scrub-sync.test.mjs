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

// ── PWA cache purge (P2b) — every sign-out path drops the 'shape-' caches ──
// A cache built by an older service-worker generation can hold cross-origin
// signed media, so the purge must ride every scrub/sign-out site: the
// canonical scrub (fire-and-forget), the pageShell classic-script copy,
// supabase.js signOut (awaited before navigation), and the Next.js
// dashboard's client SignOutButton (the server-action path runs no browser
// code, so the button is the only place a purge can happen).
function assertPurge(label, src, marker) {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${label}: marker not found`);
  const slice = src.slice(start, start + 4000);
  assert.ok(/caches\s*\.\s*keys\s*\(\)|shapePurgeShapeCaches\(\)/.test(slice), `${label}: no cache purge near ${marker}`);
  assert.ok(slice.includes("'shape-'") || slice.includes('"shape-"') || slice.includes('shapePurgeShapeCaches()'), `${label}: purge not scoped to shape- caches`);
}

test('canonical scrub fires the cache purge', () => {
  const src = readFileSync(new URL('../public/newdesign/localScrub.mjs', import.meta.url), 'utf8');
  assert.match(src, /export function shapePurgeShapeCaches/);
  assertPurge('localScrub.mjs', src, 'export function shapeScrubLocalUserContent');
});

test('pageShell copy fires the cache purge', () => {
  const src = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  assertPurge('pageShell.jsx', src, 'shapeLiveWorkoutResult"].forEach');
});

test('supabase.js signOut awaits the cache purge before navigation', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  const start = src.indexOf('async signOut()');
  assert.ok(start >= 0);
  // Anchor on the METHOD DEFINITION — signOut's own comment block mentions
  // "getSession()" in prose, and anchoring there truncates before the purge.
  const slice = src.slice(start, src.indexOf('async getSession()', start));
  assert.ok(/await caches\.keys\(\)/.test(slice), 'signOut() must AWAIT the purge');
  assert.ok(slice.includes("'shape-'"), 'signOut() purge not scoped to shape- caches');
});

// ── purge survives the navigation ── a scrub site whose very next act is a
// navigation/reload discards the document before a fire-and-forget purge can
// dispatch its caches.delete calls. So the scrub RETURNS the purge promise
// and every navigating caller awaits it under a bound (sign-out always
// completes — a stalled CacheStorage must never hang it).
test('canonical scrub RETURNS the purge promise', () => {
  const src = readFileSync(new URL('../public/newdesign/localScrub.mjs', import.meta.url), 'utf8');
  assert.match(src, /return shapePurgeShapeCaches\(\);/);
});

test('pageShell fallback logout awaits the purge before navigating', () => {
  const src = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  // The inline copy must RETURN the delete promise (Promise.all over deletes)…
  assert.match(src, /return caches\.keys\(\)\.then\(function \(keys\) \{\s*return Promise\.all\(/);
  // …and handleLogout's no-supabase branch (About/Pricing never load
  // supabase.js) must await it, bounded, before window.location.href.
  const start = src.indexOf('async function handleLogout');
  assert.ok(start >= 0, 'handleLogout not found');
  const slice = src.slice(start, src.indexOf("window.location.href = '/'", start));
  assert.match(slice, /await Promise\.race\(\[\s*Promise\.resolve\(window\.shapeClearLocalUserContent\(\)\)/);
});

test('index.html sign-out routes the scrub promise into go()', () => {
  const src = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
  assert.match(src, /else if\(window\.shapeClearLocalUserContent\)p=window\.shapeClearLocalUserContent\(\);/);
});

test('supabase.js twin returns the purge promise on both branches', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  assert.match(src, /\{ return window\.shapeClearLocalUserContent\(\); \}/);
  assert.match(src, /return caches\.keys\(\)\.then\(function \(cacheKeys\) \{\s*return Promise\.all\(/);
});

test('mobile handleLogout awaits the scrub purge before the reload', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
  const start = src.indexOf('const handleLogout = async');
  assert.ok(start >= 0, 'handleLogout not found');
  const reloadIdx = src.indexOf('window.location.reload()', start);
  assert.ok(reloadIdx > start, 'reload not found after handleLogout');
  const slice = src.slice(start, reloadIdx);
  assert.match(slice, /const scrubPurge = shapeScrubLocalUserContent\(/);
  assert.match(slice, /await Promise\.race\(\[scrubPurge,/);
});

test('the Next.js dashboard sign-out runs the scrub + purge client-side', () => {
  const btn = readFileSync(new URL('../src/components/SignOutButton.tsx', import.meta.url), 'utf8');
  assert.match(btn, /from '\.\.\/\.\.\/public\/newdesign\/localScrub\.mjs'/);
  assert.match(btn, /shapeScrubLocalUserContent\(\)/);
  assert.match(btn, /shapePurgeShapeCaches\(\)/);
  assert.match(btn, /await logout\(\)/);
  for (const f of ['../src/app/dashboard/layout.tsx', '../src/components/Nav.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /<SignOutButton/, `${f} must render SignOutButton`);
    assert.ok(!/<form action=\{logout\}>/.test(src), `${f} still has the bare server-action form`);
  }
});
