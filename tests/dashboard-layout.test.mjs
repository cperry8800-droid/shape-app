// Pure dashboard-layout logic: resolve a saved widget layout against the current
// widget set (robust to added/removed widgets) + reorder helpers. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout, moveKey, stepKey } from '../public/newdesign/dashboardLayout.mjs';

const ALL = ['a', 'b', 'c', 'd'];
const DEF = ['a', 'b', 'c', 'd'];

test('null saved → default order, nothing hidden', () => {
  assert.deepEqual(resolveLayout(null, ALL, DEF), { order: ['a', 'b', 'c', 'd'], hidden: [] });
});

test('respects saved order; appends a newly-added widget in default position', () => {
  const r = resolveLayout({ order: ['c', 'a', 'b'], hidden: [] }, ALL, DEF);
  assert.deepEqual(r.order, ['c', 'a', 'b', 'd']); // 'd' is new → appended
});

test('drops a removed widget from a stale saved order', () => {
  const r = resolveLayout({ order: ['b', 'z', 'a'], hidden: ['z'] }, ALL, DEF);
  assert.deepEqual(r.order, ['b', 'a', 'c', 'd']); // 'z' gone; c,d appended
  assert.deepEqual(r.hidden, []);                  // 'z' filtered from hidden too
});

test('hidden is intersected with existing keys', () => {
  const r = resolveLayout({ order: ['a', 'b', 'c', 'd'], hidden: ['c'] }, ALL, DEF);
  assert.deepEqual(r.hidden, ['c']);
});

test('moveKey inserts before the target; end when target absent; self is no-op', () => {
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveKey(['a', 'b', 'c', 'd'], 'a', null), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c']);
});

test('stepKey moves one slot and clamps at the ends', () => {
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']); // clamp
  assert.deepEqual(stepKey(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);  // clamp
});
