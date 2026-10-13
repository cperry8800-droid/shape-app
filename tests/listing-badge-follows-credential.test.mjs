// The Verified badge comes off in the same write that unreviews the credential
// (supabase-migrations/2026-10-13-listing-badge-follows-credential.sql), which closes the two
// CodeRabbit threads left open on #2315: a coach's own action was finished by a service-role
// write, and the two listing tables were cleared one after the other.
//
// The migration was probed on a PostgreSQL 16 scaffold of the live objects it touches (the
// harness is not checked in): applied twice, the probes identical after each. As a coach, an
// edit, an upsert, a delete or a first insert of their own credential row takes the badge off
// both their listings and no other coach's; the coach can call neither function and still cannot
// put a badge on; as the service role, approval and a note on an approved row leave the badge,
// rejection and a request for changes take it off; clear_listing_verified returns 2, then 0;
// with the nutritionist write made to fail, the coach's edit and the service call each fail
// whole, leaving the credential and both badges as they were; deleting the auth user still
// cascades without error. Before it, the same coach writes left both badges up. Approval (Codex on
// #2321): approve_provider_credential approves and badges both listings, returns null and badges
// nothing with no credential row; with the approval held open in one session, a coach's edit in
// another waits for it and then takes the badge off, so the credential ends 'pending' with no
// badge.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const MIGRATION = 'supabase-migrations/2026-10-13-listing-badge-follows-credential.sql'
const code = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')

const fnBody = (name) => {
  const at = code.indexOf(`create or replace function public.${name}(`)
  assert.ok(at >= 0, `${name} is defined`)
  const end = code.indexOf('$$;', code.indexOf('as $$', at))
  return code.slice(at, end)
}

test('one transaction, re-runnable, guarded', () => {
  assert.match(code, /^\s*begin;[\s\S]*commit;\s*$/)
  assert.match(code, /drop trigger if exists provider_credentials_zz_unverify_listings on public\.provider_credentials;/)
  assert.doesNotMatch(code, /drop function/, 'a drop would take grants with it')
  assert.doesNotMatch(code, /guard_provider_admin_columns|guard_credential_review_columns/, 'the guards are not restated')
})

test('clear_listing_verified clears both tables for one owner in one statement, as its caller, service role only', () => {
  const fn = fnBody('clear_listing_verified')
  const head = fn.slice(0, fn.indexOf('as $$'))
  assert.match(head, /returns integer\s+language sql\s+set search_path to 'public', 'pg_temp'/)
  assert.doesNotMatch(head, /security definer/, 'it runs as its caller: the service role, or the trigger below')
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(fn, new RegExp(`update public\\.${t} set verified = false, verified_at = null\\s+where owner_id = p_owner and verified\\s+returning 1`), t)
  }
  assert.match(fn, /with t as \([\s\S]*\), n as \([\s\S]*\)\s+select \(\(select count\(\*\) from t\) \+ \(select count\(\*\) from n\)\)::integer;/, 'one statement')
  assert.doesNotMatch(fn, /verified = true/)
  assert.match(code, /revoke all on function public\.clear_listing_verified\(uuid\) from public, anon, authenticated;/)
  assert.match(code, /grant execute on function public\.clear_listing_verified\(uuid\) to service_role;/)
  assert.doesNotMatch(code, /grant execute on function public\.clear_listing_verified\(uuid\) to (anon|authenticated|public)/)
})

test('the trigger takes the badge off whenever the credential is not approved, or is deleted', () => {
  const fn = fnBody('provider_credentials_unverify_listings')
  const head = fn.slice(0, fn.indexOf('as $$'))
  assert.match(head, /returns trigger\s+language plpgsql\s+security definer\s+set search_path to 'public', 'pg_temp'/)
  assert.match(fn, /if tg_op = 'DELETE' then\s+perform public\.clear_listing_verified\(old\.owner_id\);\s+elsif new\.review_status is distinct from 'approved' then\s+perform public\.clear_listing_verified\(new\.owner_id\);\s+end if;\s+return null;/)
  assert.match(code, /revoke all on function public\.provider_credentials_unverify_listings\(\) from public, anon, authenticated;/)
  assert.match(code, /create trigger provider_credentials_zz_unverify_listings\s+after insert or update or delete on public\.provider_credentials\s+for each row execute function public\.provider_credentials_unverify_listings\(\);/)
})

test('approval and the badge are one transaction, and nothing is badged without a credential row', () => {
  const fn = fnBody('approve_provider_credential')
  const head = fn.slice(0, fn.indexOf('as $$'))
  assert.match(head, /\(p_owner uuid, p_reviewer uuid, p_notes text\)\s+returns integer\s+language plpgsql\s+set search_path to 'public', 'pg_temp'/)
  assert.doesNotMatch(head, /security definer/, 'it runs as the service role that calls it')
  // The credential row is locked by the approval before either listing is touched.
  assert.match(fn, /update public\.provider_credentials\s+set review_status = 'approved', reviewed_by = p_reviewer, reviewed_at = v_now,\s+review_notes = p_notes, verified_at = v_now\s+where owner_id = p_owner;\s+if not found then\s+return null;\s+end if;\s+update public\.trainers set verified = true, verified_at = v_now where owner_id = p_owner;[\s\S]*update public\.nutritionists set verified = true, verified_at = v_now where owner_id = p_owner;/)
  assert.match(code, /revoke all on function public\.approve_provider_credential\(uuid, uuid, text\) from public, anon, authenticated;/)
  assert.match(code, /grant execute on function public\.approve_provider_credential\(uuid, uuid, text\) to service_role;/)
})

test('the migration checks what it built', () => {
  const guard = code.slice(code.lastIndexOf('do $$'))
  assert.match(guard, /tgname = 'provider_credentials_zz_unverify_listings'[\s\S]*tgenabled <> 'D'/)
  assert.match(guard, /'public\.provider_credentials_unverify_listings\(\)'::regprocedure and prosecdef\s+and proconfig @> array\['search_path=public, pg_temp'\]/)
  assert.match(guard, /has_function_privilege\('authenticated', 'public\.clear_listing_verified\(uuid\)', 'execute'\)/)
  assert.match(guard, /not has_function_privilege\('service_role', 'public\.clear_listing_verified\(uuid\)', 'execute'\)/)
  assert.match(guard, /has_function_privilege\('authenticated', 'public\.approve_provider_credential\(uuid, uuid, text\)', 'execute'\)/)
  assert.match(guard, /not has_function_privilege\('service_role', 'public\.approve_provider_credential\(uuid, uuid, text\)', 'execute'\)/)
})

test('the code calls the database function and makes no listing write of its own to take a badge off', () => {
  const helper = readFileSync('src/lib/coach-verification.ts', 'utf8')
  assert.match(helper, /admin\.rpc\('clear_listing_verified', \{ p_owner: ownerId \}\)/)
  assert.doesNotMatch(helper, /\.from\(/, 'no table write: the function clears both in one statement')
})
