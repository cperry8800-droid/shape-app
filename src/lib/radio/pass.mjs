// pass.mjs — a member's way onto Shape's own station (part 3 of Shape's own radio; owner,
// 2026-11-03). Before this, the stream's address was the whole key: whoever had it could listen,
// member or not ("the URL points at the provider's public endpoint, so anyone who already resolved
// it can keep hitting it", docs/legal/compliance-spec.md §15). Now two credentials, each signed by
// Shape:
//
//   a member's PASS (`v1.<member>.<expiry>.<sig>`, six hours): /api/radio/station hands it to a
//     member, on Shape's own address for the stream, /api/radio/listen?pass=…;
//   a station TICKET (`t1.<random>.<expiry>.<sig>`, two minutes, no member on it): each time a
//     player connects, /api/radio/listen checks the pass and the listener's own country, and
//     sends the player on to the station with a fresh ticket; the station server
//     (services/station) asks /api/radio/pass, before it lets a listener in, whether that ticket
//     is good.
//
//   passKey(env)                            the signing key, or null (then nothing is issued or taken)
//   makePass({ userId, now, key })          → { pass, expiresAt } | null
//   verifyPass(pass, { now, key })          → { ok: true, userId, expiresAt } | { ok: false, reason }
//   makeTicket({ now, key })                → { ticket, expiresAt } | null
//   verifyTicket(ticket, { now, key })      → { ok: true, expiresAt } | { ok: false, reason }
//   listenUrl(origin, pass)                 Shape's own address for the stream, with the pass on it
//   listenRedirect({ pass, country, ... })  /api/radio/listen's answer: the station, or a refusal
//   checkListener(form, { now, key })       Icecast's listener_add, checked
//   leavingListener(form, { key })          Icecast's listener_remove, read (part 4: performances)
//   streamWithTicket(streamUrl, ticket)     the station's address with a ticket on it
//   regionAllowed(country, { production })  may this request's country hear the station?
//
// ⚠ THE TERRITORY IS CHECKED AT EVERY CONNECTION, ON THE LISTENER'S OWN REQUEST (Codex, #2579).
// The station route checks the member's country as it hands out a pass, but an address can be
// passed on: so the address is Shape's own, and each connection to it is the player's own request,
// whose country Vercel measures. A shared address plays nowhere the licences do not reach.
// ⚠ ONLY A SHORT, NAMELESS TICKET REACHES THE STATION (Codex, #2579). The station's access log
// keeps every address asked for: a six-hour pass there, with its member on it, could be replayed by
// anyone who read the log. A ticket lasts two minutes and names no one.
// ⚠ BOTH ARE CHECKED AT THE DOOR, NOT WHILE THEY LISTEN. An expired pass or ticket ends no stream
// already playing; it opens no new one.
// ⚠ THE TERRITORY IS THE LICENCES': THE US AND THE UK (compliance-spec §15's licence set). In
// production a request with no country is refused: an unlicensed performance is worse than an
// unnecessary refusal (§15's rule for the sign-in gate).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OWN_PROVIDER } from './station.mjs';

export const PASS_TTL_SEC = 6 * 3600;
export const PASS_PARAM = 'pass';
export const TICKET_TTL_SEC = 120;
export const TICKET_PARAM = 'ticket';
export const LISTEN_PATH = '/api/radio/listen';
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

