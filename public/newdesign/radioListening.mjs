// How long Shape Radio plays, for the admin Overview's Radio tab (owner, 2026-10-30: "Yes build it";
// supabase-migrations/2026-10-30-radio-listening.sql). One module for both players: the website's
// Radio page imports it (Radio.html hands it over on window, like the signal field's modules) and
// the app imports it across the tree (mobile-app/src/services/shapeBackend.js).
//
// A player sends a beat as the stream starts playing, one a minute while it plays, and one as it
// stops, each with the listen's own random id and how many seconds it has played since it began.
// The id lets an end close that listen and no other (a resume's start can reach the server before
// the pause's end), and a running total, not a difference, means a beat that arrives late adds
// nothing twice and reopens nothing (Codex P2 ×2 on #2527). Nothing else goes: no track, no device
// and no account (the server reads the account from the request's own session, only to count a
// member or a coach once). Nothing is sent unless the consent rule allows it, the sign-up source's
// (trackingAllowed in src/lib/signup-source.mjs, and its copy in public/click-capture.js): Global
// Privacy Control and a Reject stop it, and in the EEA and the UK it waits for Accept.

export const RADIO_BEAT_MS = 60_000;
export const RADIO_LISTEN_PATH = '/api/analytics/radio-listen';
const STOPS = ['pause', 'ended', 'error', 'emptied'];

/** Whether this device may count listening: `rule` is trackingAllowed, read from `win`'s consent
 * choice, Global Privacy Control and time zone. No rule (its script not loaded) counts nothing. */
export function listeningAllowed(win, rule) {
  if (typeof rule !== 'function' || !win) return false;
  let consent = null;
  try { consent = win.localStorage.getItem('shape.consent.v1'); } catch (e) { consent = null; }
  let gpc = false;
  try { gpc = win.navigator?.globalPrivacyControl === true; } catch (e) { gpc = false; }
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { timeZone = ''; }
  try { return rule({ consent, gpc, timeZone }) === true; } catch (e) { return false; }
}

/** A random id for one listen (a version 4 uuid), from the device's random source. */
export function newListenId(c = globalThis.crypto) {
  try { if (c && typeof c.randomUUID === 'function') return c.randomUUID(); } catch (e) {}
  const b = new Uint8Array(16);
  try { c.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The beats for one player. `send(body)` posts one ({ surface, listen, played, end? }) and never
 * throws back; `allowed()` is asked as a listen starts and before every beat, the end included, so a
 * Reject mid-listen stops the beats there (Codex P1 on #2527: the server can't see a Reject). */
export function createRadioListening({ surface, send, allowed, now = () => Date.now(), timers = globalThis, newId = newListenId }) {
  let begun = 0; // when this listen began; 0 while nothing plays
  let listen = '';
  let timer = null;

  function post(body) {
    try { send(body); } catch (e) {}
  }
  function played() {
    return Math.max(0, Math.round((now() - begun) / 1000));
  }
  function quit() {
    if (timer !== null) { timers.clearInterval(timer); timer = null; }
    begun = 0;
  }
  function playing() {
    if (begun || !allowed()) return;
    begun = now() || 1;
    listen = newId();
    post({ surface, listen, played: 0 });
    timer = timers.setInterval(tick, RADIO_BEAT_MS);
  }
  function tick() {
    if (!begun) return;
    // Consent withdrawn while it plays: nothing more is sent, not even the end.
    if (!allowed()) { quit(); return; }
    post({ surface, listen, played: played() });
  }
  function stopped() {
    if (!begun) return;
    const total = played();
    const id = listen;
    const ok = allowed();
    quit();
    if (ok) post({ surface, listen: id, played: total, end: true });
  }
  return { playing, stopped, tick, listening: () => begun !== 0 };
}

/** Counts `audio`'s listening: a start when it plays, an end when it pauses, ends, fails or loses
 * its source, or when the page goes away (and a start again if a page comes back from the
 * back-forward cache still playing). Returns the beats, for a test to drive. */
export function attachRadioListening(audio, opts, win) {
  const beats = createRadioListening(opts);
  const start = () => beats.playing();
  const stop = () => beats.stopped();
  audio.addEventListener('playing', start);
  for (const type of STOPS) audio.addEventListener(type, stop);
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('pagehide', stop);
    win.addEventListener('pageshow', () => { if (!audio.paused) start(); });
  }
  return beats;
}
