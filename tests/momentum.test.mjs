// Momentum meter: a 0–100 "don't break the streak" fold over an ordered day
// series. +7 per active day, −12 per missed day, clamped — a notch, not a reset.
// The SQL compute_momentum() mirrors this exactly. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMomentum, BONUS_THRESHOLD, momentumThresholdMet } from '../mobile-app/src/services/momentum.mjs';

test('consistent two weeks fills the meter', () => {
  assert.equal(computeMomentum(Array(14).fill(true)), 98); // 14 × 7 = 98, capped 100
});

test('a missed day knocks it down a notch, not a reset', () => {
  // 10 active (70) then 1 miss (-12 = 58) then 1 active (65)
  const days = [...Array(10).fill(true), false, true];
  assert.equal(computeMomentum(days), 65);
});

test('clamps to 0..100', () => {
  assert.equal(computeMomentum(Array(30).fill(true)), 100);
  assert.equal(computeMomentum(Array(5).fill(false)), 0);
});

test('empty / null series → 0', () => {
  assert.equal(computeMomentum([]), 0);
  assert.equal(computeMomentum(null), 0);
});

test('threshold helper', () => {
  assert.equal(momentumThresholdMet(BONUS_THRESHOLD), true);
  assert.equal(momentumThresholdMet(BONUS_THRESHOLD - 1), false);
});
