// A nutritionist's meal plan in the website builder's document (Nora's drafts, and every plan made on
// the website), edited and assigned in the app (owner, 2026-11-04: "A meal plan Nora drafts for a
// nutritionist can only be edited and assigned on the website, not in the app … can you fix these and
// make them possible?").
//
// The edits (mobile-app/src/services/mealBuilderEdit.mjs) run on the website builder's own core
// (public/newdesign/dashMealCore.js), and the screen (BSMealBuilderEditor.jsx) is the shipping module,
// mounted in jsdom: swap, add and take off meals from Shape's foods, set the targets, Save writes the
// document back, Assign hands on the saved plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { mealBuilderDoc, dayTotals, hasVariants, foodsFor, swapMeal, removeMeal, addMeal, setTarget, mealPlanMeta, assignmentDays } from '../mobile-app/src/services/mealBuilderEdit.mjs';
import { cleanMealBrief, pickMeals, buildMealDoc } from '../src/lib/ai/mealDraft.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The window first: the builder core puts itself on it (window.DashMeals), as in the app.
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const M = require_('../public/newdesign/dashMealCore.js');
const clone = (o) => JSON.parse(JSON.stringify(o));

// A plan as Nora saves it: three days, four meals each, no dairy.
const brief = cleanMealBrief({ goalPhase: 'cut', days: 3, exclude: ['dairy'] });
const NORA = buildMealDoc(brief, pickMeals(brief), 'plan-1');
// And one with every meal of the day (no dairy leaves no breakfast in Shape's library).
const fullBrief = cleanMealBrief({ goalPhase: 'cut', days: 3 });
const FULL = buildMealDoc(fullBrief, pickMeals(fullBrief), 'plan-2');
const food = (id) => M.FOODS.find((f) => f.id === id);

test('a builder document is recognised; anything else is not one', () => {
  assert.equal(mealBuilderDoc({ mealBuilder: NORA }), NORA);
  for (const d of [null, {}, { mealBuilder: null }, { mealBuilder: { days: [] , targets: {} } }, { mealBuilder: { days: [{ name: 'A' }], targets: {} } }, { mealBuilder: { days: [{ slots: [] }] } }, { buildType: 'mealplan', blocks: [] }, []]) {
    assert.equal(mealBuilderDoc(d), null, JSON.stringify(d));
  }
});

test('a swap is a library food in the same slot and id; a rest day still following it follows, one that overrides it keeps its own', () => {
  const doc = clone(FULL);
  assert.equal(doc.days[0].slots[0].slot, 'Breakfast', 'a slot the builder would not default to');
  const day = doc.days[0];
  const [first, second] = day.slots;
  day.variants = { rest: { overrides: { [second.id]: { ...second, name: 'Rest-day plate' } }, extras: [] } };
  const out = swapMeal(M, doc, 0, first.id, food('f9'));
  assert.equal(out.days[0].slots[0].slot, 'Breakfast', 'the same slot');
  assert.notEqual(out, doc, 'a new document');
  assert.equal(doc.days[0].slots[0].name, first.name, 'the old one untouched');
  const swapped = out.days[0].slots[0];
  assert.equal(swapped.id, first.id);
  assert.equal(swapped.slot, first.slot);
  assert.deepEqual([swapped.name, swapped.kcal, swapped.p, swapped.c, swapped.f], ['Tofu stir-fry + rice', 580, 34, 72, 16], 'the library\'s own numbers');
  const rest = M.resolveDay(out.days[0], 'rest');
  assert.equal(rest[0].name, 'Tofu stir-fry + rice', 'the rest day followed the base meal');
  assert.equal(rest[1].name, 'Rest-day plate', 'its own override stays');
  assert.equal(swapMeal(M, doc, 0, 'nope', food('f9')), doc, 'no such meal: unchanged');
  assert.equal(swapMeal(M, doc, 7, first.id, food('f9')), doc, 'no such day: unchanged');
});

