// P6 (2026-11-05): meal plans from Shape Kitchen, with training and rest days. "Meal drafts from Shape
// Kitchen's 100 recipes (not the 24 library foods), with train and rest-day targets; a meal plan holds
// both target sets." Plus the builder data behind them: Kitchen in the builder's search, a grocery list
// that works for Kitchen recipes, the template on each assignment, the lifecycle lists as one, Assign on
// each client's own training days, and Nora's draft kept beside the plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import {
  kitchenFoods, kitchenFood, kitchenIngredient, parseQuantity, kitchenTags, kitchenSlots, prepMinutes, KITCHEN_ID_PREFIX,
} from '../src/lib/kitchenFoods.mjs';
import {
  cleanMealBrief, pickMeals, buildMealDoc, mealDraftDiff, slotPools, dayTotals, mealBriefFromText, mealDraftSnapshot, restTargetsFrom, dayTypesFor,
  KITCHEN_FOODS, KITCHEN_NOTICE, PHASES, REST_CARB_DROP, foodById, SLOTS, scaleMeal,
} from '../src/lib/ai/mealDraft.mjs';
import { trainingDowsFor, programTrainingDows, sessionTrainingDows, mondayDow } from '../src/lib/training-days.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const DM = require_('./public/newdesign/dashMealCore.js');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { SHAPE_KITCHEN_RECIPES } = await import(join(ROOT, 'mobile-app/src/broadsheet/shapeKitchenData.js'));

// ── Shape Kitchen as the builder's foods ───────────────────────────────────────────
test('the Kitchen catalog becomes the builder\'s foods: every recipe, its own macros, one serving', () => {
  const { foods, stats } = kitchenFoods();
  assert.equal(foods.length, SHAPE_KITCHEN_RECIPES.length);
  assert.equal(foods.length, 100);
  for (const f of foods) {
    const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === f.name);
    assert.ok(r, f.name);
    assert.deepEqual([f.kcal, f.p, f.c, f.f], [r.kcal, r.macros.p, r.macros.c, r.macros.f], 'the recipe\'s own numbers, never estimated');
    assert.ok(f.id.startsWith(KITCHEN_ID_PREFIX));
    assert.equal(f.kitchen, true);
  }
  assert.equal(new Set(foods.map((f) => f.id)).size, foods.length, 'one id each');
  // How far the amounts parse, reported as such: every structured line with a number parses; what
  // does not is the recipe's own "to taste", "handful", "pinch".
  assert.equal(stats.lines, foods.reduce((n, f) => n + f.ingredients.length, 0));
  assert.ok(stats.parsed / stats.lines > 0.95, `${stats.parsed} of ${stats.lines}`);
  for (const f of foods) for (const i of f.ingredients) if (i.qty == null) assert.match(i.qtyText, /taste|handful|pinch|splash|juice|zest|dash/, `${f.name}: ${i.qtyText}`);
});

test('quantities: mixed numbers, fractions, counts and sizes; per serving; and none where none was given', () => {
  assert.deepEqual(parseQuantity('1 1/2 lb'), { qty: 1.5, unit: 'lb' });
  assert.deepEqual(parseQuantity('3/4 cup'), { qty: 0.75, unit: 'cup' });
  assert.deepEqual(parseQuantity('2 cloves'), { qty: 2, unit: 'clove' });
  assert.deepEqual(parseQuantity('1 medium'), { qty: 1, unit: '' });
  assert.deepEqual(parseQuantity('14.5 oz'), { qty: 14.5, unit: 'oz' });
  assert.deepEqual(parseQuantity('½ cup'), { qty: 0.5, unit: 'cup' });
  for (const none of ['to taste', 'handful', 'pinch', '', null]) assert.equal(parseQuantity(none), null, String(none));
  assert.deepEqual(kitchenIngredient({ n: '2 lb', m: 'chicken thighs, boneless' }, 4), { name: 'Chicken thighs', qty: 0.5, unit: 'lb' });
  assert.deepEqual(kitchenIngredient({ n: 'to taste', m: 'salt' }, 2), { name: 'Salt', qty: null, unit: '', qtyText: 'to taste' });
  // The website's copy writes lines as text; they read as far as their amount goes.
  assert.deepEqual(kitchenIngredient('6 oz chicken thigh, skin-on (330 kcal)', 1), { name: 'Chicken thigh', qty: 6, unit: 'oz' });
  assert.deepEqual(kitchenIngredient('3/4 cup jasmine rice (240 kcal)', 1), { name: 'Jasmine rice', qty: 0.75, unit: 'cup' });
  assert.equal(kitchenIngredient('Salt and pepper, to taste', 1).qty, null);
});

