// A make-ahead step ends tonight's cook (owner, 2026-10-04, on the overnight oats' "239:37"
// resting countdown and "Resting · Overnight oats": "these timers seem unnecessary").
// "Lid it and chill at least 4 hours or overnight" was a 240-minute 'off' hold: a four-hour
// countdown on the board, the morning steps scheduled four hours into the session, and every
// finish figure ("About 248 min left") four hours out. Now the catalog marks the step
// `makeAhead`, the method stops there, and the morning steps ride along as `laterSteps`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPE_KITCHEN_RECIPES, _KITCHEN_STEP_HEAT } from '../mobile-app/src/broadsheet/shapeKitchenData.js';
import { bsCookableFromRecipe, bsOfferedTimers, bsStepTimers } from '../mobile-app/src/services/cookable.mjs';
import { BS_SERVE_ISSUE, bsOrchestrate } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsPrepEstimate } from '../mobile-app/src/services/mealPrep.mjs';
import { drive, loadBroadsheet, pressable, textOf } from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepCook', 'BSPrepSession']);
const OATS = 'Overnight oats, three ways';
const raw = (title) => SHAPE_KITCHEN_RECIPES.find((r) => r.title === title);
const cook = (title) => ({ key: title, ...bsCookableFromRecipe(raw(title)) });
const k1 = { stove: 1, oven: 1, board: 1 };

// ── The catalog guard ────────────────────────────────────────────────────────────────────
// An off-heat step that asks the cook to wait over an hour is either finished another day
// (mark it makeAhead) or a real wait tonight, which is named here with its reason so it is a
// decision rather than an accident. Empty today: the 60-minute marinades and chills (pork
// chops, skirt steak, corn patties, the cold bean salad) sit at the hour, not over it.
const TONIGHT_WAIT = {};
const longOffHeatWaits = (recipe) => {
  const c = bsCookableFromRecipe(recipe);
  if (!c) return [];
  const heat = _KITCHEN_STEP_HEAT[recipe.title] || {};
  const out = [];
  c.steps.forEach((text, i) => {
    const m = c.stepMeta[i] || {};
    const onHeat = m.station === 'stove' || m.station === 'oven' || (Array.isArray(heat[i]) && heat[i].length) || (m.also && m.also.length);
    if (onHeat) return;
    const timer = Math.max(0, ...bsOfferedTimers(text, m).map((t) => t.seconds / 60));
    const hold = m.passive === true && m.station === 'off' ? m.min || 0 : 0;
    if (timer > 60 || hold > 60) out.push(`${recipe.title} step ${i}: ${Math.max(timer, hold)} min`);
  });
  return out;
};

test('no catalog step asks the cook to wait over an hour off the heat unless that is decided', () => {
  const bad = SHAPE_KITCHEN_RECIPES.filter((r) => !TONIGHT_WAIT[r.title]).flatMap(longOffHeatWaits);
  assert.deepEqual(bad, [], 'mark the step { makeAhead: true } if the dish is finished another day, or name it in TONIGHT_WAIT with the reason the cook waits tonight');
  for (const reason of Object.values(TONIGHT_WAIT)) assert.ok(String(reason).length > 20, 'a TONIGHT_WAIT entry needs its reason');
  // Guard the guard: the overlay as it shipped before this change trips it.
  const before = { ...raw(OATS), stepMeta: [null, { min: 240, passive: true, station: 'off' }, null, null] };
  assert.equal(longOffHeatWaits(before).length, 1, 'the guard no longer sees a 4-hour chill');
  const batido = SHAPE_KITCHEN_RECIPES.find((r) => r.title === 'Papaya banana batido');
  assert.ok(batido, 'the batido left the catalog; this guard lost its second witness');
  assert.ok(bsStepTimers(batido.steps.at(-1)).some((t) => t.seconds >= 4 * 3600), 'the batido step no longer states its 4 hours');
  assert.deepEqual(longOffHeatWaits(batido), []);
});

