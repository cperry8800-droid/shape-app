// A nutritionist links one of their saved playlists to a meal-plan day ("Sunday prep") and to a meal,
// in the website's meal-plan builder, and the link rides into what the member is sent, so the member's
// app can label each playlist "For Sun · Sunday prep" (owner, 2026-11-10).
//
// The contract the app reads:
//   - the builder's document: `day.playlist` and `meal.playlist`, each `{ id?, name, meta }`, the key
//     gone when cleared (never `null`);
//   - the assignment (DashMeals.buildMealAssignment, so DashMealWeek.buildAssignment): each weekday's
//     `playlist` from the plan day it is served from, and each meal's `playlist` from the meal as that
//     weekday serves it (a rest day's own version of it too), only for a playlist with a name; absent
//     otherwise, so every plan without one is published byte for byte as before;
//   - the picker lists the coach's saved playlists (GET /api/coach/soundtracks) that are not a
//     trainer's, and keeps a playlist a day or meal already has selected when the list lacks it.
// These run the real core and week module, and mount the SHIPPED builder (dashMealBuilder.jsx's
// DmbBuilder) in jsdom, as tests/builders-6c-meal.test.mjs does.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/NutritionistApp.html#plans', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
const React = require_('react');
const ReactDOM = require_('react-dom');
const { createRoot } = require_('react-dom/client');
const DashSignals = require_('../public/newdesign/dashSignals.js');
const DashMeals = require_('../public/newdesign/dashMealCore.js');
const W = require_('../public/newdesign/dashMealWeek.js');
const ShapeZone = await import('../public/newdesign/shapeZone.mjs');
const ShapeClientColors = await import('../public/newdesign/clientColors.mjs');
const U = await import('../public/newdesign/unitText.mjs');
Object.assign(window, { ShapeZone, ShapeClientColors });
const Pass = ({ children }) => React.createElement('main', null, children);
Object.assign(globalThis, {
  React, ReactDOM, DashSignals, DashMeals, DashMealWeek: W,
  serif: 'serif', sans: 'sans-serif', mono: 'monospace', INK: '#f2ede4', PAPER: '#1a1612', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', ink50: 'rgba(0,0,0,.5)',
  ssAlpha: (c, a) => 'rgba(0,0,0,' + a + ')',
  DashPage: Pass, nutriNavItems: () => [], nutriPayoutCard: {}, DashMealLedgerCard: () => null,
  useDashUnits: () => null, useDashFocusRefresh: () => {}, useDashPaper: () => {},
  useRememberedChoices: () => null, useRememberedChoice: (_s, _k, _a, fallback) => React.useState(fallback),
});
const { loadRealModule } = await import('./helpers/load-real-module.mjs');
const share = (mod) => { for (const [k, v] of Object.entries(mod)) globalThis[k] = v; };
share(await loadRealModule(ND('dashData.jsx'), { registry: new Map([['/newdesign/unitText.mjs', U]]), appendExports: 'export { useSignedIn };' }));
share(await loadRealModule(ND('dashToday.jsx'), { appendExports: 'export { DashPill, DashDemoBand, dashRouteParam, dashClientHref, DashClientGem, dashRecordTier, dashTierMark, dashRowKeyOpen };' }));
share(await loadRealModule(ND('dashFilterBar.jsx'), { appendExports: 'export { DashFilterBar, DashFacetMenu, DFB_EMPTY, dfbRun, DashLibSort, DashLibTopLine, DashLibDrawer, DashLibPeople, DashLibCard, DashLibMenu, DASH_LIB_ROSTER_UNREAD, dashLibRosterState, dashLibWeekEnd, dashLibKind, dashLibDayKey, dashLibWeekStartKey, useDfbPopShift };' }));
share(await loadRealModule(ND('coachBuilderLayouts.jsx'), { appendExports: 'export { coachTemplateCopy };' }));
await loadRealModule(ND('recipes.jsx'), {});
const { DmbBuilder, dmbPlaylistChoices } = await loadRealModule(ND('dashMealBuilder.jsx'), { appendExports: 'export { DmbBuilder, dmbPlaylistChoices };' });