test('the website\'s text copy of the recipes reads as far as its amounts go (and the parse is reported)', async () => {
  // recipes.jsx is a browser script; its catalog is evaluated here to read its ingredient lines.
  const src = read('public/newdesign/recipes.jsx');
  const lines = [...src.matchAll(/^\s+"([^"\n]+)",$/gm)].map((m) => m[1]).filter((l) => /^(\d|½|¼|¾)/.test(l) || /\(\d+ kcal\)/.test(l));
  const parsed = lines.filter((l) => kitchenIngredient(l, 1).qty != null);
  assert.ok(lines.length > 500, `${lines.length} lines found`);
  assert.ok(parsed.length / lines.length > 0.9, `${parsed.length} of ${lines.length} text lines parse`);
});

test('what a dish holds is read the safe way: the catalog\'s lists, or any ingredient that names it', () => {
  const tags = (title) => kitchenTags(SHAPE_KITCHEN_RECIPES.find((r) => r.title === title));
  assert.ok(tags('Greek yogurt power bowl').includes('dairy'));
  assert.ok(tags('Greek yogurt power bowl').includes('nuts'), 'peanut butter is a nut');
  assert.ok(!tags('Greek yogurt power bowl').includes('meat'));
  assert.ok(tags('One-pan chicken and rice').includes('poultry'));
  assert.ok(tags('Grilled chicken Caesar, lightened').includes('fish'), 'the anchovy paste');
  for (const f of KITCHEN_FOODS) {
    const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === f.name);
    const text = r.ingredients.map((i) => String(i.m || i)).join(' ').toLowerCase();
    if (/\bshrimp\b|\bprawns?\b/.test(text)) assert.ok(f.tags.includes('shellfish'), f.name);
    if (/\b(beef|steak|sirloin)\b/.test(text)) assert.ok(f.tags.includes('red meat') && f.tags.includes('meat'), f.name);
    if (r.diet === 'Seafood') assert.ok(f.tags.includes('seafood'), f.name);
    if (r.diet === 'Meat' || r.diet === 'Poultry') assert.ok(f.tags.includes('meat'), f.name);
  }
  // The catalog's own lists count even where no ingredient names the allergen, and a Seafood recipe is
  // seafood whatever its lines say: a false "free of" is the one mistake this must never make.
  for (const title of ['Chickpea shakshuka', 'Overnight oats, three ways']) assert.ok(kitchenTags({ title, ingredients: [] }).includes('dairy'), title);
  assert.ok(kitchenTags({ title: 'Lentil bolognese', ingredients: [] }).includes('gluten'));
  assert.ok(kitchenTags({ title: 'x', diet: 'Seafood', ingredients: [] }).includes('seafood'));
  assert.ok(kitchenTags({ title: 'x', diet: 'Poultry', ingredients: [] }).includes('poultry'));
  assert.deepEqual(kitchenSlots({ tags: ['Breakfast'], kcal: 400 }), ['Breakfast']);
  assert.deepEqual(kitchenSlots({ tags: ['Side'], kcal: 300 }), [], 'a side is never a meal');
  assert.deepEqual(kitchenSlots({ tags: ['No-cook'], kcal: 300 }), ['Lunch', 'Dinner', 'Snack']);
  assert.equal(prepMinutes('1 hr 15 min'), 75);
  assert.equal(prepMinutes('2 hr'), 120);
  assert.equal(prepMinutes('soon'), null);
});

// ── Nora's meal drafts from the Kitchen ────────────────────────────────────────────
test('a draft is Kitchen recipes by default, inside what they left out, and the card says so', () => {
  const brief = cleanMealBrief({ goalPhase: 'cut', days: 7, exclude: ['shellfish'], maxPrepMinutes: 35 });
  assert.equal(brief.source, 'kitchen');
  const picked = pickMeals(brief);
  const doc = buildMealDoc(brief, picked, 'abcd1234-0000');
  const meals = doc.days.flatMap((d) => d.slots);
  assert.equal(meals.length, 28);
  for (const m of meals) {
    const food = KITCHEN_FOODS.find((f) => f.name === m.name);
    assert.ok(food, `${m.name} is a Kitchen recipe`);
    assert.ok(!food.tags.includes('shellfish'), m.name);
    assert.ok(food.prepMin <= 35, `${m.name} ${food.prepMin} min`);
    assert.equal(m.kitchen, true);
    assert.match(m.id, /^nora-abcd1234-\d-\d$/);
  }
  assert.ok(new Set(meals.map((m) => m.name)).size >= 12, 'the week varies');
  assert.deepEqual(pickMeals(brief), picked, 'the same brief, the same plan');
  const rows = mealDraftDiff(brief, doc, picked);
  assert.deepEqual(rows[0], { label: 'Source', after: KITCHEN_NOTICE });
  // A vegetarian brief: no meat or seafood.
  const veg = buildMealDoc(cleanMealBrief({ exclude: ['vegetarian'], days: 3 }), pickMeals(cleanMealBrief({ exclude: ['vegetarian'], days: 3 })), 'v');
  for (const m of veg.days.flatMap((d) => d.slots)) {
    const f = KITCHEN_FOODS.find((x) => x.name === m.name) || foodById(m.id);
    assert.ok(f && !f.tags.some((t) => ['meat', 'seafood', 'fish', 'shellfish'].includes(t)), m.name);
  }
});

