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
import { drive, loadBroadsheet, pressable, textOf, SRC, ROOT } from './helpers/broadsheet-mount.mjs';
import { join } from 'node:path';

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

test('⚠ a member recipe survives a title collision with a PROGRAM meal', () => {
  // The title dedupe has no authority over a member recipe — it is identified by
  // its uuid. Running the dedupe first dropped the member's dish whenever their
  // arbitrary title matched something already in the picker, which is the
  // collision case the namespace branch exists for, lost from the other side.
  withMemberLibrary(() => {
    const program = [{ meals: [{ id: 'm1', slot: 'Lunch', title: COLLIDE.title, kcal: 600, p: 45, c: 55, f: 18 }] }];
    const s = drive(PREP.BSPrepSession, { program, onClose() {} });
    const rows = s.nodes().filter((n) => n.type === 'button' && pressable(n)
      && textOf(n).trim().toLowerCase().startsWith(COLLIDE.title.toLowerCase()));
    // TWO offers: the program meal and the member's own dish of the same name.
    assert.equal(rows.length, 2, `expected the program meal AND the member recipe, got ${rows.length}`);
    // And the member's is grouped under their library, not silently merged.
    assert.match(s.text, /Your library/);
  });
});

test('a member recipe appears once even if the library holds two pointers to it', () => {
  // Member recipes dedupe on their ID, not on a title anyone can retype.
  const w = globalThis.window;
  const prevLs = w.localStorage;
  const prevAuth = w.ShapeAuth;
  const ptr = bsRecipePointer(MINE);
  const map = new Map([
    ['shape.library', JSON.stringify([{ ...ptr, savedAt: 2 }, { ...ptr, savedAt: 1 }])],
    ['shape.recipes.u1', JSON.stringify({ v: 1, items: { [MINE.id]: MINE } })],
  ]);
  w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: () => {}, removeItem: () => {} };
  w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  try {
    const s = drive(PREP.BSPrepSession, { program: [], onClose() {} });
    const rows = s.nodes().filter((n) => n.type === 'button' && pressable(n)
      && textOf(n).trim().toLowerCase().startsWith(COLLIDE.title.toLowerCase()));
    assert.equal(rows.length, 1);
  } finally { w.localStorage = prevLs; w.ShapeAuth = prevAuth; }
});

// ── the parse call is native-safe ──────────────────────────────────────────
//
// ⚠ On the NATIVE build a root-relative `/api/...` resolves to the WebView's own
// origin, which is not the backend and carries no session cookie. Because this
// caller degrades to its offline structural split, that failure is SILENT: the
// AI reader would never run on iOS or Android and nothing on screen would say
// so. The repo has paid for this exact shape once already (transcribeVoice,
// #1805), which is why it is guarded rather than remembered.

test('⚠ the sheet never fetches the parse route root-relative', () => {
  const src = readFileSync(SRC, 'utf8');
  assert.equal(/fetch\(\s*['"`]\/api\/nutrition\/recipe-parse/.test(src), false,
    'a root-relative fetch to the parse route is unreachable on native');
  assert.match(src, /window\.ShapeRecipeImport/, 'the sheet must go through the backend client');
});

test('the backend parse client sends apiBaseUrl AND the Bearer session', async () => {
  // The shipped function, brace-matched out of shapeBackend.js and DRIVEN — a
  // source scan cannot tell an absolute URL from a relative one at call time.
  const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const at = backend.indexOf('async function parseRecipeText');
  assert.ok(at > 0, 'parseRecipeText is not in shapeBackend.js');
  // ⚠ SKIP THE PARAMETER LIST FIRST. This function's parameters are DESTRUCTURED
  // (`{ signal } = {}`), so a matcher that starts counting at the first `{` after
  // the name opens and closes on the parameters and hands back a 47-character
  // signature — after which every assertion below is vacuously true. The repo
  // has already paid for this exact shape once (`grab()`, #2032). The length
  // assertion is what caught it here, and it stays for the next reader.
  const open = backend.indexOf('(', at);
  let pd = 0, afterParams = -1;
  for (let j = open; j < backend.length; j += 1) {
    if (backend[j] === '(') pd += 1;
    else if (backend[j] === ')') { pd -= 1; if (pd === 0) { afterParams = j + 1; break; } }
  }
  assert.ok(afterParams > open, 'could not find the end of the parameter list');
  const i = backend.indexOf('{', afterParams);
  let depth = 0, end = -1;
  for (let j = i; j < backend.length; j += 1) {
    if (backend[j] === '{') depth += 1;
    else if (backend[j] === '}') { depth -= 1; if (depth === 0) { end = j + 1; break; } }
  }
  assert.ok(end > i, 'could not brace-match the function body');
  const body = backend.slice(at, end);
  assert.ok(body.length > 400, `lifted ${body.length} chars — that is a signature, not a body`);

  const calls = [];
  const make = (res) => new Function('apiBaseUrl', 'sessionsAuthHeaders', 'fetch', `${body}; return parseRecipeText;`)(
    'https://api.example.test',
    (extra = {}) => ({ ...extra, Authorization: 'Bearer tok-123' }),
    async (url, opts) => { calls.push({ url, opts }); return res; },
  );

  const ok = await make({ ok: true, json: async () => ({ draft: { title: 'T', ingredients: [{ n: '1', m: 'egg' }], steps: ['One.'] } }) })('x'.repeat(40));
  assert.equal(ok.ok, true);
  assert.equal(ok.draft.title, 'T');
  assert.equal(calls.length, 1);
  // ⚠ ABSOLUTE, not "/api/...". This is the whole finding.
  assert.ok(calls[0].url.startsWith('https://api.example.test/api/nutrition/recipe-parse'), calls[0].url);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok-123');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(JSON.parse(calls[0].opts.body).text.length, 40);

  // Short text never reaches the provider at all.
  calls.length = 0;
  assert.equal((await make({ ok: true, json: async () => ({}) })('eggs')).reason, 'too_short');
  assert.equal(calls.length, 0);

  // Every failure resolves — it never throws, because the caller's fallback is a
  // real answer rather than an error state.
  assert.equal((await make({ ok: false, json: async () => ({}) })('x'.repeat(40))).ok, false);
  assert.equal((await make({ ok: true, json: async () => ({ draft: null, reason: 'no_key' }) })('x'.repeat(40))).reason, 'no_key');
  const thrower = new Function('apiBaseUrl', 'sessionsAuthHeaders', 'fetch', `${body}; return parseRecipeText;`)(
    '', () => ({}), async () => { throw new Error('offline'); },
  );
  const off = await thrower('x'.repeat(40));
  assert.equal(off.ok, false);
  assert.equal(off.draft, null);
});
