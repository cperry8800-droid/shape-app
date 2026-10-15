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
const NOW = Date.parse('2026-10-15T15:00:00Z');

// A small PostgREST stand-in: filters by eq/in, honours order/limit, and answers count/head reads.
function fakeDb(tables, { as = 'caller', fail = {}, writes = [] } = {}) {
  const from = (table) => {
    const filters = [];
    let op = 'select'; let payload = null; let opts = null; let count = false; let lim = Infinity;
    const rows = () => (tables[table] ||= []);
    const match = (r) => filters.every(([k, v, kind]) => (kind === 'in' ? v.includes(r[k]) : r[k] === v));
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
      const got = rows().filter(match).slice(0, lim);
      return { data: count ? null : got.map((r) => ({ ...r })), error: null, count: count ? got.length : null };
    };
    const q = {
      select: (_c, o) => { if (o && o.count) count = true; return q; },
      eq: (k, v) => { filters.push([k, v, 'eq']); return q; },
      in: (k, v) => { filters.push([k, v, 'in']); return q; },
      order: () => q,
      limit: (n) => { lim = n; return q; },
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
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/capacity/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => state.admin }],
      ['@/lib/notify', { createPreferredNotification: async (_c, n) => { if (state.notifyFails) return false; state.notices.push(n); return true; } }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/capacity', capacity],
      ['@/lib/owned-provider', owned],
      ['@/lib/waitlist', { resolveRequestClient: async () => (state.user ? { user: state.user, supabase: state.db } : null) }],
    ]),
  });
  mod = { route, state };
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

async function call(method, { tables = world(), body, user = { id: COACH }, fail = {}, notifyFails = false } = {}) {
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
    const req = new Request('https://shape.test/api/coach/capacity', method === 'GET' ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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
    { role: 'trainer', providerId: 7, name: 'Tom', atCapacity: true, effective: false, resumeAt: '2026-10-01T00:00:00Z', introsAtCapacity: false, waiting: 2 },
    { role: 'nutritionist', providerId: 3, name: 'Tom', atCapacity: true, effective: true, resumeAt: null, introsAtCapacity: true, waiting: 0 },
  ]);
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
  // Reopening clears the resume date.
  const paused = world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: '2026-11-01T00:00:00Z' }], coach_waitlist: [] });
  const open = await call('POST', { tables: paused, body: { role: 'trainer', atCapacity: false, resumeAt: '2026-11-05T00:00:00Z' } });
  assert.deepEqual(open.writes.find((w) => w.op === 'update').payload, { at_capacity: false, capacity_resume_at: null });
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
  // A failed notice never undoes the change.
  const failing = await call('POST', { tables: world({ trainers: [{ id: 7, owner_id: COACH, name: 'Tom', at_capacity: true, capacity_resume_at: null }] }), body: { role: 'trainer', atCapacity: false }, notifyFails: true });
  assert.equal(failing.status, 200);
  assert.equal(failing.body.notified, 0);
  assert.equal(failing.body.listing.atCapacity, false);
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

// ── The app: Settings changes the listing of the role in use, through the route ──────────────
// Lifted from the shipped shapeBackend.js and run against a recorded fetch.
function liftCapacity() {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const i = src.indexOf('function capacityFromListing(l) {');
  const j = src.indexOf('\nfunction playlistFromRow(row) {', i);
  assert.ok(i > 0 && j > i, 'could not lift the capacity calls');
  const calls = [];
  let answer = { status: 200, body: {} };
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', auth: init.headers && init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  const normalizeRole = (r) => (['client', 'trainer', 'nutritionist', 'dietitian'].includes(r) ? r : 'client');
  const providerDiscipline = (r) => (r === 'dietitian' ? 'nutritionist' : r);
  const state = { session: { access_token: 'tok' } };
  const api = new Function('fetch', 'apiBaseUrl', 'state', 'normalizeRole', 'providerDiscipline',
    src.slice(i, j) + '\nreturn { getProviderCapacity, setProviderCapacity };')(fetch, 'https://shape.test', state, normalizeRole, providerDiscipline);
  return { ...api, calls, answer: (status, body) => { answer = { status, body }; }, state };
}

