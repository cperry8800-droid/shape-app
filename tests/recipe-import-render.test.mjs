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
  // ⚠ THE ROUND TRIP MOVED INTO A SHARED HELPER AND THIS GUARD HAD TO FOLLOW IT.
  // Both readers were each carrying their own unbounded `fetch`; they share one
  // bounded `bsRecipePost` now, so lifting `parseRecipeText` alone yields a body
  // whose only statement calls a function that is not there. The INVARIANT is
  // untouched — an absolute URL and a Bearer header, driven rather than scanned —
  // so the fix is to lift both, not to weaken what is asserted.
  const liftFn = (name) => {
    let a = backend.indexOf(`function ${name}(`);
    assert.ok(a > 0, `${name} is not in shapeBackend.js`);
    if (backend.slice(Math.max(0, a - 6), a) === 'async ') a -= 6;
    return a;
  };
  const at = liftFn('parseRecipeText');
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
  const textBody = backend.slice(at, end);
  assert.ok(textBody.length > 200, `lifted ${textBody.length} chars — that is a signature, not a body`);

  // The shared round trip, lifted the same way and prepended.
  const pAt = liftFn('bsRecipePost');
  let pDepth = 0, pEnd = -1;
  for (let j = backend.indexOf('{', backend.indexOf(')', pAt)); j < backend.length; j += 1) {
    if (backend[j] === '{') pDepth += 1;
    else if (backend[j] === '}') { pDepth -= 1; if (pDepth === 0) { pEnd = j + 1; break; } }
  }
  assert.ok(pEnd > pAt, 'could not brace-match bsRecipePost');
  const postBody = backend.slice(pAt, pEnd);
  assert.ok(postBody.length > 400, `lifted ${postBody.length} chars of bsRecipePost — a signature, not a body`);
  const body = `${postBody}\n${textBody}`;
  // The deadline is read from the source for the same reason the paste bound is:
  // a retyped copy keeps passing after the real one moves.
  const msM = backend.match(/const BS_RECIPE_REQUEST_MS = ([\d_]+);/);
  assert.ok(msM, 'BS_RECIPE_REQUEST_MS is not declared in shapeBackend.js');
  const REQ_MS = Number(msM[1].replace(/_/g, ''));

  const calls = [];
  // ⚠ The lifted function closes over BS_RECIPE_PASTE_MAX, so it has to be
  // supplied — and it is read out of the SOURCE rather than retyped, or the
  // test would keep passing after the real bound moved.
  const boundM = backend.match(/const BS_RECIPE_PASTE_MAX = (\d+)/);
  assert.ok(boundM, 'BS_RECIPE_PASTE_MAX is not declared in shapeBackend.js');
  const make = (res) => new Function(
    'apiBaseUrl', 'sessionsAuthHeaders', 'fetch', 'BS_RECIPE_PASTE_MAX',
    'BS_RECIPE_REQUEST_MS', 'AbortController', 'setTimeout', 'clearTimeout',
    `${body}; return parseRecipeText;`,
  )(
    'https://api.example.test',
    (extra = {}) => ({ ...extra, Authorization: 'Bearer tok-123' }),
    async (url, opts) => { calls.push({ url, opts }); return res; },
    Number(boundM[1]), REQ_MS, AbortController, setTimeout, clearTimeout,
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
  const thrower = new Function(
    'apiBaseUrl', 'sessionsAuthHeaders', 'fetch', 'BS_RECIPE_PASTE_MAX',
    'BS_RECIPE_REQUEST_MS', 'AbortController', 'setTimeout', 'clearTimeout',
    `${body}; return parseRecipeText;`,
  )(
    '', () => ({}), async () => { throw new Error('offline'); }, Number(boundM[1]),
    REQ_MS, AbortController, setTimeout, clearTimeout,
  );
  const off = await thrower('x'.repeat(40));
  assert.equal(off.ok, false);
  assert.equal(off.draft, null);

  // An over-length paste is refused before it is sent — the route refuses it
  // too, because a client-side bound is a convenience and never the rule.
  calls.length = 0;
  const tooLong = await make({ ok: true, json: async () => ({}) })('x'.repeat(Number(boundM[1]) + 1));
  assert.equal(tooLong.reason, 'too_long');
  assert.equal(calls.length, 0);
});

// ── the delete is gated ────────────────────────────────────────────────────

test('⚠ DELETING A MEMBER RECIPE IS CONFIRMED FIRST, AND THE ORDER IS ASK → BAIL → REMOVE', () => {
  // The body cannot be reconstructed — that is the whole premise for storing it
  // apart from the pointer array — so a single mis-tap destroying it permanently
  // is the one outcome this screen must not allow. bsAskConfirm fails CLOSED
  // when no host is mounted, so the gate cannot be skipped by a race.
  const src = readFileSync(SRC, 'utf8');
  const from = src.indexOf('A member recipe is removed from the DOCUMENT');
  assert.ok(from > 0, 'the delete handler moved — this guard is reading nothing');
  const to = src.indexOf('bsMyRecipesPing();', from);
  assert.ok(to > from, 'could not find the end of the delete handler');
  const handler = src.slice(from, to);
  assert.ok(handler.length > 400, `lifted ${handler.length} chars — that is not the handler`);

  const askAt = handler.indexOf('bsAskConfirm');
  const bailAt = handler.indexOf('if (!okToDelete) return;');
  const removeAt = handler.indexOf('bsMyRecipesStore().remove(');
  assert.ok(askAt >= 0, 'the delete handler must ask before destroying anything');
  assert.ok(bailAt > askAt, 'a refusal must return before the remove');
  assert.ok(removeAt > bailAt, `order is ask(${askAt}) → bail(${bailAt}) → remove(${removeAt})`);
  // And the pointer write is behind the same gate, or a refused delete would
  // still drop the row from the Library and orphan the body.
  assert.ok(handler.indexOf('bsLibWrite(') > bailAt, 'the pointer write must also sit behind the confirm');
});

