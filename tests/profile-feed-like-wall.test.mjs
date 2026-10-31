// tests/profile-feed-like-wall.test.mjs
//
// The member profile's activity feed in the chat feed's format and design (owner, 2026-10-31: "Make
// sure member activity feed on profile is same format and design as chat feed"). Both draw
// BSActivityCard as the Wall's story (variant "magazine"); the profile had dropped the byline's face,
// name and tier, leaving the time alone, and passed no follows, so a post never said which of the
// people you follow reacted. Now each post reads as it does on the Wall, and only the name stays still
// (the page is already theirs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SHIM, THEME, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

globalThis.BSPlate = ({ children }) => SHIM.createElement('div', null, children);
globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
const { BSActivityCard: Card, COMMUNITY_ACTIVITIES } = await loadBroadsheet(['BSActivityCard', 'COMMUNITY_ACTIVITIES']);

const ctx = (over = {}) => ({
  t: THEME, cardInk: '#111', muted: '#777', hair: '#ddd', card: {},
  actLikes: {}, actComments: {}, actCmtOpen: null, actDetailsOpen: {}, actCoSign: {}, actExpr: {},
  exprOpenKey: null, setExprOpenKey() {}, lpTimerRef: { current: null }, lpFiredRef: { current: false },
  tierByUser: {}, avatarByUser: {}, feedAvatars: {}, myRole: 'client', coachClientIds: null,
  myFollowingSet: new Map(),
  setOpenProfile() {}, setActivityDetail() {}, setLikerSheetFor() {}, setSendPostFor() {},
  feedApplyReaction() {},
  ...over,
});
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const headOf = (props) => drive(Card, { isLast: true, pagePad: 0, variant: 'magazine', ...props }).nodes().find(named('BSWallStoryHead'));
const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');

test('on the member profile a post keeps the Wall\'s byline: the face, the name, the tier and the time', () => {
  const post = { real: true, kind: 'workout', typeLabel: 'Run', who: 'Ana Lee', userId: 'u-ana', role: 'Client', ago: '1h', title: 'Tempo', postId: 'p9', kudos: 0, statsRow: [['Distance', '10 km']] };
  const opened = [];
  const edited = [];
  const c = ctx({ tierByUser: { 'u-ana': 'peak' }, avatarByUser: { 'u-ana': 'https://cdn.test/ana.jpg' }, setOpenProfile: (p) => opened.push(p), onEdit: (a) => edited.push(a.postId) });
  const own = { ...c, avatarByUser: {}, ownerPhoto: 'https://cdn.test/ana.jpg' };
  const wall = headOf({ a: post, ctx: c });
  const prof = headOf({ a: post, ctx: own, onAuthorPage: true });
  assert.equal(prof.props.name, wall.props.name, 'the name, as on the Wall');
  assert.equal(prof.props.name, 'Ana Lee');
  assert.equal(prof.props.meta, wall.props.meta, 'the tier and the time, as on the Wall');
  assert.match(prof.props.meta, /^PEAK · /);
  assert.ok(prof.props.avatar, 'the face, as on the Wall');
  assert.equal(prof.props.avatar.props.photo, wall.props.avatar.props.photo, 'the owner\'s own photo, as on the Wall');
  assert.equal(prof.props.kicker, wall.props.kicker);
  assert.equal(prof.props.title, wall.props.title);
  // The name opens nothing on the page that is already theirs; on the Wall it opens the profile.
  assert.equal(prof.props.onAuthor, null, 'the name opens the page you are on');
  assert.equal(typeof wall.props.onAuthor, 'function');
  // The owner's edit stays in the byline.
  assert.equal(prof.props.action.props['aria-label'], 'Edit activity');
  prof.props.action.props.onClick();
  assert.deepEqual(edited, ['p9']);
  assert.deepEqual(opened, []);
});

