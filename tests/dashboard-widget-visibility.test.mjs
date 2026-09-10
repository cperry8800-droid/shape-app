// A DashGrid widget with nothing to show declares `empty` and gets no grid item.
//
// ⚠ WHY THIS SUITE EXISTS. Call sites used to write `flag ? { key, … } : null`.
// DashGrid's boot effect has deps `[role, tab]`, so the widget array it resolved a
// layout from was the one captured on the FIRST render — where every "is it loaded /
// is it live" flag is still false. A conditionally-omitted entry was therefore absent
// when the portal hosts were created, no host was ever made for it, and the card
// NEVER MOUNTED, for anyone, silently. Eight entries across five pages were in that
// shape. The reverse case is just as bad: an entry present at boot that later drops
// out of the array leaves an orphaned item whose card renders nothing — a measured
// 18px empty slot (h=1 × cellHeight 2 + 16px of item-content inset).
//
// The reconciliation and the sync DECISION are pure, so they are executed here. The
// effect that applies the decision talks to GridStack and React portals and is
// covered by the headless render instead. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  visibleWidgets, resolveGridLayout, mergeLayoutItems, planGridSync, widgetW,
} from '../public/newdesign/dashboardLayout.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const GRID = readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8');

// Brace-match a named function out of a source file, so what runs below is the
// SHIPPING body rather than a copy of it.
function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('no function ' + name);
  // ⚠ START AT THE BODY BRACE, NOT THE FIRST ONE. `function DashGrid({ role, … })`
  // opens a brace in its PARAMETER LIST, so a naive scan matches the destructuring
  // and returns a signature fragment — which then fails to parse, or worse, silently
  // hands an assertion a body it never looked inside.
  let depth = 0;
  for (let j = src.indexOf('{', src.indexOf(')', at)); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced braces around ' + name);
}

// ── the filter ───────────────────────────────────────────────────────────────
test('a widget declaring empty is skipped; everything else is kept', () => {
  const ws = [
    { key: 'a', size: 'full' },
    { key: 'b', size: 'half', empty: true },
    { key: 'c', size: 'half', empty: false },
    null,
  ];
  assert.deepEqual(visibleWidgets(ws).map((w) => w.key), ['a', 'c']);
  // ⚠ A null entry is tolerated rather than thrown on: `.filter(Boolean)` still sits
  // at the end of every widget array, and a re-introduced conditional must degrade,
  // not crash the page.
  assert.deepEqual(visibleWidgets(null), []);
});

test('an empty widget gets no placement', () => {
  const ws = [{ key: 'a', size: 'full' }, { key: 'b', size: 'half', empty: true }];
  const r = resolveGridLayout(null, ws);
  assert.deepEqual(r.visible.map((v) => v.key), ['a']);
  // …and a saved position for it is not resurrected as an item either
  const saved = { items: [{ id: 'b', x: 0, y: 9, w: 6, h: 4 }], hidden: [] };
  assert.deepEqual(resolveGridLayout(saved, ws).visible.map((v) => v.key), ['a']);
});

// ── the two filters are different sets, on purpose ───────────────────────────
test('hiding a card survives the card being empty; hiding a REMOVED card does not', () => {
  // ⚠ THE PREFERENCE IS ABOUT THE CATALOGUE, NOT ABOUT TODAY'S DATA. Filtering
  // `hidden` against the VISIBLE keys means an empty spell drops the key, the next
  // write persists `hidden: []`, and the member's hide is silently forgotten — the
  // card returns unhidden when their data does.
  const ws = [{ key: 'a', size: 'full' }, { key: 'b', size: 'half', empty: true }];
  const saved = { items: [], hidden: ['b', 'gone'] };
  const r = resolveGridLayout(saved, ws);
  assert.deepEqual(r.hidden, ['b'], 'an empty widget lost its hide, or a stale key kept one');
  assert.ok(!r.visible.some((v) => v.key === 'b'));
});

test('a hidden key is not placed even once it has something to show', () => {
  const ws = [{ key: 'a', size: 'full' }, { key: 'b', size: 'half' }];
  const r = resolveGridLayout({ items: [], hidden: ['b'] }, ws);
  assert.deepEqual(r.visible.map((v) => v.key), ['a']);
  assert.deepEqual(r.hidden, ['b']);
});

