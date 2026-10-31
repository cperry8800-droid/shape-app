// Sleep points pay only nights the server wrote (the War Room's known gap: "Sleep points
// (award_sleep_points) trust sources.sleep_hours on a row the member can write: with a provider
// connected, a direct write could earn +5 a night for the last 14 days").
//
// The migration (2026-10-31-device-sleep-nights.sql) was run on a local PostgreSQL 16.15 scaffold
// with Supabase's roles and default grants, after 2026-10-18-sleep-points.sql, and probed:
//   - before it, a member's own snapshot write of 8 hours stamped 'oura' (Oura connected) was paid +5;
//   - it applies twice; anon and authenticated hold no privilege on device_sleep_nights, and a
//     member's insert, update, delete and select, and anon's select, are refused; anon cannot run
//     the award; hours over 24 and an unknown provider are refused for the server too;
//   - from server-recorded nights, a New York member was paid for last night (8h), 7h, 12h, a night
//     two providers both reported (once) and the 14th night back; not for 6.5h, 13h, a night the old
//     award had already paid, a provider not connected, a forged snapshot night with no device night
//     behind it, the 15th night back or tomorrow; a second claim paid nothing; a member with no zone
//     was paid for UTC tomorrow and 14 UTC days back, not 15 back or 2 ahead; signed out, nothing;
//   - the guard raises on a grant to authenticated and on the old award's body, and passes as shipped.
// These tests hold the source to what was probed, and the four sync paths to recording the nights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SQL = read('supabase-migrations/2026-10-31-device-sleep-nights.sql');

// The helper, with the service client stubbed: `adminFactory` decides what createAdminClient does.
let adminFactory = () => { throw new Error('no service key'); };
const device = await loadRealModule(join(ROOT, 'src/lib/device-sleep.ts'), {
  typescript: true,
  registry: new Map([['@/lib/supabase/admin', { createAdminClient: () => adminFactory() }]]),
});
const snapshotLib = await loadRealModule(join(ROOT, 'src/lib/health-snapshot.ts'), {
  typescript: true,
  registry: new Map([['@/lib/integrations/reconcile.mjs', await import('../src/lib/integrations/reconcile.mjs')]]),
});

function fakeAdmin({ error = null, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    from: (table) => ({
      upsert: async (rows, opts) => {
        calls.push({ table, rows, opts });
        if (throws) throw new Error('connection reset');
        return { error };
      },
    }),
  };
}

test('the table is the server\'s alone: RLS with no policy, nothing for anon or members', () => {
  assert.match(SQL, /create table if not exists public\.device_sleep_nights \(\n\s+user_id\s+uuid not null references auth\.users\(id\) on delete cascade,\n\s+night\s+date not null,\n\s+provider\s+text not null check \(provider in \('apple_health', 'garmin', 'oura', 'whoop'\)\),\n\s+hours\s+numeric\(5,2\) not null check \(hours > 0 and hours <= 24\),/);
  assert.match(SQL, /primary key \(user_id, night, provider\)/);
  assert.match(SQL, /alter table public\.device_sleep_nights enable row level security;/);
  assert.match(SQL, /revoke all on table public\.device_sleep_nights from public, anon, authenticated;/);
  assert.doesNotMatch(SQL, /create policy[^;]*device_sleep_nights/, 'a policy would open the table to someone');
  assert.doesNotMatch(SQL, /grant [^;]*on table public\.device_sleep_nights to [^;]*(anon|authenticated)/);
  // The guard checks it after the run, and that the award no longer reads the snapshot.
  assert.match(SQL, /has_table_privilege\('authenticated', 'public\.device_sleep_nights', 'INSERT'\)/);
  assert.match(SQL, /has_table_privilege\('authenticated', 'public\.device_sleep_nights', 'SELECT'\)/);
  assert.match(SQL, /not like '%daily_health_snapshot%'/);
  // No backfill from the rows a member could forge.
  assert.doesNotMatch(SQL, /insert into public\.device_sleep_nights/);
});

test('the rows recorded: a real day, hours over 0 and at most 24, one per night', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const rows = device.deviceNightRows('u1', 'oura', [
    { date: '2026-10-30', hours: 7.456 },
    { date: '2026-10-30', hours: 8 },          // the last report of a night stands
    { date: '2026-10-29', hours: 0 },
    { date: '2026-10-28', hours: 24.5 },
    { date: '2026-02-30', hours: 8 },           // no such day
    { date: '2026-10-27T00:00:00Z', hours: 8 },
    { date: '2026-10-26', hours: null },
    { date: '2026-10-25', hours: Number.NaN },
    { date: '2026-10-24', hours: 24 },
    { date: '2026-10-23', hours: 7.456 },      // to two places, as the column holds it
  ], now);
  assert.deepEqual(rows.map((r) => [r.night, r.hours]), [['2026-10-30', 8], ['2026-10-24', 24], ['2026-10-23', 7.46]]);
  assert.ok(rows.every((r) => r.user_id === 'u1' && r.provider === 'oura' && r.recorded_at === now.toISOString()));
  assert.equal(device.deviceNightRows('u1', 'manual', [{ date: '2026-10-30', hours: 8 }]).length, 0, 'a typed night is no device night');
  assert.equal(device.deviceNightRows('', 'oura', [{ date: '2026-10-30', hours: 8 }]).length, 0);
  assert.equal(device.deviceNightRows('u1', 'oura', null).length, 0);
});

