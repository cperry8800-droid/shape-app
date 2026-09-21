// Pure GridStack dashboard-layout reconciliation: keep saved geometry, append new
// widgets (auto-positioned), drop stale ones, filter hidden. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGridLayout, widgetW, optionalKeys, splitHidden, catalogRows } from '../public/newdesign/dashboardLayout.mjs';

const WIDGETS = [
  { key: 'a', size: 'full' },
  { key: 'b', size: 'half' },
  { key: 'c', size: 'half' },
];

test('widgetW maps size to a 12-col span', () => {
  assert.equal(widgetW('full'), 12);
  assert.equal(widgetW('half'), 6);
});

test('null saved → every widget visible, auto-positioned, width from size', () => {
  const r = resolveGridLayout(null, WIDGETS);
  assert.deepEqual(r.hidden, []);
  assert.deepEqual(r.visible, [
    { key: 'a', w: 12, autoPosition: true },
    { key: 'b', w: 6, autoPosition: true },
    { key: 'c', w: 6, autoPosition: true },
  ]);
});

test('saved geometry is preserved for known widgets', () => {
  const saved = { items: [{ id: 'b', x: 6, y: 0, w: 6, h: 4 }, { id: 'a', x: 0, y: 0, w: 6, h: 5 }], hidden: [] };
  const r = resolveGridLayout(saved, WIDGETS);
  // saved 'b' and 'a' keep their geometry; 'c' is new → appended auto-positioned
  assert.deepEqual(r.visible, [
    { key: 'b', x: 6, y: 0, w: 6, h: 4 },
    { key: 'a', x: 0, y: 0, w: 6, h: 5 },
    { key: 'c', w: 6, autoPosition: true },
  ]);
});

test('stale saved items (widget no longer exists) are dropped', () => {
  const saved = { items: [{ id: 'z', x: 0, y: 0, w: 12, h: 3 }, { id: 'a', x: 0, y: 0, w: 12, h: 4 }], hidden: ['z'] };
  const r = resolveGridLayout(saved, WIDGETS);
  assert.deepEqual(r.visible.map((v) => v.key), ['a', 'b', 'c']); // z gone; b,c appended
  assert.deepEqual(r.hidden, []); // z filtered from hidden too
});

test('hidden keys are filtered to existing + never appear in visible', () => {
  const saved = { items: [{ id: 'a', x: 0, y: 0, w: 12, h: 4 }], hidden: ['c', 'q'] };
  const r = resolveGridLayout(saved, WIDGETS);
  assert.deepEqual(r.hidden, ['c']);            // 'q' doesn't exist → dropped
  assert.ok(!r.visible.some((v) => v.key === 'c')); // hidden 'c' not visible
  assert.ok(r.visible.some((v) => v.key === 'b')); // 'b' new + not hidden → visible
});

test('duplicate keys in saved data are deduplicated (canonical arrays)', () => {
  const saved = {
    items: [
      { id: 'a', x: 0, y: 0, w: 12, h: 4 },
      { id: 'a', x: 6, y: 0, w: 6, h: 3 },   // duplicate id — first occurrence wins
    ],
    hidden: ['b', 'b', 'c'],                  // duplicate keys
  };
  const r = resolveGridLayout(saved, WIDGETS);
  const visibleKeys = r.visible.map((v) => v.key);
  assert.equal(visibleKeys.length, new Set(visibleKeys).size, 'visible has duplicate keys');
  assert.equal(r.hidden.length, new Set(r.hidden).size, 'hidden has duplicate keys');
  assert.deepEqual(r.hidden, ['b', 'c']);                 // deduped, order preserved
  assert.deepEqual(r.visible.find((v) => v.key === 'a'), { key: 'a', x: 0, y: 0, w: 12, h: 4 }); // first 'a' kept
});

// ── Optional widgets (review 2026-09-21) ─────────────────────────────────────
// A tab may OFFER a widget it does not show by default. Its ON state is a positive
// choice stored in `added`; a default widget's OFF state stays in `hidden`. The engine
// works on ONE effective hidden list, and `splitHidden` writes the two lists back.
const OWIDGETS = [
  { key: 'a', size: 'full' },
  { key: 'b', size: 'half' },
  { key: 'o1', size: 'half', optional: true },
  { key: 'o2', size: 'half', optional: true },
];

