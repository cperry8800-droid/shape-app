// tests/meal-logged-account.test.mjs
//
// Meal swaps and "✓ Logged" move into the account, and the meal +10 is the server's (P7; the client
// audit's B3). Pinned here:
//   - mealLogged.mjs: a day's record validated as it is read, pruned, marked and unmarked;
//   - /api/nutrition/meal-log, DRIVEN: a planned meal is claimed in the account before its macros are
//     added, a second log of it adds nothing (`already`), a failed macro write takes the claim back, a
//     claim that can't be made still logs the macros (`logged: false`), a lost compare-and-set race
//     reads again, and the award is the server's answer;
//   - /api/client/meal-day, DRIVEN: the day's swaps (the app's own day document) and the logged meals,
//     a failed read is an error, a swap is written through mealDays.mjs, a past day is refused;
//   - the website ticks ✓ only from a log that landed, keeps no swap or tick in localStorage, moves the
//     browser's old swaps into the account once; the app sends the meal key, reads the award from the
//     route, never calls award_meal_log itself, and Home ticks from the account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { goalsClient } from './helpers/goals-client.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import {
  BS_MEAL_LOGGED_DAYS, BS_MEAL_LOGGED_KIND, bsIsMealKey, bsMealIsLogged, bsMealLoggedMark, bsMealLoggedOn, bsMealLoggedPrune,
  bsMealLoggedTicks, bsMealLoggedUnmark, bsPlanMealKey,
} from '../public/newdesign/mealLogged.mjs';
import { BS_MEAL_DAYS_KIND, bsMealDayOf } from '../mobile-app/src/services/mealDays.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => stripComments(read(p));
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const UID = 'u1';
const DAY = '2026-11-05';
const AT = '2026-11-05T12:00:00.000Z';

test('a day\'s record: validated as read, marked, unmarked, pruned to its newest days', () => {
  assert.equal(bsPlanMealKey({ id: 'm-1' }, 2, 0), 'm-1');
  assert.equal(bsPlanMealKey({}, 2, 3), 'live-2-3', 'Eat\'s own id for a meal with none');
  assert.equal(bsPlanMealKey({ id: 'bad id!' }, 0, 0), null);
  assert.equal(bsIsMealKey('live-0-1'), true);
  assert.equal(bsIsMealKey('a'.repeat(81)), false);
  let doc = bsMealLoggedMark({}, DAY, 'm-1', { at: AT, title: ' Oats ', kcal: 410.4, p: 20, c: -3, f: 'x' }, DAY);
  assert.deepEqual(bsMealLoggedOn(doc, DAY), { 'm-1': { at: AT, title: 'Oats', kcal: 410, p: 20, c: 0, f: 0 } });
  assert.equal(bsMealIsLogged(doc, DAY, 'm-1'), true);
  assert.equal(bsMealIsLogged(doc, DAY, 'm-2'), false);
  assert.deepEqual(bsMealLoggedTicks(doc, DAY), { 'm-1': true });
  // A row nothing here wrote is dropped as it is read.
  const hand = { days: { [DAY]: { 'm-1': { at: AT }, 'bad key!': { at: AT }, 'm-3': { at: 'not a time' }, 'm-4': 'x' } } };
  assert.deepEqual(Object.keys(bsMealLoggedOn(hand, DAY)), ['m-1']);
  assert.deepEqual(bsMealLoggedOn(null, DAY), {});
  assert.deepEqual(bsMealLoggedOn(doc, 'nope'), {});
  // An entry with no time is not a log.
  assert.deepEqual(bsMealLoggedMark(doc, DAY, 'm-2', { kcal: 5 }, DAY), bsMealLoggedPrune(doc, DAY));
  doc = bsMealLoggedUnmark(doc, DAY, 'm-1', DAY);
  assert.deepEqual(doc, { v: 1, days: {} }, 'the last meal off takes the day with it');
  // Pruned to the newest days, none past tomorrow, and `rev` is the writer's.
  const many = { rev: 7, days: {} };
  for (let i = 1; i <= 20; i++) many.days[`2026-10-${String(i).padStart(2, '0')}`] = { m: { at: AT } };
  many.days['2026-11-06'] = { m: { at: AT } };
  many.days['2026-11-09'] = { m: { at: AT } };
  const pruned = bsMealLoggedPrune(many, DAY);
  assert.equal(Object.keys(pruned.days).length, BS_MEAL_LOGGED_DAYS);
  assert.ok(pruned.days['2026-11-06'], 'tomorrow is kept (a member ahead of the server)');
  assert.ok(!pruned.days['2026-11-09'], 'later is not real');
  assert.equal(pruned.rev, undefined);
});

