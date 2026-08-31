import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

// BSProfileCustomizer is the sheet a member edits their own public profile in.
// Two of its option tables are module-scope array literals the ratchet's walk
// cannot attribute, so the ratchet defends none of what follows: reverting a
// label to a hardcoded English string leaves it, the parity gate and the whole
// suite green. This is the guard that fails instead.
//
// It pins the split in BOTH directions — the doc stores the `key`, the member
// reads a translated `label` — plus the two deliberate NON-keys, because those
// are the assertions a well-meaning later sweep would break.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const EN = path.join(ROOT, 'mobile-app/src/i18n/catalogs/en/profile.json');
const src = fs.readFileSync(SRC, 'utf8');
const en = JSON.parse(fs.readFileSync(EN, 'utf8'));

// ⚠ EVERY SOURCE ASSERTION READS THE COMMENT-STRIPPED FILE. The rationale
// written at each site quotes the very shapes these tests ban, and the canonical
// stripper is imported rather than re-derived: the lazy `/\*[\s\S]*?\*\//` span
// opens a FALSE block on `accept="image/*"` in this exact file and swallowed
// 567,895 characters of it in an earlier guard.
const code = stripComments(src);

// ⚠ THE MARKER CARRIES THE FULL SIGNATURE ON PURPOSE. extractFn brace-matches
// from the first `{` after the marker, and for `function BSProfileCustomizer({ initial, … })`
// that is the DESTRUCTURED PARAMETER — a bare-name marker extracts a parameter
// object and every assertion after it is about the wrong text.
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
  assert.equal(src.indexOf(marker, at + 1), -1, `${name} is declared twice`);
  const open = src.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return src.slice(at, i + 1) + ';';
  }
  throw new Error(`unbalanced brackets in ${name}`);
}

// The tables and the resolver are evaluated from the SHIPPED file, so a rewrite
// that changes what they answer fails here rather than passing a spelling pin.
const { BS_STAT_OPTIONS, BS_PROFILE_LINKS, bsOptLabel } = new Function(
  [
    extractArray('BS_STAT_OPTIONS'),
    extractArray('BS_PROFILE_LINKS'),
    extractFn('function bsOptLabel(o, tr) {'),
    'return { BS_STAT_OPTIONS, BS_PROFILE_LINKS, bsOptLabel };',
  ].join('\n'),
)();

const EDITOR = extractFn('function BSProfileCustomizer({ initial, c, INK, BG, onClose, onSave, coach = false, ownerUid = null }) {');
const EDITOR_CODE = stripComments(EDITOR);
const ALL = [...BS_STAT_OPTIONS, ...BS_PROFILE_LINKS];

test('guard-the-guard: both tables extracted, shaped, and non-trivial', () => {
  assert.equal(BS_STAT_OPTIONS.length, 7, 'seven headline-stat options');
  assert.equal(BS_PROFILE_LINKS.length, 6, 'six social-link rows');
  for (const o of ALL) {
    assert.ok(o.key && typeof o.key === 'string', 'every option carries a stored key');
    assert.ok(o.label && typeof o.label === 'string', `${o.key} carries an English label`);
    assert.ok(!/\s/.test(o.key), `${o.key} key carries no whitespace`);
  }
  for (const t of [BS_STAT_OPTIONS, BS_PROFILE_LINKS]) {
    const keys = t.map((o) => o.key);
    assert.equal(new Set(keys).size, keys.length, 'keys are unique within a table');
  }
  assert.ok(EDITOR.length > 20000, `the editor body extracted short (${EDITOR.length} chars) — check the marker`);
  assert.ok(/BS_STAT_OPTIONS\.map/.test(EDITOR_CODE), 'the extracted body is the one that renders the pickers');
});

