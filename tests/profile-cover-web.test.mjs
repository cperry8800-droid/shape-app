// The profile cover photo on the website: the living profile's hero, its editor's cover upload,
// and the marketplace's coach card.
//
// `profile_custom.cover.image` sits in the doc get_public_profile serves whole, and its owner can
// write any value into it directly. Rendered as it stands, a profile could make every visitor's
// browser load an image from any host: a tracking pixel that logs each visitor's IP, say (Codex P1
// on #2484, fixed there for the app's new trainer profile only). The hero now draws it only
// through bsProfileCover (window.ShapeProfileLib), bound to the profile's owner (d.uid); the
// editor refuses a cover in a type the guard would drop; and the marketplace card reads only its
// guarded listing cover or a demo constant, never the profile's cover.
//
// Each surface is mounted from its shipping file: the hero and the editor in jsdom with real
// React, the card rendered to markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as profileLib from '../public/newdesign/profileCustom.mjs';
import * as listingLib from '../public/newdesign/listingMedia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { parse } = require('@babel/parser');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/MemberProfile.html' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.React = React;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = require('react-dom/client');

const HOST = listingLib.BS_SUPABASE_HOST;
const at = (bucket, owner, file) => `https://${HOST}/storage/v1/object/public/${bucket}/${owner}/${file}`;
const OUTSIDE = 'https://tracker.example/pixel.gif';

// livingShared.jsx is a classic browser script: livingDesktop.jsx reads its top-level names as
// globals. Export every one of them, so the desktop module meets the real ones.
const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
const shared = await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` });
Object.assign(globalThis, shared, {
  // Drawn by livingSignal.jsx / livingTerrain.jsx on the page; the hero's cover does not read them.
  SignalSigil: () => null, TerrainContours: () => null, TerrainRidge: () => null,
});
const { DesktopHero, ProfileCustomizer } = await loadRealModule(join(ROOT, 'public/newdesign/livingDesktop.jsx'), { appendExports: 'Object.assign(exports, { DesktopHero, ProfileCustomizer });' });

// marketplace.jsx is a classic page script: it reads pageShell's tokens as globals and mounts the
// page into #root as it loads. The tokens are plain strings here; the mount is a no-op.
Object.assign(globalThis, { PAPER: '#1a1612', INK: '#f2ede4', TEAL: '#0ac5a8', RUST: '#d2693f', serif: 'serif', sans: 'sans-serif', mono: 'monospace' });
globalThis.ReactDOM = { createRoot: () => ({ render() {} }) };
const mk = await loadRealModule(join(ROOT, 'public/newdesign/marketplace.jsx'), { appendExports: 'Object.assign(exports, { mapLiveCoach, CoachCard, Spotlight, COACHES_FULL });' });
// The editor portals its dialog through the real one.
globalThis.ReactDOM = require('react-dom');

async function mount(el) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  return { unmount: () => React.act(async () => root.unmount()) };
}
// renderToStaticMarkup escapes & in attributes.
const inMarkup = (html, url) => html.includes(url.replace(/&/g, '&amp;'));
const imgSrcs = () => [...document.querySelectorAll('img')].map((i) => i.getAttribute('src'));

// ── The living profile's hero ─────────────────────────────────────────────────
for (const [persona, direction, bucket] of [['client', 'terrain', 'community-photos'], ['trainer', 'signal', 'coach-media']]) {
  test(`the website hero (${persona}, ${direction}) draws the cover only when it is the owner's own image`, async () => {
    window.ShapeProfileLib = profileLib;
    const owner = 'u-owner';
    const cases = [
      [OUTSIDE, false, 'an outside URL'],
      [at('community-photos', 'u-someone-else', 'wall.jpg'), false, 'another member\'s folder'],
      [at('community-photos', owner, 'wall.svg'), false, 'an extension the guard does not keep'],
      [at('meal-notes', owner, 'wall.jpg'), false, 'another bucket'],
      [at('community-photos', owner, 'wall.jpg'), true, 'an upload in the owner\'s own folder'],
      [at(bucket, owner, 'gym.webp'), true, `the owner's own ${bucket} image`],
    ];
    for (const [image, shows, why] of cases) {
      const d = { ...shared.LV_PEOPLE[persona], uid: owner, custom: { cover: { image } } };
      const m = await mount(React.createElement(DesktopHero, { d, direction, owner: false, reduced: true, onMessage() {}, onFollow() {} }));
      assert.equal(imgSrcs().includes(image), shows, `${why}: ${shows ? 'no cover' : 'the cover loaded'}`);
      await m.unmount();
    }
    // Bound to the profile's owner: the same own-folder image on a page with no owner, or on
    // another owner's page, is no cover.
    for (const uid of [null, 'u-viewer']) {
      const image = at('community-photos', owner, 'wall.jpg');
      const m = await mount(React.createElement(DesktopHero, { d: { ...shared.LV_PEOPLE[persona], uid, custom: { cover: { image } } }, direction, owner: false, reduced: true, onMessage() {}, onFollow() {} }));
      assert.equal(imgSrcs().includes(image), false, `the cover showed on a page owned by ${uid}`);
      await m.unmount();
    }
  });
}

test('the website hero fails closed while the guard has not loaded', async () => {
  delete window.ShapeProfileLib;
  const image = at('community-photos', 'u-owner', 'wall.jpg');
  const m = await mount(React.createElement(DesktopHero, { d: { ...shared.LV_PEOPLE.trainer, uid: 'u-owner', custom: { cover: { image } } }, direction: 'signal', owner: false, reduced: true, onMessage() {}, onFollow() {} }));
  assert.equal(imgSrcs().includes(image), false, 'a cover drawn with no guard to check it');
  await m.unmount();
  window.ShapeProfileLib = profileLib;
});

