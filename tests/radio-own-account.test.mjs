// Shape Radio only for the account listening, on its own paid membership (owner, 2026-11-10: "i dont
// want any pass giving any access to shape radio, you can only access shape radio if you have your
// own login with a your own paid membership"). The pieces past the start code and the ticket
// (tests/radio-pass.test.mjs holds those):
//
//   1  streams.mjs: a stream is the member's; a connection is recorded as its account's; a newer
//      connection drops the older one (one device); a leave clears it; a membership that stopped
//      paying drops the account; each live connection is confirmed again about once a minute.
//   2  /api/radio/kicks: the station only, and it names connections, never accounts.
//   3  the station's door (services/station/door/door.mjs): drops what Shape names, with Icecast's
//      killclient, on /live, else /standby.
//   4  mayListen: the paid-membership rule, by account id, on the server.
//   5  the wiring: the station's compose file and entrypoint, the webhook, the migration.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { openStream, admitConnection, leaveConnection, markAccount, recheckAccount, kicksFor, RECHECK_SEC, KICK_RETRY_SEC, KICK_GIVE_UP_SEC } from '../src/lib/radio/streams.mjs';
import { pollOnce, readBoot, MOUNTS } from '../services/station/door/door.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const BOOT = '1762800000.0123456789abcdef';
const BOOT_AT = new Date(1762800000 * 1000).toISOString();
const OLD_BOOT = '1762700000.fedcba9876543210';
const NOW = Date.parse('2026-11-10T22:00:00.000Z');

