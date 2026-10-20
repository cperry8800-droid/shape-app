// The Home check-in asks about a night only when the member typed it or nobody did, and it
// never re-types a watch's night as the member's own. It used to take any day with a resting
// heart rate, HRV or sleep efficiency as a watch's night; a watch worn by day and charged at
// night reports a resting heart rate with no night, so the hours the member then typed read as
// the watch's, locked and never copied. `/api/client/progress` now sends the nights a watch
// wrote, from the snapshot's per-field sources: every device sync stamps
// `sources.sleep_hours` through upsertSnapshot, and a typed check-in never does.
// Run as written: the real route on a stub client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

function stubClient(tables) {
  const chain = (table) => {
    const rows = tables[table] || [];
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  };
  return { auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) }, from: chain, rpc: async () => ({ data: null, error: { message: 'not applied' } }) };
}

// `query` is what the app adds to the URL (getClientProgress sends `?date=`, the member's local day);
// the website sends nothing.
async function progress(snapshots, query = '') {
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true });
  const [time, setLoad, e1rm, readiness, localDay] = await Promise.all([lib('time.ts'), lib('set-load.ts'), lib('e1rm.ts'), lib('recovery-readiness.ts'), lib('local-day.ts')]);
  const client = stubClient({ daily_health_snapshot: snapshots });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/progress/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/time', time],
      ['@/lib/set-load', setLoad],
      ['@/lib/e1rm', e1rm],
      ['@/lib/local-day', localDay],
      ['@/lib/recovery-readiness', readiness],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'u-1' }) }],
    ]),
  });
  const res = await mod.GET(new Request(`https://shape.test/api/client/progress${query}`));
  return res.json();
}

