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
// Node 24 defines a read-only `navigator` getter of its own; assigning
// directly throws ("only has a getter"). Node's descriptor is configurable,
// so redefine it rather than assign — same jsdom navigator, no Node-version
// incompatibility.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
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
    // JSX siblings, never rendered by these tests (native import can't parse JSX).
    ['./BSLanguagePicker.jsx', { default: () => null }],
    ['./BSDobGate.jsx', { default: () => null }],
    ['react-i18next', { I18nextProvider: ({ children }) => children }],
  ]),
  appendExports: 'export { BSErrorBoundary, bsCrashTestRequested, BSCrashProbe };',
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
  assert.ok(rootRenders[0].el.props.children, 'boundary must wrap the app');
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

test('bsCrashTestRequested: pure, total, exact-match on ?crash=1', () => {
  assert.equal(MOD.bsCrashTestRequested('?crash=1'), true);
  assert.equal(MOD.bsCrashTestRequested('?crash=1&mem=1'), true);
  assert.equal(MOD.bsCrashTestRequested('?crash=2'), false);
  assert.equal(MOD.bsCrashTestRequested(''), false);
  // No argument → reads window.location.search (jsdom URL has no params here).
  assert.equal(MOD.bsCrashTestRequested(), false);
  // A Symbol throws on the implicit string coercion inside `new URLSearchParams(...)`
  // (verified: `new URLSearchParams(Symbol('x'))` → TypeError) — this is the vector
  // that actually reaches the catch block, not just a well-formed-but-wrong input.
  assert.equal(MOD.bsCrashTestRequested(Symbol('x')), false);
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

test('the crash probe disarms itself: the crash card can actually recover from ?crash=1', () => {
  // The shared jsdom instance boots with a fixed URL carrying no query string
  // (see the top of this file), so this test needs a real ?crash=1 to disarm.
  // Uses `dom.reconfigure({ url })` (same window/document objects, just a new
  // navigation state) rather than a second JSDOM — reconfiguring back to the
  // original URL in a `finally` leaves every other test's environment untouched.
  const before = captured.length;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  dom.reconfigure({ url: 'https://shape.test/m/?crash=1' });
  try {
    const { stray } = withTrappedConsole([/Deliberate crash test/, /BSErrorBoundary/, /BSCrashProbe/], () => {
      React.act(() => {
        root.render(React.createElement(MOD.BSErrorBoundary, null, React.createElement(MOD.BSCrashProbe)));
      });
    });
    assert.equal(stray.length, 0, stray.join('\n'));
    assert.match(host.textContent, /Something went wrong/);
    assert.equal(captured.length, before + 1);
    // Disarmed: the param is gone, so the card's own Reload (re-render) / Restart
    // (reload the same URL) buttons no longer read a URL that re-fires the crash.
    assert.equal(MOD.bsCrashTestRequested(), false);
    assert.equal(window.location.search, '');
  } finally {
    dom.reconfigure({ url: 'https://shape.test/m/' });
  }
  React.act(() => root.unmount());
  host.remove();
});
