import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'catalogs');
const NS = ['common', 'onboarding', 'settings', 'score', 'home', 'profile', 'session', 'feed', 'marketplace', 'radio', 'calendar', 'habits', 'store', 'coach', 'cycle', 'cook', 'nutrition'];

function load(loc, ns) {
  const p = join(root, loc, `${ns}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
// The ICU argument NAMES a message interpolates (e.g. {count}, {name},
// {pts, number}, {count, plural, …}), order-insensitive. We compare argument
// names — NOT raw brace groups — because ICU plural/select sub-messages contain
// translated literals ({# request} vs {# solicitud}) that legitimately differ
// per locale; a name like `count` is the real placeholder that must be preserved.
// A real ICU argument is an identifier immediately followed by `,` ({count,
// plural…}, {pts, number}) or `}` ({name}). Requiring that delimiter ignores
// both `#`-prefixed plural branches AND branches that legitimately lead with a
// word (pt-BR "{mais # no plano}") — those aren't placeholders, just localized
// sub-message text, and must not have to match across locales.
function placeholders(s) {
  return [...String(s).matchAll(/\{\s*([A-Za-z_][\w-]*)\s*[,}]/g)].map((m) => m[1]).sort();
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
