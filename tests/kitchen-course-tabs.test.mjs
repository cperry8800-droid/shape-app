// The Kitchen's time tabs (≤ 15 min · 15–30 · 30–60 · 1 hr +) and its Filters menu.
//
// Owner, 2026-10-18, on the app's Kitchen:
//   • "this filter option is cut off on screen, have these filter options be a drop
//     down" — the diet/protein/free-from/goal toggles ran off the right edge of a
//     phone on one scrolling strip with nothing to say it scrolled.
//   • "center these filter options, and when i click on these filters, dont have it
//     move me down on screen to where they are located on page, have them appear
//     right below depending on the time, so i dont have to scroll back up to click on
//     a different time".
//
// So the time tabs FILTER IN PLACE: one course shows, right under the sticky tab row,
// and a tap never scrolls the page down to a course. This file MOUNTS the real
// BSRecipeBox (jsdom + react-dom/client, the broadsheet-checkin-pref loading pattern)
// on a fake scroller, because "the page did not move" is a fact about the scroller,
// not about any one function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');

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
const THEME = new Proxy({
  MONO: 'mono', DISPLAY: 'display', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK30: '#999',
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
  const source = `${readFileSync(SRC, 'utf8').replace(/import\.meta/g, '__VITE_IMPORTMETA__')}\nexport { BSRecipeBox, BS_KM_COURSES, bsKmCourseIndex, bsKmSortByTime };\n`;
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
const { BSRecipeBox, BS_KM_COURSES, bsKmCourseIndex, bsKmSortByTime } = await loadModule();
const { SHAPE_KITCHEN_RECIPES, recipeMatchesDiet } = await import(pathToFileURL(join(dirname(SRC), 'shapeKitchenData.js')).href);

// The layout: the condensed masthead the row sticks under is 92px (measured in
// Chromium at 390×844), the scroller starts 20px down the screen, and the tab row's
// own place in the page is 600px down the scroller's content. ZOOM is the app's text
// size, a CSS `zoom` on the phone surface: rects come back in ZOOMED screen px while
// offsetHeight, scrollTop and a sticky `top` stay in layout px (measured in Chromium
// 141: the bar's rect is 103px at Large and 83px at Small; its offsetHeight is 92).
const MAST = 92;
const HOST_TOP = 20;
const ROW_AT = 600;
const VIEW = 824;
let ZOOM = 1;
const host = () => document.querySelector('.bs-scroll');
const realRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
dom.window.HTMLElement.prototype.getBoundingClientRect = function rect() {
  const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 390, width: 390, x: 0, y: top });
  if (this.hasAttribute('data-bs-pinned-mast')) return box(HOST_TOP, MAST * ZOOM);
  if (this.classList.contains('bs-scroll')) return box(HOST_TOP, VIEW * ZOOM);
  // The anchor ends where the row's own place is: ROW_AT down the content, moved up the
  // screen by however far the scroller has scrolled.
  if (this.hasAttribute('data-km-tabs-anchor')) return box(HOST_TOP + (ROW_AT - 10 - (host()?.scrollTop || 0)) * ZOOM, 10 * ZOOM);
  return realRect.call(this);
};
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    if (this.hasAttribute('data-bs-pinned-mast')) return MAST;
    if (this.classList.contains('bs-scroll')) return VIEW;
    return 0;
  },
});

// Each course in the order the menu lists it (a course over 16 rows shows its first 12).
const COURSE_ROWS = BS_KM_COURSES.map((c, i) => bsKmSortByTime(SHAPE_KITCHEN_RECIPES.filter((r) => bsKmCourseIndex(r) === i)));

async function mount() {
  document.body.innerHTML = '<div data-bs-pinned-mast></div><div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(BSRecipeBox, {
    recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {},
  })));
  const h = host();
  let top = 0;
  Object.defineProperty(h, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
  // The measured masthead lands in a timer; wait it out so the row sticks at 92, as on a phone.
  await React.act(async () => { await new Promise((r) => setTimeout(r, 360)); });
  const tabs = () => [...document.querySelectorAll('[aria-label="Cooking time"] button')];
  const picked = () => tabs().map((b, i) => (b.getAttribute('aria-pressed') === 'true' ? i : -1)).filter((i) => i >= 0);
  const tap = (el) => React.act(async () => { el.click(); });
  const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));
  const trigger = () => document.querySelector('button[aria-controls="bskm-filters"]');
  // What is listed UNDER the tab row. Today's board sits above the row and names one
  // dish from each of the first three courses, so the whole page is the wrong haystack.
  const listed = (r) => {
    let el = tabs()[0].closest('[aria-label="Cooking time"]').parentElement.nextElementSibling;
    let text = '';
    for (; el; el = el.nextElementSibling) text += el.textContent;
    return text.includes(r.title);
  };
  return { root, h, tabs, picked, tap, button, trigger, listed, scrollTop: () => top, setScrollTop: (y) => { top = y; } };
}

