import test from 'node:test';
import assert from 'node:assert/strict';
import { bsOrchestrate, bsReplanCook, bsCookBlockingHold } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsBatchResume } from '../mobile-app/src/services/cookBatchResume.mjs';

const MIN = 60000;
const recipes = [
  { key: 'rice', title: 'Rice', steps: ['Prep', 'Simmer 20 min', 'Plate'], stepMeta: [{ min: 3, station: 'board' }, { min: 20, station: 'stove', passive: true }, { min: 1, station: 'board' }] },
  { key: 'greens', title: 'Greens', steps: ['Chop', 'Cook 5 min', 'Serve'], stepMeta: [{ min: 2, station: 'board' }, { min: 5, station: 'stove', passive: true }, { min: 1, station: 'board' }] },
];
const kitchen = { stove: 1, oven: 1, board: 1 };
const anchor = 1_000_000;

test('late rice keeps its real timer and unfinished steps move to an achievable serving plan', () => {
  const planned = bsOrchestrate(recipes, { mode: 'serve', kitchen });
  const simmer = planned.timeline.findIndex(e => e.recipe === 'rice' && e.stepIndex === 1);
  const now = anchor + (planned.timeline[simmer].at + 10) * MIN;
  const timer = { iid: planned.timeline[simmer].iid, recipeKey: 'rice', station: 'stove', recipeStep: 1, endsAt: now + 20 * MIN };
  const result = bsReplanCook(planned.timeline, simmer + 1, [timer], anchor, now, kitchen);
  assert.deepEqual(result.timeline.slice(0, simmer + 1), planned.timeline.slice(0, simmer + 1));
  const rest = result.timeline.slice(simmer + 1);
  assert.ok(rest.every(e => anchor + e.at * MIN >= now));
  assert.ok(rest.filter(e => e.recipe === 'rice' || e.station === 'stove').every(e => anchor + e.at * MIN >= timer.endsAt));
  assert.equal(rest.length, planned.timeline.length - simmer - 1);
  assert.ok(result.serveAt >= timer.endsAt);
  // Each remaining instance preserves its method order even if dishes reorder.
  for (const iid of new Set(rest.map(e => e.iid))) {
    const ids = rest.filter(e => e.iid === iid).map(e => e.stepIndex);
    assert.deepEqual(ids, [...ids].sort((a,b) => a-b));
  }
});

test('resource gates respect burner capacity, actual expiration, and soft timers', () => {
  const ev = { iid: 2, station: 'stove', stepIndex: 1 };
  const hold = { iid: 1, station: 'stove', endsAt: 100, title: 'Rice' };
  assert.equal(bsCookBlockingHold(ev, [hold], 50, { stove: 1 }), hold);
  assert.equal(bsCookBlockingHold(ev, [hold], 50, { stove: 2 }), null);
  assert.equal(bsCookBlockingHold(ev, [hold], 100, { stove: 1 }), null);
  assert.equal(bsCookBlockingHold(ev, [{...hold, soft:true}], 50, { stove: 1 }), null);
  assert.equal(bsCookBlockingHold({...ev, iid:1, station:'off'}, [hold], 50, kitchen), hold);
});

test('batch recovery retains deadlines overnight and rejects another account or corrupt step identity', () => {
  const timeline = bsOrchestrate(recipes, { mode: 'serve', kitchen }).timeline;
  const value = { version: 1, owner: 'a', savedAt: anchor, anchor, items: recipes.map(r => ({ key:r.key, cookable:r })), timeline, cursor:1,
    timers:[{id:1, iid:0, recipeKey:'rice', total:1200, endsAt:anchor+1200*1000}], started:['0:1'], recorded:[] };
  const resumed = bsBatchResume(value, 'a', anchor+30*MIN);
  assert.equal(resumed.timers[0].endsAt, value.timers[0].endsAt);
  assert.equal(bsBatchResume(value, 'b', anchor+MIN), null);
  assert.equal(bsBatchResume(value, 'a', anchor+25*60*MIN), null);
  assert.equal(bsBatchResume({...value, timeline:[{...timeline[0], text:'Changed method'}]}, 'a', anchor+MIN), null);
});
