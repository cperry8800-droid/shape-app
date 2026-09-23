// The coach libraries' filters — the counting rule, what each program and meal plan
// answers the filters with, and the chips' contrast on both papers. node --test.
//
// ⚠ EVERY FILTER HERE MAKES A CLAIM ABOUT A COACH'S OWN WORK, and the ones that matter
// most are the ones that must NOT be made: a program with a move the coach wrote is not
// "Home", a plan with a dish the nutritionist wrote is not "dairy-free", an unread
// calendar is not "In use · No", and the `goalTag` every program carries is not a tag
// anybody chose. Each of those has a case below, because each was the easy wrong answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require = createRequire(import.meta.url);
const DB = require('../public/newdesign/dashBuilderCore.js');
const DM = require('../public/newdesign/dashMealCore.js');
// dashFilterBar.jsx is a babel page script: its last line publishes to `window`.
globalThis.window = globalThis.window || {};
const F = await loadRealModule(fileURLToPath(new URL('../public/newdesign/dashFilterBar.jsx', import.meta.url)),
  { appendExports: 'export { DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift };' });

// ── The counting rule ───────────────────────────────────────────────────────
const ITEMS = [
  { id: 'a', search: 'lower power', keys: { kit: ['home'], focus: ['lower'] } },
  { id: 'b', search: 'upper day', keys: { kit: ['barbell'], focus: ['upper'] } },
  { id: 'c', search: 'full body', keys: { kit: ['home', 'barbell'], focus: ['lower', 'upper'] } },
  { id: 'd', search: 'mobility', keys: { kit: [], focus: ['mobility'] } },
];
const FACETS = [
  { key: 'kit', options: [{ key: 'home' }, { key: 'barbell' }] },
  { key: 'focus', options: [{ key: 'lower' }, { key: 'upper' }, { key: 'mobility' }] },
];
const ids = (run) => run.shown.map((x) => x.id).join('');
const state = (sel, q = '') => ({ q, sel });

test('with nothing chosen every item shows and every option counts what it would leave', () => {
  const run = F.dfbRun(ITEMS, FACETS, F.DFB_EMPTY);
  assert.equal(ids(run), 'abcd');
  assert.deepEqual(run.counts.kit, { home: 2, barbell: 2 });
  assert.deepEqual(run.counts.focus, { lower: 2, upper: 2, mobility: 1 });
  assert.equal(run.pool.kit, 4);
  assert.equal(run.active, false);
});

test('two options inside one filter WIDEN it; two filters NARROW each other', () => {
  assert.equal(ids(F.dfbRun(ITEMS, FACETS, state({ kit: ['home', 'barbell'] }))), 'abc');
  assert.equal(ids(F.dfbRun(ITEMS, FACETS, state({ kit: ['home'], focus: ['upper'] }))), 'c');
});

test('an option counts with every OTHER filter applied, never its own', () => {
  // With Home chosen, Barbell still says 2 — choosing it widens to both barbell programs —
  // while Upper says 1, because Home already narrows the other filter.
  const run = F.dfbRun(ITEMS, FACETS, state({ kit: ['home'] }));
  assert.equal(run.counts.kit.barbell, 2);
  assert.equal(run.counts.focus.upper, 1);
  assert.equal(run.counts.focus.mobility, 0);
  assert.equal(run.pool.focus, 2, 'the tag row\'s All counts under the other filters too');
});

test('the search narrows the result and every count, ignoring case and spacing', () => {
  const run = F.dfbRun(ITEMS, FACETS, state({}, '  FULL   body '));
  assert.equal(ids(run), 'c');
  assert.equal(run.counts.kit.home, 1);
  assert.equal(run.active, true);
});

