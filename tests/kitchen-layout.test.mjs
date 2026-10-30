// A nutritionist's kitchen layout (owner, 2026-10-30: "lets show a kitchen layout, like we did for
// trainers"): the kitchen's room, starting layout and pieces in mobile-app/src/services/studioKit.mjs,
// how a recipe's words land on its spots (coachWork.mjs's bsKitchenWork), and the sample
// nutritionist's layout. The page that draws it is mounted in tests/nutritionist-profile.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDIO_KIT, STUDIO_GROUPS, KITCHEN_GROUPS, KITCHEN_COACH_KINDS, STUDIO_ROOMS, STUDIO_WORDS,
  bsStudioFromTemplate, bsStudioFrame, bsStudioSpot, bsStudioTypesIn, bsStudioSvg,
} from '../mobile-app/src/services/studioKit.mjs';
import { bsRecipeKitchenUses, bsKitchenWork } from '../mobile-app/src/services/coachWork.mjs';
import { BS_STUDIO_KINDS, BS_STUDIO_W, BS_STUDIO_H, bsProfileStudio, bsStudioItem } from '../mobile-app/src/services/profileCustom.mjs';
import { bsNutritionistDemo, BS_NUTRI_SAMPLE_KINDS } from '../mobile-app/src/services/nutritionistDemo.mjs';

const decode = (uri) => decodeURIComponent(uri.replace('data:image/svg+xml,', ''));
const recipe = (id, t, steps = [], ing = []) => ({ id, t, steps, ing: ing.map((m) => ({ n: '1', m })) });

test('the kitchen layout is a valid stored studio, its stations named, its spots on the plan', () => {
  for (const kind of KITCHEN_COACH_KINDS) {
    assert.ok(BS_STUDIO_KINDS.includes(kind), `${kind} is a kind the doc keeps`);
    assert.ok(STUDIO_ROOMS[kind], `${kind} has a room`);
  }
  const items = bsStudioFromTemplate('kitchen');
  for (const p of items) assert.deepEqual(bsStudioItem(p), p, `${JSON.stringify(p)} survives the normalizer as it is`);
  assert.equal(bsProfileStudio({ kind: 'kitchen', items }).items.length, items.length);
  assert.equal(bsProfileStudio({ kind: 'kitchen', items }).kind, 'kitchen');
  assert.deepEqual(items.filter((p) => p.st).map((p) => p.st.title), ['Fridge', 'Pantry', 'Stove', 'Oven', 'Prep island', 'The table']);
  for (const p of items) {
    const [sx, sy] = bsStudioSpot(p);
    assert.ok(sx >= 0 && sx <= BS_STUDIO_W && sy >= 0 && sy <= BS_STUDIO_H, 'a spot on the plan');
    for (const k of [p.st && p.st.title, p.label, p.tag].filter(Boolean)) assert.ok(Object.values(STUDIO_WORDS).includes(k), k);
  }
});

test('a kitchen draws only its room: the frame holds the room, its door and every piece', () => {
  const items = bsStudioFromTemplate('kitchen');
  const [fx, fy, fw, fh] = bsStudioFrame({ kind: 'kitchen', items });
  assert.ok(fx >= 0 && fy >= 0 && fx + fw <= BS_STUDIO_W && fy + fh <= BS_STUDIO_H);
  assert.ok(fh < BS_STUDIO_H * 0.75, `a kitchen is shorter than the plan (${fh})`);
  const [rx, ry, rw, rh] = STUDIO_ROOMS.kitchen.room;
  assert.ok(fx <= rx && fy <= ry && fx + fw >= rx + rw && fy + fh >= ry + rh, 'the room inside');
  for (const p of items) assert.ok(p.x >= fx && p.y >= fy && p.x + p.w <= fx + fw && p.y + p.h <= fy + fh, `${p.t} inside`);
  // A piece dragged below the room widens the frame to keep it.
  const low = [...items, { t: 'fridge', x: 20, y: 470, w: 36, h: 40 }];
  assert.ok(bsStudioFrame({ kind: 'kitchen', items: low })[3] >= 510 - fy);
});

