// An aisle is a TOKEN and a LABEL, and they must not be the same string.
//
// ⚠ WHY THIS FILE EXISTS. `aisle` is not a heading. It is stored on every item of
// every saved grocery list, it is the grouping key, and — the part that bites —
// it is compared against a freshly-classified aisle whenever an item is added:
//
//     aisles.findIndex(a => a.aisle === bsGroceryAisleFor(name))
//
// So dropping a tr() on the classifier's output does not merely rename a header.
// A list saved in English and reopened in Spanish stops matching its own groups,
// and every added item forks a duplicate aisle — silently, in twelve locales,
// with parse, tsc, the suite and the build all green. That is cut 5's Train-tag
// lesson at another place where the id and the word had been one string, and the
// answer is the same: the token stays canonical English, `bsAisleLabel` is the
// only thing a member ever reads.
//
// The source is a browser-babel JSX module that cannot be imported, so the pure
// half is extracted from the SHIPPED file and evaluated (the technique
// tests/grocery-record-shape.test.mjs already uses on this same file); the
// readers are pinned as source assertions, because they sit inside a ~30k-line
// component with no seam to mount.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const src = fs.readFileSync(SRC, 'utf8');

// ⚠ EVERY SOURCE ASSERTION BELOW READS THE COMMENT-STRIPPED FILE. The rationale
// written at each site quotes the very calls these tests ban; this repo has paid
// for that trap twice already in this wave.
const code = stripComments(src);