test('a meal taken off goes from the day and from any override of it; a meal added lands after its slot', () => {
  const doc = clone(FULL);
  const [b, l] = doc.days[1].slots;
  assert.deepEqual(doc.days[1].slots.map((m) => m.slot), ['Breakfast', 'Lunch', 'Dinner', 'Snack']);
  doc.days[1].variants = { rest: { overrides: { [l.id]: null }, extras: [] } };
  const out = removeMeal(doc, 1, l.id);
  assert.deepEqual(out.days[1].slots.map((m) => m.id), doc.days[1].slots.filter((m) => m.id !== l.id).map((m) => m.id));
  assert.deepEqual(out.days[1].variants.rest.overrides, {}, 'no override of a meal that is gone');
  assert.equal(removeMeal(doc, 1, 'nope'), doc);
  // The day's order: Breakfast, Lunch, Dinner, Snack. A second breakfast follows the first.
  const added = addMeal(M, doc, 1, food('f3'), 'Breakfast');
  assert.deepEqual(added.days[1].slots.map((m) => m.slot), ['Breakfast', 'Breakfast', 'Lunch', 'Dinner', 'Snack']);
  assert.equal(added.days[1].slots[1].name, '3-egg omelette + toast');
  assert.notEqual(added.days[1].slots[1].id, b.id, 'its own id');
  const snack = addMeal(M, doc, 1, food('f14'), 'Snack');
  assert.equal(snack.days[1].slots[snack.days[1].slots.length - 1].name, 'Apple + peanut butter');
  const empty = { ...clone(NORA), days: [{ name: 'Day A', slots: [], variants: {} }] };
  assert.equal(addMeal(M, empty, 0, food('f5'), 'Lunch').days[0].slots.length, 1, 'onto an empty day');
});

test('targets take a whole number in range; Shape\'s foods keep to what the plan leaves out', () => {
  const doc = clone(NORA);
  assert.equal(setTarget(doc, 'kcal', '2050').targets.kcal, 2050);
  assert.equal(setTarget(doc, 'p', 171.6).targets.p, 172);
  for (const [k, v] of [['kcal', '300'], ['kcal', ''], ['kcal', 'abc'], ['p', 9999], ['x', 10], ['f', doc.targets.f]]) assert.equal(setTarget(doc, k, v), doc, `${k}=${v}`);
  const foods = foodsFor(M, doc, '');
  assert.ok(foods.length > 0);
  assert.ok(foods.every((f) => !f.tags.includes('dairy')), 'no dairy on a no-dairy plan');
  assert.deepEqual(foodsFor(M, doc, 'salmon').map((f) => f.id), ['f6']);
  assert.equal(mealPlanMeta(M, doc), `${doc.targets.kcal} kcal · Cut`, 'the website builder\'s line');
  assert.equal(hasVariants(doc), false);
  assert.equal(hasVariants({ days: [{ slots: [], variants: { rest: { overrides: {}, extras: [] } } }] }), true);
});

test('Assign sends the week the website\'s Assign sends, its grocery edits included', () => {
  const doc = { ...clone(NORA), groceryEdits: { 'rice|g': { remove: true } } };
  const days = assignmentDays(M, doc);
  assert.deepEqual(days, M.buildMealAssignment(doc, { scale: 1, groceryEdits: doc.groceryEdits }).days);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.dow), [0, 1, 2, 3, 4, 5, 6], 'Monday first, as the app numbers its days');
  assert.ok(days.every((d) => d.meals.length && d.meals.every((m) => m.kcal > 0 && Array.isArray(m.ingredients))), 'every meal with its numbers and ingredients');
  assert.ok(days.every((d) => d.meals.every((m) => !m.ingredients.some((i) => /rice/i.test(i.name) && !/cakes/i.test(i.name)))), 'the edit rides the ingredients');
  assert.equal(days[0].targets.cal, doc.targets.kcal);
  assert.equal(dayTotals(M, doc.days[0]).kcal, M.mealsTotals(doc.days[0].slots).kcal);
});

// ── The screen ─────────────────────────────────────────────────────────────────────
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { IntlMessageFormat } = require_('intl-messageformat');
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = { t: (key, opts = {}) => { const msg = key.startsWith('coach:') ? CATALOG[key.slice(6)] : null; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); } };
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', RULE: '#ccc', RUST: '#c0533b', padX: 18, isLight: true };
W.useBS = () => theme;
W.BSMastRow = () => React.createElement('div', { 'data-mast': '' });
W.BSBackRow = ({ onBack, trailing }) => React.createElement('div', null, React.createElement('button', { type: 'button', 'data-back': '', onClick: onBack }, 'Back'), trailing);

const { default: Editor } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSMealBuilderEditor.jsx'), { registry: new Map([['react', React]]) });
assert.equal(W.DashMeals, M, 'the builder core is on the window');
assert.match(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSMealBuilderEditor.jsx'), 'utf8'), /^import '\.\.\/\.\.\/\.\.\/public\/newdesign\/dashMealCore\.js'; \/\/ → window\.DashMeals/m, 'and the editor loads it in the app');

async function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(Editor, props)); });
  const q = (sel) => host.querySelector(sel);
  const qa = (sel) => [...host.querySelectorAll(sel)];
  const click = async (el) => { assert.ok(el, 'no such element'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); };
  const type = async (el, value) => {
    const set = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { set.call(el, value); el.dispatchEvent(new W.Event('input', { bubbles: true })); });
  };
  const blur = async (el) => { await React.act(async () => { el.dispatchEvent(new W.FocusEvent('focusout', { bubbles: true })); }); };
  return { host, q, qa, click, type, blur, text: () => host.textContent, close: async () => { await React.act(async () => root.unmount()); host.remove(); } };
}
const PLAN = { id: 'plan-1', name: 'Cut · 3-day rotation', meta: '3-day rotation · 1900 kcal', published: false, detail: { mealBuilder: NORA, groceryEdits: null } };