test('recorded with the service client, upserted on the night, and a failure never fails the sync', async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await device.recordDeviceNights(admin, 'u1', 'garmin', [{ date: '2026-10-30', hours: 7.5 }]), { recorded: 1 });
  assert.equal(admin.calls[0].table, 'device_sleep_nights');
  assert.deepEqual(admin.calls[0].opts, { onConflict: 'user_id,night,provider' });
  // Nothing to record: no write at all.
  const quiet = fakeAdmin();
  assert.deepEqual(await device.recordDeviceNights(quiet, 'u1', 'garmin', [{ date: '2026-10-30', hours: null }]), { recorded: 0 });
  assert.equal(quiet.calls.length, 0);
  // Without a client of its own it makes the service one; with no service key it says so.
  const made = fakeAdmin();
  adminFactory = () => made;
  assert.deepEqual(await device.recordDeviceNights(null, 'u1', 'oura', [{ date: '2026-10-30', hours: 8 }]), { recorded: 1 });
  assert.equal(made.calls.length, 1);
  adminFactory = () => { throw new Error('no service key'); };
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(await device.recordDeviceNights(null, 'u1', 'oura', [{ date: '2026-10-30', hours: 8 }]), { recorded: 0, error: 'no service client' });
    // The table missing (before the migration runs), or the connection dropping: logged, not thrown.
    assert.deepEqual(await device.recordDeviceNights(fakeAdmin({ error: { message: 'relation "device_sleep_nights" does not exist' } }), 'u1', 'oura', [{ date: '2026-10-30', hours: 8 }]),
      { recorded: 0, error: 'relation "device_sleep_nights" does not exist' });
    assert.deepEqual(await device.recordDeviceNights(fakeAdmin({ throws: true }), 'u1', 'oura', [{ date: '2026-10-30', hours: 8 }]), { recorded: 0, error: 'connection reset' });
  } finally { console.warn = warn; }
});

