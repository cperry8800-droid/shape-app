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
import { mealBuilderDoc, dayTotals, hasVariants, foodsFor, swapMeal, removeMeal, addMeal, setTarget, mealPlanMeta, assignmentDays, mealPlaylistChoices, setDayPlaylist, setMealPlaylist } from '../mobile-app/src/services/mealBuilderEdit.mjs';
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
    assert.ok(!host.querySelector(`[data-meal-remove="${NORA.days[0].slots[2].id}"]`), 'the edit is still here');
  } finally { await React.act(async () => root.unmount()); host.remove(); delete W.ShapeCoachPlans; }
});

test('the editor: an edit made while a save is in flight stays unsaved; a second Save waits (Codex on #2594)', async () => {
  const calls = [];
  let finish;
  W.ShapeCoachPlans = { update: (body) => { calls.push(body); return new Promise((resolve) => { finish = () => resolve({ id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }); }); } };
  const asked = [];
  W.bsAskConfirm = async (o) => { asked.push(o); return false; };
  const closed = [];
  const m = await mount({ plan: PLAN, onClose: () => closed.push(1) });
  try {
    const first = NORA.days[0].slots[0].id, second = NORA.days[0].slots[1].id;
    await m.click(m.q(`[data-meal-remove="${first}"]`));
    await m.click(m.q('[data-meal-save]'));
    assert.equal(calls.length, 1, 'the save is in flight');
    // Another edit while it is: it is not what was sent.
    await m.click(m.q(`[data-meal-remove="${second}"]`));
    await m.click(m.q('[data-meal-save]'));
    assert.equal(calls.length, 1, 'no second save beside the first');
    assert.ok(calls[0].detail.mealBuilder.days[0].slots.some((x) => x.id === second), 'the first save holds the meal still on it');
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    assert.doesNotMatch(m.text(), /Saved/, 'not called saved: the second edit is not');
    await m.click(m.q('[data-back]'));
    assert.equal(asked.length, 1, 'Back still asks');
    assert.equal(closed.length, 0, 'and stays when told to');
    // Saved again, it is saved.
    await m.click(m.q('[data-meal-save]'));
    assert.equal(calls.length, 2);
    assert.ok(!calls[1].detail.mealBuilder.days[0].slots.some((x) => x.id === second), 'the second edit, saved');
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    assert.match(m.text(), /Saved/);
    await m.click(m.q('[data-back]'));
    assert.equal(asked.length, 1, 'nothing left to ask about');
    assert.equal(closed.length, 1);
  } finally { await m.close(); delete W.ShapeCoachPlans; delete W.bsAskConfirm; }
});

test('the editor: while it has unsaved changes it holds the leave guard the tab bar asks, and lets go when saved or closed (Codex on #2594)', async () => {
  const { mayLeave } = await import('../mobile-app/src/services/leaveGuard.mjs');
  const asked = [];
  let answer = false;
  W.bsAskConfirm = async (o) => { asked.push(o.title); return answer; };
  W.ShapeCoachPlans = { update: async (body) => ({ id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }) };
  const m = await mount({ plan: PLAN, onClose: () => {} });
  try {
    assert.equal(await mayLeave(W), true, 'nothing unsaved: a tab tap goes, unasked');
    assert.equal(asked.length, 0);
    await m.click(m.q(`[data-meal-remove="${NORA.days[0].slots[0].id}"]`));
    assert.equal(await mayLeave(W), false, 'unsaved: asked, and told to stay');
    assert.deepEqual(asked, ['Leave without saving?'], 'the question Back asks');
    answer = true;
    assert.equal(await mayLeave(W), true, 'told to leave: it goes');
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    asked.length = 0;
    assert.equal(await mayLeave(W), true, 'saved: nothing to ask about');
    assert.equal(asked.length, 0);
    await m.click(m.q(`[data-meal-remove="${NORA.days[0].slots[1].id}"]`));
  } finally { await m.close(); }
  asked.length = 0;
  assert.equal(await mayLeave(W), true, 'closed: the guard went with it');
  assert.equal(asked.length, 0);
  delete W.ShapeCoachPlans; delete W.bsAskConfirm;
});

