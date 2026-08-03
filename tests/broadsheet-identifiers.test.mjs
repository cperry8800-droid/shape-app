// Every identifier a broadsheet module uses must actually EXIST.
//
// WHY THIS FILE EXISTS: a call to an identifier that was never declared throws
// `ReferenceError` at RENDER time, and nothing else in the pipeline catches it —
// babel parses it fine (it is valid syntax), tsc does not typecheck these files,
// the Vite build emits it happily, and the unit tests never mount the component.
// One shipped this way: `bsmSignedIn()` was added to the marketplace's plans
// rail on a branch where that helper did not exist (it lived on a *different*
// branch), inside a ternary that evaluates on the FIRST render because
// `marketPlans` starts null. The marketplace would not have opened at all, and
// parse + 798 tests + the /m/ build were all green.
//
// These modules resolve names three ways, and all three are honoured here:
//   1. lexical  — declared/imported in the file (babel scope)
//   2. browser  — real platform globals (window, fetch, setTimeout, …)
//   3. window   — the house pattern: a module does `Object.assign(window, {…})`
//                 or `window.X = …`, and other modules then reference `X` bare.
//                 That works because a window property IS a global binding, but
//                 it is invisible to any per-file analysis — so the window
//                 surface is collected across the whole directory first.
//
// A name that matches none of the three cannot resolve at runtime either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// @babel/parser + @babel/traverse come from the declared `@babel/core` devDep —
// the same provenance AGENTS.md's documented JSX parse-check already relies on.
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'mobile-app', 'src', 'broadsheet');

// Real platform globals. Deliberately explicit rather than "anything Babel
// thinks is a global" — the point is to notice a NEW unresolved name, and an
// over-broad allowlist would let the next one through.
const BROWSER = new Set([
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'history', 'screen',
  'fetch', 'console', 'alert', 'confirm', 'prompt', 'matchMedia', 'getComputedStyle', 'structuredClone',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestIdleCallback',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'crypto', 'process',
  'Event', 'CustomEvent', 'Element', 'HTMLElement', 'AbortController', 'URL', 'URLSearchParams',
  'FormData', 'FileReader', 'Blob', 'File', 'Audio', 'Image', 'Notification', 'WebSocket', 'XMLHttpRequest',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'MediaRecorder', 'BarcodeDetector',
  'SpeechSynthesisUtterance', 'speechSynthesis', 'Intl',
]);