test('training and rest days: two target sets, each day tagged, each day near its own targets', () => {
  const brief = cleanMealBrief({ goalPhase: 'cut', days: 7 });
  assert.deepEqual(brief.targets, PHASES.cut.targets);
  assert.deepEqual(brief.restTargets, { kcal: 1700, p: 165, c: 170 - REST_CARB_DROP, f: 60 }, 'protein and fat hold; carbs drop 50 g');
  assert.deepEqual(brief.dayTypes, ['train', 'rest', 'train', 'train', 'train', 'rest', 'rest'], 'a week: four training days, rest between');
  const picked = pickMeals(brief);
  const doc = buildMealDoc(brief, picked, 'p');
  assert.deepEqual(doc.restTargets, brief.restTargets);
  doc.days.forEach((d, i) => {
    assert.equal(d.type, brief.dayTypes[i]);
    const t = d.type === 'rest' ? doc.restTargets : doc.targets;
    const tot = dayTotals(d.slots);
    assert.ok(Math.abs(tot.kcal - t.kcal) / t.kcal < 0.05, `${d.name} (${d.type}): ${tot.kcal} against ${t.kcal}`);
  });
  const rows = mealDraftDiff(brief, doc, picked);
  assert.ok(rows.some((r) => r.label === 'Rest days' && /^1700 kcal · 165 P · 120 C · 60 F \(protein and fat hold, carbs 50 g lower\)$/.test(r.after)));
  assert.ok(rows.some((r) => r.label === 'Day B · rest'));
  // Their rest-day calories: carbs move, protein and fat hold.
  assert.deepEqual(cleanMealBrief({ goalPhase: 'cut', kcal: 2000, restKcal: 1800 }).restTargets, { kcal: 1800, p: 165, c: 150, f: 60 }, '(1800 − 165 × 4 − 60 × 9) / 4');
  assert.deepEqual(restTargetsFrom({ kcal: 2300, p: 160, c: 30, f: 75 }), { kcal: 2180, p: 160, c: 0, f: 75 }, 'never below zero carbs');
  // One set of targets every day: restDays 0 is a plan as plans always were.
  const one = buildMealDoc(cleanMealBrief({ days: 3, restDays: 0 }), pickMeals(cleanMealBrief({ days: 3, restDays: 0 })), 'p');
  assert.equal(one.restTargets, undefined);
  assert.ok(one.days.every((d) => !('type' in d)));
  assert.deepEqual(dayTypesFor(3, 1), ['train', 'train', 'rest']);
  assert.deepEqual(dayTypesFor(1, 3), ['train'], 'a single day is never all rest');
});

test('a meal no Kitchen recipe fits comes from the basics, named; one nothing fits is named too', () => {
  const pools = slotPools(cleanMealBrief({ exclude: ['dairy', 'nuts', 'gluten'], slots: ['Snack'] }));
  const p = pickMeals(cleanMealBrief({ exclude: ['dairy', 'nuts'], days: 2 }));
  assert.ok(Array.isArray(p.fallback));
  assert.ok(Array.isArray(pools.fallback));
  // No Kitchen snack survives nuts, gluten, chickpea, pepper, apple and date; the basics' do, and it is said.
  const snackBrief = cleanMealBrief({ slots: ['Snack'], exclude: ['nuts', 'gluten', 'chickpea', 'pepper', 'apple', 'date'], days: 1 });
  const snack = pickMeals(snackBrief);
  assert.deepEqual(snack.fallback, ['Snack']);
  assert.ok(/^f\d+$/.test(snack.days[0].meals[0].id), 'a basic food, not a gap');
  assert.ok(mealDraftDiff(snackBrief, buildMealDoc(snackBrief, snack, 'p'), snack).some((r) => r.label === 'From the basics' && /^Snack: no Kitchen recipe fits/.test(r.after)));
  const vegan = pickMeals(cleanMealBrief({ exclude: ['vegan'], days: 2 }));
  assert.deepEqual(vegan.missing, ['Breakfast'], 'no Kitchen or basic breakfast is vegan: named, never filled with a guess');
  const rows = mealDraftDiff(cleanMealBrief({ exclude: ['vegan'], days: 2 }), buildMealDoc(cleanMealBrief({ exclude: ['vegan'], days: 2 }), vegan, 'p'), vegan);
  assert.ok(rows.some((r) => r.label === 'Not filled' && /^Breakfast: no Shape dish fits/.test(r.after)));
});

