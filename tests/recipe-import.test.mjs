// Member recipe import — the store, the no-window invariant, the paste split.
// Spec: docs/superpowers/specs/2026-09-10-third-party-recipe-import-design.md
//
// Everything here DRIVES the shipped functions (the store's IO is injected for
// exactly this reason). Nothing greps source text: a spelling pin cannot tell an
// equivalent rewrite from a regression, and this file's whole subject is a set
// of behaviours whose failure modes are silent.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BS_RECIPES_KIND,
  BS_RECIPES_V,
  bsRecipesMirrorKey,
  bsMyRecipePointerId,
  bsIsMyRecipeId,
  bsMyRecipeIdFrom,
  bsRecipeIngredient,
  bsRecipeItem,
  bsRecipesDoc,
  bsRecipesList,
  bsRecipesPut,
  bsRecipesDrop,
  bsRecipePointer,
  bsRecipesUidSync,
  bsRecipesStore,
  bsSplitPaste,
  bsNewRecipeId,
} from '../mobile-app/src/services/clientRecipes.mjs';

import { bsCookableFromRecipe, bsCookableFromMemberRecipe, BS_COOK_TIERS } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

// ── harness ────────────────────────────────────────────────────────────────

const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
};

// A scriptable shapeDb. `goals` is the cloud row (null = can't-know, {} = an
// absent row), `uids` is a queue so a test can change the account BETWEEN the
// read and the write — the one window the commit's re-resolve exists to close.
const fakeDb = ({ uids = ['u1'], goals = {}, saveResult = {}, onSave } = {}) => {
  const calls = { getUser: 0, getUserGoals: 0, saveUserGoals: [] };
  const q = [...uids];
  return {
    calls,
    getUser: async () => { calls.getUser += 1; const u = q.length > 1 ? q.shift() : q[0]; return u ? { id: u } : null; },
    getUserGoals: async (kind) => { calls.getUserGoals += 1; assert.equal(kind, BS_RECIPES_KIND); return goals; },
    saveUserGoals: async (kind, doc) => {
      calls.saveUserGoals.push([kind, doc]);
      if (onSave) onSave(doc);
      return typeof saveResult === 'function' ? saveResult() : saveResult;
    },
  };
};

// ── normalizers ────────────────────────────────────────────────────────────

test('an ingredient normalizes into the catalog {n, m, k} grammar', () => {
  assert.deepEqual(bsRecipeIngredient('  flour '), { n: '', m: 'flour' });
  assert.deepEqual(bsRecipeIngredient({ n: '1 cup', m: 'flour' }), { n: '1 cup', m: 'flour' });
  assert.deepEqual(bsRecipeIngredient({ n: 2, m: 'eggs' }), { n: '', m: 'eggs' });
  assert.deepEqual(bsRecipeIngredient({ m: 'salt', k: '0 kcal' }), { n: '', m: 'salt', k: '0 kcal' });
  // No name is no row — an amount alone names nothing.
  assert.equal(bsRecipeIngredient({ n: '1 cup' }), null);
  assert.equal(bsRecipeIngredient(null), null);
  assert.equal(bsRecipeIngredient(42), null);
});

test('a stored item drops stepMeta and coerces every step to a plain string', () => {
  const it = bsRecipeItem({
    id: 'a', title: 'Soup',
    steps: ['Chop.', { t: 'Simmer 20 minutes.', min: 20, passive: true, station: 'stove' }, '', null, 7],
    stepMeta: [{ min: 20, passive: true, station: 'oven' }],
    ingredients: [{ n: '1', m: 'onion' }, 'water', { n: '2' }],
    servings: 4.7,
  });
  assert.deepEqual(it.steps, ['Chop.', 'Simmer 20 minutes.']);
  assert.equal('stepMeta' in it, false);
  assert.deepEqual(it.ingredients, [{ n: '1', m: 'onion' }, { n: '', m: 'water' }]);
  assert.equal(it.servings, 4);
  assert.equal(it.sourceKind, 'paste');
  assert.equal('draftedByAI' in it, false);
});

