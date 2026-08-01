// The pinned condensed masthead must not restore a corner the page removed.
//
// WHY THIS FILE EXISTS: `BSPage` renders a pinned condensed masthead that slides
// in once the scroller passes ~64px, and it used to inject `window.BSMastCorner`
// unconditionally. Twelve live surfaces deliberately render a corner-less
// masthead row — the coach draft editors, the three action heads, the live
// monitor, the soundtracks shell, the grocery builder, the marketplace drill-ins,
// the coach grocery-list create form, and a REQUIRED health-intake gate that
// necessarily scrolls — because on those pages the avatar destroys an unsaved
// draft or navigates somewhere the page cannot render, while still burning a
// back. Every one of them got the corner back after 64px of scrolling.
//
// The fix is a context: a page states "my row has no trailing corner" simply by
// rendering one, and the pinned strip honours it. These tests drive the REAL
// `BSPage` — not a description of it — because the previous three attempts at
// this class were all "green suite, still broken".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheet.jsx');
const RAW = readFileSync(SRC, 'utf8');

globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// A small renderer: enough to call a function component, keep its hook state
// across re-renders, collect its effects, and flush them. `react-test-renderer`
// and `jsdom` are both absent from this repo, and the existing broadsheet shim
// no-ops `useEffect` — which is precisely the mechanism under test here.
const THEME = {
  INK: '#111', INK70: '#555', PAPER: '#fff', PAPER_BG: '#fff', TEXTURE: null,
  SURFACE_BORDER: '#ddd', MONO: 'mono', BODY: 'body', padX: 22, isLight: true, inkRGB: '15,14,12',
};

function makeDriver() {
  const cells = [];
  const effects = [];
  let idx = 0;
  const shim = {
    ...React,
    useState(init) {
      const i = idx++;
      if (!(i in cells)) cells[i] = (typeof init === 'function' ? init() : init);
      return [cells[i], (next) => { cells[i] = (typeof next === 'function' ? next(cells[i]) : next); }];
    },
    useRef(init) {
      const i = idx++;
      if (!(i in cells)) cells[i] = { current: init };
      return cells[i];
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); },
    // The chrome's own `useBS` throws unless the theme context resolves, and the
    // theme context is module-private. Every context read here resolves to the
    // theme; the bare-mast context is exercised through the reporter the
    // Provider element carries, which is the thing under test.
    useContext() { return THEME; },
  };
  return {
    shim,
    reset() { idx = 0; effects.length = 0; },
    flush() { const out = effects.map((f) => f()); effects.length = 0; return out; },
  };
}

const driver = makeDriver();

// Compile the chrome with the shim as its React, exporting what we drive.
const source = `${RAW.replace(/import\.meta/g, '__IMPORT_META__')}
export { BSPage, BSMastRow, BSMasthead, BSPageHeader, useBSReportBareMast };
`;
globalThis.__IMPORT_META__ = { env: { BASE_URL: '/m/' } };
const { code } = babel.transformSync(source, {
  presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC,
});
const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
const registry = new Map([['react', driver.shim]]);
for (const spec of specs) {
  if (registry.has(spec)) continue;
  registry.set(spec, await import(pathToFileURL(join(dirname(SRC), spec)).href));
}
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', code)(
  (s) => { if (!registry.has(s)) throw new Error(`unmapped import: ${s}`); return registry.get(s); },
  mod, mod.exports,
);

// The chrome reads the theme off `window.useBS` at call time.
globalThis.useBS = () => THEME;
globalThis.BSMastCorner = function MastCorner() { return null; };

function walk(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return out; }
  if (typeof node === 'object' && node.props) { out.push(node); walk(node.props.children, out); }
  return out;
}

// The pinned strip's own row is the BSMastRow rendered by BSPage itself.
function pinnedTrailing(tree) {
  const rows = walk(tree).filter((n) => n.type === mod.exports.BSMastRow);
  assert.equal(rows.length, 1, 'BSPage renders exactly one pinned masthead row');
  return rows[0].props.trailing;
}

function renderPage(props = {}) {
  driver.reset();
  return mod.exports.BSPage({ children: null, ...props });
}

test('pinned corner: renders by default, and disappears once a page reports a bare row', () => {
  // 1. Default — an ordinary page keeps the pinned corner.
  let tree = renderPage();
  driver.flush();
  assert.notEqual(pinnedTrailing(tree), null, 'an ordinary page keeps its pinned corner');

  // 2. Find the reporter BSPage hands to its children through the context.
  const provider = walk(tree).find((n) => n.type && n.type.$$typeof === Symbol.for('react.provider')
    || (n.type && n.type._context) || (n.props && typeof n.props.value === 'function'));
  const report = provider && typeof provider.props.value === 'function' ? provider.props.value : null;
  assert.ok(report, 'BSPage provides a reporter to its children');

  // 3. A child reports a corner-less row -> the pinned corner goes.
  report(1);
  tree = renderPage();
  driver.flush();
  assert.equal(pinnedTrailing(tree), null,
    'a page that removed its own corners must not get them back from the pinned strip');

  // 4. That child unmounts -> the corner returns for the next page.
  report(-1);
  tree = renderPage();
  driver.flush();
  assert.notEqual(pinnedTrailing(tree), null,
    'releasing the last bare row restores the corner (no leak onto the next page)');
});

test('pinned corner: ANY bare row wins, regardless of effect order', () => {
  let tree = renderPage();
  driver.flush();
  const report = walk(tree).find((n) => n.props && typeof n.props.value === 'function').props.value;

  // Two rows, the bare one reporting FIRST then a sibling releasing: a boolean
  // flag would have been clobbered here. The count must survive.
  report(1); report(1); report(-1);
  tree = renderPage(); driver.flush();
  assert.equal(pinnedTrailing(tree), null, 'one bare row still outstanding keeps the corner suppressed');

  report(-1);
  tree = renderPage(); driver.flush();
  assert.notEqual(pinnedTrailing(tree), null, 'the count reaching zero restores the corner');

  // Over-release must not drive the count negative and wedge it.
  report(-1); report(-1); report(1);
  tree = renderPage(); driver.flush();
  assert.equal(pinnedTrailing(tree), null, 'count is floored at zero, so a stray release cannot wedge it');
  report(-1);
});

test('every masthead row component reports whether it is corner-less', () => {
  // Static, but it is the invariant that makes the context work: a row component
  // that does not report is a hole in the class. BSMasthead is the twelfth
  // instance's row (the coach grocery-list create form) -- covering only
  // BSMastRow would have left it open.
  for (const name of ['BSMastRow', 'BSMasthead', 'BSPageHeader']) {
    const start = RAW.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} exists`);
    const body = RAW.slice(start, start + 900);
    assert.match(body, /useBSReportBareMast\(trailing == null\)/,
      `${name} must report a corner-less row, or the pinned strip will restore its corner`);
  }
});

test('the pinned strip actually consults the report', () => {
  assert.match(RAW, /trailing=\{\(MastCorner && !bareMast\) \? <MastCorner \/> : null\}/,
    'the pinned row must gate its corner on the reported state');
});
