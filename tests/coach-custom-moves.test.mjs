// A coach's own moves and foods, and where the day panel is allowed to sit.
//
// ⚠ THE PICKER WAS THE ONLY DOOR AND IT ONLY OPENED ON AN EMPTY SEARCH. Both
// builders offered a "custom" escape hatch gated on the result list being EMPTY —
// so a coach whose move merely RESEMBLED a listed one ("sled drag" against the
// listed "Sled push") got the resemblance and no way to add what they meant, and
// the nutritionist's picker had no escape hatch at all: it was the only way to add
// a meal, so a dish Shape has never heard of could not go on a plan except by
// picking something else and retyping it. Owner: "make sure coaches can add custom
// workouts and meals."
//
// ⚠ AND THE MOVES THEY HAVE ALREADY WRITTEN COME BACK WITH NO STORE. Both
// derivations walk the coach's OWN saved templates, which the library page already
// holds — no table, no route, no migration. The owner picked that reading:
// "reuse across their programs".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); globalThis.React = React;
const { createRoot } = require('react-dom/client'); globalThis.ReactDOM = require('react-dom');
const DashBuilder = require('../public/newdesign/dashBuilderCore.js');
const DashMeals = require('../public/newdesign/dashMealCore.js');
globalThis.DashBuilder = DashBuilder; globalThis.DashMeals = DashMeals;
globalThis.ShapeWorkoutDocument = require('../public/newdesign/workoutDocument.js');
globalThis.DashPill = ({ children }) => React.createElement('span', null, children);
globalThis.DashWorkoutCard = () => React.createElement('div', null, 'card');
globalThis.useRememberedChoices = (live) => ({ live, doc: {}, accountId: live ? 'coach-a' : null });
globalThis.useRememberedChoice = (store, key, allowed, fallback) => React.useState(fallback);

const SRC = fileURLToPath(new URL('../public/newdesign/dashBuilder.jsx', import.meta.url));
const mod = await loadRealModule(SRC, { appendExports: 'export { DbuBuilder, DbuExercisePicker, dbuClampPanel, dbuDefaultPanelPos, DBU_PANEL_W, DBU_PANEL_GAP, DBU_PANEL_MIN_H };' });
const { DbuExercisePicker, dbuClampPanel, dbuDefaultPanelPos, DBU_PANEL_W, DBU_PANEL_GAP, DBU_PANEL_MIN_H } = mod;

const buttons = () => [...document.querySelectorAll('button')];
const byText = (re) => buttons().find((b) => re.test(b.textContent));

// ── Where the panel may sit ─────────────────────────────────────────────────
// ⚠ THE SHIPPED CLAMP IS DRIVEN, NOT DESCRIBED. Measured on the pre-fix build at
// 1440x940 in Sheet: the panel's box ran y 496 → bottom 1296, i.e. 556px of it
// below the fold, because `position:absolute` anchored it to the page while
// `max-height:calc(100vh - 140px)` sized it against the screen.
test('the day panel can never be dropped outside the viewport', () => {
  window.innerWidth = 1440; window.innerHeight = 940;
  for (const [x, y] of [[-4000, 4000], [99999, -99999], [0, 0], [1440, 940], [-1, 941]]) {
    const p = dbuClampPanel(x, y, DBU_PANEL_W);
    assert.ok(p.x >= DBU_PANEL_GAP, `x ${p.x} ran off the left from ${x}`);
    assert.ok(p.x + DBU_PANEL_W <= window.innerWidth - DBU_PANEL_GAP + 0.001, `x ${p.x} ran off the right from ${x}`);
    assert.ok(p.y >= DBU_PANEL_GAP, `y ${p.y} ran off the top from ${y}`);
    // The panel's height is whatever is left below its top, so keeping the top
    // above this line is what keeps the whole box — and its grab handle — reachable.
    assert.ok(p.y + DBU_PANEL_MIN_H <= window.innerHeight - DBU_PANEL_GAP + 0.001,
      `y ${p.y} leaves less than the minimum on screen from ${y}`);
  }
});

test('a window too small for the panel still yields a position on screen', () => {
  window.innerWidth = 320; window.innerHeight = 200;
  const p = dbuClampPanel(9999, 9999, DBU_PANEL_W);
  assert.ok(p.x >= DBU_PANEL_GAP && p.y >= DBU_PANEL_GAP, 'clamped to the gutter rather than to a negative');
  window.innerWidth = 1440; window.innerHeight = 940;
});

