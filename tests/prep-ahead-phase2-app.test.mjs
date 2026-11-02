// Night-before prep, Phase 2, in the app (2026-11-01): the plan sheet (a member plans a meal for today
// or tomorrow), the morning swap card, tonight's card for a dish the nutritionist ticked, the day
// plan's reads and writes, and the reminder-time row in Settings. Mounted with React in jsdom, the
// way tests/prep-ahead-app.test.mjs mounts Phase 1. The rule itself is tests/prep-ahead-phase2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { bsMakeAheadIndex, bsYmdAdd, bsYmdIn } from '../mobile-app/src/services/prepAhead.mjs';

globalThis.BSPlate = ({ children }) => React.createElement('div', { 'data-plate': '' }, children);
const MOD = await loadBroadsheet(['BSPrepTonightCard', 'BSPlanMealSheet', 'BSMorningSwapCard', 'BSNotifyPrefs', 'BSShapeKitchenRecipe',
  'bsEatByTime', 'bsWriteMealDays', 'bsPlanRecipe', 'bsLoadPrepTonight', 'bsPlanDayChoices', 'bsSwapPickWrites', 'bsMenuPrepState', 'bsSwapSheetBase'], React);
const dom = new JSDOM('<div id="root"></div><div id="bs-phone-surface"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
// The carved-out module (BSPlanDay.jsx) reads the theme and the plate off window at call time, as in
// the app, where the chrome publishes them.
window.useBS = globalThis.useBS;
window.BSPlate = globalThis.BSPlate;
// The app's translator, with plain {name} interpolation, so the words a member reads are checked.
window.ShapeI18n = { t: (key, opts = {}) => String(opts.defaultValue ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in opts ? String(opts[k]) : m)) };

const OATS = 'Overnight oats, three ways';
const BOWL = 'Greek yogurt power bowl';
const INDEX = bsMakeAheadIndex(SHAPE_KITCHEN_RECIPES);
const recipe = (title) => SHAPE_KITCHEN_RECIPES.find((r) => r.title === title);
const TODAY = '2026-10-04';
const TOMORROW = '2026-10-05';
const DAYS = [{ ymd: TODAY, label: 'Today' }, { ymd: TOMORROW, label: 'Tomorrow' }];
const SUNDAY_EVENING = new Date(2026, 9, 4, 18).getTime();
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

async function mount(Component, props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Component, props)));
  const all = () => document.body;
  const text = () => all().textContent;
  const buttons = () => [...all().querySelectorAll('button')];
  const button = (label) => buttons().find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
  const settle = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const click = async (label) => {
    const b = button(label);
    assert.ok(b, `no "${label}" button in: ${text().slice(0, 400)}`);
    await React.act(async () => { b.click(); });
    await settle();
  };
  return { root, text, button, buttons, click, settle, unmount: () => React.act(async () => root.unmount()) };
}
function signedIn(on) { window.ShapeAuth = { getCachedState: () => ({ user: on ? { id: 'member-1' } : null }) }; }
// A user_goals store for the app's window.shapeDb: `fail` makes reads or saves fail. The day plan is
// written compare-and-set and bound to the account (shapeBackend.js saveUserGoalsIfRev), so the store
// has both, as the backend does: a write whose revision moved on is a conflict.
function goalsStore(initial = {}, { readFails = false, saveFails = false } = {}) {
  const docs = { ...initial };
  const saves = [];
  const me = () => (window.ShapeAuth && window.ShapeAuth.getCachedState().user) || null;
  window.shapeDb = {
    getUser: async () => me(),
    getUserGoals: async (kind, opts) => (readFails || (opts && opts.expectedUserId != null && (!me() || me().id !== opts.expectedUserId)) ? null : (docs[kind] || {})),
    saveUserGoals: async (kind, data) => { saves.push([kind, data]); if (saveFails) return { error: { message: 'no' } }; docs[kind] = data; return { ok: true }; },
    saveUserGoalsIfRev: async (kind, data, rev, uid) => {
      saves.push([kind, data]);
      if (saveFails) return { error: { message: 'no' } };
      if (!me() || me().id !== uid) return { accountChanged: true, error: { message: 'Account changed' } };
      const cur = docs[kind] && docs[kind].rev != null ? String(docs[kind].rev) : null;
      if (cur !== rev) return { conflict: true };
      docs[kind] = data;
      return { ok: true };
    },
  };
  return { docs, saves };
}

