// The weekly recap (owner, 2026-11-10: "Keep a shareable weekly recap free, and charge for the AI
// readout"), and the membership's prices (an annual price beside the month).
//
//   1  the week: Monday to Sunday in the member's own zone, this one or the one before.
//   2  the figures: honest, from the member's own rows (a meal log counts as a day, not a meal).
//   3  the route: free (any signed-in adult account), private, a failed read is a 503.
//   4  /api/membership/plans: the month and the year from Stripe; a price of the wrong interval is none.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { recapWeek, buildRecap, RECAP_HISTORY_DAYS, STREAK_MAX_DAYS } from '../src/lib/weekly-recap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const NY = 'America/New_York';
// Wednesday 11 November 2026, 22:30 in New York (Thursday 03:30 UTC).
const NOW = Date.parse('2026-11-12T03:30:00Z');

test('1: the week is the member\'s own Monday to Sunday, the last one by default', () => {
  assert.deepEqual(recapWeek({ now: NOW, zone: NY, which: 'current' }), { weekStart: '2026-11-09', weekEnd: '2026-11-15', startMs: Date.parse('2026-11-09T05:00:00Z'), endMs: Date.parse('2026-11-16T05:00:00Z') });
  assert.deepEqual(recapWeek({ now: NOW, zone: NY }), { weekStart: '2026-11-02', weekEnd: '2026-11-08', startMs: Date.parse('2026-11-02T05:00:00Z'), endMs: Date.parse('2026-11-09T05:00:00Z') });
  // A Sunday night in New York is Monday in UTC: the member's week, not the server's.
  const sundayNight = Date.parse('2026-11-16T03:00:00Z');
  assert.equal(recapWeek({ now: sundayNight, zone: NY, which: 'current' }).weekStart, '2026-11-09');
  assert.equal(recapWeek({ now: sundayNight, zone: null, which: 'current' }).weekStart, '2026-11-16', 'no zone: UTC');
  assert.equal(recapWeek({ now: NOW, zone: 'Not/AZone', which: 'current' }).weekStart, '2026-11-09', 'an unknown zone reads as UTC');
});

test('2: the figures are the member\'s own, and honest about what is not known', () => {
  const week = recapWeek({ now: NOW, zone: NY });
  const sessions = [
    { status: 'completed', started_at: '2026-11-03T12:00:00Z', ended_at: '2026-11-03T12:45:00Z' },
    { status: 'reviewed', started_at: '2026-11-05T22:00:00Z', ended_at: '2026-11-05T22:30:00Z' },
    // No end: counted as a workout, not in the minutes.
    { status: 'completed', started_at: '2026-11-07T15:00:00Z' },
    // A timer left running for a day: a workout, its minutes left out.
    { status: 'completed', started_at: '2026-11-08T10:00:00Z', ended_at: '2026-11-09T02:00:00Z' },
    // Monday 00:30 New York is 05:30 UTC: next week's.
    { status: 'completed', started_at: '2026-11-09T05:30:00Z', ended_at: '2026-11-09T06:00:00Z' },
    // Before the week: only the streak reads it.
    { status: 'completed', started_at: '2026-11-01T12:00:00Z' },
  ];
  const ledger = [
    { delta: 50, earned_at: '2026-11-03T12:46:00Z', source_kind: 'workout' },
    { delta: 10, earned_at: '2026-11-03T18:00:00Z', source_kind: 'meal_log' },
    { delta: 10, earned_at: '2026-11-04T18:00:00Z', source_kind: 'meal_log' },
    { delta: -200, earned_at: '2026-11-04T19:00:00Z', source_kind: 'store_redeem' },
    { delta: 100, earned_at: '2026-11-06T19:00:00Z', source_kind: 'tier_bonus' },
    { delta: 10, earned_at: '2026-11-10T18:00:00Z', source_kind: 'meal_log' },
  ];
  const r = buildRecap({ sessions, ledger, week, zone: NY, now: NOW });
  assert.equal(r.workouts, 4);
  assert.equal(r.activeMinutes, 75, '45 + 30; the untimed and the day-long are left out');
  assert.equal(r.mealDays, 2, 'days a meal was logged, never a count of meals');
  assert.equal(r.points, 70, 'a Store spend and a tier bonus are not the week\'s earning');
  assert.equal(r.daysActive, 5, 'the 3rd (twice), 4th, 5th, 7th and 8th');
  assert.equal(r.streak, 0, 'no workout today or yesterday');
  const none = buildRecap({ sessions: [], ledger: [], week, zone: NY, now: NOW });
  assert.deepEqual(none, { workouts: 0, activeMinutes: null, mealDays: 0, daysActive: 0, points: 0, streak: 0 });
  const streak = buildRecap({ sessions: [
    { status: 'completed', started_at: '2026-11-11T12:00:00Z' },
    { status: 'completed', started_at: '2026-11-10T12:00:00Z' },
    { status: 'completed', started_at: '2026-11-09T12:00:00Z' },
    { status: 'abandoned', started_at: '2026-11-08T12:00:00Z' },
  ], ledger: [], week, zone: NY, now: NOW });
  assert.equal(streak.streak, 3, 'counted back from today, an abandoned one is no workout');
  // ⚠ A long streak is counted whole (Codex P2 on #2675): 150 days in a row, read for 120, was 120.
  const long = [];
  for (let d = 0; d < 150; d += 1) long.push({ status: 'completed', started_at: new Date(Date.parse('2026-11-11T17:00:00Z') - d * 86400000).toISOString() });
  assert.equal(buildRecap({ sessions: long, ledger: [], week, zone: NY, now: NOW }).streak, 150);
  assert.ok(RECAP_HISTORY_DAYS > STREAK_MAX_DAYS, 'the read reaches back past the longest streak a recap counts');
});

