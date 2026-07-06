# Internationalization (i18n) — foundation + mobile pilot — design

**Date:** 2026-07-06 · **Status:** owner-approved in chat (UI-only scope · full global set incl.
RTL/CJK · hybrid AI-baseline + human review via a TMS · language-picker splash + Settings switcher ·
mobile-first pilot · `react-i18next`) — spec for the implementation plan.

**Problem:** Shape is entirely English-only with **zero i18n infrastructure** — no i18n library in
either `package.json`, `<html lang="en">` hardcoded on 87 pages, every user-facing string a hardcoded
English literal across ~40k lines of mobile broadsheet JSX + ~150 `public/newdesign/` files. Shape is
going global and needs all main languages available. Only locale-aware *formatting* has a foothold
today (`Intl` for dates/numbers; `client_profiles.timezone` is already captured on app open).

**Surfaces (this spec):** the **mobile broadsheet app** only (`mobile-app/`, Vite/React build). This
spec builds the shared locale foundation and proves it end-to-end on a thin mobile pilot. The website,
server-side content, and the full mobile string extraction are separate later specs (see decomposition).

---

## Program decomposition (context)

The full effort is **four sequential sub-projects**, each its own spec → plan → build:

1. **Locale foundation + mobile pilot** ← **THIS SPEC**. Shared plumbing (registry, resolution,
   persistence, runtime, catalog format, AI→TMS→review pipeline, RTL + font strategy), the
   language-picker splash + Settings switcher, proven on a thin mobile slice in `en` + `ar` (RTL) +
   `ja` (CJK).
2. **Mobile broadsheet full localization** — extract all ~40k lines, wire the runtime everywhere, full
   RTL mirroring of the editorial layout, all 22 locales.
3. **Website localization** — the ~150 `public/newdesign/` files. ⚠ babel-standalone, **no build step**
   → a runtime `tr()` shim loading per-locale JSON (matching the existing `window`-global module
   pattern) + per-locale `<html lang/dir>`. Its own design decision, resolved in that spec.
4. **Server-side localization** — locale-aware email (`src/lib/email.ts`) + notification templates,
   keyed off the recipient's stored `client_profiles.locale`.

**Deferred (explicitly out of scope for the whole program above):** runtime translation of
user-generated content (chat, posts, coach-authored plans) and AI (Nora) responses.

## Core decisions (owner)

- **Scope = static UI only** — fixed labels/copy/menus (+ later, transactional emails & notifications).
  Dynamic/user + AI content stays in its authored language (a later sub-project).
- **Full global set now, 22 locales**, incl. RTL and CJK/Indic — RTL layout mirroring + non-Latin fonts
  are part of the program from the start.
- **Hybrid translation:** an **AI baseline** (Claude, glossary + house-style prompt) then **human review
  via a TMS** (Crowdin recommended, kept swappable). Ship the AI baseline immediately; human upgrades
  layer in per-string; `en` fallback covers any gap so no locale ever blocks on 100% review.
- **Language-picker splash** (first launch) + **Settings → Language switcher** (change anytime).
- **Runtime = `react-i18next` + `i18next-icu`**, catalogs authored as **shared ICU-MessageFormat JSON**
  (so the future website shim + server read the same TMS export).
- **English is the authored source of truth and the fallback** — a missing key/locale falls back
  `locale → en → the key itself`, never blank.

## Supported-locale registry

Single source of truth: `mobile-app/src/i18n/locales.mjs` (later shared with website + server). One row
per locale: `{ code, englishName, nativeName, dir: 'ltr'|'rtl', script, fontStack }`.

| code | language | dir | script |
|---|---|---|---|
| `en` | English | ltr | Latin (source / fallback) |
| `es` | Spanish | ltr | Latin |
| `pt-BR` | Portuguese (Brazil) | ltr | Latin |
| `fr` | French | ltr | Latin |
| `de` | German | ltr | Latin (long compounds — width stress) |
| `it` | Italian | ltr | Latin |
| `id` | Indonesian | ltr | Latin (no plural inflection) |
| `vi` | Vietnamese | ltr | Latin (heavy diacritics) |
| `tr` | Turkish | ltr | Latin (dotted/dotless-i casing) |
| `ha` | Hausa | ltr | Latin |
| `pcm` | Nigerian Pidgin | ltr | Latin (English-based creole — own catalog) |
| `ru` | Russian | ltr | Cyrillic (3-form plurals) |
| `uk` | Ukrainian | ltr | Cyrillic (3-form plurals) |
| `hi` | Hindi | ltr | Devanagari |
| `bn` | Bengali | ltr | Bengali |
| `te` | Telugu | ltr | Telugu |
| `ar` | Arabic (MSA) | **rtl** | Perso-Arabic (6-form plurals) |
| `arz` | Egyptian Arabic | **rtl** | Perso-Arabic (regional variant of `ar` — own catalog) |
| `ur` | Urdu | **rtl** | Perso-Arabic (traditionally Nastaliq) |
| `zh-Hans` | Chinese (Simplified) | ltr | CJK |
| `ja` | Japanese | ltr | CJK |
| `ko` | Korean | ltr | CJK |

