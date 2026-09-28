// TWO PANS NEVER SHARE A BURNER. The default kitchen is one burner and one oven
// (BS_KITCHEN_DEFAULT), and the planner used to let a HANDS-ON step claim nothing: only
// a passive hold held its station. So on one burner, "Cook at the same time" put the
// steak hash's skillet on the stove while the chicken's covered pan held it for 18 minutes
// (hash steps 2-4 at minutes 15, 18 and 21, inside the chicken's hold at 12-30).
//
// ⚠ "DURING THE STEP" IS NOT ENOUGH, AND THIS FILE CHECKS THE STRONGER RULE. Claiming the
// burner only while a step is being performed moves the same collision to minute 30: the
// chicken's timer rings, the hash goes on the burner, and the chicken's pan is still on it
// until its own next step says "rest off the heat". A pan stays where its step left it, so
// a dish holds its burner from the step that puts food on it until the step that takes it
// off. `occupancy()` below reconstructs exactly that from a timeline, independently of the
// engine, and every mode is checked against it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { bsCookableFromRecipe, bsCookSlug } from '../mobile-app/src/services/cookable.mjs';
import { bsOrchestrate, bsReplanCook, bsCookBlockingHold, BS_COOK_MODE, BS_ORCH, BS_KITCHEN_DEFAULT } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsPrepOrder } from '../mobile-app/src/services/mealPrep.mjs';

const PAIR = ['Steak and sweet potato hash', 'One-pan chicken and rice'];
const HEAT = ['stove', 'oven'];

// The prep session's own input, built the way BSPrepSession builds it: catalog candidates at
// their base servings, ordered by bsPrepOrder, then { key, title, steps, stepMeta }.
const inputFor = (titles, metaOf = (c) => c.stepMeta) => bsPrepOrder(titles.map((t) => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === t);
  assert.ok(r, `catalog has no recipe titled ${t}`);
  const cookable = bsCookableFromRecipe(r);
  return { key: 'catalog-' + bsCookSlug(r.title), cookable };
})).map((it) => ({ key: it.key, title: it.cookable.title, steps: it.cookable.steps, stepMeta: metaOf(it.cookable) }));

const stepMin = (e) => (typeof e.min === 'number' && e.min > 0 ? e.min : BS_ORCH.activeStepMin);
const heatOf = (m) => [m && m.station, ...((m && m.also) || [])].filter((x) => HEAT.includes(x));

// Where every dish's food is, as intervals, read off a timeline and the TRUE step metadata
// (`truth[iid][stepIndex]`). A dish takes the stations its step names when the step starts,
// keeps them until its next step starts, and lets go at the end of its last step or of a
// step the recipe says can wait off the heat (`maxPause`). A step's second pan (`also`) is a
// second span; a dish never needs more pans than the kitchen has, so its own count is clamped.
// Returns { station: [{iid,from,to}] }.
function occupancy(timeline, truth, kitchen = BS_KITCHEN_DEFAULT) {
  const byDish = new Map();
  for (const e of timeline) {
    if (!byDish.has(e.iid)) byDish.set(e.iid, []);
    byDish.get(e.iid).push(e);
  }
  const spans = { stove: [], oven: [] };
  for (const [iid, evs] of byDish) {
    evs.sort((a, b) => a.stepIndex - b.stepIndex);
    evs.forEach((e, k) => {
      const m = truth[iid][e.stepIndex];
      const next = evs[k + 1];
      const released = !next || (m && typeof m.maxPause === 'number' && m.maxPause > 0);
      const to = released ? e.at + stepMin(e) : next.at;
      const need = heatOf(m);
      for (const s of new Set(need)) {
        const pans = Math.min(need.filter((x) => x === s).length, kitchen[s] || 1);
        for (let j = 0; j < pans; j++) spans[s].push({ iid, from: e.at, to });
      }
    });
  }
  return spans;
}

// The most pans any station carries at once, sampling only where occupancy can rise.
const peak = (spans) => {
  let most = 0;
  for (const p of spans) {
    const at = spans.reduce((n, q) => n + (q.from <= p.from && p.from < q.to - 1e-9 ? 1 : 0), 0);
    most = Math.max(most, at);
  }
  return most;
};

const truthFor = (input) => input.map((r) => r.stepMeta);
const plans = (input, kitchen) => ({
  together: bsOrchestrate(input, { mode: BS_COOK_MODE.TOGETHER, kitchen }),
  auto: bsOrchestrate(input, { mode: BS_COOK_MODE.AUTO, kitchen }),
  serve: bsOrchestrate(input, { mode: BS_COOK_MODE.SERVE, kitchen }),
  serveLater: bsOrchestrate(input, { mode: BS_COOK_MODE.SERVE, kitchen, serveAt: 75 }),
  sequence: bsOrchestrate(input, { mode: BS_COOK_MODE.SEQUENCE, kitchen }),
});

