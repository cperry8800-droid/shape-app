// The website's half of a member's own colours (owner, 2026-11-04: members get the colours page coaches got,
// "Both", "the customization options should be specific for what coaches can edit and clients", then "this should
// apply to website as well"; of a member's "Your line · one motto", "Remove the field").
//
// MOUNTED from the shipping livingDesktop.jsx in jsdom with real React, the real livingShared.jsx globals and the
// real coach kit (coachProfileKit.mjs, the app's papers and accents):
//   · the editor (ProfileCustomizer, both roles) draws Your colors, the lit panel, in place of the seven hex
//     swatches; it opens on the doc's look or on what the page is in now, and saves `look` only when a paper or
//     an accent was picked in it, keeping the look's crop;
//   · a member's editor no longer asks for their line (a coach's still does), and the doc's own rides through;
//   · the member page (DesktopProfile) paints in the look once a paper is picked, and in the site's dark stock,
//     exactly as before, without one; the look's accent tints what the hex accent tinted; no member line shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as profileLib from '../public/newdesign/profileCustom.mjs';
import * as kit from '../public/newdesign/coachProfileKit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
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

// livingShared.jsx is a classic browser script whose top-level names livingDesktop.jsx reads as globals.
const SHARED = join(ROOT, 'public/newdesign/livingShared.jsx');
const sharedNames = parse(readFileSync(SHARED, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }).program.body
  .flatMap((n) => (n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((x) => x.id && x.id.name).filter(Boolean) : []));
const shared = await loadRealModule(SHARED, { appendExports: `Object.assign(exports, { ${sharedNames.join(', ')} });` });
Object.assign(globalThis, shared, { SignalSigil: () => null, TerrainContours: () => null, TerrainRidge: () => null });
globalThis.ReactDOM = require('react-dom');
window.ShapeProfileLib = profileLib;
window.ShapeCoachKit = kit;
const { ProfileCustomizer, DesktopProfile, DK_LOOK_PAPERS, DK_LOOK_ACCENTS, DK_PAPER_NAMES, DK_ACCENT_NAMES, DK_LOOK_PRESETS } = await loadRealModule(join(ROOT, 'public/newdesign/livingDesktop.jsx'), { appendExports: 'Object.assign(exports, { ProfileCustomizer, DesktopProfile, DK_LOOK_PAPERS, DK_LOOK_ACCENTS, DK_PAPER_NAMES, DK_ACCENT_NAMES, DK_LOOK_PRESETS });' });
// The app's panel, for its looks.
const appPicker = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSLookPicker.jsx'), { registry: new Map([['react', React]]) });

test('the panel\'s words and lists are the app\'s: every paper and accent the save keeps, by its English name', () => {
  assert.deepEqual(DK_LOOK_PAPERS, profileLib.BS_LOOK_PAPERS);
  assert.deepEqual(DK_LOOK_ACCENTS, profileLib.BS_LOOK_ACCENTS);
  assert.deepEqual(DK_LOOK_PRESETS, appPicker.PRESETS, 'the Shape looks drifted from the app\'s');
  const settings = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/settings.json'), 'utf8'));
  for (const k of profileLib.BS_LOOK_PAPERS) assert.equal(DK_PAPER_NAMES[k], settings['paper.' + k], `paper ${k}`);
  for (const k of profileLib.BS_LOOK_ACCENTS) assert.equal(DK_ACCENT_NAMES[k], settings['accent.' + k], `accent ${k}`);
  const profile = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/profile.json'), 'utf8'));
  for (const k of ['startFrom', 'colorsTitle', 'colorsSub']) assert.ok(readFileSync(join(ROOT, 'public/newdesign/livingDesktop.jsx'), 'utf8').includes(profile['mine.' + k]), `the panel does not say "${profile['mine.' + k]}"`);
});

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
}
const click = (el) => React.act(async () => { el.click(); });
const byLabel = (name) => document.querySelector(`[aria-label="${name}"]`);
const tab = (name) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === name);
const leds = () => [...document.querySelectorAll('[data-dk-look] [data-led="on"]')].map((e) => e.textContent.trim());
// jsdom keeps a colour as written when it can't parse it, so compare through one serializer.
const sameColor = (a, b) => { const p = document.createElement('i'); p.style.color = a; const x = p.style.color; p.style.color = b; return x === p.style.color; };

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
const editor = (props) => { opened = (props && props.initial) || {}; return React.createElement(ProfileCustomizer, { initial: {}, c: '#d8a23a', coach: false, ownerUid: 'u1', onClose() {}, onSave() {}, ...props }); };

