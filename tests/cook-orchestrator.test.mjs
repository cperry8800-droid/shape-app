import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, BS_COOK_MODE, bsHoldingAt, BS_ORCH, BS_SERVE_ISSUE, bsProgressPct } from '../mobile-app/src/services/cookOrchestrator.mjs';

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

// ── progress, measured in minutes rather than list items ───────────────────────
test('serve mode: what a plan REPORTS is what that plan does, at any serve time', () => {
  // `timeline`, `serveAt`, `spread` and `issues` must all describe ONE placement.
  // Reading the earliest-time plan into a later-time result would let `issues` name a
  // station pull the returned schedule does not contain. The first dish placed never
  // pulls (nothing is holding yet), so it always ends at the serve time -- which makes
  // "a dish was pulled early" and "the food lands apart" the same fact. So the check is
  // the invariant rather than one case: STATIONS is reported exactly when spread > 0.
  // One dish can contend with nothing -- not a station, not the cook -- so a later
  // serve time must come back completely clean. (Three dishes on three burners still
  // report a pull: the COOK is a capacity-one resource, so their hands-on steps
  // collide however many burners the kitchen has.)
  const solo = bsOrchestrate([HOB('a')], { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 3 } });
  const later = bsOrchestrate([HOB('a')], {
    ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: solo.earliestServe + 45, kitchen: { stove: 3 },
  });
  assert.equal(later.spread, 0, 'one dish cannot land apart from itself');
  assert.deepEqual(later.issues, [], 'a plan that pulled nothing must not report a pull');

  for (const kitchen of [{ stove: 1 }, { stove: 2 }, { stove: 3 }]) {
    const base = bsOrchestrate(HOBS, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen });
    for (const off of [0, 1, 7, 30, 120]) {
      const o = bsOrchestrate(HOBS, {
        ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: base.earliestServe + off, kitchen,
      });
      assert.equal(o.serveAt, base.earliestServe + off, 'the asked-for serve time is honoured');
      assert.equal(
        o.issues.includes('stations'), o.spread > 0,
        'stations must describe the returned plan (stove ' + kitchen.stove + ', +' + off + ')',
      );
    }
  }
});

test('progress: a long step left undone keeps the percentage honest', () => {
  // Three of six steps done, but the roast is still ahead. Counting steps says 50%.
  const mins = [3, 3, 3, 30, 3, 3];
  assert.equal(bsProgressPct(mins, 3), 20, 'nine minutes of forty-five is 20%, not 50%');
  assert.equal(bsProgressPct(mins, 4), 87, 'once the roast is done, most of the cooking is done');
});

test('progress: a boolean map handles a recipe whose steps were skipped', () => {
  const mins = [3, 30, 3];
  assert.equal(bsProgressPct(mins, [true, false, true]), 17);
  assert.equal(bsProgressPct(mins, [false, true, false]), 83);
});

test('progress: never NaN, never out of range', () => {
  // A readout showing NaN is worse than one showing nothing.
  for (const bad of [null, undefined, [], [0, 0], ['x', null]]) {
    const v = bsProgressPct(bad, 2);
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `bsProgressPct(${JSON.stringify(bad)}) = ${v}`);
  }
  assert.equal(bsProgressPct([5, 5], 99), 100, 'more done than exists is still 100');
  assert.equal(bsProgressPct([5, 5], -3), 0);
});

test('progress: the board and a single recipe agree on the same cooking', () => {
  // One timeline walked in order, versus the same steps as a boolean map. If these ever
  // disagree the two surfaces are telling the cook different things about one dish.
  const mins = [3, 18, 3, 4];
  for (let k = 0; k <= mins.length; k++) {
    const flags = mins.map((_, i) => i < k);
    assert.equal(bsProgressPct(mins, k), bsProgressPct(mins, flags), `disagreement at ${k} steps done`);
  }
});

test('capacity: tiled holds on one station do not read as simultaneous', () => {
  // Codex round 1, P2. Two burners. TILE holds the stove for 5 minutes and then another
  // 5; SPAN wants the stove for the whole 10. Those two TILE holds never run at once, so
  // the peak is two burners, not three, and everything fits inside 10 minutes.
  //
  // Counting the holds that merely INTERSECT the proposal saw 2 against a capacity of 2,
  // called the stove full, and pulled SPAN five minutes earlier — turning an attainable
  // 10-minute plan into 15. The regression is the EARLIEST SERVE figure, because that is
  // the number a cook is shown and schedules dinner around.
  const TILE = {
    key: 'tile', title: 'Two short pans',
    steps: ['Simmer the sauce 5 minutes.', 'Simmer the greens 5 minutes.'],
    stepMeta: [P(5, 'stove'), P(5, 'stove')],
  };
  const SPAN = {
    key: 'span', title: 'One long pan',
    steps: ['Simmer the beans 10 minutes.'],
    stepMeta: [P(10, 'stove')],
  };
  const two = bsOrchestrate([TILE, SPAN], { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 2 } });
  assert.equal(two.earliestServe, 10, 'two burners fit a 10-minute plan');
  assert.ok(!(two.issues || []).includes('stations'), `no station issue on two burners: ${JSON.stringify(two.issues)}`);

  // The same dishes on ONE burner genuinely cannot tile — 20 minutes of stove is
  // 20 minutes of stove. Capacity must still BIND, or the fix has simply removed
  // the check rather than corrected it.
  const one = bsOrchestrate([TILE, SPAN], { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 1 } });
  assert.equal(one.earliestServe, 20, 'one burner must serialise the same work');
  assert.ok(one.earliestServe > two.earliestServe, 'more burners can never be slower');
});

