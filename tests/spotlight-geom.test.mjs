import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, cutoutRect, coachmarkPos, stepBounds } from '../public/newdesign/spotlightGeom.mjs';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('cutoutRect inflates the target by pad', () => {
  assert.deepEqual(cutoutRect({ x: 20, y: 30, w: 100, h: 40 }, 8), { x: 12, y: 22, w: 116, h: 56 });
});

test('cutoutRect never produces negative size', () => {
  const r = cutoutRect({ x: 0, y: 0, w: 0, h: 0 }, 8);
  assert.ok(r.w >= 0 && r.h >= 0);
});

test('coachmarkPos places the card below when there is room', () => {
  const target = { x: 100, y: 100, w: 80, h: 40 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.side, 'below');
  assert.equal(p.top, 154);               // 100 + 40 + 14
  assert.equal(p.left, clamp(140 - 140, 8, 390 - 280 - 8)); // centered on target, clamped
});

test('coachmarkPos flips above when the target is near the bottom', () => {
  const target = { x: 100, y: 740, w: 80, h: 40 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.side, 'above');
  assert.equal(p.top, clamp(740 - 14 - 140, 8, 800 - 140 - 8));
});

test('coachmarkPos clamps left edge into the root', () => {
  const target = { x: 0, y: 100, w: 30, h: 30 };
  const root = { x: 0, y: 0, w: 390, h: 800 };
  const p = coachmarkPos(target, root, { w: 280, h: 140 }, 14);
  assert.equal(p.left, 8);                // would be negative; clamped to 8
});

test('stepBounds reports first/last/back/next', () => {
  assert.deepEqual(stepBounds(0, 3), { isFirst: true, isLast: false, canBack: false, canNext: true });
  assert.deepEqual(stepBounds(1, 3), { isFirst: false, isLast: false, canBack: true, canNext: true });
  assert.deepEqual(stepBounds(2, 3), { isFirst: false, isLast: true, canBack: true, canNext: false });
});
