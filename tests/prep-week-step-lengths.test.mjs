// Prep the week's demo meals draw each step as long as it says, not the planner's assumed 3.
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
// them, through bsTimedStep, as `{ t, min, passive: false, station }`. Attended, so no dish is
// scheduled inside another's step. These tests hold the plan to the catalog's honesty rule
// (the minutes are the step's own), check that no timed meal step was missed, and drive the
// result through the planner and the tracks to the bar it draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { bsStepTimers, bsCookableFromMeal, BS_STATIONS } from '../mobile-app/src/services/cookable.mjs';
import { bsOrchestrate, BS_COOK_MODE } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsTrackLanes } from '../mobile-app/src/services/cookBoard.mjs';

const SRC = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
const React = createRequire(import.meta.url)('react');
const unquote = (lit) => lit.slice(1, -1).replace(/\\(['"\\])/g, '$1');
const LIT = String.raw`(['"])((?:\\.|(?!\1).)*)\1`;

// Every bsTimedStep call in the client: its text, minutes and station.
const timed = [...SRC.matchAll(new RegExp(String.raw`bsTimedStep\(${LIT}, (\d+), '(\w+)'\)`, 'g'))]
  .map((m) => ({ text: m[2].replace(/\\(['"\\])/g, '$1'), min: Number(m[3]), station: m[4] }));

// The demo meal plan: the `meals: [ … ]` lists inside the Eat page's MOCK_PROGRAM. A day's
// recipe card sits beside its meals, not in them, and is read-only (BSRecipePreview has no
// Cook door), so it is not here.
const mealLists = (() => {
  const start = SRC.indexOf('const MOCK_PROGRAM = React.useMemo(() => [\n    {\n      d: ');
  assert.ok(start > 0, 'the Eat page\'s demo program moved: point this test at it');
  const end = SRC.indexOf('\n  ], [t]);', start);
  const prog = SRC.slice(start, end);
  const out = [];
  for (let i = prog.indexOf('meals: ['); i >= 0; i = prog.indexOf('meals: [', i + 1)) {
    // Walk to the list's closing bracket, stepping over string literals.
    let depth = 0, j = i + 'meals: '.length;
    for (; j < prog.length; j++) {
      const ch = prog[j];
      if (ch === "'" || ch === '"' || ch === '`') { for (j++; j < prog.length && prog[j] !== ch; j++) if (prog[j] === '\\') j++; continue; }
      if (ch === '[') depth++;
      else if (ch === ']' && --depth === 0) break;
    }
    out.push(prog.slice(i, j + 1));
  }
  return out;
})();

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
  assert.ok(timed.length >= 20, `only ${timed.length} timed steps: the demo plan lost them`);
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

test('every demo meal step that states 4 minutes or more carries them', () => {
  assert.ok(mealLists.length >= 7, `${mealLists.length} days of meals found`);
  const missed = [];
  let seen = 0;
  for (const list of mealLists) {
    for (const block of list.matchAll(/steps: \[([\s\S]*?)\n\s*\],/g)) {
      for (const line of block[1].split('\n')) {
        const plain = line.match(new RegExp(String.raw`^\s*${LIT},?\s*$`));
        if (plain) {
          const t = unquote(`'${plain[2]}'`);
          if (statedTotal(t) >= 4 || bsStepTimers(t).some((x) => x.seconds >= 240)) missed.push(t.slice(0, 70));
        } else if (/^\s*bsTimedStep\(/.test(line)) seen++;
      }
    }
  }
  assert.deepEqual(missed, [], `${missed.length} demo meal step(s) state a time and still cost the planner's 3 minutes`);
  assert.equal(seen, timed.length, 'a bsTimedStep call outside the demo meals');
});

const { bsTimedStep } = await loadBroadsheet(['bsTimedStep'], React);

test('the planner charges a timed step its minutes, and the tracks draw it that long', () => {
  // The owner's beef bowl, as the demo plan writes it.
  const meal = {
    id: 'm17-ln', title: 'Beef + sweet potato bowl',
    steps: [
      'Heat the oven to 220°C / 425°F and toss the sweet potato cubes in oil and salt until every face is coated.',
      bsTimedStep('Roast 25 minutes on a single uncrowded layer, turning once, until the edges caramelise.', 25, 'oven'),
      'Meanwhile get a heavy pan properly hot, add the beef in one layer and leave it alone.',
      bsTimedStep('Break it up, stir in the cumin and paprika, and cook 6 minutes more until no pink remains.', 6, 'stove'),
    ],
  };
  const c = bsCookableFromMeal(meal, []);
  assert.deepEqual(c.steps.map((s) => s.slice(0, 5)), ['Heat ', 'Roast', 'Meanw', 'Break'], 'the step text survives as text');
  assert.deepEqual(c.stepMeta.map((m) => m.min), [null, 25, null, 6]);
  assert.deepEqual(c.stepMeta.map((m) => m.station), [null, 'oven', null, 'stove'], 'the oven or burner the planner keeps busy for the step');
  assert.ok(c.stepMeta.every((m) => m.passive === false), 'a timed demo step is attended, never a hands-off window');
  const { timeline } = bsOrchestrate([{ key: 'beef', title: c.title, steps: c.steps, stepMeta: c.stepMeta }], { mode: BS_COOK_MODE.SEQUENCE });
  const [lane] = bsTrackLanes(timeline, 0);
  assert.deepEqual(lane.blocks.map((b) => b.end - b.at), [3, 25, 3, 6], 'each bar\'s minutes: the stated ones, else the assumed 3');
});
