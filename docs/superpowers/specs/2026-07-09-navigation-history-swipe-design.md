# Navigation history + swipe gestures — design

**Date:** 2026-07-09 · **Status:** DRAFT — awaiting owner go
**Owner decisions taken:** swipe = BOTH (left-edge swipe back + content swipe between tabs); Android hardware / browser back rides the same stack.

## The problem

The mobile app navigates by **component state, with no history anywhere** (zero
`pushState`/`popstate` in the bundle). Three layers stack up:

1. **Shell** (`BSClientAppInner` + the two coach shells): the `tab` state plus
   full-screen takeovers (Settings, Calendar, Search) rendered as early returns.
2. **Tab components**: each root tab holds its own sub-view state (Eat →
   grocery/library/recipes; Me → library/score/record/progress/goals; Chat →
   open thread; Train → preview/live session).
3. **Deep sub-views**: pages inside pages (Terrain profile → follow list →
   public profile; the Listing → calendar/full profile).

Every back button hardcodes its destination (**157 `onBack` sites** in
`iosAppBroadsheetClient.jsx` alone; 35 `BSDetailHeader` consumers + 2 in
Habits). That is fine for in-context "up" (grocery → Eat day). It breaks on
**cross-context jumps** — the `shape:openMarket / openProfile / editProfile /
openIntegrations / openConversation / openSearch` window events, notification
taps, search-row taps, and the `goChat/goScore/goMarket` helpers — where the
destination has no idea where the user came from. This is the
"Goals → Edit → Settings → back couldn't return" bug class (patched ad hoc
once in #1567-era; the class remains). There is also no swipe navigation and
the Android hardware back / browser back exits the app.

## Approaches considered

- **A. Descriptor stack + replay (CHOSEN).** A small pure history stack of
  serializable *location descriptors*; the shell knows how to re-open any
  descriptor through the exact entry points that exist today (`setTab`, the
  takeover setters, `chatRequest`, `storeView`, `settingsStart`, …). Back =
  pop + replay. Surgical: no page component changes its internal model.
- **B. Full hash-router rewrite.** URL-driven routes for every surface (the
  website SPA pattern); browser history free. Correct long-term but a
  multi-wave rewrite of a ~10k-line state machine — rejected for this wave;
  descriptors are designed so a future wave *could* serialize them into the
  hash.
- **C. Component-registered restore callbacks.** Each surface registers a
  closure to restore itself. Rejected: closures don't survive unmounts
  (takeovers unmount the page behind them — the exact case to fix).

## Design

### 1. The spine — `mobile-app/src/services/navHistory.mjs` (pure, tested)

- A bounded stack (cap 30) of **location descriptors**:
  `{ tab, overlay?, sub?, detail? }` — plain JSON, replayable.
- API: `push(loc)` · `pop()` · `peek()` · `canPop()` · `replaceTop(loc)` ·
  `clear()` · `size()`. Pushing a descriptor deep-equal to the top is a no-op
  (re-render/double-fire guard).
- Window-exposed from the chrome as **`window.ShapeNav`** (the proLedger /
  ledger-kit pattern) so the client module, the pros module, and the shared
  chrome all ride ONE stack.
- Unit vectors in `tests/nav-history.test.mjs` (push/pop/cap/dedupe/replace/
  clear).

### 2. Replay — the shell owns it

Each shell registers a resolver `ShapeNav.onNavigate(loc => …)` that maps a
descriptor onto today's entry points. Examples:
`{tab:'eat'}` → `setTab('eat')`; `{tab:'me', overlay:'settings',
sub:'edit-profile'}` → `setSettingsStart('edit-profile');
setShowSettings(true)`; `{tab:'chat', detail:{conversationId}}` →
`setChatRequest(…); setTab('chat')`. **`bsNavBack()`** = `pop()` → resolver.

**Honest scope line:** a replayed descriptor re-opens a surface the same way
today's events open it. Deep in-page state (scroll position, half-typed
forms, a partially-scrubbed chart) is NOT restored — identical to what any
`shape:*` jump does today.

### 3. What pushes (the scope limiter)

- **Cross-context jumps push** the *current* location before jumping: all six
  `shape:*` event handlers, notification taps, search-row taps, the
  `goChat/goScore/goMarket/goEditProfile/goIntegrations` helpers when invoked
  as jumps, and the full-screen takeover opens (Settings · Calendar · Search).
