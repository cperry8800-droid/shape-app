// The primary goal is a TOKEN and a LABEL, and they must not be the same string.
//
// ⚠ WHY THIS FILE EXISTS. `primaryGoal` is not a heading. It is STORED in the
// member's own goal doc (client_goals.primaryGoal), COMPARED against the
// picker's chip list on every render, rendered as the Goals page H1, and keyed
// into BSIntentStep's IDENTITY map. A tr() on the chip's VALUE would freeze one
// language into the member's record: pick "Lose fat" in Spanish and a later
// English session matches no chip and shows an untranslated H1. That is cut 5's
// Train-tag and cut 6's grocery-aisle class at a third site, and the answer is
// the same — the id is canonical, bsPrimaryGoalLabel is the only thing read.
//
// ⚠ AND THE LABEL DOES NOT GO WHERE THE TOKEN GOES, which is what makes this
// split different from the aisle's. Both writers ALSO mirror the choice to
// client_identity.goal, and get_public_profile serves that field (`d->>'goal'`)
// to OTHER MEMBERS on the public profile card — mobile AND the website. A token
// written there renders `fat_loss` to every viewer on both surfaces. So the two
// destinations take opposite halves, and BOTH directions are pinned below:
// half of this passing is the dangerous state.
//
// The source is a browser-babel JSX module that cannot be imported, so the pure
// half is extracted from the SHIPPED file and evaluated (the technique
// tests/grocery-aisle-token.test.mjs already uses on this same file); the
// writers/readers are pinned as source assertions, because they sit inside a
// ~30k-line component with no seam to mount.
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
// written at each site quotes the very shapes these tests ban; this repo has
// paid for that trap more than once.
const code = stripComments(src);

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

function extractArray(name) {
  const marker = `const ${name} = [`;
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `${name} not found`);
  const open = src.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return src.slice(at, i + 1) + ';';
  }
  throw new Error('unbalanced');
}

const { BS_PRIMARY_GOALS, bsPrimaryGoalLabel, bsPrimaryGoalToken } = new Function(
  [
    extractArray('BS_PRIMARY_GOALS'),
    extractFn('function bsPrimaryGoalLabel('),
    extractFn('function bsPrimaryGoalToken('),
    'return { BS_PRIMARY_GOALS, bsPrimaryGoalLabel, bsPrimaryGoalToken };',
  ].join('\n'),
)();

/** A translator that answers every key with a marker no English label equals. */
const shouty = (key) => `«${key}»`;

// ── The split itself ────────────────────────────────────────────────────────

test('guard-the-guard: the table and both mappers exist and are non-trivial', () => {
  assert.equal(typeof bsPrimaryGoalLabel, 'function', 'bsPrimaryGoalLabel is gone — re-point this guard');
  assert.equal(typeof bsPrimaryGoalToken, 'function', 'bsPrimaryGoalToken is gone — re-point this guard');
  assert.ok(Array.isArray(BS_PRIMARY_GOALS) && BS_PRIMARY_GOALS.length >= 12,
    `BS_PRIMARY_GOALS holds ${BS_PRIMARY_GOALS.length} rows — expected the full vocabulary`);
  const ids = new Set();
  for (const g of BS_PRIMARY_GOALS) {
    assert.ok(typeof g.id === 'string' && g.id.trim(), `a row has no id: ${JSON.stringify(g)}`);
    assert.ok(typeof g.en === 'string' && g.en.trim(), `${g.id} has no English label`);
    assert.notEqual(g.id, g.en, `${g.id} maps to itself — the split is not doing anything`);
    assert.doesNotMatch(g.id, /\s/, `${g.id} is a sentence, not a token`);
    assert.equal(ids.has(g.id), false, `duplicate id: ${g.id}`);
    ids.add(g.id);
  }
});

test('the token survives translation; only the label moves', () => {
  for (const g of BS_PRIMARY_GOALS) {
    const label = bsPrimaryGoalLabel(g.id, shouty);
    assert.equal(label, `«goal:primary.goal.${g.id}»`, `${g.id} did not route through its key`);
    assert.notEqual(label, g.id, `${g.id} rendered as its own token`);
    assert.notEqual(label, g.en, `${g.id} ignored the translator`);
  }
});

