import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, localeMeta, isSupported, dirOf, resolveLocale, intlLocaleOf, ACTIVE_LOCALES, isActive, activeLocales } from '../mobile-app/src/i18n/locales.mjs';

test('registry has 22 locales incl. en/ar/ja and three RTL', () => {
  assert.equal(LOCALES.length, 22);
  for (const c of ['en', 'ar', 'ja', 'ur', 'arz', 'zh-Hans', 'pcm']) assert.ok(isSupported(c), c);
  const rtl = LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code).sort();
  assert.deepEqual(rtl, ['ar', 'arz', 'ur']);
});

test('every locale row is well-formed', () => {
  for (const l of LOCALES) {
    assert.match(l.code, /^[a-z]{2,3}(-[A-Za-z]+)?$/, l.code);
    assert.ok(l.nativeName && l.englishName, l.code);
    assert.ok(l.dir === 'ltr' || l.dir === 'rtl', l.code);
    assert.ok(l.font, `${l.code} needs a font stack key`);
  }
});

test('dirOf returns rtl for arabic/urdu, ltr otherwise, ltr for unknown', () => {
  assert.equal(dirOf('ar'), 'rtl');
  assert.equal(dirOf('ur'), 'rtl');
  assert.equal(dirOf('ja'), 'ltr');
  assert.equal(dirOf('zzz'), 'ltr');
});

test('localeMeta returns the row or null', () => {
  assert.equal(localeMeta('ja').nativeName, '日本語');
  assert.equal(localeMeta('nope'), null);
});

test('resolveLocale: stored wins when it is an active locale', () => {
  assert.equal(resolveLocale('fr', ['en-US', 'en']), 'fr');
});
test('resolveLocale: falls back to first matching device language', () => {
  assert.equal(resolveLocale(null, ['fr-FR', 'en']), 'fr');
  assert.equal(resolveLocale('', ['pt-BR', 'pt']), 'pt-BR'); // exact regional match preferred
  assert.equal(resolveLocale(null, ['pt-PT']), 'pt-BR');     // base 'pt' → our pt-BR
});
test('resolveLocale: unknown stored + unknown device → en', () => {
  assert.equal(resolveLocale('zzz', ['xx-YY']), 'en');
});
test('resolveLocale: supported-but-unwired locale is ignored → en', () => {
  assert.equal(resolveLocale('ja', ['ar-EG']), 'en'); // both in the registry, neither wired
  assert.equal(resolveLocale(null, ['ja']), 'en');    // device Japanese, not wired this wave
});

test('intlLocaleOf maps arz→ar (not an Intl locale), passes others through', () => {
  assert.equal(intlLocaleOf('arz'), 'ar');
  assert.equal(intlLocaleOf('ja'), 'ja');
  assert.equal(intlLocaleOf('en'), 'en');
});

test('ACTIVE_LOCALES is the Latin+Cyrillic wave; all LTR; isActive/activeLocales agree', () => {
  assert.deepEqual(ACTIVE_LOCALES, ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'id', 'vi', 'tr', 'ha', 'pcm', 'ru', 'uk']);
  assert.ok(isActive('es') && isActive('ru') && isActive('uk'));
  assert.ok(!isActive('ar') && !isActive('ja') && !isActive('ur')); // in the registry, later waves
  assert.deepEqual(activeLocales().map((l) => l.code), ACTIVE_LOCALES);
  // every wired locale is LTR (this wave ships no RTL), so no dir-flip needed
  for (const c of ACTIVE_LOCALES) assert.equal(dirOf(c), 'ltr', c);
});
