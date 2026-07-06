import { isActive } from './locales.mjs';
// Decide the effective locale + which stores to update after login. Only WIRED
// (active) locales are honored — a stored/account value for an unwired locale is
// ignored (falls through to English), never adopted or persisted.
// account wins if valid (and we refresh localStorage); else adopt the local pref
// into the account. Returns { locale, writeAccount, writeLocal }.
export function reconcileLocale({ stored, account }) {
  const a = isActive(account) ? account : null;
  const s = isActive(stored) ? stored : null;
  if (a) return { locale: a, writeAccount: false, writeLocal: a !== stored };
  if (s) return { locale: s, writeAccount: true, writeLocal: false };
  return { locale: 'en', writeAccount: false, writeLocal: false };
}
