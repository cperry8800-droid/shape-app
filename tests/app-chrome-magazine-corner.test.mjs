// The masthead's corner in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on
// the header's ✦, the search and the corner avatar). The corner's controls are bare glyphs in ink, with no
// ring, on the corner's full 34px square; ✦ Nora is the theme's teal (owner, 2026-10-27: "make this teal
// color", from the magazine's red, which became Shape's teal too: "Those should be shape colors"). The
// corner's last control is the
// settings gear (owner: "make the settings avatar something different in top right"), the chrome's one
// BSSettingsCorner on every page's corner: the member app, the profile mastheads, the follow list, the coach
// apps, the calendar, the marketplace and Radio. The member's face lives on the tab bar's Me tab; it is the
// flat cut of the facet the chat page uses (an ink frame, no tier gem, glow or pulse), its dot the teal in a
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
const mod = await loadBroadsheet(['BSSearchCorner', 'BSNoraCorner', 'BSHeaderTools', 'BSMeCorner', 'BSFacetAvatar']);
const DIR = join(ROOT, 'mobile-app/src/broadsheet');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const CLIENT = read('iosAppBroadsheetClient.jsx');

// The magazine's teal on a light paper (bsWsAccent); the harness's paper is light.
const ACCENT = '#0a7a72';
// The theme's teal on a light paper, which ✦ Nora takes.
const TEAL = '#0a8f87';

