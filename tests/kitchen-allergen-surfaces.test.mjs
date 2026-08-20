// The allergen note on the two mobile surfaces that ACT on a recipe without
// ever opening its card: the Shape Kitchen result row (which carries
// `Send to grocery`) and the Prep Session's merged mise (which sets the board
// for a whole week of cooking).
//
// WHY THIS FILE EXISTS. `recipeNeeds` reads a title's ABSENCE from
// `_RECIPE_NOT_GF` / `_RECIPE_HAS_DAIRY` as a POSITIVE claim of safety. A
// handful of recipes keep their "Gluten-free"/"Dairy-free" claim over an
// AMBIGUOUS ingredient (oats, soy sauce, broth/stock/bouillon, margarine) only
// because they carry a note naming the safe form to buy. The note is the ONLY
// thing making the restored claim honest — so a surface that publishes the
// claim, or lets a member act on it, without the note publishes a false claim.
//
// Both defects here were silent and both were RENDER-PATH defects: the markup
// existed elsewhere in the same file and simply never mounted on these paths.
// Nothing but a mount can catch that, so this file mounts and DRIVES the real
// components — the filter is really clicked, the recipes are really selected.
// Harness is the shared one in tests/helpers/broadsheet-mount.mjs: compile the
// shipping file in memory, resolve its imports to the real modules, call the
// component with a hook shim. No source file is written or stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  drive, pressable, count, loadBroadsheet, importSibling,
} from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSRecipeBox', 'BSPrepSession', 'BSCookMode']);
const DATA = await importSibling('shapeKitchenData.js');
const { SHAPE_KITCHEN_RECIPES, recipeNeeds, bsAllergenNoteText } = DATA;
const { bsCookableFromRecipe } = await importSibling('..', 'services', 'cookable.mjs');

// Every result row carries this action exactly once, so it is what tells one
// recipe's own subtree from the whole list.
const ROW_MARKER = 'Send to grocery';

// `bsCookableFromRecipe` may return null for a recipe it cannot turn into a method,
// so `bsCookableFromRecipe(x).steps` inside a `.find` predicate dies with a TypeError
// on the first such recipe -- and a suite that throws while SELECTING its fixture
// reports a crash, not a finding. Measured: 0 of the 85 catalog recipes return null
// today, so this guards a contract rather than a live case.
const cookableOf = (r) => bsCookableFromRecipe(r) || { steps: [], stepMeta: [] };

// Pick a fixture recipe by predicate, and fail with the REASON when the catalog holds
// none -- an undefined `r` would otherwise surface as a TypeError three lines later.
const pickRecipe = (pred, why) => {
  const r = SHAPE_KITCHEN_RECIPES.find((x) => pred(x, cookableOf(x)));
  assert.ok(r, `no catalog recipe ${why} -- this test cannot discriminate`);
  return r;
};

const driveBox = (props) => drive(MOD.BSRecipeBox, props, { rowMarker: ROW_MARKER });


// The text of ONE note block: from its own eyebrow through its composed text.
// ⚠ Scoped deliberately — the merged mise's INGREDIENT rows already name every
// selected dish, so asserting a title against the whole page proves nothing about
// the note's own attribution (a dropped attribution survives that assertion).
function noteBlock(pageText, composed) {
  const end = pageText.indexOf(composed);
  if (end < 0) return null;
  const start = pageText.lastIndexOf('ALLERGEN · ', end);
  if (start < 0) return null;
  return pageText.slice(start, end + composed.length);
}
const NOTED = SHAPE_KITCHEN_RECIPES.filter((r) => (r.allergenNotes || []).length > 0);

test('the catalog still carries restored claims — otherwise every assertion below is vacuous', () => {
  assert.ok(NOTED.length >= 14, `only ${NOTED.length} note-bearing recipes — the attach loop is not running`);
  const claimed = NOTED.filter((r) => recipeNeeds(r).some((n) => n === 'Gluten-free' || n === 'Dairy-free'));
  assert.equal(claimed.length, NOTED.length,
    'a note-bearing recipe no longer publishes a free-from claim — re-point these tests before trusting them');
  // The absent path is the crash path: 71 of 85 have NO `allergenNotes` key at
  // all (undefined, not []), and mapping that unguarded parses and typechecks
  // clean while crashing at render.
  assert.ok(SHAPE_KITCHEN_RECIPES.some((r) => r.allergenNotes === undefined),
    'every recipe carries notes — the absent-key path is untested');
});