test('the editor: a target typed and not yet read is unsaved, and Save reads it (Codex on #2594)', async () => {
  const { mayLeave } = await import('../mobile-app/src/services/leaveGuard.mjs');
  const asked = [];
  W.bsAskConfirm = async (o) => { asked.push(o.title); return false; };
  const calls = [];
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }; } };
  const m = await mount({ plan: PLAN, onClose: () => {} });
  try {
    await m.type(m.q('[data-meal-target="p"]'), '177');
    assert.equal(await mayLeave(W), false, 'typed, not blurred: a swipe asks');
    assert.deepEqual(asked, ['Leave without saving?']);
    assert.match(m.text(), /Unsaved changes/);
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(calls.length, 1, 'Save is open to it');
    assert.equal(calls[0].detail.mealBuilder.targets.p, 177, 'and saves the typed target');
    asked.length = 0;
    assert.equal(await mayLeave(W), true, 'saved: nothing to ask');
    assert.equal(asked.length, 0);
    // A typed target out of range goes back to the one it had, as on blur, and is not saved as unsaved work.
    await m.type(m.q('[data-meal-target="kcal"]'), '300');
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(m.q('[data-meal-target="kcal"]').value, String(NORA.targets.kcal));
    assert.equal(calls[1].detail.mealBuilder.targets.kcal, NORA.targets.kcal);
  } finally { await m.close(); delete W.ShapeCoachPlans; delete W.bsAskConfirm; }
});

test('the editor: an unsaved draft is kept on this device and comes back when the plan opens again (Codex on #2594)', async () => {
  const { mealDraftKey } = await import('../mobile-app/src/services/mealBuilderEdit.mjs');
  const { mayLeave } = await import('../mobile-app/src/services/leaveGuard.mjs');
  W.localStorage.clear();
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'nutri-1' } }) };
  const key = mealDraftKey('nutri-1', 'plan-1');
  const plan3 = { ...PLAN, detail: { ...PLAN.detail, revision: 3 } };
  const gone = NORA.days[0].slots[0].id;
  const calls = [];
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail, revision: 4 } }; } };
  let m = await mount({ plan: plan3, ownerId: 'nutri-1', onClose: () => {} });
  try {
    await m.click(m.q(`[data-meal-remove="${gone}"]`));
    const kept = JSON.parse(W.localStorage.getItem(key));
    assert.equal(kept.revision, 3, 'kept with the revision it was made on');
    assert.ok(!kept.doc.days[0].slots.some((x) => x.id === gone));
    assert.match(m.text(), /Draft kept on this device/);
  } finally { await m.close(); }
  // Taken away without a word (a notification, a page opened over Plans): it is all still there.
  const plan5 = { ...PLAN, detail: { ...PLAN.detail, revision: 5 } };
  m = await mount({ plan: plan5, ownerId: 'nutri-1', onClose: () => {} });
  try {
    assert.ok(!m.q(`[data-meal-remove="${gone}"]`), 'the draft, not the stored plan');
    assert.match(m.text(), /Draft kept on this device/);
    W.bsAskConfirm = async () => false;
    assert.equal(await mayLeave(W), false, 'and it is unsaved work');
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(calls[0].expectedRevision, 3, 'the draft\'s own revision, so a plan changed since is refused, not written over');
    assert.ok(!calls[0].detail.mealBuilder.days[0].slots.some((x) => x.id === gone));
    assert.equal(W.localStorage.getItem(key), null, 'saved: dropped');
  } finally { await m.close(); delete W.bsAskConfirm; }
  // Leaving without saving drops it; another account's draft is never read, nor one written for it.
  m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {} });
  try {
    await m.click(m.q(`[data-meal-remove="${gone}"]`));
    assert.ok(W.localStorage.getItem(key));
    W.bsAskConfirm = async () => true;
    await m.click(m.q('[data-back]'));
    assert.equal(W.localStorage.getItem(key), null, 'left without saving: dropped');
  } finally { await m.close(); delete W.bsAskConfirm; }
  W.localStorage.setItem(mealDraftKey('other', 'plan-1'), JSON.stringify({ name: 'Theirs', doc: NORA, revision: 9 }));
  m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {} });
  try { assert.equal(m.q('input[aria-label="Plan name"]').value, PLAN.name, 'another account\'s draft stays theirs'); } finally { await m.close(); }
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'someone-else' } }) };
  m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {} });
  try {
    await m.click(m.q(`[data-meal-remove="${gone}"]`));
    assert.equal(W.localStorage.getItem(key), null, 'the account changed: nothing kept under the old one');
  } finally { await m.close(); delete W.ShapeAuth; delete W.ShapeCoachPlans; W.localStorage.clear(); }
});

