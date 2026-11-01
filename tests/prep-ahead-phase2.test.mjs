// Night-before prep, Phase 2 (2026-11-01; the approved review's "Second" phase): the shared rule's
// new ways in (mobile-app/src/services/prepAhead.mjs) and the member's own day plan
// (mobile-app/src/services/mealDays.mjs, user_goals `client_meal_days`). A nutritionist's tick on any
// meal, the hour the member chooses, meals the member plans themselves, and the morning swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import {
  BS_PREP_HOUR, BS_PREP_HOURS, BS_PREP_REMINDER_KIND, BS_MORNING_SWAP_MAX_MIN,
  bsMadeAheadByName, bsMakeAheadIndex, bsMakeAheadInfo, bsMealNameCore, bsMorningSwapFor, bsPlanByDow,
  bsPlanMealsOn, bsPrepCovers, bsPrepDueTonight, bsPrepHourOf, bsPrepRecordsFor, bsPrepReminderCopy,
  bsPrepReminderText, bsPrepRouteFor, bsRecipeMinutes, bsYmdIn,
} from '../mobile-app/src/services/prepAhead.mjs';
import {
  BS_MEAL_DAYS_KIND, BS_OWN_DAYS, BS_OWN_PER_DAY, BS_OWN_SLOTS, BS_OWN_SLOT_TIME,
  bsMealDayOf, bsMealDaysAdd, bsMealDaysPrune, bsMealDaysRemove, bsMealDaysSwap, bsOwnMealOf, bsOwnSlot,
} from '../mobile-app/src/services/mealDays.mjs';

const OATS = 'Overnight oats, three ways';
const OATS_SLUG = 'overnight-oats-three-ways';
const BOWL = 'Greek yogurt power bowl';
const INDEX = bsMakeAheadIndex(SHAPE_KITCHEN_RECIPES);
const dayOf = (ms) => bsYmdIn(ms, 'UTC');
const SUNDAY = '2026-10-04';
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';
const at = (ymd, hour = 19) => Date.parse(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);
const recipe = (title) => SHAPE_KITCHEN_RECIPES.find((r) => r.title === title);
const due = (over = {}) => bsPrepDueTonight({
  days: [], swaps: {}, mine: {}, entries: [], reminded: [], today: SUNDAY, index: INDEX, dayOf, now: at(SUNDAY), ...over,
});
const dates = (groups) => groups.flatMap((g) => g.meals.map((m) => m.date));
const own = (id, title, slot = 'BREAKFAST', extra = {}) => ({ id, slot, title, kcal: 480, p: 28, c: 58, f: 14, ...extra });
const doc = (days) => ({ v: 1, days });

// ── The member's own day plan ───────────────────────────────────────────────────────────────────

test('a day plan is read validated: bad rows dropped, a repeated id once, at most twelve a day', () => {
  const day = bsMealDayOf(doc({ [MONDAY]: {
    add: [
      own('a1', OATS, 'bfast', { recipeId: OATS_SLUG, time: '07:30' }),
      own('a1', 'Second with the same id'),
      own('bad id!', 'Space in the id'),
      own('a2', '   '),
      { id: 'a3', title: 'No numbers', slot: 'tea', recipeId: 'Not A Slug', time: 'noon', kcal: -5, p: 'x' },
      null, 'text', [],
    ],
    swap: { 'live-0-0': { title: BOWL, recipeId: 'greek-yogurt-power-bowl', kcal: 480, p: 38, c: 52, f: 12 }, 'bad key!': { title: 'x' }, 'own-a1': { title: '' } },
  } }), MONDAY);
  assert.deepEqual(day.add.map((a) => a.id), ['a1', 'a3']);
  assert.deepEqual(day.add[0], { id: 'a1', slot: 'BREAKFAST', title: OATS, kcal: 480, p: 28, c: 58, f: 14, recipeId: OATS_SLUG, time: '07:30' });
  assert.deepEqual(day.add[1], { id: 'a3', slot: 'MEAL', title: 'No numbers', kcal: 0, p: 0, c: 0, f: 0 }, 'a bad slot, slug, time and number are dropped, not trusted');
  assert.deepEqual(Object.keys(day.swap), ['live-0-0']);
  assert.deepEqual(bsMealDayOf(doc({}), MONDAY), { add: [], swap: {} });
  assert.deepEqual(bsMealDayOf(null, MONDAY), { add: [], swap: {} });
  assert.deepEqual(bsMealDayOf(doc({ [MONDAY]: { add: [own('a1', OATS)] } }), 'Monday'), { add: [], swap: {} });
  const many = bsMealDayOf(doc({ [MONDAY]: { add: Array.from({ length: 20 }, (_, i) => own(`m${i}`, `Meal ${i}`)) } }), MONDAY);
  assert.equal(many.add.length, BS_OWN_PER_DAY);
  assert.equal(bsMealDayOf(doc({ [MONDAY]: { add: [own('long', 'x'.repeat(300))] } }), MONDAY).add[0].title.length, 120);
});

