// The app's chrome in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on the
// header's ✦, the corner avatar and the tab bar), MOUNTED: the real BSTabBar and BSPage's pinned masthead
// from mobile-app/src/broadsheet/iosAppBroadsheet.jsx, in the real BSProvider, on both papers.
//
// The tab bar floats (owner: "design the nav bar on the shape app to be floating … hovering at the bottom
// of page", "make sure it doesnt block whats behind it too much", then "It should look like instagram" and a
// screenshot of Instagram's: "Use as reference"): a frosted capsule off the screen's edges, icons only. The
// selected tab's icon is filled, in ink, on a darker capsule; the others are line icons in grey. The Me tab
// is the member's face. The unread count is a red pill. The capsule keeps its height on a phone with a home
// indicator: the gap under it grows instead. The pinned masthead is flat paper over a rule.
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
  test(`the tab bar floats: a frosted capsule, icons only, the selected one filled in ink (${paperMode})`, async () => {
    let theme = null;
    const Probe = () => { theme = window.useBS(); return null; };
    const { host, unmount } = await mount(React.createElement(React.Fragment, null,
      React.createElement(Probe),
      React.createElement(window.BSTabBar, { tabs: TABS, active: 'chat', onChange() {} })), paperMode);
    assert.equal(theme.isLight, isLight);
    const red = bsWsRed(theme);
    // The dock holds the capsule 16px off the sides and 6px below the content, and lets taps in its
    // margins through to the page. (Its height is CSS with env(), which jsdom drops: see the next test.)
    const dock = host.querySelector('[data-bs-tabbar-dock]');
    assert.ok(dock, 'no dock');
    assert.equal(dock.style.position, 'absolute');
    assert.equal(dock.style.bottom, '0px');
    assert.equal(dock.style.pointerEvents, 'none');
    assert.equal(dock.style.paddingLeft, '16px');
    assert.equal(dock.style.paddingRight, '16px');
    assert.equal(dock.style.paddingTop, '6px');
    assert.equal(dock.style.background || '', '', 'the dock around the capsule is clear');
    const bar = dock.querySelector('[data-bs-tabbar]');
    assert.ok(bar, 'no tab bar');
    assert.equal(bar.tagName, 'NAV');
    assert.equal(bar.style.pointerEvents, 'auto');
    // A 60px capsule of paper at about three-quarters (the page shows through), with a soft neutral shadow.
    assert.equal(bar.style.height, '60px');
    assert.equal(bar.style.borderRadius, '999px');
    assert.ok(sameColor(bar.style.background, `${theme.PAPER}c2`), 'paper at about three-quarters');
    assert.doesNotMatch(bar.style.background, /gradient/);
    assert.match(bar.style.boxShadow, isLight ? /rgba\(15, ?14, ?12, ?0\.12\)/ : /rgba\(0, ?0, ?0, ?0\.5\)/, 'a neutral shadow, not a glow');
    // The selected tab's capsule sits behind the chat tab (the fourth of five), rounded, with no glow.
    const mark = bar.querySelector('[data-bs-tab-mark]');
    assert.equal(mark.style.borderRadius, '999px');
    assert.equal(mark.style.boxShadow, '');
    assert.match(mark.getAttribute('style'), /left: calc\(4\.5px \+ 3 \* /, 'the capsule sits behind the chat tab');
    // Icons only: each tab is named for a screen reader and prints no label. The selected one is ink and
    // filled; the others are grey line icons with nothing filled.
    const btns = [...bar.querySelectorAll('button[data-tour]')];
    assert.equal(btns.length, 5);
    for (const b of btns) {
      const tab = TABS.find((x) => 'tab-' + x.key === b.getAttribute('data-tour'));
      const on = tab.key === 'chat';
      assert.equal(b.getAttribute('aria-label'), tab.label);
      assert.ok(!b.textContent.includes(tab.label), `${tab.label} prints a label`);
      assert.ok(sameColor(b.style.color, on ? theme.INK : `rgba(${theme.inkRGB},0.62)`), `${tab.label} colour`);
      const filled = b.querySelectorAll('svg [fill="currentColor"]').length;
      if (on) assert.ok(filled > 0, `${tab.label} is not filled`);
      else assert.equal(filled, 0, `${tab.label} is filled`);
    }
    assert.equal([...bar.querySelectorAll('span')].filter((x) => x.style.clipPath).length, 0, 'the clipped plate is back');
    // With no face to draw (the client module isn't loaded), the Me tab is its icon.
    assert.ok(bar.querySelector('button[data-tour="tab-me"] svg'), 'the Me icon');
    // The unread count: a red pill ringed in the paper.
    const badge = [...bar.querySelectorAll('button[data-tour="tab-chat"] span')].find((x) => x.textContent === '3');
    assert.ok(badge, 'no unread count');
    assert.ok(sameColor(badge.style.background, red));
    assert.ok(sameColor(badge.style.color, theme.PAPER));
    assert.equal(badge.style.borderRadius, '999px');
    await unmount();
  });

  test(`the Me tab is the member's face, as Instagram's is: the flat facet, framed in ink when selected (${paperMode})`, async () => {
    const seen = [];
    window.BSFacetAvatar = (props) => { seen.push(props); return React.createElement('i', { 'data-face': '' }); };
    window.bsMyPhoto = () => 'https://shape.test/me.jpg';
    window.bsMyInitials = () => 'QH';
    window.bsMyName = () => 'Quinn Harper';
    try {
      let theme = null;
      const Probe = () => { theme = window.useBS(); return null; };
      for (const active of ['me', 'home']) {
        seen.length = 0;
        const { host, unmount } = await mount(React.createElement(React.Fragment, null,
          React.createElement(Probe),
          React.createElement(window.BSTabBar, { tabs: TABS, active, onChange() {} })), paperMode);
        const me = host.querySelector('button[data-tour="tab-me"]');
        assert.ok(me.querySelector('[data-bs-tab-face] [data-face]'), 'no face on the Me tab');
        assert.equal(me.querySelector('svg'), null, 'the Me icon is drawn as well');
        assert.equal(me.getAttribute('aria-label'), 'Me');
        const p = seen[seen.length - 1];
        assert.equal(p.flat, true);
        assert.equal(p.photo, 'https://shape.test/me.jpg');
        assert.equal(p.initial, 'QH');
        assert.equal(p.c, active === 'me' ? theme.INK : `rgba(${theme.inkRGB},0.32)`);
        assert.equal(p.onClick, undefined, 'the tab is the button, not the face');
        await unmount();
      }
    } finally {
      delete window.BSFacetAvatar; delete window.bsMyPhoto; delete window.bsMyInitials; delete window.bsMyName;
    }
  });

  test(`the capsule is frosted and keeps its height over a home indicator (${paperMode})`, () => {
    // jsdom drops backdrop-filter and env(), so these are read from the component's source.
    const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
    const bar = src.slice(src.indexOf('function BSTabBar('), src.indexOf('// Footer masthead'));
    assert.match(bar, /background: `\$\{t\.PAPER\}c2`/);
    assert.match(bar, /backdropFilter: 'blur\(10px\) saturate\(170%\)'/);
    assert.match(bar, /WebkitBackdropFilter: 'blur\(10px\) saturate\(170%\)'/);
    assert.match(bar, /height: BS_TABBAR_CSS,/);
    assert.match(bar, /paddingBottom: BS_DOCK_BOTTOM_CSS,/);
    // 60px of capsule, 6px above it, and under it 12px or the home indicator's inset less 10px.
    assert.equal(window.BS_TABBAR_H, 78);
    assert.equal(window.BS_TABBAR_CSS, 'calc(66px + max(12px, calc(env(safe-area-inset-bottom, 0px) - 10px)))');
    // What stands on the tab bar stands on the same height.
    for (const f of ['iosAppBroadsheetClient.jsx', 'iosAppBroadsheetPros.jsx']) {
      const s = readFileSync(join(ROOT, 'mobile-app/src/broadsheet', f), 'utf8');
      assert.doesNotMatch(s, /bottom: \(window\.BS_TABBAR_H \|\| 64\)/, `${f}: a composer slot on the old height`);
      assert.equal((s.match(/bottom: \(window\.BS_TABBAR_CSS \|\| window\.BS_TABBAR_H \|\| 64\)/g) || []).length, 2, f);
    }
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
