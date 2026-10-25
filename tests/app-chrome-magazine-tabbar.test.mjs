// The app's chrome in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on the
// header's ✦, the corner avatar and the tab bar), MOUNTED: the real BSTabBar and BSPage's pinned masthead
// from mobile-app/src/broadsheet/iosAppBroadsheet.jsx, in the real BSProvider, on both papers.
//
// The tab bar floats (owner: "design the nav bar on the shape app to be floating … hovering at the bottom
// of page", "make sure it doesnt block whats behind it too much", then "It should look like instagram" and a
// screenshot of Instagram's: "Use as reference", then "make our nav unique to shape, but same floating look"
// and "Go with B"): a frosted capsule off the screen's edges, icons only. The selected tab sits in an ink gem,
// its icon filled in the paper; the others are line icons in grey. The Me tab is the member's face. The unread count is a red pill. The capsule keeps its height on a phone with a home
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
// The component builds its events with the bare global, which must be the DOM's own to dispatch on its window.
globalThis.CustomEvent = dom.window.CustomEvent;
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
  test(`the tab bar floats: a frosted capsule, icons only, the selected one on an ink gem (${paperMode})`, async () => {
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
    // A 50px capsule (owner, 2026-10-25: "make the nav bar a little smaller, not as thick"; it was 60) of
    // paper at about 60% (the page shows through; owner, 2026-10-24: "make nav bar a little transparent"),
    // with a soft neutral shadow.
    assert.equal(bar.style.height, '50px');
    assert.equal(bar.style.borderRadius, '999px');
    assert.ok(sameColor(bar.style.background, `${theme.PAPER}99`), 'paper at about 60%');
    assert.doesNotMatch(bar.style.background, /gradient/);
    assert.match(bar.style.boxShadow, isLight ? /rgba\(15, ?14, ?12, ?0\.12\)/ : /rgba\(0, ?0, ?0, ?0\.5\)/, 'a neutral shadow, not a glow');
    // The selected tab's gem: an ink square turned 45° with the facet's rounded corners, centred on the
    // chat tab (the fourth of five, so three and a half slots in), with no glow.
    const mark = bar.querySelector('[data-bs-tab-mark]');
    assert.equal(mark.style.width, '30px');
    assert.equal(mark.style.height, '30px');
    assert.equal(mark.style.borderRadius, '27%');
    assert.equal(mark.style.transform, 'rotate(45deg)');
    assert.ok(sameColor(mark.style.background, theme.INK), 'the gem is ink');
    assert.equal(mark.style.boxShadow, '');
    // (jsdom folds the 9px of padding and the gem's half-width into one term: 9px - 15px.)
    assert.match(mark.getAttribute('style'), /left: calc\(-6px \+ 3\.5 \* /, 'the gem sits on the chat tab');
    // Icons only: each tab is named for a screen reader and prints no label; the chat tab's name carries
    // its unread count, and only the selected tab is the current page. The selected one is filled in the
    // paper on its gem; the others are grey line icons with nothing filled.
    const btns = [...bar.querySelectorAll('button[data-tour]')];
    assert.equal(btns.length, 5);
    for (const b of btns) {
      const tab = TABS.find((x) => 'tab-' + x.key === b.getAttribute('data-tour'));
      const on = tab.key === 'chat';
      assert.equal(b.getAttribute('aria-label'), tab.key === 'chat' ? 'Chat 3' : tab.label);
      assert.equal(b.getAttribute('aria-current'), on ? 'page' : null, `${tab.label} aria-current`);
      assert.ok(!b.textContent.includes(tab.label), `${tab.label} prints a label`);
      assert.ok(sameColor(b.style.color, on ? theme.PAPER : `rgba(${theme.inkRGB},0.62)`), `${tab.label} colour`);
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

  test(`the Me tab is the member's face, as Instagram's is: the flat facet, on the gem when selected (${paperMode})`, async () => {
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
        assert.ok(!me.querySelector('svg'), 'the Me icon is drawn as well');
        assert.equal(me.getAttribute('aria-label'), 'Me');
        const p = seen[seen.length - 1];
        assert.equal(p.flat, true);
        assert.equal(p.photo, 'https://shape.test/me.jpg');
        assert.equal(p.initial, 'QH');
        // On the gem it is framed in the paper and a little smaller, so it sits inside the gem.
        assert.equal(p.c, active === 'me' ? theme.PAPER : `rgba(${theme.inkRGB},0.32)`);
        assert.equal(p.size, active === 'me' ? 20 : 24);
        assert.equal(p.onClick, undefined, 'the tab is the button, not the face');
        await unmount();
      }
    } finally {
      delete window.BSFacetAvatar; delete window.bsMyPhoto; delete window.bsMyInitials; delete window.bsMyName;
    }
  });

  test(`a screen that is no tab selects none: no gem behind Home on Radio (${paperMode})`, async () => {
    // Owner, 2026-10-24: "when on shape radio page the home emoji blacks out on nav bar". Radio is the
    // client's tab 'radio', which the bar doesn't carry; the gem fell back to the first slot and sat,
    // in ink, behind Home's grey line icon.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = ReactDOMClient.createRoot(host);
    const draw = (active) => act(async () => { root.render(React.createElement(window.BSProvider, { paperMode }, React.createElement(window.BSTabBar, { tabs: TABS, active, onChange() {} }))); });
    try {
      await draw('chat');
      await draw('radio');
      const mark = host.querySelector('[data-bs-tab-mark]');
      assert.equal(mark.style.opacity, '0', 'the gem shows with no tab selected');
      assert.match(mark.getAttribute('style'), /left: calc\(-6px \+ 3\.5 \* /, 'the gem jumped to Home as it faded');
      assert.equal(host.querySelectorAll('button[aria-current="page"]').length, 0);
      assert.equal(host.querySelectorAll('svg [fill="currentColor"]').length, 0, 'an icon is filled with no tab selected');
      await draw('home');
      assert.equal(mark.style.opacity, '1');
      assert.match(mark.getAttribute('style'), /left: calc\(-6px \+ 0\.5 \* /, 'the gem is not on Home');
      assert.equal(host.querySelector('button[data-tour="tab-home"]').getAttribute('aria-current'), 'page');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  test(`the capsule is frosted and keeps its height over a home indicator (${paperMode})`, () => {
    // jsdom drops backdrop-filter and env(), so these are read from the component's source.
    const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
    const bar = src.slice(src.indexOf('function BSTabBar('), src.indexOf('// Footer masthead'));
    assert.match(bar, /background: `\$\{t\.PAPER\}99`/);
    assert.match(bar, /backdropFilter: 'blur\(10px\) saturate\(170%\)'/);
    assert.match(bar, /WebkitBackdropFilter: 'blur\(10px\) saturate\(170%\)'/);
    assert.match(bar, /height: BS_TABBAR_CSS,/);
    assert.match(bar, /paddingBottom: BS_DOCK_BOTTOM_CSS,/);
    // A filled icon's inner marks (the coach's Today and Plans) are cut in the gem's ink when selected.
    assert.match(bar, /filled=\{on\} cut=\{on \? t\.INK : t\.PAPER\}/);
    // 50px of capsule, 6px above it, and under it 12px or the home indicator's inset less 10px.
    assert.equal(window.BS_TABBAR_H, 68);
    assert.equal(window.BS_TABBAR_CSS, 'calc(56px + max(12px, calc(env(safe-area-inset-bottom, 0px) - 10px)))');
    // What stands on the tab bar stands on the same height.
    for (const f of ['iosAppBroadsheetClient.jsx', 'iosAppBroadsheetPros.jsx']) {
      const s = readFileSync(join(ROOT, 'mobile-app/src/broadsheet', f), 'utf8');
      assert.doesNotMatch(s, /bottom: \(window\.BS_TABBAR_H \|\| 64\)/, `${f}: a composer slot on the old height`);
      assert.equal((s.match(/bottom: \(window\.BS_TABBAR_CSS \|\| window\.BS_TABBAR_H \|\| 64\)/g) || []).length, 2, f);
    }
  });

  test(`Radio's lights stand on the tab bar's height as this phone draws it (${paperMode})`, async () => {
    // jsdom lays nothing out, so the probe's measurement is stubbed: 90px is the dock over a 34px inset.
    const realRect = window.Element.prototype.getBoundingClientRect;
    let measured = 0;
    const seen = [];
    const Probe = () => { seen.push(window.useBSTabbarH()); return null; };
    try {
      window.Element.prototype.getBoundingClientRect = function () { return { height: measured, width: 0, top: 0, left: 0, right: 0, bottom: 0 }; };
      measured = 0;
      const a = await mount(React.createElement(Probe), paperMode);
      assert.equal(seen[seen.length - 1], 68, 'nothing measured: the height without an inset');
      await a.unmount();
      measured = 90;
      const b = await mount(React.createElement(Probe), paperMode);
      assert.equal(seen[seen.length - 1], 90, 'the measured height');
      await b.unmount();
      assert.equal(document.body.querySelectorAll('div[style*="visibility: hidden"]').length, 0, 'the probe is left behind');
    } finally {
      window.Element.prototype.getBoundingClientRect = realRect;
    }
  });

  test(`the corner's settings gear: a bare ⚙ in the ink on the corner's square that opens Settings (${paperMode})`, async () => {
    // Owner: "make the settings avatar something different in top right". Every page's corner ends in this.
    let theme = null;
    const Probe = () => { theme = window.useBS(); return null; };
    const opened = [];
    const onOpen = () => opened.push('event');
    window.addEventListener('shape:openProfile', onOpen);
    try {
      const { host, unmount } = await mount(React.createElement(React.Fragment, null,
        React.createElement(Probe),
        React.createElement(window.BSSettingsCorner, { size: 34 })), paperMode);
      const gear = host.querySelector('button[data-bs-settings-corner]');
      assert.ok(gear, 'no gear');
      assert.equal(gear.getAttribute('aria-label'), 'Settings');
      assert.equal(gear.style.width, '34px');
      assert.equal(gear.style.height, '34px');
      assert.equal(gear.style.borderRadius, '0px');
      assert.equal(gear.style.background, 'transparent');
      assert.ok(sameColor(gear.style.color, theme.INK), 'the gear is in the ink');
      const svg = gear.querySelector('svg');
      assert.equal(svg.getAttribute('width'), '17');
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.ok(!gear.querySelector('img'), 'a face in the corner');
      // With no handler of its own it opens Settings by the shared event, as the face did.
      await act(async () => { gear.click(); });
      assert.deepEqual(opened, ['event']);
      await unmount();
      // A surface's own ink, and its own handler (a sheet that must close first), win.
      const calls = [];
      const own = await mount(React.createElement(window.BSSettingsCorner, { size: 34, ink: '#f2ede4', onClick: () => calls.push('own') }), paperMode);
      const g2 = own.host.querySelector('button[data-bs-settings-corner]');
      assert.ok(sameColor(g2.style.color, '#f2ede4'));
      await act(async () => { g2.click(); });
      assert.deepEqual(calls, ['own']);
      assert.deepEqual(opened, ['event'], 'the shared event fired as well as the surface\'s own handler');
      await own.unmount();
    } finally {
      window.removeEventListener('shape:openProfile', onOpen);
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

// Owner, 2026-10-24: "make sure the emojis are centered in the black shape". Each filled icon is nudged so
// its painted weight (the centroid of its pixels, measured in the gem on the built app) sits on the gem's
// centre; an unselected line icon is never moved.
test('the selected icon is optically centred in the gem, and only the selected one moves', async () => {
  // Measured on a 24px icon, so the nudge scales with the bar's 21px icon.
  const AT24 = { home: [0, -1.25], train: [0.5, 0], eat: [1, 0.5], chat: [-0.5, 1.75], today: [0, -1], clients: [1.75, -1.25] };
  const NUDGE = Object.fromEntries(Object.entries(AT24).map(([k, [x, y]]) => [k, `${(x * 21) / 24}px, ${(y * 21) / 24}px`]));
  const COACH = [
    { key: 'today', label: 'Today' }, { key: 'clients', label: 'Clients' }, { key: 'programs', label: 'Programs' },
    { key: 'chat', label: 'Chat' }, { key: 'me', label: 'Me' },
  ];
  for (const tabs of [TABS, COACH]) {
    for (const tab of tabs) {
      if (tab.key === 'me') continue;   // the member's face, not an icon
      const { host, unmount } = await mount(React.createElement(window.BSTabBar, { tabs, active: tab.key, onChange() {} }), 'light');
      const btns = [...host.querySelectorAll('[data-bs-tabbar] button')];
      for (const [i, b] of btns.entries()) {
        const svg = b.querySelector('svg');
        if (!svg || tabs[i].key === 'me') continue;
        const want = tabs[i].key === tab.key && NUDGE[tab.key] ? `translate(${NUDGE[tab.key]})` : '';
        assert.equal(svg.style.transform || '', want, `${tabs[i].key} with ${tab.key} selected`);
      }
      await unmount();
    }
  }
});
