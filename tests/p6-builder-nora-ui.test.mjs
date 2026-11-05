// P6 (2026-11-05), the builders' minimal UI, rendered: the New flow's Start with Nora (a whole program
// from the website), Nora's card in the builder (the change list, Undo while untouched), her marks on
// rows and the dotted changed cells, the session line without volume, "Update theirs" from the assign
// step; and on the meal side the Kitchen shelf, Assign on each client's own days, and the lifecycle as
// one list. The REAL modules under jsdom + React 18. Every DOM check compares a boolean or a string.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url), { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const React = require('react'); globalThis.React = React; globalThis.ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
globalThis.DashBuilder = require('../public/newdesign/dashBuilderCore.js');
globalThis.DashMeals = require('../public/newdesign/dashMealCore.js');
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => null;
globalThis.DashMealLedgerCard = () => null;
globalThis.dashMessageClient = () => {};
globalThis.useRememberedChoices = (live) => ({ live });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
Object.assign(globalThis, await loadRealModule(nd('coachBuilderLayouts.jsx'), { appendExports: 'export {COACH_BUILDER_LAYOUTS,CoachBuilderNav,CoachBuilderFooter,coachTemplateCopy};' }));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'), { appendExports: 'export {useDfbPopShift};' }));
const { DbuBuilder, DbuStart, DbuAssignModal } = await loadRealModule(nd('dashBuilder.jsx'), { appendExports: 'export { DbuBuilder, DbuStart, DbuAssignModal };' });
const { DmbFoodPicker, DmbAssignModal, DmbLifecyclePanel } = await loadRealModule(nd('dashMealBuilder.jsx'), { appendExports: 'export { DmbFoodPicker, DmbAssignModal, DmbLifecyclePanel };' });
const { kitchenFoods } = await import('../src/lib/kitchenFoods.mjs');
const { cleanBrief, sanitizeDraft, expandDraft } = await import('../src/lib/ai/workoutDraft.mjs');

let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); document.body.innerHTML = '<div id="root"></div>'; });
const buttons = () => [...document.querySelectorAll('button')];
const button = (t) => buttons().find((b) => b.textContent.trim() === t || b.getAttribute('aria-label') === t);
const click = async (el) => { assert.ok(el, 'missing control'); await React.act(async () => el.click()); };
const settle = async () => { for (let i = 0; i < 4; i++) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const text = () => document.body.textContent;
async function setValue(el, value) {
  assert.ok(el, 'missing field');
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function render(el) {
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(el));
  await settle();
}

// ── The New flow ───────────────────────────────────────────────────────────────────
function StartHarness({ live = true, onDraft, clients = [] }) {
  const [type, setType] = React.useState('program');
  const [brief, setBrief] = React.useState({ text: '', weeks: 4, customWeeks: '', days: 3, minutes: 60, level: 'Intermediate', equipment: '', clientId: '' });
  return React.createElement(DbuStart, { type, setType, brief, setBrief, clients, templates: [{ id: 't1', name: 'Strength Block 3' }], live, onBlank() {}, onCopy() {}, onDraft, onBack() {} });
}

test('Start with Nora drafts a WHOLE program from the brief and opens it unpublished, with her draft beside it', async () => {
  const asked = [];
  const builder = expandDraft({ ...sanitizeDraft(
    { offTopic: false, name: 'Strength', notes: '', progression: { deloadWeeks: [4], rpeStep: 0.5 }, days: [{ name: 'A', weekday: 0, blocks: [{ kind: 'main', rows: [{ name: 'Back squat', sets: 4, reps: '5', rpe: 7, rest: '', tempo: '', cue: '', group: '', load: 0, loadUnit: '' }] }] }, { name: 'B', weekday: 3, blocks: [{ kind: 'main', rows: [{ name: 'Bench press', sets: 4, reps: '5', rpe: 7, rest: '', tempo: '', cue: '', group: '', load: 0, loadUnit: '' }] }] }] },
    cleanBrief({ request: 'x', kind: 'program', weeks: 12, daysPerWeek: 2 })), idPrefix: 'aa11' }).builder;
  const snapshot = ShapeWorkoutDocument.draftSnapshot(builder, { brief: 'Strength block' });
  globalThis.fetch = async (url, opts) => { asked.push([String(url), JSON.parse(opts.body)]); return { ok: true, json: async () => ({ draft: { name: 'Strength', buildType: 'program', builder, snapshot } }) }; };
  const drafts = [];
  await render(React.createElement(StartHarness, { onDraft: (tpl, clientId) => drafts.push({ tpl, clientId }), clients: [{ profile: { id: 'c-1', name: 'Tess B' } }] }));
  assert.equal(/How do you want to start\?/.test(text()), true);
  assert.equal(/✦ Start with Nora/.test(text()), true);
  await setValue(document.querySelector('#dbu-start-brief'), 'Strength block, Mon and Thu, barbell. Squat 4 × 5 at 255.');
  await click(button('12'));
  await click(button('2'));
  await click(button('Advanced'));
  await setValue(document.querySelector('select[aria-label="For a client"]'), 'c-1');
  await click(button('✦ Draft it with Nora →'));
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(asked[0][0], '/api/ai/draft-workout');
  assert.deepEqual(asked[0][1], { request: 'Strength block, Mon and Thu, barbell. Squat 4 × 5 at 255.', kind: 'program', minutes: 60, level: 'Advanced', equipment: '', weeks: 12, daysPerWeek: 2, clientId: 'c-1' });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].clientId, 'c-1', 'Assign starts on the client the draft was for');
  assert.equal(drafts[0].tpl.published, false, 'unpublished');
  assert.equal(drafts[0].tpl.noraNew, true);
  assert.equal(drafts[0].tpl.detail.draft, snapshot, 'her draft rides beside the template');
  assert.equal(drafts[0].tpl.detail.builder.weeks.length, 12);
});

