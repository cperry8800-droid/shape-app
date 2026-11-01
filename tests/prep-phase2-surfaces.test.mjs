// Night-before prep, Phase 2, on the website (2026-11-01): the nutritionist meal builder's "Prep the
// night before" tick and its Shape-recipe mark (public/newdesign/dashMealCore.js, dashMealBuilder.jsx),
// the assignment that carries it into the client's plan, and the reminder time beside the Prep
// reminders switch in the member's settings (clientMeSettings.jsx). The pages are not modules, so the
// copies they keep of the app's rule (prepAhead.mjs) are held to it here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { BS_PREP_HOUR, BS_PREP_HOURS, BS_PREP_REMINDER_KIND, bsMakeAheadIndex, bsPlanByDow, bsPlanMealsOn, bsMakeAheadInfo } from '../mobile-app/src/services/prepAhead.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); globalThis.React = React;
const { createRoot } = require('react-dom/client');
const DashMeals = require('../public/newdesign/dashMealCore.js');
globalThis.DashMeals = DashMeals;
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { DmbMealRow } = await loadRealModule(nd('dashMealBuilder.jsx'), { appendExports: 'export { DmbMealRow };' });
// The settings page's chrome, as plain elements.
globalThis.TEAL_BRIGHT = '#2ee0c4'; globalThis.INK = '#f2ede4';
globalThis.Card = ({ children }) => React.createElement('section', null, children);
globalThis.SectionTitle = ({ children }) => React.createElement('h2', null, children);
const SETTINGS = await loadRealModule(nd('clientMeSettings.jsx'), { appendExports: 'export { NotificationDashboard, NP_PREP_HOURS, NP_PREP_KIND, NP_PREP_DEFAULT, npPrepHourOf };' });

const INDEX = bsMakeAheadIndex(SHAPE_KITCHEN_RECIPES);
let root = null;
async function mount(el) {
  if (root) await React.act(async () => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  for (let i = 0; i < 4; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

test("the builder's copies are the app's: the Shape recipes that need the night before, and the reminder hours", () => {
  assert.deepEqual(DashMeals.MADE_AHEAD_RECIPES, [...INDEX.values()].map((r) => r.title));
  assert.deepEqual(DashMeals.NIGHT_BEFORE_FOODS.map((id) => DashMeals.FOODS.find((f) => f.id === id).name), ['Overnight oats']);
  assert.deepEqual(SETTINGS.NP_PREP_HOURS, [...BS_PREP_HOURS]);
  assert.equal(SETTINGS.NP_PREP_KIND, BS_PREP_REMINDER_KIND);
  assert.equal(SETTINGS.NP_PREP_DEFAULT, BS_PREP_HOUR);
  assert.equal(SETTINGS.npPrepHourOf({ hour: 21 }), 21);
  assert.equal(SETTINGS.npPrepHourOf({ hour: 4 }), 19);
  assert.equal(SETTINGS.npPrepHourOf(null), 19);
});

test('a meal is prepped the night before when ticked, or when it is a Shape dish that always is', () => {
  assert.equal(DashMeals.shapeMadeAhead('Overnight oats'), true, 'the library oats');
  assert.equal(DashMeals.shapeMadeAhead('Overnight oats, three ways'), true, 'the Shape Kitchen oats');
  assert.equal(DashMeals.shapeMadeAhead('overnight OATS'), true);
  assert.equal(DashMeals.shapeMadeAhead('Greek yogurt (250 g)'), false);
  assert.equal(DashMeals.shapeMadeAhead(''), false);
  const soup = { id: 'm1', slot: 'Lunch', name: 'Lentil soup', kcal: 420, p: 24, c: 50, f: 9, ingredients: [], swaps: [] };
  assert.equal(DashMeals.madeAheadMeal(soup), false);
  const ticked = DashMeals.setNightBefore(soup, true);
  assert.equal(ticked.prepNightBefore, true);
  assert.equal(soup.prepNightBefore, undefined, 'a copy, never the meal itself');
  assert.equal(DashMeals.madeAheadMeal(ticked), true);
  assert.equal('prepNightBefore' in DashMeals.setNightBefore(ticked, false), false, 'cleared, it leaves no key');
});

test("the assignment carries the tick into the client's plan, where the app's rule owes the reminder", () => {
  const oats = DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === 'f2'), 'Breakfast');
  const soup = DashMeals.setNightBefore({ ...DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === 'f5'), 'Lunch'), name: 'Lentil soup' }, true);
  const dinner = DashMeals.newMeal(DashMeals.FOODS.find((f) => f.id === 'f6'), 'Dinner');
  const plan = { ...DashMeals.newPlan('Week', 'maintain') };
  plan.days = [{ name: 'Day A', slots: [oats, soup, dinner], variants: {} }];
  const { days } = DashMeals.buildMealAssignment(plan, { scale: 1 });
  const monday = days[0].meals;
  assert.deepEqual(monday.map((m) => [m.title, m.prepNightBefore]), [['Overnight oats', true], ['Lentil soup', true], ['Salmon, rice & greens', undefined]]);
  assert.equal('prepNightBefore' in monday[2], false, 'a meal that needs no night before is published exactly as before');
  // The app reads it: both are owed the night before, the dinner is not.
  const meals = bsPlanMealsOn(bsPlanByDow(days), '2026-10-05', {}, {});
  assert.deepEqual(meals.map((m) => !!bsMakeAheadInfo(m, INDEX)), [true, true, false]);
});

