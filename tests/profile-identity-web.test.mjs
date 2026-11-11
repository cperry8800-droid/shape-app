// tests/profile-identity-web.test.mjs
//
// One place to edit a profile (owner, 2026-11-11). Of the dashboard's Settings → "Profile details" beside the
// profile's Edit profile: "how does this section in settings on profile dashboard differ from this one. Can one
// be removed?", answered "Merge into Edit profile"; and of the coach's empty portrait, "where do i upload my
// profile image"; then "make sure these edits and changes actually work".
//
// MOUNTED from the shipping livingDesktop.jsx (ProfileCustomizer) against an in-memory account and the real
// settingsSync.mjs:
//   · About opens with You: the photo, name, handle, location and pronouns from client_identity;
//   · only what was touched is written, through settingsSync (a name left empty stops the save before anything
//     is written); a picked photo is stored as the app stores it, a 256px JPEG data URL; Remove clears it;
//   · a save announces shape:identity, and the profile page reads again on it;
//   · a read that fails shows Try again, and the rest of the profile still saves.
// And from the source: the coach's Settings card opens Edit profile instead of a second editor, the coach page
// opens its editor on that link, shows the editor's Bio, and falls back to the listing portrait for its photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as profileLib from '../public/newdesign/profileCustom.mjs';
import * as kit from '../public/newdesign/coachProfileKit.mjs';
import * as settingsSync from '../public/newdesign/settingsSync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const { JSDOM } = require('jsdom');
const { parse } = require('@babel/parser');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html#profile' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.React = React;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
// The photo path: a file read, decoded and drawn into a 256px canvas. jsdom decodes and draws nothing, so the
// decode and the canvas stand in; what is checked is the size asked for and what gets stored.
const drawn = [];
globalThis.FileReader = window.FileReader;
// The page dispatches its own window's events; Node's Event would not reach jsdom's listeners.
globalThis.Event = window.Event;
globalThis.Image = class { set src(v) { this.width = 1200; this.height = 800; setTimeout(() => this.onload && this.onload(), 0); } };
window.HTMLCanvasElement.prototype.getContext = function () { const cv = this; return { drawImage: (img, x, y, w, h) => drawn.push({ cw: cv.width, ch: cv.height, x, y, w, h }) }; };
window.HTMLCanvasElement.prototype.toDataURL = (type, q) => `data:${type};base64,QUJD${q === 0.82 ? 'MA' : 'XX'}==`;
const { createRoot } = require('react-dom/client');

