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

// The builder's tag picker places its panel through `useDfbPopShift`, published by the
// library's filter bar (dashFilterBar.jsx) — loaded here as the hosts load it, before the
// builder, and as the real module rather than a stand-in.
Object.assign(globalThis, await loadRealModule(fileURLToPath(new URL('../public/newdesign/dashFilterBar.jsx', import.meta.url)),
  { appendExports: 'export { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift };' }));

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
  // ⚠ BOTH DESCRIPTORS, because this asserted only `equipment` — so a mutation
  // disabling the muscle branch alone survived a green suite.
  assert.equal(own[0].equipment, 'Sled');
  assert.equal(own[0].muscle, 'Conditioning');
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

// ⚠ A REST-DAY DISH WAS NEVER OFFERED BACK. An override is a whole meal the coach
// wrote for a rest or travel day — "Override" clones the base meal into an editable
// row with a free-text name — and the walk read base slots, their swaps and variant
// extras, never `variants[k].overrides`. It also took an extra without the swaps
// written under it, while it took a base meal's: two rules for one kind of place.
test("a nutritionist's own foods include rest-day overrides and the alternates under an extra", () => {
  const own = DashMeals.customFoodsFromTemplates(withMeals([{
    slots: [{ id: 'm1', name: "Mum's dhal", kcal: 520 }, { id: 'm2', name: 'Overnight oats' }],
    variants: {
      rest: {
        overrides: { m1: { id: 'm1', name: "Nan's soup", kcal: 300, swaps: [{ name: 'Bone broth', kcal: 90 }] }, m2: null },
        extras: [{ name: 'Late snack', kcal: 120, swaps: [{ name: 'Quark pot', kcal: 110 }] }],
      },
    },
  }]));
  assert.deepEqual(own.map((f) => f.name), ['Bone broth', 'Late snack', "Mum's dhal", "Nan's soup", 'Quark pot'],
    'a rest-day dish, its alternate, and an extra\'s alternate are all the coach\'s own foods');
  assert.ok(!own.some((f) => f.name === 'null'), 'a meal dropped for the day (a null override) is no dish');
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

// ── The library list follows the paper ──────────────────────────────────────
// ⚠ THIS GUARD SHIPPED AS "the library page uses no light-paper token", and the
// premise it rested on is retired. Before the paper switch the builder's cream
// palette was scoped to `.dbu2` and the library page drew those same values on
// the dashboard's DARK ground — measured at 1440, the card's kind line computed to
// 3.05:1 and every secondary action was a WHITE pill on a dark plate — so the fix
// was a separate dark control set and a ban on the light one. Now `dash.css`'s
// :root IS the light paper, `html[data-paper="dark"]` brings the old values back,
// and DBU_INK2 · DBU_WH · dbuBtn read those tokens: a ban on them would forbid the
// vocabulary the whole dashboard shares. What the class needs instead is that
// nothing on the library page STOPS following the paper — no bare colour — and
// that its compact controls derive from the builder's own, so the two cannot drift.
//
// ⚠ A CONTRAST NUMBER CANNOT BE ASSERTED FROM SOURCE — the paper-token suite's
// browser pass and the preview board are where 5.44:1 (light) / 6.5:1 (dark) for
// ink2 were measured. What IS checkable is the cause, on both sides: the palette
// the page reads is the token set, and the page adds no literal of its own.
test('the library page follows the paper: tokens only, and its controls derive from the builder\'s', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  const src = stripComments(readFileSync(SRC, 'utf8'));
  // The palette the library reads is the paper's, not a fixed light one.
  for (const tok of ['DBU_INK', 'DBU_INK2', 'DBU_LINE', 'DBU_LINE2', 'DBU_WH', 'DBU_REST', 'DBU_TEAL']) {
    assert.match(src, new RegExp('const [^\\n]*\\b' + tok + ' = "var\\(--sh-'), `${tok} no longer reads a paper token`);
  }
  const i = src.indexOf('function TrainerProgramsPage()');
  assert.ok(i > 0, 'TrainerProgramsPage is gone — this guard is reading nothing');
  const page = src.slice(i);
  // A vacuity floor: the page must still be drawing SOMETHING with the compact set,
  // or a sweep that stopped matching would pass this by finding nothing either way.
  assert.ok((page.match(/dbuLibBtn\(/g) || []).length >= 4,
    'the library control set is not being used — this guard has stopped describing the page');
  // The compact control is the builder's button resized, never a second palette.
  const lib = /function dbuLibBtn\(primary\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(lib, 'dbuLibBtn is gone');
  assert.match(lib[1], /\.\.\.dbuBtn\(primary\)/, 'dbuLibBtn no longer derives its colours from dbuBtn');
  assert.doesNotMatch(lib[1], /#[0-9a-f]{3,8}\b|rgba?\(/i, 'dbuLibBtn carries a colour of its own');
  // And nothing on the page is a bare colour: every hex or rgb() must sit inside a
  // var(--sh-…, fallback) — a bare one is a colour that stops following the switch.
  const bare = page.replace(/var\(--sh-[a-z0-9-]+, *[^)]*\)/g, '').match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi) || [];
  assert.deepEqual(bare, [], 'the library page writes a colour that does not follow the paper: ' + bare.join(' '));
});

// ⚠ A MOVE NAME IS A STRING A COACH TYPES, so the maps these derivations key on
// are null-prototype. Measured on a plain object before the fix: "__proto__" and
// "constructor" were dropped from Your moves AND refused by canCreate — the move
// could neither be offered back nor created, which is the dead end this whole
// change exists to remove — while "toString" and "valueOf" happened to work. The
// inconsistency was the tell; every name behaves the same now.
const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];

test('a move named after a prototype member behaves like any other name', () => {
  for (const name of PROTO_KEYS) {
    const own = DashBuilder.customMovesFromTemplates(withRows([{ name, muscle: 'Conditioning' }]));
    assert.deepEqual(own.map((m) => m.name), [name], `${name} was dropped from the coach's own moves`);
    assert.equal(DashBuilder.canCreateMove(name, []), true, `${name} could not be created`);
    assert.equal(DashBuilder.canCreateMove(name, own), false, `${name} could be created twice`);
    assert.deepEqual(DashBuilder.searchCustomMoves(own, name).map((m) => m.name), [name], `${name} is not searchable`);
  }
  assert.equal(DashBuilder.canCreateMove('Back squat', []), false, 'and a listed move is still refused');
});

test('a dish named after a prototype member behaves like any other name', () => {
  for (const name of PROTO_KEYS) {
    const own = DashMeals.customFoodsFromTemplates(withMeals([{ slots: [{ name, kcal: 300, p: 20, c: 30, f: 8 }] }]));
    assert.deepEqual(own.map((f) => f.name), [name], `${name} was dropped from the coach's own foods`);
    assert.equal(DashMeals.canCreateFood(name, []), true, `${name} could not be created`);
    assert.equal(DashMeals.canCreateFood(name, own), false, `${name} could be created twice`);
  }
  assert.equal(DashMeals.canCreateFood('Overnight oats', []), false, 'and a listed food is still refused');
});

// And nothing reaches Object.prototype on the way.
test('deriving a coach\'s own moves never writes through to Object.prototype', () => {
  const probe = Object.keys(Object.prototype).length;
  DashBuilder.customMovesFromTemplates(withRows([{ name: '__proto__', muscle: 'x', equipment: 'y' }, { name: '__proto__', muscle: 'z' }]));
  DashMeals.customFoodsFromTemplates(withMeals([{ slots: [{ name: '__proto__', kcal: 1 }] }]));
  assert.equal(Object.keys(Object.prototype).length, probe, 'Object.prototype gained a key');
  assert.equal({}.muscle, undefined);
  assert.equal({}.equipment, undefined);
});

// ════════════════════════════════════════════════════════════════════════════
// The review round on this PR. Six findings, every one verified at the source
// before it was acted on — and two of them are more serious than they were
// marked, one less, which is recorded here because a severity is part of a
// finding.
// ════════════════════════════════════════════════════════════════════════════

// ⚠ A MEAL DOCUMENT IS STORED VERBATIM. `src/app/api/coach/plans/route.ts` reads
// `detail: body.kind === 'meal_plan' ? (body.detail || {}) : {...normalizeWorkoutDetail(...)}`
// on POST and takes the same branch on PATCH — so the meal shape is whatever is in
// the jsonb column, with no validation anywhere in the stack, and the read path
// filters on `p.detail.mealBuilder` without normalizing either. This helper then
// runs inside the Plans library render, where `public/newdesign` has NO error
// boundary: one property read on a null day is a blank page, not a missing row.
// That is why this one is the reachable crash and the workout twin below is not.
test('a ragged meal document does not take the library page down', () => {
  const own = DashMeals.customFoodsFromTemplates([{ detail: { mealBuilder: { days: [
    null,
    { slots: [null, { name: "Mum's dhal", kcal: 520, p: 22, c: 70, f: 14, swaps: [null, { name: 'Beach wrap', kcal: 400, p: 20, c: 44, f: 12 }] }] },
    { slots: null, variants: { rest: { extras: [null, { name: 'Late snack', kcal: 120, p: 10, c: 8, f: 4 }] } } },
  ] } } }]);
  assert.deepEqual(own.map((f) => f.name), ['Beach wrap', 'Late snack', "Mum's dhal"],
    'every readable dish still comes back, and the null rows are simply skipped');
});

// ⚠ AND THE WORKOUT TWIN IS THE HELPER KEEPING ITS OWN PROMISE, NOT A LIVE CRASH.
// It already refused a null template, detail, builder and ROW and left week, day
// and block bare — accepting a ragged document at five of eight levels, which is
// arbitrary rather than a design. Reachability today belongs to the route, not to
// this function: `normalizeWorkoutDetail` reads `week.days`, `day.id` and
// `block.rows` just as bare, and it runs first, so a persisted null throws there.
test('a ragged workout document does not break the moves derivation either', () => {
  const own = DashBuilder.customMovesFromTemplates([{ detail: { builder: { weeks: [
    null,
    { days: [null, { blocks: [null, { rows: [null, { name: 'Sled drag', muscle: 'Conditioning', equipment: 'Sled' }] }] }] },
    { days: [{ blocks: null }] },
  ] } } }]);
  assert.deepEqual(own.map((m) => m.name), ['Sled drag']);
  assert.equal(own[0].equipment, 'Sled');
});

// ⚠ ZEROS ARE NOT A MEASUREMENT, so first-wins deduplication was handing the next
// meal a costed dish's placeholder. `newCustomFood` starts every macro at 0 — which
// is exactly why the picker prints "Macros not set" rather than "0 kcal · 0P" — so a
// plan where the dish was named and never costed could outrank the plan where it was.
// Driven in BOTH orders, because a rule that only works when the good copy happens to
// come second is not a rule.
test('a measured dish outranks a placeholder copy of itself, whichever is seen first', () => {
  const blank = { detail: { mealBuilder: { days: [{ slots: [{ name: "Mum's dhal", kcal: 0, p: 0, c: 0, f: 0 }] }] } } };
  const costed = { detail: { mealBuilder: { days: [{ slots: [{ name: "Mum's dhal", kcal: 480, p: 22, c: 60, f: 14, prepMin: 25 }] }] } } };
  for (const order of [[blank, costed], [costed, blank]]) {
    const own = DashMeals.customFoodsFromTemplates(order);
    assert.equal(own.length, 1);
    assert.deepEqual([own[0].kcal, own[0].p, own[0].c, own[0].f], [480, 22, 60, 14],
      'the placeholder won the dedupe and copied zeros into the next meal');
    assert.equal(own[0].prepMin, 25, 'and the prep time came with it');
  }
});

// ⚠ MACROS MOVE AS A SET. kcal, protein, carbs and fat are four readings of ONE dish;
// filling them in one at a time composes a dish nobody costed. Prep time and
// ingredients are separate measurements and do fill individually — the rule the moves
// side already used for muscle and equipment.
test('a merge never composes macros from two different copies of a dish', () => {
  const prev = { kcal: 500, p: 30, c: 50, f: 12, prepMin: null, ingredients: [] };
  DashMeals.mergeFoodInto(prev, { kcal: 900, p: 0, c: 0, f: 0, prepMin: 15, ingredients: [{ item: 'rice' }] });
  assert.deepEqual([prev.kcal, prev.p, prev.c, prev.f], [500, 30, 50, 12], 'a costed dish is never overwritten');
  assert.equal(prev.prepMin, 15, 'but a missing prep time is filled');
  assert.equal(prev.ingredients.length, 1, 'and so is a missing ingredient list');

  const empty = { kcal: 0, p: 0, c: 0, f: 0, prepMin: null, ingredients: [] };
  DashMeals.mergeFoodInto(empty, { kcal: 0, p: 18, c: 0, f: 0, prepMin: null, ingredients: [] });
  assert.deepEqual([empty.kcal, empty.p, empty.c, empty.f], [0, 18, 0, 0],
    'a partial reading is taken whole — never half from one copy and half from another');

  // ⚠ THE CASE THAT ACTUALLY SEPARATES THE TWO RULES, and neither fixture above did.
  // A mutation replacing the set-move with four `if (!prev.x && next.x)` fills SURVIVED
  // a green suite: both cases had prev either fully costed or fully empty, where the
  // two rules agree. The discriminating shape is a dish costed EXCEPT for one field —
  // field-by-field takes the missing 14g of fat from a different copy of the dish and
  // reports 500 kcal with somebody else's fat.
  const partial = { kcal: 500, p: 30, c: 50, f: 0, prepMin: null, ingredients: [] };
  DashMeals.mergeFoodInto(partial, { kcal: 480, p: 22, c: 60, f: 14, prepMin: null, ingredients: [] });
  assert.deepEqual([partial.kcal, partial.p, partial.c, partial.f], [500, 30, 50, 0],
    'a costed dish with one field at zero is still costed — the gap is not filled from another copy');
});

// ⚠ AND THE ORDER LIVES IN A FUNCTION RATHER THAN IN A MEMO'S ARRAY LITERAL. Inside the
// component it was one `[...a, ...b]` nobody could drive, and the mutation that reverted
// it survived a green suite. Out here it is a test.
test('the open plan outranks the saved copy, without trading a stale figure for a zero', () => {
  const saved = [{ id: 'own-x', name: "Mum's dhal", kcal: 480, p: 22, c: 60, f: 14, prepMin: 25, tags: [], ingredients: [] }];

  // The plan being edited is the current truth about the dish.
  const edited = DashMeals.ownFoodsFor({ days: [{ slots: [{ name: "Mum's dhal", kcal: 500, p: 30, c: 50, f: 12 }] }] }, saved);
  assert.equal(edited.length, 1);
  assert.deepEqual([edited[0].kcal, edited[0].p], [500, 30], 'the saved copy outranked the plan being edited');
  assert.equal(edited[0].prepMin, 25, 'and what the open copy does not carry still comes from the saved one');

  // ⚠ BUT DOC-FIRST ALONE WOULD BE WRONG: a dish named in the open plan and not yet
  // costed must not hand the next meal a fabricated zero over a figure we hold.
  const placeholder = DashMeals.ownFoodsFor({ days: [{ slots: [{ name: "Mum's dhal", kcal: 0, p: 0, c: 0, f: 0 }] }] }, saved);
  assert.deepEqual([placeholder[0].kcal, placeholder[0].p], [480, 22],
    'an uncosted copy in the open plan took precedence over a measured one');

  // A dish that exists in only one of the two still comes back from both sides.
  const both = DashMeals.ownFoodsFor({ days: [{ slots: [{ name: 'Jollof rice', kcal: 610, p: 18, c: 80, f: 20 }] }] }, saved);
  assert.deepEqual(both.map((f) => f.name), ['Jollof rice', "Mum's dhal"]);
});

test('the same order rule governs a coach\'s own moves', () => {
  const saved = [{ id: 'own-y', name: 'Sled drag', muscle: 'Conditioning', equipment: 'Rope', own: true }];
  const own = DashBuilder.ownMovesFor({ weeks: [{ days: [{ blocks: [{ rows: [{ name: 'Sled drag', muscle: '', equipment: 'Sled' }] }] }] }] }, saved);
  assert.equal(own.length, 1);
  assert.equal(own[0].equipment, 'Sled', 'the open plan is the current truth');
  assert.equal(own[0].muscle, 'Conditioning', 'and a descriptor it lacks is filled from the saved copy');
});

// The picker's "Macros not set" line and the merge rule must be the SAME question.
test('the picker and the merge agree on what counts as a measured dish', () => {
  assert.equal(DashMeals.foodHasMacros({ kcal: 0, p: 0, c: 0, f: 0 }), false);
  assert.equal(DashMeals.foodHasMacros({ kcal: 0, p: 18, c: 0, f: 0 }), true, 'protein alone is a measurement');
  assert.equal(DashMeals.foodHasMacros(null), false);
  assert.equal(DashMeals.foodHasMacros(DashMeals.newCustomFood('Jollof rice')), false);
});

// ── The plan's constraints gate the CREATE offer, not just the lists ────────
// ⚠ THE PICKER CONTRADICTED ITSELF ON ONE SCREEN. `canCreateFood` checked the name
// for duplicates and nothing else, while both lists filtered on the plan's
// exclusions — so under a no-dairy plan, typing "Dairy bowl" printed "No match
// inside the plan's constraints" and, directly above it, offered to add exactly
// that. Taking the offer put an excluded food on the client's plan.
const MEAL_SRC = fileURLToPath(new URL('../public/newdesign/dashMealBuilder.jsx', import.meta.url));
const { DmbFoodPicker } = await loadRealModule(MEAL_SRC, { appendExports: 'export { DmbFoodPicker };' });

async function typeInto(input, v) {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

test("an excluded dish cannot be created, and the picker says which rule refused it", async () => {
  const root = createRoot(document.getElementById('root'));
  const picked = [];
  await React.act(async () => root.render(React.createElement(DmbFoodPicker, {
    constraints: { exclusions: ['dairy'] }, customFoods: [], onClose() {}, onPick: (f) => picked.push(f),
  })));
  const input = document.querySelector('input[placeholder^="Search foods"]');
  assert.ok(input, 'the picker rendered');

  await typeInto(input, 'Dairy bowl');
  assert.equal(DashMeals.canCreateFood('Dairy bowl', []), true,
    'the name itself is free — so only the constraint can be what refuses it');
  assert.ok(!byText(/Add .*Dairy bowl/), 'the create offer is withheld under the exclusion');
  // ⚠ AND IT IS WITHHELD OUT LOUD. A name that simply vanishes reads as the feature
  // being broken — the dead end this picker exists to remove, in a new coat.
  assert.match(document.body.textContent, /carries .*dairy.*, which this plan excludes/,
    'the refusal names the rule that refused it');

  // A dish that satisfies every constraint is still creatable, or the gate has
  // simply turned the feature off.
  await typeInto(input, 'Jollof rice');
  const add = byText(/Add .*Jollof rice/);
  assert.ok(add, 'a name the constraints allow is still offered');
  await React.act(async () => add.click());
  assert.equal(picked.length, 1);
  assert.equal(picked[0].name, 'Jollof rice', 'and what was tested is what gets inserted');
  assert.equal(DashMeals.foodHasMacros(picked[0]), false, 'still claiming no macros it has not measured');
  await React.act(async () => root.unmount());
});

// ── An IME's keystrokes belong to the IME ──────────────────────────────────
// ⚠ ENTER CONFIRMS A CANDIDATE. Without the guard that same Enter also created a
// move named after whatever was half-composed at the time. Escape is guarded with
// it, deliberately: during composition Escape cancels the candidate, and letting
// it through would ALSO close this dialog — throwing away every move ticked so
// far, because `selected` lives in it and nowhere else.
test('Enter while an IME is composing does not create a move', async () => {
  const root = createRoot(document.getElementById('root'));
  let closed = 0;
  await React.act(async () => root.render(React.createElement(DbuExercisePicker, {
    onPick() {}, onClose: () => { closed += 1; }, customMoves: [],
  })));
  const input = document.querySelector('input[aria-label="Search exercises"]');
  await typeInto(input, 'Zercher squat');
  assert.ok(byText(/Add .*Zercher squat/), 'the fixture depends on this being creatable');

  const key = (k, isComposing) => React.act(async () =>
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, isComposing })));

  await key('Enter', true);
  assert.ok(!/Selected/.test(document.body.textContent), 'the IME kept its Enter');
  await key('Escape', true);
  // ⚠ AND THE HANDLER THAT MATTERS IS `DbuDialog`'s, NOT THE PICKER'S. This test found
  // that: the picker's own Escape branch is a duplicate, and the Escape that actually
  // closes the dialog is the listener it bubbles up to — which had no guard, so the
  // fix was passing while the behaviour it claims was still wrong.
  assert.equal(closed, 0, 'and its Escape — through every handler the key reaches');

  await key('Enter', false);
  assert.match(document.body.textContent, /Selected/, 'and an ordinary Enter still creates the move');
  await key('Escape', false);
  assert.ok(closed > 0, 'and an ordinary Escape still closes the dialog');
  await React.act(async () => root.unmount());
});

