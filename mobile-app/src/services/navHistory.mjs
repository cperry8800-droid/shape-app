// mobile-app/src/services/navHistory.mjs
// ── The nav-history spine (spec 2026-07-09-navigation-history-swipe) ──
// A bounded LIFO of replayable location descriptors { tab, overlay?, sub?,
// detail? } plus the announce register for child-owned sub-state. 100% pure
// (no window/history access) so node --test covers it; the client shell owns
// window.ShapeNav exposure, descriptor replay, and the history guard entry.

const BS_NAV_CAP = 30;
let _stack = [];
let _announced = new Map(); // key → partial, in the order each first announced

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
export function bsNavClear() { _stack = []; _announced = new Map(); }
export function bsNavReplaceTop(loc) {
  if (!loc || typeof loc !== 'object') return false;
  if (_stack.length) _stack[_stack.length - 1] = loc; else _stack.push(loc);
  return true;
}

// ── Announce register: surfaces that own nav-relevant sub-state stamp a
// partial ({ sub } / { detail }) here, EACH UNDER ITS OWN KEY ('home', 'chat',
// 'settings', …); every push composes every live partial over the
// shell-visible location, in the order they announced (a re-announce moves to
// the end), so an overlay that mounted over a page (Settings over a client's
// page) wins a key they share. null clears that key's only (call on close/unmount). It was one slot,
// last write wins: Settings closing over a client's page announced null and
// wiped the page's own, so the next jump from that page forgot it (Codex P2 on
// #2683; BSGoals' note on the same slot).
export function bsNavAnnounce(partial, key = '') {
  if (partial && typeof partial === 'object') _announced.set(key, partial);
  else _announced.delete(key);
}
// One key's partial, or (no key) every live one merged; null when there is none.
export function bsNavAnnounced(key) {
  if (key !== undefined) return _announced.get(key) || null;
  if (!_announced.size) return null;
  return [..._announced.values()].reduce((a, p) => ({ ...a, ...p }), {});
}
export function bsNavCompose(shellLoc) {
  let out = { ...shellLoc };
  for (const p of _announced.values()) out = { ...out, ...p };
  return out;
}

// ── Guard-entry decisions (the hardware-back bridge, spec §5). ONE browser
// history entry stands in for the whole stack. The invariant these three keep:
//
//     a guard entry exists  ⟺  armed  ⟺  the stack is non-empty
//
// `bsGuardAfterPush`  — arm on the empty→non-empty transition (only then).
// `bsGuardAfterPop`   — the POPSTATE path: the browser just consumed the guard,
//                       so re-arm while entries remain, else disarm.
// `bsGuardAfterInAppPop` — the ON-SCREEN back path: the guard was NOT consumed.
//                       While entries remain it still stands for them (no-op);
//                       when the stack empties it is stale and must be consumed,
//                       or the next hardware Back would spend itself on it and
//                       the user's real back would be swallowed.
// Pure, so every arm/re-arm/disarm/consume sequence is unit-testable.
// `bsGuardAfterClear` — clearing empties the stack, so an existing guard is
//                       orphaned and must be consumed too (same shape as the
//                       in-app pop). Without it, `armed` stays true over an
//                       empty stack: the next push skips arming and the next
//                       hardware Back is swallowed.
export function bsGuardAfterPush(prevSize, nextSize) { return prevSize === 0 && nextSize > 0 ? 'arm' : null; }
export function bsGuardAfterPop(sizeAfterPop) { return sizeAfterPop > 0 ? 'rearm' : 'disarm'; }
export function bsGuardAfterInAppPop(sizeAfterPop, armed) { return sizeAfterPop === 0 && armed ? 'consume' : null; }
export function bsGuardAfterClear(armed) { return armed ? 'consume' : null; }
// `bsGuardOnFirstUse` — the first time a shell touches the history, a stack
//                       already there is ANOTHER shell's: the member app's, left
//                       when the account switched to a coach app (Settings'
//                       profile type, a notification handed over), or the other
//                       way. Those locations name tabs this shell does not have,
//                       so they go; and the guard entry that shell armed is still
//                       in the browser's history, so this shell adopts it as its
//                       own. Left as it was, the new shell never armed (its push
//                       was not empty→non-empty), ignored every popstate, and a
//                       phone Back walked off the app (2026-11-10).
export function bsGuardOnFirstUse(size) { return size > 0 ? 'adopt' : null; }
