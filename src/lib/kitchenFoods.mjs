// Shape Kitchen's recipes as the meal builder's foods (P6, 2026-11-05): "Meal drafts from Shape
// Kitchen's 100 recipes (not the 24 library foods)", and the builder's search reads them too.
//
// ONE SOURCE: the app's catalog (mobile-app/src/broadsheet/shapeKitchenData.js, the same import
// /api/cron/prep-reminders makes). Each recipe becomes the builder's food shape (dashMealCore.js:
// id, name, kcal, p, c, f, prepMin, tags, ingredients) for ONE serving, which is what its kcal and
// macros already are. Pure apart from that import; node:test drives it.
//
// ⚠ EVERY MACRO IS THE RECIPE'S OWN. Nothing here estimates a number: a quantity that will not parse
// is kept as the recipe wrote it ("to taste", "juice of") with no amount, and the grocery list says
// "as needed" for it rather than summing a figure nobody measured.
//
// ⚠ A TAG IS A CLAIM ABOUT WHAT IS IN THE DISH, read the conservative way: an exclusion ("no nuts")
// must never serve a dish that holds one, so a tag is set when the catalog's own lists say so (its
// dairy and gluten sets) OR any ingredient names it. A false "contains" only hides a recipe from that
// plan; a false "free of" would serve it.

import { SHAPE_KITCHEN_RECIPES, _RECIPE_NOT_GF, _RECIPE_HAS_DAIRY } from '../../mobile-app/src/broadsheet/shapeKitchenData.js';