test('a member\'s editor: Your colors in place of the swatches, a pick saved as the look, its crop kept', async () => {
  const writes = backend();
  let saved = null;
  await mount(editor({ initial: { bio: 'Hi', line: 'Old motto', accent: '#8a5cf6', look: { focus: 'top' } }, onSave: (d) => { saved = d; } }));
  assert.equal(byLabel('Your motto'), null, 'the member\'s line field is back');
  await click(tab('Appearance'));
  const panel = document.querySelector('[data-dk-colors]');
  assert.ok(panel, 'no Your colors section');
  assert.match(panel.textContent, /Your colors/);
  assert.match(panel.textContent, /Start from a Shape look/);
  assert.equal(document.querySelectorAll('[data-dk-look] [data-paper]').length, 18, 'every paper');
  assert.equal(document.querySelectorAll('[data-dk-look] [data-accent]').length, 9, 'every accent');
  assert.equal(document.querySelectorAll('[data-dk-look] [data-look]').length, 7, 'the Shape looks');
  assert.equal(byLabel('Accent #8a5cf6'), null, 'the seven hex swatches are back');
  // It opens on what the page is in now: the site's dark stock, teal.
  assert.deepEqual(leds(), ['Paper · Black', 'Accent · Teal']);
  assert.equal(byLabel('Paper Black').getAttribute('aria-pressed'), 'true');
  await click(byLabel('Paper Bone'));
  assert.deepEqual(leds(), ['Paper · Bone', 'Accent · Teal']);
  assert.equal(byLabel('Paper Bone').getAttribute('aria-pressed'), 'true');
  assert.equal(byLabel('Paper Black').getAttribute('aria-pressed'), 'false');
  await click(byLabel('Accent Rust'));
  assert.match(document.querySelector('[data-look-check]').textContent, /Buttons and text read clearly on Bone\./);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save profile'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data.look, { focus: 'top', paper: 'bone', accent: 'rust' }, 'the look saved is not the pick with its crop');
  assert.equal(writes[0].data.line, 'Old motto', 'the member\'s line did not ride through');
  assert.equal(writes[0].data.accent, '#8a5cf6', 'the old hex accent did not ride through');
  assert.deepEqual(saved.look, writes[0].data.look);
});

test('an untouched panel saves no look: a member who never picks keeps their page as it is', async () => {
  for (const initial of [{ bio: 'Hi' }, { bio: 'Hi', look: { paper: 'plum', accent: 'violet', focus: 'bottom' } }]) {
    const writes = backend();
    await mount(editor({ initial }));
    await click(tab('Appearance'));
    if (initial.look) assert.deepEqual(leds(), ['Paper · Plum', 'Accent · Violet'], 'the panel does not open on the doc\'s look');
    // Picking the look it already has is no change either.
    if (initial.look) await click(byLabel('Paper Plum'));
    await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save profile'));
    assert.deepEqual(writes[0].data.look, initial.look, `${JSON.stringify(initial)}: the look changed with nothing picked`);
  }
});

