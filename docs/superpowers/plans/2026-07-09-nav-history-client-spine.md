# Navigation History — Client Spine (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back returns to the true previous page in the client app — a pure nav-history stack, descriptor replay in the shell, cross-jump instrumentation, smart-backs, and the hardware-back guard bridge (spec: `docs/superpowers/specs/2026-07-09-navigation-history-swipe-design.md`; this is PR A of 3 — no gestures, no coach shells here).

**Architecture:** A pure ESM stack of replayable location descriptors (`mobile-app/src/services/navHistory.mjs`) + an announce register for child-owned sub-state. `BSClientAppInner` owns replay: it exposes `window.ShapeNav`, composes pushes from its shell state + the announced sub, and maps popped descriptors back onto its existing setters. A single browser-history guard entry bridges hardware/browser back.

**Tech Stack:** plain ESM + `node --test` (no new deps); React state in `iosAppBroadsheetClient.jsx` via the file's own `useStateBSC`.

## Global Constraints

- LF line endings on every touched file (`grep -c $'\r' <file>` must print 0).
- Descriptor stack cap = **30**; deep-equal pushes are **no-ops**; **tab-bar taps never push**.
- Component state in broadsheet files uses **`useStateBSC`**, not raw `React.useState`.
- New test files must be **added to the root `package.json` `test` script list** (explicit file list, no glob).
- Per commit: JSX parse-check · root `npx tsc --noEmit` · `VITE_BASE=/m/` mobile build exit 0 · full `npm test` green.
- No behavior change to any in-context "up" back (e.g. Eat grocery → Eat day); only the sites named in Task 4 change.
- `bsNavBack()` replays via the resolver directly — it must never re-push (no loops).

---

### Task 1: `navHistory.mjs` — the pure stack + announce + guard decisions

**Files:**
- Create: `mobile-app/src/services/navHistory.mjs`
- Create: `tests/nav-history.test.mjs`
- Modify: `package.json` (append ` tests/nav-history.test.mjs` to the `test` script)

**Interfaces:**
- Produces (later tasks import these exact names):
  `bsNavPush(loc) → boolean` · `bsNavPop() → loc|null` · `bsNavPeek() → loc|null`
  · `bsNavCanPop() → boolean` · `bsNavSize() → number` · `bsNavClear()`
  · `bsNavReplaceTop(loc) → boolean` · `bsNavAnnounce(partial|null)` ·
  `bsNavAnnounced() → partial|null` · `bsNavCompose(shellLoc) → loc` ·
  `bsGuardAfterPush(prevSize, nextSize) → 'arm'|null` ·
  `bsGuardAfterPop(sizeAfterPop) → 'rearm'|'disarm'`

- [ ] **Step 1: Write the failing tests**

