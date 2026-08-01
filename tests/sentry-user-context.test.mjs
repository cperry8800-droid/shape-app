// Sentry user context must be synced at the ONE cache chokepoint, not per call site.
//
// WHY THIS FILE EXISTS: `bsSetSentryUser` originally lived in `getCurrentSession()`
// alone. That function runs at MOUNT, so signing in without reloading the app left
// the Sentry scope at whatever the anonymous boot had set — every error for the rest
// of that session arrived with no id, no roles, no is_coach, on the single most
// common path there is (open the app, sign in). `updateProfileRoles` had the same
// hole: it changes roles while leaving the uid alone, so even an
// identity-change-gated sync would have missed it.
//
// That failure has no runtime symptom. Sign-in succeeds, the UI updates, avatars
// refresh off the same cache, and errors keep arriving — just anonymised. Nothing
// throws and no test fails, which is why the invariant is asserted statically here.
//
// The fix is structural rather than additive: `setCached()` is the one function every
// identity transition already passes through, so syncing there covers signIn, signUp,
// verifyPhoneOtp, getCurrentSession, updateProfileRoles/Name, claimUsername and
// signOut by construction. Adding a call to each auth path instead would be a list
// that the next auth path silently fails to join.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const LINES = SRC.split('\n');

// Map every line to its enclosing top-level function, so we can assert WHERE a
// call lives rather than merely that it exists somewhere in a 3000-line file.
function enclosingFns(predicate) {
  let fn = '(top)';
  const hits = [];
  for (const line of LINES) {
    const m = line.match(/^\s*(?:async\s+)?function\s+(\w+)|^\s*const\s+(\w+)\s*=\s*async/);
    if (m) fn = m[1] || m[2];
    if (predicate(line)) hits.push(fn);
  }
  return hits;
}

test('bsSetSentryUser is called from exactly one place, and that place is setCached', () => {
  const calls = enclosingFns((l) => /bsSetSentryUser\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  assert.deepEqual(
    calls,
    ['setCached'],
    'Sentry user context must be synced ONLY in setCached(). A second call site means ' +
      'some auth path is being special-cased, which is how the mid-session sign-in hole ' +
      'came back. Route the new path through setCached instead.',
  );
});

test('the sync is unconditional inside setCached — not gated on the identity changing', () => {
  const start = LINES.findIndex((l) => /^function setCached\(/.test(l));
  assert.ok(start >= 0, 'setCached() not found');
  const body = LINES.slice(start, start + 40).join('\n');
  const call = body.match(/^\s*try \{ bsSetSentryUser\((.+?)\); \} catch/m);
  assert.ok(call, 'bsSetSentryUser call not found in the first 40 lines of setCached()');
  assert.equal(
    call[1],
    'state.user ? state.profile : null',
    'Must read the freshly-merged state and pass null when signed out (clearing the ' +
      'previous account tags). A partial update like setCached({ profile }) keeps the ' +
      'same uid while changing roles, so gating this on uid/name change would miss ' +
      'exactly what updateProfileRoles produces.',
  );
  // It must not sit inside the `if (uid !== prevUid || name !== prevName)` branch
  // that exists in this function for the avatar refresh event.
  const gated = /if \(typeof window[\s\S]*?bsSetSentryUser/.test(body);
  assert.equal(gated, false, 'The sync must not be nested inside the identity-changed guard.');
});

test('every authentication + profile transition routes through setCached', () => {
  const callers = new Set(
    enclosingFns((l) => /setCached\(/.test(l) && !/^function setCached/.test(l)),
  );
  for (const fn of [
    'signIn',
    'signUp',
    'verifyPhoneOtp',
    'getCurrentSession',
    'signOut',
    'updateProfileRoles',
  ]) {
    assert.ok(
      callers.has(fn),
      `${fn}() no longer routes through setCached(), so it would leave the Sentry user ` +
        `context stale for the rest of the session. Keep the cache as the single ` +
        `chokepoint rather than adding a bsSetSentryUser call here.`,
    );
  }
});
