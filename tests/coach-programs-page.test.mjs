// The coach's Programs (trainer) and Plans (nutritionist) pages as shipped, the owner's B (2026-11-04: "B for
// programs just reduce size of this button"), and the draft composer they open (owner: "describe plan looks
// good just clean up filters, make them smaller, and alow for custom focuses to be used").
//
// The shipping pages, mounted in jsdom (the harness is tests/nutri-plans-library.test.mjs's): the tabs, the
// search, the sort, From scratch, the featured plan, opening a plan, Assign going to the Assign page, the
// empty, loading and error states, both roles; and a custom focus or goal added, picked, removed and sent
// with Nora's draft request.
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
  appendExports: 'export { BSTrainerPrograms, BSNutriPlans };',
});

const tick = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(Page, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(Page, props)); });
  await tick();
  const q = (sel) => host.querySelector(sel);
  const all = (sel) => [...host.querySelectorAll(sel)];
  const click = async (el) => { assert.ok(el, 'no such element'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); await tick(); };
  const type = async (el, value) => {
    assert.ok(el, 'no such field');
    const proto = el.tagName === 'TEXTAREA' ? W.HTMLTextAreaElement.prototype : W.HTMLInputElement.prototype;
    await React.act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new W.Event('input', { bubbles: true })); });
  };
  const submit = async (form) => { assert.ok(form, 'no form'); await React.act(async () => { form.dispatchEvent(new W.Event('submit', { bubbles: true, cancelable: true })); }); await tick(); };
  return { host, q, all, click, type, submit, text: () => host.textContent, close: async () => { await React.act(async () => root.unmount()); host.remove(); } };
}
const tabs = (m) => m.all('[role="tab"]');
const tab = (m, label) => m.click(tabs(m).find((b) => b.textContent === label));
const names = (m) => m.all('[data-pc-item] [data-pc-name]').map((n) => n.textContent);
const signOut = () => { W.ShapeAuth = undefined; W.ShapeCoachPlans = undefined; W.ShapeAI = undefined; W.localStorage.clear(); };
const signIn = (list) => { W.localStorage.clear(); W.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-1' } }) }; W.ShapeCoachPlans = { list }; };

test('trainer, signed out: the title, the counts, the four kinds as tabs, the most popular plan and the rest as tiles', async () => {
  signOut();
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    assert.equal(m.q('h1[data-tour="hero-plans"]').textContent, 'Programs.');
    assert.equal(m.q('[data-deck-published]').textContent, '4 published · 1 draft');
    assert.deepEqual(tabs(m).map((b) => [b.textContent, b.getAttribute('aria-selected')]), [['Plans', 'true'], ['Workouts', 'false'], ['Programs', 'false'], ['Music', 'false']]);
    const featured = m.q('[data-pc-featured]');
    assert.equal(featured.querySelector('[data-pc-featured-name]').textContent, 'Push / Pull / Legs');
    assert.equal(featured.querySelector('[data-pc-action="assign"]').getAttribute('data-pc-compact'), 'primary');
    assert.deepEqual(names(m), ['Starting Strength', 'Fat Loss 101', 'Hypertrophy Block']);
    assert.equal(m.all('[data-pc-enrolled]').length, 4, 'Enrolled, a tile a plan');
  } finally { await m.close(); }
});

