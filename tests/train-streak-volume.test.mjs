// The Train page's Streak and "Volume · 14 days" (owner, 2026-10-25: "fix the train page streak
// and volume too").
//
// The page read /api/client/train's `stats.currentStreak` and `volumeByDay`, and the route sent
// neither, so a signed-in member's Streak was always "0d" and the chart said "nothing logged"
// whatever they had lifted. The route now sends both, counted on the member's own days
// (client_profiles.timezone, UTC without one) by src/lib/workout-days.ts, and the dashboard's
// day streak (the profile's) uses the same rule, so the two are one number.
//
// These drive the SHIPPED route handlers against tests/helpers/fake-supabase.mjs, which applies
// each query's filters, orders and limits to the rows it is given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const LB = 1 / 0.45359237;
const NY = 'America/New_York';

let mods = null;
async function load() {
  if (mods) return mods;
  const lib = (f, registry = new Map()) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry });
  const time = await lib('time.ts');
  const [days, setLoad] = await Promise.all([lib('workout-days.ts', new Map([['@/lib/time', time]])), lib('set-load.ts')]);
  const trajectory = await import(join(ROOT, 'src/lib/coach-trajectory.mjs'));
  let client = null;
  const registry = () => new Map([
    ['next/server', require('next/server')],
    ['@/lib/time', time],
    ['@/lib/workout-days', days],
    ['@/lib/set-load', setLoad],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'u-1', email: 'm@shape.test' }) }],
    ['../../../../lib/coach-trajectory.mjs', trajectory],
  ]);
  const route = (r) => loadRealModule(join(ROOT, `src/app/api/client/${r}/route.ts`), { typescript: true, registry: registry() });
  const [train, dashboard] = await Promise.all([route('train'), route('dashboard')]);
  mods = { time, days, train, dashboard, use: (c) => { client = c; } };
  return mods;
}
let lastClient = null;
const GET = async (route, tables) => {
  const m = await load();
  lastClient = fakeSupabase({ tables });
  m.use(lastClient);
  return (await m[route].GET(new Request(`https://shape.test/api/client/${route}`))).json();
};

// An instant at a wall clock on a member's date, in their zone.
async function at(day, hhmm, zone) {
  const { time } = await load();
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(time.instantInZone(y, mo, d, h, mi, zone)).toISOString();
}
const session = (id, iso, status = 'completed') => ({ id, client_id: 'u-1', title: 'Lift', status, started_at: iso, ended_at: iso, created_at: iso, duration_seconds: 2400 });
const set = (iso, load, reps, unit, extra = {}) => ({ client_id: 'u-1', actual_load: load, actual_reps: reps, load_unit: unit, rpe: null, completed: true, created_at: iso, payload: {}, ...extra });

test('a member\'s day is their own: the date in their zone, UTC without one', async () => {
  const { days } = await load();
  assert.equal(days.memberDay('2026-10-25T03:30:00Z', NY), '2026-10-24', '11:30 pm in New York is still the 24th there');
  assert.equal(days.memberDay('2026-10-25T03:30:00Z', null), '2026-10-25');
  assert.equal(days.memberDay('not a time', NY), null);
  assert.equal(days.shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(days.shiftDay('2026-12-31', 1), '2027-01-01');
});

test('the streak runs to today, or to yesterday while today has none yet, and a gap ends it', async () => {
  const { days } = await load();
  const s = (...d) => new Set(d);
  assert.equal(days.dayStreak(s('2026-10-25', '2026-10-24', '2026-10-23'), '2026-10-25'), 3);
  assert.equal(days.dayStreak(s('2026-10-24', '2026-10-23'), '2026-10-25'), 2, 'today not trained yet keeps the streak');
  assert.equal(days.dayStreak(s('2026-10-23'), '2026-10-25'), 0, 'yesterday missed ends it');
  assert.equal(days.dayStreak(s('2026-10-25', '2026-10-23'), '2026-10-25'), 1, 'a gap ends it');
  assert.equal(days.dayStreak(s(), '2026-10-25'), 0);
});

test('the train route sends the streak and 14 days of volume, on the member\'s days', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), NY);
  const y = days.shiftDay(today, -1);
  const late = await at(y, '23:30', NY); // yesterday evening in New York, already today in UTC
  const tables = {
    client_profiles: [{ user_id: 'u-1', timezone: NY }],
    client_workouts: [],
    workout_sessions: [
      session('s-1', late),
      session('s-2', await at(days.shiftDay(today, -2), '12:00', NY)),
      session('s-3', await at(today, '00:30', NY), 'in_progress'), // not finished: no day
    ],
    workout_set_logs: [
      set(late, 100, 5, 'kg'),
      set(await at(today, '00:30', NY), 225, 5, 'lb'),
      set(await at(today, '00:40', NY), 135, 5, 'lb', { completed: false }), // not done: no volume
      set(await at(days.shiftDay(today, -20), '12:00', NY), 60, 10, 'kg'), // before the 14 days
    ],
  };
  const body = await GET('train', tables);
  assert.equal(body.stats.currentStreak, 2, 'yesterday and the day before, in New York; today\'s session is not finished');
  assert.equal(body.volumeByDay.length, 14);
  assert.equal(body.volumeByDay[13], 225 * 5, 'today, last');
  assert.equal(body.volumeByDay[12], Math.round(100 * LB * 5), 'the 11:30 pm set lands on yesterday, in pounds');
  assert.equal(body.volumeByDay.slice(0, 12).reduce((a, b) => a + b, 0), 0, 'nothing else in the 14 days');
});

