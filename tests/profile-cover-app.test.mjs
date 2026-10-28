// The profile cover photo in the app's older profiles (the Terrain member profile and the Signal
// coach profile) and their old editor.
//
// `profile_custom.cover.image` sits in the doc get_public_profile serves whole, and its owner can
// write any value into it directly. Rendered as it stands, a profile could make every visitor's
// device load an image from any host: a tracking pixel that logs each visitor's IP, say. Codex
// raised it as a P1 on #2484 for the new trainer profile, which fixed it there; these two heroes
// still drew the raw value. They now draw it only through bsProfileCover, bound to the owner of
// the profile being shown, and the signed-out preview persona's demo cover comes from constants on
// a path only that persona takes.
//
// Every case here mounts the real client module through the shared harness and drives the real
// component: a doc reaches a profile the way it does in the app, through the public-profile read
// for a visitor and through the editor's save for the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, flatten, textOf, SHIM } from './helpers/broadsheet-mount.mjs';
import { BS_SUPABASE_HOST } from '../mobile-app/src/services/listingMedia.mjs';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSSignalCoachProfile', 'BSProfileCustomizer']);
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const at = (bucket, owner, file) => `https://${BS_SUPABASE_HOST}/storage/v1/object/public/${bucket}/${owner}/${file}`;
const OUTSIDE = 'https://tracker.example/pixel.gif';

