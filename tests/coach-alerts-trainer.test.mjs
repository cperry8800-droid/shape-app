// The trainer alerts (the 2026-11-11 coach-alerts plan, PR 1): workouts missed and the sudden drop,
// gone quiet, not started, no session booked, and the context reads (training load, steps). The
// engine's rules on records, the overview's new legs over a fake database, the push's snapshot, a
// break keeping them quiet, joint attention from the nutritionist's side, and Settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { bsAssignedWorkoutsLeg, bsTrainingLoadLeg, bsActivityLeg, bsLastFromClient, bsBookedSessionsLeg } from '../src/lib/coach-client-legs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const DS = require('../public/newdesign/dashSignals.js');
const DAY = 86400000;
const NOW = new Date('2026-11-11T12:00:00');
const ago = (d) => { const x = new Date(NOW.getTime()); x.setDate(x.getDate() - d); return DS.iso ? DS.iso(x) : x.toISOString().slice(0, 10); };
const day = (d) => { const x = new Date(NOW.getTime()); x.setDate(x.getDate() - d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const wk = (pairs) => ({ days: pairs.map(([d, done]) => ({ on: day(d), done: !!done })).reverse() });
const base = (over = {}) => ({ profile: { id: 'c1', name: 'Ada', joinedAt: day(90) }, pros: { trainer: true, nutritionist: false }, ...over });
const feed = (role, rec, t) => DS.getTriageFeed(role, [rec], NOW, t)[0];
const keys = (row) => row.flags.map((f) => f.key).sort();
const flag = (row, key) => row.flags.find((f) => f.key === key) || null;

// ── 1. Workouts missed ─────────────────────────────────────────────────────────
test('workouts missed: under half of the assigned workouts due in 4 weeks, or the last 2 in a row', () => {
  const low = feed('trainer', base({ assignedWorkouts: wk([[2, 1], [5, 0], [9, 1], [12, 0], [16, 1], [19, 0], [23, 0], [26, 0]]) }));
  assert.equal(flag(low, 'workouts_missed').reason, '3 of 8 assigned workouts done in the last 4 weeks');
  assert.equal(low.severity, 'amber');
  assert.equal(low.lead.key, 'workouts_missed');
  assert.equal(low.lead.action.label, 'Check in about the program');
  assert.match(low.lead.action.draft, /^Hey Ada — how's the program feeling\?/);
  const row = feed('trainer', base({ assignedWorkouts: wk([[2, 0], [5, 0], [9, 1], [12, 1], [16, 1], [19, 1]]) }));
  assert.equal(flag(row, 'workouts_missed').reason, 'Missed the last 2 assigned workouts');
  // Half done, the last one done: nothing.
  assert.deepEqual(keys(feed('trainer', base({ assignedWorkouts: wk([[2, 1], [5, 0], [9, 1], [12, 0]]) }))), []);
  // Fewer than 4 due: no evidence.
  assert.deepEqual(keys(feed('trainer', base({ assignedWorkouts: wk([[2, 0], [5, 0], [9, 0]]) }))), []);
});

test('workouts missed counts past days only, inside the window, from the join and after a break', () => {
  // Today's and tomorrow's don't count, nor one 29 days back.
  const edge = base({ assignedWorkouts: wk([[-1, 0], [0, 0], [2, 1], [5, 1], [9, 1], [12, 1], [29, 0], [30, 0]]) });
  assert.deepEqual(keys(feed('trainer', edge)), []);
  assert.deepEqual(DS.workoutCompletion(edge, NOW), { done: 4, due: 4 });
  // Joined 10 days ago: the two from before the join are not theirs.
  const joined = base({ profile: { id: 'c1', name: 'Ada', joinedAt: day(10) }, assignedWorkouts: wk([[2, 1], [5, 1], [8, 0], [9, 1], [12, 0], [16, 0]]) });
  assert.deepEqual(DS.workoutCompletion(joined, NOW), { done: 3, due: 4 });
  // Back from a break 4 days ago: only the days since count.
  const back = base({ pause: { until: day(5), by: 'client' }, assignedWorkouts: wk([[1, 1], [3, 1], [6, 0], [9, 0], [12, 0], [16, 0]]) });
  assert.deepEqual(DS.workoutCompletion(back, NOW), { done: 2, due: 2 });
  // Unknown is never "nothing assigned".
  assert.equal(DS.workoutCompletion(base(), NOW), null);
});

test('workouts missed is the trainer\'s: a nutritionist sees it in joint attention, read at the trainer\'s line', () => {
  const rec = base({
    pros: { trainer: true, nutritionist: true },
    coCoaches: [{ role: 'trainer', userId: 'u-t', name: 'Alex' }],
    assignedWorkouts: wk([[2, 0], [5, 0], [9, 1], [12, 0], [16, 1], [19, 0]]),
    foodLogs: { lastLoggedOn: day(4), daysLogged7d: 2 },
  });
  assert.equal(flag(feed('nutritionist', rec), 'workouts_missed'), null, 'not in the nutritionist\'s own feed');
  const joint = DS.findJointAttention([rec], NOW, null, 'nutritionist');
  assert.equal(joint.length, 1);
  assert.deepEqual(joint[0].trainingFlags.map((f) => f.key), ['workouts_missed']);
  // At the trainer's own line: a trainer who lowered completion to 10% has no slip, so no joint note.
  const tuned = { ...rec, coCoaches: [{ role: 'trainer', userId: 'u-t', name: 'Alex', flagLines: { WORKOUT_DONE_PCT: 10, WORKOUT_MISSED_ROW: 6 } }] };
  assert.equal(DS.findJointAttention([tuned], NOW, null, 'nutritionist').length, 0);
});

// ── 1b. The sudden drop ────────────────────────────────────────────────────────
test('a sudden drop: 20 points or more under the 2 weeks before, each half with 3 due', () => {
  const drop = feed('trainer', base({ assignedWorkouts: wk([[1, 1], [4, 0], [7, 1], [16, 1], [19, 1], [22, 1]]) }));
  assert.equal(flag(drop, 'completion_drop').reason, 'Did 67% of assigned workouts in the last 2 weeks, down from 100%');
  assert.equal(drop.severity, 'amber');
  // Under 20 points: nothing.
  assert.deepEqual(keys(feed('trainer', base({ assignedWorkouts: wk([[1, 1], [4, 1], [7, 1], [9, 1], [10, 0], [12, 1], [16, 1], [19, 1], [22, 1]]) }))), []);
  // Workouts missed speaks instead of the drop.
  assert.deepEqual(keys(feed('trainer', base({ assignedWorkouts: wk([[1, 0], [4, 0], [7, 0], [16, 1], [19, 1], [22, 1]]) }))), ['workouts_missed']);
  // Two due in a half: no evidence.
  assert.deepEqual(keys(feed('trainer', base({ assignedWorkouts: wk([[1, 1], [4, 0], [16, 1], [19, 1], [22, 1]]) }))), []);
});

// ── 2. Gone quiet ──────────────────────────────────────────────────────────────
const quiet = (over = {}) => base({
  foodLogs: { lastLoggedOn: day(8), daysLogged7d: 0 },
  activity: { lastWorkoutOn: day(9), steps: [] },
  checkIn: { lastWeekOf: day(14), latest: { weekOf: day(14), submittedAt: day(10) + 'T09:00:00' } },
  lastFromClient: day(9) + 'T10:00:00',
  lastContact: { trainer: day(8) + 'T10:00:00', nutritionist: null },
  ...over,
});
test('gone quiet: nothing in 7 days takes the place of the food-log and contact gaps', () => {
  const t = feed('trainer', quiet());
  assert.deepEqual(keys(t).filter((k) => k !== 'checkin_overdue'), ['gone_quiet']);
  assert.equal(flag(t, 'gone_quiet').reason, 'Nothing from them in 8 days: no workout, food log, check-in or message');
  const n = feed('nutritionist', quiet({ pros: { trainer: false, nutritionist: true } }));
  assert.ok(flag(n, 'gone_quiet') && !flag(n, 'food_gap') && !flag(n, 'contact_gap'), 'the nutritionist reads one line too');
  // Any one source within the week keeps them present; each gap then still shows alone.
  const msg = feed('nutritionist', quiet({ pros: { trainer: false, nutritionist: true }, lastFromClient: day(2) + 'T10:00:00' }));
  assert.equal(flag(msg, 'gone_quiet'), null);
  assert.ok(flag(msg, 'food_gap'), 'the food-log gap still shows alone');
  assert.equal(flag(feed('trainer', quiet({ streaks: { current: 1, best: 4, lastActiveOn: day(1) } })), 'gone_quiet'), null, 'a Shape Score day');
  assert.equal(flag(feed('trainer', quiet({ activity: { lastWorkoutOn: day(3), steps: [] } })), 'gone_quiet'), null, 'a workout');
});

test('gone quiet needs every read: an unread one is never "nothing"', () => {
  for (const drop of ['activity', 'foodLogs', 'checkIn', 'lastFromClient']) {
    const rec = quiet();
    delete rec[drop];
    assert.equal(flag(feed('trainer', rec), 'gone_quiet'), null, drop + ' unread');
  }
  // A known "no message" is fine.
  assert.ok(flag(feed('trainer', quiet({ lastFromClient: null })), 'gone_quiet'));
  // A check-in with no time counts to the end of its week.
  const wkOnly = quiet({ checkIn: { lastWeekOf: day(10) } });
  assert.equal(flag(feed('trainer', wkOnly), 'gone_quiet'), null, 'its week ended 4 days ago');
});

test('gone quiet counts from the join, and from the day they came back from a break', () => {
  const joined = quiet({ profile: { id: 'c1', name: 'Ada', joinedAt: day(40) }, foodLogs: { lastLoggedOn: null, daysLogged7d: 0 }, activity: { lastWorkoutOn: null, steps: [] }, checkIn: { lastWeekOf: null }, lastFromClient: null, lastContact: null });
  assert.equal(flag(feed('trainer', joined), 'gone_quiet').reason, 'Nothing from them in the 40 days since they joined: no workout, food log, check-in or message');
  // Everything from before a break that ended 9 days ago: counted from the day they came back.
  const old = { foodLogs: { lastLoggedOn: day(15), daysLogged7d: 0 }, activity: { lastWorkoutOn: day(15), steps: [] }, checkIn: { lastWeekOf: day(21), latest: { submittedAt: day(15) + 'T09:00:00' } }, lastFromClient: day(15) + 'T10:00:00', lastContact: { trainer: day(15) + 'T10:00:00', nutritionist: null } };
  const back = quiet({ ...old, pause: { until: day(9), by: 'client' } });
  assert.equal(flag(feed('trainer', back), 'gone_quiet').reason, 'Nothing from them in the 8 days since their break: no workout, food log, check-in or message');
  const fresh = feed('trainer', quiet({ pause: { until: day(2), by: 'client' } }));
  assert.equal(flag(fresh, 'gone_quiet'), null, 'quiet for the first days back');
});

// ── 3. Not started ─────────────────────────────────────────────────────────────
const newbie = (joined, over = {}) => base({
  profile: { id: 'c1', name: 'Ada', joinedAt: day(joined) + 'T09:00:00', isNew: true },
  foodLogs: { lastLoggedOn: day(20), daysLogged7d: 0 },
  activity: { lastWorkoutOn: null, steps: [] },
  checkIn: { lastWeekOf: null },
  ...over,
});
test('not started: from day 3, no first workout, meal or check-in since joining', () => {
  const r = feed('trainer', newbie(3));
  assert.equal(flag(r, 'not_started').reason, 'Joined 3 days ago, nothing logged yet');
  assert.equal(r.severity, 'amber');
  assert.equal(r.lead.action.label, 'Help them start');
  assert.equal(flag(feed('trainer', newbie(2)), 'not_started'), null, 'day 2');
  assert.equal(flag(feed('trainer', newbie(5, { foodLogs: { lastLoggedOn: day(1), daysLogged7d: 1 } })), 'not_started'), null, 'a meal');
  assert.equal(flag(feed('trainer', newbie(5, { activity: { lastWorkoutOn: day(1), steps: [] } })), 'not_started'), null, 'a workout');
  assert.equal(flag(feed('trainer', newbie(5, { checkIn: { lastWeekOf: day(1), latest: { submittedAt: day(1) + 'T08:00:00' } } })), 'not_started'), null, 'a check-in');
  assert.equal(flag(feed('trainer', newbie(5, { activity: undefined })), 'not_started'), null, 'unread');
  assert.equal(flag(feed('trainer', newbie(31)), 'not_started'), null, 'past the first days');
  // Both coaches; the food-log reads give way to it.
  const n = feed('nutritionist', newbie(9, { pros: { trainer: false, nutritionist: true } }));
  assert.ok(flag(n, 'not_started') && !flag(n, 'food_gap') && !flag(n, 'gone_quiet'));
});

// ── 4. No session booked ──────────────────────────────────────────────────────
test('no session booked: kept one before, none in 14 days, none coming; amber, never red', () => {
  const at = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
  const r = feed('trainer', base({ bookedSessions: { trainer: { done: 2, planned: 2, lastKeptAt: at(16), nextAt: null }, nutritionist: null } }));
  assert.equal(flag(r, 'no_booking').reason, 'Last session with you 16 days ago, nothing booked');
  assert.equal(r.severity, 'amber');
  assert.equal(flag(feed('trainer', base({ bookedSessions: { trainer: { done: 2, planned: 2, lastKeptAt: at(16), nextAt: at(-3) } } })), 'no_booking'), null, 'one booked');
  assert.equal(flag(feed('trainer', base({ bookedSessions: { trainer: { done: 0, planned: 0, lastKeptAt: null, nextAt: null } } })), 'no_booking'), null, 'never booked: a program-only client');
  assert.equal(flag(feed('trainer', base({ bookedSessions: { trainer: { done: 2, planned: 2 } } })), 'no_booking'), null, 'an older overview');
  // Each coach's own.
  const n = feed('nutritionist', base({ pros: { trainer: true, nutritionist: true }, bookedSessions: { trainer: { done: 2, planned: 2, lastKeptAt: at(20), nextAt: null }, nutritionist: { done: 1, planned: 1, lastKeptAt: at(3), nextAt: null } } }));
  assert.equal(flag(n, 'no_booking'), null);
  // Soft: with a slip in another area it does not tip the row red.
  const two = feed('trainer', base({ bookedSessions: { trainer: { done: 2, planned: 2, lastKeptAt: at(20), nextAt: null } }, assignedWorkouts: wk([[2, 0], [5, 0], [9, 1], [12, 1]]), checkIn: { lastWeekOf: day(9) } }));
  assert.ok(flag(two, 'no_booking') && flag(two, 'workouts_missed'));
  assert.notEqual(two.severity, 'red', 'training plus a booking reminder is one area, and the reminder is soft');
});

test('the booked-sessions leg carries the last session kept and the next one booked', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const s = (status, d, id = 7) => ({ provider_role: 'trainer', provider_id: id, status, scheduled_at: new Date(now - d * DAY).toISOString() });
  const leg = bsBookedSessionsLeg([s('completed', 100), s('completed', 50), s('requested', -10), s('confirmed', -5), s('completed', 2, 8), s('confirmed', 1)], { trainer: 7 }, now).trainer;
  assert.equal(leg.lastKeptAt, new Date(now - 50 * DAY).toISOString(), 'past the 42 days: still "booked before"');
  assert.equal(leg.nextAt, new Date(now + 5 * DAY).toISOString(), 'the nearest one ahead');
  assert.deepEqual([leg.done, leg.planned], [0, 1], 'the missed count stays the 42 days');
});

// ── 5. Context ────────────────────────────────────────────────────────────────
test('context: a training-load spike and falling steps show for a trainer, never count or lead an amber row', () => {
  const load = { days: [[30, 300], [27, 300], [23, 300], [20, 300], [16, 300], [13, 300], [9, 300], [3, 540], [1, 540]].map(([d, l]) => ({ on: day(d), load: l })) };
  const steps = { lastWorkoutOn: day(1), steps: Array.from({ length: 35 }, (_, d) => ({ on: day(d), steps: d <= 6 ? 5200 : 9100 })) };
  const r = feed('trainer', base({ trainingLoad: load, activity: steps }));
  assert.equal(flag(r, 'load_spike').reason, 'This week\'s training load is 1.5× their 4-week average'.replace('1.5', String(Math.round((1080 / (2100 / 4)) * 10) / 10)));
  assert.equal(flag(r, 'steps_falling').reason, 'Steps averaging 5,200 a day this week, 43% under their 4-week average');
  assert.equal(r.severity, 'green', 'context never colours a row');
  const amber = feed('trainer', base({ trainingLoad: load, activity: steps, assignedWorkouts: wk([[2, 0], [5, 0], [9, 1], [12, 1]]) }));
  assert.equal(amber.severity, 'amber');
  assert.equal(amber.lead.key, 'workouts_missed', 'context never leads an amber row');
  // A nutritionist's evaluation reads neither.
  const n = feed('nutritionist', base({ pros: { trainer: true, nutritionist: true }, trainingLoad: load, activity: steps }));
  assert.equal(flag(n, 'load_spike'), null);
  assert.equal(flag(n, 'steps_falling'), null);
  // Thin evidence: nothing.
  assert.equal(flag(feed('trainer', base({ trainingLoad: { days: load.days.slice(-3) } })), 'load_spike'), null);
  assert.equal(flag(feed('trainer', base({ activity: { lastWorkoutOn: null, steps: steps.steps.slice(0, 10) } })), 'steps_falling'), null);
});

// ── A break ───────────────────────────────────────────────────────────────────
test('a client on a break stays quiet in every new absence alert', () => {
  const at = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
  const all = quiet({
    pause: { until: day(-3), by: 'client' },
    assignedWorkouts: wk([[2, 0], [5, 0], [9, 0], [12, 0]]),
    bookedSessions: { trainer: { done: 1, planned: 1, lastKeptAt: at(30), nextAt: null } },
  });
  const r = feed('trainer', all);
  for (const k of ['workouts_missed', 'completion_drop', 'gone_quiet', 'not_started', 'no_booking']) assert.equal(flag(r, k), null, k);
  assert.equal(r.severity, 'green');
});

// ── The legs ──────────────────────────────────────────────────────────────────
test('the legs: assigned workouts, the training load, the activity and the client\'s last message', () => {
  const today = '2026-11-11';
  const w = bsAssignedWorkoutsLeg([{ id: 'a', scheduled_date: '2026-11-10' }, { id: 'b', scheduled_date: '2026-11-08' }, { id: 'c', scheduled_date: '2026-10-01' }, { id: 'd', scheduled_date: '2026-11-12' }, null], new Set(['b']), today);
  assert.deepEqual(w, { days: [{ on: '2026-11-08', done: true }, { on: '2026-11-10', done: false }] });
  const shared = bsAssignedWorkoutsLeg([{ scheduled_date: '2026-11-09', runs: [{ created_at: 'x' }] }, { scheduled_date: '2026-11-10', runs: [] }], null, today);
  assert.deepEqual(shared.days.map((d) => d.done), [true, false], 'the shared read carries its runs');
  const now = Date.parse('2026-11-11T12:00:00Z');
  const load = bsTrainingLoadLeg([
    { session_rpe: 7, duration_seconds: 3600, local_day: '2026-11-10' },
    { session_rpe: 5, duration_seconds: 1800, local_day: '2026-11-10' },
    { session_rpe: null, duration_seconds: 3600, local_day: '2026-11-09' },
    { session_rpe: 6, duration_seconds: 2400, ended_at: '2026-11-08T20:00:00Z' },
    { session_rpe: 6, duration_seconds: 2400, local_day: '2026-09-01' },
  ], now);
  assert.deepEqual(load, { days: [{ on: '2026-11-08', load: 240 }, { on: '2026-11-10', load: 570 }] });
  const act = bsActivityLeg([{ snapshot_date: '2026-11-09', workout_minutes: 40, steps: 8000 }, { snapshot_date: '2026-11-10', workout_minutes: 0, steps: 6000.4 }, { snapshot_date: '2026-11-07', steps: 0 }]);
  assert.deepEqual(act, { lastWorkoutOn: '2026-11-09', steps: [{ on: '2026-11-09', steps: 8000 }, { on: '2026-11-10', steps: 6000 }] });
  assert.equal(bsActivityLeg(null), null);
  const m = (sender, at) => ({ sender_id: sender, created_at: at, conversation_id: 't' });
  assert.equal(bsLastFromClient([m('coach', '2026-11-10T10:00:00Z'), m('cli', '2026-11-08T10:00:00Z'), m('cli', '2026-11-09T10:00:00Z')], 'cli', 40), '2026-11-09T10:00:00.000Z');
  assert.equal(bsLastFromClient([m('coach', '2026-11-10T10:00:00Z')], 'cli', 40), null, 'none of theirs in a short read');
  assert.equal(bsLastFromClient([m('coach', '2026-11-10T10:00:00Z')], 'cli', 1), undefined, 'a full read without theirs is unknown');
});

// ── The overview ──────────────────────────────────────────────────────────────
const importLib = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const A = '00000000-0000-4000-8000-0000000000a1';
const COACH = '00000000-0000-4000-8000-0000000000c1';
async function overview(tables, { fail = [], me = { trainerId: 7, nutritionistId: null, userId: COACH }, rpcs = {}, subs } = {}) {
  const lib = await loadRealModule(join(ROOT, 'src/lib/shared-overview.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => { throw new Error('type-only import; never called'); } }],
      ['@/lib/recovery-readiness', await loadRealModule(join(ROOT, 'src/lib/recovery-readiness.ts'), { typescript: true })],
      ['@/lib/vitals-leg.mjs', await importLib('src/lib/vitals-leg.mjs')],
      ['@/lib/coach-client-legs.mjs', await importLib('src/lib/coach-client-legs.mjs')],
    ]),
  });
  const db = fakeSupabase({
    tables: {
      trainers: [{ id: 7, name: 'Coach Q', owner_id: COACH }], nutritionists: [{ id: 3, name: 'Coach N', owner_id: COACH }],
      subscriptions: subs || [{ client_id: A, provider_role: 'trainer', provider_id: 7, status: 'active', current_period_end: null }],
      ...tables,
    },
    rpcs: { get_display_names: () => [{ user_id: A, full_name: 'Ada', avatar_url: null }], ...rpcs },
    fail,
  });
  return lib.buildSharedOverview(db, { clientId: A, me });
}
const utcDay = (d) => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);

