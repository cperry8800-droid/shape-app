// The masthead's corner in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on
// the header's ✦, the search and the corner avatar). The corner's controls are bare glyphs in ink, with no
// ring, on the corner's full 34px square; ✦ Nora is the magazine's red. The corner's last control is the
// settings gear (owner: "make the settings avatar something different in top right"), the chrome's one
// BSSettingsCorner on every page's corner: the member app, the profile mastheads, the follow list, the coach
// apps, the calendar, the marketplace and Radio. The member's face lives on the tab bar's Me tab; it is the
// flat cut of the facet the chat page uses (an ink frame, no tier gem, glow or pulse), its dot the red in a
// workout and amber at the stove.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBroadsheet, drive, THEME, ROOT } from './helpers/broadsheet-mount.mjs';

// The client module takes the chrome's gear from window at load; the harness has no chrome module, so a
// named stand-in marks where the corner draws it (the real one is mounted in app-chrome-magazine-tabbar).
function BSSettingsCorner() { return null; }
globalThis.BSSettingsCorner = BSSettingsCorner;
const mod = await loadBroadsheet(['BSSearchCorner', 'BSHeaderTools', 'BSMeCorner', 'BSFacetAvatar']);
const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const CLIENT = read('iosAppBroadsheetClient.jsx');

// The magazine's red on a light paper (bsWsRed); the harness's paper is light.
const RED = '#b23a1f';

test('the corner\'s controls are bare glyphs on the avatar\'s square, and ✦ is the magazine\'s red', () => {
  const api = drive(mod.BSSearchCorner, { size: 34 });
  const btns = api.nodes().filter((n) => n.type === 'button');
  assert.equal(btns.length, 2, '✦ and ⌕');
  for (const b of btns) {
    assert.equal(b.props.style.border, 0, 'a ring around a corner control');
    assert.equal(b.props.style.borderRadius, 0);
    assert.equal(b.props.style.background, 'transparent');
    assert.equal(b.props.style.width, 34, 'the target stays the avatar\'s square');
    assert.equal(b.props.style.height, 34);
  }
  const [nora, search] = btns;
  assert.equal(nora.props['aria-label'], 'Ask Nora');
  assert.equal(nora.props.style.color, RED);
  assert.equal(search.props['aria-label'], 'Search Shape');
  assert.equal(search.props.style.color, THEME.INK);
  // A masthead that sets its own ink (the profile mastheads, Radio) gets it on the corner, and Radio drops ✦.
  const radio = drive(mod.BSSearchCorner, { size: 34, ink: '#f2ede4', nora: false });
  const only = radio.nodes().filter((n) => n.type === 'button');
  assert.equal(only.length, 1);
  assert.equal(only[0].props.style.color, '#f2ede4');
  assert.equal(only[0].props.style.border, 0);
});

test('the corner ends in the settings gear, not the member\'s face, on the masthead and the pinned strip', () => {
  const onProfile = () => {};
  for (const [Corner, props] of [[mod.BSHeaderTools, { onProfile }], [mod.BSMeCorner, {}], [mod.BSMeCorner, { close() {} }]]) {
    const api = drive(Corner, props);
    const gears = api.nodes().filter((n) => n.type === BSSettingsCorner);
    assert.equal(gears.length, 1, 'no gear in the corner');
    assert.equal(gears[0].props.size, 34);
    assert.equal(typeof gears[0].props.onClick, 'function', 'the gear opens Settings');
    assert.ok(!api.nodes().some((n) => n.type === mod.BSFacetAvatar), 'the member\'s face is back in the corner');
  }
  // The masthead passes its own handler straight through.
  assert.equal(drive(mod.BSHeaderTools, { onProfile }).nodes().find((n) => n.type === BSSettingsCorner).props.onClick, onProfile);
  // On a portaled surface, the gear closes it before Settings opens (and the ⌕ goes).
  let closed = 0;
  const portal = drive(mod.BSMeCorner, { close: () => { closed += 1; } });
  assert.equal(portal.nodes().filter((n) => n.type === 'button').length, 0, 'the ⌕ on a portaled surface');
  portal.nodes().find((n) => n.type === BSSettingsCorner).props.onClick();
  assert.equal(closed, 1);
});