test('overnight oats cook tonight in two steps and keep the morning for later', () => {
  const c = bsCookableFromRecipe(raw(OATS));
  assert.equal(c.steps.length, 2);
  assert.deepEqual(c.laterSteps, raw(OATS).steps.slice(2));
  assert.equal(c.stepMeta[1].makeAhead, true);
  assert.equal(c.stepMeta[1].finishesLater, true);
  assert.equal(c.stepMeta[1].passive, false, 'a make-ahead step is not a hold');
  for (const [i, text] of c.steps.entries()) assert.deepEqual(bsOfferedTimers(text, c.stepMeta[i]), [], `step ${i} still offers a countdown`);
  // A storage limit on the last step is make-ahead too, with nothing left for later.
  const b = bsCookableFromRecipe(raw('Papaya banana batido'));
  assert.equal(b.laterSteps, undefined);
  // finishesLater is derived from steps left for later, never from the mark alone: the batido
  // is drunk tonight, so Serve lands it with dinner rather than making it first, end to end.
  assert.notEqual(b.stepMeta.at(-1).finishesLater, true, 'a make-ahead step with nothing left over is marked finishesLater');
  assert.deepEqual(bsOfferedTimers(b.steps.at(-1), b.stepMeta.at(-1)), []);
  // The prep order no longer ranks the oats as the longest dish on four hours of fridge.
  assert.ok(bsPrepEstimate(c) < 10 * 60, `oats estimate ${bsPrepEstimate(c)} s`);
});

test('an inline (coach or member) step cannot carry the mark: only the catalog overlay can', () => {
  const c = bsCookableFromRecipe({ title: 'Inline', steps: [{ t: 'Chill 4 hours.', makeAhead: true }, 'Eat.'], ingredients: [] });
  assert.equal(c.steps.length, 2);
  assert.equal(c.laterSteps, undefined);
  assert.notEqual(c.stepMeta[0].makeAhead, true);
});

test('with the oats in any session, no plan holds a fridge for hours and dinner is not pushed back', () => {
  const oats = cook(OATS);
  const partners = SHAPE_KITCHEN_RECIPES.filter((r) => r.title !== OATS).map((r) => cook(r.title)).filter((c) => c.steps && c.steps.length);
  assert.ok(partners.length > 90);
  let together = 0;
  for (const p of partners) {
    for (const mode of ['together', 'sequence', 'auto', 'serve']) {
      const plan = bsOrchestrate([oats, p], { mode, kitchen: k1 });
      assert.ok(!(plan.timeline || []).some((e) => (e.min || 0) > 60 && e.station === 'off'), `${p.key} ${mode}: an hours-long fridge hold`);
    }
    const both = bsOrchestrate([oats, p], { mode: 'serve', kitchen: k1 });
    const alone = bsOrchestrate([p], { mode: 'serve', kitchen: k1 });
    // The oats are made first (two hands-on steps), then dinner lands on time.
    assert.equal(both.earliestServe - alone.earliestServe, 6, `${p.key}: the oats cost dinner ${both.earliestServe - alone.earliestServe} min`);
    assert.equal(both.coordinated, !(alone.issues || []).includes('stations'), `${p.key}: refused for a reason that is not its own kitchen`);
    if (both.coordinated) together++;
  }
  assert.equal(together, 90, 'the nine two-pan pastas are refused on one burner on their own account, and nothing else is');
});

test('a later table time still lands dinner on it, after the oats are made', () => {
  const oats = cook(OATS);
  const dinner = cook('Chickpea shakshuka');
  const earliest = bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1 }).earliestServe;
  const at = earliest + 10;
  const plan = bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1, serveAt: at });
  assert.equal(plan.coordinated, true);
  assert.equal(plan.serveAt, at, 'the table time the cook chose moved');
  assert.equal(plan.earliestServe, earliest);
  const ready = (plan.ready || []).find((d) => d.recipe === dinner.key);
  assert.ok(ready, `dinner has no ready time: ${JSON.stringify(plan.ready)}`);
  assert.equal(ready.readyAt, at, 'dinner is not ready at the table time');
  const starts = (key) => plan.timeline.filter((e) => e.recipe === key).map((e) => e.at);
  assert.equal(Math.min(...starts(dinner.key)), ready.start, 'the board and the ready line disagree on when dinner starts');
  assert.ok(Math.max(...starts(OATS)) < ready.start, 'dinner starts before the oats are in the fridge');
});

