// Weekly commitment "met" logic + stake clamp. Met = every specified target reached;
// omitted keys ignored; empty commitment never met. Mirrored in settle_commitment().
import test from 'node:test';
import assert from 'node:assert/strict';
import { commitmentMet, clampStake, STAKE_MIN, STAKE_MAX } from '../mobile-app/src/services/commitments.mjs';

test('all specified targets reached → met', () => {
  assert.equal(commitmentMet({ workouts: 4, checkin: true, habits: 5 }, { workouts: 4, checkin: true, habits: 7 }), true);
});

test('any specified target short → not met', () => {
  assert.equal(commitmentMet({ workouts: 4 }, { workouts: 3, checkin: false, habits: 0 }), false);
  assert.equal(commitmentMet({ checkin: true }, { workouts: 9, checkin: false, habits: 9 }), false);
  assert.equal(commitmentMet({ habits: 5 }, { workouts: 0, checkin: false, habits: 4 }), false);
});

test('omitted targets are ignored', () => {
  assert.equal(commitmentMet({ checkin: true }, { workouts: 0, checkin: true, habits: 0 }), true);
});

test('empty commitment is never met', () => {
  assert.equal(commitmentMet({}, { workouts: 9, checkin: true, habits: 9 }), false);
});

test('stake clamps to 5..50', () => {
  assert.equal(clampStake(0), 5);
  assert.equal(clampStake(3), 5);
  assert.equal(clampStake(999), 50);
  assert.equal(clampStake(20), 20);
  assert.equal(clampStake(22.6), 23);
  assert.equal(STAKE_MIN, 5);
  assert.equal(STAKE_MAX, 50);
});
