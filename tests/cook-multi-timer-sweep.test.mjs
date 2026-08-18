import test from 'node:test';
import assert from 'node:assert/strict';
import { bsStepGist, bsStepTimers } from '../mobile-app/src/services/cookable.mjs';

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
// Every join a coach actually writes -- including the BARE "then" with no comma,
// which is the one that broke the lead boundary.
const JOINS = [', then ', ' then ', '; ', '. ', ', and then ', ', '];

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
