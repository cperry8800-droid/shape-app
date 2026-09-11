// tests/ipad-centered-canvas.test.mjs
//
// The native shell is a FIELD → COLUMN → SURFACE sandwich, and four of its
// properties are load-bearing rather than stylistic. Each one below is a defect
// that has either shipped in this repo before or was measured during the change:
//
//   - The cap must sit OUTSIDE the zoom. `zoom` multiplies every fixed length on
//     the element carrying it, so a px cap on #bs-phone-surface tracks the
//     member's text-size preference (430 renders 387/430/482).
//   - Centring must not use transform/filter/backdrop-filter/perspective/
//     will-change/contain. Any of those makes the element a containing block for
//     `position: fixed` DESCENDANTS and silently re-roots every fixed element in
//     the app.
//   - The cap must be WIDTH ONLY. env(safe-area-inset-*) resolves against the
//     viewport, and ~76 call sites use it to clear real hardware; letterbox the
//     column vertically and every one reserves room for hardware that is no
//     longer adjacent.
//   - The field's background must be layer-legal. A bare colour in a non-final
//     `background` layer voids the WHOLE declaration — the defect two page
//     textures shipped with on 2026-09-01.
//
// The module is browser JSX and cannot be imported, so it is compiled in memory
// and BSPhone is CALLED: these assertions read the element tree the shipping
// component actually returns, not its source text. A spelling pin would survive
// any equivalent rewrite and fail every correct one.
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
const SRC_DIR = dirname(SRC);

const THEME_TARGET = {
  PAPER_BG: '#0f0e0c', PAPER: '#0f0e0c', BODY: 'serif',
  inkRGB: '245,240,230', TEXT_SCALE: 1, weightKey: 'bold',
};
const THEME = new Proxy(THEME_TARGET, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });
// Steel is the one paper whose PAPER_BG is a multi-layer gradient stack rather
// than a flat hex. It still ends in a colour, so the composed shorthand stays
// legal — but that is a property worth driving rather than assuming.
const STEEL_BG = 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.18) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(0,0,0,0.025) 2px), #c2c7cd';

// isNativeBSApp() reads the class first, so a document stub is required even
// though Capacitor would satisfy the other arm.
globalThis.window = globalThis;
globalThis.document = {
  documentElement: { classList: { contains: (c) => c === 'is-native-app' } },
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, appendChild() {} }),
  head: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
};
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };

