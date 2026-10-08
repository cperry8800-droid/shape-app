// The Eat page's demo meal plan (Prep the week), read out of the client source as data, so the
// rules a recipe's steps answer to can read the demo meals as well as the catalog's recipes.
//
// WHY IT IS SHARED. The demo plan's walk-away steps (bsHoldStep) are hands-off windows, the same
// thing a catalog recipe's stepMeta marks, and the catalog's window rules (tests/
// shape-kitchen-data.test.mjs) are the measured record of every way a window has been wrong. A
// copy of those rules for the demo would drift from them the first time either side learned
// something; one reader lets the rules themselves run over both.
//
// The plan is the `meals: [ … ]` lists inside BSClientEat's MOCK_PROGRAM. A day's recipe card
// sits beside its meals, not in them, and is read-only (BSRecipePreview has no Cook door), so it
// is not here. STRICT: every line of a meal's `steps: [ … ]` must be a plain string, a
// bsTimedStep(…) or a bsHoldStep(…) call, or this throws. A step this reader skipped would be a
// step no rule ever read, which reads exactly like a step every rule passed.
import { readFileSync } from 'node:fs';

export const CLIENT_SRC = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');

// A string literal whose opening quote is capture group `n` (its body is group n + 1). The
// backreference has to name the group by number, so the number is the caller's.
const lit = (n) => `(['"])((?:\\\\.|(?!\\${n}).)*)\\${n}`;
const unescape = (body) => body.replace(/\\(['"\\])/g, '$1');
const PLAIN_RE = new RegExp(String.raw`^\s*${lit(1)},?\s*$`);
const CALL_RE = new RegExp(String.raw`^\s*(bsTimedStep|bsHoldStep)\(${lit(2)}, (\d+), '(\w+)'\),?\s*$`);

// From an opening `[` to its closing `]`, stepping over string literals.
const bracketEnd = (src, open) => {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const ch = src[j];
    if (ch === "'" || ch === '"' || ch === '`') { for (j++; j < src.length && src[j] !== ch; j++) if (src[j] === '\\') j++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return j;
  }
  throw new Error('demo meal plan: an unclosed bracket');
};

const program = (() => {
  const start = CLIENT_SRC.indexOf('const MOCK_PROGRAM = React.useMemo(() => [\n    {\n      d: ');
  if (start < 0) throw new Error('the Eat page\'s demo program moved: point tests/helpers/demo-meal-plan.mjs at it');
  return CLIENT_SRC.slice(start, CLIENT_SRC.indexOf('\n  ], [t]);', start));
})();

// Each day's `meals: [ … ]`, as source text.
export const DEMO_MEAL_LISTS = (() => {
  const out = [];
  for (let i = program.indexOf('meals: ['); i >= 0; i = program.indexOf('meals: [', i + 1)) {
    const open = i + 'meals: '.length;
    out.push(program.slice(i, bracketEnd(program, open) + 1));
  }
  return out;
})();

// One step line → { text, meta, call }. `meta` is what the step carries into bsCookableFromMeal
// (null for a plain string), and `call` names the helper that built it.
const parseStepLine = (line, where) => {
  const call = line.match(CALL_RE);
  if (call) {
    return {
      text: unescape(call[3]),
      meta: { min: Number(call[4]), passive: call[1] === 'bsHoldStep', station: call[5] },
      call: call[1],
    };
  }
  const plain = line.match(PLAIN_RE);
  if (plain) return { text: unescape(plain[2]), meta: null, call: null };
  throw new Error(`demo meal plan, ${where}: a step line this reader cannot read — "${line.trim().slice(0, 80)}"`);
};

// Every demo meal that carries a method: { id, title, steps: [text], stepMeta: [meta | null],
// calls: [helper | null] }.
export const DEMO_MEALS = (() => {
  const out = [];
  for (const list of DEMO_MEAL_LISTS) {
    const heads = [...list.matchAll(/\bid: '([^']+)'/g)];
    heads.forEach((h, k) => {
      const meal = list.slice(h.index, k + 1 < heads.length ? heads[k + 1].index : list.length);
      const title = meal.match(new RegExp(String.raw`\btitle: ${lit(1)}`));
      const s = meal.indexOf('steps: [');
      if (s < 0) return;
      const open = s + 'steps: '.length;
      const body = meal.slice(open + 1, bracketEnd(meal, open));
      const where = `${h[1]}`;
      const steps = body.split('\n').filter((l) => l.trim()).map((l) => parseStepLine(l, where));
      out.push({
        id: h[1],
        title: title ? unescape(title[2]) : h[1],
        steps: steps.map((x) => x.text),
        stepMeta: steps.map((x) => x.meta),
        calls: steps.map((x) => x.call),
      });
    });
  }
  return out;
})();

// The same meals in the catalog's recipe shape ({ title, steps, stepMeta }), titled so a failure
// names the demo meal and not a catalog recipe.
export const DEMO_MEAL_RECIPES = DEMO_MEALS.map((m) => ({
  title: `Demo plan · ${m.title} (${m.id})`, steps: m.steps, stepMeta: m.stepMeta,
}));
