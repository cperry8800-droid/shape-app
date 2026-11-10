// One clock per person (P9, owner 2026-11-05): "all time zones should be set by user", and times
// from another person "should automatically update to their own timezone".
//
// CANONICAL here, so the website and the app print time the same way; the app imports
// mobile-app/src/services/shapeZone.mjs, which re-exports this file. PURE apart from the viewer's
// zone it remembers (memory, plus localStorage for the next page's first paint) and the window
// event it sends when that changes. No React, no fetch: the pages read and write the zone through
// /api/me/timezone and tell this module with setAccountZone.
//
// ⚠ AN INSTANT HAS ONE MEANING, AND ITS PRINTING IS THE VIEWER'S. Every stored time (a session, a
// message, a booking) is an instant; what differs is whose clock it is printed on. Print it with
// formatTime / formatDate / dayKey and the viewer's set zone is used unless a zone is passed. Pass
// one only when the screen is about someone else's day on purpose (a coach's Today is cut on the
// coach's clock), and say so on that screen.
//
// ⚠ THE DEVICE IS A DEFAULT, NEVER A SWITCH. viewerZone() is the account's zone; the device's only
// stands in before the account's is known, or for a person with none. A device in another zone
// asks first (travelAsk); nothing here changes the account's zone by itself.

export const ZONE_EVENT = 'shape:timezone';
const LS_ACCOUNT = 'shape.tz.account';
const LS_DECLINED = 'shape.tz.declined';

// "Area/Location", optionally multi-segment, plus the bare UTC alias: the server's IANA_SHAPE
// (src/lib/time.ts). The shape only rejects junk cheaply; the runtime decides.
const IANA_SHAPE = /^(UTC|[A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;

const fmtCache = new Map();
function dtf(locale, opts) {
  const key = (locale || '') + '|' + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale || undefined, opts);
    if (fmtCache.size > 200) fmtCache.clear();
    fmtCache.set(key, f);
  }
  return f;
}

/** The value as a usable IANA zone name, or null. Never throws. */
export function normalizeZone(raw) {
  const tz = String(raw == null ? '' : raw).trim().slice(0, 64);
  if (!IANA_SHAPE.test(tz)) return null;
  try { dtf('en-US', { timeZone: tz }); } catch (e) { return null; }
  return tz;
}

/** The zone this device's clock is set to, or null when the platform can't say. */
export function deviceZone() {
  try { return normalizeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) { return null; }
}

function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

// undefined: not told yet this page (the last page's answer from localStorage stands in);
// null: told, and the person has no zone set.
let account;

/** The account's own zone as last told (setAccountZone), else the last page's, else null. */
export function getAccountZone() {
  if (account !== undefined) return account;
  const ls = store();
  try { return ls ? normalizeZone(ls.getItem(LS_ACCOUNT)) : null; } catch (e) { return null; }
}

/** Remember the account's zone (null: none set) and tell every listener when it changed. */
export function setAccountZone(raw) {
  const next = normalizeZone(raw);
  const prev = getAccountZone();
  account = next;
  const ls = store();
  try { if (ls) { if (next) ls.setItem(LS_ACCOUNT, next); else ls.removeItem(LS_ACCOUNT); } } catch (e) {}
  if (prev !== next && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent(ZONE_EVENT, { detail: { zone: next } })); } catch (e) {}
  }
  return next;
}

/** Forget the account's zone (sign-out), so the next person on this device starts from theirs. */
export function clearAccountZone() {
  account = undefined;
  const ls = store();
  try { if (ls) { ls.removeItem(LS_ACCOUNT); ls.removeItem(LS_DECLINED); } } catch (e) {}
}

/** The zone a viewer's times print in: their account's, else this device's, else UTC. */
export function viewerZone() {
  return getAccountZone() || deviceZone() || 'UTC';
}

/** Call `fn(zone)` whenever the viewer's zone changes; returns the unsubscribe. */
export function onZoneChange(fn) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const h = () => { try { fn(viewerZone()); } catch (e) {} };
  window.addEventListener(ZONE_EVENT, h);
  return () => window.removeEventListener(ZONE_EVENT, h);
}

function toMs(instant) {
  if (instant instanceof Date) return instant.getTime();
  if (typeof instant === 'number') return instant;
  if (typeof instant === 'string' && instant) return Date.parse(instant);
  return NaN;
}

function zoneOr(z) {
  return normalizeZone(z) || viewerZone();
}

/**
 * The wall clock `zone` shows at `instant`: { y, mo, d, h, mi, wd } (mo 1-12, wd 0 = Sunday), or
 * null for an unreadable instant.
 */
