# Navigation History — Coach Shell Parity (PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trainer and nutritionist shells get the same nav-history behavior PR A gave the client — back returns to the true previous page — by extracting PR A's shell block into ONE shared hook that all three shells consume (spec: `docs/superpowers/specs/2026-07-09-navigation-history-swipe-design.md` §6 "PR B"; PR A merged as `a65a599e`).

**Architecture:** PR A's ~60-line block (armed ref · push · back · popstate bridge · `window.ShapeNav` exposure · live jump ref) becomes **`useBSNavHistory({ navLoc, navResolve })`** in a new `mobile-app/src/broadsheet/bsNavShell.js`. The client shell refactors onto it with **zero behavior change**; both coach shells adopt it with their own `navLoc`/`navResolve` covering their seven takeovers. The shared `BSSettings` already announces its sub-page, so coaches inherit sub-page restoration for free — once the coach shells thread `settingsStart` into it.

**Tech Stack:** plain ESM + React hooks; `node --test`. No new deps.

## Global Constraints

- LF endings on every touched file (`grep -c $'\r' <file>` prints 0).
- `iosAppBroadsheetPros.jsx` aliases React hooks as **`useStateBSP` / `useEffectBSP`** (line 14: `const { useState: useStateBSP, useEffect: useEffectBSP } = React;`). Use those aliases inside that file; the extracted hook uses plain `React.useX`.
- **Tab-bar taps never push.** In-context "up" backs are untouched.
- One shell mounts at a time (role-dispatched), so a single module-level stack + one `window.ShapeNav` is correct — do NOT namespace per role.
- Per commit: JSX parse-check · root `npx tsc --noEmit` · `VITE_BASE=/m/` mobile build exit 0 · full `npm test` (520 baseline) · LF.
- The client shell's observable behavior must not change in Task 1. Re-verify its chains in the browser before moving on.

---

### Task 1: Extract `useBSNavHistory` and refactor the client shell onto it

**Files:**
- Create: `mobile-app/src/broadsheet/bsNavShell.js`
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (import block; `BSClientAppInner` lines ~385-465)

**Interfaces:**
- Consumes: every `navHistory.mjs` export.
- Produces: `useBSNavHistory({ navLoc, navResolve }) → { navPush, navBack, navJump }`
  - `navPush()` — compose + push + arm the guard. Returns `boolean` (false on dedupe no-op).
  - `navBack(fromPopstate = false)` — pop + replay. Returns `boolean` (false when the stack is empty).
  - `navJump(fn)` — wraps a jump handler so a once-registered (`[]`-dep) listener always calls the CURRENT render's closure. `navJump` itself is stable across renders.

- [ ] **Step 1: Create the hook**

```js
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

  // Wrap a jump handler for a once-registered listener: the returned function
  // is stable, the wrapped one is always the current render's.
  const jumpRef = React.useRef(null);
  const navJump = React.useCallback((fn) => {
    jumpRef.current = fn;
    return (...args) => jumpRef.current(...args);
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

  return { navPush, navBack, navJump };
}
```

**`navJump` caveat (read before using it):** one `navJump(fn)` call owns one
`jumpRef` slot — calling it more than once per shell would clobber. The client
shell instead keeps its existing `navJumpRef` object-of-closures pattern, which
is already proven; `navJump` exists for the coach shells' single-handler cases.
**Simplification adopted:** drop `navJump` from the hook entirely (YAGNI — the
object-ref pattern covers both). Return only `{ navPush, navBack }`, and each
shell keeps its own `navJumpRef = React.useRef({}); navJumpRef.current = {...}`
one-liner. Implement the hook WITHOUT `navJump`.

- [ ] **Step 2: Refactor the client shell**

Replace lines ~385-427 (`navArmedRef` through `navBackRef`) with:

```js
  const { navPush, navBack } = useBSNavHistory({ navLoc, navResolve });
```

(`navLoc` and `navResolve` stay exactly where they are, above this call.)
Then DELETE the now-dead `window.ShapeNav` exposure effect and the `popstate`
effect (the hook owns both). KEEP the `navJumpRef` block verbatim. Add the
import: `import { useBSNavHistory } from './bsNavShell.js';`

