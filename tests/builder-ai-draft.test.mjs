// tests/builder-ai-draft.test.mjs
//
// "Draft a day with AI on the web" in the program builder's day editor (owner-approved
// 2026-10-07; then "make sure there are no gaps in the draft a day with AI"). The real builder
// under jsdom with /api/ai/draft-workout stubbed. Every DOM check compares a boolean or a
// string, never a node (tests/assert-dom-value.test.mjs).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => null;
globalThis.useRememberedChoices = (live) => ({ live });
globalThis.useRememberedChoice = (_store, _key, _allowed, fallback) => React.useState(fallback);
const nd = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const SRC = nd('dashBuilder.jsx');
Object.assign(globalThis, await loadRealModule(nd('coachBuilderLayouts.jsx'), { appendExports: 'export {COACH_BUILDER_LAYOUTS,CoachBuilderNav,CoachBuilderFooter,coachTemplateCopy};' }));
Object.assign(globalThis, await loadRealModule(nd('dashFilterBar.jsx'), { appendExports: 'export {useDfbPopShift};' }));
const { DbuBuilder, dbuMergeDraft } = await loadRealModule(SRC, { appendExports: 'export { DbuBuilder, dbuMergeDraft };' });

// ── Harness ─────────────────────────────────────────────────────────────────
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; localStorage.clear(); delete window.shapeDb; });
const buttons = () => [...document.querySelectorAll('button')];
const button = (t) => buttons().find((b) => b.textContent === t);
const click = async (el) => { assert.ok(el, 'missing control'); await React.act(async () => el.click()); };
const byAria = (label) => document.querySelector('[aria-label="' + label + '"]');
async function setValue(el, value) {
  assert.ok(el, 'missing field');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const key = (el, k, init = {}) => React.act(async () => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const focusOn = (el) => React.act(async () => { el.focus(); });
function capture() {
  const writes = [];
  globalThis.fetch = async (_url, opts) => { const body = JSON.parse(opts.body); writes.push(body); return { ok: true, json: async () => ({ plan: { ...body, detail: { ...body.detail, revision: 1 } } }) }; };
  return writes;
}
const row = (name, id, extra) => ({ ...DashBuilder.newRow({ name }), id, ...extra });
function program() {
  const d = DashBuilder.newProgram('Lower');
  d.weeks[0].days[0] = {
    id: 'day-a', name: 'Lower', weekday: 0, playlist: { name: 'Heavy Day mix', meta: '12 tracks' },
    blocks: [
      { kind: 'warmup', rows: [row('Hip flow', 'r-hip')] },
      { kind: 'main', rows: [
        row('Back squat', 'r-squat', { load: 100, rest: '3:00', restSeconds: 180 }),
        row('Bench press', 'r-bench', { load: 80, loadType: 'lb', rpe: 8, video: 'https://shape.test/bench.mp4', cue: 'Feet down' }),
        row('Front squat', 'r-front', { loadText: 'bodyweight' }),
      ] },
      { kind: 'accessory', rows: [] },
    ],
  };
  return d;
}
const PLAYLISTS = [{ name: 'Easy flow', meta: '8 tracks' }];
async function mount(layout = 'Editor', extra = {}) {
  const writes = capture();
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuBuilder, { template: { name: 'Lower', detail: { builder: program() } }, clients: [], queue: [], live: true, ownerId: 'coach-a', playlists: PLAYLISTS, clips: [], dayTemplates: [], onBack() {}, onSaved() {}, ...extra })));
  await click(button(layout));
  if (layout === 'Planner') await click(document.querySelector('.wg button.c:not(.rest)'));
  assert.ok(document.querySelector('.dday'), 'the day editor is not open — this test drives nothing');
  return writes;
}
const lines = () => [...document.querySelectorAll('.dr')];
const names = () => lines().map((l) => l.querySelector('.nm').textContent);
const line = (name) => lines().find((l) => l.querySelector('.nm').textContent === name);
const detailName = () => { const h = document.querySelector('aside.ddetail h3'); return h ? h.textContent : ''; };
const said = () => document.querySelector('.dday [role="status"]').textContent;
const savedDay = async (writes) => { await click(button('Save template')); return writes.at(-1).detail.builder.weeks[0].days[0]; };
const shape = (day) => day.blocks.map((b) => b.kind + ':' + b.rows.map((r) => r.id).join(','));
const activeLabel = () => (document.activeElement && document.activeElement.getAttribute('aria-label')) || '';


