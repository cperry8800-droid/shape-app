// How long Shape Radio plays, for the admin Overview's Radio tab (owner, 2026-10-30: "Yes build it";
// supabase-migrations/2026-10-30-radio-listening.sql). One module for both players: the website's
// Radio page imports it (Radio.html hands it over on window, like the signal field's modules) and
// the app imports it across the tree (mobile-app/src/services/shapeBackend.js).
//
// A player sends a beat as the stream starts playing, one a minute while it plays, and one as it
// stops, each saying how many seconds played since the last. Nothing else goes: no track, no device
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

/** The beats for one player. `send(body)` posts one ({ surface, seconds, end? }) and never throws
 * back; `allowed()` is asked as a listen starts and at every beat, so a Reject mid-listen stops the
 * beats there. */
export function createRadioListening({ surface, send, allowed, now = () => Date.now(), timers = globalThis }) {
  let last = 0; // when the last beat went; 0 while nothing plays
  let timer = null;

  function post(body) {
    try { send(body); } catch (e) {}
  }
  function since(t) {
    return Math.max(0, Math.round((t - last) / 1000));
  }
  function quit() {
    if (timer !== null) { timers.clearInterval(timer); timer = null; }
    last = 0;
  }
  function playing() {
    if (last || !allowed()) return;
    last = now() || 1;
    post({ surface, seconds: 0 });
    timer = timers.setInterval(tick, RADIO_BEAT_MS);
  }
  function tick() {
    if (!last) return;
    // Consent withdrawn while it plays: nothing more is sent, not even the end.
    if (!allowed()) { quit(); return; }
    const t = now();
    post({ surface, seconds: since(t) });
    last = t;
  }
  function stopped() {
    if (!last) return;
    const seconds = since(now());
    quit();
    post({ surface, seconds, end: true });
  }
  return { playing, stopped, tick, listening: () => last !== 0 };
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
