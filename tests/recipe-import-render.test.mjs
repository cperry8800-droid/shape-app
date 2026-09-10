// The two RENDER-PATH facts the recipe import depends on, mounted rather than
// grepped, plus the hook-order rule that makes one of them reachable at all.
//
// ⚠ WHY THIS FILE EXISTS. Both defects it pins are invisible to every other
// gate in this repo: the mobile build compiles a Rules-of-Hooks violation
// happily, and a fabricated `0` is valid JSX. Only mounting the real component
// and reading what it renders says anything about either.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { drive, loadBroadsheet, pressable, SRC } from './helpers/broadsheet-mount.mjs';

const babelParser = createRequire(SRC)('@babel/parser');
const MOD = await loadBroadsheet(['BSMealLogged']);

// ── the plated stage ───────────────────────────────────────────────────────

test('a cook with KNOWN macros still files and says so', () => {
  const ed = drive(MOD.BSMealLogged, { kcal: 640, p: 48, time: '' });
  assert.match(ed.text, /640/);
  assert.match(ed.text, /Logged ✓/);
  assert.match(ed.text, /Filed/);
});

test('⚠ a cook with UNKNOWN macros shows a dash, not a 46px zero under "Logged ✓"', () => {
  // logIt posts NOTHING when kcal is null ("absent macros are omitted, never
  // posted as fabricated 0s"), so a `0` here is a number no ledger received.
  // Member-imported recipes carry no macros by construction, which is what made
  // this state reachable.
  const ed = drive(MOD.BSMealLogged, { kcal: null, p: null, time: '' });
  assert.doesNotMatch(ed.text, /Logged ✓/);
  assert.match(ed.text, /No macros on this one/);
  assert.match(ed.text, /Cooked/);
  assert.doesNotMatch(ed.text, /Filed/);
  // The big figure is a dash. Asserting the ABSENCE of "0" alone would pass on a
  // blank screen, so the dash is asserted positively as well.
  assert.match(ed.text, /—/);
  assert.equal(/(^|[^0-9])0([^0-9]|$)/.test(ed.text.replace(/rgba?\([^)]*\)/g, '')), false, ed.text.slice(0, 300));
});

test('an omitted kcal is unknown, not zero — the default carries the same rule', () => {
  const ed = drive(MOD.BSMealLogged, { p: 30, time: '' });
  assert.doesNotMatch(ed.text, /Logged ✓/);
});

// ── the hook-order rule ────────────────────────────────────────────────────
//
// ⚠ THE MOUNT HARNESS CANNOT CATCH THIS ONE. Its useState shim indexes into a
// cell array and never checks the count, so a component that returns early
// above its own hooks renders fine here and throws only in React ("rendered
// fewer hooks than expected"). So the rule is read off the AST instead — which
// also covers every component in the module rather than the one being changed.

const isHookName = (n) => typeof n === 'string' && /^use[A-Z]/.test(n);
const FN = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration', 'ObjectMethod', 'ClassMethod']);

// Walk `node`, skipping the bodies of nested functions — a return or a hook
// inside a callback belongs to that callback, not to the component.
function walkOwn(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const c of node) walkOwn(c, visit); return; }
  if (typeof node.type !== 'string') return;
  if (FN.has(node.type)) return;
  if (visit(node) === false) return;
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
    walkOwn(node[k], visit);
  }
}

const returnsOwn = (st) => { let f = false; walkOwn(st, (n) => { if (n.type === 'ReturnStatement') f = true; }); return f; };
const hooksOwn = (st) => {
  const names = [];
  walkOwn(st, (n) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type === 'Identifier' && isHookName(c.name)) names.push(c.name);
    else if (c.type === 'MemberExpression' && c.property && isHookName(c.property.name)) names.push(c.property.name);
  });
  return names;
};

// The rule: once a component body can return, no statement after it may call a
// hook. ⚠ THE EARLY RETURN IS ALMOST NEVER A BARE `return` — it is
// `if (cond) return <X/>`, which is an IfStatement. A detector that only looked
// for a top-level ReturnStatement would report ZERO offenders across this whole
// module and pass vacuously, which is exactly what the first version did.
function scanBody(name, body, out) {
  if (!body || body.type !== 'BlockStatement') return false;
  const idx = body.body.findIndex(returnsOwn);
  // The LAST statement returning is the ordinary shape, not an early return.
  if (idx < 0 || idx === body.body.length - 1) return true;
  const found = [];
  for (const st of body.body.slice(idx + 1)) found.push(...hooksOwn(st));
  if (found.length) out.push(`${name} — ${[...new Set(found)].join(', ')} after an early return`);
  return true;
}

function scanSource(src) {
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const out = [];
  let scanned = 0;
  const walkAll = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const c of node) walkAll(c); return; }
    if (typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' && node.id && /^BS[A-Z]/.test(node.id.name)) { if (scanBody(node.id.name, node.body, out)) scanned += 1; }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && /^BS[A-Z]/.test(node.id.name)
      && node.init && FN.has(node.init.type)) { if (scanBody(node.id.name, node.init.body, out)) scanned += 1; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      walkAll(node[k]);
    }
  };
  walkAll(ast.program.body);
  return { out: out.sort(), scanned };
}

// Components whose body already returns above a hook. ⚠ NOT AN EXEMPTION LIST:
// each is a pre-existing shape this rule was written after, recorded so a NEW
// one fails here. Emptying it is the only direction it may move.
const KNOWN = new Set([]);