test('one burner: the hash and the chicken never share the stove, in any mode', () => {
  const input = inputFor(PAIR);
  const truth = truthFor(input);
  const kitchen = { ...BS_KITCHEN_DEFAULT };
  assert.equal(kitchen.stove, 1, 'this is the one-burner kitchen the app plans with by default');
  for (const [mode, plan] of Object.entries(plans(input, kitchen))) {
    assert.ok(plan.timeline.length === input.reduce((n, r) => n + r.steps.length, 0), `${mode}: every step is scheduled`);
    const spans = occupancy(plan.timeline, truth);
    assert.ok(spans.stove.length > 0, `${mode}: the stove is used at all, or this check measures nothing`);
    assert.ok(peak(spans.stove) <= 1, `${mode}: two pans on the one burner — ${JSON.stringify(spans.stove)}`);
    assert.ok(peak(spans.oven) <= 1, `${mode}: two dishes in the one oven`);
  }
});

test('one burner: the chicken leaves the burner before the hash goes on it', () => {
  // The collision the "during the step" rule would have moved to minute 30, pinned by name.
  const input = inputFor(PAIR);
  const plan = bsOrchestrate(input, { mode: BS_COOK_MODE.TOGETHER, kitchen: BS_KITCHEN_DEFAULT });
  const at = (title, step) => plan.timeline.find((e) => e.title === title && e.stepIndex === step).at;
  const chickenOff = at('One-pan chicken and rice', 5);          // "rest off the heat"
  const hashOn = at('Steak and sweet potato hash', 1);           // "Heat the oil in a skillet"
  assert.ok(hashOn >= chickenOff, `the hash skillet goes on at ${hashOn}, but the chicken only comes off at ${chickenOff}`);
});

test('the check can fail: the pre-fix plan put two pans on the one burner', () => {
  // Plan with the metadata as it stood before hands-on steps claimed their burner (windows
  // only), then read where the food really was. Without this, a checker that never fires
  // would pass every assertion above.
  const input = inputFor(PAIR);
  const truth = truthFor(input);
  const windowsOnly = inputFor(PAIR, (c) => c.stepMeta.map((m) => (m && m.passive ? m : null)));
  const plan = bsOrchestrate(windowsOnly, { mode: BS_COOK_MODE.TOGETHER, kitchen: BS_KITCHEN_DEFAULT });
  assert.ok(peak(occupancy(plan.timeline, truth).stove) >= 2, 'the old plan should overlap on the stove');
});

test('four burners: the pair plans exactly as before (together 33, one after another 51)', () => {
  const input = inputFor(PAIR);
  const kitchen = { stove: 4, oven: 1, board: 1 };
  const span = (o) => Math.max(...o.timeline.map((e) => e.at + stepMin(e)));
  const together = bsOrchestrate(input, { mode: BS_COOK_MODE.TOGETHER, kitchen });
  const sequence = bsOrchestrate(input, { mode: BS_COOK_MODE.SEQUENCE, kitchen });
  assert.equal(together.serial, false, 'on four burners the two dishes still overlap');
  assert.equal(span(together), 33);
  assert.equal(span(sequence), 51);
});

// ── The engine's own rules, each on a fixture small enough to read ──────────────────────
const H = (station, extra = {}) => ({ min: null, passive: false, station, ...extra });
const W = (min, station, extra = {}) => ({ min, passive: true, station, ...extra });
const dish = (key, steps) => ({ key, title: key, steps: steps.map(([t]) => t), stepMeta: steps.map(([, m]) => m) });
const find = (plan, title, step) => plan.timeline.find((e) => e.title === title && e.stepIndex === step);
const withinCapacity = (plan, set, kitchen) => {
  const spans = occupancy(plan.timeline, set.map((r) => r.stepMeta), kitchen);
  return peak(spans.stove) <= kitchen.stove && peak(spans.oven) <= kitchen.oven;
};

