// tests/chat-places.test.mjs
//
// Chat's places, the owner's B (2026-10-26: "still dont love the look of this", "give me 3 new ideas",
// "go with B"). The page's title names the place you are in ("Wall ▾") and opens a sheet of every
// place: the three feeds, then the two message places with their unread. The Feed / Team / Channels
// strip and the Wall / Client / Community tabs are gone; the Wall's type chips are the one row left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const React = require_('react');
const ReactDOM = require_('react-dom');
const ReactDOMClient = require_('react-dom/client');
const PLACES = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSChatPlaces.jsx'),
  { registry: new Map([['react', React], ['react-dom', ReactDOM]]) });
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const EN = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/feed.json'), 'utf8'));

const dom = new JSDOM('<!doctype html><html><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
// The en catalog, with its two placeholders filled the way the runtime fills them.
const t = (key, opts = {}) => {
  const v = EN[key.replace(/^feed:/, '')] ?? opts.defaultValue ?? key;
  return String(v).replace(/\{count, number\}/g, String(opts.count)).replace(/\{place\}/g, String(opts.place));
};

async function render(el) {
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.useBS = () => ({ ...THEME, DISPLAY: 'display', MONO: 'mono', isLight: true, INK: '#1d1b17', INK50: '#888', HAIR: '#ddd', RULE: '#ccc', PAPER: '#f5f0e6', padX: 18 });
  dom.window.ShapeI18n = { t };
  // The sheet slides up on the next frame; jsdom has no frames, and the module reads the browser global.
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame = (f) => setTimeout(f, 0);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); Object.assign(globalThis, saved); } };
}

const PLACE_LIST = [
  { key: 'wall', label: 'Wall', sub: EN['places.wallSub'], badge: 0, group: 'feed' },
  { key: 'community', label: 'Community', sub: EN['places.communitySub'], badge: 0, group: 'feed' },
  { key: 'role', label: 'Client', sub: EN['places.clientSub'], badge: 0, group: 'feed' },
  { key: 'team', label: 'Team', sub: EN['places.teamSub'], badge: 0, group: 'messages' },
  { key: 'channels', label: 'Channels', sub: EN['places.channelsSub'], badge: 3, group: 'messages' },
];

test('the title names the place, says it opens a dialog, and opens it', async () => {
  let opened = 0;
  const r = await render(React.createElement(PLACES.BSChatPlaceTitle, { label: 'Wall', open: false, onOpen: () => { opened += 1; } }));
  try {
    const btn = r.host.querySelector('h1 > button');
    assert.ok(btn, 'the title is not a button inside the page\'s h1');
    assert.equal(btn.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    // The title says it switches (owner, 2026-10-31: "make it more noticeable that you click here to
    // change between pages"): a keyed Switch chip with a chevron, not a lone ▾.
    assert.match(btn.textContent, /^WallSwitch$/);
    const chip = btn.querySelector('[data-bs-chat-switch]');
    assert.ok(chip && chip.querySelector('svg'), 'the Switch chip and its chevron');
    assert.match(chip.getAttribute('style'), /border: 1px solid/);
    assert.equal(btn.getAttribute('aria-label'), 'Wall. Choose another place in Chat');
    assert.ok(parseFloat(btn.style.minHeight) >= 44, 'the title is a full touch target');
    await React.act(async () => { btn.click(); });
    assert.equal(opened, 1);
  } finally { await r.done(); }
});

test('the sheet lists the feeds, then Messages with the unread, and marks where you are', async () => {
  const picked = [];
  let closed = 0;
  const r = await render(React.createElement(PLACES.BSChatPlacesSheet, { places: PLACE_LIST, current: 'wall', onPick: (k) => picked.push(k), onClose: () => { closed += 1; } }));
  try {
    const surface = dom.window.document.getElementById('bs-phone-surface');
    const dialog = surface.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the sheet is not portalled into the phone surface');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-label'), 'Go to');
    const rows = [...dialog.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') !== 'Close');
    assert.deepEqual(rows.map((b) => b.textContent.replace(/[→✓]|\d+ new/g, '').trim()),
      PLACE_LIST.map((p) => p.label + p.sub), 'the places, each with its line, in order');
    // Messages heads the two message places.
    const text = dialog.textContent;
    assert.ok(text.indexOf('Messages') > text.indexOf(EN['places.clientSub']) && text.indexOf('Messages') < text.indexOf('Team'), 'Messages does not head Team and Channels');
    assert.match(rows[4].textContent, /3 new$/, 'the unread is not on Channels');
    assert.equal(rows[0].getAttribute('aria-current'), 'page', 'the place you are in is not marked');
    assert.ok(rows.slice(1).every((b) => !b.hasAttribute('aria-current')));
    assert.ok(rows.every((b) => parseFloat(b.style.minHeight) >= 44), 'a row is under the touch target');

    await React.act(async () => { rows[4].click(); });
    assert.deepEqual(picked, ['channels']);
    // Escape, the backdrop and × each close it; a tap on the sheet itself does not.
    await React.act(async () => { dialog.click(); });
    assert.equal(closed, 0, 'a tap inside the sheet closed it');
    await React.act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(closed, 1, 'Escape did not close the sheet');
    await React.act(async () => { surface.querySelector('[data-bs-chat-places]').click(); });
    assert.equal(closed, 2, 'the backdrop did not close the sheet');
    await React.act(async () => { dialog.querySelector('button[aria-label="Close"]').click(); });
    assert.equal(closed, 3, '× did not close the sheet');
  } finally { await r.done(); }
});

