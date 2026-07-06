// The single source of truth for supported locales. `font` is a stack KEY
// resolved by fonts.css (@font-face + unicode-range); `dir` drives RTL.
export const LOCALES = [
  { code: 'en',      englishName: 'English',             nativeName: 'English',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'es',      englishName: 'Spanish',             nativeName: 'Español',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'pt-BR',   englishName: 'Portuguese (Brazil)', nativeName: 'Português',  dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'fr',      englishName: 'French',              nativeName: 'Français',   dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'de',      englishName: 'German',              nativeName: 'Deutsch',    dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'it',      englishName: 'Italian',             nativeName: 'Italiano',   dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'id',      englishName: 'Indonesian',          nativeName: 'Indonesia',  dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'vi',      englishName: 'Vietnamese',          nativeName: 'Tiếng Việt', dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'tr',      englishName: 'Turkish',             nativeName: 'Türkçe',     dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'ha',      englishName: 'Hausa',               nativeName: 'Hausa',      dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'pcm',     englishName: 'Nigerian Pidgin',     nativeName: 'Naijá',      dir: 'ltr', script: 'latin',    font: 'latin' },
  { code: 'ru',      englishName: 'Russian',             nativeName: 'Русский',    dir: 'ltr', script: 'cyrillic', font: 'latin' },
  { code: 'uk',      englishName: 'Ukrainian',           nativeName: 'Українська', dir: 'ltr', script: 'cyrillic', font: 'latin' },
  { code: 'hi',      englishName: 'Hindi',               nativeName: 'हिन्दी',       dir: 'ltr', script: 'deva',     font: 'deva' },
  { code: 'bn',      englishName: 'Bengali',             nativeName: 'বাংলা',       dir: 'ltr', script: 'beng',     font: 'beng' },
  { code: 'te',      englishName: 'Telugu',              nativeName: 'తెలుగు',      dir: 'ltr', script: 'telu',     font: 'telu' },
  { code: 'ar',      englishName: 'Arabic',              nativeName: 'العربية',     dir: 'rtl', script: 'arab',     font: 'arab' },
  { code: 'arz',     englishName: 'Egyptian Arabic',     nativeName: 'مصرى',        dir: 'rtl', script: 'arab',     font: 'arab', intlLocale: 'ar' },
  { code: 'ur',      englishName: 'Urdu',                nativeName: 'اردو',        dir: 'rtl', script: 'arab',     font: 'urdu' },
  { code: 'zh-Hans', englishName: 'Chinese (Simplified)',nativeName: '简体中文',    dir: 'ltr', script: 'hans',     font: 'cjk-sc' },
  { code: 'ja',      englishName: 'Japanese',            nativeName: '日本語',      dir: 'ltr', script: 'jpan',     font: 'cjk-jp' },
  { code: 'ko',      englishName: 'Korean',              nativeName: '한국어',      dir: 'ltr', script: 'kore',     font: 'cjk-kr' },
];

export const SUPPORTED = new Set(LOCALES.map((l) => l.code));
const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
const BY_BASE = new Map(); // 'pt' → 'pt-BR' (first regional match wins)
for (const l of LOCALES) { const base = l.code.split('-')[0]; if (!BY_BASE.has(base)) BY_BASE.set(base, l.code); }

export function localeMeta(code) { return BY_CODE.get(code) || null; }
export function isSupported(code) { return SUPPORTED.has(code); }
export function dirOf(code) { return BY_CODE.get(code)?.dir === 'rtl' ? 'rtl' : 'ltr'; }

// Some catalog codes aren't valid Intl/CLDR locales (e.g. 'arz' Egyptian Arabic);
// map them to the nearest Intl-supported locale for plurals/dates/numbers while
// keeping the catalog code distinct. Falls through to the code itself otherwise.
export function intlLocaleOf(code) { return BY_CODE.get(code)?.intlLocale || code; }

// The subset actually wired end-to-end (catalog + fonts + RTL) this release. The
// picker / Settings / runtime consume this so a user can never select a locale
// that would silently fall back to English. Rollout expands it toward the full
// registry (eventually the whole set).
export const ACTIVE_LOCALES = ['en', 'ar', 'ja'];
export function isActive(code) { return ACTIVE_LOCALES.includes(code); }
export function activeLocales() { return LOCALES.filter((l) => ACTIVE_LOCALES.includes(l.code)); }

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
