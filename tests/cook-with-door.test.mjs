// THE DOOR FROM "COOK THIS" TO A SECOND DISH.
//
// WHY THIS FILE EXISTS. The multi-dish prep session — the picker, the merged
// mise, and the three-way timing ask the whole cook orchestrator was built to
// serve — shipped reachable from exactly two places: the "Prep the week" row on
// the menu and the same row on the shop list. A member standing on a recipe with
// "Cook this" in front of them, at the moment they wanted to cook something
// alongside it, had no route to any of it. The engine worked; nothing led to it.
//
// So the assertions here are about REACHABILITY and about what the session
// CLAIMS, not about scheduling — cook-orchestrator.test.mjs and
// cook-serve-schedule.test.mjs own the plan itself and are untouched by this.
//
// Harness is the shared one in tests/helpers/broadsheet-mount.mjs: compile the
// shipping file in memory, resolve its imports to the real modules, drive the
// component with a hook shim. Nothing is stubbed or written to disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SRC, drive, pressable, textOf, loadBroadsheet, importSibling,
} from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const MOD = await loadBroadsheet(['BSPrepSession', 'BSCookWithDoor']);
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');
const { bsCookableFromRecipe } = await importSibling('..', 'services', 'cookable.mjs');

const SRC_TEXT = readFileSync(SRC, 'utf8');
const SRC_BARE = stripComments(SRC_TEXT);

// Two catalog dishes with real written methods, so a seed is held to the same bar
// every other candidate is. Picked by having steps rather than by name, so a
// catalog edit cannot quietly empty this file's fixtures.
const COOKABLES = SHAPE_KITCHEN_RECIPES
  .map((r) => bsCookableFromRecipe(r))
  .filter((c) => c && (c.steps || []).length >= 3);
assert.ok(COOKABLES.length >= 3, 'the catalog must supply at least three walkable dishes');

const SEED = COOKABLES[0];

// A program whose meals are DIFFERENT dishes from the seed, so a row count is a
// fact about the seeding rather than about a collision.
const PROGRAM = [{
  meals: [
    { id: 'm1', slot: 'Lunch', title: COOKABLES[1].title, kcal: 600, p: 45, c: 55, f: 18 },
    { id: 'm2', slot: 'Dinner', title: COOKABLES[2].title, kcal: 620, p: 42, c: 48, f: 24 },
  ],
}];

// The picker's dish rows are the only `aria-pressed` controls on that stage, so
// counting them counts candidates, and counting the true ones counts the
// selection. Read off the rendered tree rather than off the button's own label:
// the harness installs no translator, so `toMise` renders its `{n}` placeholder
// verbatim and the count is NOT in the text.
const rows = (s) => s.nodes().filter((n) => n.props && typeof n.props['aria-pressed'] === 'boolean');
const ticked = (s) => rows(s).filter((n) => n.props['aria-pressed'] === true);

// `s.click` matches on text STARTING WITH the label, and a TICKED row's text
// starts with its ✓ glyph — so a title alone can select a row but never
// deselect it. Toggling by content instead is robust to the glyph, and to it
// changing.
const toggle = (s, title) => {
  const btn = s.nodes().find((n) => n.type === 'button' && n.props.onClick
    && typeof n.props['aria-pressed'] === 'boolean' && textOf(n).includes(title));
  assert.ok(btn, `no picker row for ${JSON.stringify(title)}`);
  btn.props.onClick({ preventDefault() {}, stopPropagation() {} });
  return s.render();
};

test('a seeded session opens with that dish already ticked', () => {
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: SEED }, onClose() {} });

  assert.equal(ticked(s).length, 1, 'exactly the arrived-with dish is selected');
  assert.match(textOf({ props: { children: ticked(s)[0] } }), new RegExp(escape(SEED.title)),
    'and the ticked row is the seed, not whatever happened to be first');

  // Guard the guard: an unseeded session of the same program must open with
  // NOTHING ticked, or the assertion above passes on a picker that pre-selects
  // everything and says nothing about seeding at all.
  const plain = drive(MOD.BSPrepSession, { program: PROGRAM, onClose() {} });
  assert.equal(ticked(plain).length, 0, 'the "Prep the week" door still opens on an empty selection');
});

