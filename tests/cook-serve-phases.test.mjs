import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, bsReplanCook } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsCookableFromRecipe } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const titles = ['Red lentil and spinach dahl', 'Black bean and sweet potato tacos', 'Shrimp and quinoa harvest bowl', 'Smoked salmon and avocado toast'];
const recipes = titles.map(title => ({ key: title, ...bsCookableFromRecipe(SHAPE_KITCHEN_RECIPES.find(r => r.title === title)) }));
const kitchen = { stove: 1, oven: 1, board: 1 };
const plan = bsOrchestrate(recipes, { mode: 'serve', serveAt: 70, kitchen });
const end = e => e.at + (e.min || 3);

function checkConstraints(timeline, capacities = kitchen) {
  for (const iid of new Set(timeline.map(e => e.iid))) {
    const steps = timeline.filter(e => e.iid === iid);
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1], next = steps[i];
      assert.equal(next.stepIndex, prev.stepIndex + 1);
      const gap = next.at - end(prev);
      assert.ok(gap >= -1e-7, 'a step started before its prerequisite finished');
      assert.ok(gap <= (prev.maxPause || 0) + 1e-7, 'an attended sequence or bounded pause was broken');
    }
  }
  for (const e of timeline) {
    const concurrent = timeline.filter(x => x.at <= e.at && e.at < end(x));
    assert.ok(concurrent.filter(x => !x.passive).length <= 1, 'the cook was double-booked');
    for (const station of ['stove', 'oven', 'board'])
      assert.ok(concurrent.filter(x => x.station === station).length <= capacities[station], `${station} over capacity`);
  }
}

test('the reported four dishes genuinely overlap, obey process constraints and finish closer together', () => {
  assert.equal(plan.coordinated, true);
  assert.equal(plan.timeline.length, recipes.reduce((n, r) => n + r.steps.length, 0));
  assert.equal(plan.estimated, false);
  assert.equal(plan.exact, false, 'bounded phase search must not claim a proven optimum');
  assert.ok(plan.spread < 15, `finishes are ${plan.spread} minutes apart instead of the reported 54`);
  assert.equal(Math.max(...plan.timeline.map(end)), 70);
  assert.equal(plan.ready.length, 4);
  checkConstraints(plan.timeline);
  for (const dish of plan.ready) {
    assert.ok(plan.timeline.some(e => e.iid !== dish.iid && e.at > dish.start && e.at < dish.readyAt), `${dish.title} has no other dish's work inside its process`);
  }
  const roast = plan.timeline.find(e => e.title === titles[1] && e.passive);
  assert.ok(plan.timeline.some(e => e.iid !== roast.iid && !e.passive && e.at >= roast.at && end(e) <= end(roast)), 'roasting should host other dishes');
});

test('a later serving time translates the same coordinated work, and separate remains sequential', () => {
  const later = bsOrchestrate(recipes, { mode: 'serve', serveAt: 130, kitchen });
  assert.deepEqual(later.timeline.map(e => ({ ...e, at: e.at - 60 })), plan.timeline);
  const separate = bsOrchestrate(recipes, { mode: 'sequence', kitchen });
  assert.equal(separate.serial, true);
  for (let i = 1; i < separate.timeline.length; i++) assert.ok(separate.timeline[i].at >= end(separate.timeline[i - 1]));
  assert.ok(end(separate.timeline.at(-1)) > plan.earliestServe);
});

test('windowless recipes are explicitly reported as uncoordinated', () => {
  const result = bsOrchestrate([{ key: 'a', steps: ['Chop', 'Plate'] }, { key: 'b', steps: ['Mix', 'Plate'] }], { mode: 'serve' });
  assert.equal(result.coordinated, false);
});

test('live Next/timer transitions preserve the coordinated plan instead of serializing it again', () => {
  let timeline = plan.timeline;
  const anchor = 1_000_000;
  const timers = [];
  for (let cursor = 0; cursor < timeline.length - 1; cursor++) {
    const event = timeline[cursor];
    const now = anchor + (event.passive ? event.at : end(event)) * 60000;
    if (event.passive) timers.push({ iid: event.iid, recipeStep: event.stepIndex, station: event.station, endsAt: anchor + end(event) * 60000 });
    const result = bsReplanCook(timeline, cursor + 1, timers, anchor, now, kitchen);
    assert.deepEqual(result.timeline.map(e => e.at), plan.timeline.map(e => e.at), `plan changed after ${event.title} step ${event.stepIndex}`);
    assert.deepEqual(result.pauseOverdue, []);
    timeline = result.timeline;
  }
  checkConstraints(timeline);
});

test('late progress retains the weave and reports an exceeded pause', () => {
  const events = [
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 0, text: 'Take off heat', at: 0, min: 1, station: 'stove', maxPause: 2 },
    { iid: 1, recipe: 'b', title: 'B', stepIndex: 0, text: 'Chop', at: 1, min: 2, station: 'board' },
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 1, text: 'Finish', at: 3, min: 1, station: 'stove' },
  ];
  const first = bsReplanCook(events, 1, [], 0, 60000, kitchen);
  const late = bsReplanCook(first.timeline, 2, [], 0, 10 * 60000, kitchen);
  assert.deepEqual(late.pauseOverdue, ['A']);
  assert.equal(late.timeline.at(-1).at, 10);
});
