// Coaches who share a client see each other's schedules (owner, 2026-10-29: "Have the ability for
// trainers and nutritionists to see both schedules if they have a shared client", "Apply to existing
// pairs as well", then "any shared client for any trainer or nutritionist should be shared").
//
// - The calendar a coach opens for one client (/api/calendar?clientId=) adds every other coach's
//   workouts and menus, whatever their discipline, from two definers (2026-10-29-shared-client-
//   schedules.sql, widened by 2026-10-29-shared-schedules-any-coach.sql), names the coach who
//   planned them (`by`), keeps to that client's bookings, and marks what is not this coach's to act
//   on: the other coach's bookings (`mine: false`), the member's own entries.
// - The app's client page (CARE TEAM) and the website's open that calendar: "See all schedules".
// - The reads answer only a coach who coaches the client now, never with their own rows, with only
//   what the calendar draws; the first migration also tells every existing pair once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];

// ── the route, compiled from the shipped file ────────────────────────────────────────────────────
let mods = null;
async function calendarRoute() {
  if (mods) return mods;
  const nextServer = require('next/server');
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const [time, requestUtils] = await Promise.all([lib('time.ts'), lib('request-utils.ts')]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  const activities = await loadRealModule(join(ROOT, 'src/lib/calendar-activities.ts'), { typescript: true, registry: new Map([['@/lib/time', time]]) });
  const workoutDays = await loadRealModule(join(ROOT, 'src/lib/workout-days.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/time', time]]) });
  const memberMenus = await loadRealModule(join(ROOT, 'src/lib/member-menus.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)], ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })]]) });
  let client = null, userId = null;
  const route = await loadRealModule(join(ROOT, 'src/app/api/calendar/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/time', time],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/access-guards.mjs', guards],
      ['@/lib/calendar-activities', activities],
      ['@/lib/workout-days', workoutDays],
      ['@/lib/member-menus', memberMenus],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: userId }) }],
      ['@supabase/supabase-js', {}],
    ]),
  });
  mods = { route, use: (c, id) => { client = c; userId = id; } };
  return mods;
}
async function getCalendar(db, userId, qs) {
  const m = await calendarRoute();
  m.use(db, userId);
  const res = await m.route.GET(new Request('https://shape.test/api/calendar?' + qs));
  return { status: res.status, body: await res.json() };
}

// The window: last week to two weeks out, read in UTC (no tz), so a dated item today is in it.
const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const TODAY = iso(Date.now());
const FROM = iso(Date.now() - 7 * DAY);
const TO = iso(Date.now() + 14 * DAY);
const DOW = (new Date(`${TODAY}T00:00:00Z`).getUTCDay() + 6) % 7;
const QS = `from=${FROM}&to=${TO}`;

const COACHES = {
  trainers: [{ id: 7, owner_id: 'coach-t', name: 'Tom Trainer' }],
  nutritionists: [{ id: 4, owner_id: 'coach-n', name: 'Nia Nutri' }],
};
const session = (id, providerRole, providerId, clientId, extra = {}) => ({
  id, client_id: clientId, provider_role: providerRole, provider_id: providerId, type: 'video',
  scheduled_at: `${TODAY}T15:00:00Z`, duration_min: 45, status: 'confirmed', topic: null, meeting_url: null, ...extra,
});
const SESSIONS = [
  session('s-train', 'trainer', 7, 'member-1'),
  session('s-nutri', 'nutritionist', 4, 'member-1', { scheduled_at: `${TODAY}T17:00:00Z` }),
  // Another client of the nutritionist: never on member-1's calendar.
  session('s-other', 'nutritionist', 4, 'member-2'),
];
const EVENTS = [
  { id: 'ev-member', user_id: 'member-1', created_by: 'member-1', created_by_role: 'client', kind: 'WORKOUT', title: 'Run with friends', sub: null, event_date: TODAY, event_time: '18:00', duration_min: 30, with_name: null, location: null, accent: null, status: 'planned' },
  { id: 'ev-coach-n', user_id: 'member-1', created_by: 'coach-n', created_by_role: 'nutritionist', kind: 'CHECKIN', title: 'Food check-in', sub: null, event_date: TODAY, event_time: '19:00', duration_min: 15, with_name: null, location: null, accent: null, status: 'planned' },
];
const TRAINER_WORKOUT = {
  id: 'w1', title: 'Upper Push', description: null, scheduled_date: TODAY, duration: '45 min', plan_time: '07:30',
  exercise_count: 2, trainer_name: 'Tom Trainer',
  runs: [{ duration_seconds: 2700, started_at: `${TODAY}T11:30:00Z`, ended_at: `${TODAY}T12:15:00Z`, created_at: `${TODAY}T12:15:00Z`, local_day: TODAY }],
};
const MENU_PAYLOAD = { days: [{ dow: DOW, title: 'Training day', tag: 'High carb', meals: [{ slot: 'Breakfast', title: 'Overnight oats', time: '07:00', kcal: 520 }] }] };
// A second nutritionist's menu, as get_shared_client_meal_plan hands it over.
const OTHER_NUTRITIONIST_MENU = {
  id: 'mp-nell', title: 'Nell menu', week_start: null, nutritionist_name: 'Nell Second',
  payload: { days: [{ dow: DOW, meals: [{ slot: 'Dinner', title: 'Salmon bowl', time: '19:00', kcal: 700 }] }] },
};