test('progress: a hold that is still running has not delivered its minutes', () => {
  // Codex round 1, P2. Four steps; the 30-minute roast at index 1 is a passive window.
  // Starting it advances the cursor to the other dish, so all four "done" flags can be
  // true while the roast still has its full half hour to run.
  const mins = [3, 30, 3, 4];
  const total = 40;
  // Cursor past the roast, roast just lit: it has delivered nothing.
  assert.equal(bsProgressPct(mins, 2, 30), Math.round((3 / total) * 100));
  // Halfway through the roast.
  assert.equal(bsProgressPct(mins, 2, 15), Math.round((18 / total) * 100));
  // Roast finished: the debit is gone and the minutes are banked.
  assert.equal(bsProgressPct(mins, 2, 0), Math.round((33 / total) * 100));

  // Without the debit the board reads 82% the instant the roast goes in — the defect.
  assert.equal(bsProgressPct(mins, 2), 83);

  // The debit can never drive the bar below zero or above the honest figure.
  assert.equal(bsProgressPct(mins, 2, 9999), 0);
  assert.equal(bsProgressPct(mins, 4, 0), 100);
  // A junk debit is ignored rather than poisoning the arithmetic into NaN.
  for (const junk of [undefined, null, NaN, -5, 'x']) {
    assert.equal(bsProgressPct(mins, 2, junk), 83, `junk debit ${String(junk)} changed the figure`);
  }
});

test('serve mode: a pull names the resource that caused it — the cook is not a station', () => {
  // ⚠ `pulled` used to be reported as BS_SERVE_ISSUE.STATIONS whichever resource caused
  // it. MEASURED over 3,570 catalog pairs, an UNLIMITED-station kitchen still reported a
  // pull on 3,492 of them — the identical count to one burner. A station at capacity 99
  // cannot pull anything, so every one of those was the COOK, and the reason code was
  // wrong in 97.8% of plans. Nothing in the UI read `issues` yet, so it was a contract
  // defect waiting for its first consumer rather than a wrong message on screen.
  //
  // Stationless active steps: the ONLY contended resource is the cook's hands.
  const HANDS = (k) => ({
    key: k, title: k,
    steps: ['Chop it.', 'Rest it 20 minutes.', 'Plate it.'],
    stepMeta: [{}, { min: 20, passive: true, station: 'off' }, {}],
  });
  const dishes = [HANDS('a'), HANDS('b'), HANDS('c')];

  // 'off' ties up no station and the active steps declare none, so however generous the
  // kitchen, only the one pair of hands can clash.
  const roomy = bsOrchestrate(dishes, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen: { stove: 99, oven: 99, board: 99 } });
  assert.ok(roomy.spread > 0, 'guard the guard: with no clash at all this test proves nothing');
  assert.ok(roomy.issues.includes(BS_SERVE_ISSUE.COOK), `a cook clash must be reported: ${JSON.stringify(roomy.issues)}`);
  assert.ok(!roomy.issues.includes(BS_SERVE_ISSUE.STATIONS),
    `no station can be busy in an unlimited kitchen, so "stations" is the wrong reason: ${JSON.stringify(roomy.issues)}`);

  // And the honest whole-plan invariant, across both arms: SOME pull is reported exactly
  // when the food lands apart. Neither reason alone carries that — which is the point.
  for (const kitchen of [{ stove: 1 }, { stove: 2 }, { stove: 3 }, { stove: 99, oven: 99, board: 99 }]) {
    for (const set of [HOBS, dishes]) {
      const base = bsOrchestrate(set, { ...OPTS, mode: BS_COOK_MODE.SERVE, kitchen });
      // ⚠ `undefined + off` is NaN, and serveTimeline treats a non-finite serveAt as
      // "no time asked for" -- so every iteration below would silently re-test the
      // earliest plan and the equality could hold for a plan this loop never chose.
      assert.ok(Number.isFinite(base.earliestServe),
        `serve mode must report a numeric earliestServe: ${JSON.stringify(base.earliestServe)}`);
      for (const off of [0, 9, 60]) {
        const o = bsOrchestrate(set, { ...OPTS, mode: BS_COOK_MODE.SERVE, serveAt: base.earliestServe + off, kitchen });
        const pulled = o.issues.includes(BS_SERVE_ISSUE.STATIONS) || o.issues.includes(BS_SERVE_ISSUE.COOK);
        assert.equal(pulled, o.spread > 0,
          `a reported pull and food landing apart are the same fact (stove ${kitchen.stove}, +${off}): ${JSON.stringify(o.issues)} vs spread ${o.spread}`);
      }
    }
  }
});

