// tests/cover-position.test.mjs
//
// The cover photo, dragged into place (owner, 2026-11-11: "create option to drag this image around for
// background image so i can adjust positioning", then "make sure these edits and changes actually work").
//
// `look.pos` ({ x, y }, whole percents) is the photo's CSS object-position. The website's editor
// (livingDesktop.jsx ProfileCustomizer, Appearance) sets it by dragging the photo or with the arrow keys, and
// writes the nearest of the app's three stops (`focus`) beside it, so a build that reads only `focus` still
// crops near it. Every surface that draws the cover reads it through bsLookPosition: the member's hero and the
// coach's stage on the website, the member's hero and the coach's page in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as profileLib from '../public/newdesign/profileCustom.mjs';
import * as listingLib from '../public/newdesign/listingMedia.mjs';
import * as kit from '../public/newdesign/coachProfileKit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const { JSDOM } = require('jsdom');
const { parse } = require('@babel/parser');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/MemberProfile.html' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.React = React;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = require('react-dom/client');

const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
const shared = await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` });
Object.assign(globalThis, shared, { SignalSigil: () => null, TerrainContours: () => null, TerrainRidge: () => null });
globalThis.ReactDOM = require('react-dom');
window.ShapeProfileLib = profileLib;
window.ShapeCoachKit = kit;
const { ProfileCustomizer, DesktopHero } = await loadRealModule(join(ROOT, 'public/newdesign/livingDesktop.jsx'), { appendExports: 'Object.assign(exports, { ProfileCustomizer, DesktopHero });' });

const HOST = listingLib.BS_SUPABASE_HOST;
const COVER = `https://${HOST}/storage/v1/object/public/community-photos/u1/wall.jpg`;

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
}
const click = (el) => React.act(async () => { el.click(); });
const tab = (name) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === name);
const button = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const frame = () => document.querySelector('[data-dk-cover-frame]');
const photo = () => frame().querySelector('img');
function backend() {
  const writes = [];
  // The save reads the doc as stored first (it merges onto it): here, the doc the editor opened with.
  window.shapeDb = { getUserGoals: async (kind) => (kind === 'profile_custom' ? JSON.parse(JSON.stringify(opened)) : null),
    // The profile doc is written compare-and-set on its rev (profileCustom.mjs bsProfileCustomWrite).
    saveUserGoalsIfRev: async (kind, data) => { writes.push({ user_id: 'u1', kind, data }); return { ok: true }; },
    client: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ upsert: async (row) => { writes.push(row); return {}; } }) } };
  return writes;
}
let opened = {};
const editor = (props) => { opened = (props && props.initial) || {}; return React.createElement(ProfileCustomizer, { initial: {}, c: '#0ac5a8', coach: true, ownerUid: 'u1', onClose() {}, onSave() {}, ...props }); };

// A 480×200 frame over a 1600×1000 photo: drawn 480×300, so 100px of it hangs below the frame and none to the
// side. A drag of 50px up shows 50 of those 100px: the photo's position moves half of the way down.
function size(w = 480, h = 200, nw = 1600, nh = 1000) {
  for (const [k, v] of [['clientWidth', w], ['clientHeight', h]]) Object.defineProperty(frame(), k, { value: v, configurable: true });
  for (const [k, v] of [['naturalWidth', nw], ['naturalHeight', nh]]) Object.defineProperty(photo(), k, { value: v, configurable: true });
}
async function drag(dx, dy) {
  const f = frame();
  const ev = (type, x, y) => { const e = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); f.dispatchEvent(e); };
  await React.act(async () => { ev('pointerdown', 200, 100); });
  await React.act(async () => { ev('pointermove', 200 + dx / 2, 100 + dy / 2); });
  await React.act(async () => { ev('pointermove', 200 + dx, 100 + dy); });
  await React.act(async () => { ev('pointerup', 200 + dx, 100 + dy); });
}
const key = (k, shiftKey = false) => React.act(async () => { frame().dispatchEvent(new window.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })); });