// ── The draft route, stubbed ────────────────────────────────────────────────
// Every other call is the builder's own save, which `capture()` answers. The draft answer
// is built through the real core's shape: builder rows with ids, a summary, a notice when
// it is the template.
const DRAFT_DAY = {
  id: 'ai-day', name: 'Lower A', blocks: [
    { kind: 'warmup', rows: [row('Glute bridge', 'ai-1', { sets: 2, reps: '10' })] },
    { kind: 'main', rows: [row('Romanian deadlift', 'ai-2', { sets: 3, reps: '8', rpe: 7 })] },
    { kind: 'finisher', rows: [row('Plank', 'ai-3', { sets: 3, reps: '40s' })] },
  ],
};
function draftAnswer(extra = {}) {
  return { source: 'openai', draft: { name: 'Lower A', buildType: 'workout', builder: { version: 1, schemaVersion: 1, weeks: [{ deload: false, days: [DRAFT_DAY] }] } },
    lines: ['Lower A — 3 moves', 'Glute bridge — 2 × 10', 'Romanian deadlift — 3 × 8 · RPE 7', 'Plank — 3 × 40s'], notes: '', ...extra };
}
// ⚠ AFTER mount(): mount installs the save stub (`capture()`), and this wraps it.
function stubDraft(reply) {
  const save = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url) === '/api/ai/draft-workout') {
      asked.push(JSON.parse(opts.body));
      const r = typeof reply === 'function' ? reply() : reply;
      return { ok: r.status == null || r.status < 400, status: r.status || 200, json: async () => r.body };
    }
    return save(url, opts);
  };
  return { asked };
}
async function openDraft() {
  await click(button('✦ Draft with AI'));
  const input = document.querySelector('.dai-in');
  assert.ok(input, 'the draft panel did not open');
  return input;
}
async function draft(text) {
  const input = await openDraft();
  await setValue(input, text);
  await key(input, 'Enter');
  await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const draftedLines = () => [...document.querySelectorAll('.dai-lines li')].map((l) => l.textContent);
const status = () => (document.querySelector('.dai [role="status"]') || { textContent: '' }).textContent;

// ── The merge rule ──────────────────────────────────────────────────────────
test('a drafted day joins the day block by block: same kind appends, a new kind lands in builder order', () => {
  const day = [{ kind: 'warmup', rows: [{ id: 'w' }] }, { kind: 'accessory', rows: [{ id: 'x' }] }];
  const out = dbuMergeDraft(day, [{ kind: 'main', rows: [{ id: 'm' }] }, { kind: 'warmup', rows: [{ id: 'w2' }] }, { kind: 'finisher', rows: [{ id: 'f' }] }]);
  assert.deepEqual(out.map((b) => b.kind + ':' + b.rows.map((r) => r.id).join(',')), ['warmup:w,w2', 'main:m', 'accessory:x', 'finisher:f']);
  assert.deepEqual(day.map((b) => b.rows.length), [1, 1], 'the day it was given is not changed in place');
});

// ── The panel, in the real builder ──────────────────────────────────────────
test('Draft with AI shows the drafted lines first, and nothing touches the day until the coach picks', async () => {
  const writes = await mount('Editor');
  const { asked } = stubDraft({ body: draftAnswer() });
  const before = names();
  await draft('Lower body, 50 min, barbell, intermediate');
  assert.deepEqual(asked, [{ request: 'Lower body, 50 min, barbell, intermediate', kind: 'day' }]);
  assert.deepEqual(draftedLines().slice(0, 2), ['Lower A — 3 moves', 'Glute bridge — 2 × 10']);
  assert.deepEqual(names(), before, 'the day changed before the coach chose');
  assert.equal(writes.length, 0, 'drafting saved something');
  assert.equal(!!button('Add to this day') && !!button('Replace this day'), true, 'a day with moves is offered both');
});

test('Add to this day appends by block and selects the first drafted move; Undo draft puts the day back', async () => {
  const writes = await mount('Editor');
  stubDraft({ body: draftAnswer() });
  const before = names();
  await draft('lower body');
  await click(button('Add to this day'));
  assert.deepEqual(names(), ['Hip flow', 'Glute bridge', 'Back squat', 'Bench press', 'Front squat', 'Romanian deadlift', 'Plank']);
  assert.equal(detailName(), 'Glute bridge', 'the first drafted move is not the one opened');
  assert.match(said(), /Draft added: 3 exercises/);
  assert.equal(document.querySelector('.dai'), null, 'the panel stayed open over the list');
  const saved = await savedDay(writes);
  assert.equal(saved.name, 'Lower', 'a name the coach chose was replaced by the draft\'s');
  assert.equal(saved.blocks.find((b) => b.kind === 'finisher').rows[0].name, 'Plank');
  await click(button('Undo draft'));
  assert.deepEqual(names(), before);
  assert.equal(button('Undo draft'), undefined, 'Undo stays offered after it ran');
});

test('Replace this day swaps the moves; an edit after the draft takes Undo away rather than losing it', async () => {
  await mount('Editor');
  stubDraft({ body: draftAnswer() });
  await draft('lower body');
  await click(button('Replace this day'));
  assert.deepEqual(names(), ['Glute bridge', 'Romanian deadlift', 'Plank']);
  assert.equal(!!button('Undo draft'), true);
  await setValue(byAria('Plank Sets'), '4');
  assert.equal(button('Undo draft'), undefined, 'Undo would have thrown away the edit made after the draft');
});

test('an empty day takes the draft whole, and takes its name only over a placeholder', async () => {
  const tpl = { name: 'Lower', detail: { builder: (() => { const d = program(); d.weeks[0].days[0] = { id: 'day-a', name: 'Day 1', weekday: 0, blocks: [{ kind: 'main', rows: [] }] }; return d; })() } };
  const writes = await mount('Editor', { template: tpl });
  stubDraft({ body: draftAnswer() });
  await draft('lower body');
  assert.equal(button('Add to this day'), undefined, 'an empty day has nothing to add to');
  await click(button('Use this draft'));
  assert.deepEqual(names(), ['Glute bridge', 'Romanian deadlift', 'Plank']);
  assert.equal((await savedDay(writes)).name, 'Lower A');
});

test('a template answer says so in the route\'s words, never as an AI draft', async () => {
  await mount('Editor');
  stubDraft({ body: draftAnswer({ source: 'template', notice: 'Template — AI drafting is unavailable right now.' }) });
  await draft('lower body');
  assert.match(status(), /Template — AI drafting is unavailable right now\./);
});

test('a refusal is shown in the route\'s own words, and the day is untouched', async () => {
  await mount('Editor');
  stubDraft({ status: 403, body: { error: 'Workout drafting is for trainers.' } });
  const before = names();
  await draft('lower body');
  assert.match(status(), /Workout drafting is for trainers\./);
  assert.deepEqual(names(), before);
  assert.equal(button('Add to this day'), undefined);
});

test('an empty draft is an error, not an empty day', async () => {
  await mount('Editor');
  stubDraft({ body: draftAnswer({ draft: { name: 'x', builder: { weeks: [{ days: [{ name: 'x', blocks: [{ kind: 'main', rows: [] }] }] }] } } }) });
  await draft('lower body');
  assert.match(status(), /came back empty/);
  assert.equal(button('Replace this day'), undefined);
});

test('the preview never calls the route; an empty brief asks for one', async () => {
  await mount('Editor', { live: false });
  const { asked } = stubDraft({ body: draftAnswer() });
  await draft('lower body');
  assert.match(status(), /needs a signed-in trainer account/);
  assert.equal(asked.length, 0, 'a signed-out preview called the trainer-only route');
  root && await React.act(async () => root.unmount()); root = null;
  await mount('Editor');
  const live = stubDraft({ body: draftAnswer() });
  await draft('   ');
  assert.match(status(), /Describe the day first/);
  assert.equal(live.asked.length, 0);
});

test('a client the builder was opened for goes with the brief, as context', async () => {
  await mount('Editor', { preselectId: '11111111-2222-4333-8444-555555555555' });
  const { asked } = stubDraft({ body: draftAnswer() });
  await draft('upper body');
  assert.equal(asked[0].clientId, '11111111-2222-4333-8444-555555555555');
});

// In Planner, where an Escape that reaches the panel closes its day editor (step 2's rule).
test('Escape in the brief closes the panel and leaves the day open', async () => {
  await mount('Planner');
  stubDraft({ body: draftAnswer() });
  const input = await openDraft();
  await key(input, 'Escape');
  assert.equal(document.querySelector('.dai'), null);
  assert.ok(document.querySelector('.dday'), 'Escape closed the day editor too');
});

// ── Nora's "Open in builder" lands on the program ───────────────────────────
test('?plan= opens that program once the library answers, and says so when it is not there', () => {
  const src = readFileSync(SRC, 'utf8');
  const page = src.slice(src.indexOf('function TrainerProgramsPage('));
  assert.match(page, /const openPlan = typeof dashRouteParam === 'function' \? dashRouteParam\('plan'\) : null;/);
  assert.match(page, /if\(!openPlan\|\|planOpened\.current\|\|!templates\|\|!resolved\.current\)return;\s*planOpened\.current=true;/, 'the plan is opened more than once, or before the library answered');
  assert.match(page, /if\(t\)setView\(t\);else setPlanMissing\(true\);/);
  assert.match(page, /\{planMissing&&<p role="status">That program isn’t in your library yet\./);
  // The link Nora puts on her card carries the plan in the hash's query, which is where
  // dashRouteParam reads it.
  const actions = readFileSync(fileURLToPath(new URL('../src/lib/ai/actions.mjs', import.meta.url)), 'utf8');
  assert.match(actions, /TrainerApp\.html#programs\?plan=/);
});
