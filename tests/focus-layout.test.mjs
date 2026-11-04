// tests/focus-layout.test.mjs
//
// THE FOCUS LAYOUT (owner, 2026-10-11, off the C · Focus board): "impliment focus
// layout for home train eat and grocery with shop by aisle and shop by meal".
//
// Three layers, each driven through the shipping code:
//   · the pure rules (services/focusLayout.mjs) — when an arrival bar may be drawn,
//     when a countdown may count, which stop it starts from, and when a grocery item
//     is off the list;
//   · the shared pieces (broadsheet/BSFocus.jsx), rendered for real;
//   · the screens, driven shallowly: Home, Train and Eat in the Focus order, and the
//     Grocery page's Shop by aisle / Shop by meal over one set of ticks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { loadBroadsheet, drive, textOf, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import * as F from '../mobile-app/src/services/focusLayout.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const RDS = require_('react-dom/server');

// ── The rules ────────────────────────────────────────────────────────────────

test('a clock time is minutes, and anything else is untimed', () => {
  assert.equal(F.bsFocusMin('09:00'), 540);
  assert.equal(F.bsFocusMin('9:05'), 545);
  assert.equal(F.bsFocusMin('23:59'), 1439);
  for (const bad of ['24:00', '12:60', '', null, undefined, '7:30 AM', '—']) assert.equal(F.bsFocusMin(bad), null, String(bad));
});

test('the arrival bar is drawn only between two timed stops in order, and clamps', () => {
  assert.equal(F.bsFocusArrival(660, 810, 760), 66.7);
  assert.equal(F.bsFocusArrival(660, 810, 600), 0, 'before the stop before');
  assert.equal(F.bsFocusArrival(660, 810, 900), 100, 'past the next stop');
  assert.equal(F.bsFocusArrival(810, 660, 700), null, 'stops out of order');
  assert.equal(F.bsFocusArrival(810, 810, 810), null, 'one stop is no span');
  assert.equal(F.bsFocusArrival(null, 810, 700), null, 'an untimed stop before');
  assert.equal(F.bsFocusArrival(660, null, 700), null, 'an untimed next stop');
});

test('a countdown counts only toward a stop still ahead', () => {
  assert.deepEqual(F.bsFocusUntil(810, 760), { h: 0, m: 50, total: 50 });
  assert.deepEqual(F.bsFocusUntil(1050, 760), { h: 4, m: 50, total: 290 });
  assert.equal(F.bsFocusUntil(810, 810), null, 'now is not a countdown');
  assert.equal(F.bsFocusUntil(540, 810), null, 'a stop behind the clock');
  assert.equal(F.bsFocusUntil(null, 810), null);
});

test('the bar starts from the latest timed stop strictly before the next one', () => {
  const stops = [{ min: 450, label: 'Breakfast' }, { min: null, label: 'Coach push' }, { min: 660, label: 'Snack' }, { min: 810, label: 'Lunch' }, { min: 1170, label: 'Dinner' }];
  assert.equal(F.bsFocusPrevStop(stops, 810).label, 'Snack');
  assert.equal(F.bsFocusPrevStop(stops, 661).label, 'Snack');
  assert.equal(F.bsFocusPrevStop(stops, 660).label, 'Breakfast', 'a stop at the same minute is not before it');
  assert.equal(F.bsFocusPrevStop(stops, 400), null, 'nothing before the first stop');
  assert.equal(F.bsFocusPrevStop(stops, null), null);
});

test('a meal slot comes from its tag, else from its hour', () => {
  assert.equal(F.bsFocusSlot('BFAST', 900), 'breakfast');
  assert.equal(F.bsFocusSlot('LUNCH', 60), 'lunch');
  assert.equal(F.bsFocusSlot('DINR', 400), 'dinner');
  assert.equal(F.bsFocusSlot('', 7 * 60), 'breakfast');
  assert.equal(F.bsFocusSlot('', 13 * 60), 'lunch');
  assert.equal(F.bsFocusSlot('', 16 * 60), 'snack');
  assert.equal(F.bsFocusSlot('', 19 * 60), 'dinner');
  assert.equal(F.bsFocusSlot('', null), null);
});

test('an item names its meals from the whole list when the plan carries it', () => {
  assert.deepEqual(F.bsGroceryMealNames('Pho — beef + rice noodles · Chili + rice +2'), ['Pho — beef + rice noodles', 'Chili + rice']);
  assert.deepEqual(F.bsGroceryMealNames('—'), [], 'the plan list writes "—" for no meal');
  assert.deepEqual(F.bsGroceryMealNames(''), []);
  // The line names two and counts the rest; `mealList` names all three.
  assert.deepEqual(F.bsGroceryItemMeals({ meals: 'A · B +1', mealList: ['A', 'B', 'C'] }), ['A', 'B', 'C']);
  assert.deepEqual(F.bsGroceryItemMeals({ meals: 'A · B +1' }), ['A', 'B']);
});

test('an ingredient leaves the list only when every meal it is for was skipped', () => {
  const lemon = { n: 'Lemon', meals: 'A · B', mealList: ['A', 'B', 'C'] };
  assert.equal(F.bsGrocerySkipped(lemon, new Set(['A'])), false);
  assert.equal(F.bsGrocerySkipped(lemon, new Set(['A', 'B'])), false, 'C still needs it, and the line does not name C');
  assert.equal(F.bsGrocerySkipped(lemon, new Set(['A', 'B', 'C'])), true);
  assert.equal(F.bsGrocerySkipped({ n: 'Ice', meals: '' }, new Set(['A'])), false, 'an item for no meal is never skipped');
  assert.equal(F.bsGrocerySkipped(lemon, new Set()), false);
});

const LIST = () => ({
  id: 'focus-test', name: 'Plan',
  aisles: [
    { aisle: 'produce', items: [
      { n: 'Lemon', q: '½ ×3', meals: 'A · B +1', mealList: ['A', 'B', 'C'] },
      { n: 'Kale', q: '200 g', meals: 'A', mealList: ['A'] },
      { n: 'Ice', q: '1 cup', meals: '—' },
    ] },
    { aisle: 'protein', items: [
      { n: 'Salmon', q: '180 g', meals: 'C', mealList: ['C'], have: true },
    ] },
  ],
});