test('a brief in their own words: phase, calories, rest-day calories, days, prep and what to leave out', () => {
  assert.deepEqual(mealBriefFromText('Summer Cut for Tess: a cut at 1,900 kcal, 7 days, no shellfish, 35 min prep at most.'),
    { goalPhase: 'cut', kcal: 1900, days: 7, maxPrepMinutes: 35, exclude: ['shellfish'] });
  assert.deepEqual(mealBriefFromText('lean bulk, 2800 calories, rest days at 2500, vegetarian, hates seafood'),
    { goalPhase: 'build', kcal: 2800, restKcal: 2500, exclude: ['seafood', 'vegetarian'] });
  assert.deepEqual(mealBriefFromText(''), {});
});

test('Nora\'s draft kept beside the plan: what she placed, and what the nutritionist changed since', () => {
  const brief = cleanMealBrief({ goalPhase: 'cut', days: 3 });
  const doc = buildMealDoc(brief, pickMeals(brief), 'abcd');
  const snap = mealDraftSnapshot(doc, { at: '2026-11-05T09:40:00Z', source: 'kitchen', brief: 'a cut' });
  assert.equal(Object.keys(snap.meals).length, 12);
  assert.deepEqual(mealDraftSnapshot(doc, { at: '2026-11-05T09:40:00Z', source: 'kitchen', brief: 'a cut' }), snap, 'pure');
  const same = DM.mealDraftChanges(snap, doc);
  assert.equal(same.line, 'All 12 of her meals as she drafted them');
  const edited = JSON.parse(JSON.stringify(doc));
  edited.days[0].slots[0].swaps = [{ name: 'Oats', kcal: 300, p: 10, c: 50, f: 6 }]; // a swap added
  edited.days[1].slots[2] = { ...edited.days[1].slots[2], name: 'Sheet-pan salmon, sweet potato and broccoli' }; // swapped dish
  edited.days[2].slots.pop(); // her snack removed
  edited.days[2].slots.push({ id: 'm-own', slot: 'Snack', name: 'Mum\'s dhal', kcal: 300, p: 12, c: 40, f: 9 }); // their own
  const c = DM.mealDraftChanges(snap, edited);
  assert.deepEqual([c.changed.length, c.removed.length, c.own], [2, 1, 1]);
  assert.equal(c.line, '3 of her 12 meals changed · 1 yours');
  assert.equal(DM.mealDraftMark(snap, doc.days[0].slots[1]), 'nora');
  assert.equal(DM.mealDraftMark(snap, edited.days[0].slots[0]), 'changed');
  assert.equal(DM.mealDraftMark(snap, { id: 'm-own' }), '');
});

// ── The builder's side (dashMealCore.js) ───────────────────────────────────────────
const meal = (name, kcal = 500, extra = {}) => ({ id: name, slot: 'Lunch', name, kcal, p: 40, c: 50, f: 15, ingredients: [{ name: 'Rice', qty: 100, unit: 'g' }], swaps: [], ...extra });
function typedPlan() {
  return {
    version: 2, goalPhase: 'cut', targets: { kcal: 1900, p: 165, c: 170, f: 60 }, restTargets: { kcal: 1700, p: 165, c: 120, f: 60 },
    constraints: { proteinFloor: 145, exclusions: [], maxPrep: null },
    days: [
      { name: 'Day A', type: 'train', slots: [meal('Train A')], variants: {} },
      { name: 'Day B', type: 'rest', slots: [meal('Rest B', 400)], variants: {} },
      { name: 'Day C', slots: [meal('Train C')], variants: {} },
    ],
  };
}

test('Assign follows the client\'s week: training menus on their training days, rest menus and targets on the rest', () => {
  const out = DM.buildMealAssignment(typedPlan(), { trainingDows: [0, 2, 3, 4] });
  assert.deepEqual(out.days.map((d) => d.tag), ['TRAIN', 'REST', 'TRAIN', 'TRAIN', 'TRAIN', 'REST', 'REST']);
  assert.deepEqual(out.days.map((d) => d.meals[0].title), ['Train A', 'Rest B', 'Train C', 'Train A', 'Train C', 'Rest B', 'Rest B'], 'each kind in its own rotation');
  assert.deepEqual(out.days[1].targets, { cal: 1700, p: 165, c: 120, f: 60 });
  assert.deepEqual(out.days[0].targets, { cal: 1900, p: 165, c: 170, f: 60 });
  assert.equal(out.days[1].title, 'Day B · rest');
  // Scaled per client, rest targets too.
  assert.equal(DM.buildMealAssignment(typedPlan(), { trainingDows: [0], scale: 1.1 }).days[1].targets.cal, 1870);
});