The registry is **extensible** — adding a language later = one row + one catalog set + (if a new script)
one font subset. `arz` and `pcm` are their own catalogs (not derived from `ar`/`en`).

## Locale resolution & persistence

**Resolution order** (no silent switching — first choice is explicit via the picker):
1. Stored user preference, if set → use it.
2. Else show the **first-launch picker**, pre-selecting the best match of the device/browser locale
   against the supported set (fallback `en`).
3. The picker choice becomes the stored preference; authoritative until changed in Settings.

**Persistence** — reuses the exact patterns already in the app (mirrors appearance + timezone):
- Pre-account / signed-out: `localStorage['shape.locale']` (like `shape.tweaks`) so the picker choice
  sticks before login.
- Signed-in: `user_goals('app_locale')`, loaded on login (same as the appearance-on-login hydrate).
- **Server-readable mirror:** new **`client_profiles.locale`** column — a small idempotent migration,
  exactly like the existing `timezone` column — captured opportunistically on app open, so sub-project
  4's localized emails/notifications can read the recipient's language.
- **Reconciliation on login:** if the account has a stored locale it wins (and updates localStorage);
  otherwise adopt the pre-account picker choice into `user_goals`.

## Runtime (`react-i18next` + `i18next-icu`)

- `i18next` owns loading/lookup/lazy-load; **`i18next-icu`** makes messages full **ICU MessageFormat**,
  so plurals are CLDR-correct across the set (Arabic 6-form, Russian/Ukrainian 3-form, Indonesian/CJK
  1-form, English 2-form) with no hand-rolled plural logic.
- **One `<I18nProvider>`** mounts high in `BSApp`, alongside the existing theme/units providers.
- Access via a thin hook: `const { tr } = useTr()` → `tr('ns.key', { vars })`. ⚠ **Never `t`** — `t` is
  the pervasive theme token (`const t = useBS()`); the translate binding is `tr` (or `i18n.t` at module
  scope where no hook is available).
- **Namespaces per module/screen** (`common`, `onboarding`, `settings`, `home`, `score`, …) — a screen
  loads only its own namespace + `common`, lazy-loaded per active locale.
- **Fallback chain:** missing key/locale → `en` → the key string itself. Never blank, never a raw
  untranslated English literal leaking where a key was expected.
- Formatting: dates/numbers continue through `Intl` (already in use), fed the active locale; ICU
  placeholders carry interpolated values.

## Catalogs & the translation pipeline

**Format & layout** — ICU-JSON, one file per locale × namespace, semantic keys (not English-as-key, so
copy edits don't churn every locale):
```
mobile-app/src/i18n/catalogs/<locale>/<namespace>.json
  catalogs/en/score.json → { "standing.verdict": "{tier}, and climbing." }
```
The **`en/` catalogs are the authored source of truth**; every other locale is generated + reviewed from
them.

**Pipeline (hybrid):**
1. Author / extract the `en` ICU-JSON.
2. **AI pre-translate** all target locales via a script calling **Claude** (not generic MT) with a
   **glossary + house-style prompt** — better voice on the idiomatic copy; brand terms protected.
   Produces draft catalogs.
3. Load drafts into the **TMS** (Crowdin recommended; swappable) as *needs-review*; native reviewers
   correct there.
4. TMS exports approved ICU-JSON back into the repo, committed; **CI checks catalog completeness /
   missing keys**.
5. **Ship AI baseline immediately, human upgrades per-string** — unreviewed keys still render (AI draft),
   `en` fallback covers gaps, so no locale blocks on full review.

**Glossary / do-not-translate list** governs both the AI pass and human reviewers: `Shape`,
`Shape Score`, `Nora`, tier names, "The Standing", "Wire Dispatch", etc. — consistent or deliberately
untranslated.

## String extraction

An **AI-assisted extraction pass** — a script/agent that walks target files, finds JSX text nodes +
user-facing string props, replaces each with `tr('ns.key', { vars })`, and emits the `en` catalog entry.
**This spec proves the method on the pilot slice only**; scaling it across the full ~40k lines is
sub-project 2's main body. Non-user-facing strings (keys, ids, class names, analytics event names,
window-global names) are left untouched.

## Language-picker splash

Inserts at the front of the launch flow: **picker → cosmos splash → gate → paywall → editorial splash**.
Shown once (only when no stored locale exists). Full-screen list of all 22 languages by **endonym**
(a Bengali speaker sees "বাংলা", an Arab "العربية"), device-detected best match pinned + pre-selected so
"Continue" is one tap. Selecting sets `localStorage['shape.locale']`, applies locale + `dir`, continues.
It is the first surface where non-Latin fonts appear, so needed font subsets load here.

## Settings → Language switcher

New row beside Appearance/units → the same endonym list, current locale checked. Selecting calls
i18next `changeLanguage` + flips the container `dir` **live** (the broadsheet is a single-page app → it
re-renders with no reload), and persists to `user_goals('app_locale')` + the `client_profiles.locale`
mirror + localStorage.