async function recapRoute({ denied = null, user = { id: 'u1' }, fail = [], zone = NY, zoneFails = false } = {}) {
  const reads = [];
  const supabase = {
    from: (table) => {
      const q = { table, filters: [] };
      const chain = new Proxy(q, { get: (t, k) => (k === 'then'
        ? (res, rej) => Promise.resolve(fail.includes(table) ? { data: null, error: { message: 'down' } } : { data: table === 'workout_sessions' ? [{ status: 'completed', started_at: '2026-11-03T12:00:00Z', ended_at: '2026-11-03T12:40:00Z' }] : [{ delta: 30, earned_at: '2026-11-03T12:41:00Z', source_kind: 'workout' }], error: null }).then(res, rej)
        : (...args) => { reads.push([table, k, ...args]); return chain; }) });
      return chain;
    },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/client/weekly-recap/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => supabase }],
      ['@/lib/require-membership', { requireAccount: async () => denied, requireNora: async () => denied }],
      ['@/lib/account-timezone', { readAccountZone: async () => (zoneFails ? { ready: false, zone: null, error: true } : { ready: true, zone, error: false }) }],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
    ]),
  });
  return { route, reads };
}

test('3: the recap is free for any account, its own rows only, private; a failed read is no recap', async () => {
  const { route, reads } = await recapRoute();
  const res = await route.GET(new Request('https://shape.test/api/client/weekly-recap'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0');
  const body = await res.json();
  assert.equal(typeof body.weekStart, 'string');
  assert.ok(reads.some((r) => r[0] === 'workout_sessions' && r[1] === 'eq' && r[2] === 'client_id' && r[3] === 'u1'), 'the member\'s own sessions');
  // Back far enough for the longest streak, a page at a time in id order.
  const since = reads.find((r) => r[0] === 'workout_sessions' && r[1] === 'gte');
  assert.ok(since && Date.now() - Date.parse(since[3]) >= STREAK_MAX_DAYS * 86400000, 'sessions are read back past the longest streak');
  assert.ok(reads.some((r) => r[0] === 'workout_sessions' && r[1] === 'order' && r[2] === 'id'), 'paged by id');
  assert.ok(reads.some((r) => r[0] === 'score_ledger' && r[1] === 'eq' && r[2] === 'user_id' && r[3] === 'u1'), 'and their own points');
  const refused = new nextServer.NextResponse(null, { status: 401 });
  assert.equal((await (await recapRoute({ denied: refused })).route.GET(new Request('https://shape.test/api/client/weekly-recap'))).status, 401);
  assert.equal((await (await recapRoute({ fail: ['score_ledger'] })).route.GET(new Request('https://shape.test/api/client/weekly-recap'))).status, 503);
  // ⚠ A zone that could not be read is not "no zone" (Codex P2 on #2675): read as UTC, the recap
  // would be of the wrong Monday-to-Sunday. No recap, and no read of the member's rows.
  const lost = await recapRoute({ zoneFails: true });
  const lostRes = await lost.route.GET(new Request('https://shape.test/api/client/weekly-recap'));
  assert.equal(lostRes.status, 503);
  assert.equal(lostRes.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(lost.reads.length, 0);
  // An account with no zone of its own is a real answer: its week is UTC's.
  assert.equal((await (await recapRoute({ zone: null })).route.GET(new Request('https://shape.test/api/client/weekly-recap'))).status, 200);
});

test('4: /api/membership/plans reads the month and the year from Stripe; a wrong interval or a missing price is none', async () => {
  const prices = {
    price_month: { active: true, unit_amount: 500, recurring: { interval: 'month', interval_count: 1 } },
    price_year: { active: true, unit_amount: 4800, recurring: { interval: 'year', interval_count: 1 } },
    price_wrong: { active: true, unit_amount: 500, recurring: { interval: 'month', interval_count: 1 } },
  };
  const load = async (env) => {
    Object.assign(process.env, { STRIPE_PLATFORM_PRICE_ID: '', STRIPE_PLATFORM_ANNUAL_PRICE_ID: '', ...env });
    return loadRealModule(join(ROOT, 'src/app/api/membership/plans/route.ts'), {
      typescript: true,
      registry: new Map([['next/server', nextServer], ['@/lib/stripe', { stripe: { prices: { retrieve: async (id) => { if (!prices[id]) throw new Error('no such price'); return prices[id]; } } } }]]),
    });
  };
  const both = await (await (await load({ STRIPE_PLATFORM_PRICE_ID: 'price_month', STRIPE_PLATFORM_ANNUAL_PRICE_ID: 'price_year' })).GET()).json();
  assert.deepEqual(both, { monthly: { priceCents: 500, interval: 'month' }, annual: { priceCents: 4800, interval: 'year' } });
  const monthOnly = await (await (await load({ STRIPE_PLATFORM_PRICE_ID: 'price_month' })).GET()).json();
  assert.equal(monthOnly.annual, null);
  const wrong = await (await (await load({ STRIPE_PLATFORM_PRICE_ID: 'price_month', STRIPE_PLATFORM_ANNUAL_PRICE_ID: 'price_wrong' })).GET()).json();
  assert.equal(wrong.annual, null, 'a month sold as a year is no plan');
  const gone = await (await (await load({ STRIPE_PLATFORM_PRICE_ID: 'price_missing' })).GET()).json();
  assert.equal(gone.monthly, null);
});