```js
// tests/nav-history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsNavPush, bsNavPop, bsNavPeek, bsNavCanPop, bsNavSize, bsNavClear,
  bsNavReplaceTop, bsNavAnnounce, bsNavAnnounced, bsNavCompose,
  bsGuardAfterPush, bsGuardAfterPop,
} from '../mobile-app/src/services/navHistory.mjs';

test('push/pop round-trips descriptors in LIFO order', () => {
  bsNavClear();
  assert.equal(bsNavPush({ tab: 'home' }), true);
  assert.equal(bsNavPush({ tab: 'eat', sub: 'grocery' }), true);
  assert.equal(bsNavSize(), 2);
  assert.deepEqual(bsNavPop(), { tab: 'eat', sub: 'grocery' });
  assert.deepEqual(bsNavPop(), { tab: 'home' });
  assert.equal(bsNavPop(), null);
});

test('deep-equal push is a no-op (returns false, size unchanged)', () => {
  bsNavClear();
  bsNavPush({ tab: 'chat', detail: { conversationId: 'c1' } });
  assert.equal(bsNavPush({ tab: 'chat', detail: { conversationId: 'c1' } }), false);
  assert.equal(bsNavSize(), 1);
  // a DIFFERENT detail is not a dupe
  assert.equal(bsNavPush({ tab: 'chat', detail: { conversationId: 'c2' } }), true);
});

test('cap 30 evicts the oldest entry, never the newest', () => {
  bsNavClear();
  for (let i = 0; i < 31; i++) bsNavPush({ tab: 'home', detail: { i } });
  assert.equal(bsNavSize(), 30);
  assert.deepEqual(bsNavPeek(), { tab: 'home', detail: { i: 30 } });
  let bottom = null;
  while (bsNavCanPop()) bottom = bsNavPop();
  assert.deepEqual(bottom, { tab: 'home', detail: { i: 1 } }); // 0 was evicted
});

test('replaceTop swaps the head; on empty it behaves like push', () => {
  bsNavClear();
  assert.equal(bsNavReplaceTop({ tab: 'me' }), true);
  bsNavPush({ tab: 'train' });
  assert.equal(bsNavReplaceTop({ tab: 'eat' }), true);
  assert.equal(bsNavSize(), 2);
  assert.deepEqual(bsNavPop(), { tab: 'eat' });
});

test('announce composes over the shell location; null clears', () => {
  bsNavAnnounce({ sub: 'integrations' });
  assert.deepEqual(bsNavCompose({ tab: 'me', overlay: 'settings' }),
    { tab: 'me', overlay: 'settings', sub: 'integrations' });
  bsNavAnnounce(null);
  assert.equal(bsNavAnnounced(), null);
  assert.deepEqual(bsNavCompose({ tab: 'me' }), { tab: 'me' });
});

test('guard decisions: arm on empty→non-empty, rearm while entries remain, disarm at empty', () => {
  assert.equal(bsGuardAfterPush(0, 1), 'arm');
  assert.equal(bsGuardAfterPush(1, 2), null);
  assert.equal(bsGuardAfterPush(1, 1), null); // dedupe no-op never arms
  assert.equal(bsGuardAfterPop(1), 'rearm');
  assert.equal(bsGuardAfterPop(0), 'disarm');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/nav-history.test.mjs`
Expected: FAIL — `Cannot find module … navHistory.mjs`.

- [ ] **Step 3: Implement the module**

```js
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
```

- [ ] **Step 4: Register the test + run**

In `package.json`, append `tests/nav-history.test.mjs` to the end of the `test` script string (single space separator, keep everything else byte-identical).

Run: `node --test tests/nav-history.test.mjs` → 6/6 PASS, then `npm test` → full suite green (517 expected).

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/services/navHistory.mjs tests/nav-history.test.mjs package.json
git commit -m "feat(nav): pure nav-history spine — descriptor stack + announce register + guard decisions"
```

---

### Task 2: Shell resolver + `window.ShapeNav` + `bsNavBack` (no behavior change yet)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the import block (after line 17) and `BSClientAppInner` (starts line 356)

**Interfaces:**
- Consumes: every Task-1 export.
- Produces (used by Tasks 3–6, all defined inside `BSClientAppInner`):
  `navLoc() → loc` (shell-visible location) · `navPush()` (compose + push + arm)
  · `navBack() → boolean` (pop + replay; false when stack empty) ·
  `window.ShapeNav = { push, back, canPop, announce, clear }` — new shell states
  `eatStart` (`''|'eat'|'grocery'|'library'`) and `meStart`
  (`''|'score'|'store'|'reconcile'|'record'`).

- [ ] **Step 1: Add the import** (after the existing service imports, line ~17)

```js
import { bsNavPush, bsNavPop, bsNavCanPop, bsNavSize, bsNavClear, bsNavAnnounce, bsNavCompose, bsGuardAfterPush, bsGuardAfterPop } from '../services/navHistory.mjs';
```

- [ ] **Step 2: Add shell states + the location builder + resolver + back inside `BSClientAppInner`** (directly after the `goChat` definition, line ~379)

```js
  // ── Nav history (spec 2026-07-09): replay targets for popped descriptors ──
  const [eatStart, setEatStart] = useStateBSC('');
  const [meStart, setMeStart] = useStateBSC('');
  // The shell-visible location. Child-owned sub-state (Settings' active
  // sub-page, Eat's view, Me's sub-page, Chat's open thread) rides in via the
  // announce register at compose time — see bsNavCompose.
  const navLoc = () => {
    if (showSettings) return { tab, overlay: 'settings', sub: settingsStart || '' };
    if (showCalendar) return { tab, overlay: 'calendar' };
    if (showSearch) return { tab, overlay: 'search' };
    if (tab === 'store') return { tab: 'store', sub: storeView };
    if (tab === 'market') return { tab: 'market', detail: marketRole ? { role: marketRole } : undefined };
    return { tab };
  };
  const navPush = () => {
    const prev = bsNavSize();
    const changed = bsNavPush(bsNavCompose(navLoc()));
    if (changed && bsGuardAfterPush(prev, bsNavSize()) === 'arm') {
      try { window.history.pushState({ shapeNav: true }, ''); } catch (e) {}
    }
    return changed;
  };
  // Replay a popped descriptor onto the existing entry points. NEVER pushes.
  const navResolve = (loc) => {
    if (!loc) return;
    setShowSearch(loc.overlay === 'search');
    setShowCalendar(loc.overlay === 'calendar');
    if (loc.overlay === 'settings') { setSettingsStart(loc.sub || ''); setShowSettings(true); }
    else { setShowSettings(false); setSettingsStart(''); }
    if (loc.tab === 'store') setStoreView(loc.sub === 'score' ? 'score' : 'store');
    if (loc.tab === 'market') setMarketRole((loc.detail && loc.detail.role) || null);
    if (loc.tab === 'chat' && loc.detail) setChatRequest({ ...loc.detail, nonce: Date.now() });
    if (loc.tab === 'eat') setEatStart(loc.sub || '');
    if (loc.tab === 'me') setMeStart(loc.sub || '');
    if (loc.tab) setTab(loc.tab);
  };
  const navBack = () => {
    if (!bsNavCanPop()) return false;
    const loc = bsNavPop();
    const g = bsGuardAfterPop(bsNavSize());
    if (g === 'rearm') { try { window.history.pushState({ shapeNav: true }, ''); } catch (e) {} }
    navResolve(loc);
    return true;
  };