test('a choice the facet no longer offers is dropped, never left narrowing to nothing', () => {
  // A tag taken off the last program that carried it leaves the row; a selection nobody
  // can see must not go on filtering the library.
  const run = F.dfbRun(ITEMS, FACETS, state({ focus: ['gone', 'gone'] }));
  assert.equal(ids(run), 'abcd');
  assert.deepEqual(run.sels.focus, []);
  assert.equal(run.active, false);
  assert.deepEqual(F.dfbSelected(FACETS[1], state({ focus: ['upper', 'upper', 'gone'] })), ['upper']);
});

test('the count names the result, and the total when nothing narrows it', () => {
  assert.equal(F.dfbCountLabel(F.dfbRun(ITEMS, FACETS, F.DFB_EMPTY), 'program', 'programs'), '4 programs');
  assert.equal(F.dfbCountLabel(F.dfbRun(ITEMS, FACETS, state({ kit: ['barbell'] })), 'program', 'programs'), '2 of 4 programs');
  assert.equal(F.dfbCountLabel(F.dfbRun(ITEMS.slice(0, 1), FACETS, F.DFB_EMPTY), 'program', 'programs'), '1 program');
});

test('toggling and clearing never mutate the state they were handed', () => {
  const s0 = state({ kit: ['home'], focus: ['lower'] });
  const frozen = JSON.stringify(s0);
  const s1 = F.dfbToggle(s0, 'kit', 'barbell');
  assert.deepEqual(s1.sel.kit, ['home', 'barbell']);
  assert.deepEqual(F.dfbToggle(s1, 'kit', 'home').sel.kit, ['barbell']);
  assert.deepEqual(F.dfbClearFacet(s1, 'kit').sel, { focus: ['lower'] });
  assert.equal(JSON.stringify(s0), frozen);
});

test('a panel opens under its chip and slides only as far as the 16px gutter needs', () => {
  // The phone case that shipped cut off: a chip mid-row at 390px, a 300px panel.
  assert.equal(F.dfbPopShift(213, 300, 390), 139);
  assert.equal(213 - F.dfbPopShift(213, 300, 390) + 300, 390 - 16, 'its right edge lands on the gutter');
  assert.equal(F.dfbPopShift(400, 300, 1440), 0, 'room on the right: it stays under its chip');
  assert.equal(F.dfbPopShift(10, 300, 1440), -6, 'a chip inside the gutter pushes the panel right, not off-screen');
  // Narrower than panel + two gutters (320px, capped to 288 by CSS): pinned to the left gutter.
  assert.equal(18 - F.dfbPopShift(18, 288, 320), 16);
  assert.equal(100 - F.dfbPopShift(100, 400, 320), 16, 'never past the LEFT gutter, even when it cannot fit');
});

// ── Program tags ────────────────────────────────────────────────────────────
test('tags: a built-in resolves by key or label, own words keep their spelling', () => {
  assert.deepEqual(DB.normalizeTags(['Strength', 'strength', 'CUT', '5k Prep', '  Post   natal  ', 'post natal']),
    ['strength', 'cut', '5k-prep', 'Post natal']);
  assert.equal(DB.normalizeTag('   '), null);
  assert.equal(DB.normalizeTag('x'.repeat(40)).length, DB.TAG_MAX_LEN);
});

test('tags: client-written jsonb is checked on the way in', () => {
  // Strings only, one copy each, never more than TAG_MAX — and a tag named like an
  // Object.prototype member is just a tag.
  assert.deepEqual(DB.normalizeTags([42, null, {}, ['cut'], 'constructor', '__proto__', 'toString']),
    ['constructor', '__proto__', 'toString']);
  assert.equal(DB.tagInfo('constructor').builtin, false);
  const many = Array.from({ length: 20 }, (_, i) => 'Tag ' + i);
  assert.equal(DB.normalizeTags(many).length, DB.TAG_MAX);
  assert.deepEqual(DB.normalizeTags('cut'), [], 'a string where a list belongs is not a list');
});

