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
import { bsOrchestrate } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsPrepEstimate } from '../mobile-app/src/services/mealPrep.mjs';
import { drive, loadBroadsheet, textOf } from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepCook']);
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
  for (let guard = 0; guard < 60 && !finished; guard++) {
    assert.doesNotMatch(s.text, NO_LONG_WAIT, `step ${guard}`);
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
