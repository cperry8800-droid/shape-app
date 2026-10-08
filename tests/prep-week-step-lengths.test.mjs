// Prep the week's demo meals draw each step as long as it says, not the planner's assumed 3, and
// a walk-away step lets another dish cook during it.
//
// ⚠ THE DEFECT, REGISTERED BY #2256 AND #2263 AND SEEN IN THE OWNER'S OWN COOK. The demo meal
// plan's steps were plain strings, and a plain step has no length (cookable.mjs, plainStepMeta),
// so the planner charged every one its assumed 3 hands-on minutes (cookOrchestrator.mjs,
// stepCost). "Roast 25 minutes on a single uncrowded layer" was drawn as 3 minutes, and the
// owner's beef bowl, banana oats and cottage cheese read as fifteen identical bars.
//
// The planner deliberately does not read a duration out of a step's text at plan time (its
// stepCost note says why: "refrigerate up to 4 hours" in a smoothie, "one hour" spelled out),
// so the fix is data, as in the catalog: each demo step that states 4 minutes or more carries
// them, through bsTimedStep (attended) or bsHoldStep (hands-off: rice under its lid, a tray in
// the oven). #2270 carried the minutes; the holds came next, so the owner's three dishes can be
// cooked together. Which steps may be holds is the catalog's window rules' call, and
// tests/shape-kitchen-data.test.mjs runs them over these meals through the same reader. These
// tests hold the plan to the catalog's honesty rule (the minutes are the step's own), check that
// no timed meal step was missed, and drive the result through the planner and the tracks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { CLIENT_SRC, DEMO_MEALS } from './helpers/demo-meal-plan.mjs';
import { bsStepTimers, bsCookableFromMeal, BS_STATIONS } from '../mobile-app/src/services/cookable.mjs';
import { bsOrchestrate, BS_COOK_MODE } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsTrackLanes } from '../mobile-app/src/services/cookBoard.mjs';

const React = createRequire(import.meta.url)('react');

// Every timed step in the demo plan, attended or held, with the meal it belongs to.
const timed = DEMO_MEALS.flatMap((m) => m.steps.flatMap((text, i) => (m.stepMeta[i]
  ? [{ meal: m.id, text, ...m.stepMeta[i], call: m.calls[i] }]
  : [])));
const holds = timed.filter((s) => s.passive);

// A step's whole length as its text states it: the first duration (the low end of a range),
// twice over when it is timed per side ("4 minutes a side", "4 min/side"), since the step is
// both sides. ⚠ Codex, on the first head: the per-side steps carried one side, 4, so the plan
// and the ready time moved on after four minutes of an eight-minute sear.
const PER_SIDE = /\d+\s*(?:minutes?|mins?|hours?|hrs?)\s*(?:\/\s*|(?:a|each|per)\s+)side\b/i;
const statedTotal = (text) => {
  const first = bsStepTimers(text)[0];
  return first ? (first.seconds / 60) * (PER_SIDE.test(text) ? 2 : 1) : 0;
};

test('a timed demo step carries the minutes its own text states, the low end of a range, both sides of a per-side step', () => {
  assert.ok(timed.length >= 25, `only ${timed.length} timed steps: the demo plan lost them`);
  assert.equal(statedTotal('Give it 4 minutes a side without moving it.'), 8);
  assert.equal(statedTotal('Sear 4 min/side over medium-high.'), 8);
  assert.equal(statedTotal('Scatter the walnuts over the granola side, then rest 5 minutes.'), 5, 'a "side" that is not the duration\'s');
  for (const s of timed) {
    const first = bsStepTimers(s.text)[0];
    assert.ok(first, `no stated duration in "${s.text.slice(0, 50)}…"`);
    assert.equal(s.min, statedTotal(s.text), `"${s.text.slice(0, 50)}…" states ${first.label}${PER_SIDE.test(s.text) ? ' a side' : ''}, ${statedTotal(s.text)} min in all, not ${s.min}`);
    assert.ok(s.min >= 4, `"${s.text.slice(0, 50)}…": under 4 minutes the planner's 3 is close enough, and a shorter bar than the work`);
    assert.ok(BS_STATIONS.includes(s.station), `"${s.text.slice(0, 50)}…": station "${s.station}"`);
  }
});

test('a demo hold is one stated wait: never per side, and its own text states its minutes first', () => {
  assert.ok(holds.length >= 7, `${holds.length} demo holds`);
  for (const s of holds) {
    // Per side is a cook coming back to turn it: two steps, never one hold.
    assert.ok(!PER_SIDE.test(s.text), `${s.meal}: a per-side hold, "${s.text.slice(0, 50)}…"`);
    assert.equal(s.min, bsStepTimers(s.text)[0].seconds / 60, `${s.meal}: a hold is the first time its step states`);
    assert.equal(s.call, 'bsHoldStep');
  }
  // The roast the cook turns halfway is two holds, the turn opening the second.
  const beef = DEMO_MEALS.find((m) => m.id === 'm17-ln');
  assert.deepEqual(beef.stepMeta.map((m) => (m ? `${m.min}${m.passive ? 'h' : 'a'}` : '·')), ['·', '15h', '10h', '·', '6a', '·', '·']);
  assert.match(beef.steps[2], /^Turn the cubes and roast 10 minutes more/);
});