Grep afterwards to confirm zero remaining references in this file to
`navArmedRef`, `navBackRef`, `bsGuardAfterPush`, `bsGuardAfterPop`,
`bsGuardAfterInAppPop`, `bsNavClear`, `bsNavAnnounce`, `bsNavCompose`,
`bsNavPop`, `bsNavPush`, `bsNavSize` — then trim the `navHistory.mjs` import
down to only what still gets used (`bsNavCanPop` for the smart-backs' `if
(!navBack())`… actually the smart-backs call `navBack()` only, so the import
may drop to nothing → **remove the import line entirely if unused**).

- [ ] **Step 3: Gates + browser re-verification (behavior must be identical)**

Parse · `npm test` (520) · `/m/` build · LF. Then start `npm run dev` in
`mobile-app/` and, in a browser at `localhost:5173`, walk the demo gates
(language Continue → "Preview the app first" → "Step inside" → radio Continue)
and run in the console:

```js
history.replaceState(null,''); window.ShapeNav.clear();
window.dispatchEvent(new CustomEvent('shape:openMarket'));           // → market, guard armed
// click "← BACK" on market → home; then:
console.log(window.ShapeNav.canPop(), history.state);                // false, null
```

Expect `false null` (the PR A stale-guard fix still holds through the hook).

- [ ] **Step 4: Commit**

```bash
git add mobile-app/src/broadsheet/bsNavShell.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "refactor(nav): extract useBSNavHistory; client shell rides the shared hook"
```

---

### Task 2: Trainer shell adopts the spine

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSTrainerAppInner` (starts line 951)

**Interfaces:**
- Consumes: `useBSNavHistory` (Task 1).
- Produces: nav history in the trainer app; new `settingsStart` state threaded into the shared `BSSettings` (which already announces its sub-page).

- [ ] **Step 1: Import + state**

Add to the import block (top of the file): `import { useBSNavHistory } from './bsNavShell.js';`

In `BSTrainerAppInner`, after `const [queueView, setQueueView] = useStateBSP(null);` and `const [liveWatch, setLiveWatch] = useStateBSP(null);`, add:

```js
  const [settingsStart, setSettingsStart] = useStateBSP(''); // replayed Settings sub-page (announce register)
```

- [ ] **Step 2: `navLoc` + `navResolve` + the hook** (place directly after `const scoreProfile = …`, BEFORE `goRadio`/`goSettings`)

```js
  // ── Nav history (spec 2026-07-09; PR A shipped the client spine) ──
  // Takeovers are early-returns below, so they ARE the location when open.
  const navLoc = () => {
    if (showSoundtracks) return { tab, overlay: 'soundtracks' };
    if (showSettings) return { tab, overlay: 'settings', sub: settingsStart || '' };
    if (showCalendar) return { tab, overlay: 'calendar' };
    if (showReviews) return { tab, overlay: 'reviews' };
    if (showHabits) return { tab, overlay: 'habits' };
    if (queueView) return { tab, overlay: 'queue', detail: { type: queueView } };
    if (showSearch) return { tab, overlay: 'search' };
    if (tab === 'store') return { tab: 'store', sub: storeView };
    if (tab === 'programs') return { tab: 'programs', sub: programInitialTab };
    return { tab };
  };
  // Replay a popped descriptor onto the existing entry points. NEVER pushes.
  // liveWatch is deliberately NOT replayable (a live session is ephemeral —
  // re-opening a stale watch would fabricate a session that may have ended).
  const navResolve = (loc) => {
    if (!loc) return;
    setShowSoundtracks(loc.overlay === 'soundtracks');
    setShowCalendar(loc.overlay === 'calendar');
    setShowReviews(loc.overlay === 'reviews');
    setShowHabits(loc.overlay === 'habits');
    setShowSearch(loc.overlay === 'search');
    setQueueView(loc.overlay === 'queue' && loc.detail ? loc.detail.type : null);
    setLiveWatch(null);
    if (loc.overlay === 'settings') { setSettingsStart(loc.sub || ''); setShowSettings(true); }
    else { setShowSettings(false); setSettingsStart(''); }
    if (loc.tab === 'store') setStoreView(loc.sub === 'score' ? 'score' : 'store');
    if (loc.tab === 'programs') setProgramInitialTab(loc.sub || 'programs');
    if (loc.tab === 'chat' && loc.detail) setChatRequest({ ...loc.detail, nonce: Date.now() });
    if (loc.tab) setTab(loc.tab);
  };
  const { navPush, navBack } = useBSNavHistory({ navLoc, navResolve });
  const navJumpRef = React.useRef({});
```

**Hook-order caution:** `useBSNavHistory` calls React hooks, so it must run on
EVERY render before any early return, and its position among the other hooks
must be stable. Placing it right after `scoreProfile` (a plain const, after all
`useStateBSP` calls, before the early returns further down) satisfies both.

**Declaration-order caution:** `navLoc` reads `showSearch` / `chatRequest`
(declared LATER in this component). That is safe — it is only *called* from
event handlers after mount — and mirrors PR A's client shell exactly.

- [ ] **Step 3: Instrument the jumps**

Fill the live-closure ref right after `const [chatRequest, setChatRequest] = useStateBSP(null);`:

```js
  navJumpRef.current = { navPush, goSettings, openHomeWidget };
```

Push in the jump helpers:

```js
  const goRadio = () => { navPush(); setTab('radio'); };
  const goSettings = () => { navPush(); setShowSettings(true); };
  const openHomeWidget = (action) => {
    // Push ONLY for actions that actually navigate — an unknown action must not
    // leave a phantom entry the user's next back would spend itself on.
    if (!['reviews', 'clients', 'programs', 'playlists', 'grocery', 'pr'].includes(action)) return;
    navPush();
    if (action === 'reviews') { setShowReviews(true); return; }
    if (action === 'clients') { setTab('clients'); return; }
    if (action === 'programs' || action === 'playlists') {
      setProgramInitialTab(action === 'playlists' ? 'playlists' : 'programs');
      setTab('programs');
      return;
    }
    if (action === 'grocery') { setQueueView('grocery'); return; }
    if (action === 'pr') setQueueView('pr');
  };
```

Push in the once-registered listeners (each reads through `navJumpRef.current`):
- `shape:openSearch` → `const open = () => { navJumpRef.current.navPush(); setShowSearch(true); };`
- `shape:openConversation` → add `navJumpRef.current.navPush();` immediately after the early-return guard, before `setShowSearch(false);`
- `shape:openProSettings` + `shape:openProfile` (they share `onSettingsEvt`) → `const onSettingsEvt = () => navJumpRef.current.goSettings();`
- `shape:proAvailability` → `const onAvail = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowCalendar(true); };`
- `shape:proSoundtracks` → `const onSound = () => { navJumpRef.current.navPush(); setShowSettings(false); setShowSoundtracks(true); };`
- `shape:proMessageClient` (`onMsg`) and `shape:proMessageCoach` (`onCoach`) → add `navJumpRef.current.navPush();` as the FIRST statement of each handler body (they are async; push before the await so the pre-jump location is recorded).

**Do NOT push** in the `shape:startTour` handler (the tour is an overlay that
closes back to where it started) or on tab-bar `onChange`.

- [ ] **Step 4: Smart-backs**

Apply `if (!navBack()) legacy()` to each takeover early-return + the whole-tab-jump backs:

```js
  if (showSoundtracks) return <BSProSoundtracks role="trainer" onBack={() => { if (!navBack()) setShowSoundtracks(false); }} />;
  if (showSettings) return <BSSettings initialPage={settingsStart} onBack={() => { if (!navBack()) { setShowSettings(false); setSettingsStart(''); } }} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  if (showCalendar) return <BSCalendarScreen role="trainer" onProfile={goSettings} onBack={() => { if (!navBack()) setShowCalendar(false); }} />;
  if (showReviews) return <BSWorkoutReviewPage role="trainer" onBack={() => { if (!navBack()) setShowReviews(false); }} />;
  if (showHabits) return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => { if (!navBack()) setShowHabits(false); }} onOpenScore={() => { setShowHabits(false); setStoreView('score'); setTab('store'); }} />;
  if (queueView) return <BSProWidgetQueuePage role="trainer" type={queueView} onBack={() => { if (!navBack()) setQueueView(null); }} />;
```

Note the `BSSettings` line ALSO gains `initialPage={settingsStart}` — that is what
makes the shared component's announce register replayable for coaches.

`liveWatch`'s back stays `onBack={() => setLiveWatch(null)}` (ephemeral, not replayable).

In the `screens` map: `radio: <BSRadioScreen onBack={() => { if (!navBack()) setTab('today'); }} />` and the `BSShapeStorePage` branch's `onBack={() => { if (!navBack()) setTab('today'); }}`. The `BSShapeScorePage` branch's `onBack={() => setStoreView('store')}` is in-context "up" — LEAVE IT. The `me:` row's `onBack={() => setTab('today')}` is a root-tab back — LEAVE IT.

- [ ] **Step 5: Gates + commit**

Parse · `npm test` (520) · `/m/` build · LF.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx
git commit -m "feat(nav): trainer shell rides the nav-history spine (7 takeovers + pro jumps + Settings sub-page replay)"
```

---

### Task 3: Nutritionist shell adopts the spine

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSNutritionistAppInner` (starts line 4708)

**Interfaces:** identical to Task 2, minus `liveWatch` and `programInitialTab`
(this shell has neither — verified). Confirm before writing: `grep -n
"liveWatch\|programInitialTab" ` within lines 4708-4830 returns nothing.

- [ ] **Step 1: State + navLoc/navResolve + hook**

Add `const [settingsStart, setSettingsStart] = useStateBSP('');` after `queueView`.
Then, after `const scoreProfile = SHAPE_SCORE_PROFILES?.nutritionist;`:

```js
  // ── Nav history (spec 2026-07-09) — mirrors the trainer shell. ──
  const navLoc = () => {
    if (showSoundtracks) return { tab, overlay: 'soundtracks' };
    if (showSettings) return { tab, overlay: 'settings', sub: settingsStart || '' };
    if (showCalendar) return { tab, overlay: 'calendar' };
    if (showReviews) return { tab, overlay: 'reviews' };
    if (showHabits) return { tab, overlay: 'habits' };
    if (queueView) return { tab, overlay: 'queue', detail: { type: queueView } };
    if (showSearch) return { tab, overlay: 'search' };
    if (tab === 'store') return { tab: 'store', sub: storeView };
    return { tab };
  };
  const navResolve = (loc) => {
    if (!loc) return;
    setShowSoundtracks(loc.overlay === 'soundtracks');
    setShowCalendar(loc.overlay === 'calendar');
    setShowReviews(loc.overlay === 'reviews');
    setShowHabits(loc.overlay === 'habits');
    setShowSearch(loc.overlay === 'search');
    setQueueView(loc.overlay === 'queue' && loc.detail ? loc.detail.type : null);
    if (loc.overlay === 'settings') { setSettingsStart(loc.sub || ''); setShowSettings(true); }
    else { setShowSettings(false); setSettingsStart(''); }
    if (loc.tab === 'store') setStoreView(loc.sub === 'score' ? 'score' : 'store');
    if (loc.tab === 'chat' && loc.detail) setChatRequest({ ...loc.detail, nonce: Date.now() });
    if (loc.tab) setTab(loc.tab);
  };
  const { navPush, navBack } = useBSNavHistory({ navLoc, navResolve });
  const navJumpRef = React.useRef({});
```

- [ ] **Step 2: Jumps** — same six listeners + `goRadio` / `goSettings` /
`openHomeWidget` as Task 2 Step 3, with this shell's `openHomeWidget` body kept
verbatim (it routes `'grocery'` → `setQueueView('grocery')` — see the 2026-07-07
grocery entry). Set `navJumpRef.current = { navPush, goSettings, openHomeWidget };`
after `chatRequest` is declared.

- [ ] **Step 3: Smart-backs** — the six takeover early-returns (lines ~4808-4813)
plus `radio:` and the `BSShapeStorePage` branch, exactly as Task 2 Step 4 with
`role="nutritionist"` and `setTab('today')`. `BSSettings` gains
`initialPage={settingsStart}`. Score-view back and `me:` back stay unchanged.

- [ ] **Step 4: Gates + commit**

Parse · `npm test` (520) · `/m/` build · LF.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx
git commit -m "feat(nav): nutritionist shell rides the nav-history spine (mirrors trainer)"
```

---

### Task 4: Browser verification, docs, PR

- [ ] **Step 1: Browser pass on BOTH coach roles.** `npm run dev` in `mobile-app/`.
Role comes from the persisted tweaks doc — set it before load with
`localStorage.setItem('shape.tweaks', JSON.stringify({ ...JSON.parse(localStorage.getItem('shape.tweaks')||'{}'), role: 'trainer' }))`
then reload (repeat with `'nutritionist'`). If that key's shape differs, read how
`BSApp` seeds `tweaks` from localStorage in `iosAppBroadsheetMain.jsx` and match it.
For each role verify:
- `Today → widget door (reviews) → back` returns to Today.
- `Today → Settings (avatar) → Integrations → shape:openMarket-equivalent jump` … coaches have no market; instead: `Settings → Integrations → shape:proSoundtracks → back` lands back on **Settings · Integrations** (the shared announce register).
- `openHomeWidget('grocery') → back` returns to Today.
- Hardware back walks a chain then defers to the platform at empty.
- Tab taps leave the stack alone (`window.ShapeNav.canPop() === false`).

- [ ] **Step 2: WORKLOG dated entry + Latest pointer; War Room** — flip the swipe
item's note to "PR C next"; add PR B to the nav item's label.

- [ ] **Step 3: Commit docs, push, open the PR against `main`.** CI green +
CodeRabbit findings addressed + Codex threads resolved before squash-merge.

## Self-Review Notes

- Spec coverage: §6 "PR B — coach parity: the two pros shells register resolvers on the same window spine; coach cross-jumps instrumented" → Tasks 2+3. The hook extraction (Task 1) is the DRY mechanism, not extra scope.
- Type consistency: descriptor `{ tab, overlay?, sub?, detail? }` matches PR A; `useBSNavHistory` returns `{ navPush, navBack }` (no `navJump` — dropped in Task 1 Step 1's caveat).
- Deliberate non-replays, each with a stated reason: `liveWatch` (ephemeral session), `showTour` (self-closing overlay), tab taps (Android guidance).
- Risk: Task 1 touches merged, working client code. Its acceptance gate is the browser re-verification in Step 3, not just green tests.
