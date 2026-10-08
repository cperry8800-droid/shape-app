// The phone cook screen's oven tile keeps its dish inside the tile.
//
// ⚠ THE DEFECT, MEASURED IN THE APP 2026-10-08. On a phone (`.bsck.dev`) the oven is a short
// strip, 113px wide at 390px, but its contents kept the big oven's grid: a centred row of the
// dish name (up to 88px), the time and a note. With "Sheet-pan salmon" and "In 18 min" that row
// needed 139px of the 89 inside, so the name's column shrank, the name stayed 88px wide and,
// centred in it, ran 25px out past the tile's left edge (x=7 against the tile's x=20), and the
// note wrapped to two lines.
//
// The phone oven now stacks like the burners: the name on its own line, as wide as the tile
// and cut with an ellipsis, then the time and the note on one line that never wraps.
//
// ⚠ TWO OVENS, FOUND BY CODEX ON THE FIRST HEAD OF THIS FIX. The first head put two ovens side by
// side in equal columns, and at 320px each column is 28px: the first oven's "19:59" (44px, never
// cut) ran 16px over the second dish, and with both timers running "12:00" ended 5px past the
// tile. So two ovens take a line each ("Roa… 19:54" over "She… 12:00"). On that line the time
// is never cut, the note keeps its width while the name has any to give, and the name takes only
// what is left: measured at 430px, sharing the cut by width had turned "Now" into "N…" beside
// "Sheet-pan …".
//
// Layout cannot be measured without a browser, and this suite has none, so the fix was driven
// in Chromium (every oven state of a Together cook at 320, 390 and 430px; the PR records it)
// and this file holds the stylesheet to the rules that fix rests on. They are read from the
// shipping file's own <style>, matched by the exact selector each one needs, so a rule moved
// to a weaker selector or dropped fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';

const React = createRequire(import.meta.url)('react');
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server');

const SRC = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');

// Every rule in the file whose selector list has exactly this selector, merged in source
// order: what the cascade gives an element matched by that selector alone.
const decls = (selector) => {
  const out = {};
  for (const m of SRC.matchAll(/^([^{}\n]+)\{([^{}\n]*)\}\s*$/gm)) {
    if (!m[1].split(',').map((x) => x.trim()).includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  return out;
};

test('the phone oven stacks its dish: the name on its own line, the rest on one line after it', () => {
  const inner = decls('.bsck.dev .cC .oven .in');
  // The base rule (.bsck .cC .oven .in, four classes) makes it a centred grid; this one has five,
  // so it wins, and it has to say so itself.
  assert.equal(inner.display, 'flex');
  assert.equal(inner['flex-wrap'], 'wrap');
  assert.equal(inner['min-width'], '0');
  assert.equal(inner.padding, '0', 'the base rule\'s 6px side padding would eat the strip');
  const name = decls('.bsck.dev .cC .oven .in b');
  assert.equal(name.flex, '0 0 100%', 'the name takes its own line');
  assert.equal(name['max-width'], '100%', 'the base rule\'s 88px cap would leave it narrower than the tile, or wider');
  assert.equal(name['min-width'], '0');
  assert.deepEqual([name['white-space'], name.overflow, name['text-overflow']], ['nowrap', 'hidden', 'ellipsis']);
});

test('the time and the note never wrap, and the note gives way first', () => {
  const note = decls('.bsck.dev .cC .oven .in small');
  assert.deepEqual([note['white-space'], note.overflow, note['text-overflow']], ['nowrap', 'hidden', 'ellipsis']);
  assert.equal(note['min-width'], '0');
  assert.equal(decls('.bsck.dev .cC .oven .in .n').flex, 'none', 'a countdown is never cut');
});

test('the oven window fills the strip and lets its dish be cut to it', () => {
  const win = decls('.bsck.dev .cC .oven .win');
  assert.equal(win['grid-auto-columns'], 'minmax(0,1fr)');
  assert.equal(win['min-width'], '0');
  assert.match(win['place-items'], /stretch$/, 'a dish fills its column, so its name can be cut to it');
});

test('two ovens take a line each: the name gives way first, the time never', () => {
  assert.equal(decls('.bsck.dev .cC .oven .win.two')['grid-auto-flow'], 'row', 'side by side, each oven gets 28px at 320px');
  assert.equal(decls('.bsck.dev .cC .oven .win.two .in')['flex-wrap'], 'nowrap', 'a dish is one line, so two fit the 40px strip');
  // A zero basis that grows: the name gets only the room the time and the note leave. With the
  // base rule's auto basis the cut is shared by width, and a long name takes "Now" down with it.
  assert.equal(decls('.bsck.dev .cC .oven .win.two .in b').flex, '1 1 0');
});

const { bsCkHob, bsCkHobOff } = await loadBroadsheet(['bsCkHob', 'bsCkHobOff'], React);
const tr = (key, o) => (o && o.defaultValue ? o.defaultValue.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '') : key);
const dish = (title, left) => ({ title, kind: 'hold', left, timerId: title });
const ovenWin = (oven) => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, bsCkHob({ tr, occ: { ...bsCkHobOff({ stove: 2, oven: 2 }), oven } })));
  return html.match(/<div class="(win[^"]*)">(.*?)<\/div><\/div><div class="brd/)?.slice(1);
};

test('the oven window is marked two exactly when two dishes are in the ovens', () => {
  const [two, inside] = ovenWin([dish('Roasted veg and halloumi traybake', 1194), dish('Sheet-pan salmon', 720)]);
  assert.equal(two, 'win two');
  assert.equal(inside.match(/class="in"/g).length, 2);
  assert.match(inside, /19:54.*12:00/);
  assert.equal(ovenWin([dish('Sheet-pan salmon', 720)])[0], 'win', 'one dish keeps the stacked layout');
  assert.equal(ovenWin([])[0], 'win');
});
