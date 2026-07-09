// mobile-app/src/services/swipeIntent.mjs
// ── Swipe-gesture intent classifier (spec 2026-07-09-navigation-history-swipe §4) ──
// Pure geometry → intent. The DOM half (BSNavGestures in the chrome) samples the
// touch and computes ONE `blocked` boolean from the target's ancestor chain
// (interactive control · horizontal scroller · touchAction-owning surface like a
// chart scrub · sheet/overlay · [data-bs-noswipe] opt-out); this module never
// touches the DOM, so every rule edge is unit-testable.
//
// BS_SWIPE is the single tuning surface for the owner's on-device feel pass —
// nothing else in the pipeline carries a threshold.
export const BS_SWIPE = {
  EDGE_PX: 24,      // a back-swipe must START within this many px of the left edge
  BACK_DX: 60,      // …and travel at least this far right
  BACK_DY_MAX: 40,  // …without drifting this far vertically
  TAB_DX: 70,       // a tab-swipe must travel at least this far horizontally
  TAB_RATIO: 2,     // …with |dx| strictly more than RATIO·|dy| (rejects diagonals)
  TAB_MS: 600,      // …within this long (a slow pan is a scroll, not a swipe)
};

// sample = { x0, y0, x1, y1, dt, blocked }
// → 'back' | 'prev-tab' | 'next-tab' | null
export function bsSwipeIntent(sample) {
  if (!sample || sample.blocked) return null;
  const dx = sample.x1 - sample.x0;
  const dy = sample.y1 - sample.y0;
  // Edge-back wins wherever both could apply. No dt cap: a slow, deliberate
  // edge-drag still reads as back (matches the platform gesture).
  if (sample.x0 <= BS_SWIPE.EDGE_PX && dx >= BS_SWIPE.BACK_DX && Math.abs(dy) < BS_SWIPE.BACK_DY_MAX) {
    return 'back';
  }
  if (
    Math.abs(dx) >= BS_SWIPE.TAB_DX &&
    Math.abs(dx) > BS_SWIPE.TAB_RATIO * Math.abs(dy) &&
    sample.dt <= BS_SWIPE.TAB_MS
  ) {
    return dx < 0 ? 'next-tab' : 'prev-tab';
  }
  return null;
}