test('a sample post on a preview profile reads as it does on the Wall, under the page\'s own face', () => {
  const a = COMMUNITY_ACTIVITIES.find((x) => x.who === 'Priya Shah');
  const wall = headOf({ a, ctx: ctx() });
  // Opened from the Wall, the profile's photo is the face the Wall drew.
  const prof = headOf({ a: { ...a, real: false, key: 'demo-act-0' }, ctx: ctx({ ownerPhoto: wall.props.avatar.props.photo }), onAuthorPage: true });
  assert.equal(prof.props.name, 'Priya Shah');
  assert.equal(prof.props.meta, wall.props.meta);
  assert.equal(prof.props.avatar.props.photo, wall.props.avatar.props.photo);
  // The preview's own "you" (Quinn Harper) has a headshot of their own: their page shows it, not the
  // sample face their name would pick on the Wall.
  const me = COMMUNITY_ACTIVITIES.find((x) => x.who === 'Quinn Harper');
  const mine = headOf({ a: { ...me, real: false, key: 'demo-act-1' }, ctx: ctx({ ownerPhoto: '/m/demo-avatar.png' }), onAuthorPage: true });
  assert.equal(mine.props.avatar.props.photo, '/m/demo-avatar.png');
  // ownerPhoto is the profile's alone: a card off its author's page keeps its own face.
  const off = headOf({ a: me, ctx: ctx({ ownerPhoto: '/m/demo-avatar.png' }) });
  assert.notEqual(off.props.avatar.props.photo, '/m/demo-avatar.png');
});

test('a logged session with no post is a real member\'s: their photo or initials, never a sample face', () => {
  const it = { real: false, key: 'it-0', postId: null, userId: 'u-me', who: 'Chris Perry', role: 'Client', tier: 'tempo', kind: 'workout', typeLabel: 'Run', title: 'Run session', body: '5 km · 30 min', ago: '2h', stats: [['5K', '30 min']], likers: [], comments: [] };
  const withPhoto = headOf({ a: it, ctx: ctx({ avatarByUser: { 'u-me': 'data:image/jpeg;base64,me' } }), onAuthorPage: true });
  assert.equal(withPhoto.props.avatar.props.photo, 'data:image/jpeg;base64,me');
  assert.equal(withPhoto.props.name, 'Chris Perry');
  assert.match(withPhoto.props.meta, /^TEMPO · /);
  const noPhoto = headOf({ a: it, ctx: ctx(), onAuthorPage: true });
  assert.equal(noPhoto.props.avatar.props.photo, undefined, 'a sample face picked by the name');
  // A sample card (no account behind it) still takes its sample face.
  const sample = headOf({ a: { ...it, userId: undefined, who: 'Priya Shah' }, ctx: ctx() });
  assert.ok(sample.props.avatar.props.photo, 'the sample lost its face');
});

test('who of the people you follow reacted shows on the profile as on the Wall', () => {
  const post = { real: true, kind: 'workout', typeLabel: 'Run', who: 'Ana Lee', userId: 'u-ana', role: 'Client', ago: '1h', title: 'Tempo', postId: 'p9', kudos: 2, likerIds: ['u-bo', 'u-x'], statsRow: [['Distance', '10 km']], postComments: [{ who: 'Bo Kim', userId: 'u-bo', text: 'Strong.' }] };
  const following = new Map([['u-bo', { name: 'Bo Kim', role: 'client' }]]);
  const card = (c) => drive(Card, { a: post, ctx: c, onAuthorPage: true, isLast: true, pagePad: 0, variant: 'magazine' });
  const followed = card(ctx({ myFollowingSet: following, feedAvatars: { 'u-bo': 'https://cdn.test/bo.jpg' } }));
  // The harness's tr leaves {name} unfilled; what matters is that the line is there.
  assert.match(followed.text, /reacted/, 'the people you follow who reacted');
  const faces = followed.nodes().filter(named('BSFacetAvatar')).map((n) => n.props.photo);
  assert.ok(faces.includes('https://cdn.test/bo.jpg'), 'their face over the reactions');
  const inline = followed.nodes().filter(named('BSFeedComment')).map((n) => n.props.c.text);
  assert.deepEqual(inline, ['Strong.'], 'their comment inline');
  const none = card(ctx({ myFollowingSet: null }));
  assert.doesNotMatch(none.text, /reacted/, 'the old profile ctx (no follows) said nothing');
  assert.deepEqual(none.nodes().filter(named('BSFeedComment')), []);
});

