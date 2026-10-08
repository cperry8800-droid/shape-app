// The Kitchen's jump row (≤ 15 min · 15–30 · 30–60 · 1 hr +) lights the course a tap
// scrolled to.
//
// ⚠ THE DEFECT, MEASURED IN THE APP 2026-10-08. Tapping 15–30 lit ≤ 15, 30–60 lit 15–30,
// and 1 hr + lit 30–60. The jump put a course's top under the row counting from the top
// of the page's scroller; the spy read that top counting from the top of the screen. In
// the app's preview the scroller starts 20px down the screen, so a course the jump had
// just placed at 158px (viewport) never reached the spy's line at 148px, and the course
// before it stayed lit. Both now take one line from services/jumpRow.mjs.
//
// So this file MOUNTS the real BSRecipeBox (jsdom + react-dom/client; the
// broadsheet-checkin-pref loading pattern) on a fake scroller laid out with the numbers
// measured in Chromium: a two-frame defect lives in the wiring between the rules, and
// a pure test of either rule alone would pass on the broken page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsJumpLine, bsJumpActive, bsJumpAtEnd, bsJumpScrollTop } from '../mobile-app/src/services/jumpRow.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

// ── the rules, alone ─────────────────────────────────────────────────────────

test('the line is the scroller top, the masthead and the row', () => {
  assert.equal(bsJumpLine({ hostTop: 20, stickyTop: 92, rowHeight: 47 }), 159);
  assert.equal(bsJumpLine({ hostTop: NaN, stickyTop: 92, rowHeight: 47 }), 139, 'an unmeasured part counts as 0');
  assert.equal(bsJumpLine(), 0);
});

test('the last course whose top reached the line is lit', () => {
  const line = 159;
  // The app's measured layout once 15–30 was tapped: its top on the line.
  assert.equal(bsJumpActive({ tops: [-2192, 159, 2122, 4251], line }), 1);
  assert.equal(bsJumpActive({ tops: [-2192, 159 + 24, 2122, 4251], line }), 1, 'within the slack');
  assert.equal(bsJumpActive({ tops: [-2192, 159 + 25, 2122, 4251], line }), 0, 'past the slack');
  assert.equal(bsJumpActive({ tops: [800, 3150, 5110, 7240], line }), 0, 'none reached: the first course');
  assert.equal(bsJumpActive({ tops: [null, 800, 3150, null], line }), 1, 'none reached: the first course ON THE PAGE');
  assert.equal(bsJumpActive({ tops: [null, null, null, null], line }), -1, 'no course on the page');
});

test('at the end of the scroll the last course on screen is lit', () => {
  // A filtered menu whose last course is too short to reach the line.
  const tops = [-900, -300, 400, 640];
  assert.equal(bsJumpActive({ tops, line: 159 }), 1);
  assert.equal(bsJumpActive({ tops, line: 159, atEnd: true, viewBottom: 844 }), 3);
  assert.equal(bsJumpActive({ tops: [-900, -300, 400, 900], line: 159, atEnd: true, viewBottom: 844 }), 2, 'a course below the screen is not on it');
  assert.equal(bsJumpAtEnd({ scrollTop: 700, scrollHeight: 1524, clientHeight: 824 }), true);
  assert.equal(bsJumpAtEnd({ scrollTop: 600, scrollHeight: 1524, clientHeight: 824 }), false);
  assert.equal(bsJumpAtEnd({ scrollTop: 0, scrollHeight: 600, clientHeight: 824 }), false, 'a page that cannot scroll is never at its end');
  assert.equal(bsJumpAtEnd({ scrollTop: 0, scrollHeight: 824.5, clientHeight: 824 }), false, 'nor is one at its top');
});

test('a jump puts the course top on the line, never above the page', () => {
  assert.equal(bsJumpScrollTop({ scrollTop: 664, top: 2508, line: 159 }), 3013);
  assert.equal(bsJumpScrollTop({ scrollTop: 0, top: 100, line: 159 }), 0);
});