test('the editor: Assign during a save that an edit overtakes waits, then sends the newer menu (Codex on #2594)', async () => {
  const calls = [];
  let finish;
  W.ShapeCoachPlans = { update: (body) => { calls.push(body); return new Promise((resolve) => { finish = () => resolve({ id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }); }); } };
  const assigned = [];
  const m = await mount({ plan: PLAN, onClose: () => {}, onAssign: (row) => assigned.push(row) });
  try {
    const a = NORA.days[0].slots[0].id, b = NORA.days[0].slots[1].id;
    await m.click(m.q(`[data-meal-remove="${a}"]`));
    await m.click(m.q('[data-meal-assign]'));
    await m.click(m.q(`[data-meal-remove="${b}"]`));
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(assigned.length, 0, 'not on to Assign with a menu older than the one shown');
    assert.match(m.text(), /Unsaved changes/);
    await m.click(m.q('[data-meal-assign]'));
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(assigned.length, 1);
    assert.ok(!assigned[0].detail.mealBuilder.days[0].slots.some((x) => x.id === b), 'the menu shown, saved, is the one assigned');
  } finally { await m.close(); delete W.ShapeCoachPlans; }
});

test('the editor: an edit made during a save is kept on the revision that save made; a target being typed is kept too (Codex on #2594)', async () => {
  const { mealDraftKey } = await import('../mobile-app/src/services/mealBuilderEdit.mjs');
  const { mayLeave } = await import('../mobile-app/src/services/leaveGuard.mjs');
  W.localStorage.clear();
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'nutri-1' } }) };
  const key = mealDraftKey('nutri-1', 'plan-1');
  let finish;
  const calls = [];
  W.ShapeCoachPlans = { update: (body) => { calls.push(body); return new Promise((resolve) => { finish = () => resolve({ id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail, revision: 7 } }); }); } };
  const plan6 = { ...PLAN, detail: { ...PLAN.detail, revision: 6 } };
  let m = await mount({ plan: plan6, ownerId: 'nutri-1', onClose: () => {} });
  try {
    const a = NORA.days[0].slots[0].id, b = NORA.days[0].slots[1].id;
    await m.click(m.q(`[data-meal-remove="${a}"]`));
    await m.click(m.q('[data-meal-save]'));
    await m.click(m.q(`[data-meal-remove="${b}"]`));
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    const kept = JSON.parse(W.localStorage.getItem(key));
    assert.equal(kept.revision, 7, 'the revision its own save made, so the next save is not refused');
    assert.ok(!kept.doc.days[0].slots.some((x) => x.id === b), 'with the edit made during it');
    // A target typed, not yet read, and the app closed: it comes back as typed.
    await m.type(m.q('[data-meal-target="p"]'), '177');
    assert.equal(JSON.parse(W.localStorage.getItem(key)).targets.p, '177');
  } finally { await m.close(); }
  m = await mount({ plan: plan6, ownerId: 'nutri-1', onClose: () => {} });
  try {
    assert.equal(m.q('[data-meal-target="p"]').value, '177', 'the typed target, restored');
    W.bsAskConfirm = async () => false;
    assert.equal(await mayLeave(W), false, 'still unsaved work');
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { finish(); await new Promise((r) => setTimeout(r, 0)); });
    const last = calls[calls.length - 1];
    assert.equal(last.expectedRevision, 7);
    assert.equal(last.detail.mealBuilder.targets.p, 177, 'and saved');
    assert.equal(W.localStorage.getItem(key), null);
  } finally { await m.close(); delete W.bsAskConfirm; delete W.ShapeAuth; delete W.ShapeCoachPlans; W.localStorage.clear(); }
});

test('a kept draft is read back only when it is one', async () => {
  const { readMealDraft, mealDraftKey } = await import('../mobile-app/src/services/mealBuilderEdit.mjs');
  assert.deepEqual(readMealDraft(JSON.stringify({ name: 'A', doc: NORA, revision: 2 })), { name: 'A', doc: NORA, revision: 2 });
  for (const bad of [null, '', '{', JSON.stringify({ doc: NORA }), JSON.stringify({ name: 'A', doc: { days: [] } }), JSON.stringify({ name: 'A' })]) assert.equal(readMealDraft(bad), null, String(bad));
  assert.equal(readMealDraft(JSON.stringify({ name: 'A', doc: NORA })).revision, 0);
  assert.deepEqual(readMealDraft(JSON.stringify({ name: 'A', doc: NORA, targets: { p: '177', kcal: 2050, x: '9', c: ['1'], f: '12ab345' } })).targets, { p: '177', kcal: '2050', f: '1234' }, 'only the targets, as the boxes hold them');
  assert.notEqual(mealDraftKey('a', 'p'), mealDraftKey('b', 'p'), 'per account');
  assert.notEqual(mealDraftKey('a', 'p'), mealDraftKey('a', 'q'), 'per plan');
});