test('⚠ A FAILED DELETE IS RENDERED — mounted, not grepped', async () => {
  // The previous round set removeErr and rendered it nowhere, which made that
  // fix half a fix. ⚠ AND MY GUARD FOR IT WAS A SOURCE SCAN, in a file whose
  // whole premise is that only a mount can see a render fact: a regression that
  // wrapped the node in a never-true condition would have kept every
  // indexOf/includes assertion green while the member was told nothing.
  const DETAIL = await loadBroadsheet(['BSLibraryDetail']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, confirm: w.bsAskConfirm };
  const map = new Map([['shape.library', JSON.stringify([{ ...bsRecipePointer(MINE), savedAt: 2 }])]]);
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.bsAskConfirm = async () => true;                      // the member confirms
    w.shapeDb = {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => ({ v: 1, rev: 1, items: { [MINE.id]: MINE } }),
      saveUserGoalsIfRev: async () => ({ error: { message: 'row-level security' } }),
    };
    let backs = 0;
    const item = { ...bsRecipePointer(MINE), savedAt: 2 };
    const doc = { v: 1, rev: 1, items: { [MINE.id]: MINE } };
    const ed = drive(DETAIL.BSLibraryDetail, { item, onBack: () => { backs += 1; }, myDoc: doc });

    assert.match(ed.text, /Delete this recipe/, 'the delete control must be on screen for a member recipe');
    assert.doesNotMatch(ed.text, /Couldn't delete just now/, 'no error before anything is attempted');

    ed.click('Delete this recipe');
    // ⚠ MACROTASKS, NOT MICROTASKS. The handler awaits a confirm, then the
    // store's serial lane, then two async reads before the write — a fixed
    // number of Promise.resolve() ticks does not drain that, and the assertion
    // then reads a button still saying "Deleting…" rather than the state under
    // test. setTimeout(0) drains the whole microtask queue between turns.
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();

    // ⚠ THE FAILURE IS ON SCREEN, and the member is still on the recipe.
    assert.match(ed.text, /Couldn't delete just now/, 'a failed delete must say so');
    assert.equal(backs, 0, 'a failed delete must not navigate away');
    assert.match(ed.text, /Delete this recipe/, 'the control returns so they can retry');
    // And the pointer was not dropped — the body is still there, so dropping the
    // row would orphan it.
    assert.match(String(map.get('shape.library')), /myrecipe:/);
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.bsAskConfirm = prev.confirm;
  }
});

test('⚠ AN ACCOUNT CHANGE IS NAMED, NOT OFFERED AS A RETRY', async () => {
  // Telling the member to try again would re-enter the write against whoever is
  // signed in NOW — the race the CAS closed, reopened through the retry path.
  const DETAIL = await loadBroadsheet(['BSLibraryDetail']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, confirm: w.bsAskConfirm };
  const map = new Map([['shape.library', JSON.stringify([{ ...bsRecipePointer(MINE), savedAt: 2 }])]]);
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.bsAskConfirm = async () => true;
    w.shapeDb = {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => ({ v: 1, rev: 1, items: { [MINE.id]: MINE } }),
      saveUserGoalsIfRev: async () => ({ accountChanged: true, error: { message: 'Account changed' } }),
    };
    const item = { ...bsRecipePointer(MINE), savedAt: 2 };
    const ed = drive(DETAIL.BSLibraryDetail, { item, onBack() {}, myDoc: { v: 1, rev: 1, items: { [MINE.id]: MINE } } });
    ed.click('Delete this recipe');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.match(ed.text, /account changed/i, 'the member must be told the account moved');
    assert.doesNotMatch(ed.text, /Try again/i, 'a retry here writes into the other account');

    // ⚠ AND A NEW ATTEMPT STARTS CLEAN. Without a reset the stale failure stays
    // on screen through the next confirm — and through a Cancel — describing an
    // attempt that is no longer happening.
    w.bsAskConfirm = async () => false;
    ed.click('Delete this recipe');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.doesNotMatch(ed.text, /account changed/i, 'a new attempt must clear the last failure');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.bsAskConfirm = prev.confirm;
  }
});

test('a REFUSED confirm deletes nothing and says nothing', async () => {
  const DETAIL = await loadBroadsheet(['BSLibraryDetail']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, confirm: w.bsAskConfirm };
  const map = new Map([['shape.library', JSON.stringify([{ ...bsRecipePointer(MINE), savedAt: 2 }])]]);
  let writes = 0;
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.bsAskConfirm = async () => false;                     // the member backs out
    w.shapeDb = {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => ({ v: 1, rev: 1, items: { [MINE.id]: MINE } }),
      saveUserGoalsIfRev: async () => { writes += 1; return { ok: true }; },
    };
    let backs = 0;
    const item = { ...bsRecipePointer(MINE), savedAt: 2 };
    const doc = { v: 1, rev: 1, items: { [MINE.id]: MINE } };
    const ed = drive(DETAIL.BSLibraryDetail, { item, onBack: () => { backs += 1; }, myDoc: doc });
    ed.click('Delete this recipe');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.equal(writes, 0, 'a refused confirm must write nothing');
    assert.equal(backs, 0);
    assert.doesNotMatch(ed.text, /Couldn't delete/, 'backing out is not a failure');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.bsAskConfirm = prev.confirm;
  }
});

