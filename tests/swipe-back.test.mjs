// Swipe right to go back (owner, 2026-10-30: "if im on one page and want to go back, i can swipe
// right and it will bring me back to previous page").
//
// The gesture layer only knew the shell's stack, which holds its jumps, so a detail page opened
// inside a screen (Progress from Home, Workout review from Today) did nothing on an edge swipe,
// and a right swipe on it stepped the tabs while its ← Back sat on screen. Now every BSPage knows
// the Back it shows, and the swipe calls it. These tests drive the REAL chrome — BSPage,
// BSBackButton and BSNavGestures compiled from iosAppBroadsheet.jsx — with touches on a small
// fake DOM (jsdom is not in this repo), and the pure rules in swipeIntent.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { bsSwipeBackRoute, bsSwipeFollow, bsSwipeBackCommits, BS_SWIPE } from '../mobile-app/src/services/swipeIntent.mjs';

const require_ = createRequire(import.meta.url);
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');
const commonjs = require_('next/dist/compiled/babel/plugin-transform-modules-commonjs');
const React = require_('react');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheet.jsx');
const RAW = readFileSync(SRC, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── The pure rules ──────────────────────────────────────────────────────────────────────────────
test('a page with its own Back takes the edge swipe and a right swipe; without one, the shell does', () => {
  assert.equal(bsSwipeBackRoute({ intent: 'back', hasPageBack: true }), 'page');
  assert.equal(bsSwipeBackRoute({ intent: 'prev-tab', hasPageBack: true }), 'page', 'a right swipe on a page with a Back goes back, not to the previous tab');
  assert.equal(bsSwipeBackRoute({ intent: 'next-tab', hasPageBack: true }), 'shell', 'a left swipe is not a back');
  assert.equal(bsSwipeBackRoute({ intent: 'back', hasPageBack: false }), 'shell');
  assert.equal(bsSwipeBackRoute({ intent: 'prev-tab', hasPageBack: false }), 'shell', 'a root tab still steps the tabs');
  assert.equal(bsSwipeBackRoute({ intent: null, hasPageBack: true }), null);
});

test('an edge drag follows the finger only once it moves right more than it moves down', () => {
  assert.equal(bsSwipeFollow({ dx: 4, dy: 3 }), null, 'undecided inside the slop');
  assert.equal(bsSwipeFollow({ dx: BS_SWIPE.FOLLOW_SLOP + 2, dy: 3 }), 'follow');
  assert.equal(bsSwipeFollow({ dx: 6, dy: 30 }), 'cancel', 'a scroll that starts at the edge stays a scroll');
  assert.equal(bsSwipeFollow({ dx: -20, dy: 2 }), 'cancel', 'a leftward drag never pulls the page');
});

test('let go past a third of the width, or on a flick, and it goes back; a short slow drag springs back', () => {
  const width = 390;
  assert.equal(bsSwipeBackCommits({ dx: 140, dt: 2000, width }), true, 'slow but far');
  assert.equal(bsSwipeBackCommits({ dx: 80, dt: 120, width }), true, 'short but fast');
  assert.equal(bsSwipeBackCommits({ dx: 80, dt: 900, width }), false, 'short and slow');
  assert.equal(bsSwipeBackCommits({ dx: 40, dt: 30, width }), false, 'a flick shorter than BACK_DX');
  assert.equal(bsSwipeBackCommits({ dx: -50, dt: 50, width }), false);
  for (const k of ['FOLLOW_SLOP', 'FOLLOW_COMMIT', 'FLICK_V']) assert.equal(typeof BS_SWIPE[k], 'number', k);
});

// ── The chrome, driven ──────────────────────────────────────────────────────────────────────────
const THEME = {
  INK: '#111', INK70: '#555', INK50: '#777', PAPER: '#fff', PAPER_BG: '#fff', TEXTURE: null, RULE: '#ddd',
  SURFACE_BORDER: '#ddd', MONO: 'mono', BODY: 'body', DISPLAY: 'display', W: { display: 700 }, padX: 22, isLight: true, inkRGB: '15,14,12',
};
const contextValues = new Map();
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
  useRef(init) { const i = idx++; if (!(i in cells)) cells[i] = { current: init }; return cells[i]; },
  useMemo(fn) { const i = idx++; if (!(i in cells)) cells[i] = fn(); return cells[i]; },
  useCallback(fn) { const i = idx++; if (!(i in cells)) cells[i] = fn; return cells[i]; },
  useEffect(fn) { effects.push(fn); },
  useContext(ctx) { return contextValues.has(ctx) ? contextValues.get(ctx) : THEME; },
};
const render = (fn, props) => { cells.length = 0; effects.length = 0; idx = 0; const tree = fn(props); return tree; };
const flush = () => { const out = effects.map((f) => f()); effects.length = 0; return out; };