// The earliest-serve search steps T later until a feasible placement exists, bounded by
// BS_ORCH.serveSearchMax iterations. MEASURED: on two n-step hands-on dishes the shortfall
// advances exactly one step per iteration, so the search needs n of them -- the bound is an
// ITERATION count, not a minute count, and a long enough session exhausts it.
//
// It used to fall out of that loop still infeasible and let everything downstream read an
// infeasible placement, whose `placed` is undefined: the sheet got an EMPTY timeline beside
// a serveAt it could never reach, with no issue raised and nothing thrown.
//
// The bound is lowered here rather than building a 500-step recipe, because the catalog's
// largest is 8 and the honest version of this test runs for minutes. What is exercised is
// the real code path: the search genuinely runs out, and the serial fallback answers.
test('serve mode: a search that runs out of steps still returns a plan the cook can run', () => {
  const dish = (key, n) => ({
    key, title: key,
    steps: Array.from({ length: n }, (_, i) => `Stir step ${i + 1} for 1 minute.`),
    stepMeta: Array.from({ length: n }, () => ({ min: 1, passive: false, station: 'stove' })),
  });
  const N = 16;
  const rs = [dish('A', N), dish('B', N)];
  const kitchen = { stove: 1, oven: 1, board: 1 };

  const prev = BS_ORCH.serveSearchMax;
  try {
    // Guard the guard: with room to converge the search answers on its own, so a fallback
    // that quietly took over every plan would still pass the assertions below.
    BS_ORCH.serveSearchMax = prev;
    const converged = bsOrchestrate(rs, { mode: BS_COOK_MODE.SERVE, kitchen });
    assert.equal(converged.timeline.length, 2 * N, 'the unbounded search must place every step');

    BS_ORCH.serveSearchMax = 8;   // fewer than the N iterations this session needs
    const plan = bsOrchestrate(rs, { mode: BS_COOK_MODE.SERVE, kitchen });

    // One cook, one stove, no passive windows: the dishes can only run end to end, so the
    // earliest they can all be ready is the sum of their durations.
    assert.equal(plan.timeline.length, 2 * N,
      'a search that ran out must still return every step, not an empty timeline');
    assert.equal(plan.earliestServe, 2 * N,
      `earliest serve must be reachable (${2 * N}); got ${plan.earliestServe}`);
    assert.equal(plan.earliestServe, converged.earliestServe,
      'the fallback must agree with the search that had room to converge');

    // ⚠ AND THE FALLBACK MUST NOT CLAIM TO BE A PROOF. The serial bound is an UPPER
    // bound -- an earlier serve time almost certainly exists, the search just ran out of
    // room to find it. `exact` is what the sheet reads to decide between "this is the
    // earliest" and "the earliest of the orders we searched", so a fallback that left it
    // true would put a proof claim on a number that is only "one that works".
    assert.equal(converged.exact, true, 'guard the guard: a converged two-dish search IS exact');
    assert.equal(plan.exact, false, 'a serial-bound fallback is an upper bound, never a proof');

    // Uneven dishes go through the same fallback. The long dish is placed first and the
    // short one pulled clear of it, which is a different shape from two equal dishes and
    // the one a bounded shift loop would be likeliest to give up on.
    const uneven = [dish('L', 100), dish('S', 1)];
    const u = bsOrchestrate(uneven, { mode: BS_COOK_MODE.SERVE, kitchen });
    assert.equal(u.timeline.length, 101, 'an uneven pair must still place every step');
    assert.equal(u.earliestServe, 101, `uneven serial need is 101; got ${u.earliestServe}`);

    // ...and the returned plan must actually obey the one cook: no two hands-on steps
    // overlapping. An empty timeline would pass a "no overlap" check vacuously.
    const spans = plan.timeline.map((e) => [e.at, e.at + (e.min || 0)]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i][0] >= spans[i - 1][1],
        `two hands-on steps overlap at ${spans[i][0]} — one cook cannot be in two places`);
    }
  } finally {
    BS_ORCH.serveSearchMax = prev;
  }
});
