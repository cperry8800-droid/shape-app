// A dish's colour on the cook screens is its own recipe card's hue — the colours the approved
// burners-and-tracks preview drew — on every surface that draws it. The fixed set stays the
// fallback for a dish with no card (tests/cook-board.test.mjs covers the rule itself); what
// these check is that the screens actually USE it: a rule that is right and unused is how the
// preview's red steak and amber chicken came out brown and blue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drive, pressable, loadBroadsheet, importSibling, THEME } from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSCookMode', 'BSPrepSession']);
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');
const { bsCookableFromRecipe } = await importSibling('..', 'services', 'cookable.mjs');
const { bsDishColors, bsHeroHue, BS_DISH_COLORS } = await importSibling('..', 'services', 'cookBoard.mjs');

const recipe = (title) => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === title);
  assert.ok(r, `catalog no longer has "${title}" — repin this test, do not delete it`);
  return r;
};
const colorsOn = (s) => s.nodes().map((n) => n.props && n.props.style && n.props.style['--c']).filter(Boolean);
const own = (titles) => bsDishColors(titles.map((t) => bsHeroHue(recipe(t).hero)), THEME.isLight, THEME.PAPER2);

test('one dish: the step card and the tracks wear the dish\'s own card colour', () => {
  const steak = 'Steak and sweet potato hash';
  const s = drive(MOD.BSCookMode, { cookable: bsCookableFromRecipe(recipe(steak)), onClose() {} });
  s.click('Start cooking');
  const [expected] = own([steak]);
  assert.equal(expected, '#c95a3c', 'guard the guard: the steak card is red');
  const used = colorsOn(s);
  assert.ok(used.length > 0, 'nothing on the cook screen carries a dish colour');
  assert.ok(used.includes(expected), `the steak is not drawn in its own colour: ${JSON.stringify([...new Set(used)])}`);
  assert.ok(!used.includes(BS_DISH_COLORS.light[0]), 'the steak fell back to the fixed set although its card has a colour');
});

test('picked dishes are drawn in their own colours before the cook starts', () => {
  const titles = ['Steak and sweet potato hash', 'One-pan chicken and rice'];
  const program = [{ meals: titles.map((title, i) => ({ id: `c${i}`, slot: 'Dinner', title, kcal: 600, p: 40, c: 50, f: 20 })) }];
  const s = drive(MOD.BSPrepSession, { program, onClose() {} });
  for (const title of titles) s.click(title, pressable);
  const used = new Set(colorsOn(s));
  for (const c of own(titles)) assert.ok(used.has(c), `a picked dish is not drawn in its own colour ${c}: ${JSON.stringify([...used])}`);
});