test('the plan sheet: tomorrow first, the slot\'s recipes, the night-before mark, and a tap plans it', async () => {
  const added = [];
  const s = await mount(MOD.BSPlanMealSheet, {
    recipes: SHAPE_KITCHEN_RECIPES, index: INDEX, days: DAYS,
    plannedOn: () => [], onAdd: async (...a) => { added.push(a); return true; }, onRemove: async () => true, onClose() {},
  });
  try {
    assert.match(s.text(), /Plan a meal/);
    assert.match(s.text(), /What are you having\?/);
    assert.equal(s.button('Tomorrow').getAttribute('aria-pressed'), 'true', 'tomorrow is the day it opens on');
    assert.equal(s.button('Breakfast').getAttribute('aria-pressed'), 'true');
    // Breakfasts only, and the oats say they need the night before.
    const oats = s.buttons().find((b) => b.textContent.startsWith(OATS));
    assert.ok(oats, 'the oats are a breakfast');
    assert.match(oats.textContent, /Prep the night before/);
    assert.match(oats.textContent, /5 min · 480 kcal/);
    assert.ok(!s.buttons().some((b) => b.textContent.startsWith('Beef ragu rigatoni')), 'a main is not a breakfast');
    const bowl = s.buttons().find((b) => b.textContent.startsWith(BOWL));
    assert.doesNotMatch(bowl.textContent, /Prep the night before/, 'the night before is optional for the bowl: no mark');
    await React.act(async () => { oats.click(); });
    await s.settle();
    assert.deepEqual(added.map(([ymd, slot, r]) => [ymd, slot, r.title]), [[TOMORROW, 'BREAKFAST', OATS]]);
    // Dinner lists mains; the search narrows any slot by name.
    await s.click('Dinner');
    assert.ok(s.buttons().some((b) => b.textContent.startsWith('Beef ragu rigatoni')));
    // Typed into through the field's own onChange: react-dom loaded before jsdom's window, so a
    // synthetic input event does not reach it here.
    const search = document.querySelector('input[aria-label="Search recipes"]');
    const props = search[Object.keys(search).find((k) => k.startsWith('__reactProps$'))];
    await React.act(async () => { props.onChange({ target: { value: 'oats' } }); });
    assert.ok(s.buttons().some((b) => b.textContent.startsWith(OATS)), 'a search finds a dish whatever its slot');
    assert.ok(!s.buttons().some((b) => b.textContent.startsWith('Beef ragu rigatoni')), 'a search for oats lists no ragu');
    await s.click('Today');
    await React.act(async () => { s.buttons().find((b) => b.textContent.startsWith(OATS)).click(); });
    await s.settle();
    assert.deepEqual(added[1].slice(0, 2), [TODAY, 'DINNER']);
  } finally { await s.unmount(); }
});

test('the plan sheet lists what is planned that day, unplans it, and says when a save failed', async () => {
  const removed = [];
  const planned = { [TOMORROW]: [{ id: 'a1', slot: 'BREAKFAST', title: OATS }] };
  const s = await mount(MOD.BSPlanMealSheet, {
    recipes: SHAPE_KITCHEN_RECIPES, index: INDEX, days: DAYS,
    plannedOn: (ymd) => planned[ymd] || [], onAdd: async () => false, onRemove: async (...a) => { removed.push(a); return true; }, onClose() {},
  });
  try {
    assert.match(s.text(), /Planned for Tomorrow/);
    await s.click(`Remove ${OATS}`);
    assert.deepEqual(removed, [[TOMORROW, 'a1']]);
    await s.click('Today');
    assert.doesNotMatch(s.text(), /Planned for Today/, 'nothing planned today');
    await React.act(async () => { s.buttons().find((b) => b.textContent.startsWith(BOWL)).click(); });
    await s.settle();
    assert.match(s.text(), /That was not saved\. Try again\./);
  } finally { await s.unmount(); }
});