test('planning, unplanning and a day swap write a pruned document; days gone by are dropped', () => {
  let d = bsMealDaysAdd({}, MONDAY, own('a1', OATS, 'BREAKFAST', { recipeId: OATS_SLUG }), SUNDAY);
  assert.deepEqual(Object.keys(d.days), [MONDAY]);
  assert.equal(d.v, 1);
  d = bsMealDaysAdd(d, MONDAY, own('a1', 'Same id again'), SUNDAY);
  assert.equal(d.days[MONDAY].add.length, 1, 'an id already planned is not planned twice');
  d = bsMealDaysAdd(d, MONDAY, { id: 'nope', title: '' }, SUNDAY);
  assert.equal(d.days[MONDAY].add.length, 1, 'a meal that does not validate is not added');
  d = bsMealDaysSwap(d, MONDAY, 'own-a1', { title: BOWL, kcal: 480 }, SUNDAY);
  assert.equal(d.days[MONDAY].swap['own-a1'].title, BOWL);
  d = bsMealDaysSwap(d, MONDAY, 'bad key!', { title: BOWL }, SUNDAY);
  assert.deepEqual(Object.keys(d.days[MONDAY].swap), ['own-a1']);
  // Unplanning a meal takes its swap with it, and an empty day leaves the document.
  d = bsMealDaysRemove(d, MONDAY, 'a1', SUNDAY);
  assert.deepEqual(d, { v: 1, days: {} });
  // A swap undone with null.
  let s = bsMealDaysSwap({}, MONDAY, 'live-0-0', { title: BOWL }, SUNDAY);
  s = bsMealDaysSwap(s, MONDAY, 'live-0-0', null, SUNDAY);
  assert.deepEqual(s.days, {});
  // A full day takes no more.
  let full = {};
  for (let i = 0; i < BS_OWN_PER_DAY + 2; i++) full = bsMealDaysAdd(full, MONDAY, own(`m${i}`, `Meal ${i}`), SUNDAY);
  assert.equal(full.days[MONDAY].add.length, BS_OWN_PER_DAY);
  // Pruned: before today goes, the newest days are kept.
  const old = doc({ '2026-10-01': { add: [own('x', 'Gone')] }, [TUESDAY]: { add: [own('y', 'Kept')] }, junk: { add: [own('z', 'Junk')] } });
  assert.deepEqual(Object.keys(bsMealDaysPrune(old, MONDAY).days), [TUESDAY]);
  const lots = {};
  for (let i = 0; i < 40; i++) lots[`2026-11-${String(i % 30 + 1).padStart(2, '0')}`] = { add: [own(`d${i}`, `Day ${i}`)] };
  assert.ok(Object.keys(bsMealDaysPrune(doc(lots), '2026-11-01').days).length <= BS_OWN_DAYS);
  assert.deepEqual(Object.keys(bsMealDaysAdd(old, 'not-a-date', own('q', 'Q'), MONDAY).days), [TUESDAY], 'no date: nothing added, still pruned');
  assert.deepEqual(Object.keys(bsMealDaysRemove(old, 'x', 'y', MONDAY).days), [TUESDAY]);
});

