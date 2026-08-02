# Boundary-Caught React Crashes → Sentry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route boundary-caught React render crashes to Sentry on both the `/m/` mobile app and the Next.js app, with deliberate crash triggers for the post-DSN end-to-end gate, verified by real client mounts.

**Architecture:** A new total (never-throws) seam `bsCaptureBoundaryError` in `mobile-app/src/sentry.mjs` called from the existing `BSErrorBoundary.componentDidCatch`; new `src/app/error.tsx` + `src/app/global-error.tsx` sharing an inline-styled `ErrorCard`; two crash triggers (`?crash=1` on `/m/`, `/dashboard/crash-test` on web). Tests compile the real shipping modules in memory (JSX/TSX → CJS) and mount them with `jsdom` + `react-dom/client` + `React.act`, because `componentDidCatch` never runs under `renderToString`.

**Tech Stack:** `@sentry/react` 10.60.0 + `@sentry/capacitor` 4.2.0 (mobile), `@sentry/nextjs` 10.69.0 (web), React 19.2.8, `node --test`, `jsdom` (root devDependency), Next's bundled babel (`preset-react`, `preset-typescript`, `plugin-transform-modules-commonjs`).

**Spec:** `docs/superpowers/specs/2026-08-02-boundary-crashes-sentry-design.md` — read it first.

## Global Constraints

- Branch: `claude/sentry-boundary-crashes` (exists, based on `claude/error-tracking-layer-1-sentry`). The eventual PR's **base is `claude/error-tracking-layer-1-sentry`**, not `main` — this stacks on unmerged SDK wiring.
- Everything ships **inert**: no DSN exists anywhere. Never put a DSN-shaped string in code or tests except the documented fake `https://public@dedupe.invalid/1` (gitleaks CI scans the tree).
- Capture on the **boundary path only** — never inside `bsRecordError` (the window `error`/`unhandledrejection` listeners also call it and Sentry's global handlers already cover those; wiring capture there double-reports once a DSN exists).
- Every capture carries tag `crash_type: 'boundary'`, applied in an isolated scope so it never leaks onto unrelated events. `mechanism.handled` stays `true` — explicit owner call 2026-08-02 (release-health tradeoff documented in the spec); do not flip it.
- `mobile-app/src/sentry.mjs` is the **only** mobile module allowed to touch the SDK, and every exported function is wrapped in its own `try/catch` (a reporting failure must never take the app down).
- ⚠ Windows Edit/Write tooling can emit CRLF and stray NUL bytes. After every file edit/create, from repo root: `sed -i 's/\r$//' <file>` then verify `LC_ALL=C tr -cd '\000' < <file> | wc -c` prints `0`.
- Git: **explicit paths on every `git add`** — never `git add .`, never `commit -a`. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Parse-check any edited mobile `.jsx` before committing: `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`
- Run tests from repo root. Whole suite: `npm test`. One file: `node --test tests/<file>.test.mjs`.
- No `gh` CLI. The PR is opened via the GitHub REST API using git's stored token (Task 6 shows how).
- ⚠ `import * as Sentry from '@sentry/nextjs'` yields `undefined` named exports under Node's native ESM loader (CJS packaging + `cjs-module-lexer`). Web `.tsx` files may use the namespace form (they only run through Next's bundler); **tests must map `@sentry/nextjs` to a stub via the loader registry**, never import it natively.
- ⚠ `@sentry/capacitor`'s ESM build does not load under Node (extensionless internal imports). Tests reach it only as CJS via `createRequire` from a `mobile-app/src/` path.

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `tests/helpers/load-real-module.mjs` | Create | Shared in-memory JSX/TSX→CJS compiler + registry loader (generalizes the `broadsheet-render.test.mjs` pattern; that file is NOT touched) |
| `mobile-app/src/sentry.mjs` | Modify | New export `bsCaptureBoundaryError(err, info)` |
| `tests/sentry-boundary-seam.test.mjs` | Create | Envelope + tag + mechanism + dedupe + totality unit tests (mock transport) |
| `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx` | Modify | `componentDidCatch` wiring; `?crash=1` trigger (`bsCrashTestRequested` + `BSCrashProbe`) |
| `tests/error-boundary-mount.test.mjs` | Create | Mobile: real `BSErrorBoundary` client-mounted, crash probe, composition check |
| `src/components/ErrorCard.tsx` | Create | Shared inline-styled crash card (inline styles because `global-error` renders with no stylesheet) |
| `src/app/error.tsx` | Create | Root error boundary UI + tagged capture |
| `src/app/global-error.tsx` | Create | Root-layout-crash fallback (own `<html><body>`) + tagged capture |
| `src/app/dashboard/crash-test/page.tsx` | Create | Gated web crash trigger, armed post-hydration |
| `tests/web-error-boundary.test.mjs` | Create | Web components client-mounted: card, capture+tag, reset, SSR-safety of trigger |
| `docs/WORKLOG.md` | Modify | Dated entry incl. deferred e2e gate instructions |

