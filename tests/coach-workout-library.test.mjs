import test from 'node:test';
import assert from 'node:assert/strict';
import { coachWorkoutLibrary, duplicateWorkoutPlan, coachWorkoutVideos, coachWorkoutDraftKey, persistCoachWorkout, knownWorkoutAverage, groupWorkoutUpdates, workoutAssignmentsHaveExercises } from '../mobile-app/src/services/coachWorkoutLibrary.mjs';
import { normalizeWorkoutDetail, builderToAssignmentRows } from '../public/newdesign/workoutDocument.mjs';
import { bsAssignExercise, bsAssignWeeks, bsMaterializeOutline } from '../mobile-app/src/services/planOutline.mjs';

const clip = 'https://example.test/squat.mp4';
const website = {
  id: 'plan-a', kind: 'program', name: 'Strength block', price: '$120',
  detail: { revision: 4, media: [{ url: clip, type: 'video', name: 'Squat form' }], builder: { version: 3, weeks: [
    { days: [{ name: 'Lower', weekday: 0, plannedMinutes: 45, plannedRpe: 7, loadCapture: 'per_session', playlist: { name: 'Lift' }, blocks: [{ kind: 'main', rows: [{ id: 'squat', name: 'Back squat', sets: 4, reps: '6', load: 80, loadType: 'kg', rest: '120s', tempo: '31X1', cue: 'Brace', group: 'A', video: clip }] }] }] },
    { days: [{ name: 'Lower 2', weekday: 0, blocks: [{ kind: 'main', rows: [{ id: 'squat-2', name: 'Back squat', sets: 4, reps: '6', load: 85, loadType: 'kg', video: clip }] }] }] },
  ] } },
};

test('live library includes website and mobile authored documents in the right sections', () => {
  const rows = [website,
    { id: 'b', kind: 'program', name: 'Single', detail: { buildType: 'workout', blocks: [{ text: 'Deadlift — 3 × 5', video: clip }] } },
    { id: 'c', kind: 'program', name: 'Paid', detail: { buildType: 'plan', blocks: [{ text: 'Week 1 — Base' }, { text: 'Week 2 — Build' }] } },
    { id: 'meal', kind: 'meal_plan', detail: {} },
  ];
  const library = coachWorkoutLibrary(rows);
  assert.deepEqual(library.programs.map((p) => p.id), ['plan-a']);
  assert.deepEqual(library.workouts.map((p) => p.id), ['b']);
  assert.deepEqual(library.plans.map((p) => p.id), ['c']);
  assert.equal(library.workouts[0].detail.builder.weeks[0].days[0].blocks[0].rows[0].video, clip);
  assert.equal(library.plans[0].detail.builder.outlineOnly, true);
});

test('duplicate copies all weeks and video content without sharing mutable references or row identity', () => {
  const duplicate = duplicateWorkoutPlan(website, 'Copy');
  assert.equal(duplicate.id, undefined);
  assert.equal(duplicate.detail.builder.weeks.length, 2);
  assert.equal(duplicate.detail.builder.weeks[0].days[0].blocks[0].rows[0].video, clip);
  duplicate.detail.builder.weeks[0].days[0].blocks[0].rows[0].cue = 'Changed';
  duplicate.detail.media[0].name = 'Changed';
  assert.equal(website.detail.builder.weeks[0].days[0].blocks[0].rows[0].cue, 'Brace');
  assert.equal(website.detail.media[0].name, 'Squat form');
});

test('saving an existing document updates the same ID with its expected revision', async () => {
  const calls = [];
  const row = await persistCoachWorkout({
    create: async () => { throw new Error('must not recreate'); },
    update: async (body) => { calls.push(body); return { ...body, detail: { ...body.detail, revision: 5 } }; },
  }, website);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'plan-a');
  assert.equal(calls[0].expectedRevision, 4);
  assert.equal(row.detail.revision, 5);
  assert.equal(calls[0].detail.blocks[0].video, clip);
  assert.equal(calls[0].detail.builder.weeks.length, 2);
});

test('failed/conflicting saves propagate failure instead of returning publication success', async () => {
  await assert.rejects(persistCoachWorkout({ create: async () => null }, { name: 'New', detail: {} }), /Could not save/);
  await assert.rejects(persistCoachWorkout({ create: async () => ({}), update: async () => { throw new Error('Changed on another device'); } }, website), /another device/);
  assert.equal(website.detail.revision, 4);
});

test('video picker collects legacy exercise clips, canonical exercise clips and plan media without duplicates', () => {
  const second = 'https://example.test/deadlift.mp4';
  const library = coachWorkoutVideos([website, { name: 'Legacy', detail: { blocks: [{ text: 'Deadlift', video: second }, { video: 'javascript:alert(1)' }], media: [{ type: 'image', url: 'https://example.test/photo.png' }] } }]);
  assert.deepEqual(library.map((v) => v.url), [clip, second]);
  assert.equal(library[0].name, 'Squat form');
});