async function loadMealLog(client) {
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const localDay = await loadRealModule(join(ROOT, 'src/lib/local-day.ts'), { typescript: true });
  const cas = await loadRealModule(join(ROOT, 'src/lib/user-goals-cas.ts'), { typescript: true });
  return loadRealModule(join(ROOT, 'src/app/api/nutrition/meal-log/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => (await client.auth.getUser()).data.user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/local-day', localDay],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/user-goals-cas', cas],
    ]),
  });
}
const post = (body) => new Request('https://shape.test/api/nutrition/meal-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const AWARDED = { data: { awarded: true, points: 10 }, error: null };
const meal = { kcal: 410, protein: 20, carbs: 50, fat: 12, date: DAY, mealId: 'm-1', mealTitle: 'Oats' };

test('the free logger is unchanged: macros only, and the server says whether it earned the +10', async () => {
  const client = goalsClient({ rpcs: { award_meal_log: AWARDED } });
  const route = await loadMealLog(client);
  const res = await route.POST(post({ kcal: 300, date: DAY }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, day: DAY, logged: false, award: { awarded: true, points: 10 } });
  assert.deepEqual(client.calls.map((c) => c.rpc || c.op), ['add_meal_macros', 'award_meal_log']);
  assert.deepEqual(client.calls[1].args, { p_day: DAY });
  assert.equal(client.store.size, 0, 'nothing recorded for a free log');
});

test('a planned meal is claimed before its macros are added, and a second log of it adds nothing', async () => {
  const client = goalsClient({ rpcs: { award_meal_log: AWARDED } });
  const route = await loadMealLog(client);
  const first = await (await route.POST(post(meal))).json();
  assert.equal(first.ok, true);
  assert.equal(first.logged, true);
  assert.equal(first.already, undefined);
  assert.deepEqual(first.award, { awarded: true, points: 10 });
  const order = client.calls.map((c) => c.rpc || c.op);
  assert.ok(order.indexOf('insert') < order.indexOf('add_meal_macros'), 'claimed first: ' + order.join(','));
  const doc = client.store.get(`${UID}:${BS_MEAL_LOGGED_KIND}`);
  assert.equal(doc.rev, 1);
  assert.equal(bsMealIsLogged(doc, DAY, 'm-1'), true);
  assert.equal(bsMealLoggedOn(doc, DAY)['m-1'].title, 'Oats');
  assert.equal(bsMealLoggedOn(doc, DAY)['m-1'].kcal, 410);
  // The same meal again (the app after the website, another tab): nothing is added.
  client.calls.length = 0;
  const again = await (await route.POST(post(meal))).json();
  assert.deepEqual(again, { ok: true, day: DAY, logged: true, already: true, award: null });
  assert.ok(!client.calls.some((c) => c.rpc === 'add_meal_macros'), 'no second add');
  // Another meal the same day is its own.
  const other = await (await route.POST(post({ ...meal, mealId: 'm-2' }))).json();
  assert.equal(other.logged, true);
  assert.equal(other.already, undefined);
  assert.deepEqual(Object.keys(bsMealLoggedOn(client.store.get(`${UID}:${BS_MEAL_LOGGED_KIND}`), DAY)).sort(), ['m-1', 'm-2']);
});

test('a failed macro write takes the claim back: no ✓ for a log that did not land (B3)', async () => {
  const client = goalsClient({ rpcs: { add_meal_macros: { data: null, error: { message: 'boom', code: 'XX000' } } } });
  const route = await loadMealLog(client);
  const res = await route.POST(post(meal));
  assert.equal(res.status, 500);
  const doc = client.store.get(`${UID}:${BS_MEAL_LOGGED_KIND}`);
  assert.equal(bsMealIsLogged(doc, DAY, 'm-1'), false);
  assert.ok(!client.calls.some((c) => c.rpc === 'award_meal_log'));
});

test('a claim that cannot be made still logs the macros, and says the meal is not recorded', async () => {
  const client = goalsClient({ fail: ['read'], rpcs: { award_meal_log: AWARDED } });
  const route = await loadMealLog(client);
  const body = await (await route.POST(post(meal))).json();
  assert.equal(body.ok, true);
  assert.equal(body.logged, false);
  assert.ok(client.calls.some((c) => c.rpc === 'add_meal_macros'));
});

test('a lost compare-and-set race reads again and keeps the other device\'s meal', async () => {
  let raced = false;
  const client = goalsClient({
    docs: { [`${UID}:${BS_MEAL_LOGGED_KIND}`]: { rev: 3, days: {} } },
    beforeUpdate: (key, store) => {
      if (raced) return;
      raced = true;
      store.set(key, { rev: 4, days: { [DAY]: { 'm-9': { at: AT } } } });
    },
    rpcs: { award_meal_log: AWARDED },
  });
  const route = await loadMealLog(client);
  const body = await (await route.POST(post(meal))).json();
  assert.equal(body.logged, true);
  const doc = client.store.get(`${UID}:${BS_MEAL_LOGGED_KIND}`);
  assert.equal(doc.rev, 5);
  assert.deepEqual(Object.keys(bsMealLoggedOn(doc, DAY)).sort(), ['m-1', 'm-9']);
  const updates = client.calls.filter((c) => c.op === 'update');
  assert.deepEqual(updates.map((u) => u.rev), ['3', '4']);
});

test('the award is reported only as the server answered it', async () => {
  for (const [rpc, want] of [
    [{ data: { awarded: false, reason: 'not_today' }, error: null }, { awarded: false, points: 0 }],
    [{ data: null, error: { message: 'no function' } }, null],
    [{ data: 'yes', error: null }, null],
  ]) {
    const client = goalsClient({ rpcs: { award_meal_log: rpc } });
    const route = await loadMealLog(client);
    const body = await (await route.POST(post({ kcal: 100, date: DAY }))).json();
    assert.deepEqual(body.award, want);
  }
});

test('nothing to log, and a bad meal key logs like the free logger', async () => {
  const client = goalsClient({ rpcs: { award_meal_log: AWARDED } });
  const route = await loadMealLog(client);
  assert.equal((await route.POST(post({ date: DAY }))).status, 400);
  const body = await (await route.POST(post({ ...meal, mealId: 'not a key!' }))).json();
  assert.equal(body.logged, false);
  assert.equal(client.store.size, 0);
});

async function loadMealDay(client) {
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const localDay = await loadRealModule(join(ROOT, 'src/lib/local-day.ts'), { typescript: true });
  const cas = await loadRealModule(join(ROOT, 'src/lib/user-goals-cas.ts'), { typescript: true });
  return loadRealModule(join(ROOT, 'src/app/api/client/meal-day/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => (await client.auth.getUser()).data.user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/local-day', localDay],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/user-goals-cas', cas],
    ]),
  });
}