// ── the page, mounted ────────────────────────────────────────────────────────

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.__VITE_IMPORTMETA__ = { env: { BASE_URL: '/m/' } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { createRoot } = require_('react-dom/client');
const INK = '#111';
const THEME = new Proxy({
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK, INK30: '#999',
  INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', ACCENT: '#0f766e',
  padX: 18, isLight: true, W: { display: 800 },
}, { get: (t, k) => (k in t ? t[k] : '#000'), has: () => true });
for (const g of [dom.window, globalThis]) {
  g.useBS = () => THEME;
  // The page's scroller is BSPage's own `.bs-scroll`.
  g.BSPage = ({ children }) => React.createElement('div', { className: 'bs-scroll' }, children);
  g.BSPageHeader = () => null;
  g.BSEyebrow = ({ children }) => React.createElement('div', null, children);
  g.BSFooter = () => null;
}

async function loadModule() {
  const dir = dirname(SRC);
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSRecipeBox, BS_KM_COURSES };\n`;
  const babel = require_('next/dist/compiled/babel/core');
  const { code } = babel.transformSync(source, {
    presets: [require_('next/dist/compiled/babel/preset-react')],
    plugins: [require_('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
    babelrc: false, configFile: false, filename: SRC,
  });
  const specs = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const registry = new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]);
  for (const spec of specs) {
    if (registry.has(spec)) continue;
    registry.set(spec, /\.jsx$/.test(spec)
      ? await loadRealModule(join(dir, spec), { registry: new Map([...registry].filter(([n]) => !n.startsWith('.') && !n.startsWith('/'))) })
      : await import(pathToFileURL(join(dir, spec)).href));
  }
  const mod = { exports: {} };
  const req = (spec) => { if (!registry.has(spec)) throw new Error(`unmapped import: ${spec}`); return registry.get(spec); };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}
const { BSRecipeBox, BS_KM_COURSES } = await loadModule();
const { SHAPE_KITCHEN_RECIPES } = await import(pathToFileURL(join(dirname(SRC), 'shapeKitchenData.js')).href);

// The layout measured in Chromium at 390×844 on 2026-10-08: the masthead the row sticks
// under is 92px, the row 47px, and each course's top sits this far down the scroller's
// content. `hostTop` is where the scroller starts on the screen: 20 in the preview,
// more under a notch.
const MAST = 92;
const ROW = 47;
const VIEW = 824;
const OFFSETS = { under15: 802, c15to30: 3152, c30to60: 5116, over60: 7245 };
const CONTENT = 8708 + VIEW;

let LAYOUT = { hostTop: 20, content: CONTENT, moves: true };
const realRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
const host = () => document.querySelector('.bs-scroll');
dom.window.HTMLElement.prototype.getBoundingClientRect = function rect() {
  const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 390, width: 390, x: 0, y: top });
  if (this.hasAttribute('data-bs-pinned-mast')) return box(LAYOUT.hostTop, MAST);
  if (this.classList.contains('bs-scroll')) return box(LAYOUT.hostTop, VIEW);
  const key = (this.id || '').replace(/^bskm-/, '');
  if (key in OFFSETS) return box(LAYOUT.hostTop + OFFSETS[key] - (host()?.scrollTop || 0), 400);
  return realRect.call(this);
};
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() { return this.querySelector && this.querySelector('[aria-label="Jump to a course"]') ? ROW : 0; },
});

async function mount() {
  document.body.innerHTML = '<div data-bs-pinned-mast></div><div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(BSRecipeBox, {
    recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {},
  })));
  const h = host();
  let top = 0;
  Object.defineProperty(h, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
  Object.defineProperty(h, 'scrollHeight', { configurable: true, get: () => LAYOUT.content });
  Object.defineProperty(h, 'clientHeight', { configurable: true, get: () => VIEW });
  const scrollTo = (y) => React.act(async () => {
    top = Math.max(0, Math.min(LAYOUT.content - VIEW, y));
    h.dispatchEvent(new dom.window.Event('scroll'));
  });
  // A tap's smooth scroll. `moves: false` is a scroll still on its way (or one that cannot
  // get there): the scroller has not moved when the tab is read.
  h.scrollTo = (opt) => { if (LAYOUT.moves) { top = Math.max(0, Math.min(LAYOUT.content - VIEW, opt.top)); h.dispatchEvent(new dom.window.Event('scroll')); } };
  // The measured masthead lands in a timer; wait it out so stickyTop is 92, as on a phone.
  await React.act(async () => { await new Promise((r) => setTimeout(r, 360)); });
  const tabs = () => [...document.querySelectorAll('[aria-label="Jump to a course"] button')];
  const lit = () => tabs().map((b, i) => (b.style.background && b.style.background !== 'transparent' ? i : -1)).filter((i) => i >= 0);
  const tap = (i) => React.act(async () => {
    tabs()[i].dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    tabs()[i].click();
  });
  // A member's own scroll: a wheel, then the scroll it causes.
  const byHand = async (y) => {
    h.dispatchEvent(new dom.window.Event('wheel', { bubbles: true }));
    await scrollTo(y);
  };
  return { root, h, tabs, lit, tap, byHand, scrollTop: () => top };
}

test('the mount reads the measured layout', async () => {
  LAYOUT = { hostTop: 20, content: CONTENT, moves: true };
  const page = await mount();
  assert.deepEqual(BS_KM_COURSES.map((c) => c.key), Object.keys(OFFSETS), 'the courses this layout was measured for');
  assert.equal(page.tabs().length, 4);
  assert.deepEqual(page.lit(), [0], 'the first course is lit at the top of the menu');
  await React.act(async () => page.root.unmount());
});

for (const hostTop of [0, 20, 59]) {
  test(`each tab lights the course it scrolled to, scroller ${hostTop}px down the screen`, async () => {
    LAYOUT = { hostTop, content: CONTENT, moves: true };
    const page = await mount();
    for (const i of [1, 3, 0, 2, 1]) {
      await page.tap(i);
      assert.deepEqual(page.lit(), [i], `tapping tab ${i} lit ${page.lit()}`);
      // And the course lands on the stuck row's bottom edge, not under the row: the spy and
      // the jump can agree with each other and both be wrong about the screen.
      const course = document.getElementById(`bskm-${BS_KM_COURSES[i].key}`);
      assert.equal(course.getBoundingClientRect().top, hostTop + MAST + ROW, `tab ${i}'s course landed off the row`);
      // The spy alone, after a scroll by hand of 0px: it must agree with the jump.
      await page.byHand(page.scrollTop());
      assert.deepEqual(page.lit(), [i], `the spy disagrees with the jump on tab ${i}: it lit ${page.lit()}`);
    }
    await React.act(async () => page.root.unmount());
  });
}

