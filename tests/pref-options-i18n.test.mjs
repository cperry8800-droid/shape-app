import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BS_PREF_OPTIONS,
  BS_PREF_UNKEYED_ROWS,
  bsPrefOptionKey,
  bsPrefOptionLabel,
  bsPrefOptionDisplay,
  bsPrefOptionToken,
  bsGoalKind,
} from '../mobile-app/src/services/prefOptions.mjs';

// The 42 member-facing pref options are translated now. This guard is DERIVED
// from the option table — never a hand-copied key list — because the failure it
// exists to catch is invisible to every other gate: a `tr()` call that passes a
// defaultValue and has no `en` key renders its English and satisfies the parity
// gate (which compares the twelve locales AGAINST `en`). That is exactly how
// fifteen `marketplace:preview.*` keys shipped unauthored.

const CAT = path.join('mobile-app', 'src', 'i18n', 'catalogs');
const LOCALES = fs.readdirSync(CAT).filter((d) => fs.statSync(path.join(CAT, d)).isDirectory()).sort();
const settingsOf = (loc) => JSON.parse(fs.readFileSync(path.join(CAT, loc, 'settings.json'), 'utf8'));

const KEYED = Object.entries(BS_PREF_OPTIONS)
  .filter(([row]) => !BS_PREF_UNKEYED_ROWS.includes(row))
  .flatMap(([row, opts]) => opts.map((o) => ({ row, id: o.id, en: o.en, key: bsPrefOptionKey(row, o.id) })));

// A translator that renames every key it is asked for. An equivalent rewrite of
// the helpers passes; a hardcoded English string fails. A spelling pin could not
// tell those apart.
const rename = (key) => `RN::${key}`;

test('guard-the-guard: thirteen locales, and the derived key set is the shipped one', () => {
  assert.equal(LOCALES.length, 13, 'thirteen active locales');
  assert.ok(LOCALES.includes('en'));
  assert.equal(KEYED.length, 42, '42 keyed options');
  assert.equal(new Set(KEYED.map((o) => o.key)).size, 42, 'keys are unique');
  for (const o of KEYED) assert.equal(o.key, `settings:pref.${o.row}.${o.id}`);
});

test('every keyed option is authored in en, byte-identical to the table', () => {
  const en = settingsOf('en');
  for (const o of KEYED) {
    const k = o.key.replace('settings:', '');
    assert.ok(Object.prototype.hasOwnProperty.call(en, k), `en is missing ${k}`);
    assert.equal(en[k], o.en, `${k} has drifted from the table's English`);
  }
});

test('every locale carries all 42, and none is empty — the raw-key trap', () => {
  // i18n runs with returnEmptyString:false, so an empty value renders the RAW
  // KEY on screen. Key parity cannot see it: a key whose value is "" IS present.
  for (const loc of LOCALES) {
    const cat = settingsOf(loc);
    for (const o of KEYED) {
      const k = o.key.replace('settings:', '');
      const v = cat[k];
      assert.equal(typeof v, 'string', `${loc}/${k} missing`);
      assert.ok(v.trim(), `${loc}/${k} is empty or whitespace-only`);
    }
  }
});

test('the unkeyed row is unkeyed on purpose, and carries no dead catalog entries', () => {
  assert.deepEqual(BS_PREF_UNKEYED_ROWS, ['sessions_per_week']);
  for (const o of BS_PREF_OPTIONS.sessions_per_week) {
    assert.equal(o.id, o.en, 'its ids ARE its English, so a key could only echo the digit');
  }
  for (const loc of LOCALES) {
    const stray = Object.keys(settingsOf(loc)).filter((k) => k.startsWith('pref.sessions_per_week.'));
    assert.deepEqual(stray, [], `${loc} authored keys for a row nothing reads`);
  }
});

test('the label moves with the translator and the TOKEN does not', () => {
  for (const o of KEYED) {
    assert.equal(bsPrefOptionLabel(o.row, o.id, rename), `RN::${o.key}`, `${o.key} label is translated`);
    assert.equal(bsPrefOptionDisplay(o.row, o.id, rename), `RN::${o.key}`, `${o.key} display is translated`);
    assert.equal(bsPrefOptionToken(o.row, o.id, rename), o.id, `${o.key} token survives translation`);
  }
  // The unkeyed row never asks the catalog at all.
  for (const o of BS_PREF_OPTIONS.sessions_per_week) {
    assert.equal(bsPrefOptionLabel('sessions_per_week', o.id, rename), o.en);
  }
});