test('from a recipe\'s page the sheet plans that recipe, into its own slot, and closes', async () => {
  const added = [];
  let closed = 0;
  const s = await mount(MOD.BSPlanMealSheet, {
    recipes: SHAPE_KITCHEN_RECIPES, index: INDEX, recipe: recipe(OATS), days: DAYS,
    onAdd: async (...a) => { added.push(a); return true; }, onClose() { closed += 1; },
  });
  try {
    assert.match(s.text(), new RegExp(OATS));
    assert.match(s.text(), /Prep the night before/);
    assert.equal(s.button('Breakfast').getAttribute('aria-pressed'), 'true', 'the oats are a breakfast');
    await s.click('Plan it for Tomorrow');
    assert.deepEqual(added.map(([ymd, slot, r]) => [ymd, slot, r.title]), [[TOMORROW, 'BREAKFAST', OATS]]);
    assert.equal(closed, 1);
  } finally { await s.unmount(); }
});

test('the morning swap card offers the quick recipe for today only, and either button answers', async () => {
  let swapped = 0;
  let kept = 0;
  const s = await mount(MOD.BSMorningSwapCard, { meal: { title: OATS, slot: 'BREAKFAST' }, recipe: recipe(BOWL), onSwap() { swapped += 1; }, onKeep() { kept += 1; } });
  try {
    assert.match(s.text(), /Not prepped last night · Breakfast/);
    assert.match(s.text(), new RegExp(OATS));
    assert.match(s.text(), /Have Greek yogurt power bowl this morning instead\? Ready in 5 min, nothing to prep ahead\./);
    assert.match(s.text(), /For today only\. The rest of your plan stays as it is\./);
    await s.click('Swap it');
    await s.click('Keep it');
    assert.deepEqual([swapped, kept], [1, 1]);
  } finally { await s.unmount(); }
  const none = await mount(MOD.BSMorningSwapCard, { meal: { title: OATS }, recipe: null, onSwap() {}, onKeep() {} });
  try { assert.equal(none.text(), '', 'nothing to offer, nothing drawn'); } finally { await none.unmount(); }
});

test("tonight's card for a dish the nutritionist ticked: no Start, whose word it is, and Already done", async () => {
  let done = 0;
  const group = { slug: 'lentil-soup', title: 'Lentil soup', keeps: 1, catalog: false, meals: [{ date: TOMORROW, dow: 0, mealId: 'live-0-1', slot: 'LUNCH', title: 'Lentil soup' }] };
  const s = await mount(MOD.BSPrepTonightCard, { group, onStart: null, onDone() { done += 1; } });
  try {
    assert.ok(!s.button('Start'), 'no Start for a ticked dish');
    assert.match(s.text(), /Your nutritionist marked this one to prep the night before\./);
    await s.click('Already done');
    assert.equal(done, 1);
  } finally { await s.unmount(); }
});

test('a day plan write reads fresh first, refuses on a failed read, and tells Eat', async () => {
  signedIn(true);
  const store = goalsStore({ client_meal_days: { v: 1, days: { '2999-01-01': { add: [{ id: 'k', slot: 'LUNCH', title: 'Kept' }] } } } });
  const heard = [];
  const on = (e) => heard.push(e.detail);
  window.addEventListener('shape:dayPlanSaved', on);
  try {
    const next = await MOD.bsWriteMealDays((doc, today) => {
      assert.equal(doc.days['2999-01-01'].add[0].title, 'Kept', 'the change is made to what was just read');
      assert.equal(today, bsYmdIn(Date.now()));
      return { ...doc, touched: true };
    });
    assert.equal(next.touched, true);
    assert.deepEqual(store.saves.map(([k]) => k), ['client_meal_days']);
    assert.equal(heard.length, 1);
    goalsStore({}, { readFails: true });
    assert.equal(await MOD.bsWriteMealDays(() => ({ v: 1, days: {} })), null, 'a read that failed is not an empty plan to write over');
    const failing = goalsStore({}, { saveFails: true });
    assert.equal(await MOD.bsWriteMealDays((d) => d), null);
    assert.equal(failing.saves.length, 1);
    assert.equal(heard.length, 1, 'nothing saved, nothing told');
  } finally { window.removeEventListener('shape:dayPlanSaved', on); }
});

