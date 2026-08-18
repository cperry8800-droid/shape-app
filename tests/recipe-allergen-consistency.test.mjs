// An allergen claim must be justified by the ingredients.
//
// `recipeNeeds` reads a title's ABSENCE from `_RECIPE_NOT_GF` / `_RECIPE_HAS_DAIRY`
// as a positive claim — "Gluten-free", "Dairy-free". So a recipe that is simply
// never added to a set does not lose a tag: it tells someone with coeliac disease
// that a wheat-noodle casserole is safe. The parity gate keeps the two surfaces
// agreeing with each other; nothing checked whether either agreed with the FOOD.
//
// It did not. Four recipes in the catalog contain oats and two of them advertised
// gluten-free while the other two did not — one ingredient, two answers. (Oats are
// not gluten-free unless certified: standard milling shares a line with wheat.)
//
// So this reads the ingredient names and requires every allergen-bearing recipe to
// be EITHER classified OR listed below as a known-safe form, with a reason. An
// ingredient that is neither is an error, not a skip — a new recipe naming an
// unlisted gluten- or dairy-ish ingredient fails the build and forces a ruling
// instead of silently claiming safety.
//
// ⚠ Scope, stated honestly: this reads INGREDIENTS, not steps. "Serve with bread
// for dipping" in a method line is a serving suggestion, not a component, and
// treating it as one would flag correct recipes. A recipe whose gluten arrives
// only through a step is out of this gate's reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES, recipeNeeds } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const GLUTEN = /\b(wheat|flour|bread|breadcrumbs?|panko|pasta|macaroni|noodles?|spaghetti|lasagna|orzo|couscous|barley|rye|oats?|soy sauce|tortillas?|crackers?|bulgur|farro|seitan|malt|beer|pita|buns?|cereal|graham|pretzels?)\b/i;
const DAIRY = /\b(milk|cheese|butter|yogh?urt|cream|whey|mozzarella|cheddar|parmesan|ricotta|feta|halloumi)\b/i;

// Forms that MATCH a marker above but are not the allergen. Each needs a reason —
// this list is the human ruling, and anything not on it fails rather than passing.
const SAFE_FORMS = [
  [/\bcorn tortillas?\b/i, 'corn, not wheat'],
  [/\bbutter lettuce\b/i, 'a lettuce variety, not dairy'],
  [/\b(?:peanut|almond|cashew|sunflower|seed|nut)\s+butter\b/i, 'nut/seed butter, not dairy'],
  [/\bcoconut (?:milk|cream)\b/i, 'not dairy'],
  [/\bvegan parmesan\b/i, 'not dairy'],
  [/\bcocoa butter\b/i, 'not dairy'],
  [/\bgluten-free\b/i, 'the ingredient names its own certification'],
  // A tomato sauce sold FOR pasta, not pasta. The recipe it appears in is the
  // noodle-free lasagna, which layers potato slices instead of sheets — so the
  // dish really is gluten-free and the marker is matching the wrong word.
  [/\bpasta sauce\b/i, 'a tomato sauce for pasta, not pasta itself'],
];

const nameOf = (ing) => (typeof ing === 'string' ? ing : [ing && ing.n, ing && ing.m].filter(Boolean).join(' '));
const safeReason = (line) => { const hit = SAFE_FORMS.find(([re]) => re.test(line)); return hit ? hit[1] : null; };

function audit(marker, claim) {
  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (!recipeNeeds(r).includes(claim)) continue;      // already classified — nothing claimed
    for (const ing of r.ingredients || []) {
      const line = nameOf(ing);
      if (!marker.test(line) || safeReason(line)) continue;
      bad.push(`${r.title}: advertises "${claim}" but its ingredients name "${line.trim()}"`);
    }
  }
  return bad;
}

test('allergen claims: nothing advertises Gluten-free over a gluten ingredient', () => {
  assert.deepEqual(audit(GLUTEN, 'Gluten-free'), [],
    'classify it in _RECIPE_NOT_GF / USDA_NOT_GF, or add the safe form above with a reason');
});

test('allergen claims: nothing advertises Dairy-free over a dairy ingredient', () => {
  assert.deepEqual(audit(DAIRY, 'Dairy-free'), [],
    'classify it in _RECIPE_HAS_DAIRY / USDA_HAS_DAIRY, or add the safe form above with a reason');
});

test('allergen claims: the audit actually reads the catalog', () => {
  // Guard the guard: if the ingredient shape changes and every name reads empty,
  // both audits above pass vacuously and this file becomes decoration.
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 85, `only ${SHAPE_KITCHEN_RECIPES.length} recipes reached the audit`);
  const named = SHAPE_KITCHEN_RECIPES.flatMap((r) => (r.ingredients || []).map(nameOf)).filter((s) => s.trim());
  assert.ok(named.length > 500, `only ${named.length} ingredient names parsed — the audit is reading nothing`);
  // And the markers must actually match this catalog, or a typo silences them.
  assert.ok(named.some((n) => GLUTEN.test(n)), 'no ingredient matched the gluten markers at all');
  assert.ok(named.some((n) => DAIRY.test(n)), 'no ingredient matched the dairy markers at all');
});
