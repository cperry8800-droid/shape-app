// Night-before prep in the app (owner, 2026-10-05): the cook screen records the prep instead of
// offering "Log it", the card on Eat, a menu row's mark, and the notification taps that open the
// cook screen. The shared rule itself is tests/prep-ahead.test.mjs; the reminder is
// tests/prep-reminders-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { bsCookableFromRecipe } from '../mobile-app/src/services/cookable.mjs';

// The plate is the chrome's (iosAppBroadsheet.jsx), read off window when the client module loads.
globalThis.BSPlate = ({ children }) => React.createElement('div', { 'data-plate': '' }, children);
const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepTonightCook', 'BSPrepTonightCard', 'bsMenuPrepState', 'bsRouteNotification', 'bsPrepDays'], React);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The page's own event types: Node's global CustomEvent cannot be dispatched on a jsdom window.
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;

const OATS = 'Overnight oats, three ways';
const SLUG = 'overnight-oats-three-ways';
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const oats = () => bsCookableFromRecipe(SHAPE_KITCHEN_RECIPES.find((r) => r.title === OATS));
const meal = (date, dow) => ({ date, dow, mealId: `live-${dow}-0`, slot: 'BREAKFAST', title: OATS, slug: SLUG });
const GROUP = { slug: SLUG, title: OATS, keeps: 3, meals: [meal('2026-10-05', 0), meal('2026-10-06', 1), meal('2026-10-07', 2)] };
// Noon on Sunday 4 October 2026 in the zone the suite runs in. The app reads the device's own
// calendar, so a fixed UTC instant would be Monday from UTC+12 on (Auckland is UTC+13 in October).
const SUNDAY_NOON = new Date(2026, 9, 4, 12).getTime();
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, meals: [{ slot: 'BREAKFAST', title: OATS }] }));

async function mount(Component, props) {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Component, props)));
  const text = () => document.getElementById('root').textContent;
  const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const click = async (label) => {
    const b = button(label);
    assert.ok(b, `no "${label}" button in: ${text().slice(0, 300)}`);
    await React.act(async () => { b.click(); });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  return { root, text, button, click, unmount: () => React.act(async () => root.unmount()) };
}
// The oats walk: the ingredient list, the first step, then the chill that ends tonight.
async function finishOats(s) {
  await s.click('Start cooking');
  await s.click('Done · next step');
  await s.click('Done · finish');
}
function signedIn(on) { window.ShapeAuth = { getCachedState: () => ({ user: on ? { id: 'member-1' } : null }) }; }

test("finishing tonight's part records the prep for the days it covers, and never offers Log it", async () => {
  signedIn(true);
  const saved = [];
  window.ShapeMealPrep = { record: async (entries) => { saved.push(entries); return { ok: true }; }, entries: async () => [] };
  const s = await mount(MOD.BSCookMode, { cookable: oats(), prepGroup: GROUP, onClose() {} });
  try {
    await finishOats(s);
    assert.equal(saved.length, 1, 'the prep was not saved exactly once');
    assert.deepEqual(saved[0].map((e) => [e.forDate, e.mealId]), [['2026-10-05', 'live-0-0'], ['2026-10-06', 'live-1-0'], ['2026-10-07', 'live-2-0']]);
    assert.match(s.text(), /Prepped for tomorrow\./);
    // The harness's translator leaves {days} as written; bsPrepDays is checked below.
    assert.match(s.text(), /Saved as prepped for \{days\}\. Nothing is logged as eaten\./);
    assert.equal(s.button('Log it'), undefined, 'a jar for the morning is offered "Log it"');
    assert.match(s.text(), /When you’re ready to eat/, 'the morning steps are gone');
  } finally { await s.unmount(); }
});

test('a signed-out visitor records nothing and reads "Made ahead."', async () => {
  signedIn(false);
  const saved = [];
  window.ShapeMealPrep = { record: async (entries) => { saved.push(entries); return { ok: true }; } };
  const s = await mount(MOD.BSCookMode, { cookable: oats(), prepGroup: GROUP, onClose() {} });
  try {
    await finishOats(s);
    assert.deepEqual(saved, []);
    assert.match(s.text(), /Made ahead\./);
    assert.doesNotMatch(s.text(), /Prepped for tomorrow|Saved as prepped/);
    assert.equal(s.button('Log it'), undefined);
  } finally { await s.unmount(); }
});

