// pass.mjs — a member's pass to Shape's own station (part 3 of Shape's own radio; owner,
// 2026-11-03). Before this, the stream's address was the whole key: whoever had it could listen,
// member or not ("the URL points at the provider's public endpoint, so anyone who already resolved
// it can keep hitting it", docs/legal/compliance-spec.md §15). Now:
//
//   /api/radio/station hands a member the stream with a pass on it (`?pass=`), signed by Shape and
//     good for PASS_TTL_SEC, and only from a country the licences cover;
//   the station server (services/station) asks /api/radio/pass, before it lets a listener in,
//     whether the pass on the address is good.
//
//   passKey(env)                          the signing key, or null (then no pass is issued or taken)
//   makePass({ userId, now, key })        → { pass, expiresAt } | null
//   verifyPass(pass, { now, key })        → { ok: true, userId, expiresAt } | { ok: false, reason }
//   checkListener(form, { now, key })     Icecast's listener_add, checked
//   streamWithPass(streamUrl, pass)       the stream's address with the pass on it
//   regionAllowed(country, { production }) may this request's country hear the station?
//
// ⚠ A PASS IS CHECKED WHEN A LISTENER CONNECTS, NOT WHILE THEY LISTEN. An expired pass ends no
// stream already playing; it opens no new one. So a pass is short enough that a leaked address
// soon stops working, and long enough to outlast an evening's listening.
// ⚠ THE TERRITORY IS THE LICENCES': THE US AND THE UK (compliance-spec §15's licence set). The
// country is the one Vercel measured for the member's own request (x-vercel-ip-country). In
// production a request with no country is refused: an unlicensed performance is worse than an
// unnecessary refusal (§15's rule for the sign-in gate).

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PASS_TTL_SEC = 6 * 3600;
export const PASS_PARAM = 'pass';
export const STATION_MOUNT = '/live';
export const RADIO_COUNTRIES = Object.freeze(['US', 'GB']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The key passes are signed with: RADIO_PASS_SECRET when it is set (32 characters or more), else
 * one derived from the service-role key (a keyed hash of a fixed label, never the key itself),
 * which every deploy of Shape already has. Null when neither is set.
 */
export function passKey(env = process.env) {
  const own = String(env.RADIO_PASS_SECRET || '');
  if (own.length >= 32) return Buffer.from(own, 'utf8');
  const service = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (service.length >= 32) return createHmac('sha256', service).update('shape-radio-pass-v1').digest();
  return null;
}

const sign = (key, body) => createHmac('sha256', key).update(body).digest('base64url');

/** A pass for this member, good for `ttlSec` from `now` (ms). Null without a key or a member. */
export function makePass({ userId, now, key, ttlSec = PASS_TTL_SEC }) {
  if (!key || !UUID.test(String(userId || ''))) return null;
  const exp = Math.floor(now / 1000) + ttlSec;
  const body = `v1.${userId}.${exp}`;
  return { pass: `${body}.${sign(key, body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyPass(pass, { now, key }) {
  if (!key) return { ok: false, reason: 'no_key' };
  const m = /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(String(pass || ''));
  if (!m) return { ok: false, reason: 'malformed' };
  const [, userId, exp, sig] = m;
  const want = Buffer.from(sign(key, `v1.${userId}.${exp}`));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'signature' };
  const expMs = Number(exp) * 1000;
  if (expMs <= now) return { ok: false, reason: 'expired' };
  // Longer than any pass Shape issues (a minute's grace for clocks): not one of ours.
  if (expMs > now + (PASS_TTL_SEC + 60) * 1000) return { ok: false, reason: 'too_long' };
  return { ok: true, userId, expiresAt: new Date(expMs).toISOString() };
}

/**
 * The station server's question when a listener connects (Icecast's url auth, `listener_add`):
 * its form carries the address asked for, query string and all, as `mount`. Only the station's
 * own mount, with a good pass, gets in.
 * @param {URLSearchParams} form
 */
export function checkListener(form, { now, key }) {
  if (form.get('action') !== 'listener_add') return { ok: false, reason: 'action' };
  let u;
  try { u = new URL(String(form.get('mount') || ''), 'http://station'); } catch { return { ok: false, reason: 'mount' }; }
  if (u.pathname !== STATION_MOUNT) return { ok: false, reason: 'mount' };
  return verifyPass(u.searchParams.get(PASS_PARAM), { now, key });
}

export function streamWithPass(streamUrl, pass) {
  const u = new URL(streamUrl);
  u.searchParams.set(PASS_PARAM, pass);
  return u.toString();
}

/** @returns {{ok: true, country: string | null} | {ok: false, reason: 'region_blocked' | 'region_unknown', country?: string}} */
export function regionAllowed(country, { production }) {
  const c = String(country || '').trim().toUpperCase();
  if (!c) return production ? { ok: false, reason: 'region_unknown' } : { ok: true, country: null };
  return RADIO_COUNTRIES.includes(c) ? { ok: true, country: c } : { ok: false, reason: 'region_blocked', country: c };
}
