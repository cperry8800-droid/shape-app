// A client's break (supabase-migrations/2026-11-11-client-pause.sql), run for real.
//
// THE DATABASE HALF runs the migration file as written on PostgreSQL (PGlite, Postgres compiled to
// WebAssembly), over stand-ins for the tables and the one function it reads, with Supabase's roles,
// as the member, their coach, a stranger and nobody. PGlite is not a dependency of this repo: the half
// runs when `@electric-sql/pglite` resolves, from here or from the folder in SHAPE_PGLITE, and is
// skipped, by name, otherwise (tests/coach-public-stats-sql.test.mjs does the same). The static half
// is tests/client-pause.test.mjs.
//
// What it pins (Codex on #2705): a break is one row from its first day to its last, kept after it
// ends; ending early keeps the days it covered and a break begun today leaves none; a new break after
// one has ended is a new row; the days are the member's own; and the first run's one-row-a-client
// table becomes this one in place, its row kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(ROOT, 'supabase-migrations/2026-11-11-client-pause.sql'), 'utf8');

function loadPglite() {
  for (const base of [join(ROOT, 'package.json'), process.env.SHAPE_PGLITE ? join(process.env.SHAPE_PGLITE, 'package.json') : null]) {
    if (!base) continue;
    try { return createRequire(base)('@electric-sql/pglite').PGlite; } catch (e) { /* not here */ }
  }
  return null;
}
const PGlite = loadPglite();
const NO_DB = PGlite ? false : 'PGlite is not installed (set SHAPE_PGLITE to a folder that has @electric-sql/pglite)';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const M = U(1), COACH = U(2), STRANGER = U(3), K = U(4), OLD = U(5);

const SCHEMA = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, timezone text);
create table public.trainers (id bigint primary key, owner_id uuid);
create table public.subscriptions (client_id uuid, provider_id bigint not null, provider_role text not null, status text not null);
-- A stand-in for the live function: the caller holds an active, trialing or past-due trainer
-- subscription on the client.
create function public.is_coach_on_client(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions s join public.trainers t on t.id = s.provider_id
    where s.client_id = p and s.provider_role = 'trainer' and s.status in ('active', 'trialing', 'past_due') and t.owner_id = auth.uid())