test('shop by meal files each ingredient under every meal it is for, in the meals\' order', () => {
  const rank = (n) => ({ C: 0, A: 1 })[n] ?? null;
  const groups = F.bsGroceryByMeal(LIST().aisles, rank);
  assert.deepEqual(groups.map((g) => g.name), ['C', 'A', 'B', null], 'ranked first, unranked in first-seen order, loose items last');
  assert.deepEqual(groups[0].items.map((x) => x.item.n), ['Lemon', 'Salmon']);
  assert.deepEqual(groups[1].items.map((x) => [x.ai, x.ii]), [[0, 0], [0, 1]], 'keyed by aisle and index, so one tick is one tick');
  assert.deepEqual(groups[3].items.map((x) => x.item.n), ['Ice']);
});

test('shop by aisle counts what is left in each aisle once skipped items are gone', () => {
  const got = new Set(['1-0']);
  const isGot = (ai, ii) => got.has(`${ai}-${ii}`);
  assert.deepEqual(F.bsGroceryAisleStops(LIST().aisles, isGot, new Set()), [
    { ai: 0, aisle: 'produce', total: 3, got: 0, left: 3 },
    { ai: 1, aisle: 'protein', total: 1, got: 1, left: 0 },
  ]);
  // Skip C: Salmon (C only) goes, and so does its aisle; Lemon (A, B, C) stays.
  assert.deepEqual(F.bsGroceryAisleStops(LIST().aisles, isGot, new Set(['C'])), [
    { ai: 0, aisle: 'produce', total: 3, got: 0, left: 3 },
  ]);
});

test('the shop-by choice and the skipped meals are remembered, and read back defensively', () => {
  const box = new Map();
  const store = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
  assert.equal(F.bsReadShopBy(store), 'aisle', 'aisle by default');
  F.bsSaveShopBy(store, 'meal');
  assert.equal(F.bsReadShopBy(store), 'meal');
  F.bsSaveShopBy(store, 'anything');
  assert.equal(F.bsReadShopBy(store), 'aisle');
  F.bsSaveSkippedMeals(store, 'list-1', new Set(['A', 'B']));
  assert.deepEqual([...F.bsReadSkippedMeals(store, 'list-1')], ['A', 'B']);
  assert.equal(F.bsReadSkippedMeals(store, 'list-2').size, 0, 'per list');
  F.bsSaveSkippedMeals(store, 'list-1', new Set());
  assert.equal(box.has('shape.grocery.skippedMeals:list-1'), false, 'an empty set clears the key');
  const throwing = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('x'); } };
  assert.equal(F.bsReadShopBy(throwing), 'aisle');
  assert.doesNotThrow(() => F.bsSaveShopBy(throwing, 'meal'));
  assert.equal(F.bsReadSkippedMeals(throwing, 'l').size, 0);
  assert.doesNotThrow(() => F.bsSaveSkippedMeals(throwing, 'l', new Set(['A'])));
  box.set('shape.grocery.skippedMeals:bad', '{not json');
  assert.equal(F.bsReadSkippedMeals(store, 'bad').size, 0);
});

// ── The shared pieces, rendered ─────────────────────────────────────────────

const FOCUS = await loadRealModule(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSFocus.jsx'), { registry: new Map([['react', React]]) });
const html = (el) => RDS.renderToStaticMarkup(el);

test('the lead gives the title one accent period, never two, and none after a question', () => {
  const a = html(React.createElement(FOCUS.BSFocusLead, { kicker: '1:30 PM · Next stop', title: 'Lunch.' }));
  assert.equal((a.match(/Lunch/g) || []).length, 1);
  assert.match(a, /<h2[^>]*>Lunch<span[^>]*>\.<\/span><\/h2>/);
  const q = html(React.createElement(FOCUS.BSFocusLead, { kicker: 'Today', title: 'Ready to check in?' }));
  assert.match(q, /<h2[^>]*>Ready to check in\?<\/h2>/);
});

test('the arrival bar is not drawn without a span', () => {
  assert.equal(html(React.createElement(FOCUS.BSFocusArrival, { pct: null, nowLabel: 'Now' })), '');
  const on = html(React.createElement(FOCUS.BSFocusArrival, { pct: 66.7, nowLabel: 'NOW 12:40', fromLabel: '11:00 AM · Snack', toLabel: '1:30 PM · Lunch', ariaLabel: 'x' }));
  assert.match(on, /width:66\.7%/);
  assert.match(on, /left:66\.7%/);
  assert.match(on, /11:00 AM · Snack/);
});

test('the day line puts NOW above the row it names, after the last, or nowhere', () => {
  const rows = [{ key: 'a', time: '7:30 AM', title: 'Breakfast', state: 'done' }, { key: 'b', time: '1:30 PM', title: 'Lunch', state: 'next' }];
  const at = (i) => html(React.createElement(FOCUS.BSFocusLine, { rows, nowIndex: i, nowLabel: 'NOW · 12:40 PM' }));
  const mid = at(1);
  assert.ok(mid.indexOf('Breakfast') < mid.indexOf('NOW · 12:40 PM') && mid.indexOf('NOW · 12:40 PM') < mid.indexOf('Lunch'));
  const end = at(2);
  assert.ok(end.indexOf('Lunch') < end.indexOf('NOW · 12:40 PM'));
  assert.doesNotMatch(at(-1), /NOW/);
  assert.equal(html(React.createElement(FOCUS.BSFocusLine, { rows: [], nowIndex: 0, nowLabel: 'NOW' })), '');
});

test('a link carries the cooking door token, and its second line when given one', () => {
  const door = html(React.createElement(FOCUS.BSFocusLink, { 'data-bsck-door': 'prep', label: 'Prep the week', glyph: '→' }));
  assert.match(door, /data-bsck-door="prep"/);
  const sub = html(React.createElement(FOCUS.BSFocusLink, { label: 'The shop list', tag: '81 to get', sub: 'From Maya · this week · Produce', glyph: '◎' }));
  assert.match(sub, /From Maya · this week · Produce/);
  assert.match(sub, /aria-label="The shop list, 81 to get, From Maya · this week · Produce"/);
});

test('the shop-by switch says which view is showing', () => {
  const out = html(React.createElement(FOCUS.BSShopBySwitch, { value: 'meal', onChange() {}, label: 'Shop by', aisleLabel: 'Aisle', mealLabel: 'Meal' }));
  assert.match(out, /aria-pressed="false"[^>]*>.*Aisle<\/button>/);
  assert.match(out, /aria-pressed="true"[^>]*>.*Meal<\/button>/);
});

// ── The screens ──────────────────────────────────────────────────────────────

// The member reads English off the real `en` catalog, formatted as ICU the way the
// app formats it, so a plural this change added is checked on the screen that shows it.
const { IntlMessageFormat } = require_('intl-messageformat');
const { readFileSync, existsSync } = require_('node:fs');
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) {
    const p = join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', `${ns}.json`);
    CAT.set(ns, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return CAT.get(ns);
};
globalThis.ShapeI18n = {
  t(key, opts) {
    const i = String(key).indexOf(':');
    const raw = i < 0 ? null : (catalog(key.slice(0, i)) || {})[key.slice(i + 1)];
    if (raw == null) return undefined;
    return String(new IntlMessageFormat(raw, 'en').format(opts || {}));
  },
};

const box = new Map();
globalThis.localStorage = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
const sent = [];
globalThis.ShapeIntegrations = { sendGroceryToInstacart: async (x) => { sent.push(x); } };
const { BSGrocery, BSClientTrain, BSClientHome, BSClientEat, bsBuildPlanGrocery, BSYourMornings, BSCycleTodayChip } = await loadBroadsheet(['BSGrocery', 'BSClientTrain', 'BSClientHome', 'BSClientEat', 'bsBuildPlanGrocery', 'BSYourMornings', 'BSCycleTodayChip'], SHIM);
const byType = (d, name) => d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === name);