test('without a zone on file the days are UTC', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), null);
  const tables = {
    client_profiles: [],
    client_workouts: [],
    workout_sessions: [session('s-1', `${today}T00:10:00Z`), session('s-2', `${days.shiftDay(today, -1)}T23:50:00Z`)],
    workout_set_logs: [set(`${today}T00:10:00Z`, 200, 3, 'lb')],
  };
  const body = await GET('train', tables);
  assert.equal(body.stats.currentStreak, 2);
  assert.equal(body.volumeByDay[13], 600);
});

test('the Train page\'s Streak and the profile\'s day streak are one number', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), NY);
  const sessions = [];
  for (const k of [1, 2, 3, 5]) sessions.push(session(`s-${k}`, await at(days.shiftDay(today, -k), '23:15', NY)));
  const tables = { client_profiles: [{ user_id: 'u-1', timezone: NY }], client_workouts: [], workout_sessions: sessions, workout_set_logs: [] };
  const train = await GET('train', tables);
  const dash = await GET('dashboard', tables);
  assert.equal(train.stats.currentStreak, 3, 'three evenings in New York, then a gap');
  assert.equal(dash.kpis.streak, train.stats.currentStreak);
  // Evenings two and three days back only: yesterday was missed in New York, so the streak is
  // over. In UTC those sessions fall on yesterday and the day before, which the dashboard's old
  // server-midnight rule counted as a live streak of 2.
  const missed = [];
  for (const k of [2, 3]) missed.push(session(`m-${k}`, await at(days.shiftDay(today, -k), '23:15', NY)));
  const t2 = { ...tables, workout_sessions: missed };
  assert.equal((await GET('train', t2)).stats.currentStreak, 0);
  assert.equal((await GET('dashboard', t2)).kpis.streak, 0, 'the dashboard counts the member\'s days too');
});

test('the train route keeps the newest sets under its cap', () => {
  const src = readFileSync(join(ROOT, 'src/app/api/client/train/route.ts'), 'utf8');
  assert.match(src, /\.from\('workout_set_logs'\)\n\s+\.select\('session_id, actual_load, actual_reps, rpe, completed, created_at, started_at, finished_at, payload, load_unit'\)\n\s+\.eq\('client_id', user\.id\)\n\s+\.order\('created_at', \{ ascending: false \}\)\n\s+\.limit\(5000\);/);
});

