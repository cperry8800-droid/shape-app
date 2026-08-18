import test from 'node:test';
import assert from 'node:assert/strict';
import { bsStepGist, bsStepGists, bsStepTimers } from '../mobile-app/src/services/cookable.mjs';

// WHY THIS FILE EXISTS.
//
// Five review rounds found five defects in the timer label, and every one of
// them lived in a step that states SEVERAL durations. The shipped catalogue
// contains ZERO such steps -- so the 198-step catalogue sweep that "verified"
// each fix was structurally incapable of observing any of them, and kept
// reporting a clean result while the class stayed broken. Four consecutive
// rounds were regressions introduced by the previous fix.
//
// A denominator that cannot contain the defect is not evidence. This file
// GENERATES the shape the catalogue lacks: every ordered pair of timed actions,
// joined every way a coach might join them, plus three-timer steps. It asserts
// the invariants rather than pinning the last bug found, so it can fail on a
// defect nobody has seen yet -- which is the whole point.

const ACTIONS = [
  { lead: 'Boil the rice',        dur: '10 minutes', tail: 'until tender',             want: 'jasmine rice' },
  { lead: 'Sear the chicken',     dur: '3 minutes',  tail: 'until browned',            want: 'chicken thigh' },
  { lead: 'Toast the sesame oil', dur: '2 minutes',  tail: 'until fragrant',           want: 'sesame oil' },
  { lead: 'Simmer',               dur: '15 minutes', tail: 'until the lentils soften', want: 'brown lentils' },
  { lead: 'Rest',                 dur: '5 minutes',  tail: 'before slicing',           want: 'rest' },
];
const INGS = ['jasmine rice', 'chicken thigh', 'sesame oil', 'brown lentils'];
// Every join a coach actually writes -- including the BARE "then" with no comma
// (which broke the lead boundary) and the temporal conjunctions a later round
// found reaching back across the join into the previous action's words.
const JOINS = [', then ', ' then ', '; ', '. ', ', and then ', ', ',
  ' while ', ' before you ', '; meanwhile ', ' as ', ' after '];
// ⚠ A bare "and" is NOT in that list, and that is a measured decision, not an
// oversight. Recipe prose overwhelmingly uses it WITHIN one action ("add the
// garlic and cook 5 minutes"); cutting there changes 41 of 96 catalogue labels
// and nearly all get worse -- "shrimp"->"cook", "bok choy"->"steam", "chicken
// breast"->"marinate". So when a coach joins two TIMED actions with a bare "and"
// AND the second names no ingredient of its own, its verb can still come from
// the first action. The ingredient case -- the one that actually misnames food --
// is fixed, by text order, and is asserted below in every join including "and".

// The label for timer `idx` of `step`, addressed the way the UI addresses it.
const labelFor = (step, idx) => {
  const tms = bsStepTimers(step);
  const tm = tms[idx];
  const nth = tms.slice(0, idx).filter((x) => x.seconds === tm.seconds).length;
  return { label: bsStepGist(step, INGS, tm.seconds, nth), count: tms.length };
};

const assertWellFormed = (label, where) => {
  assert.ok(label, `${where}: label is empty`);
  assert.ok(label.split(' ').length <= 2, `${where}: "${label}" is more than two words`);
  assert.doesNotMatch(label, /[.,;:!?\d]/, `${where}: "${label}" carries punctuation or a digit`);
};