test('Enter while an IME is composing does not create a food either', async () => {
  const root = createRoot(document.getElementById('root'));
  const picked = []; let closed = 0;
  await React.act(async () => root.render(React.createElement(DmbFoodPicker, {
    constraints: {}, customFoods: [], onClose: () => { closed += 1; }, onPick: (f) => picked.push(f),
  })));
  const input = document.querySelector('input[placeholder^="Search foods"]');
  await typeInto(input, 'Jollof rice');
  assert.ok(byText(/Add .*Jollof rice/), 'the fixture depends on this being creatable');
  const key = (k, isComposing) => React.act(async () =>
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, isComposing })));

  await key('Enter', true);
  assert.equal(picked.length, 0, 'the IME kept its Enter');
  await key('Escape', true);
  // ⚠ UNLIKE THE EXERCISE PICKER, THIS ONE IS NOT INSIDE `DbuDialog` — it is a popover,
  // so its own handler is the whole story and there is no second Escape path.
  assert.equal(closed, 0, 'and its Escape');

  await key('Enter', false);
  assert.equal(picked.length, 1, 'and an ordinary Enter still creates the dish');
  assert.equal(picked[0].name, 'Jollof rice');
  await key('Escape', false);
  assert.equal(closed, 1, 'and an ordinary Escape still closes the picker');
  await React.act(async () => root.unmount());
});

