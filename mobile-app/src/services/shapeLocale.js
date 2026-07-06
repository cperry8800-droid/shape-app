// window.ShapeLocale — the app's UI locale preference. Authoritative client store
// is localStorage['shape.locale'] (what the i18n runtime reads at boot);
// user_goals('app_locale') + client_profiles.locale are best-effort mirrors so the
// choice survives login + cross-device and is server-readable for later sub-projects.
import { resolveLocale, isSupported } from '../i18n/locales.mjs';
import { reconcileLocale } from '../i18n/reconcile.mjs';

const LS_KEY = 'shape.locale';
const subs = new Set();
let current = null;

function readLocal() { try { return localStorage.getItem(LS_KEY); } catch { return null; } }
function writeLocalStore(code) { try { localStorage.setItem(LS_KEY, code); } catch {} }
function deviceLangs() { try { return navigator.languages || [navigator.language].filter(Boolean); } catch { return []; } }
function notify(code) { current = code; for (const fn of subs) { try { fn(code); } catch {} } }

async function mirrorToAccount(code) {
  try { await window.shapeDb?.saveUserGoals?.('app_locale', { locale: code }); } catch {}
  try { await window.ShapeProfile?.setLocale?.(code); } catch {} // client_profiles.locale mirror
}

export const ShapeLocale = {
  // Boot value before any account resolves: stored pref else device match.
  get() { return current || resolveLocale(readLocal(), deviceLangs()); },
  async set(code) {
    if (!isSupported(code)) return;
    writeLocalStore(code);
    notify(code);
    await mirrorToAccount(code);
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  // Called after login with the account's stored locale (user_goals('app_locale')).
  // account wins if set; else the pre-account choice is adopted into the account.
  async _hydrateFromAccount(accountLocale) {
    const { locale, writeAccount, writeLocal } = reconcileLocale({ stored: readLocal(), account: accountLocale });
    if (writeLocal) writeLocalStore(locale);
    notify(locale);
    if (writeAccount) { await mirrorToAccount(locale); }
    return locale;
  },
};

if (typeof window !== 'undefined') window.ShapeLocale = ShapeLocale;
