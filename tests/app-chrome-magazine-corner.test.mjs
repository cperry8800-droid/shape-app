// The masthead's corner in the Wall's magazine look (owner, 2026-10-24: "Yes I want that in new design", on
// the header's ✦, the search and the corner avatar). The corner's controls are bare glyphs in ink, with no
// ring, on the avatar's full 34px square; ✦ Nora is the magazine's red. The member's own face is the flat cut
// of the facet the chat page uses (an ink frame, no tier gem, glow or pulse), its dot the red in a workout
// and amber at the stove, on every page's corner: the member app, the profile mastheads, the coach apps, the
// calendar, the marketplace and Radio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBroadsheet, drive, THEME, ROOT } from './helpers/broadsheet-mount.mjs';

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

test('the member\'s own face in the corner is the flat facet in ink, on the masthead and the pinned strip', () => {
  for (const Corner of [mod.BSHeaderTools, mod.BSMeCorner]) {
    const api = drive(Corner, { onProfile() {} });
    const face = api.nodes().find((n) => n.type === mod.BSFacetAvatar);
    assert.ok(face, 'no face in the corner');
    assert.equal(face.props.flat, true, 'a tier gem in the corner');
    assert.equal(face.props.c, THEME.INK);
    assert.equal(face.props.size, 34);
  }
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

test('the profile mastheads\' ✎ and ⚙ are the same bare glyphs, beside a flat face', () => {
  const uses = CLIENT.match(/style=\{bsCornerBtn\(BS_HEADER_AVATAR, INK\)\}/g) || [];
  assert.equal(uses.length, 6, 'the profile mastheads\' ✎ and ⚙');
  assert.doesNotMatch(CLIENT, /borderRadius: 999, border: `1px solid \$\{bsTHexA\(INK, 0\.3\)\}`/, 'a ringed corner button is back');
  assert.match(CLIENT, /<BSFacetAvatar flat size=\{BS_HEADER_AVATAR\} c=\{INK\} initial=\{bsMyInitials\(\) \|\| bsInitials\(name\) \|\| '\?'\} photo=\{avPhoto/);
  assert.match(CLIENT, /<BSFacetAvatar flat size=\{BS_HEADER_AVATAR\} c=\{INK\} initial=\{bsMyInitials\(\) \|\| bsInitials\(name\) \|\| '\?'\} photo=\{photo/);
  // The follow list's corner, on the sheet's own ink.
  assert.match(CLIENT, /<BSFacetAvatar flat size=\{BS_HEADER_AVATAR\} c=\{INK\} initial=\{bsMyInitials\(\) \|\| '\?'\} name=\{bsMyName\(\)\}/);
});

test('every other page\'s corner face is the flat cut too: the coach apps, the calendar, the marketplace and Radio', () => {
  const pros = read('iosAppBroadsheetPros.jsx');
  assert.match(pros, /<BSFacetAvatar flat size=\{\(typeof window !== 'undefined' && window\.BS_HEADER_AVATAR\) \|\| 34\} c=\{t\.INK\} initial=\{bsMyInitials\(\)\}/, 'the coach Today masthead');
  assert.match(pros, /return <BSFacetAvatar flat size=\{size\} c=\{t\.INK\} initial=\{bsProMeInit\(\)\}/, 'the coach pages\' corner');
  assert.match(read('iosAppBroadsheetCalendar.jsx'), /React\.createElement\(FA, \{ flat: true, size: [^,]+\|\| 34, c: t\.INK,/);
  const mkt = read('iosAppBroadsheetMarketplace.jsx');
  assert.match(mkt, /<window\.BSFacetAvatar\s+flat\s+size=\{\(window\.BS_HEADER_AVATAR \|\| 34\)\}\s+c=\{ink\}/);
  assert.match(mkt, /\{bsMktCorner\(t\.INK\)\}/);
  assert.match(read('iosAppBroadsheetRadio.jsx'), /React\.createElement\(window\.BSFacetAvatar, \{[^}]*flat: true,\s+size,\s+c: ink,/);
  // No corner reads the tier colour for its frame any more.
  for (const f of ['iosAppBroadsheetPros.jsx', 'iosAppBroadsheetCalendar.jsx', 'iosAppBroadsheetMarketplace.jsx', 'iosAppBroadsheetRadio.jsx']) {
    assert.doesNotMatch(read(f), /c[:=]\s*\{?\(?window\.bsMyTierColor/, `${f}: a tier-coloured corner`);
  }
});
