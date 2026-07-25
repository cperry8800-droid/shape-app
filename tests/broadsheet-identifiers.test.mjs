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
