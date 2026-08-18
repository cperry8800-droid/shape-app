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
//
// -- The note path (owner ruling, 2026-08-18) --------------------------------
// Some ingredients are AMBIGUOUS rather than disqualifying: a certified or labelled
// form of the same product genuinely is free of the allergen. Oats, soy sauce,
// broth/stock/bouillon and margarine are all that class. The owner's ruling is that
// such a recipe KEEPS its claim and carries a note naming the safe form to buy —
// "a claim is kept by SPECIFYING the ingredient, never by hiding the recipe".
//
// So a claim over an ambiguous ingredient passes ONLY when the recipe carries an
// allergen note for that allergen, and only when the ambiguous class fully explains
// the hit. A note can never wave through a line that also carries a hard marker.
// ⚠ A set removal with NO note still fails — that is the whole point of this file,
// and it is mutation-proven in the PR that introduced the note path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES, recipeNeeds, _RECIPE_ALLERGEN_NOTES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const GLUTEN = /\b(wheat|flour|bread|breadcrumbs?|panko|pasta|macaroni|noodles?|spaghetti|lasagna|orzo|couscous|barley|rye|oats?|oatmeal|soy sauce|broths?|stocks?|bouillon|tortillas?|crackers?|bulgur|farro|seitan|malt|beer|pita|buns?|cereal|graham|pretzels?)\b/i;
// `margarine` is here for the same reason `oats` is in the gluten list: the generic
// product is not reliably free of the allergen (milk solids and whey are common),
// so a recipe naming it plainly cannot advertise dairy-free.
const DAIRY = /\b(milk|cheese|butter|yogh?urt|cream|whey|mozzarella|cheddar|parmesan|ricotta|feta|halloumi|margarine)\b/i;

// The AMBIGUOUS classes — a subset of the markers above. Each names a product whose
// certified or labelled form is genuinely free of the allergen, so a recipe may keep
// its claim by carrying a note (see the header). Everything NOT listed here is
// disqualifying: no purchasable form of wheat flour is gluten-free.
//
// ⚠ These do NOT belong in SAFE_FORMS. SAFE_FORMS is keyed on the PHRASE alone, so
// putting `oats` there would exempt oats catalog-wide and forever, for every recipe,
// with or without a note — which is the false claim this file exists to prevent.
const AMBIGUOUS = {
  gluten: /\b(oats?|oatmeal|soy sauce|broths?|stocks?|bouillon)\b/i,
  dairy: /\bmargarine\b/i,
};

// Forms that MATCH a marker above but are not the allergen. Each needs a reason —
// this list is the human ruling, and anything not on it fails rather than passing.
//
// ⚠ Each is tagged with the allergen it exempts, and it neutralises only the PHRASE
// IT MATCHES, not the whole line. Exempting the line was a real defect in the first
// version of this file: `corn tortillas with wheat flour` cleared the gluten audit
// and `butter lettuce with milk dressing` cleared the dairy audit, because one safe
// phrase anywhere in the line waved the entire ingredient through.
const SAFE_FORMS = [
  ['gluten', /\bcorn tortillas?\b/i, 'corn, not wheat'],
  ['dairy', /\bbutter lettuce\b/i, 'a lettuce variety, not dairy'],
  ['dairy', /\b(?:peanut|almond|cashew|sunflower|seed|nut)\s+butter\b/i, 'nut/seed butter, not dairy'],
  ['dairy', /\bcoconut (?:milk|cream)\b/i, 'not dairy'],
  ['dairy', /\bvegan parmesan\b/i, 'not dairy'],
  ['dairy', /\bcocoa butter\b/i, 'not dairy'],
  ['gluten', /\bgluten-free\b/i, 'the ingredient names its own certification'],
  // A tomato sauce sold FOR pasta, not pasta. The recipe it appears in is the
  // noodle-free lasagna, which layers potato slices instead of sheets — so the
  // dish really is gluten-free and the marker is matching the wrong word.
  ['gluten', /\bpasta sauce\b/i, 'a tomato sauce for pasta, not pasta itself'],
];

const nameOf = (ing) => (typeof ing === 'string' ? ing : [ing && ing.n, ing && ing.m].filter(Boolean).join(' '));

// Strike out only the safe phrases for THIS allergen, then re-read what is left.
// "corn tortillas with wheat flour" keeps its `wheat flour`; "butter lettuce" is
// left with nothing to flag.
const residue = (line, allergen) => SAFE_FORMS
  .filter(([tag]) => tag === allergen)
  .reduce((s, [, re]) => s.replace(new RegExp(re.source, 'gi'), ' '), line);

// Blank only the ambiguous phrase, the same mechanism as `residue`. Used to re-read
// a line the note is being asked to excuse.
const strike = (line, re) => line.replace(new RegExp(re.source, 'gi'), ' ');

const hasNote = (r, allergen) => (r.allergenNotes || []).some((n) => n.allergen === allergen);

function audit(marker, claim, allergen) {
  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (!recipeNeeds(r).includes(claim)) continue;      // already classified — nothing claimed
    for (const ing of r.ingredients || []) {
      const line = nameOf(ing);
      const res = residue(line, allergen);
      if (!marker.test(res)) continue;
      const amb = AMBIGUOUS[allergen];
      // The note excuses the hit ONLY when the ambiguous class fully explains it.
      // Striking the ambiguous phrase and re-reading is what stops a note waving
      // through `soy sauce and wheat flour` — the same whole-line defect SAFE_FORMS
      // already had to fix, arriving through a different door.
      if (hasNote(r, allergen) && amb.test(res) && !marker.test(strike(res, amb))) continue;
      bad.push(`${r.title}: advertises "${claim}" but its ingredients name "${line.trim()}"`);
    }
  }
  return bad;
}

test('allergen claims: nothing advertises Gluten-free over a gluten ingredient', () => {
  assert.deepEqual(audit(GLUTEN, 'Gluten-free', 'gluten'), [],
    'classify it in _RECIPE_NOT_GF / USDA_NOT_GF, or add the safe form above with a reason');
});

test('allergen claims: nothing advertises Dairy-free over a dairy ingredient', () => {
  assert.deepEqual(audit(DAIRY, 'Dairy-free', 'dairy'), [],
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