test('draftedByAI survives only on an explicit true, and is never inverted', () => {
  assert.equal(bsRecipeItem({ id: 'a', title: 'T', draftedByAI: true }).draftedByAI, true);
  assert.equal('draftedByAI' in bsRecipeItem({ id: 'a', title: 'T', draftedByAI: 'yes' }), false);
  assert.equal('draftedByAI' in bsRecipeItem({ id: 'a', title: 'T', draftedByAI: false }), false);
});

test('an item with no id or no title is not a recipe', () => {
  assert.equal(bsRecipeItem({ title: 'T' }), null);
  assert.equal(bsRecipeItem({ id: 'a' }), null);
  assert.equal(bsRecipeItem({ id: '  ', title: 'T' }), null);
});

test('the document rejects prototype keys and drops rows that will not normalize', () => {
  const d = bsRecipesDoc({ items: { a: { id: 'a', title: 'A' }, bad: { title: 'no id' } } });
  assert.deepEqual(Object.keys(d.items), ['a']);
  assert.equal(d.v, BS_RECIPES_V);
  // An INHERITED entry is never visited — Object.keys is own-enumerable only,
  // and a `for…in` here would walk the prototype chain.
  const proto = bsRecipesDoc({ items: Object.create({ constructor: { id: 'x', title: 'X' } }) });
  assert.deepEqual(proto.items, {});
  assert.deepEqual(Object.keys(proto.items), []);
  // Nothing shaped like a document at all is an empty document, never a throw.
  for (const junk of [null, undefined, 7, 'x', [], { items: 'no' }]) {
    assert.deepEqual(bsRecipesDoc(junk), { v: BS_RECIPES_V, items: {} });
  }
});

test('an id that would not behave as a key is refused', () => {
  // ⚠ `items[id] = item` is an assignment, so an id of `__proto__` invokes the
  // setter: the recipe disappears AND the document's prototype is replaced.
  for (const bad of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(bsRecipeItem({ id: bad, title: 'T' }), null);
  }
  const d = bsRecipesDoc({ items: { x: { id: '__proto__', title: 'Hostile', steps: ['One.'] }, ok: { id: 'ok', title: 'Fine' } } });
  assert.deepEqual(Object.keys(d.items), ['ok']);
  assert.equal(Object.getPrototypeOf(d.items), Object.prototype);
  assert.equal(bsRecipesPut(d, { id: '__proto__', title: 'Hostile' }).items.ok.title, 'Fine');
  assert.equal(Object.keys(bsRecipesPut(d, { id: '__proto__', title: 'Hostile' }).items).length, 1);
});

test('the list is newest-first with a total order', () => {
  const doc = { items: {
    a: { id: 'a', title: 'A', createdAt: 100, updatedAt: 100 },
    b: { id: 'b', title: 'B', createdAt: 100, updatedAt: 300 },
    c: { id: 'c', title: 'C', createdAt: 100, updatedAt: 100 },
  } };
  assert.deepEqual(bsRecipesList(doc).map((x) => x.id), ['b', 'a', 'c']);
  // Same input, same order — a re-render cannot reshuffle the Catalogue.
  assert.deepEqual(bsRecipesList(doc).map((x) => x.id), bsRecipesList(doc).map((x) => x.id));
});

test('put replaces by id; drop is an upsert with the key gone', () => {
  const one = bsRecipesPut({}, { id: 'a', title: 'A' });
  assert.deepEqual(Object.keys(one.items), ['a']);
  const two = bsRecipesPut(one, { id: 'a', title: 'A2' });
  assert.equal(Object.keys(two.items).length, 1);
  assert.equal(two.items.a.title, 'A2');
  const gone = bsRecipesDrop(two, 'a');
  assert.deepEqual(gone.items, {});
  // Dropping something absent is a no-op document, never a throw.
  assert.deepEqual(bsRecipesDrop(gone, 'nope').items, {});
  assert.deepEqual(bsRecipesDrop(gone, null).items, {});
});

// ── the pointer ────────────────────────────────────────────────────────────

