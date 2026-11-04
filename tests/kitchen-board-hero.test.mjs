// tests/kitchen-board-hero.test.mjs
//
// The Recipes tab (Eat → Recipes, "The menu") as option B. Owner, 2026-11-04: "and new recipe design", then
// of three built in the app "B for menu": Today's board as a hero and a pair (the first pick a large raised
// card with its minutes and kcal as figures, the other two smaller cards under it), and the time tabs as
// pills. The board's picks, its rotation and the tabs' behaviour are unchanged (recipe-menu-parity,
// kitchen-course-tabs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const CLIENT = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8'));
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `${a} is gone`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `${b} is gone`); return src.slice(i, j); };
const BOX = between(CLIENT, 'function BSRecipeBox(', '\nfunction ');
const BOARD = between(BOX, '{board.length > 0 ? (() => {', 'data-km-tabs-anchor=""');

test('the board is a hero and a pair, each one button that opens its recipe', () => {
  assert.match(BOARD, /^\{board\.length > 0 \? \(\(\) => \{\s*const \[hero, \.\.\.rest\] = board;/);
  assert.match(BOARD, /data-km-board=""/);
  assert.match(BOARD, /data-km-hero="" onClick=\{\(\) => onOpenRecipe\(hero\)\}/);
  assert.match(BOARD, /\{rest\.map\(\(r\) => \{[\s\S]*?onClick=\{\(\) => onOpenRecipe\(r\)\}/);
  assert.match(BOARD, /gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)'/);
  // The board keeps its heading and its promise.
  assert.match(BOARD, /nutrition:kitchen\.boardTitle/);
  assert.match(BOARD, /nutrition:kitchen\.boardSub/);
});

test('the hero carries its course, its credit, and its minutes and kcal as figures', () => {
  // The course chip is the course the dish sits in, read off the same course rule as the tabs.
  assert.match(BOARD, /const ci = bsKmCourseIndex\(r\);[\s\S]*?COURSE_SHORT\[BS_KM_COURSES\[ci\]\.key\]/);
  assert.match(BOARD, /\{creditOf\(hero\)\}/);
  // "10 min" splits to the figure and its unit; a time that is not a number stays whole.
  assert.match(BOARD, /const tm = String\(hero\.time \|\| ''\)\.match\(/);
  assert.match(BOARD, /\{mins\}/);
  assert.match(BOARD, /\{hero\.kcal\}/);
  assert.match(BOARD, /nutrition:kitchen\.rdKcal/);
});

test('the time tabs are pills that share the row, the count wrapping under the time when narrow', () => {
  const tabs = between(BOX, "aria-label={tr('nutrition:kitchen.cookingTime'", 'shown.length === 0 ? (');
  assert.match(tabs, /flex: '1 1 0px', minWidth: 0, display: 'flex', flexWrap: 'wrap'/);
  assert.match(tabs, /minHeight: 44, padding: '4px 4px', borderRadius: 99, border: `1px solid \$\{on \? t\.INK : t\.RULE\}`/);
  assert.match(tabs, /background: on \? t\.INK : 'transparent'/);
  // No word is cut: the time keeps its line whole.
  assert.match(tabs, /<span style=\{\{ whiteSpace: 'nowrap' \}\}>\{COURSE_SHORT\[c\.key\]\}<\/span>/);
  assert.doesNotMatch(tabs, /textOverflow: 'ellipsis'/);
});
