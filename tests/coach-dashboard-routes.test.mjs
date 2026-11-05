// The coach dashboards' Today and this week (/api/trainer/dashboard, /api/nutritionist/dashboard).
//
// ⚠ THE DAY IS THE COACH'S (2026-11-05). Both routes picked "today" with setHours(0, 0, 0, 0) on
// the server, which is UTC on Vercel: a New York coach's 7 pm session fell off Today and the next
// morning's sessions showed from 7 pm on. The routes now count the day and the week on the coach's
// own clock: the zone stored on their listing, else the browser's `tz`, else UTC. These tests drive
// the real routes, with the clock held, over a fake database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { dayBoundsInZone, weekBoundsInZone, coachDayZone, wallClockInZone } from '../src/lib/time.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const COACH = { id: '33333333-3333-4333-8333-333333333333', email: 'coach@shape.test' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const H = 3600_000;

// 2026-11-05, 10:00 in New York (EST, UTC−5).
const NOW = Date.UTC(2026, 10, 5, 15, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

test('a New York day runs midnight to midnight on its own clock', () => {
  const d = dayBoundsInZone(NOW, 'America/New_York');
  assert.equal(iso(d.start), '2026-11-05T05:00:00.000Z');
  assert.equal(iso(d.end), '2026-11-06T05:00:00.000Z');
  // The 7 pm session: 00:00 UTC the next day, and still today in New York.
  const sevenPm = Date.UTC(2026, 10, 6, 0, 0, 0);
  assert.ok(sevenPm >= d.start && sevenPm < d.end, '7 pm Eastern is today');
  const utc = dayBoundsInZone(NOW, 'UTC');
  assert.ok(!(sevenPm >= utc.start && sevenPm < utc.end), 'and on the UTC day it is not: the bug');
  // East of UTC the day starts the evening before.
  const tokyo = dayBoundsInZone(NOW, 'Asia/Tokyo');
  assert.equal(iso(tokyo.start), '2026-11-05T15:00:00.000Z', 'at 15:00Z it is already the 6th in Tokyo');
});

test('a day across a DST change is 23 or 25 hours long, as it is on the wall', () => {
  const back = dayBoundsInZone(Date.UTC(2026, 10, 1, 16, 0, 0), 'America/New_York');   // 1 Nov, clocks back
  assert.equal(back.end - back.start, 25 * H);
  const fwd = dayBoundsInZone(Date.UTC(2026, 2, 8, 16, 0, 0), 'America/New_York');     // 8 Mar, clocks forward
  assert.equal(fwd.end - fwd.start, 23 * H);
  assert.equal(wallClockInZone(fwd.start, 'America/New_York').time, '00:00');
});

test('where a DST change skips midnight, the day starts at its first real minute', () => {
  // Chile moves its clocks forward at midnight; whatever the year's date, every day of the
  // spring has a start on its own date, and the minute before it is the day before.
  for (let d = 1; d <= 14; d++) {
    const t = Date.UTC(2026, 8, d, 18, 0, 0);
    const b = dayBoundsInZone(t, 'America/Santiago');
    assert.ok(b, `a day for 2026-09-${d}`);
    const here = wallClockInZone(t, 'America/Santiago').date;
    assert.equal(wallClockInZone(b.start, 'America/Santiago').date, here);
    assert.notEqual(wallClockInZone(b.start - 60_000, 'America/Santiago').date, here);
    assert.ok(b.end - b.start >= 23 * H && b.end - b.start <= 25 * H);
  }
});

test('the week is Monday to Monday on the coach\'s clock', () => {
  // Sunday 8 Nov, 8 pm in New York: 01:00 UTC on Monday the 9th, still last week here.
  const sundayEve = Date.UTC(2026, 10, 9, 1, 0, 0);
  const w = weekBoundsInZone(sundayEve, 'America/New_York');
  assert.equal(iso(w.start), '2026-11-02T05:00:00.000Z');
  assert.equal(iso(w.end), '2026-11-09T05:00:00.000Z');
  assert.ok(sundayEve < w.end);
  assert.equal(iso(weekBoundsInZone(sundayEve, 'UTC').start), '2026-11-09T00:00:00.000Z', 'UTC had already turned');
});

test('the zone: the listing\'s, else the browser\'s, else UTC; never a name the runtime refuses', () => {
  assert.equal(coachDayZone('America/Chicago', 'Europe/Berlin'), 'America/Chicago');
  assert.equal(coachDayZone(null, 'Europe/Berlin'), 'Europe/Berlin');
  assert.equal(coachDayZone('Area/Nowhere', 'Europe/Berlin'), 'Europe/Berlin');
  assert.equal(coachDayZone(undefined, 'not a zone'), 'UTC');
  assert.equal(coachDayZone('', ''), 'UTC');
  assert.equal(dayBoundsInZone(NOW, ''), null, 'an absent zone is refused, not read as the system clock');
});

// ── The routes ──────────────────────────────────────────────────────────────
const session = (at, o = {}) => ({ id: 's-' + at, scheduled_at: iso(at), duration_min: 60, type: 'video', status: 'confirmed', topic: null, client_name: 'Ada', client_id: A, provider_role: 'trainer', provider_id: 7, intro: false, ...o });

async function loadRoute(role, tables, { query = '', fail = [] } = {}) {
  const db = fakeSupabase({ tables, fail });
  db.auth = { getUser: async () => ({ data: { user: COACH } }) };
  const ts = (p, registry = new Map()) => loadRealModule(join(ROOT, p), { typescript: true, registry });
  const trajectory = await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href);
  const readAll = await ts('src/lib/read-all-by-id.ts');
  const route = await loadRealModule(join(ROOT, `src/app/api/${role}/dashboard/route.ts`), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => db }],
      ['@/lib/time', await ts('src/lib/time.ts')],
      ['@/lib/coach-growth', await ts('src/lib/coach-growth.ts', new Map([['@/lib/coach-trajectory.mjs', trajectory], ['@/lib/read-all-by-id', readAll]]))],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/coach-trajectory.mjs', trajectory],
      ['@/lib/read-all-by-id', readAll],
    ]),
  });
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const res = await route.GET(new Request(`https://shape.test/api/${role}/dashboard${query}`));
    return { status: res.status, body: await res.json(), calls: db.calls };
  } finally {
    Date.now = realNow;
  }
}