// CodeRabbit, on the final head: with only made-ahead dishes there is no inner plan to carry
// "too soon", so a table time inside the oats' own five minutes came back with no issue at all.
test('a table time too soon for the made-ahead dishes says so, with dinner or without', () => {
  const TOO_SOON = BS_SERVE_ISSUE.TOO_SOON;
  const soonCount = (plan) => (plan.issues || []).filter((x) => x === TOO_SOON).length;
  const oats = cook(OATS);
  const alone = bsOrchestrate([oats], { mode: 'serve', kitchen: k1 }).earliestServe;
  assert.ok(alone > 1, `the oats take no time: ${alone}`);
  assert.equal(soonCount(bsOrchestrate([oats], { mode: 'serve', kitchen: k1, serveAt: alone - 1 })), 1,
    'a time before the oats can be made is not called too soon');
  assert.equal(soonCount(bsOrchestrate([oats], { mode: 'serve', kitchen: k1, serveAt: alone })), 0);
  const dinner = cook('Chickpea shakshuka');
  const both = bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1 }).earliestServe;
  for (const at of [1, alone - 1, alone + 1, both - 1]) {
    assert.equal(soonCount(bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1, serveAt: at })), 1, `serve at ${at} of ${both}`);
  }
  for (const at of [both, both + 10]) {
    assert.equal(soonCount(bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1, serveAt: at })), 0, `serve at ${at} of ${both}`);
  }
  assert.equal(soonCount(bsOrchestrate([oats, dinner], { mode: 'serve', kitchen: k1 })), 0, 'no table time asked is never too soon');
});

test('the planner carries the make-ahead mark onto the step it schedules', () => {
  const plan = bsOrchestrate([cook(OATS), cook('Chickpea shakshuka')], { mode: 'together', kitchen: k1 });
  const chill = plan.timeline.find((e) => e.recipe === OATS && e.stepIndex === 1);
  assert.ok(chill, 'the chill step is not on the plan');
  assert.equal(chill.makeAhead, true, 'the board reads the mark off the event; without it the chill offers a countdown');
  assert.deepEqual(bsOfferedTimers(chill.text, chill), []);
});

// ── Driven ──────────────────────────────────────────────────────────────────────────────
const NO_LONG_WAIT = /240|4 hr|23\d:\d\d|Resting · Overnight/;

test('the one-dish walkthrough: no countdown, "Done · finish", and the morning steps at the end', () => {
  const c = bsCookableFromRecipe(raw(OATS));
  const s = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  s.click('Start cooking');
  assert.doesNotMatch(s.text, NO_LONG_WAIT);
  assert.ok(!s.buttons().some((b) => /^Start .*timer/.test(b.label)), 'a step still offers a timer');
  s.click('Done · next step');
  assert.doesNotMatch(s.text, NO_LONG_WAIT);
  assert.ok(!s.buttons().some((b) => /^Start .*timer/.test(b.label)), 'the chill step offers "Start 4 hr timer"');
  assert.ok(!s.buttons().some((b) => b.label === 'Done · plate it'), 'a dish for tomorrow is not plated tonight');
  s.click('Done · finish');
  assert.match(s.text, /When you’re ready to eat/);
  assert.match(s.text, /Made ahead\./, 'a jar for the morning is not "Plated."');
  assert.doesNotMatch(s.text, /Plated\./);
  assert.doesNotMatch(s.text, /Log what you ate/);
  for (const step of raw(OATS).steps.slice(2)) assert.ok(s.text.includes(step), `the morning step is missing: ${step.slice(0, 40)}`);
});