const files = readdirSync(DIR).filter((f) => /\.(jsx|js)$/.test(f));
const parseFile = (f) => parse(readFileSync(join(DIR, f), 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
const asts = new Map(files.map((f) => [f, parseFile(f)]));

// Pass 1 — everything this directory publishes onto `window`.
const windowNames = new Set();
for (const ast of asts.values()) {
  traverse(ast, {
    // Object.assign(window, { A, B, C })
    CallExpression(p) {
      const c = p.node.callee;
      const isAssign = c.type === 'MemberExpression' && c.object.name === 'Object' && c.property.name === 'assign';
      if (!isAssign) return;
      const [target, ...rest] = p.node.arguments;
      if (!target || target.name !== 'window') return;
      for (const arg of rest) {
        if (arg.type !== 'ObjectExpression') continue;
        for (const prop of arg.properties) {
          if (prop.type === 'ObjectProperty' && prop.key) windowNames.add(prop.key.name || prop.key.value);
        }
      }
    },
    // window.X = …
    AssignmentExpression(p) {
      const l = p.node.left;
      if (l.type === 'MemberExpression' && l.object.name === 'window' && !l.computed && l.property.name) {
        windowNames.add(l.property.name);
      }
    },
  });
}

test('broadsheet: the window surface is actually being collected', () => {
  // If this drops to nothing the resolver below would flag every cross-module
  // global and the failure would read as noise rather than a real bug.
  assert.ok(windowNames.size > 40,
    `only ${windowNames.size} window exports found — the collector has drifted from the source shape`);
});

test('broadsheet: every referenced identifier resolves (lexical | browser | window)', () => {
  const unresolved = [];
  for (const [file, ast] of asts) {
    traverse(ast, {
      Identifier(p) {
        if (!p.isReferencedIdentifier()) return;
        const n = p.node.name;
        if (BROWSER.has(n) || windowNames.has(n)) return;
        if (p.scope.hasBinding(n)) return;
        unresolved.push(`${file}:${p.node.loc.start.line} :: ${n}`);
      },
    });
  }
  assert.deepEqual([...new Set(unresolved)], [],
    'identifier with no declaration, no browser global and no window export — this throws ReferenceError when the code path runs');
});

// A component NAME is a JSXIdentifier, not an Identifier, so the visitor above
// never sees it — `<BSMissing />` sailed straight through the gate that exists to
// catch exactly this. It is the same crash, one render deeper: React resolves the
// name at element-creation time, so an undeclared component throws ReferenceError
// the moment the branch renders, with parse + tsc + tests + build all green.
// Extracted so the resolver itself can be regression-tested against synthetic
// source below, not only against whatever the real directory happens to contain.
function unresolvedJsxNames(ast, file) {
  const out = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const root = p.node.name;
      // <Foo.Bar /> / <icons.foo /> — only the ROOT object is a binding.
      const isMember = root.type === 'JSXMemberExpression';
      let node = root;
      while (node.type === 'JSXMemberExpression') node = node.object;
      // <svg:rect /> namespaced names reference no binding at all.
      if (node.type !== 'JSXIdentifier') return;
      const n = node.name;
      // The intrinsic-tag exemption applies ONLY to a bare lowercase tag (div,
      // span, path…), which React resolves as a string. The root of a MEMBER
      // expression is always a real binding whatever its case — `<icons.Foo />`
      // needs `icons` to exist, and exempting it by case let an undeclared root
      // through the gate.
      if (!isMember && !/^[A-Z]/.test(n)) return;
      if (BROWSER.has(n) || windowNames.has(n)) return;
      if (p.scope.hasBinding(n)) return;
      out.push(`${file}:${node.loc.start.line} :: <${isMember ? `${n}.…` : n}>`);
    },
  });
  return out;
}

test('broadsheet: every JSX component name resolves (lexical | browser | window)', () => {
  const unresolved = [];
  for (const [file, ast] of asts) unresolved.push(...unresolvedJsxNames(ast, file));
  assert.deepEqual([...new Set(unresolved)], [],
    'JSX component with no declaration, no browser global and no window export — this throws ReferenceError when the branch renders');
});

// The resolver's own regression suite. The directory scan above only proves the
// gate is quiet on today's source; these prove it still BITES.
test('broadsheet gate: the JSX resolver flags what it should, and only that', () => {
  const scan = (src) => unresolvedJsxNames(parse(src, { sourceType: 'module', plugins: ['jsx'] }), 't.jsx');

  // Caught: an undeclared component, and an undeclared MEMBER root — including a
  // lowercase one, which an uppercase-only filter silently skipped.
  assert.equal(scan('const A = () => <BSMissing />;').length, 1, 'undeclared component');
  assert.equal(scan('const A = () => <icons.Foo />;').length, 1, 'undeclared lowercase member root');
  assert.equal(scan('const A = () => <Icons.Foo />;').length, 1, 'undeclared capitalised member root');
  assert.equal(scan('const A = () => <a.b.c />;').length, 1, 'deep member chain resolves to its root');

  // Not caught: intrinsic tags, declared/imported bindings, params, namespaced.
  assert.deepEqual(scan('const A = () => <div><span /></div>;'), [], 'intrinsic host tags');
  assert.deepEqual(scan('import X from "x"; const A = () => <X />;'), [], 'imported component');
  assert.deepEqual(scan('const Y = 1; const A = () => <Y />;'), [], 'locally declared');
  assert.deepEqual(scan('import ic from "i"; const A = () => <ic.Foo />;'), [], 'declared member root');
  assert.deepEqual(scan('const A = ({ Cmp }) => <Cmp />;'), [], 'destructured prop component');
  assert.deepEqual(scan('const A = () => <svg:rect />;'), [], 'namespaced name is not a binding');
});