test('a member pointer is namespaced, marked mine, and credited to NOBODY', () => {
  const p = bsRecipePointer({ id: 'r1', title: 'Nana\'s lemon chicken', steps: ['One.'], ingredients: [{ n: '1', m: 'lemon' }], updatedAt: 5 });
  assert.equal(p.id, 'myrecipe:r1');
  assert.equal(p.recipeId, 'r1');
  assert.equal(p.mine, true);
  assert.equal(p.kind, 'recipe');
  // ⚠ A coach byline on a member's own dish is a fabricated credit.
  assert.equal(p.coach, null);
  assert.equal(p.meta, '1 step · 1 ingredient');
  assert.equal(bsRecipePointer({ id: 'r2', title: 'T' }).meta, 'Your recipe');
  assert.equal(bsRecipePointer({ title: 'no id' }), null);
});

test('the pointer prefix cannot collide with a catalog pointer', () => {
  assert.equal(bsIsMyRecipeId(bsMyRecipePointerId('abc')), true);
  assert.equal(bsMyRecipeIdFrom('myrecipe:abc'), 'abc');
  assert.equal(bsIsMyRecipeId('recipe:one-pan-chicken-and-rice'), false);
  assert.equal(bsMyRecipeIdFrom('recipe:one-pan-chicken-and-rice'), null);
  assert.equal(bsIsMyRecipeId(null), false);
  // And no catalog recipe carries it, so the Catalogue can route on the prefix.
  for (const r of SHAPE_KITCHEN_RECIPES) assert.equal(bsIsMyRecipeId(r.title), false);
});

test('a new id carries real entropy, so two saves in one millisecond differ', () => {
  // ⚠ The old fallback was `r${now}${now % 9973}` — a pure function of `now`, so
  // the suffix added nothing and a same-millisecond pair minted the SAME id.
  // bsRecipesPut replaces by id, so the first recipe vanished with no error.
  const now = 1757500000000;
  assert.equal(new Set(Array.from({ length: 300 }, () => bsNewRecipeId(now, {}))).size, 300);
  assert.equal(new Set(Array.from({ length: 300 }, () => bsNewRecipeId(now, { crypto: globalThis.crypto }))).size, 300);
  // A hostile crypto object is survivable, and still unique.
  const hostile = { crypto: { randomUUID: () => { throw new Error('blocked'); }, getRandomValues: () => { throw new Error('blocked'); } } };
  assert.equal(new Set(Array.from({ length: 300 }, () => bsNewRecipeId(now, hostile))).size, 300);
  // And a minted id is never one the document refuses.
  assert.ok(bsRecipeItem({ id: bsNewRecipeId(now, {}), title: 'T' }));
});

test('the mirror key is per-uid — a shared device never mixes two members', () => {
  assert.notEqual(bsRecipesMirrorKey('u1'), bsRecipesMirrorKey('u2'));
  assert.ok(bsRecipesMirrorKey('u1').startsWith('shape.recipes.'));
  assert.equal(bsRecipesUidSync({}), null);
  assert.equal(bsRecipesUidSync({ ShapeAuth: { getCachedState: () => ({ user: { id: 'u9' } }) } }), 'u9');
  assert.equal(bsRecipesUidSync({ ShapeAuth: { getCachedState: () => { throw new Error('boom'); } } }), null);
});

// ── the store ──────────────────────────────────────────────────────────────

test('a save writes the merged document and the mirror', async () => {
  const storage = memStorage();
  const db = fakeDb({ goals: { v: 1, items: { old: { id: 'old', title: 'Old' } } } });
  const res = await bsRecipesStore({ db, storage }).save({ id: 'new', title: 'New' });
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.doc.items).sort(), ['new', 'old']);
  const [kind, doc] = db.calls.saveUserGoals[0];
  assert.equal(kind, BS_RECIPES_KIND);
  assert.deepEqual(Object.keys(doc.items).sort(), ['new', 'old']);
  assert.deepEqual(JSON.parse(storage.getItem(bsRecipesMirrorKey('u1'))).items.new.title, 'New');
});