// ── A drag cannot outlive the gesture that started it ───────────────────────
const dbuLegacyDoc = () => {
  const d = DashBuilder.newProgram('Lower');
  d.weeks[0].days = [DashBuilder.newDay('Squat day'), DashBuilder.newDay('Pull day')];
  d.weeks[0].days.forEach((day) => { day.blocks[0].rows = [DashBuilder.newRow({ name: 'Back squat', muscle: 'legs', equipment: 'barbell' })]; });
  return d;
};
const dbuTemplate = () => ({ id: '11111111-2222-3333-4444-555555555555', name: 'Lower', published: false, detail: { revision: 1, builder: dbuLegacyDoc() } });
const mountBuilder = async () => {
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(mod.DbuBuilder, {
    template: dbuTemplate(), clients: [], queue: [], live: false, ownerId: 'coach-a',
    playlists: [], clips: [], dayTemplates: [], onBack() {}, onSaved() {},
  })));
  return root;
};
const grip = () => document.querySelector('.drawer.float .dh');
const grabbing = () => !!(grip() && /grabbing/.test(grip().getAttribute('style') || ''));
const ptr = (type, init) => React.act(async () => grip().dispatchEvent(new window.PointerEvent(type, { bubbles: true, ...init })));

test('a second finger does not end the first finger\'s drag', async () => {
  const root = await mountBuilder();
  assert.ok(grip(), 'a day is open, so the panel floats and can be grabbed');
  await ptr('pointerdown', { pointerId: 1, clientX: 500, clientY: 200 });
  assert.ok(grabbing(), 'the grab took');
  // ⚠ `onPanelMove` WAS POINTER-ID MATCHED AND `onPanelDrop` WAS NOT. A second finger
  // landing on the header and lifting released the FIRST finger's capture, so the
  // panel simply stopped following the hand still moving it.
  await ptr('pointerup', { pointerId: 2, clientX: 500, clientY: 200 });
  assert.ok(grabbing(), 'a foreign pointer lifting is not this drag ending');
  await ptr('pointerup', { pointerId: 1, clientX: 600, clientY: 300 });
  assert.ok(!grabbing(), 'and the pointer that started it does end it');
  await React.act(async () => root.unmount());
});

