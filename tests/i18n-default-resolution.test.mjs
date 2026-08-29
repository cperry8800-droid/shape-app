// Every key the broadsheet ASKS FOR exists in `en`, and every English fallback
// written at a call site still matches the catalog value twelve locales translated.
//
// ⚠ THE TWO CUTS SHIPPED SO FAR FAIL DIFFERENTLY, AND ONLY ONE OF THEM IS LOUD.
// BSSession passes NO defaultValue, so a key `en` lacks renders the RAW KEY — the
// mount test sees it. The meal logger passes one at every call site, which is the
// safer render (English, not `nutrition:log.cta`) and the SILENT failure: the key
// is absent from `en`, so the parity gate — which only compares the twelve locales
// AGAINST `en` — stays green while the string is English in all thirteen. That is
// exactly how three `home:lead.*` families shipped unauthored (see the 2026-08-29
// changelog), and the sweep that wrote this file found six more on Home and a
// fifteen-key `marketplace:preview.*` family doing it today.
//
// So this asserts BOTH directions of the seam a defaultValue creates:
//   · the key resolves in `en`         — or the string is English forever
//   · the fallback EQUALS `en`'s value — or the code and the catalog have forked,
//     and the catalog is what actually renders, so the call site is the stale copy
// The second is what keeps a mechanically-derived catalog derived: cut 3 built
// en/nutrition.json from the source's own defaults, and nothing but this stops a
// later edit to one of them from silently forking the two.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as babelParser from '@babel/parser';

const DIRS = ['mobile-app/src/broadsheet', 'mobile-app/src/services'];
const CAT = 'mobile-app/src/i18n/catalogs/en';
const TR = /^(tr|trG|t2|coachTr)$/;

// ⚠ AN UNPREFIXED KEY RESOLVES AGAINST THE COMPONENT'S OWN `useTr(ns)` BINDING,
// which this walk does not follow. Three files use that form and all three bind
// 'onboarding'. Asserted exhaustively below rather than assumed: a fourth file
// adopting it would otherwise have every one of its keys silently skipped.
const DEFAULT_NS = new Map([
  ['iosAppBroadsheetMain.jsx', 'onboarding'],
  ['BSDobGate.jsx', 'onboarding'],
  ['BSLanguagePicker.jsx', 'onboarding'],
]);

// ⚠ A RATCHET, NOT AN EXEMPTION. These keys are asked for and `en` does not have
// them, so they render English in all thirteen locales today. Recorded exactly so
// the gap is measured instead of unknown: authoring them fails here until the line
// is deleted, and a SIXTEENTH unauthored key fails here the day it lands.
const UNAUTHORED = [
  'marketplace:preview.action', 'marketplace:preview.aria', 'marketplace:preview.buy',
  'marketplace:preview.eyebrowMenu', 'marketplace:preview.eyebrowProgram',
  'marketplace:preview.eyebrowSession', 'marketplace:preview.locked',
  'marketplace:preview.meals', 'marketplace:preview.moves', 'marketplace:preview.noOutline',
  'marketplace:preview.outline', 'marketplace:preview.perDay', 'marketplace:preview.perWeek',
  'marketplace:preview.rest', 'marketplace:preview.weeks',
];