test('Start with Nora: the preview never calls; a spent budget is said in the route\'s words', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 429, json: async () => ({ error: "That's today's 80 drafts with Nora used up.", code: 'daily_budget' }) }; };
  await render(React.createElement(StartHarness, { live: false, onDraft() { throw new Error('no'); } }));
  await setValue(document.querySelector('#dbu-start-brief'), 'legs');
  await click(button('✦ Draft it with Nora →'));
  assert.equal(calls, 0);
  assert.equal(/needs a signed-in trainer account/.test(text()), true);
  await React.act(async () => root.unmount());
  await render(React.createElement(StartHarness, { onDraft() { throw new Error('no'); } }));
  await setValue(document.querySelector('#dbu-start-brief'), 'legs');
  await click(button('✦ Draft it with Nora →'));
  await settle();
  assert.equal(calls, 1);
  assert.equal(/today's 80 drafts with Nora used up/.test(text()), true);
});

// ── Nora's card in the builder ─────────────────────────────────────────────────────
function noraTemplate(extra = {}) {
  const brief = cleanBrief({ request: 'lower', kind: 'day', unit: 'lb' });
  const spec = sanitizeDraft({ offTopic: false, name: 'Lower Push', notes: 'Kept the knee in mind.', progression: { deloadWeeks: [], rpeStep: 0 }, days: [{ name: 'Lower Push', weekday: -1, blocks: [
    { kind: 'main', rows: [{ name: 'Back squat', sets: 4, reps: '5', rpe: 7, rest: '2:30', tempo: '', cue: '', group: '', load: 0, loadUnit: '' }, { name: 'Romanian deadlift', sets: 3, reps: '8', rpe: 8, rest: '2:00', tempo: '', cue: '', group: '', load: 0, loadUnit: '' }] },
  ] }] }, brief);
  const built = expandDraft({ ...spec, idPrefix: 'bb22' });
  return { name: 'Lower Push', published: false, detail: { buildType: 'workout', builder: built.builder, draft: ShapeWorkoutDocument.draftSnapshot(built.builder, { brief: 'Lower push, 60 min', notes: spec.notes }) }, ...extra };
}
function saves() {
  const writes = [];
  globalThis.fetch = async (url, opts) => { const body = opts && opts.body ? JSON.parse(opts.body) : null; writes.push({ url: String(url), method: opts && opts.method, body }); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...(body && body.detail), revision: 1 } }, assignments: [] }) }; };
  return writes;
}