// ⚠ CAPTURE CAN END WITHOUT A POINTERUP — the capturing element removed, the browser
// taking the pointer back. `lostpointercapture` is the one event that fires however
// the gesture ends.
test('losing pointer capture ends the drag', async () => {
  const root = await mountBuilder();
  await ptr('pointerdown', { pointerId: 1, clientX: 500, clientY: 200 });
  assert.ok(grabbing());
  await ptr('lostpointercapture', { pointerId: 1 });
  assert.ok(!grabbing(), 'the grabbing cursor cannot outlive the capture');
  await React.act(async () => root.unmount());
});

// ⚠ AND `dragging` LIVES IN `DbuBuilder`, WHICH OUTLIVES THE PANEL. A drag interrupted
// by the panel closing left the NEXT open stuck in `grabbing`, with its text
// unselectable, until the page was reloaded.
test('a drag interrupted by the panel closing does not follow it to the next day', async () => {
  const root = await mountBuilder();
  await ptr('pointerdown', { pointerId: 1, clientX: 500, clientY: 200 });
  assert.ok(grabbing(), 'mid-drag');
  const seg = (re) => [...document.querySelectorAll('.seg button')].find((b) => re.test(b.textContent));
  await React.act(async () => seg(/Sheet/).click());
  assert.ok(!document.querySelector('.drawer.float'), 'the panel closed under the drag');
  await React.act(async () => seg(/Grid/).click());
  // ⚠ THE REOPEN IS ASSERTED, NOT ASSUMED. This read `if (grip())` — and switching back
  // to Grid does NOT restore `sel`, so the panel never reopened and the one line that
  // mattered was skipped every run. The mutation that disables the clearing survived a
  // green suite because of it. A day band has to be clicked, and that it exists is its
  // own assertion.
  const day = [...document.querySelectorAll('.wg button.c')].find((b) => !b.classList.contains('rest'));
  assert.ok(day, 'no day band to reopen — without one this test asserts nothing');
  await React.act(async () => day.click());
  assert.ok(grip(), 'the panel reopened');
  assert.ok(!grabbing(), 'and it is not still holding the interrupted grab');
  await React.act(async () => root.unmount());
});