test('SWEEP: every two-timer step labels each timer with its OWN action', () => {
  let checked = 0;
  for (const a of ACTIONS) {
    for (const b of ACTIONS) {
      if (a === b) continue;
      for (const join of JOINS) {
        const step = `${a.lead} ${a.dur} ${a.tail}${join}${b.lead.charAt(0).toLowerCase()}${b.lead.slice(1)} ${b.dur} ${b.tail}.`;
        const where = `[${join.trim() || 'space'}] ${step}`;
        const first = labelFor(step, 0);
        if (first.count < 2) continue; // not a multi-timer shape; nothing to assert
        const second = labelFor(step, 1);
        assertWellFormed(first.label, where);
        assertWellFormed(second.label, where);
        // Rule 1 — never name the WRONG food. This is the failure the label exists
        // to prevent: a cook reading the previous action's ingredient off this timer.
        assert.equal(first.label, a.want, `${where}: first timer`);
        assert.equal(second.label, b.want, `${where}: second timer`);
        // Rule 3 — two timers on one step must never be indistinguishable.
        assert.notEqual(first.label, second.label, `${where}: both timers read alike`);
        checked += 2;
      }
    }
  }
  assert.ok(checked >= 200, `expected a broad sweep, only checked ${checked}`);
});

test('SWEEP: three timers on one step stay distinct and correct', () => {
  const [a, b, c] = ACTIONS;
  for (const join of JOINS) {
    const step = `${a.lead} ${a.dur}${join}${b.lead.toLowerCase()} ${b.dur}${join}${c.lead.toLowerCase()} ${c.dur}.`;
    if (bsStepTimers(step).length < 3) continue;
    const got = [0, 1, 2].map((i) => labelFor(step, i).label);
    got.forEach((g) => assertWellFormed(g, step));
    assert.deepEqual(got, [a.want, b.want, c.want], `[${join.trim() || 'space'}] ${step}`);
    assert.equal(new Set(got).size, 3, `${step}: labels collide`);
  }
});

test('REGRESSION: the boundary is cut on BOTH sides of the number', () => {
  // Shipped once cutting only the TAIL: the rest timer took the food out of the
  // PREVIOUS action, and the two timers on the step then read identically.
  const step = 'Simmer 15 minutes until the lentils soften then rest 5 minutes before slicing.';
  assert.equal(bsStepGist(step, INGS, 900, 0), 'brown lentils');
  assert.equal(bsStepGist(step, INGS, 300, 0), 'rest');
});

test('THE ROOT CAUSE: reordering the ingredient LIST cannot move a label', () => {
  // The defect this property exists to catch: bsStepIngredients returns matches
  // in RECIPE order and the label used to take [0], so the ingredient list --
  // not the step's words -- decided which timer got which food. "Bake the salmon
  // 12 minutes while the pearl couscous cooks 10 minutes" labelled the SALMON
  // timer "pearl couscous", and reordering the list moved it. A label read from
  // the recipe's own words is invariant under that reordering; one read from the
  // list is not. This holds for EVERY join, bare "and" included.
  const reversed = [...INGS].reverse();
  for (const a of ACTIONS) {
    for (const b of ACTIONS) {
      if (a === b) continue;
      for (const join of [...JOINS, ' and ']) {
        const step = `${a.lead} ${a.dur} ${a.tail}${join}${b.lead.charAt(0).toLowerCase()}${b.lead.slice(1)} ${b.dur} ${b.tail}.`;
        if (bsStepTimers(step).length < 2) continue;
        assert.deepEqual(bsStepGists(step, INGS), bsStepGists(step, reversed), `[${join.trim() || 'space'}] ${step}`);
      }
    }
  }
});

test('THE POINT: a step never renders two identical timer rows', () => {
  // Uniqueness is a property of the SET, so it can only be decided where all of
  // a step's timers are visible at once -- bsStepGists, not bsStepGist. Labelled
  // one at a time, a step that sears the same food twice produced two identical
  // rows, which is the exact state this feature exists to end.
  const cases = [
    ['Sear the pork chops 4 minutes then flip and sear 4 minutes more.', ['pork chop, bone-in']],
    ['Sear the chicken 2 minutes then flip and sear the chicken 2 minutes.', ['chicken thigh']],
    ['Simmer the sauce 12 minutes; meanwhile simmer the beans 12 minutes.', ['white beans', 'tomato sauce']],
    ['Toast the sesame seeds 3 minutes, cool 5 minutes, then grind the sesame seeds 2 minutes.', ['sesame seeds']],
    ['Let the dough rise 30 minutes, fold it over, rise 30 minutes, fold again, then rise 30 minutes more.', ['bread flour']],
  ];
  for (const [step, ings] of cases) {
    const tms = bsStepTimers(step);
    // What the row actually shows: the gist, or the duration when there is none.
    const rows = bsStepGists(step, ings).map((g, i) => g || tms[i].label);
    assert.equal(new Set(rows).size, rows.length, `${step} -> ${JSON.stringify(rows)}`);
  }
});