test('an ABSENT row ({}) is a real empty document and is merged into', async () => {
  const db = fakeDb({ goals: {} });
  const res = await bsRecipesStore({ db, storage: memStorage() }).save({ id: 'a', title: 'A' });
  assert.equal(res.ok, true);
  assert.equal(db.calls.saveUserGoals.length, 1);
});

test('an UNREADABLE row (null) declines the write — it never publishes an empty document', async () => {
  const storage = memStorage();
  storage.setItem(bsRecipesMirrorKey('u1'), JSON.stringify({ v: 1, items: { keep: { id: 'keep', title: 'Keep' } } }));
  const db = fakeDb({ goals: null });
  const res = await bsRecipesStore({ db, storage }).save({ id: 'a', title: 'A' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unreadable');
  assert.equal(db.calls.saveUserGoals.length, 0);
  // ⚠ and the member's existing recipes are still on the device.
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(bsRecipesMirrorKey('u1'))).items), ['keep']);
});

test('signed out declines before any read', async () => {
  const db = fakeDb({ uids: [null] });
  const res = await bsRecipesStore({ db, storage: memStorage() }).save({ id: 'a', title: 'A' });
  assert.equal(res.reason, 'signed-out');
  assert.equal(db.calls.getUserGoals, 0);
  assert.equal(db.calls.saveUserGoals.length, 0);
});

test('an account switch BETWEEN the read and the write discards it', async () => {
  // uids drain one per getUser call: u1 before the read, u2 after it.
  const db = fakeDb({ uids: ['u1', 'u2'], goals: {} });
  const storage = memStorage();
  const res = await bsRecipesStore({ db, storage }).save({ id: 'a', title: 'A' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'account-changed');
  // ⚠ THE POINT: saveUserGoals resolves the user at SAVE time, so this write
  // would have upserted u1's whole document into u2's row.
  assert.equal(db.calls.saveUserGoals.length, 0);
  assert.equal(storage.getItem(bsRecipesMirrorKey('u1')), null);
  assert.equal(storage.getItem(bsRecipesMirrorKey('u2')), null);
});

test('an unresolvable uid after the read also discards it', async () => {
  const db = fakeDb({ uids: ['u1', null], goals: {} });
  const res = await bsRecipesStore({ db, storage: memStorage() }).save({ id: 'a', title: 'A' });
  assert.equal(res.reason, 'account-changed');
  assert.equal(db.calls.saveUserGoals.length, 0);
});

test('a FAILED write is surfaced — saveUserGoals resolves {error}, it does not throw', async () => {
  const storage = memStorage();
  const db = fakeDb({ goals: {}, saveResult: { error: { message: 'row-level security' } } });
  const res = await bsRecipesStore({ db, storage }).save({ id: 'a', title: 'A' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'write-failed');
  // ⚠ and the mirror is NOT advanced, or the device would show a recipe the
  // account does not have.
  assert.equal(storage.getItem(bsRecipesMirrorKey('u1')), null);
});

test('a THROWN write is surfaced too', async () => {
  const db = fakeDb({ goals: {}, saveResult: () => { throw new Error('offline'); } });
  const res = await bsRecipesStore({ db, storage: memStorage() }).save({ id: 'a', title: 'A' });
  assert.equal(res.reason, 'write-failed');
});

test('no backend at all is a failed write, never a silent success', async () => {
  const res = await bsRecipesStore({ db: { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}) }, storage: memStorage() })
    .save({ id: 'a', title: 'A' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'write-failed');
});

test('remove is an upsert with the key gone — there is no row DELETE', async () => {
  const db = fakeDb({ goals: { v: 1, items: { a: { id: 'a', title: 'A' }, b: { id: 'b', title: 'B' } } } });
  const res = await bsRecipesStore({ db, storage: memStorage() }).remove('a');
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(db.calls.saveUserGoals[0][1].items), ['b']);
});

