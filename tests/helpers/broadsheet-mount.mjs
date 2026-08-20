// The mount harness for `iosAppBroadsheetClient.jsx`, shared by every suite that
// needs to DRIVE a shipping component rather than reason about a pure function.
//
// WHY IT IS SHARED. Two suites grew their own copy of this file's contents and
// then drifted: one `drive()` accepted a button `filter` and honoured it, the
// other accepted it and silently dropped it — so a call site could pass a filter
// that did nothing and still go green. A harness that differs between suites is a
// harness you cannot trust the same way twice.
//
// It compiles the real module in memory, resolves its imports to the real sibling
// modules, and calls the component with a hook shim. Nothing is stubbed to disk
// and no production file is written. (jsdom IS available in this repo and
// tests/error-boundary-mount.test.mjs uses it for a true client mount; this shim
// is the lighter tool for tree-shape assertions, not the only one.)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const SRC_DIR = dirname(SRC);

// Total theme map — these components read a long tail of tokens and these suites
// are about what RENDERS, not about the palette; an enumerated stub would fail for
// a reason unrelated to the code under test. The listed values are the ones a test
// might actually assert on; everything else resolves to a colour.
export const THEME = new Proxy({
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', ACCENT: '#0f766e',
  GREEN: '#2f7d32', padX: 18, isLight: true, isMetric: false,
  W: { display: 800, displayHeavy: 800 },
}, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });

globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
let ACTIVE_REACT = React;
globalThis.useStateBSC = (init) => ACTIVE_REACT.useState(init);
globalThis._bsScrollTopOnMount = () => {};
globalThis.BSEyebrow = ({ children }) => React.createElement('div', null, children);
globalThis.BSPage = ({ children }) => React.createElement('div', null, children);
globalThis.BSPageHeader = () => null;
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

// The hook shim. `useStateBSC` is a module-LOCAL alias for React.useState
// (iosAppBroadsheetClient.jsx:41), not a global, so it cannot be stubbed from
// outside — a component is instead driven by calling it, walking the element tree
// it returns, invoking a handler, and calling it again. Effects stay no-ops: the
// real ones start wall-clock intervals and reach for browser APIs.
const CTX = { cells: [], idx: 0 };
export const SHIM = {
  ...React,
  useState(init) {
    const i = CTX.idx++;
    if (!(i in CTX.cells)) CTX.cells[i] = (typeof init === 'function' ? init() : init);
    return [CTX.cells[i], (next) => { CTX.cells[i] = (typeof next === 'function' ? next(CTX.cells[i]) : next); }];
  },
  useRef(init) {
    const i = CTX.idx++;
    if (!(i in CTX.cells)) CTX.cells[i] = { current: init };
    return CTX.cells[i];
  },
  useEffect() {}, useLayoutEffect() {}, useInsertionEffect() {},
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useId() { return 'test-id'; },
};
ACTIVE_REACT = SHIM;

// Compile the shipping file and hand back the named components. `exportNames` is
// appended as a real export statement, so a typo fails loudly at load rather than
// yielding an undefined component that renders as nothing.
export async function loadBroadsheet(exportNames, reactImpl = SHIM) {
  const names = Array.isArray(exportNames) ? exportNames : [exportNames];
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { ${names.join(', ')} };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([['react', reactImpl], ['react-dom', { createPortal: (n) => n }]]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, await import(pathToFileURL(join(SRC_DIR, spec)).href));
  }
  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    return registry.get(spec);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  for (const n of names) {
    if (mod.exports[n] == null) throw new Error(`${n} is not exported by the broadsheet module`);
  }
  return mod.exports;
}

// Import a module by its path RELATIVE to the broadsheet file, so a suite reads
// its fixtures from exactly where the component reads them.
export const importSibling = (...parts) => import(pathToFileURL(join(SRC_DIR, ...parts)).href);

// -- tree walking ------------------------------------------------------------
export function flatten(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) flatten(n, out); return out; }
  if (typeof node === 'object' && node.props) { out.push(node); flatten(node.props.children, out); }
  return out;
}

export const textOf = (node) => {
  const parts = [];
  (function rec(n) {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { parts.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(rec); return; }
    if (typeof n === 'object' && n.props) rec(n.props.children);
  })(node.props ? node.props.children : node);
  return parts.join('');
};

