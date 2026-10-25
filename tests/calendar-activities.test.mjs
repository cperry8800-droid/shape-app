// Synced and hand-logged activities on the member calendar (owner, 2026-10-25: "yes" to Strava,
// Garmin and Apple Health runs, with distance, on the calendar). Drives the SHIPPED placement
// module (src/lib/calendar-activities.ts) and the /api/calendar handler against a Supabase
// stand-in that applies its filters. The Weeks list and the event sheet are in calendar-weeks.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { calendarRoute } from './helpers/calendar-route.mjs';
import { BS_BURN_TWIN_MS, BS_BURN_SOURCES } from '../mobile-app/src/services/weekBurn.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true, registry: new Map([['next/server', require_('next/server')]]) });
const LIB = await loadRealModule(join(ROOT, 'src/lib/calendar-activities.ts'), { typescript: true, registry: new Map([['@/lib/time', time]]) });

const act = (id, source, type, title, at, extra = {}) => ({
  id, source, activity_type: type, title, started_at: at, duration_min: 35, distance_km: 5.79, calories: null, ...extra,
});
const place = (rows, opts = {}) => LIB.calendarActivities({ rows, zone: 'UTC', from: '2026-10-19', to: '2026-10-25', ...opts });

// ── one rule with Train's Burned this week ───────────────────────────────────

test('the calendar shows a synced workout once by Train\'s own rule, naming providers as Train does', () => {
  assert.equal(LIB.ACTIVITY_TWIN_MS, BS_BURN_TWIN_MS, 'the calendar and Burned this week disagree on what one workout is');
  for (const [key, name] of Object.entries(LIB.ACTIVITY_SOURCE_NAMES)) assert.equal(BS_BURN_SOURCES[key], name, key);
  for (const key of Object.keys(BS_BURN_SOURCES)) if (key !== 'manual') assert.ok(key in LIB.ACTIVITY_SOURCE_NAMES, `${key} has no name on the calendar`);
});

// ── placing ──────────────────────────────────────────────────────────────────

test('one run on two providers is one card at the larger reading, with the run\'s own name', () => {
  const { events } = place([
    act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z', { calories: 410 }),
    act('g1', 'garmin', 'RUNNING', 'RUNNING', '2026-10-21T11:03:00Z', { duration_min: 36, distance_km: '5.81' }),
    // Strava again ten minutes later: two activities from one source are always two.
    act('s2', 'strava', 'run', 'Cool-down', '2026-10-21T11:10:00Z', { distance_km: 1.2, duration_min: 9 }),
    // Apple Health forty minutes after the first: outside the window, its own workout.
    act('a1', 'apple_health', 'running', 'running', '2026-10-21T11:40:00Z', { distance_km: null }),
  ]);
  assert.deepEqual(events.map((e) => [e.id, e.title, e.sub, e.distanceKm, e.durationMin, e.calories]), [
    ['act:s1', 'Morning Run', 'Garmin · Strava', 5.81, 36, 410],
    ['act:s2', 'Cool-down', 'Strava', 1.2, 9, null],
    ['act:a1', 'Running', 'Apple Health', null, 35, null],
  ]);
  const first = events[0];
  assert.deepEqual([first.source, first.kind, first.status, first.date, first.time, first.sources, first.activityType, first.editable],
    ['activity', 'WORKOUT', 'completed', '2026-10-21', '11:00', ['garmin', 'strava'], 'run', false]);
});

test('a title that only repeats the type reads as the type, made readable', () => {
  assert.equal(LIB.activityTypeLabel('STRENGTH_TRAINING'), 'Strength training');
  assert.equal(LIB.activityTypeLabel('trail-run'), 'Trail run');
  assert.equal(LIB.activityTypeLabel(null), 'Workout');
  // Garmin writes the type as the title; a later named twin gives the card its name.
  const { events } = place([
    act('g1', 'garmin', 'RUNNING', 'RUNNING', '2026-10-21T11:00:00Z'),
    act('s1', 'strava', 'run', 'Hill Repeats', '2026-10-21T11:02:00Z'),
  ]);
  assert.deepEqual(events.map((e) => e.title), ['Hill Repeats']);
});

test('an activity lands on the date and clock of the zone the route answers in, inside its window', () => {
  // 23:30 UTC on the 21st is 08:30 on the 22nd in Tokyo.
  const row = act('s1', 'strava', 'run', 'Run', '2026-10-21T23:30:00Z');
  assert.deepEqual(place([row], { zone: 'Asia/Tokyo' }).events.map((e) => [e.date, e.time]), [['2026-10-22', '08:30']]);
  assert.deepEqual(place([row]).events.map((e) => [e.date, e.time]), [['2026-10-21', '23:30']]);
  assert.equal(place([row], { from: '2026-10-22' }).events.length, 0, 'a day outside the window was drawn');
  assert.equal(place([act('x', 'strava', 'run', 'Run', null)]).events.length, 0, 'an untimed activity was placed');
});

