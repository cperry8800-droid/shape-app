// One view of a coach's page on the website, for their Growth funnel's top bar (owner, 2026-11-05:
// aggregate counts only). The coach profile (coachProfileWeb.jsx) calls countProfileView once its
// listing is read, for a visitor and never for the coach's own page; it reaches it through the
// profile's kit (coachProfileKit.mjs), so the page itself carries one line.
//
// What goes: the listing ({ role, id }) and nothing else, with the session cookie so the server can
// leave the coach's own visit out (POST /api/analytics/profile-view; the database keeps a day's total
// per listing, src/lib/profile-views.mjs). When: once per listing per page load, and only as the
// visitor's consent allows, by the tap counts' rule (trackingAllowed in public/click-capture.js,
// read as the radio's listening is: GPC and a Reject stop it, and in the EEA and the UK it waits for
// Accept). The page loads click-capture.js itself (pageShell.jsx); until it has, this waits a little,
// and with no rule at all it counts nothing. A test browser (navigator.webdriver) counts nothing.
import { listeningAllowed as consentAllows } from './radioListening.mjs';

export const PROFILE_VIEW_PATH = '/api/analytics/profile-view';
// How long to wait for the consent rule's script, a try at a time.
export const PROFILE_VIEW_WAIT_MS = 1500;
export const PROFILE_VIEW_TRIES = 4;

const sent = new Set();

function post(win, body) {
  try {
    win.fetch(PROFILE_VIEW_PATH, {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch (e) {}
}

/** Count one view of the listing `providerId` of `role`. Returns whether it was taken up (a second
 * call for the same listing on the same page, or a bad listing, is not). `opts` is for tests: the
 * window, the consent rule, the sender and the timers. */
export function countProfileView(role, providerId, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const r = role === 'trainer' || role === 'nutritionist' ? role : null;
  const id = Number(providerId);
  if (!win || !r || !Number.isSafeInteger(id) || id <= 0) return false;
  const key = r + ':' + id;
  const seen = opts.sent || sent;
  if (seen.has(key)) return false;
  seen.add(key);
  const send = opts.send || ((body) => post(win, body));
  const timers = opts.timers || globalThis;
  const attempt = (left) => {
    const rule = opts.rule || (win.shapeClickCapture && win.shapeClickCapture.trackingAllowed);
    if (typeof rule !== 'function') {
      if (left > 0) timers.setTimeout(() => attempt(left - 1), PROFILE_VIEW_WAIT_MS);
      return;
    }
    try { if (win.navigator && win.navigator.webdriver === true) return; } catch (e) { return; }
    if (!consentAllows(win, rule)) return;
    send({ role: r, id });
  };
  attempt(PROFILE_VIEW_TRIES);
  return true;
}