test('hydrate converges the mirror; an unreadable cloud leaves it alone', async () => {
  const storage = memStorage();
  const ok = await bsRecipesStore({ db: fakeDb({ goals: { v: 1, items: { a: { id: 'a', title: 'A' } } } }), storage }).hydrate();
  assert.equal(ok.ok, true);
  assert.deepEqual(Object.keys(ok.doc.items), ['a']);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(bsRecipesMirrorKey('u1'))).items), ['a']);

  const bad = await bsRecipesStore({ db: fakeDb({ goals: null }), storage }).hydrate();
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'unreadable');
  assert.deepEqual(Object.keys(bad.doc.items), ['a']);
  // ⚠ the previously converged mirror is untouched — a can't-know read must not
  // paint an empty Catalogue over recipes that exist.
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(bsRecipesMirrorKey('u1'))).items), ['a']);
});

test('⚠ HYDRATE BINDS ITS MIRROR WRITE TO THE ACCOUNT IT READ FOR', async () => {
  // getUserGoals resolves the user ITSELF, so the document that comes back
  // belongs to whoever is signed in at THAT moment. Writing it under the uid
  // captured before the read paints B's recipes on A's Library at next boot —
  // the cross-account class the per-uid mirror key exists to prevent. The write
  // lane guarded this; hydrate did not.
  const storage = memStorage();
  const db = fakeDb({ uids: ['u1', 'u2'], goals: { v: 1, items: { b: { id: 'b', title: "B's dinner" } } } });
  const res = await bsRecipesStore({ db, storage }).hydrate();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'account-changed');
  assert.equal(storage.getItem(bsRecipesMirrorKey('u1')), null);
  assert.equal(storage.getItem(bsRecipesMirrorKey('u2')), null);
});

test('a hostile stored document cannot smuggle a step object through the mirror', async () => {
  const storage = memStorage();
  storage.setItem(bsRecipesMirrorKey('u1'), JSON.stringify({ items: { a: { id: 'a', title: 'A', steps: [{ t: 'Rest.', passive: true, min: 30, station: 'oven' }] } } }));
  const doc = bsRecipesStore({ db: fakeDb(), storage }).readMirror('u1');
  assert.deepEqual(doc.items.a.steps, ['Rest.']);
});

test('unreadable localStorage is survivable in both directions', () => {
  const hostile = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const s = bsRecipesStore({ db: fakeDb(), storage: hostile });
  assert.equal(s.readMirror('u1'), null);
  assert.doesNotThrow(() => s.writeMirror('u1', { items: {} }));
  // Corrupt JSON reads as "no mirror", not as a crash on first paint.
  const corrupt = memStorage();
  corrupt.setItem(bsRecipesMirrorKey('u1'), '{not json');
  assert.equal(bsRecipesStore({ db: fakeDb(), storage: corrupt }).readMirror('u1'), null);
});

test('writes are serialised — the second read sees the first write', async () => {
  let goals = { v: 1, items: {} };
  const db = {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async () => goals,
    saveUserGoals: async (_k, doc) => { goals = doc; return {}; },
  };
  const store = bsRecipesStore({ db, storage: memStorage() });
  const [a, b] = await Promise.all([store.save({ id: 'a', title: 'A' }), store.save({ id: 'b', title: 'B' })]);
  assert.equal(a.ok && b.ok, true);
  // ⚠ Without the lane the second read would race the first write and one
  // recipe would silently vanish.
  assert.deepEqual(Object.keys(goals.items).sort(), ['a', 'b']);
});

// ── the invariant: an imported recipe can never host a passive window ───────

const WINDOWED = {
  title: 'Braise',
  steps: ['Sear the beef.', 'Cover and braise for 90 minutes.', 'Rest and serve.'],
  // ⚠ INDEX 1 — deliberately NOT the last step: finishCookable drops a TERMINAL
  // non-'off' window by itself, so a fixture with the window on the last step
  // would go green even with the guard deleted.
  stepMeta: [null, { min: 90, passive: true, station: 'oven' }, null],
};

