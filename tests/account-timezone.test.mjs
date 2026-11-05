// One time zone per account (P9, owner 2026-11-05: "all time zones should be set by user").
//
// Driven, not grepped: the shared formatter (public/newdesign/shapeZone.mjs, through the app's
// re-export) and the three server routes that read or write the account's zone, over a small
// stateful fake of the tables they touch. The database half (the check, the copies onto the
// listings and client_profiles, the backfill) is SQL: its statements are pinned at the end, and it
// was run on a local PostgreSQL 16 (the PR records how).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Z = await import(pathToFileURL(join(ROOT, 'mobile-app/src/services/shapeZone.mjs')).href);

// ── The formatter ───────────────────────────────────────────────────────────

// A browser's storage and window, so the remembered zone and its event can be watched.
function fakeBrowser() {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  globalThis.window = new EventTarget();
  return mem;
}
function leaveBrowser() {
  Z.clearAccountZone();
  delete globalThis.localStorage;
  delete globalThis.window;
}

const LATE = Date.parse('2026-11-05T23:30:00Z'); // 18:30 in New York, 08:30 next day in Tokyo

test('an instant prints on the clock it is asked for: the day, the time, both', () => {
  assert.equal(Z.dayKey(LATE, 'America/New_York'), '2026-11-05');
  assert.equal(Z.dayKey(LATE, 'Asia/Tokyo'), '2026-11-06');
  assert.equal(Z.clockHM(LATE, 'Asia/Kolkata'), '05:00');
  assert.equal(Z.formatTime(LATE, { zone: 'America/New_York', locale: 'en-US' }), '6:30 PM');
  assert.equal(Z.formatTime(LATE, { zone: 'Europe/Berlin', locale: 'de' }), '00:30', 'a 24-hour clock writes two digits');
  assert.equal(Z.formatTime(LATE, { zone: 'America/New_York', locale: 'en-US', hour12: false }), '18:30');
  assert.equal(Z.formatDate(LATE, { zone: 'Asia/Tokyo', locale: 'en-US' }), 'Nov 6');
  assert.equal(Z.dayKey('not a time', 'UTC'), '');
  assert.equal(Z.formatTime(undefined), '');
});

test("with no zone given, a time prints in the viewer's own zone, not the device's", () => {
  const mem = fakeBrowser();
  try {
    const device = Z.deviceZone();
    const other = device === 'Asia/Tokyo' ? 'America/New_York' : 'Asia/Tokyo';
    Z.setAccountZone(other);
    assert.equal(Z.viewerZone(), other);
    assert.equal(Z.formatTime(LATE, { locale: 'en-US' }), Z.formatTime(LATE, { zone: other, locale: 'en-US' }));
    assert.equal(Z.dayKey(LATE), Z.dayKey(LATE, other));
    assert.equal(mem.get('shape.tz.account'), other, 'the next page paints on this clock from the start');
    Z.setAccountZone(null); // told: no zone set
    assert.equal(Z.viewerZone(), device || 'UTC', 'no zone set: the device stands in');
    assert.equal(mem.has('shape.tz.account'), false);
  } finally { leaveBrowser(); }
});

test("the last page's zone stands in until this page is told, and sign-out forgets it", () => {
  const mem = fakeBrowser();
  try {
    mem.set('shape.tz.account', 'Europe/Lisbon');
    assert.equal(Z.getAccountZone(), 'Europe/Lisbon');
    mem.set('shape.tz.account', 'Area/Nowhere');
    assert.equal(Z.getAccountZone(), null, 'a stored junk value is not a zone');
    Z.setAccountZone('Europe/Lisbon');
    Z.declineDeviceZone('Asia/Tokyo');
    Z.clearAccountZone();
    assert.equal(mem.has('shape.tz.account'), false);
    assert.equal(mem.has('shape.tz.declined'), false);
    assert.equal(Z.getAccountZone(), null);
  } finally { leaveBrowser(); }
});

test('a change of zone is announced once, and only when it changes', () => {
  fakeBrowser();
  try {
    const heard = [];
    const off = Z.onZoneChange((z) => heard.push(z));
    Z.setAccountZone('Europe/Paris');
    Z.setAccountZone('Europe/Paris');
    Z.setAccountZone('Asia/Tokyo');
    off();
    Z.setAccountZone('UTC');
    assert.deepEqual(heard, ['Europe/Paris', 'Asia/Tokyo']);
  } finally { leaveBrowser(); }
});