function fakeUserClient() {
  const rows = [];
  const q = (table) => ({
    upsert: async (row) => { if (table === 'daily_health_snapshot') rows.push(row); return { error: null }; },
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  return { client: { from: q, rpc: async () => ({ error: null }) }, rows };
}

test('the WHOOP and Oura writers hand back the nights they filed, as the snapshot files them', async () => {
  const hm = (h) => h * 3_600_000;
  const { client } = fakeUserClient();
  const whoop = await snapshotLib.writeWhoopSnapshots(client, 'u1', {
    sleeps: { records: [
      { id: 's1', start: '2026-10-29T21:00:00.000Z', end: '2026-10-30T05:30:00.000Z', timezone_offset: '+02:00', score: { stage_summary: { total_in_bed_time_milli: hm(8), total_awake_time_milli: hm(0.5) } } },
      { id: 'nap', start: '2026-10-30T12:00:00.000Z', end: '2026-10-30T12:40:00.000Z', timezone_offset: '+02:00', nap: true, score: { stage_summary: { total_in_bed_time_milli: hm(0.6), total_awake_time_milli: 0 } } },
    ] },
    recoveries: { records: [{ sleep_id: 's1', created_at: '2026-10-30T06:00:00.000Z', score: { recovery_score: 70 } }] },
  });
  assert.deepEqual(whoop.nights, [{ date: '2026-10-30', hours: 7.5 }], 'the nap is no night');
  const oura = await snapshotLib.writeOuraSnapshots(fakeUserClient().client, 'u1', {
    sleep: { data: [{ day: '2026-10-30', total_sleep_duration: 7.25 * 3600, type: 'long_sleep' }, { day: '2026-10-28', efficiency: 90, type: 'long_sleep' }] },
    readiness: { data: [{ day: '2026-10-29', score: 80 }] },
  });
  assert.deepEqual(oura.nights, [{ date: '2026-10-30', hours: 7.25 }], 'a day with no sleep hours, or none known, is no night');
});

// ── The four sync paths, run as written with their backends stubbed ──
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
function userDb() {
  const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }) };
  return { from: () => chain, rpc: async () => ({ error: null }) };
}
async function loadRoute(file, extra) {
  const recorded = [];
  const route = await loadRealModule(join(ROOT, file), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'u1', email: 'ann@shape.test' }), clientForRequest: async () => userDb() }],
      ['@/lib/request-utils', { dbError: (_e, _tag, code, msg) => nextServer.NextResponse.json({ error: msg }, { status: code }), readJson: async (req) => ({ ok: true, data: await req.json() }) }],
      ['@/lib/integrations/tokens', { getFreshAccessToken: async () => 'tok' }],
      ['@/lib/workout-share', { resolveWorkoutSharePrivacy: async () => 'private', findCrossSourceDuplicate: async () => null, maybeSendFirstShareNotice: async () => {}, activityStartISO: (x) => x }],
      ['@/lib/supabase/admin', { createAdminClient: () => userDb() }],
      ['@/lib/device-sleep', { recordDeviceNights: async (admin, userId, provider, nights) => { recorded.push({ admin, userId, provider, nights }); return { recorded: (nights || []).length }; } }],
      ...extra,
    ]),
  });
  return { route, recorded };
}
async function quietFetch(fn) {
  const was = globalThis.fetch, warn = console.warn;
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('personal_info') || String(url).includes('/user/') ? {} : { records: [], data: [] }), text: async () => '' });
  console.warn = () => {};
  try { return await fn(); } finally { globalThis.fetch = was; console.warn = warn; }
}
const NIGHTS = [{ date: '2026-10-30', hours: 8 }];

for (const [name, file, writer] of [['oura', 'src/app/api/integrations/oura/sync/route.ts', 'writeOuraSnapshots'], ['whoop', 'src/app/api/integrations/whoop/sync/route.ts', 'writeWhoopSnapshots']]) {
  test(`the ${name} sync records the nights it filed with the service key; its answer is as before`, async () => {
    const { route, recorded } = await loadRoute(file, [['@/lib/health-snapshot', { [writer]: async () => ({ days: 2, nights: NIGHTS }) }]]);
    const out = await quietFetch(() => route.GET(new Request(`https://shape.test/api/integrations/${name}/sync`)));
    assert.equal(out.status, 200);
    assert.deepEqual(recorded, [{ admin: null, userId: 'u1', provider: name, nights: NIGHTS }]);
    assert.deepEqual((await out.json()).snapshot, { days: 2 }, 'the nights are not in the answer');
    // A failed snapshot write records nothing and still answers.
    const failed = await loadRoute(file, [['@/lib/health-snapshot', { [writer]: async () => { throw new Error('offline'); } }]]);
    const out2 = await quietFetch(() => failed.route.GET(new Request(`https://shape.test/api/integrations/${name}/sync`)));
    assert.equal(out2.status, 200);
    assert.deepEqual(failed.recorded.map((r) => r.nights), [[]]);
    assert.deepEqual((await out2.json()).snapshot, { days: 0 });
  });
}