const byId = (body, id) => body.events.find((e) => e.id === id);

test('a nutritionist sees the trainer\'s workouts, done when the client finished one, named by who planned it', async () => {
  const db = fakeSupabase({
    tables: {
      ...COACHES, sessions: SESSIONS, calendar_events: EVENTS,
      // RLS shows a nutritionist none of the trainer's workouts; their own menu they read.
      client_workouts: [], workout_sessions: [],
      client_meal_plans: [{ id: 'mp-own', client_id: 'member-1', status: 'published', title: 'Menu', week_start: null, payload: MENU_PAYLOAD, created_at: '2026-10-01T00:00:00Z' }],
    },
    rpcs: { get_shared_client_workouts: () => [TRAINER_WORKOUT], get_shared_client_meal_plan: () => [OTHER_NUTRITIONIST_MENU] },
  });
  const { status, body } = await getCalendar(db, 'coach-n', `${QS}&clientId=member-1&role=nutritionist`);
  assert.equal(status, 200);
  const w = byId(body, 'plan:w1');
  assert.ok(w, 'the trainer\'s workout is on the calendar');
  assert.equal(w.by, 'Tom Trainer');
  assert.equal(w.date, TODAY);
  assert.equal(w.time, '07:30');
  assert.equal(w.durationMin, 45);
  assert.equal(w.sub, '2 moves');
  assert.equal(w.status, 'completed', 'its finished run marks it done');
  assert.equal(w.doneSeconds, 2700);
  assert.equal(w.editable, false);
  // Their own menu, with no `by`, and a second nutritionist's beside it, named.
  const meals = body.events.filter((e) => e.source === 'meal' && e.date === TODAY);
  const own = meals.find((m) => m.title === 'Overnight oats');
  assert.equal(own.by, undefined);
  const theirs = meals.find((m) => m.title === 'Salmon bowl');
  assert.ok(theirs, 'the other nutritionist\'s meal is on today too');
  assert.equal(theirs.by, 'Nell Second');
  assert.notEqual(own.id, theirs.id);
  const rpcs = db._calls.filter((c) => c.rpc && c.rpc.startsWith('get_shared_'));
  assert.deepEqual(rpcs.map((c) => [c.rpc, c.args]), [
    ['get_shared_client_workouts', { p_client_id: 'member-1' }],
    ['get_shared_client_meal_plan', { p_client_id: 'member-1' }],
  ]);
});

test('two trainers see each other\'s workouts, and every nutritionist\'s menu shows, each named', async () => {
  const db = fakeSupabase({
    tables: {
      ...COACHES, sessions: SESSIONS, calendar_events: EVENTS, workout_sessions: [],
      // Tom's own workout, through RLS.
      client_workouts: [{ id: 'w1', trainer_id: 7, client_id: 'member-1', title: 'Upper Push', description: null, payload: { exercises: [{}, {}] }, status: 'published', scheduled_date: TODAY }],
      client_meal_plans: [],
    },
    rpcs: {
      get_shared_client_workouts: () => [{ ...TRAINER_WORKOUT, id: 'w2', title: 'Lower Pull', trainer_name: 'Tia Second', runs: [] }],
      get_shared_client_meal_plan: () => [
        { id: 'mp-1', title: 'Menu', week_start: null, payload: MENU_PAYLOAD, nutritionist_name: 'Nia Nutri' },
        OTHER_NUTRITIONIST_MENU,
      ],
    },
  });
  const { status, body } = await getCalendar(db, 'coach-t', `${QS}&clientId=member-1&role=trainer`);
  assert.equal(status, 200);
  assert.equal(byId(body, 'plan:w1').by, undefined, 'Tom\'s own workout names nobody');
  const tia = byId(body, 'plan:w2');
  assert.ok(tia, 'the other trainer\'s workout is on the calendar');
  assert.equal(tia.by, 'Tia Second');
  assert.equal(tia.status, 'planned');
  const meals = body.events.filter((e) => e.source === 'meal' && e.date === TODAY);
  assert.deepEqual(meals.map((m) => [m.title, m.by]).sort(), [['Overnight oats', 'Nia Nutri'], ['Salmon bowl', 'Nell Second']]);
});

