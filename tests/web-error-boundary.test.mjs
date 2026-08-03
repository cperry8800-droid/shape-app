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
// Node 24 defines a read-only `navigator` getter of its own; assigning
// directly throws ("only has a getter"). Node's descriptor is configurable,
// so redefine it rather than assign — same jsdom navigator, no Node-version
// incompatibility. (Precedent: tests/error-boundary-mount.test.mjs.)
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.location = dom.window.location;
globalThis.IS_REACT_ACT_ENVIRONMENT = true; // React 19: silences the act() env warning

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const ReactDOMServer = require_('react-dom/server');
// error.tsx / global-error.tsx use only a named `{ useEffect }` import (correct
// under the app's real automatic JSX runtime — tsconfig.json "jsx":
// "react-jsx" — no React import needed). This harness's babel preset-react
// defaults to the CLASSIC runtime (no `react/jsx-runtime` import is extracted
// by loadRealModule's source-text import scan, since automatic-runtime helper
// imports are babel-injected, not present in the source), which compiles JSX
// to bare `React.createElement(...)` calls expecting a global `React`.
// `new Function(...)` bodies resolve free identifiers via the GLOBAL scope
// (they never close over an enclosing local scope), so this makes the classic
// output resolve correctly without changing the shipping source.
globalThis.React = React;

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
const crashPageMod = await loadRealModule(join(ROOT, 'src', 'app', 'dashboard', 'crash-test', 'page.tsx'), { typescript: true, registry: new Map([['react', React]]) });

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
  // This page replaces the document, so it owns its own <head>. Without a
  // viewport meta a phone renders it at ~980px CSS width and zooms out — the
  // last-resort card unreadable on the device where it matters most.
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"\/?>/);
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

// A server-render crash reaches Sentry TWICE unless this gate holds: once
// server-side through `onRequestError` (src/instrumentation.ts exports
// `captureRequestError` from @sentry/nextjs) with the real stack, and again
// from these components' useEffect. The duplicate is worse than noise — in
// production Next redacts the client-visible error to a generic message plus a
// `digest`, so EVERY distinct server error yields an identical client event and
// they all group into ONE Sentry issue carrying `crash_type: 'boundary'`. That
// tag is the spec's compensating control for the `handled: true` release-health
// tradeoff (boundary crashes stay out of the crash-free session rate, so the tag
// is the only thing keeping them filterable and alertable) — one meaningless
// aggregate dominating it defeats the purpose. `digest` is the seam: Next sets
// it only on server-originated errors. Both halves are asserted, on both files.
test('digest gate: a server-originated error is not re-captured; a browser-only one still is', () => {
  const allowNesting = (fn) => {
    // global-error.tsx renders its own <html>; a client mount into a div logs a
    // DOM-nesting warning by design (same allowance as the test above).
    const realError = console.error;
    const stray = [];
    console.error = (...a) => { const line = a.join(' '); if (!/cannot be a child of|validateDOMNesting|<html>/.test(line)) stray.push(line); };
    try { fn(); } finally { console.error = realError; }
    assert.equal(stray.length, 0, stray.join('\n'));
  };

  // ── half 1: WITH a digest → no capture (already reported upstream) ──
  const serverErr = Object.assign(
    new Error('An error occurred in the Server Components render.'),
    { digest: '3751028461' },
  );

  let before = capturedWeb.length;
  const a = mount(React.createElement(errorMod.default, { error: serverErr, reset: () => {} }));
  assert.match(a.host.textContent, /Something went wrong/, 'the card still renders — only the capture is suppressed');
  assert.equal(capturedWeb.length, before, 'error.tsx must not re-capture a digest-bearing error');
  a.unmount();

  before = capturedWeb.length;
  allowNesting(() => {
    const b = mount(React.createElement(globalErrorMod.default, { error: serverErr, reset: () => {} }));
    b.unmount();
  });
  assert.equal(capturedWeb.length, before, 'global-error.tsx must not re-capture a digest-bearing error');

  // ── half 2: WITHOUT a digest → still captured, still tagged ──
  // A browser-only crash reaches Sentry through nothing else, so suppressing
  // it would silently delete the whole feature.
  const clientErr = new Error('browser-only boom');

  before = capturedWeb.length;
  const c = mount(React.createElement(errorMod.default, { error: clientErr, reset: () => {} }));
  assert.equal(capturedWeb.length, before + 1, 'error.tsx must still capture a digest-less error');
  assert.equal(capturedWeb[before].err, clientErr);
  assert.equal(capturedWeb[before].ctx?.tags?.crash_type, 'boundary');
  c.unmount();

  before = capturedWeb.length;
  allowNesting(() => {
    const d = mount(React.createElement(globalErrorMod.default, { error: clientErr, reset: () => {} }));
    d.unmount();
  });
  assert.equal(capturedWeb.length, before + 1, 'global-error.tsx must still capture a digest-less error');
  assert.equal(capturedWeb[before].err, clientErr);
  assert.equal(capturedWeb[before].ctx?.tags?.crash_type, 'boundary');
});

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
