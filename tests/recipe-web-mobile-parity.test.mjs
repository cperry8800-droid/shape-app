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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHAPE_KITCHEN_RECIPES, recipeNeeds, recipeMatchesDiet } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

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
    cmp('source', w.source ?? null, m.source ?? null);
    cmp('sourceUrl', w.sourceUrl ?? null, m.sourceUrl ?? null);
    cmp('kcal', w.kcal, m.kcal);
    cmp('servings', w.servings, m.servings);
    // Ingredient SHAPES differ by design (the website flattens to strings, the
    // app keeps structured quantities), so only the count is comparable.
    cmp('ingredient count', (w.ingredients || []).length, (m.ingredients || []).length);
    const ws = w.steps || [], ms = m.steps || [];
    if (ws.length !== ms.length) bad.push(`${w.title}: ${ws.length} steps on the website vs ${ms.length} in the catalog`);
    else ws.forEach((s, i) => { if (s !== ms[i]) bad.push(`${w.title}: step ${i + 1} text differs`); });
  }
  assert.deepEqual(bad, [], 'the website parity copy has drifted from the catalog');
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
// A byline is the one recipe field that is NULL for a whole class of records.
// Reading it directly is what took /recipes down: `recipe.by.toUpperCase()`
// throws a TypeError on the first public-domain card and blanks the route.
// Three shapes are forbidden anywhere a recipe is rendered — dereference,
// raw interpolation, and a `||` default (which invents a byline instead of
// omitting one). The attribution helpers read `r.by` through a null-safe
// accessor, so they are not matched and need no exemption.
//
// The file list is DERIVED from the tracked tree, never hand-listed: the crash
// lived in two route files a hand-written list would not have named.
const FORBIDDEN = [
  [/\b(?:r|recipe)\.by\s*\./, 'dereferences a byline that is null on every sourced recipe'],
  [/\{\s*(?:r|recipe)\.by\s*\}/, 'renders a byline raw instead of through the attribution helper'],
  [/\b(?:r|recipe)\.by\s*\|\|/, 'defaults a missing byline to an invented one'],
];
test('recipe byline: never dereferenced, rendered raw, or defaulted', () => {
  const tracked = execFileSync('git', ['ls-files', 'public/newdesign', 'mobile-app/src/broadsheet'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => /\.(?:js|jsx|mjs)$/.test(f));
  assert.ok(tracked.length > 10, `only ${tracked.length} tracked files scanned — the guard has gone hollow`);
  const bad = [];
  for (const f of tracked) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // A comment may QUOTE the forbidden shape — this rule is documented in two
      // places using the exact text it bans. Skip whole-line comments only, so a
      // real violation carrying a trailing note is still caught.
      const src = line.trim();
      if (src.startsWith('//') || src.startsWith('*')) return;
      for (const [re, why] of FORBIDDEN) if (re.test(line)) bad.push(`${f}:${i + 1} ${why} :: ${src.slice(0, 90)}`);
    });
  }
  assert.deepEqual(bad, [], 'route it through recipeAttribution / bsRecipeAttribution, which returns null rather than inventing a name');
});
