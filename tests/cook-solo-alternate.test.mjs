// ONE COOK CAN SWITCH BETWEEN DISHES, AND TWO COOKS CAN WORK AT ONCE (owner, 2026-10-17).
//
// "Ready at a set time" refused most pairs with "Both dishes need your hands at the same time".
// The owner: "You can easily cook 1 thing and do 1 step for 1 meal and then immediately go to
// the other meal ... Or maybe someone is cooking with another person also." Two engine changes
// answer that, and this file holds both to their promises:
//   - `kitchen.cooks` is how many pairs of hands there are (default one, as before). The app does
//     not offer it yet: the live board cannot show two cooks their concurrent steps (#2392);
//   - when the authored plan would be refused, a step that leaves nothing on the stove or in the
//     oven may be followed by a short wait, so one cook can do a step of another dish there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, BS_COOK_MODE, BS_ORCH } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsCookableFromRecipe } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const ONE = { stove: 1, oven: 1, board: 1 };
const recipes = SHAPE_KITCHEN_RECIPES
  .map((r) => ({ key: r.title, ...bsCookableFromRecipe(r) }))
  .filter((c) => c.steps && c.steps.length);
const byTitle = (t) => { const c = recipes.find((r) => r.key === t); assert.ok(c, `no catalog recipe ${t}`); return c; };
const serve = (dishes, kitchen = ONE, extra = {}) => bsOrchestrate(dishes, { mode: BS_COOK_MODE.SERVE, kitchen, ...extra });
const cost = (e) => (e.min > 0 ? e.min : BS_ORCH.activeStepMin);
const HEAT = ['stove', 'oven'];
const EPS = 1e-6;
// Every third pair: 1,683 of the 4,950, spread over the whole catalog.
const PAIRS = [];
for (let i = 0; i < recipes.length; i++) for (let j = i + 1; j < recipes.length; j += 3) PAIRS.push([recipes[i], recipes[j]]);

test('two cooks land together what one cook cannot, and no cooks figure means one', () => {
  const quinoa = byTitle('Curried quinoa with cauliflower and peas');
  let refusedAlone = 0;
  let landedWithTwo = 0;
  for (const other of recipes) {
    if (other === quinoa) continue;
    const alone = serve([quinoa, other], { ...ONE, stove: 4 });
    if (alone.coordinated !== false) continue;
    refusedAlone++;
    if (serve([quinoa, other], { ...ONE, stove: 4, cooks: 2 }).coordinated === true) landedWithTwo++;
    // Absent, junk and explicit-one all plan exactly as one cook.
    for (const k of [{ ...ONE, stove: 4, cooks: 1 }, { ...ONE, stove: 4, cooks: 0 }, { ...ONE, stove: 4, cooks: 'two' }]) {
      assert.deepEqual(serve([quinoa, other], k).timeline, alone.timeline, `cooks ${JSON.stringify(k.cooks)} changed a one-cook plan`);
    }
  }
  assert.ok(refusedAlone > 0, 'no pair refused for one cook — this test is vacuous');
  assert.equal(landedWithTwo, refusedAlone, 'a second cook should land every pair one cook could not');
});

test('a second cook really can work at the same moment, and never a third', () => {
  let overlapSeen = false;
  for (const pair of PAIRS.slice(0, 400)) {
    const plan = serve(pair, { ...ONE, stove: 4, cooks: 2 });
    const hands = plan.timeline.filter((e) => !e.passive).map((e) => [e.at, e.at + cost(e)]);
    for (const [a] of hands) {
      const busy = hands.filter(([f, t]) => f <= a + EPS && a + EPS < t).length;
      assert.ok(busy <= 2, `${pair[0].key} + ${pair[1].key}: ${busy} hands-on steps at once with two cooks`);
      if (busy === 2) overlapSeen = true;
    }
  }
  assert.ok(overlapSeen, 'two cooks never worked at once — the setting does nothing');
});

