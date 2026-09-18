import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { bsDurationFacts } from '../public/newdesign/progressionGuardrail.mjs';
import { bsSdUnitizeText } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsWorkoutDrafts, bsStoreWorkoutDraft, bsRemoveWorkoutDraft, bsRestSeconds, bsSessionMoves, bsPreviewSession, bsNextSessionMove, bsApplyRemainingLoad, bsLoggedSet } from '../mobile-app/src/services/workoutSession.mjs';

const storage = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
test('drafts survive a new reader, stay isolated by account and session, and remove only the completed session', () => {
  const store = storage();
  const a = { userId: 'a', sessionId: 'one', moves: [{ m: 'Squat' }], setLogs: [{ actualReps: 7 }], prescription: { version: 2 } };
  assert.equal(bsStoreWorkoutDraft(store, 'b', a), false);
  assert.equal(bsStoreWorkoutDraft(store, 'a', a), true);
  bsStoreWorkoutDraft(store, 'a', { ...a, sessionId: 'two' });
  assert.deepEqual(bsWorkoutDrafts(store, 'b'), []);
  assert.equal(bsWorkoutDrafts(store, 'a').length, 2);
  bsRemoveWorkoutDraft(store, 'a', 'two');
  assert.deepEqual(bsWorkoutDrafts(store, 'a')[0].setLogs, a.setLogs);
  assert.deepEqual(bsWorkoutDrafts(store, 'a')[0].prescription, { version: 2 });
});
test('storage failure is observable and malformed storage does not become a workout', () => {
  assert.equal(bsStoreWorkoutDraft({ setItem() { throw Error('quota'); } }, 'a', { userId: 'a', sessionId: 's', moves: [] }), false);
  assert.deepEqual(bsWorkoutDrafts({ getItem: () => '{broken' }, 'a'), []);
});
test('prescription preserves instruction fields and distinguishes activity from rest', () => {
  const move = { m: 'Squat', s: '5 × 3 · 3 min rest', cue: 'Brace', tempo: '3010', group: 'A', video: 'https://example.com/clip.mp4' };
  assert.deepEqual(bsSessionMoves([move])[0], { ...move, sets: 5, reps: '3', restSeconds: 180 });
  assert.equal(bsRestSeconds({ rest: '90s' }), 90);
  assert.equal(bsRestSeconds({ rest: '1:30' }), 90);
  assert.equal(bsRestSeconds({ s: '30 min · zone 2' }), null);
  assert.equal(bsRestSeconds({ s: '4 × 8 · 2:00' }), 120);
});
test('Begin session carries the selected preview assignment instead of defaulting to today', () => {
  const selected = { id: 'selected-future-assignment', title: 'Friday legs', template: { id: 'plan', revision: 2 }, exercises: [{ name: 'Squat', sets: 3, reps: '5', rest: '3 min', load: '100 lb', cue: 'Brace', video: 'https://example.com/demo.mp4', tempo: '3010', group: 'A' }] };
  const session = bsPreviewSession(selected, value => value.replace('100 lb', '45 kg'));
  assert.equal(session.clientWorkoutId, selected.id);
  assert.equal(session.title, selected.title);
  assert.deepEqual(session.prescriptionMeta.template, selected.template);
  assert.equal(session.moves[0].sets, 3);
  assert.equal(session.moves[0].restSeconds, 180);
  assert.equal(session.moves[0].l, '45 kg');
  assert.equal(session.moves[0].cue, 'Brace');
  assert.equal(session.moves[0].video, selected.exercises[0].video);
  assert.equal(session.moves[0].tempo, '3010');
  assert.equal(session.moves[0].group, 'A');
  assert.equal(bsPreviewSession({ title: 'Demo', detail: { moves: [{ name: 'Row', scheme: '4 × 8 · 90s rest' }] } }).moves[0].sets, 4);
  assert.equal(bsPreviewSession({ title: 'Empty assignment', id: 'assigned', exercises: [] }).moves.length, 0);
});
test('supersets alternate incomplete exercises then advance without repeating completed sets', () => {
  const moves = [{ sets: 2, group: 'A' }, { sets: 2, group: 'A' }, { sets: 1 }];
  assert.equal(bsNextSessionMove(moves, { '0-0': true }, 0), 1);
  assert.equal(bsNextSessionMove(moves, { '0-0': true, '1-0': true }, 1), 0);
  const completeGroup = { '0-0': true, '0-1': true, '1-0': true, '1-1': true };
  assert.equal(bsNextSessionMove(moves, completeGroup, 1), 2);
  assert.equal(bsNextSessionMove(moves, { ...completeGroup, '2-0': true }, 2), null);
});
test('apply remaining load preserves logged sets and unrelated exercises', () => {
  const inputs = { '0-0': { load: '100', reps: '5' }, '0-1': { load: '100', reps: '5' }, '1-0': { load: '30' }, '2-0': { load: '110', rpe: '' } };
  const result = bsApplyRemainingLoad(inputs, { '0-0': true }, [{ m: 'Squat', sets: 2 }, { m: 'Curl', sets: 1 }, { m: 'Squat', sets: 1 }], 0, 1, '120');
  assert.equal(result['0-0'].load, '100'); assert.equal(result['0-1'].load, '120');
  assert.equal(result['1-0'].load, '30'); assert.equal(result['2-0'].load, '120');
  assert.equal(inputs['0-1'].load, '100');
});
test('Quick Log cannot fabricate set timing, rest timing, or effort; timed mode measures only its own interval', () => {
  const props = { move: { m: 'Squat', reps: '5', l: '100' }, moveIndex: 0, setIndex: 0, input: { reps: '5', load: '100', rpe: '' }, now: 1700000120000, unit: 'lb' };
  const quick = bsLoggedSet(props);
  assert.equal(quick.setDurationSeconds, null); assert.equal(quick.restBeforeSeconds, null); assert.equal(quick.rpe, null);
  const timed = bsLoggedSet({ ...props, startedAt: props.now - 30000, lastEndedAt: props.now - 150000 });
  assert.equal(timed.setDurationSeconds, 30); assert.equal(timed.restBeforeSeconds, 120);
});
test('duration/range/AMRAP prescriptions never become invented repetitions or weight', () => {
  for (const reps of ['30s', '6-8', 'AMRAP', '40m', '']) {
    const row = bsLoggedSet({ move: { m: 'Carry', reps }, moveIndex: 0, setIndex: 0, input: { reps, load: '75% 1RM', rpe: '' }, now: 1700000120000, unit: 'lb' });
    assert.equal(row.actualReps, null, reps);
    assert.equal(row.actualLoad, null);
    assert.equal(row.enteredReps, reps);
    assert.equal(row.targetReps, reps);
  }
});
test('coach load conversion and typed load suffixes retain the correct measurement unit', () => {
  const selected = bsPreviewSession({ exercises: [{ name: 'Row', load: '20 kg', sets: 1, reps: '8' }] }, value => bsSdUnitizeText(value, { weight: 'lb' }));
  const log = load => bsLoggedSet({ move: selected.moves[0], moveIndex: 0, setIndex: 0, input: { reps: '8', load, rpe: '' }, now: 1700000120000, unit: 'lb' });
  assert.equal(selected.moves[0].l, '44.1 lb');
  assert.equal(log(selected.moves[0].l).actualLoad, 44.1);
  assert.equal(log(selected.moves[0].l).unit, 'lb');
  assert.equal(log('20 kg').actualLoad, 20);
  assert.equal(log('20 kg').unit, 'kg');
});

