import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, BS_COOK_MODE, bsHoldingAt, BS_ORCH } from '../mobile-app/src/services/cookOrchestrator.mjs';

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
  // One oven → the two 20-min windows NEVER overlap: the later roast starts only
  // after the earlier one ends (station conflict actually enforced, not just ≠ start).
  const [r0, r1] = roasts[0].at <= roasts[1].at ? [roasts[0], roasts[1]] : [roasts[1], roasts[0]];
  assert.ok(r1.at >= r0.at + r0.min, `oven windows overlap: ${r0.at}+${r0.min} vs ${r1.at}`);
});

test('empty / junk input never throws → empty serial', () => {
  // The return is deep-equalled deliberately: it is the orchestrator's CONTRACT, and a
  // silently-added field is how a caller starts depending on something undocumented.
  // `canInterleave` / `mode` / `reason` joined it with the cook-mode work -- a nothing
  // input is a SINGLE (nothing to interleave with), never a claim that windows exist.
  const empty = { timeline: [], serial: true, canInterleave: false, mode: 'auto', reason: 'single' };
  assert.deepEqual(bsOrchestrate(null), empty);
  assert.deepEqual(bsOrchestrate([]), empty);
  assert.deepEqual(bsOrchestrate([{ key: 'x', steps: [], stepMeta: [] }]), empty);
  assert.deepEqual(bsHoldingAt(null, 0), []);
  assert.deepEqual(bsHoldingAt([], 0), []);
});

test('an unknown mode falls back to auto rather than silently doing nothing', () => {
  // The allow-list bug this pins: SERVE was added to the enum but not to the list of
  // accepted modes, so it fell through to AUTO and returned a valid interleaved plan
  // under the wrong name -- no error, just the wrong answer.
  const junk = bsOrchestrate([], { mode: 'not-a-mode' });
  assert.equal(junk.mode, 'auto', 'an unrecognised mode must resolve to auto');
  for (const m of Object.values(BS_COOK_MODE)) {
    assert.equal(bsOrchestrate([], { mode: m }).mode, m, `mode "${m}" is in the enum but not in the allow-list`);
  }
});

test('defaults are exported and sane', () => {
  assert.equal(BS_ORCH.minPassive, 4);
  assert.ok(BS_ORCH.activeStepMin > 0);
});

// ── SERVE TOGETHER + the cook's real kitchen ────────────────────────────────────
// Three dishes that each want a long hob window. With one burner they must queue;
// with three they can genuinely land together. The engine used to assume one of every
// station, which is right for an oven and wrong for a hob.
const HOB = (k) => ({
  key: k, title: k,
  steps: ['Prep it.', 'Simmer it 18 minutes.', 'Finish it.'],
  stepMeta: [A('board'), P(18, 'stove'), A('board')],
});
const HOBS = [HOB('a'), HOB('b'), HOB('c')];
// Every concurrent pair of holds on one station, counted honestly.
const stationOverlaps = (tl, station) => {
  const h = tl.filter((e) => e.min && e.station === station).map((e) => [e.at, e.at + e.min]);
  let n = 0;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) if (h[i][0] < h[j][1] && h[j][0] < h[i][1]) n++;
  return n;
};

test('serve mode: one burner never double-books the hob, and says so in the serve time', () => {
  // ⚠ The defect this pins: a dish pulled earlier than t=0 used to be CLAMPED to 0 and
  // placed anyway, so two pots sat on one burner for the same 18 minutes while the
  // result reported a flattering 8-minute spread. An impossible serve time must be
  // discovered by moving the target later, never by overlapping the station.
  const o = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 1 } });
  assert.equal(stationOverlaps(o.timeline, 'stove'), 0, 'two dishes were put on one burner at once');
  assert.ok(o.earliestServe >= 3 * 18, `earliest serve ${o.earliestServe} cannot fit three 18-minute hob windows on one burner`);
});

test('serve mode: more burners means earlier food and tighter plating', () => {
  // ⚠ NOT `spread === 0`. These fixtures also hold the BOARD for their hands-on steps,
  // and a cook is one pair of hands — three dishes cannot all have their final active
  // step in the same minute however many burners are fitted. The honest property is
  // that capacity strictly HELPS: the food is ready earlier and lands closer together.
  const one = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 1 } });
  const three = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 3 } });
  assert.ok(three.earliestServe < one.earliestServe,
    `more burners must bring the food earlier (${three.earliestServe} vs ${one.earliestServe})`);
  assert.ok(three.spread <= one.spread,
    `more burners must not scatter the plating (${three.spread} vs ${one.spread})`);
  assert.equal(stationOverlaps(three.timeline, 'stove'), 3, 'three burners means the three hob windows may genuinely overlap');
  assert.equal(stationOverlaps(one.timeline, 'stove'), 0, 'one burner must still serialise them');
});

test('serve mode: an unconfigured or junk kitchen schedules exactly as one of everything', () => {
  // The conservative default is load-bearing: promising a hob nobody owns is worse than
  // scheduling as the engine always did.
  const base = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 1 } });
  for (const k of [undefined, {}, { stove: 0 }, { stove: -4 }, { stove: 'four' }, { stove: NaN }]) {
    const o = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: k });
    assert.equal(o.earliestServe, base.earliestServe, `kitchen ${JSON.stringify(k)} did not fall back to one burner`);
    assert.equal(stationOverlaps(o.timeline, 'stove'), 0, `kitchen ${JSON.stringify(k)} double-booked the hob`);
  }
});

test('serve mode: a serve time the food cannot reach is refused, not cooked faster', () => {
  const o = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: 5, kitchen: { stove: 1 } });
  assert.ok(o.issues.includes('too-soon'), 'an impossible serve time must be reported');
  assert.equal(o.serveAt, o.earliestServe, 'the refusal must name the earliest reachable time');
  assert.equal(stationOverlaps(o.timeline, 'stove'), 0);
});

test('serve mode: a later serve time delays the START, not the eating', () => {
  // The whole point of scheduling backwards: an hour later means an hour of not
  // cooking yet, with the same plan — never the same start and an hour of the food
  // sitting there.
  const early = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 3 } });
  const late = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: early.earliestServe + 60, kitchen: { stove: 3 } });
  assert.equal(late.serveAt, early.earliestServe + 60, 'the chosen serve time must be honoured');
  assert.equal(late.spread, early.spread, 'a later serve time must not change how tightly the food lands');
  const firstEarly = Math.min(...early.timeline.map((e) => e.at));
  const firstLate = Math.min(...late.timeline.map((e) => e.at));
  assert.equal(firstLate - firstEarly, 60, `the whole plan must shift by the full hour (moved ${firstLate - firstEarly})`);
});