// ⚠ OPENING LEVEL WITH THE STAGE IS WRONG WHEN THE STAGE IS FAR DOWN THE PAGE:
// on the measured layout the stage top sits at y 504 of a 940 viewport, which
// would leave a 424px letterbox. The default is raised so the panel opens usable.
test('the panel opens with a usable height however far down the page the stage is', () => {
  window.innerWidth = 1440; window.innerHeight = 940;
  const stage = { getBoundingClientRect: () => ({ top: 860, right: 1368, bottom: 1100, left: 312, width: 1056, height: 240 }) };
  const p = dbuDefaultPanelPos(stage);
  const height = window.innerHeight - p.y - DBU_PANEL_GAP;
  assert.ok(height >= 400, `opened only ${height}px tall`);
  assert.ok(p.x + DBU_PANEL_W <= window.innerWidth - DBU_PANEL_GAP + 0.001, 'and inside the right gutter');
});

test('with no stage to measure the panel still opens on screen', () => {
  const p = dbuDefaultPanelPos(null);
  assert.ok(p.x >= DBU_PANEL_GAP && p.y >= DBU_PANEL_GAP);
});

// ── The coach's own moves ───────────────────────────────────────────────────
const withRows = (rows) => [{ detail: { builder: { weeks: [{ days: [{ blocks: [{ rows }] }] }] } } }];

test("a coach's own moves come from their saved programs, and exclude what Shape already lists", () => {
  const own = DashBuilder.customMovesFromTemplates(withRows([
    { name: 'Sled drag', muscle: 'Conditioning', equipment: 'Sled' },
    { name: 'Back squat', muscle: 'Quads', equipment: 'Barbell' },
    { name: 'sled drag' },
    { name: '   ' },
  ]));
  assert.deepEqual(own.map((m) => m.name), ['Sled drag'], 'built-ins are out, blanks are out, and the name appears once');
  assert.equal(own[0].muscle, 'Conditioning', 'the descriptors the coach typed come back with it');
});

test('a later row fills in descriptors an earlier one left blank', () => {
  const own = DashBuilder.customMovesFromTemplates(withRows([
    { name: 'Sled drag' },
    { name: 'Sled drag', muscle: 'Conditioning', equipment: 'Sled' },
  ]));
  assert.equal(own.length, 1);
  assert.equal(own[0].equipment, 'Sled');
});

// ⚠ THE DEFECT, AS ITS OWN CASE. "sled" matches the listed "Sled push", so the old
// rule — offer a custom move only when NOTHING matched — refused to let a coach add
// "Sled drag" at all.
test('a move that merely resembles a listed one can still be created', () => {
  assert.ok(DashBuilder.searchExercises('sled').length > 0, 'the fixture depends on this matching something');
  assert.equal(DashBuilder.canCreateMove('Sled drag', []), true);
});

test('an exact name — listed or already the coach\'s own — cannot be created twice', () => {
  assert.equal(DashBuilder.canCreateMove('Back squat', []), false);
  assert.equal(DashBuilder.canCreateMove('BACK SQUAT', []), false, 'case does not make it a new move');
  assert.equal(DashBuilder.canCreateMove('Sled drag', [{ name: 'sled drag' }]), false);
  assert.equal(DashBuilder.canCreateMove('   ', []), false);
});

// ── The nutritionist's own foods ────────────────────────────────────────────
const withMeals = (days) => [{ detail: { mealBuilder: { days } } }];

test("a nutritionist's own foods come from meals, swaps and per-day extras", () => {
  const own = DashMeals.customFoodsFromTemplates(withMeals([{
    slots: [
      { name: "Mum's dhal", kcal: 520, p: 22, c: 70, f: 14, swaps: [{ name: 'Beach wrap', kcal: 400, p: 20, c: 44, f: 12 }] },
      { name: 'Overnight oats' },
    ],
    variants: { rest: { extras: [{ name: 'Late snack', kcal: 120, p: 10, c: 8, f: 4 }] } },
  }]));
  assert.deepEqual(own.map((f) => f.name), ['Beach wrap', 'Late snack', "Mum's dhal"],
    'swaps and variant extras count, and the listed "Overnight oats" does not');
});

// ⚠ AN EXCLUSION IS A FACT ABOUT THE CLIENT, so it applies to the coach's own
// dishes exactly as it applies to Shape's. `searchFoods` matches an exclusion
// against the NAME as well as the tags; this keeps that rule rather than
// re-deriving a looser one.
test("the plan's constraints filter the coach's own foods too", () => {
  const own = [{ id: 'own-a', name: 'Dairy bowl', tags: [], prepMin: 2 }, { id: 'own-b', name: 'Rice bowl', tags: [], prepMin: 40 }];
  assert.deepEqual(DashMeals.searchCustomFoods(own, '', { exclusions: ['dairy'] }).map((f) => f.name), ['Rice bowl']);
  assert.deepEqual(DashMeals.searchCustomFoods(own, '', { maxPrep: 10 }).map((f) => f.name), ['Dairy bowl']);
});