test('a plan from before reads exactly as it did: one target, rotation by weekday, REST only where a rest version is', () => {
  const legacy = { version: 1, goalPhase: 'cut', targets: { kcal: 1900, p: 165, c: 170, f: 60 }, constraints: {}, days: [
    { name: 'Day A', slots: [meal('A')], variants: { rest: { overrides: {}, extras: [meal('A rest extra', 100)] } } },
    { name: 'Day B', slots: [meal('B')], variants: {} },
  ] };
  const out = DM.buildMealAssignment(legacy, {});
  assert.deepEqual(out.days.map((d) => d.tag), ['TRAIN', 'TRAIN', 'TRAIN', 'TRAIN', 'TRAIN', 'TRAIN', 'REST'], 'Sun (Day A, rest version) only');
  assert.ok(out.days.every((d) => d.targets.cal === 1900));
  assert.deepEqual(out.days.map((d) => d.title), ['Day A', 'Day B', 'Day A', 'Day B', 'Day A', 'Day B', 'Day A · rest']);
  // An untyped plan WITH rest targets: every non-training day is a rest day, on the rest targets.
  const withRest = DM.buildMealAssignment({ ...legacy, restTargets: { kcal: 1700, p: 165, c: 120, f: 60 } }, { trainingDows: [0, 2, 4] });
  assert.deepEqual(withRest.days.map((d) => d.tag), ['TRAIN', 'REST', 'TRAIN', 'REST', 'TRAIN', 'REST', 'REST']);
  assert.equal(withRest.days[1].targets.cal, 1700);
  assert.equal(DM.planTyped(legacy), false);
  assert.equal(DM.planTyped(typedPlan()), true);
  assert.deepEqual(DM.targetsFor(legacy, 'rest'), legacy.targets);
});

test('the grocery list works for Kitchen recipes: amounts add up; an amount nobody gave reads "as needed"', () => {
  const k = KITCHEN_FOODS.find((f) => f.name === 'One-pan chicken and rice');
  const m = DM.newMeal(k, 'Dinner');
  const salt = { ...m, id: 'x', ingredients: [{ name: 'Salt', qty: null, unit: '', qtyText: 'to taste' }, { name: 'Jasmine rice', qty: 0.75, unit: 'cup' }] };
  const g = DM.buildGrocery([[m], [salt]], 1);
  assert.deepEqual(g.find((x) => x.name === 'Jasmine rice'), { name: 'Jasmine rice', qty: 1.5, unit: 'cup', meals: ['One-pan chicken and rice'] });
  assert.deepEqual(g.find((x) => x.name === 'Salt'), { name: 'Salt', qty: null, unit: '', meals: ['One-pan chicken and rice'], asNeeded: true });
  // Nora's scaling, the builder's twin, keeps it too.
  assert.deepEqual(scaleMeal(salt, 1.5).ingredients[0], { name: 'Salt', qty: null, unit: '', qtyText: 'to taste' });
  assert.deepEqual(scaleMeal(salt, 1.5), DM.scaleMeal(salt, 1.5));
  const scaled = DM.scaleMeal(salt, 1.5);
  assert.equal(scaled.ingredients[0].qty, null, 'never scaled into a number');
  assert.equal(scaled.ingredients[0].qtyText, 'to taste');
  const plan = { ...typedPlan(), days: [{ name: 'A', slots: [salt], variants: {} }] };
  const out = DM.buildMealAssignment(plan, { trainingDows: [0, 1, 2, 3, 4, 5, 6] });
  assert.deepEqual(out.days[0].meals[0].ingredients[0], { qty: 'to taste', name: 'Salt' }, 'the client\'s list says what the recipe said');
});

test('the builder\'s Kitchen search: the plan\'s exclusions and prep, and the three filters', () => {
  const list = KITCHEN_FOODS;
  const noDairy = DM.searchKitchen(list, '', { exclusions: ['dairy'] }, {}, 0);
  assert.ok(noDairy.length > 20 && noDairy.every((f) => !f.tags.includes('dairy')));
  const noRice = DM.searchKitchen(list, '', { exclusions: ['rice'] }, {}, 0);
  assert.ok(noRice.every((f) => !f.ingredients.some((i) => /rice/i.test(i.name)) && !/rice/i.test(f.name)), 'an ingredient word leaves it out too');
  const quick = DM.searchKitchen(list, '', { maxPrep: 20 }, { protein: true, veg: true }, 0);
  assert.ok(quick.every((f) => f.prepMin <= 20 && f.p >= 30 && !f.tags.includes('meat')));
  assert.ok(DM.searchKitchen(list, 'salmon', {}, {}, 0).every((f) => /salmon/i.test(f.name) || f.labels.join(' ').toLowerCase().includes('salmon')));
  const sorted = DM.searchKitchen(list, '', {}, {}, 0);
  for (let i = 1; i < sorted.length; i++) assert.ok((sorted[i - 1].prepMin ?? 999) <= (sorted[i].prepMin ?? 999), 'quickest first');
  assert.equal(DM.searchKitchen(list, '', {}, {}).length, 40, 'forty at a time');
});

