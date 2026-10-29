// A trainer and a nutritionist who share a client see both schedules (owner, 2026-10-29: "Have the
// ability for trainers and nutritionists to see both schedules if they have a shared client"), and
// coaches who already shared a client are told ("Apply to existing pairs as well").
//
// - The calendar a coach opens for one client (/api/calendar?clientId=) adds the other discipline's
//   workouts or menu from two definers (2026-10-29-shared-client-schedules.sql), names the coach who
//   planned them (`by`), keeps to that client's bookings, and marks what is not this coach's to act
//   on: the other coach's bookings (`mine: false`), the member's own entries.
// - The app's client page (CARE TEAM) and the website's open that calendar: "See both schedules".
// - The migration's reads answer only a coach of the other discipline who coaches the client now,
//   with only what the calendar draws, and it tells every existing pair once.
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

const byId = (body, id) => body.events.find((e) => e.id === id);

test('a nutritionist sees the trainer\'s workouts, done when the client finished one, named by who planned it', async () => {
  const db = fakeSupabase({
    tables: {
      ...COACHES, sessions: SESSIONS, calendar_events: EVENTS,
      // RLS shows a nutritionist none of the trainer's workouts; their own menu they read.
      client_workouts: [], workout_sessions: [],
      client_meal_plans: [{ id: 'mp-own', client_id: 'member-1', status: 'published', title: 'Menu', week_start: null, payload: MENU_PAYLOAD, created_at: '2026-10-01T00:00:00Z' }],
    },
    rpcs: { get_shared_client_workouts: () => [TRAINER_WORKOUT], get_shared_client_meal_plan: () => { throw new Error('not asked: the nutritionist has their own menu'); } },
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
  // Their own menu, with no `by`.
  const meal = body.events.find((e) => e.source === 'meal' && e.date === TODAY);
  assert.equal(meal.title, 'Overnight oats');
  assert.equal(meal.by, undefined);
  const rpcs = db._calls.filter((c) => c.rpc && c.rpc.startsWith('get_shared_'));
  assert.deepEqual(rpcs.map((c) => [c.rpc, c.args]), [['get_shared_client_workouts', { p_client_id: 'member-1' }]]);
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

// ── the migration ────────────────────────────────────────────────────────────────────────────────
const SQL = read('supabase-migrations/2026-10-29-shared-client-schedules.sql');
const CODE = SQL.replace(/--[^\n]*/g, '');
const fn = (name) => {
  const at = CODE.indexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, name);
  return CODE.slice(at, CODE.indexOf('$$;', at));
};

test('migration: each read answers only a coach of the other discipline who coaches the client now', () => {
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
test('app: CARE TEAM opens the client\'s calendar when a coach of the other discipline is on it, read only', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /careTeam\.some\(\(c\) => c\.role && c\.role !== role\) && \(\s*<button type="button" onClick=\{\(\) => setShowClientCalendar\(true\)\}/);
  assert.match(pros, /if \(showClientCalendar && clientUid && BSCalendarScreen\) return <BSCalendarScreen role=\{role\} clientId=\{clientUid\} clientName=\{client\.n \|\| null\} onBack=\{\(\) => setShowClientCalendar\(false\)\} \/>;/);
  const cal = read('mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx');
  assert.match(cal, /function BSCalendarScreen\(\{ role = 'client', onProfile, initialMode = 'week', onBack, clientId = null, clientName = null, initialDate = null \}\)/);
  assert.match(cal, /\{useServer && view === 'month' && !forClient && \(/, 'no Add on a client\'s calendar');
  assert.match(cal, /onAdd=\{useServer && !forClient \?/);
  assert.match(cal, /&& \(role === 'trainer' \|\| role === 'nutritionist'\) && event\.mine !== false;/, 'no booking actions on the other coach\'s');
  assert.match(cal, /mine: ev\.mine !== false,/);
  assert.match(cal, /sub: \[ev\.sub, typeof ev\.by === 'string' \? ev\.by : ''\]\.filter\(Boolean\)\.join\(' · '\),/);
});

test('website: CARE TEAM opens the same calendar in the overlay, with the client named and nothing to add', () => {
  const page = read('public/newdesign/coachClientDetail.jsx');
  assert.match(page, /counterparts\.some\(\(c\) => c\.role && c\.role !== myRole\) && \(\s*<button onClick=\{bothSchedules\.open\}/);
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
});
