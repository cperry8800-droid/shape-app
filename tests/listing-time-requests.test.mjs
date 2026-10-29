// A time asked of a coach who isn't on Shape yet (the owner, 2026-10-29: sample times "need to be
// clickable"; "Request, saved for her"). The SHIPPED route and module (loadRealModule compiles the
// real files) against a Supabase stand-in that applies the filters it is given and keeps what it is
// told to write; the migration's text; and the copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { PREFERENCE_OF } from '../public/newdesign/notificationSurfaces.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const DAY = 86_400_000;
const MEMBER = { id: '00000000-0000-0000-0000-0000000000aa' };
const OWNERS = ['owner-1', 'owner-2'];

// ── the Supabase stand-in ─────────────────────────────────────────────────────────────────
function world({ trainers = [], nutritionists = [], asks = [], profiles = [], fail = {} } = {}) {
  const tables = { trainers: [...trainers], nutritionists: [...nutritionists], listing_time_requests: [...asks], profiles: [...profiles] };
  const notes = [];
  let seq = 0;
  function from(table) {
    const filters = [];
    let head = false, op = 'select', payload = null;
    const rows = () => (tables[table] || []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (fail[table] || (head && fail[`${table}:count`])) return { data: null, error: { message: `${table} failed` }, count: null };
      if (op === 'insert') {
        const dup = (tables[table] || []).some((r) => r.provider_role === payload.provider_role && r.provider_id === payload.provider_id && r.member_id === payload.member_id && r.slot_start === payload.slot_start);
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const row = { id: `ask-${++seq}`, created_at: new Date().toISOString(), ...payload };
        tables[table].push(row);
        return { data: row, error: null };
      }
      const found = rows();
      return head ? { data: null, error: null, count: found.length } : { data: found, error: null };
    };
    const chain = {
      select(cols, opts) { if (op !== 'insert') op = 'select'; head = !!(opts && opts.head); return chain; },
      insert(row) { op = 'insert'; payload = row; return chain; },
      eq(k, v) { filters.push((r) => r[k] === v); return chain; },
      gte(k, v) { filters.push((r) => r[k] >= v); return chain; },
      limit() { return chain; },
      order() { return chain; },
      async maybeSingle() { const r = run(); return { data: r.data ? (Array.isArray(r.data) ? r.data[0] || null : r.data) : null, error: r.error }; },
      async single() { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return chain;
  }
  return { from, tables, notes };
}

let mods = null;
let current = null;
let caller = MEMBER;
async function load() {
  if (mods) return mods;
  const nextServer = require('next/server');
  const ts = (f, registry = new Map()) => loadRealModule(join(ROOT, f), { typescript: true, registry });
  const requestUtils = await ts('src/lib/request-utils.ts', new Map([['next/server', nextServer]]));
  const notify = { createNotification: async (_c, n, copy) => { current.notes.push({ ...n, copy: copy || null }); return true; } };
  const asks = await ts('src/lib/listing-requests.ts', new Map([
    ['@/lib/notify', notify],
    ['@/lib/payment-notices', { ownerAccountIds: async () => OWNERS }],
  ]));
  const route = await ts('src/app/api/listing-requests/route.ts', new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/admin', { createAdminClient: () => current }],
    ['@/lib/request-auth', { currentUser: async () => caller }],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/listing-requests', asks],
  ]));
  mods = { asks, route };
  return mods;
}
async function post(body) {
  const { route } = await load();
  const req = new Request('https://shape.test/api/listing-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const res = await route.POST(req);
  return { status: res.status, body: await res.json() };
}
const LEAH = { id: 7, name: 'Leah Okafor', owner_id: null };
const at = (ms) => new Date(Date.now() + ms).toISOString();
const ask = (over = {}) => ({ role: 'trainer', providerId: 7, at: at(2 * DAY), durationMin: 15, note: 'Knee rehab', ...over });

test('a member asks a sample time: kept against the listing, and each owner told', async () => {
  current = world({ trainers: [LEAH], profiles: [{ id: MEMBER.id, full_name: 'Sam Rivera' }] });
  caller = MEMBER;
  const when = at(2 * DAY);
  const r = await post(ask({ at: when, memberId: 'someone-else', member_id: 'someone-else' }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
  const [row] = current.tables.listing_time_requests;
  assert.equal(row.member_id, MEMBER.id, 'the account, not the body, says who asked');
  assert.deepEqual([row.provider_role, row.provider_id, row.duration_min, row.note], ['trainer', 7, 15, 'Knee rehab']);
  assert.equal(current.notes.length, 2);
  for (const [i, n] of current.notes.entries()) {
    assert.equal(n.userId, OWNERS[i]);
    assert.equal(n.type, 'listing_request');
    assert.equal(n.route, 'admin');
    assert.equal(n.title, 'A time asked of Leah Okafor');
    assert.match(n.body, /^Sam Rivera asked Leah Okafor, who isn't on Shape yet, for .+ UTC \(15 min\)\. Their note: "Knee rehab"$/);
    assert.equal(n.data.dedupe, `ask:${row.id}`);
  }
  // The same time again is the same ask: done, nothing stored twice, nobody told twice.
  const again = await post(ask({ at: when }));
  assert.equal(again.status, 200);
  assert.equal(again.body.already, true);
  assert.equal(current.tables.listing_time_requests.length, 1);
  assert.equal(current.notes.length, 2);
});

test('signed out, a listing on Shape or gone, and a bad ask are refused, and nothing is stored', async () => {
  current = world({ trainers: [LEAH, { id: 8, name: 'Dee', owner_id: 'coach-8' }], nutritionists: [{ id: 7, name: 'Nia', owner_id: null }] });
  caller = null;
  assert.equal((await post(ask())).status, 401);
  caller = MEMBER;
  const claimed = await post(ask({ providerId: 8 }));
  assert.equal(claimed.status, 409);
  assert.equal(claimed.body.code, 'claimed');
  const gone = await post(ask({ providerId: 99 }));
  assert.equal(gone.status, 404);
  assert.equal(gone.body.code, 'no_listing');
  for (const [over, code] of [
    [{ role: 'gym' }, 'role'], [{ providerId: '7' }, 'listing'], [{ providerId: 0 }, 'listing'], [{ at: 'soon' }, 'time'],
    [{ at: at(5 * 60_000) }, 'time_past'], [{ at: at(-DAY) }, 'time_past'], [{ at: at(61 * DAY) }, 'time_far'],
    [{ durationMin: 4 }, 'length'], [{ durationMin: 15.5 }, 'length'], [{ durationMin: 241 }, 'length'],
    [{ note: 5 }, 'note'], [{ note: 'x'.repeat(501) }, 'note_long'],
  ]) {
    const r = await post(ask(over));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.body.code, code, JSON.stringify(over));
  }
  assert.equal(current.tables.listing_time_requests.length, 0);
  assert.equal(current.notes.length, 0);
  // A nutritionist's listing is read from its own table.
  assert.equal((await post(ask({ role: 'nutritionist' }))).status, 200);
  assert.equal(current.tables.listing_time_requests[0].provider_role, 'nutritionist');
});

test('a member waits on 3 times per listing and asks 10 a day; past times don\'t count as waiting', async () => {
  const mine = (i, over = {}) => ({ id: `old-${i}`, provider_role: 'trainer', provider_id: 7, member_id: MEMBER.id, slot_start: at((i + 1) * DAY), duration_min: 15, created_at: new Date(Date.now() - 2 * DAY).toISOString(), ...over });
  current = world({ trainers: [LEAH], asks: [mine(1), mine(2), mine(3)] });
  caller = MEMBER;
  const full = await post(ask({ at: at(9 * DAY) }));
  assert.equal(full.status, 409);
  assert.equal(full.body.code, 'too_many');
  current = world({ trainers: [LEAH], asks: [mine(1), mine(2), mine(3, { slot_start: at(-DAY) })] });
  assert.equal((await post(ask({ at: at(9 * DAY) }))).status, 200, 'a time already passed is no longer waiting');
  const today = Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, provider_role: 'trainer', provider_id: 100 + i, member_id: MEMBER.id, slot_start: at(DAY), duration_min: 15, created_at: new Date().toISOString() }));
  current = world({ trainers: [LEAH], asks: today });
  const capped = await post(ask());
  assert.equal(capped.status, 429);
  assert.equal(capped.body.code, 'daily_cap');
  current = world({ trainers: [LEAH], asks: today.slice(0, 9) });
  assert.equal((await post(ask())).status, 200, 'the tenth of the day is fine');
  current = world({ trainers: [LEAH], fail: { 'listing_time_requests:count': true } });
  assert.equal((await post(ask())).status, 500, 'a cap that can\'t be read is not passed');
  assert.equal(current.tables.listing_time_requests.length, 0, 'and nothing is stored');
});

