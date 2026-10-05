// Night-before prep (owner, 2026-10-04 and 2026-10-05): which planned meals need prepping
// tonight. One rule, shared by the server's 7 pm reminder and the app's Eat card
// (mobile-app/src/services/prepAhead.mjs), so the two cannot disagree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import {
  bsMakeAheadIndex, bsPlanByDow, bsPlanMealsOn, bsPrepCovers, bsPrepDueTonight, bsPrepRecordsFor,
  bsPrepReminderText, bsPrepRoute, bsYmdAdd, bsYmdDow, bsYmdIn,
} from '../mobile-app/src/services/prepAhead.mjs';

const OATS = 'Overnight oats, three ways';
const INDEX = bsMakeAheadIndex(SHAPE_KITCHEN_RECIPES);
const dayOf = (ms) => bsYmdIn(ms, 'UTC');
const SUNDAY = '2026-10-04';
const at = (ymd, hour = 19) => Date.parse(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);
// A week where breakfast is the oats every day and dinner is something cooked on the night.
const day = (dow, breakfast = OATS) => ({ dow, meals: [
  { slot: 'BREAKFAST', title: breakfast, kcal: 480 },
  { slot: 'DINNER', title: 'Chickpea shakshuka', kcal: 430 },
] });
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d));
const due = (over = {}) => bsPrepDueTonight({
  days: WEEK, swaps: {}, entries: [], reminded: [], today: SUNDAY, index: INDEX, dayOf, now: at(SUNDAY), ...over,
});
const dates = (groups) => groups.flatMap((g) => g.meals.map((m) => m.date));

test('only a recipe with steps left for later is owed a reminder, and the oats keep 3 days', () => {
  assert.deepEqual([...INDEX.values()], [{ slug: 'overnight-oats-three-ways', title: OATS, keeps: 3 }]);
  // The batido's "refrigerate up to 4 hours" is marked too, but nothing follows it.
  assert.ok(SHAPE_KITCHEN_RECIPES.some((r) => r.title === 'Papaya banana batido'));
  assert.equal(INDEX.has('papaya-banana-batido'), false);
});

test('the date helpers count the plan week from Monday', () => {
  assert.equal(bsYmdDow(SUNDAY), 6);
  assert.equal(bsYmdDow('2026-10-05'), 0);
  assert.equal(bsYmdAdd('2026-12-31', 1), '2027-01-01');
  assert.equal(bsYmdAdd('2026-03-01', -1), '2026-02-28');
  assert.equal(bsYmdIn(Date.parse('2026-10-05T02:00:00Z'), 'America/Los_Angeles'), SUNDAY);
  assert.equal(bsYmdIn(Date.parse('2026-10-05T02:00:00Z'), 'Not/AZone'), '2026-10-05', 'a bad zone reads as UTC');
});

test('a plan is laid out by weekday the way Eat lays it out', () => {
  const byDow = bsPlanByDow([{ dow: 2, meals: [] }, { meals: [{ title: 'a' }] }, null, { dow: 2, meals: [{ title: 'b' }] }, { dow: 9, meals: [] }]);
  assert.equal(byDow[2].meals.length, 0, 'the first day with a weekday keeps it');
  assert.equal(byDow[0].meals[0].title, 'a', 'a day without one fills the first empty weekday');
  assert.equal(byDow[1].meals[0].title, 'b', 'a repeated weekday fills the next empty one');
  assert.equal(byDow[3].meals.length, 0, 'an out-of-range weekday fills the next empty one');
  assert.equal(byDow[4], null);
  assert.deepEqual(bsPlanByDow(undefined), [null, null, null, null, null, null, null]);
  // Eat builds its week from this very function, so the two cannot lay a plan out differently.
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  assert.ok(client.includes('const byDow = bsPlanByDow(days);'), 'Eat lays the week out on its own');
});