test('trainer: the search covers the list and says when nothing matches; the sort picks Popular, Price or Rating', async () => {
  signOut();
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    await m.type(m.q('input[type="search"]'), 'fat');
    assert.equal(m.q('[data-pc-featured-name]').textContent, 'Fat Loss 101', 'the most popular of what matches leads');
    assert.deepEqual(names(m), []);
    await m.type(m.q('input[type="search"]'), 'strength');
    assert.equal(m.q('[data-pc-featured-name]').textContent, 'Starting Strength');
    await m.type(m.q('input[type="search"]'), 's');
    assert.equal(m.q('[data-pc-featured-name]').textContent, 'Push / Pull / Legs');
    assert.deepEqual(names(m), ['Starting Strength', 'Fat Loss 101'], 'the rest that match, as tiles');
    await m.type(m.q('input[type="search"]'), 'zzz');
    assert.deepEqual(names(m), []);
    assert.equal(m.q('[data-pc-miss]').textContent, 'Nothing matches “zzz”.');
    await m.type(m.q('input[type="search"]'), '');
    const sort = (label) => m.click(m.all('[data-pc-sort] button').find((b) => b.textContent === label));
    assert.deepEqual(m.all('[data-pc-sort] button').map((b) => [b.textContent, b.getAttribute('aria-pressed')]), [['Popular', 'true'], ['Price', 'false'], ['Rating', 'false']]);
    await sort('Price');
    assert.ok(!m.q('[data-pc-featured]'), 'featured only under Popular');
    assert.deepEqual(names(m), ['Fat Loss 101', 'Push / Pull / Legs', 'Hypertrophy Block', 'Starting Strength']);
    await sort('Rating');
    assert.equal(names(m)[0], 'Push / Pull / Legs');
    assert.equal(names(m).at(-1), 'Fat Loss 101');
    await sort('Popular');
    assert.ok(m.q('[data-pc-featured]'));
  } finally { await m.close(); }
});

test('trainer: the tabs switch the lists; Workouts has the sample\'s top pick, its sessions and the video library', async () => {
  signOut();
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    await tab(m, 'Workouts');
    assert.equal(tabs(m).find((b) => b.textContent === 'Workouts').getAttribute('aria-selected'), 'true');
    assert.equal(m.q('[data-pc-featured-name]').textContent, 'Lower Push — Peak.');
    assert.ok(m.q('[data-pc-action="edit"]'), 'its Edit');
    assert.ok(m.q('[data-pc-section="sessions"]') && m.q('[data-pc-section="videos"]'));
    assert.ok(names(m).includes('Tempo Run · Zone 2'));
    assert.ok(!m.q('[data-pc-sort]'), 'sort is the paid plans\' alone');
    await tab(m, 'Programs');
    assert.ok(m.q('[data-pc-section="templates"]'));
    assert.ok(names(m).includes('3-day Full Body'));
  } finally { await m.close(); }
});

test('trainer: From scratch builds blank, a plan opens, and Assign goes to the Assign page', async () => {
  signOut();
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    await m.click(m.q('[data-create="scratch"]'));
    assert.ok(m.q('[data-draft-composer]'), 'the composer');
    assert.equal(m.q('[data-draft-composer] h1').textContent, 'Build a plan.');
    await m.click(m.q('[data-dc-cancel]'));
    assert.ok(m.q('[data-pro-catalog]'), 'Cancel comes back to the page');
    await m.click(m.q('button[aria-label="Open Starting Strength"]'));
    assert.equal(m.q('[data-draft-composer] h1').textContent, 'Describe the plan.', 'a sample plan opens the draft for one like it');
    await m.click(m.q('[data-dc-cancel]'));
    await m.click(m.q('button[aria-label="Assign Starting Strength to a client"]'));
    assert.ok(m.q('[data-assign-page]'), 'the Assign page');
    assert.match(m.text(), /Starting Strength/);
    assert.match(m.text(), /Put them on a program/);
  } finally { await m.close(); }
});