test('who needs a new plan, once each, by the week\'s Sunday', () => {
  const c = (id, name) => ({ profile: { id, name } });
  const needs = DM.planNeeds({ expiring: [c('a', 'Ann'), c('b', 'Ben')], phaseChange: [c('b', 'Ben'), c('d', 'Dee')], intake: [c('e', 'Eve')] }, new Date('2026-11-05T10:00:00'));
  assert.deepEqual(needs.clients.map((x) => [x.client.profile.id, x.reasons]), [['a', ['expiring']], ['b', ['expiring', 'phase']], ['d', ['phase']]]);
  assert.equal(needs.label, '3 need a new plan by Sun · Nov 8');
  assert.equal(needs.by, '2026-11-08');
  assert.equal(DM.planNeeds({ expiring: [c('a')] }, new Date('2026-11-08T10:00:00')).label, '1 needs a new plan by Sun · Nov 8', 'a Sunday closes that day');
  assert.equal(DM.planNeeds({}, new Date('2026-11-05')).label, 'Nobody needs a new plan this week');
});

// ── Training days ──────────────────────────────────────────────────────────────────
test('a client\'s own training days: their sessions first, then their program\'s week, never a guess', () => {
  assert.equal(mondayDow('2026-11-09'), 0);
  assert.deepEqual(programTrainingDows({ training: { days: ['Push day', 'Rest', 'Legs day', 'Rest', 'Pull day', 'Rest', 'Rest'] } }), [0, 2, 4]);
  assert.equal(programTrainingDows({ training: { days: ['Rest', 'Rest'] } }), null);
  assert.equal(programTrainingDows(null), null);
  // Sessions on Tue and Thu, two weeks running, around 2026-11-05.
  const dates = ['2026-10-27', '2026-10-29', '2026-11-03', '2026-11-10', '2026-11-12', '2026-12-30'];
  assert.deepEqual(sessionTrainingDows(dates, '2026-11-05'), [1, 3]);
  assert.equal(sessionTrainingDows(['2026-11-03'], '2026-11-05'), null, 'one session reads nothing');
  assert.equal(sessionTrainingDows(['2026-11-10'], '2026-11-05'), null, 'not even one in the coming week');
  assert.deepEqual(trainingDowsFor({ programDetail: { training: { days: ['Push day', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'] } }, sessionDates: dates, today: '2026-11-05' }), { dows: [1, 3], source: 'sessions' });
  assert.deepEqual(trainingDowsFor({ programDetail: { training: { days: ['Push day', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'] } }, sessionDates: [], today: '2026-11-05' }), { dows: [0], source: 'program' });
  assert.equal(trainingDowsFor({}), null);
});

// ── The routes ─────────────────────────────────────────────────────────────────────
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const mealCore = await import(join(ROOT, 'src/lib/ai/mealDraft.mjs'));
const NUTRI = '33333333-3333-4333-8333-333333333333';
const CLIENT = '44444444-4444-4444-8444-444444444444';
async function mealRoute({ role = 'nutritionist', allowed = true, coached = [CLIENT] } = {}) {
  const checks = [];
  const sb = fakeSupabase({ tables: { profiles: [{ id: NUTRI, role, roles: [] }] }, rpcs: { is_coach_on_client: (a) => coached.includes(a.p_client_id) } });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/ai/draft-meal-plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: NUTRI, email: 'n@x' }), clientForRequest: async () => sb }],
      ['@/lib/membership-core', { computeMembership: async () => ({ isMember: true, isCoach: true, isAdmin: false }) }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/ai/noraLimits', { countBudget: async (_sb, uid, kind) => { checks.push({ uid, kind }); return { allowed, limit: 80, resetSeconds: 3600 }; }, budgetReply: (kind) => `spent:${kind}` }],
      ['@/lib/ai/mealDraft.mjs', mealCore],
    ]),
  });
  return { mod, checks, sb };
}
const mealPost = (body) => new Request('https://x/api/ai/draft-meal-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('draft-meal-plan: a nutritionist gets the builder\'s document from the Kitchen, with her draft beside it; it writes nothing', async () => {
  const r = await mealRoute();
  const res = await r.mod.POST(mealPost({ request: 'a cut at 1,900 kcal, 7 days, no shellfish, 35 min prep at most', slots: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.draft.doc.targets.kcal, 1900);
  assert.equal(j.draft.doc.days.length, 7);
  assert.ok(j.draft.doc.restTargets);
  assert.deepEqual(j.draft.doc.constraints.exclusions, ['shellfish']);
  assert.equal(j.draft.doc.constraints.maxPrep, 35);
  assert.equal(j.draft.snapshot.by, 'nora');
  assert.equal(Object.keys(j.draft.snapshot.meals).length, 28);
  assert.equal(j.notice, KITCHEN_NOTICE);
  assert.ok(j.lines.some((l) => l.label === 'Rest days'));
  assert.deepEqual(r.checks, [{ uid: NUTRI, kind: 'coach_draft' }], 'the coach drafting budget');
  assert.ok(!r.sb._calls.some((c) => c.table === 'coach_plans' || c.op === 'insert'), 'nothing written');
  // A field sent wins over the words.
  const f = await (await (await mealRoute()).mod.POST(mealPost({ request: 'a cut at 1,900 kcal', kcal: 2100 }))).json();
  assert.equal(f.draft.doc.targets.kcal, 2100);
});

test('draft-meal-plan: trainers are refused; a stranger client is refused; a spent budget and nothing that fits say so', async () => {
  const trainer = await mealRoute({ role: 'trainer' });
  const t = await trainer.mod.POST(mealPost({ request: 'a cut' }));
  assert.equal(t.status, 403);
  assert.equal((await t.json()).error, 'Meal-plan drafting is for nutritionists.');
  const stranger = await mealRoute({ coached: [] });
  assert.equal((await stranger.mod.POST(mealPost({ request: 'a cut', clientId: CLIENT }))).status, 403);
  assert.equal(stranger.checks.length, 0, 'refused before the budget');
  const spent = await mealRoute({ allowed: false });
  const s = await spent.mod.POST(mealPost({ request: 'a cut' }));
  assert.equal(s.status, 429);
  assert.equal((await s.json()).code, 'daily_budget');
  const none = await mealRoute();
  const n = await none.mod.POST(mealPost({ slots: ['Breakfast'], exclude: ['vegan'] }));
  assert.equal(n.status, 422);
  assert.equal((await n.json()).code, 'nothing_fits');
});

test('the Kitchen foods route is public, cached, and the catalog the drafts use', async () => {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/kitchen/foods/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/kitchenFoods.mjs', await import(join(ROOT, 'src/lib/kitchenFoods.mjs'))]]),
  });
  const res = await mod.GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /public, max-age=3600/);
  const j = await res.json();
  assert.equal(j.foods.length, 100);
  assert.deepEqual(j.foods.map((f) => f.id), KITCHEN_FOODS.map((f) => f.id));
  assert.equal(j.stats.recipes, 100);
});

test('the training-days route: the coach\'s own session, each id read and gated; nothing on file is null', async () => {
  const sb = fakeSupabase({
    tables: { client_programs: [{ user_id: CLIENT, detail: { training: { days: ['Push day', 'Rest', 'Legs day', 'Rest', 'Pull day', 'Rest', 'Rest'] } } }] },
    rpcs: { get_shared_client_workouts: (a) => (a.p_client_id === NUTRI ? [{ scheduled_date: '2026-11-03' }, { scheduled_date: '2026-11-10' }, { scheduled_date: '2026-10-27' }] : []) },
  });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/coach/clients/training-days/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => ({ id: 'coach' }), clientForRequest: async () => sb }], ['@/lib/training-days.mjs', await import(join(ROOT, 'src/lib/training-days.mjs'))]]),
  });
  const other = '55555555-5555-4555-8555-555555555555';
  const res = await mod.GET(new Request(`https://x/api/coach/clients/training-days?ids=${CLIENT},${NUTRI},${other},not-an-id&today=2026-11-05`));
  const j = await res.json();
  assert.deepEqual(j.days[CLIENT], { dows: [0, 2, 4], source: 'program' });
  assert.deepEqual(j.days[NUTRI], { dows: [1], source: 'sessions' });
  assert.equal(j.days[other], null);
  assert.ok(!('not-an-id' in j.days));
  const anon = await loadRealModule(join(ROOT, 'src/app/api/coach/clients/training-days/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => null, clientForRequest: async () => sb }], ['@/lib/training-days.mjs', await import(join(ROOT, 'src/lib/training-days.mjs'))]]),
  });
  assert.equal((await anon.GET(new Request('https://x/api/coach/clients/training-days?ids=' + CLIENT))).status, 401);
});