const clone = (o) => JSON.parse(JSON.stringify(o));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// Every key named `playlist` anywhere in a value.
const playlistKeys = (v) => (JSON.stringify(v).match(/"playlist":/g) || []).length;
let n = 0;
const dish = (name, kcal, p, slot, extra = {}) => ({ ...DashMeals.newMeal({ name, kcal, p, c: Math.round(kcal / 10), f: Math.round(kcal / 40), ingredients: [{ name: name + ' base', qty: 1, unit: '' }] }, slot), id: 'pl' + (++n), ...extra });
const SUNDAY_PREP = { id: 'st-1', name: 'Sunday prep', meta: '12 tracks' };
const BATCH = { id: 'st-3', name: 'Batch cook', meta: '1 track' };

// ── 1. The core: what the member is sent ──────────────────────────────────────
// Two plan days: Day A (served Mon, Wed, Fri, Sun) carries the day's playlist and a meal's own;
// Day B (Tue, Thu, Sat) carries none.
function twoDays() {
  const doc = DashMeals.newPlan('Prep week', 'cut');
  doc.days = [
    { name: 'Day A', playlist: clone(SUNDAY_PREP), slots: [dish('Oats', 450, 30, 'Breakfast', { playlist: { id: 'st-2', name: 'Breakfast beats', meta: '' } }), dish('Chicken bowl', 620, 50, 'Lunch')], variants: {} },
    { name: 'Day B', slots: [dish('Eggs', 400, 30, 'Breakfast'), dish('Tofu rice', 580, 34, 'Lunch')], variants: {} },
  ];
  return doc;
}

test('a day\'s and a meal\'s playlist ride into the assignment, with their ids, on every weekday that day is served', () => {
  const doc = twoDays();
  const before = clone(doc);
  const out = DashMeals.buildMealAssignment(doc, { scale: 1.2, trainingDows: [0, 2, 4] });
  assert.equal(out.days.length, 7);
  for (const d of out.days) {
    const fromA = d.dow % 2 === 0;
    assert.equal(d.title.startsWith(fromA ? 'Day A' : 'Day B'), true, 'served from the day the rotation says');
    if (fromA) assert.deepEqual(d.playlist, SUNDAY_PREP, 'weekday ' + d.dow + ' carries Day A\'s playlist');
    else assert.equal(has(d, 'playlist'), false, 'weekday ' + d.dow + ' has no playlist key');
    for (const m of d.meals) {
      if (m.title === 'Oats') assert.deepEqual(m.playlist, { id: 'st-2', name: 'Breakfast beats', meta: '' });
      else assert.equal(has(m, 'playlist'), false, m.title + ' has no playlist key');
    }
  }
  // Sunday (dow 6) is a rest day for this client and still carries the day's playlist.
  assert.equal(out.days[6].title, 'Day A');
  assert.deepEqual(out.days[6].playlist, SUNDAY_PREP);
  // The week module wraps the core's snapshot and keeps them, on the day it re-tags as a rest day too.
  const week = W.buildAssignment(DashMeals, doc, { scale: 1, trainingDows: [0, 2, 4] });
  assert.equal(week.days[6].tag, 'REST');
  assert.deepEqual(week.days[6].playlist, SUNDAY_PREP);
  assert.deepEqual(week.days[0].meals[0].playlist, { id: 'st-2', name: 'Breakfast beats', meta: '' });
  assert.equal(has(week.days[1], 'playlist'), false);
  // The plan is not written to, and the member's copy is its own.
  assert.deepEqual(doc, before);
  out.days[0].playlist.name = 'changed';
  assert.equal(doc.days[0].playlist.name, 'Sunday prep');
  // A playlist saved without an id goes without one; one with an id keeps it as it is.
  const noId = twoDays();
  noId.days[0].playlist = { name: 'Sunday prep', meta: '12 tracks' };
  const sent = DashMeals.buildMealAssignment(noId, {}).days[0].playlist;
  assert.deepEqual(sent, { name: 'Sunday prep', meta: '12 tracks' });
  assert.deepEqual(Object.keys(DashMeals.buildMealAssignment(doc, {}).days[0].playlist), ['id', 'name', 'meta']);
});

