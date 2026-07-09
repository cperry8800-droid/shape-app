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
  bsGuardAfterClear,
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

  // Clearing empties the stack, so the guard must go with it — same reasoning as
  // the in-app-pop consume above. A bare bsNavClear() would leave `armed` true
  // with an empty stack: the next push would skip arming (already "armed"), and
  // the next hardware Back would spend itself on the orphaned entry.
  const navClear = React.useCallback(() => {
    bsNavClear();
    if (bsGuardAfterClear(armed.current) === 'consume') {
      armed.current = false;
      try { window.history.back(); } catch (e) {}
    }
  }, []);

  React.useEffect(() => {
    window.ShapeNav = { push: navPush, back: navBack, canPop: bsNavCanPop, announce: bsNavAnnounce, clear: navClear };
    return () => { if (window.ShapeNav && window.ShapeNav.back === navBack) delete window.ShapeNav; };
  }, [navPush, navBack, navClear]);

  return { navPush, navBack };
}

// ── Swipe-judgment helpers shared by all three shells (PR C) ──
// The shells differ only in their tab order, their takeover predicates, and
// their close-top-takeover fallback; the step math, the once-registered
// listener, and the one-shot slide state are identical — so they live here
// (the same reasoning that extracted useBSNavHistory in PR B).

// Step the given root-tab order, clamped at the ends. null = no move
// (unknown tab — e.g. a jump-destination screen like radio/market — or
// already at the boundary).
export function bsNavStepTab(tabs, tab, intent) {
  const i = tabs.indexOf(tab);
  if (i < 0) return null;
  const n = intent === 'next-tab' ? Math.min(tabs.length - 1, i + 1) : Math.max(0, i - 1);
  return n === i ? null : tabs[n];
}

// Register the shape:navGesture listener ONCE, reading the CURRENT render's
// handler through the shell's live jump ref (the PR A stale-closure lesson).
export function useBSNavGestureHandler(jumpRef) {
  React.useEffect(() => {
    const on = (e) => { const i = e && e.detail && e.detail.intent; if (i) jumpRef.current.onNavGesture?.(i); };
    window.addEventListener('shape:navGesture', on);
    return () => window.removeEventListener('shape:navGesture', on);
  }, [jumpRef]);
}

// One-shot slide class for a tab SWIPE (a tab TAP renders with no class).
// The ref is cleared in an effect after the slide commit — never in the render
// body (StrictMode double-invokes render; concurrent React can abort one).
export function useBSNavSlide(tab) {
  const dirRef = React.useRef(null);
  React.useEffect(() => { dirRef.current = null; }, [tab]);
  const cls = dirRef.current === 'l' ? 'bs-nav-slide-l' : dirRef.current === 'r' ? 'bs-nav-slide-r' : undefined;
  return [cls, (dir) => { dirRef.current = dir; }];
}