test("a day's meals carry Eat's meal id and the member's swaps", () => {
  const byDow = bsPlanByDow([{ dow: 0, meals: [{ slot: 'bfast', title: OATS }, { id: 'm-9', slot: 'LUNCH', title: 'Tuna wrap' }] }]);
  const mon = bsPlanMealsOn(byDow, '2026-10-05', {});
  assert.deepEqual(mon.map((m) => [m.mealId, m.slot, m.slug]), [
    ['live-0-0', 'BFAST', 'overnight-oats-three-ways'], ['m-9', 'LUNCH', 'tuna-wrap'],
  ]);
  // A swap is stored by the meal's own title, as Eat stores it.
  const swapped = bsPlanMealsOn(byDow, '2026-10-05', { [OATS]: { title: 'Greek yogurt power bowl' } });
  assert.equal(swapped[0].slug, 'greek-yogurt-power-bowl');
  assert.equal(swapped[0].mealId, 'live-0-0');
  // A plan meal mapped by recipeId matches its recipe whatever its own title says.
  const byId = bsPlanMealsOn(bsPlanByDow([{ dow: 0, meals: [{ title: 'Oats for the week', recipeId: 'overnight-oats-three-ways' }] }]), '2026-10-05', {});
  assert.equal(byId[0].slug, 'overnight-oats-three-ways');
  assert.deepEqual(bsPlanMealsOn(byDow, 'not-a-date', {}), []);
});

test('Sunday night: one reminder covers the three breakfasts one prep keeps', () => {
  const groups = due();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slug, 'overnight-oats-three-ways');
  assert.deepEqual(dates(groups), ['2026-10-05', '2026-10-06', '2026-10-07'], 'not Thursday: three jars keep three days');
  assert.deepEqual(groups[0].meals.map((m) => m.mealId), ['live-0-0', 'live-1-0', 'live-2-0']);
  assert.deepEqual(bsPrepReminderText(groups), { title: `Prep tonight: ${OATS}`, body: 'Make 3 tonight, for breakfast on Mon, Tue and Wed.' });
  assert.equal(bsPrepRoute(groups[0].slug), 'prep:overnight-oats-three-ways');
});

test('a day an earlier reminder named is not asked for again, and Wednesday night asks for Thursday', () => {
  const sent = due().flatMap((g) => g.meals.map((m) => `${m.date}|${m.mealId}`));
  assert.deepEqual(due({ today: '2026-10-05', now: at('2026-10-05'), reminded: sent }), [], 'Monday night re-asked for the Tuesday Sunday covered');
  assert.deepEqual(due({ today: '2026-10-06', now: at('2026-10-06'), reminded: sent }), []);
  const wed = due({ today: '2026-10-07', now: at('2026-10-07'), reminded: sent });
  assert.deepEqual(dates(wed), ['2026-10-08', '2026-10-09', '2026-10-10']);
});

test("Sunday's prep covers the days it named, and Thursday is still owed (the title rule would hide it)", () => {
  const sunday = bsPrepRecordsFor(due()[0], at(SUNDAY, 20));
  assert.deepEqual(sunday.map((e) => e.forDate), ['2026-10-05', '2026-10-06', '2026-10-07']);
  assert.ok(sunday.every((e) => e.recipeTitle === OATS && e.recipeId === 'overnight-oats-three-ways' && e.servings === 1));
  assert.deepEqual(sunday.map((e) => e.dayIdx), [0, 1, 2]);
  // With no reminder record at all (a member who prepped from the card), the prep alone says so.
  assert.deepEqual(due({ today: '2026-10-05', now: at('2026-10-05'), entries: sunday }), []);
  const wed = due({ today: '2026-10-07', now: at('2026-10-07'), entries: sunday });
  assert.deepEqual(dates(wed), ['2026-10-08', '2026-10-09', '2026-10-10'], "Sunday's jars do not cover Thursday");
});

