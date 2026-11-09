// Coach dashboard step 6c, part 2 (the owner's coach review, 4 Nov 2026: "One day at a time, with
// Shape Kitchen out of reach"): the meal-plan builder as the week on one screen. These read the real
// week module (dashMealWeek.js) over the real core (dashMealCore.js) and the real Shape Kitchen
// catalog (recipes.jsx's SHAPE_RECIPES, the 100 recipes /recipes shows), and mount the SHIPPED
// builder (dashMealBuilder.jsx's DmbBuilder, and the library page that opens it) in jsdom over the
// real tier marks and row keys (dashToday.jsx, loaded after dashData.jsx) and read what a
// nutritionist reads:
//   1. the week: the plan's days across, Breakfast, Lunch, Dinner and Snack down, the weekdays each
//      day is served on, and each day's total against its target with its status in words;
//   2. the bug the review found: a meal is filed under the row it lands on, and the "+ Meal" left in
//      the day editor gives Breakfast, Lunch, Dinner, then Snacks, never Lunch after Lunch;
//   3. Shape Kitchen beside the week: Kitchen 100 and Mine, search, High protein, Vegetarian and
//      Under 20 min, the plan's exclusions, and the new total a recipe would make ("1,370 → 1,710");
//   4. training and rest days: a rest day measured against the plan's rest-day target when it has
//      one, said so when it has none, and the assignment sending it;
//   5. one ring for the picked day, with its status chip;
//   6. groceries' first three and "+ N more", and Assign naming the client, with who is on it read
//      from the library's usage read (never a sample);
//   7. less chrome: no layout switch, Publish vN or Save template; the plan saves and stamps its
//      version, and a note to the client rides the assignment;
//   8. a day goes through ShapeConfirm, and no button sits inside another.
// Compares booleans and strings, never DOM nodes (tests/assert-dom-value.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const read = (f) => readFileSync(ND(f), 'utf8');
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
const ShapeProfileLib = await import('../public/newdesign/profileCustom.mjs');
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
// dashData.jsx first, as the pages load it, then dashToday.jsx's marks and row keys.
share(await loadRealModule(ND('dashData.jsx'), { registry: new Map([['/newdesign/unitText.mjs', U]]), appendExports: 'export { useSignedIn };' }));
share(await loadRealModule(ND('dashToday.jsx'), { appendExports: 'export { DashPill, DashDemoBand, dashRouteParam, dashClientHref, DashClientGem, dashRecordTier, dashTierMark, dashRowKeyOpen };' }));
share(await loadRealModule(ND('dashFilterBar.jsx'), { appendExports: 'export { DashFilterBar, DashFacetMenu, DFB_EMPTY, dfbRun, DashLibSort, DashLibTopLine, DashLibDrawer, DashLibPeople, DashLibCard, DashLibMenu, DASH_LIB_ROSTER_UNREAD, dashLibRosterState, dashLibWeekEnd, dashLibKind, dashLibDayKey, dashLibWeekStartKey, useDfbPopShift };' }));
share(await loadRealModule(ND('coachBuilderLayouts.jsx'), { appendExports: 'export { coachTemplateCopy };' }));
// Shape Kitchen: the catalog the pages load (recipes.jsx sets window.SHAPE_RECIPES and recipeNeeds).
await loadRealModule(ND('recipes.jsx'), {});
const RECIPES = window.SHAPE_RECIPES;
const { DmbBuilder, NutritionistPlansPage } = await loadRealModule(ND('dashMealBuilder.jsx'), { appendExports: 'export { DmbBuilder, NutritionistPlansPage };' });

// ── Fixtures ──────────────────────────────────────────────────────────────────
const NOW = new Date();
const uid = (i) => String(i).padStart(8, '0') + '-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ready = { state: 'ready', checkedAt: NOW.toISOString() };
const person = (i, name, over = {}) => ({ profile: { id: uid(i), name, isNew: false }, rankPoints: 2240, progressRead: ready, checkIn: null, milestones: null, goal: null, goalPhase: null, ...over });
const NUTRI = () => [person(1, 'Tess Byrne', { rankPoints: null }), person(2, 'Priya Shah')];
let n = 0;
const dish = (name, kcal, p, slot, extra = {}) => ({ ...DashMeals.newMeal({ name, kcal, p, c: Math.round(kcal / 10), f: Math.round(kcal / 40), ingredients: [{ name: name + ' base', qty: 1, unit: '' }] }, slot), id: 'fx' + (++n), ...extra });
// The review's week: 1,900 kcal and 165 g protein on training days, 1,700 on rest days. Monday is
// short of protein, Wednesday 1,960, Sunday 1,370.
function weekDoc() {
  const doc = DashMeals.newPlan('Rae week', 'cut');
  doc.version = 2;
  doc.restTargets = { kcal: 1700, p: 165, c: 150, f: 55 };
  const day = (name, meals) => ({ name, slots: meals, variants: {} });
  const full = (name) => day(name, [dish(name + ' oats', 500, 45, 'Breakfast'), dish(name + ' bowl', 600, 50, 'Lunch'), dish(name + ' salmon', 600, 50, 'Dinner'), dish(name + ' yogurt', 200, 20, 'Snack')]);
  doc.days = [
    day('Monday', [dish('Mon oats', 500, 30, 'Breakfast'), dish('Mon bowl', 600, 30, 'Lunch'), dish('Mon pasta', 600, 40, 'Dinner'), dish('Mon bar', 200, 20, 'Snack')]),
    full('Tuesday'),
    day('Wednesday', [dish('Wed oats', 520, 45, 'Breakfast', { note: 'Use the vanilla whey' }), dish('Wed bowl', 640, 50, 'Lunch'), dish('Wed salmon', 600, 50, 'Dinner'), dish('Wed yogurt', 200, 20, 'Snack')]),
    full('Thursday'), full('Friday'), full('Saturday'),
    day('Sunday', [dish('Sun eggs', 420, 40, 'Breakfast'), dish('Sun soup', 450, 35, 'Lunch'), dish('Sun chicken', 500, 50, 'Dinner')]),
  ];
  return doc;
}
const TEMPLATE = (over = {}) => ({ id: 'meal-1', name: 'Rae week', detail: { revision: 3, mealBuilder: weekDoc() }, ...over });