test('the overview reads a trainer\'s own assigned workouts and runs, and the effort of their runs', async () => {
  const ov = await overview({
    client_workouts: [
      { id: 'w1', client_id: A, trainer_id: 7, status: 'published', scheduled_date: utcDay(2) },
      { id: 'w2', client_id: A, trainer_id: 7, status: 'published', scheduled_date: utcDay(4) },
      { id: 'w3', client_id: A, trainer_id: 9, status: 'published', scheduled_date: utcDay(3) },  // another trainer's
      { id: 'w4', client_id: A, trainer_id: null, status: 'published', scheduled_date: utcDay(3) }, // their own
      { id: 'w5', client_id: A, trainer_id: 7, status: 'draft', scheduled_date: utcDay(3) },
    ],
    workout_sessions: [
      { client_id: A, client_workout_id: 'w2', provider_role: 'trainer', provider_id: 7, status: 'completed', session_rpe: 7, duration_seconds: 3000, created_at: new Date(Date.now() - 4 * DAY).toISOString(), summary: { snapshotDate: utcDay(4) } },
      { client_id: A, client_workout_id: 'w1', provider_role: 'trainer', provider_id: 7, status: 'abandoned', session_rpe: 9, duration_seconds: 600, created_at: new Date(Date.now() - 2 * DAY).toISOString(), summary: {} },
    ],
  });
  assert.deepEqual(ov.assignedWorkouts.days, [{ on: utcDay(4), done: true }, { on: utcDay(2), done: false }]);
  assert.deepEqual(ov.trainingLoad.days, [{ on: utcDay(4), load: 350 }]);
  // A failed read is unknown: the legs are left out.
  const failed = await overview({ client_workouts: [] }, { fail: ['workout_sessions'] });
  assert.ok(!('assignedWorkouts' in failed) && !('trainingLoad' in failed));
});

