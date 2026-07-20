import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsLiveProgressPayload, bsLiveAudience, bsShouldPushProgress, bsValidLivePayload } from '../mobile-app/src/services/liveProgress.mjs';
import { bsValidLivePayload as bsValidCanonical, bsCookingPayload, bsLiveCoachPayload, bsValidLiveCoachPayload } from '../public/newdesign/liveProgress.mjs';

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

test('bsValidLivePayload enforces the FULL builder contract (review round)', () => {
  const ok = { v: 1, exercises: [{ n: 'A', done: 1, total: 2 }], curIdx: 0, resting: false, setsDone: 1, setsTotal: 2 };
  assert.ok(bsValidLivePayload(ok));
  // aggregates must equal the sums — contradictory totals would draw a fabricated bar
  assert.equal(bsValidLivePayload({ ...ok, setsDone: 9 }), null);
  assert.equal(bsValidLivePayload({ ...ok, setsTotal: 99 }), null);
  // a whitespace-only name would render a blank row; the builder never emits one
  assert.equal(bsValidLivePayload({ ...ok, exercises: [{ n: '   ', done: 1, total: 2 }] }), null);
  // resting must be a real boolean, not a truthy smuggle
  assert.equal(bsValidLivePayload({ ...ok, resting: 'yes' }), null);
  assert.equal(bsValidLivePayload({ ...ok, resting: 1 }), null);
  // curIdx -1 is a REAL state ("nothing started yet") and must SURVIVE validation
  const none = bsValidLivePayload({ ...ok, curIdx: -1 });
  assert.equal(none.curIdx, -1);
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

test('mobile shim re-exports the canonical implementation (no twin)', () => {
  assert.equal(bsValidLivePayload, bsValidCanonical);
});

test('cooking payload: plan/recipe-sourced yes, freehand/absent/unsafe null', () => {
  assert.deepEqual(bsCookingPayload({ title: 'Salmon rice bowl', kcal: 620 }),
    { v: 1, kind: 'cooking', title: 'Salmon rice bowl' });
  assert.deepEqual(bsCookingPayload({ title: 'Overnight oats', recipeId: 'r-oats' }),
    { v: 1, kind: 'cooking', title: 'Overnight oats' });
  assert.equal(bsCookingPayload({ title: 'My own thing' }), null);            // freehand — intake class
  assert.equal(bsCookingPayload({ kcal: 500, title: '' }), null);             // no clean title
  assert.equal(bsCookingPayload(null), null);
  assert.equal(bsCookingPayload({ kcal: 500, title: 'x'.repeat(81) }), null); // builder rejects too — no truncate-then-send
});

test('cooking payload: falsy-but-finite kcal must NOT read as planned', () => {
  // Number(null)/Number('')/Number(false) are all finite 0 — a freehand meal
  // carrying one of those must stay silent (intake class).
  assert.equal(bsCookingPayload({ title: 'Freehand', kcal: null }), null);
  assert.equal(bsCookingPayload({ title: 'Freehand', kcal: '' }), null);
  assert.equal(bsCookingPayload({ title: 'Freehand', kcal: false }), null);
  assert.equal(bsCookingPayload({ title: 'Freehand', recipeId: '   ' }), null);
  // a real 0-kcal planned meal IS planned (an explicit number)
  assert.ok(bsCookingPayload({ title: 'Black coffee', kcal: 0 }));
  assert.ok(bsCookingPayload({ title: 'Planned', kcal: '620' }));
});

test('validator dispatches on kind FIRST; cooking strictly validated; workout contract untouched', () => {
  assert.deepEqual(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'Salmon rice bowl' }),
    { v: 1, kind: 'cooking', title: 'Salmon rice bowl' });
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '' }), null);
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '  ' }), null);
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'x'.repeat(81) }), null);   // REJECT, never truncate
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'a\u0007b' }), null);       // control char
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '<b>hi</b>' }), null);      // markup
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'ok', extra: 1 }).extra, undefined); // sanitized shape only
  assert.equal(bsValidLivePayload({ v: 1, kind: 'mystery', title: 'x' }), null);              // unknown kind
  // workout regression: the existing builder output still validates unchanged
  const w = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.ok(bsValidLivePayload(w));
  assert.ok(bsValidLivePayload({ ...w, kind: 'workout' }));
});

// setInputs uses the SESSION PLAYER's real key shape (verified in BSSession's
// buildSetInputs): `${moveIdx}-${setIdx}` -> { load, reps, rpe } as STRINGS.
const INPUTS = {
  '0-0': { load: '135', reps: '8', rpe: '7' },
  '0-1': { load: '145', reps: '6', rpe: '8' },
  '0-2': { load: '145', reps: '6', rpe: '9' },
  '0-3': { load: '155', reps: '5', rpe: '9' },
  '1-0': { load: '95', reps: '10', rpe: '7' },
  '1-1': { load: '95', reps: '10', rpe: '8' },
};

