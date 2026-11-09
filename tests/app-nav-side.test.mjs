// Where the app's nav bar sits (owner, 2026-11-08: "the ability for user to choose where they want the nav
// bar. Either at bottom of screen, vertically displayed on right side of phone screen or left", "on the app
// that is"). MOUNTED: the real BSTabBar and BSPage from mobile-app/src/broadsheet/iosAppBroadsheet.jsx in the
// real BSProvider. The choice is this phone's (localStorage), set in Settings → Customize → Nav bar; on a
// side it is the same bar turned upright, floating over the page as the bottom one does, and nothing else moves. Compares strings and booleans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
const h = React.createElement;

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const { BSProvider, BSTabBar, BSPage, bsNavSide, bsSetNavSide, bsSideNavLength, BS_NAV_SIDES } = window;
const root = document.documentElement.style;
const TABS = [{ key: 'home', label: 'Home' }, { key: 'train', label: 'Train' }, { key: 'eat', label: 'Eat' }, { key: 'chat', label: 'Chat' }];

test('the choice: bottom by default, left or right kept on this phone, anything else is bottom', () => {
  localStorage.clear();
  assert.deepEqual(BS_NAV_SIDES, ['bottom', 'left', 'right']);
  assert.equal(bsNavSide(), 'bottom');
  bsSetNavSide('right');
  assert.equal(localStorage.getItem('shape.navSide'), 'right');
  assert.equal(bsNavSide(), 'right');
  bsSetNavSide('top');
  assert.equal(bsNavSide(), 'bottom', 'an unknown side is bottom');
  assert.equal(localStorage.getItem('shape.navSide'), null, 'bottom stores nothing');
  localStorage.setItem('shape.navSide', 'sideways');
  assert.equal(bsNavSide(), 'bottom', 'a stray stored value reads as bottom');
  localStorage.clear();
});

// Owner, 2026-11-08: "dont change the layout on anything else on the screen". Choosing a side moves the bar
// and nothing else: no variable is set, so every page, composer and bar lays out as with the bar at the bottom.
test('choosing a side moves the bar and nothing else', () => {
  for (const side of ['left', 'right', 'bottom']) {
    bsSetNavSide(side);
    for (const v of ['--bs-tabbar-h', '--bs-nav-inset-left', '--bs-nav-inset-right']) assert.equal(root.getPropertyValue(v), '', side + ': ' + v + ' changes the layout');
  }
  assert.match(window.BS_TABBAR_CSS, /^calc\(/, 'what stands on the tab bar keeps its height whatever the side');
});

test('the tab bar stands upright on the side chosen, its gem sliding down it, and goes back to the bottom live', async () => {
  localStorage.clear();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = ReactDOMClient.createRoot(host);
  await act(async () => { r.render(h(BSProvider, { paperMode: 'light' }, h(BSTabBar, { tabs: TABS, active: 'eat', onChange() {} }))); });
  const dock = () => host.querySelector('[data-bs-tabbar-dock]');
  assert.equal(dock().getAttribute('data-bs-nav-side'), 'bottom');
  assert.equal(dock().style.bottom, '0px');
  assert.equal(host.querySelector('[data-bs-tabbar]').getAttribute('aria-orientation'), null);
  await act(async () => { bsSetNavSide('right'); });
  assert.equal(dock().getAttribute('data-bs-nav-side'), 'right');
  assert.match(dock().style.right, /safe-area-inset-right/);
  assert.equal(dock().style.top, '50%');
  const nav = host.querySelector('[data-bs-tabbar]');
  assert.equal(nav.getAttribute('aria-orientation'), 'vertical');
  assert.equal(nav.style.height, '100%', 'the bar fills its dock');
  // jsdom lays nothing out, so the dock takes its first-paint length: 52px a tab, 208 for these four.
  assert.equal(dock().style.height, '208px');
  assert.equal(dock().style.width, '44px', 'as thick as the bottom bar is tall');
  assert.match(nav.style.gridTemplateRows, /repeat\(4, 1fr\)/);
  const gem = host.querySelector('[data-bs-tab-mark]');
  // 9px pad − half the 26px gem, then two and a half quarters of the bar's inner height (jsdom's form).
  assert.equal(gem.style.top, 'calc(-4px + 2.5 * (0.25 * (100% - 18px)))', 'the gem sits on the third tab, down the bar');
  assert.equal(gem.style.left, '50%');
  assert.equal(host.querySelectorAll('[data-bs-tabbar] button').length, 4, 'every tab is still there');
  await act(async () => { bsSetNavSide('left'); });
  assert.match(dock().style.left, /safe-area-inset-left/);
  await act(async () => { bsSetNavSide('bottom'); });
  assert.equal(dock().getAttribute('data-bs-nav-side'), 'bottom');
  assert.equal(host.querySelector('[data-bs-tabbar]').getAttribute('aria-orientation'), null);
  await act(async () => r.unmount());
  localStorage.clear();
});

// Owner, 2026-11-08: "Stop creating a new screen/section for the nav on the page. Just have it overlap, be
// transparent like it is now". The page runs edge to edge under a side nav, as it runs under the bottom one.
test('a side nav floats over the page: the page and its pinned bar keep their full width', async () => {
  bsSetNavSide('right');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = ReactDOMClient.createRoot(host);
  await act(async () => { r.render(h(BSProvider, { paperMode: 'light' }, h(BSPage, null, h('p', null, 'page')))); });
  const scroller = host.querySelector('.bs-scroll');
  assert.equal(scroller.style.paddingLeft, '');
  assert.equal(scroller.style.paddingRight, '');
  const bar = host.querySelector('[data-bs-pinned-mast]');
  assert.equal(bar.style.left, '0px');
  assert.equal(bar.style.right, '0px');
  await act(async () => r.unmount());
  bsSetNavSide('bottom');
  localStorage.clear();
});

// Owner, 2026-11-09: "I want to see setting option of selecting where I want the nav bar on app" (it was the
// last row of Training & nutrition, under the preview's banner): Customize's first row, named on its tile.
test('Settings → Customize opens on Nav bar: Bottom, Left, Right, kept on this phone, and its tile names it', () => {
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const navSide = typeof window\.useBSNavSide === 'function' \? window\.useBSNavSide\(\) : 'bottom';/);
  assert.match(client, /const navSideRow = typeof window\.bsSetNavSide === 'function' \? \{ l: tr\('settings:pref\.navSide', \{ defaultValue: 'Nav bar' \}\), segmented: \['bottom', 'left', 'right'\],/);
  assert.match(client, /value: navSide, onPick: \(v\) => window\.bsSetNavSide\(v\),/);
  // Customize's first row, straight under its header.
  assert.match(client, /<DetailBack title=\{tr\('settings:section\.customize', \{ defaultValue: 'Customize' \}\)\} \/>\n(\s*\{\/\*[^]*?\*\/\}\n)?\s*\{navSideRow \? <div data-settings-nav-side="">\{renderRows\(\[navSideRow\]\)\}<\/div> : null\}/);
  // Once: not also in Preferences.
  assert.equal((client.match(/segmented: \['bottom', 'left', 'right'\]/g) || []).length, 1, 'the Nav bar row is offered twice');
  // The Customize tile says where the bar is.
  assert.match(client, /\}\) \+ \(navSideRow \? ` · \$\{tr\('settings:pref\.navSide', \{ defaultValue: 'Nav bar' \}\)\} \$\{navSideLabels\[\['bottom', 'left', 'right'\]\.indexOf\(navSide\)\] \|\| navSideLabels\[0\]\}` : ''\);/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'settings.json'), 'utf8'));
    for (const k of ['pref.navSide', 'pref.navBottom', 'pref.navLeft', 'pref.navRight', 'pref.navSideDesc']) assert.ok(typeof cat[k] === 'string' && cat[k].length > 0, `${loc}: ${k}`);
  }
});