test('offsets follow daylight saving, and half and quarter hours', () => {
  assert.equal(Z.offsetMinutes('America/New_York', Date.parse('2026-01-15T12:00:00Z')), -300);
  assert.equal(Z.offsetMinutes('America/New_York', Date.parse('2026-07-15T12:00:00Z')), -240);
  assert.equal(Z.offsetMinutes('Asia/Kolkata', LATE), 330);
  assert.equal(Z.offsetMinutes('Asia/Kathmandu', LATE), 345);
  assert.equal(Z.offsetLabel('Asia/Kolkata', LATE), 'GMT+5:30');
  assert.equal(Z.offsetLabel('UTC', LATE), 'GMT');
  assert.equal(Z.zoneLabel('America/Argentina/Buenos_Aires', { at: LATE }), 'Buenos Aires · GMT-3');
  assert.equal(Z.offsetMinutes('Area/Nowhere'), null);
});

test('only a real zone is a zone', () => {
  for (const bad of ['', 'Area/Nowhere', 'New York', '../etc', null, undefined, 'x'.repeat(80)]) {
    assert.equal(Z.normalizeZone(bad), null, String(bad));
  }
  assert.equal(Z.normalizeZone(' UTC '), 'UTC');
  assert.equal(Z.normalizeZone('America/Indiana/Indianapolis'), 'America/Indiana/Indianapolis');
});

test('the travel question: asked only for another clock, and not again once answered', () => {
  const at = LATE;
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: 'Europe/London', at }), true);
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: 'America/New_York', at }), false);
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: 'America/Detroit', at }), false, 'same clock, other name');
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: 'Europe/London', declined: 'Europe/London', at }), false);
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: 'Europe/London', declined: 'Asia/Tokyo', at }), true, 'a new trip asks again');
  assert.equal(Z.travelAsk({ account: null, device: 'Europe/London', at }), false, 'no zone yet is the first default, not a question');
  assert.equal(Z.travelAsk({ account: 'America/New_York', device: null, at }), false);
});

test("the picker offers the person's own zones, west to east", () => {
  const opts = Z.zoneOptions({ include: ['Asia/Kolkata', 'Asia/Kolkata', 'Area/Nowhere'], at: LATE });
  assert.ok(opts.length > 30);
  assert.equal(opts.filter((o) => o.zone === 'Asia/Kolkata').length, 1);
  assert.ok(!opts.some((o) => o.zone === 'Area/Nowhere'));
  for (let i = 1; i < opts.length; i++) assert.ok(opts[i - 1].offset <= opts[i].offset, 'sorted by offset');
  assert.ok(opts.some((o) => o.zone === 'UTC'));
});

// ── The routes ──────────────────────────────────────────────────────────────

const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });

