// One listing per role per account (supabase-migrations/2026-10-13-one-listing-per-account.sql).
// Owner, 2026-10-13: "add the unique index migration". Seventeen routes read a coach's own
// listing with .maybeSingle(), and an account with two rows of one role made all of them error.
//
// Probed on a PostgreSQL 16 copy of the two tables (the harness is not checked in):
//   · with an account owning two trainer listings the migration stops, says how many, and
//     creates no index;
//   · on clean tables it applies, and a second run is a no-op;
//   · a second listing for an owner is refused (23505, trainers_one_per_owner), and so is moving a
//     listing onto an owner who has one;
//   · ownerless listings, the same owner in the other role, and other owners are all accepted.
// The guard compares pg_get_indexdef, whose form is the same on production's PostgreSQL 17.6
// (checked against trainers_stripe_account_id_idx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATION = 'supabase-migrations/2026-10-13-one-listing-per-account.sql';
const code = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');

test('one transaction: refuse duplicates first, then the two partial unique indexes, then the guard', () => {
  assert.match(code, /^\s*begin;[\s\S]*commit;\s*$/);
  const pre = code.indexOf('do $pre$');
  const t = code.indexOf('create unique index if not exists trainers_one_per_owner');
  const n = code.indexOf('create unique index if not exists nutritionists_one_per_owner');
  const guard = code.indexOf('do $guard$');
  assert.ok(pre >= 0 && pre < t && t < n && n < guard, 'precondition, indexes, guard, in that order');
});

test('the precondition counts owners with two rows in each table and stops with the counts', () => {
  const pre = code.slice(code.indexOf('do $pre$'), code.indexOf('$pre$;'));
  for (const table of ['trainers', 'nutritionists']) {
    assert.match(pre, new RegExp(`from \\(select owner_id from public\\.${table} where owner_id is not null group by owner_id having count\\(\\*\\) > 1\\) d;`), table);
  }
  assert.match(pre, /if v_trainers > 0 or v_nutritionists > 0 then\s+raise exception 'one listing per account: % account\(s\) own two or more trainer listings and % own two or more nutritionist listings/);
});

test('each index is unique, on owner_id, and partial: ownerless listings stay free', () => {
  for (const table of ['trainers', 'nutritionists']) {
    assert.match(code, new RegExp(`create unique index if not exists ${table}_one_per_owner\\s+on public\\.${table} \\(owner_id\\) where owner_id is not null;`), table);
    // The guard holds the exact definition PostgreSQL prints for that statement.
    assert.ok(code.includes(`'CREATE UNIQUE INDEX ${table}_one_per_owner ON public.${table} USING btree (owner_id) WHERE (owner_id IS NOT NULL)'`), `${table}: guard`);
    assert.match(code, new RegExp(`where c\\.relname = '${table}_one_per_owner' and i\\.indisvalid and i\\.indisready\\), ''\\)`), `${table}: a half-built index fails the guard`);
  }
  assert.doesNotMatch(code, /drop index|concurrently/i, 'nothing dropped; built inside the transaction');
});

test('approval takes the listing that won a unique violation, and throws any other', () => {
  const src = readFileSync('src/app/dashboard/applications/actions.ts', 'utf8');
  const fn = src.slice(src.indexOf('async function publishProviderRow('), src.indexOf('/** Records how the decision email went'));
  assert.match(fn, /if \(\(error as \{ code\?: string \}\)\.code === '23505'\) \{[\s\S]*?\.eq\('owner_id', ownerId\)[\s\S]*?if \(winner\?\.id != null\) return winner\.id;\s+\}\s+throw error;/);
});
