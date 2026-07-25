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
import { bsStepTimers, bsFractionalDuration, BS_TIMER_UNITS } from '../mobile-app/src/services/cookable.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// The website carries a content-parity copy of the catalog, so the same rules
// have to hold there or the two drift — a step fixed on mobile and not on the
// site would render the old double-timer to anyone browsing /recipes.
const SOURCES = [
  ['catalog', 'mobile-app/src/broadsheet/shapeKitchenData.js'],
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

test('cook steps: at most ONE timer per step (a step is one wait)', () => {
  const bad = ALL
    .map((x) => ({ ...x, tms: bsFractionalDuration(x.step) ? [] : bsStepTimers(x.step) }))
    .filter((x) => x.tms.length > 1);
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
  const bad = ALL.filter((x) => {
    if (bsFractionalDuration(x.step)) return false;      // already flagged above
    if (!bsStepTimers(x.step).length) return false;
    return SCHED.test(x.step);
  });
  assert.deepEqual(bad.map((x) => `${x.where} :: ${x.step}`), [],
    'a scheduling phrase with a parseable duration — write the time in words so it does not render as a countdown');
});

// NOTE — deliberately NOT asserted here: "every step carries a doneness cue".
// tests/shape-kitchen-data.test.mjs already enforces cue-richness for the
// catalog, and extending it to the meal plans fires on ~85 legitimate PLATING
// steps ("Scatter the walnuts over the granola side") which are assembly, not
// cooking, and correctly have nothing to be "done". A rule that noisy trains
// people to ignore the gate, so the four mechanical rules above are the contract
// and the prose standard stays a review judgement.
