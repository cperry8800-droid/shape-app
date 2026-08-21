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
  assertMatchesUnion('supabase.js', extractKeys(src, 'clearLocalUserContent(opts) {'));
});

test('mobile handleLogout imports the canonical scrub (no inline inventory)', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/services\/localScrub\.mjs'/);
  // extraKeys unchanged; the broadcast is now gated on the cookie outcome.
  assert.match(src, /shapeScrubLocalUserContent\(\{\s*extraKeys: \['shape\.storeCart'\],/);
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

test('supabase.js signOut scrubs synchronously FIRST, then bound-awaits the purge', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  const start = src.indexOf('async signOut()');
  assert.ok(start >= 0);
  // Slice ends at the twin's METHOD DEFINITION (a code anchor — prose above
  // it mentions the name, but only the definition carries "() {").
  const slice = src.slice(start, src.indexOf('clearLocalUserContent() {', start));
  // The synchronous scrub must run unconditionally (never gated behind an
  // async CacheStorage call)…
  const scrubIdx = slice.indexOf('purge = shapeDb.clearLocalUserContent({ broadcast: cookieCleared })');
  assert.ok(scrubIdx >= 0, 'signOut() must call the scrub and keep its purge promise');
  // …and the purge it returns is awaited AFTER it, under a timeout bound so a
  // stalled CacheStorage can never hang the sign-out.
  const raceIdx = slice.indexOf('await Promise.race(');
  assert.ok(raceIdx > scrubIdx, 'signOut() must bound-await the purge AFTER the scrub');
  assert.match(slice.slice(raceIdx), /setTimeout\(\w+, 2000\)/);
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
  // …and the no-supabase branch (About/Pricing never load supabase.js) must await
  // it, bounded, before window.location.href.
  //
  // ⚠ ANCHORED ON shapePortalSignOutStandalone, NOT handleLogout. The sign-out
  // ordering used to be duplicated in both; it is now written once here and
  // handleLogout delegates, so this is where the property lives. The duplication
  // is separately forbidden by the single-owner assertion below — without that,
  // re-introducing a second copy would leave this test passing on the first one.
  const start = src.indexOf('async function shapePortalSignOutStandalone');
  assert.ok(start >= 0, 'shapePortalSignOutStandalone not found');
  const slice = src.slice(start, src.indexOf("window.location.href = '/'", start));
  assert.match(slice, /await Promise\.race\(\[\s*Promise\.resolve\(window\.shapeClearLocalUserContent\(\{ broadcast: cookieCleared \}\)\)/);

  // ⚠ ONE OWNER. This ordering was tuned across a whole review wave and was for a
  // time COPIED into handleLogout — two independent copies of a sequence whose
  // comments describe it as fragile, so a later fix to one would silently miss the
  // other. The cookie POST is the sequence's first step, so counting it counts the
  // copies.
  const copies = src.split("fetch('/api/auth/signout'").length - 1;
  assert.equal(copies, 1,
    'the sign-out ordering must exist once; a second copy is how the fixed bug returns');
});

test('index.html sign-out routes the scrub promise into go(), bounded', () => {
  const src = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
  assert.match(src, /else if\(window\.shapeClearLocalUserContent\)p=Promise\.race\(\[Promise\.resolve\(window\.shapeClearLocalUserContent\(\{broadcast:cookieCleared\}\)\),new Promise\(function\(r\)\{setTimeout\(r,2000\);\}\)\]\);/);
});

test('supabase.js twin returns the purge promise on both branches', () => {
  const src = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  // The delegation forwards its options object — the cross-tab listener calls
  // this twin with { broadcast: false }, and swallowing that argument here
  // would let a listening legacy tab echo the stamp back into a scrub loop.
  assert.match(src, /\{ return window\.shapeClearLocalUserContent\(opts\); \}/);
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
  // broadcast:false — the stamp is deferred until after session invalidation
  // (see the ordering test below); the scrub itself still runs first.
  assert.match(btn, /shapeScrubLocalUserContent\(\{ broadcast: false \}\)/);
  assert.match(btn, /shapePurgeShapeCaches\(\)/);
  assert.match(btn, /await logout\(\)/);
  for (const f of ['../src/app/dashboard/layout.tsx', '../src/components/Nav.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /<SignOutButton/, `${f} must render SignOutButton`);
    assert.ok(!/<form action=\{logout\}>/.test(src), `${f} still has the bare server-action form`);
  }
});

// ── CROSS-TAB SIGN-OUT ───────────────────────────────────────────────────────
// The scrub used to be TAB-LOCAL: sessionStorage is per tab and in-memory state
// is per document, so a sign-out in one tab left a sibling holding an already
// signed-out member's live-workout record and whole app state until someone
// closed it — on a shared device, the inheritance the scrub exists to stop.
// Every sign-out path must STAMP, and every surface must LISTEN.

test('canonical scrub stamps the cross-tab signal, last and with a nonce', () => {
  const src = readFileSync(new URL('../public/newdesign/localScrub.mjs', import.meta.url), 'utf8');
  assert.match(src, /export const SHAPE_SIGNOUT_STAMP_KEY = 'shape\.signedOutAt'/);
  const fn = src.indexOf('export function shapeScrubLocalUserContent');
  assert.ok(fn > 0);
  const slice = src.slice(fn);
  const stampIdx = slice.indexOf('shapeBroadcastSignOut()');
  const sessionIdx = slice.indexOf('SHAPE_SCRUB_SESSION_KEYS.forEach');
  assert.ok(stampIdx > sessionIdx, 'the stamp must be written AFTER the sweeps that could remove it');
  // `storage` fires only on a CHANGED value — a bare Date.now() would be
  // silent for two sign-outs inside the same millisecond. The nonce lives in
  // the shared broadcaster, which the Next path also calls directly.
  const bcast = src.indexOf('export function shapeBroadcastSignOut');
  assert.ok(bcast > 0, 'no shared broadcaster');
  assert.match(src.slice(bcast, bcast + 500), /Math\.random\(\)/);
  // The broadcast must be suppressible, or a listening tab echoes the event
  // back to the tab that signed out and they scrub each other in a loop.
  assert.match(slice, /broadcast = true/);
  assert.match(slice, /if \(broadcast\)/);
});

test('every inline scrub copy stamps the cross-tab signal, suppressibly', () => {
  for (const [label, file] of [
    ['pageShell.jsx', '../public/newdesign/pageShell.jsx'],
    ['supabase.js', '../public/supabase.js'],
  ]) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(src.includes('shape.signedOutAt'), `${label}: no cross-tab stamp`);
    assert.match(src, /broadcast === false/, `${label}: stamp is not suppressible`);
    assert.match(src, /Math\.random\(\)/, `${label}: stamp has no nonce`);
  }
});

test('every surface installs the cross-tab listener, and never re-broadcasts', () => {
  for (const [label, file, marker] of [
    ['pageShell.jsx', '../public/newdesign/pageShell.jsx', 'shapeSignOutListener'],
    ['supabase.js', '../public/supabase.js', 'shapeSignOutListenerLegacy'],
    // Anchor on the CALL, not the name: both files import the helper first,
    // and the import line would truncate the slice before the handler body.
    // Mobile's handler is async (it awaits a local signOut first), so the
    // marker carries `async` — anchoring on the CALL either way, never the
    // import line above it.
    ['iosAppBroadsheetMain.jsx', '../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', 'shapeInstallSignOutListener(async () =>'],
    ['SignOutButton.tsx', '../src/components/SignOutButton.tsx', 'shapeInstallSignOutListener(() =>'],
  ]) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const at = src.indexOf(marker);
    assert.ok(at > 0, `${label}: no sign-out listener installed`);
    const slice = src.slice(at, at + 3600);
    assert.match(slice, /broadcast: false/, `${label}: listener re-broadcasts — echo loop`);
    assert.match(slice, /location\.reload\(\)/, `${label}: listener does not retire in-memory state`);
  }
});

test('the two classic-script listeners share one install guard', () => {
  // A legacy page can load supabase.js AND pageShell.jsx; without the shared
  // flag it would scrub and reload twice on one sign-out.
  for (const file of ['../public/newdesign/pageShell.jsx', '../public/supabase.js']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /__shapeSignOutListener/, `${file} must guard the install`);
  }
});

// ── BEHAVIOUR, not source-shape ──────────────────────────────────────────────
// The greps above pin that each surface WIRES the listener; these drive the
// canonical implementation itself. Worth doing directly: the mount harness
// covers the draft editor, not BSAppShell, so nothing else exercises the
// handler's filtering, and a listener that fires on the wrong event would
// reload tabs at random.
function withWindow(run) {
  const store = new Map();
  const listeners = [];
  const prev = globalThis.window;
  globalThis.window = {
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex(([t, f]) => t === type && f === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
    sessionStorage: { removeItem: (k) => store.delete('session:' + k) },
  };
  try { return run({ store, listeners }); } finally { globalThis.window = prev; }
}

test('the sign-out listener fires only on the stamp key, and unsubscribes', async () => {
  const { shapeInstallSignOutListener, SHAPE_SIGNOUT_STAMP_KEY } =
    await import('../public/newdesign/localScrub.mjs');
  withWindow(({ listeners }) => {
    let fired = 0;
    const off = shapeInstallSignOutListener(() => { fired++; });
    assert.equal(typeof off, 'function', 'must return an unsubscribe (it is a React effect cleanup)');
    const emit = (e) => listeners.forEach(([t, fn]) => { if (t === 'storage') fn(e); });

    emit({ key: 'shape.library', newValue: 'x' });      // another key
    emit({ key: SHAPE_SIGNOUT_STAMP_KEY, newValue: null }); // the key being REMOVED
    emit({});                                            // malformed
    assert.equal(fired, 0, 'listener fired on an unrelated or empty storage event');

    emit({ key: SHAPE_SIGNOUT_STAMP_KEY, newValue: '1:abc' });
    assert.equal(fired, 1);

    off();
    emit({ key: SHAPE_SIGNOUT_STAMP_KEY, newValue: '2:def' });
    assert.equal(fired, 1, 'unsubscribe did not detach the handler');
  });
});

test('a throwing handler cannot break the tab that received the event', async () => {
  const { shapeInstallSignOutListener, SHAPE_SIGNOUT_STAMP_KEY } =
    await import('../public/newdesign/localScrub.mjs');
  withWindow(({ listeners }) => {
    shapeInstallSignOutListener(() => { throw new Error('boom'); });
    listeners.forEach(([t, fn]) => {
      if (t === 'storage') assert.doesNotThrow(() => fn({ key: SHAPE_SIGNOUT_STAMP_KEY, newValue: '1:a' }));
    });
  });
});

test('the scrub stamps by default, stays silent with broadcast:false, and never repeats a value', async () => {
  const { shapeScrubLocalUserContent, SHAPE_SIGNOUT_STAMP_KEY } =
    await import('../public/newdesign/localScrub.mjs');
  withWindow(({ store }) => {
    shapeScrubLocalUserContent();
    const first = store.get(SHAPE_SIGNOUT_STAMP_KEY);
    assert.ok(first, 'a real sign-out must broadcast');
    shapeScrubLocalUserContent();
    assert.notEqual(store.get(SHAPE_SIGNOUT_STAMP_KEY), first,
      'two sign-outs must not write the same value — `storage` fires only on a CHANGE');

    store.delete(SHAPE_SIGNOUT_STAMP_KEY);
    shapeScrubLocalUserContent({ broadcast: false });
    assert.equal(store.get(SHAPE_SIGNOUT_STAMP_KEY), undefined,
      'the listener path must not re-broadcast — that is the echo loop');
  });
});

test('the scrub still clears content when it stamps, and keeps the durability queues', async () => {
  const { shapeScrubLocalUserContent } = await import('../public/newdesign/localScrub.mjs');
  withWindow(({ store }) => {
    store.set('shape.messages', 'private');
    store.set('shape.chat.v2.abc', 'thread');
    store.set('shape.careerAwardPending', '{"uid":"a","postId":"p"}');
    store.set('shapeRecipes_v1', 'mine');
    shapeScrubLocalUserContent();
    assert.equal(store.get('shape.messages'), undefined, 'listed key survived');
    assert.equal(store.get('shape.chat.v2.abc'), undefined, 'prefixed family survived');
    assert.equal(store.get('shape.careerAwardPending'), '{"uid":"a","postId":"p"}', 'durability queue was wiped');
    assert.equal(store.get('shapeRecipes_v1'), 'mine', 'device-personal carve-out was wiped');
  });
});

// ⚠ ORDERING: the broadcast must come AFTER the server session is invalidated.
// A sibling reacts by RELOADING, and a reload re-renders against whatever the
// server still believes. Stamped too early, a sibling dashboard tab reloads
// while its cookie is still valid, comes back signed IN, and no second event
// ever corrects it — the departed member left on screen.
test('the Next dashboard invalidates the session BEFORE it broadcasts', () => {
  const src = readFileSync(new URL('../src/components/SignOutButton.tsx', import.meta.url), 'utf8');
  const start = src.indexOf('const onClick');
  assert.ok(start > 0);
  const slice = src.slice(start);
  // The local scrub still runs first (at-rest content must never wait on the
  // network) — but silently.
  assert.match(slice, /shapeScrubLocalUserContent\(\{ broadcast: false \}\)/,
    'the click handler must not broadcast before the session is cleared');
  const deleteIdx = slice.indexOf("fetch('/api/auth/session', { method: 'DELETE'");
  const stampIdx = slice.indexOf('shapeBroadcastSignOut()');
  const logoutIdx = slice.indexOf('await logout()');
  assert.ok(deleteIdx > 0, 'no cookie-session invalidation before the broadcast');
  assert.ok(stampIdx > deleteIdx, 'the broadcast must follow session invalidation');
  assert.ok(logoutIdx > stampIdx, 'the server action still runs last');
  // A hanging invalidation must never strand the sign-out.
  assert.match(slice.slice(deleteIdx - 300, stampIdx), /Promise\.race\(/);
  // ⚠ …but the BOUND must not become a second way to broadcast early. On the
  // timeout path the cookie may still be valid, and a sibling that reloads
  // into an authenticated route is never retired (logout()'s redirect only
  // affects this tab). A missed broadcast is the pre-feature status quo; a
  // premature one manufactures a signed-in tab nothing corrects.
  assert.match(slice, /invalidated = Boolean\(res && res\.ok\)/,
    'the broadcast is not gated on a CONFIRMED invalidation');
  assert.match(slice, /if \(invalidated\) shapeBroadcastSignOut\(\)/,
    'the timeout path can still broadcast');
});

test('the surfaces that clear the session first still broadcast through the scrub', () => {
  // supabase.js: cookie DELETE, THEN the scrub (which stamps).
  const sb = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  const start = sb.indexOf('async signOut()');
  const slice = sb.slice(start, sb.indexOf('clearLocalUserContent(opts) {', start));
  const del = slice.indexOf("'/api/auth/session', { method: 'DELETE'");
  const scrub = slice.indexOf('purge = shapeDb.clearLocalUserContent({ broadcast: cookieCleared })');
  assert.ok(del > 0 && scrub > del, 'supabase.js must clear the cookie before the scrub broadcasts');

  // mobile: ShapeAuth.signOut(), THEN the scrub.
  const m = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
  const at = m.indexOf('const handleLogout = async');
  const ms = m.slice(at, m.indexOf('window.location.reload()', at));
  const auth = ms.indexOf('ShapeAuth?.signOut?.()');
  const mscrub = ms.indexOf('shapeScrubLocalUserContent(');
  assert.ok(auth > 0 && mscrub > auth, 'mobile must sign out before the scrub broadcasts');
});

// ⚠ A RECEIVING TAB MUST RETIRE ITS OWN SDK SESSION. The scrub deliberately
// leaves the Supabase token (`shape.auth`) alone, because the sign-out paths
// used to call auth.signOut() themselves — but the Next dashboard's does NOT
// (it clears the cookie and redirects). So a sign-out started there leaves the
// localStorage token intact, and a sibling that only scrubbed and reloaded
// would restore that session and come back signed IN.
test('every receiving surface signs out locally before it reloads', () => {
  for (const [label, file, marker] of [
    ['pageShell.jsx', '../public/newdesign/pageShell.jsx', 'shapeSignOutListener'],
    ['supabase.js', '../public/supabase.js', 'shapeSignOutListenerLegacy'],
    ['iosAppBroadsheetMain.jsx', '../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', 'shapeInstallSignOutListener(async'],
  ]) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const at = src.indexOf(marker);
    assert.ok(at > 0, `${label}: listener not found`);
    // Generous window: these handlers carry long WHY comments before the call.
    const slice = src.slice(at, at + 3200);
    const outIdx = slice.indexOf("signOut({ scope: 'local' })") >= 0
      ? slice.indexOf("signOut({ scope: 'local' })")
      : slice.indexOf('signOut({ scope: "local" })');
    assert.ok(outIdx > 0, `${label}: receiving tab never retires its own session`);
    assert.match(slice, /location\.reload\(\)/, `${label}: listener does not reload`);
    // scope:'local' matters: a network-scoped sign-out could hang this tab.
    assert.ok(!/[^.]\bsignOut\(\)\s*;/.test(slice),
      `${label}: uses a network-scoped signOut in the listener`);
  }
});

test('the scrub still leaves the auth token to the SDK, not the key list', async () => {
  // If the scrub ever started clearing `shape.auth` itself, the listener's
  // local signOut would be papering over a different mechanism — and the
  // SDK's own in-memory session would still be live. Keep the split explicit.
  const { SHAPE_SCRUB_KEYS } = await import('../public/newdesign/localScrub.mjs');
  assert.ok(!SHAPE_SCRUB_KEYS.includes('shape.auth'));
});

// ⚠ A pageShell-only page (About, Pricing, …) renders Header WITHOUT
// supabase.js, so `window.shapeDb` is absent. An SDK-only branch would do
// nothing there and leave the persisted token standing for the next person.
test('a receiving tab with no SDK still drops the persisted token', () => {
  const src = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const at = src.indexOf('shapeSignOutListener');
  const slice = src.slice(at, at + 3600);
  // The SDK-less branch falls through to finish(), which drops BOTH persisted
  // tokens — the removal moved there so the SDK branch gets it too.
  assert.match(slice, /\} else \{\s+finish\(\);/,
    'the SDK-less branch does not reach the token drop');
  // finish() reaches the tokens through the scrub (the chokepoint), so it no
  // longer carries its own drop — assert it calls the scrub at all.
  assert.match(slice, /var finish = function \(\) \{[\s\S]{0,400}?shapeClearLocalUserContent\(\{ broadcast: false \}\)/,
    'finish() never reaches the scrub that drops the tokens');
  // And when the SDK IS present, the reload must not beat the local sign-out.
  const signOutIdx = slice.indexOf('auth.signOut({ scope: "local" })');
  assert.ok(signOutIdx > 0, 'no local sign-out on the SDK branch');
  assert.match(slice.slice(signOutIdx), /\.then\(finish\)/,
    'the SDK branch does not await its sign-out before scrub + reload');
});

// ⚠ EVERY initiator gates its broadcast on the cookie actually being gone —
// not just the Next dashboard. A sibling reacts by RELOADING, so a stamp sent
// while the cookie is still valid returns a Next tab to an authenticated route
// with no later event to retire it.
test('every initiator gates its broadcast on a confirmed cookie deletion', () => {
  const sb = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  const start = sb.indexOf('async signOut()');
  const slice = sb.slice(start, sb.indexOf('clearLocalUserContent(opts) {', start));
  assert.match(slice, /cookieCleared = Boolean\(delRes && delRes\.ok\)/,
    'supabase.js ignores the DELETE result');
  assert.match(slice, /clearLocalUserContent\(\{ broadcast: cookieCleared \}\)/,
    'supabase.js broadcasts regardless of the cookie');

  const be = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(be, /cookieCleared = Boolean\(res && res\.ok\)/,
    'mobile signOut ignores the DELETE result');
  assert.match(be, /return \{ cookieCleared \}/,
    'mobile signOut does not report the cookie outcome to its caller');

  const main = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx', import.meta.url), 'utf8');
  assert.match(main, /const cookieCleared = Boolean\(signedOut && signedOut\.cookieCleared\)/,
    'mobile handleLogout drops the cookie outcome');
  assert.match(main, /broadcast: cookieCleared/,
    'mobile handleLogout broadcasts regardless of the cookie');
});

// ⚠ THIS ORIGIN HOSTS TWO SUPABASE CLIENTS WITH DIFFERENT PERSISTED KEYS:
// supabase.js pins storageKey 'shape.auth'; mobile's client sets none, so
// auth-js defaults to `sb-<projectRef>-auth-token`. /m/ ships under the
// website's origin, so both live in ONE localStorage — and retiring only the
// client a document happens to load leaves the other token standing, so
// reopening that surface restores the departed member.
test('the canonical drop clears the persisted token of BOTH clients', async () => {
  const { shapeDropPersistedAuth } = await import('../public/newdesign/localScrub.mjs');
  withWindow(({ store }) => {
    store.set('shape.auth', 'website-session');
    store.set('sb-zznufekgjngecelwxndw-auth-token', 'mobile-session');
    store.set('shape.library', 'content');          // not an auth token
    store.set('sb-something-else', 'not a token');  // wrong suffix
    shapeDropPersistedAuth();
    assert.equal(store.get('shape.auth'), undefined, "the website client's token survived");
    assert.equal(store.get('sb-zznufekgjngecelwxndw-auth-token'), undefined, "the mobile client's token survived");
    assert.equal(store.get('shape.library'), 'content', 'the drop is not scoped to auth tokens');
    assert.equal(store.get('sb-something-else'), 'not a token', 'the drop matched a non-token sb- key');
  });
});

// ⚠ AT THE CHOKEPOINT, not per surface. Hanging the drop on individual
// surfaces cost three rounds: the receiving listeners had it while the
// INITIATING paths did not, and a `storage` event never fires in the tab that
// wrote it — so a member signing out with no sibling tab open kept the other
// client's token. Every sign-out path already calls the scrub.
test('the scrub itself drops both persisted tokens, in all three copies', () => {
  const canonical = readFileSync(new URL('../public/newdesign/localScrub.mjs', import.meta.url), 'utf8');
  const fn = canonical.indexOf('export function shapeScrubLocalUserContent');
  assert.ok(fn > 0);
  assert.match(canonical.slice(fn), /shapeDropPersistedAuth\(\);/,
    'the canonical scrub does not drop the persisted tokens');

  for (const [label, file] of [
    ['pageShell.jsx', '../public/newdesign/pageShell.jsx'],
    ['supabase.js', '../public/supabase.js'],
  ]) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const at = src.indexOf(label === 'pageShell.jsx'
      ? 'window.shapeClearLocalUserContent = function'
      : 'clearLocalUserContent(opts) {');
    assert.ok(at > 0, `${label}: scrub not found`);
    const slice = src.slice(at, at + 9000);
    assert.match(slice, /indexOf\(["']sb-["']\) === 0 && ak\.indexOf\(["']-auth-token["']\) > 0/,
      `${label}: the scrub does not drop the OTHER client's token`);
    assert.match(slice, /removeItem\(["']shape\.auth["']\)/,
      `${label}: the scrub does not drop the website client's token`);
  }
});

// The initiating paths are the ones the per-surface placement missed.
test('the initiating sign-out paths reach the token drop', () => {
  const sb = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  const start = sb.indexOf('async signOut()');
  const slice = sb.slice(start, sb.indexOf('clearLocalUserContent(opts) {', start));
  assert.match(slice, /clearLocalUserContent\(\{ broadcast: cookieCleared \}\)/,
    'supabase.js signOut() no longer reaches the scrub that drops the tokens');

  const ps = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  assert.match(ps, /shapeClearLocalUserContent\(\{ broadcast: cookieCleared \}\)/,
    'the pageShell SDK-less fallback no longer reaches the scrub');
});

// ⚠ One confirmed invalidation is enough. shapeDb.signOut() issues a SECOND
// DELETE and gates its own broadcast on that; if the first POST succeeded but
// connectivity dropped before the redundant one landed, the stamp would be
// suppressed despite confirmation already in hand.
// index.html carries its OWN sign-out handler, independent of pageShell's.
test('index.html carries its confirmed invalidation into the SDK path too', () => {
  const idx = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
  assert.match(idx, /shapeDb\.signOut\(\)\)\.then\(function\(\)\{if\(cookieCleared&&window\.shapeBroadcastSignOut\)window\.shapeBroadcastSignOut\(\)/,
    'the index.html SDK branch discards a confirmation it already has');
});

test('pageShell carries its confirmed invalidation into the SDK path', () => {
  const ps = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  assert.match(ps, /window\.shapeBroadcastSignOut = function/,
    'no standalone broadcaster for a caller that confirmed invalidation itself');
  const at = ps.indexOf('await window.shapeDb.signOut()');
  assert.ok(at > 0, 'pageShell SDK branch not found');
  assert.match(ps.slice(at, at + 900), /if \(cookieCleared && window\.shapeBroadcastSignOut\) window\.shapeBroadcastSignOut\(\)/,
    'the SDK branch discards a confirmation it already has');
});

// The Next dashboard is the ORIGIN of that hole: its sign-out is a server
// action over the cookie session, so it loads no SDK and nothing ever called
// auth.signOut() — both tokens survived it.
test('the Next dashboard sign-out drops the persisted tokens itself', () => {
  // It loads no Supabase client, so nothing here ever calls auth.signOut() —
  // it must not depend on a sibling tab to clear the tokens for it. It reaches
  // them through the scrub (chokepoint) and belt-and-braces directly.
  const src = readFileSync(new URL('../src/components/SignOutButton.tsx', import.meta.url), 'utf8');
  const at = src.indexOf('const onClick');
  const slice = src.slice(at);
  assert.match(slice, /shapeScrubLocalUserContent\(\{ broadcast: false \}\)|shapeDropPersistedAuth\(\)/,
    'the originating path relies on receiving tabs to clean up after it');
});

// The last two initiators that still stamped unconditionally.
test('the pageShell and index.html fallbacks gate their broadcast too', () => {
  const ps = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const at = ps.indexOf("fetch('/api/auth/signout'");
  assert.ok(at > 0, 'pageShell handleLogout not found');
  const slice = ps.slice(at - 400, at + 3000);
  assert.match(slice, /cookieCleared = Boolean\(outRes && outRes\.ok\)/,
    'pageShell ignores the signout result');
  assert.match(slice, /shapeClearLocalUserContent\(\{ broadcast: cookieCleared \}\)/,
    'pageShell fallback broadcasts unconditionally');

  const idx = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
  assert.match(idx, /cookieCleared=Boolean\(res&&res\.ok\)/,
    'index.html ignores the signout result');
  assert.match(idx, /shapeClearLocalUserContent\(\{broadcast:cookieCleared\}\)/,
    'index.html fallback broadcasts unconditionally');
});