test('app: capacity is read and written for the role in use, and shows what members meet', async () => {
  const a = liftCapacity();
  const listings = [
    { role: 'trainer', providerId: 7, name: 'Tom', atCapacity: true, effective: false, resumeAt: '2026-10-01T00:00:00Z', introsAtCapacity: false, waiting: 2 },
    { role: 'nutritionist', providerId: 3, name: 'Tom', atCapacity: true, effective: true, resumeAt: null, introsAtCapacity: true, waiting: 0 },
  ];
  a.answer(200, { listings });
  // A coach with both listings, working as a nutritionist, sees the nutritionist listing.
  assert.deepEqual(await a.getProviderCapacity({ role: 'nutritionist' }), { role: 'nutritionist', providerId: 3, atCapacity: true, switchedOn: true, resumeAt: null, introsAtCapacity: true, waiting: 0 });
  assert.equal((await a.getProviderCapacity({ role: 'dietitian' })).providerId, 3, 'a dietitian is on the nutritionist rails');
  // A passed resume date reads as open, the switch as on.
  const tr = await a.getProviderCapacity({ role: 'trainer' });
  assert.deepEqual([tr.atCapacity, tr.switchedOn], [false, true]);
  assert.equal(a.calls[0].url, 'https://shape.test/api/coach/capacity');
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
  assert.deepEqual(a.calls.at(-1).body, { role: 'trainer', atCapacity: false });
  assert.equal(a.calls.at(-1).method, 'POST');
  assert.equal(res.notified, 2);
  await a.setProviderCapacity({ role: 'trainer', atCapacity: true, resumeAt: '2026-11-01T00:00:00Z' });
  assert.deepEqual(a.calls.at(-1).body, { role: 'trainer', atCapacity: true, resumeAt: '2026-11-01T00:00:00Z' });
  await a.setProviderCapacity({ role: 'dietitian', introsAtCapacity: true });
  assert.deepEqual(a.calls.at(-1).body, { role: 'nutritionist', introsAtCapacity: true }, 'the intro setting alone leaves the listing');
  a.answer(503, { error: 'not_set_up', detail: "Intros at capacity aren't set up yet. They'll be ready after the next update." });
  await assert.rejects(() => a.setProviderCapacity({ role: 'trainer', introsAtCapacity: true }), /aren't set up yet/);
  a.answer(500, { error: 'save_failed' });
  await assert.rejects(() => a.setProviderCapacity({ role: 'trainer', atCapacity: true }), /^Error: Could not update your capacity\.$/);
  a.state.session = null;
  assert.equal(await a.getProviderCapacity({ role: 'trainer' }), null);
});

test('app Settings: the switch follows the role in use, reopening says who was told, and intros are the coach\'s call', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /window\.ShapeBookings\?\.getCapacity\?\.\(\{ role: tweaks\.role \}\)/);
  assert.match(client, /\}, \[isCoachRole, tweaks\.role\]\);/);
  assert.match(client, /await window\.ShapeBookings\.setCapacity\(\{ role: capacity\.role, atCapacity: next \}\);/);
  assert.match(client, /res\.notified > 0 \? tr\('settings:capacity\.toastReopened', \{ n: res\.notified,/);
  assert.match(client, /await window\.ShapeBookings\.setCapacity\(\{ role: capacity\.role, introsAtCapacity: next \}\);/);
  assert.match(client, /<Toggle on=\{capacity\.introsAtCapacity\} onClick=\{toggleIntros\} \/>/);
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
  assert.match(card, /fetch\("\/api\/coach\/capacity", \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.match(card, /const listing = \(\(d && d\.listings\) \|\| \[\]\)\.find\(\(l\) => l\.role === role\) \|\| null;/, 'the listing of this dashboard\'s role');
  assert.match(card, /const full = !!\(l && l\.effective\);/, 'what members meet, not the raw switch');
  assert.match(card, /save\(\{ atCapacity: false \}, "open"\)/);
  assert.match(card, /save\(\{ atCapacity: true, \.\.\.\(cpcResumeInstant\(resumeDay\) \? \{ resumeAt: cpcResumeInstant\(resumeDay\) \} : \{\}\) \}, "pause"\)/);
  assert.match(card, /save\(\{ introsAtCapacity: e\.target\.checked \}, "intros"\)/, 'the intro setting alone');
  assert.match(card, /fetch\("\/api\/waitlist\/room\?providerId=" \+ encodeURIComponent\(providerId\) \+ "&providerRole=" \+ role/);
  assert.match(card, /fetch\("\/api\/waitlist\/invite", \{ method: "POST"[\s\S]{0,200}JSON\.stringify\(\{ entryId \}\)/);
  assert.match(card, /d\.notified > 0 \? "Taking new clients again\. " \+ d\.notified/);
  // The resume day is the start of that day on the coach's clock, sent as an instant the route accepts.
  const lib = new Function(`${src.slice(src.indexOf('function cpcDateInput('), src.indexOf('function CoachCapacityCard() {'))}; return { cpcDateInput, cpcResumeInstant };`)();
  const iso = lib.cpcResumeInstant('2026-11-02');
  assert.match(iso, /Z$/);
  assert.equal(new Date(iso).getDate(), 2);
  assert.equal(new Date(iso).getHours(), 0);
  assert.equal(lib.cpcResumeInstant(''), null);
  assert.equal(lib.cpcResumeInstant('11/02/2026'), null);
  assert.equal(lib.cpcDateInput(iso), '2026-11-02');
  assert.equal(lib.cpcDateInput(null), '');
});