// The Grocery page is BSGroceryList.jsx since its redesign (owner, 2026-11-04: "actually C for grocery
// list"): the client imports it and loadBroadsheet re-exports it. Shop by is its lit two-way switch and
// the aisles its LED count slots.
test('the Grocery page opens by aisle, on the first aisle with anything left', () => {
  box.clear();
  const d = drive(BSGrocery, { list: LIST() });
  const sw = byType(d, 'GroceryShopBy')[0];
  assert.ok(sw, 'no Shop by switch');
  assert.equal(sw.props.value, 'aisle');
  const slots = byType(d, 'GroceryAisleSlots')[0];
  assert.deepEqual(slots.props.stops.map((s) => [s.left, s.on]), [[3, true], [0, false]]);
  assert.match(d.text, /Lemon/);
  assert.match(d.text, /Kale/);
  assert.doesNotMatch(d.text, /Salmon/, 'the other aisle is not on the page');
});

test('shop by meal groups the same ticks by meal, and a skip takes a meal\'s items off', () => {
  box.clear();
  sent.length = 0;
  const mealWhen = new Map([['C', { rank: 0, label: 'Today · Lunch' }], ['A', { rank: 1, label: 'Mon · Dinner' }]]);
  const d = drive(BSGrocery, { list: LIST(), mealWhen });
  byType(d, 'GroceryShopBy')[0].props.onChange('meal');
  d.render();
  assert.equal(box.get('shape.grocery.shopBy'), 'meal', 'the choice is remembered');
  const text = d.text;
  assert.ok(text.indexOf('Today · Lunch') < text.indexOf('Mon · Dinner'), 'meals run in the order they come');
  assert.match(text, /4 items/, 'the header counts every item while nothing is skipped');
  // The first Skip belongs to the first meal, C — Salmon is only for C, Lemon is not.
  d.click('Skip');
  assert.deepEqual(JSON.parse(box.get('shape.grocery.skippedMeals:focus-test')), ['C']);
  assert.match(d.text, /3 items/, 'Salmon is off the list');
  assert.match(d.text, /Skipped · 1 off/);
  d.click('Send to Instacart');
  assert.deepEqual(sent[0].items.map((x) => x.name), ['Lemon', 'Kale', 'Ice'], 'a skipped item is not ordered');
  d.click('Undo');
  assert.match(d.text, /4 items/);
});

// Owner, 2026-11-04, of the three Day views drawn for Eat: "C for eat". The Day view's top is one piece now
// (BSEatDay.jsx: the head, the week, the day as an orbit with Fuel left, the next meal and the menu, in that
// order), and tests/eat-day.test.mjs mounts it. Here Eat is checked for what it hands it: Fuel left's figures,
// a door per macro, the week, the menu's rows and its doors, and that a picked day moves the page.
test('Eat draws its day through BSEatDay, from its own figures and through its own doors', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientEat, { onProfile() {} });
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const order = d.nodes();
  const day = order.find(fn('BSEatDay'));
  assert.ok(day, 'Eat draws no Day view');
  // The week, Fuel left, the next meal and the menu are BSEatDay's (the owner's pick, restored 2026-11-04), not
  // drawn inline on the page.
  for (const inline of ['BSEatFuel', 'BSFocusLead', 'BSTrackHeader', 'BSWeekStrip', 'BSFocusLine']) assert.equal(order.findIndex(fn(inline)), -1, `${inline} is drawn on the page, not in BSEatDay`);
  // The head and the Eat tabs (on Day) sit above it, outside it: the tabs are Grocery's too.
  const tabs = order.findIndex(fn('BSNutritionTopTabs'));
  const headAt = order.findIndex((n) => n.type === globalThis.BSPageHeader);
  assert.ok(headAt >= 0 && tabs > headAt && order.indexOf(day) > tabs, 'the head, then the tabs, then the day');
  assert.equal(order[tabs].props.active, 'eat', 'the Eat tabs, on Day');
  const p = day.props;
  assert.deepEqual(p.fuel.macros.map((m) => m.k), ['p', 'c', 'f'], 'protein, carbs and fat, in that order');
  assert.equal(typeof p.onMacro, 'function', 'a macro opens its own page');
  assert.equal(p.fuel.calLeft, Math.max(0, p.fuel.calTarget - p.fuel.calNow));
  assert.equal(p.restFlags.length, 7, 'the week is Monday to Sunday, its rest days marked');
  assert.ok(p.rows.length > 0 && p.rows.every((r) => typeof r.onOpen === 'function' && r.key), 'each meal is a row that opens');
  for (const k of ['onDay', 'onMonth', 'onOpenMeal', 'onSwapMeal', 'onSwapPick']) assert.equal(typeof p[k], 'function', k);
  assert.equal(p.day, p.todayIdx, 'Eat opens on today');
  assert.ok(p.next, 'the preview has a next meal today');
  // A picked day moves the page to it: its figures, its meals, and no next meal (that is today's).
  const other = (p.todayIdx + 1) % 7;
  p.onDay(other);
  d.render();
  const moved = d.nodes().find(fn('BSEatDay')).props;
  assert.equal(moved.day, other);
  assert.equal(moved.next, null, 'the next meal is today\'s only');
  // The tour's step on the menu, and the menu's swap door, are BSEatDay's.
  const src = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSEatDay.jsx'), 'utf8');
  assert.match(src, /data-tour="hero-eat"/);
  assert.match(src, /onAction=\{p\.onSwapPick\}/);
});

