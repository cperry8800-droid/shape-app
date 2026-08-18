// The website's recipe pages, COMPILED AND RENDERED — not scanned.
//
// A sourced recipe carries `by: null`, and `recipe.by.toUpperCase()` throws. That
// crash shipped once and a source-text guard did not catch the follow-up: a
// renderer written as `item.by.toUpperCase()` recreates it exactly, and no regex
// keyed on the words `recipe` or `r` can see it. Naming, destructuring, bracket
// notation and a property chain split across lines are all invisible to a
// text scan and all identical to the browser.
//
// So this file does not look at the source at all. It compiles the real pages
// with the SAME transform the deploy uses (`@babel/preset-react`, classic
// runtime — see scripts/build-newdesign.mjs) and renders them. A renderer that
// dies on a sourced recipe fails here however it is spelled.
//
// The pages are classic browser scripts sharing one global scope (pageShell.jsx,
// then recipes.jsx, then the page), so the harness evaluates them the same way:
// one scope, in load order, with the pageShell tokens injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from '@babel/core';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const compile = (src, filename) =>
  transformSync(src, { filename, presets: [['@babel/preset-react', { runtime: 'classic' }]], configFile: false, babelrc: false }).code;

// The pageShell tokens the pages close over, plus stubs for the chrome they
// render. Values only have to be present and of the right shape — this asserts
// the pages RUN, not how they look.
// Read from pageShell.jsx itself rather than re-typed, so a renamed or removed
// token fails the harness instead of being quietly stubbed with a stale literal.
const SHELL_TOKENS = ['PAPER', 'INK', 'INK_DEEP', 'TEAL', 'TEAL_BRIGHT', 'serif', 'sans', 'mono'];
const shellSource = read('public/newdesign/pageShell.jsx');
const shellValues = Object.fromEntries(SHELL_TOKENS.map((name) => {
  const m = new RegExp('^\\s*(?:const|let|var)\\s+' + name + '\\s*=\\s*(.+?);\\s*(?://.*)?$', 'm').exec(shellSource);
  assert.ok(m, `pageShell.jsx no longer declares ${name} — the render harness would stub it with a guess`);
  return [name, JSON.parse(m[1].replace(/^'(.*)'$/, (_, v) => JSON.stringify(v)))];
}));

const SHELL = {
  ...shellValues,
  PAPER_2: '#221d18', RULE: 'rgba(242,237,228,0.12)',
  Header: () => null, Footer: () => null, SiteSearch: () => null, ChatWidget: () => null,
  mountSiteFooter: () => {}, shapeDb: null,
  // Each page ends by mounting itself into #root. The harness renders the
  // components directly, so the mount is a no-op here — but it must EXIST, or
  // the file throws before its declarations are returned.
  ReactDOM: { createRoot: () => ({ render() {}, unmount() {} }), render() {} },
};

// Compiled ONCE, at module scope. The detail-page test below reloads the pages for
// EVERY catalog recipe (the page reads its slug from the URL), and re-running babel
// 85 times turns a ~2s gate into a ~20s one — the kind of cost that gets a gate
// skipped. `new Function` parses lazily, so re-instantiating the scope is cheap.
const SOURCES = ['public/newdesign/recipes.jsx', 'public/newdesign/recipesPage.jsx', 'public/newdesign/recipeDetailPage.jsx'];
const PAGE_BODY = SOURCES.map((f) => compile(read(f), f)).join('\n;\n');
const PAGE_NAMES = ['React', 'window', 'document', 'localStorage', 'navigator', 'location', ...Object.keys(SHELL)];
// Returned by name so a renamed component fails loudly here rather than silently
// skipping the assertions below.
const PAGE_FACTORY = new Function(...PAGE_NAMES,
  `${PAGE_BODY}\n;return { RecipeCard, RecipesPage, RecipeDetailPage, SHAPE_RECIPES, recipeSlug, recipeAttribution, recipeAllergenNoteText };`);

function loadRecipePages(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true });
  return PAGE_FACTORY(React, dom.window, dom.window.document, dom.window.localStorage, dom.window.navigator, dom.window.location, ...Object.values(SHELL));
}

// renderToStaticMarkup escapes entities — an apostrophe becomes &#x27; — so a raw
// `html.includes(copy)` fails on text nobody changed (every oats note names Bob's
// Red Mill). Assert against decoded text instead of hand-escaping the expectation.
const htmlText = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const api = loadRecipePages('https://www.theshapecommunity.com/recipes');

test('recipe pages: every catalog recipe renders as a card', () => {
  // The whole catalog, not a sample: a record whose shape breaks a renderer is
  // exactly the defect this exists to catch, and it only shows on THAT record.
  assert.ok(api.SHAPE_RECIPES.length >= 85, `only ${api.SHAPE_RECIPES.length} recipes reached the page — the harness is not loading the catalog`);
  const broken = [];
  for (const recipe of api.SHAPE_RECIPES) {
    try {
      renderToStaticMarkup(React.createElement(api.RecipeCard, { recipe, saved: false, onToggleSave() {} }));
    } catch (err) {
      broken.push(`${recipe.title}: ${err.message}`);
    }
  }
  assert.deepEqual(broken, [], 'a recipe card threw while rendering');
});

test('recipe pages: a sourced recipe credits its source and never renders "null"', () => {
  const sourced = api.SHAPE_RECIPES.find((r) => !r.by && r.source);
  assert.ok(sourced, 'no sourced recipe in the catalog — this assertion would prove nothing');
  const html = renderToStaticMarkup(React.createElement(api.RecipeCard, { recipe: sourced, saved: false, onToggleSave() {} }));
  assert.ok(html.includes(sourced.source.toUpperCase()), 'the card does not credit the source');
  assert.ok(!/\bnull\b|\bundefined\b/i.test(html), 'the card rendered a null/undefined byline');
});