// Execute the shipping writer against a controlled transport. A false-success
// regression has to fail on the function's real resolved/rejected result.
const backend = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
function writer({ rpcError = null, postError = null, local = false } = {}) {
  const calls = [];
  const api = { rpc: async (name, payload) => {
    calls.push({ name, payload });
    if (rpcError) return { error: rpcError };
    return { data: { session: payload?.p_session || {}, set_logs: payload?.p_sets || [], sensor_samples: [] } };
  }, from() { throw Error('no duplicate post'); } };
  const context = { Date, Number, String, Math, JSON, crypto: webcrypto, state: { user: { id: 'a' } }, supabase: local ? null : api,
    bsDurationFacts, normalizeRole: x => x, _localDate: d => d.toISOString().slice(0, 10),
    saveLocalRecord: (_key, data) => data, createCommunityPost: async () => { if (postError) throw postError; return { stored: 'supabase' }; },
    invalidateClientMetrics() {}, announcePRsFromSetLogs() {}, bsIsDuplicateWorkoutPost: () => false,
    window: { ShapeAnalytics: { track() {} } }, };
  vm.createContext(context);
  const normalize = backend.slice(backend.indexOf('function _setLogNum('), backend.indexOf('async function listWorkoutSessions('));
  const save = backend.slice(backend.indexOf('async function saveWorkoutSessionLog('), backend.indexOf('// A post id is only ever forwarded'));
  vm.runInContext(normalize + '\n' + save + '\nthis.save = saveWorkoutSessionLog;', context);
  return { save: context.save, calls };
}
const payload = { sessionId: '21f8bf71-2faa-4934-b027-72bc192a9421', privacy: 'private', title: 'Upper pull', clientWorkoutId: 'plan-1', durationSeconds: 1200,
  setLogs: [bsLoggedSet({ move: { m: 'Row' }, moveIndex: 0, setIndex: 0, input: { reps: '8', load: '55', rpe: '' }, now: 1700000120000, unit: 'lb' })],
  summary: { prescription: { version: 3, moves: [{ m: 'Row', cue: 'Brace' }] } }, };