test("a planned Shape Kitchen recipe carries its own slug, amounts and its slot's time", () => {
  assert.deepEqual(bsOwnMealOf(recipe(OATS), 'breakfast', 'k1'), {
    id: 'k1', slot: 'BREAKFAST', title: OATS, kcal: 480, p: 28, c: 58, f: 14, recipeId: OATS_SLUG, time: BS_OWN_SLOT_TIME.BREAKFAST,
  });
  assert.equal(bsOwnMealOf(recipe(BOWL), 'Elevenses', 'k2').slot, 'MEAL');
  assert.equal(bsOwnMealOf(recipe(BOWL), 'Elevenses', 'k2').time, undefined, 'a slot with no time of its own takes none');
  assert.equal(bsOwnMealOf(null, 'LUNCH', 'k3'), null);
  assert.deepEqual(BS_OWN_SLOTS, ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']);
  assert.deepEqual([bsOwnSlot('dinr'), bsOwnSlot('BFAST'), bsOwnSlot('snack'), bsOwnSlot(null)], ['DINNER', 'BREAKFAST', 'SNACK', 'MEAL']);
  assert.equal(BS_MEAL_DAYS_KIND, 'client_meal_days');
});

// ── The shared rule ─────────────────────────────────────────────────────────────────────────────

test("a day's meals: the plan's, then the member's own, and that day's swap over both", () => {
  const byDow = bsPlanByDow([{ dow: 0, meals: [
    { slot: 'BREAKFAST', title: OATS, kcal: 480 },
    { slot: 'LUNCH', title: 'Lentil soup', kcal: 420, prepNightBefore: true },
    { slot: 'DINNER', title: 'Chickpea shakshuka', kcal: 430 },
  ] }]);
  const mine = doc({ [MONDAY]: {
    add: [own('a1', OATS, 'SNACK', { recipeId: OATS_SLUG, kcal: 300 }), own('a2', 'Lentil soup', 'DINNER')],
    swap: { 'live-0-2': { title: BOWL, recipeId: 'greek-yogurt-power-bowl', kcal: 480 } },
  } });
  const meals = bsPlanMealsOn(byDow, MONDAY, { 'Lentil soup': { title: 'Tomato soup', kcal: 300 } }, mine);
  assert.deepEqual(meals.map((m) => [m.mealId, m.title, m.slug, m.nightBefore, m.kcal]), [
    ['live-0-0', OATS, OATS_SLUG, false, 480],
    // The title swap replaced the nutritionist's soup, and the tick went with it.
    ['live-0-1', 'Tomato soup', 'tomato-soup', false, 300],
    // That day's swap, by meal id, over the plan's dinner.
    ['live-0-2', BOWL, 'greek-yogurt-power-bowl', false, 480],
    // The member's own: matched by recipe id, and no title swap touches them.
    ['own-a1', OATS, OATS_SLUG, false, 300],
    ['own-a2', 'Lentil soup', 'lentil-soup', false, 480],
  ]);
  assert.equal(meals[3].own, true);
  assert.equal(meals[2].daySwap, true);
  // Unswapped, the tick stands.
  assert.equal(bsPlanMealsOn(byDow, MONDAY, {}, {})[1].nightBefore, true);
  // Another date's own meals and swaps are not this date's.
  assert.equal(bsPlanMealsOn(byDow, '2026-10-12', {}, mine).length, 3);
  // A day swap over a member's own meal.
  const swappedOwn = bsPlanMealsOn(bsPlanByDow([]), MONDAY, {}, doc({ [MONDAY]: { add: [own('a1', OATS, 'BREAKFAST', { recipeId: OATS_SLUG })], swap: { 'own-a1': { title: BOWL } } } }));
  assert.deepEqual(swappedOwn.map((m) => [m.mealId, m.slug]), [['own-a1', 'greek-yogurt-power-bowl']]);
});

test('what needs the night before: a catalog recipe with its keep, a ticked meal for one day, nothing else', () => {
  assert.deepEqual(bsMakeAheadInfo({ slug: OATS_SLUG, title: OATS }, INDEX), { slug: OATS_SLUG, title: OATS, keeps: 3, catalog: true });
  assert.deepEqual(bsMakeAheadInfo({ slug: 'lentil-soup', title: 'Lentil soup', nightBefore: true }, INDEX), { slug: 'lentil-soup', title: 'Lentil soup', keeps: 1, catalog: false });
  assert.equal(bsMakeAheadInfo({ slug: 'lentil-soup', title: 'Lentil soup' }, INDEX), null);
  assert.equal(bsMakeAheadInfo({ slug: 'lentil-soup', title: 'Lentil soup', nightBefore: 'yes' }, INDEX), null, 'only a real tick');
  assert.equal(bsMakeAheadInfo({ slug: '', nightBefore: true }, INDEX), null);
  assert.equal(bsMakeAheadInfo(null, INDEX), null);
  // The ticked meal wins only when the catalog does not know the dish.
  assert.equal(bsMakeAheadInfo({ slug: OATS_SLUG, title: OATS, nightBefore: true }, INDEX).keeps, 3);
});

test("a nutritionist's tick on a dish they typed is owed a reminder each evening, and a prep covers it", () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, meals: [{ slot: 'LUNCH', title: 'Lentil soup', prepNightBefore: true }, { slot: 'DINNER', title: 'Chickpea shakshuka' }] }));
  const sunday = due({ days: week });
  assert.equal(sunday.length, 1);
  assert.deepEqual(dates(sunday), [MONDAY], 'one day: a typed dish says nothing of how long it keeps');
  assert.equal(sunday[0].catalog, false);
  assert.equal(bsPrepRouteFor(sunday[0]), 'eat', 'no catalog method to open: the reminder opens Eat');
  assert.deepEqual(bsPrepReminderText(sunday), { title: 'Prep tonight: Lentil soup', body: "For tomorrow's lunch. Make it tonight so it is ready." });
  assert.deepEqual(bsPrepReminderCopy(sunday).title, ['prep.one.title', { recipe: 'Lentil soup' }]);
  // Recorded from the card, Monday is covered; Monday evening owes Tuesday.
  const records = bsPrepRecordsFor(sunday[0], at(SUNDAY, 20));
  assert.deepEqual(due({ days: week, entries: records, now: at(SUNDAY, 21) }), []);
  assert.deepEqual(dates(due({ days: week, entries: records, today: MONDAY, now: at(MONDAY) })), [TUESDAY]);
  // Untick it (or the member swaps it, for good or for the day) and nothing is owed.
  assert.deepEqual(due({ days: week.map((d) => ({ ...d, meals: [{ slot: 'LUNCH', title: 'Lentil soup' }] })) }), []);
  assert.deepEqual(due({ days: week, swaps: { 'Lentil soup': { title: 'Tomato soup' } } }), []);
  assert.deepEqual(due({ days: week, mine: doc({ [MONDAY]: { swap: { 'live-0-0': { title: 'Lentil soup' } } } }) }), [], 'a day swap to the same name is still a swap: the tick went with the plan\'s dish');
});