export const KITCHEN_ID_PREFIX = 'k-';
export function kitchenSlug(title) {
  return String(title == null ? '' : title).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── quantities ─────────────────────────────────────────────────────────────────
const UNICODE_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
// The units a grocery list adds up, singular, as the builder's own foods write them.
const UNIT_WORDS = {
  oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', g: 'g', gram: 'g', grams: 'g', kg: 'kg',
  ml: 'ml', l: 'l', cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', can: 'can', cans: 'can', jar: 'jar', scoop: 'scoop', scoops: 'scoop',
  head: 'head', heads: 'head', stalk: 'stalk', stalks: 'stalk', sprig: 'sprig', sprigs: 'sprig', leaf: 'leaf', leaves: 'leaf', stick: 'stick',
  packet: 'packet', cube: 'cube', piece: 'piece', pieces: 'piece', handful: 'handful', spray: 'spray', sprays: 'spray',
};
// Words that size a whole item ("1 medium", "2 ripe") and are no unit: the count is the amount.
const SIZE_WORDS = /^(?:small|medium|large|whole|ripe|thin)$/;

/** "1 1/2 lb" → { qty: 1.5, unit: 'lb' }; "3/4 cup" → 0.75 cup; "2" → 2 (each); "to taste" → null. */
export function parseQuantity(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s) return null;
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) s = s.replace(ch, ` ${v}`);
  const m = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?(?:\/(\d+))?\s*(.*)$/.exec(s.trim());
  if (!m) return null;
  let qty = Number(m[1]);
  if (m[2] && m[3]) qty += Number(m[2]) / Number(m[3]);
  else if (m[4]) qty = Number(m[1]) / Number(m[4]);
  if (!(qty > 0) || !Number.isFinite(qty)) return null;
  const rest = m[5].replace(/^\(.*?\)\s*/, '').trim();
  const words = rest.split(/\s+/).filter(Boolean);
  let unit = '';
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (UNIT_WORDS[clean]) { unit = UNIT_WORDS[clean]; break; }
    if (SIZE_WORDS.test(clean)) continue;
    break;
  }
  return { qty, unit };
}
// "chicken thigh, skin-on" → "chicken thigh": what a shop sells, so a grocery list adds two recipes'
// garlic together whatever each did to it.
export function groceryName(name) {
  const base = String(name == null ? '' : name).split(/,|—| - |\(/)[0].trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

/** One recipe line → { name, qty, unit } for one serving, or { name, qty: null, unit: '', qtyText } when it will not parse. */
export function kitchenIngredient(line, servings = 1) {
  const n = typeof line === 'string' ? '' : (line && line.n) || '';
  const raw = typeof line === 'string' ? line : (line && line.m) || '';
  // A text line ("6 oz chicken thigh, skin-on (330 kcal)", the website's copy) carries its amount first.
  let name = raw;
  let q = n ? parseQuantity(n) : null;
  if (typeof line === 'string') {
    const text = line.replace(/\(\s*\d+\s*kcal\s*\)/i, '').trim();
    const m = /^((?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?(?:\/\d+)?|[½¼¾⅓⅔⅛])\s*(?:\([^)]*\)\s*)?(?:[a-z]+\b)?)\s*(.*)$/i.exec(text);
    q = m ? parseQuantity(m[1]) : null;
    name = q ? (q.unit ? m[2] : `${m[1].replace(/^[\d\s./½¼¾⅓⅔⅛]+/, '')} ${m[2]}`.trim()) : text;
  }
  const per = Math.max(1, Number(servings) || 1);
  const g = groceryName(name);
  if (!q) return { name: g || String(raw).trim(), qty: null, unit: '', qtyText: String(n || '').trim() || 'as needed' };
  return { name: g, qty: Math.round((q.qty / per) * 100) / 100, unit: q.unit };
}

// ── what a dish holds ──────────────────────────────────────────────────────────
// The library's allergen tags (dashMealCore ALLERGENS) plus what Nora's exclusions read for meat and
// seafood (mealDraft.mjs EXCLUDE_ALIASES): meat, poultry, red meat and the animals by name.
const ING_TAGS = [
  ['dairy', /\b(milk|cheese|cheddar|parmesan|mozzarella|ricotta|feta|halloumi|yogh?urt|butter|cream|whey|kefir|ghee|cottage)\b/],
  ['gluten', /\b(wheat|flour|bread|breadcrumbs|toast|pasta|penne|fusilli|linguine|spaghetti|rigatoni|macaroni|fettuccine|couscous|tortillas?|croutons|barley|rye|sourdough|soy sauce|teriyaki|oyster sauce|miso|panko|bulgur|farro|orzo|oats|granola|noodles?)\b/],
  ['nuts', /\b(almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|peanuts?|peanut butter|macadamia|pine nuts?|nut butter)\b/],
  ['shellfish', /\b(shrimp|prawns?|crab|lobster|scallops?|mussels?|clams?|oysters?)\b/],
  ['fish', /\b(salmon|cod|tuna|fish|anchov(?:y|ies)|sardines?|trout|tilapia|halibut|mackerel|haddock|pollock|snapper|catfish)\b/],
  ['egg', /\beggs?\b|\begg whites?\b/],
  ['soy', /\b(soy|tofu|edamame|tempeh|miso)\b/],
  ['beef', /\b(beef|steak|sirloin|chuck|top round|skirt)\b/],
  ['pork', /\b(pork|bacon|ham|prosciutto|chorizo)\b/],
  ['lamb', /\blamb\b/],
  ['chicken', /\bchicken\b(?! (broth|stock|bouillon))/],
  ['turkey', /\bturkey\b/],
];
// "almond milk", "coconut milk", "peanut butter" are not dairy; "chicken broth" is not chicken (it is
// still read as poultry below, by the diet). The exceptions run before the tag is set.
const NOT_DAIRY = /\b(almond|oat|soy|coconut|rice|plant)\s+(milk|yogh?urt|cream)\b|\bpeanut butter\b|\bnut butter\b|\bmilk of choice\b/;

export function kitchenTags(recipe) {
  const tags = new Set();
  const lines = (recipe.ingredients || []).map((x) => String(typeof x === 'string' ? x : (x && x.m) || '').toLowerCase());
  for (const line of lines) {
    for (const [tag, re] of ING_TAGS) {
      if (!re.test(line)) continue;
      if (tag === 'dairy' && NOT_DAIRY.test(line) && !/\b(cheese|whey|butter(?! ?milk)|cream cheese)\b/.test(line.replace(NOT_DAIRY, ''))) continue;
      tags.add(tag);
    }
    // "milk of choice" may be dairy: counted as dairy, never as free of it.
    if (/milk of choice|whey or plant/.test(line)) tags.add('dairy');
  }
  if (_RECIPE_HAS_DAIRY.has(recipe.title)) tags.add('dairy');
  if (_RECIPE_NOT_GF.has(recipe.title)) tags.add('gluten');
  const diet = String(recipe.diet || '');
  if (diet === 'Meat' || diet === 'Poultry' || ['beef', 'pork', 'lamb', 'chicken', 'turkey'].some((t) => tags.has(t))) tags.add('meat');
  if (diet === 'Poultry' || tags.has('chicken') || tags.has('turkey')) tags.add('poultry');
  if (['beef', 'pork', 'lamb'].some((t) => tags.has(t))) tags.add('red meat');
  if (diet === 'Seafood' || tags.has('fish') || tags.has('shellfish')) tags.add('seafood');
  if (diet === 'Vegan' || diet === 'Plant-based') tags.add('plant');
  return [...tags].sort();
}

/** "1 hr 15 min" → 75; "30 min" → 30; nothing readable → null. */
export function prepMinutes(time) {
  const s = String(time == null ? '' : time).toLowerCase();
  const h = /(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours|h)\b/.exec(s);
  const m = /(\d+)\s*(?:min|mins|minutes?|m)\b/.exec(s);
  if (!h && !m) return null;
  return Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0));
}

