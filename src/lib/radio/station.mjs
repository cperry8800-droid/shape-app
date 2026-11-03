// station.mjs — connecting Shape Radio to its station: radio.co (owner, 2026-10-10: "radio.co is
// what shape radio will stream from"), or Shape's own (services/station, 2026-11-03; below). The
// dashboard's Station card hands this the stream URL (and, for radio.co, its station ID); the
// result is the radio_station row the website and the app already read: for radio.co, provider
// 'http', the stream, and radio.co's public status as the now-playing source; for Shape's own,
// provider 'shape' and the stream, now-playing coming from Shape's own records. Pure, but for
// probeStream, which asks the stream itself.

import { MAX_TRACK_SEC } from './library.mjs';

const STATION_ID_RE = /^s[a-z0-9]{6,16}$/i;

/** radio.co's public status for a station (current song with its start time, and recent plays). */
export const radioCoStatusUrl = (stationId) => `https://public.radio.co/stations/${stationId}/status`;

/**
 * @returns {{ok: true, value: {provider, stream_url, now_playing_url}} | {ok: false, error}}
 * ⚠ HTTPS ONLY: the website is served over HTTPS, and a browser blocks an http:// stream on it.
 */
export function checkStation({ streamUrl, stationId } = {}) {
  const id = String(stationId || '').trim();
  if (!STATION_ID_RE.test(id)) return { ok: false, error: 'station_id' };
  let u;
  try { u = new URL(String(streamUrl || '').trim()); } catch { return { ok: false, error: 'stream_url' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'stream_https' };
  if (u.username || u.password) return { ok: false, error: 'stream_url' };
  if (!/(^|\.)radio\.co$/i.test(u.hostname)) return { ok: false, error: 'stream_not_radio_co' };
  return { ok: true, value: { provider: 'http', stream_url: u.toString(), now_playing_url: radioCoStatusUrl(id) } };
}

/** The station ID back out of a stored status URL, for the form. */
export function stationIdOf(nowPlayingUrl) {
  const m = /^https:\/\/public\.radio\.co\/stations\/([^/]+)\/status$/.exec(String(nowPlayingUrl || ''));
  return m ? m[1] : null;
}

// ── Shape's own station (services/station; owner, 2026-11-03: "build your own internet/app radio
// streaming platform … instead of using radio.co") ───────────────────────────────────────────
// Its stream is the station server's /live, behind HTTPS on the owner's own name, e.g.
// https://radio.theshapecommunity.com/live. Now-playing needs no outside URL: Shape planned what
// plays, so it reads its own records (src/lib/radio/noraOnAir.mjs, rotationOnAir).

export const OWN_PROVIDER = 'shape';
export const OWN_MOUNT = '/live';

/**
 * @returns {{ok: true, value: {provider, stream_url, now_playing_url: null}} | {ok: false, error}}
 * ⚠ HTTPS ONLY, ON A NAME: the website is served over HTTPS (a browser blocks an http:// stream on
 * it), and the station's certificate is for a host name, never an address.
 */
export function checkOwnStation({ streamUrl } = {}) {
  let u;
  try { u = new URL(String(streamUrl || '').trim()); } catch { return { ok: false, error: 'stream_url' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'stream_https' };
  if (u.username || u.password || u.search || u.hash || u.port) return { ok: false, error: 'stream_url' };
  if (u.pathname !== OWN_MOUNT) return { ok: false, error: 'stream_not_live' };
  const host = u.hostname.toLowerCase();
  if (/(^|\.)radio\.co$/.test(host)) return { ok: false, error: 'stream_is_radio_co' };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) || /(^|\.)(localhost|local|internal)$/.test(host)) {
    return { ok: false, error: 'stream_host' };
  }
  return { ok: true, value: { provider: OWN_PROVIDER, stream_url: `https://${host}${OWN_MOUNT}`, now_playing_url: null } };
}

/**
 * Does the stream answer, with audio? Asked before the station is saved, so the website and app are
 * never handed a stream that is not there. The station's /live answers with its standby loop even
 * while nothing else plays, so a station that is up always passes. Reads the headers only.
 * @returns {Promise<{ok: true} | {ok: false, error: 'station_unreachable' | 'station_not_audio'}>}
 */
export async function probeStream(url, { fetchFn = fetch, timeoutMs = 8000 } = {}) {
  let res;
  try {
    res = await fetchFn(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { ok: false, error: 'station_unreachable' };
  }
  try { await res.body?.cancel(); } catch { /* the headers are all that was wanted */ }
  if (!res.ok) return { ok: false, error: 'station_unreachable' };
  const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '').toLowerCase();
  return type.startsWith('audio/mpeg') ? { ok: true } : { ok: false, error: 'station_not_audio' };
}

// ⚠ A HEALTHY ENGINE IS QUIET FOR AS LONG AS THE LONGEST SONG THE LIBRARY TAKES (Codex, #2574). It
// reports as each song starts, and a song may run MAX_TRACK_SEC: quiet past that (with two minutes
// for the blend and the report's way), it is not playing, and listeners hear the standby loop.
export const ENGINE_QUIET_MS = (MAX_TRACK_SEC + 120) * 1000;

/** Has the engine been quiet too long to be playing? `lastAt` is its latest report's time, or null. */
export function engineQuiet(lastAt, now) {
  const at = lastAt ? Date.parse(lastAt) : NaN;
  return !Number.isFinite(at) || now - at > ENGINE_QUIET_MS;
}