test('planning a recipe saves it under its id for the day and toasts the night-before line for tomorrow', async () => {
  signedIn(true);
  const store = goalsStore();
  const toasts = [];
  window.__bsToast = (msg, kind) => toasts.push([msg, kind]);
  const tr = (k, o = {}) => window.ShapeI18n.t(k, o);
  const today = bsYmdIn(Date.now());
  const tomorrow = bsYmdAdd(today, 1);
  assert.equal(await MOD.bsPlanRecipe(tr, tomorrow, 'BREAKFAST', recipe(OATS)), true);
  const meal = store.docs.client_meal_days.days[tomorrow].add[0];
  assert.equal(meal.recipeId, 'overnight-oats-three-ways');
  assert.equal(meal.slot, 'BREAKFAST');
  assert.match(meal.id, /^[A-Za-z0-9_-]{1,40}$/);
  assert.deepEqual(toasts.pop(), [`Planned for tomorrow: ${OATS}. It needs prepping tonight.`, 'ok']);
  assert.equal(await MOD.bsPlanRecipe(tr, tomorrow, 'BREAKFAST', recipe(BOWL)), true);
  assert.deepEqual(toasts.pop(), [`Planned for tomorrow: ${BOWL}.`, 'ok']);
  assert.equal(await MOD.bsPlanRecipe(tr, today, 'LUNCH', recipe(OATS)), true);
  assert.deepEqual(toasts.pop(), [`Planned for today: ${OATS}.`, 'ok']);
  assert.equal(store.docs.client_meal_days.days[tomorrow].add.length, 2);
  goalsStore({}, { saveFails: true });
  assert.equal(await MOD.bsPlanRecipe(tr, tomorrow, 'BREAKFAST', recipe(OATS)), false);
  assert.deepEqual(toasts.pop(), ['That was not saved. Try again.', 'error']);
  const days = MOD.bsPlanDayChoices(tr);
  assert.deepEqual(days.map((d) => [d.ymd, d.label]), [[today, 'Today'], [tomorrow, 'Tomorrow']]);
});

test("what is owed tonight counts a member's own oats with no plan, and a failed day-plan read is unknown", async () => {
  signedIn(true);
  const realNow = Date.now;
  Date.now = () => SUNDAY_EVENING;
  try {
    window.ShapePlan = { get: async () => ({ ok: true, meals: { hasPlan: false, read: true, days: [] } }) };
    window.ShapeMealPrep = { entries: async () => [] };
    goalsStore({ client_meal_days: { v: 1, days: { [TOMORROW]: { add: [{ id: 'a1', slot: 'BREAKFAST', title: OATS, recipeId: 'overnight-oats-three-ways' }] } } } });
    const gs = await MOD.bsLoadPrepTonight();
    assert.deepEqual(gs.map((g) => [g.slug, g.meals.map((m) => m.mealId)]), [['overnight-oats-three-ways', ['own-a1']]]);
    goalsStore({}, { readFails: true });
    assert.equal(await MOD.bsLoadPrepTonight(), null);
    // Only the day plan's read fails: still unknown, not nothing owed.
    goalsStore({ client_meal_swaps: {} });
    window.shapeDb.getUserGoals = async (kind) => (kind === 'client_meal_days' ? null : {});
    assert.equal(await MOD.bsLoadPrepTonight(), null, 'a day plan that could not be read is not an empty one');
  } finally { Date.now = realNow; }
});

test('the day runs in time order once the member has a meal in it, and is left alone otherwise', () => {
  const min = (m) => (m.time ? Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3)) : null);
  const plan = [{ id: 'l', time: '12:30' }, { id: 'b', time: '08:00' }];
  assert.deepEqual(MOD.bsEatByTime(plan, min).map((m) => m.id), ['l', 'b'], 'the plan as written');
  const withOwn = [...plan, { id: 's', time: '07:00', _own: true }, { id: 'd', time: '12:30', _own: true }];
  assert.deepEqual(MOD.bsEatByTime(withOwn, min).map((m) => m.id), ['s', 'b', 'l', 'd'], 'ties keep their order');
  const untimed = [{ id: 'y', time: '07:00', _own: true }, { id: 'x' }];
  assert.deepEqual(MOD.bsEatByTime(untimed, min).map((m) => m.id), ['y', 'x'], 'a meal with no time: nothing to order by');
});

