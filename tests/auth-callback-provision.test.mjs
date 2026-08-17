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
  // It can only preserve what it reads. Asserted per COLUMN, not as one pinned string:
  // an exact-literal match goes stale the moment a column is added — which it just did.
  const select = (SRC.match(/\.select\('([^']*date_of_birth[^']*)'\)/) || [])[1];
  assert.ok(select, 'no profiles select found — re-anchor this test');
  for (const col of ['full_name', 'email', 'role', 'roles']) {
    assert.ok(select.includes(col),
      `select("${select}") omits ${col} — the upsert cannot preserve a column it never read`);
  }

  // Optional fields: seeded only when the row lacks them.
  for (const [field, guard] of [
    ['full_name', /!existing\?\.full_name\s*&&/],
    ['email', /!existing\?\.email\s*&&/],
    ['date_of_birth', /!existing\?\.date_of_birth\s*&&/],
  ]) {
    assert.match(SRC, guard, `seed.${field} is written without checking the existing row`);
  }

  // ⚠ role is the one that CANNOT be conditional: profiles.role is NOT NULL with no
  // default (live catalog), so an INSERT omitting it fails 23502 — provisioning dies,
  // no row is written, and absence-refuses turns that into a lockout. The create path
  // must always supply one, and must never touch an existing row's role.
  assert.match(SRC, /if \(!existing\) \{/,
    'the role write must be gated on the row being ABSENT, not on metadata');
  const create = SRC.slice(SRC.indexOf('if (!existing) {'));
  assert.match(create, /seed\.role = role;/, 'the create path must always set a role');
  assert.match(create, /seed\.roles = \[role\];/, 'roles must be seeded alongside role');
  assert.match(create, /meta\.role \? meta\.role : 'client'/,
    "the create path needs a fallback role — 'client' is the house default");
  assert.doesNotMatch(SRC, /!existing\?\.role\s*&&/,
    'a role write conditioned on the existing COLUMN is the 23502 hazard: NOT NULL means ' +
    'an existing row always has one, so the only question is whether the ROW exists.');

  // And the no-row case must still write, or round 12's defect is back.
  assert.match(SRC, /\.upsert\(seed, \{ onConflict: 'id' \}\)/, 'the upsert is gone');
});

// ⚠ A FAILED READ IS NOT AN ABSENT ROW — found by self-review of the round-22 fix,
// before Codex saw it. maybeSingle()/getProfile() both yield null for "no row" AND for
// "the read errored", and because the write is an upsert on `id`, taking the create path
// on an unreadable read UPDATEs the existing row: a coach demoted to 'client', roles
// collapsed. That is the overwrite defect re-entering through the error path, with a
// WIDER blast radius than before, since the create path now always writes a role.
test('an unreadable profile read never provisions (both surfaces)', () => {
  assert.match(SRC, /error: readError/,
    'the callback must capture the read error — maybeSingle() resolves it, never throws');
  assert.match(SRC, /if \(readError\) \{/,
    'a failed read must be handled before any decision about whether the row exists');
  // The seed/upsert must sit on the else branch, not run regardless.
  const i = SRC.indexOf('if (readError) {');
  const j = SRC.indexOf('.upsert(seed');
  assert.ok(i !== -1 && j > i,
    'the upsert must be gated by the read-error branch, not precede it');
  assert.match(SRC.slice(i, j), /\} else \{/,
    'provisioning must be the ELSE of the read-error check');

  const legacy = stripComments(
    readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8')
  );
  assert.match(legacy, /if \(chk\.error\) \{/,
    'the legacy path must distinguish an unreadable read from an absent row');
  assert.match(legacy, /if \(chk\.data\) return/,
    'an existing row must short-circuit before the create-path seed');
});

// The identical hazard lived at a second provisioning site — the legacy website
// sign-in path (round 11's fix). Codex named only the callback.
test('the legacy sign-in provisioning also always writes a role', () => {
  const legacy = stripComments(
    readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8')
  );
  const i = legacy.indexOf('var seed = { id: user.id }');
  assert.notEqual(i, -1, 'the legacy provisioning seed moved — re-anchor this test');
  const block = legacy.slice(i, i + 700);
  assert.match(block, /var role = meta\.role \|\| 'client';/,
    'this branch only ever CREATES, so a role must always be written (NOT NULL, no default)');
  assert.doesNotMatch(block, /if \(meta\.role\) \{ seed\.role/,
    'a metadata-conditional role write fails 23502 whenever signup metadata carries none');
});
