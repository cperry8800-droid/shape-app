import test from 'node:test';
import assert from 'node:assert/strict';
import { bsRestSeconds, bsSessionMoves } from '../mobile-app/src/services/workoutSession.mjs';
import { bsPlainScheme } from '../mobile-app/src/services/planOutline.mjs';
import { bsBuildDemoTrainProgram } from '../mobile-app/src/broadsheet/bsClientWeekDemo.js';

// `bsRestSeconds` (workoutSession.mjs) is the rest the session player's timer starts after a
// set (`finishSet` reads `move.restSeconds`, which `bsSessionMoves` fills from it). A move with
// no rest field of its own took the first number-and-unit anywhere in its scheme, and on a
// hold or a distance that is the rep value: the demo Farmer carry, "3 × 40m · 60s rest",
// started a 40:00 rest timer. That first reading is now replaced only when it starts inside
// the rep value (the outline parser's own `bsPlainScheme` says where that is), and the rest
// is read from what follows it.
//
// Every row was recorded on 15e25ae (merged #2164) before this preference change.
// A third value marks a changed reading; every unmarked reading stays exactly the same.
const ROWS = [
  // The clock form.
  [{ s: '3 × 8 · 2:00' }, 120],
  [{ s: '3 × 30 s · 1:00' }, 60],
  [{ s: '4 × 8 · 2:00' }, 120],
  [{ s: '3 × 40m · 1:30' }, 90],
  [{ s: '3 × 10 · 1:30 rest' }, 90],
  [{ s: '3 × 45 s · 1:00' }, 60],
  // A rest field of its own.
  [{ rest: 90 }, 90],
  [{ rest: '90' }, 90],
  [{ rest: '90s' }, 90],
  [{ rest: '1:30' }, 90],
  [{ rest: '2 min' }, 120],
  [{ rest: '2 m' }, 120],
  [{ rest: '45 sec' }, 45],
  [{ rest: 0 }, 0],
  [{ rest: '90s', s: '3 × 40m · 60s rest' }, 90],
  // A rest field is read whole: there is no rep value in it to take out.
  [{ rest: '2 × 30s' }, 30],
  [{ rest: '', s: '3 × 8 · 2 min rest' }, 120],
  // An explicit restSeconds.
  [{ restSeconds: 75 }, 75],
  [{ restSeconds: '75' }, 75],
  [{ restSeconds: 0 }, 0],
  [{ restSeconds: -5 }, 0],
  [{ restSeconds: 'soon', s: '3 × 8 · 2:00' }, 120],
  [{ restSeconds: 75, s: '3 × 40m · 60s rest' }, 75],
  // No rest at all.
  [{ s: '3 × 30 s' }, null],
  [{ s: '3 × 40m' }, null],
  [{ s: '3 × 10' }, null],
  [{}, null],
  [{ s: '' }, null],
  [{ s: '4 × 20s · brisk' }, null],
  // A duration that is the activity, not a rest.
  [{ s: '30 min zone 2' }, null],
  [{ s: '30 min · zone 2' }, null],
  [{ s: '20 min easy run' }, null],
  [{ s: '55 min · aerobic' }, null],
  // No sets × reps to take out: the whole scheme is read, as before.
  [{ s: '2 min rest' }, 120],
  [{ s: 'walk · 90s rest' }, 90],
  // A rest after a rep value with no unit, including a second hold or distance before the labelled rest.
  [{ s: '4 × 6-8 · 3 min rest' }, 180],
  [{ s: '4 × 8 · 2 min rest' }, 120],
  [{ s: '3 × 10 · 90s rest' }, 90],
  [{ s: '3 × 15 · 60s rest' }, 60],
  [{ s: '4 × 12 · 45s rest' }, 45],
  [{ s: '5 × 3 · 3 min rest' }, 180],
  [{ s: '3 × 10 · rest 90s' }, 90],
  [{ s: 'rest 90s · 3 × 10' }, 90],
  [{ s: 'rest 90s 3 × 40m' }, 90],
  [{ s: '3 × 10 90s rest' }, 90],
  [{ s: '3 × 10/side · 60s rest' }, 60],
  [{ s: '3 × 8 · 2.5 min rest' }, 150],
  [{ s: '3x10 · 90s rest' }, 90],
  [{ s: '3 × 1.5 km · 2 min rest' }, 120],
  [{ s: '3 × 8 · 30s hold · 90s rest' }, 30, 90],
  [{ s: '3 × 10 · 40 m sled · 90s rest' }, 2400, 90],
  // A slash-attached duration after unitless reps is still outside the rep value.
  [{ s: '3 × 10/90s rest' }, 90],
  [{ s: '3 × 30/45s · 60s rest' }, 45],
  // #2164 already stopped reading these rep values as the rest; preserve those fixes.
  [{ s: '3 × 40m · 60s rest' }, 60],
  [{ s: '3 × 45s · 30s rest' }, 30],
  [{ s: '3 × 30 s · 60s rest' }, 60],
  [{ s: '3 × 400 m · 90s rest' }, 90],
  [{ s: '3 × 1 mi · 2 min rest' }, 120],
  [{ s: '3 × 2 min · 1 min rest' }, 60],
  [{ s: '3 × 30 sec · 45 sec rest' }, 45],
  [{ s: '3 × 40m · 2 m rest' }, 120],
  [{ s: '3 × 40m rest' }, null],
  [{ s: '3 × 15 secs rest' }, null],
  [{ s: '3 × 10 sets · 90s rest' }, 90],
  [{ s: '3 × 8-10 sec · 60s rest' }, 60],
  [{ s: '3 × 30s/45s · 60s rest' }, 60],
  [{ s: '3 × 30s-45s · 60s rest' }, 60],
  [{ s: '3 × 30s rest 60s' }, 60],
  [{ s: '3x40m · 60s rest' }, 60],
  [{ s: '3 × 40M · 60S REST' }, 60],
  [{ s: '3 × 40m·60s rest' }, 60],
  [{ s: '3 × 40m,60s rest' }, 60],
  [{ s: '3 × 40m;60s rest' }, 60],
  // A hold list with a space before each unit: the second hold's number runs on to the reading
  // of the first, so it is not read as the rest.
  [{ s: '3 × 30 s/45 s · 60s rest' }, 60],
  // Nothing before the rep value is kept once the rep value is taken out. It holds no reading
  // of its own, and joined to what follows, the 2 of "rest 2" would run into the "min".
  [{ s: 'rest 2 3 × 10 sets' }, null],
  [{ s: 'rest 2 3 × 30s min' }, null],
  // Additional adjacency, clock-precedence and explicit-field compatibility probes.
  [{ s: '3 × 8 · 30s hold · 2 min rest' }, 30, 120],
  [{ s: '3 × 8 · 30s hold · rest 90s' }, 30, 90],
  [{ s: '3 × 8 · 30s hold · rest: 1:30' }, 30, 90],
  [{ s: '3 × 8 · 30s hold · 1:30 rest' }, 90],
  [{ s: '3 × 8 · 30s hold · rest: 2.5 minutes' }, 30, 150],
  [{ s: '3 × 8 · 30s hold · rest as needed' }, 30],
  [{ s: '3 × 8 · 30s hold · no rest' }, 30],
  [{ s: '3 × 8 · rest: 1:30' }, null],
  [{ s: '3 × 8 · 0:30 hold · 90s rest' }, 30],
  [{ s: '3 × 8 · 2:00 · rest as needed' }, 120],
  [{ rest: '30s hold · 90s rest' }, 30],
  [{ rest: 'rest: 1:30' }, null],
  [{ restSeconds: 45, s: '3 × 8 · 30s hold · 90s rest' }, 45],
  [{ s: '3 × 8 · 30s hold · 0s rest' }, 30, 0],
  [{ s: '3 × 8 · 30s hold · 90s restless' }, 30],
  [{ s: '3 × 8 · 30s hold · rest 2 mi' }, 30],
  [{ s: '5 × 30s/30s rest' }, null],
];