// ── P1-A · the Shape Kitchen result row ─────────────────────────────────────
// The row is what the FREE FROM filters return AND it carries `Send to grocery`,
// so a member can put generic oats / soy sauce / broth / margarine on a shopping
// list having never opened the card that qualifies the claim.

test('recipe box: the Gluten-free filter returns rows that carry their certification', () => {
  const box = driveBox({
    recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {},
  });
  box.click('Filters');
  box.clickChip('Gluten-free');

  const listed = SHAPE_KITCHEN_RECIPES.filter((r) => recipeNeeds(r).includes('Gluten-free'));
  assert.ok(listed.length > 0, 'nothing claims Gluten-free — the filter proves nothing');
  const shown = listed.filter((r) => box.row(r.title) !== null);
  assert.equal(shown.length, listed.length, 'the Gluten-free filter did not return the rows it should have');
  // Guard the guard: a filter that returned NOTHING, or a click that missed,
  // would leave every "the note is there" assertion below trivially satisfied.
  const excluded = SHAPE_KITCHEN_RECIPES.find((r) => !recipeNeeds(r).includes('Gluten-free'));
  assert.equal(box.row(excluded.title), null, `the filter did not apply — "${excluded.title}" is still listed`);

  const missing = [];
  for (const r of listed) {
    if (!(r.allergenNotes || []).length) continue;
    const row = box.row(r.title);
    for (const n of r.allergenNotes) {
      if (!row.includes(n.certification)) missing.push(`${r.title}: ${n.allergen}`);
    }
  }
  assert.ok(NOTED.some((r) => recipeNeeds(r).includes('Gluten-free')), 'no note-bearing recipe survives the filter');
  assert.deepEqual(missing, [], 'a filtered row published a free-from claim with no certification on it');
});

test('recipe box: the certification renders BEFORE the row grocery action, unattributed', () => {
  const box = driveBox({
    recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {},
  });
  const r = NOTED.find((x) => recipeNeeds(x).includes('Gluten-free') && x.allergenNotes[0].allergen === 'gluten');
  assert.ok(r, 'no gluten-noted recipe with a restored claim');
  const row = box.row(r.title);
  assert.ok(row, `"${r.title}" is not in the unfiltered list`);
  const n = r.allergenNotes[0];
  assert.ok(row.includes(`ALLERGEN · ${n.allergen.toUpperCase()}`), 'the row note is missing its unattributed eyebrow');
  assert.ok(row.indexOf(n.certification) < row.indexOf('Send to grocery'),
    'the certification renders AFTER the grocery action — the member acts before reading it');
  // The note is the catalog's own voice. Putting it behind the recipe's byline
  // would attribute a brand/certification recommendation to a named author or
  // to the USDA — the exact fabrication `allergenNotes` exists to prevent.
  const credit = String(r.by || r.source || '');
  if (credit) {
    const eyebrowAt = row.indexOf(`ALLERGEN · ${n.allergen.toUpperCase()}`);
    const block = row.slice(eyebrowAt, row.indexOf(n.certification) + n.certification.length);
    assert.ok(!block.includes(credit), 'the row note rendered behind the recipe attribution — a fabricated byline');
  }
});

test('recipe box: the note block renders on exactly the note-bearing rows', () => {
  const box = driveBox({
    recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {},
  });
  const expected = SHAPE_KITCHEN_RECIPES.reduce((a, r) => a + (r.allergenNotes || []).length, 0);
  assert.equal(count(box.text, 'ALLERGEN · '), expected,
    'the row note block rendered on the wrong set of recipes');
  const plain = SHAPE_KITCHEN_RECIPES.find((r) => r.allergenNotes === undefined);
  assert.ok(!box.row(plain.title).includes('ALLERGEN'), `"${plain.title}" carries no note but rendered one`);
});

// ── P1-B · the Prep Session merged mise ─────────────────────────────────────
// A prep-session candidate is filtered on `c.steps.length`, so BSCookMode's
// `inPrep && hasMethod` branch always opens on 'method' and its own mise (which
// holds the note block) is skipped; the interleaved path mounts BSPrepCook,
// which has no mise at all. The merged mise is the only screen both paths cross.

