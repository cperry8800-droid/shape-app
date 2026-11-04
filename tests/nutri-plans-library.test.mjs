// The nutritionist's Plans page in the app holds what they saved (owner, 2026-11-04, of Nora's drafts:
// "A meal plan Nora drafts for a nutritionist can only be edited and assigned on the website, not in
// the app" and "Nora can't create a nutritionist's 'program' or 'diet' yet … can you fix these and make
// them possible?"). Signed in, Programs and Diet list their own saved rows (they listed nothing); a
// saved row opens on what it holds (it opened a blank draft); a builder document opens in its own
// editor; publishing a saved row updates it in place; and Nora's "Open in builder" lands on the plan.
//
// The shipping page, mounted in jsdom (the harness is tests/coach-plans-condensed.test.mjs's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const DashMeals = require_('../public/newdesign/dashMealCore.js');

const { IntlMessageFormat } = require_('intl-messageformat');
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = key.startsWith('coach:') ? CATALOG[key.slice(6)] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
W.bsDateLocale = () => 'en-US';
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', PAPER3: '#ddd', INK: '#111', INK30: '#999', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true, W: { display: 700 } };
W.useBS = () => theme;
for (const chrome of ['BSPage', 'BSFooter', 'BSBackButton', 'BSMasthead', 'BSPageHeader', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
W.BSBackRow = ({ onBack, trailing }) => React.createElement('div', null, React.createElement('button', { type: 'button', 'data-back': '', onClick: onBack }, 'Back'), trailing);

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSNutriPlans, BSProAssignPage };',
});

const { cleanMealBrief, pickMeals, buildMealDoc } = await import('../src/lib/ai/mealDraft.mjs');
const { dietIsGuide, nutritionNotAMenu } = await import('../mobile-app/src/services/nutritionAssign.mjs');
const brief = cleanMealBrief({ goalPhase: 'cut', days: 3 });
const DOC = buildMealDoc(brief, pickMeals(brief), 'mp-web');
const ROWS = () => [
  { id: 'mp-web', kind: 'meal_plan', name: 'Cut · 3-day rotation', meta: '3-day rotation · 1900 kcal', price: null, published: false, detail: { mealBuilder: DOC } },
  { id: 'mp-app', kind: 'meal_plan', name: 'Lean Cut', meta: 'meal plan · 2100 kcal · omnivore', price: '$120', published: true, detail: { buildType: 'mealplan', goal: 'Cut', diet: 'Omnivore', cals: '~2100', mealsDay: 3, blocks: [{ id: 'b0', text: 'Breakfast — Oats · 420 kcal' }, { id: 'b1', text: 'Lunch — Chicken bowl · 620 kcal' }], note: 'Hydrate.', media: [] } },
  { id: 'np-1', kind: 'meal_plan', name: 'Habit reset', meta: 'program · 4 weeks · vegan', price: null, published: false, detail: { buildType: 'program', goal: 'Performance', diet: 'Vegan', blocks: [{ id: 'b0', text: 'Week 1 — Reset & habits' }, { id: 'b1', text: 'Week 2 — Build routine' }], note: '', media: [] } },
  { id: 'nd-1', kind: 'meal_plan', name: 'Keto week', meta: 'diet · omnivore', price: null, published: false, detail: { buildType: 'diet', goal: 'Maintain', diet: 'Omnivore', blocks: [{ id: 'b0', text: 'Breakfast options — Eggs, avocado' }], note: '', media: [] } },
];

function stubBackend(rows = ROWS()) {
  const calls = { list: 0, update: [], create: [] };
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'nutri-1' } }) };
  W.ShapeCoachPlans = {
    // A fresh array each read, as a fetch answers.
    list: async () => { calls.list += 1; return rows.map((r) => ({ ...r })); },
    update: async (body) => { calls.update.push(body); const cur = rows.find((r) => r.id === body.id) || {}; return { ...cur, ...body, detail: { ...(cur.detail || {}), ...(body.detail || {}) } }; },
    create: async (body) => { calls.create.push(body); return { id: 'new', ...body }; },
  };
  return calls;
}