test('tags: a built-in carries its goal colour; a coach tag one stable palette colour', () => {
  assert.deepEqual(DB.tagInfo('Hypertrophy'), { key: 'hypertrophy', label: 'Hypertrophy', c: '#8a5cf6', builtin: true });
  const a = DB.tagInfo('Postnatal'), b = DB.tagInfo('POSTNATAL');
  assert.equal(a.key, 'tag:postnatal');
  assert.equal(a.key, b.key, 'one tag whatever its case');
  assert.equal(a.c, b.c, 'and one colour, derived rather than stored');
  assert.ok(DB.TAG_PALETTE.includes(a.c));
});

const row = (name, over = {}) => ({ id: name, name, sets: 3, reps: '8', loadType: 'kg', load: 0, ...over });
const program = (rows, opts = {}) => ({
  id: opts.id || 'p1', name: opts.name || 'Test Program', published: opts.published !== false,
  detail: { buildType: opts.type || 'program', builder: {
    version: 1, goalTag: opts.goalTag || 'strength', tags: opts.tags,
    weeks: opts.weeks || [{ deload: false, days: [{ name: 'D1', blocks: [{ kind: 'main', rows }] }] }],
  } },
});

test('the goalTag every program carries is NOT read as a tag', () => {
  // `newProgram` and the importer stamp 'strength' on everything and no control chose it;
  // reading it would tag every program a coach has ever made "Strength".
  const f = DB.programFacts(program([row('Back squat')], { goalTag: 'cut' }), null);
  assert.deepEqual(f.keys.tags, []);
  assert.deepEqual(f.info.tags, []);
  assert.deepEqual(DB.programFacts(program([row('Back squat')], { tags: ['cut', 'Knees'] }), null).keys.tags, ['cut', 'tag:knees']);
});

test('the coach\'s own tags come back from their library, deduped, never the goals', () => {
  const lib = [program([], { tags: ['cut', 'Postnatal'] }), program([], { tags: ['postnatal', 'Beginner', 'Strength'] }), { detail: null }, null];
  assert.deepEqual(DB.customTagsFromTemplates(lib), ['Beginner', 'Postnatal']);
  const facet = DB.programTagFacet(lib);
  assert.deepEqual(facet.options.map((o) => o.key), ['cut', 'strength', 'hypertrophy', 'return-to-gym', '5k-prep', 'tag:beginner', 'tag:postnatal']);
});

// ── Program facts ───────────────────────────────────────────────────────────
test('focus comes from the muscles, and lower plus upper is full body', () => {
  assert.deepEqual(DB.programFacts(program([row('Back squat'), row('Romanian deadlift')]), null).keys.focus, ['lower']);
  assert.deepEqual(DB.programFacts(program([row('Back squat'), row('Bench press'), row('Plank')]), null).keys.focus, ['lower', 'upper', 'core', 'full']);
  assert.deepEqual(DB.programFacts(program([row('Sled push'), row('Couch stretch')]), null).keys.focus, ['conditioning', 'mobility']);
});

test('a row is recognised by its OWN descriptor first, then by name from Shape\'s list', () => {
  // The mobile editor writes rows with no muscle or equipment; the name identifies them.
  assert.deepEqual(DB.rowKit({ name: 'push-up' }), { muscle: 'chest', equipment: 'bodyweight' });
  assert.deepEqual(DB.rowKit({ name: 'Push-up', muscle: 'Triceps', equipment: 'Band' }), { muscle: 'triceps', equipment: 'band' });
  assert.deepEqual(DB.rowKit({ name: 'My secret move' }), { muscle: '', equipment: '' });
});

test('Home means every move needs only home kit; bodyweight implies it', () => {
  const home = DB.programFacts(program([row('Goblet squat'), row('Push-up'), row('Kettlebell swing'), row('Band pull-apart')]), null);
  assert.deepEqual(home.keys.equipment, ['home']);
  const bw = DB.programFacts(program([row('Push-up'), row('Plank'), row('Easy run')]), null);
  assert.deepEqual(bw.keys.equipment, ['home', 'bodyweight']);
  const gym = DB.programFacts(program([row('Back squat'), row('Lat pulldown'), row('Leg press'), row('Rower')]), null);
  assert.deepEqual(gym.keys.equipment, ['barbell', 'machines', 'cardio']);
});

