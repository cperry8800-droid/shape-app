// Two more readers keep a hold or a distance whole, by the outline parser's rule.
//
// ⚠ ONE RULE, FOUR READERS. What makes a rep value a hold or a distance is a unit from
// BS_TIME_DISTANCE_UNITS (planOutline.mjs) right after the number. The outline parser and
// the preview's rep total already read it. This brings the session player's scheme
// fallback (`bsSessionMoves`, which now calls the parser's own `bsPlainScheme`) and the
// website builder's legacy block reader (`rowFromBlock`, workoutDocument.js) onto it. The
// builder is a plain browser script that cannot import the parser, so it keeps its own
// copy of the list, and the first test below fails the moment the two drift.
//
// ⚠ EVERY OTHER READING IS MAIN'S, AND THE TABLES BELOW ARE MAIN'S OWN OUTPUT. Each row
// was recorded by running main's code over the line before this change and generated
// into this file, not typed: [line, what main read, what it reads now]. The third
// element is there only where the reading changed, and the tests hold every such row to
// a value with a unit, so nothing outside the rule moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { BS_TIME_DISTANCE_UNITS, bsAssignExercise } from '../mobile-app/src/services/planOutline.mjs';
import { bsSessionMoves, bsApplyMoveSwap, bsIsTimedReps, bsSetPrefill, bsLoggedSet, bsMoveTotalReps } from '../mobile-app/src/services/workoutSession.mjs';
import { TIME_DISTANCE_UNITS, rowFromBlock, normalizeWorkoutDetail, builderToOutlineBlocks, repsLabel, loadLabel } from '../public/newdesign/workoutDocument.mjs';

test('the builder carries the outline parser\'s own unit list', () => {
  assert.equal(typeof TIME_DISTANCE_UNITS, 'string', 'workoutDocument.js no longer exports its copy of the list');
  assert.equal(TIME_DISTANCE_UNITS, BS_TIME_DISTANCE_UNITS, 'the unit list in workoutDocument.js has drifted from planOutline.mjs; change both');
  assert.ok(BS_TIME_DISTANCE_UNITS.split('|').length >= 10, 'the list is shorter than the one this test was written against');
});

// Every spelling the list names ("secs?" is "sec" and "secs"), run on, spaced, with a
// decimal part, and as a range whose far end carries the unit.
const FORMS = BS_TIME_DISTANCE_UNITS.split('|').flatMap((u) => (u.endsWith('?') ? [u.slice(0, -2), u.slice(0, -1)] : [u]));
const VALUES = (unit) => [`30${unit}`, `30 ${unit}`, `1.5 ${unit}`, `30-45${unit}`, `30–45 ${unit}`, `1-1.5 ${unit}`];

test('the parser, the session player and the builder keep every hold or distance whole', () => {
  assert.ok(FORMS.length >= 16, `expected every spelling of the list; expanded ${FORMS.length}`);
  for (const unit of FORMS) {
    for (const value of VALUES(unit)) {
      const line = `Move — 3 × ${value}`;
      assert.equal(bsAssignExercise(line).reps, value, `the parser keeps "${value}"`);
      const [move] = bsSessionMoves([{ m: 'Move', s: `3 × ${value}` }]);
      assert.deepEqual([move.sets, move.reps], [3, value], `the player keeps "${value}"`);
      const row = rowFromBlock(line, 'r');
      assert.deepEqual([row.sets, row.reps, row.loadText], [3, value, ''], `the builder keeps "${value}"`);
      assert.equal(bsIsTimedReps(value), true, `"${value}" is a hold or a distance, not a count`);
    }
  }
});

test('the load after a hold or a distance stays the load, in all three', () => {
  for (const unit of FORMS) {
    for (const value of VALUES(unit)) {
      const e = bsAssignExercise(`Move — 3 × ${value} · 20 kg`);
      assert.deepEqual([e.reps, e.load], [value, '20 kg'], `the parser, "${value} · 20 kg"`);
      assert.equal(bsSessionMoves([{ m: 'Move', s: `3 × ${value} · 20 kg` }])[0].reps, value, `the player, "${value} · 20 kg"`);
      const row = rowFromBlock(`Move — 3 × ${value} · 20 kg`, 'r');
      assert.deepEqual([row.reps, row.loadType, row.load, 'loadText' in row], [value, 'kg', 20, false], `the builder, "${value} · 20 kg"`);
    }
  }
});

// What the rule does not claim: a count, a range with no unit, an effort token, a word
// that starts with a unit's letters, a weight, a unit that does not end the value, and
// a per-side value. (A per-side hold typed by a coach, "30s/side", still reads
// "Log set 1 · 30s/side reps" as it did on main: registered, not this rule.)
test('a value the rule does not claim is not a hold or a distance', () => {
  for (const v of ['8', '8-10', '8–10', '8 reps', '12 ea', 'AMRAP', 'max', 'to failure', '10 sets', '12 steps', '5 kg', '1.5', '1:30', '10 m/s', '30s/45s', '30s/side', '40 m each', '', ' ']) {
    assert.equal(bsIsTimedReps(v), false, JSON.stringify(v));
  }
  assert.equal(bsIsTimedReps(null), false);
  assert.equal(bsIsTimedReps(undefined), false);
});