test('the library keeps a dragged spot, whole percents in 0-100, and finds the nearest stop', () => {
  assert.deepEqual(profileLib.bsLookPos({ x: 12.4, y: 87.6 }), { x: 12, y: 88 });
  assert.deepEqual(profileLib.bsLookPos({ x: -20, y: 140 }), { x: 0, y: 100 });
  for (const bad of [null, [], { x: 'a', y: 2 }, { x: 5 }, 'top']) assert.equal(profileLib.bsLookPos(bad), null);
  assert.deepEqual([10, 35, 36, 50, 65, 66, 90].map((y) => profileLib.bsLookFocusOf({ x: 50, y })), ['top', 'top', 'center', 'center', 'center', 'bottom', 'bottom']);
  assert.equal(profileLib.bsLookPosition({ focus: 'top', pos: { x: 30, y: 70 } }), '30% 70%', 'the dragged spot loses to the stop');
  assert.equal(profileLib.bsLookPosition({ focus: 'top' }, { top: 'center 18%', center: 'c' }), 'center 18%', 'a surface\'s own stops are ignored');
  assert.equal(profileLib.bsLookPosition(null, { center: 'center 40%' }), 'center 40%');
  // The save's normalizer keeps it, and a look of only a spot is a look.
  assert.deepEqual(profileLib.bsProfileLook({ pos: { x: 20, y: 30 } }), { pos: { x: 20, y: 30 } });
  assert.deepEqual(profileLib.bsProfileLook({ paper: 'bone', pos: { x: 'no' } }), { paper: 'bone' });
  assert.deepEqual(kit.bsLookPosition, profileLib.bsLookPosition, 'the coach page\'s kit does not carry the reader');
});

test('dragging the cover in Edit profile moves the photo with the pointer and saves the spot with its stop', async () => {
  const writes = backend();
  let saved = null;
  await mount(editor({ initial: { cover: { image: COVER }, look: { paper: 'bone', accent: 'rust', focus: 'top' } }, onSave: (d) => { saved = d; } }));
  await click(tab('Appearance'));
  assert.ok(frame(), 'no cover frame in Appearance');
  assert.match(frame().textContent, /Drag to position/);
  // It opens at the look's stop: top is 22% down.
  assert.equal(photo().style.objectPosition, '50% 22%');
  assert.equal(button('Reset'), undefined, 'a Reset with nothing dragged');
  size();
  await drag(0, -50);
  assert.equal(photo().style.objectPosition, '50% 72%', 'a 50px drag up did not show 50 of the 100 hidden px');
  // No overhang across: a sideways drag leaves x where it was.
  await drag(-200, 0);
  assert.equal(photo().style.objectPosition, '50% 72%');
  await click(button('Save profile'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data.look, { paper: 'bone', accent: 'rust', focus: 'bottom', pos: { x: 50, y: 72 } }, 'the spot, its stop, or the colours were lost');
  assert.deepEqual(saved.look, writes[0].data.look);
});

test('the arrow keys move it too, Reset puts it back on its stop, and Remove clears it', async () => {
  let writes = backend();
  await mount(editor({ initial: { cover: { image: COVER }, look: { focus: 'center', pos: { x: 40, y: 30 } } } }));
  await click(tab('Appearance'));
  assert.equal(photo().style.objectPosition, '40% 30%', 'the editor does not open on the saved spot');
  assert.equal(frame().getAttribute('role'), 'slider');
  // An arrow moves the photo the way it points: ↓ shows more of its top.
  await key('ArrowDown');
  assert.equal(photo().style.objectPosition, '40% 28%');
  await key('ArrowLeft', true);
  assert.equal(photo().style.objectPosition, '50% 28%');
  await click(button('Reset'));
  assert.equal(photo().style.objectPosition, '50% 50%', 'Reset is not the look\'s stop');
  await click(button('Save profile'));
  assert.deepEqual(writes[0].data.look, { focus: 'center' }, 'Reset kept the spot');

  writes = backend();
  await mount(editor({ initial: { cover: { image: COVER }, look: { pos: { x: 40, y: 30 }, focus: 'top' } } }));
  await click(tab('Appearance'));
  await click(button('Remove'));
  assert.ok(!frame().querySelector('img'), 'the removed cover is still shown');
  await click(button('Save profile'));
  assert.equal(writes[0].data.cover, null);
  assert.deepEqual(writes[0].data.look, { focus: 'top' }, 'a removed cover left its spot behind');
});

test('a cover uploaded here starts centred, whatever stop the old one had (Codex, #2704)', async () => {
  const writes = backend();
  const NEW = `https://${HOST}/storage/v1/object/public/community-photos/u1/cover-1.jpg`;
  window.shapeDb.client.storage = { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: NEW } }) }) };
  await mount(editor({ initial: { cover: { image: COVER }, look: { focus: 'top', pos: { x: 20, y: 10 } } } }));
  await click(tab('Appearance'));
  const input = document.querySelector('[data-dk-cover-file]');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'new.jpg', { type: 'image/jpeg' })], configurable: true });
  await React.act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  assert.ok(photo().getAttribute('src') === NEW, 'the new cover is not shown');
  assert.equal(photo().style.objectPosition, '50% 50%', 'the new cover took the old stop');
  await click(button('Save profile'));
  assert.deepEqual(writes[0].data.look, { focus: 'center' }, 'the new cover kept the old crop');
});