test('a member with no plan who planned the oats for tomorrow is owed the reminder, over the days one prep keeps', () => {
  const mine = doc({
    [MONDAY]: { add: [own('a1', OATS, 'BREAKFAST', { recipeId: OATS_SLUG })] },
    [TUESDAY]: { add: [own('a2', OATS, 'BREAKFAST', { recipeId: OATS_SLUG })] },
  });
  const groups = due({ mine });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].catalog, true);
  assert.equal(bsPrepRouteFor(groups[0]), `prep:${OATS_SLUG}`);
  assert.deepEqual(groups[0].meals.map((m) => [m.date, m.mealId]), [[MONDAY, 'own-a1'], [TUESDAY, 'own-a2']], 'one evening, two jars');
  assert.deepEqual(bsPrepReminderText(groups), { title: `Prep tonight: ${OATS}`, body: 'Make 2 tonight, for breakfast on Mon and Tue.' });
  // A planned meal is matched by its recipe id, whatever its own title says.
  const renamed = due({ mine: doc({ [MONDAY]: { add: [own('r1', 'My jar of oats', 'BREAKFAST', { recipeId: OATS_SLUG })] } }) });
  assert.deepEqual(renamed.map((g) => [g.slug, g.meals[0].mealId]), [[OATS_SLUG, 'own-r1']]);
  // Saturday names nothing: the member planned nothing for Sunday.
  assert.deepEqual(due({ mine, today: '2026-10-03', now: at('2026-10-03') }), []);
  // Swapped away for the day: owed nothing.
  const swapped = doc({ [MONDAY]: { add: [own('a1', OATS, 'BREAKFAST', { recipeId: OATS_SLUG })], swap: { 'own-a1': { title: BOWL } } } });
  assert.deepEqual(due({ mine: swapped }), []);
  // A plan's oats and the member's own on the same morning are one batch.
  const plan = [{ dow: 0, meals: [{ slot: 'BREAKFAST', title: OATS }] }];
  const both = due({ days: plan, mine: doc({ [MONDAY]: { add: [own('a1', OATS, 'SNACK', { recipeId: OATS_SLUG })] } }) });
  assert.deepEqual(both[0].meals.map((m) => m.mealId), ['live-0-0', 'own-a1']);
  // A record for the member's own meal covers it on its day.
  const rec = bsPrepRecordsFor(groups[0], at(SUNDAY, 20));
  assert.deepEqual(rec.map((r) => [r.mealId, r.forDate]), [['own-a1', MONDAY], ['own-a2', TUESDAY]]);
  assert.equal(bsPrepCovers(rec, groups[0].meals[1], 3, dayOf, at(MONDAY)), true);
  assert.deepEqual(due({ mine, entries: rec, now: at(SUNDAY, 21) }), []);
});

