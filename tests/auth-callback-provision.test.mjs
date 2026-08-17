// /auth/callback PROVISIONS a profile — it must never overwrite one.
//
// It is not signup-only: a password reset, a magic link and an email-change
// confirmation all exchange a code here, carrying whatever role/full_name sat in auth
// metadata at SIGNUP. Round 12's unconditional upsert wrote those back on every visit,
// reverting a renamed member and collapsing a dual-role coach's `roles` to one.
// So every field is seeded only when the row lacks it — as date_of_birth already was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = stripComments(
  readFileSync(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8')
);

test('the callback provisions without overwriting', () => {
  // It can only preserve what it reads.
  assert.match(SRC, /\.select\('id, date_of_birth, full_name, role, roles'\)/,
    'the select must read every field the upsert could clobber');

  // Each write gated on absence. An empty roles array still needs provisioning.
  for (const [field, guard] of [
    ['full_name', /!existing\?\.full_name\s*&&/],
    ['role', /!existing\?\.role\s*&&\s*!hasRoles\s*&&/],
    ['date_of_birth', /!existing\?\.date_of_birth\s*&&/],
  ]) {
    assert.match(SRC, guard, `seed.${field} is written without checking the existing row`);
  }
  assert.match(SRC, /Array\.isArray\(existing\?\.roles\) && existing\.roles\.length > 0/,
    'a `roles: []` row must count as "no roles" or it never gets provisioned');

  // And the no-row case must still write, or round 12's defect is back.
  assert.match(SRC, /\.upsert\(seed, \{ onConflict: 'id' \}\)/, 'the upsert is gone');
});