// ⚠ THE KIT AND REGION MAPS ARE NAMED, NOT INFERRED, so a move added to Shape's list with
// a muscle or a piece of kit they do not name would add no focus and quietly stop every
// program holding it from counting as Home. Every listed move must answer both.
test('every move in Shape\'s own list answers Focus and Equipment', () => {
  assert.ok(DB.EXERCISES.length >= 50, 'the list is there to check');
  const one = (name) => DB.programFacts({ detail: { builder: { weeks: [{ days: [{ blocks: [{ rows: [{ name }] }] }] }] } } }, null).keys;
  const blind = DB.EXERCISES.filter((x) => { const k = one(x.name); return !k.focus.length || !k.equipment.length; })
    .map((x) => x.name + ' (' + x.muscle + ', ' + x.equipment + ')');
  assert.deepEqual(blind, []);
});

// ⚠ A TAG IS ONLY WORTH CHOOSING IF IT SURVIVES THE SAVE. The plans route runs every
// workout through normalizeWorkoutDetail on the way in AND out, and the app's editor
// saves through the same document, so the builder's tags have to ride it untouched.
test('a program\'s tags survive the save path\'s normalizer', () => {
  const W = require('../public/newdesign/workoutDocument.js');
  const detail = { buildType: 'program', builder: { version: 2, goalTag: 'strength', tags: ['cut', 'Postnatal'],
    weeks: [{ deload: false, days: [{ id: 'd', name: 'Day 1', blocks: [{ kind: 'main', rows: [] }] }] }] } };
  assert.deepEqual(W.normalizeWorkoutDetail(detail, { name: 'X' }).builder.tags, ['cut', 'Postnatal']);
  assert.deepEqual(W.normalizeWorkoutPlan({ kind: 'program', name: 'X', detail }).detail.builder.tags, ['cut', 'Postnatal']);
});

test('a move the coach wrote themselves blocks Home and adds no focus', () => {
  // It carries no equipment, so nobody can say it needs no gym — the easy wrong answer.
  const f = DB.programFacts(program([row('Push-up'), row('Sandbag clean')]), null);
  assert.deepEqual(f.keys.equipment, []);
  assert.deepEqual(f.keys.focus, ['upper']);
  assert.deepEqual(DB.programFacts(program([]), null).keys.equipment, [], 'an empty program needs nothing — and is not therefore Home');
});

test('length, days a week, type and status', () => {
  const week = (n) => ({ deload: false, days: Array.from({ length: n }, (_, i) => ({ name: 'D' + i, blocks: [{ kind: 'main', rows: [row('Push-up')] }] })) });
  const f = DB.programFacts(program(null, { weeks: [week(4), week(3), week(4), week(4), week(4), week(4)], published: false }), null);
  assert.deepEqual([f.keys.length, f.keys.days, f.keys.type, f.keys.status], [['5-8'], ['4'], ['program'], ['draft']]);
  assert.deepEqual(DB.programFacts(program(null, { weeks: [week(7)], type: 'workout' }), null).keys.length, ['1']);
  assert.deepEqual(DB.programFacts(program(null, { weeks: [week(7)] }), null).keys.days, ['6+']);
  assert.deepEqual(DB.programFacts(program(null, { weeks: Array.from({ length: 12 }, () => week(2)) }), null).keys.length, ['9+']);
  assert.deepEqual(DB.programFacts(program(null, { weeks: [week(1), week(1)] }), null).keys.length, ['2-4']);
});