const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
const shared = await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` });
Object.assign(globalThis, shared, { SignalSigil: () => null, TerrainContours: () => null, TerrainRidge: () => null });
globalThis.ReactDOM = require('react-dom');
window.ShapeProfileLib = profileLib;
window.ShapeCoachKit = kit;
window.ShapeSettingsReady = Promise.resolve(settingsSync);
const { ProfileCustomizer } = await loadRealModule(join(ROOT, 'public/newdesign/livingDesktop.jsx'), { appendExports: 'Object.assign(exports, { ProfileCustomizer });' });

// An account in memory: the identity doc, every write, and the profile doc's upserts.
function account(identity, { failRead = false } = {}) {
  const docs = { client_identity: identity == null ? null : { ...identity } };
  const writes = [];
  const upserts = [];
  window.shapeDb = {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async (kind) => { if (failRead) return null; return kind in docs ? (docs[kind] ? { ...docs[kind] } : {}) : {}; },
    saveUserGoals: async (kind, next) => { writes.push([kind, next]); docs[kind] = { ...next }; return { ok: true }; },
    client: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ upsert: async (row) => { upserts.push(row); return {}; } }) },
  };
  return { docs, writes, upserts };
}

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const click = async (el) => { await React.act(async () => { el.click(); }); await settle(); };
const button = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const input = (k) => document.querySelector(`[data-dk-id="${k}"]`);
async function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
async function pick(file) {
  const el = document.querySelector('[data-dk-identity] input[type="file"]');
  Object.defineProperty(el, 'files', { value: [file], configurable: true });
  await React.act(async () => { el.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await settle(); await settle();
}
const editor = (props) => React.createElement(ProfileCustomizer, { initial: { bio: 'Strong is a skill.' }, c: '#0ac5a8', coach: true, ownerUid: 'u1', ownerName: 'Christopher Perry', onClose() {}, onSave() {}, ...props });

const PHOTO = 'data:image/jpeg;base64,T0xE==';
const ME = { name: 'Christopher Perry', handle: '@cperry', location: 'Brooklyn, NY', pronouns: 'he/him', photo: PHOTO, avatarMode: 'photo', goal: 'Lose fat' };

test('About opens with You: the photo, name, handle, location and pronouns the account holds', async () => {
  account(ME);
  await mount(editor());
  const you = document.querySelector('[data-dk-identity]');
  assert.ok(you, 'no You section in Edit profile');
  assert.equal(you.getAttribute('data-dk-identity'), 'ready');
  assert.equal(you.closest('[data-editor-label]').getAttribute('data-editor-label'), 'About', 'You is not on the About tab');
  assert.equal(document.querySelector('[data-dk-photo]').getAttribute('src'), PHOTO);
  assert.deepEqual(['displayName', 'handle', 'location', 'pronouns'].map((k) => input(k).value), ['Christopher Perry', '@cperry', 'Brooklyn, NY', 'he/him']);
  assert.ok(button('Replace photo') && button('Remove'));
  // An outside URL in the doc is no photo: it would load on everyone's device.
  account({ ...ME, photo: 'https://tracker.example/me.jpg' });
  await mount(editor());
  assert.equal(document.querySelector('[data-dk-photo]'), null);
  assert.ok(button('Upload photo'));
});

test('a save writes only what was touched, through settingsSync, and the page hears it', async () => {
  const { docs, writes, upserts } = account(ME);
  let saved = null, heard = 0;
  const onHeard = () => { heard++; };
  window.addEventListener('shape:identity', onHeard);
  await mount(editor({ onSave: (d) => { saved = d; } }));
  await type(input('location'), 'Austin, TX');
  await type(input('handle'), 'chris');
  await click(button('Save profile'));
  window.removeEventListener('shape:identity', onHeard);
  assert.equal(writes.length, 1, 'the identity was written more than once, or not at all');
  assert.equal(writes[0][0], 'client_identity');
  // Touched: the location, and the handle with its @; untouched fields and the rest of the doc as they were.
  assert.deepEqual(docs.client_identity, { ...ME, location: 'Austin, TX', handle: '@chris' });
  assert.equal(upserts.length, 1, 'the profile doc was not saved with it');
  assert.equal(upserts[0].data.bio, 'Strong is a skill.');
  assert.ok(saved, 'onSave was not called');
  assert.equal(heard, 1, 'the page was not told the identity changed');
  assert.equal(window.ShapeIdentity.location, 'Austin, TX', 'the cached identity is stale');
});

test('an empty name stops the save before anything is written', async () => {
  const { writes, upserts } = account(ME);
  let saved = false;
  await mount(editor({ onSave: () => { saved = true; } }));
  await type(input('displayName'), '   ');
  await click(button('Save profile'));
  assert.equal(writes.length, 0);
  assert.equal(upserts.length, 0, 'the profile doc was written with the identity refused');
  assert.equal(saved, false);
  assert.match(document.body.textContent, /Enter your name\./);
});

test('a picked photo is stored as the app stores it, a 256px JPEG; Remove clears it', async () => {
  let acct = account({ ...ME, photo: null });
  await mount(editor());
  drawn.length = 0;
  await pick(new window.File(['x'], 'me.png', { type: 'image/png' }));
  assert.equal(drawn.length, 1);
  // 1200×800 into 256 square: scaled to cover (384×256) and centred.
  assert.deepEqual(drawn[0], { cw: 256, ch: 256, x: -64, y: 0, w: 384, h: 256 });
  assert.equal(document.querySelector('[data-dk-photo]').getAttribute('src'), 'data:image/jpeg;base64,QUJDMA==');
  await click(button('Save profile'));
  assert.equal(acct.docs.client_identity.photo, 'data:image/jpeg;base64,QUJDMA==');
  assert.equal(acct.docs.client_identity.name, 'Christopher Perry', 'the photo save dropped the name');

  // Not an image: refused, nothing changes.
  acct = account(ME);
  await mount(editor());
  await pick(new window.File(['x'], 'notes.pdf', { type: 'application/pdf' }));
  assert.match(document.body.textContent, /Choose an image for your photo\./);
  assert.equal(document.querySelector('[data-dk-photo]').getAttribute('src'), PHOTO);

  acct = account(ME);
  await mount(editor());
  await click(button('Remove'));
  assert.equal(document.querySelector('[data-dk-photo]'), null);
  await click(button('Save profile'));
  assert.equal(acct.docs.client_identity.photo, null);
  assert.equal(acct.docs.client_identity.handle, '@cperry');
});

test('an untouched You writes no identity; a failed read offers Try again and the rest still saves', async () => {
  let acct = account(ME);
  await mount(editor());
  await click(button('Save profile'));
  assert.equal(acct.writes.length, 0, 'an untouched identity was written');
  assert.equal(acct.upserts.length, 1);

  acct = account(ME, { failRead: true });
  await mount(editor());
  assert.equal(document.querySelector('[data-dk-identity]').getAttribute('data-dk-identity'), 'error');
  assert.ok(button('Try again'));
  await click(button('Save profile'));
  assert.equal(acct.writes.length, 0);
  assert.equal(acct.upserts.length, 1, 'a failed identity read blocked the profile save');
});

test('the profile page reads again when Edit profile saves the identity', () => {
  const src = read('public/newdesign/livingProfilePage.jsx');
  assert.match(src, /window\.addEventListener\("shape:identity", again\)/);
  assert.match(src, /window\.removeEventListener\("shape:identity", again\)/);
  // The owner's row takes the identity doc's name, handle, pronouns and location (unchanged, and what makes the
  // re-read show the edit).
  assert.match(src, /for \(const key of \["handle","pronouns","location","link"\]\)/);
  assert.match(src, /if \(d\.name\) row\.full_name = d\.name;/);
});

test("the coach's Settings card opens Edit profile instead of being a second editor", () => {
  const src = read('public/newdesign/dashProfileExtras.jsx');
  // The card's code, without its comments: the note on why it changed quotes the old button.
  const card = src.slice(src.indexOf('function CoachAccountSettings('), src.indexOf('Account · Danger zone')).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(card, /EditProfileModal|Edit profile details/, 'Settings still edits the profile itself');
  assert.match(card, /dashLinkedTab\("profile", role, \{ edit: "profile" \}\)/);
  assert.match(card, /data-open-edit-profile="" [^>]*>Open Edit profile</);
});

test('the coach page opens its editor on ?edit=profile, shows the editor\'s Bio, and falls back to the listing portrait', () => {
  const src = read('public/newdesign/coachProfileWeb.jsx');
  assert.match(src, /if \(params\.get\("edit"\) !== "profile"\) return;/);
  assert.match(src, /window\.addEventListener\("hashchange", take\)/);
  assert.match(src, /const bio = isPrivate \? "" : String\(\(live \? \(customBio \|\| \(row && \(row\.goal \|\| row\.bio\)\)\)/);
  assert.match(src, /const avatar = live \? \(row && row\.avatar\) \|\| media\.portrait \|\| null/);
  assert.match(read('mobile-app/src/broadsheet/BSTrainerProfile.jsx'), /const bio = \(!isPrivate && \(customBio \|\| \(live && live\.goal\)/, "the app's coach page ignores the editor's Bio");
});