test('the member profile draws its feed with the Wall\'s byline and the Wall\'s follows', () => {
  const start = SRC.indexOf('function BSTerrainProfile(');
  const body = SRC.slice(start, SRC.indexOf('\nfunction ', start + 30));
  assert.match(body, /<BSActivityCard a=\{a\} ctx=\{profileCtx\} onAuthorPage isLast=\{i === feedEff\.length - 1\} pagePad=\{0\} variant="magazine" \/>/);
  assert.doesNotMatch(body, /<BSActivityCard[^>]*hideAuthor/, 'the member profile hides the byline again');
  assert.match(body, /const profFollowing = useBSMyFollowing\(\);/);
  // The byline's face is the hero's (the avatar-source toggle and the live profile's photo included).
  const av = body.indexOf('const avPhoto = ');
  assert.ok(av > 0 && av < body.indexOf('const profileCtx = {'), 'the hero\'s face is read before the cards\' ctx');
  assert.equal(body.split('const avPhoto = ').length, 2, 'one face for the hero and the cards');
  assert.match(body, /feedAvatars: profFollowing\.feedAvatars, myFollowingSet: profFollowing\.myFollowingSet,/);
  assert.match(body, /tierByUser: \(feedAuthorId \? \{ \[feedAuthorId\]: tierKey \} : \{\}\), avatarByUser: \{\}, ownerPhoto: avPhoto \|\| null,/);
  assert.match(body, /real: false, key: it\._k \|\| null, postId: null, userId: feedAuthorId \|\| null,/, 'a logged session knows whose it is');
  assert.match(body, /renderSheets\(\{[^}]*feedAvatars: profFollowing\.feedAvatars \}\)/, 'the full activity page shows the same faces');
  // The Wall reads its follows from the same loader.
  assert.match(SRC, /const \{ myFollowingSet, feedAvatars \} = useBSMyFollowing\(\);/);
  assert.equal((SRC.match(/const \[myFollowingSet, setMyFollowingSet\] = useStateBSC\(null\)/g) || []).length, 1, 'one loader for the follows the cards read');
});

// ── The byline, drawn with real React ─────────────────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const STORY = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), { registry: new Map([['react', React]]) });

async function render(el) {
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.useBS = () => ({ ...THEME, DISPLAY: 'display', MONO: 'mono', BODY: 'body', isLight: false, INK: '#f1ece1', INK50: '#999', HAIR: '#333' });
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); Object.assign(globalThis, saved); } };
}

test('a byline with a name and nowhere to go is the same line, not a button', async () => {
  const face = React.createElement('i', { 'data-face': '' });
  const props = { kicker: 'Run', title: 'Tempo', name: 'Ana Lee', avatar: face, meta: 'PEAK · 1h ago' };
  let r = await render(React.createElement(STORY.BSWallStoryHead, { ...props, onAuthor: () => {} }));
  let wallLine;
  try {
    const byline = r.host.querySelector('[data-bs-wall-story-byline]');
    const btn = byline.querySelector('button');
    assert.ok(btn && btn.querySelector('[data-face]'), 'on the Wall the face and name are one button');
    wallLine = { text: byline.textContent, style: btn.querySelector('span').getAttribute('style') };
  } finally { await r.done(); }
  r = await render(React.createElement(STORY.BSWallStoryHead, { ...props, action: React.createElement('button', { 'aria-label': 'Edit activity' }, '✎') }));
  try {
    const byline = r.host.querySelector('[data-bs-wall-story-byline]');
    const author = byline.querySelector('[data-bs-wall-story-author]');
    assert.ok(author && author.querySelector('[data-face]'), 'the face and the name are drawn');
    assert.deepEqual([...byline.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')), ['Edit activity'], 'the name is a button to nowhere');
    assert.equal(byline.textContent, `${wallLine.text}✎`, 'the line reads as the Wall\'s');
    assert.equal(author.querySelector('span').getAttribute('style'), wallLine.style, 'the line is set as the Wall\'s');
  } finally { await r.done(); }
});
