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
// The profile doc starts as the editor opens it (`initial` below), unless a test says the app changed it since.
function account(identity, { failRead = false, profile = { bio: 'Strong is a skill.' }, failProfileRead = false } = {}) {
  const docs = { client_identity: identity == null ? null : { ...identity }, profile_custom: profile };
  const writes = [];
  const upserts = [];
  window.shapeDb = {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async (kind, opts) => {
      if (kind === 'client_identity' && failRead) return null;
      if (kind === 'profile_custom' && (failProfileRead || (opts && opts.expectedUserId && opts.expectedUserId !== 'u1'))) return null;
      return kind in docs ? (docs[kind] ? JSON.parse(JSON.stringify(docs[kind])) : {}) : {};
    },
    saveUserGoals: async (kind, next) => { writes.push([kind, next]); docs[kind] = { ...next }; return { ok: true }; },
    // The profile doc is written compare-and-set on its rev (profileCustom.mjs bsProfileCustomWrite).
    saveUserGoalsIfRev: async (kind, data) => { upserts.push({ user_id: 'u1', kind, data }); docs[kind] = data; return { ok: true }; },
    client: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ upsert: async (row) => { upserts.push(row); docs[row.kind] = row.data; return {}; } }) },
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
  assert.ok(!document.querySelector('[data-dk-photo]'), 'still shown');
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
  assert.ok(!document.querySelector('[data-dk-photo]'), 'still shown');
  await click(button('Save profile'));
  assert.equal(acct.docs.client_identity.photo, null);
  assert.equal(acct.docs.client_identity.handle, '@cperry');
});

