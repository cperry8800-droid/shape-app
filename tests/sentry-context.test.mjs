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
