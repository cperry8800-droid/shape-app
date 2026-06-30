import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBands, computeRigParams } from '../public/newdesign/noraReactive.mjs';

test('computeBands: silence → all zero', () => {
  assert.deepEqual(computeBands(new Uint8Array(64)), { low: 0, mid: 0, high: 0, level: 0 });
});

test('computeBands: bass-only → high low-band, zero high-band', () => {
  const f = new Uint8Array(100);
  for (let i = 0; i < 10; i++) f[i] = 255;   // bottom 10% = low band
  const b = computeBands(f);
  assert.ok(b.low > 0.9, 'low near 1');
  assert.equal(b.high, 0, 'high is 0');
  assert.ok(b.level > 0 && b.level < 0.2, 'overall level small');
});

test('computeBands: empty input is safe', () => {
  assert.deepEqual(computeBands(new Uint8Array(0)), { low: 0, mid: 0, high: 0, level: 0 });
});

test('computeRigParams: outputs are bounded', () => {
  const p = computeRigParams({ low: 1, mid: 1, high: 1, level: 1 }, 0);
  assert.ok(p.headBob >= -0.5 && p.headBob <= 0.5);
  assert.ok(p.spineSway >= -0.4 && p.spineSway <= 0.4);
  assert.ok(p.armRaise >= 0 && p.armRaise <= 1);
  assert.ok(p.handBounce >= 0 && p.handBounce <= 1);
  assert.ok(p.expression >= 0 && p.expression <= 1);
});

test('computeRigParams: blink fires early in the 4s cycle, not mid-cycle', () => {
  assert.equal(computeRigParams({}, 50).blink, 1);
  assert.equal(computeRigParams({}, 500).blink, 0);
});

test('computeRigParams: null bands is safe', () => {
  assert.equal(typeof computeRigParams(null, 0).headBob, 'number');
});