// A small DOM: enough for the gesture layer's ancestor walk and the page lookups.
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.Element = class Element {};
class El extends globalThis.Element {
  constructor({ tag = 'div', id = '', attrs = {}, parent = null, hidden = false, style = {} } = {}) {
    super();
    Object.assign(this, { tagName: tag.toUpperCase(), id, attrs, parentElement: parent, hidden, cs: style });
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.listeners = {};
  }
  hasAttribute(n) { return n in this.attrs; }
  closest(sel) {
    for (let el = this; el; el = el.parentElement) {
      if (sel === '[data-bs-page]' && el.hasAttribute('data-bs-page')) return el;
      if (sel.startsWith('input') && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return el;
    }
    return null;
  }
  getClientRects() { return this.hidden ? [] : [{}]; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeEventListener() {}
  get offsetWidth() { return 390; }
  get offsetHeight() { return 844; }
  get clientWidth() { return 390; }
  get clientHeight() { return 844; }
}
const surface = new El({ id: 'bs-phone-surface' });
globalThis.document = { getElementById: (id) => (id === 'bs-phone-surface' ? surface : null), body: {}, head: { appendChild() {} }, createElement: () => ({}), elementFromPoint: () => null };
globalThis.getComputedStyle = (el) => ({ touchAction: 'auto', overflowY: 'visible', overflowX: 'visible', zIndex: 'auto', position: 'static', ...el.cs });
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const dispatched = [];
globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
globalThis.dispatchEvent = (e) => { dispatched.push(e.detail && e.detail.intent); return true; };

const source = `${RAW.replace(/import\.meta/g, '__IMPORT_META__')}
export { BSPage, BSBackButton, BSNavGestures, BSPageBackCtx, bsPageBackFor, bsPageOuter };
`;
globalThis.__IMPORT_META__ = { env: { BASE_URL: '/m/' } };
const { code } = babel.transformSync(source, { presets: [presetReact], plugins: [commonjs], babelrc: false, configFile: false, filename: SRC });
const registry = new Map([['react', shim]]);
for (const spec of [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])) {
  if (!registry.has(spec)) registry.set(spec, await import(pathToFileURL(join(dirname(SRC), spec)).href));
}
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', code)((s) => { if (!registry.has(s)) throw new Error(`unmapped import: ${s}`); return registry.get(s); }, mod, mod.exports);
const { BSPage, BSBackButton, BSNavGestures, BSPageBackCtx, bsPageBackFor, bsPageOuter } = mod.exports;
globalThis.useBS = () => THEME;
globalThis.BSMastCorner = function MastCorner() { return null; };

function walk(node, out = []) {
  if (node == null || node === false) return out;
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return out; }
  if (typeof node === 'object' && node.props) { out.push(node); walk(node.props.children, out); }
  return out;
}

// A page as the app draws it: BSPage's wrapper and scroller, stamped and registered through their
// own refs, and the Back channel BSPage hands its children.
function mountPage() {
  const tree = render(BSPage, { children: null });
  const nodes = walk(tree);
  const marked = nodes.filter((n) => n.props['data-bs-page'] === '');
  assert.equal(marked.length, 2, 'the page stamps its wrapper and its scroller');
  const wrap = new El({ attrs: { 'data-bs-page': '' }, parent: surface });
  const scroller = new El({ attrs: { 'data-bs-page': '' }, parent: wrap, style: { overflowY: 'scroll', touchAction: 'pan-y' } });
  marked[0].ref(wrap);
  marked[1].ref(scroller);
  const channel = nodes.find((n) => n.type === BSPageBackCtx.Provider);
  assert.ok(channel && typeof channel.props.value.add === 'function', 'the page hands its children a Back channel');
  const detail = nodes.find((n) => n.props.value && typeof n.props.value.register === 'function');
  const content = new El({ parent: scroller });
  return { wrap, scroller, content, channel: channel.props.value, detail: detail && detail.props.value };
}

