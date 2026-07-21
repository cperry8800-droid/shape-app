import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_COOK_TIERS,
  bsCookable,
  bsCookableFromRecipe,
  bsCookableFromMeal,
  bsCookableFromText,
  bsSplitMethodProse,
  bsStepTimers,
  bsCookSlug,
  bsCookKey,
} from '../mobile-app/src/services/cookable.mjs';

const RECIPE = {
  title: 'One-pan chicken and rice',
  by: 'Rae Lindqvist', byRole: 'Nutritionist',
  time: '30 min', prep: 'passive simmer', servings: 1,
  kcal: 640, macros: { p: 48, c: 72, f: 18 },
  ingredients: [
    { n: '6 oz', m: 'chicken thigh, skin-on', k: '330 kcal' },
    { n: '3/4 cup', m: 'jasmine rice' },
  ],
  steps: [
    'Pat the chicken dry and season both sides.',
    'Sear 3 minutes per side until deeply golden.',
    'Cover and cook on low for 18 minutes without lifting the lid.',
  ],
  tip: 'Doubles cleanly for two days of lunches.',
};

test('catalog recipe → tier 1, verbatim steps, honest macros, coach carried', () => {
  const c = bsCookableFromRecipe(RECIPE);
  assert.equal(c.tier, BS_COOK_TIERS.STEPS);
  assert.equal(c.sourceKind, 'recipe');
  assert.deepEqual(c.steps, RECIPE.steps);
  assert.equal(c.ingredients.length, 2);
  assert.deepEqual(c.macros, { kcal: 640, p: 48, c: 72, f: 18 });
  assert.deepEqual(c.coach, { name: 'Rae Lindqvist', role: 'Nutritionist' });
  assert.equal(c.tip, RECIPE.tip);
  assert.equal(c.fromPlan, false);
});

test('meal with its own steps → tier 1, sourceKind meal', () => {
  const c = bsCookableFromMeal({ title: 'Coach bowl', kcal: 600, p: 45, c: 60, f: 15, steps: ['Heat the pan.', 'Add everything and stir.'] });
  assert.equal(c.tier, BS_COOK_TIERS.STEPS);
  assert.equal(c.sourceKind, 'meal');
  assert.equal(c.steps.length, 2);
});

test('meal mapping to a catalog recipe: recipe method walks, MEAL macros stay the logged truth', () => {
  const meal = { title: 'One-pan chicken and rice', kcal: 520, p: 40, c: 58, f: 14, recipeId: 'one-pan-chicken-and-rice', coach: 'Dr. Maya' };
  const c = bsCookableFromMeal(meal, [RECIPE]);
  assert.equal(c.tier, BS_COOK_TIERS.STEPS);
  assert.deepEqual(c.steps, RECIPE.steps);
  assert.equal(c.ingredients.length, 2);
  // Plan macros, never the recipe's portioning:
  assert.deepEqual(c.macros, { kcal: 520, p: 40, c: 58, f: 14 });
  assert.equal(c.coach.name, 'Dr. Maya');
  assert.equal(c.recipeTitle, RECIPE.title);
});

test('meal with an instructional prose brief → tier 2 FROM THE PLAN', () => {
  const c = bsCookableFromMeal({
    title: 'Salmon plate', kcal: 610, p: 44, c: 42, f: 22,
    brief: 'Preheat the oven to 425 and pat the salmon dry with a towel. Roast the fillet 12 minutes until it flakes at the thickest part. Serve over the rice with the greens folded through.',
  });
  assert.equal(c.tier, BS_COOK_TIERS.PROSE);
  assert.equal(c.fromPlan, true);
  assert.ok(c.steps.length >= 2);
});

test('marketing blurb never becomes fake steps — ingredients-only meal reads tier 3', () => {
  const c = bsCookableFromMeal({
    title: 'Power parfait', kcal: 480, p: 38, c: 52, f: 12,
    brief: 'Monday breakfast — sets the protein bar early. A house favorite.',
    ingredients: [{ n: '1 cup', m: '0% Greek yogurt' }],
  });
  assert.equal(c.tier, BS_COOK_TIERS.MISE);
  assert.deepEqual(c.steps, []);
});

test('title/macros-only meal → tier 4 quick mode, nothing invented', () => {
  const c = bsCookableFromMeal({ title: 'Yogurt parfait', kcal: 380, p: 28, c: 44, f: 9 });
  assert.equal(c.tier, BS_COOK_TIERS.QUICK);
  assert.deepEqual(c.steps, []);
  assert.deepEqual(c.ingredients, []);
});

test('honest macros: null/"" never fabricate a 0', () => {
  const c = bsCookableFromMeal({ title: 'Mystery meal', kcal: null, p: '', c: undefined, f: 12 });
  assert.deepEqual(c.macros, { kcal: null, p: null, c: null, f: 12 });
});

test('prose splitter: numbered lines split on markers; blurbs return null', () => {
  const numbered = bsSplitMethodProse('1. Heat the pan over medium heat tonight. 2) Add the garlic and stir it constantly. 3. Serve over the warmed rice bowl.');
  assert.ok(numbered && numbered.length === 3);
  assert.equal(bsSplitMethodProse('The social side of strong. A place to shape a life.'), null);
  assert.equal(bsSplitMethodProse(''), null);
  assert.equal(bsSplitMethodProse(null), null);
});