test('the hour the member chose: one of the offered hours, else 7 pm', () => {
  assert.equal(BS_PREP_HOUR, 19);
  assert.equal(BS_PREP_REMINDER_KIND, 'meal_prep_reminder');
  assert.deepEqual(BS_PREP_HOURS, [15, 16, 17, 18, 19, 20, 21, 22, 23]);
  assert.equal(bsPrepHourOf({ hour: 21 }), 21);
  assert.equal(bsPrepHourOf({ hour: 15 }), 15);
  assert.equal(bsPrepHourOf({ hour: 23 }), 23);
  for (const bad of [{ hour: 4 }, { hour: 14 }, { hour: 24 }, { hour: '21' }, { hour: 20.5 }, {}, null, undefined, 'x']) assert.equal(bsPrepHourOf(bad), 19, JSON.stringify(bad));
});

test("the morning swap: a quick recipe that needs no night before and fits the slot; the oats' is the yogurt bowl", () => {
  const swap = (meal) => bsMorningSwapFor(meal, SHAPE_KITCHEN_RECIPES, INDEX);
  const oats = swap({ slug: OATS_SLUG, slot: 'BREAKFAST', title: OATS });
  assert.equal(oats.title, BOWL);
  assert.equal(bsRecipeMinutes(oats.time), 5);
  // The meal's own kcal leads; a breakfast is always a breakfast.
  assert.equal(swap({ slug: OATS_SLUG, slot: 'BFAST', kcal: 440 }).title, 'Smoked salmon and avocado toast');
  assert.ok(swap({ slug: 'x', slot: 'BREAKFAST', kcal: 300 }).tags.includes('Breakfast'));
  // A snack for a snack, a main for anything else; never itself, never a made-ahead or chilled one.
  assert.ok(swap({ slug: 'x', slot: 'SNACK', kcal: 200 }).tags.includes('Snack'));
  for (const slot of ['LUNCH', 'DINNER', 'MEAL']) {
    const r = swap({ slug: 'lentil-soup', slot, kcal: 450 });
    assert.ok(r && !r.tags.some((x) => ['Breakfast', 'Brunch', 'Snack', 'Side'].includes(x)), slot);
    assert.ok(bsRecipeMinutes(r.time) <= BS_MORNING_SWAP_MAX_MIN);
    assert.ok(!r.prep);
  }
  assert.notEqual(swap({ slug: 'greek-yogurt-power-bowl', slot: 'BREAKFAST', kcal: 480 }).title, BOWL, 'not the meal itself');
  // Nothing that fits: no offer.
  assert.equal(bsMorningSwapFor({ slug: OATS_SLUG, slot: 'BREAKFAST' }, [recipe(OATS)], INDEX), null, 'the only breakfast is made ahead');
  assert.equal(bsMorningSwapFor({ slug: OATS_SLUG, slot: 'BREAKFAST' }, [{ ...recipe(BOWL), time: '20 min' }], INDEX), null, 'too slow for a morning');
  assert.equal(bsMorningSwapFor({ slug: OATS_SLUG, slot: 'BREAKFAST' }, [{ ...recipe(BOWL), prep: 'overnight chill' }], INDEX), null, 'a chilled dish is no swap');
  assert.equal(bsMorningSwapFor({ slug: OATS_SLUG, slot: 'BREAKFAST' }, [{ ...recipe(BOWL), time: '' }], INDEX), null, 'no stated time, no promise');
  assert.equal(bsMorningSwapFor(null, SHAPE_KITCHEN_RECIPES, INDEX), null);
  // Ties: the same diet, then the quickest, then the title.
  const tie = [
    { title: 'B dish', time: '10 min', kcal: 400, diet: 'Seafood', tags: ['Breakfast'] },
    { title: 'A dish', time: '10 min', kcal: 400, diet: 'Vegetarian', tags: ['Breakfast'] },
    { title: 'C dish', time: '5 min', kcal: 400, diet: 'Seafood', tags: ['Breakfast'] },
    { title: 'Base', time: '5 min', kcal: 400, diet: 'Vegetarian', tags: ['Breakfast'], prep: 'overnight' },
  ];
  assert.equal(bsMorningSwapFor({ slug: 'base', slot: 'BREAKFAST', kcal: 400 }, tie, new Map()).title, 'A dish');
  assert.equal(bsMorningSwapFor({ slug: 'nothing', slot: 'BREAKFAST', kcal: 400 }, tie, new Map()).title, 'C dish');
  assert.equal(bsMorningSwapFor({ slug: 'nothing', slot: 'BREAKFAST' }, tie.slice(0, 2), new Map()).title, 'A dish');
});

test('recipe minutes and the name a plan line gives a meal', () => {
  assert.equal(bsRecipeMinutes('5 min'), 5);
  assert.equal(bsRecipeMinutes('1 hr 5 min'), 65);
  assert.equal(bsRecipeMinutes('2 hr'), 120);
  assert.equal(bsRecipeMinutes(''), null);
  assert.equal(bsMealNameCore(`${OATS} · 480 kcal`), OATS);
  assert.equal(bsMealNameCore(`${OATS} 480 kcal`), OATS);
  assert.equal(bsMealNameCore(`${OATS} — 480 KCAL`), OATS);
  assert.equal(bsMealNameCore(OATS), OATS);
  assert.equal(bsMadeAheadByName(`${OATS} · 480 kcal`, INDEX).slug, OATS_SLUG);
  assert.equal(bsMadeAheadByName(BOWL, INDEX), null);
  assert.equal(bsMadeAheadByName('', INDEX), null);
});
