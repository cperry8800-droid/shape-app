// The website's /recipes pages are a CONTENT-PARITY COPY of the mobile Shape
// Kitchen catalog. Nothing enforced that, and the copy silently drifted the
// moment the catalog grew: the 50 public-domain USDA records landed on the
// website without their `tip` (so every one of them lost the Pro Tip section
// the page promises) and without their allergen classifications (so the live
// filters advertised beef stroganoff, cheddar macaroni and turkey tetrazzini as
// gluten-free AND dairy-free — a false allergen claim, not a missing tag).
//
// Both were invisible because the parity check at the time was a one-off script
// that compared titles, step counts and ingredient counts. Those all matched.
// This file compares the FIELDS THE PAGE ACTUALLY RENDERS, so a field added to
// the catalog and forgotten on the website fails here instead of on screen.
//
// The website data is EVALUATED rather than regex-scraped: the three catalog
// blocks are plain data literals, so `new Function` returns exactly what the
// browser will build, and a test can never disagree with what ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHAPE_KITCHEN_RECIPES, recipeNeeds, recipeMatchesDiet, _RECIPE_ALLERGEN_NOTES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

// @babel/parser + @babel/traverse ride the declared @babel/core devDep, as in
// tests/broadsheet-identifiers.test.mjs.
const traverse = _traverse.default || _traverse;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'public/newdesign/recipes.jsx';
const src = readFileSync(join(ROOT, WEB), 'utf8');

// Slice a top-level data literal out of the browser script and evaluate it. A
// top-level array closes on a line that is exactly `];`, so the first one after
// the declaration is that declaration's own close.
const evalArray = (decl) => {
  const i = src.indexOf(decl);
  assert.ok(i >= 0, `${WEB}: no declaration \`${decl}\` — the parity check below would silently scan nothing`);
  const j = src.indexOf('\n];', i);
  assert.ok(j > i, `${WEB}: \`${decl}\` never closes on its own line`);
  return new Function(`return ${src.slice(i + decl.length - 1, j + 2)}`)();
};
const evalSet = (name) => {
  const i = src.indexOf(`const ${name} = new Set([`);
  assert.ok(i >= 0, `${WEB}: no \`${name}\` — recipeNeeds would classify every recipe by default`);
  const open = src.indexOf('new Set([', i);
  const j = src.indexOf('\n]);', open);
  return new Function(`return ${src.slice(open, j + 3)}`)();
};

// The website's display string for a structured catalog ingredient. `{n, m, k}`
// renders as "6 oz chicken thigh (330 kcal)"; without a kcal annotation it is just
// "1 low-sodium beef bouillon cube". A website ingredient is already a string and
// passes through, so the two sides meet in one shape.
const flatIngredient = (ing) => {
  if (typeof ing === 'string') return ing.trim();
  if (!ing || typeof ing !== 'object') return '';
  const qty = [ing.n, ing.m].filter(Boolean).join(' ').trim();
  return ing.k ? `${qty} (${ing.k})` : qty;
};

const WEB_RECIPES = [...evalArray('const RECIPES_BY_WEEKDAY = ['), ...evalArray('const RECIPES_EXTRA = ['), ...evalArray('const RECIPES_USDA = [')];
const WEB_NOT_GF = evalSet('_RECIPE_NOT_GF');
const WEB_HAS_DAIRY = evalSet('_RECIPE_HAS_DAIRY');
const WEB_MED = evalSet('_RECIPE_MED');

test('recipe parity: the website carries every catalog recipe, in order', () => {
  assert.deepEqual(WEB_RECIPES.map((r) => r.title), SHAPE_KITCHEN_RECIPES.map((r) => r.title),
    'website /recipes and the mobile Shape Kitchen disagree on which recipes exist (or their order)');
});

