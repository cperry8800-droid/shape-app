// MOUNT the broadsheet components — the class of bug nothing else in the
// pipeline catches.
//
// WHY THIS FILE EXISTS: a TDZ reference, a conditionally-called hook, or a
// crash inside a render body is valid syntax, typechecks, builds, and passes
// every pure-logic test — because none of those things RUN the component. One
// shipped this way (#1781). broadsheet-identifiers.test.mjs catches names that
// were never declared; this catches names that exist but are read before they
// are initialized, hooks called in a different order between renders, and any
// exception thrown while producing markup.
//
// The module is compiled in memory (JSX → CJS) with its relative imports served
// from a registry of the REAL modules, so what mounts here is the shipping code
// — no source file is written, copied, or stubbed out.
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
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetPros.jsx');

// The broadsheet reads i18n + auth off `window`. Give it the same globals the
// app does, minimally: a translator that resolves defaultValue exactly like the
// real one so copy still renders, and no signed-in user (the demo-safe path).
globalThis.window = globalThis;
globalThis.ShapeI18n = undefined;
globalThis.ShapeLocale = undefined;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/' };
// The page shell comes from a sibling broadsheet module via the house
// `Object.assign(window, …)` pattern. Stub only the chrome — everything inside
// it is the real component.
globalThis.BSPage = ({ children }) => React.createElement('div', { 'data-bspage': true }, children);
globalThis.BSFooter = ({ left, right }) => React.createElement('footer', null, left, right);

async function loadModule() {
  const dir = dirname(SRC);
  // The component under test is module-local. Exporting it is the only edit,
  // and it is made to the in-memory copy — the shipping file is untouched.
  // `import.meta.env` is Vite's, injected at build; substitute it the same way
  // the bundler does so asset URLs resolve instead of being a syntax error in a
  // CJS function body.
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta\.env/g, '__VITE_ENV__')}\nexport { BSCoachDraftEditor };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact],
    plugins: [commonjs],
    babelrc: false,
    configFile: false,
    filename: SRC,
  });

  // Resolve every import the module declares to the real module, so nothing is
  // stubbed except the browser itself.
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([
    ['react', React],
    ['react-dom', { createPortal: (n) => n }],
  ]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    const mod = await import(pathToFileURL(join(dir, spec)).href);
    registry.set(spec, mod);
  }

  const mod = { exports: {} };
  const req = (spec) => {
    if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`);
    const m = registry.get(spec);
    // Interop: the compiled CJS reads `.default` for default imports.
    return m;
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}

const MOD = await loadModule();

// Render warnings are failures here: "Rendered more hooks than during the
// previous render" and "Cannot update during render" both arrive this way
// rather than as thrown errors.
function render(el) {
  const warnings = [];
  const realError = console.error;
  console.error = (...a) => warnings.push(a.join(' '));
  try {
    const html = ReactDOMServer.renderToStaticMarkup(el);
    return { html, warnings };
  } finally {
    console.error = realError;
  }
}

const t = {
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111',
  INK50: '#777', RULE: '#ccc', padX: 18, isLight: true,
};
const editor = (props) => React.createElement(MOD.BSCoachDraftEditor, {
  t, accent: '#c8a24a', typeName: 'meal plan', blockLabel: 'MEALS',
  initialName: 'Lean Cut', initialBlocks: [{ id: 'b1', text: 'Breakfast — Oats · 500 kcal' }],
  initialNote: '', initialMedia: [], onPublish: async () => {}, onCancel: () => {},
  ...props,
});

test('the draft editor mounts with per-day authoring OFF (every legacy flow)', () => {
  const { html, warnings } = render(editor({}));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /Breakfast/);
  // The day strip must not appear on trainer drafts or nutrition `program`
  // arcs — those blocks are week phases, not menus.
  assert.doesNotMatch(html, /DEFAULT/);
  assert.doesNotMatch(html, /MON/);
});

test('the draft editor mounts with per-day authoring ON, defaulting to DEFAULT', () => {
  const { html, warnings } = render(editor({ perDayAuthoring: true, stepAuthoring: true }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  assert.match(html, /DEFAULT/);
  assert.match(html, /MON/);
  assert.match(html, /SUN/);
  // DEFAULT tab still edits the flat list, so the existing menu renders.
  assert.match(html, /Breakfast/);
});

test('a plan that already carries `days` mounts and marks the authored days', () => {
  const { html, warnings } = render(editor({
    perDayAuthoring: true,
    initialDays: [
      { dow: 2, blocks: [{ id: 'w1', text: 'Lunch — Salmon · 610 kcal' }] },
      { dow: 0, blocks: [] },
    ],
  }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // Both authored days carry the marker, including the deliberately EMPTY one —
  // an emptied day is authored, and losing that marker is how it silently
  // reverts to the default menu.
  assert.equal((html.match(/·<\/button>/g) || []).length, 2);
});

test('malformed stored `days` neither throws nor renders a day it cannot place', () => {
  const { html, warnings } = render(editor({
    perDayAuthoring: true,
    initialDays: [{ dow: 99 }, { dow: '1', blocks: [] }, null, { dow: 3, blocks: [{ id: 'x', text: 'Dinner' }] }],
  }));
  assert.equal(warnings.length, 0, warnings.join('\n'));
  // Only the one valid entry survives canonicalization.
  assert.equal((html.match(/·<\/button>/g) || []).length, 1);
});