// ── The page ─────────────────────────────────────────────────────────────────

const between = (src, a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };
const FEED = between(CLIENT, 'function BSClientFeed(', 'function BSNoraSheet(');

test('the feeds the sheet offers are CHIP_KEYS: the viewer\'s own role channel and no other', () => {
  // The role tabs offered exactly these; the places must not widen who sees a peer channel
  // (tests/chat-feed-tab.test.mjs reads the same definition for the website's scope).
  assert.match(FEED, /const CHIP_KEYS = \['COMMUNITY', myRoleChip, 'SHAPE'\];/);
  assert.match(FEED, /\.\.\.CHIP_KEYS\.slice\(\)\.sort\(/, 'the feed places are not built from CHIP_KEYS');
  assert.match(FEED, /const placeOf = \(k\) => \(k === 'COMMUNITY' \? 'wall' : k === 'SHAPE' \? 'community' : 'role'\);/);
  // Wall, Community, then the role's own feed, as the owner's B drew them.
  assert.match(FEED, /const PLACE_ORDER = \{ wall: 0, community: 1, role: 2 \};/);
});

test('a pick opens the place: a feed sets the chip, Team and Channels their tab, and focus returns', () => {
  const pick = between(FEED, 'const pickPlace = (key) => {', '\n  };');
  assert.match(pick, /if \(feed\) \{ setTab\('feed'\); setFilter\(feed\.chip\); \}/);
  assert.match(pick, /else setTab\(key === 'channels' \? 'channels' : 'teams'\);/);
  assert.match(pick, /closePlaces\(\);/);
  assert.match(between(FEED, 'const closePlaces = () => {', '\n  };'), /placesTitleRef\.current\?\.focus\(/);
  assert.match(FEED, /\{placesOpen && <BSChatPlacesSheet places=\{places\} current=\{place\} onPick=\{pickPlace\} onClose=\{closePlaces\} \/>\}/);
});

test('a message waiting in a place the page is not showing is named in the kicker', () => {
  assert.match(FEED, /const unreadElsewhere = places\.reduce\(\(a, p\) => a \+ \(p\.key === place \? 0 : p\.badge\), 0\);/);
  assert.match(FEED, /\{unreadElsewhere > 0 && <span[^>]*> · \{tr\('feed:places\.unreadElsewhere', \{ defaultValue: '\{count, number\} unread elsewhere', count: unreadElsewhere \}\)\}<\/span>\}/);
  // Team's and Channels' unread are the ones the strip carried.
  assert.match(FEED, /\{ key: 'team', [^\n]*badge: coachUnread \+ friendUnread, group: 'messages' \}/);
  assert.match(FEED, /\{ key: 'channels', [^\n]*badge: chUnread, group: 'messages' \}/);
});

test('the hooks the places add sit above the page\'s early returns', () => {
  // A hook after a conditional return crashes React ("fewer hooks than expected").
  const firstReturn = FEED.indexOf('\n  if (openProfile) {');
  assert.ok(firstReturn > 0, 'the profile early return moved — re-anchor this guard');
  for (const hook of ['const [placesOpen, setPlacesOpen] = useStateBSC(false);', 'const placesTitleRef = React.useRef(null);']) {
    const at = FEED.indexOf(hook);
    assert.ok(at > 0 && at < firstReturn, hook + ' is declared after an early return');
  }
});