test('recipe parity: rendered fields match the catalog', () => {
  // Every field below is READ BY A LIVE PAGE, so a mismatch is a visible defect:
  //   tip   -> recipeDetailPage.jsx renders the Pro Tip section only if present
  //   note  -> the hero pull quote and the card blurb
  //   by/source -> the byline, via recipeAttribution
  //   steps -> the method list, and the Cook Mode timers parsed out of it
  const byTitle = new Map(SHAPE_KITCHEN_RECIPES.map((r) => [r.title, r]));
  const bad = [];
  for (const w of WEB_RECIPES) {
    const m = byTitle.get(w.title);
    if (!m) continue;                                  // covered by the order test above
    const cmp = (field, a, b) => { if (a !== b) bad.push(`${w.title}: ${field} — website ${JSON.stringify(a)} vs catalog ${JSON.stringify(b)}`); };
    cmp('tip', w.tip, m.tip);
    // The parity copy renamed this field: the website's `note` IS the catalog's
    // `blurb` (the card blurb and the detail-page pull quote read the same words).
    cmp('note/blurb', w.note, m.blurb);
    cmp('by', w.by ?? null, m.by ?? null);
    // Rendered right beside the name by both surfaces, so drift here mislabels a
    // nutritionist as a dietician while the name itself still matches.
    cmp('byRole', w.byRole ?? null, m.byRole ?? null);
    cmp('source', w.source ?? null, m.source ?? null);
    cmp('sourceUrl', w.sourceUrl ?? null, m.sourceUrl ?? null);
    cmp('kcal', w.kcal, m.kcal);
    cmp('servings', w.servings, m.servings);
    // Rendered on the card and/or the detail page: the cook time, the diet chip
    // (which also picks the accent colour), the hero gradient, the macro figures
    // and the tag pills. Every one is visible drift if it disagrees.
    cmp('time', w.time, m.time);
    cmp('diet', w.diet, m.diet);
    cmp('hero', w.hero, m.hero);
    for (const k of ['p', 'c', 'f']) cmp(`macros.${k}`, (w.macros || {})[k], (m.macros || {})[k]);
    cmp('tags', JSON.stringify(w.tags || []), JSON.stringify(m.tags || []));
    // ⚠ `allergenNotes` is deliberately NOT compared here, and the reason is a
    // property of this harness rather than of the data: WEB_RECIPES is built by
    // SLICING the literals out of the source and evaluating them in isolation, so
    // the website's attach loop never runs in this process and every website recipe
    // would read `undefined` no matter what the file says. The notes are covered by
    // the table-level equality test below plus its title-existence check, which are
    // the two things this harness can actually observe.
    // Ingredient shapes differ by design — the app keeps structured quantities,
    // the website flattens them for display — but the flattening is deterministic,
    // so the VALUES are comparable and a count alone is not: two lists of eight can
    // disagree on every line. Compare the rendered strings.
    const wi = (w.ingredients || []).map(flatIngredient);
    const mi = (m.ingredients || []).map(flatIngredient);
    if (wi.length !== mi.length) bad.push(`${w.title}: ${wi.length} ingredients on the website vs ${mi.length} in the catalog`);
    else wi.forEach((line, i) => { if (line !== mi[i]) bad.push(`${w.title}: ingredient ${i + 1} — website ${JSON.stringify(line)} vs catalog ${JSON.stringify(mi[i])}`); });
    const ws = w.steps || [], ms = m.steps || [];
    if (ws.length !== ms.length) bad.push(`${w.title}: ${ws.length} steps on the website vs ${ms.length} in the catalog`);
    else ws.forEach((s, i) => { if (s !== ms[i]) bad.push(`${w.title}: step ${i + 1} text differs`); });
  }
  assert.deepEqual(bad, [], 'the website parity copy has drifted from the catalog');
});

// The note TABLE itself, compared before the attach loops run on either side. The
// per-recipe check above catches a broken attach; this catches a table that drifted
// while both attach loops still work.
test('recipe parity: the allergen note tables are identical', () => {
  const WEB_NOTES = evalArray('const _RECIPE_ALLERGEN_NOTES = [');
  // An extractor that finds nothing must FAIL, never pass vacuously — the slicer
  // evaluates the literal in isolation, so a stray identifier inside the table would
  // throw here rather than silently comparing two empty lists.
  assert.ok(WEB_NOTES.length >= 14, `only ${WEB_NOTES.length} website allergen notes extracted — the slicer is reading nothing`);
  const key = (e) => `${e[0]}|${e[1]}`;
  const srt = (a) => a.slice().sort((x, y) => (key(x) < key(y) ? -1 : 1));
  assert.deepEqual(srt(WEB_NOTES), srt(_RECIPE_ALLERGEN_NOTES),
    'the website allergen note table has drifted from the catalog module');
  // The website attach loop fails SILENTLY on a title typo (`if (r)`), exactly like
  // the catalog module's. The loop itself is out of this harness's reach (see the
  // note in the field test above), but its INPUT is not: a note keyed to a title the
  // website catalog does not contain can never attach, and would leave that recipe
  // making a bare claim on the site while mobile carries the caveat.
  const webTitles = new Set(WEB_RECIPES.map((r) => r.title));
  for (const [t] of WEB_NOTES) {
    assert.ok(webTitles.has(t), `website allergen note references a title not in the website catalog: "${t}"`);
  }
});