test('the Train page shows "nothing logged" until a day has volume, not 14 empty bars', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const view = src.slice(src.indexOf('const volDays = (TR.volumeByDay'), src.indexOf("label=\"Volume · nothing logged\""));
  assert.match(view, /\{volDays\.some\(\(v\) => v > 0\) \? \(/);
  assert.match(src, /label="Streak" value=\{`\$\{ts\.currentStreak \?\? 0\}d`\}/, 'the Streak reads stats.currentStreak');
});

// ── Codex P2s on #2451 ──
test('a set lands on the day it was lifted, not the day it reached the database', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), NY);
  const y = days.shiftDay(today, -1);
  // A session done last night and saved (or retried) this morning: each set keeps finished_at.
  const savedToday = await at(today, '00:05', NY);
  const tables = {
    client_profiles: [{ user_id: 'u-1', timezone: NY }],
    client_workouts: [],
    workout_sessions: [],
    workout_set_logs: [
      set(savedToday, 200, 5, 'lb', { started_at: await at(y, '20:50', NY), finished_at: await at(y, '21:00', NY) }),
      set(savedToday, 100, 5, 'lb', { started_at: null, finished_at: await at(days.shiftDay(today, -10), '18:00', NY) }),
    ],
  };
  const body = await GET('train', tables);
  assert.equal(body.volumeByDay[12], 1000, 'last night\'s set is on yesterday\'s bar');
  assert.equal(body.volumeByDay[13], 0, 'not on the day it was saved');
  assert.equal(body.volumeByDay[3], 500, 'ten days back');
  assert.equal(body.stats.volume7dLb, 1000, 'the 7-day volume reads the same time: the ten-day-old set is out');
});

test('a streak longer than any timeline read is counted whole, and both routes say the same', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), NY);
  // 600 days in a row, two finished sessions a day and an abandoned one: 1,800 rows, past the
  // train route's 200-row list and the dashboard's 500, and past one 500-row streak page.
  const sessions = [];
  for (let k = 0; k < 600; k += 1) {
    const day = days.shiftDay(today, -k);
    sessions.push(session(`a-${k}`, await at(day, '07:00', NY)), session(`b-${k}`, await at(day, '00:05', NY)), session(`c-${k}`, await at(day, '00:01', NY), 'abandoned'));
  }
  const tables = { client_profiles: [{ user_id: 'u-1', timezone: NY }], client_workouts: [], workout_sessions: sessions, workout_set_logs: [] };
  const train = await GET('train', tables);
  const dash = await GET('dashboard', tables);
  assert.equal(train.stats.currentStreak, 600);
  assert.equal(dash.kpis.streak, 600);
});

test('a broken streak stops reading after the page that shows the gap', async () => {
  const { days } = await load();
  const today = days.memberDay(Date.now(), NY);
  const sessions = [];
  for (let k = 0; k < 3; k += 1) sessions.push(session(`r-${k}`, await at(days.shiftDay(today, -k), '00:05', NY)));
  for (let k = 10; k < 1200; k += 1) sessions.push(session(`o-${k}`, await at(days.shiftDay(today, -k), '12:00', NY)));
  const tables = { client_profiles: [{ user_id: 'u-1', timezone: NY }], client_workouts: [], workout_sessions: sessions, workout_set_logs: [] };
  const train = await GET('train', tables);
  assert.equal(train.stats.currentStreak, 3);
  const pages = lastClient._calls.filter((c) => c.table === 'workout_sessions' && c.range);
  assert.equal(pages.length, 1, 'one page showed the gap; the 1,190 older sessions are not read');
});

test('a member who has since moved zone keeps each workout on the day it was done', async () => {
  const { days } = await load();
  const LONDON = 'Europe/London';
  const today = days.memberDay(Date.now(), LONDON);
  // Two New York evenings, two and three days back, stored with their New York day. Read again
  // in London they fall a day later (yesterday and the day before), which would make a live
  // streak of 2; on the days they were done, yesterday was missed and the streak is over.
  const nyEvening = async (k) => {
    const day = days.shiftDay(today, -k);
    return { ...session(`t-${k}`, await at(day, '23:30', NY)), summary: { snapshotDate: day } };
  };
  const sessions = [await nyEvening(2), await nyEvening(3)];
  const lifted = await at(days.shiftDay(today, -2), '23:20', NY);
  const tables = {
    client_profiles: [{ user_id: 'u-1', timezone: LONDON }],
    client_workouts: [],
    workout_sessions: sessions,
    workout_set_logs: [set(lifted, 100, 5, 'lb', { session_id: 't-2', finished_at: lifted })],
  };
  const train = await GET('train', tables);
  assert.equal(train.stats.currentStreak, 0, 'yesterday was missed on the days the member trained');
  assert.equal((await GET('dashboard', tables)).kpis.streak, 0);
  assert.equal(train.volumeByDay[11], 500, 'the set is on its session\'s stored day, two days back');
  assert.equal(train.volumeByDay[12], 0, 'not on the day London reads it as');
});