test('the overview gives a nutritionist the trainers\' workouts through the shared read', async () => {
  const subs = [{ client_id: A, provider_role: 'nutritionist', provider_id: 3, status: 'active', current_period_end: null }];
  const me = { trainerId: null, nutritionistId: 3, userId: COACH };
  const ov = await overview({}, { me, subs, rpcs: { get_shared_client_workouts: () => [{ scheduled_date: utcDay(3), runs: [{}] }, { scheduled_date: utcDay(1), runs: [] }] } });
  assert.deepEqual(ov.assignedWorkouts.days.map((d) => d.done), [true, false]);
  assert.ok(!('trainingLoad' in ov), 'the trainer\'s effort stays the trainer\'s');
  const failed = await overview({}, { me, subs, fail: ['rpc:get_shared_client_workouts'] });
  assert.ok(!('assignedWorkouts' in failed));
});

test('the overview reads 42 days of snapshots for the activity, and the client\'s last message', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ user_id: A, snapshot_date: utcDay(i), steps: 7000, workout_minutes: i === 5 ? 30 : null }));
  const ov = await overview({ daily_health_snapshot: rows });
  assert.equal(ov.activity.steps.length, 42);
  assert.equal(ov.activity.lastWorkoutOn, utcDay(5));
  const failed = await overview({ daily_health_snapshot: rows }, { fail: ['daily_health_snapshot'] });
  assert.ok(!('activity' in failed));
  const conv = [{ id: 'cv1', client_id: A, provider_role: 'trainer', provider_id: 7, kind: 'direct', last_message_at: null }];
  const msgs = [{ conversation_id: 'cv1', sender_id: A, created_at: new Date(Date.now() - 3 * DAY).toISOString() }, { conversation_id: 'cv1', sender_id: COACH, created_at: new Date(Date.now() - DAY).toISOString() }];
  const talk = await overview({ conversations: conv, messages: msgs });
  assert.equal(talk.lastFromClient, msgs[0].created_at);
  const unread = await overview({ conversations: conv, messages: msgs }, { fail: ['messages'] });
  assert.ok(!('lastFromClient' in unread));
});

