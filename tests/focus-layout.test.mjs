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
import { loadBroadsheet, drive, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
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
const { BSGrocery, BSClientTrain, BSClientHome, bsBuildPlanGrocery } = await loadBroadsheet(['BSGrocery', 'BSClientTrain', 'BSClientHome', 'bsBuildPlanGrocery'], SHIM);
const byType = (d, name) => d.nodes().filter((n) => typeof n.type === 'function' && n.type.name === name);

test('the Grocery page opens by aisle, on the first aisle with anything left', () => {
  box.clear();
  const d = drive(BSGrocery, { list: LIST() });
  const sw = byType(d, 'BSShopBySwitch')[0];
  assert.ok(sw, 'no Shop by switch');
  assert.equal(sw.props.value, 'aisle');
  const route = byType(d, 'BSFocusRoute')[0];
  assert.deepEqual(route.props.stops.map((s) => [s.value, s.on]), [[3, true], [0, false]]);
  assert.match(d.text, /Lemon/);
  assert.match(d.text, /Kale/);
  assert.doesNotMatch(d.text, /Salmon/, 'the other aisle is not on the page');
});

test('shop by meal groups the same ticks by meal, and a skip takes a meal\'s items off', () => {
  box.clear();
  sent.length = 0;
  const mealWhen = new Map([['C', { rank: 0, label: 'Today · Lunch' }], ['A', { rank: 1, label: 'Mon · Dinner' }]]);
  const d = drive(BSGrocery, { list: LIST(), mealWhen });
  byType(d, 'BSShopBySwitch')[0].props.onChange('meal');
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

test('Train reads in the Focus order: the week, the session, the links', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientTrain, { onProfile() {}, goRadio() {}, goMarket() {}, goCalendar() {} });
  const order = d.nodes();
  const at = (pred) => order.findIndex(pred);
  const week = at((n) => typeof n.type === 'function' && n.type.name === 'BSWeekStrip');
  const lead = at((n) => n.props && n.props.tour === 'hero-train');
  const find = at((n) => typeof n.type === 'function' && n.type.name === 'BSFindCoachBar');
  assert.ok(week >= 0 && lead > week, 'the session sits under the week');
  assert.ok(find > lead, 'Find a trainer is a link at the foot, not pinned to the top');
  assert.ok(String(order[lead].props.title || '').length > 0, 'the session has a title');
});

// Owner, 2026-10-11, on the first build: "your line should be above at a glance"
// and "check-in should be towards the top".
test('Home reads in the Focus order: check-in, next stop, your line, at a glance, then the links', () => {
  delete globalThis.ShapeAuth;
  const d = drive(BSClientHome, { onProfile() {}, goCalendar() {}, goRadio() {}, goTrain() {}, goEat() {}, goMarket() {}, goScore() {}, goChat() {}, goIntegrations() {}, tweaks: {}, setTweak() {} });
  const order = d.nodes();
  const at = (pred) => order.findIndex(pred);
  const fn = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
  const checkin = at((n) => fn('BSTodayNudge')(n) && n.props.variant === 'bulletin');
  const lead = at((n) => n.props && n.props.tour === 'hero-home');
  const line = at((n) => fn('BSFocusTitle')(n) && n.props.title === 'Your line');
  const glance = at((n) => fn('BSFocusTitle')(n) && n.props.title === 'At a glance');
  const steps = at((n) => fn('BSFocusLeader')(n) && n.props.label === 'Steps');
  const habits = at((n) => n.props && n.props.tour === 'hero-habits');
  assert.ok(lead >= 0, 'no next-stop lead (today always has one, the done state included)');
  assert.ok(checkin >= 0 && checkin < lead, 'the check-in sits at the top, above the next stop');
  assert.ok(line > lead, 'the line sits under the next stop');
  assert.ok(glance > line && steps > glance, 'at a glance comes after the line and holds the steps row');
  assert.ok(habits > steps, 'daily habits is a link at the foot');
  assert.equal(typeof order[habits].props.onOpen, 'function');
  assert.doesNotMatch(d.text, /Today's slate/, 'the old slate head is gone');
});

test('the plan\'s list keeps every meal an ingredient is for, though its line names two', () => {
  const meal = (title) => ({ title, ingredients: [{ m: 'Lemon', n: '½' }] });
  const list = bsBuildPlanGrocery([{ meals: [meal('A'), meal('B')] }, { meals: [meal('C')] }], 'Dr. Maya Patel', null, null);
  const lemon = list.aisles.flatMap((a) => a.items).find((it) => it.n === 'Lemon');
  assert.equal(lemon.meals, 'A · B +1', 'the line is unchanged');
  assert.deepEqual(lemon.mealList, ['A', 'B', 'C'], 'Shop by meal needs the third meal too');
});

// ── At a glance · Day / Week / Month, and the shop list on each meal ─────────

test('a week or month average counts only days with something logged, in its own window', () => {
  const s = [
    { date: '2026-10-11', value: 2000 }, { date: '2026-10-10', value: 1800 },
    { date: '2026-10-05', value: 0 },     // nothing logged: not a day of zero
    { date: '2026-10-04', value: 2600 },  // 8 days back: outside a week
    { date: '2026-10-12', value: 9999 },  // tomorrow: never counted
  ];
  assert.deepEqual(F.bsPeriodAverage(s, '2026-10-11', 7), { avg: 1900, logged: 2, days: 7 });
  assert.deepEqual(F.bsPeriodAverage(s, '2026-10-11', 30), { avg: 2133, logged: 3, days: 30 });
  assert.deepEqual(F.bsPeriodAverage([], '2026-10-11', 7), { avg: null, logged: 0, days: 7 });
  assert.equal(F.bsPeriodAverage(s, 'not a day', 7).avg, null);
});

test('the glance period is remembered, and anything unknown reads as Day', () => {
  const box2 = new Map();
  const st = { getItem: (k) => (box2.has(k) ? box2.get(k) : null), setItem: (k, v) => box2.set(k, String(v)) };
  assert.equal(F.bsReadGlancePeriod(st), 'day');
  F.bsSaveGlancePeriod(st, 'month');
  assert.equal(F.bsReadGlancePeriod(st), 'month');
  F.bsSaveGlancePeriod(st, 'year');
  assert.equal(F.bsReadGlancePeriod(st), 'month', 'an unknown period is not saved');
  assert.equal(F.bsReadGlancePeriod({ getItem() { throw new Error('private mode'); } }), 'day');
});

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

test('the week and month kcal averages read calories eaten, never a device\'s calories burned', () => {
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'client', 'progress', 'route.ts'), 'utf8');
  assert.match(route, /Math\.round\(4 \* g\('protein_g'\) \+ 4 \* g\('carbs_g'\) \+ 9 \* g\('fat_g'\)\)/);
  assert.match(route, /calories: caloriesSeries,/);
  assert.doesNotMatch(route, /seriesFor\('calories'\)/, 'the snapshot calories column also holds Garmin/Oura active calories');
});