// Which meals of the day a recipe suits. Breakfasts are what the catalog tags so; a snack is tagged
// so or a no-cook dish under 400 kcal; a side is never a meal; everything else of a meal's size is
// a lunch or a dinner.
export function kitchenSlots(recipe) {
  const tags = recipe.tags || [];
  const has = (t) => tags.includes(t);
  if (has('Breakfast') || has('Brunch')) return ['Breakfast'];
  if (has('Snack')) return ['Snack'];
  if (has('Side')) return [];
  const out = [];
  if (Number(recipe.kcal) >= 180) out.push('Lunch', 'Dinner');
  if (has('No-cook') && Number(recipe.kcal) <= 400) out.push('Snack');
  return out;
}

/** One Kitchen recipe as the builder's food. */
export function kitchenFood(recipe) {
  const servings = Math.max(1, Number(recipe.servings) || 1);
  const ingredients = (recipe.ingredients || []).map((x) => kitchenIngredient(x, servings));
  const macros = recipe.macros || {};
  return {
    id: KITCHEN_ID_PREFIX + kitchenSlug(recipe.title),
    name: recipe.title,
    kcal: Math.round(Number(recipe.kcal) || 0),
    p: Math.round(Number(macros.p) || 0), c: Math.round(Number(macros.c) || 0), f: Math.round(Number(macros.f) || 0),
    prepMin: prepMinutes(recipe.time),
    tags: kitchenTags(recipe),
    ingredients,
    slots: kitchenSlots(recipe),
    kitchen: true,
    diet: String(recipe.diet || ''),
    labels: (recipe.tags || []).slice(0, 6),
    ...(recipe.hero ? { hero: String(recipe.hero) } : {}),
  };
}

/** How far the quantities parsed: lines with an amount, of all lines. */
export function parseStats(foods) {
  let lines = 0, parsed = 0;
  for (const f of foods) for (const i of f.ingredients) { lines += 1; if (i.qty != null) parsed += 1; }
  return { recipes: foods.length, lines, parsed, unparsed: lines - parsed };
}

let cached = null;
/** The whole catalog as foods, built once: { foods, stats }. */
export function kitchenFoods() {
  if (!cached) {
    const foods = SHAPE_KITCHEN_RECIPES.map(kitchenFood).filter((f) => f.kcal > 0 && f.name);
    cached = { foods, stats: parseStats(foods) };
  }
  return cached;
}
