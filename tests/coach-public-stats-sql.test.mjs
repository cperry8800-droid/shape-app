// get_coach_public_stats (supabase-migrations/2026-11-09-coach-public-stats.sql), run for real.
//
// THE DATABASE HALF runs the migration file as written on PostgreSQL 16 (PGlite, Postgres compiled to
// WebAssembly, so it needs no server and no second user), over the tables it reads with only the
// columns it reads, as anon, a stranger, a friend and the coach, and with Supabase's roles. PGlite is
// not a dependency of this repo: the half runs when `@electric-sql/pglite` resolves, from here or
// from the folder in SHAPE_PGLITE (one with node_modules/@electric-sql/pglite), and is skipped, by
// name, otherwise. The STATIC HALF always runs.
//
// What it pins: nothing public returns all nulls; each switch alone returns that figure alone; a
// figure made public with nothing to count is 0 (measured) and one not made public is null; a private
// profile is nulls to anon and a stranger and figures to its owner, a friends-tier one figures to a
// DM friend; a user who is both trainer and nutritionist is counted across both rows, a client paying
// both once; and no column carries a client's name or id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'supabase-migrations/2026-11-09-coach-public-stats.sql';
const SQL = readFileSync(join(ROOT, FILE), 'utf8');

function loadPglite() {
  for (const base of [join(ROOT, 'package.json'), process.env.SHAPE_PGLITE ? join(process.env.SHAPE_PGLITE, 'package.json') : null]) {
    if (!base) continue;
    try { return createRequire(base)('@electric-sql/pglite').PGlite; } catch (e) { /* not here */ }
  }
  return null;
}
const PGlite = loadPglite();
const NO_DB = PGlite ? false : 'PGlite is not installed (set SHAPE_PGLITE to a folder that has @electric-sql/pglite)';

// ── The static half ─────────────────────────────────────────────────────────────────────────
test('the migration: one pinned definer, granted by name, idempotent, guarded', () => {
  assert.match(SQL, /create or replace function public\.get_coach_public_stats\(p_owner uuid\)/);
  assert.match(SQL, /returns table \(sessions_coached integer, active_clients integer, coaching_since integer, program_clients jsonb\)/);
  assert.match(SQL, /\nstable\nsecurity definer\nset search_path = public, pg_temp\n/);
  assert.match(SQL, /revoke execute on function public\.get_coach_public_stats\(uuid\) from public;/);
  assert.match(SQL, /grant execute on function public\.get_coach_public_stats\(uuid\) to anon, authenticated, service_role;/);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
  assert.doesNotMatch(SQL, /\bdrop (function|table)\b/i, 'nothing destructive');
  // Names never leave it: no name or email column is read.
  assert.doesNotMatch(SQL.replace(/--[^\n]*/g, ''), /client_name|client_email|full_name|email/);
});

// ── The database half ───────────────────────────────────────────────────────────────────────
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = U(1), Z = U(2), N = U(3), PV = U(4), FR = U(5), FRIEND = U(6), STRANGER = U(7), B = U(8), TZ = U(9);
const C1 = U(101), C2 = U(102), C3 = U(103), C4 = U(104), C5 = U(105), C6 = U(106), C7 = U(107), C8 = U(108);
const P1 = U(201), P2 = U(202), P3 = U(203), P4 = U(204), M1 = U(205), BP = U(206);
const ALL = ['sessions', 'clients', 'since', 'programClients'];

const SCHEMA = `
create role anon nologin; create role authenticated nologin; create role service_role nologin; create role nobody nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, nobody; grant execute on function auth.uid() to anon, authenticated, nobody;
grant usage on schema public to anon, authenticated, nobody;
create table public.profiles (id uuid primary key, timezone text);
create table public.user_goals (user_id uuid not null, kind text not null, data jsonb not null default '{}', primary key (user_id, kind));
create table public.trainers (id bigint primary key, owner_id uuid);
create table public.nutritionists (id bigint primary key, owner_id uuid);
create table public.sessions (id uuid primary key default gen_random_uuid(), client_id uuid, client_name text, provider_id bigint not null, provider_role text not null, scheduled_at timestamptz not null, status text not null);
create table public.subscriptions (id uuid primary key default gen_random_uuid(), client_id uuid, provider_id bigint not null, provider_role text not null, status text not null, created_at timestamptz not null default now());
create table public.coach_plans (id uuid primary key, owner_id uuid not null, kind text not null, published boolean not null default true, detail jsonb not null default '{}');
create table public.client_workouts (id uuid primary key default gen_random_uuid(), trainer_id bigint, client_id uuid not null, status text not null default 'published', scheduled_date date, payload jsonb not null default '{}');
create table public.client_meal_plans (id uuid primary key default gen_random_uuid(), nutritionist_id bigint not null, client_id uuid not null, status text not null default 'published', payload jsonb not null default '{}');
create table public.conversations (id uuid primary key, dm_key text);
create table public.conversation_participants (conversation_id uuid not null, user_id uuid not null);
`;