/** A service-role client over in-memory tables, with PostgREST's filters as these modules use them. */
function fakeDb({ fail = [] } = {}) {
  const tables = { radio_streams: [], radio_connections: [] };
  const from = (table) => {
    const st = { op: 'select', filters: [], payload: null, returning: false, limit: null, order: null, single: false, conflict: null };
    const match = (r) => st.filters.every((f) => f(r));
    const run = () => {
      if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { message: `fake failure on ${st.op} ${table}` } };
      const rows = tables[table];
      if (st.op === 'insert') { rows.push({ ...st.payload }); return { data: null, error: null }; }
      if (st.op === 'upsert') {
        const keys = st.conflict.split(',');
        const hit = rows.find((r) => keys.every((k) => r[k] === st.payload[k]));
        if (hit) Object.assign(hit, st.payload); else rows.push({ ...st.payload });
        return { data: null, error: null };
      }
      if (st.op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, st.payload);
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (st.op === 'delete') {
        tables[table] = rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      let hit = rows.filter(match).map((r) => ({ ...r }));
      if (st.order) hit.sort((a, b) => String(a[st.order]).localeCompare(String(b[st.order])));
      if (st.limit != null) hit = hit.slice(0, st.limit);
      if (st.single) return { data: hit[0] ?? null, error: null };
      return { data: hit, error: null };
    };
    const q = {
      select() { if (st.op !== 'select') st.returning = true; return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.conflict = o.onConflict; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      delete() { st.op = 'delete'; return q; },
      eq(c, v) { st.filters.push((r) => r[c] === v); return q; },
      neq(c, v) { st.filters.push((r) => r[c] !== v); return q; },
      is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return q; },
      not(c, op, v) { assert.equal(op, 'is'); st.filters.push((r) => (r[c] ?? null) !== v); return q; },
      lt(c, v) { st.filters.push((r) => r[c] != null && String(r[c]) < String(v)); return q; },
      in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q; },
      order(c) { st.order = c; return q; },
      limit(n) { st.limit = n; return q; },
      maybeSingle() { st.single = true; return q; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  return { from, tables };
}
const live = (db) => db.tables.radio_connections;
const iso = (ms) => new Date(ms).toISOString();

// ── 1 ──────────────────────────────────────────────────────────────────────────────────────
test('1: a stream is recorded as the member\'s before its ticket exists; nothing for a bad account or a failed write', async () => {
  const db = fakeDb();
  const id = await openStream(db, { userId: ANA, now: NOW });
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(db.tables.radio_streams, [{ stream_id: id, user_id: ANA, opened_at: iso(NOW) }]);
  assert.notEqual(await openStream(db, { userId: ANA, now: NOW }), id, 'each start its own');
  assert.equal(await openStream(db, { userId: 'nobody', now: NOW }), null);
  assert.equal(await openStream(fakeDb({ fail: ['insert:radio_streams'] }), { userId: ANA, now: NOW }), null);
});

test('1: ⚠ one device per account: a newer connection marks the older one to drop; another account is untouched', async () => {
  const db = fakeDb();
  const phone = await openStream(db, { userId: ANA, now: NOW });
  const laptop = await openStream(db, { userId: ANA, now: NOW });
  const bens = await openStream(db, { userId: BEN, now: NOW });
  assert.deepEqual(await admitConnection(db, { streamId: phone, boot: BOOT, bootAt: BOOT_AT, client: 5, now: NOW }), { ok: true, userId: ANA, superseded: 0 });
  assert.deepEqual(await admitConnection(db, { streamId: bens, boot: BOOT, bootAt: BOOT_AT, client: 6, now: NOW }), { ok: true, userId: BEN, superseded: 0 });
  // The same account on a second device (or someone else on a copied address): the older one drops.
  assert.deepEqual(await admitConnection(db, { streamId: laptop, boot: BOOT, bootAt: BOOT_AT, client: 7, now: NOW + 1000 }), { ok: true, userId: ANA, superseded: 1 });
  const by = (c) => live(db).find((r) => r.client === c);
  assert.equal(by(5).kick_requested_at, iso(NOW + 1000));
  assert.equal(by(5).kick_reason, 'newer_stream');
  assert.equal(by(7).kick_requested_at, null, 'the newest plays');
  assert.equal(by(6).kick_requested_at, null, 'another account is never touched');
  // The same code again (Safari's probe, then the stream): the newer connection wins again.
  assert.equal((await admitConnection(db, { streamId: laptop, boot: BOOT, bootAt: BOOT_AT, client: 8, now: NOW + 2000 })).superseded, 1);
  assert.equal(by(7).kick_reason, 'newer_stream');
  // A ticket for a stream Shape has no record of is no way in; a failed read refuses too.
  assert.deepEqual(await admitConnection(db, { streamId: '99999999-9999-4999-8999-999999999999', boot: BOOT, bootAt: BOOT_AT, client: 9, now: NOW }), { ok: false, reason: 'stream' });
  assert.deepEqual(await admitConnection(fakeDb({ fail: ['select:radio_streams'] }), { streamId: phone, boot: BOOT, bootAt: BOOT_AT, client: 9, now: NOW }), { ok: false, reason: 'read_failed' });
});

test('1: a connection from an earlier start of the station is cleared; a leave clears its own row only', async () => {
  const db = fakeDb();
  const s = await openStream(db, { userId: ANA, now: NOW });
  live(db).push({ boot: OLD_BOOT, client: 5, stream_id: s, user_id: BEN, connected_at: iso(Date.parse(BOOT_AT) - 60000), checked_at: iso(NOW), kick_requested_at: null });
  await admitConnection(db, { streamId: s, boot: BOOT, bootAt: BOOT_AT, client: 5, now: NOW });
  assert.deepEqual(live(db).map((r) => [r.boot, r.client]), [[BOOT, 5]], 'the old start\'s connections ended with it');
  const t = await openStream(db, { userId: BEN, now: NOW });
  await admitConnection(db, { streamId: t, boot: BOOT, bootAt: BOOT_AT, client: 6, now: NOW });
  assert.deepEqual(await leaveConnection(db, { boot: BOOT, client: 5 }), { ok: true });
  assert.deepEqual(live(db).map((r) => r.client), [6]);
});

test('1: ⚠ a membership that stops paying drops the account: at once on Stripe\'s word, and on the minute\'s re-check', async () => {
  const db = fakeDb();
  const a = await openStream(db, { userId: ANA, now: NOW });
  const b = await openStream(db, { userId: BEN, now: NOW });
  await admitConnection(db, { streamId: a, boot: BOOT, bootAt: BOOT_AT, client: 5, now: NOW });
  await admitConnection(db, { streamId: b, boot: BOOT, bootAt: BOOT_AT, client: 6, now: NOW });
  // Stripe says Ana's membership went past due.
  assert.deepEqual(await markAccount(db, { userId: ANA, now: NOW + 1000 }), { ok: true, marked: 1 });
  let r = await kicksFor(db, { boot: BOOT, now: NOW + 2000, mayListen: async () => true });
  assert.deepEqual(r, { ok: true, clients: [5], checked: 0 }, 'nothing is due for its re-check yet');
  // Handed once; again only if the station never said they left.
  assert.deepEqual((await kicksFor(db, { boot: BOOT, now: NOW + 3000, mayListen: async () => true })).clients, []);
  assert.deepEqual((await kicksFor(db, { boot: BOOT, now: NOW + 2000 + (KICK_RETRY_SEC + 1) * 1000, mayListen: async () => true })).clients, [5]);
  // A minute on, Ben's membership is confirmed again (he paid) and Ana's connection is still marked.
  const verdicts = { [BEN]: true };
  r = await kicksFor(db, { boot: BOOT, now: NOW + (RECHECK_SEC + 5) * 1000, mayListen: async (u) => verdicts[u] ?? null });
  assert.equal(r.checked, 1);
  assert.equal(live(db).find((x) => x.client === 6).checked_at, iso(NOW + (RECHECK_SEC + 5) * 1000));
  assert.equal(live(db).find((x) => x.client === 6).kick_requested_at, null);
  // Later Ben lapses: the re-check finds it, without any word from Stripe.
  verdicts[BEN] = false;
  r = await kicksFor(db, { boot: BOOT, now: NOW + (2 * RECHECK_SEC + 10) * 1000, mayListen: async (u) => verdicts[u] ?? null });
  assert.ok(r.clients.includes(6), 'his connection is handed to the door');
  assert.equal(live(db).find((x) => x.client === 6).kick_reason, 'membership');
  // A membership that could not be read keeps the connection and is asked again.
  const keep = fakeDb();
  const k = await openStream(keep, { userId: ANA, now: NOW });
  await admitConnection(keep, { streamId: k, boot: BOOT, bootAt: BOOT_AT, client: 9, now: NOW });
  assert.deepEqual((await kicksFor(keep, { boot: BOOT, now: NOW + (RECHECK_SEC + 5) * 1000, mayListen: async () => null })).clients, []);
  assert.equal(live(keep)[0].kick_requested_at, null);
  // Another start of the station is never told to drop this start's connections.
  assert.deepEqual((await kicksFor(db, { boot: OLD_BOOT, now: NOW + 600000, mayListen: async () => false })).clients, []);
});

test('1: a plan that stopped paying is asked again at the next ask, and only the membership\'s check drops it', async () => {
  // On the real clock: what the re-check is measured against is a stamp taken now.
  const T = Date.now();
  const db = fakeDb();
  const sa = await openStream(db, { userId: ANA, now: T });
  await admitConnection(db, { streamId: sa, boot: BOOT, bootAt: BOOT_AT, client: 5, now: T });
  const sb = await openStream(db, { userId: BEN, now: T });
  await admitConnection(db, { streamId: sb, boot: BOOT, bootAt: BOOT_AT, client: 6, now: T });
  assert.deepEqual(await recheckAccount(db, { userId: ANA }), { ok: true, rechecked: 1 });
  assert.deepEqual(await recheckAccount(db, { userId: BEN }), { ok: true, rechecked: 1 });
  assert.deepEqual(await recheckAccount(db, { userId: 'not-a-uuid' }), { ok: false, rechecked: 0 });
  // Seconds later, well inside the minute: both are confirmed again. Ana is still paid another way
  // (an admin, say), so she keeps listening; Ben is not, and his connection goes to the door.
  const asked = [];
  const r = await kicksFor(db, { boot: BOOT, now: T + 3000, mayListen: async (u) => { asked.push(u); return u === ANA; } });
  assert.deepEqual(asked.sort(), [ANA, BEN].sort(), 'both asked at once, not after the minute');
  assert.deepEqual(r.clients, [6]);
  assert.equal(live(db).find((x) => x.client === 5).kick_requested_at, null, 'still paid another way: still listening');
  // A connection already on its way out is not asked again.
  assert.deepEqual(await recheckAccount(db, { userId: BEN }), { ok: true, rechecked: 0 });
});

test('1: records go: a drop never confirmed after ten minutes, a stream a day after it was opened', async () => {
  const db = fakeDb();
  const s = await openStream(db, { userId: ANA, now: NOW });
  await admitConnection(db, { streamId: s, boot: BOOT, bootAt: BOOT_AT, client: 5, now: NOW });
  await markAccount(db, { userId: ANA, now: NOW });
  await kicksFor(db, { boot: BOOT, now: NOW + (KICK_GIVE_UP_SEC + 1) * 1000, mayListen: async () => true });
  assert.deepEqual(live(db), []);
  await kicksFor(db, { boot: BOOT, now: NOW + 25 * 3600000, mayListen: async () => true });
  assert.deepEqual(db.tables.radio_streams, []);
});

// ── 2 ──────────────────────────────────────────────────────────────────────────────────────
async function kicksRoute(db, { token = 't'.repeat(40) } = {}) {
  process.env.NORA_ENGINE_TOKEN = token;
  return loadRealModule(join(ROOT, 'src/app/api/radio/kicks/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/radio/listens.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/radio/listens.mjs')).href)],
      ['@/lib/radio/streams.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/radio/streams.mjs')).href)],
      ['@/lib/radio/may-listen', { mayListen: async () => true }],
    ]),
  });
}
const station = (token) => `Basic ${Buffer.from(`station:${token}`).toString('base64')}`;