test('the progress route sends the nights a watch wrote, and only those', async () => {
  // Newest first, as the route reads them.
  const body = await progress([
    { snapshot_date: '2026-10-18', sleep_hours: 7, resting_hr: 58, sources: { resting_hr: 'apple_health' } },
    { snapshot_date: '2026-10-17', sleep_hours: 7.2, hrv_ms: 50, sources: { sleep_hours: 'apple_health', hrv_ms: 'apple_health' } },
    { snapshot_date: '2026-10-16', sleep_hours: 6.5, sources: {} },
    { snapshot_date: '2026-10-15', sleep_hours: 8, sources: null },
    { snapshot_date: '2026-10-14', resting_hr: 60, sources: { sleep_hours: 'garmin' } },
    // Hours the member typed over a watch's night (Codex P2 on #2398).
    { snapshot_date: '2026-10-13', sleep_hours: 7.5, sources: { sleep_hours: 'manual', hrv_ms: 'oura' } },
  ]);
  assert.equal(body.ok, true);
  assert.deepEqual(body.series.sleepFromDevice, [{ date: '2026-10-17', value: 1 }],
    "a typed night on a day with a watch heart rate, a source with no night, or hours typed over a watch's night read as a watch night");
  assert.deepEqual(body.series.sleep.map((p) => p.date), ['2026-10-13', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
});

test('with no watch nights the series is sent empty, so the app knows the server reads sources', async () => {
  const body = await progress([{ snapshot_date: '2026-10-18', sleep_hours: 7, resting_hr: 58 }]);
  assert.deepEqual(body.series.sleepFromDevice, []);
});

// ── A skipped night, from the day's row ─────────────────────────────────────────
// The Morning check-in saves a skip on the day's row (`sleep_skipped`), and the card reads it from
// this series as well as from its own device, so a night skipped on one device is not asked again
// on another (part 2 of the Morning check-in, 2026-10-19).
test('the progress route sends the nights the member skipped, oldest first, and only a true skip', async () => {
  const body = await progress([
    { snapshot_date: '2026-10-18', energy: 6, sleep_skipped: true },
    { snapshot_date: '2026-10-17', energy: 4, sleep_skipped: null },
    { snapshot_date: '2026-10-16', energy: 8, sleep_skipped: false },
    // A watch's night that came in after the skip: still a skip on the row, and the card's own
    // rule decides which one stands.
    { snapshot_date: '2026-10-15', sleep_hours: 7, sleep_skipped: true, sources: { sleep_hours: 'oura' } },
    { snapshot_date: '2026-10-14', sleep_skipped: 'true' },
    { snapshot_date: '2026-10-13', sleep_skipped: 1 },
  ]);
  assert.deepEqual(body.series.sleepSkipped, [
    { date: '2026-10-15', value: 1 },
    { date: '2026-10-18', value: 1 },
  ], 'a null, false or non-boolean skip read as a skipped night, or the series is not oldest first');
});

test('before the sleep_skipped migration the skipped series is sent empty', async () => {
  // select('*') leaves the column out of every row; nothing fails, nothing is skipped.
  const body = await progress([{ snapshot_date: '2026-10-18', energy: 6, sleep_hours: 7 }]);
  assert.deepEqual(body.series.sleepSkipped, []);
});

// ── kpis.sleepAvg is the last 30 days, not the last 30 nights logged ───────────
// It averaged `sleeps.slice(-30)`, the newest 30 entries however old, under Progress's "30-day avg".
// The server's clock is fixed whole: the website's fallback day comes from `new Date()`
// (clientLocalDay), which a stubbed Date.now alone does not move.
async function atUtc(ms, fn) {
  const Real = globalThis.Date;
  class Fixed extends Real {
    constructor(...args) { super(...(args.length ? args : [ms])); }
    static now() { return ms; }
  }
  globalThis.Date = Fixed;
  try { return await fn(); } finally { globalThis.Date = Real; }
}

test('the 30-day sleep average reads the nights dated in the last 30 days', async () => {
  // The website sends no day. 23:30 UTC on the 19th: the server's today is the 19th, and the window
  // is the 20th of September to the 20th of October (a day of headroom for a member east of UTC).
  const body = await atUtc(Date.UTC(2026, 9, 19, 23, 30), () => progress([
    { snapshot_date: '2026-10-21', sleep_hours: 2 },   // two days ahead: ignored
    { snapshot_date: '2026-10-20', sleep_hours: 8 },   // tomorrow in UTC, a member's today east of it
    { snapshot_date: '2026-10-19', sleep_hours: 7 },
    { snapshot_date: '2026-10-10', energy: 6 },        // no night: not a zero
    { snapshot_date: '2026-09-20', sleep_hours: 6.2 }, // the 30th day
    { snapshot_date: '2026-09-19', sleep_hours: 3 },   // the 31st: out
    { snapshot_date: '2026-08-01', sleep_hours: 4 },
  ]));
  // (8 + 7 + 6.2) / 3 = 7.067, rounded to a tenth. The last 30 logged nights would read 5.0.
  assert.equal(body.kpis.sleepAvg, 7.1);
  // The series itself is unchanged: every night, oldest first.
  assert.deepEqual(body.series.sleep.map((p) => p.date), ['2026-08-01', '2026-09-19', '2026-09-20', '2026-10-19', '2026-10-20', '2026-10-21']);
});

test('with no night in the last 30 days the sleep average is null, however many are older', async () => {
  const body = await atUtc(Date.UTC(2026, 9, 19, 9), () => progress([
    { snapshot_date: '2026-09-19', sleep_hours: 7 },
    { snapshot_date: '2026-08-01', sleep_hours: 8 },
  ]));
  assert.equal(body.kpis.sleepAvg, null);
  const none = await progress([]);
  assert.equal(none.kpis.sleepAvg, null);
});

// ── The member's 30 days, from the day the app sends (part 2 review fixes, K10) ──
// Your mornings reads today and the 29 days before it on the member's own calendar. Windowed on the
// server's UTC day, Progress's "30-day avg" lost a night at one edge or gained one at the other.
const EDGE = [
  { snapshot_date: '2026-10-19', sleep_hours: 8 },
  { snapshot_date: '2026-09-21', sleep_hours: 7 },
  { snapshot_date: '2026-09-20', sleep_hours: 4 },
];

test("a member west of UTC keeps their 30th night in the evening, from the day the app sends", async () => {
  // Los Angeles, 18:00 PDT on the 19th of October, which is 01:00 UTC on the 20th. The member's 30
  // days are the 20th of September to the 19th of October.
  const at = Date.UTC(2026, 9, 20, 1);
  const app = await atUtc(at, () => progress(EDGE, '?date=2026-10-19'));
  assert.equal(app.kpis.sleepAvg, 6.3, "the night dated the 20th of September, the member's 30th day, was left out");
  // The website sends no day and still windows on the server's: the 30th night is out until midnight.
  const site = await atUtc(at, () => progress(EDGE));
  assert.equal(site.kpis.sleepAvg, 7.5);
});

test('a member east of UTC gets no 31st night in the morning', async () => {
  // Tokyo, 08:00 JST on the 20th of October, which is 23:00 UTC on the 19th. The member's 30 days
  // start on the 21st of September; the server's UTC day would reach back to the 20th.
  const body = await atUtc(Date.UTC(2026, 9, 19, 23), () => progress(EDGE, '?date=2026-10-20'));
  assert.equal(body.kpis.sleepAvg, 7.5, 'a 31st local day was counted');
});

test("a night a day past the member's today is read, for a clock a little ahead; two days past is not", async () => {
  const body = await atUtc(Date.UTC(2026, 9, 19, 12), () => progress([
    { snapshot_date: '2026-10-21', sleep_hours: 2 },
    { snapshot_date: '2026-10-20', sleep_hours: 8 },
    { snapshot_date: '2026-10-19', sleep_hours: 6 },
  ], '?date=2026-10-19'));
  assert.equal(body.kpis.sleepAvg, 7);
});

test('a day that is no date reads as none: the server\'s day, never a failed page', async () => {
  const nights = [{ snapshot_date: '2026-10-19', sleep_hours: 7 }, { snapshot_date: '2026-09-19', sleep_hours: 3 }];
  for (const q of ['?date=2026-13-45', '?date=tomorrow', '?date=']) {
    const body = await atUtc(Date.UTC(2026, 9, 19, 12), () => progress(nights, q));
    assert.equal(body.ok, true, q);
    assert.equal(body.kpis.sleepAvg, 7, q);
  }
});

test('a 0-hour night is not a night in the 30-day average', async () => {
  // A watch can sync a 0 (Garmin, Oura, Whoop, Apple Health). Your mornings, Goals, the engine and
  // the score route all drop it; counting it read 4.7 here beside their 7.
  const body = await atUtc(Date.UTC(2026, 9, 19, 12), () => progress([
    { snapshot_date: '2026-10-19', sleep_hours: 0, sources: { sleep_hours: 'garmin' } },
    { snapshot_date: '2026-10-18', sleep_hours: 7 },
    { snapshot_date: '2026-10-17', sleep_hours: 7 },
  ], '?date=2026-10-19'));
  assert.equal(body.kpis.sleepAvg, 7);
  // The series still carries it, as it always has: each reader drops it itself.
  assert.deepEqual(body.series.sleep.map((p) => p.value), [7, 7, 0]);
  const onlyZero = await atUtc(Date.UTC(2026, 9, 19, 12), () => progress([{ snapshot_date: '2026-10-19', sleep_hours: 0 }], '?date=2026-10-19'));
  assert.equal(onlyZero.kpis.sleepAvg, null, 'a 0-hour night made a 0 average');
});

// ── The app sends the member's day (shapeBackend.js getClientProgress) ──
// The route windows on the day it is sent, so the app has to send the device's own calendar day,
// never UTC's: run as written, off the module's own source, on a clock whose local day (the 19th in
// Los Angeles) is a day behind its UTC one (01:00 UTC on the 20th).
test("the app's progress read sends the member's local day, never UTC's", async () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const localDate = src.match(/^function _localDate\(d = new Date\(\)\) \{\n[\s\S]*?\n\}\n/m);
  const getProgress = src.match(/^async function getClientProgress\(\) \{[^\n]*\}\n/m);
  assert.ok(localDate && getProgress, 'shapeBackend.js no longer has _localDate and getClientProgress as read here');
  class LosAngeles {
    constructor(v) { this.v = v; }
    getFullYear() { return 2026; }
    getMonth() { return 9; }
    getDate() { return 19; }
    toISOString() { return '2026-10-20T01:00:00.000Z'; }
  }
  const asked = [];
  const cachedClientJson = (path) => { asked.push(path); return Promise.resolve({ ok: true, kpis: {} }); };
  // eslint-disable-next-line no-new-func
  const make = new Function('Date', 'cachedClientJson', `${localDate[0]}${getProgress[0]}return getClientProgress;`);
  const body = await make(LosAngeles, cachedClientJson)();
  assert.deepEqual(asked, ['/api/client/progress?date=2026-10-19'], "the read went out without the member's own day");
  assert.equal(body.ok, true);
});