test('⚠ THE WRITER ITSELF HONOURS THE EXPECTED UID — not just the caller passing it', async () => {
  // Mutation-found gap: deleting the uid check inside saveUserGoalsIfRev left
  // every test green, because the store's guards only proved the CALLER sends
  // the uid. A guard aimed at the caller says nothing about the writer, and the
  // writer is the only place that can close this race.
  const backend = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const at = backend.indexOf('async saveUserGoalsIfRev');
  assert.ok(at > 0, 'saveUserGoalsIfRev is gone from shapeBackend.js');
  const open = backend.indexOf('(', at);
  let pd = 0, afterParams = -1;
  for (let j = open; j < backend.length; j += 1) {
    if (backend[j] === '(') pd += 1;
    else if (backend[j] === ')') { pd -= 1; if (pd === 0) { afterParams = j + 1; break; } }
  }
  const i = backend.indexOf('{', afterParams);
  let depth = 0, end = -1;
  for (let j = i; j < backend.length; j += 1) {
    if (backend[j] === '{') depth += 1;
    else if (backend[j] === '}') { depth -= 1; if (depth === 0) { end = j + 1; break; } }
  }
  const body = backend.slice(at, end);
  assert.ok(body.length > 600, `lifted ${body.length} chars — that is a signature, not a body`);

  // A minimal PostgREST double: update(...).eq().eq().eq()/.is().select() and insert().
  // ⚠ THE DOUBLE RECORDS ITS PREDICATES. The first version swallowed every
  // eq()/is() argument and always returned the fixture rows — so deleting
  // `.eq('data->>rev', …)`, the COMPARE half of compare-and-set and the whole
  // reason this helper exists, left all three cases green. A double that cannot
  // observe the thing under test is not a test.
  const make = (signedInAs, rows) => {
    const calls = { updates: 0, inserts: 0, eq: [], is: [], errors: [] };
    const chain = {
      update() { calls.updates += 1; return chain; },
      eq(col, val) { calls.eq.push([col, val]); return chain; },
      is(col, val) { calls.is.push([col, val]); return chain; },
      async select() { return { data: rows, error: null }; },
      async insert() { calls.inserts += 1; return { error: null }; },
    };
    const supabase = { from: () => chain };
    const win = { shapeDb: { getUser: async () => ({ id: signedInAs }) } };
    const fn = new Function('supabase', 'window', 'console', `${body.replace(/^async /, 'return async function ')}`)(
      supabase, win, { warn() {}, error: (...a) => calls.errors.push(a.join(' ')) },
    );
    return { fn, calls };
  };

  // Same account → the write goes through, AND it compares the revision.
  const okCase = make('u1', [{ kind: 'client_recipes' }]);
  assert.deepEqual(await okCase.fn('client_recipes', { items: {} }, '1', 'u1'), { ok: true });
  assert.equal(okCase.calls.updates, 1);
  const revPred = okCase.calls.eq.find(([c]) => String(c).includes('rev'));
  assert.ok(revPred, 'the update must filter on the revision — without it this is not a CAS');
  assert.equal(revPred[1], '1', 'the filter must carry the token the reader saw');
  assert.ok(okCase.calls.eq.some(([c]) => c === 'user_id'), 'scoped to the user');
  assert.ok(okCase.calls.eq.some(([c]) => c === 'kind'), 'scoped to the kind');

  // An absent revision uses IS NULL, never eq('0') — which would match nothing
  // and the row could never be created.
  const firstWrite = make('u1', [{ kind: 'client_recipes' }]);
  assert.deepEqual(await firstWrite.fn('client_recipes', { items: {} }, null, 'u1'), { ok: true });
  assert.ok(firstWrite.calls.is.some(([c, v]) => String(c).includes('rev') && v === null),
    'an absent revision must filter IS NULL');
  assert.equal(firstWrite.calls.eq.some(([c]) => String(c).includes('rev')), false);

  // ⚠ ZERO ROWS MATCHED: with a revision, that is a CONFLICT (someone else
  // wrote). Nothing is inserted — an insert here would clobber their write.
  const lost = make('u1', []);
  assert.deepEqual(await lost.fn('client_recipes', { items: {} }, '1', 'u1'), { conflict: true });
  assert.equal(lost.calls.inserts, 0);

  // ⚠ ZERO ROWS AND NO REVISION: the row may simply not exist yet, so the
  // INSERT is the fallback — update-then-insert, never the reverse.
  const fresh = make('u1', []);
  assert.deepEqual(await fresh.fn('client_recipes', { items: {} }, null, 'u1'), { ok: true });
  assert.equal(fresh.calls.updates, 1, 'the update is tried first');
  assert.equal(fresh.calls.inserts, 1, 'the insert is the fallback');

  // ⚠ DIFFERENT account → refused, and NOTHING is written. Without this the
  // member's whole document lands in someone else's row, reporting success.
  const badCase = make('u2', [{ kind: 'client_recipes' }]);
  const refused = await badCase.fn('client_recipes', { items: {} }, '1', 'u1');
  assert.ok(refused.error, 'a changed account must refuse');
  assert.equal(badCase.calls.updates, 0, 'nothing may be written for the wrong account');
  assert.equal(badCase.calls.inserts, 0);
  // ⚠ THE REFUSAL IS A FLAG, NOT A SENTENCE. The store's first draft sniffed
  // /account/i on the message, which fired for any backend error whose prose
  // contained the word ("Your account is over its usage limits") and made this
  // wording part of the store's contract. A marker can be read without the
  // message being frozen — and can be localized or reworded freely.
  assert.equal(refused.accountChanged, true, 'a changed account must be machine-readable');

  // ⚠ AND AN UNBOUND CALL IS REFUSED, not quietly allowed. An optional guard
  // makes the unbound call the DEFAULT — and this primitive is registered for
  // ~15 other user_goals kinds, so a migration written by copying a
  // three-argument call would compile, pass, and reopen the race on a coach's
  // notes. There is one caller today; making it mandatory costs nothing.
  const unbound = make('u9', [{ kind: 'client_recipes' }]);
  const refusedUnbound = await unbound.fn('client_recipes', { items: {} }, '1');
  assert.ok(refusedUnbound.error, 'a call with no expected account must refuse');
  assert.equal(unbound.calls.updates, 0);
  assert.equal(unbound.calls.inserts, 0);
  // ⚠ AND A MISSING UID IS A BUG IN THE CALLER, NOT AN ACCOUNT SWITCH. The
  // first draft returned 'No expected account', which a consumer sniffing for
  // /account/i read as a switch — so the omission this guard exists to catch
  // rendered to the member as a plausible runtime message and shipped silently.
  // It carries NO accountChanged marker and IS loud in the console.
  assert.notEqual(refusedUnbound.accountChanged, true,
    'a programming error must not masquerade as an account switch');
  assert.equal(unbound.calls.errors.length, 1, 'the omission must be loud');
  assert.match(unbound.calls.errors[0], /expectedUid/,
    'the console line must name the argument that was omitted');
});

