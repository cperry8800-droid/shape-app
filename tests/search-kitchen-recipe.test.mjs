// A Shape Kitchen recipe opened from search: its "Send to grocery list" did nothing. Search mounted the
// recipe page with an empty handler (War Room: "the Shape Kitchen recipe page opened from search still
// has a grocery button that does nothing"). It now saves the recipe's own list through the path a list
// sent in chat takes (bsSaveReceivedGroceryList): the Eat page takes it when it is mounted, else this
// device's lists and the cloud document. The list is the one the Eat page's Recipes tab builds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadBroadsheet, loadCarved, drive, importSibling } from './helpers/broadsheet-mount.mjs';

// The client puts BSShapeKitchenRecipe and bsSkRecipeGroceryList on window as it loads; the module,
// carved out of it (BSSearchKitchenRecipe.jsx), reads them there when it draws.
const CLIENT = await loadBroadsheet(['bsSkRecipeGroceryList', 'BSShapeKitchenRecipe']);
const { BSSearchKitchenRecipe } = await loadCarved('BSSearchKitchenRecipe.jsx');
const MOD = { BSSearchKitchenRecipe, bsSkRecipeGroceryList: CLIENT.bsSkRecipeGroceryList };
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');
const recipe = SHAPE_KITCHEN_RECIPES[0];

