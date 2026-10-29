// "Build a list." (Eat → Grocery → ＋), redesigned in the Library's look (owner, 2026-10-29: "Need to update
// design of this page") and carved into BSGroceryBuilder.jsx: the clean type, Shape's teal where the rust was,
// square-cornered aisle keys, the teal-barred Add, the items under their aisles, and one ink Create. What it
// does is unchanged: name a list, add items (auto-sorted into an aisle, which a tap overrides), create it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, THEME, drive, textOf, loadBroadsheet, loadCarved } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSGroceryBuilder.jsx'), 'utf8');
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
// The real aisle guesser and labeller, from the client module that publishes them.
const { bsBuilderAisleFor, bsAisleLabel } = await loadBroadsheet(['bsBuilderAisleFor', 'bsAisleLabel']);
const TEAL = '#0a8f87';
Object.assign(globalThis.window, {
  useBS: () => THEME,
  BSPage: ({ children }) => children,
  BSFooter: () => null,
  BSMastRow: () => null,
  BS_MAST_TOP_CSS: '0px',
  _bsScrollTopOnMount: () => {},
  bsGroceryHues: () => ({ teal: TEAL, gold: '#a07a2e' }),
  bsBuilderAisleFor,
  bsAisleLabel,
});
const { BSGroceryBuilder } = await loadCarved('BSGroceryBuilder.jsx');