test('coach payload carries the base contract PLUS per-set load/reps/rpe', () => {
  const c = bsLiveCoachPayload(MOVES, DONE, 1, false, INPUTS);
  assert.equal(c.v, 1);
  assert.equal(c.exercises.length, 3);
  assert.equal(c.setsDone, 6);
  assert.equal(c.setsTotal, 11);
  // exercise 0: 4 sets, all done
  assert.deepEqual(c.exercises[0].sets[0], { load: '135', reps: '8', rpe: '7', done: true });
  assert.deepEqual(c.exercises[0].sets[3], { load: '155', reps: '5', rpe: '9', done: true });
  // exercise 1: 4 sets, first two done
  assert.equal(c.exercises[1].sets[1].done, true);
  assert.equal(c.exercises[1].sets[2].done, false);
  // an un-entered set is honest-absent, never invented
  assert.deepEqual(c.exercises[1].sets[2], { load: '', reps: '', rpe: '', done: false });
  assert.ok(bsValidLiveCoachPayload(c), 'builder output must validate');
});

// ⚠ The session player PRE-FILLS setInputs for EVERY set from the prescription
// (buildSetInputs seeds m.l / m.reps / m.rpe||'8'), so "has a value" cannot mean
// "the athlete logged it". Only `done` distinguishes a fact from a plan — and the
// coach grid renders any non-empty figure as a real live result, so serializing a
// prefill would show a coach numbers the athlete never lifted (review: Codex).
test('coach payload: an UNDONE set never leaks its prescription prefill', () => {
  const prefilled = {
    '0-0': { load: '225', reps: '5', rpe: '8' },   // done → a fact
    '0-1': { load: '225', reps: '5', rpe: '8' },   // NOT done → planned default
    '0-2': { load: '225', reps: '5', rpe: '8' },   // NOT done → planned default
  };
  const built = bsLiveCoachPayload([{ m: 'Deadlift', sets: 3 }], { '0-0': true }, 0, false, prefilled);
  assert.deepEqual(built.exercises[0].sets[0], { load: '225', reps: '5', rpe: '8', done: true });
  assert.deepEqual(built.exercises[0].sets[1], { load: '', reps: '', rpe: '', done: false });
  assert.deepEqual(built.exercises[0].sets[2], { load: '', reps: '', rpe: '', done: false });
  assert.ok(bsValidLiveCoachPayload(built), 'the gated payload must still validate');
});

test('coach payload: builder clamps long strings, the WIRE rejects them', () => {
  const long = { '0-0': { load: 'x'.repeat(40), reps: '8', rpe: '7' } };
  const built = bsLiveCoachPayload([{ m: 'Squat', sets: 1 }], { '0-0': true }, 0, false, long);
  assert.equal(built.exercises[0].sets[0].load.length, 12);   // builder is courteous
  assert.ok(bsValidLiveCoachPayload(built));
  // hand-built wire data gets NO courtesy
  const hostile = JSON.parse(JSON.stringify(built));
  hostile.exercises[0].sets[0].load = 'y'.repeat(13);
  assert.equal(bsValidLiveCoachPayload(hostile), null);
});

test('coach payload: >10 sets truncated at BUILD, rejected on the WIRE', () => {
  const many = [{ m: 'Squat', sets: 14 }];
  const built = bsLiveCoachPayload(many, {}, 0, false, {});
  assert.equal(built.exercises[0].sets.length, 10);          // tail dropped
  assert.ok(bsValidLiveCoachPayload(built));
  const hostile = JSON.parse(JSON.stringify(built));
  hostile.exercises[0].sets = Array.from({ length: 11 }, () => ({ load: '1', reps: '1', rpe: '1', done: false }));
  assert.equal(bsValidLiveCoachPayload(hostile), null);
});

test('coach validator enforces the FULL base contract too, and strips extras', () => {
  const ok = bsLiveCoachPayload(MOVES, DONE, 1, false, INPUTS);
  // base-contract violations must still fail through the coach validator
  assert.equal(bsValidLiveCoachPayload({ ...ok, setsDone: 999 }), null);   // aggregates must sum
  assert.equal(bsValidLiveCoachPayload({ ...ok, resting: 'yes' }), null);  // real boolean only
  assert.equal(bsValidLiveCoachPayload({ ...ok, v: 2 }), null);
  assert.equal(bsValidLiveCoachPayload(null), null);
  // per-set type discipline
  const bad = JSON.parse(JSON.stringify(ok));
  bad.exercises[0].sets[0].done = 1;                                        // not a boolean
  assert.equal(bsValidLiveCoachPayload(bad), null);
  const bad2 = JSON.parse(JSON.stringify(ok));
  bad2.exercises[0].sets[0].load = 42;                                      // not a string
  assert.equal(bsValidLiveCoachPayload(bad2), null);
  // extra keys are stripped, never passed through to the render
  const extra = JSON.parse(JSON.stringify(ok));
  extra.exercises[0].sets[0].hr = 172;
  const clean = bsValidLiveCoachPayload(extra);
  assert.equal(clean.exercises[0].sets[0].hr, undefined);
});

test('coach payload is null when the base payload is (no moves)', () => {
  assert.equal(bsLiveCoachPayload([], {}, 0, false, INPUTS), null);
  assert.equal(bsLiveCoachPayload(null, {}, 0, false, INPUTS), null);
});

test('cooking rejection cannot be smuggled past the builder into the wire', () => {
  // Everything the builder refuses the validator must also refuse — the two
  // ends share ONE contract, so a hand-built row cannot out-flank the writer.
  const bad = ['x'.repeat(81), '<b>hi</b>', 'a\u0000b', 'a\u007fb', '   '];
  for (const title of bad) {
    assert.equal(bsCookingPayload({ kcal: 100, title }), null, `builder accepted: ${JSON.stringify(title)}`);
    assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title }), null, `validator accepted: ${JSON.stringify(title)}`);
  }
});