test('CONTROL: bsCookableFromRecipe DOES apply a stepMeta overlay onto plain strings', () => {
  // This is what makes the guard below meaningful rather than decorative: the
  // base adapter really will hang a passive window on a plain-string step.
  const c = bsCookableFromRecipe(WINDOWED);
  assert.equal(c.stepMeta[1].passive, true);
  assert.equal(c.stepMeta[1].min, 90);
  assert.equal(c.stepMeta[1].station, 'oven');
});

test('a member recipe carrying a stepMeta overlay gets NO passive window', () => {
  const c = bsCookableFromMemberRecipe({ id: 'r1', ...WINDOWED });
  assert.equal(c.steps.length, 3);
  for (const m of c.stepMeta) {
    assert.equal(m.passive, false);
    assert.equal(m.min, null);
    assert.equal(m.station, null);
  }
});

test('BOTH legs of the invariant hold, and neither covers the other', () => {
  // Leg 1 — the OVERLAY: plain-string steps beside a parallel stepMeta array.
  // The CONTROL above proves this overlay really does land on plain strings, so
  // coercing the steps cannot be what stops it.
  const overlay = bsCookableFromMemberRecipe({ id: 'r1', ...WINDOWED });
  assert.equal(overlay.stepMeta.some((m) => m.passive === true), false);
  assert.equal(overlay.stepMeta.some((m) => m.min !== null), false);

  // Leg 2 — the INLINE meta: a structured step carrying its own window, with no
  // overlay anywhere. Omitting stepMeta cannot be what stops this one.
  const inline = bsCookableFromMemberRecipe({
    id: 'r1', title: 'Braise',
    steps: ['Sear the beef.', { t: 'Cover and braise for 90 minutes.', min: 90, passive: true, station: 'oven' }, 'Rest and serve.'],
  });
  assert.deepEqual(inline.steps, ['Sear the beef.', 'Cover and braise for 90 minutes.', 'Rest and serve.']);
  assert.equal(inline.stepMeta.some((m) => m.passive === true), false);
  assert.equal(inline.stepMeta.some((m) => m.min !== null), false);
});

test('a member cookable claims no catalog identity and no coach', () => {
  // Someone can type "One-pan chicken and rice" — three surfaces slug
  // recipeTitle into a recipeId resolved against the CATALOG, so a non-null
  // title here credits their dish to a named nutritionist.
  const collide = SHAPE_KITCHEN_RECIPES[0].title;
  const c = bsCookableFromMemberRecipe({ id: 'r1', title: collide, steps: ['Mine.'], ingredients: [{ n: '1', m: 'thing' }] });
  assert.equal(c.recipeTitle, null);
  assert.equal(c.coach, null);
  assert.equal(c.allergenNotes, null);
  assert.equal(c.sourceKind, 'member');
  assert.equal(c.mealId, 'r1');
  assert.equal(c.fromPlan, false);
  assert.deepEqual(c.steps, ['Mine.']);
});

test('a member recipe with no macros reports none rather than zeroes', () => {
  const c = bsCookableFromMemberRecipe({ id: 'r1', title: 'T', steps: ['One.'] });
  assert.deepEqual(c.macros, { kcal: null, p: null, c: null, f: null });
});

test('the honesty ladder still grades a member recipe', () => {
  assert.equal(bsCookableFromMemberRecipe({ id: 'a', title: 'T', steps: ['One.'] }).tier, BS_COOK_TIERS.STEPS);
  assert.equal(bsCookableFromMemberRecipe({ id: 'a', title: 'T', ingredients: [{ n: '1', m: 'egg' }] }).tier, BS_COOK_TIERS.MISE);
  assert.equal(bsCookableFromMemberRecipe({ id: 'a', title: 'T' }).tier, BS_COOK_TIERS.QUICK);
  assert.equal(bsCookableFromMemberRecipe({ id: 'a' }), null);
  assert.equal(bsCookableFromMemberRecipe(null), null);
});

