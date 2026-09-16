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
  `${PAGE_BODY}\n;return { RecipeRow, RecipesPage, RecipeDetailPage, SHAPE_RECIPES, recipeSlug, recipeAttribution, recipeAllergenNoteText, recipeMinutes, KM_COURSES, KM_PAGE, kmPaged, kmCourseIndex, kmSortByTime, kmMatches, kmBoardPicks, kmIsAuthored, recipeNeeds, recipeMatchesDiet };`);

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

test('recipe pages: every catalog recipe renders as a row', () => {
  // The whole catalog, not a sample: a record whose shape breaks a renderer is
  // exactly the defect this exists to catch, and it only shows on THAT record.
  assert.ok(api.SHAPE_RECIPES.length >= 85, `only ${api.SHAPE_RECIPES.length} recipes reached the page — the harness is not loading the catalog`);
  const broken = [];
  for (const recipe of api.SHAPE_RECIPES) {
    try {
      renderToStaticMarkup(React.createElement(api.RecipeRow, { recipe, saved: false, onToggleSave() {} }));
    } catch (err) {
      broken.push(`${recipe.title}: ${err.message}`);
    }
  }
  assert.deepEqual(broken, [], 'a recipe row threw while rendering');
});

test('recipe pages: a sourced recipe credits its source and never renders "null"', () => {
  const sourced = api.SHAPE_RECIPES.find((r) => !r.by && r.source);
  assert.ok(sourced, 'no sourced recipe in the catalog — this assertion would prove nothing');
  const html = renderToStaticMarkup(React.createElement(api.RecipeRow, { recipe: sourced, saved: false, onToggleSave() {} }));
  // The Menu credits in the source's own case ("From USDA MyPlate Kitchen"); the
  // claim under test is that the SOURCE is named, not how it is cased.
  assert.ok(htmlText(html).includes(sourced.source), 'the row does not credit the source');
  assert.ok(!/\bnull\b|\bundefined\b/i.test(html), 'the row rendered a null/undefined byline');
});