test('a coach\'s editor has the same panel, opens on their role\'s accent, and keeps their line', async () => {
  backend();
  // A nutritionist's page hands the editor its amber.
  await mount(editor({ coach: true, c: '#e3a544', initial: { line: 'Eat the rainbow.' } }));
  assert.ok(byLabel('Your motto'), 'the coach\'s line field went');
  await click(tab('Appearance'));
  assert.deepEqual(leds(), ['Paper · Black', 'Accent · Amber']);
  await mount(editor({ coach: true, c: '#34d6c5', initial: {} }));
  await click(tab('Appearance'));
  assert.deepEqual(leds(), ['Paper · Black', 'Accent · Teal']);
});

// ── The member page ───────────────────────────────────────────────────────────
const page = (custom) => React.createElement(DesktopProfile, { direction: 'terrain', persona: 'client', variant: 'public', person: { ...shared.LV_PEOPLE.client, uid: 'u-priya', custom }, chrome: false, onMessage() {}, onFollow() {} });
const rootDiv = () => document.querySelector('#root > div');

test('the member page paints in the look once a paper is picked, its accent where the hex accent tinted', async () => {
  const custom = { look: { paper: 'bone', accent: 'rust' }, accent: '#8a5cf6', line: 'Strong is a skill.', pinned: { kind: 'win', title: 'First race', metric: '2×BW' } };
  await mount(page(custom));
  const bone = kit.bsCoachPalette({ paper: 'bone', accent: 'rust' }, 'client');
  assert.equal(rootDiv().getAttribute('data-dk-page'), 'bone');
  assert.ok(sameColor(rootDiv().style.background, bone.PAPER_BG), `the page is ${rootDiv().style.background}, not Bone`);
  assert.ok(sameColor(rootDiv().style.color, bone.INK), 'the page\'s ink is not Bone\'s');
  const metric = [...document.querySelectorAll('div')].find((e) => e.textContent === '2×BW');
  assert.ok(sameColor(metric.style.color, bone.ACCENT), 'the pin is not in the look\'s accent');
  // The parts read the page's ink: the hero's name line, the stations' heads. Only the portrait's initials keep
  // the stock's cream, on its own dark tile (livingShared.jsx LvPortrait).
  const onStockTile = (e) => { for (let n = e.parentElement; n; n = n.parentElement) { if (n.style && n.style.background) return sameColor(n.style.background, '#100d0a'); } return false; };
  const light = [...document.querySelectorAll('[style]')].filter((e) => sameColor(e.style.color, '#f2ede4') && !onStockTile(e));
  assert.deepEqual(light.map((e) => e.outerHTML.slice(0, 120)), [], 'a part kept the stock\'s light ink on Bone');
  assert.equal(document.body.textContent.includes('Strong is a skill.'), false, 'the member\'s line shows');
});

test('without a paper the member page is the site\'s dark stock, exactly as before', async () => {
  for (const custom of [null, {}, { look: { accent: 'rust' } }, { look: { focus: 'top' } }, { accent: '#8a5cf6', pinned: { kind: 'win', title: 'First race', metric: '2×BW' } }]) {
    await mount(page(custom));
    assert.equal(rootDiv().getAttribute('data-dk-page'), null, `${JSON.stringify(custom)}: painted`);
    assert.ok(sameColor(rootDiv().style.background, '#100d0a'), `${JSON.stringify(custom)}: not the stock paper`);
    assert.ok(sameColor(rootDiv().style.color, '#f2ede4'), `${JSON.stringify(custom)}: not the stock ink`);
  }
  // The hex accent still tints the pin with no look accent; a look accent with no paper wins over it, as it
  // reads on the stock's dark paper.
  const metric = () => [...document.querySelectorAll('div')].find((e) => e.textContent === '2×BW');
  assert.ok(sameColor(metric().style.color, '#8a5cf6'));
  await mount(page({ look: { accent: 'rust' }, accent: '#8a5cf6', pinned: { kind: 'win', title: 'First race', metric: '2×BW' } }));
  assert.equal(rootDiv().getAttribute('data-dk-page'), null);
  assert.ok(sameColor(metric().style.color, kit.bsCoachPalette({ paper: 'dark', accent: 'rust' }, 'client').ACCENT));
});

