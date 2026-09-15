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
import { stripComments } from './helpers/strip-comments.mjs';

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
  // Both arms of the role ternary must carry the door, or a coach loses every
  // cosmetic control the move took off their root.
  // ⚠ RE-ANCHORED WHEN THE PASSPORT RETIRED `settingCards`. This pinned that name,
  // so replacing thirteen hub cards with six tiles failed a test about the Customize
  // door — which had not moved. The list is found by the SHAPE the invariant needs
  // (a role ternary of settings doors) rather than by whatever it is called this
  // month; a guard that pins a spelling pins whatever that spelling is wrong about.
  const decl = src.match(/const (passportTiles|settingCards) = isCoachRole \?/);
  assert.ok(decl, 'there is no role-split list of settings doors any more');
  const cards = src.slice(src.indexOf(decl[0]));
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

// ── THE PANE OPENS AT ITS TOP ────────────────────────────────────────────────
// The span of `function BSSettings`, so every assertion below is about that
// component rather than about the 35k-line module around it.
function settingsNode() {
  let found = null;
  (function walk(n) {
    if (!n || typeof n !== 'object' || found) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'BSSettings') { found = n; return; }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(ast.program);
  return found;
}

// Every `React.useLayoutEffect(fn, deps)` inside a node, with its dep identifiers.
function layoutEffects(root) {
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
        && n.callee.object.name === 'React' && n.callee.property.name === 'useLayoutEffect') {
      const deps = n.arguments[1] && n.arguments[1].type === 'ArrayExpression'
        ? n.arguments[1].elements.map(e => (e && e.type === 'Identifier') ? e.name : null)
        : null;
      out.push({ node: n, deps });
    }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(root);
  return out;
}

test('a drill-in pane opens at its top, whatever the member had scrolled', () => {
  // ⚠ REACHABLE ONLY BECAUSE OF THIS PANE, which is why it is this PR's to fix.
  // BSPage keeps ONE `.bs-scroll` across every value of `detail` and never resets it
  // when its children change — the browser behaviour `_bsScrollTopOnMount` exists for.
  // A browser only clamps scrollTop when the NEW tree is SHORTER, so every pane that
  // shipped before this one (Account is six rows, well under a viewport) corrected
  // itself at 0 and nobody could see the defect. Customize is 355 lines: it keeps
  // whatever the root was scrolled to and opens with its own DetailBack and tab bar
  // already above the viewport.
  const fn = settingsNode();
  assert.ok(fn, 'BSSettings is not a function declaration any more — this whole file is measuring nothing');
  const eff = layoutEffects(fn).find(e => e.deps && e.deps.length === 1 && e.deps[0] === 'detail');
  assert.ok(eff, 'no layout effect keyed on `detail` — a pane opens wherever the root happened to be scrolled');
  const body = src.slice(eff.node.start, eff.node.end);
  assert.match(body, /scrollTop\s*=\s*0/, 'the effect keyed on `detail` does not reset the scroller');
  // ⚠ BOTH DIRECTIONS, and the dep array is what says so: keyed on `detail` it runs
  // on the way into a pane AND on the way back to the root. Backing out of a short
  // pane already landed at 0 (the browser had clamped it), so this makes today's
  // behaviour deterministic rather than changing it.
});

test('and it finds ITS OWN scroller by walking up, never the first one in the document', () => {
  // ⚠ THE WRONG-LAYER TRAP, MEASURED ONCE ALREADY. `.bs-scroll` marks MANY scrollers
  // — the chrome's own comment says so, rails included — and Settings renders as an
  // overlay ABOVE a still-mounted tab tree, so `document.querySelector('.bs-scroll')`
  // can return the page underneath. The 2026-09-14 settings review paid for this with
  // a harness that reported on Home while the screenshots showed Settings.
  const fn = settingsNode();
  const eff = layoutEffects(fn).find(e => e.deps && e.deps.length === 1 && e.deps[0] === 'detail');
  const body = src.slice(eff.node.start, eff.node.end);
  assert.match(body, /\.closest\(\s*'\.bs-scroll'\s*\)/, 'the scroller is not resolved by walking up from our own tree');
  // ⚠ COMMENTS STRIPPED, AND THIS GUARD CAUGHT ITSELF ON ITS FIRST RUN. The
  // rationale above the effect names `document.querySelector('.bs-scroll')` in order
  // to say we must NOT use it, and a raw scan read that sentence as the defect — a
  // ban on a phrase failing the correct wording that explains the ban. The shared
  // stripper, never a local one: this repo has post-mortemed four copies of a
  // home-rolled stripper that deleted the source it was asserting over.
  const settings = stripComments(src.slice(fn.start, fn.end));
  assert.ok(!/document\.querySelector\(\s*['"]\.bs-scroll/.test(settings),
    'BSSettings reaches for the first .bs-scroll in the document — that can be the page underneath');
  // Guard-the-guard: the stripper must not have eaten the code this file asserts over.
  assert.ok(settings.includes("closest('.bs-scroll')"),
    'the stripper removed the effect itself — this assertion is measuring nothing');
});

test('and the ref it walks up from is attached INSIDE the scroller', () => {
  // ⚠ THE SILENT HALF. Attach that ref to a node outside BSPage and `closest` finds
  // nothing, the reset never runs, and every assertion above still passes — the fix
  // becomes a no-op that reads as shipped. The ref NAME is derived from the effect
  // rather than typed here, so a rename fails for the right reason or not at all.
  const fn = settingsNode();
  const eff = layoutEffects(fn).find(e => e.deps && e.deps.length === 1 && e.deps[0] === 'detail');
  const body = src.slice(eff.node.start, eff.node.end);
  const m = body.match(/([A-Za-z_$][\w$]*)\.current/);
  assert.ok(m, 'the effect reads no ref — it cannot know which scroller is ours');
  const refName = m[1];

  let page = null;
  (function walk(n) {
    if (!n || typeof n !== 'object' || page) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'JSXElement' && n.openingElement.name.type === 'JSXIdentifier'
        && n.openingElement.name.name === 'BSPage') { page = n; return; }
    for (const k of Object.keys(n)) if (k !== 'loc') walk(n[k]);
  })(fn.body);
  assert.ok(page, 'BSSettings no longer renders a BSPage — there is no scroller to reset');
  const inside = src.slice(page.start, page.end);
  assert.ok(inside.includes(`ref={${refName}}`),
    `${refName} is not attached to any element inside <BSPage> — closest() finds nothing and the reset never runs`);
});