test('an untouched cover saves the look as it was', async () => {
  for (const look of [undefined, { focus: 'bottom' }, { paper: 'plum', focus: 'top', pos: { x: 10, y: 90 } }]) {
    const writes = backend();
    await mount(editor({ initial: { cover: { image: COVER }, ...(look ? { look } : {}) } }));
    await click(tab('Appearance'));
    await click(button('Save profile'));
    assert.deepEqual(writes[0].data.look, look, `${JSON.stringify(look)}: the look changed with nothing dragged`);
  }
});

test('the member\'s hero on the website draws the cover at the dragged spot', async () => {
  const d = { ...shared.LV_PEOPLE.client, uid: 'u1', custom: { cover: { image: COVER }, look: { focus: 'top', pos: { x: 15, y: 64 } } } };
  await mount(React.createElement(DesktopHero, { d, direction: 'terrain', owner: false, reduced: true, onMessage() {}, onFollow() {} }));
  const img = [...document.querySelectorAll('img')].find((i) => i.getAttribute('src') === COVER);
  assert.ok(img, 'no cover');
  assert.equal(img.style.objectPosition, '15% 64%');
  await mount(React.createElement(DesktopHero, { d: { ...d, custom: { ...d.custom, look: { focus: 'top' } } }, direction: 'terrain', owner: false, reduced: true, onMessage() {}, onFollow() {} }));
  assert.equal([...document.querySelectorAll('img')].find((i) => i.getAttribute('src') === COVER).style.objectPosition, 'center 22%', 'the stop is gone without a spot');
});

test('the coach\'s stage and the app\'s two covers read the spot through bsLookPosition', () => {
  assert.match(read('public/newdesign/coachProfileWeb.jsx'), /objectPosition: \(K\.bsLookPosition \? K\.bsLookPosition\(look, CPW_FOCUS\)/, "the coach's stage ignores the dragged spot");
  assert.match(read('mobile-app/src/broadsheet/BSTrainerProfile.jsx'), /focus=\{bsLookPosition\(look, FOCUS_POS\)\}/, "the app's coach page ignores the dragged spot");
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), /objectPosition: bsLookPosition\(look, BS_MEMBER_FOCUS\)/, "the app's member hero ignores the dragged spot");
  for (const f of ['mobile-app/src/services/profileCustom.mjs']) assert.match(read(f), /bsLookPosition/, `${f} does not re-export the reader`);
});