const SHIM = {
  ...React,
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useRef: (init) => ({ current: init }),
  useEffect() {}, useLayoutEffect() {}, useInsertionEffect() {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useContext: () => THEME,          // BSPhone's useBS() throws without a provider
  useId: () => 'test-id',
  createContext: () => ({ Provider: () => null, Consumer: () => null }),
};

async function loadChrome(names) {
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { ${names.join(', ')} };\n`;
  const { code } = babel.transformSync(source, {
    presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    const rel = spec.startsWith('.') || spec.startsWith('/');
    registry.set(spec, rel ? await import(pathToFileURL(join(SRC_DIR, spec)).href) : await import(spec));
  }
  const mod = { exports: {} };
  const req = (s) => { if (!registry.has(s)) throw new Error(`unmapped import: ${s}`); return registry.get(s); };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  for (const n of names) assert.notEqual(mod.exports[n], undefined, `${n} is not exported`);
  return mod.exports;
}

const { BSPhone } = await loadChrome(['BSPhone']);

// The three boxes, read off the tree BSPhone actually returns.
function shell() {
  const wrapper = BSPhone({ children: null });
  assert.ok(wrapper && wrapper.props, 'BSPhone returned no element — the native branch did not render');
  const column = [].concat(wrapper.props.children).find((c) => c && c.props && !c.props.id);
  assert.ok(column, 'no unzoomed column between the field and the surface');
  const surface = [].concat(column.props.children).find((c) => c && c.props && c.props.id === 'bs-phone-surface');
  assert.ok(surface, '#bs-phone-surface is not a child of the column');
  return { wrapper: wrapper.props.style, column: column.props.style, surface: surface.props.style };
}

// Anything that makes an element the containing block for fixed DESCENDANTS.
const CONTAINING_BLOCK_PROPS = ['transform', 'filter', 'backdropFilter', 'WebkitBackdropFilter', 'perspective', 'willChange', 'contain'];

test('the field centres with flex and creates no containing block', () => {
  const { wrapper, column } = shell();
  assert.equal(wrapper.display, 'flex');
  assert.equal(wrapper.justifyContent, 'center');
  for (const box of [wrapper, column]) {
    for (const p of CONTAINING_BLOCK_PROPS) {
      assert.equal(box[p], undefined, `${p} re-roots every position:fixed descendant into the column`);
    }
  }
});

test('the cap sits on the column, OUTSIDE the zoom', () => {
  const { wrapper, column, surface } = shell();
  assert.equal(typeof column.maxWidth, 'number', 'the column must carry the px cap');
  assert.equal(column.zoom, undefined, 'the capped element must not be zoomed');
  assert.equal(surface.maxWidth, undefined, 'a cap on the zoomed surface tracks the text-size preference');
  assert.ok(surface.zoom !== undefined, 'the surface still carries the text scale');
  assert.equal(wrapper.maxWidth, undefined, 'capping the field uncovers the hardcoded body background');
});

test('the column fills any viewport narrower than the cap — the phone no-op', () => {
  const { column } = shell();
  assert.equal(column.width, '100%', 'a fixed width would letterbox every phone');
  // maxWidth is inert below its own value, so this is what makes one branch
  // cover phone, tablet and Split View with no media query and no resize listener.
  assert.ok(column.maxWidth >= 430, 'the cap must not be narrower than the widest iPhone');
});

test('the cap is WIDTH only — nothing caps the height', () => {
  const { wrapper, column, surface } = shell();
  for (const [name, box] of [['field', wrapper], ['column', column], ['surface', surface]]) {
    assert.equal(box.maxHeight, undefined, `${name}: a height cap turns 76 safe-area insets into phantom padding`);
  }
  assert.equal(column.height, '100%');
  assert.equal(wrapper.height, '100dvh');
});

// A colour is legal ONLY in the final layer of the `background` shorthand.
// Split on TOP-LEVEL commas (a gradient's own commas live inside its parens).
function backgroundLayers(bg) {
  const layers = []; let depth = 0, cur = '';
  for (const ch of String(bg)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { layers.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  layers.push(cur.trim());
  return layers;
}
const IS_IMAGE = /^(?:-webkit-|-moz-)?(?:repeating-)?(?:linear|radial|conic)-gradient\(|^url\(|^none$/;

test('the field background is layer-legal on a flat paper', () => {
  const layers = backgroundLayers(shell().wrapper.background);
  assert.ok(layers.length >= 2, 'the field should be a wash over the paper');
  for (const layer of layers.slice(0, -1)) {
    assert.match(layer, IS_IMAGE,
      `non-final background layer is not an <image> — this voids the WHOLE declaration: ${layer}`);
  }
});

test('the field background is layer-legal on the metallic paper too', () => {
  const prev = THEME_TARGET.PAPER_BG;
  try {
    THEME_TARGET.PAPER_BG = STEEL_BG;
    const layers = backgroundLayers(shell().wrapper.background);
    assert.ok(layers.length >= 4, 'Steel contributes its own gradient layers');
    for (const layer of layers.slice(0, -1)) {
      assert.match(layer, IS_IMAGE, `non-final layer is not an <image>: ${layer}`);
    }
    assert.doesNotMatch(layers[layers.length - 1], IS_IMAGE, 'the final layer must be the colour');
  } finally { THEME_TARGET.PAPER_BG = prev; }
});

test('the native branch never sets the desktop-preview notch floor', () => {
  const { wrapper, column, surface } = shell();
  for (const [name, box] of [['field', wrapper], ['column', column], ['surface', surface]]) {
    assert.equal(box['--bs-notch-floor'], undefined,
      `${name}: that variable is preview-only — on device it double-pads every masthead`);
  }
});
