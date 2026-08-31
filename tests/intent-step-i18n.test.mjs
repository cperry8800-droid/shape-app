import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

// BSIntentStep is the FIRST screen a new member sees, and it was 100% English.
// Two things here are not ordinary translation work and are pinned as such:
//
//   1. The identity key is BUILT FROM THE TOKEN — `intent.identity.${id}` — so
//      it is invisible to BOTH key-resolution guards (one collects only
//      StringLiteral keys, the other is scoped to calls with no defaultValue).
//      That is exactly how 15 `marketplace:preview.*` keys once shipped
//      unauthored. The derived en-key assertion below is the only thing that
//      can see them.
//   2. The frame is a pre/accent/post TRIPLE, not a pair, because German and
//      Turkish put the accent mid-sentence and Turkish is verb-final. Under
//      `returnEmptyString: false` an empty slot renders the RAW KEY on screen,
//      so no slot may be authored empty in any of the thirteen.

const CLIENT = path.join('mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx');
const CAT = (loc) => path.join('mobile-app', 'src', 'i18n', 'catalogs', loc, 'onboarding.json');
const LOCALES = ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'id', 'vi', 'tr', 'ha', 'pcm', 'ru', 'uk'];

const src = fs.readFileSync(CLIENT, 'utf8');
const AST = parse(src, { sourceType: 'module', plugins: ['jsx'] });

// ⚠ BS_PRIMARY_GOALS is a module-scope const inside the JSX file, not an
// importable module — so it is READ OUT OF THE SOURCE, never re-typed here. A
// hand-listed copy is how a 13th goal ships with no identity sentence.
const BS_PRIMARY_GOALS = (() => {
  for (const n of AST.program.body) {
    const d = n.type === 'VariableDeclaration' ? n.declarations[0] : null;
    if (d && d.id.name === 'BS_PRIMARY_GOALS' && d.init.type === 'ArrayExpression') {
      return d.init.elements.map((el) => Object.fromEntries(
        el.properties.map((p) => [p.key.name, p.value.value])));
    }
  }
  throw new Error('BS_PRIMARY_GOALS not found');
})();

// ⚠ The region comes from the AST, never from brace-matching a marker: for
// `function BSIntentStep({ onDone })` the first `{` is the DESTRUCTURED
// PARAMETER, and a bare-name marker extracts a two-word fragment. This repo
// has paid for that trap already.
function intentRegion() {
  for (const n of AST.program.body) {
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'BSIntentStep') {
      return src.slice(n.start, n.end);
    }
  }
  throw new Error('BSIntentStep not found');
}
const region = intentRegion();

// The en catalog the SOURCE asks for: every literal tr() defaultValue in the
// component, plus the IDENTITY table (whose keys are built from the token).
function derivedEn() {
  const out = {};
  const sub = parse('(' + region + ')', { plugins: ['jsx'] });
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'CallExpression' && n.callee && n.callee.name === 'tr'
        && n.arguments[0] && n.arguments[0].type === 'StringLiteral') {
      const o = n.arguments[1];
      if (o && o.type === 'ObjectExpression') {
        const dv = o.properties.find((p) => p.key && p.key.name === 'defaultValue');
        if (dv && dv.value.type === 'StringLiteral') {
          out[n.arguments[0].value.replace(/^onboarding:/, '')] = dv.value.value;
        }
      }
    }
    if (n.type === 'VariableDeclarator' && n.id.name === 'IDENTITY'
        && n.init && n.init.type === 'ObjectExpression') {
      for (const p of n.init.properties) out['intent.identity.' + p.key.name] = p.value.value;
    }
    for (const k in n) if (k !== 'loc' && k !== 'start' && k !== 'end') walk(n[k]);
  })(sub);
  return out;
}
const EN_WANTED = derivedEn();
const KEYS = Object.keys(EN_WANTED).sort();
const cats = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(CAT(l), 'utf8'))]));

// The five slots that compose the two split-accent frames.
const FRAME = ['intent.becomingPre', 'intent.becomingPost',
               'intent.titlePre', 'intent.titleAccent', 'intent.titlePost'];

test('guard-the-guard: the region is the component and it derives 25 keys', () => {
  assert.ok(region.includes('const IDENTITY = {'), 'the region carries the IDENTITY table');
  assert.ok(region.includes('identityOf'), 'the region carries the resolver');
  assert.ok(!/\bfunction BSHealthIntake\b/.test(region), 'the region stops at the next component');
  assert.equal(KEYS.length, 25, '13 chrome keys + 12 identity sentences');
  assert.equal(LOCALES.length, 13);
  for (const k of KEYS) assert.ok(k.startsWith('intent.'), `${k} is namespaced under intent.`);
});