test('a tapped tab is lit at once and stays lit while the scroll passes other courses', async () => {
  LAYOUT = { hostTop: 20, content: CONTENT, moves: false };
  const page = await mount();
  await page.tap(3);
  assert.deepEqual(page.lit(), [3], 'lit before the scroller moved');
  // The smooth scroll's own frames, passing 15–30 and 30–60 on the way.
  for (const y of [2000, 3100, 5000]) {
    page.h.scrollTop = y;
    await React.act(async () => { page.h.dispatchEvent(new dom.window.Event('scroll')); });
    assert.deepEqual(page.lit(), [3], `a frame at ${y} relit ${page.lit()}`);
  }
  // Then the member scrolls by hand, and the spy reads the page again.
  await page.byHand(3100);
  assert.deepEqual(page.lit(), [1]);
  await React.act(async () => page.root.unmount());
});

test('scrolled by hand to the end, a last course too short to reach the line is lit', async () => {
  // Content ending 300px below 1 hr +'s top: its top can rise no higher than 544px.
  LAYOUT = { hostTop: 20, content: OFFSETS.over60 + 300, moves: true };
  const page = await mount();
  await page.byHand(OFFSETS.over60 + 300 - VIEW - 200);
  assert.deepEqual(page.lit(), [2], 'short of the end, 30–60 is the course being read');
  await page.byHand(OFFSETS.over60 + 300 - VIEW);
  assert.deepEqual(page.lit(), [3]);
  await React.act(async () => page.root.unmount());
});