// ── what gets written back ───────────────────────────────────────────────────
test('a placement is kept for a declared card that has no item right now', () => {
  // ⚠ `grid.save()` only reports items that EXIST. Writing it verbatim deletes the
  // member's placement for every card that happens to be empty at that moment, and
  // the card then returns auto-positioned at the bottom instead of where they left it.
  const live = [{ id: 'a', x: 0, y: 0, w: 12, h: 5 }];
  const saved = { items: [{ id: 'a', x: 0, y: 0, w: 12, h: 3 }, { id: 'b', x: 6, y: 5, w: 6, h: 4 }] };
  const out = mergeLayoutItems(live, saved, ['a', 'b']);
  assert.deepEqual(out, [
    { id: 'a', x: 0, y: 0, w: 12, h: 5 },       // live wins over the stale saved copy
    { id: 'b', x: 6, y: 5, w: 6, h: 4 },        // carried forward
  ]);
});

test('a placement for a card the tab no longer declares is dropped', () => {
  // …so the document stays bounded by the widget catalogue rather than growing forever.
  const out = mergeLayoutItems([], { items: [{ id: 'retired', x: 0, y: 0, w: 6, h: 2 }] }, ['a']);
  assert.deepEqual(out, []);
});

test('duplicate ids collapse to the first', () => {
  const out = mergeLayoutItems(
    [{ id: 'a', x: 1 }, { id: 'a', x: 9 }],
    { items: [{ id: 'a', x: 5 }] }, ['a'],
  );
  assert.deepEqual(out, [{ id: 'a', x: 1 }]);
});

// ── the sync decision ────────────────────────────────────────────────────────
const P = (o) => planGridSync({ currentKeys: [], widgets: [], hidden: [], saved: null, lastPos: null, ...o });

test('a card that fills after the fetch is ADDED — the whole point of the fix', () => {
  const r = P({ currentKeys: ['a'], widgets: [{ key: 'a', size: 'full' }, { key: 'b', size: 'half' }] });
  assert.deepEqual(r.gone, []);
  assert.deepEqual(r.fresh.map((f) => f.key), ['b']);
  assert.deepEqual(r.fresh[0].spec, { key: 'b', w: 6, autoPosition: true });
});

test('a card that empties is REMOVED, so no empty slot is left behind', () => {
  const r = P({ currentKeys: ['a', 'b'], widgets: [{ key: 'a', size: 'full' }, { key: 'b', size: 'half', empty: true }] });
  assert.deepEqual(r.gone, ['b']);
  assert.deepEqual(r.fresh, []);
});

test('a card dropped from the array entirely is removed too', () => {
  // The clientScore `momentum` shape: present at boot (its demo value), absent once
  // the fetch reports a member who has none.
  const r = P({ currentKeys: ['a', 'momentum'], widgets: [{ key: 'a', size: 'full' }] });
  assert.deepEqual(r.gone, ['momentum']);
});

test('a steady array asks for no work at all', () => {
  const ws = [{ key: 'a', size: 'full' }, { key: 'b', size: 'half' }];
  const r = P({ currentKeys: ['a', 'b'], widgets: ws });
  assert.deepEqual(r.gone, []);
  assert.deepEqual(r.fresh, []);
});

test('a hidden card is never added, however non-empty it becomes', () => {
  const r = P({ currentKeys: [], widgets: [{ key: 'a', size: 'full' }], hidden: ['a'] });
  assert.deepEqual(r.fresh, []);
});

test('a returning card lands where it was, not at the bottom', () => {
  const ws = [{ key: 'b', size: 'half' }];
  const saved = { items: [{ id: 'b', x: 0, y: 0, w: 6, h: 2 }] };
  const lastPos = { b: { id: 'b', x: 6, y: 12, w: 6, h: 7 } };
  // saved alone
  assert.deepEqual(P({ widgets: ws, saved }).fresh[0].spec, { key: 'b', x: 0, y: 0, w: 6, h: 2 });
  // ⚠ the in-session position WINS: preferring the document would undo a move the
  // member made after the page loaded.
  assert.deepEqual(P({ widgets: ws, saved, lastPos }).fresh[0].spec, { key: 'b', x: 6, y: 12, w: 6, h: 7 });
});