const EATFUEL = await loadRealModule(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSEatFuel.jsx'), {
  registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]),
});

test('Eat: signed in, Fuel left is unread until the meals read answers for meals', () => {
  // This harness runs no effects, so a signed-in Eat is the moment before the read answers. That the
  // read leaves eatPlanRead false when it fails, and true on "no plan", is plan-read-failed's (it runs
  // Eat's loader as it ships).
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-a' } }) };
  try {
    const d = drive(BSClientEat, { onProfile() {} });
    assert.equal(d.nodes().find(fn('BSEatDay')).props.fuel.unread, true, 'before the read answers, no 0 kcal');
    const link = d.nodes().find((n) => fn('BSFocusLink')(n) && n.props.glyph === '✎');
    assert.ok(link, 'the coach link');
    assert.doesNotMatch(String(link.props.tag), /·/, 'and the coach link names no 0 kcal target');
  } finally {
    delete globalThis.ShapeAuth;
  }
  const preview = drive(BSClientEat, { onProfile() {} });
  assert.equal(preview.nodes().find(fn('BSEatDay')).props.fuel.unread, false, 'the signed-out preview reads its sample');
  const client = readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(client, /const bsEatFuelUnread = bsEatSignedIn && !eatPlanRead && !liveMealDays;/);
  assert.ok(client.includes("fuel={{ calLeft: bsEatCalLeft, calTarget: bsEatCalTgt, calNow: bsEatCalNow, calPct: bsEatCalPct, macros: bsEatMacros, unread: bsEatFuelUnread, calTargetKnown: bsEatCoachSet('calories') }}"));
  assert.ok(client.includes('onMacro={(k) => setMacroPage(k)}'));
  assert.match(client, /tag=\{bsEatFuelUnread && !bsEatCoachSet\('calories'\) \? planGoalLabel : `\$\{planGoalLabel\} · \$\{bsEatCalTgt\.toLocaleString\(\)\}`\}/);
  // Each macro says whether its target is the coach's, so a coach's 0 g reads as 0 (Codex P2 on #2453).
  assert.match(client, /const bsEatCoachSet = \(key\) => !!\(bsEatCoachN && bsEatCoachN\[key\] != null\);/);
  for (const key of ['protein', 'carbs', 'fat']) assert.ok(client.includes(`gKnown: bsEatCoachSet('${key}')`), key);
});

// Owner, 2026-10-24: "the 3 of these are links to the same page, need to change that". Each tile opens
// its own macro's page, in the tile's figures and colour, and Back returns to Eat.
test('Eat opens a macro tile on its own page, a different one for each', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientEat, { onProfile() {} });
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const fuel = () => d.nodes().find(fn('BSEatDay'));
  const page = () => d.nodes().find(fn('BSEatMacroPage'));
  const tiles = fuel().props.fuel.macros;
  const seen = [];
  for (const m of tiles) {
    fuel().props.onMacro(m.k);
    d.render();
    const p = page();
    assert.ok(p, `the ${m.k} tile opens no page`);
    assert.equal(fuel(), undefined, 'the page stands in for Eat');
    assert.equal(p.props.k, m.k);
    assert.equal(p.props.color, m.c, 'the page is drawn in the tile\'s colour');
    assert.equal(p.props.v, m.v);
    assert.equal(p.props.g, m.g, 'the page reads the target the tile reads');
    assert.equal(p.props.week.length, 7, 'the week is Monday to Sunday');
    assert.ok(Array.isArray(p.props.meals));
    seen.push(p.props.name);
    p.props.onBack();
    d.render();
    assert.ok(fuel(), 'Back returns to Eat');
  }
  assert.deepEqual(seen, ['Protein', 'Carbs', 'Fat']);
  // The day's breakdown is still a tap away, from the page.
  fuel().props.onMacro('p');
  d.render();
  page().props.onDay();
  d.render();
  assert.equal(page(), undefined);
  assert.ok(d.nodes().find(fn('BSDayBriefPreview')), 'The whole day opens the day brief');
});