/** A station ticket, good for `ttlSec` from `now` (ms), naming no one. Null without a key. */
export function makeTicket({ now, key, ttlSec = TICKET_TTL_SEC }) {
  if (!key) return null;
  const exp = Math.floor(now / 1000) + ttlSec;
  const body = `t1.${randomBytes(8).toString('hex')}.${exp}`;
  return { ticket: `${body}.${sign(key, body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** A ticket Shape signed, whatever its age: { ok: true, expMs } | { ok: false, reason }. */
function signedTicket(ticket, key) {
  if (!key) return { ok: false, reason: 'no_key' };
  const m = /^t1\.([0-9a-f]{16})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(String(ticket || ''));
  if (!m) return { ok: false, reason: 'malformed' };
  const [, nonce, exp, sig] = m;
  const want = Buffer.from(sign(key, `t1.${nonce}.${exp}`));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'signature' };
  return { ok: true, expMs: Number(exp) * 1000 };
}

export function verifyTicket(ticket, { now, key }) {
  const signed = signedTicket(ticket, key);
  if (!signed.ok) return signed;
  const { expMs } = signed;
  if (expMs <= now) return { ok: false, reason: 'expired' };
  if (expMs > now + (TICKET_TTL_SEC + 60) * 1000) return { ok: false, reason: 'too_long' };
  return { ok: true, expiresAt: new Date(expMs).toISOString() };
}

/** Shape's own address for the stream, with this member's pass on it. */
export function listenUrl(origin, pass) {
  const u = new URL(LISTEN_PATH, origin);
  u.searchParams.set(PASS_PARAM, pass);
  return u.toString();
}

/**
 * /api/radio/listen's answer to a player connecting: the member's pass, then the territory of this
 * very request, then the station (Shape's own, connected; read only once both have passed), then a
 * fresh ticket for it.
 * @param {{ pass: string | null, country: string | null, production: boolean, readStation: () => Promise<{provider?: string | null, stream_url?: string | null} | null>, now: number, key: Buffer | null }} p
 * @returns {Promise<{status: 302, location: string} | {status: 401 | 451 | 503, reason: string}>}
 */
export async function listenRedirect({ pass, country, production, readStation, now, key }) {
  const p = verifyPass(pass, { now, key });
  if (!p.ok) return { status: p.reason === 'no_key' ? 503 : 401, reason: p.reason };
  const region = regionAllowed(country, { production });
  if (!region.ok) return { status: 451, reason: region.reason };
  let station = null;
  try { station = await readStation(); } catch { station = null; }
  if (!station || station.provider !== OWN_PROVIDER || !station.stream_url) return { status: 503, reason: 'station' };
  const t = makeTicket({ now, key });
  if (!t) return { status: 503, reason: 'no_key' };
  return { status: 302, location: streamWithTicket(station.stream_url, t.ticket) };
}

/**
 * The station server's question when a listener connects (Icecast's url auth, `listener_add`):
 * its form carries the address asked for, query string and all, as `mount`. Only the station's
 * own mount, with a good ticket, gets in.
 * @param {URLSearchParams} form
 */
export function checkListener(form, { now, key }) {
  if (form.get('action') !== 'listener_add') return { ok: false, reason: 'action' };
  let u;
  try { u = new URL(String(form.get('mount') || ''), 'http://station'); } catch { return { ok: false, reason: 'mount' }; }
  if (u.pathname !== STATION_MOUNT) return { ok: false, reason: 'mount' };
  const verdict = verifyTicket(u.searchParams.get(TICKET_PARAM), { now, key });
  if (!verdict.ok) return verdict;
  // Icecast's number for the connection, which its word that the listener left will carry too.
  const client = String(form.get('client') || '');
  if (!/^\d{1,15}$/.test(client)) return { ok: false, reason: 'numbers' };
  return { ...verdict, client: Number(client) };
}

/**
 * The station's word that a listener left (Icecast's url auth, `listener_remove`), with Icecast's
 * number for the connection and how long it lasted. ⚠ THE TICKET HAS RUN OUT SINCE, MOST LIKELY: it
 * was checked at the door two minutes at most after it was made, and an expired ticket ends no
 * stream, so a listener who stayed on still left, and is still counted. The ticket, when the word
 * carries one, must still be one Shape signed, for the station's own mount.
 * @param {URLSearchParams} form
 * @returns {{ok: true, client: number, durationSec: number} | {ok: false, reason: string}}
 */
export function leavingListener(form, { key }) {
  if (form.get('action') !== 'listener_remove') return { ok: false, reason: 'action' };
  let u;
  try { u = new URL(String(form.get('mount') || ''), 'http://station'); } catch { return { ok: false, reason: 'mount' }; }
  if (u.pathname !== STATION_MOUNT) return { ok: false, reason: 'mount' };
  // Icecast 2.4.4 (the station's) sends the address the listener asked for, ticket and all: measured,
  // and run end to end in tests/radio-station-e2e.test.mjs. Its documentation names only the mount,
  // so a bare /live is taken too: the station's own sign-in vouches for it, and Icecast tells of a
  // leave only for a listener its door let in. Anything on the address must be a ticket Shape signed.
  if (u.search) {
    const signed = signedTicket(u.searchParams.get(TICKET_PARAM), key);
    if (!signed.ok) return signed;
  }
  const client = String(form.get('client') || ''), duration = String(form.get('duration') || '');
  if (!/^\d{1,15}$/.test(client) || !/^\d{1,9}$/.test(duration)) return { ok: false, reason: 'numbers' };
  return { ok: true, client: Number(client), durationSec: Number(duration) };
}

export function streamWithTicket(streamUrl, ticket) {
  const u = new URL(streamUrl);
  u.searchParams.delete(PASS_PARAM);
  u.searchParams.set(TICKET_PARAM, ticket);
  return u.toString();
}

/** @returns {{ok: true, country: string | null} | {ok: false, reason: 'region_blocked' | 'region_unknown', country?: string}} */
export function regionAllowed(country, { production }) {
  const c = String(country || '').trim().toUpperCase();
  if (!c) return production ? { ok: false, reason: 'region_unknown' } : { ok: true, country: null };
  return RADIO_COUNTRIES.includes(c) ? { ok: true, country: c } : { ok: false, reason: 'region_blocked', country: c };
}
