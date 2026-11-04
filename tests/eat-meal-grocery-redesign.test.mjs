// Eat's meal page and its Grocery tab, redesigned (owner, 2026-11-04: "B for meal page and grocery", then
// "actually C for grocery list", then of C's head "include a bubble around this top part that matches C
// design"), and carved out of iosAppBroadsheetClient.jsx into BSMealPage.jsx and BSGroceryList.jsx, as
// BSGroceryLibrary.jsx and BSLeaderboard.jsx were (the WORKLOG rule: a PR that touches a self-contained
// screen moves it into its own module).
//
// What it pins:
//   · THE SEAM. Each module imports no host module back, reads no window global while it evaluates
//     (React #130 otherwise), names its globals on each component's first line and carries its own
//     translator; the client imports both, declares neither, and puts on window what they read.
//   · THE MEAL PAGE (B), driven: the photo hero with the glass card over it (the slot and time, the title,
//     the four figures), Cook this opening Cook Mode with Cook with something else beside it, the facts
//     line, the ingredients card (each amount and kcal in its own cell), the method on its rail, Save,
//     and Ate as planned / Log Now.
//   · GROCERY (C), driven: the head as ONE framed slot holding what is left, the list's name, how far the
//     shop has got, its progress line and Switch list; the aisles as LED count slots that switch the aisle;
//     a tick moving an item into In the cart; the next aisle as a lit slot; the Add bar adding; Instacart;
//     the lit chips firing Save, Share and Send; Prep the week after the list; Shop by meal; 44px targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { stripComments } from './helpers/strip-comments.mjs';
import { drive, textOf, flatten, loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const MEAL_FILE = 'mobile-app/src/broadsheet/BSMealPage.jsx';
const GROC_FILE = 'mobile-app/src/broadsheet/BSGroceryList.jsx';
const CLIENT_FILE = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const mealSrc = stripComments(fs.readFileSync(MEAL_FILE, 'utf8'));
const grocSrc = stripComments(fs.readFileSync(GROC_FILE, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT_FILE, 'utf8'));

// ── The seam ──────────────────────────────────────────────────────────────────────────────────────

// Pinned by EVALUATING each module under a window that records every read (the goals module's lesson: a
// top-level read spelled any other way passes a regex). Run before anything else loads the siblings.
test('evaluating either module by itself reads NO window global', async () => {
  for (const [file, exportsWanted] of [[MEAL_FILE, ['BSMealPreview']], [GROC_FILE, ['BSGrocery']]]) {
    const reads = [];
    const recorder = new Proxy({}, {
      get: (_t, prop) => { reads.push(String(prop)); return undefined; },
      has: (_t, prop) => { reads.push(String(prop)); return false; },
    });
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
    let mod;
    try {
      mod = await loadRealModule(path.resolve(file));
    } finally {
      if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
    }
    assert.deepEqual(Object.keys(mod), exportsWanted, `${file} exports the page alone`);
    assert.deepEqual(reads, [], `${file} read window.${reads.join(', window.')} while it was being evaluated (React #130 on first open)`);
  }
});

test('each component names its window globals on its first line, and carries its own translator', () => {
  const firstLine = (src, head) => {
    const at = src.indexOf(head);
    assert.ok(at >= 0, `${head} is not in the module`);
    return src.slice(src.indexOf('\n', at) + 1).split('\n')[0];
  };
  assert.match(firstLine(mealSrc, 'export function BSMealPreview('), /^ {2}const \{ BSPage, BSBackRow, BSMastRow, BSMeCorner, BSHalftone, BSFooter, BSCookMode, BSMealLogged, BSCookWithDoor, useBSLibrary, bsLibToggle, bsNoraOpen, bsHouseholdQty, bsMealSchedTime, bsFmt12, _bsScrollTopOnMount \} = window;$/);
  assert.match(firstLine(grocSrc, 'export function BSGrocery('), /^ {2}const \{ useBS, BSPage, BSPageHeader, BSHeaderTools, BSNutritionTopTabs, BSFooter, BSPostSendSheet, _bsScrollTopOnMount, bsGroceryHues, bsDateLocale, bsAisleLabel, bsGroceryAisleFor, bsNormalizeGroceryList, useBSLibrary, bsLibToggle \} = window;$/);
  for (const head of ['function BSCoachGroceryReview(', 'function GroceryShopBy(', 'function GroceryAisleSlots(']) {
    assert.match(firstLine(grocSrc, head), /^ {2}const \{ [^}]+ \} = window;$/, `${head} does not read its window globals on its first line`);
  }
  for (const src of [mealSrc, grocSrc]) {
    assert.match(src, /^function useShapeTr\(\) \{/m);
    assert.equal((src.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n is read only inside useShapeTr()');
    const imports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
    assert.ok(!imports.some((s) => /iosAppBroadsheet/.test(s)), 'a carved module imports a host module back');
  }
  // The masthead inset is the chrome's, read at call time with the chrome's own fallback.
  assert.match(mealSrc, /const mastTop = window\.BS_MAST_TOP_CSS \|\| BS_MAST_TOP_CSS;/);
});

test('the client imports both pages, declares none of what they draw, and publishes what they read', () => {
  assert.match(client, /^import \{ BSGrocery \} from '\.\/BSGroceryList\.jsx';$/m);
  assert.match(client, /^import \{ BSMealPreview \} from '\.\/BSMealPage\.jsx';$/m);
  for (const gone of ['BSMealPreview', 'BSGrocery', 'BSCoachGroceryReview', 'bsGrocerySwap', 'bsMealPhoto']) {
    assert.doesNotMatch(client, new RegExp(`^function ${gone}\\(`, 'm'), `${gone} is still declared in the client: the old screen is back`);
  }
  assert.doesNotMatch(client, /__mealDetailLook|__groceryLook/, 'a design switch was left behind');
  assert.doesNotMatch(mealSrc + grocSrc, /__mealDetailLook|__groceryLook/, 'a design switch was left behind');
  assert.match(client, /Object\.assign\(window, \{ BSMealLogged, BSCookWithDoor, useBSLibrary, bsLibToggle, bsHouseholdQty, bsMealSchedTime, bsFmt12 \}\);/);
  assert.match(client, /Object\.assign\(window, \{ bsNormalizeGroceryList, bsGroceryAisleFor, useBSLibrary, bsLibToggle \}\);/);
  // Where the pages are drawn did not move.
  assert.equal((client.match(/<BSMealPreview meal=/g) || []).length, 3);
  assert.equal((client.match(/<BSGrocery list=\{activeGroceryList\}/g) || []).length, 1);
});

// ── Driven ────────────────────────────────────────────────────────────────────────────────────────

// The app's translator with no catalog: each string its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
const box = new Map();
globalThis.localStorage = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.BSHalftone = function BSHalftone() { return null; };
// The sheets portal into the phone's surface (the harness's createPortal hands the sheet back as it is).
globalThis.document = { getElementById: () => null, body: {} };
const { BSMealPreview, BSGrocery } = await loadBroadsheet(['BSMealPreview', 'BSGrocery']);

const fnNamed = (name) => (n) => typeof n.type === 'function' && n.type.name === name;
const ofType = (d, name) => d.nodes().filter(fnNamed(name));
const byData = (d, attr) => d.nodes().filter((n) => n.props && n.props[attr] !== undefined);
const sub = (node) => flatten(node.props.children);
const tap = (d, node) => { node.props.onClick({ preventDefault() {}, stopPropagation() {} }); d.render(); };
const buttonWith = (d, words) => {
  const b = d.nodes().find((n) => n.type === 'button' && n.props.onClick && textOf(n).includes(words));
  assert.ok(b, `no button with "${words}"`);
  return b;
};
const tall = (n) => Math.max(Number(n.props.style?.minHeight) || 0, Number(n.props.style?.height) || 0);

const MEAL = () => ({
  id: 'w19-sn', time: '16:00', tag: 'SNACK', title: 'Skyr + chia', kcal: 180, p: 26, c: 14, f: 4,
  prep: '10 min', portion: '1 plate', score: 'A',
  hero: '170 g skyr, 10 g chia, drop of vanilla.', brief: 'Slow-protein snack. Sets up dinner.',
  ingredients: [{ n: '170 g', m: 'Skyr', k: '120 kcal' }, { n: '1 tbsp', m: 'Chia seeds', k: '50 kcal' }, { n: 'drop', m: 'Vanilla', k: '0' }],
  steps: ['Stir the chia through the skyr.', { t: 'Leave it 10 minutes, then stir again.', min: 10 }, 'Ready when it holds a spoon.'],
});

test('the meal page: the photo, the glass card with the title and the four figures, then Cook this', () => {
  box.clear();
  let backed = 0;
  const d = drive(BSMealPreview, { meal: MEAL(), onBack: () => { backed += 1; } });
  // ← Back through the shared row, under the masthead.
  d.back();
  assert.equal(backed, 1);
  const hero = byData(d, 'data-meal-hero')[0];
  assert.ok(hero, 'no photo hero');
  const img = sub(hero).find((n) => n.type === 'img');
  assert.equal(img.props.alt, 'Skyr + chia');
  assert.match(img.props.src, /^https:\/\/images\.unsplash\.com\//, 'a stock photo when the meal carries none');
  const card = byData(d, 'data-meal-card')[0];
  assert.ok(card, 'no glass card over the photo');
  const cardText = textOf(card);
  assert.match(cardText, /SNACK · 4:00 PM/, 'the slot and its time');
  assert.match(cardText, /Skyr \+ chia/);
  for (const fig of ['180', 'Kcal', '26g', 'Protein', '14g', 'Carbs', '4g', 'Fat']) assert.ok(cardText.includes(fig), `the card lacks ${fig}`);
  assert.ok(d.nodes().indexOf(card) > d.nodes().indexOf(hero), 'the card rides over the foot of the photo');
  // Cook this, the raised door, with Cook with something else beside it.
  const cook = d.nodes().find((n) => n.props && n.props['data-bsck-door'] === 'cook');
  assert.match(textOf(cook), /Guided · step by stepCook this/);
  const withDoor = ofType(d, 'BSCookWithDoor')[0];
  assert.ok(withDoor && withDoor.props.cookable, 'Cook with something else sits beside it, with the dish');
  // The facts on one line, a drawn clock rather than the ⏱ glyph.
  assert.match(d.text, /10 min·1 plate·Score A/);
  assert.doesNotMatch(d.text, /⏱/);
  // Opening Cook this hands the meal to Cook Mode.
  tap(d, cook);
  assert.equal(d.nodes()[0].type.name, 'BSCookMode');
  assert.equal(d.nodes()[0].props.cookable.title, 'Skyr + chia');
});

test('the meal page: the ingredients card reads as a table, and the method runs down its rail', () => {
  box.clear();
  const d = drive(BSMealPreview, { meal: MEAL(), onBack() {} });
  const ing = byData(d, 'data-meal-ingredients')[0];
  assert.ok(ing, 'no ingredients card');
  assert.match(textOf(ing), /^The ingredients3kcal/, 'the card heads itself: the label, how many, the kcal column');
  const rows = sub(ing).filter((n) => n.type === 'div' && n.props.style && n.props.style.display === 'grid');
  assert.equal(rows.length, 3);
  const cells = rows[0].props.children.filter(Boolean).map((c) => textOf({ props: { children: c } }));
  assert.deepEqual(cells, ['Skyr', window.bsHouseholdQty('170 g', 'Skyr'), '120'], 'the name, its amount and its kcal, each in a cell');
  const method = byData(d, 'data-meal-method')[0];
  assert.equal(textOf(method), '1Stir the chia through the skyr.2Leave it 10 minutes, then stir again.3Ready when it holds a spoon.', 'numbered, and a coach\'s step object reads as its text');
  const heads = ofType(d, 'BSMealSecHead').map((h) => [textOf(h), h.props.n ?? null]);
  assert.deepEqual(heads, [['The dish', null], ['The method', 3]], 'the section heads: the dish, and the method with how many steps');
  assert.match(d.text, /The dish170 g skyr, 10 g chia, drop of vanilla\.Slow-protein snack\. Sets up dinner\./);
});

test('the meal page: Save keeps the meal, Ate as planned files it, Log Now hands it to the host', () => {
  box.clear();
  const saved = [];
  const realToggle = window.bsLibToggle;
  window.bsLibToggle = (item) => { saved.push(item); };
  const logged = [];
  window.ShapeMealLog = { log: (m) => logged.push(m) };
  let filed = 0;
  try {
    const d = drive(BSMealPreview, { meal: MEAL(), onBack() {}, onFiled: () => { filed += 1; } });
    tap(d, buttonWith(d, '♡ Save'));
    assert.deepEqual(saved.map((x) => [x.id, x.kind, x.title]), [['meal:w19-sn', 'meal', 'Skyr + chia']]);
    tap(d, buttonWith(d, 'Ate as planned'));
    assert.deepEqual(logged, [{ kcal: 180, protein: 26, carbs: 14, fat: 4 }]);
    assert.equal(filed, 1);
    assert.equal(d.nodes()[0].type.name, 'BSMealLogged', 'the logged card follows');
    assert.equal(d.nodes()[0].props.time, '4:00 PM');
    let hosted = 0;
    const h = drive(BSMealPreview, { meal: MEAL(), onBack() {}, onLog: () => { hosted += 1; } });
    tap(h, buttonWith(h, 'Log Now'));
    assert.equal(hosted, 1);
    for (const b of [buttonWith(h, '♡ Save'), buttonWith(h, 'Log Now')]) assert.ok(tall(b) >= 44, 'a 44px target');
  } finally { window.bsLibToggle = realToggle; delete window.ShapeMealLog; }
});

test('a meal opened from the day log, with only its macros, draws no empty sections', () => {
  box.clear();
  const d = drive(BSMealPreview, { meal: { id: 'x', title: 'Toast', kcal: 220, p: 8, c: 30, f: 6 }, onBack() {} });
  assert.equal(byData(d, 'data-meal-ingredients').length, 0);
  assert.equal(byData(d, 'data-meal-method').length, 0);
  assert.doesNotMatch(d.text, /The dish|The method/);
});

// The plan's list, two aisles and a loose item; ticks and the shop-by choice live in `box`.
const LIST = (extra = {}) => ({
  id: 'groc-test', name: "This week's plan", kind: 'plan',
  aisles: [
    { aisle: 'Produce', items: [{ id: 'a', n: 'Apple', q: '1', meals: 'Apple + almond butter' }, { id: 'b', n: 'Banana', q: '1 ×3', meals: 'Banana oats' }, { id: 'c', n: 'Basil', q: '5 g', meals: 'Pasta' }] },
    { aisle: 'Protein', items: [{ id: 'd', n: 'Chicken', q: '2 lb', meals: 'Lunch bowls' }, { id: 'e', n: 'Eggs', q: '12 ct', meals: 'Breakfast' }] },
  ],
  ...extra,
});
const groc = (props = {}) => drive(BSGrocery, { list: LIST(), onProfile() {}, onChangeView() {}, ...props });

test('Grocery: the head is ONE framed slot holding what is left, the name, the progress and Switch list', () => {
  box.clear();
  const d = groc();
  const heads = byData(d, 'data-grocery-list-card');
  assert.equal(heads.length, 1);
  const head = heads[0];
  const s = head.props.style;
  assert.equal(head.type, 'div', 'the head is a slot that holds a key, not one big button');
  assert.match(s.border, /^1px solid rgba\(/, 'a 1px frame tinted to the list\'s kind');
  assert.match(String(s.boxShadow), /inset/, 'the slot\'s inset shadow');
  assert.ok(s.borderRadius >= 12, 'rounded like the Library\'s slots');
  const inside = sub(head);
  const left = inside.find((n) => n.props && n.props['data-grocery-left'] !== undefined);
  assert.equal(textOf(left), '5to get', 'what is left, lit in its own count slot');
  const text = textOf(head);
  for (const words of ['Nutri plan', "This week's plan", '0 of 5 in the cart', 'Switch list']) assert.ok(text.includes(words), `the head lacks "${words}"`);
  const bar = inside.find((n) => n.props && n.props.role === 'progressbar');
  assert.ok(bar, 'the progress line sits inside the head');
  assert.equal(inside.indexOf(bar), inside.length - 2, 'at its foot');
  const sw = inside.find((n) => n.type === 'button');
  assert.equal(textOf(sw), 'Switch list');
  assert.ok(tall(sw) >= 44, 'Switch list is a 44px key');
  assert.equal(sw.props['aria-haspopup'], 'dialog');
  tap(d, sw);
  assert.match(d.text, /Grocery · Switch listChoose a list\./, 'Switch list opens the picker');
});

test('Grocery: the aisles are LED count slots, and a slot switches the aisle', () => {
  box.clear();
  const d = groc();
  assert.doesNotMatch(d.text, /Aisle 1 of/, 'the "Aisle 1 of 5" head is gone');
  const slots = ofType(d, 'GroceryAisleSlots')[0];
  assert.deepEqual(slots.props.stops.map((x) => [x.label, x.left, x.on]), [['Produce', 3, true], ['Protein', 2, false]]);
  // The slots themselves: a lit key per aisle, its count over its name.
  const s = drive(slots.type, slots.props);
  const keys = s.nodes().filter((n) => n.type === 'button');
  assert.deepEqual(keys.map((k) => [textOf(k), k.props['aria-pressed'], k.props['aria-label']]), [['3Produce', true, 'Produce: 3 to get'], ['2Protein', false, 'Protein: 2 to get']]);
  for (const k of keys) assert.ok(tall(k) >= 44, 'a 44px target');
  const aisleHead = () => textOf(byData(d, 'data-grocery-aisle')[0]);
  assert.equal(aisleHead(), 'Produce3 to get');
  assert.match(d.text, /AppleApple \+ almond butter/, 'each item on one line, its meals after its name');
  tap(s, keys[1]);
  d.render();
  assert.equal(aisleHead(), 'Protein2 to get');
  assert.match(d.text, /Chicken/);
  assert.doesNotMatch(d.text, /Banana/, 'one aisle at a time');
});

test('Grocery: a tick moves an item into In the cart, and the next aisle is a lit slot', () => {
  box.clear();
  const d = groc();
  // A row reads its tick (✓ once got), then the name.
  const row = () => d.nodes().find((n) => n.props && n.props.role === 'checkbox' && textOf(n).replace(/^✓/, '').startsWith('Apple'));
  assert.equal(row().props['aria-checked'], false);
  tap(d, row());
  assert.match(d.text, /1 in the cart · Apple/, 'the tick folds it into In the cart');
  assert.equal(textOf(byData(d, 'data-grocery-aisle')[0]), 'Produce2 to get');
  assert.deepEqual(JSON.parse(box.get('shape.grocery.got:groc-test')), ['apple'], 'and the tick is remembered for the list');
  assert.match(textOf(byData(d, 'data-grocery-list-card')[0]), /1 of 5 in the cart/);
  // In the cart opens to the ticked rows.
  tap(d, buttonWith(d, '1 in the cart'));
  assert.equal(row().props['aria-checked'], true);
  // The next aisle with anything left, as a lit slot that walks there.
  const next = byData(d, 'data-grocery-next')[0];
  assert.equal(textOf(next), '2Next aisleProtein→');
  assert.ok(tall(next) >= 44);
  tap(d, next);
  assert.equal(textOf(byData(d, 'data-grocery-aisle')[0]), 'Protein2 to get');
});

test('Grocery: the Add bar adds an item, the mic is in it, and an item can be removed', () => {
  box.clear();
  const updates = [];
  const d = groc({ list: LIST({ kind: 'custom', name: 'Sunday staples' }), editable: true, onUpdate: (l) => updates.push(l) });
  const bar = byData(d, 'data-grocery-add')[0];
  assert.ok(bar, 'an editable list has the Add bar');
  const [item, qty] = sub(bar).filter((n) => n.type === 'input');
  assert.equal(item.props.placeholder, 'Item');
  assert.equal(qty.props.placeholder, 'Qty');
  item.props.onChange({ target: { value: 'Oat milk' } });
  qty.props.onChange({ target: { value: '1 carton' } });
  d.render();
  const keys = sub(byData(d, 'data-grocery-add')[0]).filter((n) => n.type === 'button');
  assert.deepEqual(keys.map((k) => k.props['aria-label']), ['Speak your list — auto-adds each item', 'Add'], 'the mic, then ＋, in the one bar');
  for (const k of keys) assert.ok(tall(k) >= 44, 'a 44px target');
  tap(d, keys[1]);
  assert.equal(updates.length, 1);
  const added = updates[0].aisles[0].items.at(-1);
  assert.deepEqual([added.n, added.q, added.meals], ['Oat milk', '1 carton', 'Sunday staples'], 'it lands in the first aisle, named for the list');
  // × on each row of a list the member can edit.
  const remove = d.nodes().find((n) => n.type === 'button' && n.props['aria-label'] === 'Remove');
  tap(d, remove);
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[1].aisles[0].items.map((x) => x.n), ['Banana', 'Basil']);
  // A plan's list is not editable: no bar, no ×.
  const plan = groc();
  assert.equal(byData(plan, 'data-grocery-add').length, 0);
  assert.equal(plan.nodes().filter((n) => n.props && n.props['aria-label'] === 'Remove').length, 0);
});

test('Grocery: Instacart orders the list, and the lit chips fire Save, Share and Send', async () => {
  box.clear();
  const sent = [];
  window.ShapeIntegrations = { sendGroceryToInstacart: async (x) => { sent.push(x); } };
  const savedLists = [];
  const shared = [];
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { share: async (x) => { shared.push(x); } } });
  try {
    const d = groc({ onSaveToLibrary: (l) => savedLists.push(l) });
    tap(d, buttonWith(d, 'Send to Instacart'));
    assert.deepEqual(sent[0].items.map((x) => x.name), ['Apple', 'Banana', 'Basil', 'Chicken', 'Eggs']);
    const chips = ['+ Save to library', 'Share', 'Send to a member →'].map((w) => d.nodes().find((n) => n.type === 'button' && textOf(n) === w));
    for (const c of chips) {
      assert.ok(c, 'a lit chip is missing');
      assert.match(String(c.props.style.boxShadow), /inset/, 'a lit chip is an LED slot');
      assert.ok(tall(c) >= 44, 'a 44px target');
    }
    tap(d, chips[0]);
    assert.equal(savedLists[0].id, 'groc-test', 'Save hands the list to the host\'s save sheet');
    tap(d, chips[1]);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(shared[0].title, "This week's plan — Shop list");
    assert.match(shared[0].text, /PRODUCE\n {2}• 1 Apple/);
    tap(d, chips[2]);
    const sheet = ofType(d, 'BSPostSendSheet')[0];
    assert.ok(sheet, 'Send to a member opens the send sheet');
    assert.equal(sheet.props.post.grocery.id, 'groc-test');
    assert.equal(chips[2].props['data-bs-grocery-send'], '');
  } finally {
    if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
    delete window.ShapeIntegrations;
  }
});

test('Grocery: Prep the week comes after the list, and the coach\'s sent list sits under the head', () => {
  box.clear();
  let prepped = 0;
  const d = groc({ onPrep: () => { prepped += 1; } });
  const order = d.nodes();
  const prep = order.find((n) => n.props && n.props['data-bsck-door'] === 'prep');
  assert.match(textOf(prep), /Prep the weekPick the dishes and cook them in one go/);
  const at = (n) => order.indexOf(n);
  assert.ok(at(prep) > at(buttonWith(d, 'Send to Instacart')), 'after the list and its actions (shopping done, cooking next)');
  assert.ok(at(prep) > at(byData(d, 'data-grocery-aisle')[0]));
  tap(d, prep);
  assert.equal(prepped, 1);
  const now = d.nodes();
  const review = ofType(d, 'BSCoachGroceryReview')[0];
  assert.ok(review, 'the coach review card is on the page');
  assert.ok(now.indexOf(review) > now.indexOf(byData(d, 'data-grocery-list-card')[0]), 'under the head');
  assert.ok(now.indexOf(review) < now.indexOf(ofType(d, 'GroceryShopBy')[0]), 'and above the list');
});

test('Grocery: shop by meal, each meal\'s count in a lit slot, and a skip takes its items off', () => {
  box.clear();
  const mealWhen = new Map([['Apple + almond butter', { rank: 0, label: 'Today · Snack' }], ['Lunch bowls', { rank: 1, label: 'Today · Lunch' }]]);
  const d = groc({ mealWhen });
  const sw = ofType(d, 'GroceryShopBy')[0];
  // The switch: two lit keys, the chosen one pressed.
  const keys = drive(sw.type, sw.props).nodes().filter((n) => n.type === 'button');
  assert.deepEqual(keys.map((k) => [textOf(k), k.props['aria-pressed']]), [['Aisle', true], ['Meal', false]]);
  for (const k of keys) assert.ok(tall(k) >= 44);
  sw.props.onChange('meal');
  d.render();
  assert.equal(box.get('shape.grocery.shopBy'), 'meal');
  assert.ok(d.text.indexOf('Today · Snack') < d.text.indexOf('Today · Lunch'), 'meals run in the order they come');
  const slots = byData(d, 'data-grocery-meal-got');
  assert.equal(textOf(slots[0]), '0/1');
  assert.equal(slots[0].props['aria-label'], '1 item · 0 got');
  tap(d, buttonWith(d, 'Skip'));
  assert.match(d.text, /Skipped · 1 off/);
  assert.match(textOf(byData(d, 'data-grocery-list-card')[0]), /0 of 4 in the cart · 1 skipped/);
  tap(d, buttonWith(d, 'Undo'));
  assert.doesNotMatch(d.text, /Skipped ·/);
});