// Codex P2 on #2446: a swapped meal's row read its swap's grams while the figure above it read the plan's.
// A logged meal the member swapped counts at its swap's amounts, on the tile, the page and the week alike;
// a swap of a meal still to come changes nothing eaten.
test('a logged meal\'s swap moves what was eaten by its difference, and nothing else does', () => {
  const meals = [
    { title: 'Oats and whey', state: 'done', kcal: 520, p: 38, c: 60, f: 9 },
    { title: 'Chicken bowl', state: 'next', kcal: 640, p: '46', c: 70, f: 14 },
    { title: 'Salmon rice', state: 'done', kcal: 610, p: 42, c: 55, f: 18 },
  ];
  const overrides = { 'Oats and whey': { title: 'Greek yogurt bowl', kcal: 430, p: 52, c: 40, f: 8 }, 'Chicken bowl': { title: 'Tofu bowl', kcal: 560, p: 30, c: 66, f: 16 }, 'Salmon rice': { title: 'Salmon salad' } };
  assert.equal(EATFUEL.bsEatSwapDelta(meals, overrides, 'p'), 14, 'the logged swap adds its 52 g less the planned 38');
  assert.equal(EATFUEL.bsEatSwapDelta(meals, overrides, 'kcal'), -90);
  assert.equal(EATFUEL.bsEatSwapDelta(meals, overrides, 'f'), -1);
  assert.equal(EATFUEL.bsEatSwapDelta(meals, {}, 'p'), 0, 'no swap, no change');
  assert.equal(EATFUEL.bsEatSwapDelta(meals, null, 'p'), 0);
  assert.equal(EATFUEL.bsEatSwapDelta(null, overrides, 'p'), 0);
  // Eat reads what was eaten through it for the tile's kcal and macros, the page and each day of the week.
  const eat = stripComments(readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8'));
  assert.match(eat, /const bsEatEaten = \(dd, k\) => Math\.max\(0, bsEatNum\(k === 'kcal' \? dd\.totals\.cal : dd\.totals\[k\]\) \+ bsEatSwapDelta\(dd\.meals, mealOverrides, k\)\);/);
  assert.match(eat, /const bsEatCalNow = bsEatEaten\(cur, 'kcal'\);/);
  for (const k of ['p', 'c', 'f']) assert.match(eat, new RegExp(`\\{ k: '${k}', l: tr\\([^)]*\\), v: bsEatEaten\\(cur, '${k}'\\),`));
  assert.match(eat, /week=\{PROGRAM\.map\(\(dd\) => \(\{ d: dd\.d, v: bsEatEaten\(dd, _mk\),/);
});

// Codex P2 on #2446: a swapped meal's row (on the macro page, as on the menu) opened the planned meal. It
// opens as its swap: the swap's title and amounts, and none of the planned meal's recipe.
test('a swapped meal opens as its swap, with none of the planned meal\'s recipe', () => {
  const meal = { id: 'm2', title: 'Chicken bowl', state: 'next', kcal: 640, p: 46, c: 70, f: 14, hero: 'Bowl.', brief: 'Rice, chicken.', ingredients: [{ m: 'Chicken' }], steps: ['Cook'], coachNote: 'Good', prep: '10 min', portion: '1 plate', score: 'A' };
  const overrides = { 'Chicken bowl': { title: 'Tofu stir-fry + rice', kcal: 580, p: 34, c: 72, f: 16, sub: '580 kcal · 34P · 72C · 16F' } };
  const open = EATFUEL.bsEatSwappedMeal(meal, overrides);
  assert.equal(open.id, 'm2', 'the swap keeps its slot');
  assert.deepEqual([open.title, open.kcal, open.p, open.c, open.f], ['Tofu stir-fry + rice', 580, 34, 72, 16]);
  assert.deepEqual([open.hero, open.brief, open.ingredients, open.steps, open.coachNote], ['', '', [], [], ''], 'the planned meal\'s recipe is not the swap\'s');
  assert.equal(open._swappedFrom, 'Chicken bowl');
  assert.equal(open.portion, '1 plate');
  assert.equal(EATFUEL.bsEatSwappedMeal(meal, {}), meal, 'no swap: the meal as it is');
  assert.equal(EATFUEL.bsEatSwappedMeal(meal, null), meal);
  assert.equal(EATFUEL.bsEatSwappedMeal(undefined, overrides), null);
  const eat = stripComments(readFileSync(join(ROOT, 'mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8'));
  assert.match(eat, /if \(previewMealId\) \{\n\s*const meal = bsEatSwappedMeal\(meals\.find\(m => m\.id === previewMealId\), mealOverrides\);/, 'Eat opens a meal without its swap');
});

test('a macro\'s page: what is left, the day\'s meals by it, the week against the target, in the magazine look', () => {
  const saved = {};
  for (const name of ['BSPage', 'BSDetailHeader', 'BSFooter']) { saved[name] = globalThis[name]; }
  globalThis.BSPage = function BSPage({ children }) { return children; };
  globalThis.BSDetailHeader = function BSDetailHeader() { return null; };
  globalThis.BSFooter = function BSFooter() { return null; };
  try {
    const opened = []; let day = 0;
    const meals = [
      { id: 'm1', tag: 'BFAST', title: 'Oats and whey', state: 'done', p: 38, c: 60, f: 9 },
      { id: 'm2', tag: 'LUNCH', title: 'Chicken bowl', state: 'next', p: '46', c: 70, f: 14 },
    ];
    const week = ['M 19', 'T 20', 'W 21', 'T 22', 'F 23', 'S 24', 'S 25'].map((dd, i) => ({ d: dd, v: i < 3 ? 120 + i : 0, g: 130 }));
    const props = { k: 'p', name: 'Protein', color: '#c0533b', v: 128, g: 130, meals, week, dayIdx: 2, todayIdx: 2,
      onBack() {}, onMealClick: (id) => opened.push(id), onDay: () => { day += 1; } };
    const d = drive(EATFUEL.BSEatMacroPage, props);
    const order = d.nodes();
    const head = order.find((n) => typeof n.type === 'function' && n.type.name === 'BSDetailHeader');
    assert.equal(head.props.title, 'Protein');
    // No eyebrow over the title (owner, 2026-11-04: "also remove these eyebrow headers"); the week below marks the day.
    assert.equal(head.props.eyebrow, undefined);
    assert.match(d.text, /2g left/);
    assert.match(d.text, /128 of 130 g · 98%/);
    // The meals, each with its grams of this macro, and a door to the meal.
    const rows = order.filter((n) => n.props && n.props['data-eat-macro-meal'] != null);
    assert.equal(rows.length, 2);
    assert.match(textOf(rows[0]), /BFAST · ✓ Logged.*Oats and whey.*38g/);
    assert.match(textOf(rows[1]), /LUNCH · To come.*Chicken bowl.*46g/);
    rows[1].props.onClick();
    assert.deepEqual(opened, ['m2']);
    // The week: seven days, each named for a screen reader with its figure and target.
    const wk = order.find((n) => n.props && n.props['data-eat-macro-week'] != null);
    assert.match(String(wk.props.style.gridTemplateColumns), /repeat\(7,/);
    const days = order.filter((n) => n.props && n.props.role === 'img');
    assert.deepEqual(days.map((n) => n.props['aria-label']).slice(0, 4), ['M 19: 120 of 130 g', 'T 20: 121 of 130 g', 'W 21: 122 of 130 g', 'T 22: 0 of 130 g']);
    // The magazine look: two Saira heads over a 2px ink rule, square bars, no rounded card.
    const heads = order.filter((n) => typeof n.type === 'function' && n.type.name === 'BSEfHead').map((n) => n.type(n.props));
    assert.equal(heads.length, 2);
    assert.ok(heads.every((h) => h.props['data-eat-macro-head'] != null));
    assert.ok(heads.every((h) => /^2px solid /.test(h.props.style.borderBottom)));
    assert.ok(!order.some((n) => n.props && n.props.style && n.props.style.borderRadius && n.props.style.borderRadius !== 0), 'a rounded piece on the page');
    d.click('The whole day');
    assert.equal(day, 1);
    // Over the target reads "over", never a negative "left"; another day names its day.
    const over = drive(EATFUEL.BSEatMacroPage, { ...props, v: 141, dayIdx: 1 });
    assert.match(over.text, /11g over/);
    assert.doesNotMatch(over.text, /-\d+g left/);
    const overHead = over.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSDetailHeader');
    assert.equal(overHead.props.eyebrow, undefined);
  } finally {
    for (const [name, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[name]; else globalThis[name] = v; }
  }
});

// Owner, 2026-10-24: "i should be able to click on this". Burned this week opens the week day by day, and
// Back returns to Train.
test('Train opens Burned this week on its own page', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientTrain, { onProfile() {}, goRadio() {}, goMarket() {}, goCalendar() {} });
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const day = d.nodes().find(fn('BSTrainDay'));
  assert.equal(typeof day.props.onBurn, 'function', 'the burn line opens nothing');
  day.props.onBurn();
  d.render();
  const page = d.nodes().find(fn('BSTrainBurnPage'));
  assert.ok(page, 'the week page did not open');
  assert.equal(d.nodes().find(fn('BSTrainDay')), undefined, 'the page stands in for Train');
  page.props.onBack();
  d.render();
  assert.ok(d.nodes().find(fn('BSTrainDay')), 'Back returns to Train');
});

// Owner, 2026-11-04, of three designs: "C for train but incorporate this button if you can", then "and
// then C for next part". BSTrainDay.jsx draws the week, the burn, the session, the program, On deck and the
// links; the page hands it the day and every door, and Find a trainer stays a bar at the foot.
test('Train hands the day and its doors to BSTrainDay, and a picked day moves the session', () => {
  delete globalThis.ShapeAuth;
  let month = 0, radio = 0;
  const market = [];
  const d = drive(BSClientTrain, { onProfile() {}, goRadio() { radio += 1; }, goMarket(role) { market.push(role); }, goCalendar() { month += 1; } });
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const order = d.nodes();
  const at = (pred) => order.findIndex(pred);
  const day = order[at(fn('BSTrainDay'))];
  assert.ok(day, 'no BSTrainDay on Train');
  // Finding a coach is the bar at the foot, after the links, not pinned to the top; it opens the trainers.
  const find = day.props.findCoach;
  assert.ok(find && find.type && find.type.name === 'BSFindCoachBar' && find.props.role === 'trainer', 'no find-a-coach bar handed in');
  find.props.onOpen();
  assert.deepEqual(market, ['trainer']);
  assert.ok(!day.props.links.some((l) => /find a coach/i.test(l.label)), 'finding a coach is a link and a bar both');
  // The head is the page's: the phase and week over "Your training".
  const head = order[at((n) => n.type === globalThis.BSPageHeader)];
  assert.ok(head && head.props.title === 'Your training' && /Week \d+/.test(head.props.kicker), 'Train lost its head');
  assert.equal(at(fn('BSWeekStrip')), -1, 'the old week strip is gone');
  assert.equal(at((n) => n.props && n.props.tour === 'hero-train'), -1, 'the old lead is gone (BSTrainDay carries the tour anchor)');
  assert.equal(day.props.program.length, 7, 'the whole week');
  assert.ok(String(day.props.head || '').length > 0, 'the session has a title');
  for (const k of ['onDay', 'onMonth', 'onBurn', 'onStart', 'onSwap', 'onMove', 'onRadio']) assert.equal(typeof day.props[k], 'function', `${k} is not wired`);
  day.props.onMonth();
  day.props.onRadio();
  assert.equal(month, 1, 'Month view opens the calendar');
  assert.equal(radio, 1, 'the playlist opens Shape Radio');
  assert.ok(day.props.links.length >= 2 && day.props.links.every((l) => typeof l.onOpen === 'function' && l.label), 'the links come with their doors');
  // A day in another session than this one: the page's day moves, and the session with it.
  const before = day.props.head;
  const other = day.props.program.findIndex((p, i) => i !== day.props.day && (p.headline || p.title) !== before);
  day.props.onDay(other);
  d.render();
  const after = d.nodes().find(fn('BSTrainDay'));
  assert.equal(after.props.day, other);
  assert.notEqual(after.props.head, before, 'the session follows the picked day');
  // Start opens the live session, standing in for the page.
  after.props.onStart();
  d.render();
  assert.equal(d.nodes().find(fn('BSTrainDay')), undefined, 'Start did not open the session');
});

// Owner, 2026-10-11, on the first build: "check-in should be towards the top". Owner, 2026-10-22, Option A:
// the check-in card and water share one morning panel on Home; owner, 2026-11-03: "add daily habits in
// here instead of at bottom".
test('Home holds the check-in card, water and the daily habits in one morning panel', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientHome, { onProfile() {}, goCalendar() {}, goRadio() {}, goTrain() {}, goEat() {}, goMarket() {}, goScore() {}, goChat() {}, goIntegrations() {}, tweaks: {}, setTweak() {} });
  const panels = d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === 'BSMorningPanel');
  assert.equal(panels.length, 1, 'one panel');
  const kids = [].concat(panels[0].props.children).filter(Boolean);
  assert.deepEqual(kids.map((k) => k.type.name), ['BSTodayNudge', 'BSWaterLine', 'BSHomeHabitsRow'], 'the card, then water, then the habits');
  assert.equal(kids[0].props.variant, 'bulletin');
  assert.equal(kids[2].props.tour, 'hero-habits', "the tour's habits step anchors on the panel's habits");
  assert.equal(typeof kids[2].props.onOpen, 'function', 'the habits row opens the Habits page');
});

// Owner, 2026-11-03, the Home the owner chose: "C on top, M3 below, but use this design at the top, and
// move shape radio box above the graph", "the chart should just be goal progress", "move check in to above
// in your corner", "change 'in your corner' to 'team'", "remove your crew", and Today's call off Home
// ("remove this", "and replace with just this", "so you dont have them twice").
test('Home reads: the deck (Shape Radio, the climb, the week), the morning panel, Team, then the shortcuts', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientHome, { onProfile() {}, goCalendar() {}, goRadio() {}, goTrain() {}, goEat() {}, goMarket() {}, goScore() {}, goChat() {}, goIntegrations() {}, tweaks: {}, setTweak() {} });
  const order = d.nodes();
  const at = (pred) => order.findIndex(pred);
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const deck = at(fn('BSHomeDeck'));
  const climb = at(fn('BSHomeClimb'));
  const week = at(fn('BSHomeWeekBars'));
  const checkin = at((n) => fn('BSTodayNudge')(n) && n.props.variant === 'bulletin');
  const team = at(fn('BSHomeTeam'));
  const shortcuts = at(fn('BSHomeShortcutList'));
  assert.ok(deck >= 0, 'no deck');
  // Shape Radio is a window global the shallow drive does not load, so its place is read from the source.
  assert.match(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8'), /<BSHomeDeck radio=\{<BSNowPlaying onOpen=\{goRadio\} \/>\}>/, "Shape Radio is not the deck's first line");
  assert.ok(climb > deck && week > climb, 'the climb, then the week, in the deck');
  assert.ok(checkin > week && team > checkin && shortcuts > team, 'the morning panel, then Team, then the shortcuts');
  assert.equal(order[climb].props.tour, 'hero-goal', "the tour's goal step anchors on the climb");
  assert.equal(typeof order[climb].props.onOpen, 'function', 'the climb opens Your goals');
  assert.equal(order.filter((n) => n.props && n.props.tour === 'hero-goal').length, 1, 'one goal anchor');
  assert.equal(order[team].props.tour, 'hero-home', "the tour's Home step anchors on Team");
  for (const gone of ['BSHomeGoal', 'BSHomeWeekSoFar', 'BSHomeCoaches', 'BSFocusLine', 'BSHomeWallBulletin']) {
    assert.equal(at(fn(gone)), -1, `${gone} is still on Home`);
  }
  assert.equal(at((n) => fn('BSFocusHead')(n) && n.props.label === 'Today\u2019s call'), -1, "Today's call is on Home twice: Team's trainer card carries it");
  assert.doesNotMatch(d.text, /Your crew/, 'Your crew lives on the Wall');
  assert.doesNotMatch(d.text, /Kcal left|Protein to go|Next stop|Today's slate/);
  // The signed-out preview is a member's account: the sample's two coaches, their faces and her note.
  const sample = order[team].props;
  assert.deepEqual(sample.coaches.map((c) => [c.role, c.name]), [['trainer', 'Jordan Chen'], ['nutritionist', 'Dr. Maya Patel']]);
  assert.ok(sample.coaches.every((c) => /\/faces\/coach-[a-z]+\.jpg$/.test(c.photo)), 'a sample coach without their face');
  assert.equal(sample.showFindCoach, false, 'Find a coach beside two coaches');
  assert.ok(sample.notes.some((n) => n.role === 'nutritionist' && n.who === 'Dr. Maya Patel'), "the sample's note");
});

// A day in Home's week opens the calendar on that day, where its plan is; Home itself stays on today.
test("a day tapped in Home's week opens the calendar on that day, and Month opens the month", () => {
  delete globalThis.ShapeAuth;
  const opened = [];
  const d = drive(BSClientHome, { onProfile() {}, goCalendar(day) { opened.push(day); }, goRadio() {}, goTrain() {}, goEat() {}, goMarket() {}, goScore() {}, goChat() {}, goIntegrations() {}, tweaks: {}, setTweak() {} });
  const bars = () => d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSHomeWeekBars');
  const team = () => d.nodes().find((n) => n.props && n.props.tour === 'hero-home');
  assert.ok(bars(), 'no week on Home');
  const day = new Date(2026, 8, 9);
  bars().props.onDay(day);
  d.render();
  assert.equal(opened.length, 1);
  assert.equal(opened[0], day, 'the calendar is handed the tapped day');
  assert.ok(team(), 'Home stays on today: Team is still there');
  bars().props.onMonth();
  assert.equal(opened.length, 2);
  assert.equal(opened[1], undefined, 'Month opens the calendar on today');
});

// The calendar the tap lands on, mounted for real: signed in, it opens on the day it is handed; with no
// day (Month view, Train's and Eat's links pass a click event) it opens on today; signed out it keeps
// its demo month.
test('the calendar opens on the day Home hands it, else today, and signed out on its demo month', async () => {
  const CAL = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx'), {
    registry: new Map([['react', { ...SHIM, useContext: (c) => (c._currentValue == null ? { open() {}, close() {} } : c._currentValue) }], ['react-dom', { createPortal: (n) => n }]]),
    appendExports: 'export { BSCalendarScreen };',
  });
  const opensOn = (props) => {
    const d = drive(CAL.BSCalendarScreen, { role: 'client', onBack() {}, ...props });
    const m = d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSCalendarMonth');
    return [m.props.viewYear, m.props.viewMonth, m.props.selDay];
  };
  const now = new Date();
  try {
    globalThis.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    assert.deepEqual(opensOn({ initialDate: new Date(2026, 10, 3) }), [2026, 10, 3], 'the tapped day');
    assert.deepEqual(opensOn({}), [now.getFullYear(), now.getMonth(), now.getDate()], 'no day: today');
    assert.deepEqual(opensOn({ initialDate: new Date('not a day') }), [now.getFullYear(), now.getMonth(), now.getDate()], 'a bad date: today');
    delete globalThis.ShapeAuth;
    assert.deepEqual(opensOn({ initialDate: new Date(2026, 10, 3) }), [2026, 4, 14], 'signed out: the demo month');
  } finally {
    delete globalThis.ShapeAuth;
  }
});

// Part 2: the morning card's door (its done line and summary) and, with Check-ins off, the quiet row
// open Your mornings in Home's place, with the cycle chip handed in (it is never drawn on Home), and
// the page's Back is Home again.
test("Home's check-in doors open Your mornings in Home's place, and its Back is Home", () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientHome, { onProfile() {}, goCalendar() {}, goRadio() {}, goTrain() {}, goEat() {}, goMarket() {}, goScore() {}, goChat() {}, goIntegrations() {}, tweaks: {}, setTweak() {} });
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  assert.equal(d.nodes().some(fn('BSCycleTodayChip')), false, 'the cycle chip is drawn on Home');
  for (const variant of ['bulletin', 'row']) {
    const door = d.nodes().find((n) => fn('BSTodayNudge')(n) && n.props.variant === variant);
    assert.ok(door && typeof door.props.onOpen === 'function', `Home has no ${variant} door`);
    door.props.onOpen();
    d.render();
    const page = d.nodes()[0];
    assert.equal(page.type, BSYourMornings, `the ${variant} door did not open Your mornings`);
    assert.equal(page.props.cycleChip && page.props.cycleChip.type, BSCycleTodayChip, 'the page lost the cycle chip');
    assert.equal(page.props.checkinsOn, true, 'signed out, Check-ins reads on');
    page.props.onBack();
    d.render();
    assert.ok(d.nodes().some(fn('BSTodayNudge')), `Back from the ${variant} door did not return to Home`);
  }
});

