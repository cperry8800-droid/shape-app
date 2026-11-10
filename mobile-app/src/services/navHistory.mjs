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
// The stack alone, for a shell taking over from another (bsGuardOnFirstUse): what the live pages announced
// stays, since the other shell's pages cleared theirs when they unmounted, and this shell's pages may have
// announced already (Programs on Workouts) before its first push (Codex P1 on #2687).
export function bsNavDropStack() { _stack = []; }
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

// ── Guard-entry decisions (the hardware-back bridge, spec §5). ONE browser history entry stands
// between the app and leaving it: the phone's back (Android's back button walks the webview's history)
// and the browser's Back spend it, and the shell answers that popstate. The invariant:
//
//     a guard entry exists  ⟺  armed  ⟺  a Back has somewhere to go
//
// and a Back has somewhere to go while the stack holds a location OR the page in front has a Back of its
// own. The second is new (owner, 2026-11-10, of the War Room's "the phone's Back steps the shell's
// history, not a page's own nesting"): a page opened in place pushes nothing (Home → Goals, a station, a
// meal's preview), so with an empty stack there was no guard and the phone's back walked off the app from
// it; with a stack it popped the stack and skipped the page's own steps. Pure, so every sequence is
// unit-testable; the shell (bsNavShell.js) runs `bsGuardSync` after every push, back, clear and tap.
//
// `bsGuardWanted` — is a guard entry wanted now?
// `bsGuardSync`   — what to do to it: 'arm' (push one), 'consume' (walk off ours: nothing to go back to,
//                   and a stale guard would swallow the reader's next Back), or null. While our own
//                   walk-off is on its way (`consuming`) nothing is decided: it lands as a popstate first.
// `bsPhoneBack`   — what the phone's back does once it has spent the guard: the page in front's own Back
//                   ('page', what its ← and a swipe on it do), else a step of the stack ('stack'), else
//                   nothing ('none').
export function bsGuardWanted(stackSize, pageHasBack) { return stackSize > 0 || !!pageHasBack; }
export function bsGuardSync({ wanted, armed, consuming = false }) {
  if (consuming) return null;
  if (wanted && !armed) return 'arm';
  if (!wanted && armed) return 'consume';
  return null;
}
export function bsPhoneBack({ pageHasBack, stackSize }) { return pageHasBack ? 'page' : stackSize > 0 ? 'stack' : 'none'; }
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
