// Eat's two lists, made calm (owner, 2026-10-24: "improve design and look of this library page", "same with
// this, looks really busy", then of three options: "for library go with C, recipes for with A", "keep filters
// the same").
//   • The recipe menu's row: the name, one line of diet and credit, one line of numbers, and two square keys,
//     ＋ (to the grocery list, its words kept for a screen reader) and ♡ (to the library).
//   • The Library: a compact index. A closed row is a button holding the count tile, the name and what the
//     list holds; its actions appear only once it is open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, textOf, importSibling } from './helpers/broadsheet-mount.mjs';

const MOD = await loadBroadsheet(['BSRecipeBox', 'BS_KM_COURSES', 'BSGroceryLibrary']);
const { SHAPE_KITCHEN_RECIPES } = await importSibling('shapeKitchenData.js');

test('a recipe row ends in two square keys: ＋ to the grocery list and ♡ to the library', () => {
  const sent = [];
  const box = drive(MOD.BSRecipeBox, { recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery: (r) => sent.push(r.title), onChangeView() {} });
  const plus = box.nodes().filter((n) => n.type === 'button' && /Send to grocery/.test(textOf(n)));
  assert.ok(plus.length > 0, 'no ＋ key on the menu');
  for (const b of plus) {
    assert.equal(b.props.style.width, 44);
    assert.equal(b.props.style.height, 44);
    // The ＋ is drawn for the eye and hidden from a screen reader, which reads the words instead.
    const kids = [].concat(b.props.children);
    assert.ok(kids.some((k) => k && k.props && k.props['aria-hidden'] && k.props.children === '＋'), 'the key shows no ＋');
    assert.ok(kids.some((k) => k && k.props && k.props.style && k.props.style.clipPath === 'inset(50%)' && /Send to grocery/.test(textOf(k))), 'the words are not kept for a screen reader');
  }
  const hearts = box.nodes().filter((n) => n.type === 'button' && 'aria-pressed' in n.props && /library/.test(String(n.props['aria-label'] || '')));
  assert.equal(hearts.length, plus.length, 'every row carries one ♡ beside its ＋');
  assert.equal(hearts[0].props.style.width, 44);
  assert.match(textOf(hearts[0]), /^♡$/);
  // The leader and the arrow that ran the width of the row are gone.
  assert.ok(!box.nodes().some((n) => n.props && n.props.style && /dotted/.test(String(n.props.style.borderBottom || ''))), 'the dotted leader is back');
  plus[0].props.onClick();
  assert.equal(sent.length, 1, '＋ does not send the recipe to the grocery list');
});

test('a recipe row reads its numbers as one line: time, kcal, protein, carbs and fat', () => {
  const box = drive(MOD.BSRecipeBox, { recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {} });
  const r = SHAPE_KITCHEN_RECIPES.find((x) => box.row(x.title, 'Send to grocery'));
  assert.ok(r, 'no recipe row on the first course');
  const row = box.row(r.title, 'Send to grocery');
  assert.ok(row.includes(`${r.time} · ${r.kcal} Kcal · P ${r.macros.p} · C ${r.macros.c} · F ${r.macros.f}`), `the numbers line reads: ${row}`);
});

test('a closed Library row is one button: the count tile, the name and what it holds, and no actions', () => {
  const d = drive(MOD.BSGroceryLibrary, { recipeLists: [] });
  const rows = d.nodes().filter((n) => n.type === 'button' && 'aria-expanded' in n.props);
  assert.ok(rows.length >= 3, 'the Library lists no rows');
  assert.ok(rows.every((n) => n.props['aria-expanded'] === false), 'a row starts open');
  assert.match(textOf(rows[0]), /^11itemsSunday staplesBananas · Eggs · Oats/);
  for (const label of ['Load', 'Edit', 'Delete', 'Duplicate', 'Send to a member']) {
    assert.ok(!d.buttons().some((b) => b.label.startsWith(label)), `${label} shows on a closed row`);
  }
  // No row draws the purple spine or the clipped key it replaced.
  assert.ok(!d.nodes().some((n) => n.props && n.props.style && (n.props.style.background === '#8a5cf6' || /polygon/.test(String(n.props.style.clipPath || '')))), 'the purple spine or a clipped key is back');
});

test('an open Library row shows its kind, its items and its actions', () => {
  const MINE = { id: 'custom-1', name: 'Saturday shop', kind: 'custom', usedCount: 3, preview: 'Limes · Rice', items: [{ id: 'a', n: 'Limes', q: '4' }, { id: 'b', n: 'Rice', q: '1 bag' }] };
  const d = drive(MOD.BSGroceryLibrary, { recipeLists: [MINE] });
  const row = d.nodes().find((n) => n.type === 'button' && 'aria-expanded' in n.props && textOf(n).includes('Saturday shop'));
  row.props.onClick();
  d.render();
  const open = d.nodes().find((n) => n.type === 'button' && 'aria-expanded' in n.props && textOf(n).includes('Saturday shop'));
  assert.equal(open.props['aria-expanded'], true);
  for (const label of ['Load', 'Edit', 'Delete', 'Send to a member']) {
    assert.equal(d.buttons().filter((b) => b.label.startsWith(label)).length, 1, `the open row has no ${label}`);
  }
  assert.match(d.text, /Limes4Rice1 bag/, 'the open row lists its items with their amounts');
});

