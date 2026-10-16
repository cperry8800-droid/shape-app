// A coach's capacity, end to end (client-onboarding task #10).
//
// Owner, 2026-10-15: "make sure their at capacity toggle works and is routed properly, which
// basically makes it so they cant add new clients, but clients can still be added to waitlist.
// check coaches waitlist works properly also"; on free intros while full: "let the coach decide".
//
// The route runs for real here (src/app/api/coach/capacity/route.ts) over a scripted Supabase; the
// pages it feeds are pinned to the reads they make.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nextServer = require('next/server');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const COACH = 'coach-1';
// This process's zone: the app sends the phone's own (`deviceZone`).
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NOW = Date.parse('2026-10-15T15:00:00Z');

// A small PostgREST stand-in: filters by eq/in, honours order/limit, and answers count/head reads.
function fakeDb(tables, { as = 'caller', fail = {}, writes = [] } = {}) {
  const from = (table) => {
    const filters = [];
    let op = 'select'; let payload = null; let opts = null; let count = false; let lim = Infinity; let off = 0;
    const rows = () => (tables[table] ||= []);
    const match = (r) => filters.every(([k, v, kind]) => (kind === 'in' ? v.includes(r[k]) : kind === 'lte' ? (r[k] != null && Date.parse(r[k]) <= Date.parse(v)) : r[k] === v));
    const run = () => {
      const err = fail[`${table}.${op}`] || fail[table];
      if (err) return { data: null, error: err, count: null };
      if (op === 'upsert') {
        writes.push({ by: as, table, op, payload, opts });
        const keys = String(opts?.onConflict || '').split(',');
        const hit = rows().find((r) => keys.every((k) => r[k] === payload[k]));
        if (hit) Object.assign(hit, payload); else rows().push({ ...payload });
        return { data: null, error: null };
      }
      if (op === 'update') {
        writes.push({ by: as, table, op, payload, filters: filters.slice() });
        const hit = rows().filter(match);
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      const got = rows().filter(match).slice(off, off + lim);
      return { data: count ? null : got.map((r) => ({ ...r })), error: null, count: count ? got.length : null };
    };
    const q = {
      select: (_c, o) => { if (o && o.count) count = true; return q; },
      eq: (k, v) => { filters.push([k, v, 'eq']); return q; },
      in: (k, v) => { filters.push([k, v, 'in']); return q; },
      lte: (k, v) => { filters.push([k, v, 'lte']); return q; },
      order: () => q,
      limit: (n) => { lim = n; return q; },
      range: (a, b) => { off = a; lim = b - a + 1; return q; },
      upsert: (p, o) => { op = 'upsert'; payload = p; opts = o; return q; },
      update: (p) => { op = 'update'; payload = p; return q; },
      maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { from };
}

let mod = null;
async function load() {
  if (mod) return mod;
  const state = { db: null, admin: null, user: null, notices: [] };
  const capacity = await loadRealModule(join(ROOT, 'src/lib/capacity.ts'), { typescript: true });
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const owned = await loadRealModule(join(ROOT, 'src/lib/owned-provider.ts'), { typescript: true, registry: new Map([['@/lib/time', {}], ['@supabase/supabase-js', {}]]) });
  const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });
  const reopen = await loadRealModule(join(ROOT, 'src/lib/capacity-reopen.ts'), { typescript: true });
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/capacity/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => state.admin }],
      ['@/lib/notify', { preferredNotificationOutcome: async (_c, n) => { if (state.notifyFails) return 'failed'; state.notices.push(n); return 'stored'; } }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/capacity', capacity],
      ['@/lib/owned-provider', owned],
      ['@/lib/time', time],
      ['@/lib/capacity-reopen', reopen],
      ['@/lib/waitlist', { resolveRequestClient: async () => (state.user ? { user: state.user, supabase: state.db } : null) }],
    ]),
  });
  mod = { route, state, reopen };
  return mod;
}

const world = (extra = {}) => ({
  trainers: [{ id: 7, owner_id: COACH, name: 'Tom Trainer', at_capacity: false, capacity_resume_at: null }],
  nutritionists: [],
  provider_booking_rules: [],
  coach_waitlist: [
    { id: 'w1', provider_role: 'trainer', provider_id: 7, client_id: 'm1', status: 'waiting', created_at: '2026-10-01' },
    { id: 'w2', provider_role: 'trainer', provider_id: 7, client_id: 'm2', status: 'waiting', created_at: '2026-10-02' },
    { id: 'w3', provider_role: 'trainer', provider_id: 7, client_id: 'm3', status: 'left', created_at: '2026-10-03' },
    { id: 'w4', provider_role: 'trainer', provider_id: 8, client_id: 'm4', status: 'waiting', created_at: '2026-10-03' },
  ],
  ...extra,
});

