// A member's profile in their own colours (owner, 2026-11-04: members get the colours page coaches just got,
// "Both", then "this should apply to website as well"). The look is profile_custom.look, { paper, accent, focus },
// public through get_public_profile like the rest of the doc.
//
// What holds, driven through the real client module (the shared harness):
//   · once the member has picked a paper, the page is in it: BSTerrainProfile hands the look's theme
//     (bsLookTheme, the chrome's) to all it holds through BSContext, and its own ink is the look's;
//   · with no paper picked the page is the reader's theme, the very object it was handed, never a default;
//   · a visitor reads the public read's look; the owner their own doc, and the public read's until it is read;
//   · the look's accent tints what the old hex accent tinted (BSProfileExtras), the hex accent a fallback only;
//   · the cover photo keeps what the look's focus keeps in view.
// The theme bsLookTheme builds is held to BSProvider's own in tests/member-look-theme.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, SHIM, THEME } from './helpers/broadsheet-mount.mjs';
import { BS_SUPABASE_HOST } from '../mobile-app/src/services/listingMedia.mjs';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSProfileExtras']);
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const at = (bucket, owner, file) => `https://${BS_SUPABASE_HOST}/storage/v1/object/public/${bucket}/${owner}/${file}`;

// The chrome's context, as a marker the shallow tree can be read through: the page's root.
function BSContextProvider({ children }) { return children; }
globalThis.window.BSContext = { Provider: BSContextProvider };
// The chrome's bsLookTheme and makePalette, in miniature (the real pair is held to BSProvider in
// member-look-theme.test.mjs): the look's paper and accent over the reader's other settings.
const PAPERS = { bone: { PAPER: '#ece4d3', INK: '#1a160e', isLight: true }, plum: { PAPER: '#251630', INK: '#ebdff2', isLight: false } };
const ACCENTS = { rust: ['#a8331b', '#e06547'], violet: ['#6d3fc4', '#a78bfa'] };
const paletteOf = ({ paperMode, accentKey }) => {
  const P = PAPERS[paperMode] || { PAPER: '#0f0e0c', INK: '#f5f0e6', isLight: false };
  return { ...P, PAPER_BG: P.PAPER, PAPER2: P.PAPER, paperMode, accentKey, ACCENT: (ACCENTS[accentKey] || ['#0a8f87', '#34d6c5'])[P.isLight ? 0 : 1] };
};
const looked = [];
globalThis.window.makePalette = paletteOf;
globalThis.window.bsLookTheme = (outer, { paper, accent }) => {
  looked.push(outer);
  const P = paletteOf({ paperMode: paper, accentKey: accent || outer.accentKey });
  return new Proxy(P, { get: (t, k) => (k in t ? t[k] : outer[k]), has: () => true });
};

function signIn(uid) {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
}
// The harness keeps effects off. The two a visitor's doc arrives by are the public-profile read and the line
// that copies its `custom` into state (as tests/profile-cover-app.test.mjs runs them).
const READS = /getPublicProfile|live\.custom/;
function withProfileReads(fn) {
  const real = SHIM.useEffect;
  SHIM.useEffect = function (effect, deps) {
    const seen = SHIM.useRef(undefined);
    if (!READS.test(String(effect))) return;
    const prev = seen.current;
    if (prev && deps && deps.length === prev.length && deps.every((x, i) => Object.is(x, prev[i]))) return;
    seen.current = deps || [];
    effect();
  };
  try { return fn(); } finally { SHIM.useEffect = real; }
}
function served(person, doc) {
  globalThis.window.ShapeProfiles = {
    getPublicProfile: (id) => ({ then: (cb) => { cb(id === person.userId ? { can_view: true, custom: doc } : null); return { catch() {} }; } }),
  };
}
function visit(person, doc, props = {}) {
  served(person, doc);
  return withProfileReads(() => {
    const d = drive(mod.BSTerrainProfile, { person, onBack() {}, onMessage() {}, ...props });
    d.render(); d.render();
    return d;
  });
}
const rootOf = (d) => d.nodes()[0];
const pageInk = (d) => d.nodes().find((n) => n.type === 'div' && n.props.style && n.props.style.minHeight === '100%').props.style.color;
const coverImg = (d) => d.nodes().find((n) => n.type === 'img' && n.props.style && n.props.style.objectFit === 'cover' && n.props.style.position === 'absolute');

