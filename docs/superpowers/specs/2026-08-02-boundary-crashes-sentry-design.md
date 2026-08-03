# Boundary-caught React crashes → Sentry

**Date:** 2026-08-02 · **Branch:** `claude/sentry-boundary-crashes` (off
`claude/error-tracking-layer-1-sentry`, which is unmerged and carries the SDK
wiring this depends on) · **Own PR**, based against the layer-1 branch.

Companion to `2026-07-31-error-tracking-design.md` (Layer 1). Scope approved by
the owner 2026-08-02: **mobile + web boundaries; no per-surface split of `/m/`**
(that is a product/UX change registered as a possible future wave, not built here).

## Problem

The `/m/` mobile app's single error boundary (`BSErrorBoundary`,
`mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx:2261`) is the thing that
*prevents* white screens — and precisely because it catches the error, the
error never reaches `window.onerror`, so Sentry's global handlers will never
see it. Boundary-caught render crashes (the TDZ / hook-order class this repo
has shipped: #1781) currently go to `localStorage` and nowhere else.

The Next.js app (`/dashboard`, `/console`) has **no** error components at all —
no `error.tsx`, no `global-error.tsx`. A client render crash there shows Next's
unbranded default page and reports nothing, permanently.

The static website needs **no change**: it has no boundaries, so render crashes
rethrow to `window.onerror`, which the already-shipped `sentryInit.js` global
handlers cover once a DSN exists.

## Design

Everything below is inert without a DSN, like the whole layer-1 branch: with
`Sentry.init({dsn:''})` every `capture*` call is a documented no-op.

### Mobile (`/m/`)

One new **total** function in `mobile-app/src/sentry.mjs` (the only module
allowed to touch the SDK on mobile — house pattern, every call individually
`try/catch`-wrapped so error tracking can never take the app down):

```js
bsCaptureBoundaryError(err, info)   // never throws
```

- Uses `SentryReact.captureReactException(err, info, { mechanism: { handled: true } })`
  — verified exported by `@sentry/react` 10.60.0 (probed under Node's native
  ESM loader 2026-08-02). It attaches the React component stack as the event's
  `react` context, so the event names the component that crashed. `handled:
  true` because the boundary shows a recovery card — the session continues.
- Every boundary capture carries the tag **`crash_type: 'boundary'`** (scoped
  capture — the tag must not leak onto unrelated events). ⚠ **Documented
  tradeoff, owner call 2026-08-02:** `handled: true` means these events do
  NOT count against Sentry's crash-free session rate, so a recurring render
  crash that white-cards a feature would stay invisible in release health.
  The tag is the compensating control — it keeps boundary crashes filterable
  and alertable (an issue alert on `crash_type = boundary` is an owner-side
  option once the org exists). Do not "fix" this later by flipping to
  `handled: false` without revisiting that decision — it was made explicitly.
- Called from `componentDidCatch` (`iosAppBroadsheetMain.jsx:2264`), alongside
  the existing `bsRecordError`. The fallback card (Copy / Reload / Restart) is
  unchanged.
- ⚠ **The capture call must NOT go inside `bsRecordError`.** The
  `window.addEventListener('error'/'unhandledrejection')` paths also call
  `bsRecordError`, and Sentry's own global handlers already capture those —
  wiring capture into the shared recorder would double-report every uncaught
  error once a DSN exists. Boundary path only.

### Web (Next App Router — covers `/dashboard`, `/console`, everything under `src/app`)

Two new client components, Sentry's documented App Router pattern:

- `src/app/error.tsx` — root error boundary. Renders a small branded
  "Something went wrong" card **inside** the root layout, with a "Try again"
  button wired to Next's `reset()`. Captures via
  `Sentry.captureException(error, { tags: { crash_type: 'boundary' } })` in a
  `useEffect` keyed on the error — same tag and same release-health tradeoff
  as the mobile seam (see above).
- `src/app/global-error.tsx` — last resort, mounts only when the root layout
  itself crashes. Must render its own `<html><body>`; dependency-free inline
  styles (no theme, no layout — nothing above it survived). Same capture.
- Import form: `import * as Sentry from '@sentry/nextjs'` — same namespace form
  as the cron route, and legitimate for the same reason: these files only ever
  run through Next's bundler. The mount test compiles them in memory and maps
  `@sentry/nextjs` to a recording stub via the harness registry, so the
  CJS-under-`node --test` landmine (see WORKLOG 2026-08-01) is not in play.
- English-only copy, matching the rest of the Next app surfaces.

### Mount tests (the non-negotiable)

Render-time crashes pass parse, tsc, the suite and the build — a boundary fix
that isn't mounted is unverified. New test file
`tests/error-boundary-mount.test.mjs`, reusing the in-memory-compile pattern
from `tests/broadsheet-render.test.mjs` (JSX→CJS via Next's bundled babel,
relative imports resolved to the REAL modules, module-local components exposed
by an appended `export` line on the in-memory copy — the shipping file is
untouched). Difference from the existing harness: these tests need a **client**
mount — `componentDidCatch` never runs under `renderToString` — so they use
`jsdom` (already at the repo root) + `react-dom/client`'s `createRoot` +
React 19's `act`.

1. **Mobile boundary mount:** compile the real `iosAppBroadsheetMain.jsx`, map
   its sentry-module import to a spy that records and delegates to the real
   (inert) implementation, mount `<BSErrorBoundary><Bomb/></BSErrorBoundary>`
   where `Bomb` throws mid-render. Assert: the fallback card rendered (its
   copy is in the DOM), the spy received the error **and** a component stack,
   and nothing escaped the mount. The module's top-level
   `createRoot(document.getElementById('root'))` executes against the jsdom
   document with a real `#root` div present.
2. **Web error components mount:** compile `error.tsx` / `global-error.tsx`
   (babel preset-typescript + preset-react), map `@sentry/nextjs` to a
   recording stub, mount with a thrown error prop. Assert: fallback UI
   rendered, `captureException` called with that error and the
   `crash_type: 'boundary'` tag, `reset` fires on click.
3. **Envelope unit test:** call the real `bsCaptureBoundaryError` with
   `@sentry/react` initialized against a mock transport (no network, no DSN
   leak). Assert the outgoing event carries the component stack, the
   `crash_type: 'boundary'` tag and `mechanism.handled: true` — proving the
   seam produces a real event, not just that it was called.
4. **Dedupe verification (owner requirement 2026-08-02 — verify, don't
   assume):** in the same mock-transport test, fire the identical capture
   twice consecutively and assert exactly **one** envelope leaves — proving
   `dedupeIntegration` is active and a render
   loop can't burn the monthly quota in minutes. If this test comes back red,
   `bsCaptureBoundaryError` gains a local guard (suppress a repeat of the
   same message + stack) and the test then asserts the guard instead. Two
   honest limits, recorded so they aren't rediscovered: Sentry's dedupe only
   suppresses **consecutive identical** events (A-B-A alternation passes
   through), and this verifies the shared core integration on the mobile SDK
   — the web SDK uses the same core dedupe but is not separately unit-tested
   here (it cannot initialize under `node --test`; see the CJS landmine).

Runner: the existing `npm test` glob (`node --test "tests/**/*.test.mjs"`)
picks the file up with no config change.

### Deliberate crash triggers (shipped in this PR so the end-to-end gate is runnable)

The end-to-end gate below needs a way to throw a real render crash on demand.
Both triggers ship here, inert unless explicitly invoked:

- **Mobile:** `?crash=1` on the `/m/` URL — the same pattern as the existing
  `?mem=1` memory HUD. When present, a probe component that throws a
  distinctive error (`"Deliberate crash test (mobile boundary)"`) renders
  inside the boundary. One-shot: no localStorage persistence, so a reload
  without the param recovers. The param check lives in a tiny pure helper so
  the trigger logic is unit-testable without a mount.
- **Web:** `src/app/dashboard/crash-test/page.tsx` — a client component that
  throws `"Deliberate crash test (web boundary)"` on render. Deliberately
  **inside the gated `/dashboard` area** so anonymous visitors and crawlers
  can't hit it and generate Sentry noise once a DSN exists.

### Explicitly out of scope

- Per-surface boundaries inside the `/m/` role apps (product call — deferred).
- Static-website boundaries (global handlers already cover reporting there).
- User context on the two web surfaces (already a registered layer-1 follow-up).
- Any change to `bsRecordError`, the window listeners, or the fallback card UX.

## Verification gates

`npx tsc --noEmit` clean · `npm test` green (including the four tests above)
· mobile parse-check on the edited `.jsx` · `next build` clean · CI green on
the PR · Codex review present per the merge gate.

**End-to-end gate (owner requirement 2026-08-02 — the delivery check, not the
seam check).** Every gate above passes with a broken DSN, a wrong project
slug, or an org that doesn't exist — a mocked transport proves the seam, not
the delivery (the same rule set for Layer 2's alert routing). Therefore,
**once a real DSN exists** (owner step — the org does not exist yet, so this
gate is deferred, not skipped): fire both deliberate crash triggers — `?crash=1`
on `/m/` and `/dashboard/crash-test` — and confirm each event arrives in the
**correct project** (`shape-mobile` and `shape-web` respectively) with a
**symbolicated, readable exception stack** and the React component-stack
context attached. Honest limit: the `react.componentStack` context is a
client-generated string, so component names in it may be minified in
production bundles — the symbolicated exception stack is the readability
guarantee; the distinctive crash-test messages are the arrival guarantee.
This work is not DONE until this gate has run, even if the PR merges first
(it ships inert by design). Track it beside the layer-1 runbook's
four-path verification.