test('Settings: the reminder time sits under Prep reminders, 7 pm until chosen, saved to the member, undone when the save fails', async () => {
  signedIn(true);
  window.BSPage = ({ children }) => React.createElement('div', null, children);
  window.BSDetailHeader = () => null;
  window.ShapeNotifyPrefs = { center: async () => ({ settings: { quiet_start: 22, quiet_end: 7 }, prefs: [] }) };
  const store = goalsStore();
  const toasts = [];
  window.__bsToast = (msg, kind) => toasts.push([msg, kind]);
  const s = await mount(MOD.BSNotifyPrefs, { onBack() {}, role: 'client' });
  try {
    await s.settle();
    const row = document.querySelector('[data-prep-hour]');
    assert.ok(row, 'the row is drawn');
    assert.match(row.previousElementSibling.textContent, /Prep reminders/, 'right under the Prep reminders switch');
    const select = row.querySelector('select');
    assert.equal(select.value, '19');
    assert.deepEqual([...select.options].map((o) => o.value), ['15', '16', '17', '18', '19', '20', '21', '22', '23']);
    assert.match(row.textContent, /The evening before, your time/);
    const choose = async (v) => {
      await React.act(async () => {
        select.value = v;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      await s.settle();
    };
    await choose('22');
    assert.deepEqual(store.saves.at(-1), ['meal_prep_reminder', { hour: 22 }]);
    assert.match(document.querySelector('[data-prep-hour]').textContent, /In your quiet hours: in the app, no push/);
    goalsStore({}, { saveFails: true });
    await choose('20');
    assert.equal(document.querySelector('[data-prep-hour] select').value, '22', 'a failed save puts the hour back');
    assert.deepEqual(toasts.pop(), ['The reminder time was not saved. Try again.', 'error']);
  } finally { await s.unmount(); }
  // A read that fails draws no row, rather than 7 pm to a member who chose 9.
  goalsStore({}, { readFails: true });
  const f = await mount(MOD.BSNotifyPrefs, { onBack() {}, role: 'client' });
  try {
    await f.settle();
    assert.ok(!document.querySelector('[data-prep-hour]'), 'no reminder-time row');
  } finally { await f.unmount(); }
  // A coach has no prep reminder to time.
  goalsStore();
  const c = await mount(MOD.BSNotifyPrefs, { onBack() {}, role: 'nutritionist' });
  try {
    await c.settle();
    assert.ok(!document.querySelector('[data-prep-hour]'), 'no reminder-time row');
  } finally { await c.unmount(); }
});

test('Eat and the recipe page are wired to the day plan, the morning swap and the plan sheet', () => {
  // The day plan is read only for a signed-in member, and a failed read draws none of it.
  assert.ok(CLIENT.includes('if (bsEatSignedInNow() && window.shapeDb && window.shapeDb.getUserGoals) {'));
  assert.ok(CLIENT.includes("if (!cancelled && doc && typeof doc === 'object') setMyDays(doc);"));
  // The menu: the member's own meals, then that day's swap over everything, in time order.
  assert.ok(CLIENT.includes('...ownMeals.map((m) => ({ ...m, _baseTitle: m.title, _own: true })),\n  ].map(eatDaySwap), (m) => bsFocusMin(bsMealSchedTime(m)));'));
  // The prep rule reads the member's own day plan, on Eat as on the server.
  assert.ok(CLIENT.includes('bsPlanMealsOn(bsPlanByDow(liveMealDays || []), viewYmd, mealOverrides, myDays).filter((x) => bsMakeAheadInfo(x, BS_MAKE_AHEAD))'));
  assert.ok(CLIENT.includes('bsPrepDueTonight({ days: liveMealDays || [], swaps: mealOverrides, mine: myDays, entries: prepEntries,'));
  // The morning swap: today, signed in, the day plan read; written as that day's swap.
  assert.ok(CLIENT.includes("if (!bsEatSignedIn || !myDays || viewYmd !== todayYmd || !Array.isArray(prepEntries)) return null;"));
  assert.ok(CLIENT.includes('bsMealDaysSwap(doc, todayYmd, meal.id, { title: recipe.title, recipeId: bsCookSlug(recipe.title), kcal: recipe.kcal, p: mac.p, c: mac.c, f: mac.f }, today)'));
  assert.ok(CLIENT.includes('onSwap={() => doMorningSwap(morningSwap)} onKeep={() => keepMorningMeal(morningSwap)} />'));
  // A planned or day-swapped meal swapped from the sheet is that day's swap, never a title swap.
  assert.ok(CLIENT.includes('const writes = bsSwapPickWrites(orig, o);\n            if (writes.day !== undefined) {'));
  assert.ok(CLIENT.includes('bsMealDaysSwap(doc, eatViewYmd, orig.id, writes.day, today)'));
  assert.ok(CLIENT.includes('              if (!writes.title) {'));
  assert.ok(CLIENT.includes('const base = bsSwapSheetBase(swapMealId, cur.meals, ownMeals, orig);'));
  // The recipe's own page plans it, signed in only.
  assert.ok(CLIENT.includes("{bsEatSignedInNow() && (\n          <button type=\"button\" data-plan-recipe=\"\" onClick={() => setPlanning(true)}"));
});

test('the swap sheet: a planned or day-swapped meal is swapped for that day only; a plan meal kept drops its title swap', () => {
  const alt = { _alt: { title: 'Greek yogurt power bowl', kcal: 380, p: 30, c: 40, f: 9 } };
  const keep = { _keep: true };
  const bowl = { title: 'Greek yogurt power bowl', kcal: 380, p: 30, c: 40, f: 9 };
  // A plan meal: a title swap, as before.
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'live-1-0' }, alt), { day: undefined, title: true });
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'live-1-0' }, keep), { day: undefined, title: true });
  // The member's own meal: that day's swap, never a title swap.
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'own-a', _own: true }, alt), { day: bowl, title: false });
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'own-a', _own: true }, keep), { day: null, title: false });
  // ⚠ A plan meal already swapped for the day (the morning swap): another pick replaces that day's
  // swap and leaves every other day alone (Codex P2 on #2563); keeping it undoes the day's swap and
  // any title swap.
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'live-1-0', _daySwap: true }, alt), { day: bowl, title: false });
  assert.deepEqual(MOD.bsSwapPickWrites({ id: 'live-1-0', _daySwap: true }, keep), { day: null, title: true });
});