test('a second pan counts: two burners held by one step leave no room on a two-burner hob', () => {
  const pasta = dish('Pasta', [['Boil the pasta and simmer the sauce 12 minutes.', W(12, 'stove', { also: ['stove'] })], ['Toss and serve.', H(null)]]);
  const rice = dish('Rice', [['Chop the veg.', H('board')], ['Fry the rice.', H('stove')], ['Serve.', H(null)]]);
  const two = { stove: 2, oven: 1, board: 1 };
  const onTwo = bsOrchestrate([pasta, rice], { mode: BS_COOK_MODE.TOGETHER, kitchen: two });
  assert.ok(find(onTwo, 'Rice', 1).at >= find(onTwo, 'Pasta', 1).at,
    'with both burners under the pasta, the rice fries only once the pasta comes off');
  assert.ok(withinCapacity(onTwo, [pasta, rice], two));
  // A third burner is room for the rice while both pasta pans cook: the claim is about capacity.
  const three = { stove: 3, oven: 1, board: 1 };
  const onThree = bsOrchestrate([pasta, rice], { mode: BS_COOK_MODE.TOGETHER, kitchen: three });
  assert.ok(find(onThree, 'Rice', 1).at < find(onThree, 'Pasta', 1).at, 'three burners fit all three pans at once');
  // And the planner's own reading of the step carries the second pan onto the timeline.
  assert.deepEqual(find(onTwo, 'Pasta', 0).also, ['stove']);
});

test('the second pan survives the recipe adapter, and junk in it does not', () => {
  const r = { title: 'Adapter probe', ingredients: [], steps: ['Boil and simmer.', 'Toss.'],
    stepMeta: [{ passive: false, station: 'stove', also: ['stove', 'board', 'microwave', 'oven'] }, null] };
  const c = bsCookableFromRecipe(r);
  assert.deepEqual(c.stepMeta[0].also, ['stove', 'oven'], 'only burners and the oven can be held');
  assert.equal(c.stepMeta[1].also, undefined, 'a step with no second pan carries no `also` at all');
});

test('a step the recipe lets wait off the heat gives its burner back when it ends', () => {
  // The seared steak may sit off the heat for up to 10 minutes: its burner is free for the
  // potatoes straight away, without waiting for the steak's next step.
  const steak = dish('Steak', [['Sear, then off the heat.', H('stove', { maxPause: 10 })], ['Rest 8 minutes.', W(8, 'off')], ['Slice.', H('board')]]);
  const spuds = dish('Potatoes', [['Soak 10 minutes.', W(10, 'off')], ['Fry the potatoes.', H('stove')], ['Serve.', H(null)]]);
  const plan = bsOrchestrate([steak, spuds], { mode: BS_COOK_MODE.TOGETHER, kitchen: BS_KITCHEN_DEFAULT });
  assert.equal(plan.timeline.length, 6);
  assert.ok(withinCapacity(plan, [steak, spuds], BS_KITCHEN_DEFAULT));
});

test('two dishes each waiting on the other\'s station fall back to one at a time, never a stuck plan', () => {
  // The duck's pan is on the only burner waiting for the oven; the potatoes are in the only oven
  // waiting for the burner. A cook would take one off the heat; the planner does not invent that.
  const duck = dish('Duck', [['Sear the duck.', H('stove')], ['Finish in the oven 8 minutes.', W(8, 'oven')], ['Plate.', H(null)]]);
  const spuds = dish('Potatoes', [['Roast 10 minutes.', W(10, 'oven')], ['Crisp on the hob.', H('stove')], ['Serve.', H(null)]]);
  for (const mode of [BS_COOK_MODE.TOGETHER, BS_COOK_MODE.AUTO]) {
    const plan = bsOrchestrate([duck, spuds], { mode, kitchen: BS_KITCHEN_DEFAULT });
    assert.equal(plan.timeline.length, 6, `${mode}: every step is still planned`);
    assert.equal(plan.serial, true, `${mode}: one dish at a time`);
    assert.equal(plan.reason, 'stations', `${mode}: and it says the kitchen is why`);
    assert.ok(withinCapacity(plan, [duck, spuds], BS_KITCHEN_DEFAULT), `${mode}: within capacity`);
  }
});

test('serve mode counts every pan a step keeps on the heat', () => {
  const pasta = dish('Pasta', [['Boil the pasta and fry the garlic.', H('stove', { also: ['stove'] })], ['Toss.', H(null)]]);
  const eggs = dish('Eggs', [['Fry the eggs.', H('stove')], ['Serve.', H(null)]]);
  const two = { stove: 2, oven: 1, board: 1 };
  for (const serveAt of [undefined, 30]) {
    const plan = bsOrchestrate([pasta, eggs], { mode: BS_COOK_MODE.SERVE, kitchen: two, serveAt });
    assert.equal(plan.timeline.length, 4);
    assert.ok(withinCapacity(plan, [pasta, eggs], two), `serve at ${serveAt}: three pans on a two-burner hob`);
  }
});