let calls = [];
function stubFetch({ ok = true, usage = { usage: {}, capped: false, untracked: 0 }, meals = null } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push([u, method, body]);
    if (u.includes('/api/coach/plans/usage')) return { ok: true, status: 200, json: async () => usage };
    if (u === '/api/coach/plans' && (method === 'POST' || method === 'PATCH')) {
      if (!ok) return { ok: false, status: 500, json: async () => ({ error: 'Offline' }) };
      return { ok: true, json: async () => ({ plan: { ...body, id: body.id, detail: { ...body.detail, revision: (body.expectedRevision || 0) + 1 } } }) };
    }
    if (u === '/api/nutritionist/meal-plan') return { ok: true, json: async () => ({ ok: true }) };
    if (u.includes('kind=meal_plan')) return { ok: true, json: async () => ({ ownerId: 'coach-a', plans: meals || [] }) };
    return { ok: true, json: async () => ({}) };
  };
}
let confirms = [];
function stubConfirm(answer) {
  confirms = [];
  window.ShapeConfirm = { open: async (o) => { confirms.push(o); return answer; } };
  window.confirm = () => { throw new Error('window.confirm was called'); };
}
// The coach's own kitchen (user_goals profile_custom), read through shapeDb.
let kitchenReads = 0;
function stubKitchen(doc, { fail = false } = {}) {
  kitchenReads = 0;
  window.shapeDb = { getSession: async () => ({}), getUserGoals: async (kind, o) => { kitchenReads++; assert.equal(kind, 'profile_custom'); assert.equal(o.expectedUserId, 'coach-a'); if (fail) return null; return doc; } };
  window.ShapeProfileLib = ShapeProfileLib;
}

let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await settle();
}
async function settle() { for (let i = 0; i < 5; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }
const pause = (ms) => React.act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const builder = (over = {}) => React.createElement(DmbBuilder, { template: TEMPLATE(), clients: NUTRI(), queue: [], lifecycle: null, live: true, customFoods: [], ownerId: 'coach-a', onBack: () => {}, onSaved: () => {}, ...over });
// An element's words as a reader meets them: each text run once, a space between runs.
const words = (el) => {
  if (!el) return '';
  const out = [];
  const walk = document.createTreeWalker(el, 4);
  let t;
  while ((t = walk.nextNode())) { const s = t.nodeValue.replace(/\s+/g, ' ').trim(); if (s) out.push(s); }
  return out.join(' ');
};
// One line's text, for a line React writes in several runs ("v" + 3 + " · Saved").
const line = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const buttons = (scope = document) => [...scope.querySelectorAll('button')];
const button = (label, scope) => buttons(scope).find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
const click = (el) => React.act(async () => { el.click(); });
const fire = (el, type) => React.act(async () => { el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })); });
async function typeInto(input, value) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const heads = () => [...document.querySelectorAll('.dmb-dayhead')].map(words);
const head = (day) => words(document.querySelector('.dmb-dayhead[data-day="' + day + '"]'));
const cell = (day, slot) => document.querySelector('[data-cell="' + day + '|' + slot + '"]');
const cellMeals = (day, slot) => [...cell(day, slot).querySelectorAll('.dmb-meal b')].map((b) => b.textContent);
const cards = () => [...document.querySelectorAll('.dmb-recipe')];
const card = (name) => cards().find((c) => c.getAttribute('data-recipe') === name);
const lastSave = () => calls.filter(([u, m]) => u === '/api/coach/plans' && (m === 'POST' || m === 'PATCH')).at(-1);
const noNestedButtons = () => document.querySelectorAll('button button').length === 0;

// ── 1. The week module's rules, over the real catalog ─────────────────────────
test('a rotation day is served on the weekdays the assignment sends it, and a day past the seventh says so', () => {
  assert.deepEqual(W.servedWeekdays(3, 0), [0, 3, 6]);
  assert.equal(W.servedLabel(3, 0), 'Mon · Thu · Sun');
  assert.equal(W.servedLabel(7, 2), 'Wed');
  assert.equal(W.servedLabel(1, 0), 'Every day');
  assert.equal(W.servedLabel(8, 7), 'Not served · a week has 7 days');
  // The same rule as the assignment's: day `dow % days` on each weekday.
  const doc = weekDoc();
  doc.days = doc.days.slice(0, 3);
  const out = DashMeals.buildMealAssignment(doc, {});
  for (let i = 0; i < 3; i++) for (const dow of W.servedWeekdays(3, i)) assert.equal(out.days[dow].title, doc.days[i].name);
});

