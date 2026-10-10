// supabase-migrations/2026-10-10-security-review-lows-and-anon-definers.sql, read statement by
// statement, and the readers and writers it changes.
//
// The database-side Lows of the 2026-10-08 security review (cut 2) and the four SECURITY DEFINER
// functions the 2026-10-03 audit left anon-executable. The owner runs the file by hand in the
// Supabase SQL editor, sometimes twice, so it has to replay cleanly; and three of its changes are
// column-level grants, which carry a maintenance rule no replica probe can enforce for a column
// added next month: the tripwires here read every migration for an `add column` on the three tables.
//
// Verified on a PostgreSQL 16 replica of the live catalog (the harness is not checked in): the file
// applies twice; anon loses the four functions, `select *` on the coach tables and the four inserts;
// a member cannot preset a refund's status, rewrite their username, Stripe customer or email, or
// their League tier; a coach cannot read the admin's review notes; track_event stops at its cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './helpers/sql-scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'supabase-migrations';
const FILE = `${DIR}/2026-10-10-security-review-lows-and-anon-definers.sql`;
const raw = readFileSync(join(ROOT, FILE), 'utf8');
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const statements = splitStatements(raw, FILE).map((s) => norm(s.text));
const find = (re) => statements.filter((s) => re.test(s));
const one = (re) => { const m = find(re); assert.equal(m.length, 1, `${re}: ${m.length} statements`); return m[0]; };
const fn = (name) => one(new RegExp(`^create or replace function public\\.${name}\\(`));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A grant's column list, as the migration writes it.
const grantList = (table, role) => {
  const g = one(new RegExp(`^grant select \\( (.+?) \\) on table public\\.${table} to ${role}$`));
  return /^grant select \( (.+?) \) on table/.exec(g)[1].split(',').map((c) => c.trim());
};
const setEq = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);

test('the file is one transaction, safe to run twice, with no dynamic SQL', () => {
  assert.equal(statements[0], 'begin');
  assert.equal(statements[1], "set local lock_timeout = '10s'");
  assert.equal(statements.at(-1), 'commit');
  for (const s of find(/^create (function|trigger|policy)/)) {
    if (/^create function/.test(s)) assert.fail(`not create-or-replace: ${s.slice(0, 80)}`);
    if (/^create trigger /.test(s)) {
      const [, name, table] = /^create trigger (\S+) [^]*? on (\S+) /.exec(s);
      assert.ok(statements.includes(`drop trigger if exists ${name} on ${table}`), `${name}: dropped before it is created`);
    }
    if (/^create policy /.test(s)) {
      const [, name, table] = /^create policy ("[^"]+"|\S+) on (\S+)/.exec(s);
      const dropAt = statements.indexOf(`drop policy if exists ${name} on ${table}`);
      assert.ok(dropAt >= 0 && dropAt < statements.indexOf(s), `${name}: dropped before it is created`);
    }
  }
  // Every `execute` in the statements (comments stripped) is a grant or revoke, a trigger's
  // `execute function`, or the privilege name in a has_*_privilege call.
  assert.equal(statements.join('\n').match(/(?<!')\bexecute\b(?!')(?!\s+function\b)(?!\s+on\s+function\b)/g), null, 'dynamic SQL');
  for (const s of find(/^alter function/)) assert.match(s, /^alter function public\.save_workout_session\(jsonb, jsonb, jsonb\) set search_path = public, pg_temp$/);
});