test('trainer, signed in: loading, then an error with Reload, then an empty library that says so and offers a build', async () => {
  let answer = () => new Promise(() => {});
  let reads = 0;
  signIn(() => { reads += 1; return answer(); });
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    assert.equal(m.q('[data-pc-loading]').getAttribute('aria-label'), 'Loading your saved workouts and programs…');
    assert.equal(m.q('[data-deck-published]').textContent, '—', 'no count before the library answers');
    assert.ok(!m.q('[data-pc-featured]'), 'no sample figures while signed in');
    assert.equal(m.all('[data-pc-item]').length, 0);
  } finally { await m.close(); }
  answer = () => Promise.reject(new Error('Network down'));
  const e = await mount(PROS.BSTrainerPrograms);
  try {
    const alert = e.q('[role="alert"]');
    assert.match(alert.textContent, /Network down/);
    answer = () => Promise.resolve([]);
    const before = reads;
    await e.click([...alert.querySelectorAll('button')].find((b) => b.textContent === 'Reload library'));
    assert.equal(reads, before + 1, 'Reload reads the library again');
    assert.ok(!e.q('[role="alert"]'));
    const empty = e.q('[data-pc-section="plans"] [data-pc-empty]');
    assert.match(empty.textContent, /NO PUBLISHED PLANS/);
    await e.click([...empty.querySelectorAll('button')].find((b) => b.textContent === '＋ Build from scratch'));
    assert.equal(e.q('[data-draft-composer] h1').textContent, 'Build a plan.');
  } finally { await e.close(); }
});

test('nutritionist: Plans with its featured plan, no sort, Programs and Diet with single dishes; Assign and From scratch', async () => {
  signOut();
  const m = await mount(PROS.BSNutriPlans);
  try {
    assert.equal(m.q('h1[data-tour="hero-plans"]').textContent, 'Plans.');
    assert.deepEqual(tabs(m).map((b) => b.textContent), ['Plans', 'Programs', 'Diet', 'Music']);
    assert.equal(m.q('[data-pc-featured-name]').textContent, 'Lean Cut');
    assert.ok(!m.q('[data-pc-sort]'), 'the nutritionist has no sort');
    await tab(m, 'Diet');
    assert.ok(m.q('[data-pc-section="diets"]') && m.q('[data-pc-section="dishes"]'));
    assert.ok(names(m).includes('Salmon dinner plate'));
    assert.ok(!m.q('button[aria-label="Assign Salmon dinner plate to a client"]'), 'a dish has no Assign');
    await tab(m, 'Plans');
    await m.click(m.q('button[aria-label="Assign Performance to a client"]'));
    assert.ok(m.q('[data-assign-page]'));
    assert.match(m.text(), /Put them on a menu/);
  } finally { await m.close(); }
  const n = await mount(PROS.BSNutriPlans);
  try {
    await n.click(n.q('[data-create="scratch"]'));
    assert.equal(n.q('[data-draft-composer] h1').textContent, 'Build a meal plan.');
  } finally { await n.close(); }
});

// ── The composer's custom choices ──────────────────────────────────────────────────────────────────
const group = (m, key) => m.q(`[data-dc-group="${key}"]`);
const picked = (m, key) => [...group(m, key).querySelectorAll('[role="radio"][aria-checked="true"]')].map((b) => b.textContent);
async function addCustom(m, key, words) {
  await m.click(group(m, key).querySelector('[data-dc-custom-open]'));
  await m.type(group(m, key).querySelector('[data-dc-custom-form] input'), words);
  await m.submit(group(m, key).querySelector('[data-dc-custom-form]'));
}

