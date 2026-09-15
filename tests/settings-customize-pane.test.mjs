// The customization section moves behind one door, whole.
//
// MEASURED on the shipped build before the move (docs/REVIEW-2026-09-14-settings-page.md
// §1): the Settings root scrolled 2,376 px, and the member's own sections — Account,
// Privacy, Billing, Notifications — began at 1,420 px, BELOW the theme picker, the
// radio toggle, the light-effects picker and the Home ticker editor. Identity first
// and cosmetics last is the Passport's backbone; this is the half of it that does not
// need the new root.
//
// What this pins is that the move LOST NOTHING. Every block that was on the root is
// inside the pane, exactly once, and none of them is still on the root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as babelParser from '@babel/parser';
import { SRC } from './helpers/broadsheet-mount.mjs';

const src = readFileSync(SRC, 'utf8');
const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every control the customization section carries, named by a key only IT renders.
// Keys rather than comments: a comment can be reworded without moving anything.
const SECTION = {
  'the appearance picker': 'settings:appearance.eyebrow',
  'the paper / texture / accent / ink tabs': 'settings:appearance.tabPaper',
  'display weight': 'settings:appearance.displayWeight',
  'text size': 'settings:a11y.eyebrow',
  'shape radio': 'settings:radio.title',
  'the light-effect modes': 'settings:fx.eyebrow',
  'the effect colour row': 'settings:fx.color',
  'the home ticker': 'settings:ticker.title',
};

// ⚠ MATCHED WITH ITS CLOSING QUOTE, because a catalog key is a PREFIX of its own
// siblings: `settings:fx.color` is the first 17 characters of `settings:fx.colorCycle`,
// so a bare substring count reported the effect colour row as duplicated when the
// module holds exactly one of each. A guard that cannot tell a key from its prefix
// is measuring the prefix.
const quoted = (key) => `'${key}'`;

// The span of a `{detail === '<name>' && …}` block, taken from the AST so a
// reflow, a reindent or a reworded comment cannot move it.
function paneSpan(name) {
  let span = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'LogicalExpression' && n.operator === '&&'
        && n.left.type === 'BinaryExpression' && n.left.operator === '==='
        && n.left.left.type === 'Identifier' && n.left.left.name === 'detail'
        && n.left.right.value === name) {
      if (!span || (n.end - n.start) > (span[1] - span[0])) span = [n.start, n.end];
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return span;
}

test('the whole customization section sits behind the Customize door', () => {
  const span = paneSpan('customize');
  assert.ok(span, "there is no `detail === 'customize'` pane — the door leads nowhere");
  const pane = src.slice(span[0], span[1]);
  // Big enough to be the real section rather than a stub that renders a heading.
  assert.ok(pane.length > 8000, `the customize pane is only ${pane.length} chars — the section did not move into it`);
  for (const [what, key] of Object.entries(SECTION)) {
    assert.ok(pane.includes(quoted(key)), `${what} is not inside the Customize pane (${key})`);
  }
});

test('and nothing it carries was left on the root, or duplicated on the way', () => {
  const span = paneSpan('customize');
  const before = src.slice(0, span[0]);
  const after = src.slice(span[1]);
  for (const [what, key] of Object.entries(SECTION)) {
    // Exactly one render site in the whole module: not left behind, not copied.
    const total = src.split(quoted(key)).length - 1;
    assert.equal(total, 1, `${key} is referenced ${total} times — the move duplicated ${what}`);
    assert.ok(!before.includes(quoted(key)) && !after.includes(quoted(key)), `${what} still renders outside the pane`);
  }
});

test('the pane ends where it should, so the root keeps its own furniture', () => {
  // ⚠ THIS CHANGE IS TWO FRAGMENT BOUNDARIES, AND GETTING THE SECOND ONE WRONG IS
  // SILENT: the customization span closes the root's `{!detail && (<>` and reopens
  // it after the ticker. Drop the reopen and the hub cards and Sign out fall INSIDE
  // the Customize pane — the page still renders, the section still moved, and every
  // assertion above still passes. Mutation-proven: removing that boundary survived
  // the first round.
  const span = paneSpan('customize');
  const pane = src.slice(span[0], span[1]);
  for (const [what, key] of [['the hub cards', 'settings:more.sectionsMeta'], ['sign out', 'settings:action.signOut']]) {
    assert.ok(!pane.includes(quoted(key)), `${what} ended up inside the Customize pane — the root's fragment never reopened`);
  }
});

test('the door exists for both roles and routes to the pane', () => {
  // `settingCards` is a role ternary; both arms must carry the door, or a coach
  // loses every cosmetic control the move took off their root.
  const cards = src.slice(src.indexOf('const settingCards = isCoachRole ?'));
  const body = cards.slice(0, cards.indexOf('\n  ];') + 5);
  const doors = body.split("detail: 'customize'").length - 1;
  assert.equal(doors, 2, `the Customize card appears in ${doors} of the two role lists`);
  assert.equal(body.split('cardCustomizeSummary').length - 1, 2, 'both doors must state what is behind them');
  // The summary is composed from the SAME expressions the pane's own headers use,
  // so the card and the pane cannot come to disagree about the current theme.
  const summary = src.slice(src.indexOf('const cardCustomizeSummary'), src.indexOf('const cardCustomizeSummary') + 700);
  for (const piece of ['tweaks.paperMode', 'tweaks.accentKey', 'tweaks.textScaleKey']) {
    assert.ok(summary.includes(piece), `the door's summary does not read ${piece}`);
  }
});

test('the picker opens with the pane, because the pane is named after it', () => {
  assert.match(src, /const \[showAppearance, setShowAppearance\] = useStateBSC\(true\)/,
    'a collapsed picker inside a page called Customize is a page whose body is a button saying Customize');
});

test('every pane that hides the root is still reset when Settings is re-opened', () => {
  // The module documents this invariant: a flag with an early return must be reset
  // by the shape:openProfile handler, or re-opening Settings lands on a stale pane.
  // `detail` covers the new door, so this asserts the reset survived the move rather
  // than assuming it — the customize pane is a `detail` value, not a new flag.
  const reset = src.slice(src.indexOf('const toRoot = () => {'), src.indexOf('const toRoot = () => {') + 900);
  assert.match(reset, /setDetail\(''\)/, 'the drill-in pane must be reset, or Customize re-opens over the root');
});
