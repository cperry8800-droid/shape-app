// The nutritionist's playlists, end to end: what the website's meal-plan builder publishes is what the
// member's Eat page labels "For Sun · Batch prep" (owner, 2026-11-10: "let nutritionists link a playlist
// to a meal or prep day in the builder, carry it through the plan, and show "For Sun prep" labels on
// Eat's playlists").
//
// The chain, each link real code:
//   1. DashMeals.buildMealAssignment (public/newdesign/dashMealCore.js) writes `days[d].playlist` and
//      `days[d].meals[j].playlist` into the payload the nutritionist's publish stores;
//   2. /api/client/plan hands `payload.days` to the app as they are (tests/eat-plan.test.mjs pins it);
//   3. the app lays them out by weekday (bsPlanByDow, prepAhead.mjs) and buildMealProgram maps each
//      playlist through bsPlaylistOf, on the day and on each meal (both lines pinned in
//      tests/eat-plan.test.mjs, since the 38k-line client has no seam to mount it here);
//   4. bsEatPlaylistCards (bsTrainPlaylists.mjs) matches the member's list to those days and meals.
// This runs 1, 3 and 4 on one plan, so a renamed key on either side fails here, not on a member's phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const DashMeals = require_('../public/newdesign/dashMealCore.js');
const { bsPlanByDow } = await import('../mobile-app/src/services/prepAhead.mjs');
const { bsPlaylistOf, bsEatPlaylistCards } = await import('../mobile-app/src/broadsheet/bsTrainPlaylists.mjs');

const BATCH = { id: '6f1c0a52-0d3e-4c55-9a43-0c4f2b9d1e01', name: 'Batch prep', meta: '12 tracks' };
const BEATS = { id: '6f1c0a52-0d3e-4c55-9a43-0c4f2b9d1e02', name: 'Breakfast beats', meta: '4 tracks' };
let n = 0;
const dish = (name, slot, extra = {}) => ({ ...DashMeals.newMeal({ name, kcal: 500, p: 30, c: 50, f: 12, ingredients: [] }, slot), id: 'c' + (++n), ...extra });

// Two plan days in rotation: "Prep day" (Mon, Wed, Fri, Sun) carries the day's playlist; "Day B"
// (Tue, Thu, Sat) carries none, but its breakfast has its own.
function plan() {
  const doc = DashMeals.newPlan('Prep week', 'cut');
  doc.days = [
    { name: 'Prep day', playlist: { ...BATCH }, slots: [dish('Chicken bowl', 'Lunch')], variants: {} },
    { name: 'Day B', slots: [dish('Oats', 'Breakfast', { playlist: { ...BEATS } }), dish('Tofu rice', 'Lunch')], variants: {} },
  ];
  return doc;
}

// The app's Eat week, as buildMealProgram builds it: laid out by weekday, the title as its headline,
// each playlist through bsPlaylistOf.
const eatWeek = (days) => bsPlanByDow(days).map((dy) => (!dy ? { headline: 'Open day', meals: [], playlist: null } : {
  headline: dy.title,
  playlist: bsPlaylistOf(dy.playlist),
  meals: (Array.isArray(dy.meals) ? dy.meals : []).map((m) => ({ title: m.title, playlist: bsPlaylistOf(m.playlist) })),
}));

test('a prep day\'s playlist the builder publishes is the card Eat labels with its days, soonest first', () => {
  const sent = DashMeals.buildMealAssignment(plan(), { trainingDows: [0, 2, 4] });
  // What the member's app reads is JSON, as the route sends it.
  const week = eatWeek(JSON.parse(JSON.stringify(sent.days)));
  // The member's list carries the playlist the nutritionist sent them, by its saved id.
  const items = [{ id: BATCH.id, title: 'Batch prep', meta: '12 tracks' }];
  const todayIdx = 5; // Saturday
  const cards = bsEatPlaylistCards(items, week, todayIdx);
  const batch = cards.find((c) => c.id === BATCH.id);
  assert.ok(batch, 'the list\'s card is there');
  assert.deepEqual(batch.uses.map((u) => u.idx), [6, 0, 2, 4], 'Sunday first from a Saturday, then Mon, Wed, Fri');
  assert.equal(batch.uses.every((u) => u.title.startsWith('Prep day')), true, 'each use names the plan day');
  // Soonest first: Saturday's breakfast playlist (unsent, so a card of its own) plays today and leads;
  // the prep day's plays tomorrow and comes next.
  assert.deepEqual(cards.map((c) => c.title), ['Breakfast beats', 'Batch prep']);
  assert.equal(cards[1] === batch, true);
});

test('a meal\'s playlist the member\'s list lacks gets its own card, on the meal it plays with', () => {
  const sent = DashMeals.buildMealAssignment(plan(), { trainingDows: [0, 2, 4] });
  const week = eatWeek(JSON.parse(JSON.stringify(sent.days)));
  const cards = bsEatPlaylistCards([], week, 0);
  const beats = cards.find((c) => c.title === 'Breakfast beats');
  assert.ok(beats, 'an unsent meal playlist still has a card');
  assert.equal(beats.onlyOnDay, true, 'drawn bare: the plan carries no service or link');
  assert.deepEqual(beats.uses.map((u) => [u.idx, u.title]), [[1, 'Oats'], [3, 'Oats'], [5, 'Oats']]);
  // The day's playlist is a card of its own too, and the two are never merged.
  const batch = cards.find((c) => c.title === 'Batch prep');
  assert.ok(batch && batch !== beats);
});

test('a plan with no playlist gives Eat no playlist card', () => {
  const doc = plan();
  delete doc.days[0].playlist;
  delete doc.days[1].slots[0].playlist;
  const sent = DashMeals.buildMealAssignment(doc, { trainingDows: [0, 2, 4] });
  assert.equal(JSON.stringify(sent).includes('"playlist"'), false);
  assert.deepEqual(bsEatPlaylistCards([], eatWeek(sent.days), 0), []);
});
