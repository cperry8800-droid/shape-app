# i18n Foundation + Mobile Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the mobile app's internationalization foundation and prove it end-to-end on a thin pilot (`en` + `ar` RTL + `ja` CJK) across the launch flow, Settings, and the Score "The Standing" screen.

**Architecture:** A pure locale **registry** + **resolution** module drives a `react-i18next` + `i18next-icu` runtime reading **ICU-MessageFormat JSON** catalogs (namespaced per screen, `en` = source + fallback). A `ShapeLocale` service persists the choice (localStorage + `user_goals('app_locale')` + a mirrored `client_profiles.locale` column) exactly like the existing appearance/timezone patterns. A first-launch **language-picker** stage + a **Settings** switcher set the locale; `dir="rtl"` + logical CSS + on-demand self-hosted Noto fonts handle RTL/CJK.

**Tech Stack:** Vite 8 / React 19 (mobile-app), `i18next` + `react-i18next` + `i18next-icu` + `intl-messageformat`, Node's built-in `node --test` for pure-module tests, Supabase (`client_profiles`), Node scripts for extraction/AI-translation.

## Global Constraints

- **Translate binding is `tr` (hook) or `i18n.t` (module scope) — NEVER `t`.** `t` is the pervasive theme token (`const t = useBS()`). Using `t` for translate is a build-breaking collision.
- **Catalogs are ICU-MessageFormat JSON**, one file per `locale × namespace`, semantic keys (`standing.verdict`), never English-text-as-key.
- **English is the authored source of truth AND the fallback.** Fallback chain: `active locale → en → the key string`. Never blank, never a raw key leaked to users.
- **No behavior change when `locale === 'en'`** — the app renders byte-equivalent English.
- **Persistence reuses the existing patterns:** `localStorage['shape.locale']` (pre-account) + `user_goals('app_locale')` (signed-in) + `client_profiles.locale` (server-readable mirror). Account value wins on login; else adopt the pre-account choice.
- **Pilot locales only:** `en`, `ar` (RTL, Noto Naskh Arabic), `ja` (CJK, Noto Sans JP). The other 19 are a later rollout.
- **Fonts self-hosted** (no CDN — matches the repo's SRI posture), loaded **per-locale on demand**.
- **Mobile build is PowerShell-only:** `$env:VITE_BASE='/m/'; npm run build` from `mobile-app/` (Git Bash mangles `VITE_BASE=/m/`).
- **New test files MUST be added to the root `package.json` `"test"` script** (the runner lists each file explicitly).
- **LF line endings** — after any Edit/Write on Windows, `sed -i 's/\r$//' <file>` before committing (repo is LF; the pre-commit hook + CI enforce it).
- Commit after each task; docs/test-only commits skip the verify hook automatically.

---

### Task 1: Locale registry + resolution (pure module)

**Files:**
- Create: `mobile-app/src/i18n/locales.mjs`
- Test: `tests/i18n-locales.test.mjs`
- Modify: `package.json` (add the test file to the `"test"` script list)

**Interfaces:**
- Produces: `LOCALES` (array of `{ code, englishName, nativeName, dir, script, font }`), `SUPPORTED` (Set of codes), `localeMeta(code) → entry|null`, `isSupported(code) → bool`, `dirOf(code) → 'ltr'|'rtl'`, `resolveLocale(stored, deviceLangs) → code` (stored wins if supported; else first device language whose base matches a supported code; else `'en'`).

- [ ] **Step 1: Write the failing test**

```js
// tests/i18n-locales.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, localeMeta, isSupported, dirOf, resolveLocale } from '../mobile-app/src/i18n/locales.mjs';

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

test('resolveLocale: stored wins when supported', () => {
  assert.equal(resolveLocale('ja', ['en-US', 'en']), 'ja');
});
test('resolveLocale: falls back to first matching device language', () => {
  assert.equal(resolveLocale(null, ['fr-FR', 'en']), 'fr');
  assert.equal(resolveLocale('', ['pt-BR', 'pt']), 'pt-BR'); // exact regional match preferred
  assert.equal(resolveLocale(null, ['pt-PT']), 'pt-BR');     // base 'pt' → our pt-BR
});
test('resolveLocale: unknown stored + unknown device → en', () => {
  assert.equal(resolveLocale('zzz', ['xx-YY']), 'en');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/i18n-locales.test.mjs`
Expected: FAIL — `Cannot find module '.../mobile-app/src/i18n/locales.mjs'`.

- [ ] **Step 3: Write the module**

```js
// mobile-app/src/i18n/locales.mjs
// The single source of truth for supported locales. `font` is a stack KEY
// resolved by fonts.css (@font-face + unicode-range); `dir` drives RTL.
export const LOCALES = [
  { code: 'en',      englishName: 'English',            nativeName: 'English',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'es',      englishName: 'Spanish',            nativeName: 'Español',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'pt-BR',   englishName: 'Portuguese (Brazil)',nativeName: 'Português',  dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'fr',      englishName: 'French',             nativeName: 'Français',   dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'de',      englishName: 'German',             nativeName: 'Deutsch',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'it',      englishName: 'Italian',            nativeName: 'Italiano',   dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'id',      englishName: 'Indonesian',         nativeName: 'Indonesia',  dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'vi',      englishName: 'Vietnamese',         nativeName: 'Tiếng Việt', dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'tr',      englishName: 'Turkish',            nativeName: 'Türkçe',     dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'ha',      englishName: 'Hausa',              nativeName: 'Hausa',      dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'pcm',     englishName: 'Nigerian Pidgin',    nativeName: 'Naijá',      dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'ru',      englishName: 'Russian',            nativeName: 'Русский',    dir: 'ltr', script: 'cyrillic', font: 'latin' },
  { code: 'uk',      englishName: 'Ukrainian',          nativeName: 'Українська', dir: 'ltr', script: 'cyrillic', font: 'latin' },
  { code: 'hi',      englishName: 'Hindi',              nativeName: 'हिन्दी',       dir: 'ltr', script: 'deva',     font: 'deva' },
  { code: 'bn',      englishName: 'Bengali',            nativeName: 'বাংলা',       dir: 'ltr', script: 'beng',     font: 'beng' },
  { code: 'te',      englishName: 'Telugu',             nativeName: 'తెలుగు',      dir: 'ltr', script: 'telu',     font: 'telu' },
  { code: 'ar',      englishName: 'Arabic',             nativeName: 'العربية',     dir: 'rtl', script: 'arab',     font: 'arab' },
  { code: 'arz',     englishName: 'Egyptian Arabic',    nativeName: 'مصرى',        dir: 'rtl', script: 'arab',     font: 'arab' },
  { code: 'ur',      englishName: 'Urdu',               nativeName: 'اردو',        dir: 'rtl', script: 'arab',     font: 'urdu' },
  { code: 'zh-Hans', englishName: 'Chinese (Simplified)',nativeName: '简体中文',    dir: 'ltr', script: 'hans',     font: 'cjk-sc' },
  { code: 'ja',      englishName: 'Japanese',           nativeName: '日本語',      dir: 'ltr', script: 'jpan',     font: 'cjk-jp' },
  { code: 'ko',      englishName: 'Korean',             nativeName: '한국어',      dir: 'ltr', script: 'kore',     font: 'cjk-kr' },
];

export const SUPPORTED = new Set(LOCALES.map((l) => l.code));
const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
const BY_BASE = new Map(); // 'pt' → 'pt-BR' (first regional match wins)
for (const l of LOCALES) { const base = l.code.split('-')[0]; if (!BY_BASE.has(base)) BY_BASE.set(base, l.code); }

export function localeMeta(code) { return BY_CODE.get(code) || null; }
export function isSupported(code) { return SUPPORTED.has(code); }
export function dirOf(code) { return BY_CODE.get(code)?.dir === 'rtl' ? 'rtl' : 'ltr'; }

// stored (user pref) wins if supported; else first device language matching by
// exact code then by base; else English. deviceLangs = navigator.languages-style array.
export function resolveLocale(stored, deviceLangs = []) {
  if (stored && SUPPORTED.has(stored)) return stored;
  for (const raw of deviceLangs || []) {
    if (!raw) continue;
    if (SUPPORTED.has(raw)) return raw;
    const base = String(raw).split('-')[0].toLowerCase();
    if (BY_BASE.has(base)) return BY_BASE.get(base);
  }
  return 'en';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/i18n-locales.test.mjs`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Register the test in the runner**

In `package.json`, append ` tests/i18n-locales.test.mjs` to the end of the `"test"` script string. Then run `npm test` and confirm the full suite still passes.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/i18n/locales.mjs tests/i18n-locales.test.mjs
git add mobile-app/src/i18n/locales.mjs tests/i18n-locales.test.mjs package.json
git commit -m "feat(i18n): locale registry + resolution (22 locales, pilot foundation)"
```

---

### Task 2: `client_profiles.locale` migration (server-readable mirror)

**Files:**
- Create: `supabase-migrations/2026-07-06-client-profiles-locale.sql`

**Interfaces:**
- Produces: a nullable `client_profiles.locale text` column (owner runs it on Supabase; code no-ops until applied — the write is best-effort).

- [ ] **Step 1: Write the migration** (mirrors the existing `2026-06-27-client-timezone.sql` pattern — dedicated text column, idempotent, no backfill source exists so none)

```sql
-- Per-user UI locale (BCP-47 code from the supported set, e.g. 'en','ar','ja').
-- Server-readable mirror of the app's locale preference so later sub-projects
-- (localized emails/notifications) can address a member in their language.
-- Dedicated text column (cheaper to read than JSONB), same shape as timezone.
alter table public.client_profiles
  add column if not exists locale text;
```

- [ ] **Step 2: Verify it parses (read-only sanity)**

Run: `grep -c 'add column if not exists locale' supabase-migrations/2026-07-06-client-profiles-locale.sql`
Expected: `1`.

- [ ] **Step 3: Commit + post the raw link for the owner**

```bash
sed -i 's/\r$//' supabase-migrations/2026-07-06-client-profiles-locale.sql
git add supabase-migrations/2026-07-06-client-profiles-locale.sql
git commit -m "feat(i18n): migration — client_profiles.locale column"
```

Per the repo convention, after pushing, reply to the owner with only the raw link:
`raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-07-06-client-profiles-locale.sql`

---

### Task 3: `ShapeLocale` persistence service + reconcile logic

**Files:**
- Create: `mobile-app/src/services/shapeLocale.js`
- Create: `mobile-app/src/i18n/reconcile.mjs` (pure, testable)
- Test: `tests/i18n-persistence.test.mjs`
- Modify: `package.json` (register test), `mobile-app/src/main.jsx` (import the service)

**Interfaces:**
- `reconcile.mjs` produces: `reconcileLocale({ stored, account }) → { locale, writeAccount, writeLocal }` — account value wins when present + supported (and back-writes localStorage); else the pre-account `stored` is adopted (and gets written to the account). Unknown values are ignored (fall to `en`).
- `shapeLocale.js` produces the window global `window.ShapeLocale = { get(), set(code), subscribe(fn), _hydrateFromAccount(accountLocale) }`. `set` writes localStorage, mirrors to `user_goals('app_locale')` + `client_profiles.locale` (best-effort), and notifies subscribers.

- [ ] **Step 1: Write the failing test (reconcile logic only — the pure part)**

```js
// tests/i18n-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLocale } from '../mobile-app/src/i18n/reconcile.mjs';

test('account locale wins and back-writes localStorage', () => {
  assert.deepEqual(reconcileLocale({ stored: 'en', account: 'ja' }),
    { locale: 'ja', writeAccount: false, writeLocal: true });
});
test('no account locale → adopt pre-account choice into the account', () => {
  assert.deepEqual(reconcileLocale({ stored: 'ar', account: null }),
    { locale: 'ar', writeAccount: true, writeLocal: false });
});
test('neither set → en, nothing to write', () => {
  assert.deepEqual(reconcileLocale({ stored: null, account: null }),
    { locale: 'en', writeAccount: false, writeLocal: false });
});
test('unsupported values are ignored', () => {
  assert.deepEqual(reconcileLocale({ stored: 'zzz', account: 'qqq' }),
    { locale: 'en', writeAccount: false, writeLocal: false });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/i18n-persistence.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `reconcile.mjs`**

```js
// mobile-app/src/i18n/reconcile.mjs
import { isSupported } from './locales.mjs';
// Decide the effective locale + which stores to update after login.
// account wins if valid (and we refresh localStorage); else adopt the local pref
// into the account. Returns { locale, writeAccount, writeLocal }.
export function reconcileLocale({ stored, account }) {
  const a = isSupported(account) ? account : null;
  const s = isSupported(stored) ? stored : null;
  if (a) return { locale: a, writeAccount: false, writeLocal: a !== stored };
  if (s) return { locale: s, writeAccount: true, writeLocal: false };
  return { locale: 'en', writeAccount: false, writeLocal: false };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/i18n-persistence.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the `ShapeLocale` service** (window-global, mirrors the appearance/`ShapeUnits` persistence pattern; best-effort cloud writes so it no-ops signed-out / pre-migration)

```js
// mobile-app/src/services/shapeLocale.js
import { resolveLocale, isSupported } from '../i18n/locales.mjs';
import { reconcileLocale } from '../i18n/reconcile.mjs';

const LS_KEY = 'shape.locale';
const subs = new Set();
let current = null;

function readLocal() { try { return localStorage.getItem(LS_KEY); } catch { return null; } }
function writeLocal(code) { try { localStorage.setItem(LS_KEY, code); } catch {} }
function deviceLangs() { try { return navigator.languages || [navigator.language].filter(Boolean); } catch { return []; } }

function notify(code) { current = code; for (const fn of subs) { try { fn(code); } catch {} } }

async function mirrorToAccount(code) {
  // user_goals doc + the client_profiles.locale column; both best-effort.
  try { await window.shapeDb?.saveUserGoals?.('app_locale', { locale: code }); } catch {}
  try { await window.ShapeProfileLocale?.set?.(code); } catch {} // thin PATCH helper (see below), optional
}

export const ShapeLocale = {
  // Boot value before any account resolves: stored pref else device match.
  get() { return current || resolveLocale(readLocal(), deviceLangs()); },
  async set(code) {
    if (!isSupported(code)) return;
    writeLocal(code);
    notify(code);
    await mirrorToAccount(code);
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  // Called after login with the account's stored locale (from user_goals/profile).
  async _hydrateFromAccount(accountLocale) {
    const { locale, writeAccount, writeLocal: wl } = reconcileLocale({ stored: readLocal(), account: accountLocale });
    if (wl) writeLocal(locale);
    notify(locale);
    if (writeAccount) { try { await window.shapeDb?.saveUserGoals?.('app_locale', { locale }); } catch {} }
    return locale;
  },
};

if (typeof window !== 'undefined') window.ShapeLocale = ShapeLocale;
```

- [ ] **Step 6: Import the service at boot**

In `mobile-app/src/main.jsx`, add after the other service imports (before `await import('./broadsheet/index.jsx')`):

```js
import './services/shapeLocale.js'; // window.ShapeLocale — UI locale preference
```

- [ ] **Step 7: Register the test + run full suite**

Append ` tests/i18n-persistence.test.mjs` to the root `package.json` `"test"` script. Run `npm test`; expect all green.

- [ ] **Step 8: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/i18n/reconcile.mjs mobile-app/src/services/shapeLocale.js tests/i18n-persistence.test.mjs mobile-app/src/main.jsx
git add mobile-app/src/i18n/reconcile.mjs mobile-app/src/services/shapeLocale.js tests/i18n-persistence.test.mjs package.json mobile-app/src/main.jsx
git commit -m "feat(i18n): ShapeLocale persistence service + reconcile logic"
```

---

### Task 4: i18n runtime (react-i18next + i18next-icu) + ICU plural test

**Files:**
- Modify: `mobile-app/package.json` (add deps)
- Create: `mobile-app/src/i18n/index.js`
- Test: `tests/i18n-icu-plurals.test.mjs`
- Modify: `package.json` (register test)

**Interfaces:**
- Consumes: `locales.mjs` (`resolveLocale`, `dirOf`), `ShapeLocale`.
- Produces: `initI18n()` (idempotent init returning the `i18next` instance), `useTr()` hook → `{ tr, locale, dir }` where `tr(key, vars)`; the exported `i18n` instance for module-scope `i18n.t`. `applyDir(code)` sets `document.documentElement`/phone-surface `dir`.

- [ ] **Step 1: Add dependencies**

In `mobile-app/package.json` `dependencies`, add (pin the current majors):
```json
"i18next": "^25.7.0",
"react-i18next": "^16.1.0",
"i18next-icu": "^2.4.0",
"intl-messageformat": "^10.7.0"
```
Run: `cd mobile-app && npm install`. Expected: lockfile updates, no peer errors with React 19.

- [ ] **Step 2: Write the failing ICU plural test** (validates the *messages + plural rules* in node via `intl-messageformat` — the same engine `i18next-icu` uses — without needing React/DOM)

```js
// tests/i18n-icu-plurals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { IntlMessageFormat } from 'intl-messageformat';

// Representative ICU strings we will ship in catalogs; assert plural correctness.
const EN = '{count, plural, one {# point} other {# points}}';
const RU = '{count, plural, one {# очко} few {# очка} many {# очков} other {# очка}}';
const AR = '{count, plural, zero {لا نقاط} one {نقطة} two {نقطتان} few {# نقاط} many {# نقطة} other {# نقطة}}';

test('English 2-form plural', () => {
  assert.equal(new IntlMessageFormat(EN, 'en').format({ count: 1 }), '1 point');
  assert.equal(new IntlMessageFormat(EN, 'en').format({ count: 5 }), '5 points');
});
test('Russian 3-form plural selects few/many correctly', () => {
  assert.equal(new IntlMessageFormat(RU, 'ru').format({ count: 2 }), '2 очка');
  assert.equal(new IntlMessageFormat(RU, 'ru').format({ count: 5 }), '5 очков');
});
test('Arabic selects distinct forms (few for 3, other for 100)', () => {
  const f = (n) => new IntlMessageFormat(AR, 'ar').format({ count: n });
  assert.notEqual(f(3), f(100)); // few vs many/other differ — rules wired
  assert.ok(String(f(0)).includes('لا')); // zero form
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test tests/i18n-icu-plurals.test.mjs`
Expected: FAIL — `Cannot find package 'intl-messageformat'` (until Step 1's install completes; if install ran, this test should already pass, which is fine — it locks the plural contract).

- [ ] **Step 4: Write the runtime init**

```js
// mobile-app/src/i18n/index.js
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import ICU from 'i18next-icu';
import { resolveLocale, dirOf } from './locales.mjs';

// Eagerly bundle the pilot namespaces; the rollout adds a lazy backend later.
import enCommon from './catalogs/en/common.json';
import enOnboarding from './catalogs/en/onboarding.json';
import enSettings from './catalogs/en/settings.json';
import enScore from './catalogs/en/score.json';

const NS = ['common', 'onboarding', 'settings', 'score'];
const PILOT = ['en', 'ar', 'ja'];

// Vite: import all pilot catalogs as a glob so ar/ja load once their JSON exists.
const all = import.meta.glob('./catalogs/*/*.json', { eager: true });
function resources() {
  const res = { en: { common: enCommon, onboarding: enOnboarding, settings: enSettings, score: enScore } };
  for (const [path, mod] of Object.entries(all)) {
    const m = path.match(/catalogs\/([^/]+)\/([^/]+)\.json$/);
    if (!m) continue;
    const [, loc, ns] = m;
    (res[loc] ||= {})[ns] = mod.default || mod;
  }
  return res;
}

let inited = false;
export function initI18n() {
  if (inited) return i18next;
  const lng = resolveLocale(
    (typeof localStorage !== 'undefined' && localStorage.getItem('shape.locale')) || null,
    (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  );
  i18next.use(ICU).use(initReactI18next).init({
    lng, fallbackLng: 'en', supportedLngs: PILOT.concat('en'),
    ns: NS, defaultNS: 'common', resources: resources(),
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false, returnEmptyString: false,
  });
  inited = true;
  applyDir(lng);
  return i18next;
}

// Apply text direction to the phone surface (and <html> for good measure).
export function applyDir(code) {
  const dir = dirOf(code);
  try { document.documentElement.setAttribute('dir', dir); document.documentElement.setAttribute('lang', code); } catch {}
  try { document.getElementById('bs-phone-surface')?.setAttribute('dir', dir); } catch {}
}

// The hook every component uses. NEVER name this `t` (theme token collision).
export function useTr(ns) {
  const { t: translate, i18n } = useTranslation(ns);
  return { tr: translate, locale: i18n.language, dir: dirOf(i18n.language) };
}

export { i18next as i18n };
```

- [ ] **Step 5: Run the plural test to verify it passes**

Run: `node --test tests/i18n-icu-plurals.test.mjs`
Expected: PASS.

- [ ] **Step 6: Register the test + verify the mobile build compiles the runtime**

Append ` tests/i18n-icu-plurals.test.mjs` to root `package.json` `"test"`. Then (PowerShell) `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` — expect exit 0 (the glob + ICU init compile; catalogs from Task 5 exist).

> Note: Task 5 creates the `en` catalog JSON the import in Step 4 references — if executing strictly in order, create empty `{}` stubs for the four `en/*.json` first so this task builds, then fill them in Task 5.

- [ ] **Step 7: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/i18n/index.js tests/i18n-icu-plurals.test.mjs
git add mobile-app/src/i18n/index.js mobile-app/package.json mobile-app/package-lock.json tests/i18n-icu-plurals.test.mjs package.json
git commit -m "feat(i18n): react-i18next + i18next-icu runtime, useTr hook, applyDir"
```

---

### Task 5: `en` source catalogs (pilot namespaces) + completeness test

**Files:**
- Create: `mobile-app/src/i18n/catalogs/en/common.json`, `.../onboarding.json`, `.../settings.json`, `.../score.json`
- Test: `tests/i18n-catalog-complete.test.mjs`
- Modify: `package.json` (register test)

**Interfaces:**
- Produces: the authored `en` ICU-JSON for the pilot surfaces + a test asserting every wired locale carries every `en` key.

- [ ] **Step 1: Author the `en` catalogs** (seed with the pilot's actual strings — grow as Tasks 6–8/10 extract more)

```json
// mobile-app/src/i18n/catalogs/en/common.json
{
  "action.continue": "Continue",
  "action.back": "Back",
  "action.done": "Done"
}
```
```json
// mobile-app/src/i18n/catalogs/en/onboarding.json
{
  "lang.title": "Choose your language",
  "lang.subtitle": "You can change this anytime in Settings."
}
```
```json
// mobile-app/src/i18n/catalogs/en/settings.json
{
  "language.row": "Language",
  "language.current": "{name}"
}
```
```json
// mobile-app/src/i18n/catalogs/en/score.json
{
  "standing.verdict": "{tier}, and climbing.",
  "standing.toNext": "{points, plural, one {# point to {next}} other {# points to {next}}}"
}
```

- [ ] **Step 2: Write the completeness test**

```js
// tests/i18n-catalog-complete.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-app', 'src', 'i18n', 'catalogs');
const WIRED = ['en', 'ar', 'ja']; // pilot locales; extend as rollout adds locales
const NS = ['common', 'onboarding', 'settings', 'score'];

function load(loc, ns) {
  const p = join(root, loc, `${ns}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}
function keys(obj, pre = '') { // flatten (catalogs are flat, but be safe)
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]);
}

test('every wired locale has every en key in every namespace', () => {
  for (const ns of NS) {
    const enKeys = new Set(keys(load('en', ns)));
    for (const loc of WIRED) {
      const locKeys = new Set(keys(load(loc, ns)));
      const missing = [...enKeys].filter((k) => !locKeys.has(k));
      assert.equal(missing.length, 0, `${loc}/${ns} missing: ${missing.join(', ')}`);
    }
  }
});
```

- [ ] **Step 3: Run — expect FAIL** (ar/ja catalogs don't exist yet; the test names exactly which keys are missing)

Run: `node --test tests/i18n-catalog-complete.test.mjs`
Expected: FAIL listing the missing `ar/*` + `ja/*` keys. This test goes green in Task 12 when the pilot translations land. Register it now but expect it red until Task 12.

- [ ] **Step 4: Register test + commit** (the failing completeness test is the tracking mechanism for the pilot translations)

```bash
sed -i 's/\r$//' mobile-app/src/i18n/catalogs/en/*.json tests/i18n-catalog-complete.test.mjs
git add mobile-app/src/i18n/catalogs/en tests/i18n-catalog-complete.test.mjs package.json
git commit -m "feat(i18n): en source catalogs (pilot namespaces) + completeness gate"
```

> When running `npm test` before Task 12, invoke the suite without this file, or expect this one file red by design. Add it to the root `"test"` list in Task 12 once ar/ja are populated so CI stays green.

---

### Task 6: Mount the provider + apply `dir` in the app shell

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx` (import + init at module top; wrap the render at `:1992`; subscribe to `ShapeLocale`)

**Interfaces:**
- Consumes: `initI18n`, `applyDir` (Task 4), `ShapeLocale` (Task 3).
- Produces: a live `<I18nextProvider>` around the app; `dir` flips on locale change without reload.

- [ ] **Step 1: Import + init**

At the top of `iosAppBroadsheetMain.jsx` (with the other imports), add:
```js
import { I18nextProvider } from 'react-i18next';
import { initI18n, applyDir, i18n as bsI18n } from '../i18n/index.js';
initI18n(); // idempotent; sets initial lng + dir from stored/device
```

- [ ] **Step 2: Wrap the provider** — at `iosAppBroadsheetMain.jsx:1992`, wrap the existing `<BSProvider ...>...</BSProvider>` with `<I18nextProvider i18n={bsI18n}>` … `</I18nextProvider>`.

- [ ] **Step 3: Live locale changes** — inside `BSAppShell` (`:1387`), add an effect that subscribes to `ShapeLocale` and drives i18next + dir:
```js
React.useEffect(() => window.ShapeLocale?.subscribe?.((code) => {
  bsI18n.changeLanguage(code); applyDir(code);
}), []);
```
And after login resolves the account, call `window.ShapeLocale._hydrateFromAccount(accountLocale)` where `accountLocale` comes from the loaded `user_goals('app_locale')?.locale` (co-locate with the existing appearance-on-login hydrate).

- [ ] **Step 4: Verify build + no-op-when-en** — (PowerShell) build the app; launch the `/m/` preview with no stored locale → English renders identically to before (byte-equivalent), `document.documentElement.dir === 'ltr'`.

Run (PowerShell): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx
git commit -m "feat(i18n): mount I18nextProvider + live dir switching in the app shell"
```

---

### Task 7: First-launch language-picker splash

**Files:**
- Create: `mobile-app/src/broadsheet/BSLanguagePicker.jsx`
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx` (new `'lang'` stage first when no stored locale)

**Interfaces:**
- Consumes: `LOCALES` (Task 1), `ShapeLocale` (Task 3), `useTr` (Task 4).
- Produces: `<BSLanguagePicker onDone={fn} />` — full-screen endonym list, device match pre-selected, "Continue" sets the locale then calls `onDone`.

- [ ] **Step 1: Build the picker component**

```jsx
// mobile-app/src/broadsheet/BSLanguagePicker.jsx
import React from 'react';
import { LOCALES, resolveLocale } from '../i18n/locales.mjs';
import { useTr } from '../i18n/index.js';

export default function BSLanguagePicker({ onDone }) {
  const { tr, dir } = useTr('onboarding');
  const device = resolveLocale(null, (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []);
  const [sel, setSel] = React.useState(device);
  const ordered = [...LOCALES].sort((a, b) => (a.code === device ? -1 : b.code === device ? 1 : 0));
  return (
    <div dir={dir} style={{ position: 'absolute', inset: 0, background: '#0c0a09', color: '#f4efe6', display: 'flex', flexDirection: 'column', padding: '48px 20px 20px' }}>
      <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 700 }}>{tr('lang.title')}</div>
      <div style={{ opacity: 0.6, fontSize: 13, marginTop: 6 }}>{tr('lang.subtitle')}</div>
      <div style={{ flex: 1, overflowY: 'auto', margin: '18px -4px', display: 'grid', gap: 8 }}>
        {ordered.map((l) => (
          <button key={l.code} onClick={() => setSel(l.code)} dir={l.dir}
            style={{ textAlign: 'start', padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${sel === l.code ? '#2ee0c4' : 'rgba(244,239,230,0.16)'}`,
              background: sel === l.code ? 'rgba(46,224,196,0.12)' : 'transparent', color: '#f4efe6' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{l.nativeName}</span>
            <span style={{ opacity: 0.5, fontSize: 12, marginInlineStart: 8 }}>{l.englishName}</span>
          </button>
        ))}
      </div>
      <button onClick={async () => { await window.ShapeLocale?.set?.(sel); onDone && onDone(); }}
        style={{ padding: '15px', borderRadius: 999, border: 0, background: '#2ee0c4', color: '#0c0a09', fontWeight: 800, cursor: 'pointer' }}>
        {tr('common:action.continue')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the stage** — in `BSAppShell` (`iosAppBroadsheetMain.jsx:1391`), change the initial stage so it's `'lang'` when no locale is stored:
```js
const [stage, setStage] = useStateBSM(
  (() => { try { return localStorage.getItem('shape.locale') ? 'splash' : 'lang'; } catch { return 'splash'; } })()
);
```
Add the render branch (before the `'splash'` branch): `if (stage === 'lang') return <BSLanguagePicker onDone={() => setStage('splash')} />;` and import the component at the top.

- [ ] **Step 3: Verify** — (PowerShell) build; in the `/m/` preview, clear `localStorage`, reload → the picker appears first; pick 日本語 → `localStorage['shape.locale']==='ja'`, continue lands on the normal splash, app copy shows the `ja` strings once Task 12 lands (English until then via fallback). Reload → picker does NOT reappear.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/BSLanguagePicker.jsx mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx
git add mobile-app/src/broadsheet/BSLanguagePicker.jsx mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx
git commit -m "feat(i18n): first-launch language-picker splash"
```

---

### Task 8: Settings → Language switcher

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (add a Language row to the Settings hub, near the Appearance/units section)

**Interfaces:**
- Consumes: `LOCALES`, `ShapeLocale`, `useTr`.
- Produces: a Settings row opening an endonym list; selecting calls `ShapeLocale.set(code)` (live re-render + dir flip via Task 6's subscriber).

- [ ] **Step 1: Add the switcher** — in the Settings component, add an "Accessibility"/"Preferences"-adjacent section. Row label uses `tr('settings:language.row')`; tapping opens a sheet listing `LOCALES` by `nativeName` (current checked); `onSelect={(code) => window.ShapeLocale.set(code)}`. Reuse the existing settings-row + sheet styling (match the "Text size" section pattern already in `BSSettings`). Keep the sheet `dir`-aware (each row `dir={l.dir}`).

- [ ] **Step 2: Verify** — (PowerShell) build; open Settings → Language → pick العربية → the whole app flips to `dir="rtl"` live (no reload) and Arabic strings show where translated (Task 12), English elsewhere via fallback; pick English → flips back to LTR.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(i18n): Settings language switcher (live locale + dir)"
```

---

### Task 9: Per-locale on-demand Noto fonts (ar + ja for the pilot)

**Files:**
- Create: `mobile-app/src/i18n/fonts.css`
- Add: `mobile-app/public/fonts/NotoNaskhArabic-*.woff2`, `NotoSansJP-*.woff2` (self-hosted subsets)
- Modify: `mobile-app/src/i18n/index.js` (`applyDir` also sets a `data-locale-font` attr) and `mobile-app/src/main.jsx` (import `fonts.css`)

**Interfaces:**
- Produces: `@font-face` for the pilot non-Latin scripts wired via `unicode-range`, plus a `[data-locale-font]`-scoped font-family so a Latin session never needs the Noto files (the browser only fetches a face when a matching glyph is rendered).

- [ ] **Step 1: Add the fonts CSS** (self-hosted, matches the repo's font posture)

```css
/* mobile-app/src/i18n/fonts.css — per-script fallback faces, loaded on demand. */
@font-face { font-family: 'Noto Naskh Arabic'; src: url('/m/fonts/NotoNaskhArabic-Regular.woff2') format('woff2');
  font-weight: 400; font-display: swap; unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
@font-face { font-family: 'Noto Sans JP'; src: url('/m/fonts/NotoSansJP-Regular.woff2') format('woff2');
  font-weight: 400; font-display: swap; unicode-range: U+3000-30FF, U+3400-4DBF, U+4E00-9FFF, U+FF00-FFEF; }

/* When the active locale needs a non-Latin face, append it to the stacks so the
   editorial Latin fonts still win for any Latin glyphs (brand marks, numbers). */
[data-locale-font='arab'] { --bs-font-fallback: 'Noto Naskh Arabic'; }
[data-locale-font='cjk-jp'] { --bs-font-fallback: 'Noto Sans JP'; }
```

- [ ] **Step 2: Import + wire** — add `import './i18n/fonts.css';` to `mobile-app/src/main.jsx`. In `applyDir` (Task 4), also set `document.documentElement.dataset.localeFont = localeMeta(code)?.font || 'latin'` (import `localeMeta`). The broadsheet's root font stacks append `var(--bs-font-fallback)`; add that once to the phone-surface base style.

- [ ] **Step 3: Verify** — (PowerShell) build; DevTools Network → in an English session, the Noto woff2 files are NOT requested; switch to `ar` → `NotoNaskhArabic` loads and Arabic renders in Naskh; switch to `ja` → `NotoSansJP` loads. Latin brand marks (SHAPE) stay in the editorial font.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/i18n/fonts.css mobile-app/src/i18n/index.js mobile-app/src/main.jsx
git add mobile-app/src/i18n/fonts.css mobile-app/public/fonts mobile-app/src/i18n/index.js mobile-app/src/main.jsx
git commit -m "feat(i18n): on-demand self-hosted Noto fonts (ar Naskh, ja) via unicode-range"
```

---

### Task 10: Localize the Score "The Standing" pilot screen + RTL pass

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSShapeScorePage` `:18772`, `BSScoreStandingChart` `:18475`)
- Modify: `mobile-app/src/i18n/catalogs/en/score.json` (add every extracted key)

**Interfaces:**
- Consumes: `useTr('score')`.
- Produces: the Score screen rendering all user-facing copy through `tr(...)` and mirroring correctly under RTL. English output is byte-identical to today.

- [ ] **Step 1: Extract the screen's strings** — walk `BSShapeScorePage` + `BSScoreStandingChart`; for each user-facing literal add a `score.*` key to `en/score.json` and replace the literal with `tr('score.key', vars)`. Example (the verdict at `:18831`):
  - `en/score.json`: `"standing.verdict": "{tier}, and climbing."`
  - Replace `<>{tier}, and climbing<span ...>.</span></>` → render `tr('standing.verdict', { tier })` (move the accent-period into the message or keep the span wrapping the whole string). Keep the `heat`-colored period by splitting the message: `"standing.verdictLead": "{tier}, and climbing"` + the existing `<span>.</span>`.
  - Repeat for the register labels (SCORE · THIS WK · STREAK), the ladder/tier toggle labels, "to {next}" copy (use the ICU plural `standing.toNext`), and any at-risk / top-tier sub-lines.
- Do **not** touch: tier NAMES (brand glossary — keep as data), numbers, or the chart geometry.

- [ ] **Step 2: RTL logical-property pass on this screen** — within `BSShapeScorePage`/`BSScoreStandingChart`, convert directional style props to logical ones on the elements that carry left/right layout: `marginLeft/Right → marginInlineStart/End`, `paddingLeft/Right → paddingInline*`, `left/right → insetInlineStart/End`, `textAlign:'left' → 'start'`. The self-drawing SVG chart + %-positioned you-dot stay LTR (numbers/geometry) — do not mirror the chart internals, only the surrounding text/rows.

- [ ] **Step 3: Verify (build + render, both directions)** — (PowerShell) `cd mobile-app; $env:VITE_BASE='/m/'; npm run build`; in the preview:
  - `en`: the Score page is visually identical to before (diff the rendered text).
  - `ar`: the page mirrors (register row + rows RTL-aligned, chart unmirrored), Arabic copy where translated (Task 12), English fallback elsewhere.
  - `ja`: CJK copy renders in Noto Sans JP.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx mobile-app/src/i18n/catalogs/en/score.json
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx mobile-app/src/i18n/catalogs/en/score.json
git commit -m "feat(i18n): localize Score 'The Standing' (tr keys + RTL logical props)"
```

---

### Task 11: AI extraction + AI-translation scripts + glossary

**Files:**
- Create: `scripts/i18n-extract.mjs`, `scripts/i18n-ai-translate.mjs`, `docs/i18n/glossary.md`
- Modify: `package.json` (add `i18n:translate` script)

**Interfaces:**
- Produces: `node scripts/i18n-ai-translate.mjs <locale>` — reads every `catalogs/en/*.json`, translates missing keys via Claude with the glossary + house-style prompt, writes `catalogs/<locale>/*.json`. `i18n-extract.mjs` is a helper for scaling extraction in sub-project 2 (documented + working on a single file for the pilot).

- [ ] **Step 1: Write the glossary** (`docs/i18n/glossary.md`) — the do-not-translate / consistent-term list: `Shape`, `Shape Score`, `Nora`, tier names (Raw/Base/Tempo/Form/Peak/Legend + coach tiers), "The Standing", "Wire Dispatch", "The Record", "The Drop", "Shape Radio". One line each: term · rule (keep / transliterate / translate-consistently).

- [ ] **Step 2: Write the AI-translate script** (uses the repo's existing AI access; ICU placeholders + glossary terms preserved)

```js
// scripts/i18n-ai-translate.mjs — AI baseline translation for one locale.
// Usage: node scripts/i18n-ai-translate.mjs ar
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const loc = process.argv[2];
if (!loc) { console.error('usage: node scripts/i18n-ai-translate.mjs <locale>'); process.exit(1); }
const EN = 'mobile-app/src/i18n/catalogs/en';
const OUT = `mobile-app/src/i18n/catalogs/${loc}`;
const glossary = readFileSync('docs/i18n/glossary.md', 'utf8');

async function translateBatch(entries, locale) {
  // Calls the project's Claude endpoint. Prompt: translate VALUES to <locale>,
  // preserve ICU syntax ({x, plural, ...}) and every {placeholder} verbatim,
  // keep glossary terms per their rule, match Shape's terse editorial voice.
  // Returns { key: translated } for each input key.
  const prompt = [
    `Translate the JSON values to ${locale}. Rules:`,
    `- Preserve ICU MessageFormat syntax and all {placeholders} EXACTLY.`,
    `- Honor this glossary (do-not-translate / consistent terms):\n${glossary}`,
    `- Shape's voice is terse, editorial, confident. No added words.`,
    `Return ONLY a JSON object mapping the same keys to translated strings.`,
    JSON.stringify(entries),
  ].join('\n');
  const res = await fetch(process.env.SHAPE_AI_URL || 'http://localhost:3000/api/ai/translate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, locale }),
  });
  if (!res.ok) throw new Error(`AI translate failed: ${res.status}`);
  return (await res.json()).translations;
}

for (const file of readdirSync(EN).filter((f) => f.endsWith('.json'))) {
  const en = JSON.parse(readFileSync(join(EN, file), 'utf8'));
  const existing = existsSync(join(OUT, file)) ? JSON.parse(readFileSync(join(OUT, file), 'utf8')) : {};
  const missing = Object.fromEntries(Object.entries(en).filter(([k]) => !(k in existing)));
  if (!Object.keys(missing).length) { console.log(`${loc}/${file}: up to date`); continue; }
  const out = { ...existing, ...(await translateBatch(missing, loc)) };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), JSON.stringify(out, null, 2) + '\n');
  console.log(`${loc}/${file}: +${Object.keys(missing).length} keys`);
}
```

> The exact AI transport (`/api/ai/translate` vs a direct Anthropic SDK call) is chosen at execution time to match how the repo already calls Claude (`src/lib/ai/*`); the script's contract (glossary + ICU-preservation + JSON-in/JSON-out) is fixed.

- [ ] **Step 3: Add the npm script** — in root `package.json` `"scripts"`: `"i18n:translate": "node scripts/i18n-ai-translate.mjs"`.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' scripts/i18n-extract.mjs scripts/i18n-ai-translate.mjs docs/i18n/glossary.md
git add scripts/i18n-extract.mjs scripts/i18n-ai-translate.mjs docs/i18n/glossary.md package.json
git commit -m "feat(i18n): AI extraction + translation scripts + brand glossary"
```

---

### Task 12: Generate + review the `ar` + `ja` pilot catalogs (green the completeness gate)

**Files:**
- Create: `mobile-app/src/i18n/catalogs/ar/*.json`, `mobile-app/src/i18n/catalogs/ja/*.json`
- Modify: `package.json` (add `i18n-catalog-complete.test.mjs` to the `"test"` list)

- [ ] **Step 1: Generate the AI baseline**

Run: `node scripts/i18n-ai-translate.mjs ar` then `node scripts/i18n-ai-translate.mjs ja`
Expected: `catalogs/ar/*.json` + `catalogs/ja/*.json` created with every `en` key.

- [ ] **Step 2: Spot-review** — verify ICU placeholders + glossary terms survived (e.g. `ar/score.json` `standing.toNext` still contains `{points, plural, ...}` and `{next}`; "Shape Score" untranslated per glossary). Fix any placeholder damage by hand.

- [ ] **Step 3: Green the completeness test + run the plural test against real catalogs**

Run: `node --test tests/i18n-catalog-complete.test.mjs`
Expected: PASS (ar + ja now carry every en key). Append ` tests/i18n-catalog-complete.test.mjs` to the root `package.json` `"test"` list.

- [ ] **Step 4: Full build + suite**

Run (PowerShell): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` (exit 0), then (Bash) `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/i18n/catalogs/ar/*.json mobile-app/src/i18n/catalogs/ja/*.json
git add mobile-app/src/i18n/catalogs/ar mobile-app/src/i18n/catalogs/ja package.json
git commit -m "feat(i18n): ar + ja pilot catalogs (AI baseline, reviewed)"
```

---

### Task 13: Pseudo-locale + CI missing-key check

**Files:**
- Create: `scripts/i18n-pseudo.mjs`, `scripts/i18n-check.mjs`
- Modify: `.github/workflows/ci.yml` (add an advisory i18n-check step), `package.json` (`i18n:check` script + register any test)

**Interfaces:**
- Produces: `node scripts/i18n-pseudo.mjs` → writes `catalogs/en-XA/*.json` (accented + ~30% padded `en`) for hardcoded-string + width testing; `node scripts/i18n-check.mjs` → exits non-zero if any wired locale is missing an `en` key (the CI gate).

- [ ] **Step 1: Pseudo-locale generator**

```js
// scripts/i18n-pseudo.mjs — en → en-XA (accented + padded) to surface untranslated
// strings and layout that breaks on ~30% text expansion. ICU/placeholders untouched.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const EN = 'mobile-app/src/i18n/catalogs/en', OUT = 'mobile-app/src/i18n/catalogs/en-XA';
const MAP = { a:'á', e:'é', i:'í', o:'ó', u:'ú', A:'Á', E:'É', I:'Í', O:'Ó', U:'Ú' };
function pseudo(s) { // skip anything inside { } (ICU + placeholders)
  let depth = 0, out = '';
  for (const ch of s) { if (ch === '{') depth++; if (ch === '}') { depth = Math.max(0, depth - 1); out += ch; continue; }
    out += depth > 0 ? ch : (MAP[ch] || ch); }
  const letters = out.replace(/\{[^}]*\}/g, '').length;
  return `${out}${'·'.repeat(Math.ceil(letters * 0.3))}`;
}
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(EN).filter((f) => f.endsWith('.json'))) {
  const en = JSON.parse(readFileSync(join(EN, f), 'utf8'));
  writeFileSync(join(OUT, f), JSON.stringify(Object.fromEntries(Object.entries(en).map(([k, v]) => [k, pseudo(v)])), null, 2) + '\n');
}
console.log('en-XA written');
```

- [ ] **Step 2: CI missing-key checker**

```js
// scripts/i18n-check.mjs — exit 1 if any wired locale misses an en key. CI gate.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'mobile-app/src/i18n/catalogs';
const WIRED = ['ar', 'ja']; // rollout extends this
const enNs = readdirSync(join(ROOT, 'en')).filter((f) => f.endsWith('.json'));
let bad = 0;
for (const ns of enNs) {
  const en = JSON.parse(readFileSync(join(ROOT, 'en', ns), 'utf8'));
  for (const loc of WIRED) {
    const p = join(ROOT, loc, ns);
    const cat = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
    for (const k of Object.keys(en)) if (!(k in cat)) { console.error(`MISSING ${loc}/${ns}:${k}`); bad++; }
  }
}
if (bad) { console.error(`\n${bad} missing keys`); process.exit(1); }
console.log('i18n catalogs complete');
```

- [ ] **Step 3: Wire CI (advisory)** — in `.github/workflows/ci.yml`, add a step to the Mobile job (or a small standalone job): `- run: node scripts/i18n-check.mjs`. Add `"i18n:check": "node scripts/i18n-check.mjs"` + `"i18n:pseudo": "node scripts/i18n-pseudo.mjs"` to root `package.json` `"scripts"`.

- [ ] **Step 4: Verify** — `node scripts/i18n-check.mjs` exits 0 (Task 12 populated ar/ja); `node scripts/i18n-pseudo.mjs` writes `en-XA`; temporarily set the app locale to `en-XA` in the preview → hardcoded (un-`tr`'d) strings show as plain English amid accented text, and no row overflows at +30%.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' scripts/i18n-pseudo.mjs scripts/i18n-check.mjs .github/workflows/ci.yml
git add scripts/i18n-pseudo.mjs scripts/i18n-check.mjs .github/workflows/ci.yml package.json
git commit -m "feat(i18n): pseudo-locale generator + CI missing-key check"
```

---

## Self-Review

**Spec coverage:**
- Registry (22, RTL/CJK/Indic) → Task 1. Resolution/persistence + `client_profiles.locale` → Tasks 1–3. Runtime (react-i18next + ICU, `tr`/`t`-collision) → Task 4. Catalog format + `en` source + completeness → Task 5/12. AI→pipeline + glossary → Task 11 (TMS hand-off is an operational step outside code — the scripts produce the AI baseline the TMS imports; noted). Picker splash → Task 7. Settings switcher → Task 8. RTL → Tasks 6/10. Fonts (on-demand Noto incl. the pilot scripts) → Task 9. Pilot (en/ar/ja on launch + settings + Score) → Tasks 6–12. Testing (pseudo-locale, RTL render, ICU plurals, CI missing-key) → Tasks 4/10/13. **No gaps** for the foundation scope; full-app extraction, website, server-side, and the other 19 locales are explicitly out of scope (later sub-projects).
- **Note (operational, not a code task):** connecting the TMS (Crowdin) + the human-review workflow is a setup step layered on the AI baseline the scripts produce; called out in the spec, not a plan task.
- **Note (Urdu Nastaliq):** the pilot ships `ar`+`ja` fonts only; `ur` Nastaliq (Noto Nastaliq Urdu) arrives with the rollout — the `font: 'urdu'` registry key + fonts.css slot are stubbed so it's a data add, not new architecture.

**Placeholder scan:** no "TBD/TODO/handle edge cases" — every code step shows complete content; the two "chosen at execution time" notes (AI transport, catalog fill order) are explicit contracts, not vague gaps.

**Type consistency:** `resolveLocale(stored, deviceLangs)`, `dirOf(code)`, `localeMeta(code)`, `reconcileLocale({stored,account})→{locale,writeAccount,writeLocal}`, `useTr(ns)→{tr,locale,dir}`, `applyDir(code)`, `ShapeLocale.{get,set,subscribe,_hydrateFromAccount}` are used consistently across Tasks 1→13.

**Ordering caveat:** Task 5's `en` JSON is imported by Task 4's runtime — if executing strictly in order, create empty `{}` stubs in Task 4 Step 6 (noted there). Task 5's completeness test is red-by-design until Task 12 (noted; only added to the `npm test` list in Task 12).