// ── the save flow's own account line ────────────────────────────────────────

test('⚠ A REFUSED SAVE DOES NOT TELL THE MEMBER TO REOPEN A RECIPE THAT WAS NEVER SAVED', async () => {
  // ⚠ THE DELETE FLOW'S WORDING IS A LIE IN THIS ONE. Nothing was written, so
  // there is nothing to reopen: the draft in this sheet is the ONLY copy of
  // what the member typed, and closing the sheet to follow that instruction
  // destroys it — the unrecoverable-body case that is the whole premise for
  // storing recipes apart from the pointer array.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.ShapeRecipeImport = null;                       // no model — the structural split
    w.shapeDb = {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => ({}),
      saveUserGoalsIfRev: async () => ({ accountChanged: true, error: { message: 'Account changed' } }),
    };
    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const setVal = (idx, v) => {
      const inputs = ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
      inputs[idx].props.onChange({ target: { value: v } });
      ed.render();
    };
    setVal(0, 'Nana’s lemon chicken');
    setVal(1, 'Ingredients\n1 cup flour\nMethod\nMix it.');
    ed.click('Next');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    ed.click('Keep it');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.match(ed.text, /account changed/i, 'the member must be told the account moved');
    assert.doesNotMatch(ed.text, /Reopen this recipe/i, 'there is nothing to reopen — nothing was saved');
    assert.doesNotMatch(ed.text, /Try again/i, 'a retry here would target the other account');
    // ⚠ AND THE DRAFT IS STILL ON SCREEN. It is the only copy — so this reads
    // the controls' VALUES, not the rendered text: an editable draft lives in
    // `value` props, and textOf walks children only, so a text match here would
    // have passed on an empty sheet.
    const vals = ed.nodes()
      .filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange)
      .map((n) => String(n.props.value || ''));
    assert.ok(vals.some((v) => v.includes('flour')), `the draft must survive a refused save (had ${JSON.stringify(vals)})`);
    assert.ok(vals.some((v) => v.includes('Mix it')), 'the method must survive too');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('⚠ EVERY REASON THE STORE CAN RETURN HAS A SENTENCE — including the one both handlers had missed', async () => {
  // The two handlers were each spelling three reasons out inline in
  // near-identical nested ternaries, which is how 'unreadable' came to be
  // unnamed on BOTH — under a comment promising that "we could not read your
  // recipes" was a separate sentence from "sign in".
  const MAP = await loadBroadsheet(['bsMyRecipeErrText']);
  const tr = (k, o) => (o && o.defaultValue) || k;
  const call = (reason) => MAP.bsMyRecipeErrText(tr, reason, 'ACCOUNT-LINE', 'FALLBACK', 'nutrition:myRecipe.errSave');
  assert.match(call('signed-out'), /Sign in/i);
  assert.equal(call('account-changed'), 'ACCOUNT-LINE');
  assert.match(call('unreadable'), /read your recipes/i);
  assert.notEqual(call('unreadable'), 'FALLBACK', "a failed READ is not a failed write");
  // 'contended' and 'write-failed' both mean exactly "try again" — nothing was
  // written and nothing was lost.
  assert.equal(call('contended'), 'FALLBACK');
  assert.equal(call('write-failed'), 'FALLBACK');
  assert.equal(call(undefined), 'FALLBACK', 'an absent reason still gets a sentence');
  // ⚠ The account line is a PARAMETER because the two flows need different
  // words — a delete that was refused can be reopened; a save that was refused
  // has nothing to reopen.
  assert.notEqual(
    MAP.bsMyRecipeErrText(tr, 'account-changed', 'A', 'F', 'k'),
    MAP.bsMyRecipeErrText(tr, 'account-changed', 'B', 'F', 'k'),
  );
});

test('⚠ THE SHEET PASSES THE ACCOUNT IT CAPTURED — a bound store the caller does not use is not bound', async () => {
  // ⚠ MUTATION-FOUND GAP. Every guard in the store proved the STORE refuses a
  // foreign owner; not one of them proved the sheet supplies one. Dropping the
  // second argument at this call site left the whole suite green while the
  // retry path went straight back to writing this member's typed recipe into
  // whoever is signed in now.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  const sent = [];
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    // Captured at mount: u1. Signed in by the time the member taps: u2.
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.ShapeRecipeImport = null;
    w.shapeDb = {
      getUser: async () => ({ id: 'u2' }),
      getUserGoals: async () => ({}),
      saveUserGoalsIfRev: async (kind, data, rev, uid) => { sent.push(uid); return { ok: true }; },
    };
    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const setVal = (idx, v) => {
      const inputs = ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
      inputs[idx].props.onChange({ target: { value: v } });
      ed.render();
    };
    setVal(0, 'Nana’s lemon chicken');
    setVal(1, 'Ingredients\n1 cup flour\nMethod\nMix it.');
    ed.click('Next');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    ed.click('Keep it');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.deepEqual(sent, [], "nothing may reach the backend once the account has moved under the draft");
    assert.match(ed.text, /account changed/i, 'and the member is told why');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('⚠ AND SO DOES THE DETAIL SCREEN — the same wiring, the same gap', async () => {
  const DETAIL = await loadBroadsheet(['BSLibraryDetail']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, confirm: w.bsAskConfirm };
  const map = new Map([['shape.library', JSON.stringify([{ ...bsRecipePointer(MINE), savedAt: 2 }])]]);
  const sent = [];
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.bsAskConfirm = async () => true;
    w.shapeDb = {
      getUser: async () => ({ id: 'u2' }),
      getUserGoals: async () => ({ v: 1, rev: 1, items: { [MINE.id]: MINE } }),
      saveUserGoalsIfRev: async (kind, data, rev, uid) => { sent.push(uid); return { ok: true }; },
    };
    const item = { ...bsRecipePointer(MINE), savedAt: 2 };
    let backs = 0;
    const ed = drive(DETAIL.BSLibraryDetail, { item, onBack() { backs += 1; }, myDoc: { v: 1, rev: 1, items: { [MINE.id]: MINE } } });
    ed.click('Delete this recipe');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.deepEqual(sent, [], 'nothing may reach the backend for the other account');
    // ⚠ AND THE SCREEN DOES NOT REPORT SUCCESS. Unbound, the retry reads u2's
    // document, finds no such id, writes it back unchanged and resolves ok —
    // so the pointer is dropped and onBack() fires while the body stays in u1's
    // document, orphaned with nothing left pointing at it.
    assert.equal(backs, 0, 'a refused delete does not close the screen');
    assert.match(ed.text, /account changed/i);
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.bsAskConfirm = prev.confirm;
  }
});

// ── the photo draft's way out ───────────────────────────────────────────────
//
// ⚠ THESE ARE ABOUT A ONE-WAY DOOR, NOT ABOUT COPY. A photograph never passes
// through the paste box, so every gate that asked for a paste was a gate a photo
// import could not satisfy — and the sheet holds the ONLY copy of a
// transcription, so a stage it cannot leave is a stage that destroys work.

// The photo path, driven end to end: a fake pick, a stubbed reader, the review
// screen, the save. `title` is deliberately EMPTY — a page whose recipe name is
// in a typeface or a margin the reader could not lift is the ordinary case, and
// it is the one that used to be unrecoverable.
async function drivePhotoSheet(SHEET, { draft, onSaved = () => {}, db, parse = null } = {}) {
  const w = globalThis.window;
  const map = new Map();
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
  w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
  w.shapeDb = db || {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async () => ({}),
    saveUserGoalsIfRev: async () => ({ ok: true }),
  };
  // ⚠ `parse` IS INJECTABLE, AND THE DEFAULT NULL IS NOT NEUTRAL. With no parser
  // the sheet falls back to its structural split, so a test asserting "the typed
  // recipe was read" passes on a draft the READER never saw — the right outcome
  // reached through the wrong path, which proves nothing about the reader being
  // handed the new text. A test that cares about that supplies a stub.
  w.ShapeRecipeImport = { parse, photo: async () => ({ ok: true, draft }) };
  const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved });
  const drain = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0)); ed.render(); };
  const inputs = () => ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
  const values = () => inputs().map((n) => String(n.props.value || ''));
  const nameField = () => inputs().find((n) => /lemon chicken/.test(String(n.props.placeholder || '')));
  const pick = async () => {
    const file = ed.nodes().find((n) => n.type === 'input' && n.props.type === 'file');
    assert.ok(file, 'the photo control must render a file input');
    file.props.onChange({ target: { files: [{ name: 'page.jpg', type: 'image/jpeg', size: 120_000 }], value: 'C:\\page.jpg' } });
    await drain();
  };
  return { ed, drain, inputs, values, nameField, pick, restore() { w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp; } };
}