test('a rest day\'s meal keeps its playlist: one following the base, an override with its own, and an extra', () => {
  const doc = DashMeals.newPlan('Rest week', 'cut');
  const oats = dish('Oats', 450, 30, 'Breakfast', { playlist: { id: 'st-2', name: 'Breakfast beats', meta: '4 tracks' } });
  const bowl = dish('Chicken bowl', 620, 50, 'Lunch', { playlist: { id: 'st-5', name: 'Lunch run', meta: '' } });
  const soup = dish('Soup', 300, 20, 'Dinner', { playlist: clone(BATCH) });
  doc.days = [{
    name: 'Day A', playlist: clone(SUNDAY_PREP), slots: [oats, bowl, soup],
    variants: { rest: {
      overrides: {
        // The rest day's own lunch, with its own playlist; its dinner, written before any playlist.
        [bowl.id]: { ...clone(bowl), name: 'Rest-day salad', playlist: { id: 'st-6', name: 'Slow lunch', meta: '9 tracks' } },
        [soup.id]: (() => { const s = clone(soup); delete s.playlist; return s; })(),
      },
      extras: [dish('Cottage cheese', 200, 25, 'Snack', { playlist: { id: 'st-7', name: 'Evening', meta: '' } })],
    } },
  }];
  const out = DashMeals.buildMealAssignment(doc, { trainingDows: [0] });
  const train = out.days[0], rest = out.days[1];
  assert.equal(train.tag, 'TRAIN'); assert.equal(rest.tag, 'REST');
  const byTitle = (d) => Object.fromEntries(d.meals.map((m) => [m.title, m.playlist === undefined ? 'none' : m.playlist]));
  assert.deepEqual(byTitle(train), {
    Oats: { id: 'st-2', name: 'Breakfast beats', meta: '4 tracks' },
    'Chicken bowl': { id: 'st-5', name: 'Lunch run', meta: '' },
    Soup: BATCH,
  });
  assert.deepEqual(byTitle(rest), {
    Oats: { id: 'st-2', name: 'Breakfast beats', meta: '4 tracks' }, // follows the base meal
    'Rest-day salad': { id: 'st-6', name: 'Slow lunch', meta: '9 tracks' }, // the override's own
    Soup: 'none', // an override without one sends none
    'Cottage cheese': { id: 'st-7', name: 'Evening', meta: '' }, // the rest day's extra
  });
  assert.equal(has(rest.meals.find((m) => m.title === 'Soup'), 'playlist'), false);
  assert.deepEqual(rest.playlist, SUNDAY_PREP, 'the day\'s playlist rides on its rest version too');
});

test('a plan with no playlist is published exactly as before: no playlist key anywhere', () => {
  // A small plan's day, key for key, in the order the member's readers have always been sent it.
  const doc = DashMeals.newPlan('Plain', 'cut');
  doc.days = [{ name: 'Day A', slots: [DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === 'f1'), 'Breakfast')], variants: {} }];
  const out = DashMeals.buildMealAssignment(doc, {});
  assert.equal(JSON.stringify(out.days[0]), JSON.stringify({
    dow: 0, title: 'Day A', tag: 'TRAIN', targets: { cal: 1900, p: 165, c: 170, f: 60 },
    meals: [{ slot: 'Breakfast', time: '08:00', title: 'Greek yogurt (250 g)', kcal: 160, p: 25, c: 9, f: 2, ingredients: [{ qty: '250 g', name: 'Greek yogurt' }], alts: [] }],
  }));
  // Shape's example plans (rest versions, swaps, the overnight oats' night-before prep): no key, and
  // the same plan with playlists on every day and meal differs by those keys alone.
  for (const t of DashMeals.demoMealTemplates()) {
    const plain = t.detail.mealBuilder;
    for (const opts of [{}, { scale: 0.9, trainingDows: [1, 3] }, { groceryEdits: { 'rice|g': { remove: true } } }]) {
      const before = DashMeals.buildMealAssignment(plain, opts);
      assert.equal(playlistKeys(before), 0, t.name);
      assert.equal(playlistKeys(W.buildAssignment(DashMeals, plain, opts)), 0, t.name + ' through the week module');
      const linked = clone(plain);
      linked.days.forEach((d) => {
        d.playlist = clone(SUNDAY_PREP);
        d.slots.forEach((m) => { m.playlist = clone(BATCH); });
        Object.values(d.variants || {}).forEach((v) => { Object.values(v.overrides || {}).forEach((o) => { if (o) o.playlist = clone(BATCH); }); (v.extras || []).forEach((m) => { m.playlist = clone(BATCH); }); });
      });
      const after = DashMeals.buildMealAssignment(linked, opts);
      assert.ok(playlistKeys(after) > 0);
      after.days.forEach((d) => { delete d.playlist; d.meals.forEach((m) => { delete m.playlist; }); });
      assert.deepEqual(after, before, t.name + ': a playlist changes nothing else the member is sent');
    }
  }
});

