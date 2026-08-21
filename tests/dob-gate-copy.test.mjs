// The one sentence in the DOB gate that has now been wrong in three languages.
//
// ⚠ THE DEFECT, AND WHY A TEST RATHER THAN A THIRD FIX. `dob.body` ends with an
// immutability warning: you will be asked once, and it cannot be changed. In
// several locales that clause used a PRONOUN, which attached to the wrong noun:
//
//   fr   "La question ne vous sera posée qu'une fois — ELLE ne pourra pas être
//        modifiée"        → `elle` agrees with `la question`: the QUESTION cannot
//                           be changed. Caught in review round 1.
//   es   "Solo te lo pediremos una VEZ — después no se puede cambiar"
//   it   "Te lo chiederemo una sola VOLTA — non potrà essere MODIFICATA"
//        → `vez` and `volta` are FEMININE, so the impersonal/participle clause
//          attaches to the OCCASION, not the date. Caught in review round 4.
//
// ⚠ I SWEPT FOR THIS CLASS AFTER THE FRENCH ONE AND REPORTED "none needed
// changing", having called es/it "impersonal constructions". That was wrong: I
// checked whether a pronoun existed and not whether a competing feminine noun
// did. Adjudicating grammar language-by-language is the thing I got wrong, so the
// rule no longer depends on adjudication — every locale NAMES the date in that
// clause, and this test holds them to it.
//
// ⚠ WHAT THIS CAN AND CANNOT DO. It is a keyword check, not a grammar check: it
// proves the date noun is PRESENT in the clause, not that the sentence reads
// well. A native-speaker pass remains the standing follow-up recorded in
// GO-LIVE-CHECKLIST.md. What it does buy is that no locale can go back to a bare
// pronoun there, which is the specific failure that shipped three times.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGS = join(ROOT, 'mobile-app/src/i18n/catalogs');

// The noun each language must use for the date in the immutability clause.
// Listing them is unavoidable — this is a claim about language, not about code —
// but the LOCALE SET is read from disk, so a new catalog cannot join silently.
const DATE_NOUN = {
  en: /\bdate\b/i,
  de: /Geburtsdatum/i,
  es: /fecha de nacimiento/i,
  fr: /\bla date\b/i,
  ha: /ranar haihuwa/i,
  id: /tanggal lahir/i,
  it: /data di nascita/i,
  pcm: /\b(date|day wey dem born)\b/i,
  'pt-BR': /data de nascimento/i,
  ru: /дат[уы] рождения/i,
  tr: /doğum tarihi/i,
  uk: /дат[уи] народження/i,
  vi: /ngày sinh/i,
};

const locales = readdirSync(CATALOGS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((l) => {
    try {
      return 'dob.body' in JSON.parse(readFileSync(join(CATALOGS, l, 'onboarding.json'), 'utf8'));
    } catch { return false; }
  });

test('every locale that ships the gate is covered by this rule', () => {
  assert.ok(locales.length >= 13, `expected the full locale set, found ${locales.length}`);
  const uncovered = locales.filter((l) => !DATE_NOUN[l]);
  assert.deepEqual(uncovered, [],
    `these locales ship dob.body but no rule checks their immutability clause — `
    + `add the date noun rather than letting the newest catalog be the unchecked one: ${uncovered.join(', ')}`);
});

// ⚠ ONE CATALOG HELD THREE PHRASINGS, AND TWO OF THEM SAID THE WRONG THING.
// Nigerian Pidgin marks the passive with "dem": "di day wey dem born you" is the
// day you WERE born, while "di day wey you born" reads as the day YOU gave birth.
// dob.title, dob.label and dob.genericError carried the second form while the
// error strings added later carried the first, so the same screen asked two
// different questions. A wording drift inside one locale is invisible to any
// key-completeness check, which is why it needs its own.
test('pcm uses one passive phrasing for the birth date throughout', () => {
  const cat = JSON.parse(readFileSync(join(CATALOGS, 'pcm', 'onboarding.json'), 'utf8'));
  const wrong = Object.entries(cat)
    .filter(([k, v]) => k.startsWith('dob.') && /wey you born/i.test(v))
    .map(([k]) => k);
  assert.deepEqual(wrong, [],
    `"wey you born" says the day the MEMBER gave birth; the passive is `
    + `"wey dem born you": ${wrong.join(', ')}`);
});

for (const loc of locales) {
  test(`${loc}: the immutability clause names the date, not a pronoun`, () => {
    const body = JSON.parse(readFileSync(join(CATALOGS, loc, 'onboarding.json'), 'utf8'))['dob.body'];

    // ⚠ THE CLAUSE, NOT THE WHOLE STRING. Every locale's FIRST sentence already
    // names the date ("every account needs a date of birth on file"), so checking
    // the whole body would pass no matter what the warning said — the vacuous
    // pass this suite has already been bitten by twice.
    const dash = body.indexOf('—');
    assert.ok(dash > 0, `${loc}: expected the em-dash that introduces the warning`);
    const clause = body.slice(dash + 1);

    assert.match(clause, DATE_NOUN[loc],
      `${loc}: the warning must say WHICH thing cannot be changed. A pronoun there `
      + `attaches to the nearest noun, which in several languages is the occasion `
      + `("once"/"una vez"/"una sola volta"), not the date.\n  clause: ${clause.trim()}`);
  });
}
