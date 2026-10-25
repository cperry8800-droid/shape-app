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
  const { events, workouts } = place([
    act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z'),
    // A second run at the same hour is not the same workout twice.
    act('a1', 'apple_health', 'walking', 'walking', '2026-10-21T11:05:00Z', { distance_km: 2 }),
  ], { done });
  assert.deepEqual(workouts.get('plan:w1'), { distanceKm: 5.79, durationMin: null, by: 'Apple Health · Strava', matched: false });
  assert.deepEqual(events.map((e) => e.id), [], 'the Apple Health walk twins the Strava run (two sources, 5 minutes apart)');
  const apart = place([act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z'), act('s2', 'strava', 'run', 'Later', '2026-10-21T11:05:00Z')], { done });
  assert.deepEqual(apart.events.map((e) => e.id), ['act:s2'], 'one logged workout swallowed two activities');
  assert.equal(place([act('s1', 'strava', 'run', 'Run', '2026-10-21T12:00:00Z')], { done }).events.length, 1, 'an activity an hour away was folded');
});

// ── matching a synced activity to the planned workout by day and type ────────

test('a provider\'s type and a workout\'s title each name one kind, or none', () => {
  const cases = {
    run: ['run', 'trailrun', 'VirtualRun', 'RUNNING', 'treadmill_running', 'Morning Run', '3.25mi Easy Run', 'Easy run + strides', 'jog'],
    ride: ['ride', 'virtualride', 'ebikeride', 'cycling', 'ROAD_BIKING', 'INDOOR_CYCLING', 'Spin class', 'Long Ride'],
    swim: ['swim', 'Open water swim', 'LAP_SWIMMING'],
    walk: ['walk', 'walking', 'Hike', 'hiking'],
    row: ['rowing', 'Row', 'indoor_rowing'],
    yoga: ['yoga', 'Pilates', 'Mobility flow'],
    strength: ['weighttraining', 'traditionalstrengthtraining', 'STRENGTH_TRAINING', 'Upper Body Strength', 'Lower Body Strength Session', 'Strength Supersets', 'crossfit'],
  };
  for (const [kind, texts] of Object.entries(cases)) for (const text of texts) assert.equal(LIB.workoutKind(text), kind, text);
  // None, or more than one: never guessed at.
  for (const text of ['Hill Repeats', 'Over and Unders 1km', 'Strong Foundation', 'Core crunches', 'Brunch', 'Bent-over rows', 'Strength for runners', 'Run then lift weights', 'workout', '', null]) {
    assert.equal(LIB.workoutKind(text), null, String(text));
  }
});

const planned = (id, days, kind) => ({ id, days, kind });

test('a synced run finishes the planned run on its day, with its distance and time, and is not drawn again', () => {
  const { events, workouts } = place([
    act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z', { calories: 410 }),
    act('w1', 'strava', 'weighttraining', 'Lunch lift', '2026-10-21T16:00:00Z', { distance_km: null, duration_min: 50 }),
    act('r1', 'garmin', 'cycling', 'cycling', '2026-10-21T19:00:00Z', { distance_km: 20 }),
  ], { planned: [planned('plan:run', ['2026-10-21'], 'run'), planned('plan:str', ['2026-10-21'], 'strength'), planned('plan:tue', ['2026-10-20'], 'run')] });
  assert.deepEqual(workouts.get('plan:run'), { distanceKm: 5.79, durationMin: 35, by: 'Strava', matched: true });
  assert.deepEqual(workouts.get('plan:str'), { distanceKm: null, durationMin: 50, by: 'Strava', matched: true });
  assert.equal(workouts.has('plan:tue'), false, 'a run finished another day\'s planned run');
  assert.deepEqual(events.map((e) => e.id), ['act:r1'], 'a ride with no planned ride keeps its card');
  // The only planned run is the day before: the run keeps its own card.
  const other = place([act('s1', 'strava', 'run', 'Morning Run', '2026-10-21T11:00:00Z')], { planned: [planned('plan:tue', ['2026-10-20'], 'run')] });
  assert.equal(other.workouts.size, 0, 'a run finished another day\'s planned run');
  assert.deepEqual(other.events.map((e) => e.id), ['act:s1']);
});