test('the seed REPLACES its duplicate rather than joining it', () => {
  // The member taps "Cook with something else" on a dish the session can already
  // see — this week's dinner. Two rows for one dish is not cosmetic: bsMergeMise
  // merges by ingredient, so ticking both buys and preps it twice, and the
  // orchestrator would schedule the dish against itself.
  const dupTitle = COOKABLES[1].title;
  const s = drive(MOD.BSPrepSession, {
    program: PROGRAM,
    seed: { cookable: COOKABLES[1] },
    onClose() {},
  });

  const titles = rows(s).map((n) => textOf({ props: { children: n } }));
  const hits = titles.filter((txt) => txt.includes(dupTitle)).length;
  assert.equal(hits, 1, `"${dupTitle}" must appear exactly once, got ${hits}`);
  assert.equal(rows(s).length, PROGRAM[0].meals.length,
    'the seed took the duplicate\'s place, so the row count is unchanged');
  assert.equal(ticked(s).length, 1, 'and the surviving row is the ticked one');
});

test('two identities that DISAGREE are two dishes, whatever the titles say', () => {
  // Codex, this PR. A member's own recipe may be called anything, so an exact
  // title match is a CLAIM about identity rather than proof of it — and where
  // both sides carry a real id, the ids settle it. Deduping here would take a
  // dish off the picker the member can see is not the one they arrived with.
  const seedC = { ...COOKABLES[0], title: PROGRAM[0].meals[0].title, mealId: 'my-own-uuid' };
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: seedC, mine: true }, onClose() {} });

  assert.equal(rows(s).length, PROGRAM[0].meals.length + 1,
    'the colliding-title program meal survives, because its id proves it is a different dish');
  const titles = rows(s).map((n) => textOf({ props: { children: n } }));
  assert.equal(titles.filter((x) => x.includes(PROGRAM[0].meals[0].title)).length, 2,
    'both dishes of that name are offered');

  // Guard the guard: with the seed's identity ABSENT the title is all there is,
  // and it must still dedupe — or this test passes on a rule that never merges.
  const noId = { ...COOKABLES[0], title: PROGRAM[0].meals[0].title, mealId: undefined };
  const s2 = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: noId }, onClose() {} });
  assert.equal(rows(s2).length, PROGRAM[0].meals.length, 'no identity to compare — the title decides');
});

test('replacing a program row carries its day and slot', () => {
  // `writeEntry` stamps dayIdx and slot onto the prep record; the wrap's
  // "{days} covered" and bsPrepMatch read them back. A replacement that dropped
  // them would let a session that genuinely prepped Tuesday's dinner report no
  // day at all. (Codex, this PR.)
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: COOKABLES[1] }, onClose() {} });
  const seedRow = rows(s)[0];
  assert.ok(textOf({ props: { children: seedRow } }).includes(COOKABLES[1].title), 'the seed leads the list');

  // The metadata is not rendered, so it is read off the candidate the component
  // built — reached through the servings stepper's own handler closure would be
  // indirect; instead assert via the shipped source that both fields are carried.
  assert.match(SRC_BARE, /dayIdx: hit \? hit\.dayIdx : undefined/, 'dayIdx comes from the matched row');
  assert.match(SRC_BARE, /slot: hit \? hit\.slot : undefined/, 'and so does slot');
  assert.match(SRC_BARE, /dayIdx: it\.dayIdx, slot: it\.slot/, 'and writeEntry is still what reads them');
});

test('unticking the arrived-with dish drops the cook-together claim', () => {
  // The seeded row is an ordinary toggle. A member may drop the dish they came
  // with and cook something else — and a session reading the PROP would then
  // head a one-dish cook "Cook together" and ask "What else is cooking?" about a
  // dish that is not going to be cooked. (Codex, this PR.)
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: SEED }, onClose() {} });
  assert.match(s.text, /Cook together/, 'seeded and ticked: the claim is true');

  toggle(s, SEED.title);                   // untick the seed
  assert.equal(ticked(s).length, 0, 'the seed is a real toggle');
  assert.doesNotMatch(s.text, /Cook together/, 'and the claim goes with it');
  assert.doesNotMatch(s.text, /What else is cooking\?/);
  assert.match(s.text, /What are we prepping\?/, 'it is the ordinary session it has become');

  toggle(s, SEED.title);                   // and back
  assert.match(s.text, /Cook together/, 'restored when the dish is restored');
});

test('a seed the session has no other route to gets its own row', () => {
  // The complement of the test above, and the case the door actually exists for:
  // a catalog recipe the member is browsing that is in neither their program nor
  // their library. Without this the picker would open with nothing ticked.
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: SEED }, onClose() {} });
  assert.equal(rows(s).length, PROGRAM[0].meals.length + 1, 'the seed is an extra candidate');
});