test('a meal is filed under the row it lands on, and a day built without rows is Breakfast, Lunch, Dinner, then Snacks', () => {
  const f = DashMeals.FOODS[4];
  for (const slot of W.ROWS) assert.equal(W.placeMeal(f, slot, DashMeals.newMeal).slot, slot);
  const day = [];
  for (let i = 0; i < 5; i++) day.push(DashMeals.newMeal(f, W.nextSlot(day)));
  assert.deepEqual(day.map((m) => m.slot), ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Snack']);
  assert.equal(W.nextSlot([{ slot: 'Breakfast' }, { slot: 'Dinner' }]), 'Lunch');
  assert.equal(W.firstEmptyRow([{ slot: 'Breakfast' }, { slot: 'Lunch' }]), 'Dinner');
  assert.equal(W.firstEmptyRow(W.ROWS.map((slot) => ({ slot }))), 'Snack');
  // A Kitchen recipe keeps its id on the meal, for the client's app.
  const k = W.kitchenFood(RECIPES.find((r) => r.title === 'Chickpea shakshuka'), window.recipeNeeds);
  assert.equal(W.placeMeal(k, 'Lunch', DashMeals.newMeal).recipeId, 'chickpea-shakshuka');
  // The rows: the four meals, then a slot a stored plan named itself.
  assert.deepEqual(W.slotRows([[{ slot: 'Lunch' }, { slot: 'Pre-workout' }]]), ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout']);
});

test('a day reads On target within 5% of its calories, Under or Over past it, Low P under the protein floor, and Empty with nothing on it', () => {
  const t = { kcal: 1900, p: 165, c: 170, f: 60 };
  const m = (kcal, p) => [{ kcal, p, c: 0, f: 0 }];
  assert.equal(W.dayStatus(m(1960, 165), t, 145).label, 'On target');
  assert.equal(W.dayStatus(m(1995, 165), t, 145).label, 'On target');
  assert.equal(W.dayStatus(m(1996, 165), t, 145).label, 'Over');
  assert.equal(W.dayStatus(m(1805, 165), t, 145).label, 'On target');
  assert.equal(W.dayStatus(m(1804, 165), t, 145).label, 'Under');
  assert.equal(W.dayStatus(m(1370, 145), { ...t, kcal: 1700 }, 145).by, 330);
  assert.equal(W.dayStatus(m(1900, 144), t, 145).label, 'Low P');
  assert.equal(W.dayStatus(m(1900, 145), t, 145).label, 'On target');
  assert.equal(W.dayStatus(m(1900, 148), t, null).label, 'Low P', 'with no floor, under 90% of the protein target');
  assert.equal(W.dayStatus([], t, 145).label, 'Empty');
  assert.equal(W.dayStatus(m(500, 10), { kcal: 0 }, null).label, 'No target');
  // The brief names the day furthest off its calories first, and the count of days off.
  const col = (name, index, meals, tt) => ({ name, index, status: W.dayStatus(meals, tt || t, 145) });
  const b = W.weekBrief([col('Monday', 0, m(1900, 120)), col('Wednesday', 2, m(1960, 165)), col('Sunday', 6, m(1370, 140))]);
  assert.equal(b.text, '2 days are off target: Sunday is 530 kcal under 1,900.');
  assert.equal(b.day, 6);
  assert.equal(W.weekBrief([col('Monday', 0, m(1900, 120))]).text, '1 day is off target: Monday is 25 g short of protein.');
  assert.equal(W.weekBrief([col('Monday', 0, m(1900, 165)), col('Tuesday', 1, [])]).text, 'Every planned day is on target; 1 day is still empty.');
  assert.equal(W.weekBrief([col('Monday', 0, [])]).day, null);
  assert.deepEqual(W.projectDay(m(1370, 0), { kcal: 340 }), { from: 1370, to: 1710 });
});

test('Shape Kitchen is the 100 catalog recipes with the catalog\'s own calories, protein, diet and time', () => {
  const K = W.kitchenFoods(RECIPES, window.recipeNeeds);
  assert.equal(RECIPES.length, 100);
  assert.equal(K.length, 100, 'every catalog recipe is costed, so none is left out');
  const shak = K.find((f) => f.name === 'Chickpea shakshuka');
  const src = RECIPES.find((r) => r.title === 'Chickpea shakshuka');
  assert.equal(shak.kcal, src.kcal); assert.equal(shak.p, src.macros.p); assert.equal(shak.kitchen.diet, 'Vegetarian');
  assert.equal(shak.prepMin, 25);
  // Ingredients become the grocery's lines, per serving (the shakshuka serves 2: 4 eggs → 2).
  assert.deepEqual(shak.ingredients.find((g) => g.name === 'eggs'), { name: 'eggs', qty: 2, unit: '' });
  assert.deepEqual(W.parseIngredient('1 1/2 tbsp margarine, melted (150 kcal)', 1), { name: 'margarine', qty: 1.5, unit: 'tbsp' });
  assert.deepEqual(W.parseIngredient('3/4 cup jasmine rice (240 kcal)', 3), { name: 'jasmine rice', qty: 0.25, unit: 'cup' });
  assert.deepEqual(W.parseIngredient('to taste salt', 2), { name: 'to taste salt', qty: 1, unit: '' });
  assert.equal(W.recipeMinutes('1 hr 20 min'), 80); assert.equal(W.recipeMinutes('soon'), null);
  // The three filters, each the catalog's own rule.
  const hp = W.searchKitchen(K, '', { protein: true });
  assert.ok(hp.length > 0 && hp.every((f) => window.recipeNeeds(RECIPES.find((r) => r.title === f.name)).includes('High-protein') || f.kitchen.tags.includes('High protein')));
  const veg = W.searchKitchen(K, '', { veg: true });
  assert.ok(veg.length > 0 && veg.every((f) => ['Vegetarian', 'Vegan', 'Plant-based'].includes(f.kitchen.diet)));
  assert.equal(veg.length, RECIPES.filter((r) => ['Vegetarian', 'Vegan', 'Plant-based'].includes(r.diet)).length);
  const quick = W.searchKitchen(K, '', { quick: true });
  assert.equal(quick.length, RECIPES.filter((r) => W.recipeMinutes(r.time) < 20).length);
  assert.ok(quick.length > 0 && !quick.some((f) => f.name === 'Chickpea shakshuka'));
  assert.deepEqual(W.searchKitchen(K, 'chickpea shakshuka', {}).map((f) => f.name), ['Chickpea shakshuka']);
  // The plan's exclusions: dairy is the catalog's own list; nuts are read from the ingredients.
  const noDairy = W.searchKitchen(K, '', {}, { exclusions: ['dairy'] });
  assert.ok(noDairy.length > 0 && noDairy.every((f) => window.recipeNeeds(RECIPES.find((r) => r.title === f.name)).includes('Dairy-free')));
  const noNuts = W.searchKitchen(K, '', {}, { exclusions: ['nuts'] });
  assert.ok(!noNuts.some((f) => /almond|peanut|walnut|cashew/i.test(f.kitchen.text)));
  assert.ok(noNuts.length < K.length);
  assert.deepEqual(W.readFromIngredients({ exclusions: ['dairy', 'nuts'] }), ['nuts']);
  assert.equal(W.searchKitchen(K, '', {}, { maxPrep: 10 }).every((f) => f.prepMin <= 10), true);
});

test('a recipe from the coach\'s own kitchen keeps the macros they wrote, and none they did not', () => {
  const a = W.ownRecipeFood({ id: 'r1', t: 'Rae\'s red lentil soup', kcal: 410, p: 24, c: 52, f: 9, min: 30, serves: 2, ing: [{ n: '2 cups', m: 'red lentils' }] });
  assert.equal(a.kcal, 410); assert.equal(a.prepMin, 30); assert.equal(DashMeals.foodHasMacros(a), true);
  assert.deepEqual(a.ingredients, [{ name: 'red lentils', qty: 1, unit: 'cups' }]);
  const b = W.ownRecipeFood({ id: 'r2', t: 'Green shakshuka' });
  assert.equal(DashMeals.foodHasMacros(b), false, 'Macros not set, never 0 kcal');
  assert.equal(b.prepMin, null);
  assert.equal(W.ownRecipeFood({ id: 'r3' }), null);
});

test('a library plan that changes is its next version, once per visit; undone, it is the one it opened; a new plan keeps its own', () => {
  const doc = weekDoc();
  const opened = W.opening(doc, true);
  const edited = { ...doc, targets: { ...doc.targets, p: 170 } };
  assert.equal(W.stampVersion(edited, opened).version, 3);
  assert.equal(W.stampVersion({ ...W.stampVersion(edited, opened), targets: { ...doc.targets, p: 175 } }, opened).version, 3, 'one version per visit');
  assert.equal(W.stampVersion({ ...edited, version: 3, targets: doc.targets }, opened).version, 2, 'edits undone');
  assert.equal(W.stampVersion(edited, W.opening(doc, false)).version, 2, 'not in the library yet');
  assert.equal(W.stampVersion(doc, opened), doc, 'nothing changed, nothing copied');
});

test('spreading a rotation over the week changes nothing a client gets, and every copy has its own meal ids', () => {
  const doc = weekDoc();
  doc.days = doc.days.slice(0, 2);
  const rest = DashMeals.newMeal(DashMeals.FOODS[0], 'Lunch');
  doc.days[0].variants = { rest: { overrides: { [doc.days[0].slots[1].id]: { ...rest, id: doc.days[0].slots[1].id } }, extras: [] } };
  const before = DashMeals.buildMealAssignment(doc, { trainingDows: [0, 2, 4] });
  const wide = W.spreadWeek(doc);
  assert.deepEqual(wide.days.map((d) => d.name), W.WEEKDAY_NAMES);
  const after = DashMeals.buildMealAssignment(wide, { trainingDows: [0, 2, 4] });
  const what = (o) => o.days.map((d) => [d.tag, d.meals.map((m) => m.title + ':' + m.kcal + ':' + m.slot)]);
  assert.deepEqual(what(after), what(before));
  const ids = wide.days.flatMap((d) => d.slots.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const d of wide.days) for (const k of Object.keys((d.variants.rest || {}).overrides || {})) assert.ok(d.slots.some((m) => m.id === k), 'an override follows its copy');
  assert.equal(W.spreadWeek(weekDoc()).days.length, 7, 'a week stays a week');
});

test('the assignment sends a rest day its own target, a meal\'s note as coachNote, and a Kitchen meal\'s recipe', () => {
  const doc = weekDoc();
  doc.days[2].slots[1].recipeId = 'chickpea-shakshuka';
  const out = W.buildAssignment(DashMeals, doc, { trainingDows: [0, 2, 3, 4], scale: 1.1 });
  assert.equal(out.days[0].tag, 'TRAIN'); assert.equal(out.days[0].targets.cal, Math.round(1900 * 1.1));
  assert.equal(out.days[1].tag, 'TRAIN', 'no rest version: the core serves the training day');
  // A day with a rest version is a rest day on the client's rest weekdays, measured against 1,700.
  doc.days[1].variants = { rest: { overrides: {}, extras: [] } };
  const rest = W.buildAssignment(DashMeals, doc, { trainingDows: [0, 2, 3, 4] });
  assert.equal(rest.days[1].tag, 'REST');
  assert.deepEqual(rest.days[1].targets, { cal: 1700, p: 165, c: 150, f: 55 });
  assert.equal(rest.days[2].meals[0].coachNote, 'Use the vanilla whey');
  assert.equal(rest.days[2].meals[1].recipeId, 'chickpea-shakshuka');
  assert.equal('coachNote' in rest.days[2].meals[1], false, 'a meal with no note sends none');
  // Scaled like the training target.
  assert.deepEqual(W.buildAssignment(DashMeals, doc, { trainingDows: [0], scale: 1.2 }).days[1].targets, { cal: 2040, p: 198, c: 180, f: 66 });
  // A rest day's notes are read off the rest day as the client gets it: with its breakfast removed,
  // the lunch is its first meal, and the lunch's note goes with it.
  doc.days[1].variants.rest.overrides = { [doc.days[1].slots[0].id]: null };
  doc.days[1].slots[1].note = 'Pack this one';
  const shifted = W.buildAssignment(DashMeals, doc, { trainingDows: [0] });
  assert.equal(shifted.days[1].meals[0].title, doc.days[1].slots[1].name);
  assert.equal(shifted.days[1].meals[0].coachNote, 'Pack this one');
  // No rest-day target: exactly the core's snapshot.
  const plain = weekDoc(); delete plain.restTargets; plain.days[1].variants = { rest: { overrides: {}, extras: [] } };
  for (const m of plain.days[2].slots) delete m.note;
  assert.deepEqual(W.buildAssignment(DashMeals, plain, { trainingDows: [0] }), DashMeals.buildMealAssignment(plain, { trainingDows: [0] }));
  assert.equal(W.targetsFor(plain, 'rest').kcal, 1900); assert.equal(W.hasRestTargets(plain), false);
  const g = W.groceryTop([{ name: 'B', meals: ['x'] }, { name: 'A', meals: ['x', 'y'] }, { name: 'C', meals: [] }, { name: 'D', meals: ['x'] }], 3);
  assert.deepEqual(g.top.map((x) => x.name), ['A', 'B', 'D']); assert.equal(g.more, 1);
});

// ── 2. The builder, mounted ──────────────────────────────────────────────────
test('the week is one screen: days across, the four meals down, each day\'s total against its target and its status in words', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  const rows = [...document.querySelectorAll('.dmb-week tbody th')].map(words);
  assert.deepEqual(rows, ['Breakfast', 'Lunch', 'Dinner', 'Snack']);
  assert.equal(heads().length, 7);
  assert.equal(head('Monday'), 'Monday Mon 1,900 / 1,900 Low P');
  assert.equal(head('Wednesday'), 'Wednesday Wed 1,960 / 1,900 On target');
  assert.equal(head('Sunday'), 'Sunday Sun 1,370 / 1,900 Under');
  assert.equal(document.querySelector('.dmb-dayhead[data-day="Sunday"] .dmb-chip').getAttribute('data-status'), 'under');
  assert.deepEqual(cellMeals('Sunday', 'Snack'), []);
  assert.equal(words(cell('Sunday', 'Snack')), '＋ Snack', 'an empty meal says which it is');
  assert.deepEqual(cellMeals('Wednesday', 'Lunch'), ['Wed bowl']);
  assert.match(words(cell('Wednesday', 'Breakfast')), /520 kcal · 45 g P ✎/, 'the note to the client is a small mark');
  // The brief: one sentence, one action, standing first.
  assert.equal(words(document.querySelector('[data-brief]')), '2 days are off target: Sunday is 530 kcal under 1,900. Open Sunday');
  assert.ok(document.querySelector('[data-brief]').compareDocumentPosition(document.querySelector('[data-week]')) & 4, 'the brief stands above the week');
  // Less chrome.
  for (const gone of ['Guided', 'Editor', 'Planner', 'Save template', 'Continue →']) assert.equal(!!button(gone), false, gone + ' is back');
  assert.equal(buttons().some((b) => /^Publish v\d/.test(b.textContent)), false);
  assert.equal(noNestedButtons(), true);
});

test('the picked day has one ring: its calories of its target, protein, carbs and fat round it, and its status chip', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  await click(document.querySelector('.dmb-dayhead[data-day="Wednesday"]'));
  const ring = document.querySelector('[data-ring]');
  assert.equal(line(ring.querySelector('.dmb-ring-line')), 'Wednesday: 1,960 of 1,900 kcal');
  assert.equal(words(ring.querySelector('.dmb-chip')), 'On target');
  assert.match(line(ring.querySelector("dl")), /^Protein165\/165 gCarbs\d+\/170 gFat\d+\/60 g$/);
  await click(button('Open Sunday'));
  assert.equal(line(document.querySelector('[data-ring] .dmb-ring-line')), 'Sunday: 1,370 of 1,900 kcal');
});