// Coach A is a trainer (row 1) and a nutritionist (row 2). Row 3 is a trainer owned by B, and B's
// nutritionist row is 1: the same provider id as A's trainer row, another role.
const FIXTURES = `
insert into public.trainers values (1, '${A}'), (3, '${B}'), (4, '${Z}'), (5, '${PV}'), (6, '${FR}'), (7, '${TZ}');
insert into public.nutritionists values (2, '${A}'), (1, '${B}');
insert into public.profiles values ('${TZ}', 'Pacific/Kiritimati'), ('${A}', 'Not/AZone');
-- Sessions: A completes three as trainer (the first in March 2023) and two as nutritionist.
insert into public.sessions (client_id, client_name, provider_id, provider_role, scheduled_at, status) values
  ('${C1}', 'Priya', 1, 'trainer', '2023-03-04T10:00Z', 'completed'),
  ('${C2}', 'Marcus', 1, 'trainer', now() - interval '3 days', 'completed'),
  (null, 'Walk-in', 1, 'trainer', now() - interval '1 day', 'completed'),
  ('${C3}', 'Dana', 2, 'nutritionist', now() - interval '10 days', 'completed'),
  ('${C3}', 'Dana', 2, 'nutritionist', now() - interval '20 days', 'completed'),
  -- not coached: due ahead, unmarked, cancelled, requested, declined
  ('${C1}', 'Priya', 1, 'trainer', now() + interval '2 days', 'completed'),
  ('${C1}', 'Priya', 1, 'trainer', now() - interval '5 days', 'confirmed'),
  ('${C1}', 'Priya', 1, 'trainer', now() - interval '6 days', 'cancelled'),
  ('${C1}', 'Priya', 1, 'trainer', now() - interval '7 days', 'requested'),
  ('${C1}', 'Priya', 2, 'nutritionist', now() - interval '8 days', 'declined'),
  -- another coach's: B's trainer row, and B's nutritionist row 1 (A's trainer id, another role)
  ('${C1}', 'Priya', 3, 'trainer', '2019-01-01T10:00Z', 'completed'),
  ('${C1}', 'Priya', 1, 'nutritionist', '2018-01-01T10:00Z', 'completed');
-- Subscriptions: C1 pays A as trainer and as nutritionist (one person), C2 trialing, C3 past_due;
-- C8 active as nutritionist; C4 cancelled (a client once: counts for since, June 2022); C5 incomplete and C6 pending never started.
insert into public.subscriptions (client_id, provider_id, provider_role, status, created_at) values
  ('${C1}', 1, 'trainer', 'active', '2024-01-01T00:00Z'),
  ('${C1}', 2, 'nutritionist', 'active', '2024-02-01T00:00Z'),
  ('${C2}', 1, 'trainer', 'trialing', '2025-01-01T00:00Z'),
  ('${C3}', 2, 'nutritionist', 'past_due', '2025-03-01T00:00Z'),
  ('${C8}', 2, 'nutritionist', 'active', '2025-04-01T00:00Z'),
  ('${C4}', 1, 'trainer', 'canceled', '2022-06-15T00:00Z'),
  ('${C5}', 1, 'trainer', 'incomplete', '2020-01-01T00:00Z'),
  ('${C6}', 2, 'nutritionist', 'pending', '2019-01-01T00:00Z'),
  ('${C7}', 3, 'trainer', 'active', '2017-01-01T00:00Z'),
  ('${C7}', 1, 'nutritionist', 'active', '2017-01-01T00:00Z');
-- A's library: P1 a program, P2 a single-day workout, P3 unpublished, P4 published and nobody on it,
-- M1 a meal plan. BP is B's.
insert into public.coach_plans (id, owner_id, kind, published, detail) values
  ('${P1}', '${A}', 'program', true, '{"buildType":"program"}'),
  ('${P2}', '${A}', 'program', true, '{"buildType":"workout"}'),
  ('${P3}', '${A}', 'program', false, '{}'),
  ('${P4}', '${A}', 'program', true, '{}'),
  ('${M1}', '${A}', 'meal_plan', true, '{}'),
  ('${BP}', '${B}', 'program', true, '{}');
-- On P1: C1 (two weeks ahead, one client) and C2. Not on it: C4 (no open subscription), C3 (pays A as
-- nutritionist, not trainer), C1's past week only counts with an upcoming one, C2's archived P4 week.
insert into public.client_workouts (trainer_id, client_id, status, scheduled_date, payload) values
  (1, '${C1}', 'published', current_date + 3, '{"template":{"id":"${P1}"}}'),
  (1, '${C1}', 'published', current_date + 10, '{"template":{"id":"${P1}"}}'),
  (1, '${C2}', 'published', current_date + 1, '{"template":{"id":"${P1}"}}'),
  (1, '${C4}', 'published', current_date + 1, '{"template":{"id":"${P1}"}}'),
  (1, '${C3}', 'published', current_date + 1, '{"template":{"id":"${P1}"}}'),
  (1, '${C2}', 'archived', current_date + 1, '{"template":{"id":"${P4}"}}'),
  (1, '${C2}', 'published', current_date - 5, '{"template":{"id":"${P4}"}}'),
  (1, '${C2}', 'published', current_date + 1, '{"template":{"id":"${P2}"}}'),
  (3, '${C7}', 'published', current_date + 1, '{"template":{"id":"${BP}"}}');
-- On M1: C3 and C1 (published); C1's older archived one does not add, and C8, a client now whose
-- only M1 plan is archived, is not on it.
insert into public.client_meal_plans (nutritionist_id, client_id, status, payload) values
  (2, '${C3}', 'published', '{"template":{"id":"${M1}"}}'),
  (2, '${C1}', 'published', '{"template":{"id":"${M1}"}}'),
  (2, '${C1}', 'archived', '{"template":{"id":"${M1}"}}'),
  (2, '${C8}', 'archived', '{"template":{"id":"${M1}"}}'),
  (1, '${C7}', 'published', '{"template":{"id":"${M1}"}}');
-- PV is private, FR friends-only with FRIEND a DM friend; each coached one session.
insert into public.user_goals values ('${PV}', 'client_settings', '{"profileVisibility":"Private"}'), ('${FR}', 'client_settings', '{"profileVisibility":"Friends"}');
insert into public.sessions (provider_id, provider_role, client_name, scheduled_at, status) values (5, 'trainer', 'x', now() - interval '1 day', 'completed'), (6, 'trainer', 'x', now() - interval '1 day', 'completed');
insert into public.conversations values ('${U(301)}', 'dm:a'), ('${U(302)}', null);
insert into public.conversation_participants values ('${U(301)}', '${FR}'), ('${U(301)}', '${FRIEND}'), ('${U(302)}', '${FR}'), ('${U(302)}', '${STRANGER}');
-- TZ's first session: noon UTC on 31 December 2023, already 2024 in Kiritimati (UTC+14).
insert into public.sessions (provider_id, provider_role, client_name, scheduled_at, status) values (7, 'trainer', 'x', '2023-12-31T12:00Z', 'completed');
`;

