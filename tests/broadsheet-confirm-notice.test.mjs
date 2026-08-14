// A notice must render ONE acknowledge button — and a confirm must still render two.
//
// WHY THIS FILE EXISTS: `window.__bsToast` is `() => {}` (toasts were switched
// off app-wide on 2026-06-03, #938) and `BSToastHost` early-returns null, so every
// `window.__bsToast?.(…)` call in the app reports into a void. The meal-note
// dispatch shipped a fix that made the API report delivery failures honestly and
// made the client branch on that report correctly — and then announced the failure
// through that dead global, so the member still saw nothing. `BSConfirmSheet`'s
// notice mode is the replacement, chosen because `BSConfirmHost` is mounted in both
// phone branches and `bsAskConfirm` falls back to the platform `confirm` when the
// host has not mounted, so it cannot degrade back into silence.
//
// These tests DRIVE the real `BSConfirmSheet` rather than describing it, because
// the defect being guarded is exactly "the code looks right and renders nothing".
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

const THEME = {
  INK: '#111', INK70: '#555', PAPER: '#fff', PAPER_BG: '#fff', RULE: '#ddd', HAIR: '#eee',
  RUST: '#c0533b', ACCENT: '#0a8f87', TEXTURE: null, SURFACE_BORDER: '#ddd',
  MONO: 'mono', BODY: 'body', DISPLAY: 'display', padX: 22, isLight: true, inkRGB: '15,14,12',
};

// The sheet holds one piece of state (the type-to-confirm field) and reads the
// theme from context. Keep the cells across a render so hook order is real.
function makeDriver() {
  const cells = [];
  let idx = 0;
  const shim = {
    ...React,
    useState(init) {
      const i = idx++;
      if (!(i in cells)) cells[i] = (typeof init === 'function' ? init() : init);
      return [cells[i], (next) => { cells[i] = (typeof next === 'function' ? next(cells[i]) : next); }];
    },
    useRef(init) { const i = idx++; if (!(i in cells)) cells[i] = { current: init }; return cells[i]; },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
    useEffect() {},
    useContext() { return THEME; },
  };
  return { shim, reset() { idx = 0; cells.length = 0; } };
}

const driver = makeDriver();

const source = `${RAW.replace(/import\.meta/g, '__IMPORT_META__')}
export { BSConfirmSheet };
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

globalThis.useBS = () => THEME;

function walk(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return out; }
  if (typeof node === 'object' && node.props) { out.push(node); walk(node.props.children, out); }
  return out;
}

// Only the real <button> elements — the backdrop and the sheet body are divs.
function buttons(tree) {
  return walk(tree).filter((n) => n.type === 'button');
}

function label(btn) {
  const c = btn.props.children;
  return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
}

function render(opts) {
  driver.reset();
  return mod.exports.BSConfirmSheet({ opts, onCancel() {}, onConfirm() {} });
}

test('notice mode renders exactly one acknowledge button', () => {
  const tree = render({ notice: true, title: 'We couldn’t reach your coach', message: 'Your log is saved.' });
  const btns = buttons(tree);
  assert.equal(btns.length, 1, 'a notice offers no second choice — one button only');
  assert.equal(label(btns[0]), 'Got it', 'the acknowledge button reads "Got it" by default');
});

test('notice mode honours an explicit confirm label — and is still one button', () => {
  // The count assertion is not redundant with the test above: passing a
  // confirmLabel is a different branch through the button row, and checking only
  // buttons[0]'s text would pass even if a cancel button rendered beside it.
  const tree = render({ notice: true, title: 'Heads up', confirmLabel: 'Understood' });
  const btns = buttons(tree);
  assert.equal(btns.length, 1, 'a custom label must not reintroduce a second choice');
  assert.equal(label(btns[0]), 'Understood');
});

test('a notice never renders the destructive "this can\'t be undone" eyebrow', () => {
  // `danger` defaults to true, which drives the eyebrow copy. A notice is not a
  // destructive confirmation, so the default eyebrow must not claim it is.
  const tree = render({ notice: true, title: 'Heads up' });
  const text = walk(tree)
    .flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c) => typeof c === 'string')
    .join(' ');
  assert.ok(!text.includes("can't be undone"), 'a notice must not read as a destructive confirm');
  assert.ok(text.includes('Notice'), 'a notice carries its own eyebrow');
});

test('the ordinary confirm is unchanged — cancel and confirm both render', () => {
  // The regression that matters in the other direction: `notice` is opt-in, so
  // every existing destructive caller must still get its Cancel button.
  const tree = render({ title: 'Delete this?', name: 'Week 3' });
  const btns = buttons(tree);
  assert.equal(btns.length, 2, 'a destructive confirm keeps both choices');
  assert.equal(label(btns[0]), 'Cancel');
  assert.equal(label(btns[1]), 'Confirm');
});

test('type-to-confirm still gates the confirm button, and is untouched by notice mode', () => {
  const tree = render({ title: 'Delete account', requireType: 'DELETE' });
  const btns = buttons(tree);
  assert.equal(btns.length, 2, 'a type-gated confirm is still a two-choice confirm');
  assert.equal(btns[1].props.disabled, true, 'confirm is disabled until the word is typed');
});
