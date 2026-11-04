// The Studio's words in Make it yours (owner, 2026-11-04: the trainer's Studio tab as their work in
// three kinds, each with an optional line of their own), MOUNTED: mobile-app/src/broadsheet/
// BSMakeItYours.jsx in the real broadsheet chrome, against a scripted profile_custom read and save.
//
// What it pins: a trainer's third tab is Programs, in Your space's place (a nutritionist keeps Your
// kitchen); About me opens on the focus words (at most four, a preset stored as its token, the
// coach's own words as written) and the picks (at most two, stored by the workout's key); Programs
// saves a line per program, workout and the coaching offer, and who each program is for; and a key
// the coach did not change here is never written, so one saved elsewhere since the editor opened is kept
// (a floor plan saved before Programs took Your space's place among them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsStudioFromTemplate } from '../mobile-app/src/services/studioKit.mjs';
import { bsProfileStudio } from '../mobile-app/src/services/profileCustom.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

// The English catalogs. A key not in them yet reads its English default, formatted as the catalogs
// are (so a plural that would not parse fails here); tests/trainer-profile.test.mjs holds the editor
// to the catalogs themselves.
const CATS = {};
const EN = join(ROOT, 'mobile-app/src/i18n/catalogs/en');
for (const f of readdirSync(EN)) if (f.endsWith('.json')) CATS[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(EN, f), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.includes(':') ? key.split(/:(.*)/s) : ['common', key];
    const msg = CATS[ns] && k in CATS[ns] ? CATS[ns][k] : opts.defaultValue;
    assert.ok(typeof msg === 'string', `${key}: no catalog entry and no English default`);
    return new IntlMessageFormat(msg, 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { text: () => document.body.textContent.replace(/\s+/g, ' '), unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const click = async (el) => { assert.ok(el, 'no such element'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, text) => {
  assert.ok(el, 'no such field');
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
// The editor's own tabs (Colors, Wall photo, the third, About me).
const tabs = () => [...$$('[data-make-it-yours] [role="group"]')[0].querySelectorAll('button')];
const tabNames = () => tabs().map((b) => b.textContent);
const openTab = (name) => click(tabs().find((b) => b.textContent === name));

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const { BSMakeItYours } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSMakeItYours.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });

// What the profile hands the editor: the coach's programs, their workouts (each program's days and
// each posted video) and their coaching offer, as their page lists them.
const WORK = {
  programs: [{ id: 'plan1', name: 'Strong in 12', note: '12 weeks · 3 days a week' }, { id: 'plan2', name: 'First 5k', note: '' }],
  workouts: [
    { key: 'd:plan1:0', kind: 'day', title: 'Squat', facts: 'Strong in 12 · Monday · 4 moves' },
    { key: 'd:plan1:2', kind: 'day', title: 'Pull', facts: 'Strong in 12 · Friday · 4 moves' },
    { key: 'v:post9', kind: 'video', title: 'Hip openers', facts: 'Video · 3d' },
  ],
  coaching: { blurb: '' },
  specialty: 'Strength coach',
};

let world;
function reset(over = {}) { world = { me: 'u-maya', stored: {}, saved: null, onSaved: null, ...over }; }
reset();
window.ShapeAuth = { getCachedState: () => ({ user: world.me ? { id: world.me } : null }) };
window.shapeDb = {
  getUserGoals: async (k, opts) => (opts && opts.expectedUserId !== world.me ? null : world.stored),
  saveUserGoals: async (k, d, opts) => { world.saved = { k, d, opts }; return { ok: true }; },
};
const editor = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSMakeItYours, { role: 'trainer', ownerUid: 'u-maya', initial: {}, who: { name: 'Maya Okafor', first: 'Maya' }, work: WORK,
    onClose: () => {}, onSaved: (doc, changed) => { world.onSaved = { doc, changed }; }, ...props }));
const save = async () => { await click($('[data-save-mine]')); assert.ok(world.saved || world.onSaved, 'saved'); return world.saved ? world.saved.d : world.onSaved.doc; };

test('a trainer\'s third tab is Programs, in Your space\'s place; a nutritionist keeps Your kitchen; both then have Spotlight', async () => {
  reset();
  let m = await mount(editor());
  assert.deepEqual(tabNames(), ['Colors', 'Wall photo', 'Programs', 'Spotlight', 'About me']);
  await openTab('Programs');
  assert.match(m.text(), /Descriptions\.\s?A short line under each thing you sell\. All optional\./);
  assert.deepEqual($$('[data-desc-field]').map((f) => f.getAttribute('data-desc-field')), ['p:plan1', 'p:plan2', 'd:plan1:0', 'd:plan1:2', 'v:post9', 'coaching'],
    'a field per program, per workout and for the coaching offer');
  assert.ok(!$('[data-studio-plan]') && !$('[data-kind]'), 'no floor plan');
  assert.ok(!$('[data-save-mine]'), 'opening a tab changes nothing');
  await m.unmount();

  // A way in that still asks for the space opens Programs.
  m = await mount(editor({ startTab: 'space' }));
  assert.equal(tabs().find((b) => b.getAttribute('aria-pressed') === 'true').textContent, 'Programs');
  await m.unmount();

  // Nothing to describe yet: said, not an empty page.
  m = await mount(editor({ work: undefined, startTab: 'programs' }));
  assert.ok($('[data-desc-empty]'));
  await openTab('About me');
  assert.equal($$('[data-pick-add]').length, 2, 'two empty slots');
  await click($('[data-pick-add]'));
  assert.match($('[data-pick-chooser]').textContent, /Publish a program or post a workout video, then pick it here\./);
  await m.unmount();

  m = await mount(editor({ role: 'nutritionist' }));
  assert.deepEqual(tabNames(), ['Colors', 'Wall photo', 'Your kitchen', 'Spotlight', 'About me']);
  await openTab('About me');
  assert.ok($('[data-mine-about]'));
  assert.ok(!$('[data-about-focus]') && !$('[data-about-picks]') && !$('[data-about-preview]'), 'no focus words or picks on a nutritionist\'s About me');
  await m.unmount();
});

test('Focus: at most four, a preset stored as its token and the coach\'s own words as written', async () => {
  reset({ stored: { bio: 'Kept' } });
  const m = await mount(editor({ startTab: 'about' }));
  const count = () => $('[data-about-focus]').firstChild.textContent;
  const said = () => $('[data-about-preview-focus]').textContent;
  assert.equal(said(), 'Strength coach', 'none picked: the listing\'s specialty under the name');
  assert.match($('[data-focus-hint]').textContent, /None picked shows your listing’s “Strength coach”\./);
  assert.match(count(), /0 of 4/);
  assert.equal($$('[data-focus]').length, 8, 'every preset');
  await click($('[data-focus="strength"]'));
  await click($('[data-focus="conditioning"]'));
  await click($('[data-focus-add]'));
  await type($('[data-focus-own] input'), 'Kettlebells');
  assert.equal(said(), 'Strength · Conditioning · Kettlebells', 'the words show as they are written');
  await click($('[data-focus-own-done]'));
  assert.ok(!$('[data-focus-own]'), 'Done puts the box away');
  assert.equal($('[data-focus-words]').getAttribute('aria-pressed'), 'true');
  await click($('[data-focus="mobility"]'));
  assert.match(count(), /4 of 4/);
  // A fifth is refused, and said.
  await click($('[data-focus="cut"]'));
  assert.equal($('[data-focus="cut"]').getAttribute('aria-pressed'), 'false');
  assert.match($('[data-about-focus] [role="alert"]').textContent, /Up to 4 focus words\. Untick one to pick another\./);
  await click($('[data-focus-add]'));
  assert.ok(!$('[data-focus-own]'), 'nor can words be added past four');
  assert.equal(said(), 'Strength · Conditioning · Kettlebells · Mobility');
  // Unticked, a place opens; words that name a preset are the preset, so they read in every language.
  await click($('[data-focus="conditioning"]'));
  await click($('[data-focus-add]'));
  await type($('[data-focus-own] input'), '  beginners WELCOME ');
  await click($('[data-focus-own-done]'));
  assert.equal($('[data-focus="beginners"]').getAttribute('aria-pressed'), 'true');
  // Words opened and left blank are not a word.
  await click($('[data-focus="mobility"]'));
  await click($('[data-focus-add]'));
  await click($('[data-focus="hypertrophy"]'));
  assert.ok(!$('[data-focus-own]'), 'another tap puts the box away');
  assert.match(count(), /4 of 4/, 'the blank words took no place');
  const doc = await save();
  assert.deepEqual(doc.focus, [{ id: 'strength' }, { w: 'Kettlebells' }, { id: 'beginners' }, { id: 'hypertrophy' }]);
  assert.equal(doc.bio, 'Kept', 'onto the doc as it is at save time');
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-maya' });
  for (const k of ['picks', 'descriptions', 'programFor']) assert.ok(!(k in doc), `${k}: not written`);
  await m.unmount();
});

test('Your picks: two slots, each stored by the workout\'s key; a pick no longer on the page goes at the next change', async () => {
  reset();
  let m = await mount(editor({ startTab: 'about' }));
  const count = () => $('[data-about-picks]').firstChild.textContent;
  assert.equal($$('[data-pick-slot]').length, 2);
  assert.match($('[data-pick-slot="1"]').textContent, /01Add a workoutOr tap ☆ on any workout in Programs\./);
  await click($('[data-pick-slot="1"] [data-pick-add]'));
  assert.deepEqual($$('[data-pick-option]').map((b) => b.getAttribute('data-pick-option')), ['d:plan1:0', 'd:plan1:2', 'v:post9']);
  await click($('[data-pick-option="v:post9"]'));
  assert.ok(!$('[data-pick-chooser]'), 'a choice closes the list');
  assert.match($('[data-pick-slot="1"]').textContent, /Hip openersVideo · 3dChange/);
  assert.match(count(), /1 of 2/);
  await click($('[data-pick-slot="2"] [data-pick-add]'));
  assert.ok($('[data-pick-option="v:post9"]').disabled, 'the other slot\'s workout is not offered twice');
  assert.match($('[data-pick-option="v:post9"]').textContent, /Picked/);
  await click($('[data-pick-option="d:plan1:0"]'));
  assert.match(count(), /2 of 2/);
  assert.equal($$('[data-pick-add]').length, 0, 'both slots full, and no third');
  // Change swaps the slot's workout.
  await click($('[data-pick-slot="1"] [data-pick-change]'));
  await click($('[data-pick-option="d:plan1:2"]'));
  assert.match($('[data-pick-slot="1"]').textContent, /Pull/);
  let doc = await save();
  assert.deepEqual(doc.picks, ['d:plan1:2', 'd:plan1:0']);
  await m.unmount();

  // A pick of a workout gone from the page: not shown, not counted, and dropped with the next change.
  reset({ stored: { picks: ['d:gone:1', 'v:post9'] } });
  m = await mount(editor({ startTab: 'about', initial: { picks: ['d:gone:1', 'v:post9'] } }));
  assert.match(count(), /1 of 2/);
  assert.match($('[data-pick-slot="1"]').textContent, /Hip openers/);
  await click($('[data-pick-slot="1"] [data-pick-change]'));
  await click($('[data-pick-remove]'));
  assert.equal($$('[data-pick-add]').length, 2);
  doc = await save();
  assert.ok(!('picks' in doc), 'emptied, the key goes');
  await m.unmount();
});

test('Programs: a line per program, workout and the coaching offer, and who each program is for, are saved', async () => {
  reset({ stored: { bio: 'Kept' } });
  const m = await mount(editor({ startTab: 'programs' }));
  const fieldOf = (k) => $(`[data-desc-field="${k}"]`);
  assert.match(fieldOf('p:plan1').textContent, /ProgramOptionalStrong in 120\/140/);
  assert.match(fieldOf('p:plan1').textContent, /Leave blank to show “12 weeks · 3 days a week”\./, 'what members see if it is left blank: the program\'s own note');
  assert.match(fieldOf('p:plan2').textContent, /Leave blank to show nothing more\./);
  assert.match(fieldOf('d:plan1:0').textContent, /^Workout.*Squat.*Leave blank to show “Strong in 12 · Monday · 4 moves”\./);
  assert.match(fieldOf('v:post9').textContent, /^Video/);
  assert.match(fieldOf('coaching').textContent, /Coaching · Monthly.*Coaching with Maya.*Leave blank to show only what’s included\./);
  assert.equal($('[data-desc="p:plan1"]').getAttribute('maxlength'), '140');
  // One line: a line break typed or pasted reads as a space.
  await type($('[data-desc="p:plan1"]'), 'Three lifting days a week.\nEvery top set is filmed.');
  assert.equal($('[data-desc="p:plan1"]').value, 'Three lifting days a week. Every top set is filmed.');
  assert.match(fieldOf('p:plan1').querySelector('[data-desc-count]').textContent, /^51\/140$/);
  await type($('[data-desc="v:post9"]'), 'Ten minutes, every morning.');
  await type($('[data-desc="coaching"]'), 'Who it suits: anyone who wants a plan that bends.');
  // Who it's for: one preset or the coach's own words, one at a time.
  await click($('[data-program-for="plan1"] [data-for="new"]'));
  await click($('[data-program-for="plan1"] [data-for="lifting"]'));
  assert.equal($('[data-program-for="plan1"] [data-for="new"]').getAttribute('aria-pressed'), 'false');
  assert.equal($('[data-program-for="plan1"] [data-for="lifting"]').getAttribute('aria-pressed'), 'true');
  await click($('[data-program-for="plan2"] [data-for-own]'));
  await type($('[data-program-for="plan2"] [data-for-own-row] input'), 'Runners coming back ');
  await click($('[data-program-for="plan2"] [data-for-own-done]'));
  assert.equal($('[data-program-for="plan2"] [data-for-words]').textContent, '✓ Runners coming back');
  // A workout's line written and taken back is not a change.
  await type($('[data-desc="d:plan1:2"]'), 'Pull day');
  await type($('[data-desc="d:plan1:2"]'), '');
  const doc = await save();
  assert.deepEqual(doc.descriptions, {
    'p:plan1': 'Three lifting days a week. Every top set is filmed.',
    'v:post9': 'Ten minutes, every morning.',
    coaching: 'Who it suits: anyone who wants a plan that bends.',
  });
  assert.deepEqual(doc.programFor, { plan1: { id: 'lifting' }, plan2: { w: 'Runners coming back' } });
  assert.equal(doc.bio, 'Kept');
  for (const k of ['focus', 'picks']) assert.ok(!(k in doc), `${k}: not written`);
  await m.unmount();
});

test('the Studio\'s keys the coach did not change are not written, so ones saved elsewhere since are kept', async () => {
  const initial = { focus: [{ id: 'strength' }], picks: ['v:post9'], descriptions: { 'p:plan1': 'Old line' }, programFor: { plan1: { id: 'new' } } };
  // The floor plan a trainer drew before Programs took Your space's place is never edited here, so it
  // rides through every save as stored.
  const floor = bsProfileStudio({ kind: 'gym', where: 'Fishtown', items: bsStudioFromTemplate('gym') });
  const since = { bio: 'Kept', studio: floor, focus: [{ w: 'Elsewhere' }], picks: ['d:plan1:0'], descriptions: { 'p:plan1': 'Changed elsewhere' }, programFor: { plan1: { w: 'Elsewhere' } } };
  reset({ stored: since });
  let m = await mount(editor({ initial, startTab: 'about' }));
  assert.equal($('[data-focus="strength"]').getAttribute('aria-pressed'), 'true', 'it opens on their words');
  assert.equal($('[data-about-preview-focus]').textContent, 'Strength');
  assert.match($('[data-pick-slot="1"]').textContent, /Hip openers/);
  assert.ok(!$('[data-save-mine]'), 'nothing reads as changed on open');
  // Changed and put back.
  await click($('[data-focus="cut"]'));
  await click($('[data-focus="cut"]'));
  await openTab('Programs');
  assert.equal($('[data-desc="p:plan1"]').value, 'Old line');
  assert.equal($('[data-program-for="plan1"] [data-for="new"]').getAttribute('aria-pressed'), 'true');
  await type($('[data-desc="p:plan1"]'), 'Old line, longer');
  await type($('[data-desc="p:plan1"]'), 'Old line');
  await click($('[data-program-for="plan1"] [data-for="new"]'));
  await click($('[data-program-for="plan1"] [data-for="new"]'));
  assert.ok(!$('[data-save-mine]'), 'put back, nothing is changed');
  await openTab('Colors');
  await click($('[data-paper="sage"]'));
  const doc = await save();
  assert.equal(doc.look.paper, 'sage');
  for (const k of ['bio', 'studio', 'focus', 'picks', 'descriptions', 'programFor']) assert.deepEqual(doc[k], since[k], `${k}: as stored now`);
  await m.unmount();

  // The demo says which keys were changed, so its page keeps only those.
  reset({ me: null });
  m = await mount(editor({ demo: true, ownerUid: null, initial, startTab: 'colors' }));
  await click($('[data-paper="sage"]'));
  await click($('[data-save-mine]'));
  assert.deepEqual([world.onSaved.changed.focus, world.onSaved.changed.picks, world.onSaved.changed.descriptions, world.onSaved.changed.programFor], [false, false, false, false]);
  await m.unmount();
  reset({ me: null });
  m = await mount(editor({ demo: true, ownerUid: null, initial, startTab: 'about' }));
  await click($('[data-focus="cut"]'));
  await openTab('Programs');
  await type($('[data-desc="coaching"]'), 'A month at a time.');
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null, 'the demo writes nothing');
  const { doc: shown, changed } = world.onSaved;
  assert.deepEqual([changed.focus, changed.picks, changed.descriptions, changed.programFor], [true, false, true, false]);
  assert.deepEqual(shown.focus, [{ id: 'strength' }, { id: 'cut' }]);
  assert.deepEqual(shown.descriptions, { 'p:plan1': 'Old line', coaching: 'A month at a time.' });
  await m.unmount();
});