test('2: /api/radio/kicks answers the station only, and names Icecast\'s numbers, never an account', async () => {
  const db = fakeDb();
  const s = await openStream(db, { userId: ANA, now: Date.now() });
  await admitConnection(db, { streamId: s, boot: BOOT, bootAt: BOOT_AT, client: 5, now: Date.now() });
  await markAccount(db, { userId: ANA, now: Date.now() });
  const route = await kicksRoute(db);
  const ask = (headers, boot = BOOT) => route.GET(new Request(`https://shape.test/api/radio/kicks?boot=${boot}`, { headers }));
  assert.equal((await ask({})).status, 401);
  assert.equal((await ask({ authorization: station('x'.repeat(40)) })).status, 401, 'another token');
  assert.equal((await ask({ authorization: station('t'.repeat(40)) }, 'nope')).status, 401, 'no start named');
  const ok = await ask({ authorization: station('t'.repeat(40)) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await ok.json();
  assert.deepEqual(body, { clients: [5] });
  assert.ok(!JSON.stringify(body).includes(ANA), 'no account leaves');
  const failing = await (await kicksRoute(fakeDb({ fail: ['select:radio_connections'] }))).GET(new Request(`https://shape.test/api/radio/kicks?boot=${BOOT}`, { headers: { authorization: station('t'.repeat(40)) } }));
  assert.equal(failing.status, 503, 'a record that could not be read drops nothing');
});

// ── 3 ──────────────────────────────────────────────────────────────────────────────────────
test('3: the door drops what Shape names, with Icecast\'s killclient, on /live and else /standby, signed in on both sides', async () => {
  const calls = [];
  const env = { SHAPE_URL: 'https://shape.test/', NORA_ENGINE_TOKEN: 't'.repeat(40), ICECAST_ADMIN_PASSWORD: 'A'.repeat(24), ICECAST_URL: 'http://icecast:8000' };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers.authorization });
    if (String(url).startsWith('https://shape.test/api/radio/kicks')) return { ok: true, status: 200, json: async () => ({ clients: [5, 7, -1, 'x', 1.5] }) };
    const u = new URL(url);
    const dropped = (u.searchParams.get('id') === '5' && u.searchParams.get('mount') === '/live') || (u.searchParams.get('id') === '7' && u.searchParams.get('mount') === '/standby');
    return { ok: true, status: 200, text: async () => `<?xml version="1.0"?><iceresponse><message>x</message><return>${dropped ? 1 : 0}</return></iceresponse>` };
  };
  const r = await pollOnce({ env, fetchImpl, boot: BOOT });
  assert.deepEqual(r, { ok: true, asked: 5, dropped: [5, 7] });
  assert.equal(calls[0].url, `https://shape.test/api/radio/kicks?boot=${encodeURIComponent(BOOT)}`);
  assert.equal(calls[0].auth, station('t'.repeat(40)), 'the station\'s own sign-in to Shape');
  const kills = calls.slice(1);
  assert.deepEqual(kills.map((c) => c.url), [
    'http://icecast:8000/admin/killclient?mount=%2Flive&id=5',
    'http://icecast:8000/admin/killclient?mount=%2Flive&id=7',
    'http://icecast:8000/admin/killclient?mount=%2Fstandby&id=7',
  ], 'only whole, non-negative numbers; /standby only when /live did not have it');
  for (const k of kills) assert.equal(k.auth, `Basic ${Buffer.from(`admin:${'A'.repeat(24)}`).toString('base64')}`);
  assert.deepEqual(MOUNTS, ['/live', '/standby']);
  // Shape not answering, or no start named yet: nothing is dropped.
  assert.deepEqual(await pollOnce({ env, fetchImpl: async () => ({ ok: false, status: 503 }), boot: BOOT }), { ok: false, reason: 'shape_503' });
  assert.deepEqual(await pollOnce({ env, fetchImpl: async () => { throw new Error('down'); }, boot: BOOT }), { ok: false, reason: 'shape_unreachable' });
  assert.deepEqual(await pollOnce({ env, fetchImpl, boot: null }), { ok: false, reason: 'no_boot' });
  assert.equal(await readBoot('/x', async () => `${BOOT}\n`), BOOT);
  assert.equal(await readBoot('/x', async () => 'nope'), null);
  assert.equal(await readBoot('/x', async () => { throw new Error('ENOENT'); }), null);
});