// The harness's window is globalThis, which has no events or storage of its own: each test gives it some.
const bus = new EventTarget();
globalThis.addEventListener = bus.addEventListener.bind(bus);
globalThis.removeEventListener = bus.removeEventListener.bind(bus);
globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);
const toasts = [];
globalThis.__bsToast = (msg, kind) => toasts.push([msg, kind]);
const memoryStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const page = () => drive(MOD.BSSearchKitchenRecipe, { recipe, onBack() {} });
const recipePage = (d) => d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSShapeKitchenRecipe');
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the list is the recipe\'s own, the one the Eat page\'s Recipes tab builds', () => {
  const list = MOD.bsSkRecipeGroceryList(recipe);
  assert.match(list.id, /^sk-[a-z0-9-]+$/);
  assert.equal(list.name, `${recipe.title} grocery list`);
  assert.equal(list.items.length, recipe.ingredients.length);
  assert.ok(list.items.every((it) => it.n && it.meals === recipe.title));
  assert.equal(MOD.bsSkRecipeGroceryList(recipe).id, list.id, 'sending it again finds the same list');
  assert.equal(MOD.bsSkRecipeGroceryList(null), null);
  // The Eat page builds it here too, so the two are one list.
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  assert.match(src, /const addSKRecipeToGrocery = \(recipe\) => \{\n\s+const list = bsSkRecipeGroceryList\(recipe\);/);
  // The module reads what the client puts on window, and never imports the client back.
  assert.equal(window.bsSkRecipeGroceryList, CLIENT.bsSkRecipeGroceryList);
  assert.equal(window.BSShapeKitchenRecipe, CLIENT.BSShapeKitchenRecipe);
  const mod = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSSearchKitchenRecipe.jsx'), 'utf8');
  assert.doesNotMatch(mod, /from '\.\/iosAppBroadsheetClient/);
  assert.doesNotMatch(src, /^function BSSearchKitchenRecipe/m, 'the component is the module\'s, not the client\'s');
});

test('Send to grocery list saves it: the Eat page, when it is mounted, takes the list', async () => {
  globalThis.localStorage = memoryStorage();
  delete globalThis.bsRequireAccount;
  const taken = [];
  const onReceived = (e) => { taken.push(e.detail.list); e.detail.handled = true; };
  globalThis.addEventListener('shape:groceryReceived', onReceived);
  try {
    toasts.length = 0;
    const d = page();
    assert.equal(recipePage(d).props.groceryAdded, false, 'not on the list yet');
    await recipePage(d).props.onAddGrocery();
    d.render();
    assert.equal(taken.length, 1, 'the button did nothing');
    assert.equal(taken[0].id, MOD.bsSkRecipeGroceryList(recipe).id);
    assert.equal(recipePage(d).props.groceryAdded, true, 'it reads as on the list');
    assert.deepEqual(toasts, [['Saved to your grocery lists', 'ok']]);
    await recipePage(d).props.onAddGrocery();
    assert.equal(taken.length, 1, 'once on the list, a second tap sends nothing');
  } finally { globalThis.removeEventListener('shape:groceryReceived', onReceived); }
});

test('with the Eat page closed it lands in this device\'s lists; a list already there reads as on the list', async () => {
  const store = memoryStorage();
  globalThis.localStorage = store;
  delete globalThis.bsRequireAccount;
  const d = page();
  await recipePage(d).props.onAddGrocery();
  await tick();
  d.render();
  // The key the Eat page reads its lists from on its next mount (BSGroceryShare.jsx's LISTS_KEY).
  const saved = JSON.parse(store.getItem('shape.recipeGroceryLists') || '[]');
  assert.ok(Array.isArray(saved) && saved.some((l) => l && l.id === MOD.bsSkRecipeGroceryList(recipe).id), 'not in the device\'s lists');
  assert.equal(recipePage(d).props.groceryAdded, true);
  // Opened again, the recipe already reads as on the list.
  assert.equal(recipePage(page()).props.groceryAdded, true);
});

test('a guest is asked for an account first, and nothing is sent; a save that lands nowhere says so', async () => {
  const taken = [];
  const onReceived = (e) => { taken.push(e.detail.list); };
  globalThis.addEventListener('shape:groceryReceived', onReceived);
  try {
    globalThis.localStorage = memoryStorage();
    const asked = [];
    globalThis.bsRequireAccount = (why) => { asked.push(why); return false; };
    const guest = page();
    await recipePage(guest).props.onAddGrocery();
    guest.render();
    assert.deepEqual(asked, ['add to your grocery list']);
    assert.equal(taken.length, 0, 'a guest\'s tap sent the list');
    assert.equal(recipePage(guest).props.groceryAdded, false);
    // Signed in, with storage refused and no cloud, the list is kept nowhere: the button stays and says so.
    globalThis.bsRequireAccount = () => true;
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    toasts.length = 0;
    const d = page();
    await recipePage(d).props.onAddGrocery();
    await tick();
    d.render();
    assert.equal(recipePage(d).props.groceryAdded, false, 'it read as saved over a list kept nowhere');
    assert.deepEqual(toasts, [['Could not save the list. Try again.', 'error']]);
  } finally {
    globalThis.removeEventListener('shape:groceryReceived', onReceived);
    delete globalThis.bsRequireAccount;
  }
});

test('a coach\'s copy goes to their own lists, which their Grocery Lists page reads, not the member\'s Eat lists (Codex P1 on #2559)', async () => {
  // Both coach apps open this search. A coach's lists are coach_grocery_lists (window.ShapeGroceryLists),
  // so a copy saved to the member store read as saved and could not be found.
  const sentToEat = [];
  const onReceived = (e) => { sentToEat.push(e.detail.list); e.detail.handled = true; };
  globalThis.addEventListener('shape:groceryReceived', onReceived);
  const created = [];
  globalThis.ShapeGroceryLists = { create: async (body) => { created.push(body); return { id: 'g1' }; } };
  try {
    for (const role of ['trainer', 'nutritionist']) {
      created.length = 0;
      sentToEat.length = 0;
      toasts.length = 0;
      globalThis.localStorage = memoryStorage();
      globalThis.ShapeAuth = { getCachedState: () => ({ profile: { role } }) };
      delete globalThis.bsRequireAccount;
      const d = page();
      assert.equal(recipePage(d).props.groceryAdded, false);
      await recipePage(d).props.onAddGrocery();
      d.render();
      assert.equal(sentToEat.length, 0, `${role}: the copy went to the member's Eat lists`);
      assert.equal(created.length, 1, `${role}: nothing saved to the coach's lists`);
      assert.equal(created[0].name, `${recipe.title} grocery list`);
      assert.equal(created[0].items.length, recipe.ingredients.length, 'every ingredient, quantity in the name');
      assert.ok(created[0].items.every((it) => it.name && it.aisle));
      assert.equal(recipePage(d).props.groceryAdded, true);
      assert.deepEqual(toasts, [['Saved to your grocery lists', 'ok']]);
      // Opened again on this device, it reads as on the coach's list.
      assert.equal(recipePage(page()).props.groceryAdded, true);
    }
    // The coach's lists refuse it: the button stays and says so.
    globalThis.ShapeGroceryLists = { create: async () => { throw new Error('403'); } };
    globalThis.localStorage = memoryStorage();
    toasts.length = 0;
    const d = page();
    await recipePage(d).props.onAddGrocery();
    d.render();
    assert.equal(recipePage(d).props.groceryAdded, false);
    assert.deepEqual(toasts, [['Could not save the list. Try again.', 'error']]);
  } finally {
    globalThis.removeEventListener('shape:groceryReceived', onReceived);
    delete globalThis.ShapeAuth;
    delete globalThis.ShapeGroceryLists;
  }
});