```

Note: `navBack`'s re-arm assumes the browser guard entry was just consumed by a
real `popstate`; when `navBack` runs from an ON-SCREEN back button the guard
entry is still armed, so re-arming would stack a second one. Handled in Task 6
with an `armedRef` — for this task the `history` calls are correct only for the
popstate path and harmless otherwise (verified/fixed in Task 6's step 1).

- [ ] **Step 3: Expose `window.ShapeNav`** (a new effect right after the block above)

```js
  React.useEffect(() => {
    window.ShapeNav = {
      push: navPush,
      back: navBack,
      canPop: bsNavCanPop,
      announce: bsNavAnnounce,
      clear: () => bsNavClear(),
    };
    return () => { if (window.ShapeNav && window.ShapeNav.back === navBack) delete window.ShapeNav; };
  });
```

(Effect has no dep array on purpose: `navPush`/`navBack` close over current state each render, so the window handle must track the latest render's closures. It's a cheap assignment.)

- [ ] **Step 4: Verify + commit**

Run: `cd mobile-app && node -e "require('@babel/parser').parse(require('fs').readFileSync('src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})" && cd .. && npm test` → parse OK, suite green. `VITE_BASE=/m/` build exit 0.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nav): client shell resolver + window.ShapeNav (spine wired, no callers yet)"
```

---

### Task 3: Cross-jump instrumentation — pushes

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the `goX` helpers (lines ~370-379), the `shape:*` effects (lines ~388-441), the calendar-open closures in the `screens` map (lines ~615-616), and the `shape:startWorkout` handler.

**Interfaces:**
- Consumes: `navPush()` from Task 2.
- Produces: every cross-context jump records the pre-jump location.

- [ ] **Step 1: Push inside the jump helpers** — each helper gains `navPush()` as its first statement:

```js
  const goSettings = () => { navPush(); setSettingsStart(''); setShowSettings(true); };
  const goEditProfile = () => { navPush(); setSettingsStart('edit-profile'); setShowSettings(true); };
  const goIntegrations = () => { navPush(); setSettingsStart('integrations'); setShowSettings(true); };
  const goRadio    = () => { navPush(); setTab('radio'); };
  const goTrain    = () => { navPush(); setTab('train'); };
  const goMarket   = (role) => { navPush(); setMarketRole(typeof role === 'string' ? role : null); setTab('market'); };
  const goScore    = () => { navPush(); setStoreView('score'); setTab('store'); };
  const goChat = (coach, role) => { navPush(); setChatRequest({ coach: coach || null, role: role || null, nonce: Date.now() }); setTab('chat'); };
```

