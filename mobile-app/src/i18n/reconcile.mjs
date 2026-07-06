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