test('only a playlist with a name counts: a blank name, null, a string or no object sends none', () => {
  for (const bad of [{ id: 'st-9', name: '   ', meta: '3 tracks' }, { id: 'st-9', meta: '3 tracks' }, { name: '' }, null, undefined, 'Sunday prep', 7, {}, { name: 12 }]) {
    const doc = twoDays();
    doc.days[0].playlist = bad;
    doc.days[0].slots[0].playlist = bad;
    const out = DashMeals.buildMealAssignment(doc, {});
    assert.equal(playlistKeys(out), 0, JSON.stringify(bad) + ' was sent');
    assert.equal(DashMeals.sentPlaylist(bad), null);
  }
  // A name with spaces round it is sent trimmed; a meta that is not words is none; an empty id is none.
  assert.deepEqual(DashMeals.sentPlaylist({ id: '', name: ' Sunday prep ', meta: 12 }), { name: 'Sunday prep', meta: '' });
  assert.deepEqual(DashMeals.sentPlaylist({ id: 'st-1', name: 'Sunday prep' }), { id: 'st-1', name: 'Sunday prep', meta: '' });
  assert.deepEqual(DashMeals.sentPlaylist({ id: { x: 1 }, name: 'Sunday prep', meta: '2 tracks', url: 'https://x' }), { name: 'Sunday prep', meta: '2 tracks' }, 'only the three keys');
});

// ── 2. The builder ────────────────────────────────────────────────────────────
const SOUNDTRACKS = [
  { id: 'st-1', name: 'Sunday prep', tracks: 12, role: 'nutritionist', provider: 'spotify' },
  { id: 'st-2', name: 'Leg day', tracks: 8, role: 'trainer', provider: 'spotify' },
  { id: 'st-3', name: 'Batch cook', tracks: 1, role: null, provider: 'apple' },
  { id: 'st-4', name: 'Quiet lunch', tracks: 0 },
];
function weekDoc() {
  const doc = DashMeals.newPlan('Rae week', 'cut');
  doc.version = 2;
  const day = (name, meals, extra = {}) => ({ name, slots: meals, variants: {}, ...extra });
  doc.days = [
    day('Monday', [dish('Mon oats', 500, 45, 'Breakfast'), dish('Mon bowl', 600, 50, 'Lunch')]),
    day('Tuesday', [dish('Tue oats', 500, 45, 'Breakfast')]),
    day('Wednesday', [dish('Wed oats', 500, 45, 'Breakfast')]),
    day('Thursday', [dish('Thu oats', 500, 45, 'Breakfast')]),
    day('Friday', [dish('Fri oats', 500, 45, 'Breakfast')]),
    day('Saturday', [dish('Sat oats', 500, 45, 'Breakfast')]),
    day('Sunday', [dish('Sun eggs', 420, 40, 'Breakfast'), dish('Sun soup', 450, 35, 'Lunch')]),
  ];
  return doc;
}
const TEMPLATE = (doc = weekDoc()) => ({ id: 'meal-1', name: 'Rae week', detail: { revision: 3, mealBuilder: doc } });
const uid = (i) => String(i).padStart(8, '0') + '-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NUTRI = () => [{ profile: { id: uid(1), name: 'Tess Byrne', isNew: false }, rankPoints: 2240, progressRead: { state: 'ready', checkedAt: new Date().toISOString() }, checkIn: null, milestones: null, goal: null, goalPhase: null }];