// ⚠ THE RULE BEING RIGHT SAYS NOTHING ABOUT THE PAGE USING IT. Both memos hand-rolled
// their own dedupe once, which is exactly where the ordering drifted; extracting it into
// `ownFoodsFor` / `ownMovesFor` only helps while the component still CALLS it. A mutation
// replacing the call with a local merge left every rule test above green — the
// `bsIbSetRowsFor` class this log records by name: correct, tested, and bypassed.
//
// Pinned STRUCTURALLY rather than by spelling: the memo's body must BE a call to the
// shared rule, so renaming a variable or reformatting the file cannot fail this, and
// only an actual bypass can.
test('both builders resolve their own moves and foods through the shared rule', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('@babel/parser');
  for (const [file, name, member] of [[MEAL_SRC, 'ownFoods', 'ownFoodsFor'], [SRC, 'ownMoves', 'ownMovesFor']]) {
    const ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    let found = null, seen = 0;
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'VariableDeclarator' && n.id && n.id.name === name) { seen += 1; if (!found) found = n.init; }
      for (const k of Object.keys(n)) if (k !== 'loc' && !/Comments$/.test(k)) walk(n[k]);
    };
    walk(ast.program.body);
    assert.ok(found, `${name} is gone — this guard is reading nothing`);
    assert.equal(seen, 1, `${name} is declared ${seen} times — this guard is reading the wrong one`);
    assert.equal(found.type, 'CallExpression');
    assert.equal(found.callee.property && found.callee.property.name, 'useMemo', `${name} is not a memo any more`);
    const body = found.arguments[0].body;
    assert.equal(body.type, 'CallExpression', `${name}'s memo no longer resolves to a single call`);
    assert.equal(body.callee.property && body.callee.property.name, member,
      `${name} is not going through ${member} — the shared order rule is being bypassed`);
    assert.deepEqual(body.arguments.map((a) => a.name), ['doc', name === 'ownFoods' ? 'customFoods' : 'customMoves'],
      `${member} is not being handed the open document and the saved list`);
  }
});

