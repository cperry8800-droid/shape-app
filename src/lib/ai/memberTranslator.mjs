// The member's translator on the server: the app's own catalogs through the app's own i18next + ICU
// set-up, so a push and the bell row it leaves say what Home says, in the member's language (owner,
// 2026-10-21: "fix the push and bell row wording too"). Plain ESM so node:test drives the exact
// set-up the notify routes run; the catalogs are passed in (src/lib/ai/memberCatalogs.ts bundles
// them for the server, the tests read them off disk).
//
// ⚠ THE OPTIONS ARE THE APP'S (mobile-app/src/i18n/index.js initI18n): English as the fallback,
// flat dotted keys (keySeparator false), the ns:key form through the default ':' separator, and no
// escaping. A key the catalog lacks reads as its defaultValue, as the app's useShapeTr reads it.

import i18next from 'i18next';
import ICU from 'i18next-icu';
import { ACTIVE_LOCALES, intlLocaleOf } from '../../../mobile-app/src/i18n/locales.mjs';

// The member's stored language (user_goals 'app_locale', which the app writes at sign-in and on every
// change, shapeLocale.js mirrorToAccount), when it is one the app ships; English otherwise.
export function memberLocaleCode(doc) {
  const code = doc && typeof doc === 'object' && typeof doc.locale === 'string' ? doc.locale : null;
  return code && ACTIVE_LOCALES.includes(code) ? code : 'en';
}

// resources: { [locale]: { home: catalog } }. Returns copyFor(code, metric) → { code, locale, metric,
// tr }: `code` the catalog's, `locale` the Intl locale numbers and dates are said in, `tr` the
// translator (one per language, kept).
export function makeMemberCopy(resources) {
  const i18n = i18next.createInstance();
  i18n.use(ICU.default || ICU).init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ACTIVE_LOCALES,
    ns: ['home'],
    defaultNS: 'home',
    resources,
    keySeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    initAsync: false,
  });
  const kept = new Map();
  return function copyFor(code, metric) {
    const lc = ACTIVE_LOCALES.includes(code) ? code : 'en';
    let tr = kept.get(lc);
    if (!tr) {
      const t = i18n.getFixedT(lc, 'home');
      tr = (key, opts) => {
        const v = t(key, opts);
        return v == null || v === key ? (opts && opts.defaultValue != null ? opts.defaultValue : key) : v;
      };
      kept.set(lc, tr);
    }
    return { code: lc, locale: intlLocaleOf(lc), metric: metric === true, tr };
  };
}