test('the live board gate counts every station a step needs, and every pan a running timer holds', () => {
  const now = 1_000_000;
  const two = { stove: 2, oven: 1, board: 1 };
  const timer = { iid: 1, recipeStep: 0, station: 'stove', endsAt: now + 600000 };
  const needsTwo = { iid: 0, stepIndex: 0, station: 'stove', also: ['stove'] };
  const needsOne = { iid: 0, stepIndex: 0, station: 'stove' };
  assert.equal(bsCookBlockingHold(needsTwo, [timer], now, two), timer, 'one pan on a two-burner hob leaves room for one, not two');
  assert.equal(bsCookBlockingHold(needsOne, [timer], now, two), null);
  assert.equal(bsCookBlockingHold(needsOne, [{ ...timer, also: ['stove'] }], now, two)?.iid, 1,
    'a timer holding two pans fills both burners');
  assert.equal(bsCookBlockingHold({ iid: 0, stepIndex: 0, station: 'board', also: ['oven'] },
    [{ iid: 2, recipeStep: 0, station: 'oven', endsAt: now + 1000 }], now, two)?.iid, 2, 'the second station is gated too');
});

test('live replan: a pan left on the burner by the last finished step keeps it until that dish moves on', () => {
  // The cook seared A and is ahead of schedule. Replanning towards the same serve time pushes A's
  // next step later -- and A's pan is still on the only burner in between. B must not fry there.
  const ev = (iid, title, stepIndex, at, station) => ({ recipe: title, iid, title, stepIndex, text: `${title} ${stepIndex}`, at, min: null, passive: false, station });
  const timeline = [ev(0, 'A', 0, 0, 'stove'), ev(0, 'A', 1, 3, 'stove'), ev(0, 'A', 2, 6, null), ev(1, 'B', 0, 9, 'stove'), ev(1, 'B', 1, 12, null)];
  const anchor = 1_000_000;
  const truth = [[H('stove'), H('stove'), H(null)], [H('stove'), H(null)]];
  const replan = (tl) => bsReplanCook(tl, 1, [], anchor, anchor + 3 * 60000, BS_KITCHEN_DEFAULT, anchor + 30 * 60000);
  const kept = replan(timeline);
  assert.equal(kept.timeline.length, 5);
  assert.ok(peak(occupancy(kept.timeline, truth).stove) <= 1, `two pans on the one burner: ${JSON.stringify(kept.timeline.map((e) => [e.title, e.stepIndex, e.at]))}`);
  // The check can fail: without knowing the seared pan is still there, B fries on top of it.
  const forgot = replan(timeline.map((e, i) => (i === 0 ? { ...e, station: null } : e)));
  assert.ok(peak(occupancy(forgot.timeline, truth).stove) >= 2, 'without the carried pan the replan double-books');
});

test('every catalog pair, every mode, on the one-burner kitchen: never two pans on a burner or two dishes in the oven', () => {
  // The rule checked where it is used, not on a hand-picked pair: 4,950 pairs, three modes. Before
  // hands-on steps claimed their station, 2,067 pairs double-booked in "cook at the same time".
  const all = SHAPE_KITCHEN_RECIPES.map((r) => {
    const c = bsCookableFromRecipe(r);
    return { key: 'catalog-' + bsCookSlug(r.title), title: c.title, steps: c.steps, stepMeta: c.stepMeta };
  });
  const kitchen = { ...BS_KITCHEN_DEFAULT };
  const span = (p) => Math.max(...p.timeline.map((e) => e.at + stepMin(e)));
  const bad = [];
  let pairs = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    pairs++;
    const set = [all[i], all[j]];
    const steps = set.reduce((n, r) => n + r.steps.length, 0);
    const sequence = bsOrchestrate(set, { mode: BS_COOK_MODE.SEQUENCE, kitchen });
    for (const mode of [BS_COOK_MODE.TOGETHER, BS_COOK_MODE.AUTO, BS_COOK_MODE.SERVE]) {
      const plan = bsOrchestrate(set, { mode, kitchen });
      if (plan.timeline.length !== steps) { bad.push(`${mode} ${set[0].title} + ${set[1].title}: ${plan.timeline.length} of ${steps} steps`); continue; }
      if (!withinCapacity(plan, set, kitchen)) bad.push(`${mode} ${set[0].title} + ${set[1].title}`);
      if (mode === BS_COOK_MODE.TOGETHER && span(plan) > span(sequence)) bad.push(`together runs longer than one after another: ${set[0].title} + ${set[1].title}`);
    }
  }
  assert.equal(pairs, 4950, 'the whole catalog, paired');
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} plan(s) break the kitchen`);
});