// ── The grip is the handle, so the grip must start a drag ───────────────────
// ⚠ IT DID NOT, AND THIS SHIPPED IN #2144. The header's own rule is "a press on a
// control is that control's, never a drag" — and the grip is a `<button>`, so the
// ONE element drawn to look like the handle was the one element excluded from
// starting a drag. A coach who grabbed the dots got nothing; a coach who grabbed
// the empty header beside them got the feature.
test('the drag grip itself starts a drag', async () => {
  const root = await mountBuilder();
  const gh = document.querySelector('.drawer.float .dh .gh');
  assert.ok(gh, 'no grip rendered — without one this test asserts nothing');
  await React.act(async () => gh.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: 500, clientY: 200 })));
  assert.ok(grabbing(), 'pressing the handle is a drag, not a dead button');
  await ptr('pointerup', { pointerId: 7, clientX: 500, clientY: 200 });
  // ⚠ AND THE EXCLUSION IT WAS CARVED OUT OF STILL HOLDS: a real control in the
  // header is that control's. Without this the fix is "let anything start a drag",
  // which takes Done and Duplicate away from the pointer.
  const done = [...document.querySelectorAll('.drawer.float .dh button')].find((b) => !b.classList.contains('gh'));
  assert.ok(done, 'no ordinary control in the header — the control half is untested');
  await React.act(async () => done.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 8, clientX: 500, clientY: 200 })));
  assert.ok(!grabbing(), 'a press on a control is still that control’s');
  await React.act(async () => root.unmount());
});

