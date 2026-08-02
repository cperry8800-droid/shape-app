// tests/sentry-context.test.mjs
// Pure Sentry tagging rules: what a user context may and may not carry.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSentryUser, bsSentryRelease, BS_SENTRY_DENIED_KEYS } from '../src/lib/sentry-context.mjs';

test('a client profile yields id, empty roles and is_coach false', () => {
  const u = bsSentryUser({ id: 'u1', roles: [], role: 'client' });
  assert.equal(u.id, 'u1');
  assert.equal(u.is_coach, false);
  assert.equal(u.roles, 'client');
});

test('roles come from the ARRAY, sorted and comma-joined', () => {
  const u = bsSentryUser({ id: 'u2', roles: ['trainer', 'nutritionist'] });
  assert.equal(u.roles, 'nutritionist,trainer');
  assert.equal(u.is_coach, true);
});

test('the legacy singular role is the fallback when the array is absent', () => {
  const u = bsSentryUser({ id: 'u3', role: 'trainer' });
  assert.equal(u.roles, 'trainer');
  assert.equal(u.is_coach, true);
});

test('dietitian counts as a coach — it is an alias for nutritionist', () => {
  const u = bsSentryUser({ id: 'u4', roles: ['dietitian'] });
  assert.equal(u.is_coach, true);
});

test('a dual-role account keeps BOTH roles visible', () => {
  const u = bsSentryUser({ id: 'u5', roles: ['nutritionist', 'trainer'] });
  assert.equal(u.roles, 'nutritionist,trainer', 'a boolean would erase this distinction');
});

test('⚠ PII is never emitted, whatever the profile carries', () => {
  const u = bsSentryUser({
    id: 'u6', roles: ['client'],
    email: 'a@b.c', full_name: 'Real Name', phone: '+1', date_of_birth: '1990-01-01',
    stripe_customer_id: 'cus_x', location: 'London', username: 'handle',
  });
  assert.deepEqual(Object.keys(u).sort(), ['id', 'is_coach', 'roles']);
  for (const k of BS_SENTRY_DENIED_KEYS) {
    assert.equal(k in u, false, `${k} must never reach Sentry`);
  }
});

test('no id means no user context at all, rather than a partial one', () => {
  assert.equal(bsSentryUser({ roles: ['client'] }), null);
  assert.equal(bsSentryUser(null), null);
  assert.equal(bsSentryUser('nope'), null);
});

// ⚠ Coverage added after Codex flagged the degraded signed-in state (P2, confirmed
// against the code): `getCurrentSession()` swallows a failed profile creation and
// carries on with `profile === null`, so a signed-in member with no profile row is a
// real state. Reading the id off the profile alone reported every error in it as
// anonymous — and a broken-account state is exactly when knowing who hit it matters.

test('the authenticated id is the fallback when the profile is missing entirely', () => {
  const u = bsSentryUser(null, 'auth-uid');
  assert.equal(u.id, 'auth-uid');
  assert.equal(u.roles, '', 'roles come from the profile only — absent, never guessed');
  assert.equal(u.is_coach, false);
});

test('the profile id wins over the fallback, and roles still resolve', () => {
  const u = bsSentryUser({ id: 'profile-id', roles: ['trainer'] }, 'auth-uid');
  assert.equal(u.id, 'profile-id');
  assert.equal(u.is_coach, true);
});

test('an unusable fallback yields no context — never a partial one', () => {
  assert.equal(bsSentryUser(null, ''), null);
  assert.equal(bsSentryUser(null, null), null);
  assert.equal(bsSentryUser(null, 42), null, 'a non-string id would group unrelated people');
  assert.equal(bsSentryUser({ roles: ['client'] }, undefined), null);
});

test('junk roles never throw and never fabricate a coach', () => {
  assert.equal(bsSentryUser({ id: 'u7', roles: [null, 42, {}] }).is_coach, false);
  assert.equal(bsSentryUser({ id: 'u8', roles: 'not-an-array' }).is_coach, false);
});

test('release prefers the explicit var, then the Vercel SHA, else undefined', () => {
  assert.equal(bsSentryRelease({ SHAPE_RELEASE: 'abc123' }), 'abc123');
  assert.equal(bsSentryRelease({ VERCEL_GIT_COMMIT_SHA: 'def456' }), 'def456');
  assert.equal(bsSentryRelease({}), undefined, 'undefined, never a fake value');
  assert.equal(bsSentryRelease({ VERCEL_GIT_COMMIT_SHA: '' }), undefined);
});

// ⚠ Coverage added post-review (Important, confirmed by reproduction): these four
// hostile shapes — a throwing getter on `id`, a throwing getter on `roles`, a
// get-trapping Proxy standing in for `roles`, and a throwing getter on the release
// env — all propagated an uncaught exception out of these functions before the fix.
// That matters specifically because this module runs while Sentry is building an
// error report for a DIFFERENT crash: a throw here replaces that original error with
// a stack trace pointing at the tagging code, which is the exact failure this
// tracking layer exists to prevent. Both functions must now be null/undefined on any
// internal failure — never a partial result, and never a propagated throw.

test('a throwing getter on id never propagates — the result is null, not a crash', () => {
  const profile = {
    get id() { throw new Error('id getter trap'); },
    roles: ['trainer'],
  };
  assert.equal(bsSentryUser(profile), null);
});

test('a throwing getter on roles never propagates — the result is null, not a crash', () => {
  const profile = {
    id: 'u9',
    get roles() { throw new Error('roles getter trap'); },
  };
  assert.equal(bsSentryUser(profile), null);
});

test('a roles Proxy that throws on get never propagates — the result is null, not a crash', () => {
  // The target is a real array so Array.isArray(profile.roles) reads true without
  // invoking any trap (per spec, IsArray recurses on [[ProxyTarget]]) — the throw
  // instead comes from the very next read, `arr.length`, which the `get` trap catches.
  const trapped = new Proxy(['trainer'], {
    get() { throw new Error('proxy trap'); },
  });
  const profile = { id: 'u10', roles: trapped };
  assert.equal(bsSentryUser(profile), null);
});

test('bsSentryRelease: a throwing getter on the env never propagates — undefined, not a crash', () => {
  const env = {
    get SHAPE_RELEASE() { throw new Error('release getter trap'); },
  };
  assert.equal(bsSentryRelease(env), undefined);
});
