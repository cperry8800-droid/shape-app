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
  // An edge swipe on a page with a Back follows the finger (owner, 2026-10-30: "if im on one
  // page and want to go back, i can swipe right and it will bring me back to previous page").
  FOLLOW_SLOP: 10,  // the finger must move this far before the drag decides follow or not
  FOLLOW_COMMIT: 0.3, // let go past this share of the screen's width and it goes back…
  FLICK_V: 0.45,    // …or past BACK_DX moving right at least this fast (px per ms)
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

// ── Where a back swipe goes (owner, 2026-10-30) ──
// A page with its own ← Back goes back the way that Back does: a swipe from the edge, or a fast
// rightward swipe anywhere on it, which on such a page used to step to the previous TAB (or, on
// the first tab, do nothing) while the Back sat on screen. A page with no Back keeps the shell's
// reading: the edge is the shell's back, a horizontal swipe steps the tabs.
// → 'page' (call the page's Back) | 'shell' (dispatch the intent to the shell) | null
export function bsSwipeBackRoute({ intent, hasPageBack }) {
  if (!intent) return null;
  if ((intent === 'back' || intent === 'prev-tab') && hasPageBack) return 'page';
  return 'shell';
}

// While an edge touch moves: does the page follow the finger? null until the finger has moved
// FOLLOW_SLOP; then 'follow' for a rightward, mostly horizontal drag, else 'cancel' (a scroll).
export function bsSwipeFollow({ dx, dy }) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < BS_SWIPE.FOLLOW_SLOP) return null;
  return dx > 0 && dx > Math.abs(dy) ? 'follow' : 'cancel';
}

// Let go of a followed page: does it go back? Past FOLLOW_COMMIT of the width, or a flick past
// BACK_DX. A slow, short drag springs back, as the platform's does.
export function bsSwipeBackCommits({ dx, dt, width }) {
  if (!(dx > 0)) return false;
  if (dx >= (width || 0) * BS_SWIPE.FOLLOW_COMMIT) return true;
  return dx >= BS_SWIPE.BACK_DX && dx / Math.max(1, dt) >= BS_SWIPE.FLICK_V;
}