test('the builder shows her card: the brief, "2 of her 2 moves kept", her note; ✦ on her rows; the session line without volume', async () => {
  saves();
  await render(React.createElement(DbuBuilder, { template: { ...noraTemplate(), id: '11111111-1111-4111-8111-111111111111', detail: { ...noraTemplate().detail, revision: 1 } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {} }));
  const card = document.querySelector('section[aria-label="Nora\'s draft"]');
  assert.equal(!!card, true);
  assert.equal(/“Lower push, 60 min”/.test(card.textContent), true);
  assert.equal(/2 of her 2 moves kept · no values changed/.test(card.textContent), true);
  assert.equal(/Kept the knee in mind\./.test(card.textContent), true);
  assert.equal(document.querySelectorAll('.dr .nora').length, 2, '✦ on each of her rows');
  const est = document.querySelector('.dfoot .dest');
  assert.equal(!!est, true);
  assert.equal(/^≈\d+ min · 7 working sets/.test(est.textContent), true);
  assert.equal(/volume/i.test(text()), false, 'no volume figure anywhere');
  // A changed value: the line says so, the cell is marked.
  const sets = document.querySelector('.dr input[data-cell="sets"]');
  await setValue(sets, '5');
  assert.equal(/2 of her 2 moves kept · 1 value changed/.test(document.querySelector('section[aria-label="Nora\'s draft"]').textContent), true);
  assert.equal(document.querySelector('.dr .c.sx').classList.contains('chg'), true, 'a dotted rule on the changed cell');
  assert.equal(document.querySelectorAll('.dr .c.chg').length, 1);
});

test('Undo draft: offered while untouched; it deletes the saved draft and goes back to the brief; gone once edited', async () => {
  const writes = saves();
  let undone = 0;
  await render(React.createElement(DbuBuilder, { template: { ...noraTemplate(), noraNew: true }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {}, onUndoDraft: () => { undone += 1; } }));
  await React.act(async () => { await new Promise((r) => setTimeout(r, 1000)); });
  await settle();
  const post = writes.find((w) => w.url === '/api/coach/plans' && w.method === 'POST');
  assert.equal(!!post, true, 'a new draft saves at once');
  assert.equal(post.body.published, false, 'unpublished');
  assert.equal(post.body.detail.draft.by, 'nora', 'her draft saved beside it');
  await click(button('Undo draft'));
  await settle();
  const del = writes.find((w) => w.method === 'DELETE');
  assert.equal(!!del, true);
  assert.equal(del.body.id, post.body.id, 'the saved draft is deleted');
  assert.equal(undone, 1);
  await React.act(async () => root.unmount());
  root = null;
  saves();
  await render(React.createElement(DbuBuilder, { template: { ...noraTemplate(), id: '22222222-2222-4222-8222-222222222222', detail: { ...noraTemplate().detail, revision: 1 } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {}, onUndoDraft() {} }));
  assert.equal(!!button('Undo draft'), true);
  await setValue(document.querySelector('.dr input[data-cell="reps"]'), '6');
  assert.equal(!!button('Undo draft'), false, 'an Undo that threw away an edit would lose work');
});

test('"Update theirs" from the assign step opens the existing update-future-workouts preview', async () => {
  const writes = saves();
  await render(React.createElement(DbuBuilder, { template: { ...noraTemplate(), id: '33333333-3333-4333-8333-333333333333', detail: { ...noraTemplate().detail, revision: 1 } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {} }));
  await click(button('Assign to clients →'));
  await settle();
  const update = buttons().find((b) => b.textContent.startsWith('Update theirs'));
  assert.equal(!!update, true);
  await click(update);
  await settle();
  assert.equal(writes.some((w) => w.url.startsWith('/api/coach/plans/assignments?id=33333333-3333-4333-8333-333333333333')), true, 'the existing preview of not-yet-done sessions');
  assert.equal(/Update future workouts/.test(text()), true);
  // A template not yet saved has nobody on it: no Update theirs.
  await React.act(async () => root.unmount());
  root = null;
  await render(React.createElement(DbuAssignModal, { template: { id: null, name: 'x' }, doc: noraTemplate().detail.builder, clients: [], queue: [], live: true, onClose() {} }));
  assert.equal(buttons().some((b) => b.textContent.startsWith('Update theirs')), false);
});

// ── The meal builder ───────────────────────────────────────────────────────────────
test('the food picker: a Kitchen shelf (filtered by the plan) and Mine', async () => {
  const { foods } = kitchenFoods();
  globalThis.fetch = async (url) => { assert.equal(String(url), '/api/kitchen/foods'); return { ok: true, json: async () => ({ foods }) }; };
  const picked = [];
  await render(React.createElement(DmbFoodPicker, { constraints: { exclusions: ['dairy'], maxPrep: 20 }, customFoods: [{ id: 'own-dhal', name: 'Mum\'s dhal', kcal: 400, p: 20, c: 50, f: 10, tags: [], ingredients: [] }], onPick: (f) => picked.push(f), onClose() {} }));
  assert.equal(!!button('Kitchen 100'), true);
  assert.equal(!!button('Mine 1'), true);
  assert.equal(/Shape Kitchen/.test(text()), true);
  const rows = [...document.querySelectorAll('.dash-thin-scroll button')].map((b) => b.firstChild.textContent);
  const shown = foods.filter((f) => rows.includes(f.name));
  assert.ok(shown.length > 3);
  assert.ok(shown.every((f) => !f.tags.includes('dairy') && f.prepMin <= 20), 'inside the plan\'s exclusions and prep');
  await click(button('High protein'));
  const after = [...document.querySelectorAll('.dash-thin-scroll button')].map((b) => b.firstChild.textContent);
  assert.ok(foods.filter((f) => after.includes(f.name)).every((f) => f.p >= 30));
  await click(button('Mine 1'));
  assert.equal(/Mum's dhal/.test(text()), true);
});

test('meal Assign: each client on their own training days, the coach\'s ticks as the override, the template stamped', async () => {
  const posts = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('/api/coach/clients/training-days')) return { ok: true, json: async () => ({ days: { 'c-1': { dows: [1, 3], source: 'sessions' }, 'c-2': null } }) };
    posts.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const doc = { version: 4, goalPhase: 'cut', targets: { kcal: 1900, p: 165, c: 170, f: 60 }, restTargets: { kcal: 1700, p: 165, c: 120, f: 60 }, constraints: {},
    days: [{ name: 'A', type: 'train', slots: [{ id: 'm1', slot: 'Lunch', name: 'Train meal', kcal: 600, p: 50, c: 60, f: 15, ingredients: [] }], variants: {} },
      { name: 'B', type: 'rest', slots: [{ id: 'm2', slot: 'Lunch', name: 'Rest meal', kcal: 500, p: 50, c: 30, f: 15, ingredients: [] }], variants: {} }] };
  const clients = [{ profile: { id: 'c-1', name: 'Tess B' } }, { profile: { id: 'c-2', name: 'Sam K' } }];
  await render(React.createElement(DmbAssignModal, { template: { id: '77777777-7777-4777-8777-777777777777', name: 'Summer Cut' }, doc, groceryEdits: {}, clients, queue: [], lifecycle: null, live: true, preselectId: 'c-1', onClose() {} }));
  await settle();
  assert.equal(/Tue Thu · from their sessions/.test(text()), true);
  await click([...document.querySelectorAll('input[type="checkbox"]')].find((x) => x.closest('label') && /Sam K/.test(x.closest('label').textContent)));
  assert.equal(/No training days on file · your days: Mon Wed Fri/.test(text()), true);
  await click(buttons().find((b) => /^Publish to 2 clients$/.test(b.textContent)));
  await settle();
  assert.equal(posts.length, 2);
  const tess = posts.find((p) => p.body.clientId === 'c-1').body;
  assert.deepEqual(tess.template, { id: '77777777-7777-4777-8777-777777777777', version: 4 });
  assert.deepEqual(tess.days.map((d) => d.tag), ['REST', 'TRAIN', 'REST', 'TRAIN', 'REST', 'REST', 'REST'], 'her Tue and Thu');
  assert.equal(tess.days[0].targets.cal, 1700);
  const sam = posts.find((p) => p.body.clientId === 'c-2').body;
  assert.deepEqual(sam.days.map((d) => d.tag), ['TRAIN', 'REST', 'TRAIN', 'REST', 'TRAIN', 'REST', 'REST'], 'the coach\'s days for a client with none');
});

test('the lifecycle is one list, each client once with every reason, under "N need a new plan by Sun"', async () => {
  const c = (id, name) => ({ profile: { id, name } });
  await render(React.createElement(DmbLifecyclePanel, { lifecycle: { expiring: [c('a', 'Ann'), c('b', 'Ben')], phaseChange: [c('b', 'Ben')], intake: [c('e', 'Eve')] }, onWritePlan() {} }));
  assert.equal(/2 need a new plan by Sun · /.test(text()), true);
  assert.equal(buttons().filter((b) => b.textContent === 'Write plan →').length, 2, 'Ben once, not twice');
  assert.equal(/Intake pending/.test(text()), true);
});
