import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeStepsPoints } from '../mobile-app/src/services/shapeSteps.mjs';

test('no / non-positive steps score 0 (never a fabricated point)', () => {
  assert.deepEqual(shapeStepsPoints(0, 8000), { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 });
  assert.deepEqual(shapeStepsPoints(null, 8000), { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 });
  assert.deepEqual(shapeStepsPoints(-500, 8000), { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 });
  assert.deepEqual(shapeStepsPoints(NaN, 8000), { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 });
});

test('5,000 steps = 1 Shape Step = +1 (below goal, no bonus)', () => {
  assert.deepEqual(shapeStepsPoints(4999, 8000), { shapeSteps: 0, basePts: 0, bonus: 0, total: 0 });
  assert.deepEqual(shapeStepsPoints(5000, 8000), { shapeSteps: 1, basePts: 1, bonus: 0, total: 1 });
  assert.deepEqual(shapeStepsPoints(7000, 8000), { shapeSteps: 1, basePts: 1, bonus: 0, total: 1 });
});

test('hitting the goal adds the +3 bonus', () => {
  // 12,000 on an 8,000 goal → 2 Shape Steps (+2) + goal bonus (+3) = +5
  assert.deepEqual(shapeStepsPoints(12000, 8000), { shapeSteps: 2, basePts: 2, bonus: 3, total: 5 });
  // exactly at goal still earns the bonus
  assert.deepEqual(shapeStepsPoints(8000, 8000), { shapeSteps: 1, basePts: 1, bonus: 3, total: 4 });
});

test('anti-farm: counted steps cap at 20,000 (max 4 Shape Steps, +7 with bonus)', () => {
  assert.deepEqual(shapeStepsPoints(20000, 8000), { shapeSteps: 4, basePts: 4, bonus: 3, total: 7 });
  assert.deepEqual(shapeStepsPoints(50000, 8000), { shapeSteps: 4, basePts: 4, bonus: 3, total: 7 });
});

test('no/invalid goal → base points only, no bonus', () => {
  assert.deepEqual(shapeStepsPoints(12000, 0), { shapeSteps: 2, basePts: 2, bonus: 0, total: 2 });
  assert.deepEqual(shapeStepsPoints(12000, null), { shapeSteps: 2, basePts: 2, bonus: 0, total: 2 });
});