(`goEat` in the screens map is a home→eat jump: change `goEat={() => setTab('eat')}` to `goEat={() => { navPush(); setTab('eat'); }}`. Definition order note: `navPush`/`navLoc` from Task 2 must be moved ABOVE these helpers — place the Task-2 block at line ~369, before `goSettings`.)

- [ ] **Step 2: Push on the remaining jump sites**

- `shape:openSearch` effect: `const open = () => { navPush(); setShowSearch(true); };`
- `shape:openConversation` effect: add `navPush();` immediately before `setShowSearch(false);` — BUT compose order matters: push FIRST (records the search overlay as the origin), which is correct — back from the thread returns to search.
- `shape:openMarket` effect: `const open = (e) => { navPush(); setShowSettings(false); setSettingsStart(''); goMarket(e?.detail?.role); };` → double push (goMarket also pushes). Fix: inline the market jump instead of calling goMarket: `const open = (e) => { navPush(); setShowSettings(false); setSettingsStart(''); setMarketRole(typeof e?.detail?.role === 'string' ? e.detail.role : null); setTab('market'); };`
- Calendar opens (screens map): `goCalendar={() => { navPush(); setShowCalendar(true); }}` on BOTH the home and train rows.
- `shape:startWorkout` handler (search `shape:startWorkout` in the shell effects, line ~470): add `navPush();` before it closes the calendar/switches to train.

The `shape:openProfile` / `shape:editProfile` / `shape:openIntegrations` effects call the (now-pushing) helpers — no change needed there.

- [ ] **Step 3: Verify + commit**

Parse + `npm test` + `/m/` build as in Task 2 Step 4.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nav): cross-context jumps push the pre-jump location"
```

---

### Task 4: Smart-backs — takeovers + whole-tab-jump backs

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the takeover early-returns (lines ~595-613), the `screens` map backs (lines ~619-623), and the search overlay close (line ~651).

**Interfaces:**
- Consumes: `navBack()` from Task 2.
- Produces: `onBack = () => { if (!navBack()) legacyBack(); }` on the enumerated sites — nothing else changes.

- [ ] **Step 1: Apply the pattern to the enumerated sites**

```js
  // Settings takeover (line ~599):
  onBack={() => { if (!navBack()) { setShowSettings(false); setSettingsStart(''); } }}
  // Calendar takeover (line ~609):
  onBack={() => { if (!navBack()) setShowCalendar(false); }}
  // Universal search close (line ~651):
  {showSearch && <BSUniversalSearch onClose={() => { if (!navBack()) setShowSearch(false); }} />}
  // Radio tab back (line ~619):
  radio: <BSRadioScreen onBack={() => { if (!navBack()) setTab('home'); }} />,
  // Marketplace back (line ~620):
  market: <BSMarketplaceScreen initialRole={marketRole} onBack={() => { if (!navBack()) setTab('home'); }} onProfile={goSettings} goChat={goChat} />,
  // Store back (line ~623 — the store view only; the score view's back to store stays in-context):
  : <BSShapeStorePage profile={scoreProfile} onBack={() => { if (!navBack()) setTab('home'); }} onOpenScore={() => setStoreView('score')} />,
```

**Deliberately NOT changed** (in-context "up", per spec §3): the score-view back (`setStoreView('store')`), every back inside tab components (Eat/Me/Chat/Train sub-views), sheet closes, and `BSDetailHeader` consumers inside tabs.

- [ ] **Step 2: Verify + commit**

Parse + `npm test` + `/m/` build.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nav): smart-backs on takeovers + whole-tab-jump backs (stack-first, legacy fallback)"
```

---

### Task 5: Announce register — the wave-1 replayable set

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSSettings` (line ~21402), `BSClientEat` (line ~5350), `BSClientMe` (line ~18110), `BSClientFeed` (line ~12556), and the `screens` map (Eat/Me rows).

**Interfaces:**
- Consumes: `window.ShapeNav.announce` (Task 2), `eatStart`/`meStart`/`setEatStart`/`setMeStart` (Task 2).
- Produces: composed pushes carry `sub`/`detail` for Settings sub-pages, Eat views, Me sub-pages, and replayable chat threads; `BSClientEat` gains `initialView` + `onStartConsumed`; `BSClientMe` gains `initialPage` + `onStartConsumed`.

- [ ] **Step 1: BSSettings announces its active sub-page** (inside `BSSettings`, after the sub-page states, line ~21430; note `editing` is declared at line ~21821 — place this effect AFTER that declaration):

```js
  // Nav announce (spec §2): the shell only sees settingsStart at OPEN time;
  // this keeps the register current as the user moves within Settings. Only
  // the replayable keys (initialPage-supported) are announced.
  const navSub = editing ? 'edit-profile' : showIntegrations ? 'integrations' : showAbout ? 'about-shape' : showPricing ? 'pricing' : '';
  React.useEffect(() => {
    window.ShapeNav?.announce?.({ sub: navSub });
    return () => window.ShapeNav?.announce?.(null);
  }, [navSub]);
