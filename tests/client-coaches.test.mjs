// get_client_coaches (supabase-migrations/2026-10-16-client-coaches.sql): every coach a member pays,
// readable by that member and by each of those coaches (owner, 2026-10-16: "members can have multiple
// coaches if they choose to"). Probed on a PostgreSQL 16 copy before it shipped: the member and each
// current coach read all of them; a former coach, an unrelated coach and a signed-out caller read
// nothing; anon cannot execute it; a cancelled row does not set a listing's start. The runner has no
// Postgres, so the rules that decided those answers are held here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-10-16-client-coaches.sql'), 'utf8');
const body = SQL.slice(SQL.indexOf('create or replace function public.get_client_coaches'), SQL.indexOf('revoke all on function'));

test('only the member and their current coaches read it, and only live subscriptions count', () => {
  assert.match(body, /security definer\nset search_path = public, pg_temp\nas \$\$/, 'a pinned definer');
  assert.match(body, /where auth\.uid\(\) is not null\n\s+and p_client_id is not null/, 'signed out: nothing');
  assert.match(body, /\n\s+and \(auth\.uid\(\) = p_client_id or public\.is_coach_on_client\(p_client_id\)\)/,
    'the member, or a coach with an active or trialing subscription from them (is_coach_on_client)');
  assert.match(body, /\n\s+and s\.status in \('active', 'trialing'\)\n/, 'a cancelled subscription is neither a coach nor a start date');
  assert.match(body, /min\(s\.created_at\)\s+as since/, 'a listing\'s start is its earliest live row');
  assert.match(body, /group by s\.provider_role, s\.provider_id/, 'one row per listing');
  // It returns names and owners, which the listing tables already show, and a start day: no email,
  // phone, price or Stripe id.
  assert.match(body, /returns table \(provider_role text, provider_id bigint, name text, owner_id uuid, since timestamptz\)/);
  assert.ok(!/stripe|email|phone|price/i.test(body.replace(/--[^\n]*/g, '')));
});

test('anon cannot run it, and the file proves its own grants', () => {
  assert.match(SQL, /revoke all on function public\.get_client_coaches\(uuid\) from public, anon;/);
  assert.match(SQL, /grant execute on function public\.get_client_coaches\(uuid\) to authenticated, service_role;/);
  assert.match(SQL, /if has_function_privilege\('anon', 'public\.get_client_coaches\(uuid\)', 'execute'\)/);
  assert.match(SQL, /not p\.prosecdef or not exists \(select 1 from unnest\(coalesce\(p\.proconfig/);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});
