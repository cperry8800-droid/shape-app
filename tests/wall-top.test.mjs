// tests/wall-top.test.mjs
//
// The top of the Wall (BSWallTop.jsx), the owner's B (2026-11-04: "go with B for the wall"), drawn by
// real React: the lens, how many are online with Hide (and Show once hidden), each person online on a
// card of their own with a facet for a member and a ringed circle for a coach, the type chips, 44px
// targets, colour as a signal only ("reduce the coloring and simplify UI more"), and no motion for a
// reader who asked for less. The data and the doors stay the client's, so everything comes in as props.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const SRC_PATH = join(ROOT, 'mobile-app/src/broadsheet/BSWallTop.jsx');
const SRC = readFileSync(SRC_PATH, 'utf8');
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const TOP = await loadRealModule(SRC_PATH, { registry: new Map([['react', React]]) });

const DARK = { isLight: false, INK: '#f1ece1', INK50: '#999999', INK70: '#cccccc', PAPER: '#0f0e0c', PAPER_BG: '#0f0e0c', HAIR: '#333333', DISPLAY: 'display', MONO: 'mono', BODY: 'body', padX: 18, AMBER: '#d8a23a' };
const LIGHT = { ...DARK, isLight: true, INK: '#14110e', PAPER: '#f3efe6', PAPER_BG: '#f3efe6' };

async function render(el, theme = DARK) {
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.useBS = () => theme;
  // The catalog's words, with the count formatted as the app's ICU would.
  dom.window.ShapeI18n = { t: (key, opts) => String(opts && opts.defaultValue != null ? opts.defaultValue : key).replace('{count, number}', Number(opts && opts.count || 0).toLocaleString('en-US')) };
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); Object.assign(globalThis, saved); } };
}

const PEOPLE = [
  { name: 'Priya Shah', live: true, activity: 'workout', photo: 'member-03' },
  { name: 'Drew Oyelaran', live: true, photo: 'member-02' },
  { name: 'Maya Okafor', live: true, activity: 'workout', role: 'trainer', photo: 'maya' },
  { name: 'Aisha Bello', live: true, activity: 'cooking', role: 'nutritionist', photo: 'member-08' },
];
const LENSES = [['universal', 'Universal'], ['following', 'Following']];
const TYPES = [['all', 'All'], ['workouts', 'Workouts'], ['runs', 'Runs'], ['prs', 'PRs']];

function props(over = {}) {
  const calls = { mode: [], type: [], face: [], hide: 0, show: 0, faces: [] };
  const p = {
    wall: true, railOn: true, people: PEOPLE, count: 2104,
    // The client's railFace stands in: a facet for a member, a ringed circle for a coach.
    face: (person, o) => { calls.faces.push([person.name, o]); return React.createElement('i', { 'data-shape': person.role ? 'circle' : 'facet' }); },
    photoOf: () => null,
    onFace: (person) => calls.face.push(person.name), onHide: () => { calls.hide++; }, onShow: () => { calls.show++; },
    lenses: LENSES, mode: 'universal', onMode: (k) => calls.mode.push(k),
    types: TYPES, type: 'all', onType: (k) => calls.type.push(k), typesLabel: 'Filter by activity type',
    ...over,
  };
  return { p, calls };
}

const target = (b) => parseFloat(b.style.minHeight) >= 44 || parseFloat(b.style.height) >= 44;