// ── The record and the push ───────────────────────────────────────────────────
test('the record carries the new legs from the overview, and the push snapshot keeps them', () => {
  const ov = { assignedWorkouts: { days: [{ on: '2026-11-09', done: true }] }, trainingLoad: { days: [{ on: '2026-11-09', load: 300 }] }, activity: { lastWorkoutOn: '2026-11-09', steps: [{ on: '2026-11-09', steps: 9000 }] }, lastFromClient: '2026-11-08T10:00:00Z' };
  const rec = DS.recordFromOverview({ id: 'c1', name: 'Ada' }, ov);
  assert.deepEqual(rec.assignedWorkouts, ov.assignedWorkouts);
  assert.deepEqual(rec.trainingLoad, ov.trainingLoad);
  assert.deepEqual(rec.activity, ov.activity);
  assert.equal(rec.lastFromClient, ov.lastFromClient);
  const snap = DS.engineSnapshot(rec);
  for (const k of ['assignedWorkouts', 'trainingLoad', 'activity', 'lastFromClient']) assert.deepEqual(snap[k], rec[k], k);
  const none = DS.recordFromOverview({ id: 'c1', name: 'Ada' }, {});
  assert.equal(none.assignedWorkouts, null);
  assert.equal(none.activity, null);
  assert.ok(!('lastFromClient' in none), 'unread stays unread');
  assert.equal(DS.recordFromOverview({ id: 'c1' }, { lastFromClient: null }).lastFromClient, null);
});