// ── Extract the pure half by brace-matching the SHIPPED source ──────────────
// ⚠ The marker is the FULL declaration head — a bare name would match a call
// site and the body scan would start at the wrong brace.
function extractFn(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in the shipped source: ${marker}`);
  assert.equal(src.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

function extractConst(name) {
  const marker = `const ${name} = {`;
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `${name} not found`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1) + ';';
  }
  throw new Error('unbalanced');
}

const { bsTrainT } = await import('../mobile-app/src/broadsheet/bsClientWeekDemo.js');

const { BS_AISLE_KEY, bsAisleLabel } = new Function(
  [
    extractConst('BS_AISLE_KEY'),
    extractFn('function bsAisleLabel('),
    'return { BS_AISLE_KEY, bsAisleLabel };',
  ].join('\n'),
)();

/** A translator that answers every key with a marker no English token equals. */
const shouty = (key) => `«${key}»`;

// ── The split itself ────────────────────────────────────────────────────────

test('guard-the-guard: the map and the mapper both exist and are non-trivial', () => {
  assert.equal(typeof bsAisleLabel, 'function', 'bsAisleLabel is gone — re-point this guard');
  const tokens = Object.keys(BS_AISLE_KEY);
  assert.ok(tokens.length >= 10, `BS_AISLE_KEY holds ${tokens.length} tokens — expected the full taxonomy`);
  for (const [token, key] of Object.entries(BS_AISLE_KEY)) {
    assert.match(key, /^nutrition:aisle\./, `${token} is not keyed under nutrition:aisle.*`);
    assert.notEqual(key, token, `${token} maps to itself — the split is not doing anything`);
  }
});

test('the token survives translation; only the label moves', () => {
  const T = bsTrainT(shouty);
  for (const [token, key] of Object.entries(BS_AISLE_KEY)) {
    const label = bsAisleLabel(token, T);
    assert.equal(label, `«${key}»`, `${token} did not route through its key`);
    assert.notEqual(label, token, `${token} rendered as its own token`);
  }
});

test('an unknown aisle renders as itself — never a raw key, never blank', () => {
  // A nutritionist's hand-authored aisle arrives as free text. It has no key by
  // construction, so it must render as itself — never a raw key, never blank.
  const T = bsTrainT(shouty);
  assert.equal(bsAisleLabel('Sundries', T), 'Sundries');
  assert.equal(bsAisleLabel('', T), '');
  assert.equal(bsAisleLabel(null, T), '');
});

test('with no translator at all it degrades to the shipped English', () => {
  const T = bsTrainT(null);
  for (const token of Object.keys(BS_AISLE_KEY)) {
    assert.equal(bsAisleLabel(token, T), token, 'the no-catalog path must degrade to the English that shipped');
  }
});

// ── Coverage: every token the code can EMIT has a key ───────────────────────

test('BS_AISLE_KEY covers every aisle token the code can produce', () => {
  // Derived from the source, never hand-listed: a new aisle added to a
  // classifier without a key would otherwise render its raw English forever.
  const region = (startRe, endRe) => {
    const lines = code.split('\n');
    const from = lines.findIndex((l) => startRe.test(l));
    assert.ok(from >= 0, `region not found: ${startRe}`);
    let to = lines.length;
    for (let i = from + 1; i < lines.length; i++) if (endRe.test(lines[i])) { to = i; break; }
    return lines.slice(from, to + 1).join('\n');
  };

  const emitted = new Set();
  // 1. The plan classifier's table + its 'Other'/'Pantry' returns.
  const planTable = region(/^const BS_GROCERY_AISLES/, /^\];/);
  for (const m of planTable.matchAll(/aisle:\s*'([^']+)'/g)) emitted.add(m[1]);
  const planFn = extractFn('function bsGroceryAisleFor(');
  for (const m of stripComments(planFn).matchAll(/return\s+'([^']+)'/g)) emitted.add(m[1]);
  // 2. The builder's own table + the pill list it renders.
  const buildTable = region(/^const BS_BUILDER_AISLE_RE/, /^\];/);
  for (const m of buildTable.matchAll(/\['([^']+)'\s*,/g)) emitted.add(m[1]);
  const pills = code.match(/const AISLES = \[([^\]]+)\]/);
  assert.ok(pills, 'the builder AISLES pill list is gone — re-point this guard');
  for (const m of pills[1].matchAll(/'([^']+)'/g)) emitted.add(m[1]);
  // 3. The two the normalizer stamps on a recipe / library list.
  const norm = extractFn('function bsNormalizeGroceryList(');
  for (const m of stripComments(norm).matchAll(/aisle:\s*([^\n]*?),\s*$/gm)) {
    // ⚠ STRIP THE COMPARISON OPERANDS FIRST. The normalizer picks its aisle with
    // a ternary — `list.kind === 'recipe' ? 'Recipe ingredients' : 'Library items'`
    // — and 'recipe' there is the DISCRIMINANT, not an aisle. Collecting every
    // quoted string on the line would demand a catalog key for it and fail on a
    // correct tree. What separates the two is the comparison, so drop its
    // right-hand side and keep what is actually assigned.
    const assigned = m[1].replace(/[=!]==?\s*'[^']*'/g, '');
    for (const q of assigned.matchAll(/'([^']+)'/g)) emitted.add(q[1]);
  }

  // ⚠ THERE IS NO OMISSION HERE, AND THE ONE THIS GUARD SHIPPED WITH IS WHY.
  // It deleted 'Items' on the reasoning that BSGrocery skips an empty aisle, so
  // the seeded placeholder had no reader. True of the EMPTY list and false the
  // moment a member types into it — addItem pushes into aisles[0], which for a
  // list from confirmCreateGroceryList IS 'Items'. So the exclusion hid the one
  // live path this scan exists to find. Every token the source can emit is
  // checked; a token that genuinely cannot be rendered should be deleted from
  // the source, not from the guard.
  assert.ok(emitted.size >= 10, `only ${emitted.size} aisle tokens discovered — the scan is broken, not the tree`);
  const missing = [...emitted].filter((a) => !(a in BS_AISLE_KEY));
  assert.deepEqual(missing, [], `aisle tokens with no catalog key — they will render English forever: ${missing.join(', ')}`);
});

test('every BS_AISLE_KEY key is authored in every shipped catalog', () => {
  const LOCALES = fs.readdirSync(path.join(ROOT, 'mobile-app/src/i18n/catalogs'));
  assert.ok(LOCALES.length >= 13, `only ${LOCALES.length} locales found`);
  for (const loc of LOCALES) {
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, `mobile-app/src/i18n/catalogs/${loc}/nutrition.json`), 'utf8'));
    for (const key of Object.values(BS_AISLE_KEY)) {
      const short = key.split(':')[1];
      assert.ok(typeof cat[short] === 'string' && cat[short].trim(), `${loc}/nutrition.json is missing ${short}`);
    }
  }
});

// ── The readers: each side read by the right consumer ───────────────────────

test('the add-item lookup compares the TOKEN, never the label', () => {
  // This is the comparison that would fork a duplicate aisle per added item.
  const finds = [...code.matchAll(/const findAisle = [^\n]+/g)].map((m) => m[0]);
  assert.ok(finds.length >= 2, `only ${finds.length} findAisle lookups found — the pattern is broken, not the tree`);
  for (const f of finds) {
    assert.match(f, /a\.aisle === /, 'the aisle lookup stopped comparing the stored token');
    assert.doesNotMatch(f, /bsAisleLabel/, 'the aisle lookup compares a TRANSLATED label — grouping is now locale-dependent');
  }
});

test('nothing that STORES or KEYS an aisle stores a label', () => {
  // The record, the grouping keys and the open/closed set must all hold tokens.
  const banned = [
    [/aisle:\s*bsAisleLabel/, 'a saved item stores the translated label instead of the token'],
    [/openAisles\.(has|add|delete)\(bsAisleLabel/, 'the open/closed set is keyed on a translated label'],
    [/toggleAisle\(bsAisleLabel/, 'the collapse toggle is keyed on a translated label'],
    [/filledAisleNames[^\n]*bsAisleLabel/, 'the aisle-name list holds labels rather than tokens'],
  ];
  for (const [re, why] of banned) assert.doesNotMatch(code, re, why);
});

test('every place a member READS an aisle routes through bsAisleLabel', () => {
  // The four render sites: the checklist header + its aria-label, the builder's
  // pills and its per-item line, and the Eat door's meta line.
  const sites = [
    [/aria-label=\{`\$\{bsAisleLabel\(aisle\.aisle, TG\)\}/, 'the checklist header aria-label'],
    [/>\{bsAisleLabel\(aisle\.aisle, TG\)\}</, 'the checklist aisle header'],
    [/>\{bsAisleLabel\(al, TB\)\}</, "the builder's aisle pills"],
    [/>\{bsAisleLabel\(it\.aisle, TB\)\}</, "the builder's per-item aisle line"],
    [/map\(a => bsAisleLabel\(a\.aisle, TA\)\)/, "the Eat tab's shop-list door"],
  ];
  for (const [re, what] of sites) assert.match(code, re, `${what} renders the raw token instead of the label`);
});