test('recipe pages: an authored recipe still credits its author', () => {
  const authored = api.SHAPE_RECIPES.find((r) => r.by);
  const html = htmlText(renderToStaticMarkup(React.createElement(api.RecipeRow, { recipe: authored, saved: false, onToggleSave() {} })));
  assert.ok(html.includes(authored.by), 'the row does not credit the author');
  assert.ok(html.includes(authored.byRole), 'the row does not render the author role');
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

test('recipe pages: the row carries the one-line allergen note, and only where there is one', () => {
  // Pick a BRANDED note deliberately. `find`ing the first note-bearing recipe
  // returns a brandless broth note, and a leak check guarded on `brands.length`
  // then skips itself — a card rendering the full composed text survived exactly
  // that. The assertion has to be given something it can fail on.
  const branded = api.SHAPE_RECIPES.find((r) => (r.allergenNotes || []).some((n) => n.brands.length));
  const plain = api.SHAPE_RECIPES.find((r) => !(r.allergenNotes || []).length);
  assert.ok(branded && plain, 'need a branded-note recipe and a note-less one for this to prove anything');
  const card = (recipe) => htmlText(renderToStaticMarkup(React.createElement(api.RecipeRow, { recipe, saved: false, onToggleSave() {} })));

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

// ── The Menu (2026-09-15): the courses, the board, the filters ───────────────
// The page's whole structure is "grouped by cooking time", so the properties
// below are what make it a menu rather than a list with headings: every recipe
// lands in exactly one course, the course counts add up to the catalog, the
// board never repeats a dish, and the filter rules the toggles carry are the
// catalog's own. All driven through the SHIPPED functions the page renders with.

test('menu: every catalog recipe has a readable time and lands in exactly one course', () => {
  const unreadable = api.SHAPE_RECIPES.filter((r) => api.recipeMinutes(r) == null).map((r) => `${r.title}: ${JSON.stringify(r.time)}`);
  assert.deepEqual(unreadable, [], 'a recipe whose time cannot be read would fall off a page grouped by time');
  const bands = api.SHAPE_RECIPES.map((r) => api.kmCourseIndex(r));
  assert.ok(bands.every((i) => i >= 0 && i < api.KM_COURSES.length), 'a recipe matched no course band');
  // The bands partition the minutes: each recipe matches ONE course's test.
  for (const r of api.SHAPE_RECIPES) {
    const m = api.recipeMinutes(r);
    const hits = api.KM_COURSES.filter((c) => c.test(m)).length;
    assert.equal(hits, 1, `${r.title} (${m} min) matches ${hits} courses`);
  }
  // Every course is non-empty on the shipped catalog — an empty course head
  // would be a heading over nothing.
  for (let i = 0; i < api.KM_COURSES.length; i += 1) {
    assert.ok(bands.filter((b) => b === i).length > 0, `course ${api.KM_COURSES[i].title} is empty on the shipped catalog`);
  }
  // The edges: 15 min sits in course one, 30 in course two, 60 in course three.
  assert.equal(api.kmCourseIndex({ time: '15 min' }), 0);
  assert.equal(api.kmCourseIndex({ time: '30 min' }), 1);
  assert.equal(api.kmCourseIndex({ time: '1 hr' }), 2);
  assert.equal(api.kmCourseIndex({ time: '1 hr 5 min' }), 3);
  assert.equal(api.recipeMinutes({ time: '2 hr 30 min' }), 150);
  assert.equal(api.kmCourseIndex({ time: 'overnight' }), -1);
  assert.equal(api.kmCourseIndex({}), -1);
});

test('menu: the rendered page carries four course heads whose counts add up to the catalog', () => {
  const page = loadRecipePages('https://www.theshapecommunity.com/recipes');
  const text = htmlText(renderToStaticMarkup(React.createElement(page.RecipesPage)));
  let total = 0;
  for (let i = 0; i < api.KM_COURSES.length; i += 1) {
    const c = api.KM_COURSES[i];
    const n = api.SHAPE_RECIPES.filter((r) => api.kmCourseIndex(r) === i).length;
    // The course head: "01  Under 15 minutes  14 recipes". Counted rather than
    // matched loosely, so a head whose count disagrees with its rows fails.
    const head = new RegExp(`${String(i + 1).padStart(2, '0')}\\s+${c.title.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+${n} recipes?`);
    assert.match(text, head, `course head for ${c.title} does not read ${n} recipes`);
    total += n;
  }
  assert.equal(total, api.SHAPE_RECIPES.length, 'the four courses do not add up to the catalog');
  // The jump row names every course with the same count. A chip carries the
  // long title (desktop), the short one (phone; CSS shows one of the two) and
  // the count, in that order.
  const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < api.KM_COURSES.length; i += 1) {
    const c = api.KM_COURSES[i];
    const n = api.SHAPE_RECIPES.filter((r) => api.kmCourseIndex(r) === i).length;
    assert.match(text, new RegExp(`${esc(c.title)}\\s+${esc(c.short)}\\s+${n}\\b`),
      `the jump row does not carry ${c.title} with its count`);
  }
  // Paging: a course long enough to page shows a "Show all N" door, a shorter one
  // shows every row. The rule is the page's own (kmPaged), and the catalog must
  // exercise BOTH arms or the assertion is one-sided.
  const arms = new Set();
  for (let i = 0; i < api.KM_COURSES.length; i += 1) {
    const n = api.SHAPE_RECIPES.filter((r) => api.kmCourseIndex(r) === i).length;
    const door = text.includes(`Show all ${n} →`);
    assert.equal(door, api.kmPaged(n), `course ${api.KM_COURSES[i].title} (${n} rows) ${door ? 'shows' : 'lacks'} a Show all door`);
    arms.add(door);
  }
  assert.equal(arms.size, 2, 'the catalog no longer has both a paged and an unpaged course — this assertion has gone one-sided');
  assert.equal(api.kmPaged(api.KM_PAGE + 1), false, 'a door that hides one row is a tap that buys nothing');
  assert.equal(api.kmPaged(api.KM_PAGE + 5), true);
  // The public-domain credit line is on the page.
  assert.ok(text.includes('USDA MyPlate Kitchen'), 'the credit footer is missing');
});

test('menu: every row credits its recipe, and the untimed heading never renders on the shipped catalog', () => {
  const page = loadRecipePages('https://www.theshapecommunity.com/recipes');
  const text = htmlText(renderToStaticMarkup(React.createElement(page.RecipesPage)));
  assert.ok(!text.includes('Time not stated'), 'the untimed fallback course rendered on a catalog where every time is readable');
  // The first page of each course is on screen; every one of those rows carries its credit.
  for (let i = 0; i < api.KM_COURSES.length; i += 1) {
    const all = api.kmSortByTime(api.SHAPE_RECIPES.filter((r) => api.kmCourseIndex(r) === i));
    const rows = api.kmPaged(all.length) ? all.slice(0, api.KM_PAGE) : all;
    for (const r of rows) {
      const credit = r.by || r.source;
      assert.ok(credit, `${r.title} carries neither an author nor a source`);
      assert.ok(text.includes(r.title), `${r.title} is not on the first page of its course`);
      assert.ok(text.includes(credit), `${r.title} is on the page without its credit (${credit})`);
    }
  }
});

test('menu: the board is three pro-authored dishes from three different courses, and rotates', () => {
  const courses = api.KM_COURSES.map((c, i) => ({ ...c, rows: api.kmSortByTime(api.SHAPE_RECIPES.filter((r) => api.kmCourseIndex(r) === i)) }));
  for (const seed of [0, 1, 7, 42, 364]) {
    const picks = api.kmBoardPicks(courses, seed);
    assert.equal(picks.length, 3, `seed ${seed}: the board has ${picks.length} dishes`);
    assert.ok(picks.every(api.kmIsAuthored), `seed ${seed}: a sourced recipe reached the board`);
    assert.equal(new Set(picks.map((r) => r.title)).size, 3, `seed ${seed}: the board repeats a dish`);
    picks.forEach((r, i) => assert.equal(api.kmCourseIndex(r), i, `seed ${seed}: pick ${i} is not from course ${i}`));
  }
  const a = api.kmBoardPicks(courses, 0).map((r) => r.title).join('|');
  const b = api.kmBoardPicks(courses, 1).map((r) => r.title).join('|');
  assert.notEqual(a, b, 'the board does not change from one day to the next');
  // Rendered: the three picks for today's seed are on the page under the board.
  const page = loadRecipePages('https://www.theshapecommunity.com/recipes');
  const text = htmlText(renderToStaticMarkup(React.createElement(page.RecipesPage)));
  assert.ok(text.includes("Today's board"), 'the unfiltered menu does not show the board');
});

test('menu: the toggles carry the catalog\'s own filter rules', () => {
  const all = api.SHAPE_RECIPES;
  const saved = new Set();
  const base = { q: '', diet: 'All', needs: [], pros: false, saved: false, savedSlugs: saved };
  assert.equal(all.filter((r) => api.kmMatches(r, base)).length, all.length, 'the unfiltered menu drops recipes');
  // Diet + Protein: ONE single-select axis, through recipeMatchesDiet.
  for (const d of ['Vegan', 'Vegetarian', 'Pescatarian', 'Mediterranean', 'Seafood', 'Poultry', 'Meat']) {
    const got = all.filter((r) => api.kmMatches(r, { ...base, diet: d })).map((r) => r.title);
    const want = all.filter((r) => api.recipeMatchesDiet(r, d)).map((r) => r.title);
    assert.deepEqual(got, want, `the ${d} toggle disagrees with recipeMatchesDiet`);
    assert.ok(want.length > 0, `${d} matches nothing — the toggle proves nothing`);
  }
  // Free From + Goals: every chosen need must hold (AND), through recipeNeeds.
  const gfdf = all.filter((r) => api.kmMatches(r, { ...base, needs: ['Gluten-free', 'Dairy-free'] })).map((r) => r.title);
  const want = all.filter((r) => { const n = api.recipeNeeds(r); return n.includes('Gluten-free') && n.includes('Dairy-free'); }).map((r) => r.title);
  assert.deepEqual(gfdf, want, 'two needs are not ANDed');
  assert.ok(gfdf.length < all.length, 'the needs filter removed nothing');
  // Shape pros = authored only; Saved = in the library (empty library → nothing).
  const pros = all.filter((r) => api.kmMatches(r, { ...base, pros: true }));
  assert.ok(pros.length > 0 && pros.every(api.kmIsAuthored), 'Shape pros let a sourced recipe through');
  assert.equal(all.filter((r) => api.kmMatches(r, { ...base, saved: true })).length, 0, 'an empty library matched recipes');
  saved.add(api.recipeSlug(all[0]));
  assert.deepEqual(all.filter((r) => api.kmMatches(r, { ...base, saved: true })).map((r) => r.title), [all[0].title], 'the saved toggle did not follow the library');
  // Search: every word must land, over title / tags / credit / ingredients.
  const sourced = all.find((r) => !r.by && r.source);
  assert.ok(all.filter((r) => api.kmMatches(r, { ...base, q: 'usda' })).includes(sourced), 'a search for the source misses a sourced recipe');
  const byIng = all.find((r) => (r.ingredients || []).some((s) => /paprika/i.test(s)));
  assert.ok(byIng, 'no recipe names paprika — pick another ingredient for this assertion');
  assert.ok(all.filter((r) => api.kmMatches(r, { ...base, q: 'paprika' })).includes(byIng), 'a search over ingredients misses a hit');
  assert.equal(all.filter((r) => api.kmMatches(r, { ...base, q: 'zzzz qqqq' })).length, 0, 'a nonsense search matched something');
});
