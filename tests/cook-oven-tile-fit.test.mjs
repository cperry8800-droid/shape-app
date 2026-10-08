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
// and cut with an ellipsis, then the time and the note on one line that never wraps. Several
// ovens share the strip in equal columns that can shrink to nothing.
//
// Layout cannot be measured without a browser, and this suite has none, so the fix was driven
// in Chromium (every oven state of a Together cook at 320, 390 and 430px; the PR records it)
// and this file holds the stylesheet to the rules that fix rests on. They are read from the
// shipping file's own <style>, matched by the exact selector each one needs, so a rule moved
// to a weaker selector or dropped fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('several ovens share the strip in columns that can shrink', () => {
  const win = decls('.bsck.dev .cC .oven .win');
  assert.equal(win['grid-auto-columns'], 'minmax(0,1fr)');
  assert.equal(win['min-width'], '0');
  assert.match(win['place-items'], /stretch$/, 'a dish fills its column, so its name can be cut to it');
});
