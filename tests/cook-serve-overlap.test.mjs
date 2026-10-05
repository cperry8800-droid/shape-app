// "Ready at the same time" refused dishes the planner could land together (owner, 2026-10-04:
// "Both dishes need your hands at the same time ... why is this?"). Two search defects, both
// in cookOrchestrator.mjs, each picking a plan the sheet refuses while one it accepts was in
// hand:
//   - bestPlacement took the FIRST order that fit at the serve time, overlapping or not, so a
//     later serve time could turn a plan that landed together into a refusal;
//   - phaseSchedule ranked the orders it searched by gap alone, so a smaller gap whose dishes
//     do not overlap beat a slightly larger one whose dishes do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsOrchestrate } from '../mobile-app/src/services/cookOrchestrator.mjs';
import { bsCookableFromRecipe } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const kitchen = { stove: 1, oven: 1, board: 1 };
const recipes = SHAPE_KITCHEN_RECIPES
  .map((r) => ({ key: r.title, ...bsCookableFromRecipe(r) }))
  .filter((c) => c.steps && c.steps.length);
const byTitle = (title) => {
  const c = recipes.find((r) => r.key === title);
  assert.ok(c, `no catalog recipe ${title}`);
  return c;
};
const serve = (dishes, serveAt) => bsOrchestrate(dishes, { mode: 'serve', kitchen, ...(serveAt ? { serveAt } : {}) });

test('a later serve time never turns a plan that lands together into a refusal', () => {
  // MEASURED before the fix: of the 1,928 catalog pairs that land together at their earliest
  // time on a one-burner kitchen, 253 were refused at some later time (+1, +5, +10, +20 or
  // +45 min). The first order still fit there, it just no longer overlapped.
  let together = 0;
  const flips = [];
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      const pair = [recipes[i], recipes[j]];
      const first = serve(pair);
      if (first.coordinated !== true) continue;
      together++;
      for (const later of [1, 5, 10, 20, 45]) {
        if (serve(pair, first.earliestServe + later).coordinated !== true) { flips.push(`${pair[0].key} + ${pair[1].key} @ +${later}`); break; }
      }
    }
  }
  assert.ok(together > 1500, `the sweep lost its corpus (${together} pairs)`);
  assert.deepEqual(flips.slice(0, 5), [], `${flips.length} pairs refused at a later serve time`);
});

test('the worked case: one-pan chicken + tofu poke bowl lands together ten minutes later too', () => {
  const pair = [byTitle('One-pan chicken and rice'), byTitle('Tofu and edamame poke bowl')];
  const earliest = serve(pair).earliestServe;
  for (const t of [earliest, earliest + 5, earliest + 10, earliest + 30]) {
    const plan = serve(pair, t);
    assert.equal(plan.coordinated, true, `refused at ${t} (earliest ${earliest})`);
    assert.equal(plan.serveAt, t);
  }
});

test('an order whose dishes overlap is chosen over a smaller gap whose dishes do not', () => {
  // Each was refused before the fix while an overlapping order existed.
  for (const titles of [
    ['One-pan chicken and rice', 'Shrimp and quinoa harvest bowl', 'Quinoa rainbow Buddha bowl'],
    ['One-pan chicken and rice', 'Black skillet beef with kale and red potatoes', 'Turkey tetrazzini bake'],
  ]) {
    const plan = serve(titles.map(byTitle));
    assert.equal(plan.invalidTiming, undefined);
    assert.equal(plan.coordinated, true, `refused: ${titles.join(' + ')}`);
  }
});

test('three or more dishes are never told "Both dishes"', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const at = client.indexOf("orch.coordinated === false && !orch.invalidTiming ? <p className=\"warn\"");
  assert.ok(at > 0, 'the refusal moved');
  const site = client.slice(at, client.indexOf('</p> : null}', at));
  assert.match(site, /ordered\.length > 2\s*\?\s*\(serveNeedsRoom\s*\?\s*tr\('cook:ck\.serveNeedsRoomMany'[\s\S]*tr\('cook:ck\.serveNeedsHandsMany'[\s\S]*:\s*serveNeedsRoom\s*\?\s*tr\('cook:ck\.serveNeedsRoom'[\s\S]*tr\('cook:ck\.serveNeedsHands'/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(new URL(`../mobile-app/src/i18n/catalogs/${loc}/cook.json`, import.meta.url), 'utf8'));
    for (const k of ['ck.serveNeedsRoomMany', 'ck.serveNeedsHandsMany']) assert.ok(cat[k] && cat[k] !== cat[k.replace('Many', '')], `${loc}:${k}`);
  }
  const en = JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/en/cook.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(en['ck.serveNeedsHandsMany'] + en['ck.serveNeedsRoomMany'], /\bboth\b/i);
});
