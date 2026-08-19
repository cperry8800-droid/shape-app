// The cookable STEP contract — enforced across every source a cook can reach.
//
// `tests/shape-kitchen-data.test.mjs` already guards the Shape Kitchen catalog's
// shape (fields, structured quantities, macro-consistent kcal, honest photos,
// window metadata derived from the step text). This file guards the thing that
// bit us on screen instead: how a step's TEXT turns into timers, and it covers
// ALL THREE sources — the catalog, the demo meal plans, and the website's
// parity copy. The meal plans are where every real fault lived and no gate
// reached them before.
//
// Everything is parsed from SOURCE TEXT rather than imported, because the demo
// meal plans live inside a JSX component module that cannot be imported in Node
// (the store-catalogue-sync precedent). The rules are asserted with the REAL
// parser, so a test can never disagree with what the app will render.
//
// Adding a recipe? These four are the ones that fail silently in the UI:
//   1. a decimal ANYWHERE in a step makes the parser refuse ALL its timers, so a
//      real wait ("cover 12 min") loses its countdown with no error;
//   2. two waits crammed into one step render two competing chips;
//   3. a SCHEDULING note ("90 min before you train") is not a countdown, but the
//      parser cannot tell — write those without digits;
//   4. and none of the above was checked on the meal plans at all, which is
//      where every fault today actually lived.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bsStepTimers, bsFractionalDuration, BS_TIMER_UNITS, bsCookableFromRecipe } from '../mobile-app/src/services/cookable.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// The website carries a content-parity copy of the catalog, so the same rules
// have to hold there or the two drift — a step fixed on mobile and not on the
// site would render the old double-timer to anyone browsing /recipes.
const SOURCES = [
  ['catalog', 'mobile-app/src/broadsheet/shapeKitchenData.js'],
  // ⚠ The catalog is no longer ONE file. The 50 USDA MyPlate recipes live in
  // their own module, and a hardcoded source list silently excludes whatever it
  // was not told about — so without this line their steps are scanned on the
  // WEBSITE (inlined into recipes.jsx) and nowhere on mobile, which reports half
  // the truth and reads like a pass. Adding a catalog file means adding it here.
  ['usda catalog', 'mobile-app/src/broadsheet/shapeKitchenData.usda.js'],
  ['demo meal plans', 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'],
  ['website recipes', 'public/newdesign/recipes.jsx'],
];

// Pull every `steps: [ ... ]` array out of a source file, single- or multi-line.
// BOTH quote styles: the catalog writes its steps double-quoted and the meal
// plans single-quoted, and matching only one silently halves the coverage — which
// is precisely what the "every source is read" guard below exists to catch (it
// caught exactly that while this file was being written).
// Returns [{ where, step }] so a failure names the exact offending line.
const ITEM_ANY = /(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const ITEM_LINE = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?\s*$/;
function collectSteps(label, file) {
  const lines = read(file).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*steps:\s*\[/.test(lines[i])) continue;
    // single-line form: steps: ['a', 'b'],
    if (/\],\s*$/.test(lines[i])) {
      for (const m of lines[i].matchAll(ITEM_ANY)) {
        out.push({ where: `${label} ${file}:${i + 1}`, step: unesc(m[1] ?? m[2]) });
      }
      continue;
    }
    // multi-line form
    for (let j = i + 1; j < lines.length && !/^\s*\],?\s*$/.test(lines[j]); j++) {
      const m = ITEM_LINE.exec(lines[j]);
      if (m) out.push({ where: `${label} ${file}:${j + 1}`, step: unesc(m[1] ?? m[2]) });
    }
  }
  return out;
}
const unesc = (s) => String(s).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');

const ALL = SOURCES.flatMap(([label, file]) => collectSteps(label, file));

