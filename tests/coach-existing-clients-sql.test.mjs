// A coach's existing clients (supabase-migrations/2026-11-12-coach-existing-clients.sql), run for real.
//
// THE DATABASE HALF runs the 2026-07-21 migration and then this one, as written, on PostgreSQL (PGlite,
// Postgres compiled to WebAssembly), over stand-ins for the tables they read, with Supabase's roles, as
// coaches, members, a stranger and nobody. PGlite is not a dependency of this repo: the half runs when
// `@electric-sql/pglite` resolves, from here or from the folder in SHAPE_PGLITE, and is skipped, by
// name, otherwise (tests/client-pause-sql.test.mjs does the same). The static half below always runs.
//
// What it pins (owner, 2026-11-12: "Shape takes 15% cut on clients that sign up through Shape.
// Existing clients, Shape takes no cut from."): only a member whose confirmed email is on the coach's
// own list pays 0% at that coach's checkout; the list is the coach's alone and open for 60 days from
// the later of their joining and 2026-11-12; a waitlisted member pays 15% even when listed; a tag from
// before the rule is honoured until it expires, and no invite or link writes or extends one after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  existingClientsClosesAt,
  EXISTING_CLIENTS_RULE_START,
  EXISTING_CLIENTS_WINDOW_DAYS,
  KNOWN_ORIGINS,
  resolveOriginDecision,
} from '../src/lib/coach-origin.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BYO_0721 = readFileSync(join(ROOT, 'supabase-migrations/2026-07-21-coach-byo-commission-split.sql'), 'utf8');
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-11-12-coach-existing-clients.sql'), 'utf8');

function loadPglite() {
  for (const base of [join(ROOT, 'package.json'), process.env.SHAPE_PGLITE ? join(process.env.SHAPE_PGLITE, 'package.json') : null]) {
    if (!base) continue;
    try { return createRequire(base)('@electric-sql/pglite').PGlite; } catch (e) { /* not here */ }
  }
  return null;
}
const PGlite = loadPglite();
const NO_DB = PGlite ? false : 'PGlite is not installed (set SHAPE_PGLITE to a folder that has @electric-sql/pglite)';

// ── The static half ──────────────────────────────────────────────────────────

test('the window is the SQL\'s own: 60 days from the later of joining and 2026-11-12, in hours', () => {
  assert.equal(EXISTING_CLIENTS_RULE_START, '2026-11-12T00:00:00.000Z');
  assert.equal(EXISTING_CLIENTS_WINDOW_DAYS, 60);
  assert.match(SQL, /greatest\(coalesce\(p_joined, timestamptz '2026-11-12 00:00:00\+00'\),\s*timestamptz '2026-11-12 00:00:00\+00'\) \+ interval '1440 hours'/);
  assert.equal(EXISTING_CLIENTS_WINDOW_DAYS * 24, 1440);
  // A coach who joined before the rule: from the rule's first day.
  assert.equal(existingClientsClosesAt('2026-03-01T09:00:00Z'), '2027-01-11T00:00:00.000Z');
  assert.equal(existingClientsClosesAt(null), '2027-01-11T00:00:00.000Z');
  assert.equal(existingClientsClosesAt('not a date'), '2027-01-11T00:00:00.000Z');
  // One who joins after: from the day they joined.
  assert.equal(existingClientsClosesAt('2026-12-01T15:30:00Z'), '2027-01-30T15:30:00.000Z');
});

test('the money rows\' origin check and the code know the same four origins', () => {
  const m = SQL.match(/subscriptions_origin_check\s+check \(origin in \(([^)]*)\)\)/);
  assert.ok(m, 'the subscriptions origin check moved');
  const names = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  assert.deepEqual(names, [...KNOWN_ORIGINS].sort());
  const o = SQL.match(/one_time_purchases_origin_check\s+check \(origin in \(([^)]*)\)\)/);
  assert.ok(o, 'the one_time_purchases origin check moved');
  assert.deepEqual(o[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort(), names);
});

// ── The database half ────────────────────────────────────────────────────────

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COACH = U(1), COACH2 = U(2), LISTED = U(3), UNCONFIRMED = U(4), WAITING = U(5), TAGGED = U(6), STRANGER = U(7), OLD_TAG = U(8), LATE_COACH = U(9);