test('the plan\'s list keeps every meal an ingredient is for, though its line names two', () => {
  const meal = (title) => ({ title, ingredients: [{ m: 'Lemon', n: '½' }] });
  const list = bsBuildPlanGrocery([{ meals: [meal('A'), meal('B')] }, { meals: [meal('C')] }], 'Dr. Maya Patel', null, null);
  const lemon = list.aisles.flatMap((a) => a.items).find((it) => it.n === 'Lemon');
  assert.equal(lemon.meals, 'A · B +1', 'the line is unchanged');
  assert.deepEqual(lemon.mealList, ['A', 'B', 'C'], 'Shop by meal needs the third meal too');
});

// ── The shop list on each meal ───────────────────────────────────────────────

test('a meal\'s shop list names the other meals a shared item is for, and one tick is one tick', () => {
  const aisles = [
    { aisle: 'Produce', items: [{ n: 'Lemon', mealList: ['Soup', 'Salad'] }, { n: 'Kale', meals: 'Salad' }] },
    { aisle: 'Pantry', items: [{ n: 'Salt', mealList: ['Soup'], have: true }] },
  ];
  const soup = F.bsMealShopItems(aisles, 'Soup');
  assert.deepEqual(soup.map((x) => [x.item.n, x.also]), [['Lemon', ['Salad']], ['Salt', []]]);
  assert.equal(F.bsMealShopItems(aisles, 'Pie').length, 0);
  // Nothing remembered: the list's defaults hold (a pantry staple starts got).
  assert.equal(F.bsGroceryIsGot(aisles[1].items[0], null), true);
  assert.equal(F.bsGroceryIsGot(aisles[0].items[0], null), false);
  // The first tick keeps the defaults and adds the item, by name.
  const got = F.bsToggleGot(aisles, null, aisles[0].items[0]);
  assert.deepEqual([...got].sort(), ['lemon', 'salt']);
  assert.equal(F.bsGroceryIsGot({ n: ' LEMON ' }, got), true, 'matched by name, whatever the case or spacing');
  assert.deepEqual([...F.bsToggleGot(aisles, got, { n: 'Lemon' })], ['salt'], 'a second tick takes it off');
  const box3 = new Map();
  const st = { getItem: (k) => (box3.has(k) ? box3.get(k) : null), setItem: (k, v) => box3.set(k, String(v)) };
  assert.equal(F.bsReadGotItems(st, 'L'), null, 'nothing remembered reads as null, not as nothing got');
  F.bsSaveGotItems(st, 'L', new Set());
  assert.deepEqual([...F.bsReadGotItems(st, 'L')], [], 'an empty set is remembered: every default was unticked');
});