test('a seed with no written method is ignored, and the session says so by its framing', () => {
  // A cookable with no steps has nothing to interleave. It must not become a row
  // that cannot be cooked, and it must not flip the session into claiming to be
  // a cook-together when nothing arrived.
  const s = drive(MOD.BSPrepSession, {
    program: PROGRAM,
    seed: { cookable: { title: 'Nothing to walk', steps: [] } },
    onClose() {},
  });
  assert.equal(rows(s).length, PROGRAM[0].meals.length, 'no phantom row');
  assert.equal(ticked(s).length, 0, 'nothing ticked');
  assert.match(s.text, /What are we prepping\?/, 'and it is still the week\'s session');
});

test('the session names the door it was opened by', () => {
  // Same engine, two framings. Arriving from the menu it IS the Sunday ritual;
  // arriving from a recipe it is two dishes now, and a screen reading "The week
  // is set." would be describing something the member did not do.
  const week = drive(MOD.BSPrepSession, { program: PROGRAM, onClose() {} });
  assert.match(week.text, /Prep the week/);
  assert.match(week.text, /What are we prepping\?/);
  assert.doesNotMatch(week.text, /Cook together/);

  const now = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: SEED }, onClose() {} });
  assert.match(now.text, /Cook together/);
  assert.match(now.text, /What else is cooking\?/);
  assert.doesNotMatch(now.text, /Prep the week/, 'a tonight cook does not claim to be the week');
  assert.doesNotMatch(now.text, /What are we prepping\?/);
});

test('the picker says what a SECOND dish buys, at one dish and not at two', () => {
  // The reported defect in one sentence: a member with one dish ticked had no way
  // to know that ticking another unlocked anything at all.
  const s = drive(MOD.BSPrepSession, { program: PROGRAM, seed: { cookable: SEED }, onClose() {} });
  assert.equal(ticked(s).length, 1);
  assert.match(s.text, /Tick another dish/, 'the nudge is shown at exactly one dish');
  assert.doesNotMatch(s.text, /How these are timed/, 'and the "next" line is not, yet');

  s.click(COOKABLES[1].title, pressable);
  assert.equal(ticked(s).length, 2);
  assert.doesNotMatch(s.text, /Tick another dish/, 'the nudge retires once it has been taken');
  assert.match(s.text, /How these are timed/, 'and the choice that is coming is named');

  // ⚠ NO FIGURES ON EITHER LINE, and that is the point rather than an omission.
  // The three options can only be COSTED once the kitchen is known, which is the
  // mise's question; a minute quoted here would advertise a schedule nothing has
  // planned. Asserted as an absence so a later "helpful" addition fails.
  assert.doesNotMatch(s.text, /How these are timed[^.]*\d+\s*min/,
    'the picker must not quote minutes it has not planned');
});

test('the nudge is not shown when there is nothing to add', () => {
  // A member whose only candidate is the dish they arrived with would otherwise
  // read an instruction they cannot follow.
  const s = drive(MOD.BSPrepSession, { program: [], seed: { cookable: SEED }, onClose() {} });
  assert.equal(rows(s).length, 1, 'the seed is the only candidate');
  assert.doesNotMatch(s.text, /Tick another dish/);
});

test('the door renders beside a walkable dish and fires shape:cookWith', () => {
  const fired = [];
  const prev = window.dispatchEvent;
  window.dispatchEvent = (e) => { if (e && e.type === 'shape:cookWith') fired.push(e.detail); return true; };
  try {
    const s = drive(MOD.BSCookWithDoor, { cookable: SEED });
    assert.match(s.text, /Cook with something else/);
    s.click('＋');
    assert.equal(fired.length, 1, 'one event per tap');
    assert.equal(fired[0].cookable, SEED, 'and it carries the COOKABLE, not a lookup key');
  } finally { window.dispatchEvent = prev; }
});

test('the door carries the cookable because two of its three homes cannot resolve a key', () => {
  // The member's own recipe lives in their client_recipes document and a meal
  // opened from Home belongs to that day's program — neither is resolvable from
  // the Eat tab, so a key would arrive with nothing to resolve it against and the
  // session would open empty: the defect this door exists to fix, in a new coat.
  const fired = [];
  const prev = window.dispatchEvent;
  window.dispatchEvent = (e) => { if (e && e.type === 'shape:cookWith') fired.push(e.detail); return true; };
  try {
    drive(MOD.BSCookWithDoor, { cookable: SEED, mine: true }).click('＋');
    assert.equal(fired[0].mine, true, 'a member recipe says so');
    assert.ok(Array.isArray(fired[0].cookable.steps) && fired[0].cookable.steps.length,
      'the payload is walkable on arrival');
  } finally { window.dispatchEvent = prev; }
});