test('a save that fails says so, and Try again saves it', async () => {
  signedIn(true);
  const results = [{ ok: false }, { ok: true }];
  const saved = [];
  window.ShapeMealPrep = { record: async (entries) => { saved.push(entries); return results.shift(); } };
  const s = await mount(MOD.BSCookMode, { cookable: oats(), prepGroup: GROUP, onClose() {} });
  try {
    await finishOats(s);
    assert.match(s.text(), /The prep was not saved\./);
    assert.match(s.text(), /Made ahead\./, 'an unsaved prep claims "Prepped for tomorrow."');
    await s.click('Try again');
    assert.equal(saved.length, 2);
    assert.match(s.text(), /Prepped for tomorrow\./);
  } finally { await s.unmount(); }
});

test("the cook screen a reminder opens reads what is owed tonight, and records it", async () => {
  signedIn(true);
  const realNow = Date.now;
  Date.now = () => SUNDAY_NOON;
  const saved = [];
  window.ShapePlan = { get: async () => ({ meals: { hasPlan: true, days: WEEK } }) };
  window.shapeDb = { getUserGoals: async () => ({}) };
  window.ShapeMealPrep = { record: async (entries) => { saved.push(entries); return { ok: true }; }, entries: async () => [] };
  const s = await mount(MOD.BSPrepTonightCook, { slug: SLUG, onClose() {} });
  try {
    await finishOats(s);
    assert.deepEqual(saved[0].map((e) => e.forDate), ['2026-10-05', '2026-10-06', '2026-10-07']);
    assert.match(s.text(), /Prepped for tomorrow\./);
  } finally { await s.unmount(); Date.now = realNow; }
});

test('with nothing on the plan owed it, the prep is still recorded, by title', async () => {
  signedIn(true);
  const realNow = Date.now;
  Date.now = () => SUNDAY_NOON;
  const saved = [];
  window.ShapePlan = { get: async () => ({ meals: { hasPlan: true, days: [{ dow: 0, meals: [{ title: 'Greek yogurt power bowl' }] }] } }) };
  window.shapeDb = { getUserGoals: async () => ({}) };
  window.ShapeMealPrep = { record: async (entries) => { saved.push(entries); return { ok: true }; }, entries: async () => [] };
  const s = await mount(MOD.BSPrepTonightCook, { slug: SLUG, onClose() {} });
  try {
    await finishOats(s);
    assert.equal(saved[0].length, 1);
    assert.equal(saved[0][0].recipeTitle, OATS);
    assert.equal(saved[0][0].forDate, undefined);
    assert.match(s.text(), /Made ahead\./);
    assert.match(s.text(), /Saved as prepped\. Nothing is logged as eaten\./);
  } finally { await s.unmount(); Date.now = realNow; }
});

test("the planned days read as the member's weekdays", () => {
  assert.match(MOD.bsPrepDays(['2026-10-05', '2026-10-06', '2026-10-07']), /^Mon, Tue,? and Wed$/);
  assert.equal(MOD.bsPrepDays(['2026-10-08']), 'Thu');
  window.ShapeI18n = { intlLocale: () => 'de' };
  try { assert.match(MOD.bsPrepDays(['2026-10-05', '2026-10-06']), /^Mo\.? und Di\.?$/); } finally { delete window.ShapeI18n; }
});

test('a route naming a recipe the catalog does not have closes instead of opening empty', async () => {
  let closed = 0;
  const s = await mount(MOD.BSPrepTonightCook, { slug: 'no-such-recipe', onClose() { closed += 1; } });
  try { assert.equal(closed, 1); } finally { await s.unmount(); }
});