test('alternating rescues refused pairs, and every rescued plan is one a single cook can do', () => {
  // MEASURED when this landed, two burners and one cook: 993 of these 1,683 pairs landed
  // together before alternation and 1,327 after.
  let rescued = 0;
  let together = 0;
  const kitchen = { ...ONE, stove: 2 };
  for (const pair of PAIRS) {
    const plan = serve(pair, kitchen);
    if (plan.coordinated === true) together++;
    if (!plan.alternates) continue;
    rescued++;
    assert.equal(plan.coordinated, true, 'a rescue is only kept when it lands the dishes together');
    const name = `${pair[0].key} + ${pair[1].key}`;
    // One pair of hands: no two hands-on steps overlap.
    const hands = plan.timeline.filter((e) => !e.passive).sort((a, b) => a.at - b.at);
    for (let i = 1; i < hands.length; i++) {
      assert.ok(hands[i].at >= hands[i - 1].at + cost(hands[i - 1]) - EPS, `${name}: one cook doing two steps at once`);
    }
    // Each dish keeps its order, never waits on the heat, and never waits longer than allowed.
    for (const iid of new Set(plan.timeline.map((e) => e.iid))) {
      const steps = plan.timeline.filter((e) => e.iid === iid).sort((a, b) => a.stepIndex - b.stepIndex);
      for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1];
        const gap = steps[i].at - (prev.at + cost(prev));
        assert.ok(gap >= -EPS, `${name}: ${prev.title} step ${i} starts before step ${i - 1} ends`);
        if (gap <= EPS) continue;
        // A wait after a step on the heat is only ever one the recipe itself wrote (the dahl's
        // "may wait off the heat"); a derived wait never follows a step on the stove or in the oven.
        const authored = pair.find((c) => c.key === prev.recipe)?.stepMeta?.[prev.stepIndex]?.maxPause;
        assert.ok(authored > 0 || (!HEAT.includes(prev.station) && !(prev.also || []).some((x) => HEAT.includes(x))),
          `${name}: ${prev.title} waits ${gap.toFixed(1)} min with step ${prev.stepIndex} on the ${prev.station}`);
        assert.ok(gap <= (prev.maxPause || 0) + EPS, `${name}: ${prev.title} waits ${gap.toFixed(1)} min, allowed ${prev.maxPause || 0}`);
      }
    }
  }
  assert.ok(rescued >= 200, `only ${rescued} pairs rescued — alternation stopped working`);
  assert.ok(together >= 1300, `only ${together} of ${PAIRS.length} pairs land together on two burners`);
});

test('a recipe with no stations anywhere is never split, and a big session is never re-searched', () => {
  const bare = (c) => ({ ...c, stepMeta: (c.steps || []).map(() => ({})) });
  for (const pair of PAIRS.slice(0, 300)) {
    const plan = serve(pair.map(bare));
    assert.ok(!plan.alternates, `${pair[0].key} + ${pair[1].key}: split a recipe that says nothing about its heat`);
  }
  // The rescue is a whole second search, so it is offered only up to alternateMaxDishes.
  const big = recipes.slice(0, BS_ORCH.alternateMaxDishes + 1);
  assert.ok(!serve(big).alternates, 'a session above the bound was searched twice');
});

test('two cooks are pulled only past the instant that is full (Codex, #2392)', () => {
  // Three hands-on dishes of 10, 4 and 3 minutes: two cooks fit them as [0,10], [3,7] and [0,3].
  const dish = (title, min) => ({ key: title, title, steps: ['Do it'], stepMeta: [{ min, passive: false }] });
  const plan = serve([dish('Long', 10), dish('Mid', 4), dish('Short', 3)], { ...ONE, cooks: 2 });
  assert.equal(plan.earliestServe, 10, 'two cooks finish all three in the longest dish');
  assert.equal(plan.coordinated, true);
});