async function mount(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const render = async (p) => { await React.act(async () => { root.render(React.createElement(PROS.BSNutriPlans, p)); }); };
  await render(props);
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const q = (sel) => host.querySelector(sel);
  const buttons = () => [...host.querySelectorAll('button')];
  const byText = (re) => buttons().find((b) => re.test(b.textContent.trim()));
  const click = async (el) => { assert.ok(el, 'no such element'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  return { host, q, byText, click, render, text: () => host.textContent, close: async () => { await React.act(async () => root.unmount()); host.remove(); } };
}
const tab = (m, label) => m.click([...m.host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === label));

test('signed in, Plans lists the meal plans, Programs the programs and Diet the diets they saved; a draft says so', async () => {
  stubBackend();
  const m = await mount();
  try {
    assert.match(m.text(), /Cut · 3-day rotation/);
    assert.match(m.text(), /Lean Cut/);
    assert.doesNotMatch(m.text(), /Habit reset|Keto week/, 'a program or a diet is not a meal plan');
    assert.match(m.text(), /3-day rotation · 1900 kcal · draft/, 'Nora\'s unpublished draft says it is one');
    assert.doesNotMatch(m.text(), /website builder/, 'no row sends them to the website');
    await tab(m, 'Programs');
    assert.match(m.text(), /Habit reset/);
    assert.match(m.text(), /program · 4 weeks · vegan · draft/);
    assert.doesNotMatch(m.text(), /Busy professional/, 'no sample rows when signed in');
    await tab(m, 'Diet');
    assert.match(m.text(), /Keto week/);
    assert.doesNotMatch(m.text(), /Mediterranean/);
  } finally { await m.close(); }
});

test('a saved row opens on what it holds; publishing it updates the same row, never a copy', async () => {
  const calls = stubBackend();
  const m = await mount();
  try {
    await tab(m, 'Programs');
    await m.click(m.byText(/^Habit reset/) || [...m.host.querySelectorAll('button')].find((b) => /Habit reset/.test(b.textContent)));
    // The draft editor, on its own name and weeks (it opened a blank draft).
    assert.equal(m.q('input[value="Habit reset"]') ? 'ok' : [...m.host.querySelectorAll('input')].map((i) => i.value).join('|'), 'ok');
    const texts = [...m.host.querySelectorAll('textarea, input')].map((i) => i.value);
    assert.ok(texts.includes('Week 1 — Reset & habits') && texts.includes('Week 2 — Build routine'), texts.join(' | '));
    await m.click(m.byText(/^Publish/));
    assert.equal(calls.create.length, 0, 'never a copy');
    assert.equal(calls.update.length, 1);
    const body = calls.update[0];
    assert.equal(body.id, 'np-1');
    assert.equal(body.published, true);
    assert.equal(body.expectedOwnerId, 'nutri-1');
    assert.equal(body.expectedRevision, 0, 'a row saved with no revision has revision 0');
    assert.equal(body.detail.buildType, 'program');
    assert.equal(body.detail.goal, 'Performance', 'its own goal, not the page\'s');
    assert.equal(body.detail.diet, 'Vegan');
    assert.deepEqual(body.detail.blocks.map((b) => b.text), ['Week 1 — Reset & habits', 'Week 2 — Build routine']);
    assert.equal(body.detail.days, null, 'no per-day menus handed back: none stored');
    assert.equal(body.meta, 'program · 4 weeks · vegan', 'its own line, not one built from the page\'s chips');
    assert.ok(!('cals' in body.detail) && !('mealsDay' in body.detail), 'no figure it never had');
    assert.match(m.text(), /Program published/);
  } finally { await m.close(); }
});

test('a refused publish of a saved row says why and keeps the draft open', async () => {
  stubBackend();
  W.ShapeCoachPlans.update = async () => { throw new Error('This plan changed while saving. Your draft is retained; reload before retrying.'); };
  const m = await mount();
  try {
    await tab(m, 'Programs');
    await m.click([...m.host.querySelectorAll('button')].find((b) => /Habit reset/.test(b.textContent)));
    await m.click(m.byText(/^Publish/));
    assert.match(m.q('[data-draft-publish-error]').textContent, /This plan changed while saving/);
    assert.ok(!m.byText(/^Publishing/), 'not stuck on Publishing…');
    assert.ok(m.byText(/^Publish program →$/), 'the button is back to Publish');
    assert.doesNotMatch(m.text(), /Program published/);
    assert.ok([...m.host.querySelectorAll('textarea, input')].some((i) => i.value === 'Week 1 — Reset & habits'), 'still on the draft');
  } finally { await m.close(); }
});

test('a builder document opens in its own editor, and Assign there goes to the assign page with it', async () => {
  stubBackend();
  W.DashMeals = DashMeals;
  W.ShapeAssign = { clients: async () => [], mealPlan: async () => ({ ok: true }) };
  const m = await mount();
  try {
    await m.click([...m.host.querySelectorAll('button')].find((b) => /^Cut · 3-day rotation/.test(b.textContent)));
    assert.ok(m.q('[data-meal-builder-editor]'), 'the builder\'s editor');
    assert.equal(m.q('input[aria-label="Plan name"]').value, 'Cut · 3-day rotation');
    await m.click(m.q('[data-meal-assign]'));
    assert.ok(!m.q('[data-meal-builder-editor]'));
    assert.match(m.text(), /Assign & notify/);
  } finally { await m.close(); delete W.ShapeAssign; }
});

test('Nora\'s "Open in builder" lands on the plan, on its tab, once the library holds it; a plan not there yet is read once more, then said', async () => {
  const calls = stubBackend();
  const m = await mount({ openPlanRequest: { planId: 'nd-1', nonce: 1 } });
  try {
    const texts = [...m.host.querySelectorAll('textarea, input')].map((i) => i.value);
    assert.ok(texts.includes('Breakfast options — Eggs, avocado'), 'the diet, in the draft editor');
    assert.ok(texts.includes('Keto week'));
  } finally { await m.close(); }
  const before = calls.list;
  const m2 = await mount({ openPlanRequest: { planId: 'missing', nonce: 2 } });
  try {
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(calls.list - before, 2, 'the library, then once more');
    assert.match(m2.text(), /That plan isn't in your library yet/);
  } finally { await m2.close(); }
});

test('Nora\'s client rides to Assign: the plan she drafted for them opens Assign with them picked (Codex on #2594)', async () => {
  stubBackend();
  W.DashMeals = DashMeals;
  W.ShapeAssign = { clients: async () => [{ userId: 'cl-9', name: 'Sam Rivera', sessions: 2 }, { userId: 'cl-2', name: 'Ada Obi' }], mealPlan: async () => ({ ok: true }) };
  const pickedRow = (m) => [...m.host.querySelectorAll('button')].find((b) => /Sam Rivera/.test(b.textContent));
  const m = await mount({ openPlanRequest: { planId: 'mp-web', clientId: 'cl-9', nonce: 11 } });
  try {
    assert.ok(m.q('[data-meal-builder-editor]'), 'the plan, in its editor');
    await m.click(m.q('[data-meal-assign]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.match(pickedRow(m).textContent, /✓$/, 'Sam is picked');
    assert.doesNotMatch([...m.host.querySelectorAll('button')].find((b) => /Ada Obi/.test(b.textContent)).textContent, /✓$/);
    // The same plan opened again from a card with no client: Sam is not kept for it.
    await m.render({ openPlanRequest: { planId: 'mp-web', nonce: 12 } });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.ok(m.q('[data-meal-builder-editor]'), 'the plan, in its editor again');
    await m.click(m.q('[data-meal-assign]'));
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.doesNotMatch(pickedRow(m).textContent, /✓$/, 'nobody picked');
  } finally { await m.close(); delete W.ShapeAssign; }
});

test('publishing a saved row takes nothing from the page\'s chips: a row with no goal, diet or line keeps none (Codex on #2594)', async () => {
  const OLD = { id: 'np-old', kind: 'meal_plan', name: 'Old program', meta: null, price: null, published: true, detail: { revision: 7, buildType: 'program', blocks: [{ id: 'b0', text: 'Week 1 — Base' }, { id: 'b1', text: 'Week 2 — Build' }] } };
  const calls = stubBackend([...ROWS(), OLD]);
  const m = await mount();
  try {
    await tab(m, 'Programs');
    // Another plan first: it leaves Performance and Vegan in the page's chips.
    await m.click([...m.host.querySelectorAll('button')].find((b) => /Habit reset/.test(b.textContent)));
    await m.click(m.byText(/^CANCEL$/));
    await m.click([...m.host.querySelectorAll('button')].find((b) => /Old program/.test(b.textContent)));
    const nameBox = m.q('input[value="Old program"]');
    assert.ok(nameBox, 'the old program, in the draft editor');
    // Its name emptied: it keeps its own, not one made from the page's goal.
    const setValue = Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setValue.call(nameBox, ''); nameBox.dispatchEvent(new W.Event('input', { bubbles: true })); });
    assert.equal(nameBox.value, '');
    await m.click(m.byText(/^Publish program →$/));
    assert.equal(calls.update.length, 1);
    const body = calls.update[0];
    assert.equal(body.id, 'np-old');
    assert.ok(!('goal' in body.detail) && !('diet' in body.detail), JSON.stringify(body.detail));
    assert.ok(!('cals' in body.detail) && !('mealsDay' in body.detail));
    assert.ok(!('meta' in body), 'no line built from the page\'s chips');
    assert.equal(body.name, 'Old program');
    assert.equal(body.expectedRevision, 7, 'the revision it opened: changed elsewhere since, it is refused');
  } finally { await m.close(); }
});

const GUIDE = { buildType: 'diet', goal: 'Maintain', diet: 'Omnivore', blocks: [{ id: 'b0', text: 'Breakfast options — Eggs, avocado' }, { id: 'b1', text: 'Foods to avoid — Fried food' }], note: '', media: [] };
const WEEK = Array.from({ length: 7 }, (_, dow) => ({ dow, blocks: [{ id: `d${dow}`, text: `Breakfast — Eggs and toast · 420 kcal` }, { id: `e${dow}`, text: 'Dinner — Salmon and rice · 640 kcal' }] }));

test('a diet is assigned only when every day is a menu the coach wrote (Codex on #2594)', () => {
  assert.equal(dietIsGuide(GUIDE), true, 'options and foods to avoid: a guide');
  assert.equal(dietIsGuide({ ...GUIDE, days: WEEK }), false, 'seven written menus: a week of meals');
  assert.equal(dietIsGuide({ ...GUIDE, days: WEEK.slice(0, 6) }), true, 'one day would serve the guide lines');
  assert.equal(dietIsGuide({ ...GUIDE, days: WEEK.map((d, i) => (i === 3 ? { dow: 3, blocks: [] } : d)) }), true, 'a day with nothing');
  assert.equal(dietIsGuide({ ...GUIDE, blocks: undefined }), true, 'no lines at all');
  assert.equal(dietIsGuide({ buildType: 'mealplan', blocks: GUIDE.blocks }), false, 'a meal plan is not a diet');
  assert.equal(dietIsGuide({ buildType: 'diet', mealBuilder: {} }), false, 'a builder document is a meal plan');
  assert.equal(dietIsGuide(null), false);
});

test('a diet guide offers no Assign on its row, and Assign refuses one and sends nothing (Codex on #2594)', async () => {
  const rows = [...ROWS(), { id: 'nd-week', kind: 'meal_plan', name: 'Keto week written', meta: 'diet · omnivore', price: null, published: true, detail: { ...GUIDE, days: WEEK } }];
  stubBackend(rows);
  const m = await mount();
  try {
    await tab(m, 'Diet');
    const assignFor = (name) => m.host.querySelector(`button[aria-label="Assign ${name} to a client"]`);
    assert.ok(!assignFor('Keto week'), 'the guide has no Assign');
    assert.ok(assignFor('Keto week written'), 'a diet with every day written does');
  } finally { await m.close(); }

  const sent = [];
  W.ShapeAssign = { clients: async () => [{ userId: 'cl-9', name: 'Sam Rivera' }], mealPlan: async (b) => { sent.push(b); return { ok: true }; } };
  W.bsAskConfirm = async () => true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => { root.render(React.createElement(PROS.BSProAssignPage, { role: 'nutritionist', plan: { id: 'nd-1', name: 'Keto week', meta: 'diet · omnivore', detail: GUIDE }, preferClientUid: 'cl-9', onBack() {}, onDone() {} })); });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.ok(host.querySelector('[data-assign-diet-guide]'), 'the notice');
    assert.match(host.textContent, /This diet is a guide, not a week of meals\./);
    assert.ok(![...host.querySelectorAll('button')].some((b) => /Assign & notify/.test(b.textContent)), 'no assign action');
    assert.equal(sent.length, 0, 'nothing sent');
  } finally { await React.act(async () => root.unmount()); host.remove(); delete W.ShapeAssign; delete W.bsAskConfirm; }
});

test('a nutrition program is never a menu, whatever its lines say now (Codex on #2594)', async () => {
  const one = { buildType: 'program', blocks: [{ id: 'b0', text: 'Week 1 — Reset & habits' }] };
  assert.equal(nutritionNotAMenu(one), 'program', 'edited down to one week line');
  assert.equal(nutritionNotAMenu({ buildType: 'program', blocks: [] }), 'program', 'no lines at all');
  assert.equal(nutritionNotAMenu({ buildType: 'program', blocks: [{ id: 'b0', text: 'Breakfast — Oats · 420 kcal' }] }), 'program', 'a meal line typed into a program');
  assert.equal(nutritionNotAMenu(GUIDE), 'diet');
  assert.equal(nutritionNotAMenu({ ...GUIDE, days: WEEK }), null, 'a diet with every day written is a menu');
  assert.equal(nutritionNotAMenu({ buildType: 'mealplan', blocks: [{ id: 'b0', text: 'Breakfast — Oats · 420 kcal' }] }), null);
  assert.equal(nutritionNotAMenu({ buildType: 'program', mealBuilder: DOC }), null, 'a builder document is a meal plan');
  assert.equal(nutritionNotAMenu(null), null);

  // A saved program's row offers no Assign.
  stubBackend();
  const m = await mount();
  try {
    await tab(m, 'Programs');
    assert.ok([...m.host.querySelectorAll('button')].some((b) => /Habit reset/.test(b.textContent)), 'the program is listed');
    assert.ok(!m.host.querySelector('button[aria-label="Assign Habit reset to a client"]'), 'no Assign on it');
  } finally { await m.close(); }

  // And the Assign page, reached another way, refuses one with a single week line and sends nothing.
  const sent = [];
  W.ShapeAssign = { clients: async () => [{ userId: 'cl-9', name: 'Sam Rivera' }], mealPlan: async (b) => { sent.push(b); return { ok: true }; } };
  W.bsAskConfirm = async () => true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => { root.render(React.createElement(PROS.BSProAssignPage, { role: 'nutritionist', plan: { id: 'np-1', name: 'Habit reset', meta: 'program · 1 week', detail: one }, preferClientUid: 'cl-9', onBack() {}, onDone() {} })); });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.match(host.textContent, /This program describes weeks, not meals\./);
    assert.ok(![...host.querySelectorAll('button')].some((b) => /Assign & notify/.test(b.textContent)), 'no assign action');
    assert.equal(sent.length, 0, 'nothing sent');
  } finally { await React.act(async () => root.unmount()); host.remove(); delete W.ShapeAssign; delete W.bsAskConfirm; }
});

test('Nora\'s open request is let go once answered, so coming back to Plans does not open it again (Codex on #2594)', async () => {
  const calls = stubBackend();
  let consumed = 0;
  const m = await mount({ openPlanRequest: { planId: 'nd-1', nonce: 21 }, onOpenConsumed: () => { consumed += 1; } });
  try {
    assert.ok([...m.host.querySelectorAll('textarea, input')].some((i) => i.value === 'Keto week'), 'opened');
    assert.equal(consumed, 1, 'let go once');
  } finally { await m.close(); }
  // A plan the library does not hold: let go once it has said so, not on the first read.
  let missing = 0;
  const before = calls.list;
  const m2 = await mount({ openPlanRequest: { planId: 'missing', nonce: 22 }, onOpenConsumed: () => { missing += 1; } });
  try {
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(calls.list - before, 2, 'read once more first');
    assert.equal(missing, 1);
    assert.match(m2.text(), /That plan isn't in your library yet/);
  } finally { await m2.close(); }
});