const SEVEN_PM_ET = Date.UTC(2026, 10, 6, 0, 0, 0);       // 5 Nov, 19:00 in New York
const NINE_AM_TOMORROW = Date.UTC(2026, 10, 6, 14, 0, 0);  // 6 Nov, 09:00 in New York
const EARLY_TODAY = Date.UTC(2026, 10, 5, 13, 0, 0);       // 5 Nov, 08:00 in New York

function practice(role, zone) {
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  return {
    profiles: [{ id: COACH.id, full_name: 'Maya Okafor' }],
    [table]: [{ id: 7, owner_id: COACH.id, ...(zone !== undefined ? { timezone: zone } : {}) }],
    subscriptions: [],
    sessions: [EARLY_TODAY, SEVEN_PM_ET, NINE_AM_TOMORROW].map((t) => session(t, { provider_role: role })),
  };
}

for (const role of ['trainer', 'nutritionist']) {
  test(`${role}: a 7 pm Eastern session stays on Today, and tomorrow's 9 am does not arrive early`, async () => {
    const { body } = await loadRoute(role, practice(role, 'America/New_York'));
    assert.deepEqual(body.today.map((r) => r.scheduledAt), [iso(EARLY_TODAY), iso(SEVEN_PM_ET)]);
    assert.equal(body.dayZone, 'America/New_York');
  });

  test(`${role}: with no zone on the listing, the browser's tz decides; with neither, UTC`, async () => {
    const browser = await loadRoute(role, practice(role, null), { query: '?tz=America%2FNew_York' });
    assert.deepEqual(browser.body.today.map((r) => r.scheduledAt), [iso(EARLY_TODAY), iso(SEVEN_PM_ET)]);
    // The stored zone wins over the browser's: Today must agree with the Schedule, which places
    // bookings on the listing's clock.
    const stored = await loadRoute(role, practice(role, 'America/New_York'), { query: '?tz=Asia%2FTokyo' });
    assert.equal(stored.body.dayZone, 'America/New_York');
    const none = await loadRoute(role, practice(role, null));
    assert.equal(none.body.dayZone, 'UTC');
    assert.deepEqual(none.body.today.map((r) => r.scheduledAt), [iso(EARLY_TODAY)], 'the UTC day ends at 7 pm Eastern');
  });

  test(`${role}: this week turns over at the coach's Monday midnight`, async () => {
    const t = role === 'trainer' ? 'sessionsThisWeek' : 'consultsThisWeek';
    const sunday9pmEt = Date.UTC(2026, 10, 9, 2, 0, 0);   // Sun 8 Nov 21:00 in New York, Mon 02:00 UTC
    const tables = practice(role, 'America/New_York');
    tables.sessions.push(session(sunday9pmEt, { provider_role: role }));
    const { body } = await loadRoute(role, tables);
    assert.equal(body.kpis[t], 4, 'all four sessions fall in the New York week of 2 Nov');
  });
}

test('the website sends its zone, and the sidebar asks for the same URL', () => {
  const data = readFileSync(join(ROOT, 'public/newdesign/dashData.jsx'), 'utf8');
  assert.match(data, /_dashJson\(dashRoleDashboardUrl\(role\)\)/);
  assert.match(data, /"\?tz=" \+ encodeURIComponent\(tz\)/);
  const sidebar = readFileSync(join(ROOT, 'public/newdesign/trainerDashboard.jsx'), 'utf8');
  assert.match(sidebar, /window\.dashRoleDashboardUrl\(role\)/);
});