test('in use: an unread calendar answers nothing, a capped one never says "not in use"', () => {
  const p = program([row('Push-up')]);
  assert.deepEqual(DB.programFacts(p, null).keys.use, []);
  assert.equal(DB.programFacts(p, null).info.clients, null);
  assert.deepEqual(DB.programFacts(p, { clients: 3 }).keys.use, ['in-use']);
  assert.equal(DB.programFacts(p, { clients: 3 }).info.clients, 3);
  assert.deepEqual(DB.programFacts(p, { clients: 0 }).keys.use, ['idle']);
  assert.deepEqual(DB.programFacts(p, { clients: 0, capped: true }).keys.use, []);
  assert.deepEqual(DB.programFacts(p, { clients: 2, capped: true }).keys.use, ['in-use']);
});

test('a malformed stored program is read, not thrown on', () => {
  // This runs inside the library render, where a throw is a blank page.
  const ragged = { name: 'Ragged', detail: { builder: { weeks: [null, { days: null }, { days: [null, { blocks: [null, { rows: [null, { name: 'Push-up' }] }] }] }] } } };
  assert.doesNotThrow(() => DB.programFacts(ragged, null));
  assert.deepEqual(DB.programFacts(ragged, null).keys.focus, ['upper']);
  for (const bad of [null, undefined, {}, { detail: null }, { detail: { builder: null } }, { detail: { builder: { weeks: 'x' } } }]) {
    assert.doesNotThrow(() => DB.programFacts(bad, null));
  }
});

test('the demo programs carry the tag their names promise; a real library\'s are chosen', () => {
  const tags = DB.demoTemplates().map((t) => DB.programFacts(t, null).keys.tags[0]).sort();
  assert.deepEqual(tags, ['5k-prep', 'cut', 'hypertrophy', 'return-to-gym', 'strength']);
});

// ── Meal plan facts ─────────────────────────────────────────────────────────
const food = (id) => DM.FOODS.find((f) => f.id === id);
const placed = (id, extra = {}) => ({ ...DM.newMeal(food(id), 'Lunch'), ...extra });

test('a placed catalog meal is checked against Shape\'s food list', () => {
  assert.deepEqual(DM.mealDiet(placed('f6')), { known: true, contains: ['fish'] });
  assert.deepEqual(DM.mealDiet(placed('f5')), { known: true, contains: [] });
});

test('a renamed meal, or one whose ingredients changed, is NOT CHECKED', () => {
  assert.equal(DM.mealDiet(placed('f5', { name: 'Chicken bowl (mine)' })).known, false);
  assert.equal(DM.mealDiet(placed('f5', { ingredients: [{ name: 'Chicken breast' }, { name: 'Cheddar' }] })).known, false);
  // Nothing is read off a name: this one would claim the dairy it was named to rule out,
  // and a shellfish dish would read as fish.
  assert.deepEqual(DM.mealDiet({ name: 'Dairy-free banana bread', ingredients: [] }), { known: false, contains: [] });
  assert.deepEqual(DM.mealDiet({ name: 'Mum\'s shellfish bisque', ingredients: [] }), { known: false, contains: [] });
  assert.deepEqual(DM.mealDiet(null), { known: false, contains: [] });
});

test('an approved alternate is known by its name — it cannot be renamed', () => {
  assert.deepEqual(DM.mealDiet({ name: 'Tofu stir-fry + rice', kcal: 580 }, true), { known: true, contains: ['soy'] });
  assert.equal(DM.mealDiet({ name: 'Tofu stir-fry + rice', kcal: 580 }, false).known, false, 'the same shape as a base meal is a meal whose ingredients are gone');
});

