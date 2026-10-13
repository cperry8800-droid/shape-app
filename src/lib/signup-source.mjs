// src/lib/signup-source.mjs
//
// Where a new account came from (owner, 2026-10-13: "track signups by source too"). Pure: the
// browser glue is public/signup-source.js, a classic-script COPY of these rules (the sign-up
// pages are classic scripts and cannot import this), held equal by
// tests/signup-source.test.mjs. Change a rule here and there together.
//
// WHAT IS RECORDED. The link's utm tags (utm_source, utm_medium, utm_campaign), the referring
// site's host (google.com, instagram.com), the page landed on, whether the visitor came through
// a coach's referral link (shape.coachRef, which public/supabase.js already keeps for coach
// attribution), and whether the account was made on the website or in the app. It rides in the
// new account's user metadata as `signup_source`, and admin_overview_stats counts it.
//
// TWO MOMENTS, TWO RULES.
//   remembered  the FIRST link a visitor arrived from, kept on the device for 90 days so a
//               sign-up three pages (or three days) later is still credited. Storage for
//               attribution is not essential, so it follows the consent rule the app's usage
//               stats follow (trackingAllowed): Global Privacy Control or a "reject" blocks it,
//               "accept" allows it, and with no choice yet it is blocked in the EEA/UK and
//               allowed elsewhere. Unknown region: blocked.
//   at sign-up  the sign-up page's OWN link and referrer, read when the form is sent and saved
//               with the account. Nothing is stored on the device for it.
// A direct visit (no tags, no outside referrer) records nothing: there is no source to credit.

export const SOURCE_KEY = 'shape.signupSource';
export const COACH_REF_KEY = 'shape.coachRef';
export const SOURCE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const COACH_REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
const FIELD_MAX = 60;
const PATH_MAX = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Link-wrapping and mobile subdomains a social site sends clicks through (l.instagram.com,
// lm.facebook.com, m.youtube.com), so one site reads as one source.
const HOST_PREFIX = /^(www\d?|m|l|lm|mobile)\./;

/** A short, lowercased, printable value, or ''. */
export function clip(value, max = FIELD_MAX) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, max);
}

