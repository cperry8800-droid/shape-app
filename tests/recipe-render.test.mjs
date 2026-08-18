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

function loadRecipePages(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true });
  const sources = ['public/newdesign/recipes.jsx', 'public/newdesign/recipesPage.jsx', 'public/newdesign/recipeDetailPage.jsx'];
  const body = sources.map((f) => compile(read(f), f)).join('\n;\n');
  const names = ['React', 'window', 'document', 'localStorage', 'navigator', 'location', ...Object.keys(SHELL)];
  const values = [React, dom.window, dom.window.document, dom.window.localStorage, dom.window.navigator, dom.window.location, ...Object.values(SHELL)];
  // Returned by name so a renamed component fails loudly here rather than silently
  // skipping the assertions below.
  const fn = new Function(...names, `${body}\n;return { RecipeCard, RecipesPage, RecipeDetailPage, SHAPE_RECIPES, recipeSlug, recipeAttribution };`);
  return fn(...values);
}

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

test('recipe pages: the detail page renders for a sourced AND an authored recipe', () => {
  const pick = (fn) => api.SHAPE_RECIPES.find(fn);
  for (const [label, recipe] of [['sourced', pick((r) => !r.by && r.source)], ['authored', pick((r) => r.by)]]) {
    const scoped = loadRecipePages(`https://www.theshapecommunity.com/recipes/${api.recipeSlug(recipe)}`);
    let html;
    assert.doesNotThrow(() => { html = renderToStaticMarkup(React.createElement(scoped.RecipeDetailPage)); },
      `the ${label} recipe detail page threw`);
    const credit = recipe.by || recipe.source;
    assert.ok(html.includes(credit.toUpperCase()) || html.includes(credit),
      `the ${label} detail page does not credit ${credit}`);
    assert.ok(!/>\s*null\s*</.test(html), `the ${label} detail page rendered a bare null`);
  }
});
