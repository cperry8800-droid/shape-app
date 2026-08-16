// Guards for src/lib/supabase/auth-cookies.mjs — the module that makes a
// sign-out route's 200 mean "this browser no longer holds a session cookie".
//
// Four client surfaces gate their cross-tab sign-out broadcast on that 200
// (pageShell.jsx, index.html, SignOutButton.tsx, mobile shapeBackend.js), and
// a premature broadcast manufactures a signed-in sibling tab that nothing
// corrects — so these vectors are about the response being HONEST, not tidy.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSupabaseAuthCookie,
  clearSupabaseAuthCookies,
} from '../src/lib/supabase/auth-cookies.mjs';

// A stand-in for Next's cookies() store: records what was written so the
// vectors can assert on the delete semantics, not just the return value.
function fakeStore(names) {
  const jar = names.map((name) => ({ name, value: 'v' }));
  const writes = [];
  return {
    getAll: () => jar.slice(),
    set: (name, value, options) => writes.push({ name, value, options }),
    writes,
  };
}

test('isSupabaseAuthCookie: matches the session cookie and every chunk of it', () => {
  assert.equal(isSupabaseAuthCookie('sb-zznufekgjngecelwxndw-auth-token'), true);
  // Chunked once the session outgrows a single cookie — missing these leaves a
  // partial session behind, which is worse than leaving none.
  assert.equal(isSupabaseAuthCookie('sb-zznufekgjngecelwxndw-auth-token.0'), true);
  assert.equal(isSupabaseAuthCookie('sb-zznufekgjngecelwxndw-auth-token.11'), true);
  // Written during a PKCE exchange; it is auth state and goes with the rest.
  assert.equal(isSupabaseAuthCookie('sb-zznufekgjngecelwxndw-auth-token-code-verifier'), true);
});

test('isSupabaseAuthCookie: does not match anything else on this origin', () => {
  // The website's own localStorage key name — never a cookie we should touch.
  assert.equal(isSupabaseAuthCookie('shape.auth'), false);
  assert.equal(isSupabaseAuthCookie('sb-zznufekgjngecelwxndw-other'), false);
  assert.equal(isSupabaseAuthCookie('auth-token'), false);
  // Anchored at the START: a cookie merely ending in the pattern is not ours.
  assert.equal(isSupabaseAuthCookie('evil-sb-x-auth-token'), false);
  // Anchored at the END: a suffixed lookalike is not ours either.
  assert.equal(isSupabaseAuthCookie('sb-x-auth-token-extra'), false);
  assert.equal(isSupabaseAuthCookie(''), false);
  assert.equal(isSupabaseAuthCookie(undefined), false);
  assert.equal(isSupabaseAuthCookie(null), false);
});

test('clearSupabaseAuthCookies: expires every auth cookie and leaves the rest alone', () => {
  const store = fakeStore([
    'sb-proj-auth-token.0',
    'sb-proj-auth-token.1',
    'shape.storeCart',
    'other',
  ]);

  const cleared = clearSupabaseAuthCookies(store);

  assert.deepEqual(cleared, ['sb-proj-auth-token.0', 'sb-proj-auth-token.1']);
  assert.equal(store.writes.length, 2, 'must not write to non-auth cookies');
  assert.deepEqual(
    store.writes.map((w) => w.name),
    ['sb-proj-auth-token.0', 'sb-proj-auth-token.1']
  );
});

test('clearSupabaseAuthCookies: writes a real DELETE, not an empty cookie', () => {
  const store = fakeStore(['sb-proj-auth-token']);
  clearSupabaseAuthCookies(store);

  const [write] = store.writes;
  assert.equal(write.value, '');
  // maxAge 0 is the delete signal; applyShapeCookieOptions carves it out so the
  // 30-day session policy cannot resurrect the cookie being removed.
  assert.equal(write.options.maxAge, 0, 'maxAge 0 is what actually deletes it');
  // A cookie is matched for deletion by NAME + PATH + DOMAIN. @supabase/ssr
  // writes at the default path '/', so expiring at any other path silently
  // leaves the original in place.
  assert.equal(write.options.path, '/', 'path must match the path it was set at');
});

test('clearSupabaseAuthCookies: a request with no auth cookies is a clean no-op', () => {
  const store = fakeStore(['shape.storeCart']);
  assert.deepEqual(clearSupabaseAuthCookies(store), []);
  assert.equal(store.writes.length, 0);
});