test('the day as the account keeps it: the app\'s swaps and the logged meals; a failed read is an error', async () => {
  const client = goalsClient({ docs: {
    [`${UID}:${BS_MEAL_DAYS_KIND}`]: { v: 1, days: { [DAY]: { add: [], swap: { 'm-1': { title: 'Yogurt bowl', kcal: 320, p: 25, c: 30, f: 8 } } } } },
    [`${UID}:${BS_MEAL_LOGGED_KIND}`]: { v: 1, days: { [DAY]: { 'm-2': { at: AT } } } },
  } });
  const route = await loadMealDay(client);
  const body = await (await route.GET(new Request(`https://shape.test/api/client/meal-day?date=${DAY}`))).json();
  assert.deepEqual(body, { ok: true, date: DAY, swap: { 'm-1': { title: 'Yogurt bowl', kcal: 320, p: 25, c: 30, f: 8 } }, logged: { 'm-2': true } });
  const failing = await loadMealDay(goalsClient({ fail: ['read'] }));
  assert.equal((await failing.GET(new Request(`https://shape.test/api/client/meal-day?date=${DAY}`))).status, 502);
});

test('a website swap is the app\'s day swap, written through mealDays.mjs; a past day is refused', async () => {
  const client = goalsClient({ docs: { [`${UID}:${BS_MEAL_DAYS_KIND}`]: { v: 1, rev: 2, days: { [DAY]: { add: [{ id: 'a1', slot: 'LUNCH', title: 'Soup', kcal: 300 }], swap: {} } } } } });
  const route = await loadMealDay(client);
  const req = (b) => new Request('https://shape.test/api/client/meal-day', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const one = await (await route.POST(req({ date: DAY, today: DAY, mealId: 'm-1', swap: { title: 'Yogurt bowl', kcal: 320, p: 25, c: 30, f: 8 } }))).json();
  assert.equal(one.ok, true);
  assert.deepEqual(one.swap, { 'm-1': { title: 'Yogurt bowl', kcal: 320, p: 25, c: 30, f: 8 } });
  let doc = client.store.get(`${UID}:${BS_MEAL_DAYS_KIND}`);
  assert.equal(doc.rev, 3);
  assert.equal(bsMealDayOf(doc, DAY).add.length, 1, 'the member\'s own planned meal is kept');
  // Undone.
  await route.POST(req({ date: DAY, today: DAY, mealId: 'm-1', swap: null }));
  doc = client.store.get(`${UID}:${BS_MEAL_DAYS_KIND}`);
  assert.deepEqual(bsMealDayOf(doc, DAY).swap, {});
  // Several at once (the one-time move from the browser).
  const many = await (await route.POST(req({ date: DAY, today: DAY, swaps: { 'm-1': { title: 'A', kcal: 1 }, 'live-3-0': { title: 'B', kcal: 2 } } }))).json();
  assert.deepEqual(Object.keys(many.swap).sort(), ['live-3-0', 'm-1']);
  assert.equal((await route.POST(req({ date: '2026-11-01', today: DAY, mealId: 'm-1', swap: null }))).status, 400, 'a past day');
  assert.equal((await route.POST(req({ today: DAY, mealId: 'm-1' }))).status, 400, 'no date');
  assert.equal((await route.POST(req({ date: DAY, today: DAY }))).status, 400, 'nothing to change');
  const unreadable = await loadMealDay(goalsClient({ fail: ['read'] }));
  assert.equal((await unreadable.POST(req({ date: DAY, today: DAY, mealId: 'm-1', swap: null }))).status, 502);
});

test('the website ticks ✓ only from a log that landed and keeps no swap or tick in the browser', () => {
  const dc = code('public/newdesign/dashClient.jsx');
  const dn = code('public/newdesign/dashNutri.jsx');
  for (const src of [dc, dn]) {
    assert.doesNotMatch(src, /localStorage\.setItem\(/, 'nothing written to browser storage');
    assert.doesNotMatch(src, /swapStorageKey/);
  }
  // The log: in flight, then ✓ only on an answer that says it landed; a failure says so.
  assert.match(dc, /const r = await dclLogPlannedMeal\(m, todayIso\);[\s\S]{0,200}if \(!r\.ok\) \{ setLogNote\("That meal wasn't logged\. Try again\."\); return; \}\s*mealDay\.markLogged\(m\.id\);/);
  assert.match(dc, /if \(!r\.already\) setLedger/);
  assert.match(dc, /return d && d\.ok \? \{ ok: true, already: d\.already === true \} : \{ ok: false \};/);
  assert.match(dc, /mealId: m\.id, mealTitle: m\.title/);
  // Keys are Eat's.
  assert.match(dc, /id: dclPlanMealKey\(m, dow, j\)/);
  assert.match(dn, /dclPlanMealKey\(m, dow, i\)/);
  // The swaps and ticks come from /api/client/meal-day, and the browser's old ones move there once.
  assert.match(dc, /fetch\("\/api\/client\/meal-day\?date=" \+ encodeURIComponent\(todayIso\)/);
  assert.match(dc, /body: JSON\.stringify\(\{ date: todayIso, today: todayIso, swaps \}\)/);
  assert.match(dc, /if \(!ok\) \{ setDay\(before\); setNote\("The swap wasn't saved\. Try again\."\); \}/);
  assert.match(dn, /swaps=\{isToday && mealDay \? mealDay\.swaps : \{\}\} onSwap=\{isToday && mealDay \? mealDay\.setSwap : undefined\}/);
});

test('the browser\'s old swaps move into the account by today\'s meal keys; the account\'s own win', async () => {
  // The helpers are classic-script globals: evaluated here from the shipping file's own text.
  const src = read('public/newdesign/dashClient.jsx');
  const from = src.indexOf('const DCL_LEGACY_MEAL_KEYS');
  const to = src.indexOf('async function dclLogPlannedMeal(');
  assert.ok(from > 0 && to > from);
  const mod = new Function(src.slice(from, to) + ';return { dclLegacySwaps, dclSwapIndexOf, dclSwapOf, dclEffectiveMeal, dclPlanMealKey };')();
  const store = new Map([
    ['shape.dashMealSwap.' + DAY, JSON.stringify({ 'live-1': 0, 'm-x': 1 })],
    ['shape.dashNutriSwap.' + DAY + '.3', JSON.stringify({ 'pm-0': 1 })],
    ['shape.dashMealSwap.2026-11-01', JSON.stringify({ 'live-0': 0 })],
    ['shape.dashMealLog.' + DAY, JSON.stringify({ 'live-0': true })],
    ['shape.other', 'x'],
  ]);
  const storage = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => (store.has(k) ? store.get(k) : null) };
  const meals = [
    { id: 'live-3-0', title: 'Oats', alts: [{ name: 'Yogurt', kcal: 300, p: 20, c: 30, f: 8 }, { name: 'Eggs', kcal: 350, p: 25, c: 5, f: 20 }] },
    { id: 'live-3-1', title: 'Soup', alts: [{ name: 'Salad', kcal: 280, p: 10, c: 20, f: 15 }] },
    { id: 'm-x', title: 'Fish', alts: [{ name: 'Tofu', kcal: 1 }, { name: 'Chicken', kcal: 500, p: 45, c: 0, f: 10 }] },
  ];
  const out = mod.dclLegacySwaps(storage, DAY, 3, meals, { 'm-x': { title: 'Tofu' } });
  // Today's key names meal 0 by `live-1`? No: `live-1` is the second meal's old id; Nutrition's `pm-0` the first.
  assert.deepEqual(out.swaps, {
    'live-3-0': { title: 'Eggs', kcal: 350, p: 25, c: 5, f: 20 },
    'live-3-1': { title: 'Salad', kcal: 280, p: 10, c: 20, f: 15 },
  });
  assert.ok(!out.swaps['m-x'], 'the account already swapped it');
  assert.deepEqual(out.keys.sort(), ['shape.dashMealLog.' + DAY, 'shape.dashMealSwap.2026-11-01', 'shape.dashMealSwap.' + DAY, 'shape.dashNutriSwap.' + DAY + '.3'].sort());
  assert.equal(mod.dclSwapIndexOf(meals[0], { title: 'Eggs' }), 1);
  assert.equal(mod.dclSwapIndexOf(meals[0], { title: 'Something from the app' }), -1);
  assert.deepEqual(mod.dclEffectiveMeal(meals[0], 0).title, 'Yogurt');
  assert.equal(mod.dclEffectiveMeal(meals[0], -1), meals[0]);
  assert.equal(mod.dclPlanMealKey({}, 4, 2), 'live-4-2');
});

test('the app sends the meal key, reads the award from the route, and Home ticks from the account', () => {
  const be = code('mobile-app/src/services/shapeBackend.js');
  const start = be.indexOf('async function logMealMacros');
  const body = be.slice(start, be.indexOf('window.ShapeMealLog', start));
  assert.doesNotMatch(body, /award_meal_log/, 'the client no longer calls the award');
  assert.match(body, /mealId: String\(mealId\)/);
  assert.match(body, /awardPromise: Promise\.resolve\(award\)/);
  assert.match(be, /window\.ShapeMealLog = \{ log: logMealMacros, day: getMealDay \};/);
  assert.match(code('mobile-app/src/broadsheet/BSMealLog.jsx'), /const mealId = meal && meal\.planMealId \? String\(meal\.planMealId\) : null;\s*const r = window\.ShapeMealLog\?\.log\?\.\(\{ kcal, protein: P, carbs: C, fat: F, \.\.\.\(mealId \? \{ mealId, mealTitle \} : \{\}\) \}\);/);
  const client = code('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /window\.ShapeMealLog\.day\(bsLocalDay\(Date\.now\(\)\)\)[\s\S]{0,300}if \(m && m\.planMealId && d\.logged\[m\.planMealId\]\) add\[m\.id\] = true;/);
  assert.match(client, /\}, \[liveWeek, homeChangeRev\]\);/);
});