---

### Task 1: Shared loader helper + mobile capture seam (envelope, tag, mechanism, dedupe, totality)

**Files:**
- Create: `tests/helpers/load-real-module.mjs`
- Create: `tests/sentry-boundary-seam.test.mjs`
- Modify: `mobile-app/src/sentry.mjs` (append one function at end of file)

**Interfaces:**
- Produces: `loadRealModule(srcPath, { registry, appendExports, typescript })` → compiled module's exports (used by Tasks 2 and 4). Registry: `Map<specifier, moduleObject>`; unmapped **relative** specifiers resolve to the real module via native `import`; unmapped **bare** specifiers resolve via `createRequire(srcPath)` (CJS).
- Produces: `bsCaptureBoundaryError(err, info)` in `mobile-app/src/sentry.mjs` — total; `info` is React's errorInfo (`{ componentStack }`) or null.

- [ ] **Step 1: Write the loader helper**

```js
// tests/helpers/load-real-module.mjs
//
// Compile a REAL shipping module (JSX/TSX, Vite-style ESM) to CJS in memory and
// evaluate it with its imports resolved from a registry — the pattern proven in
// broadsheet-render.test.mjs, generalized: TSX support, bare-specifier
// resolution via createRequire from the SOURCE file's location (so
// mobile-app/node_modules wins for mobile sources), and caller-supplied
// registry overrides. No source file is written or copied — what runs here is
// the shipping code.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const presetTs = require_('next/dist/compiled/babel/preset-typescript');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');

export async function loadRealModule(srcPath, { registry = new Map(), appendExports = '', typescript = false } = {}) {
  const dir = dirname(srcPath);
  const srcRequire = createRequire(pathToFileURL(srcPath));
  // import.meta.env is Vite's build-time injection; substitute like the bundler.
  const source = `${readFileSync(srcPath, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\n${appendExports}\n`;
  const { code } = babel.transformSync(source, {
    presets: typescript ? [[presetTs, { isTSX: true, allExtensions: true }], presetReact] : [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: srcPath,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    if (spec.startsWith('.') || spec.startsWith('/')) {
      registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
    } else {
      // Bare specifier: resolve as CJS from the source file's node_modules.
      registry.set(spec, srcRequire(spec));
    }
  }
  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    return registry.get(spec);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}
```

- [ ] **Step 2: Write the failing seam test**

```js
// tests/sentry-boundary-seam.test.mjs
//
// The seam check, not the delivery check: a mock transport proves
// bsCaptureBoundaryError produces a real Sentry event with the component
// stack, the crash_type tag and mechanism.handled — and that Sentry's dedupe
// suppresses an identical consecutive capture (a render loop must not burn
// the monthly quota). Delivery is the deferred post-DSN e2e gate (spec).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SENTRY_SRC = join(ROOT, 'mobile-app', 'src', 'sentry.mjs');
// The SAME CJS instances the compiled module will receive — client state is
// shared, so init here is visible to the seam's capture call.
const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const SentryReact = mobileRequire('@sentry/react');
const SentryCapacitor = mobileRequire('@sentry/capacitor');

globalThis.window = globalThis; // sentry.mjs and the SDK expect a window-ish global

const registry = new Map([
  ['@sentry/react', SentryReact],
  ['@sentry/capacitor', SentryCapacitor],
]);
const MOD = await loadRealModule(SENTRY_SRC, { registry });

const envelopes = [];
// Documented fake DSN (spec) — with dsn:'' no client exists and capture is a
// no-op, so the test NEEDS a syntactically valid dummy. Mock transport: no
// network is ever constructed.
SentryReact.init({
  dsn: 'https://public@dedupe.invalid/1',
  defaultIntegrations: undefined, // keep SDK defaults, incl. dedupe
  transport: () => ({
    send: (envelope) => { envelopes.push(envelope); return Promise.resolve({}); },
    flush: () => Promise.resolve(true),
  }),
});

function eventsSent() {
  // Envelope = [headers, items]; item = [itemHeaders, payload].
  return envelopes
    .flatMap((env) => env[1])
    .filter((item) => item[0].type === 'event')
    .map((item) => item[1]);
}

test('a boundary capture produces a real event: component stack, tag, mechanism', async () => {
  const err = new Error('seam probe');
  MOD.bsCaptureBoundaryError(err, { componentStack: '\n    at Bomb\n    at BSApp' });
  await SentryReact.flush(2000);
  const events = eventsSent();
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.tags?.crash_type, 'boundary');
  assert.match(String(ev.contexts?.react?.component_stack ?? ev.contexts?.react?.componentStack ?? ''), /Bomb/);
  const mech = ev.exception?.values?.[0]?.mechanism;
  assert.equal(mech?.handled, true);
});

test('the identical consecutive capture is deduped — one envelope total', async () => {
  const before = eventsSent().length;
  const err = new Error('dedupe probe');
  const info = { componentStack: '\n    at Bomb' };
  MOD.bsCaptureBoundaryError(err, info);
  MOD.bsCaptureBoundaryError(err, info);
  await SentryReact.flush(2000);
  assert.equal(eventsSent().length, before + 1,
    'dedupeIntegration inactive — add the local same-message+stack guard per spec');
});

test('the crash_type tag does not leak onto unrelated events', async () => {
  const before = eventsSent().length;
  SentryReact.captureMessage('unrelated');
  await SentryReact.flush(2000);
  const events = eventsSent();
  assert.equal(events.length, before + 1);
  assert.equal(events[events.length - 1].tags?.crash_type, undefined);
});

test('total: never throws, even with garbage input', () => {
  assert.doesNotThrow(() => MOD.bsCaptureBoundaryError(null, null));
  assert.doesNotThrow(() => MOD.bsCaptureBoundaryError(undefined, { componentStack: 42 }));
});
```

- [ ] **Step 3: Run it — expect FAIL** (`bsCaptureBoundaryError` is not a function): `node --test tests/sentry-boundary-seam.test.mjs`

- [ ] **Step 4: Implement the seam** — append to `mobile-app/src/sentry.mjs`:

```js
/**
 * Report a BOUNDARY-CAUGHT render crash. Called from BSErrorBoundary's
 * componentDidCatch and nowhere else — the window error/unhandledrejection
 * paths are already covered by the SDK's global handlers, so wiring this into
 * bsRecordError would double-report every uncaught error once a DSN exists.
 *
 * `handled: true` — deliberate owner call (2026-08-02): the boundary shows a
 * recovery card, so the session continues. That keeps these OUT of the
 * crash-free session rate; the `crash_type: 'boundary'` tag is the
 * compensating control that keeps them filterable and alertable. The tag is
 * set in an isolated scope so it never leaks onto unrelated events.
 *
 * ⚠ Never throws, same contract as everything else in this module.
 */
export function bsCaptureBoundaryError(err, info) {
  try {
    SentryReact.withScope((scope) => {
      scope.setTag('crash_type', 'boundary');
      SentryReact.captureReactException(
        err,
        { componentStack: (info && typeof info.componentStack === 'string' && info.componentStack) || '' },
        { mechanism: { handled: true } }
      );
    });
  } catch (e) {
    // Swallowed — no report for this crash, but the recovery card still shows.
  }
}
```

If the mechanism assertion fails (hint not honored by `captureReactException` in 10.60.0), replace the inner call with:

```js
SentryReact.captureException(err, {
  captureContext: { contexts: { react: { componentStack: (info && info.componentStack) || '' } } },
  mechanism: { type: 'react.errorBoundary', handled: true },
});
```

If the dedupe test fails, add a module-level guard (and flip that test to assert the guard):

```js
let _bsLastBoundaryKey = '';
// inside the try, before withScope:
const key = `${(err && err.message) || ''}|${(err && err.stack) || ''}`;
if (key === _bsLastBoundaryKey) return;
_bsLastBoundaryKey = key;
```

- [ ] **Step 5: Run to PASS:** `node --test tests/sentry-boundary-seam.test.mjs` — all 4 pass. Then LF-normalize + NUL-scan all three files (Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/load-real-module.mjs tests/sentry-boundary-seam.test.mjs mobile-app/src/sentry.mjs
git commit -m "feat(sentry): bsCaptureBoundaryError seam — tagged, handled, dedupe-verified

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire componentDidCatch + mobile mount test

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx` (import at top; `componentDidCatch` at ~line 2264)
- Create: `tests/error-boundary-mount.test.mjs`

**Interfaces:**
- Consumes: `bsCaptureBoundaryError` (Task 1), `loadRealModule` (Task 1).
- Produces: `BSErrorBoundary` exposed to tests via appended export (in-memory only). Task 3 extends the same test file.

- [ ] **Step 1: Write the failing mount test**

```js
// tests/error-boundary-mount.test.mjs
//
// MOUNT the real BSErrorBoundary — componentDidCatch never runs under
// renderToString, so this is a real client mount: jsdom + react-dom/client +
// React.act. What mounts is the shipping class from iosAppBroadsheetMain.jsx,
// compiled in memory; the sentry seam import is wrapped with a recorder that
// DELEGATES to the real (inert — no client initialized here) implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetMain.jsx');
const SENTRY_SRC = join(ROOT, 'mobile-app', 'src', 'sentry.mjs');

// Real browser environment for the client renderer.
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="host"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.location = dom.window.location; // bare `location` reads in module code
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
// React 19: without this flag every act() call logs a console.error, which
// the trapped-console assertions below would count as a real fault.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

// The REAL seam (inert: no Sentry client in this file), via the same compile
// path as the seam test, wrapped with a recorder so the wiring is observable.
const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const realSentry = await loadRealModule(SENTRY_SRC, {
  registry: new Map([
    ['@sentry/react', mobileRequire('@sentry/react')],
    ['@sentry/capacitor', mobileRequire('@sentry/capacitor')],
  ]),
});
const captured = [];
const sentrySpy = {
  ...realSentry,
  bsCaptureBoundaryError: (err, info) => { captured.push({ err, info }); realSentry.bsCaptureBoundaryError(err, info); },
};

// Module-level side effect: Main.jsx calls createRoot(#root).render(...) at
// load. Record it instead of mounting the whole app (BSApp drags role-bundle
// dynamic imports and network fetches) — the recorded element proves the
// shipping composition; the boundary itself is mounted for real below.
const rootRenders = [];
const reactDomClientStub = {
  createRoot: (container) => ({ render: (el) => rootRenders.push({ container, el }), unmount: () => {} }),
};

const MOD = await loadRealModule(MAIN_SRC, {
  registry: new Map([
    ['react', React],
    ['react-dom/client', reactDomClientStub],
    ['../sentry.mjs', sentrySpy],
    // i18n init is environment setup, not the code under test — deterministic stub.
    ['../i18n/index.js', { initI18n: () => {}, applyDir: () => {}, i18n: { t: (k, o) => (o && o.defaultValue) || k, changeLanguage: () => {} } }],
    // JSX sibling, never rendered by these tests (native import can't parse JSX).
    ['./BSLanguagePicker.jsx', { default: () => null }],
    ['react-i18next', { I18nextProvider: ({ children }) => children }],
  ]),
  appendExports: 'export { BSErrorBoundary };',
});

// React logs boundary-caught errors via console.error by design; only the
// deliberate bomb may appear — anything else is a real fault.
function withTrappedConsole(allow, fn) {
  const real = console.error;
  const stray = [];
  console.error = (...a) => { const line = a.join(' '); if (!allow.some((rx) => rx.test(line))) stray.push(line); };
  try { return { result: fn(), stray }; } finally { console.error = real; }
}

test('module top-level renders <BSErrorBoundary> at the app root (shipping composition)', () => {
  assert.equal(rootRenders.length, 1);
  assert.equal(rootRenders[0].container, document.getElementById('root'));
  assert.equal(rootRenders[0].el.type, MOD.BSErrorBoundary);
});

test('a render crash is caught: fallback card shows, seam gets error + component stack', () => {
  function Bomb() { throw new Error('mount-test bomb'); }
  const host = document.getElementById('host');
  const root = ReactDOMClient.createRoot(host);
  const { stray } = withTrappedConsole([/mount-test bomb/, /BSErrorBoundary/, /Bomb/], () => {
    React.act(() => {
      root.render(React.createElement(MOD.BSErrorBoundary, null, React.createElement(Bomb)));
    });
  });
  assert.equal(stray.length, 0, stray.join('\n'));
  assert.match(host.textContent, /Something went wrong/);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].err.message, 'mount-test bomb');
  assert.match(String(captured[0].info?.componentStack || ''), /Bomb/);
  React.act(() => root.unmount());
});
```

- [ ] **Step 2: Run — expect FAIL** (`captured.length` is 0: `componentDidCatch` doesn't call the seam yet): `node --test tests/error-boundary-mount.test.mjs`

- [ ] **Step 3: Wire the boundary.** In `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx`:

Add after `import { bsLaunchRoute, ... } from '../services/dailyWire.mjs';` (line 6):

```js
import { bsCaptureBoundaryError } from '../sentry.mjs';
```

Change line ~2264 from:

```js
  componentDidCatch(err, info) { this.setState({ info }); bsRecordError(err, info); }
```

to:

```js
  componentDidCatch(err, info) { this.setState({ info }); bsRecordError(err, info); bsCaptureBoundaryError(err, info); }
```

- [ ] **Step 4: Run to PASS:** `node --test tests/error-boundary-mount.test.mjs`, then the neighbors that load this same file: `node --test tests/broadsheet-identifiers.test.mjs tests/broadsheet-render.test.mjs`

- [ ] **Step 5: Parse-check + normalize:** parse-check `iosAppBroadsheetMain.jsx` (Global Constraints command); LF + NUL check both changed files.

- [ ] **Step 6: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx tests/error-boundary-mount.test.mjs
git commit -m "feat(sentry): boundary-caught crashes on /m/ reach the capture seam — mount-tested

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Mobile crash trigger (`?crash=1`)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx` (helper + probe next to the `?mem=1` HUD block at ~line 2258; one render line in `BSApp` at ~line 2194)
- Modify: `tests/error-boundary-mount.test.mjs` (extend `appendExports` + add tests)

**Interfaces:**
- Produces: `bsCrashTestRequested(search?)` (pure, total) and `BSCrashProbe` (throws `"Deliberate crash test (mobile boundary)"`), both module-local, exposed to tests via the appended export line.

- [ ] **Step 1: Extend the mount test.** In `tests/error-boundary-mount.test.mjs`, change the `appendExports` value to `'export { BSErrorBoundary, bsCrashTestRequested, BSCrashProbe };'` and add:

```js
test('bsCrashTestRequested: pure, total, exact-match on ?crash=1', () => {
  assert.equal(MOD.bsCrashTestRequested('?crash=1'), true);
  assert.equal(MOD.bsCrashTestRequested('?crash=1&mem=1'), true);
  assert.equal(MOD.bsCrashTestRequested('?crash=2'), false);
  assert.equal(MOD.bsCrashTestRequested(''), false);
  // No argument → reads window.location.search (jsdom URL has no params here).
  assert.equal(MOD.bsCrashTestRequested(), false);
});

test('the crash probe is boundary-caught and reported, like any real crash', () => {
  const before = captured.length;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const { stray } = withTrappedConsole([/Deliberate crash test/, /BSErrorBoundary/, /BSCrashProbe/], () => {
    React.act(() => {
      root.render(React.createElement(MOD.BSErrorBoundary, null, React.createElement(MOD.BSCrashProbe)));
    });
  });
  assert.equal(stray.length, 0, stray.join('\n'));
  assert.match(host.textContent, /Something went wrong/);
  assert.equal(captured.length, before + 1);
  assert.equal(captured[before].err.message, 'Deliberate crash test (mobile boundary)');
  React.act(() => root.unmount());
  host.remove();
});
```

- [ ] **Step 2: Run — expect FAIL** (exports missing): `node --test tests/error-boundary-mount.test.mjs`

- [ ] **Step 3: Implement the trigger.** In `iosAppBroadsheetMain.jsx`, insert directly after the `bsInstallMemHud();` call (~line 2259):

```js
// ── Deliberate crash trigger (?crash=1) ─────────────────────────────
// The post-DSN e2e Sentry gate (spec 2026-08-02) needs a real, boundary-caught
// render crash on demand — same URL-param pattern as the ?mem=1 HUD above.
// One-shot by design: nothing persists, so a reload without the param
// recovers. The probe renders INSIDE BSErrorBoundary (via BSApp), so the
// crash exercises the exact componentDidCatch → Sentry path a real fault takes.
function bsCrashTestRequested(search) {
  try {
    return new URLSearchParams(search != null ? search : window.location.search).get('crash') === '1';
  } catch (e) { return false; }
}
function BSCrashProbe() {
  throw new Error('Deliberate crash test (mobile boundary)');
}
```

In `BSApp`'s return (~line 2194), make the probe the first child of the outer `<div>`, before `<BSAppShell ...>`:

```jsx
          {bsCrashTestRequested() && <BSCrashProbe />}
```

- [ ] **Step 4: Run to PASS:** `node --test tests/error-boundary-mount.test.mjs tests/broadsheet-identifiers.test.mjs`

- [ ] **Step 5: Parse-check + normalize** both changed files (Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx tests/error-boundary-mount.test.mjs
git commit -m "feat(sentry): ?crash=1 deliberate crash trigger on /m/ for the post-DSN e2e gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Web error components (`ErrorCard`, `error.tsx`, `global-error.tsx`) + mount test

**Files:**
- Create: `src/components/ErrorCard.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`
- Create: `tests/web-error-boundary.test.mjs`

**Interfaces:**
- Consumes: `loadRealModule` (Task 1).
- Produces: `ErrorCard({ onRetry?: () => void })` default export; `error.tsx` / `global-error.tsx` default exports per Next's App Router contract (`{ error, reset }` props).

- [ ] **Step 1: Write the failing test**

```js
// tests/web-error-boundary.test.mjs
//
// The Next app's error components, client-mounted for real (the capture lives
// in a useEffect — renderToString never runs it). @sentry/nextjs is mapped to
// a recording stub: the real package cannot load under Node's ESM loader (CJS
// packaging — the documented landmine), and these components only ever run
// through Next's bundler in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/dashboard' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.location = dom.window.location;
globalThis.IS_REACT_ACT_ENVIRONMENT = true; // React 19: silences the act() env warning

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const ReactDOMServer = require_('react-dom/server');

const capturedWeb = [];
const sentryNextStub = { captureException: (err, ctx) => capturedWeb.push({ err, ctx }) };

const cardMod = await loadRealModule(join(ROOT, 'src', 'components', 'ErrorCard.tsx'), { typescript: true, registry: new Map([['react', React]]) });
const sharedRegistry = () => new Map([
  ['react', React],
  ['@sentry/nextjs', sentryNextStub],
  ['@/components/ErrorCard', cardMod],
]);
const errorMod = await loadRealModule(join(ROOT, 'src', 'app', 'error.tsx'), { typescript: true, registry: sharedRegistry() });
const globalErrorMod = await loadRealModule(join(ROOT, 'src', 'app', 'global-error.tsx'), { typescript: true, registry: sharedRegistry() });

function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  React.act(() => root.render(el));
  return { host, root, unmount: () => { React.act(() => root.unmount()); host.remove(); } };
}

test('error.tsx: renders the card, captures with the boundary tag, reset fires', () => {
  const boom = new Error('web boom');
  let resets = 0;
  const { host, unmount } = mount(React.createElement(errorMod.default, { error: boom, reset: () => { resets += 1; } }));
  assert.match(host.textContent, /Something went wrong/);
  assert.equal(capturedWeb.length, 1);
  assert.equal(capturedWeb[0].err, boom);
  assert.equal(capturedWeb[0].ctx?.tags?.crash_type, 'boundary');
  const btn = [...host.querySelectorAll('button')].find((b) => /try again/i.test(b.textContent));
  assert.ok(btn, 'Try again button exists');
  React.act(() => { btn.click(); });
  assert.equal(resets, 1);
  unmount();
});

test('global-error.tsx: captures with the tag and renders the card standalone', () => {
  const before = capturedWeb.length;
  const boom = new Error('layout boom');
  // Renders its own <html><body> — a client mount into a div logs a DOM-nesting
  // warning by design; structure is asserted via static markup, the capture
  // effect via a real mount with that one warning allowed.
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(globalErrorMod.default, { error: boom, reset: () => {} }));
  assert.match(html, /^<html/);
  assert.match(html, /Something went wrong/);
  const realError = console.error;
  const stray = [];
  console.error = (...a) => { const line = a.join(' '); if (!/cannot be a child of|validateDOMNesting|<html>/.test(line)) stray.push(line); };
  try {
    const { unmount } = mount(React.createElement(globalErrorMod.default, { error: boom, reset: () => {} }));
    unmount();
  } finally { console.error = realError; }
  assert.equal(stray.length, 0, stray.join('\n'));
  assert.equal(capturedWeb.length, before + 1);
  assert.equal(capturedWeb[before].ctx?.tags?.crash_type, 'boundary');
});

```

(The crash-test page's tests are added by Task 5, which creates that page — this task's file ends after the two tests above.)

- [ ] **Step 2: Run — expect FAIL** (files don't exist): `node --test tests/web-error-boundary.test.mjs`

- [ ] **Step 3: Implement the three components**

```tsx
// src/components/ErrorCard.tsx
'use client';
// Crash card shared by error.tsx and global-error.tsx. Inline styles ONLY:
// global-error renders when the root layout has crashed, i.e. with NO
// stylesheet loaded — Tailwind classes are dead there, so nothing here may
// depend on one.
import * as React from 'react';

export default function ErrorCard({ onRetry }: { onRetry?: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: '#111' }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Something went wrong</div>
      <div style={{ fontSize: 14, color: '#555', maxWidth: 360, lineHeight: 1.5 }}>
        The error has been recorded. Try again, or head back to the homepage.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry ? (
          <button onClick={onRetry} style={{ padding: '10px 22px', borderRadius: 8, background: '#111', color: '#fff', border: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        ) : null}
        <a href="/" style={{ padding: '10px 22px', borderRadius: 8, background: 'transparent', color: '#111', border: '1px solid #ccc', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          Go home
        </a>
      </div>
    </div>
  );
}
```

```tsx
// src/app/error.tsx
'use client';
// Root error boundary for every route segment: a client render crash lands
// here instead of Next's unbranded default page — and gets REPORTED. Without
// this file, boundary-caught crashes on /dashboard and /console reach Sentry
// never (Next's built-in boundary swallows them before window.onerror).
// Namespace import is safe here: this file only ever runs through Next's
// bundler (the node --test landmine does not apply — tests stub this module).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import ErrorCard from '@/components/ErrorCard';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // handled boundary crash — tagged so it stays filterable/alertable
    // despite not counting against the crash-free session rate (spec
    // 2026-08-02, explicit owner call).
    Sentry.captureException(error, { tags: { crash_type: 'boundary' } });
  }, [error]);
  return <ErrorCard onRetry={reset} />;
}
```

```tsx
// src/app/global-error.tsx
'use client';
// Last-resort boundary: mounts only when the ROOT LAYOUT itself crashes, so
// nothing above it survived — it must render its own <html><body> and can
// rely on no stylesheet (hence ErrorCard's inline styles).
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import ErrorCard from '@/components/ErrorCard';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { crash_type: 'boundary' } });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#fff' }}>
        <ErrorCard onRetry={reset} />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run to PASS** (first two tests; third still commented): `node --test tests/web-error-boundary.test.mjs`, then `npx tsc --noEmit`

- [ ] **Step 5: Normalize** all four files (LF + NUL, Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add src/components/ErrorCard.tsx src/app/error.tsx src/app/global-error.tsx tests/web-error-boundary.test.mjs
git commit -m "feat(sentry): error.tsx + global-error.tsx — web boundary crashes reported and branded

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Gated web crash trigger (`/dashboard/crash-test`)

**Files:**
- Create: `src/app/dashboard/crash-test/page.tsx`
- Modify: `tests/web-error-boundary.test.mjs` (re-enable the `crashPageMod` lines + third test from Task 4 Step 1)

**Interfaces:**
- Consumes: dashboard layout's server-side gate (redirects anonymous visitors to `/login` — no quota noise from crawlers).

- [ ] **Step 1: Write the failing test.** Append to `tests/web-error-boundary.test.mjs` — a loader line after the `globalErrorMod` line:

```js
const crashPageMod = await loadRealModule(join(ROOT, 'src', 'app', 'dashboard', 'crash-test', 'page.tsx'), { typescript: true, registry: new Map([['react', React]]) });
```

and this test at the end of the file:

```js
test('crash-test page: SSR-safe (renders the arming line), throws only after hydration', () => {
  // SSR pass must NOT throw — a render-time throw would be captured as a
  // SERVER error and never exercise the browser boundary path.
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(crashPageMod.default));
  assert.match(html, /Arming crash test/);
  // Client mount: the effect arms it, the re-render throws, a local boundary
  // proves the throw happens post-hydration with the distinctive message.
  class Net extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    render() { return this.state.err ? React.createElement('p', null, `caught:${this.state.err.message}`) : this.props.children; }
  }
  const realError = console.error;
  const stray = [];
  console.error = (...a) => { const line = a.join(' '); if (!/Deliberate crash test|Net|CrashTest/.test(line)) stray.push(line); };
  let host;
  try {
    ({ host } = mount(React.createElement(Net, null, React.createElement(crashPageMod.default))));
  } finally { console.error = realError; }
  assert.equal(stray.length, 0, stray.join('\n'));
  assert.match(host.textContent, /caught:Deliberate crash test \(web boundary\)/);
});
```

Run — expect FAIL (page missing): `node --test tests/web-error-boundary.test.mjs`

- [ ] **Step 2: Implement the page**

```tsx
// src/app/dashboard/crash-test/page.tsx
'use client';
// Deliberate crash trigger for the post-DSN e2e Sentry gate (spec 2026-08-02).
// Lives INSIDE the gated /dashboard segment: the layout redirects anonymous
// visitors to /login, so crawlers can't hit this and burn Sentry quota.
//
// The throw is armed AFTER hydration (state flip in an effect) on purpose: a
// direct render throw would fire during SSR and be captured as a SERVER
// error — the point of this page is the BROWSER boundary path (error.tsx).
import { useEffect, useState } from 'react';

export default function CrashTest() {
  const [armed, setArmed] = useState(false);
  useEffect(() => { setArmed(true); }, []);
  if (armed) throw new Error('Deliberate crash test (web boundary)');
  return <p style={{ padding: 24 }}>Arming crash test…</p>;
}
```

- [ ] **Step 3: Run to PASS:** `node --test tests/web-error-boundary.test.mjs`, then `npx tsc --noEmit`

- [ ] **Step 4: Normalize** both files (LF + NUL).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/crash-test/page.tsx tests/web-error-boundary.test.mjs
git commit -m "feat(sentry): gated /dashboard/crash-test trigger for the post-DSN e2e gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full gates, worklog, adversarial self-review, single push, PR

**Files:**
- Modify: `docs/WORKLOG.md` (new dated entry at the TOP of the Changelog section, matching house format)

- [ ] **Step 1: Full local gates, in order** (all must pass before anything else):

```bash
npm test                    # entire suite, incl. the 3 new files
npx tsc --noEmit            # Next app typecheck
node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
npm run build               # root next build (local hard gate per house rules)
cd mobile-app && VITE_BASE=/m/ npm run build && cd ..   # catches any import break in sentry.mjs wiring
```

- [ ] **Step 2: Write the WORKLOG entry.** New dated `### 2026-08-02 — Boundary-caught React crashes → Sentry` entry (top of Changelog), covering exactly: what shipped (seam + wiring + web components + two triggers); the `crash_type: 'boundary'` / `handled: true` tradeoff (owner call — these do NOT count against crash-free session rate, the tag is the compensating control); the dedupe verification result (state which arm ran: SDK dedupe confirmed, or local guard added); the boundary-path-only rule (why `bsRecordError` must never capture); and the **deferred e2e gate** with exact owner instructions — once a DSN exists, visit `/m/?crash=1` and `/dashboard/crash-test` (signed in), confirm one event each in `shape-mobile` and `shape-web` with a symbolicated stack and the distinctive messages `Deliberate crash test (mobile boundary)` / `(web boundary)`; the work is not DONE until that gate runs, even after merge. LF + NUL normalize; commit with explicit path:

```bash
git add docs/WORKLOG.md
git commit -m "docs(worklog): boundary-crashes→Sentry entry incl. deferred e2e gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Adversarial pre-push self-review** (house rule — BEFORE the first push, so Codex sees one clean batch). Dispatch a code-reviewer agent over `git diff claude/error-tracking-layer-1-sentry...HEAD` hunting specifically: TDZ/hook-order faults, double-capture paths (any capture reachable from a non-boundary path), the tag leaking outside the scoped capture, `import.meta.env` reaching Node untransformed, CRLF/NUL artifacts, stubbed-registry drift (a registry mapping hiding a real import break), and SSR-throw on the crash-test page. Fix findings, re-run `npm test`, amend nothing — add fix commits with explicit paths.

- [ ] **Step 4: Single push**

```bash
git push -u origin claude/sentry-boundary-crashes
```

- [ ] **Step 5: Open the PR via REST API** — base `claude/error-tracking-layer-1-sentry` (NOT `main`; this stacks on unmerged work):

```bash
TOKEN=$(git config credential.helper >/dev/null 2>&1; printf "protocol=https\nhost=github.com\n" | git credential fill | grep password | cut -d= -f2)
curl -sS -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/cperry8800-droid/shape-app/pulls \
  -d @- <<'JSON'
{
  "title": "Boundary-caught React crashes → Sentry (mobile seam + web error components + e2e crash triggers)",
  "head": "claude/sentry-boundary-crashes",
  "base": "claude/error-tracking-layer-1-sentry",
  "body": "Spec: docs/superpowers/specs/2026-08-02-boundary-crashes-sentry-design.md\n\n- /m/: componentDidCatch → bsCaptureBoundaryError (tagged crash_type:boundary, handled:true — owner call, release-health tradeoff documented). Boundary path ONLY: bsRecordError untouched (global handlers already cover window error paths; wiring there would double-report).\n- Web: src/app/error.tsx + global-error.tsx (branded card, tagged capture) — dashboard/console render crashes were previously unreported AND unbranded.\n- Deliberate crash triggers for the post-DSN e2e gate: /m/?crash=1 and gated /dashboard/crash-test (armed post-hydration so the throw is a BROWSER boundary crash, not SSR).\n- Dedupe verified by test (identical consecutive capture → one envelope).\n- Mount-tested for real: jsdom + react-dom/client + React.act — componentDidCatch never runs under renderToString.\n- Ships inert (no DSN exists). E2E delivery gate deferred to the owner's Sentry-org step — see WORKLOG entry.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"
}
JSON
```

(If the repo slug differs, read it from `git remote get-url origin` first.)

- [ ] **Step 6: Post `@codex review` on the PR** (issue-comment endpoint) if Codex hasn't commented within its usual window, then report PR number + gate status to the owner. **Do not merge** — merge gate is CI green on final head + Codex review present + owner's say.

---

## Deferred (not in this PR, tracked in the WORKLOG entry)

- **E2E delivery gate** — owner-dependent (no Sentry org exists): fire both triggers, confirm arrival in `shape-mobile` / `shape-web`, symbolicated stack, distinctive messages. Not DONE until this runs.
- Per-surface boundaries inside `/m/` role apps (product call, own wave).
- User context on the two web surfaces (registered layer-1 follow-up).