// ⚠ A NAMED DISH CARRIES NO MACROS UNTIL THE COACH SETS THEM, and it must not
// pretend otherwise: the row editor is where those numbers come from.
test('a newly created food claims no macros', () => {
  const f = DashMeals.newCustomFood('  Jollof rice  ');
  assert.equal(f.name, 'Jollof rice');
  assert.deepEqual([f.kcal, f.p, f.c, f.f], [0, 0, 0, 0]);
  assert.equal(f.prepMin, null, 'and no prep time either');
  const m = DashMeals.newMeal(f, 'Lunch');
  assert.equal(m.name, 'Jollof rice', 'and it goes onto the plan through the ordinary factory');
});

test('a food Shape already lists cannot be created again', () => {
  assert.equal(DashMeals.canCreateFood('Overnight oats', []), false);
  assert.equal(DashMeals.canCreateFood('Jollof rice', [{ name: 'jollof rice' }]), false);
  assert.equal(DashMeals.canCreateFood('Jollof rice', []), true);
});

// ── The picker actually offers it ───────────────────────────────────────────
// ⚠ THE RULE BEING RIGHT SAYS NOTHING ABOUT THE SCREEN. This mounts the shipped
// picker and types the case the old gate refused: a term with matches, for a move
// that does not exist. The create control must be on screen anyway.
test('the exercise picker offers to create a move even when the search found matches', async () => {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DbuExercisePicker, { onPick() {}, onClose() {}, customMoves: [] })));
  const input = document.querySelector('input[aria-label="Search exercises"]');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'sled');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.ok(document.querySelectorAll('.pk-row').length > 0, 'the search did match listed moves');
  assert.ok(byText(/Add .*sled.* as a new exercise/), 'and the create control is offered beside them');
  await React.act(async () => root.unmount());
});

test('a ticked move stays on screen after the search moves on', async () => {
  const root = createRoot(document.getElementById('root'));
  const own = [{ id: 'own-sled drag', name: 'Sled drag', muscle: 'Conditioning', equipment: 'Sled', own: true }];
  await React.act(async () => root.render(React.createElement(DbuExercisePicker, { onPick() {}, onClose() {}, customMoves: own })));
  const input = document.querySelector('input[aria-label="Search exercises"]');
  const type = async (v) => React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await type('sled drag');
  const box = document.querySelector('.pk-row input[type="checkbox"]');
  await React.act(async () => box.click());
  await type('bench press');
  assert.match(document.body.textContent, /Selected/, 'the selection has its own group');
  assert.match(document.body.textContent, /Sled drag/, 'and what was ticked is still visible');
  await React.act(async () => root.unmount());
});

// ── The library list is the DARK dashboard ──────────────────────────────────
// ⚠ THE BUILDER'S LIGHT-PAPER TOKENS HAD LEAKED ONTO IT. The builder redesign
// scoped its cream palette to `.dbu2` — correctly, since the global paper switch
// is a later PR — and the library page then drew its cards with those same values
// on the dashboard's dark ground. Measured on the shipped page at 1440: the card's
// kind line and its "N weeks · N days" meta computed to rgb(90,103,99) on
// rgb(26,22,18) = **3.05:1**, under AA for 13px text, and every secondary action
// was a WHITE pill on a dark plate.
//
// ⚠ A CONTRAST NUMBER CANNOT BE ASSERTED FROM SOURCE — it needs a browser and a
// composite over a translucent plate. What IS checkable is the cause: no
// light-paper token may be referenced by the page that renders on dark paper.
// That closes the class; a value drifting within the dark set is the browser
// pass's job, and this file's header records what that measured.
test('the library page uses no light-paper token', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const i = src.indexOf('function TrainerProgramsPage()');
  assert.ok(i > 0, 'TrainerProgramsPage is gone — this guard is reading nothing');
  const page = src.slice(i);
  // A vacuity floor: the page must still be drawing SOMETHING with the dark set,
  // or a sweep that stopped matching would pass this by finding nothing either way.
  assert.ok((page.match(/dbuDarkBtn\(/g) || []).length >= 4,
    'the dark control set is not being used — this guard has stopped describing the page');
  for (const tok of ['dbuLabel', 'DBU_INK50', 'DBU_INK2', 'DBU_INK3', 'dbuBtn(', 'DBU_WH', 'dbuField']) {
    assert.ok(!page.includes(tok),
      `${tok} is a light-paper value and the library list renders on the dark ground`);
  }
});