const SCHEMA = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's own defaults: every new table and function in public is granted to the API roles by name,
-- so a table is closed only by its row level security, and a function only by its revokes.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table public.trainers (id bigint primary key, owner_id uuid, created_at timestamptz not null default now());
create table public.nutritionists (id bigint primary key, owner_id uuid, created_at timestamptz not null default now());
create table public.coach_waitlist (client_id uuid, provider_role text, provider_id bigint, status text, invite_expires_at timestamptz);
create table public.subscriptions (id bigint generated always as identity primary key, client_id uuid, provider_id bigint, provider_role text, status text);
create table public.one_time_purchases (id bigint generated always as identity primary key, client_id uuid, provider_id bigint, provider_role text, status text);
insert into auth.users values
  ('${COACH}', 'coach@example.com', now()), ('${COACH2}', 'coach2@example.com', now()),
  ('${LISTED}', '  Listed.Client@Example.com ', now()), ('${UNCONFIRMED}', 'unconfirmed@example.com', null),
  ('${WAITING}', 'waiting@example.com', now()), ('${TAGGED}', 'tagged@example.com', now()),
  ('${STRANGER}', 'stranger@example.com', now()), ('${OLD_TAG}', 'oldtag@example.com', now()),
  ('${LATE_COACH}', 'late@example.com', now());
insert into public.trainers values (1, '${COACH}', '2026-03-01T09:00:00Z'), (2, '${COACH2}', '2026-03-01T09:00:00Z'),
  (3, '${LATE_COACH}', now() + interval '20 days');