let db = null;
const setPublic = async (uid, keys) => {
  await db.query('reset role');
  if (keys === undefined) await db.query(`delete from public.user_goals where user_id = $1 and kind = 'profile_custom'`, [uid]);
  else await db.query(`insert into public.user_goals values ($1, 'profile_custom', $2) on conflict (user_id, kind) do update set data = excluded.data`, [uid, JSON.stringify({ bio: 'x', publicStats: keys })]);
};
// The function as `role`, signed in as `uid` (null: signed out).
const as = async (role, uid, owner) => {
  await db.query('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  await db.query(`set role ${role}`);
  try {
    const r = await db.query('select * from public.get_coach_public_stats($1)', [owner]);
    assert.equal(r.rows.length, 1, 'always one row');
    return r.rows[0];
  } finally { await db.query('reset role'); }
};
const NULLS = { sessions_coached: null, active_clients: null, coaching_since: null, program_clients: null };
const A_FIGURES = { sessions_coached: 5, active_clients: 4, coaching_since: 2022, program_clients: { [P1]: 2, [P4]: 0, [M1]: 2 } };

test('on PostgreSQL 16: the migration applies, twice, as the house rules ask', { skip: NO_DB }, async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SQL);
  await db.exec(SQL); // idempotent: create or replace, revoke, grant, and the guard passes again
  await db.exec(FIXTURES);
  const fn = (await db.query(`select p.prosecdef, p.provolatile, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as authed, has_function_privilege('nobody', p.oid, 'execute') as nobody
    from pg_proc p where p.proname = 'get_coach_public_stats'`)).rows;
  assert.equal(fn.length, 1, 'one signature');
  assert.deepEqual(fn[0], { prosecdef: true, provolatile: 's', proconfig: ['search_path=public, pg_temp'], anon: true, authed: true, nobody: false });
  // anon reads none of these tables itself: only the function's counts.
  await db.query('set role anon');
  await assert.rejects(db.query('select count(*) from public.sessions'), /permission denied/);
  await db.query('reset role');
});