- **Tab-bar taps do NOT push** (Android back-navigation guidance: back should
  not traverse bottom-tab taps). Switching tabs leaves the stack alone — and a
  tab *swipe* (§4) is equivalent to a tab tap, so it doesn't push either.
- **In-context "up" backs stay untouched in this wave** — a grocery → Eat-day
  back is already correct. Only *top-of-context* backs get the smart fallback:
  `onBack = () => (window.ShapeNav?.canPop() ? bsNavBack() : legacyBack())`
  — applied to the takeover closes, `BSDetailHeader` consumers whose legacy
  back hardcodes a whole-tab jump, and every surface reachable via a
  cross-jump. The 157-site audit is thereby bounded: sites keeping local "up"
  semantics are listed as no-change in the plan.

### 4. Swipe gestures — one implementation in the shared chrome

- Pure intent classifier **`bsSwipeIntent(sample)`** →
  `'back' | 'prev-tab' | 'next-tab' | null`, unit-tested
  (`tests/swipe-intent.test.mjs`). Inputs: start/end x/y, dt, edge-start flag,
  started-on-horizontal-scrollable flag, sheet-open flag.
- **Edge-back:** touch starts ≤ 24px from the left edge, moves right ≥ 60px,
  |dy| < 40 → `bsNavBack()`; if the stack is empty, fall through to the
  surface's own back; no-op on a root tab with nothing open.
- **Tab swipe:** gesture starts on page content — NOT on a horizontal-scroll
  ancestor (walk `closest()` for `overflow-x: auto|scroll` incl. the
  `.bs-hide-scroll` rails), NOT on chart scrub surfaces (`BSSdTrace`), NOT
  while any sheet is open, NOT in full-screen flows that opt out (the meal
  logger + live session, the `mast={false}` set) — ≥ 70px horizontal,
  |dx| > 2·|dy|, ≤ 600ms → adjacent tab in the root order (Home · Train · Eat
  · Chat · Me). **Only the 5 root tabs participate**; takeovers/detail pages
  get edge-back only. The edge zone wins where both could apply.
- **Motion:** a subtle ~180ms slide on tab swipe via the injected-keyframes
  pattern; `prefers-reduced-motion` renders an instant swap. No new infinite
  loops (house motion rule).
- Gesture layer lives in the shared chrome (`iosAppBroadsheet.jsx`, on the
  shell wrapper around `BSPage`) so both roles get it from one implementation.

### 5. Hardware / browser back

On each stack `push`, mirror one `history.pushState({shapeNav})`; `popstate`
→ `bsNavBack()`. Stack empty → let the platform default run (background the
native app / leave `/m/`). App-shell only — the website is untouched. External
navigations (Stripe checkout `location.assign`) are unaffected.

### 6. Phasing — three PRs

- **PR A — the spine (client):** `navHistory.mjs` + tests · client-shell
  resolver · cross-jump instrumentation · takeover + detail-header smart-backs
  · the hardware-back bridge.
- **PR B — coach parity:** the two pros shells register resolvers on the same
  window spine; coach cross-jumps (`shape:proMessageCoach`,
  `shape:openProSettings`, roster → Case File chains) instrumented.
- **PR C — the gesture layer:** `bsSwipeIntent` + tests · edge-back + tab
  swipe in the shared chrome · the horizontal-surface guard sweep (week
  strips, filter rails, calendar grids, presence rail, category indexes,
  chart scrub) · slide motion + reduced-motion.

### 7. Out of scope

Full state restoration (scroll/forms); URL deep-linking (descriptors are
hash-serializable for a future wave); any website change; changing what any
back button *means* in its local context.

### 8. Verification

Pure vectors for both modules; per-commit JSX parse · `/m/` build · full
`npm test` · LF. Browser-driven pass on staging: the four canonical jump
chains (search → profile → back · notification → market → back · goals →
edit-profile → back · chat thread → Listing → back), tab-swipe on each root
tab including gestures started over a week strip / chart / filter rail
(proving no hijack), hardware back through a chain, and reduced-motion.
**Owner on-device pass** for gesture feel (thresholds are tuning constants in
one place) across Black/Sage/Cream.
