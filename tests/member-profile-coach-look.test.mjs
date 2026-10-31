// tests/member-profile-coach-look.test.mjs
//
// The member profile in the coach profile's look. Owner, 2026-10-31: "member profile needs to match
// similar design to coaches, interms of overall look, but keep same basic features while you look for
// improvements", and "improve design of these pages" (the Signals and Climb tabs); of the choices, "Cover
// photo; climb in its tab". The head is the coach page's: a cover, the round photo over its edge, the name,
// one meta line, the counts, Follow and Message (or Log activity and Edit profile on your own). The tier's
// climb, which the mountain at the top drew, is the Climb tab's first source.
//
// It also holds the fixes from the review of the page that came with it: a profile opened from your own
// Me page could show a Message that did nothing; getPublicProfile dropped whether the profile is public
// and viewable; and someone else's real profile showed the sample's made-up coach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadBroadsheet, drive, textOf, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSFollowBlock', 'bsReadableOn', 'BSProfilePlaylists']);
const CLIENT = stripComments(readFileSync(SRC, 'utf8'));
const BACKEND = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
const fnBody = (marker) => { const at = CLIENT.indexOf(marker); assert.ok(at > 0, `${marker} is gone`); return CLIENT.slice(at, CLIENT.indexOf('\nfunction ', at + marker.length)); };
const signedOut = () => { globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) }; };
const signedInAs = (id) => { globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id } }) }; };
const QUINN = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
// The English profile catalog, formatted as the app's ICU runtime formats it.
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const PROFILE_EN = JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/en/profile.json', import.meta.url), 'utf8'));
globalThis.window.ShapeI18n = {
  t: (key, opts = {}) => {
    const m = /^profile:(.+)$/.exec(key);
    const msg = m ? PROFILE_EN[m[1]] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
};

// WCAG 2 contrast, worked out here on its own, to hold the button's ink to.
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('Follow\'s words take whichever ink reads better on the tier\'s colour', () => {
  const { bsReadableOn } = mod;
  for (const c of ['#34d6c5', '#0a8f87', '#a07a2e', '#d8b25a', '#c0533b', '#7c5cff', '#e0a43a', '#000000', '#ffffff', '#3b7dd8']) {
    const ink = bsReadableOn(c);
    const other = ink === '#ffffff' ? '#0f0e0c' : '#ffffff';
    assert.ok(contrast(c, ink) >= contrast(c, other), `${c}: ${ink} reads worse than ${other}`);
  }
  assert.equal(bsReadableOn('#34d6c5'), '#0f0e0c', 'dark words on the dark papers\' teal');
  assert.equal(bsReadableOn('#c0533b'), '#ffffff', 'white words on the trainers\' rust');
  assert.equal(bsReadableOn('#fff'), '#0f0e0c', 'three-digit colours read');
  assert.equal(bsReadableOn('not a colour'), '#ffffff');
});

test('the coach look\'s counts, then Follow and Message for someone else, nothing to press for yourself', () => {
  signedInAs('u-me');
  const d = drive(mod.BSFollowBlock, { userId: 'u-priya', isSelf: false, c: '#34d6c5', INK: '#f2ede4', BG: '#100d0a', name: 'Priya Shah', variant: 'coach', onMessage() {} });
  const nodes = d.nodes();
  const counts = withAttr(nodes, 'data-follow-count');
  assert.deepEqual(counts.map((n) => n.props['data-follow-count']), ['followers', 'following', 'posts']);
  for (const n of counts) assert.equal(n.props.style.minHeight, 44, `${n.props['data-follow-count']} is under 44 to tap`);
  assert.match(textOf(counts[2]), /Posts/);
  const [toggle] = withAttr(nodes, 'data-follow-toggle');
  const [message] = withAttr(nodes, 'data-follow-message');
  assert.equal(textOf(toggle).trim(), 'Follow');
  assert.equal(toggle.props.style.background, '#34d6c5');
  assert.equal(toggle.props.style.color, '#0f0e0c', 'Follow\'s words in the ink that reads on teal');
  assert.equal(textOf(message).trim(), 'Message Priya', 'Message says whom, by first name');
  for (const b of [toggle, message]) assert.equal(b.props.style.minHeight, 46);
  // No handler, no Message: never a button that does nothing.
  const quiet = drive(mod.BSFollowBlock, { userId: 'u-priya', isSelf: false, c: '#34d6c5', name: 'Priya Shah', variant: 'coach' });
  assert.equal(withAttr(quiet.nodes(), 'data-follow-message').length, 0);
  assert.equal(withAttr(quiet.nodes(), 'data-follow-toggle').length, 1);
  const own = drive(mod.BSFollowBlock, { userId: 'u-me', isSelf: true, c: '#34d6c5', name: 'Quinn Harper', variant: 'coach', onMessage() {} });
  assert.equal(withAttr(own.nodes(), 'data-follow-toggle').length + withAttr(own.nodes(), 'data-follow-message').length, 0, 'Follow or Message on your own page');
  assert.equal(withAttr(own.nodes(), 'data-follow-count').length, 3);
});

test('the preview\'s head: the cover, the photo, the sample\'s coach band; Log activity and Edit profile', () => {
  signedOut();
  const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  const nodes = d.nodes();
  const [cover] = withAttr(nodes, 'data-member-cover');
  assert.match(cover.props.style.height, /^calc\(.+ \+ 190px\)$/, 'the cover runs under the masthead');
  const [avatar] = withAttr(nodes, 'data-member-avatar');
  assert.equal(avatar.props.style.width, 108);
  assert.equal(avatar.props.style.borderRadius, 99, 'the photo is round, as a coach\'s is');
  assert.equal(avatar.props.disabled, true, 'signed out, the photo is no upload button');
  assert.match(textOf(withAttr(nodes, 'data-member-name')[0]), /^Quinn Harper\.$/);
  assert.equal(withAttr(nodes, 'data-member-coach').length, 1, 'the preview shows its sample coach');
  assert.match(textOf(withAttr(nodes, 'data-member-coach')[0]), /coached by/i);
  assert.equal(textOf(withAttr(nodes, 'data-member-log')[0]).trim(), '＋ Log activity');
  assert.equal(textOf(withAttr(nodes, 'data-member-edit')[0]).trim(), 'Edit profile');
  // On your own page Back is not drawn (the Me tab is a root); another's has it, in white on the cover.
  assert.equal(nodes.filter(named('BSBackRow')).length, 0);
  const other = drive(mod.BSTerrainProfile, { person: { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' }, onBack() {}, onMessage() {} });
  const back = other.nodes().filter(named('BSBackRow'));
  assert.equal(back.length, 1);
  assert.equal(back[0].props.ink, '#ffffff', 'Back in white over the cover');
  assert.equal(withAttr(other.nodes(), 'data-member-log').length, 0, 'Log activity on someone else\'s page');
});

test('someone else\'s real profile shows no coach it does not have', () => {
  // The review: signed in, another member's profile drew the sample's "Coached by" and its block.
  signedInAs('u-me');
  const d = drive(mod.BSTerrainProfile, { person: { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' }, onBack() {}, onMessage() {} });
  assert.equal(withAttr(d.nodes(), 'data-member-coach').length, 0);
  assert.doesNotMatch(d.text, /coached by/i);
  const fn = fnBody('function BSTerrainProfile(');
  assert.match(fn, /const showCoachBand = !signedIn \|\| !!coachReal \|\| hasRealProgram;/);
  assert.match(fn, /const showCoachLink = !signedIn \|\| !!coachReal;/);
  assert.match(fn, /const hasRealProgram = !!\(isSelf && prog && /, 'a program shows only on your own page');
});

test('the Climb tab opens on the tier, the climb the mountain at the top used to draw', () => {
  signedOut();
  const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('climb');
  d.render();
  const sources = d.nodes().filter((n) => n.type === 'button' && n.props && n.props['aria-pressed'] !== undefined);
  assert.ok(sources.length >= 2, 'the climb\'s sources');
  assert.equal(textOf(sources[0]).trim(), 'Tier');
  assert.equal(sources[0].props['aria-pressed'], true, 'the tier is the one shown first');
  assert.match(d.text, /pts · \d+%/, 'the tier\'s Now: the points and how far into the tier');
  // The tier is always there; the customise list offers only the others.
  const fn = fnBody('function BSTerrainProfile(');
  assert.match(fn, /const CLIMB_SOURCES = \[\n\s+\{ key: 'score', label: 'Tier' \},/);
  assert.match(fn, /CLIMB_SOURCES\.filter\(\(s\) => s\.key === 'score' \|\| climbShown\.includes\(s\.key\)\)/);
});

test('a profile opened from your own Me page messages for real, or shows no Message', () => {
  // The review: the Me page hands BSPublicProfile no onMessage, and a profile opened from it drew a
  // Message that did nothing.
  assert.match(CLIENT, /^function BSPublicProfile\(\{ person, onBack, onMessage = null,/m, 'BSPublicProfile defaults to a Message that does nothing');
  const fn = fnBody('function BSTerrainProfile(');
  assert.match(fn, /const nestedMessage = typeof onMessage === 'function' \? onMessage\s+: \(meId && followProfile && followProfile\.userId && followProfile\.userId !== meId \? \(p\) => bsOpenMemberConversation\(p, \(\) => setFollowProfile\(null\)\) : null\);/);
  assert.match(fn, /<BSPublicProfile person=\{followProfile\} onBack=\{\(\) => setFollowProfile\(null\)\} onMessage=\{nestedMessage\} \/>/);
});

test('getPublicProfile keeps whether the profile is public and viewable, and the handle', () => {
  // The review: the RPC returns them (2026-10-12-shape-score-fixes.sql) and the mapper dropped them, so a
  // private profile read as public.
  const at = BACKEND.indexOf('async function getPublicProfile(');
  const fn = BACKEND.slice(at, BACKEND.indexOf('\n}\n', at));
  assert.match(fn, /is_public: r\.is_public, can_view: r\.can_view, username: r\.username \|\| null/);
});

test('the trajectory\'s line is drawn to its end', () => {
  // A non-scaling stroke measures its dash on the screen while pathLength scales it on the path, so the
  // line stopped two thirds of the way across (seen 2026-10-31, before this shipped).
  const at = CLIENT.indexOf('<div data-signals-trajectory=""');
  const block = CLIENT.slice(at, CLIENT.indexOf('<div data-signals-disciplines=""', at));
  assert.match(block, /<path d=\{sparkPath\}[^>]*pathLength=\{1\} strokeDasharray="1 1"/);
  assert.doesNotMatch(block, /non-scaling-stroke/);
});

test('the Music tab names itself once: a visitor\'s list has no head, your own keeps Your library and Add', () => {
  // The review: "Music" under the Music tab (owner, 2026-10-26, of the tabs' first sections: "dont need it
  // showing twice").
  signedInAs('u-me');
  const other = drive(mod.BSProfilePlaylists, { userId: 'u-priya', isSelf: false, c: '#34d6c5', INK: '#f2ede4', BG: '#100d0a', bleed: 8, ledger: true });
  assert.equal(withAttr(other.nodes(), 'data-playlists-head').length, 0);
  assert.doesNotMatch(other.text, /Music/);
  const own = drive(mod.BSProfilePlaylists, { userId: 'u-me', isSelf: true, c: '#34d6c5', INK: '#f2ede4', BG: '#100d0a', bleed: 8, ledger: true });
  const [head] = withAttr(own.nodes(), 'data-playlists-head');
  assert.ok(head, 'your library lost its head');
  assert.match(textOf(head), /Your library[\s\S]*Add playlist/);
});

test('each discipline is a bar to its own 100, not to the strongest', () => {
  // Codex P2 on #2546: scaled to the strongest, 91 drew full and 82 at nine tenths.
  signedOut();
  const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('signals');
  d.render();
  const fills = withAttr(d.nodes(), 'data-disc-row').map((row) => withAttr([row, ...row.props.children.flatMap((x) => [x, ...[].concat(x && x.props && x.props.children || [])])], 'style')
    .map((n) => n.props.style.width).find((w) => typeof w === 'string' && w.endsWith('%')));
  assert.deepEqual(fills, ['82%', '64%', '91%', '73%']);
});

test('your climb can be the tier alone: the last other source turns off, stays off, and ✎ still opens the list', () => {
  // Codex P2 on #2546: the tier is always shown, so an empty list of the others is a valid climb; the old
  // guard put the last one straight back.
  signedOut();
  const saved = [];
  globalThis.window.shapeDb = { saveUserGoals: (k, v) => saved.push([k, v]) };
  try {
    const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
    d.nodes().find(named('BSTerrainTabs')).props.onPick('climb');
    d.render();
    const pressed = () => d.nodes().filter((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined).map((n) => textOf(n).trim());
    assert.deepEqual(pressed(), ['Tier', 'Body weight', 'Strength']);
    d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Customize climb').props.onClick();
    d.render();
    const toggle = (label) => { d.nodes().find((n) => n.type === 'button' && /^[✓＋] /.test(textOf(n)) && textOf(n).includes(label)).props.onClick(); d.render(); };
    toggle('Body weight');
    toggle('Strength');
    assert.deepEqual(pressed(), ['Tier'], 'the last source came back');
    assert.deepEqual(saved[saved.length - 1], ['client_climb', { source: 'score', shown: [] }]);
    assert.ok(withAttr(d.nodes(), 'data-climb-switch').length, 'a Tier-only climb lost its ✎');
    assert.ok(d.nodes().some((n) => n.type === 'button' && textOf(n).trim() === 'Done'), 'the list cannot be closed');
  } finally { delete globalThis.window.shapeDb; }
  // And an empty list read back is the tier alone, not the defaults.
  const fn = fnBody('function BSTerrainProfile(');
  assert.match(fn, /if \(climb && Array\.isArray\(climb\.shown\)\) setClimbShown\(/);
  assert.doesNotMatch(fn, /if \(!next\.length\) next = \[k\];/);
});
