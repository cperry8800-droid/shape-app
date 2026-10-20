import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsGoalVerdict, bsGoalPct, bsGoalRemaining } from '../mobile-app/src/services/goalContract.mjs';

const base = { start: 86, now: 81.8, target: 78, unit: 'kg' };

test('no goal → set-the-terms lead', () => {
  const v = bsGoalVerdict({ start: 0, now: 0, target: 0, unit: 'kg', proj: null });
  assert.equal(v.lead, 'Set the terms.');
  assert.equal(v.tone, 'neutral');
  assert.match(v.sub, /start \+ target/i);
});

test('on-pace cut → moved + ETA lead, subline names the cut', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'on-pace', projectedLabel: 'Aug 12', slip: null } });
  assert.equal(v.lead, '4.2 kg down. Aug 12 at this pace.');
  assert.equal(v.tone, 'good');
  assert.equal(v.sub, 'CUT · 86 → 81.8 OF 78 kg · 53% THERE');
});

test('slipping on-pace → amber tone + slip named', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'on-pace', projectedLabel: 'Aug 19', slip: 9 } });
  assert.equal(v.tone, 'warn');
  assert.match(v.lead, /Aug 19/);
  assert.match(v.sub, /\+9D THIS WK$/);
});

test('stalled → bad tone', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'stalled' } });
  assert.equal(v.lead, '4.2 kg down. Pace has flattened.');
  assert.equal(v.tone, 'bad');
});

test('far → 1y+ lead, warn', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'far' } });
  assert.equal(v.lead, '4.2 kg down. Over a year at this pace.');
  assert.equal(v.tone, 'warn');
});

test('stale → refresh lead, warn', () => {
  const v = bsGoalVerdict({ ...base, proj: { state: 'stale' } });
  assert.equal(v.lead, '4.2 kg down. Log a weigh-in to update the read.');
  assert.equal(v.tone, 'warn');
});

test('achieved → done lead, good', () => {
  const v = bsGoalVerdict({ start: 86, now: 77.8, target: 78, unit: 'kg', proj: { state: 'achieved' } });
  assert.equal(v.lead, 'You did it. 78 kg.');
  assert.equal(v.tone, 'good');
});

test('no projection (fresh goal, <2 weigh-ins) → progress-only lead', () => {
  const v = bsGoalVerdict({ ...base, proj: null });
  assert.equal(v.lead, '4.2 kg down. 3.8 to go.');
  assert.equal(v.tone, 'neutral');
});

test('build direction reads "up" and BUILD', () => {
  const v = bsGoalVerdict({ start: 70, now: 72.5, target: 76, unit: 'kg', proj: { state: 'on-pace', projectedLabel: 'Sep 3', slip: null } });
  assert.equal(v.lead, '2.5 kg up. Sep 3 at this pace.');
  assert.match(v.sub, /^BUILD · 70 → 72\.5 OF 76 kg/);
});

test('zero movement never reads a signed zero', () => {
  const v = bsGoalVerdict({ start: 86, now: 86, target: 78, unit: 'kg', proj: null });
  assert.equal(v.lead, 'The terms are set. 8 kg to go.');
});

// The cover's progress bar (2026-10-20 redesign) reads bsGoalPct, and the verdict's
// "% THERE" reads it too, so the two can never be a point apart (the first cut of the
// bar computed in kilograms and read 27% under a 28% verdict).
test('bsGoalPct is the verdict\'s own "% there", cutting or building, clamped, null with no goal', () => {
  const pctOf = (v) => Number(/(\d+)% THERE/.exec(v.sub)[1]);
  for (const g of [base, { start: 177.3, now: 174.6, target: 167.6, unit: 'lb' }, { start: 60, now: 63.4, target: 66, unit: 'kg' }]) {
    assert.equal(bsGoalPct(g), pctOf(bsGoalVerdict({ ...g, proj: null })), JSON.stringify(g));
  }
  assert.equal(bsGoalPct({ start: 177.3, now: 174.6, target: 167.6 }), 28);
  assert.equal(bsGoalPct({ start: 86, now: 88, target: 78 }), 0, 'moving away reads 0, not negative');
  assert.equal(bsGoalPct({ start: 86, now: 76, target: 78 }), 100, 'past the target reads 100');
  assert.equal(bsGoalPct({ start: 0, now: 0, target: 0 }), null);
  assert.equal(bsGoalPct({ start: 80, now: 80, target: 80 }), null);
});

// The cover's "To go" (Codex on #2412): in the goal's direction, never below zero, so a target
// passed reads 0 beside a 100% bar, and a build's remaining amount is positive.
test('bsGoalRemaining is what is left in the goal\'s direction, 0 once the target is passed', () => {
  assert.equal(bsGoalRemaining({ start: 86, now: 77.8, target: 78 }), 0, 'past a cut\'s target');
  assert.equal(bsGoalPct({ start: 86, now: 77.8, target: 78 }), 100);
  assert.equal(bsGoalRemaining({ start: 177.3, now: 174.6, target: 167.6 }), 7);
  assert.equal(bsGoalRemaining({ start: 60, now: 63.4, target: 66 }), 2.6, 'a build reads positive');
  assert.equal(bsGoalRemaining({ start: 60, now: 66.5, target: 66 }), 0, 'past a build\'s target');
  assert.equal(bsGoalRemaining({ start: 86, now: 88, target: 78 }), 10, 'moving away reads the whole way');
  assert.equal(bsGoalRemaining({ start: 0, now: 0, target: 0 }), null);
});
