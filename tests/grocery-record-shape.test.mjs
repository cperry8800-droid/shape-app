// A saved grocery list is the member's OWN data. This pins the rule that came
// out of localizing it: the RECORD stores tokens, the RENDER makes the sentence.
//
// Why it matters: the eyebrow used to be written into the record as the literal
// 'Custom · Created today'. Two consequences, and the second is a live bug —
//   (1) a sentence written at save time freezes ONE language into a member's own
//       data, so switching language would leave their saved lists in the language
//       they created them in, forever;
//   (2) "today" is only true on the day it was written. A list made last month
//       still read "Created today" on every open.
//
// The source is a browser-babel JSX module that cannot be imported, so the pure
// helpers are extracted from the SHIPPED file and evaluated — the technique
// tests/online-visible-pref.test.mjs uses for public/supabase.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const src = fs.readFileSync(SRC, 'utf8');

// ── Extract the helpers by brace-matching the SHIPPED source ────────────────
// ⚠ The marker is the FULL declaration head. A bare name would match a call site
// and the body scan would start at the wrong brace — the extractFn trap this
// repo has paid for before.
function extractFn(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in the shipped source: ${marker}`);
  assert.equal(src.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

function extractConst(name) {
  const marker = `const ${name} = {`;
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `${name} not found`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1) + ';';
  }
  throw new Error('unbalanced');
}

// bsTrainT is the wave's injected-translator wrapper; the eyebrow helper calls
// it, so the harness supplies the real one from its own module.
const { bsTrainT } = await import('../mobile-app/src/broadsheet/bsClientWeekDemo.js');

function build({ locale = 'en' } = {}) {
  const body = [
    extractConst('BS_GROCERY_PROV'),
    extractFn('function bsGroceryIsToday('),
    extractFn('function bsGroceryListEyebrow('),
    extractFn('function bsGroceryIsSelfAuthored('),
    'return { BS_GROCERY_PROV, bsGroceryListEyebrow, bsGroceryIsSelfAuthored, bsGroceryIsToday };',
  ].join('\n');
  // bsDateLocale is defined far below the helpers in the real module (function
  // declarations hoist); the harness supplies it.
  return new Function('bsTrainT', 'bsDateLocale', body)(bsTrainT, () => locale);
}

const G = build();
const DAY = 86400000;

test('the record stores a TOKEN, and the render makes the sentence', () => {
  const eb = G.bsGroceryListEyebrow({ provenance: 'created', createdAt: Date.now() });
  assert.equal(eb, 'Custom · Created today');
  // The same record, under a translator, must move — that is the whole point.
  const shouty = (key, opts) => `«${key}»`;
  assert.equal(
    G.bsGroceryListEyebrow({ provenance: 'created', createdAt: Date.now() }, shouty),
    '«nutrition:eat.libCreatedToday»',
    'the eyebrow must route through the translator, not a baked string',
  );
});

test('"today" is only claimed when it IS today — the live lie this closes', () => {
  const old = Date.now() - 40 * DAY;
  const eb = G.bsGroceryListEyebrow({ provenance: 'created', createdAt: old });
  assert.ok(!/today/i.test(eb), `a 40-day-old list must not claim "today": ${eb}`);
  assert.ok(/^Custom · Created /.test(eb), eb);
  const saved = G.bsGroceryListEyebrow({ provenance: 'saved', createdAt: old });
  assert.ok(!/today/i.test(saved), saved);
});

test('a stamp-less row does not date itself to 1970 — the Number(null) class', () => {
  // Number(null) and Number('') are a finite 0. A coercing read would render
  // "Custom · Created 1 Jan" for a row carrying no stamp at all.
  for (const bad of [undefined, null, '', 'today', NaN, {}]) {
    const eb = G.bsGroceryListEyebrow({ provenance: 'created', createdAt: bad });
    assert.equal(eb, 'Custom · Created today', `createdAt=${JSON.stringify(bad)} produced ${eb}`);
    assert.ok(!/1970|Jan 1\b/.test(eb), eb);
  }
});

test('a legacy row renders its stored eyebrow — back-compat, never worse', () => {
  // Rows written before this shape carry no provenance. They must render exactly
  // what they render today, which also covers the BS_GROCERY_LIBRARY demo seeds
  // whose eyebrows are demo copy the house deliberately does not translate.
  assert.equal(
    G.bsGroceryListEyebrow({ eyebrow: 'Custom · Updated last Sun' }),
    'Custom · Updated last Sun',
  );
  assert.equal(G.bsGroceryListEyebrow({ eyebrow: 'Meal plan · Cutting' }), 'Meal plan · Cutting');
  assert.equal(G.bsGroceryListEyebrow({}), '');
  assert.equal(G.bsGroceryListEyebrow(null), '');
  // An unknown provenance is a legacy row too — never a crash, never a raw token.
  assert.equal(
    G.bsGroceryListEyebrow({ provenance: 'invented', eyebrow: 'Custom · Weekly' }),
    'Custom · Weekly',
  );
});

test('the date follows the SELECTED UI language, not the device', () => {
  const old = Date.now() - 40 * DAY;
  const en = build({ locale: 'en' }).bsGroceryListEyebrow({ provenance: 'created', createdAt: old });
  const de = build({ locale: 'de' }).bsGroceryListEyebrow({ provenance: 'created', createdAt: old });
  assert.notEqual(en, de, 'a date rendered through bsDateLocale must move with the locale');
});

test("a member's own list never enters the name extractor", () => {
  // ⚠ THE DEFECT THIS CLOSES: custom lists stored `author: 'You'`, and the Eat
  // byline runs `.split(' ')[0]` over the author — so a member opening their own
  // saved list read "From You · this week", and in any other locale an
  // untranslated English pronoun inside a translated sentence.
  assert.equal(G.bsGroceryIsSelfAuthored({ authorSelf: true }), true);
  assert.equal(G.bsGroceryIsSelfAuthored({ author: 'You' }), true, 'back-compat: rows this app already wrote');
  assert.equal(G.bsGroceryIsSelfAuthored({ author: '  You  ' }), true);
  // A real coach still gets credited.
  assert.equal(G.bsGroceryIsSelfAuthored({ author: 'Dr. Maya Patel' }), false);
  assert.equal(G.bsGroceryIsSelfAuthored({ author: 'Shape nutrition' }), false);
  assert.equal(G.bsGroceryIsSelfAuthored({}), false);
  assert.equal(G.bsGroceryIsSelfAuthored(null), false);
});

test('the byline gate is wired at the real call site', () => {
  // Every assertion above builds its own list object, so they would all pass with
  // the render unwired — the "an unwired caller looks perfectly plausible" trap.
  assert.match(
    src,
    /const selfList = bsGroceryIsSelfAuthored\(activeGroceryList\);/,
    'the Eat byline must ask the shared predicate',
  );
  assert.match(
    src,
    /const rawWho = selfList \? '' : String\(activeGroceryList\.author \|\| ''\)\.trim\(\);/,
    'a self-authored list must be emptied BEFORE the first-name extractor runs',
  );
  assert.match(src, /nutrition:eat\.fromYourList/, 'the self case needs its own copy, not a credit');
  assert.match(
    src,
    /<BSEyebrow color=\{color\}>\{bsGroceryListEyebrow\(l\)\}<\/BSEyebrow>/,
    'the library row must derive its eyebrow, not print the stored string',
  );
  // ⚠ AND SO MUST THE SEARCH. A record now stores a token, so `l.eyebrow` is the
  // back-compat string and can differ from what is on screen — searching the
  // stored copy matches text the member cannot see and misses text they can.
  assert.match(
    src,
    /bsGroceryListEyebrow\(l\)\.toLowerCase\(\)\.includes\(q\)/,
    'the library search must match the RENDERED eyebrow',
  );
  const matcher = src.slice(src.indexOf('const matchesQuery = (l) =>'));
  // ⚠ STRIP COMMENTS FIRST — the rationale ABOVE that line names the very thing
  // it bans, so a raw scan fires on its own explanation. This file has recorded
  // that trap before; it re-appeared the moment the assertion was written.
  const matcherBody = matcher.slice(0, matcher.indexOf('};')).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    matcherBody,
    /l\.eyebrow/,
    'the search must not fall back to the stored eyebrow',
  );
});

test('no writer bakes a rendered sentence into the record any more', () => {
  // The library/localStorage copy is what syncs to user_goals and what a member
  // carries between devices. A sentence in there is a language frozen into data.
  const writerRegion = (() => {
    const from = src.indexOf('const duplicateGroceryList =');
    const to = src.indexOf('const confirmCreateGroceryList =');
    assert.ok(from > 0 && to > from, 'writer region not found');
    return src.slice(from, src.indexOf('};', to) + 2);
  })();
  // ⚠ `[^,\n]*` CANNOT CROSS THE COMMAS IN `slice(0, 3)` — the first cut of this
  // assertion was structurally incapable of matching the line it bans, and the
  // mutation that re-baked the sentence sailed through it. Check the check.
  assert.doesNotMatch(
    writerRegion,
    /preview:[^\n]*\|\|\s*'Empty/,
    "the empty-list wording belongs at the render — a baked 'Empty list' is frozen English",
  );

  // Every writer that stamps a provenance must stamp a time IN THE SAME RECORD,
  // or the dated branch can never fire for it and "today" comes back by the side
  // door for that one writer.
  //
  // ⚠ THIS IS PER-OBJECT, NOT A COUNT. Comparing totals across the region was the
  // first cut, and it is satisfiable by a stamp on a DIFFERENT writer: dropping
  // one left 6 stamps against 6 provenances and passed. A proxy that another
  // writer can satisfy is not a check on this one.
  const enclosingObject = (text, at) => {
    let depth = 0, start = -1;
    for (let i = at; i >= 0; i--) {
      if (text[i] === '}') depth++;
      else if (text[i] === '{') { if (depth === 0) { start = i; break; } depth--; }
    }
    assert.notEqual(start, -1, 'no enclosing object literal found for a provenance stamp');
    depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    throw new Error('unbalanced object literal around a provenance stamp');
  };

  const provRe = /provenance: '(created|saved|duplicated)'/g;
  let m, seen = 0;
  while ((m = provRe.exec(writerRegion))) {
    seen++;
    const obj = enclosingObject(writerRegion, m.index);
    assert.match(
      obj,
      /createdAt/,
      `a record stamped provenance '${m[1]}' with no createdAt — its eyebrow can only ever say "today"`,
    );
  }
  // Guard-the-guard: a scan that finds nothing must fail, not pass quietly.
  assert.ok(seen >= 4, `expected the writers to stamp a provenance, saw ${seen}`);
});

test('an EDIT never invents provenance — the Codex P2 this merged past', () => {
  // persistGroceryList is the UPDATE path (BSGrocery's onUpdate is its only
  // caller), so it cannot know when the record was created. Stamping
  // `'created'` + Date.now() there re-made the very defect the token shape
  // closed: editing one item on a legacy row — or on a built-in like
  // "Sunday staples" (eyebrow "Custom · Updated last Sun") or the
  // "Meal plan · Cutting" seed — relabelled it "Custom · Created today" and
  // synced that fabricated date across devices.
  const fn = src.slice(src.indexOf('const persistGroceryList = (normalized) =>'));
  const body = fn.slice(0, fn.indexOf('\n  };')).replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(body, /provenance:\s*normalized\.provenance\s*\|\|/, 'an edit must not default a provenance');
  assert.doesNotMatch(body, /createdAt:[^\n]*Date\.now\(\)/, 'an edit must not invent a creation date');
  assert.match(body, /normalized\.provenance \? \{ provenance: normalized\.provenance \}/, 'it must carry an existing provenance through');

  // And the render must still fall back to the stored eyebrow for such a row —
  // that IS the back-compat path, and it is what keeps a built-in honest.
  assert.equal(
    G.bsGroceryListEyebrow({ eyebrow: 'Meal plan · Cutting', kind: 'mealplan' }),
    'Meal plan · Cutting',
  );
  assert.equal(
    G.bsGroceryListEyebrow({ eyebrow: 'Custom · Updated last Sun' }),
    'Custom · Updated last Sun',
  );
});

test('every provenance the writers stamp is one the render knows', () => {
  // A writer stamping a token the table lacks would silently fall through to the
  // legacy branch and print the English eyebrow forever.
  const written = new Set((src.match(/provenance: '([a-z]+)'/g) || []).map(m => m.split("'")[1]));
  assert.ok(written.size > 0, 'no provenance tokens found — the scan is broken, not the code');
  for (const p of written) {
    assert.ok(G.BS_GROCERY_PROV[p], `writers stamp '${p}' but BS_GROCERY_PROV has no entry for it`);
  }
});