test('a trainer sees the nutritionist\'s menu by day, each meal\'s time and kcal, named by the nutritionist', async () => {
  const db = fakeSupabase({
    tables: {
      ...COACHES, sessions: SESSIONS, calendar_events: EVENTS, workout_sessions: [],
      client_workouts: [{ id: 'w1', trainer_id: 7, client_id: 'member-1', title: 'Upper Push', description: null, payload: { exercises: [{}, {}] }, status: 'published', scheduled_date: TODAY }],
      client_meal_plans: [],
    },
    rpcs: {
      // A coach with both listings could get their own workout back from the definer too: shown once.
      get_shared_client_workouts: () => [TRAINER_WORKOUT],
      get_shared_client_meal_plan: () => [{ id: 'mp-1', title: 'Menu', week_start: null, payload: MENU_PAYLOAD, nutritionist_name: 'Nia Nutri' }],
    },
  });
  const { status, body } = await getCalendar(db, 'coach-t', `${QS}&clientId=member-1&role=trainer`);
  assert.equal(status, 200);
  const meal = body.events.find((e) => e.source === 'meal' && e.date === TODAY);
  assert.ok(meal, 'the nutritionist\'s meal is on today');
  assert.equal(meal.title, 'Overnight oats');
  assert.equal(meal.time, '07:00');
  assert.equal(meal.sub, 'Breakfast · 520 kcal');
  assert.equal(meal.by, 'Nia Nutri');
  assert.equal(meal.kind, 'MEAL');
  assert.equal(body.events.filter((e) => e.id === 'plan:w1').length, 1, 'a workout read both ways is shown once');
  assert.equal(byId(body, 'plan:w1').by, undefined, 'the trainer\'s own workout names nobody');
});

test('a client\'s calendar holds that client\'s bookings; the other coach\'s and the member\'s own entries are not this coach\'s to act on', async () => {
  const db = fakeSupabase({
    tables: { ...COACHES, sessions: SESSIONS, calendar_events: EVENTS, client_workouts: [], client_meal_plans: [], workout_sessions: [] },
    rpcs: { get_shared_client_workouts: () => [], get_shared_client_meal_plan: () => [] },
  });
  const { body } = await getCalendar(db, 'coach-n', `${QS}&clientId=member-1&role=nutritionist`);
  const sessions = body.events.filter((e) => e.source === 'session');
  assert.deepEqual(sessions.map((s) => s.sessionId).sort(), ['s-nutri', 's-train'], 'another client\'s booking is not on this client\'s calendar');
  const theirs = sessions.find((s) => s.sessionId === 's-train');
  assert.equal(theirs.mine, false);
  assert.equal(theirs.reschedulable, false);
  const own = sessions.find((s) => s.sessionId === 's-nutri');
  assert.equal(own.reschedulable, true);
  assert.equal('mine' in own, false);
  assert.equal(byId(body, 'ev-member').editable, false, 'the member\'s own entry');
  assert.equal(byId(body, 'ev-coach-n').editable, true, 'what this coach put there');
});