test("the Garmin webhook records each member's nights with its own service client", async () => {
  const links = [{ user_id: 'u1', provider_user_id: 'g1' }, { user_id: 'u2', provider_user_id: 'g2' }];
  const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: links, error: null }), maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), insert: async () => ({ error: null }) };
  const admin = { from: () => chain };
  const { route, recorded } = await loadRoute('src/app/api/integrations/garmin/webhook/route.ts', [
    ['@/lib/supabase/admin', { createAdminClient: () => admin }],
    ['@/lib/health-snapshot', { upsertSnapshot: async () => ({ written: 1 }) }],
  ]);
  const was = process.env.GARMIN_WEBHOOK_SECRET;
  process.env.GARMIN_WEBHOOK_SECRET = 'sekret';
  try {
    const out = await route.POST(new Request('https://shape.test/api/integrations/garmin/webhook?token=sekret', { method: 'POST', body: JSON.stringify({ sleeps: [
      { userId: 'g1', calendarDate: '2026-10-30', durationInSeconds: 8 * 3600 },
      { userId: 'g1', calendarDate: '2026-10-29', durationInSeconds: 7.5 * 3600 },
      { userId: 'g2', calendarDate: '2026-10-30', durationInSeconds: 6 * 3600 },
      { userId: 'g1', calendarDate: '2026-10-28' },                       // no duration: no night
      { userId: 'nobody', calendarDate: '2026-10-30', durationInSeconds: 9 * 3600 },
    ] }) }));
    assert.equal(out.status, 200);
  } finally { if (was === undefined) delete process.env.GARMIN_WEBHOOK_SECRET; else process.env.GARMIN_WEBHOOK_SECRET = was; }
  assert.deepEqual(recorded.map((r) => [r.admin === admin, r.userId, r.provider, r.nights]), [
    [true, 'u1', 'garmin', [{ date: '2026-10-30', hours: 8 }, { date: '2026-10-29', hours: 7.5 }]],
    [true, 'u2', 'garmin', [{ date: '2026-10-30', hours: 6 }]],
  ]);
});

test('the Apple Health sync records the nights the app posted', async () => {
  const { route, recorded } = await loadRoute('src/app/api/integrations/apple-health/sync/route.ts', [
    ['@/lib/health-snapshot', { upsertSnapshot: async () => ({ written: 1 }) }],
  ]);
  const out = await route.POST(new Request('https://shape.test/api/integrations/apple-health/sync', { method: 'POST', body: JSON.stringify({ days: [
    { date: '2026-10-30', patch: { sleep_hours: 7.5, steps: 4000 } },
    { date: '2026-10-29', patch: { steps: 3000 } },
    { date: '2026-10-28', patch: { sleep_hours: 'eight' } },
  ] }) }));
  assert.equal(out.status, 200);
  assert.deepEqual(recorded, [{ admin: null, userId: 'u1', provider: 'apple_health', nights: [{ date: '2026-10-30', hours: 7.5 }] }]);
});

test('the helper writes with the service client, never the member\'s', () => {
  const lib = read('src/lib/device-sleep.ts');
  assert.match(lib, /import \{ createAdminClient \} from '@\/lib\/supabase\/admin';/);
  assert.doesNotMatch(lib, /clientForRequest|request-auth/);
  // Erased with the account, by name, as the other health tables are (the login's cascade is
  // the last step and can fail on its own).
  assert.match(read('src/lib/account-erasure.ts'), /\{ table: 'device_sleep_nights', col: 'user_id' \},/);
});