// ─────────────────────────────────────────────────────────────────────────────
// BSSettings: the corner avatar must reach the Settings ROOT from every takeover.
//
// WHY THIS EXISTS: the avatar routes to the Settings root by clearing whatever is
// selected above it. `detail` is one selector; the ~26 `showX` flags are the
// others, each with its own early return. The first fix cleared only `detail`, so
// on Notifications, About, Score — 24 more — the avatar stayed a no-op that still
// burned a back. Enumerating the flags fixes today; this fixes tomorrow, because
// the reset list and the early-return switch are two halves of one contract and
// nothing else notices when they drift. A new pane whose flag is not reset here
// fails this test instead of shipping another dead corner.
function bsSettingsFlagContract(ast) {
  let fn = null;
  traverse(ast, {
    FunctionDeclaration(p) { if (p.node.id?.name === 'BSSettings') fn = p; },
  });
  if (!fn) return null;

  // Flags that GATE the root: `if (showX) { return … }` at the function's top level.
  const gating = new Set();
  for (const stmt of fn.node.body.body) {
    if (stmt.type !== 'IfStatement' || stmt.test.type !== 'Identifier') continue;
    if (!/^show[A-Z]/.test(stmt.test.name)) continue;
    const body = stmt.consequent;
    const returns = body.type === 'ReturnStatement'
      || (body.type === 'BlockStatement' && body.body.some((s) => s.type === 'ReturnStatement'));
    if (returns) gating.add(stmt.test.name);
  }

  // Setters the shape:openProfile handler calls.
  const reset = new Set();
  fn.traverse({
    CallExpression(p) {
      const callee = p.node.callee;
      if (callee.type !== 'Identifier' || !/^setShow[A-Z]/.test(callee.name)) return;
      // Only count calls inside the listener registered for shape:openProfile.
      const eff = p.findParent((x) => x.isCallExpression()
        && x.node.callee.type === 'MemberExpression'
        && x.node.callee.property?.name === 'useEffect');
      if (!eff) return;
      // Identify the effect by its own AST, not getSource() — these ASTs are
      // parsed without the source attached, so getSource() returns ''.
      let isProfileListener = false;
      eff.traverse({ StringLiteral(s) { if (s.node.value === 'shape:openProfile') isProfileListener = true; } });
      if (!isProfileListener) return;
      reset.add(callee.name);
    },
  });

  return { gating, reset };
}

test('BSSettings: every takeover flag that hides the root is cleared on shape:openProfile', () => {
  const ast = asts.get('iosAppBroadsheetClient.jsx');
  assert.ok(ast, 'client module parsed');
  const contract = bsSettingsFlagContract(ast);
  assert.ok(contract, 'BSSettings found');
  assert.ok(contract.gating.size >= 20, `expected the full pane switch, saw ${contract.gating.size}`);

  const missing = [...contract.gating]
    .map((flag) => `set${flag[0].toUpperCase()}${flag.slice(1)}`)
    .filter((setter) => !contract.reset.has(setter))
    .sort();

  assert.deepEqual(missing, [],
    'a Settings pane early-returns above the root but its flag is never reset — the corner avatar is a dead control on that pane, and still burns a back');
});