// ── No case transform runs over translated text ─────────────────────────────

test('the share text upper-cases with a locale, and the door does not lower-case at all', () => {
  // ⚠ toUpperCase()/toLowerCase() are LOCALE-INSENSITIVE — the Turkish dotted/
  // dotless i class this repo has already paid for. These two lines are the only
  // places a case transform ever touched an aisle name, and now that the name is
  // translated they are the only places it could corrupt one.
  const share = code.split('\n').find((l) => l.includes('bsAisleLabel(a.aisle, TG)'));
  assert.ok(share, 'the share-text line is gone — re-point this guard');
  assert.match(share, /toLocaleUpperCase\(bsDateLocale\(\)\)/, 'the share text upper-cases translated text without a locale');
  assert.doesNotMatch(share, /\.toUpperCase\(\)/, 'the share text still calls the locale-insensitive toUpperCase()');

  const door = code.split('\n').find((l) => l.includes('bsAisleLabel(a.aisle, TA)'));
  assert.ok(door, "the Eat door's aisle meta line is gone — re-point this guard");
  assert.doesNotMatch(door, /toLowerCase|toLocaleLowerCase/,
    'the shop-list door lower-cases translated aisle names — how a name sits in a meta line is the catalog’s call, not a transform’s');
});

test("a member-created list's first typed item lands in a KEYED aisle", () => {
  // ⚠ THE PATH CODEX FOUND, PINNED SO IT CANNOT GO QUIET AGAIN. Two facts have
  // to hold together for a new custom list to render an English header in
  // twelve locales, and neither is obvious from the other's site:
  //   1. confirmCreateGroceryList seeds  aisles: [{ aisle: 'Items', items: [] }]
  //   2. BSGrocery's addItem does NOT classify — it pushes into aisles[0]
  // So the first item a member types into their own list lands in 'Items', the
  // aisle stops being empty, and BSGrocery renders its header. This asserts the
  // two facts AND that the token they land on is keyed — so if either changes,
  // the assertion that no longer holds says which one moved.
  const seed = src.match(/aisles:\s*\[\{\s*aisle:\s*'([^']+)'\s*,\s*items:\s*\[\]\s*\}\]/);
  assert.ok(seed, 'confirmCreateGroceryList no longer seeds a single empty aisle — re-point this guard');
  const seeded = seed[1];

  // ⚠ BSGroceryBuilder has an addItem too, and it DOES classify (its own aisle
  // picker, auto-sorted by bsBuilderAisleFor). So the marker carries the line
  // ABOVE to name BSGrocery's — the one that does not — while still ending at
  // the opening brace extractFn matches from.
  const add = extractFn("  const [newQty, setNewQty] = useStateBSC('');\n  const addItem = () => {");
  assert.match(add, /aisles\[0\]/, 'addItem no longer files into aisles[0] — re-check whether the seeded aisle is still reachable');
  assert.doesNotMatch(stripComments(add), /bsGroceryAisleFor/,
    'addItem now classifies: good, and this guard should be re-pointed at where the seeded aisle can still surface');

  assert.ok(seeded in BS_AISLE_KEY,
    `the seeded aisle '${seeded}' has no catalog key, and a member's first typed item makes it visible`);
});
