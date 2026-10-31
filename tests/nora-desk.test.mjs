// tests/nora-desk.test.mjs
//
// Nora's sheet as the concierge desk (owner, 2026-10-31: "we need to update this design, dont use a
// previously used one"). The sheet is rendered with the shared mount shim where the look is a matter of
// what is drawn (the thread, the tiles, the chip's place); the band's colours and the "neither earlier
// look" guards are read from the shipping source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const CLIENT = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8'));
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `marker moved: ${a}`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `marker moved: ${b}`); return src.slice(i, j); };
const SHEET = between(CLIENT, 'function BSNoraSheet(', '\nfunction ');

// The sheet portals into #bs-phone-surface, or the body: a stand-in, as tests/nora-stream.test.mjs does.
globalThis.document = globalThis.document || { getElementById: () => null, body: {} };
const api = await loadBroadsheet(['BSNoraSheet', '_bsNoraPublish', 'bsNoraOpen']);
const open = () => drive(api.BSNoraSheet, { onClose: () => {} });
const reset = () => api._bsNoraPublish(null, false);
// The first open binds the session's thread to its account (signed out here), so a thread published
// after it is the one the sheet draws.
open();
const styleOf = (n) => (n && n.props && n.props.style) || {};
const named = (n, name) => typeof n.type === 'function' && n.type.name === name;

test('the transcript: her words on the paper with no box, yours in an ink bubble, no faces from the chat page', () => {
  reset();
  api._bsNoraPublish([
    { who: 'Nora', t: 'Hi, I am Nora.', time: 'earlier', me: false, bot: true },
    { who: 'You', t: 'Can you hear me?', time: 'now', me: true },
    { who: 'Nora', t: 'Yes, clearly.', time: 'now', me: false, bot: true },
    { who: 'Shape team', t: 'A person here.', time: 'earlier', me: false, bot: false, team: true },
  ], false);
  try {
    const d = open();
    const nodes = d.nodes();
    // Yours: the ink bubble with the paper's text, rounded, on the right.
    const mine = nodes.find((n) => n.type === 'div' && n.props.children === 'Can you hear me?');
    assert.ok(mine, 'your message is drawn');
    assert.equal(styleOf(mine).background, '#111');
    assert.equal(styleOf(mine).color, '#fff');
    assert.equal(styleOf(mine).alignSelf, 'flex-end');
    assert.equal(styleOf(mine).borderRadius, 20);
    // Hers: the words sit on the paper, no box and no edge.
    const hers = nodes.find((n) => n.type === 'div' && Array.isArray(n.props.children) && n.props.children[0] === 'Yes, clearly.');
    assert.ok(hers, 'her reply is drawn');
    for (const k of ['background', 'border', 'borderLeft', 'borderRadius']) assert.equal(styleOf(hers)[k], undefined, `her words have a ${k}`);
    // No facet faces (the magazine's) and no face beside yours: hers are her photo, a person's an S.
    assert.equal(nodes.filter((n) => named(n, 'BSFacetAvatar')).length, 0);
    assert.match(d.text, /Shape team · a person/);
    // Listen under each of hers, none under the person's or yours.
    assert.equal(d.buttons().filter((b) => /Listen/.test(b.label)).length, 2);
  } finally { reset(); }
});