// Every image the profile paints, by <img> or by a CSS background, as strings.
function painted(d) {
  const out = [];
  for (const n of d.nodes()) {
    if (typeof n.props.src === 'string') out.push(n.props.src);
    const st = n.props.style;
    if (st && typeof st === 'object') for (const v of Object.values(st)) if (typeof v === 'string' && /url\(/.test(v)) out.push(v);
  }
  return out;
}
const paints = (d, url) => painted(d).some((s) => s.includes(url));

function signIn(uid) {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
}

// The harness keeps effects off (the real ones start timers and reach for browser APIs). The two a
// visitor's doc arrives by are the public-profile read and the line that copies its `custom` into
// state; only those run here, each once per change of its deps, with the read answering at once.
const READS = /getPublicProfile|live\.custom/;
function withProfileReads(fn) {
  const real = SHIM.useEffect;
  SHIM.useEffect = function (effect, deps) {
    const seen = SHIM.useRef(undefined);   // a hook slot on every render, so the order never shifts
    if (!READS.test(String(effect))) return;
    const prev = seen.current;
    if (prev && deps && deps.length === prev.length && deps.every((x, i) => Object.is(x, prev[i]))) return;
    seen.current = deps || [];
    effect();
  };
  try { return fn(); } finally { SHIM.useEffect = real; }
}

// A visitor opens someone else's profile: the doc comes from get_public_profile.
function visit(Component, person, doc, viewer = 'u-viewer') {
  signIn(viewer);
  globalThis.window.ShapeProfiles = {
    getPublicProfile: (id) => ({ then: (cb) => { cb(id === person.userId ? { can_view: true, custom: doc } : null); return { catch() {} }; } }),
  };
  return withProfileReads(() => {
    const d = drive(Component, { person, onBack() {}, onMessage() {} });
    d.render(); d.render();   // the read lands, then its custom is copied into state
    return d;
  });
}

// The owner on their own Me tab: the doc is the one the editor just saved.
function own(Component, person, doc, me) {
  signIn(me);
  delete globalThis.window.ShapeProfiles;
  const d = drive(Component, { person, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  const edit = d.nodes().find((n) => n.type === 'button' && /^Edit (public )?profile$/.test(String(n.props['aria-label'] || '')));
  assert.ok(edit, 'the Me tab has no edit button to open the editor');
  edit.props.onClick();
  d.render();
  const editor = d.nodes().find(named('BSProfileCustomizer'));
  assert.ok(editor, 'the editor did not open');
  editor.props.onSave(doc);
  d.render();
  return d;
}

// The doc did reach the profile (so a missing cover is the guard's doing, not a doc that never
// arrived): the profile hands it on to its extras block.
function reached(d, doc) {
  const ex = d.nodes().find(named('BSProfileExtras'));
  return !!ex && ex.props.custom === doc;
}

const MEMBER = { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' };
const COACH = { who: 'Maya Okafor', kind: 'TRAINER', tier: 'ELITE', init: 'MO', userId: 'u-maya' };
const NUTRI = { who: 'Rae Lindqvist', kind: 'NUTRI', tier: 'ELITE', init: 'RL' };

for (const [label, Component, person, bucket] of [
  ['member profile (Terrain hero)', 'BSTerrainProfile', MEMBER, 'community-photos'],
  ['coach profile (Signal hero)', 'BSSignalCoachProfile', COACH, 'coach-media'],
]) {
  test(`${label}: a visitor sees the cover only when it is the owner's own image`, () => {
    const C = mod[Component];
    const owner = person.userId;
    const cases = [
      [OUTSIDE, false, 'an outside URL'],
      [at('community-photos', 'u-someone-else', 'wall.jpg'), false, 'another member\'s folder'],
      [at('community-photos', 'u-viewer', 'wall.jpg'), false, 'the VIEWER\'s own folder: the guard is bound to the profile\'s owner'],
      [at('community-photos', owner, 'wall.svg'), false, 'an extension the guard does not keep'],
      [at('meal-notes', owner, 'wall.jpg'), false, 'another bucket'],
      [at('community-photos', owner, 'wall.jpg'), true, 'an upload in the owner\'s own folder'],
      [at(bucket, owner, 'gym.webp'), true, `the owner's own ${bucket} image`],
    ];
    for (const [image, shows, why] of cases) {
      const doc = { cover: { image } };
      const d = visit(C, person, doc);
      assert.ok(reached(d, doc), `${why}: the visitor's read never reached the profile`);
      assert.equal(paints(d, image), shows, `${why}: ${shows ? 'no cover' : 'the cover loaded'}`);
    }
  });

  test(`${label}: the owner's own page holds the same line, bound to the signed-in owner`, () => {
    const C = mod[Component];
    const mine = at('community-photos', 'u-me', 'cover.jpg');
    // Signed in, on one's own Me tab with no userId on the person: the owner is the account.
    const ok = own(C, { ...person, userId: undefined }, { cover: { image: mine } }, 'u-me');
    assert.equal(paints(ok, mine), true, 'the owner\'s own upload does not show on their own page');
    const outside = own(C, { ...person, userId: undefined }, { cover: { image: OUTSIDE } }, 'u-me');
    assert.equal(paints(outside, OUTSIDE), false, 'an outside URL shows on the owner\'s own page');
  });
}

test('the preview persona still shows its demo cover, and only the persona does', () => {
  // Signed out with no account behind the page: the developer-authored demo.
  signIn(null);
  const member = drive(mod.BSTerrainProfile, { person: { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' }, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  assert.equal(paints(member, '/m/demo/wall-03.webp'), true, 'the member preview lost its demo cover');
  const coach = drive(mod.BSSignalCoachProfile, { person: { ...COACH, userId: undefined }, onBack() {}, onMessage() {} });
  assert.equal(paints(coach, '/m/demo/studio-01.webp'), true, 'the trainer preview lost its demo cover');
  const nutri = drive(mod.BSSignalCoachProfile, { person: NUTRI, onBack() {}, onMessage() {} });
  assert.equal(paints(nutri, '/m/demo/box-cover.webp'), true, 'the nutritionist preview lost its demo cover');

  // A real profile is never the persona, even signed out: its doc takes the guard.
  const real = visit(mod.BSTerrainProfile, MEMBER, { cover: { image: OUTSIDE } }, null);
  assert.equal(paints(real, OUTSIDE), false, 'a signed-out visitor loads an outside cover');
  assert.equal(paints(real, '/m/demo/'), false, 'a real profile shows a demo cover');

  // A doc on a page with no owner (signed out, no userId) is no longer the persona either: it gets
  // neither its own cover, which has no owner to belong to, nor the demo one.
  for (const [C, person] of [[mod.BSTerrainProfile, { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' }], [mod.BSSignalCoachProfile, { ...COACH, userId: undefined }]]) {
    for (const image of [OUTSIDE, '/m/demo/wall-03.webp', at('community-photos', 'u-x', 'a.jpg')]) {
      const d = own(C, person, { cover: { image } }, null);
      assert.deepEqual(painted(d).filter((s) => s.includes(image) || s.includes('/m/demo/')), [], `${C.name}: ${image} drew a cover with no owner`);
    }
  }
});

// ── The old editor's cover upload ──────────────────────────────────────────────
// It uploads through ShapeCommunity.uploadPhoto, which names the object by the file's MIME type. A
// type outside the guard's allowlist was stored and then never shown; now it is refused first.
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};

// The file input in the box that holds the "Upload cover" button.
function coverInput(d) {
  const boxes = d.nodes().filter((n) => {
    if (n.type !== 'div') return false;
    const inner = flatten(n.props.children);
    return inner.some((c) => c.type === 'button' && textOf(c).trim() === 'Upload cover') && inner.some((c) => c.type === 'input' && c.props.type === 'file');
  });
  boxes.sort((a, b) => flatten(a.props.children).length - flatten(b.props.children).length);
  assert.ok(boxes.length, 'the editor has no cover box');
  return flatten(boxes[0].props.children).find((c) => c.type === 'input' && c.props.type === 'file');
}

test('the old editor uploads a cover only in a type the guard keeps (jpg, jpeg, png, webp, gif, heic, heif)', async () => {
  for (const coach of [false, true]) {
    const uploads = [];
    const toasts = [];
    globalThis.window.ShapeCommunity = { uploadPhoto: async (file) => { uploads.push(file.type); return at('community-photos', 'u-me', 'x.' + file.type.split('/')[1]); } };
    globalThis.window.__bsToast = (msg, kind) => toasts.push(kind);
    const d = withSurface(() => drive(mod.BSProfileCustomizer, { initial: {}, c: '#c9a227', INK: '#111', BG: '#fff', onClose() {}, onSave() {}, coach }));
    const input = coverInput(d);
    const pick = async (type) => input.props.onChange({ target: { files: [{ type, name: 'photo' }], value: 'C:\\fakepath\\photo' } });
    for (const type of ['image/svg+xml', 'image/avif', 'image/bmp', 'image/pjpeg', 'video/mp4', 'text/html', '']) await pick(type);
    assert.deepEqual(uploads, [], `${coach ? 'coach' : 'member'}: a type the guard drops was uploaded`);
    assert.equal(toasts.length, 7, 'each refused file says so');
    assert.ok(toasts.every((k) => k === 'err'));
    for (const type of ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'IMAGE/PNG']) await pick(type);
    assert.deepEqual(uploads, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'IMAGE/PNG'], 'an image the guard keeps was refused');
  }
  delete globalThis.window.ShapeCommunity;
  delete globalThis.window.__bsToast;
});
