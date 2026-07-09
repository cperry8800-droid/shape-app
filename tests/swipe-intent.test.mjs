import test from 'node:test';
import assert from 'node:assert/strict';
import { bsSwipeIntent, BS_SWIPE } from '../mobile-app/src/services/swipeIntent.mjs';

// Shorthand: a sample from deltas. x0 defaults to mid-screen (not the edge).
const s = (dx, dy, dt, over = {}) => ({ x0: 180, y0: 400, x1: 180 + dx, y1: 400 + dy, dt, blocked: false, ...over });

test('edge-back: a left-edge start dragged right past BACK_DX', () => {
  assert.equal(bsSwipeIntent(s(80, 10, 300, { x0: 10, x1: 90 })), 'back');
  // slow deliberate edge-drags still mean back (no dt cap on the edge gesture)
  assert.equal(bsSwipeIntent(s(80, 10, 2000, { x0: 10, x1: 90 })), 'back');
});

test('edge-back rejects: short drag, or too vertical', () => {
  assert.equal(bsSwipeIntent(s(40, 5, 200, { x0: 10, x1: 50 })), null);          // < BACK_DX
  assert.equal(bsSwipeIntent(s(80, 60, 200, { x0: 10, x1: 90 })), null);          // |dy| ≥ BACK_DY_MAX
});

test('edge zone wins over tab swipe when both could apply', () => {
  // fast long rightward drag from the edge: qualifies for both → back
  assert.equal(bsSwipeIntent(s(120, 8, 250, { x0: 20, x1: 140 })), 'back');
});

test('tab swipe: fast horizontal drags on content step tabs', () => {
  assert.equal(bsSwipeIntent(s(-90, 10, 250)), 'next-tab');   // leftward → next
  assert.equal(bsSwipeIntent(s(90, -12, 250)), 'prev-tab');   // rightward → prev
});

test('tab swipe rejects: short, slow, or diagonal drags', () => {
  assert.equal(bsSwipeIntent(s(-50, 5, 250)), null);          // < TAB_DX
  assert.equal(bsSwipeIntent(s(-90, 10, 900)), null);         // > TAB_MS (a slow pan, not a swipe)
  assert.equal(bsSwipeIntent(s(-90, 60, 250)), null);         // |dx| ≤ RATIO·|dy| (diagonal/scroll)
});

test('vertical scrolling never classifies', () => {
  assert.equal(bsSwipeIntent(s(4, -300, 400)), null);
  assert.equal(bsSwipeIntent(s(-20, 220, 300)), null);
});

test('blocked short-circuits everything (interactive/scroller/sheet/opt-out)', () => {
  assert.equal(bsSwipeIntent(s(-120, 5, 200, { blocked: true })), null);
  assert.equal(bsSwipeIntent(s(120, 5, 200, { x0: 10, x1: 130, blocked: true })), null); // even edge-back
});

test('the tuning constants are exported (the on-device knobs)', () => {
  for (const k of ['EDGE_PX', 'BACK_DX', 'BACK_DY_MAX', 'TAB_DX', 'TAB_RATIO', 'TAB_MS']) {
    assert.equal(typeof BS_SWIPE[k], 'number');
  }
});