// ── The website editor's cover upload ─────────────────────────────────────────
test('the website editor uploads a cover only in a type the guard keeps, named by that type', async () => {
  window.ShapeProfileLib = profileLib;
  const uploads = [];
  const alerts = [];
  // The page calls the bare global, as a browser script does.
  globalThis.alert = window.alert = (msg) => alerts.push(msg);
  window.shapeDb = { client: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    storage: { from: (bucket) => ({
      upload: async (path) => { uploads.push(`${bucket}/${path}`); return {}; },
      getPublicUrl: (path) => ({ data: { publicUrl: at(bucket, path.split('/')[0], path.split('/').slice(1).join('/')) } }),
    }) },
  } };
  const m = await mount(React.createElement(ProfileCustomizer, { initial: {}, c: '#2ee0c4', coach: false, ownerUid: 'u1', onClose() {}, onSave() {} }));
  const label = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Cover image');
  assert.ok(label, 'the editor has no Cover image section');
  const input = label.parentElement.querySelector('input[type="file"]');
  assert.ok(input, 'the cover section has no file input');
  const pick = async (type) => {
    Object.defineProperty(input, 'files', { value: [{ type, name: 'photo' }], configurable: true });
    await React.act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  for (const type of ['image/svg+xml', 'image/avif', 'image/bmp', 'video/mp4', '']) await pick(type);
  assert.deepEqual(uploads, [], 'a type the guard drops was uploaded');
  assert.equal(alerts.length, 5, 'each refused file says so');
  for (const type of ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']) await pick(type);
  const exts = uploads.map((p) => p.split('.').pop());
  assert.deepEqual(exts, ['jpg', 'jpg', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif'], 'an image the guard keeps was refused, or named outside its allowlist');
  assert.ok(uploads.every((p) => p.startsWith('community-photos/u1/cover-')), 'the cover left the owner\'s own folder');
  // What was uploaded is what the guard keeps, so the hero will show it.
  const last = at('community-photos', 'u1', uploads[uploads.length - 1].split('/').slice(2).join('/'));
  assert.ok(profileLib.bsProfileCover({ image: last }, 'u1'), 'the uploaded cover is one the guard drops');
  assert.equal(imgSrcs().includes(last), true, 'the editor does not preview the upload');
  await m.unmount();
  delete window.shapeDb;
});

// ── The marketplace's coach card ──────────────────────────────────────────────
const ROW = { id: 7, name: 'Tom Trainer', owner_id: 'u-coach', session_price: 120, experience: '6 years', tags: ['Strength'] };

test('the marketplace card shows a real coach\'s cover only as their own listing image, never the profile\'s', () => {
  window.ShapeListingLib = listingLib;
  const card = (c) => renderToStaticMarkup(React.createElement(mk.CoachCard, { c }));
  const cases = [
    [OUTSIDE, false, 'an outside URL'],
    [at('coach-media', 'u-other-coach', 'cover.webp'), false, 'another coach\'s folder'],
    [at('coach-media', 'u-coach', 'cover.svg'), false, 'an extension the guard does not keep'],
    [at('community-photos', 'u-coach', 'cover.jpg'), false, 'outside the listing bucket'],
    [at('coach-media', 'u-coach', 'cover.webp'), true, 'the coach\'s own listing image'],
  ];
  for (const [cover, shows, why] of cases) {
    const c = mk.mapLiveCoach({ ...ROW, listing_media: { cover, gallery: [] } }, 'Trainer');
    assert.equal(c.cover === cover, shows, `${why}: mapped cover is ${JSON.stringify(c.cover)}`);
    assert.equal(inMarkup(card(c), cover), shows, `${why}: ${shows ? 'no cover band' : 'the cover band loaded it'}`);
  }
  // The profile's own cover is not the card's: a stray profile cover on the row or on the card
  // paints nothing.
  const own = at('community-photos', 'u-coach', 'wall.jpg');
  const c = mk.mapLiveCoach({ ...ROW, listing_media: null, custom: { cover: { image: own } } }, 'Trainer');
  assert.equal(c.cover, '');
  assert.equal(inMarkup(card({ ...c, coverImage: OUTSIDE, custom: { cover: { image: OUTSIDE } } }), OUTSIDE), false, 'the card read a cover besides its own `cover`');
  // No listing guard loaded: no cover.
  delete window.ShapeListingLib;
  assert.equal(mk.mapLiveCoach({ ...ROW, listing_media: { cover: at('coach-media', 'u-coach', 'cover.webp') } }, 'Trainer').cover, '');
  window.ShapeListingLib = listingLib;
});

test('the marketplace\'s demo coaches keep their covers', () => {
  const maya = mk.COACHES_FULL.find((c) => c.name === 'Maya Okafor');
  assert.match(maya.cover, /^https:\/\/images\.unsplash\.com\//);
  assert.equal(inMarkup(renderToStaticMarkup(React.createElement(mk.CoachCard, { c: maya })), maya.cover), true, 'the demo card lost its cover');
  assert.equal(inMarkup(renderToStaticMarkup(React.createElement(mk.Spotlight, { tab: 'Trainer' })), maya.cover), true, 'the spotlight lost its cover');
});