const PRIYA = { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' };

test('a visitor sees a member who picked a paper in that paper and accent, all the page holds included', () => {
  signIn('u-viewer');
  const d = visit(PRIYA, { look: { paper: 'bone', accent: 'rust' } });
  const root = rootOf(d);
  assert.equal(root.type, BSContextProvider, 'the page is not handed on through BSContext');
  assert.equal(root.props.value.paperMode, 'bone');
  assert.equal(root.props.value.ACCENT, '#a8331b', 'the accent is not the look\'s, as it reads on Bone');
  // The reader's other settings ride under the look (the units, the density).
  assert.equal(root.props.value.uMeasure, THEME.uMeasure);
  assert.equal(root.props.value.padX, THEME.padX);
  assert.equal(pageInk(d), '#1a160e', 'the page\'s own ink is not Bone\'s');
  const extras = d.nodes().find(named('BSProfileExtras'));
  assert.equal(extras.props.INK, '#1a160e');
});

test('a member who never picked keeps their page exactly as it was: the reader\'s own theme, never a default', () => {
  signIn('u-viewer');
  for (const doc of [{}, { look: null }, { look: { focus: 'top' } }, { look: { accent: 'rust' } }, { look: { paper: 'parchment' } }, { accent: '#8a5cf6' }]) {
    looked.length = 0;
    const d = visit(PRIYA, doc);
    const root = rootOf(d);
    assert.equal(root.type, BSContextProvider);
    assert.equal(root.props.value, THEME, `${JSON.stringify(doc)}: the page is not in the reader's theme`);
    assert.equal(looked.length, 0, `${JSON.stringify(doc)}: a look theme was built with no paper`);
    assert.equal(pageInk(d), THEME.INK);
  }
  // The signed-out preview persona too: its demo doc picks no paper.
  signIn(null);
  const demo = drive(mod.BSTerrainProfile, { person: { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' }, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  assert.equal(rootOf(demo).props.value, THEME);
});

test('your own page: the public read\'s look until your own doc is read, then your doc\'s', () => {
  signIn('u-me');
  const me = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH', userId: 'u-me' };
  // Every render runs under the reads (their hook slots stay in place render to render).
  served(me, { look: { paper: 'bone', accent: 'rust' } });
  withProfileReads(() => {
    const d = drive(mod.BSTerrainProfile, { person: me, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
    d.render(); d.render();
    assert.equal(rootOf(d).props.value.paperMode, 'bone', 'while your doc loads, the page is not in the look members see');
    // Your doc arrives (here through the editor's save, as the app's own read sets it): it wins.
    const edit = d.nodes().find((n) => n.type === 'button' && /^Edit (public )?profile$/.test(String(n.props['aria-label'] || '')));
    edit.props.onClick();
    d.render();
    d.nodes().find(named('BSProfileCustomizer')).props.onSave({ look: { paper: 'plum', accent: 'violet' } });
    d.render();
    assert.equal(rootOf(d).props.value.paperMode, 'plum');
    assert.equal(rootOf(d).props.value.ACCENT, '#a78bfa');
    assert.equal(pageInk(d), '#ebdff2');
    // And a doc with no paper puts the page back in your own theme.
    const edit2 = d.nodes().find((n) => n.type === 'button' && /^Edit (public )?profile$/.test(String(n.props['aria-label'] || '')));
    edit2.props.onClick(); d.render();
    d.nodes().find(named('BSProfileCustomizer')).props.onSave({ bio: 'no look' });
    d.render();
    assert.equal(rootOf(d).props.value, THEME);
  });
});

test('the cover keeps what the look\'s focus keeps in view, and the member page\'s own middle without one', () => {
  signIn('u-viewer');
  const image = at('community-photos', PRIYA.userId, 'cover.jpg');
  const pos = (doc) => coverImg(visit(PRIYA, { cover: { image }, ...doc })).props.style.objectPosition;
  assert.equal(pos({}), 'center 40%', 'a cover with no focus moved');
  assert.equal(pos({ look: { focus: 'top' } }), 'center 22%');
  assert.equal(pos({ look: { focus: 'bottom', paper: 'bone', accent: 'rust' } }), 'center 80%');
  assert.equal(pos({ look: { focus: 'center' } }), 'center 40%');
});

test('the look\'s accent tints what the hex accent tinted; the hex accent is the fallback, then the tier\'s', () => {
  const pinOf = (custom) => {
    const d = drive(mod.BSProfileExtras, { custom: { pinned: { kind: 'win', title: 'First race' }, ...custom }, c: '#c0533b', INK: '#111', BG: '#fff', isSelf: false, ledger: true });
    return d.nodes().find((n) => n.props && n.props.style && /^3px solid /.test(String(n.props.style.borderLeft || ''))).props.style.borderLeft;
  };
  assert.equal(pinOf({ look: { paper: 'bone', accent: 'rust' }, accent: '#8a5cf6' }), '3px solid #a8331b', 'the look accent did not win over the old hex');
  // An accent with no paper of its own reads as it does on the paper the page is in (the reader's here).
  assert.equal(pinOf({ look: { accent: 'violet' } }), `3px solid ${paletteOf({ paperMode: THEME.paperMode, accentKey: 'violet' }).ACCENT}`);
  assert.equal(pinOf({ accent: '#8a5cf6' }), '3px solid #8a5cf6', 'the old hex accent is no longer the fallback');
  assert.equal(pinOf({}), '3px solid #c0533b', 'without either, the tier\'s colour');
});

// The climb background (profile_custom.climbBg, picked in Customize or the website's Edit profile) was painted on
// no member page. It is the kit's wash over the page's paper, behind the whole page (BSPage's backdrop).
test('a member page lays the climb background picked behind the page, over its paper; none is the paper', () => {
  signIn('u-viewer');
  const pageOf = (d) => d.nodes().find((n) => n && n.props && 'backdrop' in n.props && n.props.children);
  const d = visit(PRIYA, { climbBg: 'dusk', look: { paper: 'bone', accent: 'rust' } });
  const back = pageOf(d).props.backdrop;
  assert.ok(back, 'the climb background is painted nowhere');
  assert.equal(back.props['data-member-climb-bg'], 'dusk');
  assert.ok(back.props.style.background.startsWith('linear-gradient(165deg, rgba(138,92,246,0.30)'), back.props.style.background);
  assert.ok(back.props.style.background.endsWith(`, ${rootOf(d).props.value.PAPER_BG}`), 'the wash is not over the page\'s paper');
  for (const doc of [{}, { climbBg: '' }, { climbBg: 'neon' }, { look: { paper: 'bone' } }]) {
    assert.equal(pageOf(visit(PRIYA, doc)).props.backdrop, null, `${JSON.stringify(doc)}: a wash was laid`);
  }
});