test('B on the Wall: the lens, the count with Hide, a card per person, then the types', async () => {
  const { p, calls } = props();
  const r = await render(React.createElement(TOP.BSWallTop, p));
  try {
    const top = r.host.querySelector('[data-bs-wall-top]');
    assert.ok(top, 'no top of the Wall');
    // Top to bottom.
    const order = ['[data-bs-wall-lens]', '[data-bs-rail-count]', '[data-bs-wall-face]', '[data-bs-wall-types]'].map((s) => top.querySelector(s));
    assert.ok(order.every(Boolean), 'a part is missing');
    for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].compareDocumentPosition(order[i]) & 4, 'out of order');
    // The lens: two tabs, the one shown pressed, each a full target; a tap is the client's switch.
    const lens = [...top.querySelectorAll('[data-bs-wall-lens] button')];
    assert.deepEqual(lens.map((b) => b.textContent), ['Universal', 'Following']);
    assert.deepEqual(lens.map((b) => b.getAttribute('aria-pressed')), ['true', 'false']);
    assert.ok(lens.every(target), 'a lens tab under 44px');
    await React.act(async () => { lens[1].click(); });
    assert.deepEqual(calls.mode, ['following']);
    // How many are online, live, with Hide at the row's end.
    assert.equal(top.querySelector('[data-bs-rail-count]').textContent, '2,104 online now');
    assert.ok(top.querySelector('[data-bs-wall-dot="live"]'), 'the count has no live dot');
    const hide = top.querySelector('button[aria-label="Hide the online members rail"]');
    assert.ok(hide && target(hide) && parseFloat(hide.style.minWidth) >= 44, 'Hide is not a full target');
    await React.act(async () => { hide.click(); });
    assert.equal(calls.hide, 1);
    // A card per person: their face (the client's), first name and what they are doing; a tap opens them.
    const cards = [...top.querySelectorAll('[data-bs-wall-face]')];
    assert.deepEqual(cards.map((c) => c.getAttribute('data-bs-wall-face')), ['member', 'member', 'coach', 'coach']);
    assert.deepEqual(cards.map((c) => c.querySelector('i').getAttribute('data-shape')), ['facet', 'facet', 'circle', 'circle']);
    assert.deepEqual(calls.faces.map(([, o]) => o), PEOPLE.map(() => ({ size: 42, box: 36 })), 'the faces are asked for at one size');
    // Small cards (owner, 2026-11-04: "reduce the size of these individual boxes"), still full targets.
    assert.ok(cards.every((c) => parseFloat(c.style.width) <= 72), 'a card grew');
    assert.deepEqual(cards.map((c) => c.querySelector('[data-bs-wall-status]').textContent), ['Training', 'Online', 'Training', 'Cooking']);
    assert.ok(cards.map((c) => c.textContent).every((x, i) => x.startsWith(PEOPLE[i].name.split(' ')[0])), 'a card without its first name');
    assert.ok(cards.every(target), 'a card under 44px');
    await React.act(async () => { cards[1].click(); cards[2].click(); });
    assert.deepEqual(calls.face, ['Drew Oyelaran', 'Maya Okafor']);
    // The ring marks who is mid-activity, in their face's own shape; nobody else has one.
    assert.deepEqual(cards.map((c) => (c.querySelector('[data-bs-wall-ring]') || { getAttribute: () => null }).getAttribute('data-bs-wall-ring')), ['facet', null, 'circle', 'circle']);
    // The types: the one shown pressed and lit, each a full target; a tap is the client's filter.
    const types = [...top.querySelectorAll('nav[data-bs-wall-types] button')];
    assert.equal(top.querySelector('nav[data-bs-wall-types]').getAttribute('aria-label'), 'Filter by activity type');
    assert.deepEqual(types.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);
    assert.deepEqual(types.map((b) => b.firstElementChild.getAttribute('data-lit')), ['on', 'off', 'off', 'off']);
    assert.ok(types.every(target), 'a type under 44px');
    await React.act(async () => { types[2].click(); });
    assert.deepEqual(calls.type, ['runs']);
  } finally { await r.done(); }
});