test("the card names the dish, the meal and the days, and its buttons start or record the prep", async () => {
  let started = 0;
  let done = 0;
  const s = await mount(MOD.BSPrepTonightCard, { group: GROUP, onStart() { started += 1; }, onDone() { done += 1; } });
  try {
    assert.match(s.text(), /Tonight · for tomorrow/);
    assert.match(s.text(), new RegExp(OATS));
    assert.match(s.text(), /Breakfast · Mon, Tue,? and Wed/);
    assert.match(s.text(), /One batch tonight covers each day listed\./);
    await s.click('Start');
    await s.click('Already done');
    assert.deepEqual([started, done], [1, 1]);
  } finally { await s.unmount(); }
  const one = await mount(MOD.BSPrepTonightCard, { group: { ...GROUP, meals: GROUP.meals.slice(0, 1) }, onStart() {}, onDone() {} });
  try { assert.match(one.text(), /Prep it tonight so it is ready\./); } finally { await one.unmount(); }
});

test("a menu row's mark: Thursday's jar is not Sunday's batch, and only this morning says not prepped", () => {
  // Local clock times, so the check reads the same wherever the suite runs.
  const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
  const sunday = [0, 1, 2].map((dow, i) => ({ mealId: `live-${dow}-0`, recipeTitle: OATS, mealTitle: OATS, forDate: GROUP.meals[i].date, preppedAt: local(2026, 10, 4, 19) }));
  const state = (ymd, dow, now, over = {}) => MOD.bsMenuPrepState({
    meal: { id: `live-${dow}-0`, title: OATS, time: '07:30' }, logged: false, entries: sunday,
    ahead: meal(ymd, dow), viewYmd: ymd, todayYmd: ymd, now, ...over,
  });
  assert.deepEqual(state('2026-10-05', 0, local(2026, 10, 5, 6)), { prepped: true, notPrepped: false });
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 6)), { prepped: null, notPrepped: true }, "Thursday's oats read as prepped by Sunday's batch");
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 7, 45)), { prepped: null, notPrepped: false }, 'the note outlived the meal it was about');
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 11), { meal: { id: 'live-3-0', title: OATS } }), { prepped: null, notPrepped: true }, 'a meal with no time is noted until noon');
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 13), { meal: { id: 'live-3-0', title: OATS } }), { prepped: null, notPrepped: false });
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 7, 6), { todayYmd: '2026-10-07' }), { prepped: null, notPrepped: false }, 'a day not yet here says not prepped');
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 6), { logged: true }), { prepped: null, notPrepped: false });
  assert.deepEqual(state('2026-10-08', 3, local(2026, 10, 8, 6), { entries: null }), { prepped: null, notPrepped: false }, 'records that have not loaded say nothing');
  // A meal that is not made ahead keeps the PREPPED stamp's own rule.
  const curry = MOD.bsMenuPrepState({ meal: { id: 'live-3-1', title: 'Chickpea and spinach curry' }, logged: false,
    entries: [{ recipeTitle: 'Chickpea and spinach curry', preppedAt: local(2026, 10, 4, 12) }], ahead: null, viewYmd: '2026-10-05', todayYmd: '2026-10-05', now: local(2026, 10, 5, 8) });
  assert.equal(curry.notPrepped, false);
  assert.equal(curry.prepped.recipeTitle, 'Chickpea and spinach curry');
});

test('a notification route opens the same screen from the list and from a push', () => {
  const seen = [];
  const keep = (e) => seen.push([e.type, e.detail]);
  window.addEventListener('shape:openPrep', keep);
  window.addEventListener('shape:openMarket', keep);
  try {
    assert.equal(MOD.bsRouteNotification(`prep:${SLUG}`), true);
    assert.equal(MOD.bsRouteNotification('coach:trainer:9'), true);
    assert.equal(MOD.bsRouteNotification('prep:'), false);
    assert.equal(MOD.bsRouteNotification('sessions'), false, 'sessions is the Settings screen’s own');
    assert.equal(MOD.bsRouteNotification(undefined), false);
    assert.deepEqual(seen, [['shape:openPrep', { slug: SLUG }], ['shape:openMarket', { role: 'trainer' }]]);
  } finally {
    window.removeEventListener('shape:openPrep', keep);
    window.removeEventListener('shape:openMarket', keep);
  }
});