let calls = [];
function stubFetch({ soundtracks = SOUNDTRACKS, soundtracksOk = true } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push([u, method, body]);
    if (u === '/api/coach/soundtracks') return soundtracksOk ? { ok: true, status: 200, json: async () => ({ soundtracks }) } : { ok: false, status: 500, json: async () => ({ error: 'x' }) };
    if (u.includes('/api/coach/plans/usage')) return { ok: true, status: 200, json: async () => ({ usage: {}, capped: false, untracked: 0 }) };
    if (u === '/api/coach/plans' && (method === 'POST' || method === 'PATCH')) return { ok: true, json: async () => ({ plan: { ...body, id: body.id, detail: { ...body.detail, revision: (body.expectedRevision || 0) + 1 } } }) };
    if (u === '/api/nutritionist/meal-plan') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({}) };
  };
}
window.ShapeConfirm = { open: async () => true };
window.confirm = () => { throw new Error('window.confirm was called'); };
window.shapeDb = { getSession: async () => ({}), getUserGoals: async () => ({}) };

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await settle();
}
async function settle() { for (let i = 0; i < 5; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const builder = (over = {}) => React.createElement(DmbBuilder, { template: TEMPLATE(), clients: NUTRI(), queue: [], lifecycle: null, live: true, customFoods: [], ownerId: 'coach-a', onBack: () => {}, onSaved: () => {}, ...over });
const buttons = () => [...document.querySelectorAll('button')];
const button = (label) => buttons().find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
const click = (el) => React.act(async () => { assert.ok(el, 'no such element'); el.click(); });
const cell = (day, slot) => document.querySelector('[data-cell="' + day + '|' + slot + '"]');
const select = (label) => document.querySelector('select[aria-label="' + label + '"]');
const options = (sel) => [...sel.options].map((o) => o.textContent);
const shown = (sel) => sel.options[sel.selectedIndex].textContent;
async function choose(sel, value) {
  assert.ok(sel, 'no such select');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, value);
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
const lastSave = () => calls.filter(([u, m]) => u === '/api/coach/plans' && (m === 'POST' || m === 'PATCH')).at(-1);
// ← Library saves what is open (the builder's one save lane).
async function saved() { await click(button('← Library')); await settle(); return lastSave()[2].detail.mealBuilder; }
const soundtrackReads = () => calls.filter(([u]) => u === '/api/coach/soundtracks').length;

test('the list is the coach\'s saved playlists less a trainer\'s, each as the trainer builder lists it', () => {
  assert.deepEqual(dmbPlaylistChoices(SOUNDTRACKS), [
    { id: 'st-1', name: 'Sunday prep', meta: '12 tracks' },
    { id: 'st-3', name: 'Batch cook', meta: '1 track' },
    { id: 'st-4', name: 'Quiet lunch', meta: '' },
  ]);
  assert.deepEqual(dmbPlaylistChoices(undefined), []);
  assert.deepEqual(dmbPlaylistChoices([null, { id: 'x', name: '  ' }, { id: 'y', role: 'nutritionist' }]), [], 'no row without a name');
});

test('a day\'s playlist is picked beside its name and cleared, writing and removing `day.playlist`; only non-trainer playlists are offered', async () => {
  stubFetch();
  await mount(builder({ preselectId: uid(1) }));
  assert.equal(soundtrackReads(), 1, 'the list is read once, by the builder');
  assert.equal(calls.find(([u]) => u === '/api/coach/soundtracks')[1], 'GET');
  await click(document.querySelector('.dmb-dayhead[data-day="Sunday"]'));
  const sel = select('Playlist for Sunday');
  assert.ok(sel, 'the day\'s picker names the day');
  assert.equal(document.querySelector('[data-day-playlist]').textContent.startsWith('Playlist for this day'), true);
  assert.deepEqual(options(sel), ['No playlist', 'Sunday prep · 12 tracks', 'Batch cook · 1 track', 'Quiet lunch']);
  assert.equal(options(sel).some((o) => /Leg day/.test(o)), false, 'a trainer\'s playlist is not offered');
  assert.equal(shown(sel), 'No playlist');
  await choose(sel, 'id:st-1');
  assert.equal(shown(select('Playlist for Sunday')), 'Sunday prep · 12 tracks');
  let doc = await saved();
  assert.deepEqual(doc.days[6].playlist, SUNDAY_PREP);
  assert.equal(doc.days.filter((d) => has(d, 'playlist')).length, 1, 'only the day it was picked on');
  // Assigned, it rides on Sunday (a rest day for this client).
  await click(buttons().find((b) => /^Assign to/.test(b.textContent)));
  await settle();
  await click(button('Publish to 1 client'));
  await settle();
  const sent = calls.filter(([u, m]) => u === '/api/nutritionist/meal-plan' && m === 'POST').at(-1)[2];
  assert.deepEqual(sent.days[6].playlist, SUNDAY_PREP);
  assert.equal(sent.days.filter((d) => has(d, 'playlist')).length, 1);
  await React.act(async () => { await new Promise((r) => setTimeout(r, 1200)); });
  // Cleared, the key goes: never `playlist: null`.
  await choose(select('Playlist for Sunday'), '');
  assert.equal(shown(select('Playlist for Sunday')), 'No playlist');
  doc = await saved();
  assert.equal(has(doc.days[6], 'playlist'), false);
  assert.equal(playlistKeys(doc), 0);
  assert.equal(soundtrackReads(), 1, 'and not read again for each edit');
});

test('a meal\'s playlist is picked on the meal and cleared, writing and removing `meal.playlist`, and the week marks it ♪', async () => {
  stubFetch();
  await mount(builder());
  await click(cell('Sunday', 'Lunch').querySelector('.dmb-meal'));
  const sel = select('Sun soup playlist');
  assert.ok(sel, 'the meal\'s picker names the meal');
  assert.equal(document.querySelector('[data-peek] [data-meal-playlist]').textContent.startsWith('♪ Playlist'), true);
  assert.deepEqual(options(sel), ['No playlist', 'Sunday prep · 12 tracks', 'Batch cook · 1 track', 'Quiet lunch']);
  assert.equal(/♪/.test(cell('Sunday', 'Lunch').textContent), false);
  await choose(sel, 'id:st-3');
  assert.equal(shown(select('Sun soup playlist')), 'Batch cook · 1 track');
  assert.equal(/♪/.test(cell('Sunday', 'Lunch').textContent), true, 'the week marks the meal');
  assert.equal(cell('Sunday', 'Lunch').querySelector('.dmb-marks').getAttribute('aria-label'), 'a playlist');
  let doc = await saved();
  assert.deepEqual(doc.days[6].slots[1].playlist, BATCH);
  assert.equal(has(doc.days[6].slots[0], 'playlist'), false, 'only the meal it was picked on');
  assert.equal(has(doc.days[6], 'playlist'), false, 'and not the day');
  // The assignment sends it with that meal.
  const out = W.buildAssignment(DashMeals, doc, { trainingDows: [0, 2, 4] });
  assert.deepEqual(out.days[6].meals.find((m) => m.title === 'Sun soup').playlist, BATCH);
  await choose(select('Sun soup playlist'), '');
  doc = await saved();
  assert.equal(has(doc.days[6].slots[1], 'playlist'), false);
  assert.equal(playlistKeys(doc), 0);
  assert.equal(/♪/.test(cell('Sunday', 'Lunch').textContent), false);
  assert.equal(document.querySelectorAll('button button').length, 0, 'no button inside another');
});

test('a playlist the day or meal already has stays shown and selected when the list lacks it; one saved without an id matches by name', async () => {
  stubFetch();
  const doc = weekDoc();
  doc.days[6].playlist = { id: 'gone', name: 'Old prep mix', meta: '5 tracks' };
  doc.days[6].slots[0].playlist = { name: 'Legacy brunch', meta: '' };
  doc.days[6].slots[1].playlist = { name: 'Batch cook', meta: '1 track' };
  // Renamed since: the id is the playlist.
  doc.days[0].playlist = { id: 'st-1', name: 'Sunday prep (old name)', meta: '3 tracks' };
  await mount(builder({ template: TEMPLATE(doc) }));
  const mon = select('Playlist for Monday');
  assert.equal(shown(mon), 'Sunday prep · 12 tracks', 'matched by id');
  assert.equal(options(mon).some((o) => /old name/.test(o)), false);
  await click(document.querySelector('.dmb-dayhead[data-day="Sunday"]'));
  const day = select('Playlist for Sunday');
  assert.equal(shown(day), 'Old prep mix · 5 tracks');
  assert.deepEqual(options(day), ['No playlist', 'Old prep mix · 5 tracks', 'Sunday prep · 12 tracks', 'Batch cook · 1 track', 'Quiet lunch']);
  await click(cell('Sunday', 'Breakfast').querySelector('.dmb-meal'));
  assert.equal(shown(select('Sun eggs playlist')), 'Legacy brunch');
  await click(cell('Sunday', 'Lunch').querySelector('.dmb-meal'));
  const lunch = select('Sun soup playlist');
  assert.equal(shown(lunch), 'Batch cook · 1 track', 'matched by name');
  assert.equal(options(lunch).filter((o) => /Batch cook/.test(o)).length, 1, 'listed once');
  // Picking another and back writes what the list has, with its id.
  await choose(lunch, 'id:st-1');
  await choose(select('Sun soup playlist'), 'id:st-3');
  const out = await saved();
  assert.deepEqual(out.days[6].slots[1].playlist, BATCH);
  assert.deepEqual(out.days[6].playlist, { id: 'gone', name: 'Old prep mix', meta: '5 tracks' }, 'untouched, the day keeps its own');
});

test('signed out there is no list to read: no fetch, "No playlists yet", and a day\'s own playlist still shown', async () => {
  stubFetch();
  const doc = weekDoc();
  doc.days[0].playlist = clone(SUNDAY_PREP);
  await mount(builder({ live: false, template: TEMPLATE(doc) }));
  assert.equal(soundtrackReads(), 0);
  await click(document.querySelector('.dmb-dayhead[data-day="Tuesday"]'));
  const tue = select('Playlist for Tuesday');
  assert.deepEqual(options(tue), ['No playlist', 'No playlists yet']);
  assert.equal(tue.options[1].disabled, true);
  await click(document.querySelector('.dmb-dayhead[data-day="Monday"]'));
  const mon = select('Playlist for Monday');
  assert.equal(shown(mon), 'Sunday prep · 12 tracks');
  assert.deepEqual(options(mon), ['No playlist', 'Sunday prep · 12 tracks']);
  // A read that fails leaves the list empty too, and the day keeps its own.
  stubFetch({ soundtracksOk: false });
  await mount(builder({ template: TEMPLATE(doc) }));
  assert.equal(soundtrackReads(), 1);
  await click(document.querySelector('.dmb-dayhead[data-day="Monday"]'));
  assert.equal(shown(select('Playlist for Monday')), 'Sunday prep · 12 tracks');
});

test('a rest day\'s own version of a meal takes its own playlist, which rides on the rest day', async () => {
  stubFetch();
  const doc = weekDoc();
  const soup = doc.days[6].slots[1];
  doc.days = [doc.days[6]];
  doc.days[0].variants = { rest: { overrides: { [soup.id]: { ...clone(soup), name: 'Rest soup' } }, extras: [] } };
  await mount(builder({ template: TEMPLATE(doc) }));
  await click(buttons().find((b) => /^Rest days/.test(b.textContent)));
  await click(cell('Sunday', 'Lunch').querySelector('.dmb-meal'));
  await choose(select('Rest soup playlist'), 'id:st-1');
  const out = await saved();
  assert.deepEqual(out.days[0].variants.rest.overrides[soup.id].playlist, SUNDAY_PREP);
  assert.equal(has(out.days[0].slots[1], 'playlist'), false, 'the training-day meal keeps none');
  const sent = DashMeals.buildMealAssignment(out, { trainingDows: [0] });
  assert.deepEqual(sent.days[1].meals.find((m) => m.title === 'Rest soup').playlist, SUNDAY_PREP);
  assert.equal(has(sent.days[0].meals.find((m) => m.title === 'Sun soup'), 'playlist'), false);
});

// ── The client's meals card shows them (owner, 2026-11-10: "does the website builder show the playlist on
// the client card too?") ──
// DashMealLedgerCard (dashClient.jsx) is the member's meals card on the website dashboard and nutrition page,
// and the card the builder's Client preview draws. It says the day's playlist and each meal's as the workout
// card does (♪ name · meta), so what the nutritionist previews is what the member reads.
test('the Client preview hands the meals card the day\'s playlist and each meal\'s', async () => {
  stubFetch();
  const doc = weekDoc();
  doc.days[6].playlist = clone(SUNDAY_PREP);
  doc.days[6].slots[1].playlist = clone(BATCH);
  const seen = [];
  const was = globalThis.DashMealLedgerCard;
  globalThis.DashMealLedgerCard = (p) => { seen.push(p); return null; };
  try {
    await mount(builder({ template: TEMPLATE(doc) }));
    await click(document.querySelector('.dmb-dayhead[data-day="Sunday"]'));
    const box = [...document.querySelectorAll('label')].find((l) => /Client preview/.test(l.textContent)).querySelector('input');
    await click(box);
    const last = seen[seen.length - 1];
    assert.ok(last, 'the client preview did not render');
    assert.deepEqual(last.playlist, SUNDAY_PREP, 'the day\'s playlist');
    assert.deepEqual(Object.fromEntries(last.meals.map((m) => [m.title, m.playlist])), { 'Sun eggs': null, 'Sun soup': BATCH }, 'each meal\'s, or none');
    // A day with none hands none.
    await click(document.querySelector('.dmb-dayhead[data-day="Tuesday"]'));
    const tue = seen[seen.length - 1];
    assert.equal(tue.playlist, null);
    assert.deepEqual(tue.meals.map((m) => m.playlist), [null]);
  } finally { globalThis.DashMealLedgerCard = was; }
});

test('the meals card says the day\'s playlist and each meal\'s, a swapped meal keeping its own; with none it says nothing', async () => {
  const RDS = require_('react-dom/server');
  const { DashMealLedgerCard } = await loadRealModule(ND('dashClient.jsx'), { registry: new Map([['react', React]]), appendExports: 'export { DashMealLedgerCard };' });
  const meals = [
    { id: 'm1', slot: 'Breakfast', title: 'Oats', kcal: 450, p: 30, c: 50, f: 10, alts: [{ name: 'Eggs', kcal: 400, p: 30, c: 5, f: 25 }], playlist: { id: 'st-2', name: 'Breakfast beats', meta: '4 tracks' } },
    { id: 'm2', slot: 'Lunch', title: 'Bowl', kcal: 600, p: 45, c: 60, f: 18, alts: [], playlist: null },
  ];
  const targets = { kcal: 2000, p: 150, c: 200, f: 60 };
  const ledger = { kcal: 0, p: 0, c: 0, f: 0 };
  const html = RDS.renderToStaticMarkup(React.createElement(DashMealLedgerCard, { meals, targets, ledger, playlist: SUNDAY_PREP, interactive: false }));
  assert.match(html, /data-meal-card-playlist="day"[^>]*>♪ Sunday prep · 12 tracks</, 'the day\'s playlist');
  assert.match(html, /data-meal-card-playlist="m1"[^>]*>♪ Breakfast beats · 4 tracks</, 'the meal\'s');
  assert.equal((html.match(/data-meal-card-playlist=/g) || []).length, 2, 'the meal without one says none');
  const bare = RDS.renderToStaticMarkup(React.createElement(DashMealLedgerCard, { meals: meals.map((m) => ({ ...m, playlist: null })), targets, ledger, interactive: false }));
  assert.equal(/data-meal-card-playlist|♪/.test(bare), false, 'a plan without playlists reads as before');
});

test('the member\'s dashboard and nutrition page hand the card the plan\'s playlists', () => {
  const src = (f) => readFileSync(ND(f), 'utf8');
  const dash = src('dashClient.jsx');
  assert.match(dash, /playlist: m\.playlist && m\.playlist\.name \? m\.playlist : null,/);
  assert.match(dash, /mealDayPlaylist = day && day\.playlist && day\.playlist\.name \? day\.playlist : null;/);
  assert.match(dash, /<DashMealLedgerCard[\s\S]{0,300}playlist=\{mealDayPlaylist\}/);
  const nutri = src('dashNutri.jsx');
  assert.match(nutri, /playlist: m\.playlist && m\.playlist\.name \? m\.playlist : null,/);
  assert.match(nutri, /playlist=\{pickedDay && pickedDay\.playlist && pickedDay\.playlist\.name \? pickedDay\.playlist : null\}/);
});