const PHOTO_DRAFT = { title: '', servings: null, ingredients: [{ n: '1 cup', m: 'flour' }], steps: ['Mix it well.'] };

test('⚠ A PHOTO DRAFT WITH NO TITLE CAN STILL BE KEPT — the write stage was a one-way door', async () => {
  // The trap, exactly: Keep it refused for want of a name and bounced to the
  // write stage; that stage's Next wanted a paste; a photograph produces none;
  // so Next was permanently disabled and the only live control was Cancel. The
  // member's transcription could be destroyed and could not be kept.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const saved = [];
  const h = await drivePhotoSheet(SHEET, { draft: PHOTO_DRAFT, onSaved: (it) => saved.push(it) });
  try {
    await h.pick();
    assert.match(h.ed.text, /check it against the page/i, 'a read photo lands on the review screen');
    assert.ok(h.values().some((v) => v.includes('flour')), 'with the transcription in hand');

    h.ed.click('Keep it');
    await h.drain();
    assert.match(h.ed.text, /Give it a name first/i, 'an unnamed recipe is still refused');
    assert.deepEqual(saved, [], 'and nothing is written');

    // ⚠ AND THE REFUSAL LEAVES THEM ON THE SCREEN THAT HOLDS THE DRAFT. Both
    // halves are asserted: the ingredient is still editable (so this is the
    // review stage), and the paste box is nowhere (so it did not bounce).
    assert.ok(h.values().some((v) => v.includes('flour')), 'the transcription is still on screen');
    assert.doesNotMatch(h.ed.text, /Paste the recipe/, 'a refused save must not bounce to the write stage');

    // The name is asked for HERE, and answering it keeps the recipe.
    const name = h.nameField();
    assert.ok(name, 'the Name field must be on the review screen');
    name.props.onChange({ target: { value: 'Flatbread from the blue book' } });
    h.ed.render();
    h.ed.click('Keep it');
    await h.drain();
    assert.equal(saved.length, 1, 'naming it on this screen keeps it');
    assert.equal(saved[0].title, 'Flatbread from the blue book');
    assert.equal(saved[0].sourceKind, 'photo', 'and it is filed as a photo import');
    assert.deepEqual(saved[0].ingredients, PHOTO_DRAFT.ingredients, 'with the transcription intact');
  } finally { h.restore(); }
});

