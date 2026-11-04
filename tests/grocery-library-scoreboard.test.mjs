// tests/grocery-library-scoreboard.test.mjs
//
// Eat → Library as option C. Owner, 2026-11-04, of three Library designs built in the app: "C for library".
// Each list's item count lit in a dark slot in its kind's colour, the kind again as an edge, what it holds
// between lit dots, how often it was used, and New grocery list a capsule lit in teal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, textOf } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const { BSGroceryLibrary } = await loadBroadsheet(['BSGroceryLibrary']);
const SRC = stripComments(readFileSync(new URL('../mobile-app/src/broadsheet/BSGroceryLibrary.jsx', import.meta.url), 'utf8'));
const rows = (d) => d.nodes().filter((n) => n.type === 'button' && 'aria-expanded' in n.props);

test('a row reads the count, the name, what it holds with its separators, and its uses', () => {
  const d = drive(BSGroceryLibrary, { recipeLists: [] });
  // The separators are the record's own " · ", so the row still reads aloud as the list's words.
  assert.match(textOf(rows(d)[0]), /^11itemsSunday staplesBananas · Eggs · Oats14 uses/);
});

test('a list with no use count shows none, never "undefined uses"', () => {
  const MINE = { id: 'custom-1', name: 'Saturday shop', kind: 'custom', preview: 'Limes · Rice', items: [{ id: 'a', n: 'Limes', q: '4' }, { id: 'b', n: 'Rice', q: '1 bag' }] };
  const d = drive(BSGroceryLibrary, { recipeLists: [MINE] });
  const row = rows(d).find((n) => textOf(n).includes('Saturday shop'));
  assert.doesNotMatch(textOf(row), /undefined|NaN|uses/);
  assert.match(textOf(row), /^2itemsSaturday shopLimes · Rice›$/);
});

test('the slot, the edge and the dots glow in the kind\'s colour; the light paper drops the glow', () => {
  // A meal plan in gold, a recipe in amber, a member's own list in teal.
  assert.match(SRC, /const glow = l\.kind === 'mealplan' \? gold : \(l\.kind === 'recipe' \|\| l\.kind === 'template'\) \? t\.AMBER : teal;/);
  // The count is set in mono, lit by its own glow on the dark paper only.
  assert.match(SRC, /fontFamily: t\.MONO, fontSize: countFigure\.length > 3 \? 15 : 21/);
  assert.match(SRC, /textShadow: t\.isLight \? 'none' : `0 0 10px \$\{bsLibA\(glow, 0\.75\)\}`/);
  // The kind's edge, beside the slot.
  assert.match(SRC, /position: 'absolute', left: 0, top: 14, height: 48, width: 3, borderRadius: 2, background: glow/);
  // A locale that sets the count's word first keeps it above the figure (Codex P2 on #2447).
  assert.match(SRC, /\{countBefore \? countWord\(countBefore, false\) : null\}\s*<span style=\{\{ fontFamily: t\.MONO/);
});

test('New grocery list is a capsule outlined and lit in teal, not an ink block', () => {
  assert.match(SRC, /minHeight: 46, borderRadius: 99,\s*padding: '12px 14px', background: bsLibA\(teal, 0\.06\), color: teal, border: `1\.5px solid \$\{teal\}`/);
  assert.doesNotMatch(SRC, /background: t\.INK, color: t\.PAPER, border: 0, cursor: 'pointer'/);
});
