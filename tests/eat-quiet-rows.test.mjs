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