/** The referring site's host, or '' for none, this site's own pages, or a non-web link. */
export function referrerHost(referrer, ownHost) {
  let url;
  try {
    url = new URL(String(referrer || ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  const host = url.hostname.toLowerCase().replace(HOST_PREFIX, '');
  const own = String(ownHost || '').toLowerCase().split(':')[0].replace(HOST_PREFIX, '');
  if (!host || (own && (host === own || host.endsWith(`.${own}`)))) return '';
  return clip(host);
}

/** The source a page view carries, or null for a direct visit. */
export function touchFrom({ search = '', referrer = '', host = '', path = '', now = Date.now() } = {}) {
  let params;
  try {
    params = new URLSearchParams(String(search || ''));
  } catch {
    params = new URLSearchParams();
  }
  const touch = {};
  for (const key of UTM) {
    const v = clip(params.get(key));
    if (v) touch[key] = v;
  }
  const ref = referrerHost(referrer, host);
  if (ref) touch.referrer = ref;
  if (!touch.utm_source && !touch.utm_medium && !touch.utm_campaign && !touch.referrer) return null;
  const landing = String(path || '').split(/[?#]/)[0].slice(0, PATH_MAX);
  if (landing.startsWith('/')) touch.landing = landing;
  touch.at = new Date(now).toISOString();
  return touch;
}

/**
 * Only the known fields, each in its allowed shape; null when nothing is left. Applied to what a
 * device stored and to what a sign-up sends, because both are written by the visitor's browser.
 */
export function cleanSource(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of [...UTM, 'referrer']) {
    const v = clip(raw[key]);
    if (v) out[key] = v;
  }
  const landing = String(raw.landing ?? '').slice(0, PATH_MAX);
  if (/^\/[^\s]*$/.test(landing)) out.landing = landing;
  const at = Date.parse(String(raw.at ?? ''));
  if (Number.isFinite(at)) out.at = new Date(at).toISOString();
  if (raw.coach_ref === true) out.coach_ref = true;
  if (raw.surface === 'website' || raw.surface === 'app') out.surface = raw.surface;
  if (raw.platform === 'ios' || raw.platform === 'android' || raw.platform === 'web') out.platform = raw.platform;
  return Object.keys(out).length ? out : null;
}

/** A stored first touch, cleaned, or null when missing, unreadable or older than 90 days. */
export function readStored(rawJson, now = Date.now()) {
  let parsed;
  try {
    parsed = JSON.parse(String(rawJson || ''));
  } catch {
    return null;
  }
  const v = cleanSource(parsed);
  if (!v || !v.at || now - Date.parse(v.at) > SOURCE_TTL_MS || Date.parse(v.at) > now + 60_000) return null;
  return v;
}

/** The first touch to keep: a live stored one wins; otherwise this page's, if it has a source. */
export function nextStored(stored, touch) {
  return stored || touch || null;
}

/** Whether a coach referral the device holds (public/supabase.js's shape.coachRef) is live. */
export function coachRefLive(rawJson, now = Date.now()) {
  try {
    const v = JSON.parse(String(rawJson || ''));
    return Boolean(v && UUID_RE.test(String(v.token || '')) && v.at > 0 && now - v.at <= COACH_REF_TTL_MS);
  } catch {
    return false;
  }
}

/** The consent rule the app's usage stats follow (mobile-app/src/services/analytics.js). */
export function trackingAllowed({ consent = null, gpc = false, timeZone = '' } = {}) {
  if (gpc) return false;
  if (consent === 'reject') return false;
  if (consent === 'accept') return true;
  if (!timeZone) return false;
  return !/^Europe\//.test(timeZone);
}

/** What a sign-up saves: the remembered first touch, else the sign-up page's own, plus where. */
export function forSignup({ stored = null, current = null, coachRef = false, surface = 'website', platform = null } = {}) {
  return cleanSource({ ...(stored || current || {}), coach_ref: coachRef === true, surface, platform }) || { surface };
}

// ── The page glue, for code that can import this module (the Next sign-up form, the app) ──
// The same steps public/signup-source.js takes on a page, read from a window-like object at the
// moment they are needed, so a caller never depends on that script having loaded first.

function storageGet(win, key) {
  try {
    return win.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function allowedOn(win) {
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timeZone = '';
  }
  let gpc = false;
  try {
    gpc = win.navigator?.globalPrivacyControl === true;
  } catch {
    gpc = false;
  }
  return trackingAllowed({ consent: storageGet(win, 'shape.consent.v1'), gpc, timeZone });
}

function currentTouch(win) {
  const loc = win.location || {};
  return touchFrom({ search: loc.search, referrer: win.document ? win.document.referrer : '', host: loc.host, path: loc.pathname });
}

/** What a sign-up made on this page saves: the remembered first touch, else this page's own. */
export function sourceFromWindow(win, surface = 'website', platform = null) {
  try {
    const stored = allowedOn(win) ? readStored(storageGet(win, SOURCE_KEY)) : null;
    return forSignup({ stored, current: currentTouch(win), coachRef: coachRefLive(storageGet(win, COACH_REF_KEY)), surface, platform });
  } catch {
    return { surface };
  }
}

/** Remember this page's touch as the first, as consent allows; a withdrawn consent drops it. */
export function captureFromWindow(win) {
  try {
    if (!allowedOn(win)) {
      try {
        win.localStorage.removeItem(SOURCE_KEY);
      } catch {
        /* nothing to drop */
      }
      return null;
    }
    const stored = readStored(storageGet(win, SOURCE_KEY));
    const keep = nextStored(stored, currentTouch(win));
    if (keep && keep !== stored) win.localStorage.setItem(SOURCE_KEY, JSON.stringify(keep));
    return keep;
  } catch {
    return null;
  }
}

// The query a server redirect carries to the page it sends a visitor to: the utm tags and a
// coach's ?ref=, each clipped to 100 characters, nothing else. Without it the root route's
// redirect to the homepage dropped them, and a tagged link read as a direct visit.
export const CARRIED_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];

export function carriedQuery(params) {
  const out = new URLSearchParams();
  for (const key of CARRIED_KEYS) {
    const raw = params ? params[key] : undefined;
    const value = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').trim().slice(0, 100);
    if (value) out.set(key, value);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}
