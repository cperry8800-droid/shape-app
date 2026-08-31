import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsGoalVerdict } from '../mobile-app/src/services/goalContract.mjs';

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
