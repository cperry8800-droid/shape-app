// The website's Kitchen (public/newdesign/recipesPage.jsx) at phone width. Measured in headless
// Chromium at 390, 360 and 320 px: the filter toggles ran 921 px past the right edge with no cue,
// the jump row lost "1 hr +"'s count, and every recipe row's ♡ sat past the edge at 320 px (its
// stats line didn't wrap). These are the phone rules that keep them on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/newdesign/recipesPage.jsx', import.meta.url), 'utf8');
const phone = src.slice(src.indexOf('@media (max-width: 760px)'));
const rule = (sel) => {
  const m = phone.match(new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
  return m ? m[1] : '';
};

test('the jump row fits a phone: one equal column per course, 44px cells, no sideways scroll', () => {
  assert.match(rule('.km .km-jump'), /display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(rule('.km .km-jump'), /overflow-x/);
  assert.match(rule('.km .km-jump a, .km .km-jump .off'), /min-height: 44px/);
});

test('the filter toggles say there is more: the edge with toggles behind it fades', () => {
  assert.match(rule('.km .km-tgs'), /mask-image: linear-gradient\(90deg, transparent 0, #000 var\(--fl\), #000 calc\(100% - var\(--fr\)\), transparent 100%\)/);
  assert.match(rule('.km .km-tgs[data-l="1"]'), /--fl: \d+px/);
  assert.match(rule('.km .km-tgs[data-r="1"]'), /--fr: \d+px/);
  assert.match(src, /className="km-tgs" ref=\{tgsRef\}/);
  assert.match(src, /el\.dataset\.r = el\.scrollLeft \+ el\.clientWidth < el\.scrollWidth - 1/);
  assert.match(rule('.km .km-tg'), /min-height: 44px/);
});

test('a recipe row keeps its ♡ on screen: the stats wrap, the button is 44px and never past the row', () => {
  assert.match(rule('.km .km-row-r'), /flex-wrap: wrap/);
  const save = rule('.km .km-save');
  assert.match(save, /margin: -10px 0 -10px auto/, 'no negative right margin');
  assert.match(save, /min-width: 44px; min-height: 44px/);
});