test('an unknown token renders as ITSELF — never a raw key, never blank', () => {
  // A member's own free text (or a value written by a surface this table does
  // not know) must survive to the screen rather than vanish from their goal.
  assert.equal(bsPrimaryGoalLabel('Get outside more', shouty), 'Get outside more');
  assert.equal(bsPrimaryGoalLabel('', shouty), '');
  assert.equal(bsPrimaryGoalLabel(null, shouty), '');
  assert.equal(bsPrimaryGoalLabel(undefined, shouty), '');
});

test('with no translator it degrades to the shipped English', () => {
  for (const g of BS_PRIMARY_GOALS) {
    assert.equal(bsPrimaryGoalLabel(g.id, null), g.en, 'the no-catalog path must degrade to the English that shipped');
  }
});

test('a catalog that fails still reads English, never a raw key and never blank', () => {
  // ⚠ i18n runs with returnEmptyString:false, so an empty value renders the RAW
  // KEY on screen — on the member's own goal headline. Both degradations are
  // pinned, plus a translator that throws outright.
  const raw = (key) => key;                 // key echoed back (missing catalog)
  const empty = () => '';                   // authored empty
  const boom = () => { throw new Error('catalog exploded'); };
  for (const g of BS_PRIMARY_GOALS) {
    assert.equal(bsPrimaryGoalLabel(g.id, raw), g.en, `${g.id} rendered a raw key`);
    assert.equal(bsPrimaryGoalLabel(g.id, empty), g.en, `${g.id} rendered blank`);
    assert.equal(bsPrimaryGoalLabel(g.id, boom), g.en, `${g.id} propagated a catalog throw`);
  }
});

// ── The back-compat read: the half that carries every row already on disk ────

test('bsPrimaryGoalToken maps every legacy English value back to its id', () => {
  // Every client_goals row written before this split stores the WORD. A
  // token-only reader would match no chip for every existing member.
  for (const g of BS_PRIMARY_GOALS) {
    assert.equal(bsPrimaryGoalToken(g.en), g.id, `legacy "${g.en}" did not resolve`);
    assert.equal(bsPrimaryGoalToken(g.en.toUpperCase()), g.id, `legacy "${g.en}" is case-sensitive`);
    assert.equal(bsPrimaryGoalToken(`  ${g.en}  `), g.id, `legacy "${g.en}" is whitespace-sensitive`);
    assert.equal(bsPrimaryGoalToken(g.id), g.id, `${g.id} did not pass through`);
  }
});

test('bsPrimaryGoalToken passes an unrecognised value through unchanged', () => {
  assert.equal(bsPrimaryGoalToken('Get outside more'), 'Get outside more');
  assert.equal(bsPrimaryGoalToken(''), '');
  assert.equal(bsPrimaryGoalToken(null), '');
  assert.equal(bsPrimaryGoalToken(undefined), '');
});

test('token → label → token round-trips', () => {
  for (const g of BS_PRIMARY_GOALS) {
    assert.equal(bsPrimaryGoalToken(bsPrimaryGoalLabel(g.id, null)), g.id, `${g.id} lost its identity on the round trip`);
  }
});

// ── Coverage: every token has a key, in every shipped catalog ───────────────

test('every primary goal is authored in every shipped catalog', () => {
  const dir = path.join(ROOT, 'mobile-app/src/i18n/catalogs');
  const LOCALES = fs.readdirSync(dir);
  assert.ok(LOCALES.length >= 13, `only ${LOCALES.length} locales found`);
  for (const loc of LOCALES) {
    const cat = JSON.parse(fs.readFileSync(path.join(dir, loc, 'goal.json'), 'utf8'));
    for (const g of BS_PRIMARY_GOALS) {
      const short = `primary.goal.${g.id}`;
      assert.ok(typeof cat[short] === 'string' && cat[short].trim(),
        `${loc}/goal.json is missing ${short} — it would render the raw key`);
    }
  }
});

// ── The readers + writers: each side taken by the right consumer ────────────

test('BSIntentStep IDENTITY is keyed on TOKENS, not on English words', () => {
  // The map drives the "You're becoming …" headline. Keyed on labels it would
  // silently fall through to the generic line for every pick.
  // ⚠ THE MARKER IS THE FULL DECLARATION HEAD, INCLUDING THE PARAMETER OBJECT.
  // extractFn brace-matches from the first `{` it finds, and for a destructured
  // parameter that is `{ onDone }` — so a bare-name marker extracts the PARAMS
  // and every assertion below would be about a two-word fragment.
  const step = stripComments(extractFn('function BSIntentStep({ onDone }) {'));
  const at = step.indexOf('const IDENTITY = {');
  assert.notEqual(at, -1, 'the IDENTITY map is gone — re-point this guard');
  const open = step.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < step.length; i++) {
    if (step[i] === '{') depth++;
    else if (step[i] === '}' && --depth === 0) { end = i; break; }
  }
  const body = step.slice(open, end);
  const keys = [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]);
  assert.equal(keys.length, BS_PRIMARY_GOALS.length,
    `IDENTITY has ${keys.length} entries for ${BS_PRIMARY_GOALS.length} goals`);
  const ids = new Set(BS_PRIMARY_GOALS.map((g) => g.id));
  for (const k of keys) assert.ok(ids.has(k), `IDENTITY key "${k}" is not a primary-goal token`);
});