const OATS_A = 'Overnight oats, three ways';
const OATS_B = 'Maple banana oatmeal with walnuts';
const BROTH = 'Turkey chili verde';
const PROGRAM = [{
  meals: [
    { id: 'p1', slot: 'Breakfast', title: OATS_A, kcal: 420, p: 20, c: 55, f: 12 },
    { id: 'p2', slot: 'Breakfast', title: OATS_B, kcal: 400, p: 15, c: 60, f: 10 },
    { id: 'p3', slot: 'Dinner', title: BROTH, kcal: 500, p: 40, c: 30, f: 18 },
  ],
}];

function prepAtMise() {
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, onClose() {} });
  for (const title of [OATS_A, OATS_B, BROTH]) s.click(title, pressable);
  s.click('Merge the mise');
  return s;
}

test('cook mode: the note survives EVERY entry into cooking, not just the mise', () => {
  // This pin used to assert the OPPOSITE — that BSCookMode could not carry the note on
  // a prep path — because the block lived only in the mise. Codex round 3 showed that
  // was not merely a gap in prep: `method` is reachable THREE ways (Start cooking,
  // `Resume at step N`, and BSCookMode opening straight on it when `prep` is set), and
  // the note rendered on none of them. A member with a resume stamp — including one
  // persisted by the build BEFORE these notes existed — tapped through and the caveat
  // unmounted with the mise. The block is now one definition rendered on every phase.
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === OATS_A);
  const c = bsCookableFromRecipe(r);
  assert.ok(c.steps.length > 0, `"${OATS_A}" has no method — it would not be a prep candidate at all`);

  const solo = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  assert.ok(solo.text.includes('ALLERGEN · GLUTEN'), 'the solo mise lost its note');

  // Prep mode opens directly on `method`, skipping the mise entirely.
  const inPrep = drive(MOD.BSCookMode, {
    cookable: c, onClose() {}, prep: { index: 0, count: 1, onPrepped() {} },
  });
  assert.ok(inPrep.text.includes('ALLERGEN · GLUTEN'),
    'prep mode opens on the method phase and shows no caveat — the member cooks the ambiguous ingredient blind');

  // Walking from the mise into the method must not drop it either.
  const walked = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  walked.click('Start cooking');
  assert.ok(walked.text.includes('ALLERGEN · GLUTEN'),
    'the caveat vanished on entering the method phase');

  // ⚠ The merged BSPrepSession board is still required and is NOT made redundant by
  // this: the interleaved path mounts BSPrepCook, which is not BSCookMode at all.
});

test('cook mode: the caveat precedes the resume shortcut, which jumps past the mise', () => {
  // Ordering, not presence: `Resume at step N` switches to `method` on tap, so a
  // caveat rendered after it is one a resuming member never passes.
  const r = SHAPE_KITCHEN_RECIPES.find((x) => x.title === OATS_A);
  const c = bsCookableFromRecipe(r);
  const solo = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  const note = solo.text.indexOf('ALLERGEN · GLUTEN');
  assert.ok(note >= 0, 'no caveat on the mise at all');
  const resume = solo.text.indexOf('Resume at step');
  if (resume >= 0) {
    assert.ok(note < resume, 'the caveat renders after the resume shortcut, which unmounts it on tap');
  }
  // Whether or not this fixture carries a resume stamp, the method phase itself must
  // carry the caveat — that is what makes the resume path safe in either case.
  solo.click('Start cooking');
  assert.ok(solo.text.includes('ALLERGEN · GLUTEN'), 'the method phase carries no caveat');
});