test('draft keys isolate accounts, existing plans and new content kinds', () => {
  assert.notEqual(coachWorkoutDraftKey('a', 'same'), coachWorkoutDraftKey('b', 'same'));
  assert.notEqual(coachWorkoutDraftKey('a', null, 'workout'), coachWorkoutDraftKey('a', null, 'program'));
});

test('canonical scheduled sessions keep prescription/media/template through the week guardrail boundary', () => {
  const detail = normalizeWorkoutDetail(website.detail, { name: website.name });
  const scheduled = builderToAssignmentRows(detail.builder, website, '2026-09-21');
  const rows = scheduled.map((row) => ({ date: new Date(row.scheduledDate + 'T00:00:00'), title: row.title, payload: row.payload, exercises: row.payload.exercises, block: row.payload }));
  const weeks = bsAssignWeeks(rows, { time: '07:00' });
  assert.equal(weeks.length, 2);
  const delivered = weeks[0].sessions[0].payload;
  assert.equal(delivered.time, '07:00');
  assert.equal(delivered.template.id, 'plan-a');
  assert.equal(delivered.playlist.name, 'Lift');
  assert.equal(delivered.exercises[0].video, clip);
  assert.equal(delivered.exercises[0].tempo, '31X1');
  assert.equal(delivered.exercises[0].cue, 'Brace');
  assert.equal(delivered.exercises[0].group, 'A');
  assert.equal(delivered.exercises[0].load, '80 kg');
  assert.equal(weeks[0].capture, 'per_session');
  assert.equal(weeks[0].sessions[0].plannedMinutes, 45);
  assert.equal(weeks[0].sessions[0].plannedRpe, 7);
});

test('new draft retries carry the same requested record identity and published state', async () => {
  const calls = [];
  const gateway = { create: async (body) => { calls.push(body); throw new Error('Network unavailable'); } };
  const plan = { creationId: '83792002-977e-4dbb-a7cb-64c126cf75b1', name: 'New', published: false, detail: {} };
  await assert.rejects(persistCoachWorkout(gateway, plan));
  await assert.rejects(persistCoachWorkout(gateway, plan));
  assert.deepEqual(calls.map((call) => call.id), [plan.creationId, plan.creationId]);
  assert.equal(calls[0].published, false);
});

test('future updates never mix clients or calendar weeks in one gated merge', () => {
  const groups = groupWorkoutUpdates([
    { id: 'a', clientId: 'one', scheduledDate: '2026-09-21' },
    { id: 'b', clientId: 'one', scheduledDate: '2026-09-27' },
    { id: 'c', clientId: 'two', scheduledDate: '2026-09-21' },
    { id: 'd', clientId: 'one', scheduledDate: '2026-09-28' },
  ]);
  assert.deepEqual(groups.map((group) => group.rows.map((row) => row.id)), [['a', 'b'], ['c'], ['d']]);
  assert.throws(() => groupWorkoutUpdates([{ clientId: 'one', scheduledDate: 'bad' }]), /client or date/);
});

test('canonical assignments require named exercises on every authored training day', () => {
  assert.equal(workoutAssignmentsHaveExercises([]), false);
  assert.equal(workoutAssignmentsHaveExercises([{ payload: { exercises: [] } }]), false);
  assert.equal(workoutAssignmentsHaveExercises([{ payload: { exercises: [{ name: '' }] } }]), false);
  assert.equal(workoutAssignmentsHaveExercises(builderToAssignmentRows(normalizeWorkoutDetail(website.detail).builder, website, '2026-09-21')), true);
});

test('purchased canonical plan materializes the same exercise video and authored weeks', () => {
  const rows = bsMaterializeOutline({ plan: website, startISO: '2026-09-21', runId: 'run-a' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].payload.exercises[0].video, clip);
  assert.equal(rows[1].payload.exercises[0].load, '85 kg');
  assert.equal(rows[0].payload.program.runId, 'run-a');
});

test('legacy object exercise parsing preserves separately authored coaching details', () => {
  const exercise = bsAssignExercise({ text: 'Squat — 3 × 8', video: clip, tempo: '31X1', cue: 'Brace', rest: '90s' });
  assert.equal(exercise.video, clip);
  assert.equal(exercise.tempo, '31X1');
  assert.equal(exercise.rest, '90s');
});

test('quick-log unknown timing never contributes a fabricated zero to averages', () => {
  const rows = [{ completed: true, set_duration_seconds: 40 }, { completed: true, set_duration_seconds: null }, { completed: true, setDurationSeconds: 60 }, { completed: false, set_duration_seconds: 900 }];
  assert.equal(knownWorkoutAverage(rows, 'set_duration_seconds', 'setDurationSeconds'), 50);
  assert.equal(knownWorkoutAverage([{ set_duration_seconds: null }], 'set_duration_seconds', 'setDurationSeconds'), null);
  assert.equal(knownWorkoutAverage([{ rest_before_seconds: 0 }], 'rest_before_seconds', 'restBeforeSeconds'), 0);
});