test('rest days are measured against the plan\'s rest-day target, and say so when it has none', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  await click(buttons().find((b) => /^Rest days/.test(b.textContent)));
  assert.equal(head('Sunday'), 'Sunday Sun 1,370 / 1,700 Under');
  assert.equal(head('Tuesday'), 'Tuesday Tue 1,900 / 1,700 Over');
  assert.match(words(document.querySelector('[data-brief]')), /Sunday is 330 kcal under 1,700|Tuesday is 200 kcal over 1,700/);
  // Without a rest-day target, a rest day is the training target, said in words, never "0/1900".
  const t = TEMPLATE(); delete t.detail.mealBuilder.restTargets;
  await mount(builder({ template: t }));
  const rest = buttons().find((b) => /^Rest days/.test(b.textContent));
  assert.equal(rest.textContent, 'Rest days · 1,900 (same)');
  await click(rest);
  assert.match(words(document.querySelector('[data-week]')), /rest days use the training target until you set one/);
  // Setting one in the fold measures them against it, and it saves.
  await click(document.querySelector('details.dmb-settings input[type="checkbox"]'));
  await typeInto(document.querySelector('[aria-label="Rest-day kcal target"]'), '1650');
  assert.equal(head('Sunday'), 'Sunday Sun 1,370 / 1,650 Under');
  await click(button('← Library'));
  assert.equal(lastSave()[2].detail.mealBuilder.restTargets.kcal, 1650);
});