test('a board with the oats walks to the end without a fridge countdown anywhere', () => {
  const dishes = [cook(OATS), cook('Chickpea shakshuka')];
  const plan = bsOrchestrate(dishes, { mode: 'together', kitchen: k1 });
  assert.ok(Math.max(...plan.timeline.map((e) => e.at + (e.min || 3))) < 60, 'the plan still runs for hours');
  let finished = false;
  const s = drive(MOD.BSPrepCook, {
    items: [], timeline: plan.timeline, kitchen: k1,
    onClose() {}, onRecipePrepped() {}, onDone() { finished = true; },
  });
  const seen = [];
  // The harness does not interpolate "Start {t} timer", so a chip's duration is read off the
  // data-t its button carries.
  const longChips = () => s.nodes().filter((n) => n.type === 'button' && n.props.className === 'tbtn' && /hr|hour/i.test(String(n.props['data-t'] || '')));
  for (let guard = 0; guard < 60 && !finished; guard++) {
    assert.doesNotMatch(s.text, NO_LONG_WAIT, `step ${guard}`);
    assert.deepEqual(longChips().map((n) => n.props['data-t']), [], `step ${guard} offers an hours-long countdown`);
    const primary = s.nodes().find((n) => n.type === 'button' && n.props.className === 'btn-p');
    if (!primary) break;
    seen.push(textOf(primary).trim());
    if (!primary.props.disabled) { primary.props.onClick(); s.render(); continue; }
    // A real hold on the shakshuka (a simmer): call it done early, as a cook would.
    s.click('Done');
  }
  assert.ok(finished, `the board never reached the end: ${seen.join(' → ')}`);
  assert.ok(!seen.some((l) => /240/.test(l)), `a 240-minute hold was offered: ${seen.join(' → ')}`);
});

test('both timer sites ask bsOfferedTimers, so a make-ahead step offers no countdown anywhere', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  assert.match(client, /const stepTimers = hasMethod && phase === 'method' \? bsOfferedTimers\(steps\[stepIdx\], \(cookable\.stepMeta \|\| \[\]\)\[stepIdx\]\) : \[\];/);
  assert.match(client, /const evTms = ev && !isWindow \? bsOfferedTimers\(ev\.text, ev\) : \[\];/);
  assert.doesNotMatch(client, /\? bsStepTimers\((steps\[stepIdx\]|ev\.text)\)/, 'a timer site went back to the raw parser');
});

test('a session that cooked the oats ends on what is left for the morning', () => {
  const program = [{ meals: [{ id: 'o1', slot: 'Breakfast', title: OATS, kcal: 420, p: 20, c: 55, f: 12 }] }];
  const s = drive(MOD.BSPrepSession, { program, onClose() {} });
  s.click(OATS, pressable);
  if (s.buttons().some((b) => b.label.startsWith('Next: ingredients'))) s.click('Next: ingredients');
  s.click('Start cooking');
  if (s.buttons().some((b) => b.label.startsWith('Start this dish'))) s.click('Start this dish');
  const dish = s.nodes().find((n) => n.props && n.props.prep && typeof n.props.prep.onPrepped === 'function');
  assert.ok(dish, 'the session never handed the screen to the dish');
  assert.doesNotMatch(s.text, /When you’re ready to eat/, 'guard the guard: the list belongs to the wrap, not the cook');
  dish.props.prep.onPrepped([]);
  s.render();
  assert.match(s.text, /When you’re ready to eat/, 'the wrap does not say what is left for later');
  for (const step of raw(OATS).steps.slice(2)) assert.ok(s.text.includes(step), `the morning step is missing from the wrap: ${step.slice(0, 40)}`);
});

test('a plan with a make-ahead dish never claims its serve time is the proven earliest', () => {
  // Made first, end to end, is one plan that works. Measured on chicken + oats + salmon: 45
  // here, while one with the oats tucked into the chicken's hold serves at 39.
  const plan = bsOrchestrate([cook('One-pan chicken and rice'), cook(OATS), cook('Sheet-pan salmon, sweet potato and broccoli')], { mode: 'serve', kitchen: k1 });
  assert.equal(plan.coordinated, true);
  assert.equal(plan.exact, false);
});

test('setting the oats aside does not widen the order search of a big session', () => {
  // Seven dishes search by rotation; six search every order. Splitting the oats off a seven-
  // dish session used to plan the other six exhaustively: ~0.1 s became ~3.8 s per plan, and
  // the setup screen plans several times per change. Held on the planner's own count of the
  // placements it tried, not a stopwatch (review): 979 here, against 67,053 for the same six
  // dishes searched exhaustively.
  const set = ['Barley pilaf with mushrooms and celery', 'Tofu and edamame poke bowl', OATS, 'Chickpea shakshuka',
    'Tempeh and broccoli teriyaki', 'Miso-glazed cod with greens', 'Steak and sweet potato hash'].map(cook);
  for (const c of set) assert.ok(c.steps && c.steps.length, `${c.key} is not in the catalog`);
  const plan = bsOrchestrate(set, { mode: 'serve', kitchen: k1 });
  assert.equal(plan.exact, false);
  assert.equal(typeof plan.placements, 'number', 'the planner stopped reporting its search cost');
  assert.ok(plan.placements > 0 && plan.placements < 10000, `a seven-dish plan with the oats tried ${plan.placements} placements`);
});