// Owner, 2026-11-08: "make it the same size and look just going vertically on the side of the screen"; then,
// 2026-11-09, "make the nav bar on the sides shorter, not as long" (it ran the bottom bar's 342px on a 390 phone).
test('on a side the bar is 52px a tab, never longer than the bottom bar is wide, shorter on a screen too short for it', () => {
  assert.equal(window.BS_SIDE_NAV_TAB, 52);
  assert.equal(bsSideNavLength(390, 844, 5), 260, 'a 390 phone: five tabs at 52, not the bottom bar\'s 342');
  assert.equal(bsSideNavLength(430, 932, 5), 260, 'a bigger phone does not stretch it');
  assert.equal(bsSideNavLength(390, 844, 4), 208, 'four tabs: 208');
  assert.equal(bsSideNavLength(300, 844, 5), 252, 'never longer than the bottom bar: 300 less 24 each side');
  assert.equal(bsSideNavLength(844, 290, 5), 242, 'held sideways: the screen\'s height less 24 above and below');
  assert.equal(bsSideNavLength(844, 200, 5), 220, 'never shorter than 44 a tab');
  assert.equal(bsSideNavLength(0, 844, 5), null, 'nothing measured: no length');
  assert.equal(bsSideNavLength(undefined, undefined, 5), null);
});

// Codex, #2634: a phone whose storage refuses the write still moves the bar when the side is picked.
test('a side picked on a phone whose storage refuses the write still moves the bar', async () => {
  localStorage.clear();
  const proto = Object.getPrototypeOf(localStorage);
  const realSet = proto.setItem;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = ReactDOMClient.createRoot(host);
  try {
    proto.setItem = () => { throw new Error('QuotaExceededError'); };
    await act(async () => { r.render(h(BSProvider, { paperMode: 'light' }, h(BSTabBar, { tabs: TABS, active: 'home', onChange() {} }))); });
    await act(async () => { bsSetNavSide('left'); });
    assert.equal(localStorage.getItem('shape.navSide'), null, 'the write was refused');
    assert.equal(host.querySelector('[data-bs-tabbar-dock]').getAttribute('data-bs-nav-side'), 'left', 'the bar stayed at the bottom');
  } finally {
    proto.setItem = realSet;
    await act(async () => { bsSetNavSide('bottom'); });
    await act(async () => r.unmount());
    localStorage.clear();
  }
});