test('composer: the chips are compact (30px drawn in a 44px button), and a custom focus is added, picked, removed and sent as Nora\'s goal', async () => {
  signOut();
  const sent = [];
  W.ShapeAI = { generatePlanDraft: async (body) => { sent.push(body); return null; } };
  const m = await mount(PROS.BSTrainerPrograms);
  try {
    await m.click(m.q('button[aria-label="Open Starting Strength"]'));
    const chip = group(m, 'focus').querySelector('[data-dc-chip]');
    assert.equal(chip.style.minHeight, '44px', 'the tap stays 44');
    assert.equal(chip.querySelector('span').style.height, '30px', 'the chip reads small');
    assert.deepEqual(picked(m, 'focus'), ['Full body']);
    await addCustom(m, 'focus', '  Glutes   and   hips  ');
    assert.deepEqual(picked(m, 'focus'), ['Glutes and hips'], 'trimmed, picked once added');
    await addCustom(m, 'focus', 'glutes AND hips');
    assert.equal(group(m, 'focus').querySelectorAll('[data-dc-custom]').length, 1, 'a duplicate adds nothing');
    await addCustom(m, 'focus', 'push');
    assert.deepEqual(picked(m, 'focus'), ['Push'], 'a built-in focus typed in picks the built-in one');
    await addCustom(m, 'focus', 'Mobility for the over-fifties crowd');
    assert.deepEqual(picked(m, 'focus'), ['Mobility for the over-fi'], 'cut to 24 characters');
    for (const w of ['Core', 'Grip', 'Posture']) await addCustom(m, 'focus', w);
    assert.equal(group(m, 'focus').querySelectorAll('[data-dc-custom]').length, 5);
    assert.ok(!group(m, 'focus').querySelector('[data-dc-custom-open]'), 'five at most');
    // Remove the picked one: the focus goes back to the page's default.
    assert.deepEqual(picked(m, 'focus'), ['Posture']);
    await m.click(group(m, 'focus').querySelector('[data-dc-custom="Posture"] [data-dc-remove]'));
    assert.ok(!group(m, 'focus').querySelector('[data-dc-custom="Posture"]'));
    assert.deepEqual(picked(m, 'focus'), ['Full body']);
    assert.ok(group(m, 'focus').querySelector('[data-dc-custom-open]'), 'room for another');
    // Pick a custom one and generate: it is the goal Nora is asked for.
    await m.click([...group(m, 'focus').querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Glutes and hips'));
    await m.click(m.q('[data-dc-generate]'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].goal, 'Glutes and hips');
    assert.equal(sent[0].kind, 'training_plan');
  } finally { await m.close(); W.ShapeAI = undefined; }
});

test('composer, nutritionist: a custom goal reaches Nora\'s request the same way; the meals-a-day chips stay round', async () => {
  signOut();
  const sent = [];
  W.ShapeAI = { generatePlanDraft: async (body) => { sent.push(body); return null; } };
  const m = await mount(PROS.BSNutriPlans);
  try {
    await m.click(m.q('button[aria-label="Open Performance"]'));
    assert.ok(!group(m, 'diet').querySelector('[data-dc-custom-open]'), 'only the goal takes the coach\'s own words');
    assert.equal(group(m, 'meals').querySelector('[data-dc-chip] span').style.height, '36px');
    await addCustom(m, 'goal', 'Gut health');
    assert.deepEqual(picked(m, 'goal'), ['Gut health']);
    await m.click(m.q('[data-dc-generate]'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].goal, 'Gut health');
  } finally { await m.close(); W.ShapeAI = undefined; }
});

test('a plan\'s line keeps its own facts beside who is on it and the rating (Codex P2 on #2612)', async () => {
  const CAT = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSProCatalog.jsx'), {
    registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  });
  const tr = (_k, o) => String((o && o.defaultValue) || '').replace(/\{count, plural, one \{# client\} other \{# clients\}\}/, `${o.count} clients`);
  const nutri = CAT.bsProCatalogFacts('4 weeks · 2,100 kcal · 12 on it · 4.9 ★', tr).line.replace(/ /g, ' ');
  assert.match(nutri, /^4 WK · 2,100 kcal · 12 clients · 4\.9 ★$/, nutri);
  const trainer = CAT.bsProCatalogFacts('8 weeks · RPE 8 · used by 31', tr).line.replace(/ /g, ' ');
  assert.match(trainer, /RPE 8/, 'the trainer\'s RPE is dropped again');
  assert.match(trainer, /31 clients/);
  // With no stats the line is as before: the length, then the rest.
  assert.equal(CAT.bsProCatalogFacts('4 weeks · program · vegan · draft', tr).line.replace(/\u00a0/g, ' '), '4 WK · program · vegan · draft');
});