test('the kitchen and office pieces are listed once each for a nutritionist, and the oven draws', () => {
  const listed = KITCHEN_GROUPS.flatMap(([slug]) => bsStudioTypesIn(slug));
  assert.equal(new Set(listed).size, listed.length);
  for (const t of ['counter', 'island', 'range', 'oven', 'fridge', 'sink', 'pantry', 'table', 'blender', 'board', 'sofa']) assert.ok(listed.includes(t), t);
  assert.ok(!STUDIO_GROUPS.flatMap(([slug]) => bsStudioTypesIn(slug)).includes('oven'), 'not in a trainer\'s list');
  assert.equal(STUDIO_KIT.oven[0], 'Oven');
  assert.match(decode(bsStudioSvg('oven', 34, 32, { accent: '#c8881a' })), /rgba\(200,136,26,/);
});

test('a recipe lands on the spots its own words use', () => {
  assert.deepEqual(bsRecipeKitchenUses(recipe('a', 'Sheet-pan salmon', ['Roast everything on one tray for 25 minutes.'])), ['oven']);
  assert.deepEqual(bsRecipeKitchenUses(recipe('b', 'Stir-fry', ['Sear the chicken in a hot pan.', 'Chop the peppers.'])), ['range', 'board']);
  assert.deepEqual(bsRecipeKitchenUses(recipe('c', 'Overnight oats', ['Leave in the fridge.'], ['rolled oats'])), ['fridge', 'pantry']);
  assert.deepEqual(bsRecipeKitchenUses(recipe('d', 'Berry smoothie', ['Blend until smooth.'], ['fresh mint'])), ['blender', 'herbs']);
  assert.deepEqual(bsRecipeKitchenUses(recipe('e', 'Toast')), [], 'nothing it names, nothing lit');
  assert.deepEqual(bsRecipeKitchenUses(null), []);
});

test("a recipe written in any of the app's languages lands on its spots too (#2516's open item)", () => {
  // One recipe per language: its method's words light the spots, its ingredients the pantry and herbs.
  const cases = [
    ['de', recipe('de', 'Ofengemüse', ['Den Backofen vorheizen und das Gemüse 25 Minuten rösten.'], ['Basilikum']), ['oven', 'herbs']],
    ['es', recipe('es', 'Lentejas', ['Enjuague las lentejas y sofría la cebolla en una sartén.'], ['lentejas']), ['range', 'sink', 'pantry']],
    ['fr', recipe('fr', 'Soupe', ['Mixez la soupe puis gardez-la au frais.'], ['persil']), ['blender', 'fridge', 'herbs']],
    ['it', recipe('it', 'Pane', ['Pesate la farina e infornate per 30 minuti.'], ['farina']), ['oven', 'scale', 'pantry']],
    ['pt-BR', recipe('pt', 'Salada', ['Pique a cebola e o coentro.'], ['coentro']), ['board', 'herbs']],
    ['id', recipe('id', 'Tumis', ['Tumis bawang di wajan, lalu iris cabai.'], ['beras']), ['range', 'board', 'pantry']],
    ['ha', recipe('ha', 'Kaza', ['Gasa kaza a tanda, sannan ka yanka albasa.'], ['shinkafa']), ['oven', 'board', 'pantry']],
    ['ru', recipe('ru', 'Курица', ['Обжарьте курицу на сковороде.', 'Нарежьте лук.'], ['рис']), ['range', 'board', 'pantry']],
    ['uk', recipe('uk', 'Каша', ['Залиште на ніч у холодильнику.'], ['вівсяні пластівці']), ['fridge', 'pantry']],
    ['tr', recipe('tr', 'Sebze', ['Domatesleri doğrayın ve fırında pişirin.'], ['maydanoz']), ['oven', 'board', 'herbs']],
    ['vi', recipe('vi', 'Gà', ['Ướp gà qua đêm trong tủ lạnh rồi chiên trong chảo.'], ['gạo']), ['range', 'fridge', 'pantry']],
  ];
  for (const [loc, r, uses] of cases) assert.deepEqual(bsRecipeKitchenUses(r), uses, loc);
  // Words that look like a spot's and are not: a fork, a hob, a stove's burner, a spicy note, a
  // nutrition balance, the Thai in a dish's name, "definitely".
  const none = [
    ['fr', 'Servir avec une fourchette.'], ['es', 'Encienda la hornilla.'], ['es', 'Una salsa picante.'],
    ['vi', 'Một bữa ăn cân bằng.'], ['tr', 'Kesinlikle lezzetli.'],
  ];
  for (const [loc, words] of none) assert.ok(!bsRecipeKitchenUses(recipe(loc, 'x', [words])).some((u) => ['oven', 'board', 'scale'].includes(u)), `${loc}: ${words}`);
  assert.deepEqual(bsRecipeKitchenUses(recipe('it2', 'x', ['Accendete il fornello.'])), ['range'], 'it: a burner is the stove, not the oven');
  // A word only counts whole or as a stem's start: "pesto" weighs nothing, "Hackfleisch" is chopped.
  assert.deepEqual(bsRecipeKitchenUses(recipe('it3', 'x', ['Aggiungete il pesto.'])), []);
  // The twelve languages' words also run over English recipes: none of them may light a spot there.
  assert.deepEqual(bsRecipeKitchenUses(recipe('en', 'Tagliatelle marinara', ['Toss a couple of handfuls of mixed greens with the tagliatelle.', 'A balanced plate: lavender to finish.'])), [],
    'en: couple, mixed, tagliatelle, marinara, balanced, lavender');
  assert.deepEqual(bsRecipeKitchenUses(recipe('es2', 'x', ['Cocine en tandas.', 'Mire la tabla nutricional.'])), [], 'es: tandas, tabla');
  assert.deepEqual(bsRecipeKitchenUses(recipe('fr2', 'x', [], ['un oignon'])), [], 'fr: un is not flour');
  assert.deepEqual(bsRecipeKitchenUses(recipe('vi2', 'Cà ri gà kiểu Thái')), [], 'vi: Thái is Thai, not sliced');
});

test('each spot holds the recipes made there; a missing piece hands its recipes on; a surface holds what stands on it', () => {
  const items = bsStudioFromTemplate('kitchen');
  const at = (t) => items.findIndex((p) => p.t === t);
  const list = [
    recipe('r1', 'Sheet-pan salmon', ['Roast on a tray.']),
    recipe('r2', 'Chicken and rice', ['Sear the chicken in a pan.', 'Dice the onion.'], ['rice']),
  ];
  const w = bsKitchenWork({ kind: 'kitchen', items }, list);
  assert.equal(w.length, items.length);
  assert.deepEqual(w[at('oven')].recipes.map((r) => r.id), ['r1']);
  assert.deepEqual(w[at('range')].recipes.map((r) => r.id), ['r2']);
  assert.deepEqual(w[at('pantry')].recipes.map((r) => r.id), ['r2']);
  assert.deepEqual(w[at('board')].recipes.map((r) => r.id), ['r2']);
  assert.deepEqual(w[at('island')].recipes.map((r) => r.id), ['r2'], 'the board stands on the island');
  assert.equal(w[at('table')], null, 'nothing cooked at the table');
  // No oven on the plan: roasting goes to the stove.
  const noOven = items.filter((p) => p.t !== 'oven');
  const w2 = bsKitchenWork({ kind: 'kitchen', items: noOven }, list);
  assert.deepEqual(w2[noOven.findIndex((p) => p.t === 'range')].recipes.map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(bsKitchenWork(null, list), []);
  assert.deepEqual(bsKitchenWork({ items }, null).filter(Boolean), []);
});

test('every sample nutritionist has the kitchen layout, a note at each station, said through the translator', () => {
  for (const kind of BS_NUTRI_SAMPLE_KINDS) {
    const asked = [];
    const d = bsNutritionistDemo({ kind, say: (k, en) => { asked.push(k); return `«${en}»`; }, word: (k) => `‹${k}›` });
    const plan = bsProfileStudio(d.custom.studio);
    assert.equal(plan.kind, 'kitchen', kind);
    const stations = plan.items.filter((p) => p.st);
    assert.equal(stations.length, 6);
    assert.ok(stations.every((p) => /^‹\w+›$/.test(p.st.title)), 'station names through `word`');
    assert.ok(stations.every((p) => /^«.+»$/.test(p.st.note)), 'station notes through `say`');
    for (const k of ['fridge', 'pantry', 'stove', 'oven', 'prepIsland', 'kitchenTable']) assert.ok(asked.includes('profile:sample.nutri.station.' + k), k);
    // Its recipes light the plan.
    assert.ok(bsKitchenWork(plan, d.custom.kitchen.recipes).filter(Boolean).length >= 3, `${kind}: recipes on the plan`);
  }
});