test('prep session: the merged mise carries the selected recipes allergen notes', () => {
  const s = prepAtMise();
  // Guard the guard: prove we are ON the merged mise, with real content.
  assert.ok(s.text.includes('One board, everything.'), 'the session never reached the merged mise');
  assert.ok(s.text.includes('Start the session →'), 'the mise rendered without its start action');

  const oats = SHAPE_KITCHEN_RECIPES.find((r) => r.title === OATS_A).allergenNotes[0];
  const broth = SHAPE_KITCHEN_RECIPES.find((r) => r.title === BROTH).allergenNotes[0];
  assert.ok(s.text.includes('ALLERGEN · GLUTEN'), 'the merged mise carries no allergen eyebrow');
  // The full composed text, brands and all — the mise is where "buy the
  // certified one" is actionable, so it gets the same treatment the solo
  // cook's mise gets, not the row's certification-only clause.
  assert.ok(s.text.includes(bsAllergenNoteText(oats)), 'the oats note is not on the merged board');
  assert.ok(bsAllergenNoteText(oats).length > oats.certification.length,
    'the oats note has no brand clause — the composed-text assertion above proves less than it looks');
  assert.ok(s.text.includes(bsAllergenNoteText(broth)), 'the broth note is not on the merged board');
});

test('prep session: identical notes de-duplicate and name every dish they came from', () => {
  const s = prepAtMise();
  const oats = SHAPE_KITCHEN_RECIPES.find((r) => r.title === OATS_A).allergenNotes[0];
  const twin = SHAPE_KITCHEN_RECIPES.find((r) => r.title === OATS_B).allergenNotes[0];
  assert.deepEqual(twin, oats, 'the two oat notes differ — this de-duplication test is testing nothing');
  assert.equal(count(s.text, bsAllergenNoteText(oats)), 1, 'the shared oats note printed once per dish');
  assert.equal(count(s.text, 'ALLERGEN · '), 2, 'the merged board did not collapse to one note per certification');

  // A merged board is otherwise silent about WHICH dish the caveat applies to —
  // and the attribution must live in the NOTE, not merely somewhere on the page.
  const oatsBlock = noteBlock(s.text, bsAllergenNoteText(oats));
  assert.ok(oatsBlock, 'could not isolate the oats note block');
  for (const title of [OATS_A, OATS_B]) {
    assert.ok(oatsBlock.includes(title), `the oats note itself does not name "${title}"`);
  }
  // Per-note, not a blanket list: the broth note names its own dish and only that.
  const broth = SHAPE_KITCHEN_RECIPES.find((r) => r.title === BROTH).allergenNotes[0];
  const brothBlock = noteBlock(s.text, bsAllergenNoteText(broth));
  assert.ok(brothBlock, 'could not isolate the broth note block');
  assert.ok(brothBlock.includes(BROTH), `the broth note does not name "${BROTH}"`);
  assert.ok(!brothBlock.includes(OATS_A) && !brothBlock.includes(OATS_B),
    'the broth note is attributed to the oat dishes — the attribution is not per-note');
});

test('prep session: a note-free board renders no note block and does not crash', () => {
  const plain = pickRecipe((r, c) => r.allergenNotes === undefined && c.steps.length > 0,
    'carries no allergen note and has a method');
  assert.ok(plain, 'no note-free recipe with a method — the absent path cannot be exercised');
  const s = drive(MOD.BSPrepSession, {
    program: [{ meals: [{ id: 'q1', slot: 'Dinner', title: plain.title }] }], onClose() {},
  });
  s.click(plain.title, pressable);
  s.click('Merge the mise');
  assert.ok(s.text.includes('One board, everything.'), 'the note-free session never reached the merged mise');
  assert.ok(!s.text.includes('ALLERGEN'), `"${plain.title}" carries no notes but the board printed one`);
});

test('cook mode: a note-LESS cookable renders every phase without throwing', () => {
  // The block is built once per render from `cookable.allergenNotes`, which is ABSENT
  // on 71 of 85 catalog recipes and on every non-catalog cookable (meals, free text).
  // Without the `|| []` coalesce this throws for almost every cook in the app — and a
  // suite that only ever drives note-BEARING recipes never sees it. That exact
  // mutation survived until this test existed.
  const plain = pickRecipe((r, c) => r.allergenNotes === undefined && c.steps.length > 0,
    'carries no allergen note and has a method');
  assert.ok(plain, 'no note-free recipe with a method — the absent path cannot be exercised');
  const c = bsCookableFromRecipe(plain);
  assert.equal(c.allergenNotes, null, 'fixture is not actually note-free at the cookable boundary');

  const mise = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  assert.ok(!mise.text.includes('ALLERGEN'), `"${plain.title}" carries no notes but the mise printed one`);
  mise.click('Start cooking');
  assert.ok(!mise.text.includes('ALLERGEN'), `"${plain.title}" printed a caveat on the method phase`);

  // And through the prep entry, which opens straight on `method`.
  const inPrep = drive(MOD.BSCookMode, {
    cookable: c, onClose() {}, prep: { index: 0, count: 1, onPrepped() {} },
  });
  assert.ok(!inPrep.text.includes('ALLERGEN'), `"${plain.title}" printed a caveat in prep mode`);
});

