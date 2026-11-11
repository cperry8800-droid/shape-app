// tests/identity-name-location-migration.test.mjs
//
// supabase-migrations/2026-11-11-identity-name-location.sql (owner, 2026-11-11: "yes write the migration"):
// a name edited in Edit profile (client_identity) reaches profiles.full_name, which every card reads, and the
// coach's listings, which the marketplace reads; and the card returns the location under can_view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-11-11-identity-name-location.sql'), 'utf8');
const code = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const between = (from, to) => { const a = code.indexOf(from); const b = code.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return code.slice(a, b); };

test('one transaction, re-runnable', () => {
  assert.match(code.trim(), /^begin;[\s\S]*commit;$/);
  assert.match(code, /create or replace function public\.shape_sync_identity_name\(\)/);
  assert.match(code, /drop trigger if exists shape_sync_identity_name on public\.user_goals;/);
  assert.match(code, /drop function if exists public\.get_public_profile\(uuid\);/);
});

test('the sync runs as the writer, on a new name only, and touches only the writer\'s own rows', () => {
  const fn = between('create or replace function public.shape_sync_identity_name()', 'drop trigger');
  assert.doesNotMatch(fn, /security definer/i, 'the sync runs with elevated rights');
  assert.match(fn, /set search_path = public, pg_temp/);
  assert.match(fn, /if new\.kind <> 'client_identity' then return new; end if;/);
  assert.match(fn, /if n = '' or char_length\(n\) > 80 then return new; end if;/, 'an empty or overlong name is copied');
  assert.match(fn, /if tg_op = 'UPDATE' and btrim\(coalesce\(old\.data->>'name', ''\)\) = n then return new; end if;/, 'a photo save rewrites the name');
  const updates = fn.match(/update public\.\w+ set [^;]+;/g);
  assert.equal(updates.length, 3);
  for (const u of updates) assert.match(u, /where (id|owner_id) = new\.user_id and (full_name|name) is distinct from n;$/, `an update reaches past the writer: ${u}`);
  assert.match(code, /create trigger shape_sync_identity_name\s+after insert or update of data on public\.user_goals\s+for each row when \(new\.kind = 'client_identity'\)\s+execute function public\.shape_sync_identity_name\(\);/);
});

test('the card returns the location under can_view, and is otherwise the live card', () => {
  const fn = between('create function public.get_public_profile(p_user_id uuid)', 'grant execute');
  assert.match(fn, /returns table\([^)]*username text, location text\)/, 'location is not the last column');
  assert.match(fn, /security definer/);
  assert.match(fn, /p\.username,\s+case when \(select can_view from acc\) then nullif\(btrim\(\(select d->>'location' from ident\)\), ''\) end\s+from public\.profiles p/);
  // The previous body (2026-10-12-shape-score-fixes.sql), with the location as its one change.
  const prev = readFileSync(join(ROOT, 'supabase-migrations/2026-10-12-shape-score-fixes.sql'), 'utf8');
  const old = prev.slice(prev.indexOf('with pts as ('), prev.indexOf('$$;', prev.indexOf('with pts as (')));
  const now = fn.slice(fn.indexOf('with pts as ('), fn.indexOf('$$;'));
  const flat = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(flat(now.replace(/,\s+case when \(select can_view from acc\) then nullif\(btrim\(\(select d->>'location' from ident\)\), ''\) end/, '')), flat(old), 'the card changed beyond the location');
  // The grant as before: authenticated by name; anon through the default ACL (the allow-list's default-only).
  assert.match(code, /grant execute on function public\.get_public_profile\(uuid\) to authenticated;/);
  assert.doesNotMatch(code, /to anon|from anon|revoke/);
});

test('the backfill changes only what differs', () => {
  const back = code.slice(code.indexOf('update public.profiles p'));
  assert.equal((back.match(/is distinct from/g) || []).length, 3);
  assert.match(back, /char_length\(btrim\(g\.data->>'name'\)\) <= 80/);
});