// ─────────────────────────────────────────────────────────────────────────────
// BSApp: the ?crash=1 trigger must stay armed.
//
// WHY THIS EXISTS: one line arms the whole deliberate-crash feature —
// `{bsCrashTestRequested() && <BSCrashProbe />}` inside BSApp's tree, which the
// module's top-level render wraps in <BSErrorBoundary>. No test EXECUTES that
// line: tests/error-boundary-mount.test.mjs stubs `react-dom/client`, so BSApp
// never renders, and both probe tests mount BSCrashProbe directly inside the
// boundary. So moving it above the boundary, dropping it in a merge, or
// wrapping it in another condition makes `/m/?crash=1` silently render nothing
// while parse, tsc, both builds and every test stay green — surfacing only
// during the owner's post-DSN end-to-end gate, live, with no local repro.
//
// Shaped against the AST, not the source text: reformatting, line wrapping and
// added props can't break it, and a rename of either identifier can't sneak past.
function bsAppArmsCrashProbe(ast) {
  let fn = null;
  traverse(ast, {
    FunctionDeclaration(p) { if (p.node.id?.name === 'BSApp') fn = p; },
  });
  if (!fn) return { found: false, armed: false };

  let armed = false;
  fn.traverse({
    LogicalExpression(p) {
      if (p.node.operator !== '&&') return;
      const { left, right } = p.node;
      const guarded = left.type === 'CallExpression'
        && left.callee.type === 'Identifier'
        && left.callee.name === 'bsCrashTestRequested';
      if (!guarded) return;
      if (right.type !== 'JSXElement') return;
      const name = right.openingElement.name;
      if (name.type === 'JSXIdentifier' && name.name === 'BSCrashProbe') armed = true;
    },
  });
  return { found: true, armed };
}

test('BSApp: the ?crash=1 probe is still wired into the rendered tree', () => {
  const ast = asts.get('iosAppBroadsheetMain.jsx');
  assert.ok(ast, 'main module parsed');
  const { found, armed } = bsAppArmsCrashProbe(ast);
  assert.ok(found, 'BSApp found');
  assert.ok(armed,
    'BSApp no longer renders `bsCrashTestRequested() && <BSCrashProbe/>` — /m/?crash=1 is a no-op and the post-DSN e2e gate has nothing to pull');
});

test('BSApp crash-probe gate: the detector flags what it should, and only that', () => {
  const scan = (src) => bsAppArmsCrashProbe(parse(src, { sourceType: 'module', plugins: ['jsx'] }));

  // Armed, in every formatting the source could legitimately take.
  assert.deepEqual(scan('function BSApp(){ return <div>{bsCrashTestRequested() && <BSCrashProbe />}</div>; }'), { found: true, armed: true });
  assert.deepEqual(scan('function BSApp(){ return <div>{\n  bsCrashTestRequested()\n  && <BSCrashProbe key="x" />\n}</div>; }'), { found: true, armed: true }, 'formatting-tolerant');
  assert.deepEqual(scan('function BSApp(){ return <A><B>{bsCrashTestRequested() && <BSCrashProbe />}</B></A>; }'), { found: true, armed: true }, 'nesting-tolerant');

  // Disarmed — each of the ways this line has plausibly rotted.
  assert.deepEqual(scan('function BSApp(){ return <div><BSAppShell /></div>; }'), { found: true, armed: false }, 'dropped in a merge');
  assert.deepEqual(scan('function BSApp(){ return <div>{bsCrashTestRequested() && <BSMemHud />}</div>; }'), { found: true, armed: false }, 'guard kept, probe swapped');
  assert.deepEqual(scan('function BSApp(){ return <div>{devMode && <BSCrashProbe />}</div>; }'), { found: true, armed: false }, 'probe kept, guard swapped');
  // Moved OUT of BSApp (e.g. above the boundary at module scope) — the class of
  // regression the mount test's `props.children` assertion cannot see either.
  assert.deepEqual(scan('function BSApp(){ return <div />; }\nconst R = <div>{bsCrashTestRequested() && <BSCrashProbe />}</div>;'), { found: true, armed: false }, 'moved outside BSApp');
  assert.deepEqual(scan('const x = 1;'), { found: false, armed: false }, 'BSApp itself renamed/removed');
});