test('Shape Kitchen sits beside the week: Kitchen 100 and Mine, search, its filters, and Rae\'s own Chickpea shakshuka', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  const tabs = [...document.querySelectorAll('[data-kitchen] [role="tab"]')].map(words);
  assert.equal(tabs[0], 'Kitchen 100');
  assert.match(tabs[1], /^Mine/);
  assert.equal(cards().length, 100);
  await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), 'shakshuka');
  assert.deepEqual(cards().map((c) => c.getAttribute('data-recipe')), ['Chickpea shakshuka']);
  assert.equal(words(card('Chickpea shakshuka')), 'Chickpea shakshuka 430 kcal · 22 g P Vegetarian · 25 min');
  await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), '');
  for (const label of ['High protein', 'Vegetarian', 'Under 20 min']) assert.equal(!!button(label, document.querySelector('[data-kitchen]')), true, label);
  await click(button('Vegetarian', document.querySelector('[data-kitchen]')));
  const K = W.kitchenFoods(RECIPES, window.recipeNeeds);
  assert.equal(cards().length, W.searchKitchen(K, '', { veg: true }).length);
  await click(button('Under 20 min', document.querySelector('[data-kitchen]')));
  assert.deepEqual(cards().map((c) => c.getAttribute('data-recipe')), W.searchKitchen(K, '', { veg: true, quick: true }).map((f) => f.name));
  assert.equal(button('Vegetarian', document.querySelector('[data-kitchen]')).getAttribute('aria-pressed'), 'true', 'a filter says it is on');
});