export function partsInZone(instant, zone) {
  const ms = toMs(instant);
  if (!Number.isFinite(ms)) return null;
  const parts = dtf('en-US', {
    timeZone: zoneOr(zone), hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
  }).formatToParts(new Date(ms));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const h = Number(get('hour'));
  return { y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')), h: h === 24 ? 0 : h, mi: Number(get('minute')), wd: WD[get('weekday')] };
}

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" of the day `instant` falls on in `zone` (the viewer's by default); '' if unreadable. */
export function dayKey(instant, zone) {
  const p = partsInZone(instant, zone);
  return p ? `${p.y}-${pad(p.mo)}-${pad(p.d)}` : '';
}

/** "HH:MM" (24-hour) of `instant` in `zone` (the viewer's by default); '' if unreadable. */
export function clockHM(instant, zone) {
  const p = partsInZone(instant, zone);
  return p ? `${pad(p.h)}:${pad(p.mi)}` : '';
}

/**
 * `instant` as a time of day, in the viewer's zone unless `zone` is given, in `locale`'s own way
 * (9:30 AM, 09:30, 9.30). `hour12` forces either; `withZone` adds the zone's short name ("EST").
 */
export function formatTime(instant, { zone, locale, hour12, withZone } = {}) {
  const ms = toMs(instant);
  if (!Number.isFinite(ms)) return '';
  const opts = { timeZone: zoneOr(zone), hour: twoDigitHour(locale, hour12) ? '2-digit' : 'numeric', minute: '2-digit' };
  if (typeof hour12 === 'boolean') opts.hour12 = hour12;
  if (withZone) opts.timeZoneName = 'short';
  try { return dtf(locale, opts).format(new Date(ms)); } catch (e) { return ''; }
}

// A 24-hour clock writes the hour in two digits (00:30, not 0:30); a 12-hour one doesn't (9:30 AM).
function twoDigitHour(locale, hour12) {
  if (typeof hour12 === 'boolean') return !hour12;
  try {
    const hc = dtf(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h23' || hc === 'h24';
  } catch (e) { return false; }
}

/** `instant`'s date in the viewer's zone (or `zone`); `opts` are Intl date fields (default: Nov 5). */
export function formatDate(instant, { zone, locale, ...fields } = {}) {
  const ms = toMs(instant);
  if (!Number.isFinite(ms)) return '';
  const opts = Object.keys(fields).length ? { ...fields } : { month: 'short', day: 'numeric' };
  opts.timeZone = zoneOr(zone);
  try { return dtf(locale, opts).format(new Date(ms)); } catch (e) { return ''; }
}

/** Date and time together ("Thu, Nov 5, 9:30 AM"), in the viewer's zone or `zone`. */
export function formatDateTime(instant, { zone, locale, hour12, withZone } = {}) {
  const ms = toMs(instant);
  if (!Number.isFinite(ms)) return '';
  const opts = { timeZone: zoneOr(zone), weekday: 'short', month: 'short', day: 'numeric', hour: twoDigitHour(locale, hour12) ? '2-digit' : 'numeric', minute: '2-digit' };
  if (typeof hour12 === 'boolean') opts.hour12 = hour12;
  if (withZone) opts.timeZoneName = 'short';
  try { return dtf(locale, opts).format(new Date(ms)); } catch (e) { return ''; }
}

/** Minutes `zone` is ahead of UTC at `at` (New York in winter: -300); null for an unusable zone. */
export function offsetMinutes(zone, at = Date.now()) {
  const z = normalizeZone(zone);
  if (!z) return null;
  const p = partsInZone(at, z);
  if (!p) return null;
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  const t = Math.floor(toMs(at) / 60000) * 60000;
  return Math.round((wall - t) / 60000);
}

/** Whether two zones show the same clock at `at` (Detroit and New York do; London and Lisbon do). */
export function sameClock(a, b, at = Date.now()) {
  const x = offsetMinutes(a, at);
  const y = offsetMinutes(b, at);
  return x != null && y != null && x === y;
}

/** "GMT-5", "GMT+5:30", "GMT" for `zone` at `at`. */
export function offsetLabel(zone, at = Date.now()) {
  const m = offsetMinutes(zone, at);
  if (m == null) return '';
  if (m === 0) return 'GMT';
  const sign = m < 0 ? '-' : '+';
  const a = Math.abs(m);
  return `GMT${sign}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}

/** The place a zone is named for: "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone) {
  const z = normalizeZone(zone);
  if (!z) return '';
  if (z === 'UTC') return 'UTC';
  return z.split('/').pop().replace(/_/g, ' ');
}

/** "New York · GMT-5": what a picker and a "times in …" line show for a zone. */
export function zoneLabel(zone, { at = Date.now() } = {}) {
  const z = normalizeZone(zone);
  if (!z) return '';
  if (z === 'UTC') return 'UTC';
  return `${zoneCity(z)} · ${offsetLabel(z, at)}`;
}

/**
 * "Eastern Standard Time": how a sentence names a zone, the way a calendar or a phone does (owner,
 * 2026-11-10: "remove all of that and just have it show normally. Like Eastern/Standard Time"). The
 * zone's own name at `at`, so New York reads "Eastern Daylight Time" in summer, in `locale` (the
 * website's English by default; the app passes its own language, and English stands in where that
 * language has no name for the zone). A zone Intl has no name for (it answers "GMT+3") reads as zoneLabel's
 * "Istanbul · GMT+3". ⚠ A PICKER KEEPS zoneLabel: Detroit and New York are both "Eastern", and only
 * the city tells them apart.
 */
export function zoneName(zone, { at = Date.now(), locale = 'en-US' } = {}) {
  const z = normalizeZone(zone);
  if (!z) return '';
  for (const loc of locale && locale !== 'en-US' ? [locale, 'en-US'] : ['en-US']) {
    try {
      const part = new Intl.DateTimeFormat(loc, { timeZone: z, timeZoneName: 'long' }).formatToParts(toMs(at)).find((p) => p.type === 'timeZoneName');
      const n = part ? part.value : '';
      if (n && !/^(GMT|UTC)\s*[+\-\u2212]/.test(n)) return n;
    } catch (e) { /* a language this runtime can't format in: English */ }
  }
  return zoneLabel(z, { at });
}

/**
 * Two different zones named in one sentence ("saved in X, not your time zone, Y"): their plain names,
 * or city · offset for both where the plain names are the same (Detroit and New York are both
 * "Eastern Standard Time", and "saved in Eastern Standard Time, not Eastern Standard Time" says nothing).
 */
export function zoneNamesApart(a, b, opts = {}) {
  const x = zoneName(a, opts), y = zoneName(b, opts);
  if (x && x === y && normalizeZone(a) !== normalizeZone(b)) return [zoneLabel(a, opts), zoneLabel(b, opts)];
  return [x, y];
}

// A short list for a runtime without Intl.supportedValuesOf (older WebViews): one city per
// common offset, so a picker always has something real to offer.
const FALLBACK_ZONES = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Phoenix',
  'America/Chicago', 'America/New_York', 'America/Halifax', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Atlantic/Azores', 'UTC', 'Europe/London', 'Europe/Lisbon', 'Africa/Lagos', 'Europe/Paris', 'Europe/Berlin',
  'Africa/Johannesburg', 'Europe/Kyiv', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Nairobi', 'Asia/Dubai',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
  'Asia/Singapore', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

/** Every zone this runtime knows. */
export function allZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const list = Intl.supportedValuesOf('timeZone').filter((z) => normalizeZone(z));
      if (list.length) return list.includes('UTC') ? list : ['UTC', ...list];
    }
  } catch (e) {}
  return FALLBACK_ZONES.filter((z) => normalizeZone(z));
}

/**
 * The picker's options: [{ zone, label, offset }], west to east, then by name. `include` adds zones
 * that must be offered even if this runtime doesn't list them (the account's own, the device's).
 */
export function zoneOptions({ include = [], at = Date.now() } = {}) {
  const seen = new Set();
  const out = [];
  for (const z of [...include, ...allZones()]) {
    const n = normalizeZone(z);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const offset = offsetMinutes(n, at);
    if (offset == null) continue;
    out.push({ zone: n, label: zoneLabel(n, { at }), offset });
  }
  out.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
  return out;
}

/** The device zone the person said "keep mine" to, on this device. */
export function declinedZone() {
  const ls = store();
  try { return ls ? normalizeZone(ls.getItem(LS_DECLINED)) : null; } catch (e) { return null; }
}

/** Remember "keep my zone" for this device zone, so it isn't asked again until the device moves. */
export function declineDeviceZone(zone) {
  const ls = store();
  const z = normalizeZone(zone);
  try { if (ls) { if (z) ls.setItem(LS_DECLINED, z); else ls.removeItem(LS_DECLINED); } } catch (e) {}
}

/**
 * Whether to ask "switch to this device's zone?": the person has a zone, this device is on another
 * clock right now, and they haven't already said no for this device zone. Never for a person with
 * no zone (that is the first default, set without asking) or a device that can't say.
 */
export function travelAsk({ account: acc, device, declined, at = Date.now() } = {}) {
  const a = normalizeZone(acc);
  const d = normalizeZone(device);
  if (!a || !d || a === d) return false;
  if (normalizeZone(declined) === d) return false;
  return !sameClock(a, d, at);
}