test('a page answers with the Back it shows: the newest one on screen', () => {
  const { wrap, content, channel } = mountPage();
  assert.equal(bsPageBackFor(content).back, null, 'no Back on the page');
  assert.equal(bsPageBackFor(content).page !== null, true);
  const first = () => 'first';
  const second = () => 'second';
  const offFirst = channel.add({ fn: { current: first }, el: { current: new El() } });
  const offSecond = channel.add({ fn: { current: second }, el: { current: new El({ hidden: true }) } });
  assert.equal(bsPageBackFor(content).back, first, 'a Back that is not on screen is skipped');
  const third = () => 'third';
  channel.add({ fn: { current: third }, el: { current: new El() } });
  assert.equal(bsPageBackFor(content).back, third, 'the newest Back on screen wins (a page opened inside the page)');
  offSecond(); offFirst();
  assert.equal(bsPageOuter(content.closest('[data-bs-page]')), wrap, 'the page that slides is the outer one, its pinned masthead with it');
});

test('with no Back button on screen, the detail header\'s Back answers', () => {
  const { content, detail } = mountPage();
  assert.ok(detail, 'the page hands its detail header a register');
  const back = () => {};
  detail.register({ titleRef: { current: null }, backRef: { current: back } });
  assert.equal(bsPageBackFor(content).back, back);
});

test('a Back button registers with its page, and its onClick is what the swipe calls', () => {
  const added = [];
  contextValues.set(BSPageBackCtx, { add: (b) => { added.push(b); return () => {}; } });
  const onBack = () => {};
  render(BSBackButton, { onClick: onBack });
  flush();
  contextValues.delete(BSPageBackCtx);
  assert.equal(added.length, 1);
  assert.equal(added[0].fn.current, onBack);
});

// Touches through the real BSNavGestures listeners.
render(BSNavGestures, {});
flush();
const touch = (type, target, x, y) => surface.listeners[type]({ target, touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] });

test('a right swipe on a page with a Back goes back, and the shell is not asked', async () => {
  const { content, channel } = mountPage();
  let backs = 0;
  channel.add({ fn: { current: () => { backs++; } }, el: { current: new El() } });
  dispatched.length = 0;
  touch('touchstart', content, 140, 400);
  touch('touchmove', content, 220, 402);
  touch('touchend', content, 300, 405);
  assert.equal(backs, 1, 'a mid-screen right swipe calls the page\'s Back');
  assert.deepEqual(dispatched, [], 'and does not step the tabs');
  await sleep(10);
});

test('on a page with no Back, a right swipe still steps the tabs', () => {
  const { content } = mountPage();
  dispatched.length = 0;
  touch('touchstart', content, 140, 400);
  touch('touchend', content, 300, 405);
  assert.deepEqual(dispatched, ['prev-tab']);
});

test('an edge drag pulls the page with the finger and goes back on release past the threshold', async () => {
  const { wrap, content, channel } = mountPage();
  let backs = 0;
  channel.add({ fn: { current: () => { backs++; } }, el: { current: new El() } });
  dispatched.length = 0;
  touch('touchstart', content, 6, 400);
  touch('touchmove', content, 30, 401);
  assert.equal(wrap.style.transform, 'translateX(24px)', 'the whole page moves with the finger');
  touch('touchmove', content, 226, 404);
  assert.equal(wrap.style.transform, 'translateX(220px)');
  touch('touchend', content, 226, 404);
  assert.equal(backs, 0, 'it slides away first');
  await sleep(260);
  assert.equal(backs, 1, 'then goes back');
  assert.equal(wrap.style.transform, '', 'and leaves no transform behind');
  assert.deepEqual(dispatched, []);
});

test('a short slow edge drag springs back and stays', async () => {
  const { wrap, content, channel } = mountPage();
  let backs = 0;
  channel.add({ fn: { current: () => { backs++; } }, el: { current: new El() } });
  touch('touchstart', content, 6, 400);
  touch('touchmove', content, 30, 401);
  await sleep(300); // slow: well under FLICK_V, and short of a third of the width
  touch('touchmove', content, 60, 402);
  touch('touchend', content, 60, 402);
  await sleep(260);
  assert.equal(backs, 0);
  assert.equal(wrap.style.transform, '');
});

test('a swipe that starts in a text field is the field\'s, not a back', () => {
  const { scroller, channel } = mountPage();
  let backs = 0;
  channel.add({ fn: { current: () => { backs++; } }, el: { current: new El() } });
  const field = new El({ tag: 'input', parent: scroller });
  dispatched.length = 0;
  touch('touchstart', field, 140, 400);
  touch('touchend', field, 300, 405);
  assert.equal(backs, 0);
  assert.deepEqual(dispatched, []);
});
