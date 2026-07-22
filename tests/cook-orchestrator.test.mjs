import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, bsHoldingAt, BS_ORCH } from '../mobile-app/src/services/cookOrchestrator.mjs';

// station shorthand
const A = (station = null) => ({ min: null, passive: false, station }); // active
const P = (min, station) => ({ min, passive: true, station });          // passive window

const CHICKEN = {
  key: 'chicken', title: 'Roast chicken',
  steps: ['Season the chicken.', 'Roast it 30 minutes.', 'Rest it 10 minutes.', 'Slice it.'],
  stepMeta: [A('board'), P(30, 'oven'), P(10, 'off'), A('board')],
};
const RICE = {
  key: 'rice', title: "Tomorrow's rice",
  steps: ['Rinse the rice.', 'Chop the aromatics.', 'Portion into containers.'],
  stepMeta: [A('board'), A('board'), A('board')],
};
const OPTS = { activeStepMin: 3, minPassive: 4 };
const seq = (tl) => tl.map((e) => [e.recipe, e.stepIndex, e.at]);

test('single recipe → serial (never interleaves with itself), passive steps cost their duration', () => {
  const { timeline, serial } = bsOrchestrate([CHICKEN], OPTS);
  assert.equal(serial, true);
  assert.deepEqual(seq(timeline), [
    ['chicken', 0, 0],   // season (active) 0→3
    ['chicken', 1, 3],   // roast (passive 30) 3→33
    ['chicken', 2, 33],  // rest (passive 10) 33→43
    ['chicken', 3, 43],  // slice
  ]);
});

test('no passive window anywhere → serial concatenation, honest (no fabricated parallelism)', () => {
  const veg = { key: 'veg', title: 'Salad', steps: ['Wash it.', 'Chop it.'], stepMeta: [A('board'), A('board')] };
  const { timeline, serial } = bsOrchestrate([RICE, veg], OPTS);
  assert.equal(serial, true);
  assert.deepEqual(seq(timeline), [
    ['rice', 0, 0], ['rice', 1, 3], ['rice', 2, 6],
    ['veg', 0, 9], ['veg', 1, 12],
  ]);
});

test("interleave: rice's active steps fill the chicken's roast window — the demo (pinned)", () => {
  const { timeline, serial } = bsOrchestrate([CHICKEN, RICE], OPTS);
  assert.equal(serial, false);
  assert.deepEqual(seq(timeline), [
    ['chicken', 0, 0],   // season chicken
    ['chicken', 1, 3],   // START roast (oven, 30) — window opens, clock holds
    ['rice', 0, 3],      // …rinse rice while it roasts
    ['rice', 1, 6],      // …chop
    ['rice', 2, 9],      // …portion
    ['chicken', 2, 33],  // roast done → rest (off, 10) — window opens
    ['chicken', 3, 43],  // rest done → slice
  ]);
});

test('station conflict respected: two oven recipes never share the oven', () => {
  const a = { key: 'a', title: 'A', steps: ['Prep A.', 'Roast A 20 min.'], stepMeta: [A('board'), P(20, 'oven')] };
  const b = { key: 'b', title: 'B', steps: ['Prep B.', 'Bake B 15 min.'], stepMeta: [A('board'), P(15, 'oven')] };
  const { timeline, serial } = bsOrchestrate([a, b], OPTS);
  assert.equal(serial, false); // B's board prep DID interleave into A's roast
  assert.deepEqual(seq(timeline), [
    ['a', 0, 0],    // prep A
    ['a', 1, 3],    // A roast (oven 20) → busy 3..23
    ['b', 0, 3],    // prep B interleaves
    ['b', 1, 23],   // B's bake WAITS for the oven — starts at 23, not during A's roast
  ]);
});

test("'off' windows (rest/chill) never conflict — multiple can overlap", () => {
  const a = { key: 'a', title: 'A', steps: ['Prep A.', 'Chill A 20 min.', 'Plate A.'], stepMeta: [A('board'), P(20, 'off'), A('board')] };
  const b = { key: 'b', title: 'B', steps: ['Prep B.', 'Marinate B 15 min.', 'Cook B.'], stepMeta: [A('board'), P(15, 'off'), A('board')] };
  const { timeline } = bsOrchestrate([a, b], OPTS);
  // Both chills run concurrently: A chills at 3 (ends 23), B prep+marinate slot in during it.
  const bMarinate = timeline.find((e) => e.recipe === 'b' && e.stepIndex === 1);
  assert.ok(bMarinate.at < 23, 'B marinates while A is still chilling (off never blocks)');
});

test('sub-minPassive wait is not a hosting window → serial', () => {
  const quick = { key: 'q', title: 'Q', steps: ['Do it.', 'Wait 2 min.'], stepMeta: [A('board'), P(2, 'off')] };
  const { serial } = bsOrchestrate([quick, RICE], OPTS);
  assert.equal(serial, true); // a 2-min pause (< minPassive 4) doesn't host a detour
});

test('bsHoldingAt: the roast holds during the rice detour, clears once we return', () => {
  const { timeline } = bsOrchestrate([CHICKEN, RICE], OPTS);
  // index 3 = rice.chop (cursor mid-detour) → chicken's roast is HOLDING
  const mid = bsHoldingAt(timeline, 3);
  assert.equal(mid.length, 1);
  assert.equal(mid[0].recipe, 'chicken');
  assert.equal(mid[0].station, 'oven');
  assert.equal(mid[0].endsAt, 33);
  // index 5 = chicken.rest (we've returned to the chicken) → roast no longer holding
  assert.deepEqual(bsHoldingAt(timeline, 5), []);
  // index 6 = chicken.slice → rest also cleared (returned)
  assert.deepEqual(bsHoldingAt(timeline, 6), []);
});

test('duplicate recipe keys stay independent instances — no cross-clear (CodeRabbit)', () => {
  // Two selected instances of the same recipe share a display `key`.
  const dup = () => ({ key: 'same', title: 'Roast ×2', steps: ['Prep it.', 'Roast it 20 min.', 'Rest it.'], stepMeta: [A('board'), P(20, 'oven'), A('off')] });
  const { timeline, serial } = bsOrchestrate([dup(), dup()], OPTS);
  assert.equal(serial, false); // instance 1's board prep interleaves instance 0's roast
  const roasts = timeline.filter((e) => e.stepIndex === 1);
  assert.equal(roasts.length, 2);                 // BOTH instances roast (neither's hold cleared the other's)
  assert.notEqual(roasts[0].iid, roasts[1].iid);  // tracked as distinct instances
  assert.equal(roasts[0].recipe, roasts[1].recipe); // …while sharing the display key
  assert.equal(timeline.filter((e) => e.stepIndex === 2).length, 2); // both rest — nothing merged away
  // One oven → the two roasts never overlap (station conflict respected across instances).
  assert.notEqual(roasts[0].at, roasts[1].at);
});

test('empty / junk input never throws → empty serial', () => {
  assert.deepEqual(bsOrchestrate(null), { timeline: [], serial: true });
  assert.deepEqual(bsOrchestrate([]), { timeline: [], serial: true });
  assert.deepEqual(bsOrchestrate([{ key: 'x', steps: [], stepMeta: [] }]), { timeline: [], serial: true });
  assert.deepEqual(bsHoldingAt(null, 0), []);
  assert.deepEqual(bsHoldingAt([], 0), []);
});

test('defaults are exported and sane', () => {
  assert.equal(BS_ORCH.minPassive, 4);
  assert.ok(BS_ORCH.activeStepMin > 0);
});