test('recipe parity: allergen and diet classification is identical', () => {
  // recipeNeeds treats ABSENCE from these sets as a positive claim ("gluten-free",
  // "dairy-free"), so a title missing from the website copy is not a lost tag —
  // it is the site telling someone with coeliac disease that a wheat-noodle
  // casserole is safe. Asserted in BOTH directions for exactly that reason.
  const bad = [];
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const needs = recipeNeeds(r);
    const web = { gf: !WEB_NOT_GF.has(r.title), dairy: !WEB_HAS_DAIRY.has(r.title) };
    if (web.gf !== needs.includes('Gluten-free')) bad.push(`${r.title}: website says gluten-free=${web.gf}, catalog says ${!web.gf}`);
    if (web.dairy !== needs.includes('Dairy-free')) bad.push(`${r.title}: website says dairy-free=${web.dairy}, catalog says ${!web.dairy}`);
    // Mediterranean is a curated set on both sides, not a derived field, so it
    // drifts the same way — asked through the catalog's own filter function.
    if (WEB_MED.has(r.title) !== recipeMatchesDiet(r, 'Mediterranean')) bad.push(`${r.title}: Mediterranean membership differs (website ${WEB_MED.has(r.title)})`);
  }
  assert.deepEqual(bad, [], 'a recipe is classified differently on the website than in the catalog');
});

// ---------------------------------------------------------------------------
// A byline is the one recipe field that is NULL for a whole class of records, and
// reading it directly is what took /recipes down.
//
// ⚠ The PRIMARY gate for that is not here — it is tests/recipe-render.test.mjs
// (website) and tests/kitchen-card-render.test.mjs (mobile), which compile and
// RENDER the real components with a sourced recipe. A text scan cannot see the
// defect written a different way: the first version of this guard keyed on
// identifiers literally named `r` or `recipe`, and a renderer spelled
// `item.by.toUpperCase()` recreated the crash while every assertion stayed green.
//
// What remains here is cheap defence-in-depth for a branch a render pass may not
// reach, and it reads the AST rather than the text — `item.by`, `recipe['by']`, a
// destructured `by` and a chain split across lines are one node to a parser and
// four different strings to a regex.
//
// Scope is deliberate. These are the files that exist to render recipes, matched
// by path from the tracked tree. The mobile client module is NOT scanned: it mixes
// recipes with domains that carry their own legitimate `by` (a goal's target date,
// a playlist's author — seven correct uses, measured), so a ban there would fire
// on correct code. Its coverage is behavioural, in the render test above.
const helperOf = (path) => {
  for (let p = path; p; p = p.parentPath) {
    const id = p.node && (p.node.id || (p.node.key && p.node.key.type === 'Identifier' && p.node.key));
    if (id && /^(?:bs)?[Rr]ecipeAttribution$/.test(id.name)) return id.name;
    if (p.node && p.node.type === 'VariableDeclarator' && p.node.id && /Attribution$/.test(p.node.id.name)) return p.node.id.name;
  }
  return null;
};
test('recipe byline: never read outside the attribution helper (AST)', () => {
  const files = execFileSync('git', ['ls-files', 'public/newdesign'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => /\/recipe[^/]*\.jsx$/.test(f));
  assert.ok(files.length >= 3, `only ${files.length} recipe page(s) matched — the scan has gone hollow`);
  const bad = [];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const ast = parse(src, { sourceType: 'unambiguous', plugins: ['jsx'] });
    traverse(ast, {
      MemberExpression(path) {
        const n = path.node;
        const key = n.computed ? (n.property && n.property.value) : (n.property && n.property.name);
        if (key !== 'by' || helperOf(path)) return;
        bad.push(`${f}:${n.loc.start.line} reads a byline directly — route it through recipeAttribution`);
      },
      ObjectPattern(path) {
        for (const prop of path.node.properties) {
          if (prop.key && prop.key.name === 'by' && !helperOf(path)) {
            bad.push(`${f}:${prop.loc.start.line} destructures a byline — route it through recipeAttribution`);
          }
        }
      },
    });
  }
  assert.deepEqual(bad, [], 'recipeAttribution returns null rather than inventing a name — read the byline through it');
});
