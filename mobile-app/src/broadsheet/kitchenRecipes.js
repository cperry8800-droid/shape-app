// ─── A NUTRITIONIST'S RECIPES ────────────────────────────────────────────────────────────────
// What the coach profile (BSTrainerProfile.jsx) does with a nutritionist's own recipes (the
// profile_custom doc's `kitchen.recipes`, bsKitchenRecipeItem): a member sends one's ingredients to
// their grocery lists, or cooks it in Shape's cook mode. And the Shape Kitchen catalog, which a
// shared meal still names by its recipe's slug (`recipeId`): plate notes open that recipe.
import { SHAPE_KITCHEN_RECIPES } from './shapeKitchenData.js';
import { bsCookSlug, bsCookableFromMemberRecipe } from '../services/cookable.mjs';

let BY_SLUG = null;
const bySlug = () => {
  if (BY_SLUG) return BY_SLUG;
  BY_SLUG = new Map();
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const s = bsCookSlug(r.title);
    if (s && !BY_SLUG.has(s)) BY_SLUG.set(s, r);
  }
  return BY_SLUG;
};

/** The catalog recipe a shared meal's `recipeId` names, or null. */
export function bsKitchenRecipe(slug) {
  return typeof slug === 'string' && slug ? bySlug().get(slug) || null : null;
}

/** A catalog recipe's time in minutes, read off its stated time ("35 min", "1 hr 15 min"), or null. */
export function bsKitchenMinutes(r) {
  const s = String((r && r.time) || '').toLowerCase();
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/);
  if (!h && !m) return null;
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
}

/** A short, stable hash of a string (32-bit FNV-1a, base 36), for list ids. */
export function bsShortHash(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/**
 * A catalog recipe's own grocery list, as Eat makes it from the Shape Kitchen (its
 * `addSKRecipeToGrocery`): the same id (`sk-` and the Kitchen's slug of the title), so a recipe
 * already on the member's lists stays one list. Null for a recipe with no ingredients.
 */
export function bsKitchenGroceryList(r) {
  const ings = r && Array.isArray(r.ingredients) ? r.ingredients : [];
  const id = 'sk-' + String((r && r.title) || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const items = ings
    .filter((ing) => ing && typeof ing === 'object' && typeof ing.m === 'string' && ing.m.trim())
    .map((ing, idx) => ({ id: `${id}-${idx}`, n: ing.m.trim(), q: typeof ing.n === 'string' ? ing.n : '', meals: r.title }));
  if (id === 'sk-' || !items.length) return null;
  return { id, name: `${r.title} grocery list`, kind: 'recipe', eyebrow: 'Shape Kitchen', usedCount: 1, preview: items.slice(0, 3).map((i) => i.n).join(' · '), count: items.length, items };
}

/**
 * A nutritionist's recipe as one of the member's grocery lists, in the shape Eat keeps a recipe's
 * list. One id per coach and recipe (`kr-`, a hash of the coach, the recipe's id), so sending it
 * again keeps one list. `name` is the list's name and `from` the line over it (the coach's kitchen).
 */
export function bsOwnRecipeGroceryList(r, { ownerKey, name, from } = {}) {
  const ings = r && Array.isArray(r.ing) ? r.ing : [];
  if (!r || !r.id || !ings.length) return null;
  const id = `kr-${bsShortHash(ownerKey || 'sample')}-${r.id}`;
  const items = ings.map((g, idx) => ({ id: `${id}-${idx}`, n: g.m, q: g.n || '', meals: r.t }));
  return { id, name: name || r.t, kind: 'recipe', eyebrow: from || '', usedCount: 1, preview: items.slice(0, 3).map((i) => i.n).join(' · '), count: items.length, items };
}

/**
 * A nutritionist's recipe for cook mode (BSCookMode): through the member-recipe adapter, so its
 * steps stay plain text and it never hosts the catalog's hand-checked timing windows; then the
 * recipe's own numbers (a serving's macros, its time) laid over it.
 */
export function bsOwnRecipeCookable(r, ownerKey) {
  if (!r || !r.t) return null;
  const c = bsCookableFromMemberRecipe({
    id: `kr-${bsShortHash(ownerKey || 'sample')}-${r.id}`, title: r.t, servings: r.serves ?? null,
    ingredients: Array.isArray(r.ing) ? r.ing.map((g) => ({ n: g.n || '', m: g.m })) : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
  });
  if (!c) return null;
  const n = (v) => (Number.isFinite(v) ? v : null);
  c.macros = { kcal: n(r.kcal), p: n(r.p), c: n(r.c), f: n(r.f) };
  if (Number.isFinite(r.min)) c.timeLabel = `${r.min} min`;
  return c;
}
