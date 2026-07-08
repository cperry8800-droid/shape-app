// Shape Kitchen catalog — data-integrity bar for the Kitchen Card wave.
// Enforces the spec §7 content contract mechanically: structured {n, m, k?}
// ingredients with a real quantity on every line, cookable step detail,
// macro-consistent kcal, and honest photo fields. Written RED first; the
// catalog restructure/expansion turns it green.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPE_KITCHEN_RECIPES,
  recipeNeeds, recipeMatchesDiet,
  _RECIPE_NOT_GF, _RECIPE_HAS_DAIRY, _RECIPE_MED,
} from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const QTY_RE = /\d|pinch|drizzle|handful|to taste|dash|splash|zest|juice of/i;
// A "cue-rich" step joins at least two of these families — a time cue plus at
// least one of heat / vessel / doneness — so a no-cook recipe (overnight oats,
// energy bites) still passes on time + vessel/doneness without a false heat cue.
const CUE_TIME = /(min|minute|second|hour|overnight)/i;
const CUE_HEAT = /heat|warm|boil|simmer|fry|roast|bake|sear|sauté|saute|grill|toast|cook|broil|steam|blister|char|reduce|melt|poach|scald|chill|freeze|refrigerate/i;
const CUE_VESSEL = /pan|pot|skillet|bowl|tray|sheet|dish|oven|blender|processor|jar|saucepan|wok|griddle|container|board|plate|steamer|microwave|fridge/i;
const CUE_DONE = /golden|tender|crisp|browned|set|thicken|soft|translucent|fragrant|charred|bubbl|firm|opaque|cooked through|pink|springy|glossy|caramel|wilt|combine|smooth|coat/i;

test('catalog: expanded to the full 35 recipes', () => {
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 35, `have ${SHAPE_KITCHEN_RECIPES.length}`);
});

test('catalog: every recipe has the required fields', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const f of ['title', 'by', 'byRole', 'diet', 'time', 'servings', 'kcal', 'macros', 'tags', 'hero', 'blurb', 'ingredients', 'steps', 'tip']) {
      assert.ok(r[f] != null && r[f] !== '', `${r.title || '?'} missing ${f}`);
    }
    assert.ok(Number.isFinite(r.macros.p) && Number.isFinite(r.macros.c) && Number.isFinite(r.macros.f), `${r.title} macros`);
  }
});

test('catalog: ingredients are structured {n, m} with a real quantity on every line', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 4, `${r.title} needs >=4 ingredients (has ${r.ingredients.length})`);
    for (const ing of r.ingredients) {
      assert.equal(typeof ing, 'object', `${r.title}: string ingredient "${ing}"`);
      assert.ok(ing.m && String(ing.m).trim(), `${r.title}: ingredient missing name`);
      assert.ok(ing.n && QTY_RE.test(String(ing.n)), `${r.title}: "${ing.m}" missing a real quantity ("${ing.n}")`);
      assert.ok(!/,/.test(String(ing.m)) || String(ing.m).length < 40, `${r.title}: "${ing.m}" looks like a catch-all line`);
    }
  }
});

test('catalog: steps are detailed (>=4 steps, each >=50 chars, cue-rich)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(r.steps.length >= 4, `${r.title}: only ${r.steps.length} steps`);
    for (const s of r.steps) assert.ok(s.length >= 50, `${r.title}: thin step "${s.slice(0, 40)}…"`);
    const joined = r.steps.join(' ');
    assert.ok(CUE_TIME.test(joined), `${r.title}: no time cue in steps`);
    const families = [CUE_TIME, CUE_HEAT, CUE_VESSEL, CUE_DONE].filter((re) => re.test(joined)).length;
    assert.ok(families >= 2, `${r.title}: steps need >=2 cue families (time + heat/vessel/doneness), has ${families}`);
  }
});

test('catalog: kcal is macro-consistent within ±15%', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const est = r.macros.p * 4 + r.macros.c * 4 + r.macros.f * 9;
    const drift = Math.abs(est - r.kcal) / r.kcal;
    assert.ok(drift <= 0.15, `${r.title}: kcal ${r.kcal} vs macro estimate ${est} (${Math.round(drift * 100)}%)`);
  }
});

test('catalog: photo, when present, is a real path (never the hero gradient)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (r.photo != null) assert.ok(/^\/|^https?:/.test(r.photo) && !/gradient/.test(r.photo), `${r.title}: photo "${r.photo}"`);
  }
});

// Diet classification is keyed by exact recipe title (the _RECIPE_* allowlists),
// so a rename/typo silently desyncs a recipe's Gluten-free/Dairy-free/Mediterranean
// flags with no error. Guard the desync: every allowlisted title must be a real
// catalog title.
test('catalog: diet-classification allowlists reference only real recipe titles', () => {
  const titles = new Set(SHAPE_KITCHEN_RECIPES.map((r) => r.title));
  for (const [name, set] of [['not-GF', _RECIPE_NOT_GF], ['has-dairy', _RECIPE_HAS_DAIRY], ['mediterranean', _RECIPE_MED]]) {
    for (const t of set) assert.ok(titles.has(t), `${name} set references a title not in the catalog: "${t}"`);
  }
});

// Spot-check the diet helpers so a logic regression (not just a desync) is caught.
test('catalog: recipeNeeds / recipeMatchesDiet behave for known recipes', () => {
  const byTitle = (t) => SHAPE_KITCHEN_RECIPES.find((r) => r.title === t);
  // A dairy recipe must not read as Dairy-free; a plainly non-dairy one must.
  const dairy = byTitle('Greek yogurt power bowl');
  assert.ok(dairy && !recipeNeeds(dairy).includes('Dairy-free'), 'Greek yogurt bowl should not be Dairy-free');
  // Pescatarian excludes meat/poultry; a seafood recipe passes, a poultry one does not.
  const seafood = SHAPE_KITCHEN_RECIPES.find((r) => r.diet === 'Seafood');
  const poultry = SHAPE_KITCHEN_RECIPES.find((r) => r.diet === 'Poultry');
  if (seafood) assert.ok(recipeMatchesDiet(seafood, 'Pescatarian'), `${seafood.title} should match Pescatarian`);
  if (poultry) assert.ok(!recipeMatchesDiet(poultry, 'Pescatarian'), `${poultry.title} should not match Pescatarian`);
  // Mediterranean is allowlist-driven.
  const med = SHAPE_KITCHEN_RECIPES.find((r) => _RECIPE_MED.has(r.title));
  if (med) assert.ok(recipeMatchesDiet(med, 'Mediterranean'), `${med.title} should match Mediterranean`);
});