test('the editor: the plan\'s name, targets, days and meals; swap, take off and add, each from Shape\'s foods', async () => {
  const m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {} });
  try {
    assert.equal(m.q('input[aria-label="Plan name"]').value, 'Cut · 3-day rotation');
    assert.deepEqual(m.qa('[data-meal-target]').map((i) => i.value), ['1900', '165', '170', '60'].map((v, i) => String(NORA.targets[['kcal', 'p', 'c', 'f'][i]])));
    assert.deepEqual(m.qa('[data-meal-day]').map((b) => b.textContent), NORA.days.map((d) => d.name));
    assert.equal(m.qa('[data-meal-row]').length, NORA.days[0].slots.length);
    const tot = M.mealsTotals(NORA.days[0].slots);
    assert.equal(m.q('[data-meal-day-total]').textContent, `${tot.kcal} of ${NORA.targets.kcal} kcal · ${tot.p} of ${NORA.targets.p} g protein`);
    assert.equal(m.q('[data-meal-save]').disabled, true, 'nothing to save yet');
    // Swap the first meal: the picker lists Shape's foods within the plan's rules.
    const first = NORA.days[0].slots[0];
    await m.click(m.q(`[data-meal-swap="${first.id}"]`));
    assert.ok(m.q('[data-meal-picker]'));
    assert.match(m.text(), new RegExp(`Swap ${first.name.replace(/[+()]/g, '\\$&')}`));
    assert.ok(!m.q('[data-meal-food="f1"]'), 'Greek yogurt is dairy: not offered on a no-dairy plan');
    await m.type(m.q('input[type="search"]'), 'tofu');
    await m.click(m.q('[data-meal-food="f9"]'));
    assert.ok(!m.q('[data-meal-picker]'), 'back on the day');
    assert.match(m.q(`[data-meal-row="${first.id}"]`).textContent, /Tofu stir-fry \+ rice/);
    assert.equal(m.q('[data-meal-save]').disabled, false);
    // Take one off, then add a snack.
    const gone = NORA.days[0].slots[1];
    await m.click(m.q(`[data-meal-remove="${gone.id}"]`));
    assert.ok(!m.q(`[data-meal-row="${gone.id}"]`));
    await m.click(m.q('[data-meal-add]'));
    await m.click(m.q('[data-meal-slot="Snack"]'));
    await m.click(m.q('[data-meal-food="f14"]'));
    assert.match(m.qa('[data-meal-row]').map((r) => r.textContent).join('|'), /Apple \+ peanut butter/);
    // Another day keeps its own meals.
    await m.click(m.q('[data-meal-day="1"]'));
    assert.equal(m.qa('[data-meal-row]').length, NORA.days[1].slots.length);
  } finally { await m.close(); }
});

test('the editor: Save writes the document back, merged into the plan; a target out of range goes back', async () => {
  const calls = [];
  const saved = [];
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }; } };
  const m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {}, onSaved: (row) => saved.push(row) });
  try {
    const kcal = m.q('[data-meal-target="kcal"]');
    await m.type(kcal, '300');
    await m.blur(kcal);
    assert.equal(kcal.value, String(NORA.targets.kcal), 'out of range: the target it had');
    await m.type(kcal, '2050');
    await m.blur(kcal);
    await m.type(m.q('input[aria-label="Plan name"]'), 'Spring cut');
    await m.click(m.q('[data-meal-save]'));
    assert.equal(calls.length, 1);
    const body = calls[0];
    assert.deepEqual(Object.keys(body).sort(), ['detail', 'expectedOwnerId', 'expectedRevision', 'id', 'meta', 'name']);
    assert.equal(body.id, 'plan-1');
    assert.equal(body.expectedRevision, 0, 'the revision it opened: a plan saved with none (Codex on #2594)');
    assert.equal(body.name, 'Spring cut');
    assert.equal(body.expectedOwnerId, 'nutri-1');
    assert.deepEqual(Object.keys(body.detail), ['mealBuilder'], 'only the document: the route merges it over the stored detail');
    assert.equal(body.detail.mealBuilder.targets.kcal, 2050);
    assert.deepEqual(body.detail.mealBuilder.days, NORA.days, 'the days as they were');
    assert.equal(body.meta, '2050 kcal · Cut');
    assert.equal(saved.length, 1);
    assert.match(m.text(), /Saved/);
    assert.equal(NORA.targets.kcal, 1900, 'the plan handed in is never written to');
  } finally { await m.close(); delete W.ShapeCoachPlans; }
});

