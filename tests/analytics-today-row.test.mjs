// tests/analytics-today-row.test.mjs
//
// /api/client/analytics's "today" figures are the member's own day's row (Codex P2 on #2583): with
// nothing logged yet today, the newest row is yesterday's, and Home's Team card read its calories as
// "Fuel left today"; and today's activities are today's by the member's clock too. The route runs here as
// it ships, on a stub client; the app's readers send their local day and zone.
//
// The runtime is pinned to a zone behind UTC, so a member's evening is the next UTC day.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

let snapRows = [];
let activityRows = [];
let sessionRows = [];
let ledgerRows = [];
const gteCalls = [];
const stubClient = {
  from: (table) => {
    const rows = table === 'daily_health_snapshot' ? snapRows : table === 'activities' ? activityRows : table === 'workout_sessions' ? sessionRows : table === 'score_ledger' ? ledgerRows : [];
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: (col, val) => { gteCalls.push({ table, col, val }); return q; }, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  },
};
const localDay = await loadRealModule(join(ROOT, 'src/lib/local-day.ts'), { typescript: true });
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });
const ROUTE = await loadRealModule(join(ROOT, 'src/app/api/client/analytics/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer], ['@/lib/local-day', localDay], ['@/lib/time', time],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/request-auth', { clientForRequest: async () => stubClient, currentUser: async () => ({ id: 'u-1' }) }],
  ]),
});

const iso = (d) => d.toISOString().slice(0, 10);
const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const row = (snapshot_date, extra = {}) => ({
  snapshot_date, sleep_hours: null, protein_g: null, dietary_kcal: null, recovery_score: null, hrv_ms: null,
  resting_hr: null, weight_lb: null, mood: null, workout_minutes: null, ...extra,
});
async function ticker(rows, date, { tz = null, acts = [] } = {}) {
  snapRows = rows;
  activityRows = acts;
  const q = [date ? `date=${date}` : null, tz ? `tz=${encodeURIComponent(tz)}` : null].filter(Boolean).join('&');
  return (await (await ROUTE.GET(new Request(`https://shape.test/api/client/analytics${q ? `?${q}` : ''}`))).json()).ticker;
}

test("yesterday's row is never today's: no calories, protein, mood or workout until today has a row", async () => {
  const today = iso(new Date());
  const yest = shift(today, -1);
  const t = await ticker([row(yest, { dietary_kcal: 2140, protein_g: 150, mood: 7, workout_minutes: 45, sleep_hours: 7.5 })], today);
  assert.equal(t.cal, null, 'yesterday\'s calories read as today\'s');
  assert.equal(t.protein_g, null);
  assert.equal(t.mood, null);
  assert.equal(t.trained_today, false, 'yesterday\'s workout read as today\'s');
  assert.equal(t.today_activity_min, null);
  assert.equal(t.sleep_delta_min, null);
  // The latest-of figures still read the newest row that has them.
  assert.equal(t.sleep_hours, 7.5);
});

test("today's row gives today's figures, and the night against the row before it", async () => {
  const today = iso(new Date());
  const t = await ticker([
    row(shift(today, -2), { sleep_hours: 6 }),
    row(shift(today, -1), { sleep_hours: 7, dietary_kcal: 2300 }),
    row(today, { dietary_kcal: 640.4, protein_g: 52.6, mood: 8, workout_minutes: 30, sleep_hours: 8 }),
  ], today);
  assert.equal(t.cal, 640);
  assert.equal(t.protein_g, 53);
  assert.equal(t.mood, 8);
  assert.equal(t.trained_today, true);
  assert.equal(t.today_activity_min, 30);
  assert.equal(t.sleep_delta_min, 60);
});

test("the member's day, not the server's: an evening in New York is the next UTC day", async () => {
  // The member's day is the 3rd; the server's UTC day may be the 4th. Their row for the 3rd is today's.
  const memberDay = shift(iso(new Date()), -1);
  const t = await ticker([row(shift(memberDay, -1), { dietary_kcal: 1900 }), row(memberDay, { dietary_kcal: 1200 })], memberDay);
  assert.equal(t.cal, 1200);
  // And a row dated after the member's day (a device a day ahead) is not today's either.
  const t2 = await ticker([row(memberDay, { dietary_kcal: 1200 }), row(shift(memberDay, 1), { dietary_kcal: 300 })], memberDay);
  assert.equal(t2.cal, 1200);
});

test('without ?date= the day is the server\'s UTC day, and a malformed one is ignored', async () => {
  const utc = iso(new Date());
  assert.equal((await ticker([row(utc, { dietary_kcal: 900 })])).cal, 900);
  assert.equal((await ticker([row(shift(utc, -1), { dietary_kcal: 900 })])).cal, null);
  assert.equal((await ticker([row(utc, { dietary_kcal: 900 })], 'yesterday')).cal, 900);
  // Shaped right but no real day: the UTC day, and a 200, never a RangeError (Codex P2 on #2583).
  for (const bad of ['2026-99-99', '2026-02-30', '2026-13-01', '0000-00-00']) {
    const res = await ROUTE.GET(new Request(`https://shape.test/api/client/analytics?date=${bad}&tz=America%2FNew_York`));
    assert.equal(res.status, 200, bad);
    assert.equal((await res.json()).pulse.workout.length, 7, bad);
    assert.equal((await ticker([row(utc, { dietary_kcal: 900 })], bad)).cal, 900, bad);
  }
});