test('when the listing is claimed, each member who asked is told once, in their own language', async () => {
  const { asks } = await load();
  current = world({ trainers: [LEAH], asks: [
    { id: 'a', provider_role: 'trainer', provider_id: 7, member_id: 'm1' },
    { id: 'b', provider_role: 'trainer', provider_id: 7, member_id: 'm1' },
    { id: 'c', provider_role: 'trainer', provider_id: 7, member_id: 'm2' },
    { id: 'd', provider_role: 'nutritionist', provider_id: 7, member_id: 'm3' },
    { id: 'e', provider_role: 'trainer', provider_id: 8, member_id: 'm4' },
  ] });
  assert.equal(await asks.tellAskers(current, 'trainer', 7), 2);
  assert.deepEqual(current.notes.map((n) => n.userId), ['m1', 'm2'], 'once per member, this listing only');
  const [n] = current.notes;
  assert.equal(n.type, 'listing_joined');
  assert.equal(n.route, 'coach:trainer:7', 'opens their listing');
  assert.equal(n.title, 'Leah Okafor is on Shape now');
  assert.equal(n.body, 'You asked Leah Okafor for a time before they joined. Book one on their listing.');
  assert.equal(n.data.dedupe, 'joined:trainer:7:m1');
  assert.deepEqual(n.copy, { title: ['listingJoined.title', { coach: 'Leah Okafor' }], body: ['listingJoined.body', { coach: 'Leah Okafor' }] });
  current = world({ fail: { listing_time_requests: true } });
  assert.equal(await asks.tellAskers(current, 'trainer', 7), 0, 'a failed read tells nobody and throws nothing');
});