test('THE GUARD ITSELF FIRES — an `if (x) return` above a hook is reported', () => {
  // Run BEFORE the real scan, because a detector that reports nothing passes the
  // real assertion vacuously. This is the exact shape BSLibraryDetail shipped in
  // its first draft.
  const { out, scanned } = scanSource([
    'function BSFake({ on }) {',
    '  const [a] = useState(0);',
    '  if (on) return null;',
    '  const [b] = useState(1);',
    '  return a + b;',
    '}',
  ].join('\n'));
  assert.equal(scanned, 1);
  assert.deepEqual(out, ['BSFake — useState after an early return']);
});

test('and it does NOT fire on the ordinary shape', () => {
  // Every hook above the early return is legal, and so is a component whose only
  // return is its last statement — otherwise the rule would report the whole tree.
  const ok = scanSource([
    'function BSFine({ on }) {',
    '  const [a] = useState(0);',
    '  const [b] = useState(1);',
    '  if (on) return null;',
    '  return a + b;',
    '}',
    'function BSPlain() {',
    '  const [a] = useState(0);',
    '  return a;',
    '}',
    'function BSCallback() {',
    '  const [a] = useState(0);',
    '  if (a) return null;',
    '  const f = () => { const [b] = useState(1); return b; };',
    '  return f;',
    '}',
  ].join('\n'));
  assert.deepEqual(ok.out, []);
  assert.equal(ok.scanned, 3);
});

test('no component calls a hook after an early return', () => {
  const { out, scanned } = scanSource(readFileSync(SRC, 'utf8'));
  // Guard-the-guard: a walk that resolved nothing would pass this vacuously.
  assert.ok(scanned > 100, `only ${scanned} component bodies scanned — the walk is broken, not the tree`);
  assert.deepEqual(out.filter((line) => ![...KNOWN].some((k) => line.startsWith(`${k} `))), [],
    'a component returns above its own hooks — React renders fewer hooks on that frame and throws. ' +
    'Move the early return below every hook call (BSLibraryDetail carries the note).');
});

// ── the prep picker's namespace ────────────────────────────────────────────
//
// ⚠ THE HIGHEST-CONSEQUENCE PATH IN THE WHOLE FEATURE, and it is a render path:
// the picker resolved a library pointer by EXACT CATALOG TITLE. A member who
// types "One-pan chicken and rice" — a real Shape Kitchen dish credited to a
// named nutritionist — saw that title under "Your library", and picking it
// cooked the CATALOG's method and macros under their own name. Nothing but a
// mount says anything about it.

const PREP = await loadBroadsheet(['BSPrepSession']);
const KITCHEN = await import('../mobile-app/src/broadsheet/shapeKitchenData.js');
const { bsRecipePointer } = await import('../mobile-app/src/services/clientRecipes.mjs');

// A catalog dish with a method of its own, so "whose steps rendered?" is answerable.
const COLLIDE = KITCHEN.SHAPE_KITCHEN_RECIPES.find((r) => (r.steps || []).length >= 2 && r.by);

const MINE = {
  id: 'uuid-mine-1',
  title: COLLIDE.title,                       // the collision, deliberately
  ingredients: [{ n: '1', m: 'jar of my grandmother\'s harissa' }, { n: '2', m: 'flatbreads' }],
  steps: ['Warm the harissa in a small pan.', 'Char the flatbreads and spoon it over.'],
  createdAt: 1, updatedAt: 2,
};

function withMemberLibrary(fn) {
  const w = globalThis.window;
  const prevLs = w.localStorage;
  const prevAuth = w.ShapeAuth;
  const map = new Map([
    ['shape.library', JSON.stringify([{ ...bsRecipePointer(MINE), savedAt: 2 }])],
    ['shape.recipes.u1', JSON.stringify({ v: 1, items: { [MINE.id]: MINE } })],
  ]);
  w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  try { return fn(); } finally { w.localStorage = prevLs; w.ShapeAuth = prevAuth; }
}

test('⚠ a member recipe titled like a catalog dish cooks THEIR method, not the catalog\'s', () => {
  withMemberLibrary(() => {
    const s = drive(PREP.BSPrepSession, { program: [], onClose() {} });
    // It is offered — a member who cannot see their own recipe in the picker is
    // the other half of the same defect (before the fix, a pointer with no
    // catalog twin was dropped outright).
    assert.match(s.text, new RegExp(COLLIDE.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    s.click(COLLIDE.title, pressable);
    s.click('Merge the mise');
    // THEIR ingredients are on the board.
    assert.match(s.text, /grandmother/i);
    assert.match(s.text, /flatbreads/i);
    // ⚠ AND THE CATALOG'S ARE NOT. The catalog dish of this title has its own
    // ingredient list; if the pointer had resolved against the catalog, those
    // are the rows the member would be shopping from.
    const catalogOnly = (COLLIDE.ingredients || [])
      .map((g) => String((g && g.m) || g || '').trim())
      .filter((m) => m && !/harissa|flatbread/i.test(m));
    assert.ok(catalogOnly.length >= 2, 'the fixture recipe has too few ingredients to discriminate');
    for (const m of catalogOnly) {
      assert.doesNotMatch(s.text, new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        `the CATALOG ingredient ${JSON.stringify(m)} reached the board — the pointer resolved against the catalog`);
    }
    // And no coach is credited anywhere on it.
    assert.doesNotMatch(s.text, new RegExp(COLLIDE.by.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
});