test("an activity is today's by the member's own clock, as the calories are (Codex P2 on #2583)", async () => {
  // A New York member on their day D. A run at 21:30 local on D is 01:30Z on D+1; a ride at 21:30 on
  // D-1 is 01:30Z on D. By UTC dates the run would be tomorrow's and the ride today's.
  const D = '2026-11-03';
  const acts = [
    { activity_type: 'run', started_at: '2026-11-04T01:30:00Z', duration_min: 40, distance_km: 8 },
    { activity_type: 'ride', started_at: '2026-11-03T01:30:00Z', duration_min: 90, distance_km: 30 },
  ];
  const t = await ticker([row(D, { dietary_kcal: 1500 })], D, { tz: 'America/New_York', acts });
  assert.equal(t.trained_today, true);
  assert.equal(t.today_activity_type, 'run', "last night's ride read as today's");
  assert.equal(t.today_distance_km, 8);
  assert.equal(t.today_activity_min, 40);
  // Its evening ride alone is yesterday's: nothing trained today.
  const t2 = await ticker([row(D, {})], D, { tz: 'America/New_York', acts: [acts[1]] });
  assert.equal(t2.trained_today, false);
  assert.equal(t2.today_activity_type, null);
  // In Tokyo, an 08:00 run on D is 23:00Z on D-1: still today's.
  const t3 = await ticker([row(D, {})], D, { tz: 'Asia/Tokyo', acts: [{ activity_type: 'run', started_at: '2026-11-02T23:00:00Z', duration_min: 30, distance_km: 5 }] });
  assert.equal(t3.today_activity_type, 'run');
  // A zone the runtime does not know is ignored: the UTC date is read.
  const t4 = await ticker([row(D, {})], D, { tz: 'Not/AZone', acts: [acts[1]] });
  assert.equal(t4.today_activity_type, 'ride');
});

test("the week is the member's last seven days, each session on its own day (Codex P2s on #2583)", async () => {
  // A New York member on D. A session at 21:30 on D-1 is 01:30Z on D: it is D-1's, and the week ends on D.
  const D = '2026-11-03';
  snapRows = [row(D, { protein_g: 130 })];
  activityRows = [];
  sessionRows = [
    { started_at: '2026-11-03T01:30:00Z', status: 'completed' }, // 21:30 on Nov 2 in New York
    { started_at: '2026-10-28T14:00:00Z', status: 'completed' }, // Oct 28, the week's first day
    { started_at: '2026-10-27T14:00:00Z', status: 'completed' }, // Oct 27, the day before the week
  ];
  try {
    const res = await (await ROUTE.GET(new Request(`https://shape.test/api/client/analytics?date=${D}&tz=America%2FNew_York`))).json();
    // The week is Oct 28 … Nov 3: Oct 28 and Nov 2 trained, Nov 3 (today) not yet.
    assert.deepEqual(res.pulse.workout, [1, 0.15, 0.15, 0.15, 0.15, 1, 0.15]);
    assert.equal(res.workouts_this_week, 2);
    assert.equal(res.protein_hits_this_week, 1, "today's row is the week's last day");
  } finally { sessionRows = []; }
});

test("the week's points count from midnight of its first day on the member's clock", async () => {
  const since = async (date, tz) => {
    gteCalls.length = 0;
    snapRows = [];
    const q = [`date=${date}`, tz ? `tz=${encodeURIComponent(tz)}` : null].filter(Boolean).join('&');
    await ROUTE.GET(new Request(`https://shape.test/api/client/analytics?${q}`));
    return gteCalls.find((c) => c.table === 'score_ledger' && c.col === 'earned_at').val;
  };
  // Nov 3's week starts Oct 28: midnight in New York (EDT) is 04:00Z, in Tokyo 15:00Z the day before.
  assert.equal(await since('2026-11-03', 'America/New_York'), '2026-10-28T04:00:00.000Z');
  assert.equal(await since('2026-11-03', 'Asia/Tokyo'), '2026-10-27T15:00:00.000Z');
  // No zone: the first day's UTC midnight.
  assert.equal(await since('2026-11-03', null), '2026-10-28T00:00:00.000Z');
  // A zone whose clock skips midnight (Santiago, 2026-09-06 00:00 → 01:00): its 01:00.
  assert.equal(await since('2026-09-12', 'America/Santiago'), '2026-09-06T04:00:00.000Z');
});

test("the app's readers send the member's local day and zone", () => {
  const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  assert.equal((backend.match(/cachedClientJson\(`\/api\/client\/analytics\?date=\$\{_localDate\(\)\}&tz=\$\{encodeURIComponent\(deviceZone\(\) \|\| ''\)\}`\)/g) || []).length, 2,
    'getAnalytics and getClientAnalytics both send the local day and zone');
  assert.doesNotMatch(backend, /'\/api\/client\/analytics'/);
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /bsApi\.fetch\(`\/api\/client\/analytics\?date=\$\{bsCiIso\(new Date\(\)\)\}&tz=\$\{encodeURIComponent\(tz\)\}`/);
  assert.doesNotMatch(client, /fetch\('\/api\/client\/analytics'/);
  const web = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
  assert.match(web, /fetch\(`\/api\/client\/analytics\?date=\$\{_day\}&tz=\$\{encodeURIComponent\(_tz\)\}`/);
  assert.doesNotMatch(web, /fetch\("\/api\/client\/analytics"/);
});