test('the member\'s own calendar asks for nothing new, and a failed shared read shows the calendar as before', async () => {
  const mine = fakeSupabase({
    tables: { ...COACHES, sessions: SESSIONS.filter((s) => s.client_id === 'member-1'), calendar_events: EVENTS, client_workouts: [], client_meal_plans: [], workout_sessions: [] },
    rpcs: { get_shared_client_workouts: () => { throw new Error('a member never asks'); }, get_shared_client_meal_plan: () => { throw new Error('a member never asks'); } },
  });
  const own = await getCalendar(mine, 'member-1', QS);
  assert.equal(own.status, 200);
  assert.equal(mine._calls.filter((c) => c.rpc && c.rpc.startsWith('get_shared_')).length, 0);
  assert.equal(byId(own.body, 'ev-member').editable, true, 'the member edits their own entries');
  assert.ok(own.body.events.filter((e) => e.source === 'session').every((s) => s.reschedulable === true && !('mine' in s)));

  const broken = fakeSupabase({
    tables: { ...COACHES, sessions: SESSIONS, calendar_events: EVENTS, client_workouts: [], client_meal_plans: [], workout_sessions: [] },
    fail: ['rpc:get_shared_client_workouts', 'rpc:get_shared_client_meal_plan'],
  });
  const res = await getCalendar(broken, 'coach-t', `${QS}&clientId=member-1&role=trainer`);
  assert.equal(res.status, 200);
  assert.equal(res.body.events.filter((e) => e.source === 'plan' || e.source === 'meal').length, 0);
  assert.equal(res.body.events.filter((e) => e.source === 'session').length, 2);
});

// ── the member's own calendar: each nutritionist who coaches them now (War Room: "The member's own
// calendar still shows only the newest menu when they have two nutritionists") ─────────────────────
const NUTRITIONISTS = [
  { id: 4, owner_id: 'coach-n', name: 'Nia Nutri' },
  { id: 5, owner_id: 'coach-n2', name: 'Nell Second' },
  { id: 6, owner_id: 'coach-n3', name: 'Fay Former' },
];
const menuRow = (id, nutritionistId, title, createdAt, extra = {}) => ({
  id, client_id: 'member-1', nutritionist_id: nutritionistId, status: 'published', title, week_start: null, created_at: createdAt,
  payload: { days: [{ dow: DOW, meals: [{ slot: 'Lunch', title, time: '12:30', kcal: 600 }] }] }, ...extra,
});
const sub = (providerId, status, extra = {}) => ({ client_id: 'member-1', provider_role: 'nutritionist', provider_id: providerId, status, created_at: '2026-09-01T00:00:00Z', ...extra });
const MEMBER_MENUS = [
  menuRow('mp-nia', 4, 'Nia lunch', '2026-10-01T00:00:00Z'),
  // A menu Nia took down, newer than her current one.
  menuRow('mp-nia-pulled', 4, 'Nia pulled lunch', '2026-10-15T00:00:00Z', { status: 'archived' }),
  menuRow('mp-nell', 5, 'Nell lunch', '2026-10-20T00:00:00Z'),
  // An older menu of Nell's still published (two pushes at once): her newest is the one shown.
  menuRow('mp-nell-stale', 5, 'Nell stale lunch', '2026-10-10T00:00:00Z'),
  // A nutritionist who has left, whose menu is the newest of all.
  menuRow('mp-fay', 6, 'Fay lunch', '2026-10-25T00:00:00Z'),
  // Another member's menu from the same nutritionist.
  menuRow('mp-other', 4, 'Someone else lunch', '2026-10-30T00:00:00Z', { client_id: 'member-2' }),
];
const memberWorld = (subscriptions, client_meal_plans = MEMBER_MENUS) => ({
  ...COACHES, nutritionists: NUTRITIONISTS, sessions: [], calendar_events: [], client_workouts: [], workout_sessions: [],
  client_meal_plans, subscriptions,
});
const lunchesToday = (body) => body.events.filter((e) => e.source === 'meal' && e.date === TODAY).map((e) => [e.title, e.by]).sort();

test('the member\'s own calendar shows the menu of each nutritionist who coaches them now, each named', async () => {
  const db = fakeSupabase({
    tables: memberWorld([
      sub(4, 'active'),
      sub(5, 'past_due'),
      sub(6, 'canceled'),
      // Another member's subscription to the nutritionist who left.
      sub(6, 'active', { client_id: 'member-2' }),
      // The same member's trainer, whose trainer id is the left nutritionist's id: not a nutritionist.
      { client_id: 'member-1', provider_role: 'trainer', provider_id: 6, status: 'active', created_at: '2026-09-01T00:00:00Z' },
    ]),
    rpcs: { get_shared_client_meal_plan: () => { throw new Error('a member never asks'); } },
  });
  const { status, body } = await getCalendar(db, 'member-1', QS);
  assert.equal(status, 200);
  assert.deepEqual(lunchesToday(body), [['Nell lunch', 'Nell Second'], ['Nia lunch', 'Nia Nutri']],
    'both current nutritionists\' menus, named; not the one who left, an archived menu, or another member\'s');
  const ids = new Set(body.events.filter((e) => e.source === 'meal').map((e) => e.id));
  assert.equal(ids.size, body.events.filter((e) => e.source === 'meal').length, 'every meal keeps its own id');
  // The reads: the newest menu, the member's open nutritionists, one menu read for each not already read.
  const menuReads = db._calls.filter((c) => c.table === 'client_meal_plans');
  assert.equal(menuReads.length, 3);
  assert.ok(menuReads.every((c) => c.limit === 1));
  assert.equal(db._calls.filter((c) => c.table === 'subscriptions').length, 1);
});