test('every demo meal step that states 4 minutes or more carries them', () => {
  assert.ok(DEMO_MEALS.length >= 25, `${DEMO_MEALS.length} demo meals found`);
  const missed = [];
  for (const m of DEMO_MEALS) {
    m.steps.forEach((t, i) => {
      if (m.stepMeta[i]) return;
      if (statedTotal(t) >= 4 || bsStepTimers(t).some((x) => x.seconds >= 240)) missed.push(`${m.id}: ${t.slice(0, 70)}`);
    });
  }
  assert.deepEqual(missed, [], `${missed.length} demo meal step(s) state a time and still cost the planner's 3 minutes`);
  // Every call in the client is one the reader found inside a demo meal: none sits elsewhere,
  // where no rule here would read it.
  const calls = (CLIENT_SRC.match(/^\s*bs(?:Timed|Hold)Step\(/gm) || []).length;
  assert.equal(calls, timed.length, 'a bsTimedStep or bsHoldStep call outside the demo meals');
});

const { bsTimedStep, bsHoldStep } = await loadBroadsheet(['bsTimedStep', 'bsHoldStep'], React);

// A demo meal as the Eat page hands it to Cook: each timed step rebuilt through the client's own
// helpers, then through the same adapter the cook screens use.
const cookOf = (id) => {
  const m = DEMO_MEALS.find((x) => x.id === id);
  assert.ok(m, `no demo meal ${id}`);
  const steps = m.steps.map((t, i) => {
    const x = m.stepMeta[i];
    return x ? (x.passive ? bsHoldStep : bsTimedStep)(t, x.min, x.station) : t;
  });
  const c = bsCookableFromMeal({ id: m.id, title: m.title, steps }, []);
  return { key: m.id, title: c.title, steps: c.steps, stepMeta: c.stepMeta };
};
const ends = (timeline) => Math.max(...bsTrackLanes(timeline, 0).map((l) => l.blocks.at(-1).end));

test('the client\'s helpers build the two shapes the planner reads', () => {
  assert.deepEqual(bsTimedStep('Cook 6 minutes more.', 6, 'stove'), { t: 'Cook 6 minutes more.', min: 6, passive: false, station: 'stove' });
  assert.deepEqual(bsHoldStep('Roast 15 minutes.', 15, 'oven'), { t: 'Roast 15 minutes.', min: 15, passive: true, station: 'oven' });
});

test('the planner charges a timed step its minutes, and the tracks draw it that long', () => {
  // The owner's beef bowl, as the demo plan writes it.
  const beef = cookOf('m17-ln');
  assert.deepEqual(beef.steps.map((s) => s.slice(0, 5)), ['Heat ', 'Roast', 'Turn ', 'Get a', 'Break', 'Warm ', 'Build'], 'the step text survives as text');
  assert.deepEqual(beef.stepMeta.map((m) => m.min), [null, 15, 10, null, 6, null, null]);
  assert.deepEqual(beef.stepMeta.map((m) => m.station), [null, 'oven', 'oven', null, 'stove', null, null], 'the oven or burner the planner keeps busy for the step');
  assert.deepEqual(beef.stepMeta.map((m) => m.passive), [false, true, true, false, false, false, false], 'the roast is the walk-away; the beef is watched');
  const { timeline } = bsOrchestrate([beef], { mode: BS_COOK_MODE.SEQUENCE });
  const [lane] = bsTrackLanes(timeline, 0);
  assert.deepEqual(lane.blocks.map((b) => b.end - b.at), [3, 15, 10, 3, 6, 3, 3], 'each bar\'s minutes: the stated ones, else the assumed 3');
});

test('the owner\'s three dishes cook together: the oats and the cottage cheese go in while the potatoes roast', () => {
  const rs = ['m17-bf', 'm17-ln', 'm17-sn'].map(cookOf);
  assert.deepEqual(rs.map((r) => r.title), ['Banana oats + peanut butter', 'Beef + sweet potato bowl', 'Cottage cheese + pineapple']);
  const together = bsOrchestrate(rs, { mode: BS_COOK_MODE.TOGETHER });
  const apart = bsOrchestrate(rs, { mode: BS_COOK_MODE.SEQUENCE });
  assert.equal(together.canInterleave, true, 'a hold is what lets the planner offer Together');
  assert.equal(together.serial, false);
  assert.equal(ends(apart.timeline), 72, 'one after another, as the kitchen screen offered before');
  assert.ok(ends(together.timeline) <= 50, `together ends at ${ends(together.timeline)} min`);
  // Every step of the other two dishes starts inside the roast's two holds.
  const roast = together.timeline.filter((e) => e.recipe === 'm17-ln' && e.passive);
  const from = roast[0].at;
  const to = roast.at(-1).at + roast.at(-1).min;
  const others = together.timeline.filter((e) => e.recipe !== 'm17-ln');
  assert.ok(others.length >= 9);
  assert.deepEqual(others.filter((e) => e.at < from || e.at >= to).map((e) => `${e.recipe} ${e.stepIndex}`), [],
    `the oats and the cottage cheese wait for the potatoes (roast ${from}–${to})`);
});