test('prose splitter: a SHORT authored numbered step is never dropped (CodeRabbit #1804)', () => {
  const parts = bsSplitMethodProse('1. Heat the pan over medium. 2. Stir. 3. Serve over the warmed rice.');
  assert.deepEqual(parts, ['Heat the pan over medium.', 'Stir.', 'Serve over the warmed rice.']);
});

test('prose splitter: a marketing lead sentence never rides into the method (Codex #1804)', () => {
  const parts = bsSplitMethodProse('A house favorite for busy weeks and lazy Sundays. Preheat the oven to 425 and dry the salmon. Roast the fillet 12 minutes until it flakes.');
  assert.deepEqual(parts, ['Preheat the oven to 425 and dry the salmon.', 'Roast the fillet 12 minutes until it flakes.']);
});

test('timer parser: minutes/seconds/ranges/per-side; artifacts dropped', () => {
  assert.deepEqual(bsStepTimers('Cover and cook on low for 18 minutes without lifting the lid.'), [{ seconds: 1080, label: '18 min' }]);
  assert.deepEqual(bsStepTimers('Sear 3 minutes per side until golden.'), [{ seconds: 180, label: '3 min per side' }]);
  assert.deepEqual(bsStepTimers('Sear 3 min/side until deeply golden.'), [{ seconds: 180, label: '3 min per side' }]); // shipped shorthand (Codex #1804 r5)
  assert.deepEqual(bsStepTimers('Whisk hard for about 30 seconds until smooth.'), [{ seconds: 30, label: '30 sec' }]);
  const range = bsStepTimers('Roast 18–20 minutes until it flakes.');
  assert.equal(range[0].seconds, 1080);
  assert.ok(range[0].label.includes('18'));
  assert.deepEqual(bsStepTimers('Fork through and serve.'), []);
  assert.deepEqual(bsStepTimers(null), []);
});

test('structured step objects pass through their text (PR D forward-compat)', () => {
  const c = bsCookableFromRecipe({ ...RECIPE, steps: [{ t: 'Sear the chicken.', min: 3, passive: false }, 'Rest 5 minutes.'] });
  assert.deepEqual(c.steps, ['Sear the chicken.', 'Rest 5 minutes.']);
});

test('attacker-shaped input never throws: Symbols/objects drop honestly', () => {
  const sym = Symbol('x');
  assert.equal(bsCookable(null), null);
  assert.equal(bsCookable('soup'), null);
  assert.equal(bsCookableFromMeal({ title: sym }), null);
  const c = bsCookableFromMeal({ title: 'Real meal', kcal: sym, p: 30, c: 30, f: 10, steps: [sym, 'Stir it well.', { t: sym }], ingredients: [sym, { m: sym }, { m: 'rice', n: sym }] });
  assert.equal(c.macros.kcal, null);
  assert.deepEqual(c.steps, ['Stir it well.']);
  assert.deepEqual(c.ingredients, [{ n: '', m: 'rice' }]);
});

test('dispatch: recipe shape → recipe adapter, meal shape → meal adapter', () => {
  assert.equal(bsCookable(RECIPE).sourceKind, 'recipe');
  assert.equal(bsCookable({ title: 'Bowl', kcal: 500, p: 40, c: 50, f: 12 }).sourceKind, 'meal');
});

test('generic text adapter: prose → tier 2, none → honest lower tier', () => {
  const withMethod = bsCookableFromText({ title: 'Coach single dish', text: 'Sear the salmon 4 minutes skin-side down tonight. Rest it while you dress the greens with lemon.', macros: { kcal: 610 } });
  assert.equal(withMethod.tier, BS_COOK_TIERS.PROSE);
  const bare = bsCookableFromText({ title: 'Coach single dish' });
  assert.equal(bare.tier, BS_COOK_TIERS.QUICK);
  assert.equal(bsCookableFromText({}), null);
});

test('slug helper matches the library id grammar', () => {
  assert.equal(bsCookSlug('One-pan chicken and rice'), 'one-pan-chicken-and-rice');
  assert.equal(bsCookSlug('  Tempo — turkey! cups  '), 'tempo-turkey-cups');
  assert.equal(bsCookSlug(null), '');
});

test('resume key: meal id wins, non-Latin titles never collide on an empty slug (Codex #1804 r2)', () => {
  const a = bsCookableFromMeal({ id: 'm1', title: 'Chicken bowl', kcal: 600, p: 45, c: 60, f: 15 });
  const b = bsCookableFromMeal({ id: 'm2', title: 'Chicken bowl', kcal: 500, p: 40, c: 50, f: 12 });
  assert.notEqual(bsCookKey(a), bsCookKey(b));               // same title, distinct meals
  const cyrA = bsCookableFromMeal({ title: 'Куриная миска', kcal: 600, p: 45, c: 60, f: 15 });
  const cyrB = bsCookableFromMeal({ title: 'Лосось и рис', kcal: 610, p: 44, c: 42, f: 22 });
  assert.notEqual(bsCookKey(cyrA), 'cook:');                 // never the bare shared key
  assert.notEqual(bsCookKey(cyrA), bsCookKey(cyrB));         // distinct non-Latin titles differ
  assert.equal(bsCookKey(cyrA), bsCookKey(bsCookableFromMeal({ title: 'Куриная миска', kcal: 1 }))); // stable per title
  assert.equal(bsCookKey(bsCookableFromRecipe(RECIPE)), 'cook:one-pan-chicken-and-rice');
  assert.equal(bsCookKey(null), 'cook:');
});
