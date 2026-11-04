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
  appendExports: 'export { BSNutriPlans };',
});

const { cleanMealBrief, pickMeals, buildMealDoc } = await import('../src/lib/ai/mealDraft.mjs');
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
    assert.ok(m.byText(/^Publish/), 'the button is back, not stuck on Publishing');
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