test('every pinned rest reading stays unchanged except the marked adjacent-rest preferences', () => {
  assert.ok(ROWS.length >= 93, 'the table is shorter than the one main was recorded over');
  for (const [move, before, ...now] of ROWS) {
    const want = now.length ? now[0] : before;
    assert.equal(bsRestSeconds(move), want, `${JSON.stringify(move)}: main read ${before}`);
  }
  const changed = ROWS.filter((row) => row.length === 3);
  assert.equal(changed.length, 7, 'the number of schemes whose rest reads differently now');
  // Every changed row is a scheme with a second duration before its labelled rest.
  for (const [move] of changed) {
    assert.ok(move.rest == null && move.restSeconds == null, `${JSON.stringify(move)} carries a rest field`);
    assert.ok(bsPlainScheme(String(move.s).toLowerCase()), `${JSON.stringify(move)} has no rep value to take out`);
  }
});

test('the Farmer carry rests 60 s, and a 45 s hold with a 30 s rest rests 30 s', () => {
  assert.equal(bsRestSeconds({ s: '3 × 40m · 60s rest' }), 60);
  assert.equal(bsRestSeconds({ s: '3 × 45s · 30s rest' }), 30);
  // "m" is metres in a rep value and minutes in a rest.
  assert.equal(bsRestSeconds({ s: '3 × 40m · 2 m rest' }), 120);
  assert.equal(bsRestSeconds({ rest: '2 m' }), 120);
});

test('bsPlainScheme says where the rep value starts, with or without a unit after it', () => {
  for (const s of ['3 × 40m · 60s rest', 'rest 90s 3 × 40m', 'rest 90s · 3 × 10', '3x10 · 90s rest']) {
    const at = bsPlainScheme(s);
    assert.equal(s.slice(at.index, at.index + at[0].length), at[0], `${s}: the index does not point at the match`);
  }
});

test('every demo move rests what its scheme names, through the path the Train deck hands the player', () => {
  const program = bsBuildDemoTrainProgram({ GREEN: 'g', RUST: 'r', AMBER: 'a' });
  const moves = program.flatMap((day) => day.moves);
  assert.ok(moves.length > 20, `expected the demo week's moves, got ${moves.length}`);
  const carry = moves.filter((mv) => mv.m === 'Farmer carry');
  assert.ok(carry.length && carry.every((mv) => mv.s === '3 × 40m · 60s rest'), 'the Farmer carry is not the scheme this guards');
  let named = 0;
  for (const [mv, session] of moves.map((mv) => [mv, bsSessionMoves([mv])[0]])) {
    const said = /·\s*(\d+)\s*(s|min)\s+rest$/.exec(mv.s);
    if (said) named++;
    const want = said ? Number(said[1]) * (said[2] === 'min' ? 60 : 1) : null;
    assert.equal(session.restSeconds, want, `${mv.m} "${mv.s}"`);
  }
  assert.ok(named > 15, `expected most demo moves to name a rest, found ${named}`);
});