test('the corner\'s controls are bare glyphs on the avatar\'s square, and ✦ is the theme\'s teal', () => {
  // ✦ is its own control (BSNoraCorner), which the corner draws ahead of ⌕, and Home's masthead draws beside
  // the mark at the left (owner, 2026-11-08: "move noras icon to the right of shape triangles in top left").
  const api = drive(mod.BSSearchCorner, { size: 34 });
  const star = api.nodes().filter((n) => n.type === mod.BSNoraCorner);
  assert.equal(star.length, 1, '✦ ahead of ⌕');
  assert.equal(star[0].props.size, 34);
  const btns = [...drive(mod.BSNoraCorner, star[0].props).nodes(), ...api.nodes()].filter((n) => n.type === 'button');
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
  assert.equal(nora.props.style.color, TEAL);
  // ✦ is the larger glyph in a soft teal glow, so it reads first in the corner (owner, 2026-10-29: "make the
  // Nora teal little symbol on mast head more noticeable", option A: no ring, still on the bare square).
  assert.equal(nora.props.style.fontSize, 24, '✦ at 24px, to ⌕\'s 17');
  assert.equal(nora.props.style.textShadow, `0 0 10px ${TEAL}66`, 'the light paper\'s fainter teal glow');
  assert.equal(search.props['aria-label'], 'Search Shape');
  assert.equal(search.props.style.color, THEME.INK);
  // A masthead that sets its own ink (the profile mastheads, Radio) gets it on the corner, and Radio drops ✦.
  const radio = drive(mod.BSSearchCorner, { size: 34, ink: '#f2ede4', nora: false });
  const only = radio.nodes().filter((n) => n.type === 'button');
  assert.equal(only.length, 1);
  assert.equal(radio.nodes().filter((n) => n.type === mod.BSNoraCorner).length, 0, 'no ✦');
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

test('the flat face\'s dot is the magazine\'s teal in a workout and amber at the stove', () => {
  const dot = (activity) => {
    const api = drive(mod.BSFacetAvatar, { flat: true, size: 34, c: THEME.INK, initial: 'QH', activity });
    const inner = api.nodes().filter((n) => n.type === 'span' && n.props.style && n.props.style.display === 'block' && n.props.style.borderRadius === 999);
    assert.equal(inner.length, 1, 'no dot');
    return inner[0].props.style.background;
  };
  assert.equal(dot('workout'), ACCENT);
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
  // ✎ on the coach's own Signal profile, in bsCornerBtn's style (its masthead and the one it pins).
  const uses = CLIENT.match(/style=\{bsCornerBtn\(BS_HEADER_AVATAR, INK\)\}/g) || [];
  assert.equal(uses.length, 2, 'the Signal coach profile\'s ✎');
  assert.doesNotMatch(CLIENT, /borderRadius: 999, border: `1px solid \$\{bsTHexA\(INK, 0\.3\)\}`/, 'a ringed corner button is back');
  // Its ⚙, on the page's own ink.
  assert.equal((CLIENT.match(/<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} onClick=\{onOpenSettings\} \/>/g) || []).length, 1);
  assert.equal((CLIENT.match(/<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} \/>/g) || []).length, 1);
  // The member profile's masthead sits on its cover in white, as the trainer profile's does
  // (BSTrainerProfile.jsx; owner, 2026-10-31: the member profile in the coach profile's look): the same
  // ⌕, the ✎ on its dark disc for the photo behind it, and a visitor's ⚙ opening their own profile.
  const member = CLIENT.slice(CLIENT.indexOf('<div data-member-cover=""'), CLIENT.indexOf('{/* The avatar over the cover'));
  assert.match(member, /<BSSearchCorner size=\{corner\} ink=\{WHITE\} \/>/);
  assert.match(member, /<BSSettingsCorner size=\{corner\} ink=\{WHITE\} onClick=\{isSelf \? onOpenSettings : \(\) => \{ try \{ window\.dispatchEvent\(new window\.CustomEvent\('shape:openProfile'\)\); \} catch \(e\) \{\} \}\} \/>/);
  const trainer = read('BSTrainerProfile.jsx');
  const disc = "borderRadius: 99, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.25)'";
  assert.ok(member.includes(disc), 'the member cover\'s ✎ disc');
  // The trainer page's is the same disc over a dark paper, and the paper's ink on a light one (the coach's own
  // colours, #2708: Codex on its masthead).
  assert.ok(trainer.includes("borderRadius: 99, border: `1px solid ${CLIMB.isLight ? hexA(CLIMB.INK, 0.4) : 'rgba(255,255,255,0.5)'}`, background: CLIMB.isLight ? hexA(CLIMB.INK, 0.06) : 'rgba(0,0,0,0.25)'"), 'the ✎ on the cover is the trainer profile\'s');
  // The follow list's corner, on the sheet's own ink, closes the sheet before Settings opens.
  assert.match(CLIENT, /<BSSettingsCorner size=\{BS_HEADER_AVATAR\} ink=\{INK\} onClick=\{\(\) => \{ onClose\(\); setTimeout\(/);
  // No corner draws the member's own face any more, and since a chat thread took Nora's sheet's design
  // (owner, 2026-11-01: "use this chat design for the rest of messaging on chat page") your messages carry
  // no face either, so no own-face avatar is labelled as the way to Settings.
  assert.equal((CLIENT.match(/settings:avatar\.mine/g) || []).length, 0);
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

test('Home\'s ✦ stands alone by the mark with its own 44px target; its tools drop ✦ (owner, 2026-11-08)', () => {
  const bare = drive(mod.BSNoraCorner, { bare: true }).nodes().find((n) => n.type === 'button');
  assert.equal(bare.props.style.width, 44, 'a full tap target where no pill gives one');
  assert.equal(bare.props.style.height, 44);
  assert.equal(bare.props.style.color, TEAL);
  assert.equal(bare.props['data-nora-corner'], true, 'the Nora hint finds it');
  // The tool clusters pass nora through to the corner, so Home's pill holds ⌕ and ⚙ alone.
  const tools = drive(mod.BSHeaderTools, { onProfile() {}, nora: false }).nodes().find((n) => n.type === mod.BSSearchCorner);
  assert.equal(tools.props.nora, false);
  const me = drive(mod.BSMeCorner, { nora: false }).nodes().find((n) => n.type === mod.BSSearchCorner);
  assert.equal(me.props.nora, false);
  assert.equal(drive(mod.BSHeaderTools, { onProfile() {} }).nodes().find((n) => n.type === mod.BSSearchCorner).props.nora, true, 'every other page keeps ✦ in the pill');
  assert.match(CLIENT, /trailing=\{<BSHeaderTools onProfile=\{onProfile\} nora=\{false\} \/>\}/, 'member Home');
});
