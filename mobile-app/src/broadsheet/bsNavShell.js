// mobile-app/src/broadsheet/bsNavShell.js
// ── The shell half of the nav-history spine (spec 2026-07-09 §2/§5) ──
// PR A proved this block in the client shell; PR B lifts it out so the two
// coach shells ride the same code. The PURE half lives in
// services/navHistory.mjs; everything window/history/React-shaped is here.
//
// A shell supplies two functions:
//   navLoc()      → the shell-visible location descriptor for "where am I now"
//   navResolve(l) → re-open a popped descriptor via the shell's own entry
//                   points. MUST NOT push (that would loop).
// Both are read through a ref, so once-registered listeners never capture a
// stale render's closure — the bug PR A shipped a fix for (navJumpRef).
import React from 'react';
import {
  bsNavPush, bsNavPop, bsNavCanPop, bsNavSize, bsNavClear, bsNavAnnounce,
  bsNavCompose, bsGuardAfterPush, bsGuardAfterPop, bsGuardAfterInAppPop,
} from '../services/navHistory.mjs';

export function useBSNavHistory({ navLoc, navResolve }) {
  // Fresh closures every render; the stable callbacks below read through here.
  const fns = React.useRef({ navLoc, navResolve });
  fns.current = { navLoc, navResolve };
  // Does a guard entry currently exist in browser history?
  // Invariant: guard exists ⟺ armed ⟺ the stack is non-empty.
  const armed = React.useRef(false);

  const navPush = React.useCallback(() => {
    const prev = bsNavSize();
    const changed = bsNavPush(bsNavCompose(fns.current.navLoc()));
    if (changed && bsGuardAfterPush(prev, bsNavSize()) === 'arm' && !armed.current) {
      try { window.history.pushState({ shapeNav: true }, ''); armed.current = true; } catch (e) {}
    }
    return changed;
  }, []);

  const navBack = React.useCallback((fromPopstate = false) => {
    if (!bsNavCanPop()) return false;
    const loc = bsNavPop();
    if (fromPopstate) {
      // the browser just consumed the guard entry
      if (bsGuardAfterPop(bsNavSize()) === 'rearm') { try { window.history.pushState({ shapeNav: true }, ''); } catch (e) {} }
      else armed.current = false;
    } else if (bsGuardAfterInAppPop(bsNavSize(), armed.current) === 'consume') {
      // An on-screen back emptied the stack, so our guard entry is stale. Left
      // in place it eats the user's NEXT hardware Back. Disarm first (so the
      // popstate this triggers is ignored below), then walk off the guard.
      armed.current = false;
      try { window.history.back(); } catch (e) {}
    }
    fns.current.navResolve(loc);
    return true;
  }, []);

  React.useEffect(() => {
    const onPop = () => {
      if (!armed.current) return;              // not our guard entry
      if (!navBack(true)) armed.current = false; // raced empty — disarm
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [navBack]);

  React.useEffect(() => {
    window.ShapeNav = { push: navPush, back: navBack, canPop: bsNavCanPop, announce: bsNavAnnounce, clear: () => bsNavClear() };
    return () => { if (window.ShapeNav && window.ShapeNav.back === navBack) delete window.ShapeNav; };
  }, [navPush, navBack]);

  return { navPush, navBack };
}
