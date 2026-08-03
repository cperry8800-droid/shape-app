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