test('the plan\'s exclusions filter the Kitchen, and say which ones are read from the ingredients', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  const t = TEMPLATE(); t.detail.mealBuilder.constraints.exclusions = ['dairy', 'nuts'];
  await mount(builder({ template: t }));
  const K = W.kitchenFoods(RECIPES, window.recipeNeeds);
  assert.equal(cards().length, W.searchKitchen(K, '', {}, { exclusions: ['dairy', 'nuts'] }).length);
  assert.match(words(document.querySelector('[data-kitchen]')), /Filtered · no dairy, nuts \(nuts read from each recipe’s ingredients\)/);
});

test('a recipe lands in the meal it is put on, and the day says the new total first: 1,370 → 1,710', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  await click(button('Add to Sunday · Snack'));
  assert.match(line(document.querySelector('[data-kitchen-target]')), /^Adding to Sunday · Snack\./);
  assert.equal(cell('Sunday', 'Snack').classList.contains('is-target'), true);
  const K = W.kitchenFoods(RECIPES, window.recipeNeeds);
  const pick = K.find((f) => f.kcal === 340) || K[0];
  await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), pick.name);
  const c = card(pick.name);
  await React.act(async () => { c.focus(); });
  assert.equal(words(document.querySelector('.dmb-dayhead[data-day="Sunday"] [data-proj]')), '1,370 → ' + (1370 + pick.kcal).toLocaleString('en-US'));
  assert.equal(document.querySelectorAll('[data-proj]').length, 1, 'only the day it would land on');
  await click(c);
  assert.deepEqual(cellMeals('Sunday', 'Snack'), [pick.name]);
  assert.match(head('Sunday'), new RegExp('^Sunday Sun ' + (1370 + pick.kcal).toLocaleString('en-US') + ' / 1,900'));
  await click(button('← Library'));
  const saved = lastSave()[2].detail.mealBuilder.days[6].slots.at(-1);
  assert.equal(saved.slot, 'Snack', 'filed under the row, never Lunch');
  assert.equal(saved.name, pick.name); assert.equal(saved.kcal, pick.kcal); assert.equal(saved.recipeId, pick.recipeId);
  assert.ok(saved.ingredients.length > 0, 'its ingredients reach the groceries');
});

test('dragging a recipe onto Sunday\'s empty snack shows the new total and drops it there', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), 'shakshuka');
  await fire(card('Chickpea shakshuka'), 'dragstart');
  const td = cell('Sunday', 'Snack').parentElement;
  await fire(td, 'dragover');
  assert.equal(words(document.querySelector('.dmb-dayhead[data-day="Sunday"] [data-proj]')), '1,370 → 1,800');
  assert.equal(cell('Sunday', 'Snack').classList.contains('is-target'), true);
  await fire(td, 'drop');
  assert.deepEqual(cellMeals('Sunday', 'Snack'), ['Chickpea shakshuka']);
  assert.equal(document.querySelectorAll('[data-proj]').length, 0, 'the projection goes with the drag');
});

test('the Lunch bug: four meals put on an empty day\'s rows read Breakfast, Lunch, Dinner, Snack, and the day editor\'s + Meal never files Lunch after Lunch', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  const t = TEMPLATE(); t.detail.mealBuilder.days = [{ name: 'Day A', slots: [], variants: {} }];
  await mount(builder({ template: t }));
  const names = ['Chickpea shakshuka', 'One-pan chicken and rice', 'Greek yogurt power bowl', 'Overnight oats, three ways'];
  for (const [i, slot] of W.ROWS.entries()) {
    await click(button('Add to Day A · ' + slot));
    await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), names[i]);
    await click(card(names[i]));
  }
  for (const [i, slot] of W.ROWS.entries()) assert.deepEqual(cellMeals('Day A', slot), [names[i]]);
  // With nothing picked, the Kitchen fills the day's first empty meal, in order.
  const t2 = TEMPLATE(); t2.detail.mealBuilder.days = [{ name: 'Day B', slots: [], variants: {} }];
  await mount(builder({ template: t2 }));
  for (const name of names) {
    await click(document.querySelector('.dmb-dayhead[data-day="Day B"]'));
    await typeInto(document.querySelector('[aria-label="Search Shape Kitchen"]'), name);
    await click(card(name));
  }
  for (const [i, slot] of W.ROWS.entries()) assert.deepEqual(cellMeals('Day B', slot), [names[i]]);
  // The day editor's own + Meal (a dish typed by name): Breakfast, Lunch, Dinner, Snack.
  const t3 = TEMPLATE(); t3.detail.mealBuilder.days = [{ name: 'Day C', slots: [], variants: {} }];
  await mount(builder({ template: t3 }));
  for (const dishName of ['Jollof rice', 'Egusi soup', 'Suya plate', 'Chin chin']) {
    await click(document.querySelector('.dmb-dayhead[data-day="Day C"]'));
    await click(button('+ Meal'));
    await typeInto(document.querySelector('input[placeholder^="Search foods"]'), dishName);
    await click(buttons().find((b) => b.textContent.includes('Add “' + dishName + '”')));
  }
  assert.deepEqual(W.ROWS.map((slot) => cellMeals('Day C', slot)), [['Jollof rice'], ['Egusi soup'], ['Suya plate'], ['Chin chin']]);
});

