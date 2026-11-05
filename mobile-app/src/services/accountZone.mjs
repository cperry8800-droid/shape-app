// The account's time zone, from the app (P9, owner 2026-11-05): "all time zones should be set by
// user", and the device's zone is only a default on first sign-in; a device on another clock later
// (travel) is offered as a switch, never made one.
//
// Two halves, both pure apart from shapeZone.mjs's remembered zone:
//   - bsReadAccountZone / bsWriteAccountZone: GET and PUT /api/me/timezone over a fetch the caller
//     passes (shapeBackend.js gives its own, with the API base and the live Bearer token: the
//     installed app sends no cookie). They never throw; every failure comes back as a reason.
//   - bsZoneOnOpen / bsZoneSwitch / bsZoneKeep: the open-time flow every role runs (BSTimezone.jsx
//     BSTimezoneCheck), over window.ShapeProfile's two calls, and the travel prompt's two answers.
//
// ⚠ A FAILED READ IS NOT "NO ZONE". Only a read that worked and said `timezone: null` sets the
// device's zone as the first default (and even then `onlyIfUnset`, so a zone set meanwhile on the
// website stands). A 401, a 503, a network error or an unreadable body changes nothing.
// ⚠ `ready: false` (the migration hasn't run) CHANGES NOTHING EITHER: no write, no prompt, no row.
import { normalizeZone, deviceZone, setAccountZone, declinedZone, declineDeviceZone, travelAsk } from './shapeZone.mjs';

export const BS_ZONE_PATH = '/api/me/timezone';

const fail = (reason, extra = {}) => ({ ok: false, reason, notReady: false, invalid: false, ...extra });

async function bodyOf(res) {
  try { return await res.json(); } catch (e) { return null; }
}

/**
 * GET the account's zone: { ok: true, timezone: string | null, ready: boolean }, or
 * { ok: false, reason: 'signed_out' | 'auth' | 'unavailable' | 'network' | 'unusable' }.
 * 'unusable' is a zone the server holds that this runtime can't print: a zone IS set, so the open
 * flow must not write a default over it.
 */
export async function bsReadAccountZone(fetchFn, { base = '', token = null } = {}) {
  if (!token) return fail('signed_out');
  let res;
  try {
    res = await fetchFn(`${base || ''}${BS_ZONE_PATH}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch (e) { return fail('network'); }
  if (!res || !res.ok) return fail(res && res.status === 401 ? 'auth' : 'unavailable', { status: res ? res.status : 0 });
  const body = await bodyOf(res);
  if (!body || typeof body !== 'object' || typeof body.ready !== 'boolean') return fail('unavailable');
  if (body.timezone == null) return { ok: true, timezone: null, ready: body.ready };
  const zone = normalizeZone(body.timezone);
  if (!zone) return fail('unusable');
  return { ok: true, timezone: zone, ready: body.ready };
}

/**
 * PUT the account's zone: { ok: true, timezone, changed } (the zone that stands, which with
 * `onlyIfUnset` can be one set elsewhere), or { ok: false, reason, notReady, invalid }.
 * `notReady` is the route's 503 `not_ready` (before the migration runs).
 */
export async function bsWriteAccountZone(fetchFn, tz, { base = '', token = null, onlyIfUnset = false } = {}) {
  const zone = normalizeZone(tz);
  if (!zone) return fail('invalid', { invalid: true });
  if (!token) return fail('signed_out');
  let res;
  try {
    res = await fetchFn(`${base || ''}${BS_ZONE_PATH}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(onlyIfUnset ? { timezone: zone, onlyIfUnset: true } : { timezone: zone }),
    });
  } catch (e) { return fail('network'); }
  if (!res) return fail('network');
  const body = await bodyOf(res);
  if (res.ok) {
    const answer = normalizeZone(body && body.timezone);
    // Saved, but the answer can't be used here: say so rather than claim a zone we can't print.
    if (!answer) return fail('unusable');
    return { ok: true, timezone: answer, changed: !!(body && body.changed) };
  }
  const code = body && body.code;
  if (res.status === 503 && code === 'not_ready') return fail('not_ready', { notReady: true });
  if (res.status === 400) return fail('invalid', { invalid: true });
  return fail(res.status === 401 ? 'auth' : 'write_failed', { status: res.status });
}

async function settle(fn) {
  try { return await fn(); } catch (e) { return null; }
}

/**
 * The open-time flow, for a signed-in account of any role. Reads the account's zone; before the
 * migration does nothing; with none set, sets this device's as the first default; tells
 * shapeZone.mjs the zone that stands; and says whether to ask about this device's clock.
 *
 * `api` is window.ShapeProfile (getAccountTimezone, setAccountTimezone). `isCurrent()` is false once
 * the account that started this is gone (signed out, switched): nothing is remembered for it then.
 *
 * Returns { state, account, device, ask }, state one of:
 *   'set'       the account's zone is known (and remembered); `ask` is the travel question
 *   'unset'     no zone, and this device can't name one to default to
 *   'not_ready' the migration hasn't run
 *   'failed'    a read or the default's write failed: nothing changed, the next open tries again
 *   'stale'     the account changed while this ran
 */
export async function bsZoneOnOpen({ api = {}, device = deviceZone(), isCurrent = () => true } = {}) {
  const none = (state) => ({ state, account: null, device: device || null, ask: false });
  const read = await settle(() => api.getAccountTimezone());
  if (!isCurrent()) return none('stale');
  if (!read || read.ok !== true) return none('failed');
  if (read.ready !== true) return none('not_ready');
  let account = read.timezone || null;
  if (!account) {
    if (!device) { setAccountZone(null); return none('unset'); }
    const put = await settle(() => api.setAccountTimezone(device, { onlyIfUnset: true }));
    if (!isCurrent()) return none('stale');
    if (!put || put.ok !== true) return none(put && put.notReady ? 'not_ready' : 'failed');
    account = put.timezone;
  }
  account = setAccountZone(account);
  if (!account) return none('failed');
  return { state: 'set', account, device: device || null, ask: travelAsk({ account, device, declined: declinedZone() }) };
}

/**
 * Set the account's zone to `to` (the prompt's "Switch to <device city>", or a pick in Settings),
 * then remember it. A failed switch keeps the zone that was there. Returns { ok: true, account } or
 * { ok: false, notReady }.
 *
 * ⚠ A ZONE CHOSEN AWAY FROM THIS DEVICE'S IS ALSO THE ANSWER TO THE TRAVEL QUESTION. `device` is
 * this device's zone when the choice was made in Settings: a coach in Tokyo who picks New York
 * there has said "keep New York" for Tokyo, so it is recorded as declined before the new zone is
 * announced (the announcement is what the open-time check listens to, and it would otherwise ask
 * at once to switch back to the clock just turned down).
 */
export async function bsZoneSwitch({ api = {}, to, isCurrent = () => true, device = null } = {}) {
  const put = await settle(() => api.setAccountTimezone(to));
  if (!isCurrent()) return { ok: false, notReady: false, stale: true };
  if (!put || put.ok !== true) return { ok: false, notReady: !!(put && put.notReady) };
  const answer = normalizeZone(put.timezone);
  const d = normalizeZone(device);
  if (answer && d && d !== answer) declineDeviceZone(d);
  const account = setAccountZone(answer);
  return account ? { ok: true, account } : { ok: false, notReady: false };
}

/** "Keep <account city>": not asked again on this device until its clock moves somewhere else. */
export function bsZoneKeep(device) {
  declineDeviceZone(device);
}
