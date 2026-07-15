import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import ICU from 'i18next-icu';
import { resolveLocale, dirOf, localeMeta, activeLocales, ACTIVE_LOCALES, intlLocaleOf } from './locales.mjs';

// Eagerly bundle the pilot namespaces; a lazy backend is added in the rollout.
import enCommon from './catalogs/en/common.json';
import enOnboarding from './catalogs/en/onboarding.json';
import enSettings from './catalogs/en/settings.json';
import enScore from './catalogs/en/score.json';

const NS = ['common', 'onboarding', 'settings', 'score', 'home', 'profile', 'session', 'feed', 'marketplace', 'radio', 'calendar'];

// Vite: load every catalog file that exists so ar/ja (added in the pilot
// translation task) light up automatically once their JSON is present.
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
    lng,
    fallbackLng: 'en',
    supportedLngs: ACTIVE_LOCALES, // only wired locales; unwired never selectable
    ns: NS,
    defaultNS: 'common',
    resources: resources(),
    keySeparator: false, // catalogs use flat dotted keys ("verdict.top"), not nesting
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false,
    returnEmptyString: false,
  });
  inited = true;
  applyDir(lng);
  return i18next;
}

// Apply text direction + script-font hint to the phone surface (and <html>).
// `lang` stays the catalog code (so CSS :lang() + the Turkish dotted-i rule work);
// ICU/Intl formatting uses intlLocaleOf() for codes Intl doesn't know (e.g. arz).
export function applyDir(code) {
  const dir = dirOf(code);
  try {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.dataset.localeFont = localeMeta(code)?.font || 'latin';
  } catch {}
  try {
    const surf = document.getElementById('bs-phone-surface');
    if (surf) surf.setAttribute('dir', dir);
  } catch {}
}

// Intl-safe locale for date/number formatting outside i18next-icu (e.g. Intl.*).
// Rollout note: when 'arz' is activated, wire this into the i18next-icu formatter
// too so its plurals use 'ar' rules while the catalog stays 'arz'.
export function intlLocale(code) { return intlLocaleOf(code); }

// The hook every component uses. NEVER name the binding `t` (theme token collision).
export function useTr(ns) {
  const { t: translate, i18n } = useTranslation(ns);
  return { tr: translate, locale: i18n.language, dir: dirOf(i18n.language) };
}

// Window bridge for the separately-bundled broadsheet modules (client/pros load via
// window globals, not ESM, so they can't import this singleton without duplicating
// i18next). They read translations + the wired-locale list through this.
if (typeof window !== 'undefined') {
  window.ShapeI18n = {
    t: (key, opts) => i18next.t(key, opts),
    current: () => i18next.language,
    // Intl-safe locale for date/number formatting (maps catalog codes Intl doesn't
    // know — e.g. 'arz' → 'ar' — falling through to the code itself otherwise).
    intlLocale: (code) => intlLocaleOf(code || i18next.language),
    activeLocales,
    localeMeta,
  };
}

export { i18next as i18n };