test('one current nutritionist: their menu, unnamed, as before, even when a former one\'s menu is newer', async () => {
  const db = fakeSupabase({ tables: memberWorld([sub(4, 'trialing'), sub(6, 'canceled')]) });
  const { body } = await getCalendar(db, 'member-1', QS);
  assert.deepEqual(lunchesToday(body), [['Nia lunch', undefined]]);

  // Their menu is the newest: no second menu read.
  const newest = fakeSupabase({ tables: memberWorld([sub(5, 'active')]) });
  const res = await getCalendar(newest, 'member-1', QS);
  assert.deepEqual(lunchesToday(res.body), [['Nell lunch', undefined]]);
  assert.equal(newest._calls.filter((c) => c.table === 'client_meal_plans').length, 2);
  // …and with Fay's newest menu gone, Nell's is the newest overall and is read once.
  const once = fakeSupabase({ tables: memberWorld([sub(5, 'active')], MEMBER_MENUS.filter((m) => m.id !== 'mp-fay')) });
  const r2 = await getCalendar(once, 'member-1', QS);
  assert.deepEqual(lunchesToday(r2.body), [['Nell lunch', undefined]]);
  assert.equal(once._calls.filter((c) => c.table === 'client_meal_plans').length, 1);
});

test('no current nutritionist\'s menu, or a failed read: the newest menu, as before', async () => {
  // Their nutritionist has left: they keep the menu they were given.
  const left = await getCalendar(fakeSupabase({ tables: memberWorld([sub(6, 'canceled')]) }), 'member-1', QS);
  assert.deepEqual(lunchesToday(left.body), [['Fay lunch', undefined]]);
  // No subscriptions at all.
  const none = await getCalendar(fakeSupabase({ tables: memberWorld([]) }), 'member-1', QS);
  assert.deepEqual(lunchesToday(none.body), [['Fay lunch', undefined]]);
  // A current nutritionist with no menu yet.
  const noMenu = await getCalendar(fakeSupabase({ tables: memberWorld([sub(4, 'active')], MEMBER_MENUS.filter((m) => m.nutritionist_id !== 4)) }), 'member-1', QS);
  assert.deepEqual(lunchesToday(noMenu.body), [['Fay lunch', undefined]]);
  // The subscriptions read fails: the newest menu, never an empty calendar.
  const failed = await getCalendar(fakeSupabase({ tables: memberWorld([sub(4, 'active'), sub(5, 'active')]), fail: ['subscriptions'] }), 'member-1', QS);
  assert.equal(failed.status, 200);
  assert.deepEqual(lunchesToday(failed.body), [['Fay lunch', undefined]]);
  // The names read fails: both menus, unnamed.
  const unnamed = await getCalendar(fakeSupabase({ tables: memberWorld([sub(4, 'active'), sub(5, 'active')]), fail: ['nutritionists'] }), 'member-1', QS);
  assert.deepEqual(lunchesToday(unnamed.body), [['Nell lunch', undefined], ['Nia lunch', undefined]]);
});

test('one nutritionist\'s menu read fails: the others still show', async () => {
  // A fake whose menu read for one nutritionist answers an error, as a timeout would.
  let failed = 0;
  const failOne = (db, id) => ({
    ...db,
    from(table) {
      const q = db.from(table);
      if (table !== 'client_meal_plans') return q;
      let hit = false;
      const { eq, then } = q;
      q.eq = (col, v) => { if (col === 'nutritionist_id' && Number(v) === id) hit = true; eq(col, v); return q; };
      q.then = (res, rej) => {
        if (!hit) return then.call(q, res, rej);
        failed += 1;
        return Promise.resolve({ data: null, error: { message: 'timeout' } }).then(res, rej);
      };
      return q;
    },
  });
  // Three nutritionists coach them; Nia's menu read fails.
  const db = failOne(fakeSupabase({ tables: memberWorld([sub(4, 'active'), sub(5, 'active'), sub(6, 'active')]) }), 4);
  const { status, body } = await getCalendar(db, 'member-1', QS);
  assert.equal(status, 200);
  assert.deepEqual(lunchesToday(body), [['Fay lunch', 'Fay Former'], ['Nell lunch', 'Nell Second']]);
  // Nia's read was asked for and failed; the newest and Nell's were answered.
  assert.equal(failed, 1);
  assert.equal(db._calls.filter((c) => c.table === 'client_meal_plans').length, 2);
});