test('a broken catalog still reads English — never a raw key, never blank', () => {
  const broken = [
    ['throws', () => { throw new Error('boom'); }],
    ['returns the key', (k) => k],
    ['returns empty', () => ''],
    ['returns null', () => null],
    ['returns a non-string', () => 42],
  ];
  for (const [name, tr] of broken) {
    for (const o of KEYED) {
      assert.equal(bsPrefOptionLabel(o.row, o.id, tr), o.en, `${name}: ${o.key}`);
      assert.equal(bsPrefOptionDisplay(o.row, o.id, tr), o.en, `${name}: ${o.key}`);
    }
  }
});

test('the reverse map: a member who retypes the label on screen still stores the token', () => {
  // The editor is a picker AND a text field bound to one value: it SHOWS the
  // translated label. Without this, retyping it would store a sentence.
  for (const loc of LOCALES) {
    const cat = settingsOf(loc);
    const tr = (key, opts) => cat[key.replace('settings:', '')] ?? (opts && opts.defaultValue) ?? key;
    for (const o of KEYED) {
      const shown = bsPrefOptionLabel(o.row, o.id, tr);
      assert.ok(shown.trim(), `${loc} ${o.key} renders something`);
      assert.equal(bsPrefOptionToken(o.row, shown, tr), o.id, `${loc}: "${shown}" maps back to ${o.id}`);
      assert.equal(bsPrefOptionToken(o.row, `  ${shown.toUpperCase()}  `, tr), o.id, `${loc}: case + padding`);
      assert.equal(bsPrefOptionToken(o.row, o.en, tr), o.id, `${loc}: legacy English still maps back`);
    }
  }
});

test('no locale makes the reverse map ambiguous', () => {
  // Driven through the REAL token function rather than a copy of its fold, so
  // the guard cannot drift from the comparison it is guarding. Every spelling a
  // member could plausibly hold — the id, the shipped English, the translated
  // label — must resolve to ITS OWN option, in every locale.
  for (const loc of LOCALES) {
    const cat = settingsOf(loc);
    const tr = (key, opts) => cat[key.replace('settings:', '')] ?? (opts && opts.defaultValue) ?? key;
    for (const [row, opts] of Object.entries(BS_PREF_OPTIONS)) {
      for (const o of opts) {
        for (const spelling of [o.id, o.en, bsPrefOptionLabel(row, o.id, tr)]) {
          assert.equal(
            bsPrefOptionToken(row, spelling, tr), o.id,
            `${loc} ${row}: "${spelling}" must resolve to ${o.id}, not another option`,
          );
        }
      }
    }
  }
});

test('the Turkish fold is load-bearing, not decoration', () => {
  // 'Sıkı'.toUpperCase() is 'SIKI', and JS toLowerCase() is locale-INSENSITIVE,
  // so a plain fold sends it to 'siki' and the match is lost. Pinned directly so
  // the reason survives the code.
  assert.equal('S\u0131k\u0131'.toUpperCase().toLowerCase(), 'siki', 'the trap itself');
  const tr = (k, o) => (k === 'settings:pref.calorie_range.strict' ? 'S\u0131k\u0131' : (o && o.defaultValue) || k);
  for (const typed of ['S\u0131k\u0131', 'SIKI', '  siki  ', 'S\u0131KI']) {
    assert.equal(bsPrefOptionToken('calorie_range', typed, tr), 'strict', `"${typed}"`);
  }
  assert.equal(bsPrefOptionToken('calorie_range', 'STRICT'), 'strict', 'English still folds');
});

test('bsGoalKind takes no translator — it reads stored values, on the server too', () => {
  assert.equal(bsGoalKind.length, 2, 'two arguments, no tr');
  const src = fs.readFileSync(path.join('mobile-app', 'src', 'services', 'prefOptions.mjs'), 'utf8');
  const body = /export function bsGoalKind\([\s\S]*?\n}/.exec(src);
  assert.ok(body, 'bsGoalKind is declared');
  assert.ok(!/\btr\b/.test(body[0]), 'no translator reaches the classifier');
  for (const o of BS_PREF_OPTIONS.primary_goal) {
    assert.equal(bsGoalKind('', o.id), bsGoalKind('', o.en), `${o.id} classifies the same either way`);
  }
});

test('every client call site hands the translator down', () => {
  const src = fs.readFileSync(path.join('mobile-app', 'src', 'broadsheet', 'iosAppBroadsheetClient.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const calls = [...src.matchAll(/bsPrefOption(?:Label|Display|Token)\(([^;]*?)\)(?=[\s,;)}]|$)/g)];
  assert.ok(calls.length >= 8, `expected the shipped call sites, saw ${calls.length}`);
  for (const c of calls) {
    assert.ok(/,\s*tr\s*\)?$/.test(c[0].trim()), `a display helper without the translator: ${c[0]}`);
  }
});
