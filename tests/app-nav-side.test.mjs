// Where the app's nav bar sits (owner, 2026-11-08: "the ability for user to choose where they want the nav
// bar. Either at bottom of screen, vertically displayed on right side of phone screen or left", "on the app
// that is"). MOUNTED: the real BSTabBar and BSPage from mobile-app/src/broadsheet/iosAppBroadsheet.jsx in the
// real BSProvider. The choice is this phone's (localStorage), set in Settings → Preferences → Nav bar; on a
// side the capsule stands upright and the page keeps that strip clear, and every bar that stands on the tab
// bar comes down to the screen's foot (--bs-tabbar-h). Bottom sets nothing. Compares strings and booleans.
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
const { BSProvider, BSTabBar, BSPage, bsNavSide, bsSetNavSide, BS_NAV_SIDES } = window;
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

test('on a side the page keeps that strip clear and what stands on the tab bar comes down; bottom sets nothing', () => {
  bsSetNavSide('left');
  assert.match(root.getPropertyValue('--bs-nav-inset-left'), /^calc\(70px \+ env\(safe-area-inset-left, 0px\)\)$/);
  assert.equal(root.getPropertyValue('--bs-nav-inset-right'), '0px');
  assert.match(root.getPropertyValue('--bs-tabbar-h'), /^max\(12px/);
  bsSetNavSide('right');
  assert.equal(root.getPropertyValue('--bs-nav-inset-left'), '0px');
  assert.match(root.getPropertyValue('--bs-nav-inset-right'), /safe-area-inset-right/);
  bsSetNavSide('bottom');
  for (const v of ['--bs-tabbar-h', '--bs-nav-inset-left', '--bs-nav-inset-right']) assert.equal(root.getPropertyValue(v), '', v + ' outlived the side nav');
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
  assert.equal(nav.style.height, (50 * TABS.length + 18) + 'px', 'one 50px row a tab, the 9px pad top and bottom');
  assert.match(nav.style.gridTemplateRows, /repeat\(4, 1fr\)/);
  const gem = host.querySelector('[data-bs-tab-mark]');
  // 9px pad − half the 30px gem, then two and a half quarters of the bar's inner height (jsdom's form).
  assert.equal(gem.style.top, 'calc(-6px + 2.5 * (0.25 * (100% - 18px)))', 'the gem sits on the third tab, down the bar');
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

test('every page and its pinned bar take the strip a side nav stands in', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = ReactDOMClient.createRoot(host);
  await act(async () => { r.render(h(BSProvider, { paperMode: 'light' }, h(BSPage, null, h('p', null, 'page')))); });
  const scroller = host.querySelector('.bs-scroll');
  assert.equal(scroller.style.paddingLeft, 'var(--bs-nav-inset-left, 0px)');
  assert.equal(scroller.style.paddingRight, 'var(--bs-nav-inset-right, 0px)');
  const bar = host.querySelector('[data-bs-pinned-mast]');
  assert.equal(bar.style.left, 'var(--bs-nav-inset-left, 0px)');
  assert.equal(bar.style.right, 'var(--bs-nav-inset-right, 0px)');
  await act(async () => r.unmount());
});

test('Settings → Preferences offers Nav bar: Bottom, Left, Right, kept on this phone', () => {
  const client = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const navSide = typeof window\.useBSNavSide === 'function' \? window\.useBSNavSide\(\) : 'bottom';/);
  assert.match(client, /tr\('settings:pref\.navSide', \{ defaultValue: 'Nav bar' \}\), segmented: \['bottom', 'left', 'right'\],/);
  assert.match(client, /value: navSide, onPick: \(v\) => window\.bsSetNavSide\(v\),/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'settings.json'), 'utf8'));
    for (const k of ['pref.navSide', 'pref.navBottom', 'pref.navLeft', 'pref.navRight', 'pref.navSideDesc']) assert.ok(typeof cat[k] === 'string' && cat[k].length > 0, `${loc}: ${k}`);
  }
});
