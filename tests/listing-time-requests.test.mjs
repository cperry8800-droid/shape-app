// A time asked of a coach who isn't on Shape yet (the owner, 2026-10-29: sample times "need to be
// clickable"; "Request, saved for her"). The SHIPPED route and module (loadRealModule compiles the
// real files) against a Supabase stand-in that applies the filters it is given and stores an ask only
// through add_listing_time_request; the migration's text; and the copy.
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
// add_listing_time_request is the migration's function, in its order: the listing, the same time
// again, the day's asks, the times waiting on the listing, then the insert. Its locks (one member at
// a time; the listing's row held against a claim) were probed on a local Postgres 16 (the PR); the
// migration's text test below pins them.
function world({ trainers = [], nutritionists = [], asks = [], profiles = [], fail = {} } = {}) {
  const tables = { trainers: [...trainers], nutritionists: [...nutritionists], listing_time_requests: [...asks], profiles: [...profiles] };
  const notes = [];
  const calls = [];
  let seq = 0;
  async function rpc(name, p) {
    calls.push({ name, params: p });
    if (fail.rpc) return { data: null, error: { message: 'rpc failed' } };
    if (fail.outcome) return { data: [{ outcome: fail.outcome, ask_id: fail.askId ?? null, coach: null }], error: null };
    if (name !== 'add_listing_time_request') return { data: null, error: { message: `no function ${name}` } };
    const listing = tables[p.p_role === 'nutritionist' ? 'nutritionists' : 'trainers'].find((r) => r.id === p.p_provider_id);
    const out = (outcome, id = null) => ({ data: [{ outcome, ask_id: id, coach: listing ? listing.name : null }], error: null });
    if (!listing) return out('no_listing');
    if (listing.owner_id) return out('claimed');
    if (listing.listing_ready === false) return { data: [{ outcome: 'no_listing', ask_id: null, coach: null }], error: null };
    const mine = tables.listing_time_requests.filter((r) => r.member_id === p.p_member_id);
    const here = (r) => r.provider_role === p.p_role && r.provider_id === p.p_provider_id;
    if (mine.some((r) => here(r) && Date.parse(r.slot_start) === Date.parse(p.p_slot_start))) return out('already');
    const now = Date.now();
    if (mine.filter((r) => Date.parse(r.created_at) >= now - DAY).length >= p.p_per_day) return out('daily_cap');
    if (mine.filter((r) => here(r) && Date.parse(r.slot_start) >= now).length >= p.p_per_listing) return out('too_many');
    const row = { id: `ask-${++seq}`, created_at: new Date().toISOString(), provider_role: p.p_role, provider_id: p.p_provider_id, member_id: p.p_member_id, slot_start: p.p_slot_start, duration_min: p.p_duration_min, note: p.p_note };
    tables.listing_time_requests.push(row);
    return out('added', row.id);
  }
  const reads = [];
  function from(table) {
    const filters = [];
    let op = 'select', sort = null, span = null;
    const rows = () => {
      const found = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      if (sort) found.sort((a, b) => (a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0));
      return span ? found.slice(span[0], span[1] + 1) : found;
    };
    const run = () => {
      if (op !== 'select') return { data: null, error: { message: `an ask is stored only through add_listing_time_request, not a ${op} on ${table}` } };
      reads.push({ table, span });
      if (fail[table] || (span && fail[`${table}:from${span[0]}`])) return { data: null, error: { message: `${table} failed` } };
      return { data: rows(), error: null };
    };
    const chain = {
      select() { return chain; },
      insert() { op = 'insert'; return chain; },
      upsert() { op = 'upsert'; return chain; },
      eq(k, v) { filters.push((r) => r[k] === v); return chain; },
      order(k) { sort = k; return chain; },
      range(a, b) { span = [a, b]; return chain; },
      limit() { return chain; },
      async maybeSingle() { const r = run(); return { data: r.data ? r.data[0] || null : null, error: r.error }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return chain;
  }
  return { from, rpc, tables, notes, calls, reads };
}

let mods = null;
let current = null;
let caller = MEMBER;
async function load() {
  if (mods) return mods;
  const nextServer = require('next/server');
  const ts = (f, registry = new Map()) => loadRealModule(join(ROOT, f), { typescript: true, registry });
  const requestUtils = await ts('src/lib/request-utils.ts', new Map([['next/server', nextServer]]));
  // A notice takes a tick to write; `current.sending` counts those in flight, `current.failFor` makes
  // one member's notice throw.
  const notify = { createNotification: async (_c, n, copy) => {
    current.sending = (current.sending || 0) + 1;
    current.mostAtOnce = Math.max(current.mostAtOnce || 0, current.sending);
    await new Promise((r) => setTimeout(r, 0));
    current.sending -= 1;
    if (current.failFor && n.userId === current.failFor) throw new Error('insert failed');
    current.notes.push({ ...n, copy: copy || null });
    return true;
  } };
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
  assert.deepEqual(current.calls.map((c) => c.name), ['add_listing_time_request']);
  assert.deepEqual(current.calls[0].params, {
    p_role: 'trainer', p_provider_id: 7, p_member_id: MEMBER.id, p_slot_start: when, p_duration_min: 15, p_note: 'Knee rehab', p_per_day: 10, p_per_listing: 3,
  }, 'the checked ask, the account and the caps');
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
  // The time goes to the store as the instant the route checked, whatever form the body wrote it in.
  const offset = new Date(Date.parse(when) + DAY).toISOString().replace('Z', '+00:00');
  assert.equal((await post(ask({ at: offset }))).status, 200);
  assert.equal(current.calls.at(-1).params.p_slot_start, new Date(offset).toISOString());
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
  // Off the market (suspended): no listing to ask of (Codex on 6cc407d).
  current.tables.trainers.push({ id: 9, name: 'Off', owner_id: null, listing_ready: false });
  assert.equal((await post(ask({ providerId: 9 }))).body.code, 'no_listing');
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
  current = world({ trainers: [LEAH], fail: { rpc: true } });
  assert.equal((await post(ask())).status, 500, 'a store that fails is not passed');
  assert.equal(current.tables.listing_time_requests.length, 0, 'and nothing is stored');
  assert.equal(current.notes.length, 0, 'and nobody is told');
  for (const [outcome, askId] of [['maybe', 'x-1'], ['added', null]]) {
    current = world({ trainers: [LEAH], fail: { outcome, askId } });
    assert.equal((await post(ask())).status, 500, `${outcome} with ask ${askId} is an error, not a success`);
    assert.equal(current.notes.length, 0);
  }
});

test('Codex on b45850a: the same time asked again is done even at a cap', async () => {
  const when = at(3 * DAY);
  const stored = { id: 'old', provider_role: 'trainer', provider_id: 7, member_id: MEMBER.id, slot_start: when, duration_min: 15, created_at: new Date().toISOString() };
  const others = Array.from({ length: 9 }, (_, i) => ({ ...stored, id: `t-${i}`, provider_id: 100 + i }));
  caller = MEMBER;
  current = world({ trainers: [LEAH], asks: [stored, ...others] });
  const again = await post(ask({ at: when }));
  assert.equal(again.status, 200, 'at the daily cap');
  assert.deepEqual(again.body, { ok: true, already: true });
  const waiting = [stored, { ...stored, id: 'w2', slot_start: at(4 * DAY), created_at: new Date(Date.now() - 2 * DAY).toISOString() }, { ...stored, id: 'w3', slot_start: at(5 * DAY), created_at: new Date(Date.now() - 2 * DAY).toISOString() }];
  current = world({ trainers: [LEAH], asks: waiting });
  assert.deepEqual((await post(ask({ at: when }))).body, { ok: true, already: true }, 'with 3 times waiting on the listing');
  assert.equal((await post(ask({ at: at(6 * DAY) }))).body.code, 'too_many', 'a new time is still refused');
  assert.equal(current.tables.listing_time_requests.length, 3);
  assert.equal(current.notes.length, 0, 'nobody is told again');
});

test('Codex on 126c626: the coach\'s list is the times to come first, then the passed ones newest first, and the count is all of them', async () => {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const body = src.slice(src.indexOf('const ASKS_SHOWN = 100;'), src.indexOf('window.ShapeListingAsks = {'));
  assert.ok(body.includes('async function listingAsks('), 'the function');
  const NOW = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const mk = (i, ms) => ({ id: `r${i}`, member_id: `m${i}`, slot_start: iso(ms), duration_min: 20, note: i === 0 ? 'Knee' : null, created_at: iso(NOW - DAY), provider_role: 'trainer', provider_id: 7 });
  const rows = [
    ...Array.from({ length: 150 }, (_, i) => mk(i, NOW - (i + 1) * 3_600_000)),
    mk(900, NOW + 3 * DAY), mk(901, NOW + DAY), mk(902, NOW + 2 * DAY),
    { ...mk(999, NOW + DAY), provider_id: 8 },
  ];
  const supabase = {
    from(table) {
      assert.equal(table, 'listing_time_requests');
      const f = [];
      let head = false, sort = null, n = Infinity;
      const q = {
        select(_c, opts) { head = !!(opts && opts.head); return q; },
        eq(k, v) { f.push((r) => r[k] === v); return q; },
        gte(k, v) { f.push((r) => r[k] >= v); return q; },
        lt(k, v) { f.push((r) => r[k] < v); return q; },
        neq(k, v) { f.push((r) => r[k] !== v); return q; },
        order(k, o) { sort = [k, o && o.ascending === false ? -1 : 1]; return q; },
        limit(x) { n = x; return q; },
        then(res, rej) {
          let out = rows.filter((r) => f.every((g) => g(r)));
          if (sort) out.sort((a, b) => (a[sort[0]] < b[sort[0]] ? -sort[1] : a[sort[0]] > b[sort[0]] ? sort[1] : 0));
          const r = head ? { data: null, error: null, count: out.length } : { data: out.slice(0, n), error: null };
          return Promise.resolve(r).then(res, rej);
        },
      };
      return q;
    },
    async rpc(name, p) { assert.equal(name, 'get_display_names'); return { data: p.p_ids.filter((id) => id === 'm901').map((id) => ({ user_id: id, full_name: 'Sam Rivera' })), error: null }; },
  };
  const listingAsks = new Function('supabase', 'state', `${body}\nreturn listingAsks;`)(supabase, { user: { id: 'u-coach' } });
  const out = await listingAsks('trainer', 7);
  assert.equal(out.total, 153, 'every ask on the listing, not the 100 shown');
  assert.equal(out.rows.length, 100);
  assert.deepEqual(out.rows.slice(0, 3).map((r) => r.id), ['r901', 'r902', 'r900'], 'the times to come, soonest first');
  assert.deepEqual(out.rows.slice(3, 6).map((r) => r.id), ['r0', 'r1', 'r2'], 'then the passed ones, newest first');
  assert.equal(out.rows[0].name, 'Sam Rivera');
  assert.equal(out.rows[3].note, 'Knee');
  // Nothing to come: the 100 newest passed.
  rows.splice(150);
  const past = await listingAsks('trainer', 7);
  assert.deepEqual([past.total, past.rows.length, past.rows[0].id, past.rows[99].id], [150, 100, 'r0', 'r99']);
  assert.deepEqual(await new Function('supabase', 'state', `${body}\nreturn listingAsks;`)(supabase, { user: null })('trainer', 7), { rows: [], total: 0 }, 'signed out, nothing');
  // With no public id (the coach's listing isn't on the marketplace yet), the asks are every ask the
  // row policy shows them but their own as a member (Codex on 19b138c): here, listing 8's and 7's.
  rows.push({ ...mk(500, NOW + DAY), provider_id: 8 }, { ...mk(501, NOW + 4 * DAY), member_id: 'u-coach', provider_id: 12 });
  const owned = await listingAsks('trainer', null);
  assert.equal(owned.total, 151, 'the 150 on listing 7 and the one on listing 8, never the coach\'s own ask');
  assert.ok(!owned.rows.some((r) => r.memberId === 'u-coach'));
  assert.equal(owned.rows[0].id, 'r500', 'the time to come leads');
});

test('the route is registered in the War Room, once', async () => {
  // RAW_ROUTES is module-private: exported for this read, as tests/recipe-parse-route.test.mjs does.
  const warroom = await loadRealModule(join(ROOT, 'src/lib/warroom.ts'), {
    typescript: true,
    appendExports: 'export const __RAW_ROUTES = RAW_ROUTES;',
    registry: new Map([
      ['fs/promises', { readdir: async () => [], stat: async () => ({}) }],
      ['fs', { existsSync: () => false }],
      ['path', require('path')],
      ['./funnel.mjs', { buildFunnel: () => ({}) }],
      ['./supabase/admin', { createAdminClient: () => null }],
    ]),
  });
  assert.ok(warroom.__RAW_ROUTES.length > 100, 'the route table loaded');
  assert.deepEqual(warroom.__RAW_ROUTES.filter(([p]) => p === '/api/listing-requests'), [['/api/listing-requests', 'POST']]);
});

test('the app asks through the route with its token; the claim itself tells nobody', () => {
  // The askers hear when the claimed listing is ready to book: the migration's trigger, not the claim
  // (Codex on 6cc407d: told at the claim, the notice opened a listing the app can't show yet).
  assert.doesNotMatch(read('src/app/dashboard/claim/actions.ts'), /listing-requests|tellAskers/);
  assert.doesNotMatch(read('src/lib/listing-requests.ts'), /listing_joined|tellAskers/);
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
  // add_listing_time_request (Codex on b45850a): the service role's alone, run as its caller, and
  // every check made after the locks and in the order that keeps the same time asked again done.
  const start = sql.indexOf('create or replace function public.add_listing_time_request(');
  const fn = sql.slice(start, sql.indexOf('\n$$;\n', start));
  assert.ok(start > 0 && fn.length > 500, 'the function');
  assert.match(fn, /\nreturns table \(outcome text, ask_id uuid, coach text\)\nlanguage plpgsql\nset search_path = public, pg_temp\nas \$\$\n/);
  assert.doesNotMatch(fn, /security definer/i);
  const SIG = 'public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer)';
  assert.ok(sql.includes(`revoke all on function ${SIG} from public, anon, authenticated;`));
  assert.ok(sql.includes(`grant execute on function ${SIG} to service_role;`));
  assert.equal((sql.match(/grant execute on function/g) || []).length, 1, 'to nobody else');
  const order = [
    "perform pg_advisory_xact_lock(hashtextextended('listing_time_requests:' || p_member_id::text, 0));",
    'from public.trainers t where t.id = p_provider_id for share;',
    'from public.nutritionists n where n.id = p_provider_id for share;',
    "return query select 'no_listing'::text",
    "if v_owner is not null then\n    return query select 'claimed'::text",
    "and r.member_id = p_member_id and r.slot_start = p_slot_start\n  ) then\n    return query select 'already'::text",
    "where r.member_id = p_member_id and r.created_at >= now() - interval '1 day') >= p_per_day then\n    return query select 'daily_cap'::text",
    "and r.slot_start >= now()) >= p_per_listing then\n    return query select 'too_many'::text",
    'insert into public.listing_time_requests (provider_role, provider_id, member_id, slot_start, duration_min, note)',
    "return query select 'added'::text, v_id, v_coach;",
  ];
  let after = 0;
  for (const step of order) {
    const i = fn.indexOf(step, after);
    assert.ok(i >= 0, `in order: ${step}`);
    after = i + step.length;
  }
  assert.equal((fn.match(/insert into /g) || []).length, 1, 'one insert, after every check');
  const guard = sql.slice(sql.indexOf('do $guard$'), sql.lastIndexOf('$guard$;'));
  assert.match(guard, /v_src not like '%pg_advisory_xact_lock%' or v_src not like '%for share%'/);
  assert.match(guard, /'add_listing_time_request must be the service role''s alone'/);
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((x) => x.trim()).length : 0;
    assert.equal(pct, args, m[1]);
  }
});

