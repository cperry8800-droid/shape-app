// tests/mobile-website-fit.test.mjs
//
// Two phone-only faults on the website, found in a phone sweep of every public page
// (2026-11-11, after the owner asked to "check mobile website to make sure everything is
// up to date there"):
//
// 1. mobile-redirect.js's "Shape is better in the app" banner sits in the page's flow and
//    scrolls away, but it held the fixed header 48px down for the whole page, so content
//    scrolling under the header showed through a 48px strip above it, on all 13 pages
//    that load the banner. The offset now follows what is left of the banner on screen.
// 2. The Store's filter bar ("1fr auto") and balance strip ("1.1fr 1fr 1fr 1fr") are grids
//    the shared phone stylesheet does not collapse: the sort ran ~135px off a 390px
//    screen, the categories sat in a ~90px column under a pinned ~400px bar, and two of
//    the four balance figures were cut off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BANNER = readFileSync('public/newdesign/mobile-redirect.js', 'utf8');
const STORE_JSX = readFileSync('public/newdesign/store.jsx', 'utf8');
const STORE_HTML = readFileSync('public/newdesign/Store.html', 'utf8');

/** Run mobile-redirect.js on a phone-width page under a stub DOM. */
function runBanner(pathname = '/newdesign/Store.html') {
  const listeners = {};
  const rootStyle = new Map();
  const head = [];
  const body = [];
  let frame = null;
  const el = (tag) => {
    const node = {
      tag, style: {}, children: [], parentNode: null, textContent: '', attrs: {}, handlers: {},
      appendChild(c) { c.parentNode = node; node.children.push(c); return c; },
      removeChild(c) { c.parentNode = null; node.children = node.children.filter((x) => x !== c); },
      setAttribute(k, v) { node.attrs[k] = v; },
      addEventListener(type, fn) { node.handlers[type] = fn; },
    };
    return node;
  };
  const headEl = el('head');
  headEl.appendChild = (c) => { c.parentNode = headEl; head.push(c); return c; };
  headEl.removeChild = (c) => { c.parentNode = null; head.splice(head.indexOf(c), 1); };
  const bodyEl = el('body');
  bodyEl.appendChild = (c) => { c.parentNode = bodyEl; body.push(c); return c; };
  bodyEl.removeChild = (c) => { c.parentNode = null; body.splice(body.indexOf(c), 1); };
  const session = new Map();
  const window = {
    location: { search: '', pathname, replace() { throw new Error('the banner page redirected'); } },
    matchMedia: () => ({ matches: true }),
    pageYOffset: 0,
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type, fn) { if (listeners[type] === fn) delete listeners[type]; },
    requestAnimationFrame(fn) { frame = fn; },
  };
  const document = {
    createElement: el,
    head: headEl,
    body: bodyEl,
    documentElement: {
      scrollTop: 0,
      style: {
        setProperty(k, v) { rootStyle.set(k, v); },
        removeProperty(k) { rootStyle.delete(k); },
      },
    },
  };
  const sessionStorage = { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)) };
  new Function('window', 'document', 'sessionStorage', 'URLSearchParams', BANNER)(window, document, sessionStorage, URLSearchParams);
  const scrollTo = (y) => {
    window.pageYOffset = y;
    assert.ok(listeners.scroll, 'the banner no longer listens for the scroll');
    listeners.scroll();
    if (frame) { const f = frame; frame = null; f(); }
    return rootStyle.get('--shape-banner-off');
  };
  return { head, body, rootStyle, listeners, scrollTo };
}

test("the header's banner offset follows the banner off the screen", () => {
  const { head, body, rootStyle, scrollTo } = runBanner();
  assert.equal(body.length, 1, 'the banner did not render on a phone-width Store page');
  const css = head.map((s) => s.textContent).join('\n');
  assert.match(css, /header\.shape-header\{ top: var\(--shape-banner-off, 48px\) !important; \}/,
    'the header offset is a flat number again, so it outlives the banner');
  assert.doesNotMatch(css, /top: 48px !important/, 'the flat 48px offset is back');
  assert.equal(rootStyle.get('--shape-banner-off'), '48px', 'at the top of the page the header does not clear the banner');
  assert.equal(scrollTo(20), '28px');
  assert.equal(scrollTo(48), '0px');
  assert.equal(scrollTo(900), '0px', 'scrolled past the banner, the header is not back at the top');
  assert.equal(scrollTo(-30), '48px', 'an iOS overscroll pushes the header below the banner');
});

test('dismissing the banner drops its offset and its scroll listener', () => {
  const { body, rootStyle, listeners, head } = runBanner();
  const close = body[0].children.find((c) => c.tag === 'button');
  assert.ok(close && close.handlers.click, 'the banner lost its dismiss button');
  close.handlers.click();
  assert.equal(body.length, 0, 'the banner is still on the page');
  assert.equal(head.length, 0, 'the header offset style is still on the page');
  assert.equal(rootStyle.has('--shape-banner-off'), false, 'the offset variable outlived the banner');
  assert.equal(listeners.scroll, undefined, 'the scroll listener outlived the banner');
});

test("the Store's filter bar and balance strip carry the classes Store.html's phone rules target", () => {
  assert.match(STORE_JSX, /<section className="store-filters" style=\{\{[^}]*position: "sticky"/, 'the filter bar lost .store-filters');
  assert.match(STORE_JSX, /<div className="store-filters-grid" style=\{\{[^}]*gridTemplateColumns: "1fr auto"/, 'the filter grid lost .store-filters-grid');
  assert.match(STORE_JSX, /<div className="store-filters-search" style=/, 'the search row lost .store-filters-search');
  assert.match(STORE_JSX, /<div className="store-stats" style=\{\{[^}]*gridTemplateColumns: "1\.1fr 1fr 1fr 1fr"/, 'the balance strip lost .store-stats');
});

test("Store.html stacks both on a phone, at the shared stylesheet's 900px", () => {
  const block = /@media \(max-width: 900px\) \{([\s\S]*?)\n  \}/.exec(STORE_HTML);
  assert.ok(block, "Store.html has no 900px phone block");
  const css = block[1];
  assert.match(css, /\.store-filters \{ position: static !important;/, 'the filter bar is pinned on a phone again');
  assert.match(css, /\.store-filters-grid \{ grid-template-columns: minmax\(0, 1fr\) !important;/, 'the filter bar is two columns on a phone again');
  assert.match(css, /\.store-filters-search input \{ min-width: 0 !important;/, 'the search keeps its 220px desktop floor on a phone');
  assert.match(css, /\.store-stats \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/, 'the balance strip is four columns on a phone again');
});