test('a remembered width of zero does not fall back to the size default', () => {
  // `si.w || widgetW(size)` is the fallback for a saved row with no width; a real 0
  // is not a width GridStack can use, so the || is correct here and pinned so a
  // "?? is safer" rewrite has to think about it.
  assert.deepEqual(P({ widgets: [{ key: 'b', size: 'half' }], lastPos: { b: { x: 1, y: 2, h: 3 } } }).fresh[0].spec,
    { key: 'b', x: 1, y: 2, w: 6, h: 3 });
  assert.equal(widgetW('full'), 12);
});

// ── the mirror ───────────────────────────────────────────────────────────────
test('dashGrid.jsx behaves identically to dashboardLayout.mjs', () => {
  // ⚠ dashGrid.jsx inlines these helpers because it is a raw-babel browser module
  // and cannot import. The file's own header says "keep the two identical" — this
  // DRIVES both over the same fixtures rather than diffing their text, so an
  // equivalent rewrite passes and a behavioural drift fails.
  const dg = new Function(
    ['dgWidgetW', 'dgVisibleWidgets', 'dgResolveGridLayout', 'dgMergeLayoutItems', 'dgPlanGridSync']
      .map((n) => fn(GRID, n)).join('\n') +
    '\nreturn { dgWidgetW, dgVisibleWidgets, dgResolveGridLayout, dgMergeLayoutItems, dgPlanGridSync };',
  )();
  const ws = [
    { key: 'a', size: 'full' },
    { key: 'b', size: 'half', empty: true },
    { key: 'c', size: 'half' },
  ];
  const saved = { items: [{ id: 'c', x: 6, y: 0, w: 6, h: 4 }, { id: 'b', x: 0, y: 0, w: 6, h: 3 }, { id: 'x', x: 0, y: 9, w: 6, h: 2 }], hidden: ['b', 'x'] };
  assert.deepEqual(dg.dgVisibleWidgets(ws), visibleWidgets(ws));
  assert.deepEqual(dg.dgResolveGridLayout(saved, ws), resolveGridLayout(saved, ws));
  assert.deepEqual(dg.dgResolveGridLayout(null, ws), resolveGridLayout(null, ws));
  assert.deepEqual(dg.dgMergeLayoutItems([{ id: 'a', x: 0 }], saved, ['a', 'b', 'c']),
    mergeLayoutItems([{ id: 'a', x: 0 }], saved, ['a', 'b', 'c']));
  const plan = { currentKeys: ['a', 'b'], widgets: ws, hidden: [], saved, lastPos: { c: { x: 1, y: 1, w: 6, h: 9 } } };
  assert.deepEqual(dg.dgPlanGridSync(plan), planGridSync(plan));
  assert.equal(dg.dgWidgetW('half'), widgetW('half'));
});

// ── the wiring the pure functions cannot see ─────────────────────────────────
test('the grid handlers read the CURRENT hidden list, not the one they were born with', () => {
  // ⚠ MEASURED DATA LOSS. `persistFromGrid` is wired into GridStack's change/dragstop
  // handlers inside the boot effect (deps [role, tab]), so it held render 1's `hidden`
  // — an empty array — for the life of the page. Hide a card, then drag ANY card, and
  // the write that followed said `hidden: []`: the hide was discarded on the member's
  // next interaction. Asserted on the invariant (the handler reaches for the ref)
  // rather than on the spelling of the call.
  const body = fn(stripComments(GRID), 'DashGrid');
  const at = body.indexOf('const persistFromGrid');
  assert.ok(at > 0, 'persistFromGrid moved');
  const handler = body.slice(at, body.indexOf('\n  };', at));
  assert.match(handler, /hiddenRef\.current/, 'the handler resolves hidden from render scope');
  assert.ok(!/\bhidden\b(?!Ref)/.test(handler.replace(/hidden:\s*hiddenRef\.current/g, '')),
    'a render-scope `hidden` is still read inside the boot-wired handler');
  // and the ref is kept in step on every render, not only inside an effect
  assert.match(body, /hiddenRef\.current = hidden;/);
});