test('suggestions are tiles, two to a row; an odd last one takes the row', () => {
  reset();
  api._bsNoraPublish([{ who: 'Nora', t: 'Hi.', time: 'now', me: false, bot: true, greet: true, quick: ['Connect WHOOP', 'My plan', 'Billing'] }], false);
  try {
    const d = open();
    const grid = d.nodes().find((n) => n.props && n.props['data-nora-quick']);
    assert.ok(grid, 'the tiles are drawn');
    assert.equal(styleOf(grid).display, 'grid');
    assert.equal(styleOf(grid).gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
    const tiles = d.nodes().filter((n) => n.type === 'button' && /^(Connect WHOOP|My plan|Billing)/.test(String(n.props.children && n.props.children[0] && n.props.children[0].props && n.props.children[0].props.children)));
    assert.equal(tiles.length, 3);
    assert.deepEqual(tiles.map((n) => styleOf(n).gridColumn), ['auto', 'auto', '1 / -1']);
    assert.ok(tiles.every((n) => styleOf(n).borderRadius === 14 && styleOf(n).minHeight >= 44));
  } finally { reset(); }
});

test('the screen she is told rides over the composer, under the talk', () => {
  reset();
  api.bsNoraOpen({ page: 'Today', label: 'Today' });
  try {
    const nodes = open().nodes();
    const at = (pred) => nodes.findIndex(pred);
    const scroller = at((n) => n.type === 'div' && n.props.className === 'bs-hide-scroll');
    const chip = at((n) => n.props && n.props['data-nora-screen']);
    const tray = at((n) => named(n, 'BSMessageComposer'));
    assert.ok(scroller >= 0 && chip >= 0 && tray >= 0);
    assert.ok(chip > scroller, 'the chip is out of the scrolling talk');
    assert.ok(chip < tray, 'and just over the composer');
    assert.equal(nodes[tray].props.tray, true, 'the composer is the tray');
    assert.ok(!nodes[tray].props.mag, 'not the chat page\'s square one');
  } finally { api.bsNoraOpen({ page: null, label: null }); reset(); }
});

test('her desk: an inverted band that stays put, with Talk to Nora on the paper and a person in outline', () => {
  const desk = between(SHEET, '<div data-nora-desk', '<div ref={scrollRef}');
  assert.match(desk, /style=\{\{ flex: 'none', background: t\.INK, color: t\.PAPER,/);
  // Out of the scrolling talk: the desk closes before the scroller opens.
  assert.ok(SHEET.indexOf('<div data-nora-desk') < SHEET.indexOf('<div ref={scrollRef}'));
  // The band's teal is the other theme's, since the band is the other theme's colours.
  assert.match(SHEET, /const deskTeal = t\.isLight \? '#34d6c5' : '#0a7a72';/);
  // Talk to Nora is the filled key (the paper on the band), 44px.
  assert.match(desk, /data-nora-talk-button onClick=\{\(\) => talk\.start\(\)\} style=\{\{ flex: 1, minWidth: 0, minHeight: 44, [^}]*background: t\.PAPER, color: t\.INK,/);
  // Her portrait and name open her profile, a button of its own (Talk and × are not inside it).
  assert.match(desk, /<button type="button" onClick=\{\(\) => setShowNora\(true\)\}/);
  assert.doesNotMatch(desk, /role="button"/);
});

test('neither earlier look: no round tinted bubbles, no magazine notes, masthead or square controls', () => {
  const render = between(SHEET, 'return createPortal(', '\n  );\n');
  // The magazine look (#2535): square notes with a teal edge, "Nora." over an ink rule, facet faces.
  assert.doesNotMatch(render, /borderRadius: 0\b/, 'a square control is back');
  assert.doesNotMatch(render, /borderLeft: me \?|3px solid \$\{noraTint\}/, 'the teal-edged note is back');
  assert.doesNotMatch(render, /Nora<span style=\{\{ color: noraTint \}\}>\.<\/span>/, 'the magazine masthead is back');
  assert.doesNotMatch(render, /<BSFacetAvatar/, 'faces on both sides are back');
  assert.doesNotMatch(render, /<BSMessageComposer mag /);
  // The look before it: teal-tinted bubbles with a tucked corner, a glowing teal pill.
  assert.doesNotMatch(render, /borderBottomRightRadius|borderBottomLeftRadius/, 'the tucked-corner bubble is back');
  assert.doesNotMatch(render, /boxShadow: `0 2px 10px \$\{noraTint\}55`/, 'the glowing teal pill is back');
  // Her typing shows as dots, and the words stay for a screen reader; motion stops when asked to.
  assert.match(render, /@media \(prefers-reduced-motion: reduce\) \{ \.bs-nora-anim \{ animation: none !important; \} \}/);
  assert.match(render, /<div role="status"[\s\S]*?\{tr\('feed:support\.typing', \{ defaultValue: 'Nora is typing…' \}\)\}/);
});

test('the tray: one rounded tray holds the mic, the field and a round ink send', () => {
  const comp = between(CLIENT, 'function BSMessageComposer({', '\n}\n');
  const tray = between(comp, '  if (tray) {', '\n  const tagChips');
  assert.match(tray, /borderRadius: 24, background: bsTHexA\(t\.INK, 0\.05\)/);
  assert.match(tray, /background: canSend \? t\.INK : bsTHexA\(t\.INK, 0\.1\), color: canSend \? t\.PAPER : t\.INK50/);
  // The mic keeps the composer's own voice: the same handlers and words.
  assert.match(tray, /\{voiceOk && \(\s*<button type="button" \{\.\.\.micHandlers\}/);
  assert.match(tray, /\{voiceStatus\}\s*\{\(canChat \|\| unlocked\) \? trayField : lockedField\}/);
  // Every hook runs before the tray returns.
  assert.ok(comp.indexOf('  if (tray) {') > comp.lastIndexOf('React.useLayoutEffect('));
  assert.ok(comp.indexOf('  if (tray) {') > comp.lastIndexOf('React.useEffect('));
});
