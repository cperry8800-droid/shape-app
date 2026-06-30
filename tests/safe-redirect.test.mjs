import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnPath } from '../src/lib/safe-redirect.mjs';

// Regression test for AUTHZ-P2-oauth-redirect (SECURITY-AUDIT-2026-06-30 §2c):
// the integrations OAuth flow must not redirect to an attacker-supplied origin.

test('allows same-origin relative paths', () => {
  assert.equal(safeReturnPath('/newdesign/GetApp.html'), '/newdesign/GetApp.html');
  assert.equal(safeReturnPath('/m/#integrations'), '/m/#integrations');
  assert.equal(safeReturnPath('/'), '/');
});

test('rejects open-redirect vectors -> fallback', () => {
  for (const bad of [
    'https://evil.com/phish',
    'http://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'evil.com',
    '',
  ]) {
    assert.equal(safeReturnPath(bad), '/', `should reject ${JSON.stringify(bad)}`);
  }
});

test('non-strings and whitespace-wrapped absolutes -> fallback', () => {
  assert.equal(safeReturnPath(null), '/');
  assert.equal(safeReturnPath(undefined), '/');
  assert.equal(safeReturnPath(42), '/');
  assert.equal(safeReturnPath('   https://evil.com   '), '/');
});

test('honors a custom fallback', () => {
  assert.equal(safeReturnPath('https://evil.com', '/newdesign/GetApp.html'), '/newdesign/GetApp.html');
});
