import test from 'node:test';
import assert from 'node:assert/strict';
import i18next from 'i18next';
import ICU from 'i18next-icu';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Replicates the app runtime's i18next config (keySeparator:false, ICU, ns via ':')
// against the real catalogs, to prove flat dotted keys + namespaces + ICU number
// formatting actually resolve — the config contract the UI depends on.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'catalogs');
const NS = ['common', 'onboarding', 'settings', 'score'];
const LOCS = ['en', 'es', 'de', 'fr', 'ru'];

function resources() {
  const r = {};
  for (const loc of LOCS) {
    r[loc] = {};
    for (const ns of NS) r[loc][ns] = JSON.parse(readFileSync(join(root, loc, `${ns}.json`), 'utf8'));
  }
  return r;
}

const i = i18next.createInstance();
await i.use(ICU).init({
  lng: 'en', fallbackLng: 'en', supportedLngs: LOCS, ns: NS, defaultNS: 'common',
  resources: resources(), keySeparator: false, interpolation: { escapeValue: false },
  returnNull: false, returnEmptyString: false,
});

test('flat dotted keys resolve under a namespace, in the requested locale', () => {
  assert.equal(i.t('score:verdict.top', { lng: 'es' }), 'La cima de la escalera');
  assert.equal(i.t('score:verdict.climbing', { tier: 'Tempo', lng: 'es' }), 'Tempo, y subiendo');
  assert.equal(i.t('score:reg.streak', { lng: 'de' }), 'Serie');
});

test('ICU number argument formats per locale', () => {
  const de = i.t('score:verdict.atRisk', { points: 1284, tier: 'Form', lng: 'de' });
  assert.ok(de.includes('1.284'), `de grouping: ${de}`);
  assert.ok(de.includes('Form'), de);
  const en = i.t('score:verdict.atRisk', { points: 1284, tier: 'Form', lng: 'en' });
  assert.ok(en.includes('1,284'), `en grouping: ${en}`);
});

test('other namespaces resolve; en is the fallback', () => {
  assert.equal(i.t('common:action.continue', { lng: 'fr' }), 'Continuer');
  assert.equal(i.t('onboarding:lang.title', { lng: 'ru' }), 'Выберите язык');
  assert.equal(i.t('score:verdict.top', { lng: 'en' }), 'The top of the ladder');
});