$$;
grant execute on function public.is_coach_on_client(uuid) to authenticated;
insert into auth.users values ('${M}'), ('${COACH}'), ('${STRANGER}'), ('${K}'), ('${OLD}');
insert into public.profiles values ('${K}', 'Pacific/Kiritimati'), ('${M}', 'Not/AZone');
insert into public.trainers values (1, '${COACH}');
insert into public.subscriptions values ('${M}', 1, 'trainer', 'active');
`;
// The table as this file's first run left it on 2026-11-11: one row a client, keyed on it.
const FIRST_RUN = `
create table public.client_pauses (
  client_id   uuid primary key references auth.users (id) on delete cascade,
  until_on    date not null,
  set_by      uuid references auth.users (id) on delete set null,
  set_by_role text not null check (set_by_role in ('member', 'trainer', 'nutritionist')),
  set_at      timestamptz not null default now()
);
insert into public.client_pauses values ('${OLD}', current_date + 4, '${OLD}', 'member', now() - interval '2 days');
`;

let db = null;
const reset = () => db.query('reset role');
// `fn` as `role`, signed in as `uid` (null: signed out).
async function as(uid, sql, params = [], role = 'authenticated') {
  await reset();
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  await db.query(`set role ${role}`);
  try { return (await db.query(sql, params)).rows; } finally { await reset(); }
}
const setPause = (uid, client, until) => as(uid, 'select public.set_client_pause($1, $2::date) as r', [client, until]).then((r) => r[0].r);
const getPause = (uid, client) => as(uid, 'select until_on::text as until, set_by_role as by, set_by_me as mine from public.get_client_pause($1)', [client]);
const rows = async (client) => { await reset(); return (await db.query('select from_on::text as "from", until_on::text as until, set_by_role as by from public.client_pauses where client_id = $1 order by id', [client])).rows; };
// A day in UTC's calendar (the member with no zone, or one Postgres does not know), `n` days on.
const day = async (n, zone = 'UTC') => { await reset(); return (await db.query(`select ((now() at time zone '${zone}')::date + $1::int)::text as d`, [n])).rows[0].d; };
const code = (re) => (e) => { assert.match(String(e && e.code), re); return true; };

test('on PostgreSQL: the migration turns the first run\'s table into one row a break, and runs again', { skip: NO_DB }, async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(FIRST_RUN);
  await db.exec(SQL);
  await db.exec(SQL); // and again: nothing changes the second time, and the guard passes
  const cols = (await db.query(`select column_name, is_nullable from information_schema.columns where table_name = 'client_pauses' order by ordinal_position`)).rows;
  assert.deepEqual(cols.map((c) => c.column_name).sort(), ['client_id', 'from_on', 'id', 'set_at', 'set_by', 'set_by_role', 'until_on']);
  assert.ok(cols.every((c) => c.column_name === 'set_by' || c.is_nullable === 'NO'), 'every column but the setter is required');
  // The first run's row is kept, from the day it was set.
  assert.deepEqual(await rows(OLD), [{ from: await day(-2), until: await day(4), by: 'member' }]);
  const fns = (await db.query(`select proname, prosecdef, proconfig from pg_proc where proname in ('set_client_pause', 'get_client_pause') order by proname`)).rows;
  assert.deepEqual(fns.map((f) => [f.proname, f.prosecdef, f.proconfig]), [
    ['get_client_pause', true, ['search_path=public, pg_temp']], ['set_client_pause', true, ['search_path=public, pg_temp']]]);
  // Nobody signed in reads or writes the table itself.
  await assert.rejects(as(M, 'select * from public.client_pauses'), /permission denied/);
  await assert.rejects(as(null, 'select public.set_client_pause($1, current_date)', [M], 'anon'), /permission denied/);
  // A break can't end before it begins.
  await reset();
  await assert.rejects(db.query(`insert into public.client_pauses (client_id, from_on, until_on, set_by_role) values ('${M}', current_date, current_date - 1, 'member')`), /client_pauses_days/);
});

test('a break is set by the member or their coach, begins today, and its end moves on the same row', { skip: NO_DB }, async () => {
  await assert.rejects(setPause(null, M, await day(3)), code(/^42501$/), 'signed out');
  await assert.rejects(setPause(STRANGER, M, await day(3)), code(/^42501$/), 'not their member or coach');
  assert.deepEqual(await setPause(M, M, await day(5)), { paused: true, until: await day(5), by: 'member' });
  assert.deepEqual(await rows(M), [{ from: await day(0), until: await day(5), by: 'member' }], 'a zone Postgres does not know is UTC');
  assert.deepEqual(await getPause(M, M), [{ until: await day(5), by: 'member', mine: true }]);
  assert.deepEqual(await getPause(COACH, M), [{ until: await day(5), by: 'member', mine: false }]);
  assert.deepEqual(await getPause(STRANGER, M), [], 'a stranger reads nothing');
  assert.deepEqual(await getPause(null, M), [], 'nor does anyone signed out');
  // The coach moves the end: the same break, now set by them.
  await setPause(COACH, M, await day(8));
  assert.deepEqual(await rows(M), [{ from: await day(0), until: await day(8), by: 'trainer' }]);
  // Begun today and ended today: no day of it has passed, so nothing is left.
  assert.deepEqual(await setPause(M, M, null), { paused: false });
  assert.deepEqual(await rows(M), []);
  assert.deepEqual(await setPause(M, M, null), { paused: false }, 'ending no break is no error');
});

test('ended early, a break keeps the days it covered; the next one is a new row, and read first (Codex on #2705)', { skip: NO_DB }, async () => {
  await reset();
  await db.query(`insert into public.client_pauses (client_id, from_on, until_on, set_by, set_by_role) values ('${M}', current_date - 4, current_date + 6, '${M}', 'member')`);
  await setPause(COACH, M, null);
  assert.deepEqual(await rows(M), [{ from: await day(-4), until: await day(-1), by: 'member' }], 'its last day away is yesterday');
  assert.deepEqual(await getPause(M, M), [{ until: await day(-1), by: 'member', mine: true }], 'still read, for "Back from a break"');
  await setPause(M, M, await day(2));
  assert.deepEqual(await rows(M), [
    { from: await day(-4), until: await day(-1), by: 'member' },
    { from: await day(0), until: await day(2), by: 'member' },
  ]);
  assert.deepEqual(await getPause(COACH, M), [{ until: await day(2), by: 'member', mine: false }], 'the latest break is the one read');
});

test('the 90 days are the member\'s own, a day either side for a device on another calendar, never before today (Codex on #2705)', { skip: NO_DB }, async () => {
  const kz = 'Pacific/Kiritimati'; // UTC+14: usually a day ahead of UTC
  assert.equal((await setPause(K, K, await day(91, kz))).until, await day(91, kz), 'today + 90 on a device a day ahead');
  await assert.rejects(setPause(K, K, await day(92, kz)), code(/^22023$/));
  await assert.rejects(setPause(K, K, await day(-2, kz)), code(/^22023$/));
  // A device a day behind picks its today, the member's yesterday: the break ends today, not before.
  await setPause(K, K, null);
  await reset();
  await db.query(`delete from public.client_pauses where client_id = '${K}'`);
  assert.equal((await setPause(K, K, await day(-1, kz))).until, await day(0, kz));
  assert.deepEqual(await rows(K), [{ from: await day(0, kz), until: await day(0, kz), by: 'member' }]);
  await db.close();
});