test('picking a meal opens that one meal under the week, with its swaps, night-before prep and a note to the client', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  assert.equal(document.querySelectorAll('[data-peek] [aria-label$=" Calories"]').length, 0, 'no meal open until one is picked');
  await click(cell('Sunday', 'Lunch').querySelector('.dmb-meal'));
  assert.deepEqual([...document.querySelectorAll('[data-peek] [aria-label$=" Calories"]')].map((i) => i.getAttribute('aria-label')), ['Sun soup Calories']);
  assert.equal(!!document.querySelector('[data-peek] [data-night-before]'), true);
  assert.equal(!!button('+ Alternate', document.querySelector('[data-peek]')), true);
  await typeInto(document.querySelector('[aria-label="Sun soup note to the client"]'), 'Make a double batch');
  assert.match(words(cell('Sunday', 'Lunch')), /✎/);
  await click(button('← Library'));
  assert.equal(lastSave()[2].detail.mealBuilder.days[6].slots[1].note, 'Make a double batch');
});

test('the plan saves as it changes and stamps its next version; the assign sheet sends that version', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  const chip = () => line(document.querySelector('[data-save]'));
  assert.equal(chip(), 'v2 · Saved');
  await typeInto(document.querySelector('[aria-label="Daily Protein g target"]'), '170');
  assert.equal(chip(), 'v3 · Unsaved edits');
  await pause(1300); await settle();
  assert.equal(chip(), 'v3 · Saved');
  const first = lastSave();
  assert.equal(first[1], 'PATCH'); assert.equal(first[2].detail.mealBuilder.version, 3); assert.equal(first[2].expectedRevision, 3);
  await typeInto(document.querySelector('[aria-label="Daily Protein g target"]'), '172');
  assert.equal(chip(), 'v3 · Unsaved edits', 'one version per visit');
  await click(buttons().find((b) => /^Assign to/.test(b.textContent)));
  assert.match(document.body.textContent, /snapshot v3/);
  // A copy keeps the version it came with.
  await mount(builder({ template: { ...TEMPLATE(), id: null, sourceName: 'Rae week' } }));
  await typeInto(document.querySelector('[aria-label="Daily Protein g target"]'), '170');
  assert.equal(chip(), 'v2 · Unsaved edits');
});

test('a failed save says so, never assigns, and retries', async () => {
  stubFetch({ ok: false }); stubConfirm(true); stubKitchen({});
  await mount(builder());
  await typeInto(document.querySelector('[aria-label="Daily kcal target"]'), '1950');
  await click(buttons().find((b) => /^Assign to/.test(b.textContent)));
  assert.match(words(document.querySelector('[role="alert"]')), /^Offline Retry save$/);
  assert.equal(/Put clients on it\./.test(document.body.textContent), false);
  assert.equal(line(document.querySelector('[data-save]')), 'v3 · Save failed');
});

test('groceries show their first three items and how many more, and the whole list opens in place', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder());
  const list = DashMeals.buildMealAssignment(weekDoc(), { scale: 1 }).grocery;
  const g = document.querySelector('[data-grocery]');
  assert.equal(g.querySelectorAll('li').length, 3);
  const more = button('+ ' + (list.length - 3) + ' more', g);
  assert.equal(!!more, true);
  await click(more);
  assert.equal(document.querySelectorAll('[data-grocery] input[type="number"]').length, list.length);
});

test('Assign names the client it was opened for, and the sheet sends the week through the week module (the note rides as coachNote)', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  await mount(builder({ preselectId: uid(1) }));
  const assign = buttons().find((b) => /^Assign to/.test(b.textContent));
  assert.equal(assign.textContent, 'Assign to Tess →');
  await click(assign);
  await settle();
  await click(button('Publish to 1 client'));
  await settle();
  const sent = calls.filter(([u, m]) => u === '/api/nutritionist/meal-plan' && m === 'POST');
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2].clientId, uid(1));
  assert.equal(sent[0][2].days[2].meals[0].coachNote, 'Use the vanilla whey');
  await pause(1200);
  // With nobody named, it says clients.
  await mount(builder());
  assert.equal(buttons().find((b) => /^Assign to/.test(b.textContent)).textContent, 'Assign to clients →');
});

test('who is on it is the library\'s usage read with tier marks, an unknown tier hollow; a plan not in the library says so', async () => {
  stubFetch({ usage: { usage: { 'meal-1': { clients: 2, clientIds: [uid(1), uid(2)] } }, capped: false, untracked: 0, sentAt: {} }, meals: [TEMPLATE()] });
  stubConfirm(true); stubKitchen({});
  globalThis.useDashboard = () => ({ loading: false, clients: NUTRI(), triage: [], queue: [], today: { isNutritionist: true }, source: 'live', planCount: undefined });
  await mount(React.createElement(NutritionistPlansPage));
  const cardEl = [...document.querySelectorAll('[data-lib-card]')].find((c) => c.querySelector('h2')?.textContent === 'Rae week');
  await click(cardEl.querySelector('button'));
  await settle();
  const who = document.querySelector('[data-assign] .dash-lib-who');
  assert.equal(words(who), 'On it Priya Shah Tess Byrne');
  assert.equal(who.querySelectorAll('.sh-tier-mark').length, 1, 'Priya\'s tier');
  assert.equal(who.querySelectorAll('[data-tier-unknown]').length, 1, 'Tess\'s tier is unknown: hollow');
  // A plan not saved yet has no one on it to read.
  stubFetch();
  await mount(builder({ template: { ...TEMPLATE(), id: null } }));
  assert.match(words(document.querySelector('[data-assign]')), /Save it to your library to see who’s on it\./);
  // The signed-out preview names nobody.
  await mount(builder({ live: false, template: DashMeals.demoMealTemplates()[0] }));
  assert.match(words(document.querySelector('[data-assign]')), /Preview · no client plans to read/);
  for (const name of DashSignals.buildMockClients(NOW).map((c) => c.profile.name)) assert.equal(document.querySelector('[data-builder]').textContent.includes(name), false, name);
});

