// An admin's verdict applies to the version of a coach's credentials the admin reviewed, and a
// deleted account takes its listings with it
// (supabase-migrations/2026-10-13-review-revision-and-listing-owner-cascade.sql; owner,
// 2026-10-13: "fix the approval overwrite gap too", "fix all issues").
//
// The migration was probed on a PostgreSQL 16 copy of the live objects it touches (the harness is
// not checked in): applied twice, silent. The revision is a fresh sequence value on every write, a
// coach's, an upsert's or the service role's, whatever value the writer sends; a coach who deletes
// their row and creates it again, then edits it, never reaches the revision on an open form. Approval at the
// reviewed revision approves and badges both listings; at a stale one it returns -1 and changes
// nothing; with no row it returns null. The coach edits after the admin looked: the approval and
// the rejection of what was seen both change nothing. Two live sessions, the coach's edit held
// open: the approval waits for it and returns -1, the credential ends pending with no badge.
// Deleting the auth user deletes their listings and what references them; Shape's own listings
// stay. Members can call neither function; the old three-argument approval is gone.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const MIGRATION = 'supabase-migrations/2026-10-13-review-revision-and-listing-owner-cascade.sql'
const code = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')
const fnBody = (name) => {
  const at = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(at >= 0, `${name} is defined`)
  return code.slice(at, code.indexOf('$$;', code.indexOf('as $$', at)))
}

test('one transaction, re-runnable', () => {
  assert.match(code, /^\s*begin;[\s\S]*commit;\s*$/)
  assert.match(code, /create sequence if not exists public\.provider_credentials_revision_seq as bigint;/)
  assert.match(code, /drop trigger if exists provider_credentials_revision on public\.provider_credentials;/)
})

test('the revision is the database\'s: set on insert, bumped on every write, readable by the coach', () => {
  const fn = fnBody('provider_credentials_bump_revision')
  assert.match(fn, /returns trigger\s+language plpgsql\s+set search_path to 'public', 'pg_temp'/)
  assert.doesNotMatch(fn, /security definer/)
  // One sequence, never a per-row counter (Codex, #2323): a row deleted and created again must not
  // count its way back up to the revision on an admin's open form.
  assert.match(fn, /begin\s+new\.revision := nextval\('public\.provider_credentials_revision_seq'\);\s+return new;\s+end;/)
  assert.doesNotMatch(fn, /old\.revision/)
  assert.match(code, /add column if not exists revision bigint not null default nextval\('public\.provider_credentials_revision_seq'\);/)
  assert.match(code, /revoke all on sequence public\.provider_credentials_revision_seq from public, anon;\s+grant usage on sequence public\.provider_credentials_revision_seq to authenticated, service_role;/)
  assert.match(code, /create trigger provider_credentials_revision\s+before insert or update on public\.provider_credentials\s+for each row execute function public\.provider_credentials_bump_revision\(\);/)
  assert.match(code, /revoke all on function public\.provider_credentials_bump_revision\(\) from public, anon, authenticated;/)
  assert.match(code, /grant select \(revision\) on table public\.provider_credentials to authenticated;/)
})

test('approval takes the reviewed revision and changes nothing when the credential moved on', () => {
  const fn = fnBody('approve_provider_credential')
  assert.match(fn, /\(p_owner uuid, p_revision bigint, p_reviewer uuid, p_notes text\)\s+returns integer\s+language plpgsql\s+set search_path to 'public', 'pg_temp'/)
  assert.doesNotMatch(fn, /security definer/)
  assert.match(fn, /where owner_id = p_owner and revision = p_revision;\s+if not found then\s+if exists \(select 1 from public\.provider_credentials where owner_id = p_owner\) then\s+return -1;\s+end if;\s+return null;\s+end if;\s+update public\.trainers set verified = true/)
  assert.match(code, /drop function if exists public\.approve_provider_credential\(uuid, uuid, text\);/, 'no caller can approve without a revision')
  assert.match(code, /revoke all on function public\.approve_provider_credential\(uuid, bigint, uuid, text\) from public, anon, authenticated;/)
  assert.match(code, /grant execute on function public\.approve_provider_credential\(uuid, bigint, uuid, text\) to service_role;/)
})

test('a deleted account takes its listings with it', () => {
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(code, new RegExp(`alter table public\\.${t} drop constraint if exists ${t}_owner_id_fkey;\\s+alter table public\\.${t}\\s+add constraint ${t}_owner_id_fkey foreign key \\(owner_id\\) references auth\\.users \\(id\\) on delete cascade;`))
  }
  const guard = code.slice(code.lastIndexOf('do $$'))
  assert.match(guard, /confdeltype = 'c'/)
  assert.match(guard, /to_regprocedure\('public\.approve_provider_credential\(uuid, uuid, text\)'\) is not null/)
})