test('the door is absent for a dish with no written method', () => {
  for (const c of [null, undefined, { title: 'x' }, { title: 'x', steps: [] }]) {
    const s = drive(MOD.BSCookWithDoor, { cookable: c });
    assert.equal(s.nodes().filter((n) => n.type === 'button').length, 0,
      `no door for ${JSON.stringify(c)} — its seed could not be cooked`);
  }
});

test('every "Cook this" door has the second door beside it', () => {
  // Derived, not enumerated: whatever the count of solo cook doors is, each one
  // is answered. A fourth added later without its companion fails here rather
  // than shipping the original defect on a new screen.
  const solo = SRC_BARE.match(/tr\('cook:cta',/g) || [];
  const second = SRC_BARE.match(/<BSCookWithDoor\b/g) || [];
  assert.ok(solo.length >= 3, `expected the known solo cook doors, found ${solo.length}`);
  assert.equal(second.length, solo.length,
    `${solo.length} "Cook this" doors but ${second.length} "Cook with something else" doors`);
});

test('the shell routes shape:cookWith to the Eat tab', () => {
  // Structural: mounting the whole client shell to drive one listener costs far
  // more than it proves. What must not silently disappear is the listener, the
  // tab it lands on, and the refusal of a payload with nothing to cook.
  const m = SRC_BARE.match(/addEventListener\('shape:cookWith'[\s\S]{0,80}?\)/);
  assert.ok(m, 'the shell must listen for shape:cookWith');
  const handler = SRC_BARE.slice(
    SRC_BARE.indexOf("const open = (e) => {", SRC_BARE.indexOf('shape:cookWith') - 1200),
    SRC_BARE.indexOf("addEventListener('shape:cookWith'"),
  );
  assert.match(handler, /setTab\('eat'\)/, 'it lands on the tab that owns the prep session');
  assert.match(handler, /steps\s*\|\|\s*\[\]\)\.length\)\s*return/, 'and refuses a dish with no method');
});

test('"Prep the week" cannot inherit a seed left by "Cook with something else"', () => {
  // Opening the week's ritual and finding last night's dish already ticked is the
  // kind of stale state that reads as the app having its own plans for you. Every
  // door goes through one opener, so the seed is set on EVERY open — including to
  // null — rather than only when there is one.
  const opener = SRC_BARE.match(/const openPrep = React\.useCallback\((\([\s\S]*?\}), \[\]\);/);
  assert.ok(opener, 'the single opener must exist');

  // ⚠ DRIVEN, NOT PATTERN-MATCHED, and the mutation round is why. `if (s)
  // setPrepSeed(s)` satisfies every regex that names setPrepSeed — and IS the
  // defect this test exists for: the week's door would then keep whatever the
  // last "Cook with something else" left behind. Calling the shipped opener with
  // no argument is the only question that separates the two.
  const seeds = []; const opened = [];
  // eslint-disable-next-line no-new-func
  new Function('setPrepSeed', 'setPrepOpen', `(${opener[1]})()`)(
    (v) => seeds.push(v), (v) => opened.push(v),
  );
  assert.deepEqual(seeds, [null], 'opening with no seed must CLEAR the seed, not skip the write');
  assert.deepEqual(opened, [true], 'and still open the session');
  // ⚠ ASSERTED AS A COUNT, NOT AN ABSENCE. `openPrep` legitimately contains the
  // only `setPrepOpen(true)` there is, so a flat ban fails the correct tree; what
  // must not exist is a SECOND one, which is a door that skipped the opener and
  // therefore inherits whatever seed the last one left.
  const opens = SRC_BARE.match(/setPrepOpen\(true\)/g) || [];
  assert.equal(opens.length, 1, `exactly one setPrepOpen(true), inside openPrep — found ${opens.length}`);
  assert.ok(opener[0].includes('setPrepOpen(true)'), 'and that one is the opener\'s');
  assert.match(SRC_BARE, /onClose=\{\(\) => \{ setPrepOpen\(false\); setPrepSeed\(null\); \}\}/,
    'closing the session clears the seed too');
});

function escape(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