## RTL

`dir="rtl"` on the `#bs-phone-surface` container, driven by the active locale's `dir`. Directional CSS
moves to **logical properties** (`marginInlineStart`, `insetInlineStart`, `textAlign:start`, `paddingInline`)
— the broadsheet leans heavily on left spines / clipped top-right notches / left-anchored rules, so **the
foundation mirrors the pilot slice and establishes the helper + lint pattern**; full-app mirroring is
sub-project 2's heavy lifting. Directional glyphs (→ / ←) flip; SVG charts and the Latin "SHAPE" mark stay
LTR within RTL via normal bidi. `arz` and `ur` ride the same `dir="rtl"` path — no extra work beyond `ar`.

## Fonts

Keep the editorial fonts (Fraunces serif · Space Grotesk sans · JetBrains Mono) for Latin — they cover
Vietnamese/Turkish/Hausa diacritics; **verify Fraunces Cyrillic coverage**, fall back to Noto if absent.
For scripts they don't cover, **self-hosted Noto fallbacks wired via `unicode-range` `@font-face` +
font-stack fallback**, loaded **per-locale on demand** (a Latin user never downloads CJK), matching the
repo's self-hosted-font + SRI posture:
- CJK: Noto Sans CJK (SC / JP / KR).
- Indic/Bengali: Noto Sans Devanagari · Noto Sans Bengali · Noto Sans Telugu.
- Arabic/Urdu: Noto Naskh Arabic (`ar`/`arz`) + **Noto Nastaliq Urdu** (`ur` — traditionally Nastaliq;
  explicit choice).

**Design concession (called out):** the Fraunces *serif* personality is Latin-specific — non-Latin
scripts get the best Noto serif/sans and rely on size/weight hierarchy to carry the editorial feel, not
the exact typeface voice.

## Pilot scope (what this spec ships)

- **Surfaces:** the launch flow (+ new picker), Settings (+ switcher), and the **Score "The Standing"**
  screen as the required in-app pilot (real copy + a plural + a chart — exercises interpolation, ICU
  plurals, RTL, and a non-Latin render in one place); Home may be added if cheap.
- **Locales wired:** `en` (source) + `ar` (RTL, Arabic font) + `ja` (CJK font) — the two hardest
  script/direction cases + source.
- **Proves the full chain:** registry → device detect → picker → persist → runtime lookup → ICU plurals
  → live switch → RTL flip → non-Latin font load → `en` fallback. The other 19 locales and full-screen
  coverage are pure rollout (sub-project 2) on the same machinery.

## Testing

- **Pseudo-locale** `en-XA` (accented + ~30% expansion) to catch hardcoded strings and German-width
  layout breaks without waiting on real translations.
- **RTL render check** on the `ar` pilot (mirroring + bidi).
- **ICU plural unit tests** on representative keys (Arabic 6-form, Russian 3-form).
- **CI missing-key / catalog-completeness check.**
- Repo's normal gate: JSX parse · PowerShell mobile build (`VITE_BASE=/m/`) · `npm test`.

## New files / modules

- `mobile-app/src/i18n/locales.mjs` — the registry.
- `mobile-app/src/i18n/index.js` — i18next + i18next-icu init, provider, `useTr` hook, resolution.
- `mobile-app/src/i18n/catalogs/<locale>/<namespace>.json` — ICU-JSON catalogs.
- `mobile-app/src/i18n/fonts.css` (+ self-hosted Noto subsets) — per-locale `@font-face` + `unicode-range`.
- `scripts/i18n-extract.mjs` — the AI-assisted extraction pass (pilot slice).
- `scripts/i18n-ai-translate.mjs` — Claude pre-translation with glossary + house-style prompt.
- `docs/i18n/glossary.md` — brand terms / do-not-translate list.
- Migration `supabase-migrations/2026-07-06-client-profiles-locale.sql` — `client_profiles.locale` column.

## Invariants / reuse

- **No behavior change when `locale === 'en'`** — the app renders byte-equivalent English; i18n is a
  transparent layer over the existing copy.
- Reuse the **appearance-persistence pattern** (`localStorage` + `user_goals` + load-on-login) rather
  than a new mechanism; mirror to `client_profiles` exactly like `timezone`.
- Reuse the **self-hosted-font + SRI** posture for the Noto subsets (no CDN fonts).
- Follow the **`Object.assign(window, …)` module pattern** where the pilot touches window-exposed code.
- The catalog format is chosen to be **consumable by the future no-build website shim + server** from the
  same TMS export — the cross-surface reuse lives in the data, not a shared runtime.

## Out of scope (this spec)

- Full mobile string extraction across all screens (sub-project 2).
- Website localization (sub-project 3) and server-side emails/notifications (sub-project 4).
- The other 19 locales beyond the `en`/`ar`/`ja` pilot (pure rollout, sub-project 2).
- Runtime translation of user-generated + AI (Nora) content (deferred program-wide).
- Localizing chart/number *visuals* beyond `Intl` formatting already in place.