test('a save in the editor repaints the member\'s own page at once', async () => {
  backend();
  await mount(React.createElement(DesktopProfile, { direction: 'terrain', persona: 'client', variant: 'own', person: { ...shared.LV_PEOPLE.client, uid: 'u1', custom: {} }, chrome: false, onMessage() {}, onFollow() {} }));
  assert.equal(rootDiv().getAttribute('data-dk-page'), null);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit profile'));
  await click(tab('Appearance'));
  await click(byLabel('Oxblood look'));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save profile'));
  assert.equal(rootDiv().getAttribute('data-dk-page'), 'oxblood');
  await React.act(async () => root.unmount()); root = null;
});

// Parity with the app (owner, 2026-11-11): the page reads its person again (an edit made in the app, seen on a
// return to the tab: livingProfilePage.jsx's visibilitychange), and the page takes the new doc; it held the one
// it opened with until a reload. Not while Edit profile is open over it, and a read that landed while it was
// open never undoes that editor's save.
test("the member's own page takes a doc read again, and an editor's save outlives a read made while it was open", async () => {
  backend();
  const prof = (custom) => React.createElement(DesktopProfile, { direction: 'terrain', persona: 'client', variant: 'own', person: { ...shared.LV_PEOPLE.client, uid: 'u1', custom }, chrome: false, onMessage() {}, onFollow() {} });
  opened = {};
  await mount(prof({}));
  assert.equal(rootDiv().getAttribute('data-dk-page'), null);
  // The app changed the paper; the page read it again.
  await React.act(async () => root.render(prof({ look: { paper: 'oxblood' } })));
  assert.equal(rootDiv().getAttribute('data-dk-page'), 'oxblood', 'the page kept the doc it opened with');
  // Edit profile open; a read lands under it (plum); the editor saves forest.
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit profile'));
  await React.act(async () => root.render(prof({ look: { paper: 'plum' } })));
  assert.equal(rootDiv().getAttribute('data-dk-page'), 'oxblood', 'a read repainted the page under the open editor');
  opened = { look: { paper: 'plum' } };
  await click(tab('Appearance'));
  await click(byLabel('Forest look'));
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save profile'));
  assert.equal(rootDiv().getAttribute('data-dk-page'), 'forest', "the older read undid the editor's save");
  await React.act(async () => root.unmount()); root = null;
});

// The climb background (profile_custom.climbBg, picked in Edit profile → Appearance or the app's Customize) was
// painted on no member page. It is the kit's wash over the page's paper, as a coach's page lays it.
test('the member page lays the climb background picked over its paper, and none leaves it as it was', async () => {
  await mount(page({ climbBg: 'dusk', look: { paper: 'bone', accent: 'rust' } }));
  assert.equal(rootDiv().getAttribute('data-dk-climb-bg'), 'dusk', 'the climb background is painted nowhere');
  const bg = rootDiv().getAttribute('style');
  assert.ok(bg.includes('rgba(138, 92, 246, 0.3)') || bg.includes('rgba(138,92,246,0.30)'), `the wash is not Dusk's: ${bg}`);
  // Over the stock paper too: a wash with no paper picked.
  await mount(page({ climbBg: 'ember' }));
  assert.equal(rootDiv().getAttribute('data-dk-climb-bg'), 'ember');
  for (const custom of [{}, { climbBg: '' }, { climbBg: 'neon' }, { climbBg: 7 }]) {
    await mount(page(custom));
    assert.equal(rootDiv().getAttribute('data-dk-climb-bg'), null, `${JSON.stringify(custom)}: a wash was laid`);
    assert.ok(sameColor(rootDiv().style.background, '#100d0a'), `${JSON.stringify(custom)}: not the stock paper`);
  }
});