test('no member recipe is ever added to the catalog', () => {
  const before = SHAPE_KITCHEN_RECIPES.length;
  bsCookableFromMemberRecipe({ id: 'r1', title: 'Mine', steps: ['One.'] });
  assert.equal(SHAPE_KITCHEN_RECIPES.length, before);
  assert.equal(SHAPE_KITCHEN_RECIPES.some((r) => r.title === 'Mine'), false);
});

// ── the paste split ────────────────────────────────────────────────────────

test('a quantity is split at the parsed pieces, never re-formatted', () => {
  const { ingredients } = bsSplitPaste('2 eggs\n1 cup flour\n1/2 cup whole milk\na pinch of nutmeg\nsalt');
  assert.deepEqual(ingredients, [
    { n: '2', m: 'eggs' },
    { n: '1 cup', m: 'flour' },
    // ⚠ "1/2", not "0.5" — mealPrep is deliberately narrow, and a fraction the
    // member wrote is what they will read back.
    { n: '1/2 cup', m: 'whole milk' },
    { n: '', m: 'a pinch of nutmeg' },
    { n: '', m: 'salt' },
  ]);
});

test('headings win over line classification', () => {
  const out = bsSplitPaste([
    'Ingredients:',
    'Sear the beef',            // a verb line, but the heading says ingredients
    'Method',
    '1. Salt',                  // a short nounish line, but the heading says method
  ].join('\n'));
  assert.deepEqual(out.ingredients.map((g) => g.m), ['Sear the beef']);
  assert.deepEqual(out.steps, ['Salt']);
});

test('⚠ HEADINGS ARE MATCHED IN EVERY SHIPPED LOCALE, or they become ingredients', () => {
  // A heading the matcher misses is not merely unhandled: it falls through and
  // is presented to the member as an ingredient row. ⚠ The Cyrillic and
  // Vietnamese cases are the ones a trailing `\b` fails, since `\b` is defined
  // against ASCII `\w` and can never match after `ы` or `u`-with-a-hook.
  const cases = {
    es: ['Ingredientes', '2 huevos', 'Método', 'Precalienta el horno.', 'Sazona el pollo.'],
    ru: ['Ингредиенты', '2 яйца', 'Приготовление', 'Разогрейте духовку.', 'Посолите курицу.'],
    uk: ['Інгредієнти', '2 яйця', 'Приготування', 'Розігрійте духовку.', 'Посоліть курку.'],
    tr: ['Malzemeler', '2 yumurta', 'Yapılışı', 'Fırını ısıt.', 'Tavuğu baharatla.'],
    vi: ['Nguyên liệu', '2 trứng', 'Cách làm', 'Làm nóng lò.', 'Ướp gà.'],
    de: ['Zutaten', '2 Eier', 'Zubereitung', 'Ofen vorheizen.', 'Hähnchen würzen.'],
    it: ['Ingredienti', '2 uova', 'Preparazione', 'Scalda il forno.', 'Condisci il pollo.'],
    fr: ['Ingrédients', '2 oeufs', 'Préparation', 'Préchauffez le four.', 'Assaisonnez le poulet.'],
    id: ['Bahan', '2 telur', 'Cara membuat', 'Panaskan oven.', 'Bumbui ayam.'],
    ha: ['Kayan haɗi', '2 kwai', 'Yadda ake yi', 'A dumama tanda.', 'A yi kayan yaji.'],
    'pt-BR': ['Ingredientes', '2 ovos', 'Modo de preparo', 'Aqueça o forno.', 'Tempere o frango.'],
  };
  for (const [loc, lines] of Object.entries(cases)) {
    const out = bsSplitPaste(lines.join('\n'));
    assert.equal(out.ingredients.length, 1, `${loc}: ${JSON.stringify(out.ingredients)}`);
    assert.equal(out.steps.length, 2, `${loc}: ${JSON.stringify(out.steps)}`);
    // ⚠ Asserted as "no text was lost or mangled", not as a particular split:
    // the quantity splits only when the cut lands on a word boundary, so
    // "2 trứng" stays whole (bsQtyParse's units are English) while "2 telur"
    // splits. Both are correct; losing a character of either is not.
    assert.equal(`${out.ingredients[0].n} ${out.ingredients[0].m}`.trim(), lines[1], loc);
  }
});