async function call(method, { tables = world(), body, user = { id: COACH }, fail = {}, notifyFails = false, query = '' } = {}) {
  const { route, state } = await load();
  const writes = [];
  state.db = fakeDb(tables, { as: 'caller', fail, writes });
  state.admin = fakeDb(tables, { as: 'service', fail, writes });
  state.user = user;
  state.notices = [];
  state.notifyFails = notifyFails;
  const Real = Date;
  class Pinned extends Real { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
  globalThis.Date = Pinned;
  const errLog = console.error; console.error = () => {};
  try {
    const req = new Request('https://shape.test/api/coach/capacity' + query, method === 'GET' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await route[method](req);
    return { status: res.status, body: await res.json(), writes, notices: state.notices.slice(), tables };
  } finally { globalThis.Date = Real; console.error = errLog; }
}

test('GET: every listing the coach owns, with what members meet, the intro setting and how many wait', async () => {
  const both = world({
    trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-01T00:00:00Z' }],
    nutritionists: [{ id: 3, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: null }],
    provider_booking_rules: [{ provider_role: 'nutritionist', provider_id: 3, intros_at_capacity: true }],
  });
  const r = await call('GET', { tables: both });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.listings, [
    // Switched on, but the resume date has passed: members meet an open coach.
    { role: 'trainer', providerId: 7, name: 'Tom', atCapacity: true, effective: false, resumeAt: '2026-10-01T00:00:00Z', resumeOn: '2026-10-01', timezone: null, introsAtCapacity: false, waiting: 2 },
    { role: 'nutritionist', providerId: 3, name: 'Tom', atCapacity: true, effective: true, resumeAt: null, resumeOn: null, timezone: null, introsAtCapacity: true, waiting: 0 },
  ]);
  // The resume day is the coach's: 04:00Z on 20 October is midnight that day in New York.
  const ny = await call('GET', { tables: world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-20T04:00:00+00:00', timezone: 'America/New_York' }] }) });
  assert.deepEqual([ny.body.listings[0].resumeOn, ny.body.listings[0].timezone], ['2026-10-20', 'America/New_York']);
  assert.equal((await call('GET', { user: null })).status, 401);
  assert.deepEqual((await call('GET', { user: { id: 'someone-else' } })).body.listings, [], 'nobody else\'s listing');
  assert.equal((await call('GET', { fail: { trainers: { code: 'XX000', message: 'down' } } })).status, 503);
  assert.equal((await call('GET', { fail: { provider_booking_rules: { code: 'XX000', message: 'down' } } })).status, 503);
});

test('POST: pauses the listing for its role, through the coach\'s own client, with an optional resume date', async () => {
  const tables = world();
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: true, resumeAt: '2026-11-01T00:00:00Z' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.listing.effective, true);
  assert.equal(r.body.listing.resumeAt, '2026-11-01T00:00:00.000Z');
  assert.equal(r.body.notified, 0);
  const upd = r.writes.find((w) => w.op === 'update');
  assert.equal(upd.by, 'caller', 'written under the coach\'s own RLS');
  assert.deepEqual(upd.payload, { at_capacity: true, capacity_resume_at: '2026-11-01T00:00:00.000Z' });
  assert.deepEqual(upd.filters.map(([k, v]) => [k, v]), [['id', 7], ['owner_id', COACH]]);
  // Refused before anything is written: a bad role, a missing switch, a date in the past, a year out or without its offset.
  for (const body of [
    { role: 'coach', atCapacity: true },
    { role: 'trainer' },
    { role: 'trainer', resumeAt: '2026-11-01T00:00:00Z' },
    { role: 'trainer', atCapacity: 'yes' },
    { role: 'trainer', atCapacity: true, resumeAt: '2026-10-01T00:00:00Z' },
    { role: 'trainer', atCapacity: true, resumeAt: '2027-12-01T00:00:00Z' },
    { role: 'trainer', atCapacity: true, resumeAt: '2026-11-01T00:00:00' },
    { role: 'trainer', atCapacity: true, introsAtCapacity: 'on' },
  ]) {
    const bad = await call('POST', { body });
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.equal(bad.writes.length, 0, JSON.stringify(body));
  }
  // No listing of that role.
  assert.equal((await call('POST', { body: { role: 'nutritionist', atCapacity: true } })).status, 404);
  assert.equal((await call('POST', { user: null, body: { role: 'trainer', atCapacity: true } })).status, 401);
  // Reopening clears the resume date: first due now, under the coach's own client, then switched off
  // once the list is told (Codex on #2375, P1).
  const paused = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-11-01T00:00:00Z' }], coach_waitlist: [] });
  const open = await call('POST', { tables: paused, body: { role: 'trainer', atCapacity: false, resumeAt: '2026-11-05T00:00:00Z' } });
  assert.deepEqual(open.writes.filter((w) => w.op === 'update').map((w) => [w.by, w.payload]), [
    ['caller', { at_capacity: true, capacity_resume_at: new Date(NOW).toISOString() }],
    ['service', { at_capacity: false, capacity_resume_at: null }],
  ]);
  assert.deepEqual([paused.trainers[0].at_capacity, paused.trainers[0].capacity_resume_at], [false, null]);
  assert.equal(open.body.listing.atCapacity, false);
});

test('POST: a resume day starts at midnight on the coach\'s own clock, never the browser\'s (Codex on #2375)', async () => {
  const listing = (timezone) => world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: false, capacity_resume_at: null, ...(timezone ? { timezone } : {}) }] });
  const paused = async (tables, body) => {
    const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: true, ...body } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { at: r.writes.find((w) => w.op === 'update').payload.capacity_resume_at, listing: r.body.listing };
  };
  // A New York listing paused from a laptop in Tokyo reopens at midnight in New York (EDT, then EST).
  const ny = await paused(listing('America/New_York'), { resumeOn: '2026-10-20', tz: 'Asia/Tokyo' });
  assert.equal(ny.at, '2026-10-20T04:00:00.000Z');
  assert.deepEqual([ny.listing.resumeOn, ny.listing.timezone], ['2026-10-20', 'America/New_York']);
  assert.equal((await paused(listing('America/New_York'), { resumeOn: '2026-11-02' })).at, '2026-11-02T05:00:00.000Z');
  // A listing with no zone yet takes the page's, then UTC.
  assert.equal((await paused(listing(null), { resumeOn: '2026-10-20', tz: 'Asia/Tokyo' })).at, '2026-10-19T15:00:00.000Z');
  assert.equal((await paused(listing(null), { resumeOn: '2026-10-20', tz: 'Not/AZone' })).at, '2026-10-20T00:00:00.000Z');
  assert.equal((await paused(listing(null), { resumeOn: '2026-10-20' })).at, '2026-10-20T00:00:00.000Z');
  // A day that does not exist, in another shape, already begun, or a year out: refused, nothing written.
  for (const resumeOn of ['2026-11-31', '11/02/2026', '2026-10-15', '2027-12-01']) {
    const bad = await call('POST', { tables: listing('America/New_York'), body: { role: 'trainer', atCapacity: true, resumeOn } });
    assert.equal(bad.status, 400, resumeOn);
    assert.equal(bad.body.field, 'resumeOn', resumeOn);
    assert.equal(bad.writes.length, 0, resumeOn);
  }
});

test('a listing with no zone reads its resume day back in the zone it was placed in (Codex on #2375)', async () => {
  const bare = () => world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: false, capacity_resume_at: null }] });
  const tables = bare();
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: true, resumeOn: '2026-10-20', tz: 'Asia/Tokyo' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(tables.trainers[0].capacity_resume_at, '2026-10-19T15:00:00.000Z');
  assert.equal(r.body.listing.resumeOn, '2026-10-20', 'the day picked, not the UTC date of its midnight');
  const back = await call('GET', { tables, query: '?tz=Asia%2FTokyo' });
  assert.equal(back.body.listings[0].resumeOn, '2026-10-20');
  // With no zone sent, UTC, as before; a listing with its own zone ignores the page's.
  assert.equal((await call('GET', { tables })).body.listings[0].resumeOn, '2026-10-19');
  const zoned = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-20T04:00:00.000Z', timezone: 'America/New_York' }] });
  assert.equal((await call('GET', { tables: zoned, query: '?tz=Asia%2FTokyo' })).body.listings[0].resumeOn, '2026-10-20');
});

