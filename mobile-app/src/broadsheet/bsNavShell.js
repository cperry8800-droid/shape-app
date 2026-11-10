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
  bsNavCompose, bsGuardWanted, bsGuardSync, bsPhoneBack, bsGuardOnFirstUse, bsNavDropStack,
} from '../services/navHistory.mjs';

// The Back of the page in front (the chrome's bsTopPageBack: what its ← and a swipe on it do), or null.
const bsPageBackNow = () => {
  try { return typeof window !== 'undefined' && typeof window.bsTopPageBack === 'function' ? window.bsTopPageBack() : null; }
  catch (e) { return null; }
};

export function useBSNavHistory({ navLoc, navResolve }) {
  // Fresh closures every render; the stable callbacks below read through here.
  const fns = React.useRef({ navLoc, navResolve });
  fns.current = { navLoc, navResolve };
  // Does a guard entry currently exist in browser history? It does while a Back has somewhere to go: the
  // stack, or the page in front's own Back (services/navHistory.mjs, bsGuardWanted).
  const armed = React.useRef(false);
  // Our own walk-off a stale guard is on its way (history.back() lands as a popstate later).
  const consuming = React.useRef(false);
  // This shell's first touch of the history: a stack another shell left is dropped, and its guard entry
  // adopted (bsGuardOnFirstUse). Every entry point calls it first, so this shell's own pushes, which all
  // come after, are never the ones dropped. Only the stack: what this shell's pages announced before it
  // stays, so the first push records them (Codex P1 on #2687).
  const owned = React.useRef(false);
  const own = React.useCallback(() => {
    if (owned.current) return;
    owned.current = true;
    if (bsGuardOnFirstUse(bsNavSize()) === 'adopt') { bsNavDropStack(); armed.current = true; }
  }, []);

  // Put the guard where it is wanted, once the page a push, a back, a clear or a tap opened has drawn.
  // Pages open in place without a push (Home → Goals), so a tap is reason enough to look again.
  const syncTimer = React.useRef(null);
  const sync = React.useCallback(() => {
    syncTimer.current = null;
    own();
    const act = bsGuardSync({ wanted: bsGuardWanted(bsNavSize(), !!bsPageBackNow()), armed: armed.current, consuming: consuming.current });
    if (act === 'arm') {
      try { window.history.pushState({ shapeNav: true }, ''); armed.current = true; } catch (e) {}
    } else if (act === 'consume') {
      armed.current = false;
      consuming.current = true;
      try { window.history.back(); } catch (e) { consuming.current = false; }
    }
  }, [own]);
  const scheduleSync = React.useCallback((delay = 0) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      try { window.requestAnimationFrame(sync); } catch (e) { sync(); }
    }, delay);
  }, [sync]);

  const navPush = React.useCallback(() => {
    own();
    const changed = bsNavPush(bsNavCompose(fns.current.navLoc()));
    // Armed at once, not a frame later: a Back right after a jump must find it.
    if (changed && !armed.current && !consuming.current) {
      try { window.history.pushState({ shapeNav: true }, ''); armed.current = true; } catch (e) {}
    }
    scheduleSync();
    return changed;
  }, [own, scheduleSync]);

  const navBack = React.useCallback(() => {
    own();
    if (!bsNavCanPop()) return false;
    // A Back: the page it reopens takes the scroll it left at (the chrome's scroll memory).
    try { if (typeof window !== 'undefined' && window.bsMarkBack) window.bsMarkBack(); } catch (e) {}
    const loc = bsNavPop();
    fns.current.navResolve(loc);
    // The page it reopened may have a Back of its own (the guard stays) or be a root with nothing left
    // (the guard goes, or the reader's next phone back would spend itself on it).
    scheduleSync();
    return true;
  }, [own, scheduleSync]);

  React.useEffect(() => {
    const onPop = () => {
      own();
      // Our own walk-off of a stale guard landing: nothing for the reader here.
      if (consuming.current) { consuming.current = false; scheduleSync(); return; }
      if (!armed.current) return;              // not our guard entry
      armed.current = false;                   // the browser just spent it
      // The phone's back does what the page in front's ← does (a station closes onto its cover, Search's
      // person view onto Search), and the stack is stepped only from a page with no Back of its own.
      const pageBack = bsPageBackNow();
      const step = bsPhoneBack({ pageHasBack: !!pageBack, stackSize: bsNavSize() });
      if (step === 'page') {
        try { if (window.bsMarkBack) window.bsMarkBack(); } catch (e) {}
        try { pageBack(); } catch (e) {}
      } else if (step === 'stack') navBack();
      scheduleSync();
    };
    // A tap may open a page in place (no push), which wants the guard; a swipe's Back runs once its slide
    // has played, so a touch looks again a little later.
    const onTap = () => scheduleSync();
    const onTouchEnd = () => scheduleSync(260);
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onTap, true);
    document.addEventListener('touchend', onTouchEnd, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onTap, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    };
  }, [own, navBack, scheduleSync]);

  // Clearing empties the stack; the sync then drops the guard unless the page in front still has a Back.
  const navClear = React.useCallback(() => {
    own();
    bsNavClear();
    scheduleSync();
  }, [own, scheduleSync]);

  React.useEffect(() => {
    const canPop = () => { own(); return bsNavCanPop(); };
    window.ShapeNav = { push: navPush, back: navBack, canPop, announce: bsNavAnnounce, clear: navClear };
    return () => { if (window.ShapeNav && window.ShapeNav.back === navBack) delete window.ShapeNav; };
  }, [navPush, navBack, navClear, own]);

  return { navPush, navBack };
}

// ── Swipe-judgment helpers shared by all three shells (PR C) ──
// The shells differ only in their tab order, their takeover predicates, and
// their close-top-takeover fallback; the step math, the once-registered
// listener, and the one-shot slide state are identical — so they live here
// (the same reasoning that extracted useBSNavHistory in PR B).

// The member app's root tabs, in the nav's order and the swipe's (owner, 2026-11-09: Coaches, the
// marketplace's tab 'market', between Eat and Chat). The client shell's tab bar and its swipes read
// this one list, so the two cannot disagree.
export const BS_MEMBER_TABS = Object.freeze(['home', 'train', 'eat', 'market', 'chat', 'me']);

// Step the given root-tab order, clamped at the ends. null = no move
// (unknown tab — e.g. a jump-destination screen like radio/store — or
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