test('the four definers are signed-in only, get_follow_list gates on the caller and the visibility, and save_workout_session is pinned', () => {
  const sigs = {
    get_active_now: 'integer',
    get_active_activities: '',
    shape_profile_visibility: 'uuid',
    get_follow_list: 'uuid, text',
  };
  for (const [name, args] of Object.entries(sigs)) {
    const sig = `public.${name}(${args})`.replace(/[()]/g, '\\$&');
    one(new RegExp(`^revoke execute on function ${sig} from public, anon$`));
    one(new RegExp(`^grant execute on function ${sig} to authenticated, service_role$`));
  }
  // Only those four, and only those grants: nothing here opens anything to anon.
  assert.equal(find(/^revoke execute/).length, 4);
  assert.equal(find(/^grant execute/).length, 4);
  assert.equal(find(/^grant [^]* to [^]*\banon\b/).filter((s) => !/^grant select \(/.test(s)).length, 0, 'no table- or function-level grant to anon');

  const body = fn('get_follow_list');
  assert.match(body, /returns table\(user_id uuid, full_name text, role text, since timestamp with time zone\) language sql stable security definer set search_path = public, pg_temp as \$\$/);
  assert.match(body, /where \(case when p_kind = 'following' then f\.follower_id else f\.following_id end\) = p_user_id and f\.status = 'accepted' and auth\.uid\(\) is not null and \( auth\.uid\(\) = p_user_id or public\.shape_profile_visibility\(p_user_id\) = 'public' or exists \( select 1 from public\.user_follows x where x\.follower_id = auth\.uid\(\) and x\.following_id = p_user_id and x\.status = 'accepted' \) \) order by f\.created_at desc limit 200;/);
  assert.match(body, /join public\.profiles pr on pr\.id = \(case when p_kind = 'following' then f\.following_id else f\.follower_id end\)/, 'the join is the one that shipped');
  // The revoke follows the body: a replaced function keeps its ACL, so the body alone would leave anon on it.
  assert.ok(statements.indexOf(body) < statements.indexOf("revoke execute on function public.get_follow_list(uuid, text) from public, anon"));
});

test('L17: user_follows is read by signed-in members (accepted rows, or their own), and a private profile has no card for a visitor', () => {
  assert.ok(statements.includes('drop policy if exists "follows public read" on public.user_follows'));
  one(/^create policy follows_read_accepted_or_own on public\.user_follows for select to authenticated using \(status = 'accepted' or follower_id = auth\.uid\(\) or following_id = auth\.uid\(\)\)$/);
  assert.equal(find(/on public\.user_follows for (insert|update|delete|all)/).length, 0, 'the write policies are not this file\'s');
  const body = fn('get_public_profile');
  assert.match(body, /from public\.profiles p where p\.id = p_user_id and not \(auth\.uid\(\) is null and \(select norm from vis\) = 'private'\); \$\$$/);
  // Unchanged: the card's shape (a signed-in non-follower still gets the locked card) and the friend test.
  assert.match(body, /\(select d->>'photo' from ident\), \(\(select norm from vis\) = 'public'\), \(select norm from acc\), \(select can_view from acc\), case when \(select can_view from acc\) then \(select d from cust\) end, p\.username from public\.profiles p/);
  assert.match(body, /where me\.user_id = auth\.uid\(\) and them\.user_id = p_user_id and c\.dm_key is not null/);
  assert.match(body, /or \(auth\.uid\(\) = p_user_id\) or \(\(select norm from vis\) = 'friends' and \(select is_friend from fr\)\) as can_view/);
  assert.equal(find(/function public\.get_public_profile\(uuid\)/).length, 0, 'anon keeps EXECUTE on the card: public and friends-tier cards are public by design');
});

test('L12: a member inserts a refund request pending, with nothing the admin fills in', () => {
  assert.ok(statements.includes('drop policy if exists "clients create own refund requests" on public.refund_requests'));
  one(/^create policy refund_requests_client_insert_pending on public\.refund_requests for insert to authenticated with check \( auth\.uid\(\) = client_id and status = 'pending' and processed_at is null and admin_notes is null \)$/);
});

test('L18: a member\'s own profile write keeps username, Stripe customer and email (unless it is the account\'s own); league_members is read-only to its member', () => {
  const g = fn('guard_profile_identity_columns');
  assert.match(g, /^create or replace function public\.guard_profile_identity_columns\(\) returns trigger language plpgsql set search_path = public as \$\$/);
  assert.match(g, /is_privileged boolean := current_user in \('service_role','supabase_admin','supabase_auth_admin','postgres'\) or jwt_role = 'service_role';/);
  assert.match(g, /jwt_email text := lower\(nullif\(claims::jsonb ->> 'email', ''\)\);/);
  assert.match(g, /begin if is_privileged then return new; end if; if tg_op = 'insert' then new\.username := null; new\.stripe_customer_id := null; if new\.email is not null and lower\(new\.email\) is distinct from jwt_email then new\.email := jwt_email; end if; return new; end if; new\.username := old\.username; new\.stripe_customer_id := old\.stripe_customer_id; if new\.email is distinct from old\.email and lower\(new\.email\) is distinct from jwt_email then new\.email := old\.email; end if; return new; end \$\$$/);
  assert.doesNotMatch(g, /phone/, 'phone stays member-editable: the settings screens write it');
  assert.doesNotMatch(g, /raise/, 'silent, like the role guard: the app\'s full-row upserts carry these columns and must not fail');
  one(/^create trigger profiles_guard_identity before insert or update on public\.profiles for each row execute function public\.guard_profile_identity_columns\(\)$/);
  assert.ok(statements.includes('drop policy if exists league_members_rw_own on public.league_members'));
  one(/^create policy league_members_read_own on public\.league_members for select to authenticated using \(user_id = auth\.uid\(\)\)$/);
  // Leaving the League is a delete of the member's own row through their own client (POST /api/league,
  // action "leave"); joining and every tier or cohort write go through the service-role RPC.
  one(/^create policy league_members_delete_own on public\.league_members for delete to authenticated using \(user_id = auth\.uid\(\)\)$/);
  assert.equal(find(/on public\.league_members for (insert|update|all)/).length, 0, 'no member write policy comes back');
  const league = read('src/app/api/league/route.ts');
  assert.match(league, /await supabase\.from\('league_members'\)\.delete\(\)\.eq\('user_id', user\.id\);/, 'the leave path is the member\'s own delete');
  assert.doesNotMatch(league, /supabase\.from\('league_members'\)\.(insert|upsert|update)\(/, 'no member-client write to league_members');
});

test('L19: the four anonymous insert policies go, their routes write as the service role, and track_event is capped per caller', () => {
  for (const t of ['consultation_bookings', 'contact_submissions', 'provider_applications', 'app_launch_notifications']) {
    assert.ok(statements.includes(`drop policy if exists anon_insert_${t} on public.${t}`), t);
    assert.equal(find(new RegExp(`^create policy [^ ]+ on public\\.${t} `)).length, 0, `${t}: no policy comes back`);
  }
  // The three routes that inserted through the request's own (anon) client write through the
  // service role now; consultation already did. Each still runs its own checks first.
  for (const p of ['src/app/api/contact/route.ts', 'src/app/api/notify-app/route.ts', 'src/app/api/apply/route.ts']) {
    const src = read(p);
    assert.match(src, /import \{ createAdminClient \} from '@\/lib\/supabase\/admin';/, p);
    assert.doesNotMatch(src, /@\/lib\/supabase\/server/, `${p}: no insert through the request's own client`);
    assert.match(src, /const supabase = createAdminClient\(\);/, p);
  }
  assert.match(read('src/app/api/consultation/route.ts'), /createAdminClient\(\)/);

  const crl = fn('check_rate_limit');
  assert.match(crl, /if p_key like 'self:%' or p_key like 'fn:%' then raise exception 'reserved rate-limit namespace' using errcode = '42501'; end if; return query select \* from public\._rate_limit_bump\(p_key, p_max, p_window_seconds\); end; \$\$$/);

  const te = fn('track_event');
  assert.match(te, /v_ip text := nullif\(current_setting\('request\.headers', true\), ''\)::jsonb ->> 'cf-connecting-ip'; v_key text := 'fn:track_event:' \|\| coalesce\(auth\.uid\(\)::text, 'ip:' \|\| coalesce\(v_ip, 'unknown'\)\);/);
  assert.match(te, /select b\.allowed into v_allowed from public\._rate_limit_bump\(v_key, case when auth\.uid\(\) is null then 120 else 60 end, 60\) b; if not coalesce\(v_allowed, false\) then return; end if; insert into public\.analytics_events \(user_id, event, props\) values \(auth\.uid\(\), p_event, p_props\); end; \$\$$/);
  assert.match(te, /if p_props is null or jsonb_typeof\(p_props\) <> 'object' or octet_length\(p_props::text\) > 4096 then p_props := '\{\}'::jsonb; end if;/, 'the 2026-10-08 props cap stays');
  // The whitelist is the one the 2026-10-08 file carried, name for name.
  const list = (s) => /if p_event not in \( (.+?) \) then return;/.exec(s)[1].split(',').map((x) => x.trim());
  const prior = splitStatements(read(`${DIR}/2026-10-08-security-review-access-layer.sql`), 'prior').map((s) => norm(s.text)).find((s) => /^create or replace function public\.track_event\(/.test(s));
  assert.ok(prior, 'the 2026-10-08 file defines track_event');
  assert.deepEqual(list(te), list(prior));
  assert.equal(list(te).length, 8);
});

// Every `add column` on a table, across all the migrations, with the file that adds it.
function addedColumns(table) {
  const out = [];
  for (const file of readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = norm(read(`${DIR}/${file}`));
    // The whole ALTER TABLE statement: a column's CHECK can carry commas and parentheses of its own.
    for (const m of sql.matchAll(new RegExp(`alter table (?:if exists )?(?:public\\.)?${table}\\b([^;]*)`, 'g'))) {
      for (const c of m[1].matchAll(/add column (?:if not exists )?([a-z_]+)/g)) out.push({ file, column: c[1] });
    }
  }
  return out;
}
const anonGrants = (table) => find(new RegExp(`^grant select \\( (.+?) \\) on table public\\.${table} to anon$`));

test('L16: a visitor reads every coach-table column but stripe_account_id, the two anonymous readers list their columns, and a column added later is granted or the test fails', () => {
  const expectTrainer = ['id', 'name', 'specialty', 'category', 'price', 'rating', 'subscribers', 'experience', 'credential', 'credential_full', 'specialty_type', 'bio', 'color', 'tags', 'trainer_of_month', 'totm_quote', 'featured', 'sort_order', 'created_at', 'updated_at', 'stripe_product_id', 'stripe_price_id', 'owner_id', 'stripe_account_status', 'session_price', 'at_capacity', 'capacity_resume_at', 'verified', 'verified_at', 'monthly_offer', 'listing_media', 'timezone'];
  const expectNutri = ['id', 'name', 'specialty', 'category', 'price', 'rating', 'subscribers', 'experience', 'credential', 'credential_full', 'specialty_type', 'bio', 'color', 'tags', 'services', 'nutritionist_of_month', 'notm_quote', 'featured', 'sort_order', 'created_at', 'updated_at', 'stripe_product_id', 'stripe_price_id', 'owner_id', 'stripe_account_status', 'meal_plan_price', 'at_capacity', 'capacity_resume_at', 'verified', 'verified_at', 'monthly_offer', 'listing_media', 'timezone'];
  const lists = {};
  for (const [table, expect] of [['trainers', expectTrainer], ['nutritionists', expectNutri]]) {
    const revokeAt = statements.indexOf(`revoke select on table public.${table} from anon`);
    assert.ok(revokeAt >= 0 && revokeAt < statements.indexOf(find(new RegExp(`on table public\\.${table} to anon$`))[0]), `${table}: the table-level grant goes before the column list comes`);
    const cols = grantList(table, 'anon');
    lists[table] = cols;
    assert.deepEqual(cols, expect, `${table}: the live catalog's columns on 2026-10-09, all but stripe_account_id`);
    assert.equal(new Set(cols).size, cols.length, `${table}: no column twice`);
    assert.ok(!cols.includes('stripe_account_id'), table);
    for (const keep of ['owner_id', 'stripe_account_status']) assert.ok(cols.includes(keep), `${table}.${keep} stays public on purpose`);
    assert.equal(find(new RegExp(`public\\.${table} (from|to) authenticated`)).length, 0, `${table}: authenticated keeps its table-level read`);
    // The tripwire: a column any migration adds is in this list, or (for a file dated after this one)
    // that file grants it to anon itself. A column added without its grant is invisible to a visitor.
    for (const { file, column } of addedColumns(table)) {
      if (column === 'stripe_account_id') continue;
      if (`${DIR}/${file}` <= FILE) assert.ok(cols.includes(column), `${table}.${column} (${file}) is missing from the 2026-10-10 anon grant`);
      else assert.match(norm(read(`${DIR}/${file}`)), new RegExp(`grant select \\([^)]*\\b${column}\\b[^)]*\\) on table public\\.${table} to anon`), `${file} adds ${table}.${column} and must grant it to anon`);
    }
    assert.ok(addedColumns(table).some((c) => c.column === 'timezone'), `${table}: the column history is read (timezone, 2026-09-11)`);
  }
  // The two readers that run as anon list exactly these columns, in this order.
  const web = /const columns = tab === "Nutritionist"\s*\? "([^"]+)"\s*: "([^"]+)";/.exec(read('public/newdesign/marketplace.jsx'));
  assert.ok(web, 'the website marketplace lists its columns');
  assert.deepEqual(web[1].split(',').map((c) => c.trim()), lists.nutritionists);
  assert.deepEqual(web[2].split(',').map((c) => c.trim()), lists.trainers);
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  for (const [table, list] of Object.entries(lists)) {
    const m = new RegExp(`client\\.from\\('${table}'\\)\\.select\\('([^']+)'\\)`).exec(app);
    assert.ok(m, `the app marketplace lists its ${table} columns`);
    assert.deepEqual(m[1].split(',').map((c) => c.trim()), list);
  }
  assert.doesNotMatch(read('public/newdesign/marketplace.jsx'), /\.from\(table\)\.select\("\*"\)/);
  assert.doesNotMatch(app, /from\('(trainers|nutritionists)'\)\.select\('\*'\)/);
});

test('L3: the coach reads every provider_credentials column but review_notes and reviewed_by, keeps their writes, and the route lists the columns', () => {
  const expect = ['owner_id', 'credential_type', 'cdr_id', 'verified_rd', 'verified_at', 'insurance_carrier', 'insurance_policy', 'insurance_expires', 'attestations', 'updated_at', 'insurance_coi_path', 'cert_files', 'review_status', 'submitted_at', 'reviewed_at'];
  assert.ok(statements.includes('revoke select on table public.provider_credentials from authenticated'));
  const cols = grantList('provider_credentials', 'authenticated');
  assert.deepEqual(cols, expect);
  for (const hidden of ['review_notes', 'reviewed_by']) assert.ok(!cols.includes(hidden), hidden);
  assert.equal(find(/public\.provider_credentials from authenticated$/).length, 1, 'only SELECT is revoked: INSERT, UPDATE and DELETE stay table-level under prov_cred_own');
  for (const { file, column } of addedColumns('provider_credentials')) {
    if (['review_notes', 'reviewed_by'].includes(column)) continue;
    if (`${DIR}/${file}` <= FILE) assert.ok(cols.includes(column), `provider_credentials.${column} (${file}) is missing from the 2026-10-10 grant`);
    else assert.match(norm(read(`${DIR}/${file}`)), new RegExp(`grant select \\([^)]*\\b${column}\\b[^)]*\\) on table public\\.provider_credentials to authenticated`), `${file} adds provider_credentials.${column} and must grant it to authenticated`);
  }
  assert.ok(addedColumns('provider_credentials').some((c) => c.column === 'review_notes'), 'the column history is read (the review columns, 2026-06-19)');
  const route = read('src/app/api/coach/credentials/route.ts');
  const m = /const CREDENTIAL_COLUMNS =\s*((?:'[^']*'\s*\+?\s*)+);/.exec(route);
  assert.ok(m, 'the route lists the columns in CREDENTIAL_COLUMNS');
  const listed = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('').split(',').map((c) => c.trim());
  assert.deepEqual(listed, expect);
  assert.match(route, /\.from\('provider_credentials'\)\s*\.select\(CREDENTIAL_COLUMNS\)/);
  assert.doesNotMatch(route, /from\('provider_credentials'\)\.select\('\*'\)/);
  assert.doesNotMatch(route, /export const CREDENTIAL_COLUMNS/, 'a route file exports handlers only');
  // The other coach-side readers already name their columns; the admin console reads as the service role.
  for (const [p, cols] of [['src/app/api/coach/credentials/document/route.ts', 'cert_files'], ['src/lib/compliance/server.ts', 'credential_type, insurance_expires, verified_rd'], ['src/lib/ai/actions.mjs', 'credential_type, insurance_expires']]) {
    assert.match(read(p), new RegExp(`from\\('provider_credentials'\\)\\s*\\.select\\('${cols}'\\)`), p);
  }
  assert.match(read('src/app/dashboard/credentials/page.tsx'), /const admin = createAdminClient\(\);\s*let query = admin\s*\.from\('provider_credentials'\)\s*\.select\('\*'\)/);
});

test('the guard checks each change, raises on anything that did not land, and every RAISE placeholder has its argument', () => {
  const guard = /do \$guard\$([^]*?)\$guard\$;/.exec(raw)?.[1];
  assert.ok(guard, 'the guard block');
  const g = norm(guard);
  for (const must of [
    "('get_follow_list', 'p_user_id uuid, p_kind text'), ('get_active_now', 'p_limit integer'), ('get_active_activities', ''), ('shape_profile_visibility', 'p_user_id uuid')",
    "and p.prosecdef and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') and coalesce(array_to_string(p.proconfig, ','), '') like '%pg_temp%'",
    "pg_get_function_identity_arguments(p.oid) = 'p_session jsonb, p_sets jsonb, p_samples jsonb'; if v_cfg is null or v_cfg !~ 'search_path=public, pg_temp' then raise exception",
    "v_src not like '%auth.uid() is null and (select norm from vis) = ''private''%'",
    "v_src not like '%auth.uid() is not null%' or v_src not like '%shape_profile_visibility(p_user_id)%'",
    "v_src not like '%_rate_limit_bump(%' or v_src not like '%fn:track_event:%'",
    "v_src not like '%p_key like ''fn:%''%'",
    "policyname = 'follows public read'; if v_count <> 0 then raise exception",
    "policyname = 'follows_read_accepted_or_own' and cmd = 'select' and 'authenticated' = any(roles) and qual like '%accepted%' and qual like '%follower_id = auth.uid()%' and qual like '%following_id = auth.uid()%'; if v_count <> 1",
    "policyname = 'refund_requests_client_insert_pending' and cmd = 'insert' and with_check like '%auth.uid() = client_id%' and with_check like '%status = ''pending''%' and with_check like '%processed_at is null%' and with_check like '%admin_notes is null%'; if v_count <> 1",
    "policyname = 'clients create own refund requests'; if v_count <> 0",
    "policyname = 'league_members_rw_own'; if v_count <> 0",
    "policyname = 'league_members_read_own' and cmd = 'select'; if v_count <> 1",
    "policyname = 'league_members_delete_own' and cmd = 'delete'; if v_count <> 1",
    "tablename = 'league_members' and cmd in ('insert', 'update', 'all'); if v_count <> 0",
    "policyname in ( 'anon_insert_consultation_bookings', 'anon_insert_contact_submissions', 'anon_insert_provider_applications', 'anon_insert_app_launch_notifications'); if v_count <> 0",
    "c.relname = 'profiles' and t.tgname = 'profiles_guard_identity' and not t.tgisinternal; if v_count <> 1",
    "if has_table_privilege('anon', 'public.trainers', 'select') or has_column_privilege('anon', 'public.trainers', 'stripe_account_id', 'select') or not has_column_privilege('anon', 'public.trainers', 'owner_id', 'select')",
    "if has_table_privilege('anon', 'public.nutritionists', 'select') or has_column_privilege('anon', 'public.nutritionists', 'stripe_account_id', 'select')",
    "c.table_name in ('trainers', 'nutritionists') and c.column_name <> 'stripe_account_id' and not has_column_privilege('anon', ('public.' || c.table_name)::regclass, c.column_name, 'select'); if v_count <> 0",
    "if not has_table_privilege('authenticated', 'public.trainers', 'select') or not has_table_privilege('authenticated', 'public.nutritionists', 'select') then raise exception",
    "if has_table_privilege('authenticated', 'public.provider_credentials', 'select') or has_column_privilege('authenticated', 'public.provider_credentials', 'review_notes', 'select') or has_column_privilege('authenticated', 'public.provider_credentials', 'reviewed_by', 'select') or not has_column_privilege('authenticated', 'public.provider_credentials', 'review_status', 'select') or not has_column_privilege('authenticated', 'public.provider_credentials', 'reviewed_at', 'select') or not has_table_privilege('authenticated', 'public.provider_credentials', 'update')",
    "c.table_name = 'provider_credentials' and c.column_name not in ('review_notes', 'reviewed_by') and not has_column_privilege('authenticated', 'public.provider_credentials'::regclass, c.column_name, 'select'); if v_count <> 0",
  ]) assert.ok(g.includes(must), `guard: ${must.slice(0, 90)}`);
  // RAISE: the placeholders and the arguments agree, or the raise itself errors instead of reporting.
  const raises = [...guard.matchAll(/raise exception '((?:[^']|'')*)'\s*(?:,\s*([^;]*?))?\s*(?:using\s[^;]*)?;/g)];
  assert.ok(raises.length >= 20, `${raises.length} RAISE statements read`);
  const topLevel = (s) => { let d = 0; const out = []; let cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out; };
  for (const [, msg, args] of raises) {
    const holes = (msg.match(/%/g) ?? []).length;
    assert.equal(holes, args ? topLevel(args).length : 0, `"${msg}": ${holes} placeholder(s) vs "${args ?? ''}"`);
  }
});

test('the app\'s application fallback and the allow-list say what changed', () => {
  // The installed app inserts into provider_applications only when /api/apply failed, and then keeps
  // the record locally when the insert fails too; with the anonymous policy gone that insert is the
  // local path. The route is the one way in.
  const sb = read('mobile-app/src/services/shapeBackend.js');
  assert.match(sb, /\.from\('provider_applications'\)\s*\.insert\(payload\)[^]*?if \(error\) \{\s*return \{ stored: 'local'/);
  // The allow-list carried the five fixes as fixedAfterCapture until the catalog was captured again;
  // the 2026-10-10 capture records this file as applied and shows them, so the list carries none
  // (tests/definer-grants.test.mjs holds the shape) and the capture says what the file did.
  const allow = JSON.parse(read('tests/fixtures/definer-anon-allowlist.json'));
  assert.deepEqual(allow.fixedAfterCapture, []);
  assert.deepEqual(allow.registeredFindings, []);
  assert.deepEqual(allow.registeredPinFindings, []);
  const live = JSON.parse(read('tests/fixtures/definer-live-2026-10-10.json'));
  assert.deepEqual(live.captureDayFilesApplied, ['2026-10-10-security-review-lows-and-anon-definers.sql']);
  for (const fn of ['get_follow_list', 'get_active_now', 'get_active_activities', 'shape_profile_visibility']) {
    assert.ok(live.notAnonExecutable.includes(fn) && !live.anonExecutable.includes(fn), `${fn} is signed-in only in production`);
  }
  assert.ok(live.anonExecutable.includes('get_public_profile'), 'the card RPC keeps anon on purpose');
  assert.deepEqual(live.definersWithoutPgTemp, [], 'save_workout_session is pinned in production');
});