// ── The template on a meal-plan assignment ──────────────────────────────────────────
async function assignRoute({ ownPlans = [] } = {}) {
  const inserts = [];
  const sb = {
    from(table) {
      const st = { table, filters: {} };
      const q = {
        select() { return q; }, eq(k, v) { st.filters[k] = v; return q; }, in() { return q; },
        update() { return q; },
        insert(row) { inserts.push({ table, row }); return { select: () => ({ single: async () => ({ data: { id: 'new-plan' }, error: null }) }) }; },
        maybeSingle: async () => {
          if (table === 'nutritionists') return { data: { id: 7 }, error: null };
          if (table === 'coach_plans') return { data: ownPlans.find((p) => p.id === st.filters.id && st.filters.owner_id === NUTRI && st.filters.kind === 'meal_plan') || null, error: null };
          return { data: null, error: null };
        },
        then(res, rej) { return Promise.resolve(table === 'subscriptions' ? { data: [{ client_id: CLIENT }], error: null } : { data: null, error: null }).then(res, rej); },
      };
      return q;
    },
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/nutritionist/meal-plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: NUTRI }), clientForRequest: async () => sb }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/access-guards.mjs', await import(join(ROOT, 'src/lib/access-guards.mjs'))],
      ['@/lib/compliance/server', { gateProviderAction: async () => ({ enforced: false, allowed: true, disclaimer: '', scope: 'x', reason: null }), blockMessage: () => '' }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
      ['@/lib/notify', { createNotification: async () => {} }],
    ]),
  });
  return { mod, inserts };
}
const TPL = '66666666-6666-4666-8666-666666666666';
const assignPost = (body) => new Request('https://x/api/nutritionist/meal-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: CLIENT, title: 'Summer Cut', days: [{ dow: 0, meals: [] }], ...body }) });

test('a meal-plan assignment carries the template it came from, when that template is the nutritionist\'s own', async () => {
  const own = await assignRoute({ ownPlans: [{ id: TPL, name: 'Summer Cut · 1900' }] });
  assert.equal((await own.mod.POST(assignPost({ template: { id: TPL, version: 3 } }))).status, 200);
  assert.deepEqual(own.inserts[0].row.payload, { days: [{ dow: 0, meals: [] }], template: { id: TPL, name: 'Summer Cut · 1900', version: 3 } });
  const theirs = await assignRoute({ ownPlans: [] });
  assert.equal((await theirs.mod.POST(assignPost({ template: { id: TPL, version: 3 } }))).status, 200, 'the assignment still lands');
  assert.deepEqual(theirs.inserts[0].row.payload, { days: [{ dow: 0, meals: [] }] }, 'a template that is not theirs is not stamped');
  const bad = await assignRoute({ ownPlans: [{ id: TPL, name: 'x' }] });
  await bad.mod.POST(assignPost({ template: { id: 'not-a-uuid' } }));
  assert.deepEqual(bad.inserts[0].row.payload, { days: [{ dow: 0, meals: [] }] });
  const none = await assignRoute();
  await none.mod.POST(assignPost({}));
  assert.deepEqual(none.inserts[0].row.payload, { days: [{ dow: 0, meals: [] }] }, 'as before without one');
});

test('the builder sends the template with each assignment, and each client\'s own days', () => {
  const src = read('public/newdesign/dashMealBuilder.jsx');
  assert.match(src, /body: JSON\.stringify\(\{ clientId: id, title: template\.name \+ \(scale !== 1 \? " · ×" \+ scale : ""\), weekStart: startDate, days: out\.days, \.\.\.\(tplStamp \? \{ template: tplStamp \} : \{\}\) \}\)/);
  assert.match(src, /DashMeals\.buildMealAssignment\(doc, \{ scale, trainingDows: dowsFor\(id\),/);
  assert.match(src, /\/api\/coach\/clients\/training-days\?ids=/);
  assert.match(src, /Use these days for everyone instead of their own/, 'the coach override');
});

test('the meal builder searches Shape Kitchen ("Kitchen 100 / Mine"), and no Nora box sits on the library', () => {
  const src = read('public/newdesign/dashMealBuilder.jsx');
  assert.match(src, /fetch\("\/api\/kitchen\/foods"/);
  assert.match(src, /\["kitchen", "Kitchen " \+ \(kitchenAll \? kitchenAll\.length : "…"\)\], \["mine", "Mine " \+ mineAll\.length\]/);
  // ⚠ The owner's ruling of 2026-11-04 (#2590): Nora lives in the New flow and inside the builders.
  const library = src.slice(src.indexOf('{/* Zone 1 — Library */}'), src.indexOf('{/* Zone 2 — Lifecycle */}'));
  assert.doesNotMatch(library, /Start with Nora|draft-meal-plan|DmbStart/);
  assert.match(src, /onClick=\{\(\) => setStarting\(true\)\} style=\{dmbBtn\(true\)\}>\+ New meal plan</, '+ New meal plan opens the New flow');
  // The SQL index is optional: everything above reads the payload, with or without it.
  const sql = read('supabase-migrations/2026-11-05-plan-template-usage.sql');
  assert.match(sql, /create index if not exists client_meal_plans_template_idx/);
  assert.match(sql, /create index if not exists client_workouts_template_idx/);
});
