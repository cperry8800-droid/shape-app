// mobile-app/src/services/navHistory.mjs
// ── The nav-history spine (spec 2026-07-09-navigation-history-swipe) ──
// A bounded LIFO of replayable location descriptors { tab, overlay?, sub?,
// detail? } plus the announce register for child-owned sub-state. 100% pure
// (no window/history access) so node --test covers it; the client shell owns
// window.ShapeNav exposure, descriptor replay, and the history guard entry.

const BS_NAV_CAP = 30;
let _stack = [];
let _announced = null;

function _eq(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => _eq(a[k], b[k]));
}

export function bsNavPush(loc) {
  if (!loc || typeof loc !== 'object') return false;
  if (_stack.length && _eq(_stack[_stack.length - 1], loc)) return false;
  _stack.push(loc);
  if (_stack.length > BS_NAV_CAP) _stack.shift();
  return true;
}
export function bsNavPop() { return _stack.pop() || null; }
export function bsNavPeek() { return _stack[_stack.length - 1] || null; }
export function bsNavCanPop() { return _stack.length > 0; }
export function bsNavSize() { return _stack.length; }
export function bsNavClear() { _stack = []; _announced = null; }
export function bsNavReplaceTop(loc) {
  if (!loc || typeof loc !== 'object') return false;
  if (_stack.length) _stack[_stack.length - 1] = loc; else _stack.push(loc);
  return true;
}

// ── Announce register: surfaces that own nav-relevant sub-state stamp a
// partial ({ sub } / { detail }) here; every push composes it over the
// shell-visible location. null clears (call on close/unmount).
export function bsNavAnnounce(partial) { _announced = partial && typeof partial === 'object' ? partial : null; }
export function bsNavAnnounced() { return _announced; }
export function bsNavCompose(shellLoc) { return _announced ? { ...shellLoc, ..._announced } : { ...shellLoc }; }

// ── Guard-entry decisions (the hardware-back bridge, spec §5): ONE history
// entry armed on the empty→non-empty transition, re-armed per consumed pop,
// disarmed when the pop empties the stack. Pure so the sequences are testable.
export function bsGuardAfterPush(prevSize, nextSize) { return prevSize === 0 && nextSize > 0 ? 'arm' : null; }
export function bsGuardAfterPop(sizeAfterPop) { return sizeAfterPop > 0 ? 'rearm' : 'disarm'; }