test('⚠ the morning swap and its note end at the meal\'s own slot time, not noon, when the meal has no time', () => {
  // A breakfast assigned with no time of its own (BSProAssignPage) is due at the member's breakfast
  // time (8 am by default), so at 9 am it is past: no "Not prepped last night", no morning swap.
  const local = (h, mi = 0) => new Date(2026, 9, 8, h, mi).getTime();
  const ahead = { mealId: 'live-3-0', slug: 'overnight-oats-three-ways', title: OATS, date: '2026-10-08', slot: 'BREAKFAST' };
  const state = (meal, now) => MOD.bsMenuPrepState({ meal, logged: false, entries: [], ahead, viewYmd: '2026-10-08', todayYmd: '2026-10-08', now });
  const breakfast = { id: 'live-3-0', title: OATS, tag: 'BFAST' };
  assert.equal(state(breakfast, local(7, 30)).notPrepped, true, 'before breakfast it is still to come');
  assert.equal(state(breakfast, local(9)).notPrepped, false, 'a breakfast at 8 is past at 9');
  // Its own time still wins over the slot's, and a meal with neither is due at noon.
  assert.equal(state({ ...breakfast, time: '10:00' }, local(9)).notPrepped, true);
  assert.equal(state({ id: 'live-3-0', title: OATS }, local(11)).notPrepped, true);
  assert.equal(state({ id: 'live-3-0', title: OATS }, local(13)).notPrepped, false);
});

test('the swap sheet\'s current dish is the meal as planned, never the day\'s swap of it', () => {
  const plan = [{ id: 'live-1-0', title: 'Overnight oats' }];
  const own = [{ id: 'own-a', title: 'Salmon tray' }];
  // A meal the member planned, swapped for the day: Keep it offers their planned dish, and keeping
  // that undoes the day's swap, as its label says.
  const ownSwapped = { id: 'own-a', title: 'Greek yogurt power bowl', _own: true, _daySwap: true };
  assert.equal(MOD.bsSwapSheetBase('own-a', plan, own, ownSwapped).title, 'Salmon tray');
  // A plan meal swapped for the day: the plan's row.
  assert.equal(MOD.bsSwapSheetBase('live-1-0', plan, own, { id: 'live-1-0', title: 'Greek yogurt power bowl', _daySwap: true }).title, 'Overnight oats');
  // Neither list has it: what is shown.
  assert.equal(MOD.bsSwapSheetBase('x', plan, own, { id: 'x', title: 'Shown' }).title, 'Shown');
  assert.equal(MOD.bsSwapSheetBase('x', null, undefined, { id: 'x', title: 'Shown' }).title, 'Shown');
});