test('⚠ AND BACK IS NOT A TRAPDOOR EITHER — Next returns to a draft the paste box never held', async () => {
  // The same dead end reached by the other door. Stepping Back from a photo
  // review lands on the write stage with an empty paste box; if Next reads only
  // the paste, the draft is on screen nowhere and reachable by nothing.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const h = await drivePhotoSheet(SHEET, { draft: PHOTO_DRAFT });
  try {
    await h.pick();
    h.ed.click('Back');
    h.ed.render();
    assert.match(h.ed.text, /Paste the recipe/, 'Back reaches the write stage');

    const next = h.ed.buttons().find((b) => b.label.startsWith('Next'));
    assert.ok(next, 'the forward control exists');
    assert.equal(next.disabled, false, 'a draft in hand is a way forward, with or without a paste');

    h.ed.click('Next');
    h.ed.render();
    // ⚠ AND IT RETURNS THE TRANSCRIPTION RATHER THAN RE-READING AN EMPTY BOX.
    // Running the structural split over '' would replace a read page with an
    // empty draft — the same loss, arrived at by looking like it worked.
    assert.ok(h.values().some((v) => v.includes('flour')), 'the transcription comes back');
    assert.ok(h.values().some((v) => v.includes('Mix it well')), 'method and all');

    // ⚠ AND THE RETURN CLEARS THE LAST FAILURE, as every other path through this
    // button does. The error line renders on BOTH stages, so a refusal carried
    // forward sits a dead sentence over the draft it is no longer about.
    h.ed.click('Keep it');
    await h.drain();
    assert.match(h.ed.text, /Give it a name first/i, 'unnamed is still refused');
    h.ed.click('Back');
    h.ed.render();
    h.ed.click('Next');
    h.ed.render();
    assert.doesNotMatch(h.ed.text, /Give it a name first/i, 'a new pass at the draft starts clean');
    assert.ok(h.values().some((v) => v.includes('flour')), 'and the draft is still the one on screen');
  } finally { h.restore(); }
});

test('an EMPTY sheet still cannot go forward — the gate was narrowed, not removed', async () => {
  // The guard against the fix above going too far: with no paste and no draft
  // there is nothing to review, and Next must stay shut.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const h = await drivePhotoSheet(SHEET, { draft: PHOTO_DRAFT });
  try {
    const next = h.ed.buttons().find((b) => b.label.startsWith('Next'));
    assert.equal(next.disabled, true, 'an empty sheet has nothing to move forward to');
  } finally { h.restore(); }
});

test('⚠ THE LIBRARY TAG SAYS WHICH READER IT WAS — a transcription is not a paste', async () => {
  // This tag is the ONLY provenance a member sees months later, on the screen
  // where they decide whether to trust a line — and "from your paste" was shown
  // for every AI-drafted recipe including the ones read off a photograph.
  // `sourceKind` is stamped at save for exactly this.
  const DETAIL = await loadBroadsheet(['BSLibraryDetail']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb };
  const seen = (rec) => {
    const map = new Map([['shape.library', JSON.stringify([{ ...bsRecipePointer(rec), savedAt: 2 }])]]);
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({ v: 1, rev: 1, items: { [rec.id]: rec } }) };
    const item = { ...bsRecipePointer(rec), savedAt: 2 };
    return drive(DETAIL.BSLibraryDetail, { item, onBack() {}, myDoc: { v: 1, rev: 1, items: { [rec.id]: rec } } }).text;
  };
  try {
    const fromPhoto = seen({ ...MINE, draftedByAI: true, sourceKind: 'photo' });
    assert.match(fromPhoto, /from your photo/i, 'a transcription says so');
    assert.doesNotMatch(fromPhoto, /from your paste/i, 'and does not claim to be a paste');

    const fromPaste = seen({ ...MINE, draftedByAI: true, sourceKind: 'paste' });
    assert.match(fromPaste, /from your paste/i, 'and the paste form survives');
    assert.doesNotMatch(fromPaste, /from your photo/i);

    // A typed-in recipe carries no AI provenance at all — the tag is about the
    // reader, so a recipe with no reader has none.
    const typed = seen({ ...MINE, sourceKind: 'paste' });
    assert.doesNotMatch(typed, /Read by Shape/i);
  } finally { w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; }
});

test('⚠ TOO-LARGE AND WILL-NOT-DECODE ARE DIFFERENT SENTENCES — the client split them and this map had folded them back', async () => {
  // shapeBackend goes to the trouble of returning a `too_large` distinct from
  // `bad_image`, with a comment saying why: a merely-large photo must not be
  // sent back for a CLEARER one "filling the frame", because a sharper busier
  // image encodes BIGGER and the next attempt fails harder. This mapper was
  // handing both reasons that same sentence, undoing the split one layer up.
  const MAP = await loadBroadsheet(['bsRecipePhotoErr']);
  const tr = (k, o) => (o && o.defaultValue) || k;
  const say = (reason) => MAP.bsRecipePhotoErr(tr, reason);
  const reasons = ['too_large', 'bad_image', 'unsupported_type', 'no_draft', 'no_key', 'unavailable'];
  const said = reasons.map(say);

  assert.notEqual(say('too_large'), say('bad_image'),
    'a photo that is too big and one that will not decode want different advice');
  assert.doesNotMatch(say('too_large'), /clearer|filling the frame/i,
    'telling them to fill the frame makes the file bigger');
  assert.match(say('too_large'), /crop/i, 'cropping is the one recovery a member can perform');

  // Every reason still gets a sentence of its own, and the fallback still
  // answers a reason nobody enumerated.
  assert.equal(new Set(said.slice(0, 5)).size, 5, `each named reason needs its own sentence (${JSON.stringify(said)})`);
  assert.equal(say(undefined), say('unavailable'), 'an unknown reason falls to the generic line');
  for (const s of said) assert.ok(s.length > 12 && !s.includes(':'), `a reason must resolve to a sentence, got ${JSON.stringify(s)}`);
});