test('structured failure rejects rather than resolving a success-shaped result', async () => {
  const w = writer({ rpcError: new Error('network failed') });
  await assert.rejects(w.save(payload), /network failed/);
  assert.equal(w.calls.length, 1);
});
test('writer sends stable identity, unknown timing, and prescription through the atomic boundary', async () => {
  const w = writer(); const result = await w.save(payload);
  assert.equal(result.workoutSession.stored, 'supabase');
  const call = w.calls.find(c => c.name === 'save_workout_session');
  assert.equal(call.payload.p_session.id, payload.sessionId);
  assert.equal(call.payload.p_session.client_workout_id, 'plan-1');
  assert.equal(call.payload.p_session.title, 'Upper pull');
  assert.equal(call.payload.p_session.summary.prescription.version, 3);
  assert.equal(call.payload.p_session.summary.avgSetSeconds, null);
  assert.equal(call.payload.p_sets[0].set_duration_seconds, null);
  assert.equal(call.payload.p_sets[0].rpe, null);
});
test('community failure does not erase a confirmed workout save', async () => {
  const w = writer({ postError: new Error('share failed') }); const result = await w.save(payload);
  assert.equal(result.workoutSession.stored, 'supabase'); assert.match(result.shareError.message, /share failed/);
});
test('local-only outcome remains explicitly unsynced', async () => {
  const result = await writer({ local: true }).save(payload);
  assert.equal(result.workoutSession.stored, 'local');
});
test('the backend independently rejects non-repetition prescriptions and honors explicit measured load units', async () => {
  const w = writer();
  await w.save({ ...payload, setLogs: [{ completed: true, moveName: 'Carry', setNumber: 1, actualReps: '30s', actualLoad: '20 kg', unit: 'lb' }] });
  const set = w.calls.find(c => c.name === 'save_workout_session').payload.p_sets[0];
  assert.equal(set.actual_reps, null);
  assert.equal(set.actual_load, 20);
  assert.equal(set.load_unit, 'kg');
});