test('⚠ A LINE IS A STEP — a numbered method with no full stops still splits', () => {
  // The regression: joining the method and re-splitting on `[.!?]` before an
  // ASCII capital collapsed this into ONE step, defeating the walkthrough for
  // the most common paste shape there is — and never splitting at all in any
  // script without ASCII capitals.
  const out = bsSplitPaste('Ingredients\n2 eggs\nMethod\n1. Preheat the oven to 200C\n2. Season the chicken\n3. Roast for 40 minutes');
  assert.deepEqual(out.steps, ['Preheat the oven to 200C', 'Season the chicken', 'Roast for 40 minutes']);
});

test('a single-line paste falls back to the catalog prose splitter', () => {
  // No line structure to keep, so the shared bsSplitMethodProse decides — rather
  // than a weaker private copy of it.
  const out = bsSplitPaste('Whisk the eggs until pale. Fold in the flour gently. Bake for 25 minutes until golden.');
  assert.equal(out.steps.length, 3);
  assert.equal(out.ingredients.length, 0);
});

test('⚠ A QUANTITY CUT THAT LANDS MID-WORD IS REFUSED', () => {
  // bsQtyParse's unit vocabulary is English, so on a non-English line it can
  // claim a prefix of a real word: "2 quả trứng" cut to n "2 qu" / m "ả trứng",
  // which is a wrong amount AND an unreadable ingredient.
  assert.deepEqual(bsSplitPaste('Ingredients\n2 quả trứng').ingredients, [{ n: '', m: '2 quả trứng' }]);
  // …while a cut that does land on a boundary still splits.
  assert.deepEqual(bsSplitPaste('Ingredients\n2 butir telur').ingredients, [{ n: '2 butir', m: 'telur' }]);
});

test('with no headings, a cooking verb makes it method and a quantity makes it an ingredient', () => {
  const out = bsSplitPaste('200 g pasta\nBring a large pan of water to the boil.\nDrain and serve.');
  assert.deepEqual(out.ingredients, [{ n: '200 g', m: 'pasta' }]);
  assert.deepEqual(out.steps, ['Bring a large pan of water to the boil.', 'Drain and serve.']);
});

test('bullets and numbering are stripped from both sides', () => {
  const out = bsSplitPaste('Ingredients\n- 2 eggs\n• 1 cup flour\nMethod\n1) Whisk the eggs.\n2. Fold in the flour.');
  assert.deepEqual(out.ingredients, [{ n: '2', m: 'eggs' }, { n: '1 cup', m: 'flour' }]);
  assert.deepEqual(out.steps, ['Whisk the eggs.', 'Fold in the flour.']);
});

test('an empty or junk paste yields an empty split rather than a fabricated recipe', () => {
  for (const junk of ['', '   \n\n  ', null, undefined]) {
    const out = bsSplitPaste(junk);
    assert.deepEqual(out.ingredients, []);
    assert.deepEqual(out.steps, []);
  }
});

test('a quantity with nothing after it stays verbatim rather than becoming a nameless row', () => {
  const out = bsSplitPaste('Ingredients\n2\n');
  assert.equal(out.ingredients.length, 1);
  assert.ok(out.ingredients[0].m.length > 0);
});

test('the split feeds the wrapper, and the wrapper still refuses a window', () => {
  // The whole pipeline in one line: paste → split → stored item → cookable.
  const split = bsSplitPaste('Ingredients\n1 tbsp olive oil\n400 g beef\nMethod\nSear the beef.\nCover and braise for 90 minutes.\nRest and serve.');
  const item = bsRecipeItem({
    id: 'r1', title: 'Braise',
    ingredients: split.ingredients,
    steps: split.steps,
  });
  const c = bsCookableFromMemberRecipe(item);
  assert.equal(c.ingredients.length, 2);
  assert.equal(c.steps.length, 3);
  assert.equal(c.stepMeta.some((m) => m.passive === true), false);
});