test('POST: a combined save whose listing write fails puts the intro setting back (Codex on #2375)', async () => {
  const tables = world({ provider_booking_rules: [{ provider_role: 'trainer', provider_id: 7, intros_at_capacity: false }] });
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: true, introsAtCapacity: true }, fail: { 'trainers.update': { code: 'XX000', message: 'down' } } });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'save_failed');
  // (The fake records only writes that succeed; the listing update in between failed.)
  assert.deepEqual(r.writes.map((w) => [w.op, w.table, w.payload.intros_at_capacity]), [
    ['upsert', 'provider_booking_rules', true],
    ['upsert', 'provider_booking_rules', false],
  ], 'the setting it replaced is written back');
  assert.equal(tables.provider_booking_rules[0].intros_at_capacity, false, 'stored state matches the failure the caller was told');
  // The setting it would replace cannot be read: nothing is written at all.
  const unread = await call('POST', { body: { role: 'trainer', atCapacity: true, introsAtCapacity: true }, fail: { 'provider_booking_rules.select': { code: 'XX000', message: 'down' } } });
  assert.equal(unread.status, 503);
  assert.equal(unread.writes.length, 0);
  // The intro setting alone has nothing to undo, and reads nothing first.
  const alone = await call('POST', { body: { role: 'trainer', introsAtCapacity: true }, fail: { 'provider_booking_rules.select': { code: 'XX000', message: 'down' } } });
  assert.equal(alone.status, 200, JSON.stringify(alone.body));
});

test('the hourly job reopens a coach whose resume date passed and tells their list, once (Codex on #2375)', async () => {
  const { reopen } = await load();
  const at = (iso) => iso;
  const tables = world({
    trainers: [
      { id: 7, owner_id: COACH, name: 'Tom Trainer', at_capacity: true, capacity_resume_at: at('2026-10-15T04:00:00+00:00') },
      { id: 8, owner_id: 'coach-2', name: 'Ana', at_capacity: true, capacity_resume_at: at('2026-10-20T04:00:00+00:00') },
      { id: 9, owner_id: 'coach-3', name: 'Bo', at_capacity: true, capacity_resume_at: null },
      { id: 10, owner_id: 'coach-4', name: 'Cy', at_capacity: false, capacity_resume_at: null },
    ],
    nutritionists: [{ id: 3, owner_id: 'coach-5', name: 'Old Date', at_capacity: true, capacity_resume_at: at('2026-09-01T00:00:00+00:00') }],
    coach_waitlist: [
      { id: 'w1', provider_role: 'trainer', provider_id: 7, client_id: 'm1', status: 'waiting', created_at: '2026-10-01' },
      { id: 'w2', provider_role: 'trainer', provider_id: 7, client_id: 'm2', status: 'waiting', created_at: '2026-10-02' },
      { id: 'w3', provider_role: 'trainer', provider_id: 7, client_id: 'm3', status: 'left', created_at: '2026-10-03' },
      { id: 'w4', provider_role: 'nutritionist', provider_id: 3, client_id: 'm4', status: 'waiting', created_at: '2026-10-03' },
    ],
  });
  const writes = [];
  const admin = fakeDb(tables, { as: 'service', writes });
  const notices = [];
  const notify = async (_c, n) => { notices.push(n); return true; };
  const out = await reopen.reopenDueListings(admin, notify, NOW);
  assert.deepEqual(out, { reopened: 2, notified: 2, pending: 0, failed: 0 });
  assert.deepEqual([tables.trainers[0].at_capacity, tables.trainers[0].capacity_resume_at], [false, null], 'the passed date is switched off');
  assert.deepEqual([tables.trainers[1].at_capacity, tables.trainers[2].at_capacity], [true, true], 'a date ahead, or no date, is left alone');
  assert.equal(tables.nutritionists[0].at_capacity, false, 'a date long past is switched off too');
  assert.deepEqual(notices.map((n) => n.userId).sort(), ['m1', 'm2'], 'only the recent reopening is news, and only to those still waiting');
  assert.equal(notices[0].data.dedupe, 'reopen:trainer:7:2026-10-15');
  // Each switch-off holds the date it read, so a coach who changed it meanwhile is not touched.
  const upd = writes.find((w) => w.op === 'update' && w.table === 'trainers');
  assert.deepEqual(upd.filters.map(([k, v]) => [k, v]), [['id', 7], ['at_capacity', true], ['capacity_resume_at', '2026-10-15T04:00:00+00:00']]);
  // A second run finds nothing to do and tells nobody again.
  notices.length = 0;
  assert.deepEqual(await reopen.reopenDueListings(admin, notify, NOW), { reopened: 0, notified: 0, pending: 0, failed: 0 });
  assert.equal(notices.length, 0);
  // A read that fails is counted, and the other role still runs.
  const broken = await reopen.reopenDueListings(fakeDb(world(), { fail: { trainers: { code: 'XX000', message: 'down' } } }), notify, NOW);
  assert.equal(broken.failed, 1);
});

// ⚠ CODEX ON #2375 (P1): the listing was switched off before its list was told, so a run cut off
// mid-list left the rest untold for good. A listing now stays due until everyone is told.
const waiting = (n, provider = 7) => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, provider_role: 'trainer', provider_id: provider, client_id: `m${i}`, status: 'waiting', created_at: `2026-10-${String(i + 1).padStart(2, '0')}` }));
// A notice writer that stores what it sends where the next run's skip read looks for it.
const storingNotify = (tables, sent) => async (_c, n) => {
  sent.push(n.userId);
  (tables.notifications ||= []).push({ user_id: n.userId, type: n.type, 'data->>dedupe': n.data.dedupe });
  return true;
};