const pickRow = (r) => ({ sets: r.sets, reps: r.reps, loadType: r.loadType, load: r.load, ...('loadText' in r ? { loadText: r.loadText } : {}) });
// A per-side suffix the builder reads after a value ("40 m each", "10 m / side").
const PER_SIDE = /\s*(?:ea(?:ch)?|per\s+(?:side|leg)|\/\s*(?:side|leg))$/i;

// [line, what main read, what it reads now: only where it changed]
const BUILDER = [
  // plain numbers
  ["Squat — 3 × 5", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "" }],
  ["Squat — 3 × 5 · 60 kg", { sets: 3, reps: "5", loadType: "kg", load: 60 }],
  ["Bench — 4 × 8 · 80 kg", { sets: 4, reps: "8", loadType: "kg", load: 80 }],
  ["Press — 5 × 5 · 100 lb", { sets: 5, reps: "5", loadType: "lb", load: 100 }],
  ["Squat — 3x5 · 60kg", { sets: 3, reps: "5", loadType: "kg", load: 60 }],
  ["Squat — 3 x 5", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "" }],
  ["Squat · 3 × 5 · 60 kg", { sets: 3, reps: "5", loadType: "kg", load: 60 }],
  ["Squat: 3 × 5", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "" }],
  // ranges
  ["Pull-up — 4 × 8-10", { sets: 4, reps: "8-10", loadType: "kg", load: 0, loadText: "" }],
  ["Curl — 3 × 10–12 · 12 kg", { sets: 3, reps: "10–12", loadType: "kg", load: 12 }],
  ["Row — 3 × 8 - 10", { sets: 3, reps: "8", loadType: "kg", load: 0, loadText: "- 10" }],
  ["Plank — 3 × 30-45s", { sets: 3, reps: "30-45s", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 3 × 250-500m", { sets: 3, reps: "250-500", loadType: "kg", load: 0, loadText: "m" }, { sets: 3, reps: "250-500m", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30 – 45 sec", { sets: 3, reps: "30", loadType: "kg", load: 0, loadText: "– 45 sec" }],
  // ladders
  ["Squat — 3 × 8/6/4 · 60/70/80 kg", { sets: 3, reps: "8", loadType: "kg", load: 0, loadText: "/6/4 · 60/70/80 kg" }],
  ["Deadlift — 3 × 5/3/1", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "/3/1" }],
  ["Bench — 3 × 70/75/80% 1RM", { sets: 3, reps: "70", loadType: "kg", load: 0, loadText: "/75/80% 1RM" }],
  ["Carry — 3 × 40 m · 60/70/80 kg", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m · 60/70/80 kg" }, { sets: 3, reps: "40 m", loadType: "kg", load: 0, loadText: "60/70/80 kg" }],
  // 5 kg and loads
  ["Squat — 3 × 5 · 5 kg", { sets: 3, reps: "5", loadType: "kg", load: 5 }],
  ["Carry — 3 × 5 kg", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "kg" }],
  ["Squat — 3 × 5 · 70% 1RM", { sets: 3, reps: "5", loadType: "pct", load: 70 }],
  ["Squat — 3 × 5 · RPE 8", { sets: 3, reps: "5", loadType: "rpe", load: 8 }],
  ["Squat — 3 × 5 · 100 kg · RPE 8", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "100 kg · RPE 8" }],
  // words that start with a unit's letters, and effort tokens
  ["Squat — 3 × 10 sets", { sets: 3, reps: "10 s", loadType: "kg", load: 0, loadText: "ets" }],
  ["Walk — 3 × 12 steps", { sets: 3, reps: "12 s", loadType: "kg", load: 0, loadText: "teps" }],
  ["Burpee — 3 × 10 max", { sets: 3, reps: "10", loadType: "kg", load: 0, loadText: "max" }],
  ["Bike — 3 × 20 mph", { sets: 3, reps: "20", loadType: "kg", load: 0, loadText: "mph" }],
  ["Squat — 3 × max", { sets: 3, reps: "max", loadType: "kg", load: 0, loadText: "" }],
  ["Push-up — 3 × AMRAP", { sets: 3, reps: "AMRAP", loadType: "kg", load: 0, loadText: "" }],
  ["Push-up — 3 × to failure", { sets: 3, reps: "to failure", loadType: "kg", load: 0, loadText: "" }],
  ["Swing — 3 × 15 secs rest", { sets: 3, reps: "15 secs", loadType: "kg", load: 0, loadText: "rest" }],
  // per-side
  ["Row — 3 × 10 ea", { sets: 3, reps: "10 ea", loadType: "kg", load: 0, loadText: "" }],
  ["Lunge — 3 × 10 each", { sets: 3, reps: "10 each", loadType: "kg", load: 0, loadText: "" }],
  ["Lunge — 3 × 10 per side", { sets: 3, reps: "10 per side", loadType: "kg", load: 0, loadText: "" }],
  ["Lunge — 3 × 10/side", { sets: 3, reps: "10/side", loadType: "kg", load: 0, loadText: "" }],
  ["Lunge — 3 × 10 / leg", { sets: 3, reps: "10 / leg", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30s/side", { sets: 3, reps: "30s/side", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30s per side", { sets: 3, reps: "30s per side", loadType: "kg", load: 0, loadText: "" }],
  ["Carry — 3 × 40 m each", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m each" }, { sets: 3, reps: "40 m each", loadType: "kg", load: 0, loadText: "" }],
  // time
  ["Plank — 3 × 30s", { sets: 3, reps: "30s", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30 s", { sets: 3, reps: "30 s", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30 sec", { sets: 3, reps: "30 sec", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30 seconds", { sets: 3, reps: "30 seconds", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 1 min", { sets: 3, reps: "1 min", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 2 minutes", { sets: 3, reps: "2 minutes", loadType: "kg", load: 0, loadText: "" }],
  ["Plank — 3 × 30s · RPE 7", { sets: 3, reps: "30s", loadType: "rpe", load: 7 }],
  ["Plank — 3 × 30s, 20 kg", { sets: 3, reps: "30s", loadType: "kg", load: 20 }],
  ["Plank — 3 × 30s; rest 1 min", { sets: 3, reps: "30s", loadType: "kg", load: 0, loadText: "; rest 1 min" }],
  ["Plank — 3 × 30S", { sets: 3, reps: "30S", loadType: "kg", load: 0, loadText: "" }],
  // distance
  ["Carry — 3 × 40 m", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m" }, { sets: 3, reps: "40 m", loadType: "kg", load: 0, loadText: "" }],
  ["Carry — 3 × 40 m · 32 kg", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m · 32 kg" }, { sets: 3, reps: "40 m", loadType: "kg", load: 32 }],
  ["Run — 3 × 1.5 km", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5 km" }, { sets: 3, reps: "1.5 km", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 3 × 1.5 km · RPE 7", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5 km · RPE 7" }, { sets: 3, reps: "1.5 km", loadType: "rpe", load: 7 }],
  ["Run — 5 × 400m", { sets: 5, reps: "400", loadType: "kg", load: 0, loadText: "m" }, { sets: 5, reps: "400m", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 5 × 400 m", { sets: 5, reps: "400", loadType: "kg", load: 0, loadText: "m" }, { sets: 5, reps: "400 m", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 3 × 1 mi", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: "mi" }, { sets: 3, reps: "1 mi", loadType: "kg", load: 0, loadText: "" }],
  ["Sled — 4 × 20 yds", { sets: 4, reps: "20", loadType: "kg", load: 0, loadText: "yds" }, { sets: 4, reps: "20 yds", loadType: "kg", load: 0, loadText: "" }],
  ["Sled — 4 × 20 yards", { sets: 4, reps: "20", loadType: "kg", load: 0, loadText: "yards" }, { sets: 4, reps: "20 yards", loadType: "kg", load: 0, loadText: "" }],
  ["Sled — 4 × 20 yd", { sets: 4, reps: "20", loadType: "kg", load: 0, loadText: "yd" }, { sets: 4, reps: "20 yd", loadType: "kg", load: 0, loadText: "" }],
  ["Row — 4 × 500 m", { sets: 4, reps: "500", loadType: "kg", load: 0, loadText: "m" }, { sets: 4, reps: "500 m", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 3 × 1 mile", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: "mile" }],
  ["Run — 3 × 400 meters", { sets: 3, reps: "400", loadType: "kg", load: 0, loadText: "meters" }],
  ["Carry — 3 × 40M", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "M" }, { sets: 3, reps: "40M", loadType: "kg", load: 0, loadText: "" }],
  // decimals
  ["Run — 3 × 1.5", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5" }],
  ["Hold — 3 × 1.5 min", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5 min" }, { sets: 3, reps: "1.5 min", loadType: "kg", load: 0, loadText: "" }],
  ["Run — 3 × 1,5 km", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: "5 km" }],
  // (recorded from main the same way, added when the mutation plan found no row that
  // would catch the decimal branch's letter check: a decimal before a word that starts
  // with a unit's letters reads as main read it, and a decimal hold before a per-side
  // word is kept whole)
  ["Hold — 3 × 1.5 sets", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5 sets" }],
  ["Hold — 3 × 2.5 minimum", { sets: 3, reps: "2", loadType: "kg", load: 0, loadText: ".5 minimum" }],
  ["Walk — 3 × 0.5 steps", { sets: 3, reps: "0", loadType: "kg", load: 0, loadText: ".5 steps" }],
  ["Hold — 3 × 1.5 min each", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ".5 min each" }, { sets: 3, reps: "1.5 min each", loadType: "kg", load: 0, loadText: "" }],
  // rates and runs of units
  ["Sprint — 3 × 10 m/s", { sets: 3, reps: "10", loadType: "kg", load: 0, loadText: "m/s" }],
  ["Plank — 3 × 30s/45s", { sets: 3, reps: "30s", loadType: "kg", load: 0, loadText: "/45s" }],
  ["Plank — 3 × 30s-45s", { sets: 3, reps: "30s", loadType: "kg", load: 0, loadText: "-45s" }],
  ["Plank — 3 × 10 sec.", { sets: 3, reps: "10 sec", loadType: "kg", load: 0, loadText: "." }],
  ["Hold — 3 × 1:30", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: ":30" }],
  // speeds, per-side distances, runs of units, and holds with a rest after them
  ["Run — 3 × 30 min/km", { sets: 3, reps: "30 min", loadType: "kg", load: 0, loadText: "/km" }],
  ["Carry — 3 × 40 m/side", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m/side" }, { sets: 3, reps: "40 m/side", loadType: "kg", load: 0, loadText: "" }],
  ["Row — 3 × 10 m/min", { sets: 3, reps: "10", loadType: "kg", load: 0, loadText: "m/min" }],
  ["Bike — 3 × 5 km/h", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "km/h" }],
  ["Hold — 3 × 12 mins", { sets: 3, reps: "12 mins", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 10 minute", { sets: 3, reps: "10 minute", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 20 secs", { sets: 3, reps: "20 secs", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 1 Min", { sets: 3, reps: "1 Min", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 10 MIN", { sets: 3, reps: "10 MIN", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 15 SEC", { sets: 3, reps: "15 SEC", loadType: "kg", load: 0, loadText: "" }],
  ["Hold — 3 × 45s · 1:00", { sets: 3, reps: "45s", loadType: "kg", load: 0, loadText: "1:00" }],
  ["Hold — 3 × 30 s · 1:00", { sets: 3, reps: "30 s", loadType: "kg", load: 0, loadText: "1:00" }],
  ["Carry — 3 × 40m · 60s rest", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m · 60s rest" }, { sets: 3, reps: "40m", loadType: "kg", load: 0, loadText: "60s rest" }],
  ["Strides — 4 × 20s · brisk", { sets: 4, reps: "20s", loadType: "kg", load: 0, loadText: "brisk" }],
  ["Carry — 3 × 40 m/40 m", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m/40 m" }],
  ["Run — 3 × 400m-800m", { sets: 3, reps: "400", loadType: "kg", load: 0, loadText: "m-800m" }],
  ["Carry — 3 × 40 m.", { sets: 3, reps: "40", loadType: "kg", load: 0, loadText: "m." }],
  ["Run — 3 × 1 km @ 5 min/km", { sets: 3, reps: "1", loadType: "kg", load: 0, loadText: "km @ 5 min/km" }, { sets: 3, reps: "1 km", loadType: "kg", load: 0, loadText: "@ 5 min/km" }],
  ["Run — 3 × 5 kmh", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "kmh" }],
  ["Squat — 3 × 5s", { sets: 3, reps: "5s", loadType: "kg", load: 0, loadText: "" }],
  ["Row — 3 × 10 m / s", { sets: 3, reps: "10", loadType: "kg", load: 0, loadText: "m / s" }, { sets: 3, reps: "10 m", loadType: "kg", load: 0, loadText: "/ s" }],
  ["Lunge — 3 × 10 m / side", { sets: 3, reps: "10", loadType: "kg", load: 0, loadText: "m / side" }, { sets: 3, reps: "10 m / side", loadType: "kg", load: 0, loadText: "" }],
  ["Squat — 3 × 5 · 5 min rest", { sets: 3, reps: "5", loadType: "kg", load: 0, loadText: "5 min rest" }],
  ["Squat — 3 × 5, 60 kg", { sets: 3, reps: "5", loadType: "kg", load: 60 }],
  ["Hold — 3 × 30 s; 20 kg", { sets: 3, reps: "30 s", loadType: "kg", load: 0, loadText: "; 20 kg" }],
  // object blocks: a field the block carries wins over the text
  [{"text":"Squat — 3 × 5","load":60,"loadType":"kg"}, { sets: 3, reps: "5", loadType: "kg", load: 60 }],
  [{"text":"Plank — 3 × 30s","reps":"45s"}, { sets: 3, reps: "45s", loadType: "kg", load: 0, loadText: "" }],
  [{"text":"Carry — 3 × 40 m","sets":4}, { sets: 4, reps: "40", loadType: "kg", load: 0, loadText: "m" }, { sets: 4, reps: "40 m", loadType: "kg", load: 0, loadText: "" }],
];

test('the builder reads every line as main did, except a hold or a distance', () => {
  assert.ok(BUILDER.length >= 103, 'the table is shorter than the one main was recorded over');
  let changed = 0;
  for (const [input, main, now] of BUILDER) {
    const got = pickRow(rowFromBlock(input, 'x'));
    assert.deepEqual(got, now || main, `${JSON.stringify(input)}: ${now ? 'the rule reads it differently than this row says' : 'main read it this way, and it is not a hold or a distance'}`);
    if (now) {
      changed++;
      assert.notDeepEqual(now, main, `${JSON.stringify(input)} carries a reading equal to main's`);
      assert.ok(bsIsTimedReps(now.reps.replace(PER_SIDE, '')), `${JSON.stringify(input)} changed, and "${now.reps}" is not a hold or a distance`);
    }
  }
  assert.equal(changed, 23, 'the number of lines the builder now reads differently');
});

// [scheme or move, what main read, what it reads now: only where it changed]
const PLAYER = [
  // plain numbers, with rest, load, x
  ["4 × 8", { sets: 4, reps: "8", restSeconds: null }],
  ["4 × 8 · 3:00", { sets: 4, reps: "8", restSeconds: 180 }],
  ["3 × 5 · 60 kg", { sets: 3, reps: "5", restSeconds: null }],
  ["3x5", { sets: 3, reps: "5", restSeconds: null }],
  ["3 x 5 · 90s", { sets: 3, reps: "5", restSeconds: null }],
  ["5 × 5 · 3:00 rest", { sets: 5, reps: "5", restSeconds: 180 }],
  ["4 × 8 · 90s", { sets: 4, reps: "8", restSeconds: null }],
  // ranges
  ["4 × 8-10 · 3:00", { sets: 4, reps: "8-10", restSeconds: 180 }],
  ["3 × 10–12", { sets: 3, reps: "10–12", restSeconds: null }],
  ["3 × 8 - 10", { sets: 3, reps: "8", restSeconds: null }],
  ["3 × 30-45s", { sets: 3, reps: "30-45", restSeconds: null }, { sets: 3, reps: "30-45s", restSeconds: null }],
  ["3 × 250-500m", { sets: 3, reps: "250-500", restSeconds: null }, { sets: 3, reps: "250-500m", restSeconds: null }],
  ["3 × 30 – 45 sec", { sets: 3, reps: "30", restSeconds: null }],
  // ladders
  ["3 × 8/6/4 · 60/70/80 kg", { sets: 3, reps: "8", restSeconds: null }],
  ["3 × 5/3/1", { sets: 3, reps: "5", restSeconds: null }],
  ["3 × 70/75/80% 1RM", { sets: 3, reps: "70", restSeconds: null }],
  ["3 × 40 m · 60/70/80 kg", { sets: 3, reps: "40", restSeconds: null }, { sets: 3, reps: "40 m", restSeconds: null }],
  // 5 kg
  ["3 × 5 kg", { sets: 3, reps: "5", restSeconds: null }],
  ["3 × 5 · 5 kg", { sets: 3, reps: "5", restSeconds: null }],
  // per side
  ["4 × 8 ea · 2:00", { sets: 4, reps: "8", restSeconds: 120 }],
  ["3 × 12 ea · 1:30", { sets: 3, reps: "12", restSeconds: 90 }],
  ["3 × 10/side", { sets: 3, reps: "10", restSeconds: null }],
  ["3 × 30s/side", { sets: 3, reps: "30", restSeconds: null }],
  // words
  ["3 × 10 sets", { sets: 3, reps: "10", restSeconds: null }],
  ["3 × 12 steps", { sets: 3, reps: "12", restSeconds: null }],
  ["3 × 10 max", { sets: 3, reps: "10", restSeconds: null }],
  ["3 × 20 mph", { sets: 3, reps: "20", restSeconds: null }],
  ["3 × max", { sets: 1, reps: "", restSeconds: null }],
  ["3 × AMRAP", { sets: 1, reps: "", restSeconds: null }],
  ["3 × to failure", { sets: 1, reps: "", restSeconds: null }],
  ["3 × 15 secs rest", { sets: 3, reps: "15", restSeconds: 15 }, { sets: 3, reps: "15 secs", restSeconds: 15 }],
  // time
  ["3 × 30s", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30s", restSeconds: null }],
  ["3 × 30 s · 1:00", { sets: 3, reps: "30", restSeconds: 60 }, { sets: 3, reps: "30 s", restSeconds: 60 }],
  ["3 × 30 sec", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30 sec", restSeconds: null }],
  ["3 × 30 seconds", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30 seconds", restSeconds: null }],
  ["3 × 1 min", { sets: 3, reps: "1", restSeconds: null }, { sets: 3, reps: "1 min", restSeconds: null }],
  ["3 × 2 minutes", { sets: 3, reps: "2", restSeconds: null }, { sets: 3, reps: "2 minutes", restSeconds: null }],
  ["3 × 30s · RPE 7", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30s", restSeconds: null }],
  ["3 × 30s, 20 kg", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30s", restSeconds: null }],
  ["3 × 30S", { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30S", restSeconds: null }],
  // distance
  ["3 × 40 m · 1:00", { sets: 3, reps: "40", restSeconds: 60 }, { sets: 3, reps: "40 m", restSeconds: 60 }],
  ["3 × 40 m", { sets: 3, reps: "40", restSeconds: null }, { sets: 3, reps: "40 m", restSeconds: null }],
  ["3 × 1.5 km", { sets: 3, reps: "1", restSeconds: null }, { sets: 3, reps: "1.5 km", restSeconds: null }],
  ["5 × 400m", { sets: 5, reps: "400", restSeconds: null }, { sets: 5, reps: "400m", restSeconds: null }],
  ["5 × 400 m · 2:00", { sets: 5, reps: "400", restSeconds: 120 }, { sets: 5, reps: "400 m", restSeconds: 120 }],
  ["3 × 1 mi", { sets: 3, reps: "1", restSeconds: null }, { sets: 3, reps: "1 mi", restSeconds: null }],
  ["4 × 20 yds", { sets: 4, reps: "20", restSeconds: null }, { sets: 4, reps: "20 yds", restSeconds: null }],
  ["4 × 20 yards", { sets: 4, reps: "20", restSeconds: null }, { sets: 4, reps: "20 yards", restSeconds: null }],
  ["4 × 500 m", { sets: 4, reps: "500", restSeconds: null }, { sets: 4, reps: "500 m", restSeconds: null }],
  ["3 × 1 mile", { sets: 3, reps: "1", restSeconds: null }],
  ["3 × 400 meters", { sets: 3, reps: "400", restSeconds: null }],
  ["3 × 40M", { sets: 3, reps: "40", restSeconds: null }, { sets: 3, reps: "40M", restSeconds: null }],
  // decimals
  ["3 × 1.5", { sets: 3, reps: "1", restSeconds: null }],
  ["3 × 1.5 min", { sets: 3, reps: "1", restSeconds: null }, { sets: 3, reps: "1.5 min", restSeconds: null }],
  ["3 × 1,5 km", { sets: 3, reps: "1", restSeconds: null }],
  ["3 × 1.5 sets", { sets: 3, reps: "1", restSeconds: null }],
  ["3 × 2.5 minimum", { sets: 3, reps: "2", restSeconds: null }],
  // rates, runs, clocks
  ["3 × 10 m/s", { sets: 3, reps: "10", restSeconds: null }],
  ["3 × 30s/45s", { sets: 3, reps: "30", restSeconds: null }],
  ["3 × 30s-45s", { sets: 3, reps: "30", restSeconds: null }],
  ["3 × 10 sec.", { sets: 3, reps: "10", restSeconds: null }],
  ["3 × 1:30", { sets: 3, reps: "1", restSeconds: null }],
  // no scheme (segments)
  ["5 km easy", { sets: 1, reps: "", restSeconds: null }],
  ["30 min zone 2", { sets: 1, reps: "", restSeconds: null }],
  ["—", { sets: 1, reps: "", restSeconds: null }],
  ["", { sets: 1, reps: "", restSeconds: null }],
  // a move that carries its own reps (or sets) keeps them; the scheme is a fallback
  [{"m":"A","s":"3 × 30 s · 1:00","reps":"12"}, { sets: 3, reps: "12", restSeconds: 60 }],
  [{"m":"B","s":"3 × 40 m","reps":0}, { sets: 3, reps: 0, restSeconds: null }],
  [{"m":"C","s":"4 × 10","sets":2}, { sets: 2, reps: "10", restSeconds: null }],
  [{"m":"D","s":"3 × 30 s","reps":null}, { sets: 3, reps: "30", restSeconds: null }, { sets: 3, reps: "30 s", restSeconds: null }],
];

test('the session player reads every scheme as main did, except a hold or a distance', () => {
  assert.ok(PLAYER.length >= 70, 'the table is shorter than the one main was recorded over');
  let changed = 0;
  for (const [input, main, now] of PLAYER) {
    const [r] = bsSessionMoves([typeof input === 'string' ? { m: 'Move', s: input } : input]);
    assert.deepEqual({ sets: r.sets, reps: r.reps, restSeconds: r.restSeconds }, now || main,
      `${JSON.stringify(input)}: ${now ? 'the rule reads it differently than this row says' : 'main read it this way, and it is not a hold or a distance'}`);
    if (now) {
      changed++;
      assert.notDeepEqual(now, main, `${JSON.stringify(input)} carries a reading equal to main's`);
      assert.ok(bsIsTimedReps(now.reps), `${JSON.stringify(input)} changed, and "${now.reps}" is not a hold or a distance`);
    }
  }
  assert.equal(changed, 25, 'the number of schemes the player now reads differently');
});

// ⚠ A HOLD IS NOT A REP COUNT, IN THE LOG AS ON THE BUTTON. The digits alone pre-filled
// "30", which the logger records as 30 reps (its count pattern is a bare number), so a
// quick-logged plank went into the member's history as 30 reps of a plank.
test('a quick-logged hold records the time it was given, and no rep count', () => {
  const now = Date.parse('2026-09-23T10:00:00Z');
  const [plank] = bsSessionMoves([{ m: 'Plank', s: '3 × 30 s · 1:00' }]);
  const pre = bsSetPrefill(plank, 0);
  assert.equal(pre.reps, '30 s');
  const log = bsLoggedSet({ move: plank, moveIndex: 0, setIndex: 0, input: { ...pre, rpe: '' }, now, unit: 'kg' });
  assert.deepEqual([log.actualReps, log.enteredReps, log.targetReps], [null, '30 s', '30 s']);
  assert.equal(bsMoveTotalReps(plank), 0, 'and the preview counts no reps for it, as it already did');
  // The control: a count still pre-fills, logs and totals as a count.
  const [row] = bsSessionMoves([{ m: 'Row', s: '3 × 10 · 1:30' }]);
  const rowLog = bsLoggedSet({ move: row, moveIndex: 0, setIndex: 0, input: { ...bsSetPrefill(row, 0), rpe: '' }, now, unit: 'kg' });
  assert.deepEqual([rowLog.actualReps, rowLog.targetReps, bsMoveTotalReps(row)], [10, '10', 30]);
});

// ⚠ THE BUTTON NAMES A COUNT. "Log set {n} · {reps} reps" is a count in every locale, and
// Russian puts {reps} through a plural, which renders a value that is not a number as
// "не число". The player takes the plain "Log set {n}" for a hold, and that string must
// not ask for the reps in any locale.
test('every locale can say "Log set" without the reps', () => {
  const dir = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);
  const locales = readdirSync(dir).filter((l) => !l.startsWith('.'));
  assert.ok(locales.length >= 13, `found ${locales.length} locales`);
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(new URL(`${l}/session.json`, dir), 'utf8'));
    assert.ok(cat['player.logSetCta'], `${l} has no "Log set" string`);
    assert.doesNotMatch(cat['player.logSetCta'], /\{reps/, `${l}'s "Log set" string asks for the reps`);
  }
});

// ⚠ A SWAP WITH ITS OWN SCHEME RUNS THAT SCHEME. The Train deck applied a swap as
// `{ ...move, m, s }`, so the move swapped in kept the one it replaced's sets, reps and
// rest, and the player reads those ahead of the scheme.
const SQUAT = { n: '01', m: 'Back squat', s: '5 × 5 · 3:00', sets: '5', reps: '5', rest: '3:00', l: '100 kg · RPE 8', load: '100 kg · RPE 8', rpe: 8,
  video: 'https://example.com/squat.mp4', cue: 'Brace', tempo: '3010', group: 'A' };

test('a swap with its own scheme runs that scheme, not the one it replaced', () => {
  const swap = { m: 'Goblet squat', s: '4 × 10 · 2:00' };
  // The control: the plain spread the deck used ran the back squat's prescription.
  const [spread] = bsSessionMoves([{ ...SQUAT, ...swap }]);
  assert.deepEqual([spread.sets, spread.reps, spread.restSeconds], [5, '5', 180], 'the defect this rule removes');
  const swapped = bsApplyMoveSwap(SQUAT, swap);
  for (const key of ['sets', 'reps', 'rest', 'restSeconds', 'perSet']) assert.ok(!(key in swapped), `the swap kept the original's ${key}`);
  const [move] = bsSessionMoves([swapped]);
  assert.deepEqual([move.m, move.s, move.sets, move.reps, move.restSeconds], ['Goblet squat', '4 × 10 · 2:00', 4, '10', 120]);
  // What the rule leaves alone: the slot's number, the load and its RPE, the superset,
  // and the tempo, cue and video (registered as their own question, not decided here).
  for (const key of ['n', 'l', 'load', 'rpe', 'group', 'tempo', 'cue', 'video']) assert.deepEqual(move[key], SQUAT[key], key);
});

test('a timed swap keeps its hold whole, and the original\'s rest does not survive it', () => {
  const carry = { n: '04', m: 'Farmer carry', s: '3 × 40 m · 1:30', sets: '3', reps: '40 m', rest: '1:30', restSeconds: 90, l: '32 kg' };
  const [hold] = bsSessionMoves([bsApplyMoveSwap(carry, { m: 'Trap-bar hold', s: '3 × 30 s · 1:00' })]);
  assert.deepEqual([hold.sets, hold.reps, hold.restSeconds], [3, '30 s', 60]);
  assert.equal(bsIsTimedReps(bsSetPrefill(hold, 0).reps), true, 'the button says "Log set", not "30 s reps"');
});

test('a generic variant keeps the move\'s own scheme and everything it prescribes', () => {
  assert.deepEqual(bsApplyMoveSwap(SQUAT, { m: 'Dumbbell variant', s: SQUAT.s }), { ...SQUAT, m: 'Dumbbell variant' });
  // A later swap is compared with the deck's move, not with an earlier swap: a variant
  // picked over "Goblet squat" carries the goblet squat's scheme, which is not the
  // back squat's, so the back squat's prescription still goes.
  const [move] = bsSessionMoves([bsApplyMoveSwap(SQUAT, { m: 'Dumbbell variant', s: '4 × 10 · 2:00' })]);
  assert.deepEqual([move.sets, move.reps, move.restSeconds], [4, '10', 120]);
});

test('a swap drops a ladder with its written-out load, and a variant keeps both', () => {
  const perSet = [{ reps: '8', load: '60 kg' }, { reps: '6', load: '70 kg' }, { reps: '4', load: '80 kg' }];
  const ladder = { m: 'Back squat', s: '3 × 8/6/4 · 2:00', sets: '3', reps: '8/6/4', rest: '2:00', l: '60/70/80 kg · RPE 8', load: '60/70/80 kg · RPE 8', perSet };
  const swapped = bsApplyMoveSwap(ladder, { m: 'Front squat', s: '5 × 5 · 3:00' });
  assert.ok(!('perSet' in swapped) && !('load' in swapped), 'the ladder and its written-out load go');
  assert.equal(swapped.l, '—', 'the deck\'s own mark for no load');
  const [move] = bsSessionMoves([swapped]);
  assert.deepEqual([move.sets, move.reps, bsSetPrefill(move, 0).reps, bsSetPrefill(move, 4).reps], [5, '5', '5', '5']);
  assert.equal(bsSetPrefill(move, 0).load, '—');
  const kept = bsApplyMoveSwap(ladder, { m: 'Dumbbell variant', s: ladder.s });
  assert.deepEqual([kept.perSet, kept.l, kept.load], [perSet, ladder.l, ladder.load]);
});

test('no swap, or one saved without a scheme, leaves the move as it was', () => {
  for (const none of [undefined, null]) assert.deepEqual(bsApplyMoveSwap(SQUAT, none), SQUAT);
  assert.deepEqual(bsApplyMoveSwap(SQUAT, { m: 'Old save' }), { ...SQUAT, m: 'Old save' });
});

// ⚠ AND THE DECK HAS TO USE IT. A rule that is right and tested while the page applies
// the swap some other way is the defect with a test beside it. So the deck's `effMoves`
// must be built by calling the rule with the saved swap, and nothing in it may spread
// the saved swaps into a move itself.
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  if (typeof node.type === 'string') visit(node);
  for (const [k, v] of Object.entries(node)) if (k !== 'loc' && k !== 'start' && k !== 'end' && v && typeof v === 'object') walk(v, visit);
};
test('the Train deck applies a swap through the rule, never a bare spread', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const decls = [];
  walk(ast, (n) => { if (n.type === 'VariableDeclarator' && n.id?.name === 'effMoves') decls.push(n); });
  assert.equal(decls.length, 1, `found ${decls.length} declarations of effMoves`);
  const calls = [], spreads = [], uses = [];
  walk(decls[0].init, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'bsApplyMoveSwap') calls.push(n);
    if (n.type === 'SpreadElement') spreads.push(n);
    if (n.type === 'Identifier' && n.name === 'moveOverrides') uses.push(n);
  });
  assert.equal(calls.length, 1, 'the deck does not apply the swap through bsApplyMoveSwap');
  assert.equal(spreads.length, 0, 'the deck spreads a swap into a move itself');
  const inCall = [];
  walk(calls[0].arguments[1], (n) => { if (n.type === 'Identifier' && n.name === 'moveOverrides') inCall.push(n); });
  assert.ok(uses.length >= 1 && inCall.length === uses.length, 'the saved swaps reach the move some way other than the rule');
});

// ⚠ THE BUILDER'S OWN DISTANCE ROWS READ BACK. builderToOutlineBlocks writes a row as
// "Farmer carry — 3 × 40 m · 32 kg", and the legacy reader split that into 40 reps and a
// load of "m · 32 kg". Each row reads back to the reps and the load it was written with.
test('a distance row the builder writes reads back with its unit and its load', () => {
  const rows = [
    { id: 'a', name: 'Farmer carry', sets: 3, reps: '40 m', loadType: 'kg', load: 32 },
    { id: 'b', name: 'Sled push', sets: 4, reps: '20 yds', loadType: 'lb', load: 90 },
    { id: 'c', name: 'Walking lunge', sets: 3, reps: '10 m/side', loadType: 'kg', load: 12 },
    { id: 'd', name: 'Tempo run', sets: 3, reps: '1.5 km', loadType: 'kg', load: 0 },
    { id: 'e', name: 'Plank', sets: 3, reps: '45 s', loadType: 'kg', load: 0 },
  ];
  const builder = { version: 1, schemaVersion: 1, weeks: [{ deload: false, days: [{ id: 'd1', name: 'Day 1', blocks: [{ kind: 'main', rows }] }] }] };
  const text = builderToOutlineBlocks(builder).map((b) => ({ text: b.text }));
  const back = normalizeWorkoutDetail({ blocks: text }).builder.weeks[0].days[0].blocks[0].rows;
  assert.equal(back.length, rows.length);
  rows.forEach((row, i) => {
    assert.equal(repsLabel(back[i]), repsLabel(row), `${text[i].text}: the reps`);
    assert.equal(loadLabel(back[i]), loadLabel(row), `${text[i].text}: the load`);
  });
});
