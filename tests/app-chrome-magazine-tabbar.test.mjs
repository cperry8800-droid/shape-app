// The app's chrome in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on the
// header's ✦, the corner avatar and the tab bar), MOUNTED: the real BSTabBar and BSPage's pinned masthead
// from mobile-app/src/broadsheet/iosAppBroadsheet.jsx, in the real BSProvider, on both papers.
//
// The tab bar floats ("the floating nav bar"): a square sheet of the page's paper ruled in ink, held off the
// screen's edges inside the 64px footprint the pages and the composer reserve, under a soft neutral shadow,
// with no fade, blur, glow or clipped plate. The active tab is ink, marked by the magazine's red on the
// sheet's top rule (as the chat page's section strip marks its word), and the chat tab's unread count is a
// square of that red. The pinned masthead is flat paper over a rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const { bsWsRed } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/broadsheet/bsMagazine.mjs')).href);

// Three unread messages on the chat tab.
window.ShapeUnread = { total: () => 3, start() {}, seedDemo() {}, onChange: () => () => {} };

async function mount(el, paperMode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(React.createElement(window.BSProvider, { paperMode }, el)); });
  return { host, unmount: () => act(async () => root.unmount()) };
}
const TABS = [
  { key: 'home', label: 'Home' }, { key: 'train', label: 'Train' }, { key: 'eat', label: 'Eat' },
  { key: 'chat', label: 'Chat' }, { key: 'me', label: 'Me' },
];
// jsdom keeps a colour as written when it can't parse it, so compare through one serializer.
const sameColor = (a, b) => {
  const probe = document.createElement('i');
  probe.style.color = a; const x = probe.style.color;
  probe.style.color = b; return x === probe.style.color;
};

for (const [paperMode, isLight] of [['light', true], ['dark', false]]) {
  test(`the tab bar floats: an ink-ruled sheet of paper, the active tab ink under the magazine's red (${paperMode})`, async () => {
    let theme = null;
    const Probe = () => { theme = window.useBS(); return null; };
    const { host, unmount } = await mount(React.createElement(React.Fragment, null,
      React.createElement(Probe),
      React.createElement(window.BSTabBar, { tabs: TABS, active: 'chat', onChange() {} })), paperMode);
    assert.equal(theme.isLight, isLight);
    const red = bsWsRed(theme);
    // The dock keeps the 64px footprint every page reserves, holds the sheet off the edges, and lets taps
    // in its margins through to the page.
    const dock = host.querySelector('[data-bs-tabbar-dock]');
    assert.ok(dock, 'no dock');
    assert.equal(dock.style.height, '64px', 'the footprint the pages and the composer position against');
    assert.equal(dock.style.position, 'absolute');
    assert.equal(dock.style.bottom, '0px');
    assert.equal(dock.style.pointerEvents, 'none');
    assert.equal(dock.style.paddingLeft, '12px');
    assert.equal(dock.style.paddingRight, '12px');
    assert.equal(dock.style.background || '', '', 'the dock around the sheet is clear');
    const bar = dock.querySelector('[data-bs-tabbar]');
    assert.ok(bar, 'no tab bar');
    assert.equal(bar.style.pointerEvents, 'auto');
    // A square sheet ruled in ink on every side, with a soft neutral shadow and no blur, fade or tint.
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      assert.equal(bar.style[`border${side}Width`], '1px');
      assert.ok(sameColor(bar.style[`border${side}Color`], theme.INK), `the ${side.toLowerCase()} rule is ink`);
    }
    assert.equal(bar.style.borderRadius || '', '', 'a rounded pill');
    assert.match(bar.style.boxShadow, isLight ? /rgba\(15, ?14, ?12, ?0\.16\)/ : /rgba\(0, ?0, ?0, ?0\.5\)/, 'a neutral shadow, not a glow');
    assert.equal(bar.style.backdropFilter || '', '', 'the blur is back');
    assert.doesNotMatch(bar.style.background, /gradient/, 'the fade is back');
    // The red mark sits over the active tab (the fourth of five) on the sheet's top rule, with no glow.
    const mark = bar.querySelector('[data-bs-tab-mark]');
    assert.ok(sameColor(mark.style.background, red));
    assert.equal(mark.style.top, '-1px', 'on the top rule');
    assert.equal(mark.style.boxShadow, '');
    assert.equal(mark.style.borderRadius, '');
    assert.match(mark.getAttribute('style'), /\(3 \+ 0\.28\)/, 'the mark sits over the chat tab');
    // The tabs: the active one ink, the others grey, and no clipped plate or spine behind the active one.
    const btns = [...bar.querySelectorAll('button[data-tour]')];
    assert.equal(btns.length, 5);
    for (const b of btns) {
      const on = b.getAttribute('data-tour') === 'tab-chat';
      assert.ok(sameColor(b.style.color, on ? theme.INK : theme.INK50), `${b.getAttribute('data-tour')} colour`);
    }
    assert.equal([...bar.querySelectorAll('span')].filter((s) => s.style.clipPath).length, 0, 'the clipped plate is back');
    assert.equal(bar.querySelector('button[data-tour="tab-chat"]').textContent.includes('Chat'), true, 'the active tab is named');
    // The unread count: a square of the red, in paper.
    const badge = [...bar.querySelectorAll('button[data-tour="tab-chat"] span')].find((s) => s.textContent === '3');
    assert.ok(badge, 'no unread count');
    assert.ok(sameColor(badge.style.background, red));
    assert.ok(sameColor(badge.style.color, theme.PAPER));
    assert.equal(badge.style.borderRadius, '0px');
    await unmount();
  });

  test(`the pinned masthead is the same paper, flipped: a rule under it and no fade, blur or shadow (${paperMode})`, async () => {
    let theme = null;
    const Probe = () => { theme = window.useBS(); return null; };
    const { host, unmount } = await mount(React.createElement(window.BSPage, null, React.createElement(Probe)), paperMode);
    const pinned = host.querySelector('[data-bs-pinned-mast]');
    assert.ok(pinned, 'no pinned masthead');
    assert.equal(pinned.style.boxShadow, '');
    assert.equal(pinned.style.backdropFilter || '', '');
    assert.doesNotMatch(pinned.style.background, /gradient/);
    assert.ok(sameColor(pinned.style.borderBottomColor, theme.RULE));
    await unmount();
  });
}