test('the time tabs are one centred row of four equal cells — nothing to cut off', async () => {
  const page = await mount();
  const tabs = page.tabs();
  assert.equal(tabs.length, BS_KM_COURSES.length, 'one tab per course');
  assert.equal(tabs[0].parentElement.style.justifyContent, 'center', 'the tab row is not centred');
  for (const b of tabs) {
    assert.equal(b.style.flexGrow, '1', 'a tab does not share the row equally');
    assert.ok(/^0/.test(b.style.flexBasis), `a tab sizes to its own label (flex-basis ${b.style.flexBasis}) and can overflow`);
  }
  // The strip that ran off the edge is gone, and nothing else scrolls sideways.
  assert.equal([...document.querySelectorAll('div')].filter((d) => d.style.overflowX === 'auto').length, 0,
    'a sideways-scrolling strip is back on the Kitchen');
  await React.act(async () => page.root.unmount());
});

test('one course shows, and a tap shows another right under the row without scrolling', async () => {
  const page = await mount();
  assert.deepEqual(page.picked(), [0], 'the first course is not the one showing');
  assert.ok(COURSE_ROWS[0].every(page.listed), 'the first course is not all under the row');
  assert.ok(!COURSE_ROWS[1].some(page.listed), 'the next course is listed too — the tabs are not filtering');

  await page.tap(page.tabs()[2]);
  assert.deepEqual(page.picked(), [2]);
  assert.equal(page.scrollTop(), 0, 'a tap at the top of the page scrolled it');
  assert.ok(COURSE_ROWS[2].slice(0, 12).every(page.listed), '30–60 is not under the row after its tap');
  assert.ok(!COURSE_ROWS[0].some(page.listed), 'the course the member left is still listed');
  await React.act(async () => page.root.unmount());
});

for (const [size, zoom] of [['Medium', 1], ['Large', 1.12], ['Small', 0.9]]) {
  test(`tapped from down in a list, the page goes back to the row, never down to a course (${size} text)`, async () => {
    ZOOM = zoom;
    const page = await mount();
    // The row sticks right under the bar, in layout px, at every text size.
    const row = page.tabs()[0].closest('[aria-label="Cooking time"]').parentElement;
    assert.equal(row.style.top, `${MAST}px`, `at ${size} text the row sticks ${row.style.top} down, not under the ${MAST}px bar`);
    // Deep in a list, the row is stuck under the masthead. The new list must start right
    // under it: the page returns to the row's own place, where on screen the stuck row
    // already sits.
    page.setScrollTop(2400);
    await page.tap(page.tabs()[1]);
    assert.deepEqual(page.picked(), [1]);
    assert.equal(page.scrollTop(), ROW_AT - MAST, `at ${size} text the new list does not start under the row`);
    // Not stuck (the row is still in its place on the page): nothing moves at all.
    page.setScrollTop(300);
    await page.tap(page.tabs()[3]);
    assert.deepEqual(page.picked(), [3]);
    assert.equal(page.scrollTop(), 300, 'a tap with the row in view moved the page');
    await React.act(async () => page.root.unmount());
    ZOOM = 1;
  });
}

test('the filters are one dropdown that names what is on', async () => {
  const page = await mount();
  assert.equal(page.trigger().getAttribute('aria-expanded'), 'false');
  assert.ok(page.trigger().textContent.startsWith('Filters'), 'the closed menu does not say Filters');
  assert.equal(page.button('Vegan'), undefined, 'the options render with the menu closed');

  await page.tap(page.trigger());
  assert.equal(page.trigger().getAttribute('aria-expanded'), 'true');
  const panel = document.getElementById('bskm-filters');
  assert.ok(panel, 'the menu did not open under its trigger');
  for (const group of panel.children) assert.equal(group.style.flexWrap, 'wrap', 'an option group runs off the edge instead of wrapping');

  await page.tap(page.button('Vegan'));
  assert.ok(page.trigger().textContent.includes('Vegan'), 'the trigger does not say Vegan is on');
  await page.tap(page.button('Gluten-free'));
  assert.ok(page.trigger().textContent.includes('Vegan · Gluten-free'), 'the trigger does not list both filters');
  await React.act(async () => page.root.unmount());
});

test('a filter that empties the course on screen shows the first course that has anything', async () => {
  const page = await mount();
  // Measured on today's catalog: nothing vegan cooks in 15 minutes.
  const veganIn = COURSE_ROWS.map((rows) => rows.filter((r) => recipeMatchesDiet(r, 'Vegan')).length);
  assert.equal(veganIn[0], 0, 'a vegan dish now cooks in 15 minutes — pick another fixture for this test');
  const first = veganIn.findIndex((n) => n > 0);
  assert.ok(first > 0, 'no course has a vegan dish — the filter proves nothing');

  await page.tap(page.trigger());
  await page.tap(page.button('Vegan'));
  assert.deepEqual(page.picked(), [first], 'the list under the row went blank while the menu has vegan dishes');
  assert.ok(page.tabs()[0].disabled, 'an empty course can still be picked');
  // Clearing the filter brings back the course the member was on.
  await page.tap(page.button('Clear'));
  assert.deepEqual(page.picked(), [0]);
  await React.act(async () => page.root.unmount());
});
