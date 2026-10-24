// The app's chrome in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on the
// header's ✦, the corner avatar and the tab bar), MOUNTED: the real BSTabBar and BSPage's pinned masthead
// from mobile-app/src/broadsheet/iosAppBroadsheet.jsx, in the real BSProvider, on both papers.
//
// The tab bar floats (owner: "design the nav bar on the shape app to be floating … hovering at the bottom
// of page", "make sure it doesnt block whats behind it too much", then "It should look like instagram"): a
// glass capsule held off the screen's edges inside the footprint the pages and the composer reserve,
// half-strength paper over a light blur, icons only. The selected tab is in full ink, drawn heavier, on a
// lighter capsule; the others are grey. The chat tab's unread count is a red pill. The pinned masthead is
// flat paper over a rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  test(`the tab bar floats: a glass capsule, icons only, the selected tab heavier in ink (${paperMode})`, async () => {
    let theme = null;
    const Probe = () => { theme = window.useBS(); return null; };
    const { host, unmount } = await mount(React.createElement(React.Fragment, null,
      React.createElement(Probe),
      React.createElement(window.BSTabBar, { tabs: TABS, active: 'chat', onChange() {} })), paperMode);
    assert.equal(theme.isLight, isLight);
    const red = bsWsRed(theme);
    // The dock is the footprint every page reserves (BS_TABBAR_H), holds the capsule 12px off the sides
    // and lets taps in its margins through to the page.
    const dock = host.querySelector('[data-bs-tabbar-dock]');
    assert.ok(dock, 'no dock');
    assert.equal(dock.style.height, `${window.BS_TABBAR_H}px`, 'the footprint the pages and the composer position against');
    assert.equal(window.BS_TABBAR_H, 78);
    assert.equal(dock.style.position, 'absolute');
    assert.equal(dock.style.bottom, '0px');
    assert.equal(dock.style.pointerEvents, 'none');
    assert.equal(dock.style.paddingLeft, '12px');
    assert.equal(dock.style.paddingRight, '12px');
    assert.equal(dock.style.paddingTop, '6px');
    assert.equal(dock.style.background || '', '', 'the dock around the capsule is clear');
    const bar = dock.querySelector('[data-bs-tabbar]');
    assert.ok(bar, 'no tab bar');
    assert.equal(bar.tagName, 'NAV');
    assert.equal(bar.style.pointerEvents, 'auto');
    // A capsule of half-strength paper (the page shows through), with a soft neutral shadow.
    assert.equal(bar.style.borderRadius, '999px');
    assert.ok(sameColor(bar.style.background, `${theme.PAPER}80`), 'half-strength paper');
    assert.doesNotMatch(bar.style.background, /gradient/);
    assert.match(bar.style.boxShadow, isLight ? /rgba\(15, ?14, ?12, ?0\.18\)/ : /rgba\(0, ?0, ?0, ?0\.55\)/, 'a neutral shadow, not a glow');
    // The selected tab's capsule sits behind the chat tab (the fourth of five), rounded, with no glow.
    const mark = bar.querySelector('[data-bs-tab-mark]');
    assert.equal(mark.style.borderRadius, '999px');
    assert.equal(mark.style.boxShadow, '');
    // jsdom simplifies the calc: the 6px padding plus 4px inset, then three tab widths across.
    assert.match(mark.getAttribute('style'), /left: calc\(10px \+ 3 \* /, 'the capsule sits behind the chat tab');
    // Icons only: each tab is named for a screen reader, none prints its label. The selected one is ink
    // and drawn heavier; the others are grey and light.
    const btns = [...bar.querySelectorAll('button[data-tour]')];
    assert.equal(btns.length, 5);
    for (const b of btns) {
      const tab = TABS.find((x) => 'tab-' + x.key === b.getAttribute('data-tour'));
      const on = tab.key === 'chat';
      assert.equal(b.getAttribute('aria-label'), tab.label);
      assert.ok(!b.textContent.includes(tab.label), `${tab.label} prints a label`);
      assert.ok(sameColor(b.style.color, on ? theme.INK : `rgba(${theme.inkRGB},0.55)`), `${tab.label} colour`);
      assert.equal(b.querySelector('svg').getAttribute('stroke-width'), on ? '2.3' : '1.7', `${tab.label} weight`);
    }
    assert.equal([...bar.querySelectorAll('span')].filter((x) => x.style.clipPath).length, 0, 'the clipped plate is back');
    // The unread count: a red pill ringed in the paper.
    const badge = [...bar.querySelectorAll('button[data-tour="tab-chat"] span')].find((x) => x.textContent === '3');
    assert.ok(badge, 'no unread count');
    assert.ok(sameColor(badge.style.background, red));
    assert.ok(sameColor(badge.style.color, theme.PAPER));
    assert.equal(badge.style.borderRadius, '999px');
    await unmount();
  });

  test(`the capsule is frosted, so what scrolls under it shows through softened (${paperMode})`, () => {
    // jsdom drops backdrop-filter, so the declaration is read from the component's source.
    const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
    const bar = src.slice(src.indexOf('function BSTabBar('), src.indexOf('// Footer masthead'));
    assert.match(bar, /background: `\$\{t\.PAPER\}80`/);
    assert.match(bar, /backdropFilter: 'blur\(6px\) saturate\(160%\)'/);
    assert.match(bar, /WebkitBackdropFilter: 'blur\(6px\) saturate\(160%\)'/);
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
