// BSIntegrationsPage.jsx is the first feature carved out of iosAppBroadsheetClient.jsx
// as a real ES import (2026-09-30). The module system it lands in is the app's
// window-globals load order — modules expose components via Object.assign(window,…)
// and consume them via `const {…} = window` — and a static import evaluates BEFORE
// the importing module's body has run. So the one way this extraction breaks is a
// top-level window read in the new file capturing `undefined` (React error #130 on
// first open, in production, with parse/tsc/build all green). This file pins the
// shape that avoids it, and the two seams the rest of the app relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadBroadsheet, drive } from './helpers/broadsheet-mount.mjs';

const NEW = 'mobile-app/src/broadsheet/BSIntegrationsPage.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const page = stripComments(fs.readFileSync(NEW, 'utf8'));
const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));
const pros = stripComments(fs.readFileSync(PROS, 'utf8'));

const EXPORTED = ['BSReconcile', 'BSIntegrationsPage'];

test('the module exports the two components and declares them nowhere else', () => {
  for (const n of EXPORTED) {
    assert.match(page, new RegExp(`^export function ${n}\\(`, 'm'), `${n} is not exported from the new module`);
    assert.doesNotMatch(client, new RegExp(`^(?:export )?function ${n}\\(`, 'm'), `${n} is declared in the client module again — the extraction is being undone`);
  }
});

test('no window global is read at module top — every read is inside a component body', () => {
  // A top-level `const { … } = window` (single- or multi-line) is the defect.
  assert.doesNotMatch(page, /^const\s*\{[^}]*\}\s*=\s*window\b/m, 'a top-level window destructure captures undefined for anything the client module exposes later');
  assert.doesNotMatch(page, /^(?:const|let|var)\s+\w+\s*=\s*window\./m, 'a top-level window read is the same defect in another spelling');
  // And each component opens by naming the globals it uses.
  for (const n of EXPORTED) {
    const re = new RegExp(`^export function ${n}\\([^)]*\\) \\{\\n  const \\{ ([^}]+) \\} = window;`, 'm');
    const m = re.exec(page);
    assert.ok(m, `${n} does not read its window globals on its first line`);
    const names = m[1].split(',').map((s) => s.trim());
    assert.ok(names.includes('useBS'), `${n} must take the theme hook from window at call time`);
  }
  // BSIntegrationsPage renders the client module's own BSDetailHeader, which is
  // exactly the name a top-level read would have captured as undefined.
  assert.match(page, /^export function BSIntegrationsPage\([^)]*\) \{\n  const \{ [^}]*\bBSDetailHeader\b[^}]* \} = window;/m);
});

test('the module carries its own translator, bound the way the i18n ratchet recognises', () => {
  // tests/i18n-surface-inventory.test.mjs counts a translator only when bound as
  // `const tr = use…Tr()`; a `tr` passed as a prop would silently drop the page out
  // of the covered set. Every feature module carries this copy for that reason.
  assert.match(page, /^function useShapeTr\(\) \{/m, 'the module has no useShapeTr()');
  const body = page.slice(page.indexOf('export function BSIntegrationsPage('));
  assert.match(body, /const tr = useShapeTr\(\);/, 'BSIntegrationsPage must bind tr from useShapeTr()');
  // The i18n store is read in exactly one place — inside the hook. A second read
  // is a component translating around the ratchet's recognition rule.
  assert.equal((page.match(/window\.ShapeI18n/g) || []).length, 1, 'window.ShapeI18n must be read only inside useShapeTr()');
});

test('the module imports nothing from the client module (no import cycle) and only react', () => {
  const imports = [...page.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react'], `unexpected imports: ${imports.join(', ')}`);
});

test('the client module imports both and keeps BSReconcile on window for the coach module', () => {
  assert.match(client, /^import \{ BSIntegrationsPage, BSReconcile \} from '\.\/BSIntegrationsPage\.jsx';/m, 'the client module no longer imports the extracted components');
  // The coach module renders the reconcile sheet off window — the seam that makes
  // the re-exposure load-bearing rather than tidy.
  assert.match(pros, /window\.BSReconcile/, 'the pros module no longer reads window.BSReconcile; re-check whether the exposure is still needed');
  const expose = client.match(/Object\.assign\(window,\s*\{([\s\S]*?)\}\)/g) || [];
  assert.ok(expose.length >= 1, 'no Object.assign(window, …) block found in the client module');
  assert.ok(expose.some((b) => /\bBSReconcile\b/.test(b)), 'BSReconcile is no longer exposed on window by the client module');
  // The settings door still opens the page.
  assert.match(client, /<BSIntegrationsPage onBack=/, 'the Settings door no longer renders BSIntegrationsPage');
});

test('the page renders through the client module, with its window globals resolved at call time', async () => {
  // The Node twin of the browser drive: loadBroadsheet evaluates the client module
  // (which compiles the .jsx sibling through the same pipeline and runs the
  // Object.assign(window, …) that publishes BSDetailHeader / BSSection), and the
  // page is then rendered. A top-level window read in the sibling would have
  // captured undefined here exactly as it would in the app — React #130's Node
  // shape is an element whose type is undefined.
  const { BSIntegrationsPage, BSReconcile } = await loadBroadsheet(['BSIntegrationsPage', 'BSReconcile']);
  assert.equal(typeof BSIntegrationsPage, 'function');
  assert.equal(typeof BSReconcile, 'function');
  assert.equal(typeof globalThis.window.BSDetailHeader, 'function', 'the client module did not publish BSDetailHeader');
  // BSSection is published by the shared chrome module (iosAppBroadsheet.jsx), which
  // the shell loaders run BEFORE the client module and which this harness never
  // loads — so it is stubbed here, deliberately AFTER loadBroadsheet: a top-level
  // read in the sibling would already have captured undefined by now, so the stub
  // cannot rescue the defect this test exists to catch. (drive renders one level
  // deep, so the stub body is never invoked; only its identity is asserted on.)
  globalThis.BSSection ??= () => null;
  const d = drive(BSIntegrationsPage, { onBack() {} });
  const nodes = d.nodes();
  assert.ok(nodes.every((n) => n.type !== undefined), 'an element with an undefined type rendered — a window global was read before the client module published it');
  assert.ok(nodes.some((n) => n.type === globalThis.window.BSDetailHeader), 'the page header is not the client module\'s own BSDetailHeader');
  assert.ok(nodes.some((n) => n.type === globalThis.window.BSSection && n.props.title === 'WHOOP'), 'the WHOOP section did not render');
  assert.ok(nodes.some((n) => n.type === globalThis.window.BSSection && n.props.title === 'Strava'), 'the Strava section did not render');
  // The intro copy is a CHILD of the page (drive walks children, not props like
  // `trailing`), and it reaches the tree only through the module's own tr() fallback.
  assert.match(d.text, /Connect health, activity, and music platforms/, 'the intro did not render through the translator fallback');
});