test('the editor: a name emptied and saved is the plan\'s own again, in the field too (Codex on #2594)', async () => {
  const calls = [];
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }; } };
  const m = await mount({ plan: PLAN, onClose: () => {} });
  try {
    const box = m.q('input[aria-label="Plan name"]');
    await m.type(box, '   ');
    await m.click(m.q('[data-meal-save]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(calls[0].name, PLAN.name, 'saved under its own name');
    assert.equal(m.q('input[aria-label="Plan name"]').value, PLAN.name, 'and the field says so');
    assert.match(m.text(), /Saved/);
  } finally { await m.close(); delete W.ShapeCoachPlans; }
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

// ── A playlist on a day or a meal (owner, 2026-11-10: "add a playlist picker to the coach app's meal
// editor too - nutritionists should be able to add playlists to meal plans") ──
// The same document the website builder writes (tests/meal-plan-playlists.test.mjs): `{ id?, name, meta }`
// on `day.playlist` / `meal.playlist`, the key gone when cleared, so Assign sends it to the member.
const ROWS = [
  { id: 'st-1', name: ' Sunday prep ', tracks: 12, role: 'nutritionist' },
  { id: 'st-2', name: 'Breakfast beats', tracks: 1, role: null },
  { id: 'st-3', name: 'Pull day tempo', tracks: 14, role: 'trainer' },
  { id: 'st-4', name: '   ', tracks: 3 },
];

test('the playlists a meal plan can carry: the coach\'s, not a trainer\'s, as the website lists them', () => {
  assert.deepEqual(mealPlaylistChoices(ROWS), [
    { id: 'st-1', name: 'Sunday prep', meta: '12 tracks', tracks: 12 },
    { id: 'st-2', name: 'Breakfast beats', meta: '1 track', tracks: 1 },
  ]);
  assert.deepEqual(mealPlaylistChoices(null), []);
});

test('a day\'s and a meal\'s playlist are set as the website writes them, cleared without a trace, and Assign sends them', () => {
  const doc = clone(FULL);
  const before = clone(doc);
  const first = doc.days[0].slots[0];
  const [sunday, beats] = mealPlaylistChoices(ROWS);
  const a = setDayPlaylist(doc, 0, sunday);
  assert.deepEqual(a.days[0].playlist, { id: 'st-1', name: 'Sunday prep', meta: '12 tracks' }, 'id, name and meta only');
  const b = setMealPlaylist(a, 0, first.id, beats);
  assert.deepEqual(b.days[0].slots[0].playlist, { id: 'st-2', name: 'Breakfast beats', meta: '1 track' });
  assert.deepEqual(doc, before, 'the plan handed in is never written to');
  assert.equal(setDayPlaylist(b, 0, { ...sunday }), b, 'the same playlist again: the same document, nothing to save');
  assert.equal(setMealPlaylist(b, 0, 'nope', beats), b, 'no such meal: unchanged');
  assert.equal(setDayPlaylist(b, 9, sunday), b, 'no such day: unchanged');
  // Assign sends the week the member reads: the day's playlist on each weekday it is served, the meal's on the meal.
  const sent = assignmentDays(M, b);
  assert.deepEqual(sent[0].playlist, { id: 'st-1', name: 'Sunday prep', meta: '12 tracks' });
  assert.deepEqual(sent[0].meals.find((x) => x.title === first.name).playlist, { id: 'st-2', name: 'Breakfast beats', meta: '1 track' });
  // A swap keeps the meal's playlist, as editing a meal on the website does; the dish is the library's.
  const swapped = swapMeal(M, b, 0, first.id, food('f9'));
  assert.equal(swapped.days[0].slots[0].name, 'Tofu stir-fry + rice');
  assert.deepEqual(swapped.days[0].slots[0].playlist, { id: 'st-2', name: 'Breakfast beats', meta: '1 track' });
  // Cleared, the keys go: never `null`, and the plan sends what it did before.
  const cleared = setMealPlaylist(setDayPlaylist(b, 0, null), 0, first.id, null);
  assert.equal('playlist' in cleared.days[0], false);
  assert.equal('playlist' in cleared.days[0].slots[0], false);
  assert.deepEqual(assignmentDays(M, cleared), assignmentDays(M, doc));
});

const pickOption = async (sel, value) => {
  const set = Object.getOwnPropertyDescriptor(W.HTMLSelectElement.prototype, 'value').set;
  await React.act(async () => { set.call(sel, value); sel.dispatchEvent(new W.Event('change', { bubbles: true })); });
};

test('the editor: a playlist for the day and for a meal, from the coach\'s saved playlists; Save writes them', async () => {
  const calls = [];
  W.ShapeSoundtracks = { list: async () => ROWS };
  W.ShapeCoachPlans = { update: async (body) => { calls.push(body); return { id: 'plan-1', name: body.name, meta: body.meta, detail: { ...PLAN.detail, ...body.detail } }; } };
  const m = await mount({ plan: PLAN, ownerId: 'nutri-1', onClose: () => {} });
  try {
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const daySel = m.q('[data-meal-day-playlist] select');
    assert.equal(daySel.getAttribute('aria-label'), `Playlist for ${NORA.days[0].name}`);
    assert.deepEqual([...daySel.options].map((o) => o.textContent), ['No playlist', 'Sunday prep · 12 tracks', 'Breakfast beats · 1 track'], 'the coach\'s playlists, not a trainer\'s');
    assert.equal(daySel.value, '', 'none yet');
    await pickOption(daySel, 'id:st-1');
    const first = NORA.days[0].slots[0];
    const mealSel = m.q(`[data-meal-playlist="${first.id}"]`);
    assert.equal(mealSel.getAttribute('aria-label'), `${first.name} playlist`);
    await pickOption(mealSel, 'id:st-2');
    assert.equal(m.q('[data-meal-save]').disabled, false, 'a playlist is a change to save');
    await m.click(m.q('[data-meal-save]'));
    assert.equal(calls.length, 1);
    const saved = calls[0].detail.mealBuilder;
    assert.deepEqual(saved.days[0].playlist, { id: 'st-1', name: 'Sunday prep', meta: '12 tracks' });
    assert.deepEqual(saved.days[0].slots[0].playlist, { id: 'st-2', name: 'Breakfast beats', meta: '1 track' });
    assert.equal(saved.days[1].playlist, undefined, 'another day keeps none');
    // Cleared, it goes from the document.
    await pickOption(m.q(`[data-meal-playlist="${first.id}"]`), '');
    await m.click(m.q('[data-meal-save]'));
    assert.equal('playlist' in calls[1].detail.mealBuilder.days[0].slots[0], false);
  } finally { await m.close(); delete W.ShapeSoundtracks; delete W.ShapeCoachPlans; }
});

test('the editor: a playlist the plan already has stays shown when the list lacks it; signed out, there are none to pick', async () => {
  const doc = clone(NORA);
  doc.days[0].playlist = { id: 'st-9', name: 'Old prep mix', meta: '8 tracks' };
  doc.days[0].slots[0].playlist = { name: 'Saved before ids', meta: '' };
  W.ShapeSoundtracks = { list: async () => null };
  const m = await mount({ plan: { ...PLAN, detail: { mealBuilder: doc } }, ownerId: 'nutri-1', onClose: () => {} });
  try {
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const daySel = m.q('[data-meal-day-playlist] select');
    assert.equal(daySel.value, 'id:st-9');
    assert.deepEqual([...daySel.options].map((o) => o.textContent), ['No playlist', 'Old prep mix · 8 tracks']);
    const mealSel = m.q(`[data-meal-playlist="${doc.days[0].slots[0].id}"]`);
    assert.equal(mealSel.value, 'name:Saved before ids', 'one saved without an id, by its name');
    const other = m.q(`[data-meal-playlist="${doc.days[0].slots[1].id}"]`);
    assert.deepEqual([...other.options].map((o) => [o.textContent, o.disabled]), [['No playlist', false], ['No playlists yet', true]]);
    assert.equal(m.q('[data-meal-save]').disabled, true, 'showing what the plan has changes nothing');
  } finally { await m.close(); delete W.ShapeSoundtracks; }
});