// The allergen note has to SURVIVE the trip into Cook Mode, and that trip is an
// ALLOWLIST: `finishCookable` copies named fields and drops everything else, so a
// field nobody added is silently absent at the stove — the same publish-boundary
// class that has bitten this repo before. Cook Mode itself is rendered by no test,
// so without this the mise note is gated by nothing at all.
test('cookable: the allergen note survives the cookable allowlist', () => {
  const bearer = SHAPE_KITCHEN_RECIPES.find((r) => r.allergenNotes && r.allergenNotes.length);
  assert.ok(bearer, 'no note-bearing recipe in the catalog — this assertion would pass vacuously');
  const c = bsCookableFromRecipe(bearer);
  assert.ok(Array.isArray(c.allergenNotes), `${bearer.title}: allergenNotes did not cross into the cookable`);
  assert.deepEqual(c.allergenNotes, bearer.allergenNotes, 'the note changed shape crossing the boundary');
  assert.ok(c.allergenNotes[0].certification, 'the certification — the safety-bearing half — did not survive');

  // And the absent path: a note-less recipe must not arrive carrying `undefined`,
  // which a `.map` at the render site would throw on.
  const plain = SHAPE_KITCHEN_RECIPES.find((r) => r.allergenNotes === undefined);
  assert.ok(plain, 'every recipe carries a note — the absent path would go untested');
  assert.equal(bsCookableFromRecipe(plain).allergenNotes, null,
    'a note-less recipe must normalise to null, never undefined');
});

test('cook steps: every source is actually being read', () => {
  for (const [label, file] of SOURCES) {
    const n = collectSteps(label, file).length;
    assert.ok(n > 20, `${label} (${file}) yielded only ${n} steps — the parser above has drifted from the source shape, so these rules would silently guard nothing`);
  }
});

test('cook steps: no decimal anywhere in a step (it silently kills EVERY timer on that step)', () => {
  // bsFractionalDuration refuses all parser-derived timers on a step containing a
  // decimal, because the integer parser mis-reads them ("1.5 minutes" -> 5). That
  // is deliberately conservative — but it means a ratio like "rice 1:1.5" costs
  // the step its legitimate "12 min" countdown with no visible error. Write the
  // ratio in words ("1 part to 1 and a half parts") and keep the timer.
  const bad = ALL.filter((x) => bsFractionalDuration(x.step));
  assert.deepEqual(bad.map((x) => `${x.where} :: ${x.step}`), [],
    'decimal in a step — reword it (e.g. "1 and a half parts"), or the step loses all of its timers');
});

// A second duration is only a DEFECT when it is a second COMPETING wait. Three
// shapes are not:
//   ALTERNATIVE   "cook 10 minutes more, or wilt fresh spinach in about 2 minutes"
//                 -- the cook picks one; they never run together.
//   NESTED        "10 minutes ... adding the tortillas for the last 8 minutes"
//                 -- the second sits INSIDE the first and is a real cue.
//   TRAILING HOLD "bake 1 hour ...; rest 10 minutes before serving"
//                 -- a hold that follows the cook, not a rival to it.
//
// The original rationale was "two waits render two competing chips". #1906
// changed that premise: a chip now carries the step's own words ("Step 6 - bake"
// vs "Step 6 - rest"), so two chips are distinguishable rather than
// interchangeable. The rule still earns its place for two genuinely rival cooks
// ("sear the chicken 3 minutes, then boil the rice 8 minutes" -- split those).
//
// The remedy for a trailing hold is to SPLIT the step, and where both halves
// clear the 50-char floor it has been split in the USDA catalog. Where the hold
// reads "Rest 10 minutes before serving." -- 31 characters -- splitting would
// require inventing words for a public-domain recipe, so the SHAPE is exempted
// here rather than the text rewritten.
// Tested against the step text from its FIRST digit onward -- the span that can
// explain what a later duration is. Deliberately not a hand-built duration regex:
// three attempts at one in this file lost their backslashes to a quoting layer and
// silently matched nothing, which is how a narrowing turns into a blanket pass.
const TWO_TIMER_OK = [
  /\bor\b/i,                                             // ALTERNATIVE: the cook picks one
  /\b(?:for|in)\s+the\s+last\b/i,                        // NESTED: inside the first wait
  /[;,]\s*(?:then\s+)?(?:rest|stand|cool|chill|set)\b/i,  // TRAILING HOLD
];
test('cook steps: at most ONE timer per step (a step is one wait)', () => {
  const bad = ALL
    .map((x) => ({ ...x, tms: bsFractionalDuration(x.step) ? [] : bsStepTimers(x.step) }))
    .filter((x) => x.tms.length > 1)
    .filter((x) => {
      const digits = '0123456789';
      let first = -1;
      for (let i = 0; i < x.step.length; i++) if (digits.includes(x.step[i])) { first = i; break; }
      if (first < 0) return true;
      return !TWO_TIMER_OK.some((re) => re.test(x.step.slice(first)));
    });
  assert.deepEqual(bad.map((x) => `${x.where} :: ${x.step} -> ${x.tms.map((t) => t.label).join(' + ')}`), [],
    'two waits on one step render two competing chips — split them into a step each');
});