export const count = (hay, needle) => hay.split(needle).length - 1;

export const pressable = (n) => n.props['aria-pressed'] !== undefined;

// Drive a component: fresh hook cells, then render / click / re-render.
//
// `opts.rowMarker` is the per-item marker `row()` uses to tell one item's subtree
// from the whole list (e.g. the action button every result row carries exactly
// once). It is a property of the surface under test, so the suite supplies it
// rather than the harness assuming one.
export function drive(Component, props, opts = {}) {
  CTX.cells.length = 0;
  let tree;
  const renderOnce = () => { CTX.idx = 0; tree = Component(props); return tree; };
  renderOnce();
  const nodes = () => flatten(tree);
  const api = {
    nodes,
    get text() { return textOf({ props: { children: tree } }); },
    buttons: () => nodes().filter((n) => n.type === 'button').map((n) => ({ label: textOf(n).trim(), disabled: !!n.props.disabled })),
    // Click the first button whose rendered text starts with `label`. Buttons are
    // matched on the accessible text they actually show, never an index. `filter`
    // narrows the candidates first (e.g. `pressable` for selection toggles) — it
    // is honoured, so passing one is never a no-op.
    click(label, filter = () => true) {
      const btns = nodes().filter((n) => n.type === 'button' && n.props.onClick && filter(n));
      const btn = btns.find((n) => textOf(n).trim().startsWith(label));
      if (!btn) throw new Error(`no button starting ${JSON.stringify(label)} (have: ${btns.map((n) => JSON.stringify(textOf(n).trim().slice(0, 40))).join(', ')})`);
      btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    // Click a control by its React `key` rather than its label. Use this when the test
    // is about WHICH option was chosen and not about the wording — a key is the stable
    // identity, so a copy change cannot silently redirect the click or break the test
    // for a reason unrelated to what it asserts.
    clickKey(key) {
      const btn = nodes().find((n) => String(n.key) === String(key) && n.props && typeof n.props.onClick === 'function');
      if (!btn) {
        const have = nodes().filter((n) => n.key != null && n.props && n.props.onClick).map((n) => JSON.stringify(String(n.key)));
        throw new Error(`no control keyed ${JSON.stringify(String(key))} (have: ${have.join(', ')})`);
      }
      btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
      renderOnce();
      return api;
    },
    // Some controls are a local component rather than a host <button>, so no
    // <button> for them exists in the returned tree — their handler rides on the
    // element's own props. Finding the element at all is itself evidence that the
    // panel holding it is open.
    clickChip(label) {
      const chip = nodes().find((n) => typeof n.type === 'function' && n.props.label === label && typeof n.props.onClick === 'function');
      if (!chip) throw new Error(`no chip labelled ${JSON.stringify(label)} — is the panel that holds it open?`);
      chip.props.onClick();
      renderOnce();
      return api;
    },
    // Re-render after driving something that is not a button (a time input's onChange).
    render() { renderOnce(); return api; },
    // The smallest subtree that holds `title` and exactly one `marker` — i.e. that
    // item's own row, found by content rather than by shape.
    row(title, marker = opts.rowMarker) {
      if (!marker) throw new Error('row() needs a per-item marker — pass drive(..., { rowMarker })');
      const hits = nodes()
        .filter((n) => { const s = textOf(n); return s.includes(title) && count(s, marker) === 1; })
        .sort((a, b) => textOf(a).length - textOf(b).length);
      return hits.length ? textOf(hits[0]) : null;
    },
  };
  return api;
}

// The full opening tag of the first `<Tag ...>` in `src`, brace-aware.
//
// ⚠ Scanning to the first `>` does NOT work: every arrow function in a prop
// (`onDone={() => ...}`) contains one, so a naive slice ends at the first handler
// and every assertion after it reads a truncated tag. Depth-tracking `{}` (and
// skipping string literals) ends the tag where JSX actually ends it.
export function jsxOpenTag(src, tag) {
  const i = src.indexOf(`<${tag}`);
  if (i < 0) return null;
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === '\\') { j++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return src.slice(i, j + 1);
  }
  return null;
}
