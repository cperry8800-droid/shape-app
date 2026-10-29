// ─── A NUTRITIONIST'S DISHES ─────────────────────────────────────────────────────────────────
// The Shape Kitchen as a nutritionist's kitchen tab reads it (BSTrainerProfile.jsx) and Make it
// yours picks from it (BSMakeItYours.jsx). A dish is stored by its recipe's slug (bsCookSlug of
// the title, the same id a shared meal carries as `recipeId`), so a dish shows only when the slug
// names a recipe in the catalog; one the catalog no longer has drops off the page.
import { SHAPE_KITCHEN_RECIPES, bsRecipeAttribution } from './shapeKitchenData.js';
import { bsCookSlug } from '../services/cookable.mjs';

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

/** The catalog recipe a dish's slug names, or null. */
export function bsKitchenRecipe(slug) {
  return typeof slug === 'string' && slug ? bySlug().get(slug) || null : null;
}

/** A recipe's slug, the id a dish stores. */
export const bsKitchenSlug = (r) => bsCookSlug(r && r.title);

/** A recipe's time in minutes, read off its stated time ("35 min", "1 hr 15 min"), or null. */
export function bsKitchenMinutes(r) {
  const s = String((r && r.time) || '').toLowerCase();
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/);
  if (!h && !m) return null;
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
}

/** Who a recipe is credited to: an author's name, a source's name, or null (bsRecipeAttribution). */
export function bsKitchenCredit(r) {
  const a = bsRecipeAttribution(r);
  return a ? { kind: a.kind, name: a.name } : null;
}

/**
 * The recipes a search finds, for the dish picker: every word of the query in the title, the
 * diet or a tag; the whole catalog in its own order for an empty query.
 */
export function bsKitchenSearch(q, limit = 24) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (out.length >= limit) break;
    const hay = [r.title, r.diet, ...(Array.isArray(r.tags) ? r.tags : [])].join(' ').toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(r);
  }
  return out;
}

/**
 * A recipe's own grocery list, as Eat makes it from the Shape Kitchen (its `addSKRecipeToGrocery`):
 * the same id (`sk-` and the Kitchen's slug of the title), so a recipe already on the member's lists
 * stays one list. Null for a recipe with no ingredients.
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