// ── the progress readout, RENDERED ─────────────────────────────────────────────
// bsProgressPct is unit-tested in tests/cook-orchestrator.test.mjs. This asserts the
// number actually reaches a cook: a percentage computed and never rendered, or rendered
// from the wrong variable, is invisible to a pure-function test.
test('cook mode: the step line carries a percentage, weighted by minutes', () => {
  const r = pickRecipe((x, c) => c.steps.length >= 3, 'has at least 3 steps');
  const c = bsCookableFromRecipe(r);
  const s = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  s.click('Start cooking');
  // ⚠ The harness tr shim returns `defaultValue` WITHOUT interpolating, so the label
  // reads literally "Step {n} of {m}". The PERCENTAGE is the component's own template
  // literal, not a tr() call, so it is real — and it is the thing under test.
  assert.match(s.text, /Step .* \u00b7 \d+%/,
    `no percentage beside the step line - got: ${(s.text.match(/Step[^A-Z]{0,40}/) || ['(no step line)'])[0]}`);
  // On the FIRST step nothing is done yet, so the honest figure is 0 — not "1 of 6".
  assert.match(s.text, /\u00b7 0%/, 'nothing is cooked yet, so the first step must read 0%');
});

test('cook mode: the percentage is minutes done, not steps ticked', () => {
  // A recipe with one long passive step is the case where the two disagree loudly.
  const r = pickRecipe(
    (x, c) => c.steps.length >= 4 && (c.stepMeta || []).some((m) => m && m.min >= 15),
    'has a long passive step');
  const c = bsCookableFromRecipe(r);
  const s = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  s.click('Start cooking');
  s.click('✓ Done');
  const shown = Number((s.text.match(/\u00b7 (\d+)%/) || [])[1]);
  const stepPct = Math.round((1 / c.steps.length) * 100);
  assert.ok(Number.isFinite(shown), 'no percentage on step 2');
  assert.notEqual(shown, stepPct,
    `the readout is counting steps (${stepPct}%), not minutes — a long passive step must move it differently`);
});

test('cook mode: overall % is the SESSION for several dishes, the dish for one - and the step line survives', () => {
  // The owner's rule: cooking several, the number is the whole evening; cooking one, it
  // is that dish. And the step-by-step must NOT be replaced by it.
  const r = pickRecipe((x, c) => c.steps.length >= 3, 'has at least 3 steps');
  const c = bsCookableFromRecipe(r);

  const solo = drive(MOD.BSCookMode, { cookable: c, onClose() {} });
  solo.click('Start cooking');
  assert.match(solo.text, /Step .* \u00b7 \d+%/, 'the step-by-step line and its own % must both survive');
  const soloOverall = Number((solo.text.match(/(\d+)% done/) || [])[1]);
  assert.ok(Number.isFinite(soloOverall), `no overall % in the header - got: ${solo.text.slice(0, 90)}`);
  assert.equal(soloOverall, 0, 'nothing is cooked yet');

  // Several dishes: half the evening is already behind us and none of THIS dish is
  // done, so the header must read the session, not this dish's 0%.
  // No 'Start cooking' click - prep mode opens directly on the method phase.
  const multi = drive(MOD.BSCookMode, {
    cookable: c, onClose() {},
    prep: { index: 1, count: 3, onPrepped() {}, priorMins: 50, totalMins: 100 },
  });
  const pct = Number((multi.text.match(/(\d+)% done/) || [])[1]);
  assert.ok(Number.isFinite(pct), `no overall % in the header - got: ${multi.text.slice(0, 90)}`);
  assert.equal(pct, 50, `50 of 100 minutes are behind us, so the session must read 50%, not ${pct}%`);
  assert.match(multi.text, /Step .* \u00b7 \d+%/, 'the step-by-step line must survive alongside the session figure');
});