test('⚠ A PHOTO DRAFT SURVIVES STALE TEXT LEFT IN THE PASTE BOX', async () => {
  // Codex, P1 on this PR. The photo button sits directly under the paste box, so
  // "type a bit, think better of it, photograph the page instead" leaves a
  // transcription in hand AND abandoned text in the box. Asking only whether the
  // box is EMPTY sent Next to the paste parser, and setDraft(next || splitLocally())
  // replaced the transcription with a split of the text they had already given up
  // on — silently, with no Keep control on that stage to rescue it.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const h = await drivePhotoSheet(SHEET, { draft: PHOTO_DRAFT });
  try {
    // Type something first, then photograph instead.
    const paste = h.inputs().find((n) => /paste it however/i.test(String(n.props.placeholder || '')));
    assert.ok(paste, 'the write stage has a paste box');
    paste.props.onChange({ target: { value: 'half a recipe I gave up on' } });
    h.ed.render();
    await h.pick();
    assert.ok(h.values().some((v) => v.includes('flour')), 'the transcription is in hand');

    h.ed.click('Back');
    h.ed.render();
    h.ed.click('Next');
    h.ed.render();
    // ⚠ THE TRANSCRIPTION COMES BACK, and the abandoned text did not become the
    // draft. Both halves are asserted: a split of "half a recipe I gave up on"
    // would leave that string in an editable row.
    assert.ok(h.values().some((v) => v.includes('flour')), 'the photo draft must survive');
    assert.ok(h.values().some((v) => v.includes('Mix it well')), 'method and all');
    const rows = h.values().filter((v) => v.includes('gave up on'));
    assert.deepEqual(rows.filter((v) => v !== 'half a recipe I gave up on'), [],
      'the abandoned text must not have been split into the draft');
  } finally { h.restore(); }
});

test('⚠ BUT EDITING THE PASTE MEANS READ THE PASTE — the draft does not outrank a changed box', async () => {
  // The same trap pointed the other way: always preferring the draft would leave
  // a member who photographed, stepped Back and then typed a real recipe with no
  // way to get it read at all.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  // ⚠ A REAL PARSER STUB, NOT THE DEFAULT NULL. Without one the sheet falls back
  // to its structural split, which also produces a draft containing "oats" — so
  // the assertion passed without the reader ever being handed the new text, and
  // "the typed recipe is read" was a claim about a path the test never exercised.
  const seen = [];
  const h = await drivePhotoSheet(SHEET, {
    draft: PHOTO_DRAFT,
    parse: async (text) => {
      seen.push(text);
      return { ok: true, draft: { title: '', servings: null, ingredients: [{ n: '2 cups', m: 'oats' }], steps: ['Soak them overnight.'] } };
    },
  });
  try {
    await h.pick();
    assert.deepEqual(seen, [], 'a photo import must not touch the paste reader');
    h.ed.click('Back');
    h.ed.render();
    const paste = h.inputs().find((n) => /paste it however/i.test(String(n.props.placeholder || '')));
    paste.props.onChange({ target: { value: 'Ingredients\n2 cups oats\nMethod\nSoak them overnight.' } });
    h.ed.render();
    h.ed.click('Next');
    await h.drain();
    assert.equal(seen.length, 1, 'the reader must actually be asked');
    assert.match(seen[0], /2 cups oats/, 'and handed the text they just typed, not the text the draft came from');
    assert.ok(h.values().some((v) => v.includes('oats')), 'the typed recipe is read');
    assert.ok(!h.values().some((v) => v.includes('Mix it well')), 'and it replaces the photo draft, as asked');
  } finally { h.restore(); }
});

