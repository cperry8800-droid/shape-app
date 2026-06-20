// Pure GridStack dashboard-layout reconciliation: keep saved geometry, append new
// widgets (auto-positioned), drop stale ones, filter hidden. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGridLayout, widgetW } from '../public/newdesign/dashboardLayout.mjs';

const WIDGETS = [
  { key: 'a', size: 'full' },
  { key: 'b', size: 'half' },
  { key: 'c', size: 'half' },
];

test('widgetW maps size to a 12-col span', () => {
  assert.equal(widgetW('full'), 12);
  assert.equal(widgetW('half'), 6);
});

test('null saved → every widget visible, auto-positioned, width from size', () => {
  const r = resolveGridLayout(null, WIDGETS);
  assert.deepEqual(r.hidden, []);
  assert.deepEqual(r.visible, [
    { key: 'a', w: 12, autoPosition: true },
    { key: 'b', w: 6, autoPosition: true },
    { key: 'c', w: 6, autoPosition: true },
  ]);
});

test('saved geometry is preserved for known widgets', () => {
  const saved = { items: [{ id: 'b', x: 6, y: 0, w: 6, h: 4 }, { id: 'a', x: 0, y: 0, w: 6, h: 5 }], hidden: [] };
  const r = resolveGridLayout(saved, WIDGETS);
  // saved 'b' and 'a' keep their geometry; 'c' is new → appended auto-positioned
  assert.deepEqual(r.visible, [
    { key: 'b', x: 6, y: 0, w: 6, h: 4 },
    { key: 'a', x: 0, y: 0, w: 6, h: 5 },
    { key: 'c', w: 6, autoPosition: true },
  ]);
});

test('stale saved items (widget no longer exists) are dropped', () => {
  const saved = { items: [{ id: 'z', x: 0, y: 0, w: 12, h: 3 }, { id: 'a', x: 0, y: 0, w: 12, h: 4 }], hidden: ['z'] };
  const r = resolveGridLayout(saved, WIDGETS);
  assert.deepEqual(r.visible.map((v) => v.key), ['a', 'b', 'c']); // z gone; b,c appended
  assert.deepEqual(r.hidden, []); // z filtered from hidden too
});

test('hidden keys are filtered to existing + never appear in visible', () => {
  const saved = { items: [{ id: 'a', x: 0, y: 0, w: 12, h: 4 }], hidden: ['c', 'q'] };
  const r = resolveGridLayout(saved, WIDGETS);
  assert.deepEqual(r.hidden, ['c']);            // 'q' doesn't exist → dropped
  assert.ok(!r.visible.some((v) => v.key === 'c')); // hidden 'c' not visible
  assert.ok(r.visible.some((v) => v.key === 'b')); // 'b' new + not hidden → visible
});

test('duplicate keys in saved data are deduplicated (canonical arrays)', () => {
  const saved = {
    items: [
      { id: 'a', x: 0, y: 0, w: 12, h: 4 },
      { id: 'a', x: 6, y: 0, w: 6, h: 3 },   // duplicate id — first occurrence wins
    ],
    hidden: ['b', 'b', 'c'],                  // duplicate keys
  };
  const r = resolveGridLayout(saved, WIDGETS);
  const visibleKeys = r.visible.map((v) => v.key);
  assert.equal(visibleKeys.length, new Set(visibleKeys).size, 'visible has duplicate keys');
  assert.equal(r.hidden.length, new Set(r.hidden).size, 'hidden has duplicate keys');
  assert.deepEqual(r.hidden, ['b', 'c']);                 // deduped, order preserved
  assert.deepEqual(r.visible.find((v) => v.key === 'a'), { key: 'a', x: 0, y: 0, w: 12, h: 4 }); // first 'a' kept
});
