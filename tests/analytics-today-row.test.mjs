// tests/analytics-today-row.test.mjs
//
// /api/client/analytics's "today" figures are the member's own day's row (Codex P2 on #2583): with
// nothing logged yet today, the newest row is yesterday's, and Home's Team card read its calories as
// "Fuel left today". The route runs here as it ships, on a stub client; the app's three readers send
// their local day.
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
const stubClient = {
  from: (table) => {
    const rows = table === 'daily_health_snapshot' ? snapRows : table === 'activities' ? activityRows : [];
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  },
};
const localDay = await loadRealModule(join(ROOT, 'src/lib/local-day.ts'), { typescript: true });
const ROUTE = await loadRealModule(join(ROOT, 'src/app/api/client/analytics/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer], ['@/lib/local-day', localDay],
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
async function ticker(rows, date) {
  snapRows = rows;
  const url = `https://shape.test/api/client/analytics${date ? `?date=${date}` : ''}`;
  return (await (await ROUTE.GET(new Request(url))).json()).ticker;
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
});

test("the app's readers send the member's local day", () => {
  const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  assert.equal((backend.match(/cachedClientJson\(`\/api\/client\/analytics\?date=\$\{_localDate\(\)\}`\)/g) || []).length, 2,
    'getAnalytics and getClientAnalytics both send the local day');
  assert.doesNotMatch(backend, /'\/api\/client\/analytics'/);
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /bsApi\.fetch\(`\/api\/client\/analytics\?date=\$\{bsCiIso\(new Date\(\)\)\}`/);
  assert.doesNotMatch(client, /fetch\('\/api\/client\/analytics'/);
  const web = readFileSync(join(ROOT, 'public/newdesign/pageShell.jsx'), 'utf8');
  assert.match(web, /fetch\(`\/api\/client\/analytics\?date=\$\{_day\}`/);
  assert.doesNotMatch(web, /fetch\("\/api\/client\/analytics"/);
});