test('Save waits while a picked photo is still being read (Codex, #2704)', async () => {
  const acct = account({ ...ME, photo: null });
  await mount(editor());
  const el = document.querySelector('[data-dk-identity] input[type="file"]');
  Object.defineProperty(el, 'files', { value: [new window.File(['x'], 'me.png', { type: 'image/png' })], configurable: true });
  await React.act(async () => { el.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.ok(!document.querySelector('[data-dk-photo]'), 'the harness read the photo before Save could be tried');
  assert.ok(button('Save profile').disabled, 'Save was open while the photo was read');
  assert.ok(document.querySelector('[data-dk-photo-pick]').disabled, 'a second photo could be picked over the first');
  await React.act(async () => { button('Save profile').click(); });
  assert.equal(acct.writes.length, 0);
  assert.equal(acct.upserts.length, 0, 'the profile saved, and closed, without the photo');
  await settle(); await settle();
  assert.ok(!button('Save profile').disabled);
  await click(button('Save profile'));
  assert.equal(acct.docs.client_identity.photo, 'data:image/jpeg;base64,QUJDMA==');
});

test('a photo past 400 KB is refused, stored or picked, as the app refuses it', async () => {
  const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(400001);
  // Stored oversized: not shown, and an untouched save leaves the account alone.
  let acct = account({ ...ME, photo: BIG });
  await mount(editor());
  assert.equal(document.querySelector('[data-dk-identity]').getAttribute('data-dk-identity'), 'ready');
  // Booleans and short strings only: a failure message that prints a jsdom node or a 400 KB string runs out of memory.
  assert.ok(!document.querySelector('[data-dk-photo]'), 'an oversized stored photo was shown');
  await click(button('Save profile'));
  assert.equal(acct.writes.length, 0);
  // Encoded oversized: refused with its message; the photo stays and nothing is written.
  acct = account(ME);
  await mount(editor());
  const toURL = window.HTMLCanvasElement.prototype.toDataURL;
  window.HTMLCanvasElement.prototype.toDataURL = () => BIG;
  try { await pick(new window.File(['x'], 'big.png', { type: 'image/png' })); } finally { window.HTMLCanvasElement.prototype.toDataURL = toURL; }
  assert.ok(/Couldn't read that photo — try another\./.test(document.body.textContent), 'an oversized photo was taken without a word');
  assert.ok(document.querySelector('[data-dk-photo]').getAttribute('src') === PHOTO, 'the refused photo replaced the one held');
  await click(button('Save profile'));
  assert.equal(acct.writes.length, 0, 'the refused photo was written');
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
  // And when the tab is shown again after 3 s or more away: an edit made in the app shows without a reload.
  assert.match(src, /document\.addEventListener\("visibilitychange", onVis\)/);
  assert.match(src, /if \(away >= 3000\) setSetupRev\(\(n\) => n \+ 1\);/);
  // A read again that cannot complete leaves the profile on screen; only an answer replaces it (Codex on #2707):
  // no client, a failed account read and a failed profile read keep it; a signed-out answer and no profile do not.
  assert.match(src, /const again = loadedRef\.current;/);
  assert.match(src, /if \(!c \|\| !c\.rpc\) \{ if \(on && !again\) setSt\(\{ loading: false, status: "unavailable" \}\); return; \}/);
  assert.match(src, /if \(!uid\) \{ if \(on && !\(again && authFailed\)\) setSt\(\{ loading: false, status: "signin" \}\); return; \}/);
  assert.match(src, /if \(again && rowFailed\) return;/);
  assert.match(src, /catch \(e\) \{ authFailed = true; \}/);
  assert.match(src, /catch \(e\) \{ rowFailed = true; \}/);
  assert.match(src, /if \(row\) loadedRef\.current = true;\n\s+setSt\(\{ loading: false, status: row \? "ok" : "notfound"/);
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

// Parity with the app (owner, 2026-11-11: "make sure the app parity works with edits to profile as well"). The
// app's editors (Make it yours, Customize) merge onto the doc as stored before they save; the website's Edit
// profile wrote the whole doc it opened with, so an edit made in the app while the page was open was undone by
// the next website save. It now writes only the fields changed in it, over the doc as stored at save time.
async function typeArea(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  await React.act(async () => { setter.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const OPENED = { bio: 'Strong is a skill.', look: { paper: 'dark', accent: 'teal' }, climbBg: 'dusk' };

test('a website save keeps what the app changed since the editor opened, and writes what was changed here', async () => {
  // Opened with OPENED; then, in the app, the coach changed their Bio, paper and About and added a kitchen.
  const appSince = { bio: 'Written in the app.', look: { paper: 'bone', accent: 'blue', focus: 'top' }, climbBg: 'dusk',
    about: { story: 'From the app.' }, headLinks: true };
  const acct = account(ME, { profile: appSince });
  let saved = null;
  await mount(editor({ initial: OPENED, onSave: (d) => { saved = d; } }));
  // Only the Spotify link is changed on the website.
  await type(document.querySelector('input[aria-label="Spotify link"]'), 'https://open.spotify.com/track/abc');
  await click(button('Save profile'));
  assert.equal(acct.upserts.length, 1);
  const out = acct.upserts[0].data;
  assert.equal(out.song && out.song.url, 'https://open.spotify.com/track/abc', 'the website change was not written');
  assert.equal(out.bio, 'Written in the app.', "the website's stale Bio undid the app's");
  assert.deepEqual(out.look, { paper: 'bone', accent: 'blue', focus: 'top' }, "the website's stale look undid the app's");
  assert.deepEqual(out.about, { story: 'From the app.' }, "the app's About was dropped");
  assert.equal(out.headLinks, true, "the app's head links choice was dropped");
  assert.equal(saved, out);

  // A field changed on both sides takes the website's, as the last save.
  const acct2 = account(ME, { profile: appSince });
  await mount(editor({ initial: OPENED }));
  await typeArea(document.querySelector('textarea[aria-label="Bio"]'), 'Written on the website.');
  await click(button('Save profile'));
  assert.equal(acct2.upserts[0].data.bio, 'Written on the website.');
  assert.deepEqual(acct2.upserts[0].data.look, appSince.look);

  // A field cleared on the website is cleared, though the app had set it since.
  const acct3 = account(ME, { profile: appSince });
  await mount(editor({ initial: OPENED }));
  await typeArea(document.querySelector('textarea[aria-label="Bio"]'), '');
  await click(button('Save profile'));
  assert.equal(acct3.upserts[0].data.bio, '');
});

test('a website save whose read of the stored doc fails writes nothing, the identity neither, and says so', async () => {
  const acct = account(ME, { failProfileRead: true });
  let saved = false;
  await mount(editor({ onSave: () => { saved = true; } }));
  await type(input('location'), 'Austin, TX');
  await click(button('Save profile'));
  assert.equal(acct.upserts.length, 0, 'the doc as it opened was written over whatever is stored');
  assert.equal(acct.writes.length, 0, 'the identity was saved and the rest refused: half an edit');
  assert.equal(saved, false);
  assert.match(document.body.textContent, /Couldn't save — try again\./);
});

// Compare-and-set (owner, 2026-11-11, on #2707: "Merge now, CAS later"). An app save of another field that
// lands between this editor's read of the stored doc and its write used to be lost to that write (Codex P2
// on #2707). The write is compare-and-set on the doc's rev now: it conflicts, reads again and merges the
// fields changed here over the newer doc.
test('a website save keeps an app save of another field that lands between its read and its write', async () => {
  const docs = { client_identity: { ...ME }, profile_custom: { bio: 'Strong is a skill.', look: { paper: 'dark', accent: 'teal' }, rev: 4 } };
  const writes = [];
  let landed = false, conflicts = 0;
  window.shapeDb = {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async (kind, opts) => (opts && opts.expectedUserId && opts.expectedUserId !== 'u1' ? null : JSON.parse(JSON.stringify(docs[kind] || {}))),
    saveUserGoals: async (kind, next) => { docs[kind] = { ...next }; return { ok: true }; },
    saveUserGoalsIfRev: async (kind, data, expectedRev, expectedUid) => {
      assert.equal(expectedUid, 'u1');
      // The app's Customize saves the look in the round trip, moving the rev on.
      if (!landed) { landed = true; docs.profile_custom = { ...docs.profile_custom, look: { paper: 'bone', accent: 'rust' }, rev: 5 }; }
      const now = docs[kind] && docs[kind].rev != null ? String(docs[kind].rev) : null;
      if (now !== (expectedRev == null ? null : String(expectedRev))) { conflicts += 1; return { conflict: true }; }
      docs[kind] = JSON.parse(JSON.stringify(data)); writes.push(data);
      return { ok: true };
    },
    client: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: () => ({ upsert: async () => { throw new Error('the profile doc was upserted, not written compare-and-set'); } }) },
  };
  let saved = null;
  await mount(editor({ initial: { bio: 'Strong is a skill.', look: { paper: 'dark', accent: 'teal' } }, onSave: (d) => { saved = d; } }));
  await typeArea(document.querySelector('textarea[aria-label="Bio"]'), 'Written on the website.');
  await click(button('Save profile'));
  assert.equal(conflicts, 1, 'the write did not compare on the rev it read');
  assert.equal(writes.length, 1);
  assert.equal(docs.profile_custom.bio, 'Written on the website.');
  assert.deepEqual(docs.profile_custom.look, { paper: 'bone', accent: 'rust' }, "the app's look, saved mid-write, was undone");
  assert.equal(docs.profile_custom.rev, 6);
  assert.deepEqual(saved, docs.profile_custom, 'the page was handed another doc than the one saved');
});
