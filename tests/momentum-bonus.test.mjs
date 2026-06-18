// Momentum weekly-bonus escalation: +15 per consecutive prior bonus-week, capped at
// 100 (25 → 40 → 55 → 70 → 85 → 100). Mirrored in award_momentum_bonus(). Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { momentumBonus, BONUS_STEP, BONUS_MAX } from '../mobile-app/src/services/momentum.mjs';

test('first qualifying week pays the base 25', () => {
  assert.equal(momentumBonus(0), 25);
});

test('escalates +15 per consecutive prior week', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(momentumBonus), [25, 40, 55, 70, 85, 100]);
});

test('caps at 100', () => {
  assert.equal(momentumBonus(6), 100);
  assert.equal(momentumBonus(99), 100);
});

test('negative / junk streak floors at the base', () => {
  assert.equal(momentumBonus(-3), 25);
  assert.equal(momentumBonus(null), 25);
});

test('constants', () => {
  assert.equal(BONUS_STEP, 15);
  assert.equal(BONUS_MAX, 100);
});