test('every open subscription is read, a page at a time: a nutritionist past the first page still shows (Codex on #2564)', async () => {
  // A thousand open rows for Nia (renewals that never closed), then Nell's, newest of all: a capped
  // read of the first rows never reached hers.
  const subscriptions = Array.from({ length: 1000 }, (_, i) => sub(4, 'past_due', { id: `sub-${String(i).padStart(4, '0')}`, created_at: '2026-08-01T00:00:00Z' }));
  subscriptions.push(sub(5, 'active', { id: 'sub-1000', created_at: '2026-10-01T00:00:00Z' }));
  const db = fakeSupabase({ tables: memberWorld(subscriptions, MEMBER_MENUS.filter((m) => m.id !== 'mp-fay')) });
  const { status, body } = await getCalendar(db, 'member-1', QS);
  assert.equal(status, 200);
  assert.deepEqual(lunchesToday(body), [['Nell lunch', 'Nell Second'], ['Nia lunch', 'Nia Nutri']]);
  const pages = db._calls.filter((c) => c.table === 'subscriptions');
  assert.equal(pages.length, 2, 'a full page, then the rest');
  assert.ok(pages.every((c) => c.limit === 1000));
});

test('a coach\'s view of a client reads no subscriptions for its menus', async () => {
  const db = fakeSupabase({
    tables: { ...memberWorld([sub(4, 'active'), sub(5, 'active')]) },
    rpcs: { get_shared_client_workouts: () => [], get_shared_client_meal_plan: () => [OTHER_NUTRITIONIST_MENU] },
  });
  await getCalendar(db, 'coach-n', `${QS}&clientId=member-1&role=nutritionist`);
  assert.equal(db._calls.filter((c) => c.table === 'subscriptions').length, 0);
});

// ── the migration ────────────────────────────────────────────────────────────────────────────────
const SQL = read('supabase-migrations/2026-10-29-shared-client-schedules.sql');
const CODE = SQL.replace(/--[^\n]*/g, '');
const fn = (name) => {
  const at = CODE.indexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, name);
  return CODE.slice(at, CODE.indexOf('$$;', at));
};

test('first migration: each read answered only a coach of the other discipline who coaches the client now', () => {
  for (const [name, caller, author, authorCol] of [
    ['get_shared_client_workouts', 'nutritionist', 'trainer', 'w.trainer_id'],
    ['get_shared_client_meal_plan', 'trainer', 'nutritionist', 'm.nutritionist_id'],
  ]) {
    const body = fn(name);
    assert.match(body, /security definer\s+set search_path = public, pg_temp/, `${name}: a definer with a pinned search_path`);
    assert.match(body, /auth\.uid\(\) is not null/, `${name}: signed out answers nothing`);
    assert.match(body, new RegExp(`public\\.is_discipline_coach_on_client\\(p_client_id, '${caller}'\\)`), `${name}: the caller coaches the client as a ${caller}`);
    assert.match(body, new RegExp(`s\\.provider_role = '${author}'\\s+and s\\.provider_id = ${authorCol.replace('.', '\\.')}\\s+and s\\.status in \\('active', 'trialing', 'past_due'\\)`), `${name}: only a ${author} who coaches the client now`);
    assert.match(body, /status = 'published'/, `${name}: published rows only`);
    assert.match(CODE, new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public, anon;`));
    assert.match(CODE, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated, service_role;`));
  }
  // The menu hands over each meal's slot, title, time and kcal: never its ingredients, steps or notes.
  const menu = fn('get_shared_client_meal_plan');
  assert.match(menu, /jsonb_build_object\('slot', x\.meal->'slot', 'title', x\.meal->'title', 'time', x\.meal->'time', 'kcal', x\.meal->'kcal'\)/);
  assert.doesNotMatch(menu, /ingredients|steps|coachNote|coachLine/);
  assert.doesNotMatch(fn('get_shared_client_workouts'), /w\.payload\s*,|w\.payload\s+as/, 'a workout\'s payload is never handed over whole');
  // The guard proves it before the commit.
  assert.match(CODE, /has_function_privilege\('anon', f, 'execute'\)/);
  assert.ok(CODE.indexOf('do $guard$') < CODE.lastIndexOf('commit;'));
});