// ── 4 ──────────────────────────────────────────────────────────────────────────────────────
test('4: mayListen is the paid-membership rule by account id: active, a coach or an admin; never past due, a trial, a minor or a deleted account', async () => {
  const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
  const core = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true, registry: new Map([['./age-derive.mjs', ageDerive]]) });
  const lib = await loadRealModule(join(ROOT, 'src/lib/radio/may-listen.ts'), { typescript: true, registry: new Map([['@/lib/membership-core', core]]) });
  const adult = { role: 'client', roles: ['client'], over_18: true, date_of_birth: '1990-04-02', created_at: '2026-10-01T00:00:00Z' };
  const admin = ({ user = { id: ANA, email: 'a@example.invalid', email_confirmed_at: 'x' }, userError = null, profile = adult, status = 'active' } = {}) => ({
    auth: { admin: { getUserById: async () => ({ data: { user }, error: userError }) } },
    from: (table) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: table === 'profiles' ? profile : status ? { status } : null, error: null }) }; return q; },
  });
  assert.equal(await lib.mayListen(admin(), ANA), true);
  assert.equal(await lib.mayListen(admin({ status: 'past_due' }), ANA), false);
  assert.equal(await lib.mayListen(admin({ status: 'trialing' }), ANA), false);
  assert.equal(await lib.mayListen(admin({ status: null }), ANA), false);
  assert.equal(await lib.mayListen(admin({ status: null, profile: { ...adult, roles: ['client', 'trainer'] } }), ANA), true, 'a coach by role');
  assert.equal(await lib.mayListen(admin({ profile: { ...adult, over_18: false, date_of_birth: '2014-04-02' } }), ANA), false);
  assert.equal(await lib.mayListen(admin({ user: null, userError: { message: 'User not found' } }), ANA), false);
  assert.equal(await lib.mayListen(admin({ user: null, userError: { message: 'connection reset' } }), ANA), null, 'unknown: kept, and asked again');
});