```

- [ ] **Step 2: BSClientEat — `initialView` + announce** (signature line 5350):

```js
function BSClientEat({ onProfile, goRadio = () => {}, goMarket = () => {}, initialView = '', onStartConsumed = () => {} }) {
  ...
  const [view, setView] = useStateBSC(initialView || 'eat'); // 'eat' | 'grocery' | 'library'
```

Add after the view state:

```js
  React.useEffect(() => { if (initialView) onStartConsumed(); }, []);
  React.useEffect(() => {
    window.ShapeNav?.announce?.({ sub: view });
    return () => window.ShapeNav?.announce?.(null);
  }, [view]);
```

Screens-map row (line ~617):

```js
    eat: <BSClientEat onProfile={goSettings} sheet={sheet} goRadio={goRadio} goMarket={goMarket} initialView={eatStart} onStartConsumed={() => setEatStart('')} />,
```

**Check the existing `window.__bsPendingGrocery` mount effect in BSClientEat** — it must keep winning over `initialView` (it runs after mount and calls `setView('grocery')`; no change needed, just verify it still fires).

- [ ] **Step 3: BSClientMe — `initialPage` + announce** (signature line 18110; `BSClientMe(props)` destructures internally — add to the destructure):

```js
  const { initialPage = '', onStartConsumed = () => {} } = props;
  const [showScore, setShowScore] = useStateBSC(initialPage === 'score');
  const [showStore, setShowStore] = useStateBSC(initialPage === 'store');
  // showReconcile / showRecord: find their useStateBSC(false) declarations in
  // this component and seed the same way (initialPage === 'reconcile' / 'record').
```

Add (after the four sub-view states):

```js
  React.useEffect(() => { if (initialPage) onStartConsumed(); }, []);
  const meNavSub = showScore ? 'score' : showStore ? 'store' : showReconcile ? 'reconcile' : showRecord ? 'record' : '';
  React.useEffect(() => {
    window.ShapeNav?.announce?.({ sub: meNavSub });
    return () => window.ShapeNav?.announce?.(null);
  }, [meNavSub]);
```

Screens-map row (line ~624): add `initialPage={meStart} onStartConsumed={() => setMeStart('')}` to the `<BSClientMe>` props.

- [ ] **Step 4: BSClientFeed announces the replayable open thread** (inside `BSClientFeed`; `openChat` is the open-thread state — find its `useStateBSC` declaration):

```js
  // Nav announce: only threads re-enterable via chatRequest are announced
  // (conversation-id DMs; channels; the support tab). Demo/local-only threads
  // announce nothing — a push from them records the chat tab root.
  const chatNavDetail = openChat && openChat.conversation_id ? { conversationId: openChat.conversation_id, coach: openChat.n || null, role: openChat.s || null }
    : openChat && openChat.channel && openChat.channel.id != null ? { channel: openChat.channel }
    : null;
  React.useEffect(() => {
    window.ShapeNav?.announce?.(chatNavDetail ? { detail: chatNavDetail } : null);
    return () => window.ShapeNav?.announce?.(null);
  }, [JSON.stringify(chatNavDetail)]);
```

(If `openChat`'s channel shape differs — inspect how `openChannelNow` builds it at line ~12690 — announce whatever `chatRequest.channel` needs to replay, since `setChatRequest({ channel })` is the re-entry point.)

**Announce collision rule:** exactly one surface announces at a time — Settings only renders as a takeover (Eat/Me unmount beneath it is NOT true: the shell early-returns, so the tab component unmounts → its cleanup runs → announce(null) → Settings announces. Verified by the unmount cleanup in each effect above.)

- [ ] **Step 5: Verify + commit**

Parse + `npm test` + `/m/` build. Manual dev check (optional but cheap): in the browser console, `window.ShapeNav.push()` while on Eat→Grocery, jump home, `window.ShapeNav.back()` → returns to Eat with grocery view.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nav): announce register + wave-1 replayable set (Settings subs · Eat views · Me pages · chat threads)"
```

---

### Task 6: Hardware/browser back — the guard-entry bridge

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSClientAppInner` (the Task-2 block).

**Interfaces:**
- Consumes: `navBack()`, `navPush()`, `bsGuardAfterPush/Pop`.
- Produces: hardware/browser back pops the stack; empty stack → platform default.

- [ ] **Step 1: Split the history side-effect out of `navBack` with an `armedRef`**

Replace the Task-2 `navPush`/`navBack` history calls with ref-tracked arming (an on-screen back must NOT re-arm — the guard entry wasn't consumed; a popstate-driven back MUST re-arm):

```js
  const navArmedRef = React.useRef(false);
  const navPush = () => {
    const prev = bsNavSize();
    const changed = bsNavPush(bsNavCompose(navLoc()));
    if (changed && bsGuardAfterPush(prev, bsNavSize()) === 'arm' && !navArmedRef.current) {
      try { window.history.pushState({ shapeNav: true }, ''); navArmedRef.current = true; } catch (e) {}
    }
    return changed;
  };
  const navBack = (fromPopstate = false) => {
    if (!bsNavCanPop()) return false;
    const loc = bsNavPop();
    if (fromPopstate) {
      // the browser just consumed the guard entry
      if (bsGuardAfterPop(bsNavSize()) === 'rearm') { try { window.history.pushState({ shapeNav: true }, ''); } catch (e) {} }
      else navArmedRef.current = false;
    }
    navResolve(loc);
    return true;
  };
```

- [ ] **Step 2: The popstate listener** (new effect in `BSClientAppInner`)

```js
  React.useEffect(() => {
    const onPop = () => {
      if (!navArmedRef.current) return;         // not our guard entry
      if (!navBackRef.current(true)) navArmedRef.current = false; // raced empty — disarm
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
```

`navBackRef` is a ref updated each render (`const navBackRef = React.useRef(navBack); navBackRef.current = navBack;`) so the once-registered listener always calls the fresh closure — same reason `window.ShapeNav` re-assigns per render.

- [ ] **Step 3: Verify + commit**

Parse + `npm test` + `/m/` build. Dev check in a browser: jump home→settings, press browser back → settings closes back to home; another back leaves the page (platform default).

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(nav): hardware/browser back rides the stack via a single guard entry"
```

---

### Task 7: Gates, docs, PR

**Files:**
- Modify: `docs/WORKLOG.md` (dated entry + Latest note), `src/lib/warroom.ts` (flip the back-button item's status note to "PR A shipped; PR B coach parity + PR C gestures next").

- [ ] **Step 1: Full gate run** — JSX parse · `npx tsc --noEmit` · `VITE_BASE=/m/` build exit 0 · `npm test` (all files) · `grep -c $'\r'` = 0 on every touched file.
- [ ] **Step 2: Browser-driven staging pass** (the spec §8 chains): search → profile → back · notification/market → back · goals → edit-profile → back · **Settings sub-page → editProfile → back lands on the sub-page** · chat thread → back · hardware back walks a chain then exits at empty.
- [ ] **Step 3: WORKLOG entry + War Room update; commit; push; open the PR** (base `main`); CI green + CodeRabbit findings addressed + Codex threads resolved before squash-merge.

## Self-Review Notes

- Spec coverage: §1 spine → Task 1; §2 resolver + register → Tasks 2 + 5; §3 pushes/smart-backs → Tasks 3 + 4; §5 guard bridge → Task 6; §8 verification → Task 7. §4 (gestures) + coach shells are PRs C/B — out of this plan by design.
- Type consistency: descriptor `{ tab, overlay?, sub?, detail? }` everywhere; `navBack(fromPopstate?)` defined in Task 6 supersedes Task 2's inline history calls (Task 2's note flags this).
- No placeholders: the one "find the declaration" instruction (Me's `showReconcile`/`showRecord` seeds) names the exact pattern (`useStateBSC(false)` → seed from `initialPage`) and both target names.
