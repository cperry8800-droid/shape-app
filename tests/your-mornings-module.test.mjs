// tests/your-mornings-module.test.mjs
//
// BSYourMornings.jsx is a feature module carved out the way BSIntegrationsPage.jsx and
// BSLeaderboard.jsx were (tests/integrations-page-module.test.mjs): a static import of the client
// module, which evaluates BEFORE the client's body has published its window globals. So the one way
// it breaks in production with parse, tsc and build all green is a window read at module top (React
// error #130 on first open). This pins that shape, the one-way import from the card, and the seams
// the client relies on: it imports the page and its Progress door, and renders both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './helpers/strip-comments.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const PAGE = 'mobile-app/src/broadsheet/BSYourMornings.jsx';
const CARD = 'mobile-app/src/broadsheet/BSCheckinCard.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const page = stripComments(fs.readFileSync(PAGE, 'utf8'));
const card = stripComments(fs.readFileSync(CARD, 'utf8'));

const COMPONENTS = ['BSYourMornings', 'BSMorningsDoor'];
const EXPORTED = [...COMPONENTS, 'bsMorningsSample', 'bsMorningsDirection', 'bsMorningsHeadline'];

test('evaluating the module by itself reads NO window global, whatever the spelling', async () => {
  // A `window` that records every read: the module is evaluated alone (the card it imports with it),
  // so whatever it reads now is read before the client module has published anything.
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(path.resolve(PAGE));
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.deepEqual(Object.keys(mod).sort(), [...EXPORTED].sort(), 'the module evaluated but does not export what the client and the tests import');
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated: that runs before the client module has published its globals (React #130 on first open)`);
});

test('each component opens by naming the window globals it uses, at call time', () => {
  for (const n of COMPONENTS) {
    const m = new RegExp(`^export function ${n}\\([^)]*\\) \\{\\n  const \\{ ([^}]+) \\} = window;`, 'm').exec(page);
    assert.ok(m, `${n} does not read its window globals on its first line`);
    assert.ok(m[1].split(',').map((s) => s.trim()).includes('useBS'), `${n} must take the theme hook from window at call time`);
  }
  // The page renders the client module's own chrome, exactly the names a top-level read would capture
  // as undefined, and Nora's link that closes What we've noticed (part 3).
  assert.match(page, /^export function BSYourMornings\([^)]*\) \{\n  const \{ useBS, BSPage, BSDetailHeader, BSAskNoraLink \} = window;/m);
  // Nora's screen is named through the client's bsNoraOpen, read when the effect runs, never at load.
  assert.match(page, /\n    const off = window\.bsNoraOpen\?\.\(\{ page: 'Your mornings', label: noraLabel \}, noraOwner\.current\);\n    return typeof off === 'function' \? off : undefined;\n/);
  // And never the client-local helpers the test harness happens to put on window (useStateBSC,
  // _bsScrollTopOnMount, useBSPinnedMastTop): in the app they are not there.
  assert.doesNotMatch(page, /window\.(useStateBSC|_bsScrollTopOnMount|useBSPinnedMastTop|BSCycleTodayChip|BSSleepHistory)\b/);
  assert.doesNotMatch(page, /\b(useStateBSC|_bsScrollTopOnMount|useBSPinnedMastTop)\(/);
});

test('the module carries its own translator, bound the way the i18n ratchet recognises', () => {
  assert.match(page, /^function useShapeTr\(\) \{/m, 'the module has no useShapeTr()');
  for (const n of COMPONENTS) {
    const body = page.slice(page.indexOf(`export function ${n}(`));
    assert.match(body.slice(0, 400), /\n  const tr = useShapeTr\(\);/, `${n} must bind tr from useShapeTr()`);
  }
  // The catalog is read in one place, inside the hook.
  assert.equal((page.match(/window\.ShapeI18n\?\.t\b/g) || []).length, 1, 'window.ShapeI18n.t must be read only inside useShapeTr()');
});

test('the module imports react, the card, the readiness and patterns modules, and the card never imports it back', () => {
  // morningPatterns.mjs (part 3) counts What we've noticed: pure, so Nora's server read runs it too.
  const imports = [...page.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['react', './BSCheckinCard.jsx', '../services/morningReadiness.mjs', '../services/morningPatterns.mjs'], `unexpected imports: ${imports.join(', ')}`);
  // react-dom is stubbed as { createPortal } in the client harnesses; the page needs none of it.
  assert.doesNotMatch(page, /from 'react-dom/);
  const cardImports = [...card.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.ok(!cardImports.some((s) => /BSYourMornings/.test(s)), 'BSCheckinCard.jsx imports the page: an import cycle');
  assert.doesNotMatch(page, /iosAppBroadsheetClient/, 'the page imports the client module');
});

test('the page reads by date, in the member\'s words: no undated kpis, no UTC days, no /10', () => {
  assert.doesNotMatch(page, /\bkpis\b/, "the page reads the progress route's undated kpis (§7: newest however old)");
  assert.doesNotMatch(page, /toISOString|getUTC|Date\.UTC/, 'a member day was built through UTC');
  assert.doesNotMatch(page, /\/\s?10\b|of 10\b/, 'the page writes a 1-10 figure');
  // Every stored value becomes a word through the card's rule, never a copy of it.
  assert.doesNotMatch(page, /Math\.ceil\(/, 'the page carries its own word rule');
  assert.match(page, /bsCiWordIndex/);
});

test('the client imports the page and its Progress door, and renders both', async () => {
  // Package F of part 2 wires these; until it lands this is the one test here that fails.
  const client = stripComments(fs.readFileSync(CLIENT, 'utf8'));
  assert.match(client, /^import \{[^}]*\bBSYourMornings\b[^}]*\} from '\.\/BSYourMornings\.jsx';/m, 'the client module does not import BSYourMornings');
  assert.match(client, /^import \{[^}]*\bBSMorningsDoor\b[^}]*\} from '\.\/BSYourMornings\.jsx';/m, 'the client module does not import BSMorningsDoor');
  assert.match(client, /<BSYourMornings onBack=/, 'nothing renders the page');
  assert.match(client, /<BSMorningsDoor onOpen=/, 'Progress does not render the door');
  assert.doesNotMatch(client, /^(?:export )?function (BSYourMornings|BSMorningsDoor)\(/m, 'the page is declared in the client module again');

  // Rendered through the client, with its window globals resolved at call time: a top-level read in
  // the page would have captured undefined here, as it would in the app (an element whose type is
  // undefined). The harness signs nobody in, so the page is the example.
  const { loadBroadsheet, drive } = await import('./helpers/broadsheet-mount.mjs');
  const { BSYourMornings, BSMorningsDoor } = await loadBroadsheet(['BSYourMornings', 'BSMorningsDoor']);
  assert.equal(typeof globalThis.window.BSDetailHeader, 'function', 'the client module did not publish BSDetailHeader');
  const d = drive(BSYourMornings, { onBack() {} });
  const nodes = d.nodes();
  assert.ok(nodes.every((n) => n.type !== undefined), 'an element with an undefined type rendered: a window global was read before the client published it');
  assert.ok(nodes.some((n) => n.type === globalThis.window.BSDetailHeader), "the page's header is not the client module's BSDetailHeader");
  assert.match(d.text, /Example mornings\. Join Shape to see your own\./);
  const door = drive(BSMorningsDoor, { onOpen() {} });
  assert.match(door.text, /Your mornings/);
});