// Codex P1 on #2447: beside the title, the ＋ sat ABOVE the allergen certification on screen though the note
// came first in the DOM, so a member could act before reading what qualifies the claim. A row with a note
// keeps its keys out of the title's row and puts them after the note; a row without one keeps them beside it.
test('a row with an allergen note puts ＋ and ♡ after the note, never beside the title', () => {
  const box = drive(MOD.BSRecipeBox, { recipes: SHAPE_KITCHEN_RECIPES, onOpenRecipe() {}, onSendToGrocery() {}, onChangeView() {} });
  const seen = { noted: 0, plain: 0 };
  for (const c of MOD.BS_KM_COURSES) {
    const tab = box.nodes().find((n) => n.type === 'button' && String(n.key) === c.key);
    if (!tab || tab.props.disabled) continue;
    box.clickKey(c.key);
    const door = box.nodes().find((n) => String(n.key) === `more-${c.key}` && n.props && typeof n.props.onClick === 'function');
    if (door) box.clickKey(door.key);
    // A row is the keyed div that opens with its recipe's title.
    const rows = box.nodes().filter((n) => n.type === 'div' && n.key != null && /Send to grocery/.test(textOf(n)));
    for (const r of SHAPE_KITCHEN_RECIPES) {
      const row = rows.find((n) => textOf(n).startsWith(r.title));
      if (!row) continue;
      const parts = [].concat(row.props.children).filter((k) => k && k.props);
      const top = parts[0];
      const note = (r.allergenNotes || [])[0];
      if (note) {
        seen.noted += 1;
        assert.doesNotMatch(textOf(top), /Send to grocery/, `"${r.title}": the ＋ sits beside the title, above its allergen note`);
        const text = textOf(row);
        assert.ok(text.indexOf(note.certification) < text.indexOf('Send to grocery'), `"${r.title}": the ＋ comes before the note`);
        assert.equal(parts[parts.length - 1].props.style.justifyContent, 'flex-end', `"${r.title}": the keys are not a row under the note`);
      } else {
        seen.plain += 1;
        assert.match(textOf(top), /Send to grocery/, `"${r.title}": a row with no note lost its keys beside the title`);
      }
    }
  }
  assert.ok(seen.noted > 0, 'no recipe with an allergen note was reached — this test proves nothing');
  assert.ok(seen.plain > 0, 'no recipe without a note was reached');
});

// Codex P2 on #2447: the tile reads the words off the translated count, and keeps them in the locale's
// order. Hausa says "kayayyaki 11", so its word sits above the figure; English's "11 items" sits below.
test('the count tile keeps the translated words in the locale\'s order', () => {
  const prev = globalThis.ShapeI18n;
  globalThis.ShapeI18n = { t: (k, o) => (k === 'nutrition:grocery.itemCount' ? `kayayyaki ${o.count}` : undefined) };
  try {
    const d = drive(MOD.BSGroceryLibrary, { recipeLists: [] });
    const row = d.nodes().find((n) => n.type === 'button' && 'aria-expanded' in n.props && textOf(n).includes('Sunday staples'));
    assert.match(textOf(row), /^kayayyaki11Sunday staples/, 'the Hausa word was moved after the figure');
  } finally {
    globalThis.ShapeI18n = prev;
  }
  const en = drive(MOD.BSGroceryLibrary, { recipeLists: [] });
  const row = en.nodes().find((n) => n.type === 'button' && 'aria-expanded' in n.props && textOf(n).includes('Sunday staples'));
  assert.match(textOf(row), /^11itemsSunday staples/, 'the English word left its place under the figure');
});

// Codex P2 on #2447: a count past a thousand is grouped by the locale ("1,200 items", "1.200 Artikel"). The
// tile shows the whole localized number, never the raw count beside the leftover digits.
test('the count tile shows a grouped number whole', () => {
  const BIG = { id: 'big-1', name: 'Warehouse run', kind: 'custom', count: 1200, preview: 'Rice · Beans' };
  const prev = globalThis.ShapeI18n;
  try {
    for (const [label, want] of [[(n) => `${n.toLocaleString('en-US')} items`, /^1,200itemsWarehouse run/], [(n) => `${n.toLocaleString('de-DE')} Artikel`, /^1\.200ArtikelWarehouse run/]]) {
      globalThis.ShapeI18n = { t: (k, o) => (k === 'nutrition:grocery.itemCount' ? label(o.count) : undefined) };
      const d = drive(MOD.BSGroceryLibrary, { recipeLists: [BIG] });
      const row = d.nodes().find((n) => n.type === 'button' && 'aria-expanded' in n.props && textOf(n).includes('Warehouse run'));
      assert.match(textOf(row), want);
    }
  } finally {
    globalThis.ShapeI18n = prev;
  }
});