const CATS = new Map();
function catalog(ns) {
  if (!CATS.has(ns)) {
    const p = path.join(CAT, `${ns}.json`);
    CATS.set(ns, fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
  }
  return CATS.get(ns);
}

// ⚠ THE PURE MODULES COUNT, AND LEAVING THEM OUT IS HOW THIS GUARD FIRST PASSED
// A MUTATION. `mobile-app/src/services` is where the injected-translator wrappers
// live — the wire's telegram body and the meal logger's CTA labels — so a walk over
// the .jsx tree alone reported clean while `nutrition:log.ctaAsPlanned` was deleted
// out from under its only caller. Two wrapper shapes, both taking the English as the
// argument after the key: T('ns:key', 'English') in dailyWire, and the
// translator-injected T(tr, 'ns:key', 'English') in mealLoggerState.
/** Every tr()/T() call in the tree that names its key with a string literal. */
function calls() {
  const out = [];
  const files = DIRS.flatMap((d) => fs.readdirSync(d)
    .filter((f) => f.endsWith('.jsx') || f.endsWith('.mjs'))
    .sort().map((f) => ({ dir: d, file: f })));
  for (const { dir, file } of files) {
    const ast = babelParser.parse(fs.readFileSync(path.join(dir, file), 'utf8'),
      { sourceType: 'module', plugins: ['jsx'] });
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'T') {
        // The key is the first string literal; the English is whatever follows it.
        // Found by position rather than by arity, so the injected-translator shape
        // and the bare shape read identically here.
        const i = n.arguments.findIndex((x) => x.type === 'StringLiteral');
        if (i >= 0) {
          const next = n.arguments[i + 1];
          out.push({ file, key: n.arguments[i].value, dv: next?.type === 'StringLiteral' ? next.value : null });
        }
      }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && TR.test(n.callee.name)) {
        const [a, b] = n.arguments;
        if (a && a.type === 'StringLiteral') {
          // A computed or template defaultValue can't be compared to a catalog
          // string; the key check below still applies to it.
          let dv = null;
          if (b && b.type === 'ObjectExpression') {
            for (const p of b.properties) {
              if (p.type === 'ObjectProperty' && !p.computed
                && (p.key.name === 'defaultValue' || p.key.value === 'defaultValue')) {
                dv = p.value.type === 'StringLiteral' ? p.value.value : null;
              }
            }
          }
          out.push({ file, key: a.value, dv });
        }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c); }
        else if (v && typeof v.type === 'string') walk(v);
      }
    })(ast.program);
  }
  return out;
}

function split(file, key) {
  const i = key.indexOf(':');
  if (i >= 0) return [key.slice(0, i), key.slice(i + 1)];
  return [DEFAULT_NS.get(file) ?? null, key];
}

test('every literal key the broadsheet asks for exists in en', () => {
  const found = calls();
  // Guard-the-guard: a walk that resolves nothing would pass every assertion below.
  assert.ok(found.length > 3000, `only ${found.length} literal-key calls found — the walk broke`);

  const unresolvable = found.filter((c) => split(c.file, c.key)[0] === null);
  assert.deepEqual([...new Set(unresolvable.map((c) => c.file))], [],
    'a file started using useTr(ns) with unprefixed keys — add it to DEFAULT_NS or its keys go unchecked');

  const missing = new Set();
  for (const c of found) {
    const [ns, rest] = split(c.file, c.key);
    const cc = catalog(ns);
    if (cc === null) { missing.add(`${ns}:${rest}`); continue; }
    if (!(rest in cc)) missing.add(c.key.includes(':') ? c.key : `${ns}:${rest}`);
  }
  assert.deepEqual([...missing].sort(), [...UNAUTHORED].sort(),
    'a key the code asks for is absent from en — it renders English in ALL THIRTEEN locales, and the parity gate cannot see it (it only compares the twelve against en)');
});

test('an English fallback at a call site still matches the catalog value', () => {
  const drifted = [];
  for (const c of calls()) {
    if (c.dv === null) continue;
    const [ns, rest] = split(c.file, c.key);
    const cc = catalog(ns);
    if (!cc || !(rest in cc)) continue;      // covered by the test above
    if (cc[rest] !== c.dv) drifted.push(`${c.file} ${c.key}\n    catalog: ${JSON.stringify(cc[rest])}\n    source:  ${JSON.stringify(c.dv)}`);
  }
  assert.deepEqual(drifted, [],
    'a call site’s defaultValue no longer matches en — the CATALOG is what renders, so the call site is the stale copy');
});