test('the catalog carries every allergen its own ingredients list', () => {
  // Butter, Greek yogurt and feta are dairy; oats carry gluten here as on the pancakes.
  for (const [id, a] of [['f3', 'dairy'], ['f12', 'dairy'], ['f24', 'dairy'], ['f2', 'gluten'], ['f17', 'gluten']]) {
    assert.ok(food(id).tags.includes(a), food(id).name + ' should carry ' + a);
  }
  const DAIRY = /\b(milk|yogurt|cheese|feta|whey|cream|parmesan)\b|(?<!peanut )\bbutter\b/i;
  for (const f of DM.FOODS) {
    if (f.ingredients.some((i) => DAIRY.test(i.name) && !/coconut milk/i.test(i.name))) {
      assert.ok(f.tags.includes('dairy'), f.name + ' lists dairy but does not carry it');
    }
  }
  assert.ok(!DM.searchFoods('', { exclusions: ['dairy'] }).some((f) => ['f3', 'f12', 'f24'].includes(f.id)), 'and the builder\'s exclusion hides them');
});

// ⚠ A NAME DECIDES NOTHING ON ITS OWN. The picker's rule (and so the Diet filter's) reads
// an allergen off a food's NAME as well as its tags — and "veggie" holds "egg", "coconut"
// holds "nut" — so every allergen a catalog name implies must already be a tag, or a food
// would be refused by the picker and called "Contains egg" on the plan's card for a word.
test('no catalog food is given an allergen by its name alone', () => {
  assert.ok(DM.FOODS.length >= 20, 'the catalog is there to check');
  const byName = DM.FOODS.flatMap((f) => DM.ALLERGENS
    .filter((a) => f.name.toLowerCase().includes(a) && !(f.tags || []).includes(a))
    .map((a) => f.name + ' → ' + a));
  assert.deepEqual(byName, []);
});

test('a packaged food says what it holds, never what it lacks', () => {
  assert.deepEqual(DM.mealDiet(placed('f22')), { known: false, contains: ['fish'] });
  assert.deepEqual(DM.mealDiet(placed('f21')), { known: false, contains: [] });
  assert.deepEqual(DM.mealDiet({ name: 'Trail mix (40 g)' }, true), { known: false, contains: ['nuts'] });
});

const plan = (days, over = {}) => ({ ...DM.newPlan('P', 'maintain'), days, ...over });
const day = (slots, variants) => ({ ...DM.newDay('Day A'), slots, ...(variants ? { variants } : {}) });

test('a plan\'s diet holds for every meal a client can be served from it', () => {
  // Base meals, a rest-day replacement, a travel extra and an approved alternate.
  const base = placed('f5');
  base.swaps = [{ name: 'Shrimp tacos (3)', kcal: 540, p: 38, c: 58, f: 16 }];
  const p = plan([day([base], {
    rest: { overrides: { x: placed('f13') }, extras: [] },
    travel: { overrides: { y: null }, extras: [placed('f14')] },
  })]);
  assert.deepEqual(DM.planServed(p).map((x) => x.meal.name + (x.swap ? ' (swap)' : '')).sort(),
    ['Apple + peanut butter', 'Cottage cheese + berries', 'Grilled chicken bowl', 'Shrimp tacos (3) (swap)']);
  assert.deepEqual(DM.planDiet(p), { known: true, contains: ['dairy', 'gluten', 'nuts', 'shellfish'] });
  assert.deepEqual(DM.mealPlanFacts({ name: 'P', detail: { mealBuilder: p } }).keys.diet, ['no-fish', 'no-egg', 'no-soy']);
});

test('one unchecked meal leaves the whole plan unchecked — never "free of" anything', () => {
  const p = plan([day([placed('f5'), { name: 'Grandma\'s stew', kcal: 500, ingredients: [] }])]);
  assert.equal(DM.planDiet(p).known, false);
  assert.deepEqual(DM.mealPlanFacts({ name: 'P', detail: { mealBuilder: p } }).keys.diet, []);
  assert.deepEqual(DM.planDiet(plan([])), { known: false, contains: [] }, 'an empty plan has nothing checked');
});