test('the migration: each member who asked is told once the claimed listing is ready to book, and an off-market listing takes no asks', () => {
  const sql = read('supabase-migrations/2026-10-29-listing-time-requests.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.listing_time_requests_tell()'), sql.indexOf('\n$$;\n', sql.indexOf('create or replace function public.listing_time_requests_tell()')));
  assert.ok(fn.length > 400, 'the trigger function');
  assert.match(fn, /\nreturns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas \$\$\n/);
  assert.ok(sql.includes('revoke all on function public.listing_time_requests_tell() from public, anon, authenticated;'));
  for (const [table, role] of [['trainers', 'trainer'], ['nutritionists', 'nutritionist']]) {
    assert.ok(sql.includes(`create trigger listing_time_requests_tell
  after update on public.${table}
  for each row
  when (new.owner_id is not null and new.listing_ready and not (old.owner_id is not null and old.listing_ready))
  execute function public.listing_time_requests_tell('${role}');`), `on ${table}: only the change to owned and ready`);
  }
  // The row the app's notices carry: its English, route, dedupe and copy.
  for (const piece of [
    "'listing_joined',",
    "coalesce(v_coach, 'The coach you asked') || ' is on Shape now',",
    "'You asked ' || coalesce(v_coach, 'them') || ' for a time before they joined. Book one on their listing.',",
    "'coach:' || v_role || ':' || new.id::text,",
    "'dedupe', 'joined:' || v_role || ':' || new.id::text || ':' || a.member_id::text,",
    "'copy', jsonb_build_object(\n             'title', jsonb_build_array('listingJoined.title', jsonb_build_object('coach', coalesce(v_coach, 'The coach you asked'))),",
    "'body', jsonb_build_array('listingJoined.body', jsonb_build_object('coach', coalesce(v_coach, 'them')))))",
    "from (select distinct r.member_id from public.listing_time_requests r\n        where r.provider_role = v_role and r.provider_id = new.id) a",
    "on conflict (user_id, type, (data->>'dedupe')) where data ? 'dedupe' do nothing;",
  ]) assert.ok(fn.includes(piece), piece);
  // The English is what the notice catalog's English says, so the bell reads the copy, not the text.
  const notice = JSON.parse(read('mobile-app/src/i18n/catalogs/en/notice.json'));
  assert.equal(notice['listingJoined.title'].replace('{coach}', 'Leah'), 'Leah is on Shape now');
  assert.equal(notice['listingJoined.body'].replace('{coach}', 'Leah'), 'You asked Leah for a time before they joined. Book one on their listing.');
  // The store refuses a listing off the market, after the claim check.
  const store = sql.slice(sql.indexOf('create or replace function public.add_listing_time_request('));
  const claimed = store.indexOf("return query select 'claimed'::text");
  const ready = store.indexOf("  if v_ready is not true then\n    return query select 'no_listing'::text, null::uuid, null::text;");
  assert.ok(claimed > 0 && ready > claimed, 'off the market: no listing');
  assert.ok(store.includes('select true, t.owner_id, t.name, t.listing_ready into v_found, v_owner, v_coach, v_ready'));
  assert.ok(store.includes('select true, n.owner_id, n.name, n.listing_ready into v_found, v_owner, v_coach, v_ready'));
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