test('B: colour is a signal only, the cards and the track the paper\'s own, on both papers', async () => {
  for (const theme of [DARK, LIGHT]) {
    const { p } = props();
    const r = await render(React.createElement(TOP.BSWallTop, p), theme);
    try {
      const top = r.host.querySelector('[data-bs-wall-top]');
      const card = top.querySelector('[data-bs-wall-face]');
      assert.equal(card.style.background, theme === DARK ? 'rgb(15, 14, 12)' : 'rgb(243, 239, 230)', 'a card is not the paper\'s colour');
      const lit = top.querySelector('[data-lit="on"]');
      assert.equal(lit.style.background, theme === DARK ? 'rgb(52, 214, 197)' : 'rgb(10, 122, 114)', 'the type shown is not a flat teal');
      assert.equal(lit.style.boxShadow, '', 'the type shown glows');
      assert.equal(top.querySelector('[data-lit="off"]').style.background, 'transparent', 'a type not shown is tinted');
    } finally { await r.done(); }
  }
  // No gradient panel or tinted glow anywhere in the module, and the flat lit pill reads (10:1 and 5.3:1).
  assert.doesNotMatch(SRC, /gradient\(/, 'a gradient is back');
  // B is the only look: no preview switch is left.
  assert.doesNotMatch(SRC, /designPreview/, 'a preview switch is left in');
  assert.deepEqual(TOP.bsWallLit({ isLight: false }), { background: '#34d6c5', color: '#06110e' });
  assert.deepEqual(TOP.bsWallLit({ isLight: true }), { background: '#0a7a72', color: '#ffffff' });
});

test('B: hidden, the count stands with Show; with nobody online, no rail at all; off the Wall, no lens or types', async () => {
  let { p, calls } = props({ railOn: false });
  let r = await render(React.createElement(TOP.BSWallTop, p));
  try {
    assert.equal(r.host.querySelectorAll('[data-bs-wall-face]').length, 0, 'the cards show while hidden');
    assert.equal(r.host.querySelector('[data-bs-rail-count]').textContent, '2,104 online now');
    assert.ok(r.host.querySelector('[data-bs-wall-dot="still"]'), 'a hidden rail still pulses');
    const show = r.host.querySelector('button[aria-label="Show the online members rail"]');
    assert.ok(show && target(show), 'Show is not a full target');
    await React.act(async () => { show.click(); });
    assert.equal(calls.show, 1);
    assert.ok(r.host.querySelector('[data-bs-wall-lens]') && r.host.querySelector('[data-bs-wall-types]'), 'the Wall lost its lens or types');
  } finally { await r.done(); }
  // A signed-in member with nobody active: no rail and no Show (never fabricated people), the Wall's controls stay.
  for (const railOn of [true, false]) {
    ({ p } = props({ people: [], railOn }));
    r = await render(React.createElement(TOP.BSWallTop, p));
    try {
      assert.ok(!r.host.querySelector('[data-bs-rail-count]'), 'a count with nobody online');
      assert.ok(!r.host.querySelector('button[aria-label^="Show"]'), 'Show with nobody to show');
      assert.ok(r.host.querySelector('[data-bs-wall-lens]') && r.host.querySelector('[data-bs-wall-types]'));
    } finally { await r.done(); }
  }
  // Chat's other places: the people online only.
  ({ p } = props({ wall: false }));
  r = await render(React.createElement(TOP.BSWallTop, p));
  try {
    assert.ok(!r.host.querySelector('[data-bs-wall-lens]'), 'the lens off the Wall');
    assert.ok(!r.host.querySelector('[data-bs-wall-types]'), 'the types off the Wall');
    assert.equal(r.host.querySelectorAll('[data-bs-wall-face]').length, 4);
  } finally { await r.done(); }
});

test('nothing moves for a reader who asked for less motion', async () => {
  const { p } = props();
  const r = await render(React.createElement(TOP.BSWallTop, p));
  try {
    const css = [...r.host.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(reduced.length > 40, 'no reduced-motion rule');
    assert.match(reduced, /\[data-bs-wall-top\] \*, \[data-bs-wall-top\] \*::before, \[data-bs-wall-top\] \*::after \{ animation: none !important; transition: none !important; \}/);
    assert.match(reduced, /\[data-bs-wall-face\]:active[^{]*\{ transform: none !important; \}/, 'a card still lifts');
    // Every animation's resting style is its finished state: the cards' entrance fills from a "from" frame only.
    assert.match(css, /@keyframes bswt-in \{ from \{/);
  } finally { await r.done(); }
});

test('the client hands the top of the Wall its data and its doors, and draws the faces', () => {
  const at = CLIENT.indexOf('<BSWallTop ');
  assert.ok(at > 0, 'the Wall has no top');
  const call = CLIENT.slice(at, CLIENT.indexOf('/>', at));
  for (const prop of ['wall={onWall}', 'railOn={railOn}', 'people={railPeople}', 'count={liftingNow}', 'face={railFace}', 'onFace={openRailPerson}', 'onHide={hideRail}', 'onShow={showRail}', 'lenses={wallLenses}', 'mode={feedMode}', 'onMode={switchFeedMode}', 'types={wallTypes}', 'type={feedType}', 'onType={setFeedType}']) {
    assert.ok(call.includes(prop), prop);
  }
  // A face opens what it always did: the live boost sheet mid-activity, the profile otherwise.
  assert.match(CLIENT, /const openRailPerson = \(p\) => \(p\.activity \? setBoostFor\(\{ \.\.\.p, photoUrl: railPhotoOf\(p\), _profile: railProfileOf\(p\) \}\) : setOpenProfile\(railProfileOf\(p\)\)\);/);
  // The count is live when signed in, as it was.
  assert.match(CLIENT, /const liftingNow = online > 0 \? online : \(loggedIn \? railPeople\.length : 2104\);/);
  // The lens's two words and the six types are the catalog's.
  assert.match(CLIENT, /const wallLenses = \[\['universal', tr\('feed:lens\.universal'[^\]]*\], \['following', tr\('feed:lens\.following'/);
  assert.match(CLIENT, /const onWall = tab === 'feed' && filter === 'COMMUNITY';/);
});