test('cook steps: a SCHEDULING note never carries a parseable duration', () => {
  // "Eat the dates 30 min before you warm up" is a schedule, not a countdown, but
  // the parser cannot tell the two apart and would offer a timer for it. Those
  // read naturally without digits ("about half an hour before"), which also stops
  // the chip. Only flags a duration that sits next to a scheduling word.
  // The duration must sit IMMEDIATELY before the scheduling word — "40 min before
  // cooking" is a schedule, whereas "sit 2 minutes to build a crust before
  // breaking it apart" is a real wait that merely contains the word "before".
  // Matching on mere co-occurrence flagged both and would have forced perfectly
  // good rest steps to be reworded.
  //
  // The unit vocabulary comes from the PARSER (BS_TIMER_UNITS), not a second
  // copy written here. Restating it would let this rule keep passing while
  // silently ceasing to cover a unit the parser had gained — the gate would
  // narrow with nothing failing, which is the exact failure mode this file
  // exists to prevent (see the "every source is read" guard above).
  const SCHED = new RegExp(`\\d+\\s*(?:${BS_TIMER_UNITS})\\.?\\s+(?:before|after|ahead of|prior to)\\b`, 'i');
  const HOLDS = /\b(?:rest|stand|chill|refrigerate|freeze|cool|marinate|soak|steep|rise|proof|sit|hold|bake|roast|simmer|boil|steam|heat|cook|warm)\b[^.;]{0,40}$/i;
  const bad = ALL.filter((x) => {
    if (bsFractionalDuration(x.step)) return false;      // already flagged above
    if (!bsStepTimers(x.step).length) return false;
    const m = SCHED.exec(x.step);
    if (!m) return false;
    // A duration is only a SCHEDULE when nothing in the step is waiting it out.
    // The target is "Eat 90 min before warm-up": the 90 minutes is a GAP and
    // `Eat` cannot own it. But "Rest the roast on a board for 10 minutes before
    // slicing" is a REAL wait that merely ends with a scheduling word, and the
    // unqualified rule flagged seven of those in the USDA catalog -- every one a
    // rest, chill, stand or bake the cook genuinely times. Rewording those would
    // delete a legitimate countdown to satisfy a rule aimed at something else.
    // So the duration must be OWNED by a verb that can hold it; `Eat` is not on
    // the list, so the original target still fails.
    return !HOLDS.test(x.step.slice(0, m.index));
  });
  assert.deepEqual(bad.map((x) => `${x.where} :: ${x.step}`), [],
    'a scheduling phrase with a parseable duration — write the time in words so it does not render as a countdown');

  // RANGED durations are covered, and this pins it rather than leaving it to be
  // re-argued. bsStepTimers accepts "10–15 minutes"; SCHED is unanchored, so it
  // matches from the range's SECOND number ("15 minutes before") — the prefix is
  // irrelevant to whether a scheduling phrase carries a parseable duration.
  // Both polarities are asserted so the rule can't silently widen either way.
  for (const s of ['Rest 10-15 minutes before slicing', 'Rest 10–15 minutes before slicing',
                   'Rest 10 - 15 minutes before slicing', 'Chill 30-45 min before serving',
                   'Marinate 2-3 hours ahead of dinner', 'Eat 30 min prior to training']) {
    assert.ok(SCHED.test(s), `ranged scheduling note should be flagged: ${s}`);
  }
  for (const s of ['sit 2 minutes to build a crust before breaking it apart',
                   'Rest 10-15 minutes, then slice', 'Roast 30 minutes until golden']) {
    assert.ok(!SCHED.test(s), `real wait must NOT be flagged as a schedule: ${s}`);
  }
});

// NOTE — deliberately NOT asserted here: "every step carries a doneness cue".
// tests/shape-kitchen-data.test.mjs already enforces cue-richness for the
// catalog, and extending it to the meal plans fires on ~85 legitimate PLATING
// steps ("Scatter the walnuts over the granola side") which are assembly, not
// cooking, and correctly have nothing to be "done". A rule that noisy trains
// people to ignore the gate, so the four mechanical rules above are the contract
// and the prose standard stays a review judgement.