// ⚠ ONE POINTER DRIVES A DRAG. A second finger landing on the header mid-drag used to
// REPLACE the drag, so the panel stopped following the hand moving it and waited on
// the finger that was only resting there.
const panelBox = () => {
  const st = document.querySelector('.drawer.float').getAttribute('style') || '';
  const x = /left:\s*(-?[\d.]+)px/.exec(st), y = /top:\s*(-?[\d.]+)px/.exec(st);
  return x && y ? [Number(x[1]), Number(y[1])] : null;
};
test('a second finger cannot take over a drag already under way', async () => {
  const root = await mountBuilder();
  await ptr('pointerdown', { pointerId: 1, clientX: 500, clientY: 200 });
  await ptr('pointermove', { pointerId: 1, clientX: 420, clientY: 260 });
  const moved = panelBox();
  assert.ok(moved, 'the first finger moved the panel — without this the rest proves nothing');
  await ptr('pointerdown', { pointerId: 2, clientX: 700, clientY: 400 });
  await ptr('pointermove', { pointerId: 2, clientX: 100, clientY: 100 });
  assert.deepEqual(panelBox(), moved, 'the resting finger does not move the panel');
  await ptr('pointermove', { pointerId: 1, clientX: 380, clientY: 300 });
  assert.notDeepEqual(panelBox(), moved, 'the finger that started the drag still drives it');
  await ptr('pointerup', { pointerId: 1, clientX: 380, clientY: 300 });
  assert.ok(!grabbing(), 'and lifting it ends the drag');
  await React.act(async () => root.unmount());
});