test('the editor: Save names the revision it opened, the saved one after a save; a plan changed since is refused and the edits stay (Codex on #2594)', async () => {
  const calls = [];
  let rev = 4;
  let refuse = false;
  W.ShapeCoachPlans = { update: async (body) => {
    calls.push(body);
    if (refuse) throw new Error('This plan changed on another device. Keep your draft, refresh the library, and review the latest version.');
    rev += 1;
    return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail, revision: rev } };
  } };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  // Rendered as the Plans page renders it: the saved row handed back as the plan.
  let plan = { ...PLAN, detail: { ...PLAN.detail, revision: 4 } };
  const render = async () => { await React.act(async () => { root.render(React.createElement(Editor, { plan, onClose: () => {}, onSaved: (row) => { plan = row; } })); }); };
  const click = async (el) => { await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); };
  try {
    await render();
    await click(host.querySelector(`[data-meal-remove="${NORA.days[0].slots[0].id}"]`));
    await click(host.querySelector('[data-meal-save]'));
    assert.equal(calls[0].expectedRevision, 4);
    await render();
    await click(host.querySelector(`[data-meal-remove="${NORA.days[0].slots[1].id}"]`));
    await click(host.querySelector('[data-meal-save]'));
    assert.equal(calls[1].expectedRevision, 5, 'the saved row\'s, not the one it opened on');
    // Changed on the website since: refused, said, and the edit stays in the editor.
    refuse = true;
    await render();
    await click(host.querySelector(`[data-meal-remove="${NORA.days[0].slots[2].id}"]`));
    await click(host.querySelector('[data-meal-save]'));
    assert.match(host.querySelector('[role="alert"]').textContent, /changed on another device/);
    assert.equal(host.querySelector(`[data-meal-remove="${NORA.days[0].slots[2].id}"]`), null, 'the edit is still here');
  } finally { await React.act(async () => root.unmount()); host.remove(); delete W.ShapeCoachPlans; }
});

test('the editor: Assign hands on the saved plan, saving first when there are changes; a failed save stays and says so', async () => {
  const calls = [];
  const assigned = [];
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }; } };
  let m = await mount({ plan: PLAN, onClose: () => {}, onAssign: (row) => assigned.push(row) });
  try {
    await m.click(m.q('[data-meal-assign]'));
    assert.equal(calls.length, 0, 'nothing to save');
    assert.equal(assigned.length, 1);
    assert.deepEqual(assigned[0].detail.mealBuilder, NORA);
    await m.click(m.q(`[data-meal-remove="${NORA.days[0].slots[0].id}"]`));
    await m.click(m.q('[data-meal-assign]'));
    assert.equal(calls.length, 1, 'saved before it is assigned');
    assert.equal(assigned.length, 2);
    assert.equal(assigned[1].detail.mealBuilder.days[0].slots.length, NORA.days[0].slots.length - 1, 'the week Assign sends is the saved one');
  } finally { await m.close(); }
  W.ShapeCoachPlans = { update: async () => { throw new Error('This plan changed while saving.'); } };
  m = await mount({ plan: PLAN, onClose: () => {}, onAssign: (row) => assigned.push(row) });
  try {
    await m.click(m.q(`[data-meal-remove="${NORA.days[0].slots[0].id}"]`));
    await m.click(m.q('[data-meal-assign]'));
    assert.equal(assigned.length, 2, 'not assigned on a failed save');
    assert.match(m.q('[role="alert"]').textContent, /This plan changed while saving\./);
  } finally { await m.close(); delete W.ShapeCoachPlans; }
});

test('the editor: Back with changes asks first; a plan with rest-day versions says the app leaves them as they are', async () => {
  const closed = [];
  let answer = false;
  W.bsAskConfirm = async () => answer;
  const withRest = { ...PLAN, detail: { mealBuilder: { ...clone(NORA), days: NORA.days.map((d, i) => (i === 0 ? { ...d, variants: { rest: { overrides: {}, extras: [] } } } : d)) } } };
  const m = await mount({ plan: withRest, onClose: () => closed.push(1) });
  try {
    assert.ok(m.q('[data-meal-variants-note]'));
    await m.click(m.q('[data-back]'));
    assert.equal(closed.length, 1, 'nothing changed: straight back');
    await m.click(m.q(`[data-meal-remove="${NORA.days[0].slots[0].id}"]`));
    await m.click(m.q('[data-back]'));
    assert.equal(closed.length, 1, 'Stay keeps the changes on screen');
    answer = true;
    await m.click(m.q('[data-back]'));
    assert.equal(closed.length, 2);
  } finally { await m.close(); delete W.bsAskConfirm; }
  const plain = await mount({ plan: PLAN, onClose: () => {} });
  try { assert.ok(!plain.q('[data-meal-variants-note]')); } finally { await plain.close(); }
});