test('the claim tells the askers, and the app asks through the route with its token', () => {
  const claim = read('src/app/dashboard/claim/actions.ts');
  const call = claim.indexOf("await tellAskers(admin, role, providerId)");
  assert.ok(call > claim.indexOf("admin.rpc('claim_provider_row'") && call > claim.indexOf("throw new Error(error.message);"), 'after the claim, never before it or on its failure');
  const backend = read('mobile-app/src/services/shapeBackend.js');
  const askFn = backend.slice(backend.indexOf('async function askListingTime('), backend.indexOf('async function listingAsks('));
  assert.ok(askFn.length > 100, 'the ask function');
  assert.match(askFn, /fetch\(`\$\{apiBaseUrl \|\| ''\}\/api\/listing-requests`/);
  assert.match(askFn, /headers: \{ 'Content-Type': 'application\/json', Authorization: `Bearer \$\{token\}` \}/, 'the account\'s token, as a booking sends it');
  assert.match(askFn, /if \(!token\) throw/, 'signed out, nothing is sent');
  assert.match(backend, /window\.ShapeListingAsks = \{ ask: askListingTime, forListing: listingAsks \};/);
  assert.equal(PREFERENCE_OF.listing_request, 'sessions');
  assert.equal(PREFERENCE_OF.listing_joined, 'sessions');
});

test('the migration: members read their own asks, the coach reads theirs once the listing is theirs, nobody writes through the API', () => {
  const sql = read('supabase-migrations/2026-10-29-listing-time-requests.sql');
  assert.match(sql, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(sql, /\$guard\$;\n\ncommit;\n$/);
  assert.match(sql, /create table if not exists public\.listing_time_requests/);
  assert.match(sql, /member_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /constraint listing_time_requests_once unique \(provider_role, provider_id, member_id, slot_start\)/);
  assert.match(sql, /alter table public\.listing_time_requests enable row level security;/);
  for (const role of ['public', 'anon', 'authenticated']) assert.ok(sql.includes(`revoke all on table public.listing_time_requests from ${role};`), role);
  assert.match(sql, /grant select on table public\.listing_time_requests to authenticated;/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)/i);
  assert.equal((sql.match(/\n  for select to authenticated\n/g) || []).length, 2, 'two read policies, no other');
  assert.doesNotMatch(sql, /for (insert|update|delete|all) /i);
  assert.match(sql, /using \(member_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /t\.id = provider_id and t\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /n\.id = provider_id and n\.owner_id = \(select auth\.uid\(\)\)/);
  const guard = sql.slice(sql.indexOf('do $guard$'), sql.lastIndexOf('$guard$;'));
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((x) => x.trim()).length : 0;
    assert.equal(pct, args, m[1]);
  }
});

test('the copy: every locale says the ask, the coach\'s list and the joined notice', () => {
  const KEYS = ['ask', 'askTitle', 'asked', 'askedBody', 'askSub', 'askNotePh', 'asking', 'askCta', 'askClaimed', 'askTooMany', 'askDailyCap', 'askPast', 'askFailed', 'asksTitle', 'asksSub', 'askMember', 'askPassed', 'asksSetHours'];
  for (const loc of ['en', 'de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const profile = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/profile.json`));
    for (const k of KEYS) assert.ok(profile[`trainer.${k}`], `${loc} trainer.${k}`);
    for (const k of ['askedBody', 'askNotePh', 'askClaimed', 'askTooMany']) assert.match(profile[`trainer.${k}`], /\{name\}/, `${loc} trainer.${k} names the coach`);
    assert.match(profile['trainer.askSub'], /\{minutes\}/);
    assert.match(profile['trainer.asksSub'], /\{count, plural,/);
    const notice = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/notice.json`));
    assert.match(notice['listingJoined.title'], /\{coach\}/, loc);
    assert.match(notice['listingJoined.body'], /\{coach\}/, loc);
  }
});