test('prep time is the longest planned meal, and an unmeasured one leaves it unknown', () => {
  const facts = (slots) => DM.mealPlanFacts({ name: 'P', detail: { mealBuilder: plan([day(slots)]) } });
  assert.deepEqual(facts([placed('f1'), placed('f12')]).keys.prep, ['quick']);
  assert.deepEqual(facts([placed('f1'), placed('f6')]).keys.prep, ['standard']);
  assert.deepEqual(facts([placed('f11'), placed('f1')]).keys.prep, ['batch']);
  const custom = { name: 'My dish', kcal: 400, prepMin: null, ingredients: [] };
  assert.deepEqual(facts([placed('f1'), custom]).keys.prep, [], 'quick is a claim about EVERY meal');
  assert.deepEqual(facts([placed('f11'), custom]).keys.prep, ['batch'], 'but one measured long meal settles batch');
  const withSwap = placed('f1'); withSwap.swaps = [{ name: 'Beef chili + sweet potato', kcal: 640 }];
  assert.deepEqual(facts([withSwap]).keys.prep, ['quick'], 'an alternate is not the plan\'s own cooking');
});

test('calories, phase and day types', () => {
  const facts = (over) => DM.mealPlanFacts({ name: 'P', detail: { mealBuilder: plan([day([placed('f1')])], over) } }).keys;
  assert.deepEqual(facts({ targets: { kcal: 1799 } }).kcal, ['under-1800']);
  assert.deepEqual(facts({ targets: { kcal: 2400 } }).kcal, ['1800-2400']);
  assert.deepEqual(facts({ targets: { kcal: 2401 } }).kcal, ['over-2400']);
  assert.deepEqual(facts({ targets: { kcal: 0 } }).kcal, []);
  assert.deepEqual(facts({ goalPhase: 'build' }).phase, ['build']);
  assert.deepEqual(facts({ goalPhase: 'mystery' }).phase, []);
  const withTravel = plan([day([placed('f1')], { travel: { overrides: {}, extras: [] } })]);
  assert.deepEqual(DM.mealPlanFacts({ name: 'P', detail: { mealBuilder: withTravel } }).keys.days, ['travel']);
});

test('a malformed stored meal plan is read, not thrown on', () => {
  const ragged = { days: [null, { slots: null, variants: { rest: null, travel: { overrides: null, extras: [null] } } }, { slots: [null, 'x', { name: 'Tuna wrap', swaps: [null, 5] }] }] };
  assert.doesNotThrow(() => DM.mealPlanFacts({ name: 'R', detail: { mealBuilder: ragged } }));
  for (const bad of [null, {}, { detail: null }, { detail: { mealBuilder: null } }]) assert.doesNotThrow(() => DM.mealPlanFacts(bad));
});

test('the builder\'s exclusions and the Diet filter are ONE list', () => {
  const src = readFileSync(new URL('../public/newdesign/dashMealBuilder.jsx', import.meta.url), 'utf8');
  assert.match(src, /const EXCLUSION_TAGS = DashMeals\.ALLERGENS;/);
  assert.deepEqual(DM.MEAL_FACETS.find((f) => f.key === 'diet').options.map((o) => o.key), DM.ALLERGENS.map((a) => 'no-' + a));
});