test('restoring a hidden card that has nothing to show is refused', () => {
  // Otherwise the "+ Your why" chip re-creates exactly the empty item this change
  // removes. The chip is not rendered for an empty widget either — belt and braces,
  // because the two live in different places and only one of them is a button.
  const body = fn(stripComments(GRID), 'DashGrid');
  const at = body.indexOf('const restore =');
  const restore = body.slice(at, body.indexOf('\n  };', at));
  assert.match(restore, /w\.empty/, 'restore() will re-add an empty widget');
  // ⚠ AND THE BAR'S VISIBILITY AND ITS CONTENTS MUST COME FROM THE SAME LIST. An
  // earlier form of this assertion matched the expression wherever it appeared, and
  // there were two copies — so a regression that unfiltered the `.length` check while
  // leaving the `.map` alone SURVIVED the mutation round: the bar rendered its
  // "Hidden ·" label over no chips at all. Pinned on the single name instead.
  assert.match(body, /const hiddenChips = hidden\.filter\(\(k\) => byKey\[k\] && !byKey\[k\]\.empty\)/,
    'the chip list is not derived from the widgets that have something to show');
  assert.match(body, /\{hiddenChips\.map\(/, 'the chips come from a different list than the filter');
  // ⚠ AND THE BAR ITSELF STAYS ON `hidden`, BECAUSE IT CARRIES THE RESET LINK.
  // Gating the whole bar on the chips took `Reset layout` away with them: a member
  // whose only hidden card happened to be empty — a failed fetch is enough — had a
  // dashboard they could not reset and nothing on screen explaining why.
  assert.match(body, /\{hidden\.length > 0 && \(/, 'the bar no longer renders for an all-empty hidden list');
  const bar = body.slice(body.indexOf('{hidden.length > 0 && ('));
  assert.match(bar.slice(0, 600), /\{hiddenChips\.length > 0 && \(/, 'the "Hidden ·" label renders over no chips');
  assert.match(bar, /Reset layout/, 'the reset link left the bar');
});

// ── the class, closed forward ────────────────────────────────────────────────
test('no DashGrid page registers a widget conditionally, anywhere', () => {
  // ⚠ THE GUARD THAT MATTERS MOST, because it is the only one that catches the
  // NEXT one. Eight entries across five files were written `flag ? { key, … } : null`
  // and every one of them was a card that never mounted or an empty slot left
  // behind; converting the eight fixes today's pages and nothing else. Parsed
  // rather than grepped: the shape is an array element, and a regex over source
  // cannot tell one from a ternary inside a style prop.
  const require_ = createRequire(import.meta.url);
  const babel = require_('next/dist/compiled/babel/core');
  const presetReact = require_('next/dist/compiled/babel/preset-react');
  const dir = new URL('../public/newdesign/', import.meta.url);
  const isWidgetObj = (n) => n && n.type === 'ObjectExpression' &&
    ['key', 'render'].every((want) => n.properties.some((p) =>
      p.type === 'ObjectProperty' && p.key && (p.key.name || p.key.value) === want));
  const found = [];
  const walk = (node, file) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walk(n, file); return; }
    if (node.type === 'ArrayExpression') {
      for (const el of node.elements) {
        if (!el) continue;
        const bad = (el.type === 'ConditionalExpression' && (isWidgetObj(el.consequent) || isWidgetObj(el.alternate)))
          || (el.type === 'LogicalExpression' && isWidgetObj(el.right));
        if (bad) found.push(`${file}:${el.loc.start.line}`);
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      walk(node[k], file);
    }
  };
  let scanned = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsx'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    if (!/<DashGrid/.test(src)) continue;
    scanned++;
    walk(babel.parseSync(src, { presets: [presetReact], babelrc: false, configFile: false, filename: f }).program, f);
  }
  // ⚠ A SWEEP THAT SCANNED NOTHING PASSES. The `<DashGrid` filter is a string match
  // on source, so a rename would silently empty the corpus and leave this green.
  assert.ok(scanned >= 10, `only ${scanned} DashGrid pages were scanned — the corpus filter has gone stale`);
  assert.deepEqual(found, [], 'a widget is registered conditionally: it will never mount, or leave an empty slot');
});

// ── what the review round found ──────────────────────────────────────────────
test('chrome() refuses an empty widget, because the effect that removes it runs later', () => {
  // ⚠ WITHOUT THIS THE `empty` CONTRACT IS A CRASH, NOT A LAYOUT FIX. The item is
  // torn down by an effect, which runs AFTER the commit — so on the frame where a
  // widget flips to empty its host still exists and the portal still renders. The old
  // `cond ? {…} : null` shape was safe here by accident: `byKey[key]` was undefined
  // and the `!w` guard caught it. An `empty` entry is still in `byKey`, so `render()`
  // would be called on exactly the state it was declared empty for — and the real
  // bodies dereference it (`momentum.value`, `tonight.day.workout`), throwing during
  // render with no error boundary anywhere in public/newdesign.
  const body = fn(stripComments(GRID), 'DashGrid');
  const at = body.indexOf('const chrome =');
  const chrome = body.slice(at, body.indexOf('\n  };', at));
  assert.match(chrome, /if \(!w \|\| w\.empty\) return null;/,
    'chrome() calls render() for a widget that declared it has nothing to show');
  assert.ok(chrome.indexOf('w.render()') > chrome.indexOf('w.empty'),
    'the guard is not ahead of the call it guards');
});

test('the hidden list is in the ref BEFORE the grid mutation that fires change', () => {
  // ⚠ GridStack fires `change` SYNCHRONOUSLY out of removeWidget/addWidget when it is
  // not batching, and out of commit() when it is — and that lands in persistFromGrid,
  // which reads the ref. Assigning it afterwards made each of these flows issue two
  // back-to-back upserts, the first carrying the stale list; the document was correct
  // only if the network preserved the order of two independent writes.
  const body = fn(stripComments(GRID), 'DashGrid');
  for (const [name, mutation] of [['hide', 'removeWidget'], ['restore', 'addOne('], ['reset', 'removeAll']]) {
    const at = body.indexOf('const ' + name + ' =');
    assert.ok(at > 0, name + '() moved');
    const src = body.slice(at, body.indexOf('\n  };', at));
    const ref = src.indexOf('hiddenRef.current =');
    const mut = src.indexOf(mutation);
    assert.ok(ref > 0 && mut > 0, name + '(): expected both a ref write and a ' + mutation);
    assert.ok(ref < mut, name + '() mutates the grid before the ref is current');
  }
});

test('a collapsed one-column grid is never remembered as a placement', () => {
  // ⚠ Below 768px GridStack clamps every node to x:0/w:1. Remembering that brings the
  // card back one twelfth of a row wide when the window widens — and planGridSync
  // prefers the remembered position over the saved one, so it would win.
  // persistFromGrid refuses to WRITE the collapsed layout for the same reason.
  const body = fn(stripComments(GRID), 'DashGrid');
  const at = body.indexOf('lastPosRef.current[key] =');
  assert.ok(at > 0, 'the capture moved');
  const around = body.slice(Math.max(0, at - 400), at + 120);
  assert.match(around, /getColumn/, 'the capture does not check the column count');
  assert.match(around, /cols === 12/, 'the capture is not restricted to the 12-column grid');
});

test('restore() places a card the same way the sync effect does', () => {
  // Two paths deciding where a returning card goes is one too many: restore() used to
  // always auto-position, so a card the member had dragged to the top came back at the
  // bottom — while dgMergeLayoutItems was busy preserving the exact x/y it ignored.
  const body = fn(stripComments(GRID), 'DashGrid');
  const at = body.indexOf('const restore =');
  const restore = body.slice(at, body.indexOf('\n  };', at));
  assert.match(restore, /dgPlanGridSync\(/, 'restore() decides placement on its own again');
});

test('each mirrored helper carries the comment that describes IT', () => {
  // dashGrid.jsx inlines these because it cannot import; its own header says "keep the
  // two identical". An insertion put the merge rationale above planGridSync, so the
  // file documented the wrong function — and the next reader editing planGridSync would
  // have read a rationale about carrying forward saved placements it does not implement.
  const before = (name) => GRID.slice(Math.max(0, GRID.indexOf('function ' + name + '(') - 700), GRID.indexOf('function ' + name + '('));
  assert.match(before('dgMergeLayoutItems'), /A SAVED ARRANGEMENT IS PER DECLARED WIDGET/);
  assert.match(before('dgPlanGridSync'), /What the grid must ADD and REMOVE/);
  assert.ok(!/A SAVED ARRANGEMENT IS PER DECLARED WIDGET/.test(before('dgPlanGridSync')));
});
