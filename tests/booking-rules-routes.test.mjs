// The coach routes behind "Protect your time" (2026-10-07): /api/my-booking-rules and
// /api/my-time-off. These drive the SHIPPED handlers (loadRealModule compiles the real files,
// and the rule module they import is the real one) against a Supabase stand-in that applies the
// filters it is given and keeps what it is told to write — so a GET after a POST reads what the
// POST stored, and a route that forgets to scope a delete deletes the wrong row here too.
//
// ⚠ THE ROUTES READ THE REAL CLOCK (Date.now()), so every fixed date below is years ahead, and
// the "last 30 days" fixtures are placed relative to now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const NY = 'America/New_York';
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString();

// ── the Supabase stand-in ─────────────────────────────────────────────────────────────────
// `missing` names tables that do not exist yet (PostgREST 12 answers PGRST205), `fail` tables
// whose every query errors for another reason. Writes land in `tables`, and `writes` records
// each payload as it was sent.
const DEFAULTS = {
  provider_booking_rules: { buffer_min: 0, max_per_day: null, min_notice_hours: 0 },
  provider_time_off: { note: null },
};
function db({ tables = {}, missing = [], fail = [], user = { id: 'coach-1' } } = {}) {
  const writes = [];
  const err = (table) => (missing.includes(table)
    ? { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` }
    : fail.includes(table) ? { code: 'XX000', message: `fake failure on ${table}` } : null);
  function from(table) {
    const st = { op: 'select', filters: [], orders: [], limit: null, single: null, payload: null, onConflict: null };
    const rows = () => (tables[table] ??= []);
    const project = (r, cols) => {
      if (!cols || cols === '*') return { ...r };
      const out = {};
      for (const c of cols.split(',').map((x) => x.trim())) if (c in r) out[c] = r[c];
      return out;
    };
    const run = () => {
      const e = err(table);
      if (e) return { data: null, error: e };
      const match = (r) => st.filters.every((f) => f(r));
      let out;
      if (st.op === 'insert') {
        const row = { id: randomUUID(), created_at: iso(Date.now()), ...DEFAULTS[table], ...st.payload };
        rows().push(row);
        writes.push({ table, op: 'insert', payload: st.payload });
        out = [row];
      } else if (st.op === 'upsert') {
        writes.push({ table, op: 'upsert', payload: st.payload, onConflict: st.onConflict });
        const keys = st.onConflict.split(',');
        const hit = rows().find((r) => keys.every((k) => r[k] === st.payload[k]));
        // PostgREST's merge-duplicates: on a conflict only the columns in the payload change.
        if (hit) { Object.assign(hit, st.payload); out = [hit]; }
        else { const row = { ...DEFAULTS[table], ...st.payload }; rows().push(row); out = [row]; }
      } else if (st.op === 'delete') {
        const gone = rows().filter(match);
        tables[table] = rows().filter((r) => !match(r));
        writes.push({ table, op: 'delete', count: gone.length });
        out = gone;
      } else {
        out = rows().filter(match);
        for (const o of st.orders) out.sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.ascending ? 1 : -1));
        if (st.limit != null) out = out.slice(0, st.limit);
      }
      out = out.map((r) => project(r, st.select));
      if (st.single === 'maybe') {
        if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: out[0] ?? null, error: null };
      }
      if (st.single === 'one') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
      return { data: out, error: null };
    };
    const chain = {
      select(cols) { st.select = cols ?? '*'; return chain; },
      insert(payload) { st.op = 'insert'; st.payload = payload; return chain; },
      upsert(payload, { onConflict } = {}) { st.op = 'upsert'; st.payload = payload; st.onConflict = onConflict; return chain; },
      delete() { st.op = 'delete'; return chain; },
      eq(col, v) { st.filters.push((r) => r[col] === v); return chain; },
      in(col, vs) { st.filters.push((r) => vs.includes(r[col])); return chain; },
      gte(col, v) { st.filters.push((r) => r[col] != null && Date.parse(r[col]) >= Date.parse(v)); return chain; },
      lt(col, v) { st.filters.push((r) => r[col] != null && Date.parse(r[col]) < Date.parse(v)); return chain; },
      order(col, { ascending = true } = {}) { st.orders.push({ col, ascending }); return chain; },
      limit(n) { st.limit = n; return chain; },
      maybeSingle() { st.single = 'maybe'; return chain; },
      single() { st.single = 'one'; return chain; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return chain;
  }
  return { auth: { getUser: async () => ({ data: { user } }) }, from, tables, writes };
}

let mods = null;
let current = null;
async function routes() {
  if (mods) return mods;
  const nextServer = require('next/server');
  const ts = (f, registry = new Map()) => loadRealModule(join(ROOT, f), { typescript: true, registry });
  const time = await ts('src/lib/time.ts');
  const requestUtils = await ts('src/lib/request-utils.ts', new Map([['next/server', nextServer]]));
  const owned = await ts('src/lib/owned-provider.ts', new Map([['@/lib/time', time]]));
  const registry = () => new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/server', { createClient: async () => current }],
    ['@/lib/request-utils', requestUtils],
    ['@/lib/owned-provider', owned],
  ]);
  mods = {
    rules: await ts('src/app/api/my-booking-rules/route.ts', registry()),
    off: await ts('src/app/api/my-time-off/route.ts', registry()),
    owned,
  };
  return mods;
}
async function call(client, route, method, { qs = '', body } = {}) {
  const m = await routes();
  current = client;
  const init = body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await m[route][method](new Request(`https://shape.test/api/x?${qs}`, init));
  return { status: res.status, body: await res.json() };
}

const coach = (zone = NY, extra = {}) => ({
  trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach', timezone: zone }, { id: 8, owner_id: 'coach-2', name: 'Other', timezone: NY }],
  nutritionists: [],
  ...extra,
});

// ── /api/my-booking-rules ─────────────────────────────────────────────────────────────────

test('rules GET: the defaults when nothing is saved, the stored row when it is, and only the caller\'s', async () => {
  const c = db({ tables: coach() });
  const empty = await call(c, 'rules', 'GET', { qs: 'role=trainer' });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, { rules: { bufferMin: 0, maxPerDay: null, minNoticeHours: 0 }, providerId: 7, timezone: NY, saved: false, ready: true });
  c.tables.provider_booking_rules = [
    { provider_role: 'trainer', provider_id: 8, buffer_min: 30, max_per_day: 2, min_notice_hours: 48 },
    { provider_role: 'trainer', provider_id: 7, buffer_min: 15, max_per_day: 6, min_notice_hours: 12 },
  ];
  const saved = await call(c, 'rules', 'GET', { qs: 'role=trainer' });
  assert.deepEqual(saved.body.rules, { bufferMin: 15, maxPerDay: 6, minNoticeHours: 12 });
  assert.equal(saved.body.saved, true);
  // Not a nutritionist: no provider row, the defaults, no id.
  const nutri = await call(c, 'rules', 'GET', { qs: 'role=nutritionist' });
  assert.deepEqual([nutri.status, nutri.body.providerId, nutri.body.rules.bufferMin], [200, null, 0]);
});

// Codex, the review of #2225: owner_id is not unique, and `maybeSingle()` over two owned rows is an
// error, so an account with two trainer rows got a 503 from every call with no way to pick one.
// The lowest id is the account's primary row, as /api/lead-boosts and Stripe Connect already read it.
test('an account that owns two rows for a role gets its primary row (the lowest id), not a 503', async () => {
  const t = coach();
  t.trainers = [{ id: 11, owner_id: 'coach-1', name: 'Second', timezone: NY }, ...t.trainers];
  const c = db({ tables: t });
  const rules = await call(c, 'rules', 'GET', { qs: 'role=trainer' });
  assert.deepEqual([rules.status, rules.body.providerId], [200, 7]);
  const off = await call(c, 'off', 'GET', { qs: 'role=trainer' });
  assert.equal(off.status, 200);
});

test('rules POST: validated, written for the caller\'s own row, and only the fields that were sent', async () => {
  const c = db({ tables: coach() });
  const first = await call(c, 'rules', 'POST', { body: { role: 'trainer', bufferMin: 15, maxPerDay: 6, minNoticeHours: 12 } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { ok: true, rules: { bufferMin: 15, maxPerDay: 6, minNoticeHours: 12 } });
  assert.deepEqual(c.tables.provider_booking_rules.map((r) => [r.provider_role, r.provider_id]), [['trainer', 7]]);
  // A later save of the buffer alone leaves the notice another tab set.
  c.tables.provider_booking_rules[0].min_notice_hours = 24;
  const second = await call(c, 'rules', 'POST', { qs: 'role=trainer', body: { bufferMin: 30 } });
  assert.deepEqual(second.body.rules, { bufferMin: 30, maxPerDay: 6, minNoticeHours: 24 });
  const sent = c.writes.at(-1);
  assert.deepEqual(Object.keys(sent.payload).sort(), ['buffer_min', 'provider_id', 'provider_role', 'updated_at']);
  assert.equal(sent.onConflict, 'provider_role,provider_id');
  // Clearing the limit is a real value.
  assert.equal((await call(c, 'rules', 'POST', { body: { role: 'trainer', maxPerDay: null } })).body.rules.maxPerDay, null);
  // Refused, with the field named, before anything is written.
  const before = c.writes.length;
  for (const body of [{ bufferMin: 121 }, { maxPerDay: 0 }, { minNoticeHours: 400 }, { bufferMin: '15 min' }]) {
    const r = await call(c, 'rules', 'POST', { body: { role: 'trainer', ...body } });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.error, 'invalid_rules');
    assert.equal(r.body.field, Object.keys(body)[0]);
  }
  assert.equal((await call(c, 'rules', 'POST', { body: { role: 'trainer' } })).status, 400, 'nothing to save');
  assert.equal(c.writes.length, before);
  // A member with no provider row cannot create one.
  const member = db({ tables: coach(), user: { id: 'member-1' } });
  assert.equal((await call(member, 'rules', 'POST', { body: { role: 'trainer', bufferMin: 15 } })).status, 404);
  assert.deepEqual(member.writes, []);
});

// ── /api/my-time-off ──────────────────────────────────────────────────────────────────────

test('time off POST: instants, one whole day across the fall-back (25 hours), and a range — stored as instants', async () => {
  const c = db({ tables: coach() });
  const a = await call(c, 'off', 'POST', { body: { role: 'trainer', startsAt: '2030-10-09T13:00:00-04:00', endsAt: '2030-10-09T21:00:00Z', note: ' Recital ' } });
  assert.equal(a.status, 200);
  assert.deepEqual({ ...a.body.timeOff, id: 'x' }, { id: 'x', startsAt: '2030-10-09T17:00:00.000Z', endsAt: '2030-10-09T21:00:00.000Z', note: 'Recital' });
  // Nov 3 2030 is New York's fall-back Sunday: midnight EDT to midnight EST.
  const day = await call(c, 'off', 'POST', { body: { role: 'trainer', date: '2030-11-03', allDay: true } });
  assert.deepEqual([day.body.timeOff.startsAt, day.body.timeOff.endsAt], ['2030-11-03T04:00:00.000Z', '2030-11-04T05:00:00.000Z']);
  const week = await call(c, 'off', 'POST', { body: { role: 'trainer', fromDate: '2030-12-23', toDate: '2030-12-31' } });
  assert.deepEqual([week.body.timeOff.startsAt, week.body.timeOff.endsAt], ['2030-12-23T05:00:00.000Z', '2031-01-01T05:00:00.000Z']);
  assert.deepEqual(c.tables.provider_time_off.map((r) => [r.provider_role, r.provider_id]), [['trainer', 7], ['trainer', 7], ['trainer', 7]]);
});

test('time off POST refuses what it cannot place, and never reads a day as UTC', async () => {
  const c = db({ tables: coach() });
  const refused = [
    [{ startsAt: '2030-10-09T09:00', endsAt: '2030-10-09T17:00' }, 'invalid_time_off'],
    [{ startsAt: '2030-10-09T17:00:00Z', endsAt: '2030-10-09T17:00:00Z' }, 'invalid_time_off'],
    [{ fromDate: '2030-10-01', toDate: '2030-12-31' }, 'invalid_time_off'], // 92 days
    [{ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z' }, 'invalid_time_off'],
  ];
  for (const [body, error] of refused) {
    const r = await call(c, 'off', 'POST', { body: { role: 'trainer', ...body } });
    assert.deepEqual([r.status, r.body.error], [400, error], JSON.stringify(body));
    assert.ok(r.body.detail.length > 10);
  }
  // A coach with no stored zone: whole days are refused, instants are fine.
  const unzoned = db({ tables: coach(null) });
  const day = await call(unzoned, 'off', 'POST', { body: { role: 'trainer', date: '2030-10-12', allDay: true } });
  assert.deepEqual([day.status, day.body.error], [400, 'timezone_required']);
  assert.equal((await call(unzoned, 'off', 'POST', { body: { role: 'trainer', startsAt: '2030-10-12T04:00:00Z', endsAt: '2030-10-13T04:00:00Z' } })).status, 200);
  assert.equal(unzoned.tables.provider_time_off.length, 1);
  assert.equal(c.tables.provider_time_off?.length ?? 0, 0);
  // Signed out, no role, not a coach.
  assert.equal((await call(db({ tables: coach(), user: null }), 'off', 'POST', { body: { role: 'trainer', date: '2030-10-12', allDay: true } })).status, 401);
  assert.equal((await call(c, 'off', 'POST', { body: { role: 'admin', date: '2030-10-12' } })).status, 400);
  assert.equal((await call(db({ tables: coach(), user: { id: 'member-1' } }), 'off', 'POST', { body: { role: 'trainer', date: '2030-10-12' } })).status, 404);
});

test('time off POST says how many booked sessions the new block already covers, and cancels none', async () => {
  const s = (id, at, extra = {}) => ({ id, provider_role: 'trainer', provider_id: 7, scheduled_at: at, duration_min: 60, status: 'confirmed', ...extra });
  const c = db({ tables: coach(NY, { sessions: [
    s('in', '2030-10-14T14:00:00+00:00'),
    s('runs-in', '2030-10-14T03:30:00+00:00'), // starts before the block, ends inside it
    s('ended-before', '2030-10-13T20:00:00+00:00'), // read (the day before), but over before it starts
    s('cancelled', '2030-10-14T15:00:00+00:00', { status: 'cancelled' }),
    s('after', '2030-10-15T14:00:00+00:00'),
    s('other-coach', '2030-10-14T14:00:00+00:00', { provider_id: 8 }),
  ] }) });
  const r = await call(c, 'off', 'POST', { body: { role: 'trainer', date: '2030-10-14', allDay: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.overlapping, 2);
  assert.ok(c.tables.sessions.every((x) => x.status !== 'cancelled' || x.id === 'cancelled'), 'nothing was cancelled');
  // A failed sessions read is "unknown", never "none".
  const blind = db({ tables: coach(NY, { sessions: [] }), fail: ['sessions'] });
  assert.equal((await call(blind, 'off', 'POST', { body: { role: 'trainer', date: '2030-10-14', allDay: true } })).body.overlapping, null);
});

test('time off GET: everything ahead plus the last 30 days, soonest first, with the private note — the caller\'s only', async () => {
  const now = Date.now();
  const row = (id, from, to, extra = {}) => ({ id, provider_role: 'trainer', provider_id: 7, starts_at: iso(now + from * DAY), ends_at: iso(now + to * DAY), note: null, ...extra });
  const c = db({ tables: coach(NY, { provider_time_off: [
    row('later', 20, 22, { note: 'Mexico' }),
    row('long-ago', -45, -40),
    row('recent', -12, -10),
    row('soon', 2, 3),
    row('not-mine', 4, 5, { provider_id: 8 }),
    row('other-role', 4, 5, { provider_role: 'nutritionist' }),
  ] }) });
  const r = await call(c, 'off', 'GET', { qs: 'role=trainer' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.timeOff.map((x) => x.id), ['recent', 'soon', 'later']);
  assert.equal(r.body.timeOff[2].note, 'Mexico');
  assert.deepEqual([r.body.providerId, r.body.timezone, r.body.capped, r.body.ready], [7, NY, false, true]);
});

test('time off GET past the cap keeps the blocks furthest ahead and says it is capped', async () => {
  const now = Date.now();
  const many = Array.from({ length: 205 }, (_, i) => ({ id: `b${String(i).padStart(3, '0')}`, provider_role: 'trainer', provider_id: 7, starts_at: iso(now + (i + 1) * DAY), ends_at: iso(now + (i + 1) * DAY + 3_600_000), note: null }));
  const r = await call(db({ tables: coach(NY, { provider_time_off: many }) }), 'off', 'GET', { qs: 'role=trainer' });
  assert.equal(r.body.timeOff.length, 200);
  assert.equal(r.body.capped, true);
  assert.equal(r.body.timeOff[0].id, 'b005', 'the five nearest fell off, not the five furthest');
  assert.equal(r.body.timeOff.at(-1).id, 'b204');
});

test('time off DELETE removes the caller\'s own block and nobody else\'s', async () => {
  const mine = randomUUID(), theirs = randomUUID();
  const c = db({ tables: coach(NY, { provider_time_off: [
    { id: mine, provider_role: 'trainer', provider_id: 7, starts_at: '2030-10-09T17:00:00Z', ends_at: '2030-10-09T21:00:00Z', note: null },
    { id: theirs, provider_role: 'trainer', provider_id: 8, starts_at: '2030-10-09T17:00:00Z', ends_at: '2030-10-09T21:00:00Z', note: null },
  ] }) });
  const other = await call(c, 'off', 'DELETE', { body: { role: 'trainer', id: theirs } });
  assert.equal(other.status, 404);
  assert.equal(c.tables.provider_time_off.length, 2, 'another coach\'s block survives');
  const ok = await call(c, 'off', 'DELETE', { qs: `role=trainer&id=${mine}` });
  assert.deepEqual([ok.status, ok.body], [200, { ok: true, id: mine }]);
  assert.deepEqual(c.tables.provider_time_off.map((r) => r.id), [theirs]);
  assert.equal((await call(c, 'off', 'DELETE', { body: { role: 'trainer', id: mine } })).status, 404, 'already gone');
  assert.equal((await call(c, 'off', 'DELETE', { body: { role: 'trainer', id: 'not-a-uuid' } })).status, 400);
});

// ── before the migration runs ─────────────────────────────────────────────────────────────

test('before the migration: reads answer with the defaults and an empty list, writes with a clear 503', async () => {
  const c = db({ tables: coach(), missing: ['provider_booking_rules', 'provider_time_off'] });
  const rules = await call(c, 'rules', 'GET', { qs: 'role=trainer' });
  assert.deepEqual([rules.status, rules.body.ready, rules.body.rules], [200, false, { bufferMin: 0, maxPerDay: null, minNoticeHours: 0 }]);
  const off = await call(c, 'off', 'GET', { qs: 'role=trainer' });
  assert.deepEqual([off.status, off.body.ready, off.body.timeOff], [200, false, []]);
  const saveRules = await call(c, 'rules', 'POST', { body: { role: 'trainer', bufferMin: 15 } });
  assert.deepEqual([saveRules.status, saveRules.body.error], [503, 'not_set_up']);
  assert.match(saveRules.body.detail, /Booking rules aren't set up yet/);
  const addOff = await call(c, 'off', 'POST', { body: { role: 'trainer', date: '2030-10-12', allDay: true } });
  assert.deepEqual([addOff.status, addOff.body.error], [503, 'not_set_up']);
  assert.match(addOff.body.detail, /Time off isn't set up yet/);
  assert.equal((await call(c, 'off', 'DELETE', { body: { role: 'trainer', id: randomUUID() } })).status, 503);
});

test('a real failure is not "not set up": it is reported, never answered with defaults', async () => {
  const broken = db({ tables: coach(), fail: ['provider_booking_rules', 'provider_time_off'] });
  assert.equal((await call(broken, 'rules', 'GET', { qs: 'role=trainer' })).status, 503);
  assert.equal((await call(broken, 'off', 'GET', { qs: 'role=trainer' })).status, 503);
  assert.equal((await call(broken, 'rules', 'POST', { body: { role: 'trainer', bufferMin: 15 } })).status, 500);
  assert.equal((await call(broken, 'off', 'POST', { body: { role: 'trainer', date: '2030-10-12', allDay: true } })).status, 500);
  // The coach's own row could not be read: neither "you are not a coach" nor an empty list.
  const noProvider = db({ tables: coach(), fail: ['trainers'] });
  assert.equal((await call(noProvider, 'rules', 'GET', { qs: 'role=trainer' })).status, 503);
  assert.equal((await call(noProvider, 'off', 'GET', { qs: 'role=trainer' })).status, 503);
  // Signed out, and a role that is not one.
  const out = db({ tables: coach(), user: null });
  assert.equal((await call(out, 'rules', 'GET', { qs: 'role=trainer' })).status, 401);
  assert.equal((await call(out, 'off', 'GET', { qs: 'role=trainer' })).status, 401);
  assert.equal((await call(out, 'off', 'GET', { qs: 'role=client' })).status, 400);
});

test('isMissingRelation knows "not set up yet" from every other failure', async () => {
  const { owned } = await routes();
  for (const e of [{ code: 'PGRST205' }, { code: '42P01' }, { code: 'PGRST202' }, { code: '42883' },
    { message: "Could not find the table 'public.provider_time_off' in the schema cache" },
    { message: 'relation "public.provider_time_off" does not exist' }]) assert.equal(owned.isMissingRelation(e), true, JSON.stringify(e));
  for (const e of [null, undefined, {}, { code: '42501', message: 'permission denied for table provider_time_off' }, { code: 'PGRST116' }, 'PGRST205']) {
    assert.equal(owned.isMissingRelation(e), false, JSON.stringify(e));
  }
});

test('both routes are on the war room\'s API surface', async () => {
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
  const table = new Map(warroom.__RAW_ROUTES);
  assert.equal(table.get('/api/my-booking-rules'), 'GET,POST');
  assert.equal(table.get('/api/my-time-off'), 'GET,POST,DELETE');
});