test('the honest floor: a step that repeats ITSELF has nothing to tell apart', () => {
  // Not a defect to fix by inventing words. The label is drawn from the recipe's
  // own words, so when the recipe says the same thing three times with nothing
  // between, there is nothing to draw on -- and the rows are then exactly as
  // informative as they were before this feature existed. Pinned so that a
  // future change here is a DECISION, not an accident.
  const step = 'Rest the dough 30 minutes, rest 30 minutes, then rest 30 minutes more.';
  const tms = bsStepTimers(step);
  const rows = bsStepGists(step, []).map((g, i) => g || tms[i].label);
  assert.equal(rows[0], 'rest');
  assert.ok(new Set(rows).size < rows.length, 'expected the known collision');
});

// ── The gap that let a wrong label through a PASSING property test ──────────
//
// Every ACTION above names exactly one ingredient, so "wrong food" and "food
// from the other action" were the same assertion. Codex found the case that
// splits them: when the FIRST action's trailing context names a SECOND
// ingredient, the next timer's lead region can reach back and take it.
//
//   "Simmer the tomato sauce 10 minutes until the carrots soften
//    and toast the rice 2 minutes"   ->  ['tomato sauce', 'carrots']
//
// ⚠ The reorder-invariance property PASSED on that input -- both orderings
// returned "carrots". Invariance proves the label is not decided by the
// ingredient list; it does NOT prove the label is right. A property test can be
// green on a wrong answer that is merely consistent, and this one was.
const PAIRS = [
  { lead: 'Simmer the tomato sauce', dur: '10 minutes', tail: 'until the carrots soften',  want: 'tomato sauce' },
  { lead: 'Boil the rice',           dur: '8 minutes',  tail: 'until the peas are bright', want: 'jasmine rice' },
  { lead: 'Sear the chicken',        dur: '3 minutes',  tail: 'until the onions colour',   want: 'chicken thigh' },
  { lead: 'Toast the sesame oil',    dur: '2 minutes',  tail: 'until fragrant',            want: 'sesame oil' },
  { lead: 'Rest',                    dur: '5 minutes',  tail: 'before slicing',            want: 'rest' },
];
const PAIR_INGS = ['tomato sauce', 'carrots', 'jasmine rice', 'peas', 'chicken thigh', 'onions', 'sesame oil'];

test('a first action naming TWO foods cannot lend one to the next timer', () => {
  const reversed = [...PAIR_INGS].reverse();
  let checked = 0;
  for (const a of PAIRS) {
    for (const b of PAIRS) {
      if (a === b) continue;
      // Bare " and " included: it is action-level HERE (between two stated
      // durations) even though it stays intra-action before the first one.
      for (const join of [...JOINS, ' and ', ' and then ']) {
        const step = `${a.lead} ${a.dur} ${a.tail}${join}${b.lead.charAt(0).toLowerCase()}${b.lead.slice(1)} ${b.dur} ${b.tail}.`;
        const tms = bsStepTimers(step);
        if (tms.length < 2) continue;
        const got = bsStepGists(step, PAIR_INGS);
        assert.deepEqual(got, bsStepGists(step, reversed), `list order moved a label: ${step}`);
        assert.deepEqual(got, [a.want, b.want], `[${join.trim() || 'space'}] ${step}`);
        const rows = got.map((g, i) => g || tms[i].label);
        assert.equal(new Set(rows).size, rows.length, `${step} -> ${JSON.stringify(rows)}`);
        checked += 2;
      }
    }
  }
  assert.ok(checked >= 400, `expected a broad sweep, only checked ${checked}`);
});