test('the flat face\'s dot is the magazine\'s red in a workout and amber at the stove', () => {
  const dot = (activity) => {
    const api = drive(mod.BSFacetAvatar, { flat: true, size: 34, c: THEME.INK, initial: 'QH', activity });
    const inner = api.nodes().filter((n) => n.type === 'span' && n.props.style && n.props.style.display === 'block' && n.props.style.borderRadius === 999);
    assert.equal(inner.length, 1, 'no dot');
    return inner[0].props.style.background;
  };
  assert.equal(dot('workout'), RED);
  assert.equal(dot('cooking'), '#d8a23a');
  // A caller's own dot colour still wins (the chat page's thread screen passes it).
  const api = drive(mod.BSFacetAvatar, { flat: true, size: 34, c: THEME.INK, initial: 'QH', activity: 'workout', dotC: '#123456' });
  assert.ok(api.nodes().some((n) => n.props && n.props.style && n.props.style.background === '#123456'));
});

test('on a surface with its own ink, the flat face\'s initials take that ink', () => {
  const api = drive(mod.BSFacetAvatar, { flat: true, size: 34, c: '#f2ede4', initial: 'QH', BG: '#100d0a', INK: '#f2ede4' });
  const init = api.nodes().find((n) => n.type === 'span' && n.props.children === 'QH');
  assert.equal(init.props.style.color, 'rgba(242, 237, 228, 0.7)');
});

test('the profile mastheads\' ✎ and ⚙ are the same bare glyphs, and the ⚙ is the shared gear', () => {
  // ✎ and ⌕ on the two profile pages (the Me page and a coach's own), in bsCornerBtn's style.
  const uses = CLIENT.match(/style=\{bsCornerBtn\(BS_HEADER_AVATAR, INK\)\}/g) || [];
  assert.equal(uses.length, 4, 'the profile mastheads\' ⌕ and ✎');
  assert.doesNotMatch(CLIENT, /borderRadius: 999, border: `1px solid \$\{bsTHexA\(INK, 0\.3\)\}`/, 'a ringed corner button is back');
  // The ⚙ on the Me pages, and the corner of a profile opened as myself, on the page's own ink.
  assert.equal((CLIENT.match(/<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} onClick=\{onOpenSettings\} \/>/g) || []).length, 2);
  assert.equal((CLIENT.match(/<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} \/>/g) || []).length, 2);
  // The follow list's corner, on the sheet's own ink, closes the sheet before Settings opens.
  assert.match(CLIENT, /<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} onClick=\{\(\) => \{ onClose\(\); setTimeout\(/);
  // No corner draws the member's own face any more: the only own-face avatar labelled as the way to
  // Settings is the one beside the member's messages in a chat thread.
  assert.equal((CLIENT.match(/settings:avatar\.mine/g) || []).length, 1);
  // On my own follow list my face labels the title row, as the owner's face does on anyone else's.
  assert.match(CLIENT, /<BSFacetAvatar size=\{22\} c=\{c\} initial=\{\(self && bsMyInitials\(\)\) \|\| bsInitials\(name\) \|\| '\?'\}/);
  assert.doesNotMatch(CLIENT, /\{!self && <BSFacetAvatar size=\{22\}/);
});

test('every other page\'s corner ends in the same gear: the coach apps, the calendar, the marketplace and Radio', () => {
  const pros = read('iosAppBroadsheetPros.jsx');
  assert.match(pros, /window\.BSSettingsCorner \? React\.createElement\(window\.BSSettingsCorner, \{ size: [^,]+\|\| 34, onClick: onProfile \}\)/, 'the coach Today masthead');
  assert.match(pros, /function BSProSettingsButton\(\{ size = 38 \}\) \{[\s\S]*?shape:openProSettings[\s\S]*?return Gear \? <Gear size=\{size\} onClick=\{open\} \/> : null;/, 'the coach pages\' corner');
  assert.match(pros, /<BSProSettingsButton size=\{size\} \/>/);
  assert.match(read('iosAppBroadsheetCalendar.jsx'), /React\.createElement\(window\.BSSettingsCorner, \{ size: [^,]+\|\| 34, onClick: onProfile \|\| null \}\)/);
  const mkt = read('iosAppBroadsheetMarketplace.jsx');
  assert.match(mkt, /React\.createElement\(window\.BSSettingsCorner, \{ size: \(window\.BS_HEADER_AVATAR \|\| 34\), ink \}\)/);
  assert.match(mkt, /\{bsMktCorner\(t\.INK\)\}/);
  assert.match(read('iosAppBroadsheetRadio.jsx'), /React\.createElement\(window\.BSSettingsCorner, \{ size, ink \}\)/);
  // None of them draws the member's own face in the corner any more.
  for (const f of ['iosAppBroadsheetPros.jsx', 'iosAppBroadsheetCalendar.jsx', 'iosAppBroadsheetMarketplace.jsx', 'iosAppBroadsheetRadio.jsx']) {
    assert.doesNotMatch(read(f), /bsMyPhoto/, `${f}: the member's own face in a corner`);
  }
});
