// station.mjs — connecting Shape Radio to its station on radio.co (owner, 2026-10-10: "radio.co
// is what shape radio will stream from"). The dashboard's Station card hands this the stream URL
// radio.co gives for the station and its station ID; the result is the radio_station row the
// website and the app already read (provider 'http', the stream, and radio.co's public status as
// the now-playing source). Pure.

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
