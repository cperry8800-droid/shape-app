import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsLiveProgressPayload, bsLiveAudience, bsShouldPushProgress, bsValidLivePayload } from '../mobile-app/src/services/liveProgress.mjs';

const MOVES = [ { m: 'Pull-up', sets: 4 }, { m: 'Barbell row', sets: 4 }, { m: '', sets: 3 } ];
const DONE = { '0-0': true, '0-1': true, '0-2': true, '0-3': true, '1-0': true, '1-1': true };

test('payload derives per-move done/total from the completed map', () => {
  const p = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.equal(p.v, 1);
  assert.deepEqual(p.exercises, [
    { n: 'Pull-up', done: 4, total: 4 },
    { n: 'Barbell row', done: 2, total: 4 },
    { n: 'Exercise', done: 0, total: 3 },   // unnamed open-session move → honest generic
  ]);
  assert.equal(p.curIdx, 1);
  assert.equal(p.resting, true);
  assert.equal(p.setsDone, 6);
  assert.equal(p.setsTotal, 11);
});

test('payload is null when there is nothing meaningful', () => {
  assert.equal(bsLiveProgressPayload([], {}, 0, false), null);
  assert.equal(bsLiveProgressPayload(null, {}, 0, false), null);
});

test('payload never carries loads/reps/rpe even when moves do', () => {
  const p = bsLiveProgressPayload([{ m: 'Squat', sets: 2, l: '225 lb', reps: '5', rpe: '9' }], {}, 0, false);
  assert.deepEqual(Object.keys(p.exercises[0]).sort(), ['done', 'n', 'total']);
});

test('payload bounds hostile state: Infinity/fractional sets clamp, never loop', () => {
  const p = bsLiveProgressPayload([{ m: 'X', sets: Infinity }, { m: 'Y', sets: 2.7 }], {}, 0, false);
  assert.equal(p.exercises[0].total, 1);   // Infinity is not finite → floor 1, no infinite loop
  assert.equal(p.exercises[1].total, 2);
});

test('audience maps the share rule; private → null; failed read → null (fail closed)', () => {
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Public' }, false), 'public');
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Just friends' }, false), 'followers');
  assert.equal(bsLiveAudience({ shareWorkoutData: 'Off', profileVisibility: 'Public' }, false), null);
  assert.equal(bsLiveAudience({ profileVisibility: 'Private' }, false), null);
  assert.equal(bsLiveAudience({}, false), 'public');       // empty-but-readable doc = documented On·Public default
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Public' }, true), null); // read FAILED → closed
});

test('bsValidLivePayload accepts its own builder output and rejects malformed wire data', () => {
  const own = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.ok(bsValidLivePayload(own));
  assert.equal(bsValidLivePayload(null), null);
  assert.equal(bsValidLivePayload({ v: 2, exercises: [] }), null);
  assert.equal(bsValidLivePayload({ v: 1, exercises: [{ n: 'A', done: 3, total: 2 }], curIdx: 0, setsDone: 3, setsTotal: 2 }), null); // done > total
  assert.equal(bsValidLivePayload({ v: 1, exercises: [{ n: 'A', done: 0, total: 2 }], curIdx: 5, setsDone: 0, setsTotal: 2 }), null); // curIdx out of range
});

test('throttle: unchanged never pushes; changed pushes only past the 4s floor', () => {
  const a = bsLiveProgressPayload(MOVES, DONE, 1, false);
  const b = bsLiveProgressPayload(MOVES, { ...DONE, '1-2': true }, 1, false);
  const rest = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.equal(bsShouldPushProgress(a, a, 0, 100000), false);          // no change, plenty of time
  assert.equal(bsShouldPushProgress(a, b, 100000, 101000), false);     // changed but inside the floor
  assert.equal(bsShouldPushProgress(a, b, 100000, 104100), true);      // changed + past the floor
  assert.equal(bsShouldPushProgress(a, rest, 100000, 104100), true);   // a resting flip is material
  assert.equal(bsShouldPushProgress(null, a, 0, 1000), true);          // first push always goes
});