test('the hourly job: a run cut off mid-list leaves the listing due, and the next run tells only the rest (Codex on #2375)', async () => {
  const { reopen } = await load();
  const tables = world({
    trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }],
    coach_waitlist: waiting(12),
  });
  const admin = fakeDb(tables, { as: 'service' });
  const sent = [];
  const store = storingNotify(tables, sent);
  // The first run's deadline passes after its first batch of ten.
  let calls = 0;
  const realNow = Date.now;
  const cut = async (c, n) => { if (++calls === 10) Date.now = () => Number.MAX_SAFE_INTEGER - 1; return store(c, n); };
  let first;
  try { first = await reopen.reopenDueListings(admin, cut, NOW, realNow() + 60_000); } finally { Date.now = realNow; }
  assert.deepEqual(first, { reopened: 0, notified: 10, pending: 1, failed: 0 });
  assert.deepEqual([tables.trainers[0].at_capacity, tables.trainers[0].capacity_resume_at], [true, '2026-10-15T04:00:00+00:00'], 'still due');
  // The next run finds it, tells the two left (not the ten again), and switches it off.
  const second = await reopen.reopenDueListings(admin, store, NOW + 3_600_000);
  assert.deepEqual(second, { reopened: 1, notified: 2, pending: 0, failed: 0 });
  assert.deepEqual(sent.slice(10).sort(), ['m10', 'm11']);
  assert.equal(new Set(sent).size, 12, 'nobody told twice');
  assert.equal(tables.trainers[0].at_capacity, false);
  // A run whose deadline has already passed starts nothing and leaves the listing due.
  const later = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }] });
  const none = [];
  assert.deepEqual(await reopen.reopenDueListings(fakeDb(later, { as: 'service' }), storingNotify(later, none), NOW, 0), { reopened: 0, notified: 0, pending: 1, failed: 0 });
  assert.equal(later.trainers[0].at_capacity, true);
  assert.equal(none.length, 0);
  // A waiting list that cannot be read leaves it due too.
  const unread = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }] });
  const r = await reopen.reopenDueListings(fakeDb(unread, { as: 'service', fail: { coach_waitlist: { code: 'XX000', message: 'down' } } }), storingNotify(unread, []), NOW);
  assert.equal(r.pending, 1);
  assert.equal(unread.trainers[0].at_capacity, true);
});

test('POST: a reopening cut off before its list is told stays due for the hourly job (Codex on #2375)', async () => {
  const tables = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom Trainer', at_capacity: true, capacity_resume_at: null }] });
  // The waiting list cannot be read in the request: members still meet an open coach, and nothing is lost.
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: false }, fail: { coach_waitlist: { code: 'XX000', message: 'down' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.listing.effective, false, 'open to members now');
  assert.deepEqual([tables.trainers[0].at_capacity, tables.trainers[0].capacity_resume_at], [true, new Date(NOW).toISOString()], 'left due');
  const { reopen } = await load();
  const sent = [];
  const out = await reopen.reopenDueListings(fakeDb(tables, { as: 'service' }), storingNotify(tables, sent), NOW + 3_600_000);
  assert.deepEqual(out, { reopened: 1, notified: 2, pending: 0, failed: 0 });
  assert.deepEqual(sent.sort(), ['m1', 'm2']);
  assert.equal(tables.trainers[0].at_capacity, false);
});

test('a failed notice keeps the reopening due, and a member\'s own choice does not (Codex on #2375)', async () => {
  const { reopen } = await load();
  const due = () => world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }] });
  // m1's send fails (a preferences read or the insert): the listing stays due, and the next run retries only m1.
  const tables = due();
  const sent = [];
  const store = storingNotify(tables, sent);
  let flaky = true;
  const first = await reopen.reopenDueListings(fakeDb(tables, { as: 'service' }), async (c, n) => (n.userId === 'm1' && flaky ? 'failed' : store(c, n)), NOW);
  assert.deepEqual(first, { reopened: 0, notified: 1, pending: 1, failed: 0 });
  assert.equal(tables.trainers[0].at_capacity, true);
  flaky = false;
  const second = await reopen.reopenDueListings(fakeDb(tables, { as: 'service' }), store, NOW);
  assert.deepEqual(second, { reopened: 1, notified: 1, pending: 0, failed: 0 });
  assert.deepEqual(sent, ['m2', 'm1']);
  // Muted, the type off, or already sent: skipped is done.
  const quiet = due();
  const out = await reopen.reopenDueListings(fakeDb(quiet, { as: 'service' }), async () => 'skipped', NOW);
  assert.deepEqual(out, { reopened: 1, notified: 0, pending: 0, failed: 0 });
});

test('every waiting member is told, past the first page (Codex on #2375)', async () => {
  const { reopen } = await load();
  const n = reopen.WAITLIST_PAGE * 2 + 3;
  const tables = world({
    trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }],
    coach_waitlist: Array.from({ length: n }, (_, i) => ({ id: `w${String(i).padStart(5, '0')}`, provider_role: 'trainer', provider_id: 7, client_id: `m${i}`, status: 'waiting', created_at: '2026-10-01' })),
  });
  const sent = [];
  const out = await reopen.reopenDueListings(fakeDb(tables, { as: 'service' }), storingNotify(tables, sent), NOW);
  assert.deepEqual(out, { reopened: 1, notified: n, pending: 0, failed: 0 });
  assert.equal(new Set(sent).size, n);
});

test('notify: why a preferred notice was not stored (Codex on #2375)', async () => {
  const notify = await loadRealModule(join(ROOT, 'src/lib/notify.ts'), {
    typescript: true,
    registry: new Map([['@/lib/email', { sendEmail: async () => {} }], ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')]]),
  });
  const db = ({ muted = false, prefsErr = null, insertErr = null } = {}) => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, gte: () => q,
        maybeSingle: async () => ({ data: { muted }, error: null }),
        insert: async () => ({ error: insertErr }),
        then: (res) => Promise.resolve(table === 'notification_preferences' ? { data: [], error: prefsErr } : { data: null, error: null, count: 0 }).then(res),
      };
      return q;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  });
  const n = { userId: 'm1', type: 'waitlist_invite', title: 'Open', data: { dedupe: 'k' } };
  const errLog = console.error; const infoLog = console.info; console.error = () => {}; console.info = () => {};
  try {
    assert.equal(await notify.preferredNotificationOutcome(db(), n), 'stored');
    assert.equal(await notify.preferredNotificationOutcome(db({ muted: true }), n), 'skipped');
    assert.equal(await notify.preferredNotificationOutcome(db({ insertErr: { code: '23505', message: 'dup' } }), n), 'skipped', 'already sent');
    assert.equal(await notify.preferredNotificationOutcome(db({ insertErr: { code: 'XX000', message: 'down' } }), n), 'failed');
    assert.equal(await notify.preferredNotificationOutcome(db({ prefsErr: { code: 'XX000', message: 'down' } }), n), 'failed');
    // The boolean form callers already use is unchanged.
    assert.equal(await notify.createPreferredNotification(db(), n), true);
    assert.equal(await notify.createPreferredNotification(db({ insertErr: { code: '23505', message: 'dup' } }), n), false);
  } finally { console.error = errLog; console.info = infoLog; }
});

