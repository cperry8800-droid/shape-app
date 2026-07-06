import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'catalogs');
const NS = ['common', 'onboarding', 'settings', 'score'];

function load(loc, ns) {
  const p = join(root, loc, `${ns}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
// Normalized set of {placeholders} in a message (whitespace-insensitive, order-insensitive).
function placeholders(s) {
  return (String(s).match(/\{[^}]+\}/g) || []).map((x) => x.replace(/\s+/g, '')).sort();
}

test('every wired locale carries every en key in every namespace', () => {
  for (const ns of NS) {
    const enKeys = Object.keys(load('en', ns));
    for (const loc of ACTIVE_LOCALES) {
      const cat = load(loc, ns);
      const missing = enKeys.filter((k) => !(k in cat));
      assert.equal(missing.length, 0, `${loc}/${ns} missing: ${missing.join(', ')}`);
    }
  }
});

test('every translation preserves the en ICU placeholders exactly', () => {
  for (const ns of NS) {
    const en = load('en', ns);
    for (const loc of ACTIVE_LOCALES) {
      if (loc === 'en') continue;
      const cat = load(loc, ns);
      for (const [k, v] of Object.entries(en)) {
        if (!(k in cat)) continue;
        assert.deepEqual(placeholders(cat[k]), placeholders(v), `${loc}/${ns}:${k} placeholder mismatch`);
      }
    }
  }
});

test('every message parses as valid ICU in its locale (all namespaces)', () => {
  for (const loc of ACTIVE_LOCALES) {
    for (const ns of NS) {
      const cat = load(loc, ns);
      for (const [k, v] of Object.entries(cat)) {
        assert.doesNotThrow(() => new IntlMessageFormat(v, loc), `${loc}/${ns}:${k} invalid ICU`);
      }
    }
  }
});