test('the builder row: a tick on any meal, and the Shape oats marked instead of ticked', async () => {
  const changes = [];
  const soup = { id: 'm1', slot: 'Lunch', name: 'Lentil soup', kcal: 420, p: 24, c: 50, f: 9, ingredients: [], swaps: [] };
  await mount(React.createElement(DmbMealRow, { meal: soup, onChange: (m) => changes.push(m), onRemove() {}, constraints: {}, customFoods: [] }));
  const box = document.querySelector('input[type="checkbox"]');
  assert.ok(box, 'the tick');
  assert.equal(box.getAttribute('aria-label'), 'Prep Lentil soup the night before');
  assert.equal(box.checked, false);
  assert.match(document.querySelector('[data-night-before="tick"]').textContent, /Prep the night before/);
  await React.act(async () => { box.click(); });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].prepNightBefore, true);
  assert.equal(changes[0].id, 'm1');
  await mount(React.createElement(DmbMealRow, { meal: { ...soup, prepNightBefore: true }, onChange: (m) => changes.push(m), onRemove() {}, constraints: {}, customFoods: [] }));
  const on = document.querySelector('input[type="checkbox"]');
  assert.equal(on.checked, true);
  await React.act(async () => { on.click(); });
  assert.equal('prepNightBefore' in changes[1], false);
  await mount(React.createElement(DmbMealRow, { meal: { ...soup, name: 'Overnight oats' }, onChange() {}, onRemove() {}, constraints: {}, customFoods: [] }));
  assert.equal(document.querySelector('input[type="checkbox"]'), null, 'nothing to tick: it always is');
  assert.match(document.querySelector('[data-night-before="shape"]').textContent, /Prepped the night before · Shape recipe/);
});

// A Supabase client for the settings page: the notification center, and user_goals for the hour.
function fakeClient({ hourDoc = undefined, hourFails = false, upsertFails = false } = {}) {
  const writes = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'member-1' } } }) },
    rpc: async () => ({ data: { settings: { quiet_start: 22, quiet_end: 7 }, prefs: [], reminders: [] }, error: null }),
    from(table) {
      const chain = {
        select() { return chain; }, eq() { return chain; },
        maybeSingle: async () => (hourFails ? { data: null, error: { message: 'no' } } : { data: hourDoc === undefined ? null : { data: hourDoc }, error: null }),
        upsert(row, opts) { writes.push([table, row, opts]); return Promise.resolve(upsertFails ? { error: { message: 'no' } } : { error: null }); },
        delete() { return chain; },
        update() { return chain; },
      };
      return chain;
    },
  };
  window.shapeDb = { client };
  return writes;
}

test("the website's settings: the reminder time under Prep reminders, 7 pm until chosen, saved to the member's document", async () => {
  const writes = fakeClient();
  await mount(React.createElement(SETTINGS.NotificationDashboard, { signedIn: true }));
  const row = document.querySelector('[data-prep-hour]');
  assert.ok(row, 'the row is drawn');
  assert.match(row.previousElementSibling.textContent, /Prep reminders/, 'right under the Prep reminders switch');
  const select = row.querySelector('select');
  assert.equal(select.value, '19');
  assert.deepEqual([...select.options].map((o) => [o.value, o.textContent]), [['15', '3 PM'], ['16', '4 PM'], ['17', '5 PM'], ['18', '6 PM'], ['19', '7 PM'], ['20', '8 PM'], ['21', '9 PM'], ['22', '10 PM'], ['23', '11 PM']]);
  assert.match(row.textContent, /The evening before, in your time zone/);
  await React.act(async () => {
    select.value = '22';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.deepEqual(writes.at(-1), ['user_goals', { user_id: 'member-1', kind: 'meal_prep_reminder', data: { hour: 22 } }, { onConflict: 'user_id,kind' }]);
  assert.match(document.querySelector('[data-prep-hour]').textContent, /In your quiet hours: it lands in the app, with no push/);
  // A chosen hour reads back as chosen.
  fakeClient({ hourDoc: { hour: 21 } });
  await mount(React.createElement(SETTINGS.NotificationDashboard, { signedIn: true }));
  assert.equal(document.querySelector('[data-prep-hour] select').value, '21');
  // A read that fails draws no row, rather than 7 pm to a member who chose 9.
  fakeClient({ hourFails: true });
  await mount(React.createElement(SETTINGS.NotificationDashboard, { signedIn: true }));
  assert.equal(document.querySelector('[data-prep-hour]'), null);
  assert.ok(document.body.textContent.includes('Prep reminders'), 'the switch itself still is');
  await React.act(async () => root.unmount());
  root = null;
});
