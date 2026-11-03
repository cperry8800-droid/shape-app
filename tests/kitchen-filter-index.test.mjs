// The Kitchen's filters as an index (owner, 2026-11-03: "this looks like shit on website, lets
// improve this filter layout", then "option c"). Before, every filter was one unlabelled run of
// pills that wrapped mid-group. Now they are a sticky column down the left of the results: Show
// only, then Diet, Protein, Free from and Macros, each labelled, one option per line. Diet and
// Protein, one choice between them, get a radio dot; the rest stack, with a check box. At 960px and
// below the same column is a bottom drawer opened from "Filters", and what is on shows as chips
// that remove themselves. These pin that shape. kitchen-page-phone.test.mjs pins the phone rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/newdesign/recipesPage.jsx', import.meta.url), 'utf8');
const tablet = src.slice(src.indexOf('@media (max-width: 960px)'), src.indexOf('@media (max-width: 760px)'));

test('four labelled groups: Diet and Protein one choice (the diet axis), Free from and Macros stacking', () => {
  assert.match(src, /\{ id: "diet", label: "Diet", items: KM_DIETS, single: true \}/);
  assert.match(src, /\{ id: "protein", label: "Protein", items: KM_PROTEINS, single: true \}/);
  assert.match(src, /\{ id: "free", label: "Free from", items: KM_FREE_FROM \}/);
  assert.match(src, /\{ id: "macros", label: "Macros", items: KM_GOALS \}/);
  // the same state and handlers as the old pills: a single group picks the diet, the rest toggle needs
  assert.match(src, /const groupOn = \(g, x\) => \(g\.single \? diet === x : needs\.includes\(x\)\)/);
  assert.match(src, /const groupPick = \(g, x\) => \(g\.single \? pickDiet\(x\) : toggleNeed\(x\)\)/);
  assert.match(src, /mark=\{g\.single \? "one" : "any"\}/);
  // each group is labelled for a screen reader too
  assert.match(src, /role="group" aria-labelledby=\{`km-sg-\$\{g\.id\}`\}/);
});

test('a desktop: a sticky column beside the results, the plan link at its foot', () => {
  assert.match(src, /\.km \.km-layout \{ display: grid; grid-template-columns: 212px minmax\(0, 1fr\)/);
  assert.match(src, /\.km \.km-side \{ position: sticky;/);
  assert.match(src, /<aside id="km-side"[^>]*style=\{\{ top: stickyTop \+ 20, maxHeight: `calc\(100vh - \$\{stickyTop \+ 40\}px\)` \}\}>/);
  assert.match(src, /<div className="km-side-plan">[\s\S]*?href="\/newdesign\/Cook\.html\?mode=together"/);
  // the old bordered plan button over the filters is gone
  assert.doesNotMatch(src, /border: '1px solid currentColor', borderRadius: 4 \}\}>Cook several dishes/);
});

test('960px and below: a bottom drawer from "Filters", over the chat launcher, and a dialog while open', () => {
  assert.match(tablet, /\.km \.km-side \{ display: none; \}/);
  assert.match(tablet, /\.km \.km-side\.open \{ display: grid; position: fixed; z-index: 2147483647;/);
  assert.match(tablet, /\.km \.km-side-bg \{ display: block; position: fixed; inset: 0; z-index: 2147483646;/);
  assert.match(src, /className=\{`km-fbtn[^`]*`\} onClick=\{\(\) => setDrawer\(true\)\} aria-expanded=\{drawer\} aria-controls="km-side"/);
  assert.match(src, /role=\{drawer \? "dialog" : undefined\} aria-modal=\{drawer \? "true" : undefined\}/);
  // opening moves focus to its ×, closing hands it back to Filters; Escape, a widening window,
  // the backdrop, × and "Show N" close it
  assert.match(src, /sideXRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(src, /fbtnRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(src, /if \(e\.key === "Escape"\) \{ closeDrawer\(\); return; \}/);
  // and Tab stays inside it while open (Codex on #2577): it wraps at both ends, and focus that
  // got out goes back to its first control
  assert.match(src, /if \(!side\.contains\(at\)\) \{ e\.preventDefault\(\); first\.focus\(\); \}/);
  assert.match(src, /else if \(e\.shiftKey && at === first\) \{ e\.preventDefault\(\); last\.focus\(\); \}/);
  assert.match(src, /else if \(!e\.shiftKey && at === last\) \{ e\.preventDefault\(\); first\.focus\(\); \}/);
  assert.match(src, /matchMedia\("\(min-width: 961px\)"\)/);
  assert.match(src, /className="km-side-bg" aria-hidden onClick=\{closeDrawer\}/);
  assert.match(src, /<button type="button" className="km-btn p" onClick=\{closeDrawer\}>Show \{shown\.length\}/);
});

test('what is on shows as chips that remove themselves, through the same handlers', () => {
  assert.match(src, /\.\.\.\(diet !== "All" \? \[\{ k: "diet", label: diet, off: \(\) => pickDiet\(diet\) \}\] : \[\]\)/);
  assert.match(src, /\.\.\.needs\.map\(\(n\) => \(\{ k: n, label: n, off: \(\) => toggleNeed\(n\) \}\)\)/);
  assert.match(src, /className="km-chip" onClick=\{c\.off\} aria-label=\{`Remove \$\{c\.name \|\| c\.label\}`\}/);
});