test('only a planned workout of a named kind is matched, each takes one activity, and a logged one comes first', () => {
  // Two runs, one planned run: the first takes it, the second keeps its card.
  const two = place([act('s1', 'strava', 'run', 'AM', '2026-10-21T07:00:00Z'), act('s2', 'strava', 'run', 'PM', '2026-10-21T18:00:00Z')],
    { planned: [planned('plan:run', ['2026-10-21'], 'run')] });
  assert.equal(two.workouts.get('plan:run').matched, true);
  assert.deepEqual(two.events.map((e) => e.id), ['act:s2']);
  // A planned workout whose title names no kind is never guessed onto.
  const unknown = place([act('s1', 'strava', 'run', 'Run', '2026-10-21T07:00:00Z')], { planned: [planned('plan:hill', ['2026-10-21'], null)] });
  assert.equal(unknown.workouts.size, 0);
  assert.equal(unknown.events.length, 1);
  // An activity whose type names nothing is matched by its own name, else not at all.
  const named = place([act('s1', 'strava', 'workout', 'Easy run', '2026-10-21T07:00:00Z')], { planned: [planned('plan:run', ['2026-10-21'], 'run')] });
  assert.equal(named.workouts.get('plan:run').matched, true);
  // A run that is the synced copy of a workout logged in Shape folds into that one, not a planned run.
  const logged = place([act('s1', 'strava', 'run', 'Run', '2026-10-21T07:05:00Z')],
    { done: [{ id: 'plan:logged', at: Date.parse('2026-10-21T07:00:00Z') }], planned: [planned('plan:run', ['2026-10-21'], 'run')] });
  assert.equal(logged.workouts.get('plan:logged').matched, false);
  assert.equal(logged.workouts.has('plan:run'), false);
});

test('an undated planned workout takes a matching activity from any day of its week', () => {
  const week = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  const { workouts, events } = place([act('s1', 'strava', 'run', 'Run', '2026-10-23T07:00:00Z')], { planned: [planned('plan:undated', week, 'run')] });
  assert.equal(workouts.get('plan:undated').matched, true);
  assert.equal(events.length, 0);
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

test('the route ticks the planned workout a synced activity matches by day and type, and no other', async () => {
  const cw = (id, title, scheduled_date) => ({ id, client_id: 'member-1', status: 'published', title, description: null, payload: { duration: '45 min' }, scheduled_date });
  const body = await GET({
    client_workouts: [cw('w-run', '3.25mi Easy Run', '2026-10-21'), cw('w-str', 'Upper Body Strength', '2026-10-21'), cw('w-hill', 'Hill Repeats', '2026-10-22')],
    activities: [row('s1', 'member-1', '2026-10-21T11:00:00Z'), row('s2', 'member-1', '2026-10-22T11:00:00Z')],
  }, { qs: `${QS}&activities=1` });
  const plan = Object.fromEntries(ofSource(body, 'plan').map((e) => [e.id, e]));
  assert.deepEqual([plan['plan:w-run'].status, plan['plan:w-run'].doneSeconds, plan['plan:w-run'].distanceKm, plan['plan:w-run'].doneBy], ['completed', 2100, 5.79, 'Strava']);
  assert.equal(plan['plan:w-str'].status, 'planned', 'a run finished the strength session');
  assert.equal(plan['plan:w-str'].doneBy, undefined);
  assert.equal(plan['plan:w-hill'].status, 'planned', '"Hill Repeats" was guessed to be a run');
  assert.deepEqual(ofSource(body, 'activity').map((e) => e.id), ['act:s2'], 'the matched run was drawn again, or the unmatched one was not');
});

test('the route lets an undated planned run take a run from any day of this week', async (t) => {
  // Wednesday the 21st: the undated run is slotted onto Monday the 19th, and run on Thursday.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-21T12:00:00Z') });
  const body = await GET({
    client_workouts: [{ id: 'w-und', client_id: 'member-1', status: 'published', title: 'Easy Run', description: null, payload: {}, scheduled_date: null }],
    activities: [row('s1', 'member-1', '2026-10-23T07:00:00Z')],
  }, { qs: `${QS}&activities=1` });
  const und = ofSource(body, 'plan').find((e) => e.id === 'plan:w-und');
  assert.deepEqual([und.date, und.status, und.distanceKm], ['2026-10-19', 'completed', 5.79]);
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