// A stateful stand-in for the few tables these routes touch. `profiles` rows carry `timezone`
// only when the migration has run (`ready`). Filters are applied, writes land, and every call
// is recorded, so a test reads what the database would hold.
function fakeDb({ ready = true, zone = null, failProfilesRead = false, failProfilesUpdate = false, silentUpdate = false, listing = null, raceZone = null } = {}) {
  const uid = 'user-1';
  const t = {
    profiles: [ready ? { id: uid, timezone: zone } : { id: uid }],
    client_profiles: [],
    trainers: listing ? [{ id: 7, owner_id: uid, timezone: listing }] : [],
    provider_availability: [],
  };
  const calls = [];
  const db = {
    t, calls,
    auth: { getUser: async () => ({ data: { user: { id: uid } } }) },
    from(table) {
      const st = { table, op: 'select', filters: [], patch: null, single: false };
      const run = () => {
        calls.push([table, st.op, JSON.stringify(st.patch), st.filters.map((f) => f.desc).join('&')]);
        if (table === 'profiles' && st.op === 'select' && failProfilesRead) return { data: null, error: { message: 'offline' } };
        if (table === 'profiles' && st.op === 'update' && failProfilesUpdate) return { data: null, error: { message: 'denied' } };
        const rows = t[table] || (t[table] = []);
        const hit = rows.filter((r) => st.filters.every((f) => f.fn(r)));
        if (st.op === 'select') return { data: st.single ? (hit[0] ?? null) : hit, error: null };
        if (st.op === 'update') {
          // A first default racing another device: the zone that won lands just before ours.
          if (table === 'profiles' && raceZone) { for (const r of rows) r.timezone = raceZone; raceZone = null; }
          // Row security that refuses an update answers no error and changes nothing.
          if (table === 'profiles' && silentUpdate) return { data: null, error: null };
          for (const r of rows.filter((r) => st.filters.every((f) => f.fn(r)))) Object.assign(r, st.patch);
          return { data: null, error: null };
        }
        if (st.op === 'delete') { t[table] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
        if (st.op === 'insert') { rows.push(...[].concat(st.patch)); return { data: null, error: null }; }
        if (st.op === 'upsert') {
          const row = rows.find((r) => r.user_id === st.patch.user_id);
          if (row) Object.assign(row, st.patch); else rows.push({ ...st.patch });
          return { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const q = {
        select() { return q; },
        eq(col, v) { st.filters.push({ desc: `${col}=${v}`, fn: (r) => r[col] === v }); return q; },
        is(col, v) { st.filters.push({ desc: `${col} is ${v}`, fn: (r) => (r[col] ?? null) === v }); return q; },
        order() { return q; },
        maybeSingle() { st.single = true; return q; },
        update(patch) { st.op = 'update'; st.patch = patch; return q; },
        delete() { st.op = 'delete'; return q; },
        insert(rows) { st.op = 'insert'; st.patch = rows; return q; },
        upsert(row) { st.op = 'upsert'; st.patch = row; return q; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
  };
  return db;
}

async function routeOf(file, db) {
  const account = await loadRealModule(join(ROOT, 'src/lib/account-timezone.ts'), {
    typescript: true, registry: new Map([['@/lib/time', time], ['@supabase/supabase-js', {}]]),
  });
  return loadRealModule(join(ROOT, file), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => (await db.auth.getUser()).data.user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/time', time],
      ['@/lib/account-timezone', account],
    ]),
  });
}
const put = (body) => new Request('http://x/api/me/timezone', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const post = (url, body) => new Request('http://x' + url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const profileWrites = (db) => db.calls.filter((c) => c[0] === 'profiles' && c[1] === 'update');

test('/api/me/timezone reads the zone, and says when it cannot be set yet', async () => {
  let db = fakeDb({ zone: 'Europe/Paris' });
  let r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).GET(new Request('http://x'));
  assert.deepEqual(await r.json(), { timezone: 'Europe/Paris', ready: true });
  db = fakeDb({ ready: false });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).GET(new Request('http://x'));
  assert.deepEqual(await r.json(), { timezone: null, ready: false }, 'before the migration: not "no zone"');
  db = fakeDb({ failProfilesRead: true });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).GET(new Request('http://x'));
  assert.equal(r.status, 503, 'a failed read is not "no zone"');
});

test('/api/me/timezone sets the zone the person picks, and refuses what is not one', async () => {
  const db = fakeDb({ zone: 'Europe/Paris' });
  const route = await routeOf('src/app/api/me/timezone/route.ts', db);
  let r = await route.PUT(put({ timezone: 'Asia/Tokyo' }));
  assert.deepEqual(await r.json(), { timezone: 'Asia/Tokyo', changed: true });
  assert.equal(db.t.profiles[0].timezone, 'Asia/Tokyo');
  r = await route.PUT(put({ timezone: 'Asia/Tokyo' }));
  assert.deepEqual(await r.json(), { timezone: 'Asia/Tokyo', changed: false });
  r = await route.PUT(put({ timezone: 'Area/Nowhere' }));
  assert.equal(r.status, 400);
  assert.equal(db.t.profiles[0].timezone, 'Asia/Tokyo');
  assert.equal(db.calls.filter((c) => c[0] === 'client_profiles').length, 0, 'the copies are the database’s job');
});

test("a first default never replaces the person's zone, and a lost race answers the winner", async () => {
  let db = fakeDb({ zone: 'Europe/Paris' });
  let r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo', onlyIfUnset: true }));
  assert.deepEqual(await r.json(), { timezone: 'Europe/Paris', changed: false });
  assert.equal(profileWrites(db).length, 0);

  db = fakeDb({ zone: null });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo', onlyIfUnset: true }));
  assert.deepEqual(await r.json(), { timezone: 'Asia/Tokyo', changed: true });
  assert.match(profileWrites(db)[0][3], /timezone is null/, 'the default is conditioned on still being empty');

  db = fakeDb({ zone: null, raceZone: 'Europe/Paris' });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo', onlyIfUnset: true }));
  assert.deepEqual(await r.json(), { timezone: 'Europe/Paris', changed: false });
  assert.equal(db.t.profiles[0].timezone, 'Europe/Paris');
});

test('a write that lands nowhere, or before the migration, is not reported as saved', async () => {
  let db = fakeDb({ zone: null, failProfilesUpdate: true });
  let r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo' }));
  assert.equal(r.status, 500);
  db = fakeDb({ zone: null, silentUpdate: true });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo', onlyIfUnset: true }));
  assert.equal(r.status, 500, 'an update that changed nothing is not a saved first default');
  db = fakeDb({ ready: false });
  r = await (await routeOf('src/app/api/me/timezone/route.ts', db)).PUT(put({ timezone: 'Asia/Tokyo' }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'not_ready');
  assert.equal(profileWrites(db).length, 0);
});

test("the app's every-open post sets a first default only, and no longer moves anyone", async () => {
  let db = fakeDb({ zone: 'Europe/Paris' });
  let r = await (await routeOf('src/app/api/client/timezone/route.ts', db)).POST(post('/api/client/timezone', { tz: 'Asia/Tokyo' }));
  assert.equal(r.status, 200);
  assert.equal(db.t.profiles[0].timezone, 'Europe/Paris', "a traveller's zone stands");
  assert.equal(db.calls.filter((c) => c[0] === 'client_profiles').length, 0);
  assert.equal(profileWrites(db).length, 0);

  db = fakeDb({ zone: null });
  r = await (await routeOf('src/app/api/client/timezone/route.ts', db)).POST(post('/api/client/timezone', { tz: 'Asia/Tokyo' }));
  assert.equal(db.t.profiles[0].timezone, 'Asia/Tokyo', 'the first open sets it');

  db = fakeDb({ ready: false });
  r = await (await routeOf('src/app/api/client/timezone/route.ts', db)).POST(post('/api/client/timezone', { tz: 'Asia/Tokyo' }));
  assert.equal(r.status, 200);
  assert.deepEqual(db.t.client_profiles, [{ user_id: 'user-1', timezone: 'Asia/Tokyo' }], 'before the migration, the old write stands');
});

const hours = (zone) => post('/api/my-availability', { role: 'trainer', timezone: zone, slots: [{ weekday: 1, start_minute: 540, duration_min: 60 }] });

test("hours are kept in the account's zone, whatever the browser's", async () => {
  const db = fakeDb({ zone: 'Europe/London', listing: 'Europe/London' });
  const r = await (await routeOf('src/app/api/my-availability/route.ts', db)).POST(hours('America/New_York'));
  assert.deepEqual(await r.json(), { ok: true, count: 1, timezone: 'Europe/London' });
  assert.equal(db.t.trainers[0].timezone, 'Europe/London', 'a laptop in New York moved nothing');
  assert.equal(db.t.provider_availability.length, 1);
});

test("a coach's first save sets the account's zone from the browser", async () => {
  const db = fakeDb({ zone: null, listing: null });
  db.t.trainers.push({ id: 7, owner_id: 'user-1', timezone: null });
  const r = await (await routeOf('src/app/api/my-availability/route.ts', db)).POST(hours('America/New_York'));
  assert.deepEqual(await r.json(), { ok: true, count: 1, timezone: 'America/New_York' });
  assert.equal(db.t.profiles[0].timezone, 'America/New_York');
  assert.equal(db.t.trainers[0].timezone, 'America/New_York');
});

test('an unread account zone refuses the save before anything is deleted', async () => {
  const db = fakeDb({ failProfilesRead: true, listing: 'Europe/London' });
  db.t.provider_availability.push({ provider_role: 'trainer', provider_id: 7, weekday: 2, start_minute: 600, duration_min: 60 });
  const r = await (await routeOf('src/app/api/my-availability/route.ts', db)).POST(hours('America/New_York'));
  assert.equal(r.status, 500);
  assert.equal(db.t.provider_availability.length, 1, 'the old hours stand');
  assert.equal(db.t.trainers[0].timezone, 'Europe/London');
});

test('before the migration, the hours editor works as it did', async () => {
  const db = fakeDb({ ready: false, listing: 'Europe/London' });
  const r = await (await routeOf('src/app/api/my-availability/route.ts', db)).POST(hours('America/New_York'));
  assert.deepEqual(await r.json(), { ok: true, count: 1, timezone: 'America/New_York' });
  assert.equal(db.t.trainers[0].timezone, 'America/New_York');
  assert.equal(profileWrites(db).length, 0);
});

// ── The migration's statements (it ran on a local PostgreSQL 16; these hold what it relies on) ──

test('the migration: one transaction, a checked zone, copies to every zone table, listing-first backfill', () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-11-05-account-timezone.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(sql, /^\s*begin;/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.match(sql, /alter table public\.profiles add column if not exists timezone text;/);
  assert.match(sql, /not exists \(select 1 from pg_timezone_names z where z\.name = new\.timezone\)/);
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(sql, new RegExp(`update public\\.${t} set timezone = new\\.timezone\\s+where owner_id = new\\.id`));
  }
  assert.match(sql, /insert into public\.client_profiles \(user_id, timezone\)/);
  assert.match(sql, /revoke all on function public\.profiles_copy_timezone\(\) from public, anon, authenticated;/);
  assert.match(sql, /after update of timezone on public\.profiles\s+for each row when \(new\.timezone is distinct from old\.timezone\)/);
  assert.match(sql, /if v_zone is not null then\s+new\.timezone := v_zone;/, "a new listing takes the account's zone");
  const back = sql.slice(sql.indexOf('update public.profiles p'));
  const order = ['public.trainers t', 'public.nutritionists n', 'public.client_profiles cp'].map((s) => back.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'the listing comes first');
  assert.match(back, /where p2\.timezone is null/, 'a zone already set is never overwritten');
  assert.doesNotMatch(sql, /\bexecute\s+(?!function\b)/i, 'no dynamic SQL');
});