test('the hourly job: its route needs the cron secret, and it is scheduled and registered', async () => {
  const { reopen } = await load();
  const tables = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-15T04:00:00+00:00' }] });
  const route = await loadRealModule(join(ROOT, 'src/app/api/cron/capacity-reopen/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => fakeDb(tables, { as: 'service' }) }],
      ['@/lib/notify', { preferredNotificationOutcome: async () => 'stored' }],
      ['@/lib/capacity-reopen', reopen],
    ]),
  });
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-test-secret';
  try {
    assert.equal((await route.GET(new Request('https://shape.test/api/cron/capacity-reopen'))).status, 401);
    assert.equal((await route.GET(new Request('https://shape.test/api/cron/capacity-reopen', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    const ok = await route.GET(new Request('https://shape.test/api/cron/capacity-reopen', { headers: { authorization: 'Bearer cron-test-secret' } }));
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.reopened, 1);
    assert.equal(tables.trainers[0].at_capacity, false);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before;
  }
  const crons = JSON.parse(read('vercel.json')).crons;
  assert.ok(crons.some((c) => c.path === '/api/cron/capacity-reopen' && /^\d+ \* \* \* \*$/.test(c.schedule)), 'hourly');
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/cron\/capacity-reopen', 'GET'\]/);
});

test('POST: reopening tells everyone still waiting, once a day, and only them', async () => {
  const tables = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom Trainer', at_capacity: true, capacity_resume_at: null }] });
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: false } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.notified, 2);
  assert.deepEqual(r.notices.map((n) => n.userId).sort(), ['m1', 'm2'], 'the waiting members of this listing, not one who left or another coach\'s');
  const n = r.notices[0];
  assert.equal(n.type, 'waitlist_invite', 'under the member\'s own "Waitlist invites" preference');
  assert.equal(n.title, 'Tom Trainer is taking new clients');
  assert.equal(n.route, 'coach:trainer:7');
  assert.equal(n.data.dedupe, 'reopen:trainer:7:2026-10-15');
  assert.equal(r.body.listing.waiting, 2, 'they stay on the list: a reopening is news, not an invite');
  // Pausing, or saving while already open, tells nobody.
  assert.equal((await call('POST', { body: { role: 'trainer', atCapacity: true } })).notices.length, 0);
  assert.equal((await call('POST', { body: { role: 'trainer', atCapacity: false } })).notices.length, 0);
  // A resume date that already passed was open to members; switching off then is no reopening.
  const lapsed = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-10-01T00:00:00Z' }] });
  assert.equal((await call('POST', { tables: lapsed, body: { role: 'trainer', atCapacity: false } })).notices.length, 0);
  // A failed notice never undoes the change: the coach is open to members, and the reopening stays
  // due so the hourly job tries those members again (Codex on #2375).
  const failing = await call('POST', { tables: world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: null }] }), body: { role: 'trainer', atCapacity: false }, notifyFails: true });
  assert.equal(failing.status, 200);
  assert.equal(failing.body.notified, 0);
  assert.equal(failing.body.listing.effective, false, 'open to members');
  assert.equal(failing.body.listing.atCapacity, true, 'still due');
});