test('nothing public: all null, to anyone, the coach included', { skip: NO_DB }, async () => {
  for (const keys of [undefined, [], 'sessions', [1, { sessions: true }], ['SESSIONS', ' clients'], { 0: 'sessions' }]) {
    await setPublic(A, keys);
    assert.deepEqual(await as('anon', null, A), NULLS, JSON.stringify(keys));
    assert.deepEqual(await as('authenticated', A, A), NULLS, `the owner, ${JSON.stringify(keys)}`);
  }
  // A key past the first sixteen entries is not read (as the app's cleaner).
  await setPublic(A, [...Array(16).fill('x'), 'sessions']);
  assert.deepEqual(await as('anon', null, A), NULLS);
  // A doc with no profile_custom at all, and an unknown account.
  assert.deepEqual(await as('anon', null, U(999)), NULLS);
  assert.deepEqual(await as('anon', null, null), NULLS);
});

test('each switch alone returns that figure alone, counted over both of the coach\'s roles', { skip: NO_DB }, async () => {
  const col = { sessions: 'sessions_coached', clients: 'active_clients', since: 'coaching_since', programClients: 'program_clients' };
  for (const k of ALL) {
    await setPublic(A, [k]);
    const row = await as('anon', null, A);
    assert.deepEqual(row, { ...NULLS, [col[k]]: A_FIGURES[col[k]] }, k);
  }
  await setPublic(A, ['programClients', 'sessions', 'since', 'clients', 'sessions']);
  assert.deepEqual(await as('anon', null, A), A_FIGURES, 'all four, in any order, each once');
  assert.deepEqual(await as('authenticated', STRANGER, A), A_FIGURES, 'a public profile is public to a stranger too');
  // Nothing per client leaves: the plan counts are numbers keyed by A's own plan ids.
  const row = await as('anon', null, A);
  assert.deepEqual(Object.keys(row.program_clients).sort(), [P1, P4, M1].sort());
  for (const v of Object.values(row.program_clients)) assert.equal(typeof v, 'number');
  assert.ok(!JSON.stringify(row).includes(C1.slice(-6)), 'no client id');
});

test('0 is measured, null is not public: a coach with nothing yet', { skip: NO_DB }, async () => {
  await setPublic(Z, ALL);
  assert.deepEqual(await as('anon', null, Z), { sessions_coached: 0, active_clients: 0, coaching_since: 0, program_clients: {} });
  await setPublic(Z, ['sessions']);
  assert.deepEqual(await as('anon', null, Z), { ...NULLS, sessions_coached: 0 });
  // An account with no provider row is no coach: nulls, whatever its doc says.
  await setPublic(N, ALL);
  assert.deepEqual(await as('anon', null, N), NULLS);
  assert.deepEqual(await as('authenticated', N, N), NULLS);
});

test('a private profile: nulls to anon and a stranger, figures to its owner; friends-only to a DM friend', { skip: NO_DB }, async () => {
  await setPublic(PV, ['sessions']);
  assert.deepEqual(await as('anon', null, PV), NULLS);
  assert.deepEqual(await as('authenticated', STRANGER, PV), NULLS);
  assert.deepEqual(await as('authenticated', PV, PV), { ...NULLS, sessions_coached: 1 });
  await setPublic(FR, ['sessions']);
  assert.deepEqual(await as('anon', null, FR), NULLS);
  assert.deepEqual(await as('authenticated', STRANGER, FR), NULLS, 'a conversation that is not a DM makes no friend');
  assert.deepEqual(await as('authenticated', FRIEND, FR), { ...NULLS, sessions_coached: 1 });
  assert.deepEqual(await as('authenticated', FR, FR), { ...NULLS, sessions_coached: 1 });
  // The service role (the server) is a caller like any other: it sees what the profile shows.
  assert.deepEqual(await as('service_role', null, PV), NULLS);
});

test('coaching since is the year in the coach\'s own zone; a zone Postgres does not know is UTC', { skip: NO_DB }, async () => {
  await setPublic(TZ, ['since']);
  assert.deepEqual(await as('anon', null, TZ), { ...NULLS, coaching_since: 2024 });
  await db.query(`update public.profiles set timezone = 'UTC' where id = $1`, [TZ]);
  assert.deepEqual(await as('anon', null, TZ), { ...NULLS, coaching_since: 2023 });
  // A's zone is junk: read as UTC, and the call does not fail.
  await setPublic(A, ['since']);
  assert.deepEqual(await as('anon', null, A), { ...NULLS, coaching_since: 2022 });
  await db.close();
});