test('a workout logged in Shape takes its synced copy\'s distance, and no second card is drawn', () => {
  const done = [{ id: 'plan:w1', at: Date.parse('2026-10-21T10:50:00Z') }];
  const { events, workoutDistance } = place([
    act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z'),
    // A second run at the same hour is not the same workout twice.
    act('a1', 'apple_health', 'walking', 'walking', '2026-10-21T11:05:00Z', { distance_km: 2 }),
  ], { done });
  assert.equal(workoutDistance.get('plan:w1'), 5.79);
  assert.deepEqual(events.map((e) => e.id), [], 'the Apple Health walk twins the Strava run (two sources, 5 minutes apart)');
  const apart = place([act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z'), act('s2', 'strava', 'run', 'Later', '2026-10-21T11:05:00Z')], { done });
  assert.deepEqual(apart.events.map((e) => e.id), ['act:s2'], 'one logged workout swallowed two activities');
  assert.equal(place([act('s1', 'strava', 'run', 'Run', '2026-10-21T12:00:00Z')], { done }).events.length, 1, 'an activity an hour away was folded');
});

test('a workout logged by hand names no provider', () => {
  const { events } = place([act('m1', 'manual', 'yoga', 'Sunday flow', '2026-10-25T09:00:00Z', { distance_km: null })]);
  assert.deepEqual(events.map((e) => [e.title, e.sub, e.sources]), [['Sunday flow', '', ['manual']]]);
});

// ── the route ────────────────────────────────────────────────────────────────

const GET = await calendarRoute();
const QS = 'from=2026-10-19&to=2026-10-25&tz=UTC';
const ofSource = (body, source) => body.events.filter((e) => e.source === source);
const row = (id, user_id, at, extra = {}) => ({ ...act(id, 'strava', 'run', 'Morning Run', at, extra), user_id });

test('the member calendar asks for activities; every other reader of the route gets none', async () => {
  const tables = { activities: [row('s1', 'member-1', '2026-10-21T11:00:00Z'), row('s9', 'someone-else', '2026-10-21T12:00:00Z')] };
  const asked = await GET(tables, { qs: `${QS}&activities=1` });
  assert.deepEqual(ofSource(asked, 'activity').map((e) => [e.id, e.date, e.distanceKm]), [['act:s1', '2026-10-21', 5.79]], 'another member\'s run, or none');
  assert.equal(ofSource(await GET(tables, { qs: QS }), 'activity').length, 0, 'the coach Schedule and the website overlay would draw runs');
  // The app's wrapper sends it for the member calendar only, never a coach's own calendar or week.
  const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const list = backend.slice(backend.indexOf('async function listCalendar('), backend.indexOf('async function createCalendarEvent('));
  assert.match(list, /if \(role === 'trainer' \|\| role === 'nutritionist'\) qs\.set\('role', role\);\n(\s*\/\/[^\n]*\n)*\s*else qs\.set\('activities', '1'\);/);
});

test('a finished workout takes its synced copy\'s distance; the copy is not drawn again', async () => {
  const body = await GET({
    client_workouts: [{ id: 'w1', client_id: 'member-1', status: 'published', title: 'Easy Run', description: null, payload: { duration: '35 min' }, scheduled_date: '2026-10-21' }],
    workout_sessions: [{ id: 'ws1', client_id: 'member-1', client_workout_id: 'w1', status: 'completed', duration_seconds: 2124, started_at: '2026-10-21T10:58:00Z', created_at: '2026-10-21T11:34:00Z' }],
    activities: [row('s1', 'member-1', '2026-10-21T11:00:00Z')],
  }, { qs: `${QS}&activities=1` });
  const plan = ofSource(body, 'plan');
  assert.deepEqual(plan.map((e) => [e.id, e.status, e.doneSeconds, e.distanceKm]), [['plan:w1', 'completed', 2124, 5.79]]);
  assert.equal(ofSource(body, 'activity').length, 0);
});

test('a failed read of the activities shows none, and the rest of the calendar still reads', async () => {
  const body = await GET({
    client_workouts: [{ id: 'w1', client_id: 'member-1', status: 'published', title: 'Easy Run', description: null, payload: {}, scheduled_date: '2026-10-21' }],
    activities: [row('s1', 'member-1', '2026-10-21T11:00:00Z')],
  }, { qs: `${QS}&activities=1`, fail: ['activities'] });
  assert.equal(ofSource(body, 'activity').length, 0);
  assert.deepEqual(ofSource(body, 'plan').map((e) => e.id), ['plan:w1']);
});