test('every writer stores the TOKEN in client_goals.primaryGoal', () => {
  const writes = [...code.matchAll(/primaryGoal:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
  assert.ok(writes.length >= 3, `only ${writes.length} primaryGoal writes found — the pattern is broken, not the tree`);
  for (const w of writes) {
    assert.doesNotMatch(w, /bsPrimaryGoalLabel/,
      `a primaryGoal write stores a LABEL — a language is now frozen into the member's record: ${w}`);
    assert.doesNotMatch(w, /^'(?!fat_loss')[^']* [^']*'$/,
      `a primaryGoal write stores a sentence, not a token: ${w}`);
  }
  // The two live writers hand it the id straight from the table.
  assert.ok(writes.includes('g.id'), 'the Goals-page picker no longer writes the token');
  assert.ok(writes.includes('id'), "BSIntentStep's first-run step no longer writes the token");
});

test('every writer mirrors the LABEL — never the token — to client_identity.goal', () => {
  // ⚠ THE OPPOSITE HALF, and the one a token-everywhere fix would break:
  // get_public_profile serves client_identity.goal to OTHER members on both
  // surfaces, so a token there renders `fat_loss` to every viewer.
  const mirrors = [...code.matchAll(/'client_identity',\s*\{[^}]*\bgoal:\s*([A-Za-z_$][\w$.]*)/g)].map((m) => m[1]);
  assert.ok(mirrors.length >= 2, `only ${mirrors.length} client_identity goal mirrors found — the pattern is broken, not the tree`);
  for (const m of mirrors) {
    assert.equal(m, 'label', `a client_identity mirror writes "${m}" — it must write the resolved LABEL`);
  }
  // ⚠ AND EACH MIRROR'S OWN `label` BINDING IS THE HELPER'S OUTPUT, not a bare
  // id. Scoped to the nearest preceding binding rather than every `const label`
  // in a 30k-line file — a file-wide scan matches unrelated bindings and fails
  // on a correct tree (it did, on the radio bar's `${show} · ${bpm} BPM`).
  for (const m of code.matchAll(/'client_identity',\s*\{[^}]*\bgoal:\s*label\b/g)) {
    const before = code.slice(0, m.index);
    const at = before.lastIndexOf('const label =');
    assert.notEqual(at, -1, 'a client_identity mirror reads a `label` it never binds');
    const bind = before.slice(at).split('\n')[0];
    assert.match(bind, /const label = bsPrimaryGoalLabel\(/,
      `the binding a client_identity mirror reads is not the helper's output: ${bind.trim()}`);
  }
});

test('the picker compares the TOKEN and renders the LABEL', () => {
  const sel = code.match(/const on = \(data\.primaryGoal \|\| ''\) === ([^;\n]+)/);
  assert.ok(sel, 'the picker selected-state test is gone — re-point this guard');
  assert.equal(sel[1].trim(), 'g.id', 'the picker compares something other than the stored token');
  assert.match(code, /const label = bsPrimaryGoalLabel\(g\.id, tr\)/, 'the picker stopped resolving a label to render');
});

test('the reader normalises through bsPrimaryGoalToken and the H1 renders a label', () => {
  assert.match(code, /m\.primaryGoal = bsPrimaryGoalToken\(/,
    'the goal-doc read stopped normalising — a legacy English row now matches no chip');
  assert.match(code, /const hTitle = bsPrimaryGoalLabel\(data\.primaryGoal, tr\)/,
    'the Goals page H1 stopped resolving a label — it renders the raw token');
});

test('the demo default is a token, not a word', () => {
  const def = code.match(/primaryGoal:\s*'([^']+)'/);
  assert.ok(def, 'the demo default is gone — re-point this guard');
  assert.ok(BS_PRIMARY_GOALS.some((g) => g.id === def[1]),
    `the demo default "${def[1]}" is not a primary-goal token`);
});