test('and a re-entry with an untouched box does not re-run the reader over the members edits', async () => {
  // The same discriminator buys this for free: Back then Next on the PASTE path
  // used to re-parse the same text and overwrite every row the member had just
  // corrected — a second silent loss, and a wasted provider call for a draft
  // already in hand.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  let reads = 0;
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoalsIfRev: async () => ({ ok: true }) };
    w.ShapeRecipeImport = { photo: null, parse: async () => { reads += 1; return { ok: true, draft: { title: 'T', servings: null, ingredients: [{ n: '1', m: 'flour' }], steps: ['Mix.'] } }; } };
    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const drain = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0)); ed.render(); };
    const inputs = () => ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
    inputs().find((n) => /paste it however/i.test(String(n.props.placeholder || '')))
      .props.onChange({ target: { value: 'Ingredients\n1 cup flour\nMethod\nMix.' } });
    ed.render();
    ed.click('Next');
    await drain();
    assert.equal(reads, 1, 'the reader ran once');

    // Correct a row, step back, come forward again.
    const ing = inputs().find((n) => String(n.props.value || '').includes('flour'));
    ing.props.onChange({ target: { value: 'strong white flour' } });
    ed.render();
    ed.click('Back'); ed.render();
    ed.click('Next'); ed.render();
    assert.equal(reads, 1, 'and it must not run again over a box nobody touched');
    assert.ok(inputs().some((n) => String(n.props.value || '') === 'strong white flour'),
      "the member's own correction must survive the round trip");
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('⚠ A NAME TYPED WHILE THE READER IS RUNNING OUTRANKS THE ONE THE READER FINDS', async () => {
  // Codex, P2 on the fix round. The Name field stays editable while "Reading…"
  // shows — only the buttons are disabled — and the completion handler read
  // `title` from the render that STARTED the request. So a member who typed a
  // name during the round trip had it silently replaced by the model's: the
  // closure still saw the empty string it was created with, and the guard that
  // exists to protect their input waved the overwrite through.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  let release;
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoalsIfRev: async () => ({ ok: true }) };
    // The reader hangs until the test releases it, so the typing genuinely
    // happens mid-flight rather than before or after.
    const pending = new Promise((r) => { release = r; });
    w.ShapeRecipeImport = { photo: null, parse: () => pending };

    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const inputs = () => ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
    const nameField = () => inputs().find((n) => /lemon chicken/.test(String(n.props.placeholder || '')));

    inputs().find((n) => /paste it however/i.test(String(n.props.placeholder || '')))
      .props.onChange({ target: { value: 'Ingredients\n1 cup flour\nMethod\nMix.' } });
    ed.render();
    ed.click('Next');
    ed.render();
    assert.match(ed.text, /Reading/, 'the read is in flight');

    // They type a name while it reads.
    nameField().props.onChange({ target: { value: 'Grandma Rose' } });
    ed.render();

    release({ ok: true, draft: { title: 'Untitled Recipe 4', servings: null, ingredients: [{ n: '1', m: 'flour' }], steps: ['Mix.'] } });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();

    assert.ok(inputs().some((n) => String(n.props.value || '') === 'Grandma Rose'),
      "the member's own name must survive the read landing");
    assert.ok(!inputs().some((n) => String(n.props.value || '') === 'Untitled Recipe 4'),
      "the reader's title must not overwrite one they typed mid-flight");
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('⚠ AND THE PHOTO READER HAS THE SAME CLOSURE — both call sites, or only one is fixed', async () => {
  // ⚠ MUTATION-FOUND GAP, the second in this round. The test above drives the
  // PASTE reader, so reverting the PHOTO path to the stale-closure form survived
  // it — two call sites share one rule, and a guard on one of them is a guard on
  // half the rule. The photo path is if anything the likelier of the two: the
  // member has just handed over a page whose title they can read, so typing the
  // name while it processes is the natural thing to do.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  let release;
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoalsIfRev: async () => ({ ok: true }) };
    const pending = new Promise((r) => { release = r; });
    w.ShapeRecipeImport = { parse: null, photo: () => pending };

    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const inputs = () => ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
    const file = ed.nodes().find((n) => n.type === 'input' && n.props.type === 'file');
    file.props.onChange({ target: { files: [{ name: 'page.jpg', type: 'image/jpeg', size: 120_000 }], value: '' } });
    ed.render();

    // They type a name off the page while the reader works.
    inputs().find((n) => /lemon chicken/.test(String(n.props.placeholder || '')))
      .props.onChange({ target: { value: 'Aunt Ivy’s soda bread' } });
    ed.render();

    release({ ok: true, draft: { title: 'Chapter 4', servings: null, ingredients: [{ n: '1 cup', m: 'flour' }], steps: ['Mix it well.'] } });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();

    assert.ok(inputs().some((n) => String(n.props.value || '') === 'Aunt Ivy’s soda bread'),
      "the member's own name must survive the transcription landing");
    assert.ok(!inputs().some((n) => String(n.props.value || '') === 'Chapter 4'),
      'a heading the reader lifted must not overwrite the name they typed');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('but the reader still names a recipe the member left unnamed — on BOTH paths', async () => {
  // The control: without it, the test above passes on a handler that never sets
  // a title at all, which would silently retire the whole feature.
  //
  // ⚠ MUTATION-FOUND GAP. The first version of this control drove the PHOTO path
  // only, so deleting the PASTE path's title-set survived the round — a control
  // that covers one of the two call sites is not a control for the shared rule.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const h = await drivePhotoSheet(SHEET, {
    draft: { ...PHOTO_DRAFT, title: 'Flatbread from the blue book' },
  });
  try {
    await h.pick();
    assert.ok(h.values().some((v) => v === 'Flatbread from the blue book'),
      'a title read off the photo reaches the Name field');
  } finally { h.restore(); }

  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoalsIfRev: async () => ({ ok: true }) };
    w.ShapeRecipeImport = { photo: null, parse: async () => ({ ok: true, draft: { title: 'Nana’s lemon chicken', servings: null, ingredients: [{ n: '1', m: 'flour' }], steps: ['Mix.'] } }) };
    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const inputs = () => ed.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea') && n.props.onChange);
    inputs().find((n) => /paste it however/i.test(String(n.props.placeholder || '')))
      .props.onChange({ target: { value: 'Ingredients\n1 cup flour\nMethod\nMix.' } });
    ed.render();
    ed.click('Next');
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    assert.ok(inputs().some((n) => String(n.props.value || '') === 'Nana’s lemon chicken'),
      'a title read out of the paste reaches the Name field too');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});

test('⚠ THE PASTE BOX IS SEALED WHILE IT IS BEING READ', async () => {
  // Codex, P2. The completion closure holds the text from the render that
  // STARTED the request, so a member editing the box during "Reading…" got a
  // draft built from the text they had just replaced — installed over their
  // newer version and carried to the review screen with nothing saying so, where
  // they could keep a recipe that silently omits the edit they were making.
  //
  // Sealing the box makes the race impossible rather than handling it. Comparing
  // against the live value and discarding the result spends a provider call to
  // produce nothing, and loops for as long as they keep typing.
  const SHEET = await loadBroadsheet(['BSMyRecipeSheet']);
  const w = globalThis.window;
  const prev = { ls: w.localStorage, auth: w.ShapeAuth, db: w.shapeDb, imp: w.ShapeRecipeImport };
  const map = new Map();
  let release;
  try {
    w.localStorage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
    w.ShapeAuth = { getCachedState: () => ({ user: { id: 'u1' } }) };
    w.shapeDb = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoalsIfRev: async () => ({ ok: true }) };
    const pending = new Promise((r) => { release = r; });
    w.ShapeRecipeImport = { photo: null, parse: () => pending };

    const ed = drive(SHEET.BSMyRecipeSheet, { onClose() {}, onSaved() {} });
    const boxes = () => ed.nodes().filter((n) => n.type === 'textarea' && /paste it however/i.test(String(n.props.placeholder || '')));
    assert.equal(boxes()[0].props.disabled, false, 'it is live before a read starts');
    boxes()[0].props.onChange({ target: { value: 'Ingredients\n1 cup flour\nMethod\nMix.' } });
    ed.render();
    ed.click('Next');
    ed.render();

    assert.match(ed.text, /Reading/, 'the read is in flight');
    assert.equal(boxes()[0].props.disabled, true, 'and the box is sealed while it runs');

    release({ ok: true, draft: { title: 'T', servings: null, ingredients: [{ n: '1', m: 'flour' }], steps: ['Mix.'] } });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    ed.render();
    ed.click('Back');
    ed.render();
    assert.equal(boxes()[0].props.disabled, false, 'and live again once it is done');
  } finally {
    w.localStorage = prev.ls; w.ShapeAuth = prev.auth; w.shapeDb = prev.db; w.ShapeRecipeImport = prev.imp;
  }
});