test('meal plans have no Status filter — every one of them is published', () => {
  // The meal builder never sends `published` and the route defaults it to true, so a
  // Draft option would match nothing, ever — the defect this rewrite retired on Programs.
  assert.ok(!DM.MEAL_FACETS.some((f) => f.key === 'status'));
  const builder = readFileSync(new URL('../public/newdesign/dashMealBuilder.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(builder, /published\s*:/);
});

// ── The chips' text on both papers ─────────────────────────────────────────
// Every tag, palette and phase colour, selected, on the ground AND the card, must clear
// 4.5:1 on each paper at the mix dash.css declares — read from the stylesheet, so moving
// the token without re-measuring fails here.
const CSS = readFileSync(new URL('../public/newdesign/dash.css', import.meta.url), 'utf8');
const block = (open) => { const i = CSS.indexOf(open); assert.ok(i >= 0, open); return CSS.slice(i, CSS.indexOf('\n}', i)); };
const token = (b, name) => { const m = new RegExp('--' + name + ':\\s*([^;]+);').exec(b); assert.ok(m, name); return m[1].trim(); };
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = c.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const [paper, open] of [['light', ':root {'], ['dark', 'html[data-paper="dark"] {']]) {
  test(`every chip colour's text clears 4.5:1 on the ${paper} paper`, () => {
    const b = block(open);
    const P = { ink: token(b, 'sh-ink'), ink2: token(b, 'sh-ink2'), ground: token(b, 'sh-ground'), card: token(b, 'sh-card'), accent: token(b, 'sh-accent') };
    const p = parseFloat(token(b, 'sh-tag-ink-mix')) / 100;
    assert.ok(p > 0 && p < 1, 'the mix is a percentage');
    const colours = [...DB.GOAL_TAGS.map((g) => g.c), ...DB.TAG_PALETTE, ...DM.GOAL_PHASES.map((g) => g.c), P.accent];
    const worst = [];
    for (const c of colours) for (const bg of [P.ground, P.card]) {
      const r = ratio(mix(hex(c), hex(P.ink), p), mix(hex(c), hex(bg), 0.13));
      if (r < 4.5) worst.push(c + ' on ' + bg + ' = ' + r.toFixed(2));
    }
    assert.deepEqual(worst, []);
    // And a chip at rest: the paper's secondary ink on the chip's faint ink wash.
    for (const bg of [P.ground, P.card]) assert.ok(ratio(hex(P.ink2), mix(hex(P.ink), hex(bg), 0.045)) >= 4.5, 'rest text on ' + bg);
  });
}

// ⚠ iOS SAFARI ZOOMS THE PAGE ON FOCUS when a text box computes under 16px. Both text
// boxes the library filters added are in the coarse-pointer floor, read from the sheet.
test('the library\'s text boxes take the 16px floor on a coarse pointer', () => {
  const m = /@media \(pointer:coarse\)\{([^{}]*)\{\s*font-size:16px !important;\s*\}\s*\}/.exec(CSS);
  assert.ok(m, 'no coarse-pointer font floor in dash.css');
  const sel = m[1].split(',').map((x) => x.trim());
  for (const x of ['.dash-filter-search input', '.dash-tag-new']) assert.ok(sel.includes(x), x + ' is not in the floor');
});

test('the selected chip text is the declared mix, not the bare tag colour', () => {
  assert.match(CSS, /\.dash-chip\.is-on, \.dash-chip\.is-set \{[^}]*color:color-mix\(in srgb, var\(--c, var\(--sh-accent, #2ee0c4\)\) var\(--sh-tag-ink-mix, 65%\), var\(--sh-ink, #f2ede4\)\)/);
});

// ── Every library host loads the filter bar before the library ──────────────
test('every page that loads a library loads the filter bar first', () => {
  const dir = new URL('../public/newdesign/', import.meta.url);
  const pages = readdirSync(dir).filter((f) => f.endsWith('.html'));
  const hosts = pages.filter((p) => /src="(dashBuilder|dashMealBuilder)\.jsx/.test(readFileSync(new URL(p, dir), 'utf8')));
  assert.ok(hosts.length >= 4, 'found ' + hosts.length + ' library hosts — the sweep stopped matching');
  const late = hosts.filter((p) => {
    const src = readFileSync(new URL(p, dir), 'utf8');
    const bar = src.indexOf('src="dashFilterBar.jsx');
    const lib = Math.min(...['dashBuilder.jsx', 'dashMealBuilder.jsx'].map((f) => src.indexOf('src="' + f)).filter((i) => i >= 0));
    return bar < 0 || bar > lib;
  });
  assert.deepEqual(late, []);
});