test('a record without a date covers the meal it names for as many days as one prep keeps', () => {
  // Prep the week writes the plan meal's id and no date.
  const prepWeek = [{ mealId: 'live-1-0', recipeTitle: OATS, preppedAt: at(SUNDAY, 10) }];
  assert.deepEqual(dates(due({ entries: prepWeek })), ['2026-10-05', '2026-10-07'], 'Tuesday is covered, Monday and Wednesday are not');
  // A record made on the morning of the meal is not a night-before prep.
  const meal = { date: '2026-10-05', mealId: 'live-0-0', title: OATS };
  assert.equal(bsPrepCovers([{ mealId: 'live-0-0', preppedAt: at('2026-10-05', 7) }], meal, 3, dayOf, at('2026-10-05', 8)), false);
  // Nor is one made more days ahead than it keeps.
  assert.equal(bsPrepCovers([{ mealId: 'live-0-0', preppedAt: at('2026-10-01') }], meal, 3, dayOf, at(SUNDAY)), false);
  assert.equal(bsPrepCovers([{ mealId: 'live-0-0', preppedAt: at('2026-10-02') }], meal, 3, dayOf, at(SUNDAY)), true);
  // A record with no meal id (the recipe cooked on its own) covers by title.
  assert.equal(bsPrepCovers([{ recipeTitle: OATS, preppedAt: at(SUNDAY) }], meal, 3, dayOf, at(SUNDAY)), true);
  assert.equal(bsPrepCovers([{ recipeTitle: 'Tuna wrap', preppedAt: at(SUNDAY) }], meal, 3, dayOf, at(SUNDAY)), false);
  // A record for another meal never covers this one, whatever its title.
  assert.equal(bsPrepCovers([{ mealId: 'live-3-0', recipeTitle: OATS, preppedAt: at(SUNDAY) }], meal, 3, dayOf, at(SUNDAY)), false);
  // A dated record covers exactly its date.
  assert.equal(bsPrepCovers([{ mealId: 'live-0-0', forDate: '2026-10-12', preppedAt: at(SUNDAY) }], meal, 3, dayOf, at(SUNDAY)), false);
  // A stale one (past the 4-day freshness window) covers nothing.
  assert.equal(bsPrepCovers([{ mealId: 'live-0-0', forDate: '2026-10-05', preppedAt: at('2026-09-29') }], meal, 3, dayOf, at(SUNDAY)), false);
});

test('a swapped-out breakfast, a plan without the oats, or no plan owes nothing', () => {
  assert.deepEqual(due({ swaps: { [OATS]: { title: 'Greek yogurt power bowl' } } }), []);
  assert.deepEqual(due({ days: [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, 'Greek yogurt power bowl')) }), []);
  assert.deepEqual(due({ days: [] }), []);
  assert.deepEqual(due({ today: 'Sunday' }), []);
  // Oats only on Wednesday: Sunday owes nothing, Tuesday owes one.
  const wedOnly = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, d === 2 ? OATS : 'Greek yogurt power bowl'));
  assert.deepEqual(due({ days: wedOnly }), []);
  const tue = due({ days: wedOnly, today: '2026-10-06', now: at('2026-10-06') });
  assert.deepEqual(dates(tue), ['2026-10-07']);
  assert.deepEqual(bsPrepReminderText(tue), { title: `Prep tonight: ${OATS}`, body: "For tomorrow's breakfast. Make it tonight so it is ready." });
});

test('the reminder text names each dish when more than one is owed', () => {
  const groups = [
    { title: OATS, meals: [{ dow: 0, slot: 'BREAKFAST' }, { dow: 1, slot: 'BREAKFAST' }] },
    { title: 'Chia pudding', meals: [{ dow: 0, slot: 'SNACK' }] },
  ];
  assert.deepEqual(bsPrepReminderText(groups), { title: 'Prep tonight for tomorrow', body: `${OATS} (make 2) and Chia pudding.` });
  assert.deepEqual(bsPrepReminderText([{ title: OATS, meals: [{ dow: 0, slot: 'BREAKFAST' }, { dow: 1, slot: 'SNACK' }] }]).body, 'Make 2 tonight, for meals on Mon and Tue.');
  assert.equal(bsPrepReminderText([]), null);
});