test('a tapped push hands its route to the shell, even before the shell has mounted', async () => {
  const listeners = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: { PushNotifications: {
      checkPermissions: async () => ({ receive: 'granted' }),
      requestPermissions: async () => ({ receive: 'granted' }),
      addListener: (name, fn) => { listeners[name] = fn; },
      register: async () => {},
      removeAllListeners: async () => {},
    } },
  };
  const { registerPush, teardownPush } = await import('../mobile-app/src/services/push.js');
  const routes = [];
  const keep = (e) => routes.push(e.detail.route);
  window.addEventListener('shape:pushRoute', keep);
  try {
    await registerPush();
    assert.equal(typeof listeners.pushNotificationActionPerformed, 'function', 'no tap listener');
    listeners.pushNotificationActionPerformed({ notification: { data: { route: `prep:${SLUG}`, type: 'meal_prep' } } });
    assert.deepEqual(routes, [`prep:${SLUG}`]);
    assert.equal(window.__bsPushRoute, `prep:${SLUG}`, 'a tap before the shell mounts is lost');
    listeners.pushNotificationActionPerformed({ notification: { data: {} } });
    assert.equal(routes.length, 1, 'a push with no route routed anyway');
  } finally {
    window.removeEventListener('shape:pushRoute', keep);
    await teardownPush();
    delete window.Capacitor;
    window.__bsPushRoute = null;
  }
});

test('the shell, the notification list and Eat are wired to the same pieces', () => {
  // The shell turns a prep route into Eat's cook screen, and reads a push tapped before it mounted.
  assert.ok(CLIENT.includes("window.addEventListener('shape:openPrep', open);"));
  assert.ok(CLIENT.includes("window.addEventListener('shape:pushRoute', fromPush);"));
  assert.ok(CLIENT.includes('const pending = window.__bsPushRoute;\n    if (pending) { window.__bsPushRoute = null; bsRouteNotification(pending); }'));
  assert.ok(CLIENT.includes('prepTonight={prepTonight} onPrepTonightConsumed={() => setPrepTonight(null)}'));
  // The in-app list routes through the same map.
  assert.ok(CLIENT.includes('if (bsRouteNotification(route)) setShowNotifications(false);'));
  // Eat: the cook screen, the card and the row marks.
  assert.ok(CLIENT.includes('if (prepCook) return <BSPrepTonightCook slug={prepCook.slug} group={prepCook.group} onClose={() => setPrepCook(null)} />;'));
  assert.ok(CLIENT.includes('<BSPrepTonightCard group={g} onStart={() => setPrepCook({ slug: g.slug, group: g })} onDone={() => markPrepped(g)} />'));
  assert.ok(CLIENT.includes('const { prepped, notPrepped } = bsMenuPrepState({ meal: m, logged, entries: prepEntries, ahead: aheadOn.get(m.id), viewYmd, todayYmd, now: prepNow });'));
  // The card shows on today's menu from 3 pm, read from the shared rule.
  assert.ok(CLIENT.includes('const prepTonightGroups = liveMealDays && viewYmd === todayYmd && new Date(prepNow).getHours() >= 15 && Array.isArray(prepEntries)'));
  // Home's agenda reads a made-ahead meal's "Prepped ✓" by the same per-day rule, under Eat's meal id.
  assert.ok(CLIENT.includes("ahead: m.planMealId && BS_MAKE_AHEAD.has(m.prepSlug) ? { date: selYmd, mealId: m.planMealId, title: m.title, slug: m.prepSlug } : null,"));
  assert.ok(CLIENT.includes("planMealId: meal.id != null && meal.id !== '' ? String(meal.id) : `live-${i}-${j}`,"));
  // Both settings screens offer the switch.
  assert.ok(CLIENT.includes("['meal_prep', 'Prep reminders', 'The night before a meal that needs it']"));
  const web = readFileSync(new URL('../public/newdesign/clientMeSettings.jsx', import.meta.url), 'utf8');
  assert.ok(web.includes('["meal_prep", "Prep reminders", "The night before a meal that needs it"]'));
});