test('the identity keys are exactly the twelve shipped goal tokens — derived, never listed', () => {
  const want = BS_PRIMARY_GOALS.map((g) => 'intent.identity.' + g.id).sort();
  const got = KEYS.filter((k) => k.startsWith('intent.identity.')).sort();
  assert.deepEqual(got, want, 'a 13th goal must fail here, not ship a raw key on the H1');
});

test('every derived key is authored in en, byte-identical to the source', () => {
  for (const k of KEYS) {
    assert.equal(cats.en[k], EN_WANTED[k],
      `${k}: the en catalog and the call site disagree — this is the only guard that can see the built keys`);
  }
});

test('all 25 keys are present and NON-EMPTY in every locale', () => {
  // Under `returnEmptyString: false` an empty value renders the RAW KEY, which
  // key parity cannot see (a key whose value is "" IS present).
  for (const loc of LOCALES) {
    for (const k of KEYS) {
      const v = cats[loc][k];
      assert.equal(typeof v, 'string', `${loc}/${k} missing`);
      assert.ok(v.trim().length > 0, `${loc}/${k} is empty — that renders the raw key on screen`);
    }
  }
});

test('no split-accent slot is authored empty, in any of the thirteen', () => {
  for (const loc of LOCALES) {
    for (const k of FRAME) {
      assert.ok(cats[loc][k].trim().length > 0,
        `${loc}/${k}: a verb-final locale must front a real word, never ""`);
    }
    // The composed frames must actually say something.
    assert.ok((cats[loc]['intent.becomingPre'] + cats[loc]['intent.becomingPost']).trim().length > 1, loc);
    assert.ok((cats[loc]['intent.titlePre'] + cats[loc]['intent.titleAccent']
               + cats[loc]['intent.titlePost']).trim().length > 3, loc);
  }
});

test('the twelve identity phrases are distinct in every locale', () => {
  for (const loc of LOCALES) {
    const vals = BS_PRIMARY_GOALS.map((g) => cats[loc]['intent.identity.' + g.id]);
    assert.equal(new Set(vals).size, 12, `${loc} collapsed two goals onto one sentence`);
  }
});

test('an unknown pick takes the fallback sentence, never a raw key', () => {
  // The resolver is `IDENTITY[id] ? tr(built key) : tr(fallback)` — so a token
  // with no phrase can never reach the template.
  assert.match(region, /IDENTITY\[id\]\s*\?\s*tr\(`onboarding:intent\.identity\.\$\{id\}`/,
    'a known id resolves through its built key');
  assert.match(region, /:\s*tr\('onboarding:intent\.identityFallback'/,
    'an unknown id resolves through the fallback key');
});

test('both label calls take tr — the client_identity.goal mirror agreed to disagree', () => {
  // This was the SECOND writer of the mirror and it wrote ENGLISH while
  // BSGoalsContract's picker wrote the translated label, so the same member's
  // public profile card read a different language depending on which screen set
  // the goal. Both write the member's own language now.
  assert.ok(!/bsPrimaryGoalLabel\([^)]*,\s*null\s*\)/.test(region),
    'no bsPrimaryGoalLabel call may still pass null');
  assert.match(region, /const label = bsPrimaryGoalLabel\(id, tr\);/, 'the mirror writer passes tr');
  assert.match(region, /\{bsPrimaryGoalLabel\(g\.id, tr\)\}/, 'the chip renders a translated label');
  // And the OTHER writer still does, so the two cannot drift apart again.
  assert.ok(/const label = bsPrimaryGoalLabel\(g\.id, tr\);/.test(src),
    "BSGoalsContract's mirror writer still passes tr");
});

test('the screen actually holds a translator, and IDENTITY stays keyed on tokens', () => {
  assert.match(region, /const tr = useShapeTr\(\);/, 'BSIntentStep binds the translator');
  const ids = BS_PRIMARY_GOALS.map((g) => g.id);
  for (const id of ids) {
    assert.match(region, new RegExp(`\\n\\s{4}${id}: '`),
      `IDENTITY carries ${id} — keyed on the token, or the lookup falls through for every pick`);
  }
});
