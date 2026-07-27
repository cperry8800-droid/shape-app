// MOUNT the client session player — the same crash class broadsheet-render
// covers for the coach file, applied to BSSession in iosAppBroadsheetClient.
//
// WHY: BSSession carries the post-session RPE prompt (SPEC-guardrails.md §3.1),
// and its own source warns that a const read by an effect's dependency array
// during render is a TDZ ReferenceError that parse, tsc, the tests and the Vite
// build ALL pass. Adding state and a conditional block to this component is
// exactly the change that shipped #1781. Nothing else in the pipeline RUNS it.
//
// Same technique as tests/broadsheet-render.test.mjs: compile the real file in
// memory, resolve its imports to the real modules, mount with ReactDOMServer.
// No source file is written, copied, or stubbed.
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
const ReactDOMServer = require_('react-dom/server');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

// The theme is a TOTAL map, not an enumerated one. BSSession reads a long tail
// of token names and this test exists to catch render crashes in the component,
// not to pin the palette — an incomplete stub would fail for a reason that has
// nothing to do with the code under test. Unknown tokens resolve to a harmless
// string so template literals stay well-formed; the few tokens with real
// semantics (spacing, light/dark) are given honestly.
const THEME_KNOWN = {
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', INK70: '#555', RULE: '#ccc', ACCENT: '#0f766e', GREEN: '#2f7d32',
  AMBER: '#b26a00', RUST: '#9a3b1b', TEAL: '#0f766e', padX: 18, isLight: true,
};
const THEME = new Proxy(THEME_KNOWN, {
  get: (target, key) => (key in target ? target[key] : '#000'),
  has: () => true,
});

// The broadsheet reads its theme, shared chrome and state helper off `window`
// (the house Object.assign(window, …) pattern). Stub ONLY those — everything
// inside BSSession is the shipping component.
globalThis.window = globalThis;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.useBS = () => THEME;
globalThis.useStateBSC = (init) => React.useState(init);
globalThis._bsScrollTopOnMount = () => {};
globalThis.BSEyebrow = ({ children }) => React.createElement('div', null, children);
globalThis.BSPage = ({ children }) => React.createElement('div', null, children);
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

async function loadModule() {
  const dir = dirname(SRC);
  // Substitute ALL of `import.meta`, not just `import.meta.env`: this file also
  // probes a bare `typeof import.meta !== 'undefined'`, which is a hard
  // SyntaxError inside a CJS function body. One replacement covers both forms.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSSession };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: SRC,
  });

  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([
    ['react', React],
    ['react-dom', { createPortal: (n) => n }],
  ]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, await import(pathToFileURL(join(dir, spec)).href));
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

const MOD = await loadModule();

// Render warnings are failures: "Rendered more hooks than during the previous
// render" and "Cannot update during render" arrive here rather than as throws.
function render(el) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    return { html: ReactDOMServer.renderToStaticMarkup(el), warnings };
  } finally {
    console.error = realError;
  }
}

const session = (props) => React.createElement(MOD.BSSession, {
  moves: [{ m: 'Back squat', s: '5', l: '225 lb', reps: '5', rpe: '8', sets: 3 }],
  onBack: () => {},
  ...props,
});

test('the session player mounts with the RPE prompt present', () => {
  const { html, warnings } = render(session({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // The 1-10 scale replaced a three-way easy/moderate/hard control. Assert the
  // ends of the scale AND the legend, so a silent revert to buckets fails here.
  assert.match(html, /The effort/);
  assert.match(html, /1 easy · 10 all-out/);
  assert.match(html, /aria-label="Effort 1 of 10"/);
  assert.match(html, /aria-label="Effort 10 of 10"/);
  assert.doesNotMatch(html, /Moderate/);
});

test('nothing is pre-selected — a skipped rating must stay skipped', () => {
  const { html, warnings } = render(session({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // No button starts pressed. A default selection would turn "skipped" into a
  // fabricated rating for every member who never touches the control — the one
  // outcome §3.1 forbids outright.
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test('the duration fallback renders when the timer has not run', () => {
  const { html, warnings } = render(session({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // A freshly-mounted session has elapsed < 60s, which is exactly the
  // timer-did-not-run branch. Asserting it here proves the conditional renders
  // at all rather than being dead JSX — sRPE is a product, so a rating captured
  // with no minutes measures nothing.
  assert.match(html, /How long\?/);
  assert.match(html, /aria-label="Session length in minutes"/);
  assert.match(html, /timer didn’t run/);
});

test('an open session (no moves handed in) still mounts', () => {
  // openMode seeds a blank move; it exercises a different initial-state path
  // through the same hooks, which is where a hook-order divergence surfaces.
  const { html, warnings } = render(session({ moves: [] }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /The effort/);
});
