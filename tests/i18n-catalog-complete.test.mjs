import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { ACTIVE_LOCALES } from '../mobile-app/src/i18n/locales.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'catalogs');
const NS = ['common', 'onboarding', 'settings', 'score', 'home', 'profile', 'session', 'feed', 'marketplace', 'radio', 'calendar', 'habits', 'store', 'coach', 'cycle', 'cook', 'nutrition', 'goal'];

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

// ⚠ A NAMESPACE MUST BE REGISTERED IN BOTH LISTS OR IT SHIPS UNGATED, AND UNTIL
// NOW NOTHING ENFORCED THAT. This file's NS array decides what gets VALIDATED;
// mobile-app/src/i18n/index.js's NS array decides what the app actually LOADS.
// Measured, not assumed: with 'goal' removed from the runtime array the entire
// 2539-test suite stayed green — the catalogs kept being checked while the app
// never loaded them, so every tr('goal:…') fell back to its English
// defaultValue and the whole cut silently reverted to English in twelve
// locales, with every gate passing. That is the worst shape a gate can have:
// present, green, and blind.
//
// Both lists are DERIVED here rather than a third copy being typed out — the
// house rule, and the reason this can never go stale.
// ⚠ AN EMPTY VALUE RENDERS THE RAW KEY ON SCREEN, and until this test existed
// nothing said so. The runtime is initialised with `returnEmptyString: false`
// (mobile-app/src/i18n/index.js), which is deliberate — it is what makes a
// blank translation fall through rather than paint nothing — but the fall-back
// it produces is the KEY ITSELF (`goal:overall.save`), i.e. the loudest
// possible failure, on the one screen the member is trying to act on.
// Key parity cannot catch it: a key whose value is `""` IS present, so the
// parity gate reads the locale as complete. ICU validity cannot catch it
// either: the empty string is a valid ICU message.
// Found by mutation-testing cut 12 — emptying a single ru value passed every
// gate in this file. Derived over the whole tree rather than enumerated, so it
// protects every namespace and every locale added later; measured at zero
// offenders when it landed, so it starts clean rather than documenting a gap.
test('no catalog value is empty — an empty value renders the raw key', () => {
  const offenders = [];
  for (const loc of ACTIVE_LOCALES) {
    for (const ns of NS) {
      for (const [k, v] of Object.entries(load(loc, ns))) {
        if (typeof v !== 'string' || v.trim() === '') offenders.push(`${loc}/${ns}:${k}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `empty catalog values render the raw key on screen: ${offenders.join(', ')}`);
});

test('the runtime namespace list and this gate agree, in both directions', () => {
  const runtime = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'index.js'),
    'utf8',
  );
  const m = runtime.match(/const NS\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'could not find the runtime NS array — this guard is about a list that must exist');
  const wired = m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  // Guard the guard: a regex that matched nothing would pass every set
  // comparison below vacuously.
  assert.ok(wired.length >= 15, `only ${wired.length} runtime namespaces parsed — the matcher is broken, not the app`);

  const missingFromRuntime = NS.filter((n) => !wired.includes(n));
  assert.deepEqual(missingFromRuntime, [],
    'validated here but NEVER LOADED by the app — every key falls back to English');
  const missingFromGate = wired.filter((n) => !NS.includes(n));
  assert.deepEqual(missingFromGate, [],
    'loaded by the app but NOT validated here — a locale can ship a missing or malformed key');

  // And a namespace with catalogs on disk that neither list mentions is the
  // same omission arriving from the third direction.
  const onDisk = readdirSync(join(root, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  assert.ok(onDisk.length >= 15, `only ${onDisk.length} en catalogs found — the read is broken`);
  const orphan = onDisk.filter((n) => !NS.includes(n));
  assert.deepEqual(orphan, [], 'an en catalog exists that no list registers — authored and unreachable');
});