// ⚠ PLACED BEFORE THE FIRST PAINT. The panel mounts already open and its height budget
// lives only in the inline style, so a PASSIVE placement effect showed one frame of
// panel at the stylesheet's fallback corner with no height cap, then jumped — on
// every builder open. jsdom has no paint to observe, so the invariant is pinned where
// it lives: the effect that places the panel is a layout effect.
test('the drag hook places its panel in the commit, before the browser paints', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('@babel/parser');
  const ast = parse(readFileSync(SRC, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const hook = ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'useDbuDrag');
  assert.ok(hook, 'useDbuDrag is gone — this guard is reading nothing');
  const placing = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' && /^use(Layout)?Effect$/.test(n.callee.property.name)) {
      const body = JSON.stringify(n.arguments[0], (k, v) => (k === 'loc' || k === 'start' || k === 'end' ? undefined : v));
      // the effect that computes a default position is the one that places the panel
      if (body.includes('"defRef"')) placing.push(n.callee.property.name);
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && !/Comments$/.test(k)) walk(n[k]);
  };
  walk(hook.body);
  assert.deepEqual(placing, ['useLayoutEffect'], 'the placement effect runs after paint again — every open will flash the unplaced panel');
});

// ── The client preview moves too, on the owner's ruling ─────────────────────
const openPreview = async () => {
  const tog = [...document.querySelectorAll('button.tog')].find((b) => /Preview as client/.test(b.textContent));
  assert.ok(tog, 'no preview toggle — without one this test asserts nothing');
  await React.act(async () => tog.click());
  const pop = document.querySelector('.pop');
  assert.ok(pop, 'the preview did not open');
  return pop;
};

test('the client preview can be dragged, and moving it releases the anchor it was pinned by', async () => {
  const root = await mountBuilder();
  const pop = await openPreview();
  assert.ok(!pop.getAttribute('style'), 'at rest it carries no inline position — the stylesheet’s bottom-right anchor still holds, and survives a resize');
  const head = pop.querySelector('.ph2.grab');
  assert.ok(head, 'the preview header is not a drag surface');
  const gh = head.querySelector('.gh');
  assert.ok(gh, 'the preview has no grip');
  const fire = (type, init) => React.act(async () => head.dispatchEvent(new window.PointerEvent(type, { bubbles: true, ...init })));
  await fire('pointerdown', { pointerId: 3, clientX: 900, clientY: 600 });
  await fire('pointermove', { pointerId: 3, clientX: 700, clientY: 300 });
  const style = document.querySelector('.pop').getAttribute('style') || '';
  assert.match(style, /left:/, 'a dragged preview is positioned by its own left');
  assert.match(style, /top:/, 'and its own top');
  // ⚠ THE RELEASED ANCHORS ARE THE LOAD-BEARING PART. `.pop` is anchored
  // `right:20px;bottom:20px`, and a `height:auto` box given BOTH `top` and
  // `bottom` is over-constrained: CSS stretches it to span them, so handing it a
  // `top` alone would silently resize the panel as well as move it.
  assert.match(style, /bottom:\s*auto/, 'the bottom anchor is released, or the box stretches instead of moving');
  assert.match(style, /right:\s*auto/, 'and the right anchor with it');
  await fire('pointerup', { pointerId: 3, clientX: 700, clientY: 300 });
  await React.act(async () => root.unmount());
});

// ⚠ ONE HOOK, TWO PANELS — asserted structurally, because the alternative this
// repo already records is three line-for-line copies of `useCoachDoc` that had
// drifted. Both panels must take their pointer handlers from `useDbuDrag`, and the
// pointer-capture dance must exist exactly once in the file.
test('both floating panels share one drag rule', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  const code = stripComments(readFileSync(SRC, 'utf8'));
  assert.equal((code.match(/= useDbuDrag\(\{/g) || []).length, 2, 'exactly two panels are draggable, and both go through the hook');
  assert.equal((code.match(/setPointerCapture/g) || []).length, 1, 'the capture dance is written once, not once per panel');
  assert.equal((code.match(/function useDbuDrag\b/g) || []).length, 1);
  // Each panel spreads the hook's own handler bundle rather than re-wiring five
  // pointer props by hand — a second hand-wiring is how one of them loses
  // `onLostPointerCapture` and strands a grabbing cursor.
  assert.equal((code.match(/\{\.\.\.(panel|previewPanel)\.headerProps\}/g) || []).length, 2);
});