test('an optional widget is OFF a board nobody has arranged — the default board is unchanged', () => {
  const r = resolveGridLayout(null, OWIDGETS);
  assert.deepEqual(r.visible.map((v) => v.key), ['a', 'b']);
  assert.deepEqual(r.hidden, ['o1', 'o2']);
  // ⚠ …AND FOR A DOCUMENT WRITTEN BEFORE THE CATALOGUE EXISTED. A member's saved
  // layout has no `added` at all; that must read as "nothing added", never as "show
  // everything" — a widget added to the catalogue must not appear on anyone's
  // dashboard unasked.
  const old = { items: [{ id: 'a', x: 0, y: 0, w: 12, h: 4 }], hidden: ['b'] };
  const r2 = resolveGridLayout(old, OWIDGETS);
  assert.deepEqual(r2.visible.map((v) => v.key), ['a']);
  assert.deepEqual(r2.hidden, ['b', 'o1', 'o2']);
});

test('`added` puts an optional widget on the board, and keeps its saved place', () => {
  const saved = { items: [{ id: 'o2', x: 6, y: 0, w: 6, h: 5 }], hidden: [], added: ['o2'] };
  const r = resolveGridLayout(saved, OWIDGETS);
  assert.deepEqual(r.hidden, ['o1']);
  assert.deepEqual(r.visible.find((v) => v.key === 'o2'), { key: 'o2', x: 6, y: 0, w: 6, h: 5 });
  assert.ok(!r.visible.some((v) => v.key === 'o1'));
  // an added widget with no saved place is appended auto-positioned, like a new default
  assert.deepEqual(resolveGridLayout({ items: [], hidden: [], added: ['o1'] }, OWIDGETS).visible.find((v) => v.key === 'o1'),
    { key: 'o1', w: 6, autoPosition: true });
});

test('an optional key in `hidden`, and a default or unknown key in `added`, say nothing', () => {
  const saved = { items: [], hidden: ['o1'], added: ['a', 'zzz'] };
  const r = resolveGridLayout(saved, OWIDGETS);
  // o1 is off because it was never ADDED, not because it was "hidden"; a is on
  // because a default widget cannot be "added"; zzz belongs to no build
  assert.deepEqual(r.hidden, ['o1', 'o2']);
  assert.deepEqual(r.visible.map((v) => v.key), ['a', 'b']);
});

test('splitHidden writes the two lists the document holds from the one effective list', () => {
  assert.deepEqual(splitHidden(['b', 'o1', 'o1', 'zzz'], OWIDGETS), { hidden: ['b'], added: ['o2'] });
  // a fresh board: no hidden defaults, nothing added
  assert.deepEqual(splitHidden(resolveGridLayout(null, OWIDGETS).hidden, OWIDGETS), { hidden: [], added: [] });
  // ⚠ AND THE TWO ARE INVERSES: resolve(split(h)) is h for every effective list, or a
  // reload would silently change the board the member just arranged.
  for (const h of [[], ['a'], ['o1'], ['a', 'o2'], ['b', 'o1', 'o2'], ['a', 'b', 'o1', 'o2']]) {
    const doc = { items: [], ...splitHidden(h, OWIDGETS) };
    assert.deepEqual(new Set(resolveGridLayout(doc, OWIDGETS).hidden), new Set(h), JSON.stringify(h));
  }
});

test('catalogRows: on, addable and empty are three different states', () => {
  const ws = [
    { key: 'a', size: 'full', title: 'A', blurb: 'about a' },
    { key: 'o1', size: 'half', optional: true, title: 'O1' },
    { key: 'e', size: 'half', optional: true, empty: true, emptyWhy: 'later' },
  ];
  const rows = catalogRows(ws, ['o1', 'e']);
  assert.deepEqual(rows.map((r) => [r.key, r.on, r.canAdd, r.empty, r.why]),
    [['a', true, false, false, null], ['o1', false, true, false, null], ['e', false, false, true, 'later']]);
  assert.equal(rows[0].blurb, 'about a');
  assert.equal(rows[1].optional, true);
  assert.equal(rows[1].title, 'O1');
  // ⚠ AN EMPTY WIDGET THAT IS NOT HIDDEN IS STILL NEITHER ON NOR ADDABLE — adding it
  // would re-create the empty item the `empty` contract exists to remove.
  assert.deepEqual(catalogRows(ws, []).map((r) => [r.key, r.on, r.canAdd]), [['a', true, false], ['o1', true, false], ['e', false, false]]);
  // a widget with no title falls back to its key; no emptyWhy falls back to a reason
  assert.deepEqual(catalogRows([{ key: 'k', empty: true }], []).map((r) => [r.title, r.why]), [['k', 'nothing to show yet']]);
});

test('optionalKeys keeps declaration order and ignores everything else', () => {
  assert.deepEqual(optionalKeys(OWIDGETS), ['o1', 'o2']);
  assert.deepEqual(optionalKeys([null, { key: 'x', optional: false }, { optional: true }]), []);
  assert.deepEqual(optionalKeys(null), []);
});
