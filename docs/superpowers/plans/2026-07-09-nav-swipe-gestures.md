# Navigation Swipe Gestures (PR C) Implementation Plan

> Executed INLINE by the orchestrator (design-risk task — gesture thresholds +
> DOM-context judgment + browser verification). Written for the record; steps
> still gate on tests/parse/build/LF per commit.

**Goal:** Left-edge swipe = back; content swipe = adjacent root tab — riding the
PR A/B spine (`window.ShapeNav` + the shells' `navBack`), guarded against every
horizontal surface, sheets, and full-screen flows (spec §4; PR A `a65a599e`,
PR B #1645).

**Architecture:** One pure classifier (`swipeIntent.mjs`, unit-tested) + one
chrome component (`BSNavGestures`, listeners on `#bs-phone-surface`, capture
phase, ALWAYS passive — we never preventDefault, so we cannot fight the native
scroll handlers or browser scrolling) that dispatches `shape:navGesture`
`{ intent }` window events. Each shell listens (live-ref pattern) and applies
shell judgment: `back` → `navBack()` falling back to closing its top takeover;
`prev/next-tab` → only when no takeover is open, stepping its OWN tab order,
clamped at the ends (no wrap). A subtle 180ms slide plays on tab swipe via a
keyed wrapper; `prefers-reduced-motion` disables it in CSS (no JS check).

## Grounded facts the design leans on

- The chrome already ships `isInteractiveTarget()` (line ~401) and a
  document-level capture touch handler that deliberately RELEASES horizontal
  gestures (`|dx| > |dy|` → reset) — horizontal is unclaimed territory.
- Chart scrub surfaces use pointer events with `touchAction: 'pan-y'` —
  detectable via computed style. Horizontal rails are `overflow-x` scrollers.
- Sheets portal into `#bs-phone-surface` as high-zIndex (≥5000) absolute
  overlays — a touch "on a sheet" always has such an ancestor, so ONE
  ancestor-walk classifies interactive/scrollable/overlay/opt-out at once.
- `mast={false}` marks full-screen flows (today: the meal logger ×2). BSPage
  will stamp `data-bs-noswipe` automatically for them; `BSSession` (live
  workout, `iosAppBroadsheetClient.jsx:20168`) does not use `mast={false}` and
  gets the attribute explicitly. Opt-out blocks BOTH gestures (an edge-back
  mid-workout would jump to a stale cross-context location).
- Tab orders: client `home·train·eat·chat·me`; trainer
  `today·clients·programs·chat·me`; nutritionist `today·clients·plans·chat·me`.

## Tasks

### 1. `mobile-app/src/services/swipeIntent.mjs` + `tests/swipe-intent.test.mjs`

Pure classifier, exported constants (the on-device tuning knobs, one place):

```js
export const BS_SWIPE = { EDGE_PX: 24, BACK_DX: 60, BACK_DY_MAX: 40, TAB_DX: 70, TAB_RATIO: 2, TAB_MS: 600 };
export function bsSwipeIntent(s) { /* s = { x0,y0,x1,y1,dt, blocked } */ }
```

Rules: `blocked` (interactive/scrollable-x/overlay/opt-out — the DOM walk's one
boolean) → null. Edge zone wins: `x0 ≤ EDGE_PX && dx ≥ BACK_DX && |dy| < BACK_DY_MAX`
→ `'back'` (no dt cap — a slow deliberate edge-drag still means back).
Else tab: `|dx| ≥ TAB_DX && |dx| > TAB_RATIO·|dy| && dt ≤ TAB_MS` →
`dx < 0 ? 'next-tab' : 'prev-tab'`. Else null. Vectors: each rule edge,
the edge-zone-wins overlap, the blocked short-circuit, slow-drag tab rejection,
diagonal rejection. Register in the package.json test list.

### 2. Chrome — `BSNavGestures` + the BSPage stamp (`iosAppBroadsheet.jsx`)

- `BSPage` root gains `...(mast ? {} : { 'data-bs-noswipe': '' })`.
- `BSNavGestures`: `touchstart/touchend` capture-phase passive listeners on
  `#bs-phone-surface`. At touchstart, ONE walk from `event.target` up to the
  surface computes `blocked`: `isInteractiveTarget(target)` ‖ any ancestor with
  (computed `overflow-x` auto/scroll AND `scrollWidth > clientWidth + 2`) ‖
  computed `touchAction` matching `none|pan-y|pan-x` ‖ computed zIndex ≥ 500 with
  position absolute/fixed (sheet/overlay) ‖ `closest('[data-bs-noswipe]')`.
  At touchend, classify via `bsSwipeIntent` and dispatch
  `window.dispatchEvent(new CustomEvent('shape:navGesture', { detail: { intent } }))`.
  Multi-touch cancels. Injects the slide keyframes once
  (`bsNavSlideL/R`: `translateX(∓24px)+opacity 0 → 0/1`, 180ms ease-out) with a
  `@media (prefers-reduced-motion: reduce) { animation: none !important }` guard
  — CSS-only reduced-motion, no JS branch. Window-exported with the chrome kit.

### 3. Shells ×3 (client / trainer / nutritionist)

Each shell: render `<BSNavGestures />` once (inside the root wrapper, before the
tab bar); a `shape:navGesture` listener reading through the live jump ref
(`navJumpRef.current.onGesture = (intent) => {…}` — the PR A stale-closure
lesson); handler judgment:

- `'back'` → `if (!navBack()) closeTopTakeover()` — the same per-takeover
  setters the smart-backs use; root tab + empty stack + nothing open → no-op.
- `'prev-tab' / 'next-tab'` → ONLY when no takeover is open: step the shell's
  tab array from the current index, clamped; set `pendingSlideRef.current`
  = `'L'|'R'`; `setTab(next)`.
- `{screens[tab]}` wraps in `<div key={tab} className={pendingSlide ? 'bs-nav-slide-'+dir : undefined}>`
  — the key remount is free (tabs already remount on switch); a tab TAP renders
  with no class (instant, current behavior). The ref clears after consumption.

### 4. Verification (the real gate) + docs + PR

- Gates per commit: parse ×(client/pros/chrome) · `tsc` · `/m/` build ·
  `npm test` · `tr -cd '\r' | wc -c` = 0.
- Browser (all three shells, touch emulation): tab swipe L/R walks the tab
  order and clamps at the ends; a swipe starting ON a week strip / filter rail /
  chart scrub does NOT switch tabs (and the rail still scrolls); edge-swipe
  goes back through a jump chain; sheet open → both gestures dead; meal logger
  (`mast={false}`) + live session → both gestures dead; reduced-motion emulation
  → instant swap; vertical scrolling never misfires a gesture.
- WORKLOG + War Room (flip the swipe item, note the on-device tuning pass —
  thresholds live in `BS_SWIPE`); PR against main; CI + CodeRabbit + Codex
  gauntlet before squash-merge; owner on-device pass rides this PR's follow-up.