test('the brand nouns carry NO tKey, and that exemption is the point', () => {
  // "Shape Score", Instagram, X, TikTok, YouTube and Substack are byte-identical
  // in all thirteen locales. Keying one would ship thirteen copies of a string a
  // translator must not touch — the same exemption as BSAboutPage's founder
  // signature and BSSettings' `AB` initials placeholder. A later sweep that
  // "completes" the tables by adding a key to any of them fails here.
  assert.equal(BS_STAT_OPTIONS.find((o) => o.key === 'score').tKey, undefined,
    'Shape Score is a brand noun — it must stay literal in every locale');
  for (const k of ['instagram', 'x', 'tiktok', 'youtube', 'substack']) {
    assert.equal(BS_PROFILE_LINKS.find((o) => o.key === k).tKey, undefined,
      `${k} is a brand noun — it must stay literal in every locale`);
  }
  // And the converse, so the exemption cannot quietly widen into "nothing is keyed":
  // every option that IS a word a locale renames carries one.
  for (const o of BS_STAT_OPTIONS.filter((x) => x.key !== 'score')) {
    assert.ok(o.tKey, `${o.key} is ordinary copy and must carry a tKey`);
  }
  assert.ok(BS_PROFILE_LINKS.find((o) => o.key === 'website').tKey,
    'Website is a word, not a brand — it carries a tKey');
});

test('every tKey resolves in en, and the catalog has not drifted from the call site', () => {
  // ⚠ NEITHER SHIPPED KEY-RESOLUTION GUARD CAN SEE THESE. `i18n-default-resolution`
  // collects only keys written as a StringLiteral FIRST ARGUMENT to tr(), and
  // `i18n-key-resolution` on this file is scoped to calls with no defaultValue.
  // A tKey is an object property, so a typo would fall through to the English
  // label and read perfectly — the silent half of the defaultValue pattern that
  // shipped 15 unauthored marketplace keys.
  const keyed = ALL.filter((o) => o.tKey);
  assert.equal(keyed.length, 7, 'six stat options + Website');
  for (const o of keyed) {
    assert.ok(o.tKey.startsWith('profile:'), `${o.key} keys into the profile namespace`);
    const k = o.tKey.slice('profile:'.length);
    assert.ok(Object.prototype.hasOwnProperty.call(en, k), `${o.tKey} is missing from the en catalog`);
    assert.equal(en[k], o.label,
      `${o.tKey} drifted from its call-site default — the CATALOG renders, so the literal is the stale copy`);
  }
});

test('bsOptLabel degrades to English on every broken-catalog shape', () => {
  const tier = BS_STAT_OPTIONS.find((o) => o.key === 'tier');
  assert.equal(bsOptLabel(tier, () => 'Niveau'), 'Niveau', 'a real value wins');
  // The returnEmptyString:false trap: an authored empty value renders the RAW KEY
  // on screen, and a catalog that has not loaded returns the key itself.
  assert.equal(bsOptLabel(tier, () => 'profile:stat.tier'), 'Tier', 'a raw key reads English');
  assert.equal(bsOptLabel(tier, () => ''), 'Tier', 'an authored empty value reads English');
  assert.equal(bsOptLabel(tier, () => null), 'Tier', 'a null value reads English');
  assert.equal(bsOptLabel(tier, () => { throw new Error('catalog down'); }), 'Tier', 'a throwing catalog reads English');
  assert.equal(bsOptLabel(tier, undefined), 'Tier', 'no translator reads English');
  assert.equal(bsOptLabel(tier, 'not a function'), 'Tier', 'a non-function translator reads English');
  // A brand noun never consults the catalog at all, so it cannot be renamed by one.
  const score = BS_STAT_OPTIONS.find((o) => o.key === 'score');
  assert.equal(bsOptLabel(score, () => 'Puntuación'), 'Shape Score', 'a brand noun ignores the catalog');
  assert.equal(bsOptLabel(null, () => 'x'), '', 'a missing option is empty, never a crash');
});