test('the ticked rows follow their items when the open list changes under the screen', () => {
  const was = [{ aisle: 'Produce', items: [{ n: 'Lemon' }, { n: 'Kale' }] }, { aisle: 'Pantry', items: [{ n: 'Salt', have: true }] }];
  assert.deepEqual([...F.bsGroceryCheckedKeys(was, null)], ['1-0'], 'nothing remembered: the defaults hold');
  const got = F.bsToggleGot(was, null, was[0].items[1]);   // Kale ticked
  assert.deepEqual([...F.bsGroceryCheckedKeys(was, got)].sort(), ['0-1', '1-0']);
  // Another device puts Basil in front and drops Lemon (Codex P2 on #2433): Kale is still the ticked one
  // and Basil isn't, though Basil now sits in Kale's old row.
  const now = [{ aisle: 'Produce', items: [{ n: 'Basil' }, { n: 'Kale' }] }, { aisle: 'Pantry', items: [{ n: 'Salt', have: true }] }];
  const moved = [{ aisle: 'Pantry', items: [{ n: 'Salt' }] }, { aisle: 'Produce', items: [{ n: 'Kale' }, { n: 'Basil' }, { n: 'Lemon' }] }];
  assert.deepEqual([...F.bsGroceryCheckedKeys(now, got)].sort(), ['0-1', '1-0']);
  assert.deepEqual([...F.bsGroceryCheckedKeys(moved, got)].sort(), ['0-0', '1-0'], 'a reorder moves the ticks with their items');
  assert.equal(F.bsGroceryCheckedKeys(undefined, got).size, 0);
});

test('the week and month kcal averages read calories eaten, never a device\'s calories burned', () => {
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'client', 'progress', 'route.ts'), 'utf8');
  assert.match(route, /Math\.round\(4 \* g\('protein_g'\) \+ 4 \* g\('carbs_g'\) \+ 9 \* g\('fat_g'\)\)/);
  assert.match(route, /calories: caloriesSeries,/);
  assert.doesNotMatch(route, /seriesFor\('calories'\)/, 'the snapshot calories column also holds Garmin/Oura active calories');
});