test('a bare "and" BEFORE the first duration stays inside one action', () => {
  // The other half of the same rule, and the reason it keys on position rather
  // than cutting everywhere: recipe prose overwhelmingly writes "add X and cook
  // 5 minutes" as ONE action. Cutting a bare "and" globally moved 41 of 96
  // catalogue labels and nearly all got worse.
  const ings = ['chickpeas, drained', 'coconut milk'];
  const step = 'Add the chickpeas and coconut milk, bring to a simmer, and cook 15 minutes uncovered until the sauce coats a spoon and the chickpeas have softened.';
  assert.deepEqual(bsStepGists(step, ings), ['chickpeas']);
  assert.equal(bsStepGist('Soften the diced onion and garlic in olive oil over medium heat for 5 minutes.', ['yellow onion', 'garlic'], 300, 0), 'yellow onion');
});

// ── Round 8: which conjunction OPENS the clause decides whose food it is ────
//
// The rule these pin replaced "is there an earlier duration in this step",
// which only proved this was not the FIRST timer and truncated any later
// "add X and cook N minutes" to "cook".
test('an opening `until`/`while` clause belongs to the PREVIOUS action', () => {
  // Both name a food before the "and" that is NOT this timer's.
  assert.deepEqual(
    bsStepGists('Simmer the tomato sauce 10 minutes until the carrots soften and toast the rice 2 minutes',
      ['tomato sauce', 'carrots', 'jasmine rice']), ['tomato sauce', 'jasmine rice']);
  assert.deepEqual(
    bsStepGists('Simmer the tomato sauce 10 minutes until the carrots soften and rest 5 minutes before slicing.',
      ['tomato sauce', 'carrots']), ['tomato sauce', 'rest']);
});

test('an opening `before`/`after` clause is a NEW action and keeps its own food', () => {
  // ⚠ The mirror of the test above, and the reason the rule names `until`/`while`
  // rather than every subordinator. "before you fold in the baby spinach and cook
  // 3 minutes" is ONE action whose food sits before the "and" -- cutting there
  // labelled the spinach timer "cook".
  assert.deepEqual(
    bsStepGists('Simmer the brown lentils 20 minutes before you fold in the baby spinach and cook 3 minutes.',
      ['baby spinach', 'brown lentils']), ['brown lentils', 'baby spinach']);
});

test('an intra-action `and` survives an unrelated EARLIER timer on the step', () => {
  // The exact case that killed the previous rule: a first timer anywhere in the
  // step must not turn every later "and" into an action boundary.
  assert.deepEqual(
    bsStepGists('Toast the spices 1 minute. Add the chicken and cook 10 minutes.',
      ['mixed spices', 'chicken thigh']), ['toast', 'chicken thigh']);
});

test('a trailing condition still NAMES the food when no action follows it', () => {
  // `upto` is the next stated duration, so when it is the end of the step there
  // is no next action and a subordinate clause here is THIS timer's own context.
  // Cutting it unconditionally dropped the only food: "cook 5 minutes once the
  // chicken is added" labelled itself "cook".
  assert.deepEqual(bsStepGists('Cook 5 minutes once the chicken is added.', ['chicken thigh']), ['chicken thigh']);
  assert.deepEqual(bsStepGists('Roast 16 minutes until the chicken hits 165F.', ['chicken thigh']), ['chicken thigh']);
  // ...but when another timed action DOES follow, the same words are a boundary.
  assert.deepEqual(
    bsStepGists('Bake the salmon 12 minutes while the pearl couscous cooks 10 minutes.',
      ['pearl couscous', 'salmon fillet']), ['salmon fillet', 'pearl couscous']);
});
