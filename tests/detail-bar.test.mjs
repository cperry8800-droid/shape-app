// A detail page's header in one line on scroll (owner, 2026-10-25: "yes make the header smaller on scroll",
// of the Library, whose header — back, the count, the kicker and a two-line title — stayed pinned whole,
// about a quarter of the screen). MOUNTED: the real BSPage from mobile-app/src/broadsheet/iosAppBroadsheet.jsx
// in the real BSProvider. A detail header registers its title with useBSDetailBar and scrolls away; BSPage's
// pinned bar comes in at 64px as on every page, and once the title has gone under it the bar's row reads ←
// and the title, keeping its corner. The ← goes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
const { BSProvider, BSPage, useBSDetailBar, bsTitleText, bsMastCondenseAt } = window;

test('a title reads as one line of words: a line break is a space and a styled span gives its text', () => {
  assert.equal(bsTitleText(h(React.Fragment, null, 'Saved', h('br'), 'carts.')), 'Saved carts.');
  assert.equal(bsTitleText(h(React.Fragment, null, 'Shape', h('br'), h('span', { style: { fontStyle: 'italic' } }, 'Score.'))), 'Shape Score.');
  assert.equal(bsTitleText(['Gear & ', h('span', null, 'perks.')]), 'Gear & perks.');
  assert.equal(bsTitleText(null), '');
});

test('the row turns to the title once the title\'s bottom is under the bar, and never before 64px', () => {
  const scroller = {};
  const header = { offsetTop: 0, offsetParent: scroller };
  const title = { offsetTop: 150, offsetHeight: 58, offsetParent: header };
  // 150 + 58 − 92: the title's bottom reaches the bar's at 116px.
  assert.equal(bsMastCondenseAt(scroller, title, { offsetHeight: 92 }), 116);
  // A short header still waits for the bar itself.
  assert.equal(bsMastCondenseAt(scroller, { offsetTop: 10, offsetHeight: 30, offsetParent: scroller }, { offsetHeight: 92 }), 64);
  // No title, or one not laid out inside this scroller: the plain 64.
  assert.equal(bsMastCondenseAt(scroller, null, { offsetHeight: 92 }), 64);
  assert.equal(bsMastCondenseAt(scroller, { offsetTop: 400, offsetHeight: 58, offsetParent: null }, { offsetHeight: 92 }), 64);
});

// jsdom lays nothing out, so the test gives the title and the bar the geometry measured on the Library in
// the built app at 390 × 844 (the title 150px into the page and 58px tall, a 92px bar) and moves scrollTop
// by hand.
const place = (el, props) => { for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { value: v, configurable: true, writable: true }); };

test('a detail page: the bar comes in at 64px, then reads ← and the title once the title is under it', async () => {
  const backs = [];
  function Header({ onBack }) {
    const ref = useBSDetailBar(h(React.Fragment, null, 'Saved', h('br'), 'carts.'), onBack);
    assert.ok(ref, 'inside a BSPage the header gets the title ref');
    return h('div', { ref, 'data-test-title': '' }, 'Saved carts.');
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const render = (withHeader) => act(async () => {
    root.render(h(BSProvider, { paperMode: 'light' }, h(BSPage, null, withHeader ? h(Header, { onBack: () => backs.push('back') }) : h('p', null, 'no header'))));
  });
  await render(true);
  const bar = host.querySelector('[data-bs-pinned-mast]');
  const scroller = host.querySelector('.bs-scroll');
  place(host.querySelector('[data-test-title]'), { offsetTop: 150, offsetHeight: 58, offsetParent: scroller });
  place(bar, { offsetHeight: 92 });
  const scrollTo = (y) => act(async () => { place(scroller, { scrollTop: y }); scroller.dispatchEvent(new window.Event('scroll')); });

  await scrollTo(0);
  assert.equal(bar.getAttribute('aria-hidden'), 'true', 'the bar is out at the top');
  assert.ok(!bar.querySelector('[data-bs-detail-bar]'), 'the bar reads the title at the top of the page');

  await scrollTo(80);
  assert.equal(bar.getAttribute('aria-hidden'), 'false', 'the bar is not in at 80px, so the page would run under the status bar');
  assert.ok(!bar.querySelector('[data-bs-detail-bar]'), 'the title shows in the bar while the page still shows it');
  assert.match(bar.textContent, /Vol\. 1 · No\. 1/);

  await scrollTo(120);
  const row = bar.querySelector('[data-bs-detail-bar]');
  assert.ok(row, 'the bar does not read the title once the title is under it');
  assert.match(row.textContent, /^←Saved carts\./);
  assert.doesNotMatch(bar.textContent, /Vol\. 1/, 'the row keeps the logo and Vol·No beside the title');
  const back = row.querySelector('button');
  assert.equal(back.getAttribute('aria-label'), 'Back');
  // The ← is drawn in the corner's 34px row and reaches 44px with negative margins.
  assert.equal(back.style.width, '44px');
  assert.equal(back.style.height, '44px');
  assert.equal(row.style.minHeight, '34px');
  await act(async () => { back.click(); });
  assert.deepEqual(backs, ['back'], 'the bar\'s ← does not go back');

  // Back up, the page's own header shows again and the bar drops the title.
  await scrollTo(100);
  assert.ok(!bar.querySelector('[data-bs-detail-bar]'), 'the bar keeps the title once the page shows it again');

  // A page with no detail header keeps the plain bar at any depth.
  await render(false);
  await scrollTo(400);
  assert.ok(!bar.querySelector('[data-bs-detail-bar]'), 'the title outlived its header');
  assert.match(bar.textContent, /Vol\. 1 · No\. 1/);
  await act(async () => root.unmount());
});

test('outside a BSPage with a masthead, a detail header gets no bar and stays sticky', async () => {
  let got = 'unset';
  function Header() { got = useBSDetailBar('Saved carts.', () => {}); return null; }
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(h(BSProvider, { paperMode: 'light' }, h(BSPage, { mast: false }, h(Header)))); });
  assert.equal(got, null, 'a page without a masthead hands the header a bar it cannot show');
  await act(async () => { root.render(h(BSProvider, { paperMode: 'light' }, h(Header))); });
  assert.equal(got, null);
  await act(async () => root.unmount());
});