// ── Settings ──────────────────────────────────────────────────────────────────
test('Settings: the trainer\'s new rows, the shared ones on both pages, the context on the trainer\'s', () => {
  const t = DS.tunablesFor('trainer').map((r) => r.key);
  const n = DS.tunablesFor('nutritionist').map((r) => r.key);
  for (const k of ['WORKOUT_DONE_PCT', 'WORKOUT_MISSED_ROW', 'WORKOUT_MIN_DUE', 'COMPLETION_DROP_PCT', 'LOAD_SPIKE_X', 'STEPS_DROP_PCT']) {
    assert.ok(t.includes(k) && !n.includes(k), k);
  }
  for (const k of ['QUIET_DAYS', 'NOT_STARTED_DAYS', 'NO_BOOKING_DAYS']) assert.ok(t.includes(k) && n.includes(k), k);
  const house = Object.fromEntries(DS.tunablesFor('trainer').map((r) => [r.key, r.house]));
  assert.deepEqual([house.WORKOUT_DONE_PCT, house.WORKOUT_MISSED_ROW, house.WORKOUT_MIN_DUE, house.QUIET_DAYS, house.NOT_STARTED_DAYS, house.NO_BOOKING_DAYS, house.LOAD_SPIKE_X, house.STEPS_DROP_PCT], [50, 2, 4, 7, 3, 14, 1.5, 30]);
  // Shared by both coaches, so named without digits for the co-coach's settings (flagLines).
  for (const k of [...t, ...n]) assert.doesNotMatch(k, /\d/, k);
  // A coach's own tuning moves them.
  const tuned = DS.resolveThresholds({ QUIET_DAYS: 10 }, 'trainer').thresholds;
  assert.equal(flag(feed('trainer', quiet(), tuned), 'gone_quiet'), null, 'quiet 8 days under a 10-day line');
});

test('the demo: both roles still show red, amber and joint attention, with the new alerts', () => {
  for (const role of ['trainer', 'nutritionist']) {
    const rows = DS.getTriageFeed(role, DS.buildMockClients(NOW), NOW);
    const sevs = new Set(rows.map((r) => r.severity));
    assert.ok(sevs.has('red') && sevs.has('amber'), role);
    assert.ok(DS.findJointAttention(DS.buildMockClients(NOW), NOW, null, role).length >= 1, role + ' joint attention');
    assert.ok(rows.some((r) => flag(r, 'gone_quiet')), role + ' gone quiet');
  }
  const t = DS.getTriageFeed('trainer', DS.buildMockClients(NOW), NOW);
  for (const k of ['workouts_missed', 'completion_drop', 'no_booking', 'load_spike', 'steps_falling']) assert.ok(t.some((r) => flag(r, k)), k);
  const j = DS.findJointAttention(DS.buildMockClients(NOW), NOW, null, 'nutritionist')[0];
  assert.ok(j.trainingFlags.some((f) => f.key === 'workouts_missed'), 'the nutritionist sees the trainer\'s program slipping');
});