test('Mine is the coach\'s own kitchen, read with their account, said when it can\'t be read, and never a sample signed out', async () => {
  stubFetch(); stubConfirm(true);
  stubKitchen({ kitchen: { recipes: [{ id: 'r1', t: 'Rae\'s red lentil soup', kcal: 410, p: 24, c: 52, f: 9, min: 30 }, { id: 'r2', t: 'Green shakshuka' }] } });
  await mount(builder({ customFoods: [{ id: 'own-mum', name: 'Mum’s dhal', kcal: 380, p: 18, c: 50, f: 10, prepMin: null, tags: [], ingredients: [], own: true }] }));
  const tab = () => [...document.querySelectorAll('[data-kitchen] [role="tab"]')][1];
  // Their kitchen's recipes, then the dishes in their plans (the open one's too), one list.
  const own = [W.ownRecipeFood({ id: 'r1', t: 'Rae\'s red lentil soup' }), W.ownRecipeFood({ id: 'r2', t: 'Green shakshuka' })];
  const expected = DashMeals.mergeOwnFoods([own, DashMeals.ownFoodsFor(weekDoc(), [{ name: 'Mum’s dhal' }])]).map((f) => f.name);
  assert.equal(words(tab()), 'Mine ' + expected.length);
  await click(tab());
  assert.deepEqual(cards().map((c) => c.getAttribute('data-recipe')), expected);
  for (const name of ['Green shakshuka', 'Mum’s dhal', 'Rae\'s red lentil soup']) assert.equal(!!card(name), true, name);
  assert.match(words(card('Green shakshuka')), /Macros not set/);
  assert.match(words(card('Rae\'s red lentil soup')), /410 kcal · 24 g P/);
  assert.equal(!!button('＋ A dish of your own'), true);
  // Nora's setup writes the doc: it is read again.
  const before = kitchenReads;
  await React.act(async () => { window.dispatchEvent(new window.Event('shape:accountSetup')); });
  await settle();
  assert.equal(kitchenReads, before + 1);
  // A read that fails says so, with Retry, and still offers the dishes from their plans.
  stubKitchen(null, { fail: true });
  await mount(builder({ customFoods: [{ id: 'own-mum', name: 'Mum’s dhal', kcal: 380, p: 18, c: 50, f: 10, prepMin: null, tags: [], ingredients: [], own: true }] }));
  await click(tab());
  assert.match(words(document.querySelector('[data-kitchen]')), /Couldn’t read the recipes in your kitchen\. Retry/);
  assert.equal(!!card('Mum’s dhal'), true, 'the dishes in their plans');
  assert.equal(!!card('Green shakshuka'), false);
  // Signed out: no read, no sample.
  stubKitchen({ kitchen: { recipes: [{ id: 'r9', t: 'Should not show' }] } });
  await mount(builder({ live: false, template: DashMeals.demoMealTemplates()[0] }));
  await click(tab());
  assert.equal(kitchenReads, 0);
  assert.match(words(document.querySelector('[data-kitchen]')), /Sign in to see your own recipes\./);
  assert.equal(cards().length, 0);
});

test('a day goes through ShapeConfirm, never confirm(), and a declined delete keeps it', async () => {
  stubFetch(); stubConfirm(false); stubKitchen({});
  await mount(builder());
  await click(document.querySelector('.dmb-dayhead[data-day="Sunday"]'));
  await click(button('× Delete day'));
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].name, 'Sunday'); assert.match(confirms[0].message, /Its 3 meals go with it/);
  assert.equal(heads().length, 7);
  stubConfirm(true);
  await click(button('× Delete day'));
  await settle();
  assert.equal(heads().length, 6);
  assert.equal(heads().some((h) => h.startsWith('Sunday')), false);
});

test('a short rotation shows the weekdays each day is served on, and spreads over the week with nothing changed for clients', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  const t = TEMPLATE(); t.detail.mealBuilder.days = t.detail.mealBuilder.days.slice(0, 3);
  t.detail.mealBuilder.days[0].name = 'Day A'; t.detail.mealBuilder.days[1].name = 'Day B'; t.detail.mealBuilder.days[2].name = 'Day C';
  await mount(builder({ template: t }));
  assert.match(head('Day A'), /^Day A Mon · Thu · Sun /);
  assert.match(head('Day C'), /^Day C Wed /);
  await click(button('Spread over 7 days'));
  assert.deepEqual(heads().map((h) => h.split(' ')[0]), W.WEEKDAY_NAMES);
  assert.equal(!!button('Spread over 7 days'), false);
  assert.equal(!!button('+ Day'), false, 'a week has seven days');
});

test('the pages load the week module and Shape Kitchen before the builder', () => {
  for (const page of ['NutritionistApp.html', 'NutritionistPlans.html']) {
    const src = read(page);
    const at = (s) => src.indexOf(s);
    assert.ok(at('src="dashMealCore.js') >= 0 && at('src="dashMealCore.js') < at('src="dashMealWeek.js"'), page);
    assert.ok(at('src="recipes.jsx"') > 0 && at('src="recipes.jsx"') < at('src="dashMealBuilder.jsx'), page);
  }
});

test('a Kitchen recipe put on the plan stays Shape\'s: it is never listed under Mine', async () => {
  stubFetch(); stubConfirm(true); stubKitchen({});
  const t = TEMPLATE();
  const k = W.kitchenFood(RECIPES.find((r) => r.title === 'Chickpea shakshuka'), window.recipeNeeds);
  t.detail.mealBuilder.days[6].slots.push(W.placeMeal(k, 'Snack', DashMeals.newMeal));
  await mount(builder({ template: t }));
  await click([...document.querySelectorAll('[data-kitchen] [role="tab"]')][1]);
  assert.equal(!!card('Chickpea shakshuka'), false);
  assert.equal(!!card('Sun soup'), true, 'the coach\'s own dishes are');
});