test('the website finished screen does not ask a make-ahead dish to log what it ate', () => {
  // That note is drawn only beside the stove in the wide layout, which the driven harness does
  // not render, so the walkthrough above cannot see it (a mutation round found the gap).
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const notes = client.match(/\{kcalKnown[^?]*\? tr\('cook:ck\.burnersOffLog'/g) || [];
  assert.equal(notes.length, 1, 'expected the one wide finished-screen note');
  assert.match(notes[0], /\{kcalKnown && !finishesLater \? tr\('cook:ck\.burnersOffLog'/, 'a jar for the morning is told to log what it ate');
});

test('the wrap names the dishes that finished, not the first ones in plan order', () => {
  // The board finishes dishes in whatever order the cook does them (review): the wrap read the
  // first N dishes of the plan, so oats finished before the shakshuka showed the shakshuka's
  // tip and none of the oats' morning steps.
  const program = [{ meals: [
    { id: 's1', slot: 'Dinner', title: 'Chickpea shakshuka', kcal: 430, p: 22, c: 30, f: 20 },
    { id: 'o1', slot: 'Breakfast', title: OATS, kcal: 420, p: 20, c: 55, f: 12 },
  ] }];
  const s = drive(MOD.BSPrepSession, { program, onClose() {} });
  s.click('Chickpea shakshuka', pressable);
  s.click(OATS, pressable);
  if (s.buttons().some((b) => b.label.startsWith('Set up your kitchen'))) s.click('Set up your kitchen');
  if (s.buttons().some((b) => b.label.startsWith('Next: ingredients'))) s.click('Next: ingredients');
  s.click('Start cooking');
  const board = s.nodes().find((n) => n.props && typeof n.props.onRecipePrepped === 'function' && Array.isArray(n.props.items));
  assert.ok(board, `the session did not hand the screen to the board: ${s.buttons().map((b) => b.label).join(' | ')}`);
  const oats = board.props.items.find((it) => it.cookable.title === OATS);
  const shakshuka = board.props.items.find((it) => it.cookable.title === 'Chickpea shakshuka');
  assert.ok(board.props.items.indexOf(shakshuka) < board.props.items.indexOf(oats), 'guard the guard: the oats must not be first in plan order');
  board.props.onRecipePrepped(oats);
  board.props.onDone([], null);
  s.render();
  assert.match(s.text, /When you’re ready to eat/, 'the finished oats lost their morning steps');
  const tip = raw('Chickpea shakshuka').tip;
  if (tip) assert.ok(!s.text.includes(tip), 'the unfinished shakshuka\'s tip is on the wrap');
});

test('the voice switch still flips when storage refuses the write', () => {
  // Private mode or a full quota makes setItem throw (review); the switch snapped back to
  // whatever storage still said.
  const store = new Map();
  const real = globalThis.localStorage;
  let refuse = true;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: (k) => store.delete(k), clear: () => store.clear(),
  };
  const realVoice = globalThis.ShapeVoice;
  globalThis.ShapeVoice = { speak: async () => ({ ok: true }), stop() {} };
  try {
    const s = drive(MOD.BSPrepSession, { program: [{ meals: [{ id: 'o1', slot: 'Breakfast', title: OATS, kcal: 420, p: 20, c: 55, f: 12 }] }], onClose() {} });
    const sw = () => s.nodes().find((n) => n.type === 'button' && n.props.role === 'switch');
    assert.ok(sw(), 'no voice switch on the session screen');
    assert.equal(sw().props['aria-checked'], false);
    sw().props.onClick(); s.render();
    assert.equal(sw().props['aria-checked'], true, 'the switch snapped back after a refused write');
    refuse = false;
    sw().props.onClick(); s.render();
    assert.equal(sw().props['aria-checked'], false);
    assert.equal(store.get('shape.cookReads'), '0', 'a write that succeeds is stored again');
  } finally {
    globalThis.localStorage = real;
    globalThis.ShapeVoice = realVoice;
  }
});