test('POST: the intro setting is saved first, and a database without its column refuses the whole change', async () => {
  const tables = world();
  const r = await call('POST', { tables, body: { role: 'trainer', atCapacity: true, introsAtCapacity: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.listing.introsAtCapacity, true);
  const [first, second] = r.writes;
  assert.equal(first.op, 'upsert');
  assert.equal(first.table, 'provider_booking_rules');
  assert.equal(first.by, 'caller');
  assert.deepEqual([first.payload.provider_role, first.payload.provider_id, first.payload.intros_at_capacity], ['trainer', 7, true]);
  assert.equal(first.opts.onConflict, 'provider_role,provider_id');
  assert.equal(second.op, 'update');
  // A later save without the setting keeps it.
  const kept = await call('POST', { tables, body: { role: 'trainer', atCapacity: true } });
  assert.equal(kept.body.listing.introsAtCapacity, true);
  // The setting alone leaves the listing, and its resume date, as they are.
  const dated = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-11-01T00:00:00Z' }] });
  const alone = await call('POST', { tables: dated, body: { role: 'trainer', introsAtCapacity: false } });
  assert.equal(alone.status, 200, JSON.stringify(alone.body));
  assert.deepEqual(alone.writes.map((w) => w.op), ['upsert'], 'no listing write');
  assert.equal(alone.body.listing.resumeAt, '2026-11-01T00:00:00Z');
  assert.equal(alone.body.listing.introsAtCapacity, false);
  assert.equal(alone.notices.length, 0);
  // Before 2026-10-15-capacity-intros.sql: refused whole, the listing untouched.
  const pre = await call('POST', { body: { role: 'trainer', atCapacity: true, introsAtCapacity: true }, fail: { 'provider_booking_rules.upsert': { code: 'PGRST204', message: "Could not find the 'intros_at_capacity' column of 'provider_booking_rules' in the schema cache" } } });
  assert.equal(pre.status, 503);
  assert.equal(pre.body.error, 'not_set_up');
  assert.equal(pre.writes.filter((w) => w.op === 'update').length, 0);
  const down = await call('POST', { body: { role: 'trainer', atCapacity: true, introsAtCapacity: true }, fail: { 'provider_booking_rules.upsert': { code: 'XX000', message: 'down' } } });
  assert.equal(down.status, 500);
  assert.equal(down.writes.filter((w) => w.op === 'update').length, 0);
});

test('the migration: off by default, and its guard holds the column to that', () => {
  const sql = read('supabase-migrations/2026-10-15-capacity-intros.sql');
  assert.match(sql, /add column if not exists intros_at_capacity boolean not null default false;/);
  assert.match(sql, /column_name = 'intros_at_capacity' and is_nullable = 'NO' and column_default = 'false'/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/coach\/capacity', 'GET,POST'\]/, 'registered in the War Room');
});

test('a one-time purchase at capacity: a current client buys, someone new needs the invite', () => {
  const src = read('src/app/purchase/actions.ts');
  assert.match(src, /invited = await hasActiveWaitlistInvite\(supabase, user\.id, providerRole, providerId\)\s*\|\| await isActiveClientOf\(supabase, user\.id, providerRole, providerId\);/);
  const lib = read('src/lib/waitlist.ts');
  assert.match(lib, /\.from\('subscriptions'\)[\s\S]{0,200}\.in\('status', \['active', 'trialing'\]\)/);
  assert.match(lib, /if \(error\) throw new Error\(`client lookup failed/, 'a failed read is never a yes');
});

test('the marketplace reads a passed resume date as accepting, the same rule as the server', async () => {
  const cat = await loadRealModule(join(ROOT, 'src/lib/coach-catalog.ts'), { typescript: true });
  const row = (extra) => ({ id: 7, name: 'Tom Trainer', price: 120, ...extra });
  const Real = Date.now; Date.now = () => NOW;
  try {
    assert.equal(cat.liveCoachFromRow(row({ at_capacity: true, capacity_resume_at: null }), 'trainer').atCapacity, true);
    assert.equal(cat.liveCoachFromRow(row({ at_capacity: true, capacity_resume_at: '2026-11-01T00:00:00Z' }), 'trainer').atCapacity, true);
    assert.equal(cat.liveCoachFromRow(row({ at_capacity: true, capacity_resume_at: '2026-10-01T00:00:00Z' }), 'trainer').atCapacity, false);
    assert.equal(cat.liveCoachFromRow(row({ at_capacity: false }), 'trainer').atCapacity, false);
  } finally { Date.now = Real; }
  assert.match(cat.LIVE_COACH_COLUMNS, /\bcapacity_resume_at\b/);
});

test('the booking pages: no intro times at capacity unless the coach keeps intros open', () => {
  const html = read('public/newdesign/consultation.html');
  assert.match(html, /introsClosed = data\.atCapacity === true && !\(data\.rules && data\.rules\.introsAtCapacity === true\);/);
  assert.match(html, /if \(proId && introsClosed\) \{[\s\S]{0,400}data-intros-closed=""/);
  const site = read('public/newdesign/livingShared.jsx');
  assert.match(site, /cl\.from\("provider_booking_rules"\)\.select\("intros_at_capacity"\)/);
  assert.match(site, /\{introHref && \(introsOpen \|\| \(wl && wl\.status === "invited"\)\) \? \(\s*<a href=\{introHref\} data-book-intro-at-capacity=""/);
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(app, /const introClosed = atCapacity && !introsAtCap && wl\?\.status !== 'invited';/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/marketplace.json`));
    assert.ok(typeof cat['listing.introsClosed'] === 'string' && cat['listing.introsClosed'].trim(), loc);
  }
});

test('the app\'s full coach profile offers a free intro at capacity when the listing does (Codex on #2375)', () => {
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(market, /commerce: \{ coach, role: saleProviderRole, packages: p\.packages, atCapacity, introsAtCapacity: introsAtCap, bookIntro:/, 'the listing hands over the coach\'s setting and what it read');
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const prof = client.slice(client.indexOf('function BSSignalCoachProfile('), client.indexOf('\nfunction ', client.indexOf('function BSSignalCoachProfile(') + 10));
  assert.match(prof, /const introsOpenAtCap = !!\(commerce && commerce\.introsAtCapacity === true\);/);
  const block = (from) => { const i = prof.indexOf(from); assert.ok(i > 0, from); return prof.slice(i, prof.indexOf('\n          )}', i)); };
  const intro = /<button onClick=\{doBookIntro\} data-intro-at-capacity=""/;
  // Invited off the list: always (the server lets an invited member book one either way).
  const invited = block("{!isSelf && atCapacity && wl?.status === 'invited' && (");
  assert.match(invited, intro);
  assert.doesNotMatch(invited, /introsOpenAtCap \?/);
  // Waiting, or not on the list yet: only when the coach keeps intros open.
  for (const from of ["{!isSelf && atCapacity && wl && wl.status !== 'invited' && (", '{!isSelf && atCapacity && !wl && clientOf !== true && (']) {
    assert.match(block(from), /\{introsOpenAtCap \? <button onClick=\{doBookIntro\} data-intro-at-capacity=""/, from);
  }
});

test('the app gates intros on capacity as the calendar read it, not the catalogue row (Codex on #2375)', () => {
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  // The availability read keeps the server's answer, keyed on the coach it was read for.
  assert.match(market, /if \(typeof d\.atCapacity === 'boolean'\) setAvailCap\(\{ key: `\$\{saleProviderRole\}:\$\{saleProviderId\}`, at: d\.atCapacity \}\);/);
  // The listing's own lines, lifted and run: a stale row loses to the fresh answer, either way.
  const i = market.indexOf('  const rowAtCapacity = ');
  const j = market.indexOf('  const [wl, setWl] = useStateBSM2(null);', i);
  assert.ok(i > 0 && j > i, 'the listing\'s capacity lines');
  const listing = new Function('coach', 'availCap', 'saleProviderRole', 'saleProviderId', `${market.slice(i, j)}\nreturn atCapacity;`);
  const open = { at_capacity: false, capacity_resume_at: null };
  const full = { at_capacity: true, capacity_resume_at: null };
  assert.equal(listing(open, null, 'trainer', 7), false, 'the row stands in until the read answers');
  assert.equal(listing(full, null, 'trainer', 7), true);
  assert.equal(listing(open, { key: 'trainer:7', at: true }, 'trainer', 7), true, 'went full after the marketplace loaded');
  assert.equal(listing(full, { key: 'trainer:7', at: false }, 'trainer', 7), false, 'reopened after the marketplace loaded');
  assert.equal(listing(open, { key: 'trainer:8', at: true }, 'trainer', 7), false, 'another coach\'s answer is not this one\'s');
  assert.equal(listing(open, { key: 'nutritionist:7', at: true }, 'trainer', 7), false, 'nor another role\'s');
  // The intro gate reads that state.
  assert.match(market.slice(j), /const introClosed = atCapacity && !introsAtCap && wl\?\.status !== 'invited';/);
  // The full profile takes the listing's answer; opened any other way, the row decides.
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const k = client.indexOf('  const atCapacity = commerce && typeof commerce.atCapacity');
  const l = client.indexOf('  // At capacity a free intro', k);
  assert.ok(k > 0 && l > k, 'the profile\'s capacity line');
  const profile = new Function('commerce', 'commerceCoach', `${client.slice(k, l)}\nreturn atCapacity;`);
  assert.equal(profile({ atCapacity: true }, open), true);
  assert.equal(profile({ atCapacity: false }, full), false);
  assert.equal(profile({}, full), true);
  assert.equal(profile(null, open), false);
});

// ── The app: Settings changes the listing of the role in use, through the route ──────────────
// Lifted from the shipped shapeBackend.js and run against a recorded fetch.
function liftCapacity() {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const i = src.indexOf('function capacityFromListing(l) {');
  const j = src.indexOf('\nfunction playlistFromRow(row) {', i);
  // The calls go through the file's own live-token helper and API fetch, lifted with them.
  const k = src.indexOf('async function liveAccessToken() {');
  const m = src.indexOf('window.ShapeApi = ', k);
  assert.ok(i > 0 && j > i && k > 0 && m > k, 'could not lift the capacity calls');
  const calls = [];
  let answer = { status: 200, body: {} };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: new Headers(init.headers).get('Authorization'), body: init.body ? JSON.parse(init.body) : null });
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const normalizeRole = (r) => (['client', 'trainer', 'nutritionist', 'dietitian'].includes(r) ? r : 'client');
  const providerDiscipline = (r) => (r === 'dietitian' ? 'nutritionist' : r);
  const state = { session: { access_token: 'tok' }, user: null };
  // supabase's own session: null until a test sets one (a refreshed token).
  const live = { session: null };
  const supabase = { auth: { getSession: async () => ({ data: { session: live.session } }) } };
  const api = new Function('fetch', 'apiBaseUrl', 'state', 'normalizeRole', 'providerDiscipline', 'supabase', 'Headers',
    src.slice(k, m) + '\n' + src.slice(i, j) + '\nreturn { getProviderCapacity, setProviderCapacity };')(fetch, 'https://shape.test', state, normalizeRole, providerDiscipline, supabase, Headers);
  return { ...api, calls, answer: (status, body) => { answer = { status, body }; }, state, live };
}

test('app: capacity is read and written for the role in use, and shows what members meet', async () => {
  const a = liftCapacity();
  const listings = [
    { role: 'trainer', providerId: 7, name: 'Tom', atCapacity: true, effective: false, resumeAt: '2026-10-01T00:00:00Z', introsAtCapacity: false, waiting: 2 },
    { role: 'nutritionist', providerId: 3, name: 'Tom', atCapacity: true, effective: true, resumeAt: null, introsAtCapacity: true, waiting: 0 },
  ];
  a.answer(200, { listings });
  // A coach with both listings, working as a nutritionist, sees the nutritionist listing.
  assert.deepEqual(await a.getProviderCapacity({ role: 'nutritionist' }), { role: 'nutritionist', providerId: 3, atCapacity: true, switchedOn: true, resumeAt: null, resumeOn: null, introsAtCapacity: true, waiting: 0 });
  assert.equal((await a.getProviderCapacity({ role: 'dietitian' })).providerId, 3, 'a dietitian is on the nutritionist rails');
  // A passed resume date reads as open, the switch as on.
  const tr = await a.getProviderCapacity({ role: 'trainer' });
  assert.deepEqual([tr.atCapacity, tr.switchedOn], [false, true]);
  a.answer(200, { listings: [{ ...listings[0], effective: true, resumeAt: '2026-10-20T04:00:00+00:00', resumeOn: '2026-10-20' }] });
  assert.equal((await a.getProviderCapacity({ role: 'trainer' })).resumeOn, '2026-10-20', 'the coach\'s own day, for Settings to show');
  a.answer(200, { listings });
  assert.equal(a.calls[0].url, 'https://shape.test/api/coach/capacity?tz=' + encodeURIComponent(TZ), 'the phone\'s zone rides along');
  assert.equal(a.calls[0].auth, 'Bearer tok');
  a.answer(200, { listings: [listings[0]] });
  assert.equal(await a.getProviderCapacity({ role: 'nutritionist' }), null, 'never the other role\'s listing');
  a.answer(401, {});
  assert.equal(await a.getProviderCapacity({ role: 'trainer' }), null);
  a.answer(503, { error: 'Your listing could not be read.' });
  await assert.rejects(() => a.getProviderCapacity({ role: 'trainer' }), /could not be read/);
  // Writes: only what was asked, and the resume date only when pausing.
  a.answer(200, { ok: true, listing: { ...listings[0], atCapacity: false, effective: false, resumeAt: null }, notified: 2 });
  const res = await a.setProviderCapacity({ role: 'trainer', atCapacity: false, resumeAt: '2026-11-01T00:00:00Z' });
  assert.deepEqual(a.calls.at(-1).body, { role: 'trainer', tz: TZ, atCapacity: false });
  assert.equal(a.calls.at(-1).method, 'POST');
  assert.equal(res.notified, 2);
  await a.setProviderCapacity({ role: 'trainer', atCapacity: true, resumeAt: '2026-11-01T00:00:00Z' });
  assert.deepEqual(a.calls.at(-1).body, { role: 'trainer', tz: TZ, atCapacity: true, resumeAt: '2026-11-01T00:00:00Z' });
  await a.setProviderCapacity({ role: 'dietitian', introsAtCapacity: true });
  assert.deepEqual(a.calls.at(-1).body, { role: 'nutritionist', tz: TZ, introsAtCapacity: true }, 'the intro setting alone leaves the listing');
  a.answer(503, { error: 'not_set_up', detail: "Intros at capacity aren't set up yet. They'll be ready after the next update." });
  await assert.rejects(() => a.setProviderCapacity({ role: 'trainer', introsAtCapacity: true }), /aren't set up yet/);
  a.answer(500, { error: 'save_failed' });
  await assert.rejects(() => a.setProviderCapacity({ role: 'trainer', atCapacity: true }), /^Error: Could not update your capacity\.$/);
  a.state.session = null;
  const before = a.calls.length;
  assert.equal(await a.getProviderCapacity({ role: 'trainer' }), null);
  await assert.rejects(() => a.setProviderCapacity({ role: 'trainer', atCapacity: true }), /Sign in/);
  assert.equal(a.calls.length, before, 'signed out, nothing is sent');
});

test('app: capacity calls send the live token, never a cached one supabase has refreshed (Codex on #2375)', async () => {
  const a = liftCapacity();
  a.state.session = { access_token: 'stale' };
  a.state.user = { id: 'coach-1' };
  a.live.session = { access_token: 'fresh', user: { id: 'coach-1' } };
  a.answer(200, { listings: [{ role: 'trainer', providerId: 7, atCapacity: false, effective: false }] });
  await a.getProviderCapacity({ role: 'trainer' });
  a.answer(200, { ok: true, listing: { role: 'trainer', providerId: 7, atCapacity: true, effective: true }, notified: 0 });
  await a.setProviderCapacity({ role: 'trainer', atCapacity: true });
  assert.deepEqual(a.calls.map((c) => [c.method, c.url, c.auth]), [
    ['GET', 'https://shape.test/api/coach/capacity?tz=' + encodeURIComponent(TZ), 'Bearer fresh'],
    ['POST', 'https://shape.test/api/coach/capacity', 'Bearer fresh'],
  ]);
  // Another account's session is never borrowed.
  a.live.session = { access_token: 'someone-else', user: { id: 'other' } };
  await a.getProviderCapacity({ role: 'trainer' });
  assert.equal(a.calls.at(-1).auth, 'Bearer fresh', 'the cached session, now the refreshed one');
});

test('app Settings: the switch follows the role in use, reopening says who was told, and intros are the coach\'s call', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /window\.ShapeBookings\?\.getCapacity\?\.\(\{ role: tweaks\.role \}\)/);
  assert.match(client, /\}, \[isCoachRole, tweaks\.role\]\);/);
  assert.match(client, /await window\.ShapeBookings\.setCapacity\(\{ role: capacity\.role, atCapacity: next \}\);/);
  assert.match(client, /res\.notified > 0 \? tr\('settings:capacity\.toastReopened', \{ n: res\.notified,/);
  assert.match(client, /await window\.ShapeBookings\.setCapacity\(\{ role: capacity\.role, introsAtCapacity: next \}\);/);
  assert.match(client, /<Toggle on=\{capacity\.introsAtCapacity\} onClick=\{toggleIntros\} \/>/);
  assert.match(client, /tr\('settings:capacity\.resumes', \{ date: \(capacity\.resumeOn \? new Date\(capacity\.resumeOn \+ 'T12:00:00'\) : new Date\(capacity\.resumeAt\)\)/, 'the coach\'s day, not the phone\'s');
  assert.doesNotMatch(client, /subscribe, book & buy are blocked/, 'current clients still book and buy');
  assert.doesNotMatch(read('mobile-app/src/services/shapeBackend.js'), /\.update\(\{ at_capacity:/, 'the app no longer writes the row itself');
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/settings.json`));
    for (const k of ['capacity.open', 'capacity.pause', 'capacity.descOn', 'capacity.descOff', 'capacity.toastPaused', 'capacity.toastOpen', 'capacity.toastReopened', 'capacity.toastError', 'capacity.resumes', 'capacity.introsTitle', 'capacity.introsOn', 'capacity.introsOff']) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
    }
    assert.match(cat['capacity.toastReopened'], /\{n\}/, `${loc}: the count`);
    assert.match(cat['capacity.resumes'], /\{date\}/, `${loc}: the date`);
  }
});

test('website Profile: the capacity switch, a resume date, intros while full, and the waiting list with Invite', () => {
  const src = read('public/newdesign/dashProfileExtras.jsx');
  assert.match(src, /<CoachListingRatesCard \/><CoachCapacityCard \/><CoachListingMediaCard \/>/);
  const card = src.slice(src.indexOf('function CoachCapacityCard() {'), src.indexOf('// Marketplace listing photos'));
  assert.match(card, /fetch\("\/api\/coach\/capacity\?tz=" \+ encodeURIComponent\(cpcBrowserZone\(\) \|\| ""\), \{ credentials: "same-origin", cache: "no-store" \}\)/, 'the browser\'s zone rides along');
  assert.match(card, /body: JSON\.stringify\(\{ role, tz: cpcBrowserZone\(\), \.\.\.patch \}\)/, 'on every save, so the answer reads the day back in it');
  assert.match(card, /const listing = \(\(d && d\.listings\) \|\| \[\]\)\.find\(\(l\) => l\.role === role\) \|\| null;/, 'the listing of this dashboard\'s role');
  assert.match(card, /const full = !!\(l && l\.effective\);/, 'what members meet, not the raw switch');
  assert.match(card, /save\(\{ atCapacity: false \}, "open"\)/);
  assert.match(card, /save\(\{ atCapacity: true, \.\.\.\(resumeDay \? \{ resumeOn: resumeDay, tz: cpcBrowserZone\(\) \} : \{\}\) \}, "pause"\)/, 'the day itself, placed by the route in the listing\'s zone');
  assert.match(card, /setResumeDay\(listing && listing\.effective && listing\.resumeOn \? listing\.resumeOn : ""\);/);
  assert.match(card, /reopening \{cpcDayLabel\(l\.resumeOn\)\}/);
  assert.doesNotMatch(card, /new Date\(l\.resumeAt\)/, 'never the instant on the viewer\'s clock');
  assert.match(card, /save\(\{ introsAtCapacity: e\.target\.checked \}, "intros"\)/, 'the intro setting alone');
  assert.match(card, /fetch\("\/api\/waitlist\/room\?providerId=" \+ encodeURIComponent\(providerId\) \+ "&providerRole=" \+ role/);
  assert.match(card, /fetch\("\/api\/waitlist\/invite", \{ method: "POST"[\s\S]{0,200}JSON\.stringify\(\{ entryId \}\)/);
  assert.match(card, /d\.notified > 0 \? "Taking new clients again\. " \+ d\.notified/);
  // The day is shown as that day, and the picker starts tomorrow.
  const lib = new Function(`${src.slice(src.indexOf('function cpcBrowserZone('), src.indexOf('function CoachCapacityCard() {'))}; return { cpcBrowserZone, cpcTomorrow, cpcDayLabel };`)();
  assert.equal(lib.cpcDayLabel('2026-11-02'), new Date(2026, 10, 2, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  assert.equal(lib.cpcDayLabel(''), '');
  assert.equal(lib.cpcDayLabel('11/02/2026'), '');
  assert.equal(typeof lib.cpcBrowserZone(), 'string');
  // The picker's first day is tomorrow on the coach's calendar (Codex on #2375): at 01:00Z on Friday
  // 16 October it is Friday morning in Tokyo and still Thursday evening in New York.
  const RealDate = Date;
  class Pinned extends RealDate { constructor(...a) { if (a.length) super(...a); else super(Date.parse('2026-10-16T01:00:00Z')); } static now() { return Date.parse('2026-10-16T01:00:00Z'); } }
  const at = new Function('Date', `${src.slice(src.indexOf('function cpcTomorrow('), src.indexOf('// The coach\'s day, shown as that day'))}; return cpcTomorrow;`)(Pinned);
  assert.equal(at('America/New_York'), '2026-10-16', 'a New York listing can reopen on Friday');
  assert.equal(at('Asia/Tokyo'), '2026-10-17');
  assert.equal(at('Pacific/Kiritimati'), '2026-10-17');
  assert.equal(at('Pacific/Pago_Pago'), '2026-10-16');
  assert.match(at('Not/AZone'), /^\d{4}-\d{2}-\d{2}$/, 'a zone this browser does not know falls back to its own calendar');
  assert.equal(at('America/Los_Angeles'), '2026-10-16');
  assert.match(card, /min=\{cpcTomorrow\(\(l && l\.timezone\) \|\| cpcBrowserZone\(\)\)\}/, 'the zone the route places the day in');
});