test('any-coach migration: each read answers any coach on the client, with every other coach\'s plan and never their own', () => {
  const sql = read('supabase-migrations/2026-10-29-shared-schedules-any-coach.sql').replace(/--[^\n]*/g, '');
  const body = (name) => {
    const at = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(at >= 0, name);
    return sql.slice(at, sql.indexOf('$$;', at));
  };
  for (const [name, table, author, authorCol] of [
    ['get_shared_client_workouts', 't', 'trainer', 'w.trainer_id'],
    ['get_shared_client_meal_plan', 'n', 'nutritionist', 'm.nutritionist_id'],
  ]) {
    const b = body(name);
    assert.match(b, /security definer\s+set search_path = public, pg_temp/, `${name}: a definer with a pinned search_path`);
    assert.match(b, /auth\.uid\(\) is not null/, `${name}: signed out answers nothing`);
    assert.match(b, /public\.is_coach_on_client\(p_client_id\)/, `${name}: any coach on the client`);
    assert.doesNotMatch(b, /is_discipline_coach_on_client/, `${name}: no longer one discipline only`);
    assert.match(b, new RegExp(`and ${table}\\.owner_id is distinct from auth\\.uid\\(\\)`), `${name}: never the caller's own rows`);
    assert.match(b, new RegExp(`s\\.provider_role = '${author}'\\s+and s\\.provider_id = ${authorCol.replace('.', '\\.')}\\s+and s\\.status in \\('active', 'trialing', 'past_due'\\)`), `${name}: only a ${author} who coaches the client now`);
    assert.match(b, /status = 'published'/);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(uuid\\) from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(uuid\\) to authenticated, service_role;`));
  }
  // One menu per nutritionist (their newest), and the same projection: never ingredients, steps or notes.
  const menu = body('get_shared_client_meal_plan');
  assert.match(menu, /select distinct on \(m\.nutritionist_id\)/);
  assert.match(menu, /order by m\.nutritionist_id, m\.created_at desc/);
  assert.match(menu, /jsonb_build_object\('slot', x\.meal->'slot', 'title', x\.meal->'title', 'time', x\.meal->'time', 'kcal', x\.meal->'kcal'\)/);
  assert.doesNotMatch(menu, /ingredients|steps|coachNote|coachLine/);
  assert.doesNotMatch(body('get_shared_client_workouts'), /w\.payload\s*,|w\.payload\s+as/);
  assert.match(sql, /has_function_privilege\('anon', f, 'execute'\)/);
  assert.ok(sql.indexOf('do $guard$') < sql.lastIndexOf('commit;'));
});

test('migration: every pair that already shares a client is told once, in the reader\'s language', () => {
  const insert = CODE.slice(CODE.indexOf('with live as ('), CODE.indexOf('do $guard$'));
  assert.match(insert, /insert into public\.notifications \(user_id, type, title, body, route, data\)/);
  assert.match(insert, /'shared_client'/);
  assert.match(insert, /'dedupe', 'shared:existing:' \|\| p\.client_id::text \|\| ':' \|\| p\.about_id::text/);
  assert.match(insert, /on conflict do nothing;/);
  // A pair the code already told (since #2496) is skipped.
  assert.match(insert, /where not exists \(\s*select 1 from public\.notifications x\s*where x\.user_id = p\.to_id\s*and x\.type = 'shared_client'/);
  // Two different people, one row per coach on the client (trainer listing first).
  assert.match(insert, /c\.owner_id <> r\.owner_id/);
  assert.match(insert, /distinct on \(client_id, owner_id\)/);
  assert.match(insert, /s\.status in \('active', 'trialing', 'past_due'\)/);
  // The copy names catalog keys that exist, as tellSharedCoaches stores them.
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/notice.json'));
  for (const k of ['client.shared.title', 'word.aClient']) assert.ok(insert.includes(`'${k}'`) && en[k], k);
  for (const role of ['Trainer', 'Nutritionist']) for (const anon of ['', 'Anon']) assert.ok(en[`client.shared.body${role}${anon}`], `${role}${anon}`);
  assert.match(insert, /'client\.shared\.body' \|\| case p\.about_role when 'nutritionist' then 'Nutritionist' else 'Trainer' end \|\| 'Anon'/);
  // The English is the code's, word for word.
  assert.match(insert, /' now works with you and '/);
  assert.match(insert, /'\. You can message each other in the care team on their client page\.'/);
  assert.match(read('src/lib/coach-thread.ts'), /now works with you and \$\{lead\}\. You can message each other in the care team on their client page\./);
});

// ── the doors ────────────────────────────────────────────────────────────────────────────────────
test('app: CARE TEAM opens the client\'s calendar whenever another coach is on it, read only', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /\{careTeam\.length > 0 && \(\s*<button type="button" onClick=\{\(\) => setShowClientCalendar\(true\)\}/);
  assert.match(pros, /tr\('coach:case\.seeBothSchedules', \{ defaultValue: 'See all schedules →' \}\)/);
  assert.match(pros, /if \(showClientCalendar && clientUid && BSCalendarScreen\) return <BSCalendarScreen role=\{role\} clientId=\{clientUid\} clientName=\{client\.n \|\| null\} onBack=\{\(\) => setShowClientCalendar\(false\)\} \/>;/);
  const cal = read('mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx');
  assert.match(cal, /function BSCalendarScreen\(\{ role = 'client', onProfile, initialMode = 'week', onBack, clientId = null, clientName = null, initialDate = null \}\)/);
  assert.match(cal, /\{useServer && view === 'month' && !forClient && \(/, 'no Add on a client\'s calendar');
  assert.match(cal, /onAdd=\{useServer && !forClient \?/);
  assert.match(cal, /&& \(role === 'trainer' \|\| role === 'nutritionist'\) && event\.mine !== false;/, 'no booking actions on the other coach\'s');
  // Another coach's booking (mine: false), and a session the viewer is booked into as the client
  // (asClient, Codex P2 on #2607), are not the viewer's to manage as coach.
  assert.match(cal, /mine: ev\.mine !== false && !ev\.asClient,/);
  assert.match(cal, /sub: \[ev\.sub, typeof ev\.by === 'string' \? ev\.by : ''\]\.filter\(Boolean\)\.join\(' · '\),/);
});

test('website: CARE TEAM opens the same calendar in the overlay, with the client named and nothing to add', () => {
  const page = read('public/newdesign/coachClientDetail.jsx');
  assert.match(page, /counterparts\.length > 0 && \(\s*<button onClick=\{bothSchedules\.open\}/);
  assert.match(page, /\n\s*See all schedules →\n/);
  assert.match(page, /<CalendarOverlay \{\.\.\.bothSchedules\.props\} role=\{myRole\} clientId=\{clientId\} clientName=\{data\.client\.name\} \/>/);
  const shell = read('public/newdesign/pageShell.jsx');
  assert.match(shell, /const forClient = clientId \? `&clientId=\$\{encodeURIComponent\(clientId\)\}` : "";/);
  assert.match(shell, /\{live && !clientId && \(/);
  assert.match(shell, /role=\{clientId \? "viewer" : role\}/);
  // The website's two client pages load the overlay with the page.
  for (const html of ['TrainerClient.html', 'NutritionistClient.html', 'TrainerApp.html', 'NutritionistApp.html']) {
    const src = read(`public/newdesign/${html}`);
    assert.ok(src.includes('pageShell.jsx') && src.includes('coachClientDetail.jsx'), html);
  }
});

test('the new app strings are in all 13 catalogs, placeholders kept', () => {
  for (const loc of LOCALES) {
    const cal = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/calendar.json`));
    const coach = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    assert.ok(cal['client.kicker'] && cal['client.kicker'].includes('{name}'), `${loc} kicker`);
    for (const k of ['client.fallbackName', 'client.note']) assert.ok(typeof cal[k] === 'string' && cal[k].trim(), `${loc} ${k}`);
    assert.ok(typeof coach['case.seeBothSchedules'] === 'string' && coach['case.seeBothSchedules'].trim(), `${loc} door`);
  }
  // Every coach on the client, not two: the English says so.
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/calendar.json'));
  assert.equal(en['client.note'], 'Every coach’s plans: training, meals and bookings. Read only.');
  assert.equal(JSON.parse(read('mobile-app/src/i18n/catalogs/en/coach.json'))['case.seeBothSchedules'], 'See all schedules →');
});