function mount(onCreate = () => {}) {
  let cancelled = 0;
  const api = drive(BSGroceryBuilder, { onCancel: () => { cancelled += 1; }, onCreate });
  const nodes = () => api.nodes();
  const input = (ph) => nodes().find((n) => n.type === 'input' && n.props.placeholder === ph);
  const type = (ph, value) => { input(ph).props.onChange({ target: { value } }); api.render(); };
  const key = (label) => nodes().find((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && textOf(n).trim() === label);
  return { api, nodes, input, type, key, cancelled: () => cancelled };
}

test('an empty list: the head, the name field, nothing to add or create yet', () => {
  const m = mount();
  assert.match(m.api.text, /Build a list\./);
  assert.match(m.api.text, /No items yet\. Add your first above\./);
  const btn = (label) => m.nodes().find((n) => n.type === 'button' && textOf(n).trim().startsWith(label));
  assert.equal(btn('+ Add to list').props.disabled, true);
  assert.equal(btn('Create list').props.disabled, true);
  assert.equal(m.key('Produce').props['aria-pressed'], true, 'Produce is the starting aisle');
  m.api.click('← CANCEL');
  assert.equal(m.cancelled(), 1);
});

test('a typed item sorts itself into an aisle, a tap overrides it, and the items list under their aisles', () => {
  const m = mount();
  m.type('Item', 'Frozen peas');
  assert.equal(m.key('Frozen').props['aria-pressed'], true, 'auto-sorted');
  assert.match(m.api.text, /auto-sorted — tap to change/);
  m.type('Qty', '2 bags');
  m.api.click('+ Add to list');
  m.type('Item', 'Bananas');
  m.key('Pantry').props.onClick();
  m.api.render();
  assert.match(m.api.text, /· custom/);
  m.api.click('+ Add to list');
  const text = m.api.text;
  // Under their aisles, in the keys' order (Pantry before Frozen), each with its count and quantity.
  assert.ok(text.indexOf('Pantry1Bananas1') >= 0, text);
  assert.ok(text.indexOf('Frozen1Frozen peas2 bags') >= 0, text);
  assert.ok(text.indexOf('Bananas') < text.indexOf('Frozen peas'));
  assert.equal(m.input('Item').props.value, '', 'the field clears for the next item');
  assert.equal(m.key('Produce').props['aria-pressed'], true, 'and the aisle goes back to Produce');
});

test('× removes that item; Create hands over the name and the items by aisle', () => {
  let made = null;
  const m = mount((list) => { made = list; });
  m.type('e.g. Sunday staples', 'Sunday staples');
  for (const n of ['Spinach', 'Eggs', 'Bagels']) { m.type('Item', n); m.api.click('+ Add to list'); }
  const remove = m.nodes().filter((n) => n.type === 'button' && n.props['aria-label'] === 'Remove');
  assert.equal(remove.length, 3);
  // The first row listed is Spinach (Produce leads the order); remove it.
  remove[0].props.onClick();
  m.api.render();
  assert.doesNotMatch(m.api.text, /Spinach/);
  m.api.click('Create list');
  assert.equal(made.name, 'Sunday staples');
  assert.deepEqual(made.items.map((i) => i.n), ['Eggs', 'Bagels']);
  assert.deepEqual(made.aisles.map((a) => [a.aisle, a.items.map((i) => i.n)]), [['Protein', ['Eggs']], ['Bakery', ['Bagels']]]);
});

test('the look: Shape\'s teal for the accents, no rust, square keys, the clean head and one ink Create', () => {
  const m = mount();
  m.type('Item', 'Eggs');
  m.api.click('+ Add to list');
  const all = m.nodes();
  assert.doesNotMatch(stripComments(SRC), /rust|RUST/, 'the old rust accent is gone');
  const eyebrow = all.find((n) => n.props && n.props.style && textOf(n).trim() === 'NEW LIST');
  assert.equal(eyebrow.props.style.color, TEAL);
  const title = all.find((n) => n.props && n.props.style && /^Build a list\.$/.test(textOf(n).trim()));
  assert.match(title.props.style.fontFamily, /^'Geist'/, 'the clean head face');
  assert.notEqual(title.props.style.fontStyle, 'italic');
  const keyStyle = m.key('Protein').props.style;
  assert.equal(keyStyle.borderRadius, 6, 'square-cornered keys, not pills');
  assert.equal(m.key('Pantry').props.style.color, THEME.INK70, 'an unpicked key is quiet');
  assert.equal(m.key('Produce').props.style.color, TEAL, 'the picked one is teal');
  const add = all.find((n) => n.type === 'button' && textOf(n).trim() === '+ Add to list');
  assert.equal(add.props.style.borderLeft, `3px solid ${THEME.RULE}`, 'Add rests until an item is typed');
  m.type('Item', 'Milk');
  const ready = m.nodes().find((n) => n.type === 'button' && textOf(n).trim() === '+ Add to list');
  assert.equal(ready.props.style.borderLeft, `3px solid ${TEAL}`, 'and is the teal-barred key once one is');
  assert.equal(ready.props.style.color, TEAL);
  const create = all.find((n) => n.type === 'button' && textOf(n).trim().startsWith('Create list'));
  assert.equal(create.props.style.background, THEME.INK);
  assert.equal(create.props.style.color, THEME.PAPER);
  // Every field is at least 16px, so iOS doesn't zoom in on focus.
  for (const i of all.filter((n) => n.type === 'input')) assert.ok(i.props.style.fontSize >= 16, i.props.placeholder);
  // The items' aisle head is teal.
  const head = all.find((n) => n.props && n.props.style && n.props.style.borderBottom === `1px solid ${THEME.RULE}` && /Protein/.test(textOf(n)));
  assert.equal(head.props.style.color, TEAL);
});

test('the client module renders the carved builder and publishes the two helpers it reads', () => {
  assert.match(CLIENT, /^import \{ BSGroceryBuilder \} from '\.\/BSGroceryBuilder\.jsx';$/m);
  assert.ok(!/^function BSGroceryBuilder\(/m.test(CLIENT), 'the old copy is gone');
  assert.match(CLIENT, /if \(view === 'build'\) return <BSGroceryBuilder onCancel=\{\(\) => setView\('grocery'\)\} onCreate=\{createListFromBuilder\} \/>;/);
  const exportList = CLIENT.match(/Object\.assign\(window, \{ bsNoraOpen,[^}]*\}\);/)[0];
  assert.match(exportList, /\bbsBuilderAisleFor\b/);
  assert.match(exportList, /\bbsAisleLabel\b/);
  // Read at call time, never at the module's top (the load-order rule every carved module keeps).
  assert.match(SRC, /export function BSGroceryBuilder\(\{ onCancel, onCreate \}\) \{\n  const \{ BSPage, BSFooter, BSMastRow, BS_MAST_TOP_CSS, _bsScrollTopOnMount, bsGroceryHues, bsBuilderAisleFor, bsAisleLabel \} = window;/);
});