// ── 5 ──────────────────────────────────────────────────────────────────────────────────────
test('5: the station runs the door beside Icecast, inside the machine; Icecast names its start for it', () => {
  const compose = read('services/station/docker-compose.yml');
  const door = compose.slice(compose.indexOf('\n  door:'), compose.indexOf('\n  caddy:'));
  assert.match(door, /build: \.\/door/);
  assert.match(door, /ICECAST_ADMIN_PASSWORD: \$\{ICECAST_ADMIN_PASSWORD:\?set it in \.env\}/);
  assert.match(door, /ICECAST_URL: http:\/\/icecast:8000/);
  assert.match(door, /- station_run:\/run\/station:ro/);
  assert.doesNotMatch(door, /ports:/, 'the door listens on nothing');
  assert.match(compose, /STATION_BOOT_FILE: \/run\/station\/boot\n\s+volumes:\n\s+- station_run:\/run\/station\n/);
  const entry = read('services/station/icecast/entrypoint.sh');
  assert.match(entry, /printf '%s' "\$BOOT" > "\$STATION_BOOT_FILE"/);
  assert.ok(entry.indexOf('> "$STATION_BOOT_FILE"') > entry.indexOf('BOOT="$(date -u +%s)'), 'written once named');
  assert.match(read('services/station/door/Dockerfile'), /USER node/);
  // Caddy still serves /live only (tests/radio-station-config.test.mjs): Icecast's admin stays private.
  assert.doesNotMatch(read('services/station/caddy/Caddyfile').replace(/^\s*#.*$/gm, ''), /admin/);
});

test('5: the door clears a connection\'s account as the station says the listener left', () => {
  const door = stripComments(read('src/app/api/radio/pass/route.ts'));
  const leave = door.slice(door.indexOf("if (form.get('action') === 'listener_remove') {"), door.indexOf('const verdict = checkListener('));
  assert.match(leave, /const gone = await leaveConnection\(createAdminClient\(\), \{ boot: boot\.boot, client \}\);/);
  assert.match(leave, /if \(!gone\.ok\) console\.error/);
});

test('5: Stripe\'s word that a membership stopped paying drops the account\'s streams; the migration keeps the account only while it listens', () => {
  const hook = stripComments(read('src/app/api/stripe/webhook/route.ts'));
  assert.match(hook, /if \(!platformError && status !== 'active'\) \{\n\s+for \(const row of/);
  // ⚠ Asked again, never decided here (Codex P2 on #2675): a copy of "still paid another way"
  // missed the admin. The membership's own check, at the station's next ask, decides.
  assert.match(hook, /const asked = await recheckAccount\(admin, \{ userId: row\.client_id \}\);/);
  assert.doesNotMatch(hook, /markAccount|stillPaid/, 'the webhook drops nobody itself');
  const sql = read('supabase-migrations/2026-11-10-radio-own-account.sql').replace(/^\s*--.*$/gm, '');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.match(sql, /create table if not exists public\.radio_streams \(/);
  assert.match(sql, /create table if not exists public\.radio_connections \(/);
  assert.match(sql, /primary key \(boot, client\)/);
  for (const t of ['radio_streams', 'radio_connections']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
  }
  assert.doesNotMatch(sql, /create policy/i, 'nobody reads them through the API');
  assert.doesNotMatch(sql, /radio_listens/, 'the station\'s own session record keeps no account');
});

test('5: the players start a fresh stream each time: the address goes on any stop, and a schedule peeks without a code', () => {
  const app = stripComments(read('mobile-app/src/services/shapeBackend.js'));
  assert.match(app, /function pause\(\) \{\n\s+playbackGate\.supersede\(\);\n\s+if \(el\) \{\n\s+el\.pause\(\);\n\s+try \{ el\.removeAttribute\('src'\); el\.load\(\); \} catch \{[^}]*\}\n\s+\}\n\s+prime\(\);/);
  assert.match(app, /fetch\(api\('\/api\/radio\/station\?peek=1'\)/);
  assert.match(app, /ends - Date\.now\(\) > 20000/);
  const sets = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
  assert.match(sets, /\(window\.ShapeRadioLive\.stationStatus \|\| window\.ShapeRadioLive\.station\)\(\)/);
  const web = stripComments(read('public/newdesign/radioInstrument.jsx'));
  const stopped = web.slice(web.indexOf('const stopped = (bad) => {'), web.indexOf('};', web.indexOf('const stopped = (bad) => {')));
  assert.ok(stopped.indexOf('audio.removeAttribute("src")') < stopped.indexOf('if (!bad) return;'), 'a pause drops the address too');
});
