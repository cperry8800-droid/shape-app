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