insert into public.nutritionists values (11, '${COACH}', '2026-03-01T09:00:00Z');
insert into public.coach_waitlist values ('${WAITING}', 'trainer', 1, 'waiting', null);
`;

let db = null;
const reset = () => db.query('reset role');
async function as(uid, sql, params = [], role = 'authenticated') {
  await reset();
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  await db.query(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await reset(); }
}
const list = (uid, role, id) => as(uid, 'select public.get_coach_existing_clients($1, $2) as r', [role, id]).then((r) => r[0].r);
const add = (uid, role, id, emails) => as(uid, 'select public.add_coach_existing_clients($1, $2, $3::text[]) as r', [role, id, emails]).then((r) => r[0].r);
const remove = (uid, role, id, email) => as(uid, 'select public.remove_coach_existing_client($1, $2, $3) as r', [role, id, email]).then((r) => r[0].r);
const origin = (uid, role, id, ref = null) => as(uid, 'select origin, referral_id from public.resolve_coach_checkout_origin($1, $2, $3)', [role, id, ref]).then((r) => r[0]);
const code = (re) => (e) => { assert.match(String(e && e.code), re); return true; };
const msg = (re) => (e) => { assert.match(String(e && e.message), re); return true; };

test('on PostgreSQL: the migration runs over 2026-07-21\'s, and runs again', { skip: NO_DB }, async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(BYO_0721);
  // A tag from before the rule (the 2026-07-21 RPCs wrote these): live, and one already expired.
  await db.exec(`
    insert into public.coach_referrals (coach_user_id, provider_role, provider_id, client_id, channel, token, expires_at)
    values ('${COACH}', 'trainer', 1, '${TAGGED}', 'dm', null, now() + interval '12 days'),
           ('${COACH}', 'trainer', 1, '${OLD_TAG}', 'link', null, now() - interval '1 day');`);
  await db.exec(SQL);
  await db.exec(SQL); // and again: nothing changes the second time, and the guard passes
  const defs = (await db.query(`select conname, pg_get_constraintdef(oid) as d from pg_constraint where conname in ('subscriptions_origin_check', 'one_time_purchases_origin_check') order by 1`)).rows;
  assert.equal(defs.length, 2);
  for (const d of defs) assert.match(d.d, /coach_existing/);
  const fns = (await db.query(`select proname, prosecdef, proconfig from pg_proc where proname in ('get_coach_existing_clients', 'add_coach_existing_clients', 'remove_coach_existing_client', 'resolve_coach_checkout_origin', 'create_coach_referral', 'bind_coach_referral') order by proname`)).rows;
  assert.equal(fns.length, 6);
  for (const f of fns) assert.deepEqual([f.proname, f.prosecdef, f.proconfig], [f.proname, true, ['search_path=public, pg_temp']]);
  // Nobody signed out reaches any of it, and no member reads or writes the table itself.
  await assert.rejects(as(null, `select public.get_coach_existing_clients('trainer', 1)`, [], 'anon'), /permission denied/);
  await assert.rejects(as(null, `select public.add_coach_existing_clients('trainer', 1, array['a@b.co'])`, [], 'anon'), /permission denied/);
  await assert.rejects(as(null, `select * from public.resolve_coach_checkout_origin('trainer', 1, null)`, [], 'anon'), /permission denied/);
  await assert.rejects(as(COACH, `insert into public.coach_existing_clients (coach_user_id, provider_role, provider_id, email) values ('${COACH}', 'trainer', 1, 'x@y.co')`), /row-level security/);
});

test('the list is the coach\'s own: added trimmed and lowercased, the bad ones named, and read back', { skip: NO_DB }, async () => {
  await assert.rejects(list(STRANGER, 'trainer', 1), code(/^42501$/), 'not their provider row');
  await assert.rejects(list(null, 'trainer', 1), code(/^42501$/), 'signed out');
  await assert.rejects(add(COACH2, 'trainer', 1, ['someone@example.com']), code(/^42501$/), 'another coach');
  await assert.rejects(add(COACH, 'gym', 1, ['someone@example.com']), code(/^22023$/), 'a role that is not one');
  const r = await add(COACH, 'trainer', 1, ['listed.client@example.com', ' UNCONFIRMED@example.com ', 'waiting@example.com', 'not an email', 'coach@example.com', '', 'listed.client@example.com']);
  assert.equal(r.added, 3);
  assert.deepEqual(r.invalid, ['coach@example.com', 'not an email'], 'not an address, or the coach\'s own');
  assert.equal(r.closes_at.slice(0, 10), '2027-01-11');
  // Adding the same again adds nothing.
  assert.equal((await add(COACH, 'trainer', 1, ['Listed.Client@example.com'])).added, 0);
  const l = await list(COACH, 'trainer', 1);
  assert.equal(l.open, true);
  assert.equal(new Date(l.closes_at).toISOString(), existingClientsClosesAt('2026-03-01T09:00:00Z'), 'the SQL window and the code\'s agree');
  assert.deepEqual(l.emails.map((e) => e.email).sort(), ['listed.client@example.com', 'unconfirmed@example.com', 'waiting@example.com']);
  // The table itself: the coach reads their own rows, anyone else none.
  assert.equal((await as(COACH, 'select email from public.coach_existing_clients')).length, 3);
  assert.deepEqual(await as(STRANGER, 'select email from public.coach_existing_clients'), []);
  assert.deepEqual(await as(LISTED, 'select email from public.coach_existing_clients'), [], 'nor does a client on it');
  // Their nutritionist row's list is a different list.
  assert.deepEqual((await list(COACH, 'nutritionist', 11)).emails, []);
  // A coach who joins later has a later window, the code's.
  const late = await list(LATE_COACH, 'trainer', 3);
  await reset();
  const joined = (await db.query('select created_at from public.trainers where id = 3')).rows[0].created_at;
  assert.equal(new Date(late.closes_at).toISOString(), existingClientsClosesAt(joined));
  // 200 at a time.
  await assert.rejects(add(COACH, 'trainer', 1, Array.from({ length: 201 }, (_, i) => `p${i}@example.com`)), code(/^22023$/));
  // The table holds only the normalized shape.
  await reset();
  await assert.rejects(db.query(`insert into public.coach_existing_clients (coach_user_id, provider_role, provider_id, email) values ('${COACH}', 'trainer', 1, 'Mixed@Case.com')`), /coach_existing_clients_email_shape/);
});

test('at checkout: only a listed member with that email confirmed pays 0%, and the waitlist still wins', { skip: NO_DB }, async () => {
  assert.deepEqual(await origin(LISTED, 'trainer', 1), { origin: 'coach_existing', referral_id: null }, 'their email, whatever its case and spaces');
  assert.deepEqual(await origin(LISTED, 'trainer', 2), { origin: 'marketplace', referral_id: null }, 'another coach\'s checkout');
  assert.deepEqual(await origin(LISTED, 'nutritionist', 11), { origin: 'marketplace', referral_id: null }, 'the same coach\'s other role');
  assert.deepEqual(await origin(UNCONFIRMED, 'trainer', 1), { origin: 'marketplace', referral_id: null }, 'an email not confirmed');
  assert.deepEqual(await origin(WAITING, 'trainer', 1), { origin: 'marketplace', referral_id: null }, 'in the waiting room');
  assert.deepEqual(await origin(STRANGER, 'trainer', 1), { origin: 'marketplace', referral_id: null }, 'not listed');
  assert.deepEqual(await origin(null, 'trainer', 1), { origin: 'marketplace', referral_id: null }, 'signed out');
  // The code's decision, for the same states.
  assert.equal(resolveOriginDecision({ onWaitlist: false, onExistingList: true, boundChannel: null }).origin, 'coach_existing');
  assert.equal(resolveOriginDecision({ onWaitlist: true, onExistingList: true, boundChannel: null }).origin, 'marketplace');
  // The money rows take the new origin, and nothing else new.
  await reset();
  await db.query(`insert into public.subscriptions (client_id, provider_id, provider_role, status, origin, fee_bps) values ('${LISTED}', 1, 'trainer', 'active', 'coach_existing', 0)`);
  await db.query(`insert into public.one_time_purchases (client_id, provider_id, provider_role, status, origin, fee_bps) values ('${LISTED}', 1, 'trainer', 'paid', 'coach_existing', 0)`);
  await assert.rejects(db.query(`insert into public.subscriptions (client_id, provider_id, provider_role, status, origin, fee_bps) values ('${LISTED}', 1, 'trainer', 'active', 'coach_brought', 0)`), /subscriptions_origin_check/);
});

test('a tag from before the rule pays 0% until it expires; no invite or link writes or extends one now', { skip: NO_DB }, async () => {
  await reset();
  const tagId = (await db.query(`select id from public.coach_referrals where client_id = '${TAGGED}'`)).rows[0].id;
  assert.deepEqual(await origin(TAGGED, 'trainer', 1), { origin: 'coach_invite', referral_id: tagId }, 'honoured, with its id for the webhook');
  assert.deepEqual(await origin(OLD_TAG, 'trainer', 1), { origin: 'marketplace', referral_id: null }, 'expired before the rule');
  // An invite: still checked, still answers, writes nothing.
  await assert.rejects(as(STRANGER, `select public.create_coach_referral('trainer', 1, '${STRANGER}')`), code(/^22023$/), 'no self-referral');
  await assert.rejects(as(COACH2, `select public.create_coach_referral('trainer', 1, '${STRANGER}')`), code(/^42501$/), 'not their row');
  assert.deepEqual(await as(COACH, `select public.create_coach_referral('trainer', 1, '${STRANGER}') as r`), [{ r: null }]);
  // The coach's link: the token is made and kept as before; opening it binds nothing.
  const tok = (await as(COACH, `select public.create_coach_referral_link('trainer', 1) as t`))[0].t;
  assert.ok(tok);
  assert.deepEqual(await as(STRANGER, 'select provider_role, provider_id from public.bind_coach_referral($1)', [tok]), [{ provider_role: 'trainer', provider_id: 1 }]);
  assert.deepEqual(await as(COACH, 'select * from public.bind_coach_referral($1)', [tok]), [], 'a coach opening their own link');
  // Presenting the token at checkout is not a touch either.
  assert.deepEqual(await origin(STRANGER, 'trainer', 1, tok), { origin: 'marketplace', referral_id: null });
  assert.deepEqual(await origin(OLD_TAG, 'trainer', 1, tok), { origin: 'marketplace', referral_id: null }, 'nor does it revive an expired tag');
  await reset();
  const bound = (await db.query(`select client_id, expires_at > now() as live from public.coach_referrals where client_id is not null order by created_at`)).rows;
  assert.deepEqual(bound.map((b) => [b.client_id, b.live]), [[TAGGED, true], [OLD_TAG, false]], 'no tag added, none extended');
  // A listed member who also holds a tag is an existing client.
  assert.equal((await add(COACH, 'trainer', 1, ['tagged@example.com'])).added, 1);
  assert.deepEqual(await origin(TAGGED, 'trainer', 1), { origin: 'coach_existing', referral_id: null });
});

test('once the list closes, nothing is added or removed', { skip: NO_DB }, async () => {
  // The same email on the coach's other provider row is another list's: removing it here leaves that one.
  assert.equal((await add(COACH, 'nutritionist', 11, ['waiting@example.com'])).added, 1);
  assert.equal(await remove(COACH, 'trainer', 1, ' WAITING@example.com'), true);
  assert.deepEqual((await list(COACH, 'nutritionist', 11)).emails.map((e) => e.email), ['waiting@example.com']);
  assert.equal(await remove(COACH, 'trainer', 1, 'waiting@example.com'), false, 'already gone');
  await assert.rejects(remove(COACH2, 'trainer', 1, 'listed.client@example.com'), code(/^42501$/));
  // Close every list: the window function is the one place the date lives.
  await reset();
  await db.exec(`create or replace function public.coach_existing_clients_closes_at(p_joined timestamptz) returns timestamptz language sql immutable set search_path = public, pg_temp as $$ select timestamptz '2026-01-01 00:00:00+00' $$;`);
  assert.equal((await list(COACH, 'trainer', 1)).open, false);
  await assert.rejects(add(COACH, 'trainer', 1, ['new@example.com']), msg(/existing_client_list_closed/));
  await assert.rejects(remove(COACH, 'trainer', 1, 'listed.client@example.com'), msg(/existing_client_list_closed/));
  // A closed list still counts at checkout: it is the coach's existing clients, fixed.
  assert.deepEqual(await origin(LISTED, 'trainer', 1), { origin: 'coach_existing', referral_id: null });
});
