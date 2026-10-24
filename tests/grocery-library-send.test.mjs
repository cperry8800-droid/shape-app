// The grocery Library (Eat → Library): an open list goes to a member from there, as from the grocery page,
// without loading it first (owner, 2026-10-24: "there should be a send to member at the bottom here when i
// click on the list in library. i shouldnt have to load it"). And a built-in list counts its items: they
// carry items and no stored count, so the card read "NaN items".
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, flatten, textOf } from './helpers/broadsheet-mount.mjs';
import { bsGroceryShareMessage } from '../mobile-app/src/services/groceryShare.mjs';

const { BSGroceryLibrary, BSPostSendSheet } = await loadBroadsheet(['BSGroceryLibrary', 'BSPostSendSheet']);

const MINE = {
  id: 'custom-1', name: 'Saturday shop', kind: 'custom', editable: true, count: 2, preview: 'Limes · Rice',
  items: [{ id: 'a', n: 'Limes', q: '4', a: 'Produce' }, { id: 'b', n: 'Rice', q: '1 bag', a: 'Grains' }],
};

// The card's header (name, count, preview) is the tap target that opens it.
const openCard = (d, name) => {
  const head = d.nodes().find((n) => n.type === 'div' && typeof n.props.onClick === 'function' && textOf(n).includes(name));
  assert.ok(head, `no card header for ${name}`);
  head.props.onClick({ stopPropagation() {} });
  d.render();
};
const sheet = (d) => d.nodes().find((n) => n.type === BSPostSendSheet);

test('an open Library list has Send to a member, which opens the send sheet with that list', () => {
  const d = drive(BSGroceryLibrary, { recipeLists: [MINE] });
  assert.ok(!d.buttons().some((b) => /^Send to a member/.test(b.label)), 'a closed card has no Send');
  openCard(d, 'Saturday shop');
  assert.equal(d.buttons().filter((b) => /^Send to a member/.test(b.label)).length, 1, 'the open card has one');
  assert.ok(!sheet(d), 'no sheet before the tap');
  d.click('Send to a member');
  const s = sheet(d);
  assert.ok(s, 'the send sheet opens');
  assert.deepEqual(s.props.post.grocery, MINE, 'with the list as it stands, nothing loaded');
  s.props.onClose();
  d.render();
  assert.ok(!sheet(d), 'and closes');
});

test('a built-in list counts its items, never "NaN items"', () => {
  const d = drive(BSGroceryLibrary, { recipeLists: [] });
  assert.doesNotMatch(d.text, /NaN/);
  assert.match(d.text, /11 items · Bananas · Eggs · Oats/);
  // A built-in list sends too.
  openCard(d, 'Sunday staples');
  d.click('Send to a member');
  assert.equal(sheet(d).props.post.grocery.name, 'Sunday staples');
});

// Codex P2 on #2435: a list saved without items (its card reads them off the stored preview) showed Send,
// but the bare record has neither items nor aisles, so the message could not be built and the send failed.
// It sends the items its open card shows.
test('a list saved without items sends the items its card shows', () => {
  const BARE = { id: 'legacy-1', name: 'Old cart', kind: 'custom', count: 2, preview: 'Limes · Rice' };
  const d = drive(BSGroceryLibrary, { recipeLists: [BARE] });
  openCard(d, 'Old cart');
  d.click('Send to a member');
  const sent = sheet(d).props.post.grocery;
  assert.deepEqual(sent.items.map((it) => it.n), ['Limes', 'Rice']);
  const msg = bsGroceryShareMessage(sent);
  assert.ok(msg, 'the message builds');
  assert.deepEqual(msg.metadata.items.map((it) => it.n), ['Limes', 'Rice']);
  assert.ok(!('items' in BARE), 'the saved record itself is left alone');
});

// A list that keeps its aisles sends by them, never by the preview's items.
test('a list with aisles sends its aisles', () => {
  const AISLED = { id: 'aisled-1', name: 'Taco night', kind: 'recipe', preview: 'Tortillas', aisles: [{ aisle: 'Bakery', items: [{ n: 'Tortillas', q: '12' }, { n: 'Limes', q: '3' }] }] };
  const d = drive(BSGroceryLibrary, { recipeLists: [AISLED] });
  openCard(d, 'Taco night');
  d.click('Send to a member');
  const msg = bsGroceryShareMessage(sheet(d).props.post.grocery);
  assert.deepEqual(msg.metadata.items, [{ n: 'Tortillas', q: '12', a: 'Bakery' }, { n: 'Limes', q: '3', a: 'Bakery' }]);
});