test('the split holds: the doc stores the key, the member reads the label', () => {
  // The stored side. A label written into profile_custom would freeze one
  // language into the member's own record — the grocery-aisle fault.
  // ⚠ NOT `\[[^\]]*\]` — the mapped tuple contains `links[l.key]`, so a negated
  // character class stops at the FIRST `]` and the matcher fails on correct code.
  const save = /links: Object\.fromEntries\(BS_PROFILE_LINKS\.map\(\(l\) => [\s\S]{0,160}?\)\.filter\(/.exec(EDITOR_CODE);
  assert.ok(save, 'the links save path');
  assert.ok(save[0].includes('l.key'), 'the saved link map is keyed on l.key');
  assert.ok(!save[0].includes('l.label'), 'the saved link map never stores the rendered label');
  assert.ok(/toggleStat\(s\.key\)/.test(EDITOR_CODE), 'the headline-stat toggle stores s.key');
  assert.ok(/heroStats\.includes\(s\.key\)/.test(EDITOR_CODE), 'selection compares keys, never the rendered string');

  // The rendered side. ⚠ NOT "every `.map` over these tables calls bsOptLabel" —
  // two of them are DATA paths that emit no label at all (the save above, and the
  // public profile's `[l, cu.links[l.key]]` pair), so that shape fails on correct
  // code. What is true, and what a regression would break: the label reaches the
  // screen only through the resolver, and nowhere as a raw `.label`.
  assert.ok(/BS_STAT_OPTIONS\.map\([\s\S]{0,1400}?bsOptLabel\(s, tr\)/.test(EDITOR_CODE),
    'the headline-stat picker renders a translated label');
  assert.ok(/BS_PROFILE_LINKS\.map\([\s\S]{0,1400}?bsOptLabel\(l, tr\)/.test(EDITOR_CODE),
    'the social-link rows render a translated label');
  // The two public-profile link rows outside the editor render through it too — five
  // call sites in all. A new surface that shows an option and skips the resolver
  // would render English on a Spanish profile.
  assert.equal(code.split('bsOptLabel(').length - 1, 5,
    'five render sites — two pickers plus the three public-profile rows');
  // ⚠ NOT a file-wide `>{x.label}<` ban — the profile HERO legitimately renders a
  // `label` its caller already translated, so that shape fails on correct code.
  // What matters instead is the invariant below.
});

test('the picker and the profile hero name each stat through the SAME key', () => {
  // The hero resolves the stored key against its OWN `stats` map, built at the two
  // call sites — a pre-existing split this cut did not invent. If the picker and the
  // hero keyed the same stat differently, a member would read one name choosing it
  // and another seeing it, one tap apart. `score` is absent from both by the same
  // brand-noun exemption, which is why it is asserted as a literal on both sides.
  const heroes = [...code.matchAll(/stats=\{\{[\s\S]{0,900}?\}\}/g)].map((m) => m[0])
    .filter((m) => /score: \{/.test(m));
  assert.equal(heroes.length, 2, `expected the member and coach hero stat maps, saw ${heroes.length}`);
  for (const hero of heroes) {
    assert.ok(/score: \{ label: 'Shape Score'/.test(hero),
      'the hero keeps Shape Score literal, exactly as the picker does');
    for (const o of BS_STAT_OPTIONS.filter((x) => x.tKey && hero.includes(`${x.key}: {`))) {
      assert.ok(hero.includes(`tr('${o.tKey}'`),
        `the hero names "${o.key}" through ${o.tKey}, the same key the picker uses`);
    }
  }
});

test('the URL example stays literal while the handle and domain examples are keyed', () => {
  // A URL is an address, byte-identical in every locale — the brand-noun
  // exemption again, and the one string that keeps this component PARTIAL.
  // The HANDLE and DOMAIN examples are the `+1 555 123 4567` class instead:
  // a locale's own form reads better, so those DO carry keys.
  assert.ok(/placeholder="https:\/\/open\.spotify\.com\/track\/…"/.test(EDITOR_CODE),
    'the profile-song example is a bare literal address');
  assert.ok(/tr\('profile:editor\.ph\.linkHandle'/.test(EDITOR_CODE), 'the handle example is keyed');
  assert.ok(/tr\('profile:editor\.ph\.linkSite'/.test(EDITOR_CODE), 'the domain example is keyed');
  for (const k of ['editor.ph.linkHandle', 'editor.ph.linkSite']) {
    assert.ok(en[k], `${k} is authored in en`);
  }
});

test('the editor holds a translator and hardcodes nothing the walk can see but that URL', () => {
  // The ratchet records this component as PARTIAL over exactly one string. If a
  // sweep adds a second hardcoded literal the ratchet catches it; this pins the
  // half the ratchet cannot see — that the translator is actually bound here.
  assert.ok(/const tr = useShapeTr\(\)/.test(EDITOR_CODE), 'the editor binds the translator');
  assert.ok(!/\bconst tr =\s*(?!useShapeTr)/.test(EDITOR_CODE.replace('const tr = useShapeTr()', '')),
    'nothing shadows the translator inside the editor');
  const calls = EDITOR_CODE.split(/\btr\('profile:/).length - 1;
  assert.ok(calls >= 80, `the editor should route ~86 keys through the catalog, saw ${calls}`);
});