test('recipe pages: an authored recipe still credits its author', () => {
  const authored = api.SHAPE_RECIPES.find((r) => r.by);
  const html = renderToStaticMarkup(React.createElement(api.RecipeCard, { recipe: authored, saved: false, onToggleSave() {} }));
  assert.ok(html.includes(authored.by.toUpperCase()), 'the card does not credit the author');
  assert.ok(html.includes(authored.byRole.toUpperCase()), 'the card does not render the author role');
});

test('recipe pages: the detail page renders for EVERY catalog recipe', () => {
  // Widened from a sourced + an authored sample to the whole catalog, because the
  // per-record fields the page reads are not uniform: 71 of the 85 recipes carry NO
  // `allergenNotes` — the field is undefined, not an empty array — so a lookup that
  // assumes presence throws on 71 records and passes on the 14 a two-recipe sample
  // would happen to pick. `.map` on undefined parse-checks clean, typechecks clean,
  // and only shows on THAT record, at render time.
  assert.ok(api.SHAPE_RECIPES.length >= 85, `only ${api.SHAPE_RECIPES.length} recipes reached the page — the harness is not loading the catalog`);
  const broken = [];
  for (const recipe of api.SHAPE_RECIPES) {
    const scoped = loadRecipePages(`https://www.theshapecommunity.com/recipes/${api.recipeSlug(recipe)}`);
    let html;
    try {
      html = renderToStaticMarkup(React.createElement(scoped.RecipeDetailPage));
    } catch (err) {
      broken.push(`${recipe.title}: ${err.message}`);
      continue;
    }
    // A slug that does not round-trip renders the not-found page — which would pass
    // a crash-only check while proving nothing about this record.
    if (html.includes('Recipe not found')) { broken.push(`${recipe.title}: rendered the not-found page`); continue; }
    const credit = recipe.by || recipe.source;
    const text = htmlText(html);
    if (!credit) broken.push(`${recipe.title}: carries neither an author nor a source`);
    else if (!text.includes(credit) && !text.includes(credit.toUpperCase())) broken.push(`${recipe.title}: detail page does not credit ${credit}`);
    if (/>\s*null\s*</.test(html)) broken.push(`${recipe.title}: detail page rendered a bare null`);
  }
  assert.deepEqual(broken, [], 'a recipe detail page failed to render');
});

test('recipe pages: a note-bearing recipe renders its allergen note on the detail page', () => {
  const noted = api.SHAPE_RECIPES.filter((r) => (r.allergenNotes || []).length);
  assert.ok(noted.length >= 14, `only ${noted.length} recipes carry an allergen note — the notes table did not attach`);
  // A recipe that KEEPS a "free from" claim over an ambiguous ingredient is only
  // honest if the note reaches the page. Assert the FULL composed text — asserting
  // the certification alone passes on a renderer that drops the brand examples.
  for (const recipe of [noted.find((r) => r.allergenNotes[0].brands.length), noted.find((r) => !r.allergenNotes[0].brands.length)]) {
    assert.ok(recipe, 'the catalog no longer carries both a branded and a brandless note');
    const scoped = loadRecipePages(`https://www.theshapecommunity.com/recipes/${api.recipeSlug(recipe)}`);
    const text = htmlText(renderToStaticMarkup(React.createElement(scoped.RecipeDetailPage)));
    for (const n of recipe.allergenNotes) {
      assert.ok(text.includes(api.recipeAllergenNoteText(n)),
        `${recipe.title}: the detail page does not render the composed ${n.allergen} note`);
      assert.ok(text.includes(`ALLERGEN · ${n.allergen.toUpperCase()}`),
        `${recipe.title}: the detail page does not label the note with its allergen`);
    }
  }
});

test('recipe pages: the card carries the one-line allergen note, and only where there is one', () => {
  // Pick a BRANDED note deliberately. `find`ing the first note-bearing recipe
  // returns a brandless broth note, and a leak check guarded on `brands.length`
  // then skips itself — a card rendering the full composed text survived exactly
  // that. The assertion has to be given something it can fail on.
  const branded = api.SHAPE_RECIPES.find((r) => (r.allergenNotes || []).some((n) => n.brands.length));
  const plain = api.SHAPE_RECIPES.find((r) => !(r.allergenNotes || []).length);
  assert.ok(branded && plain, 'need a branded-note recipe and a note-less one for this to prove anything');
  const card = (recipe) => htmlText(renderToStaticMarkup(React.createElement(api.RecipeCard, { recipe, saved: false, onToggleSave() {} })));

  // The All view is what the FREE FROM filters return, so a restored claim must
  // carry its caveat here too — the certification clause, brands are detail-only.
  const n = branded.allergenNotes.find((x) => x.brands.length);
  const html = card(branded);
  assert.ok(html.includes(n.certification), 'the card does not render the certification clause');
  assert.ok(!html.includes(n.brands[0][0]), `the card leaked a brand example (${n.brands[0][0]}) — brands are detail-page-only`);

  // A note-less recipe must not sprout a caveat. Checked against EVERY certification
  // in the table, not one hand-typed phrase, so a reworded note cannot go stale.
  const plainHtml = card(plain);
  const certs = new Set(api.SHAPE_RECIPES.flatMap((r) => (r.allergenNotes || []).map((x) => x.certification)));
  for (const cert of certs) assert.ok(!plainHtml.includes(cert), `a note-less recipe rendered allergen copy: ${cert}`);
});
