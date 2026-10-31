/* The website's page views (Vercel Web Analytics), only as the visitor's consent allows.
 *
 * ⚠ THE BANNER SAID IT, THE PAGE VIEWS DIDN'T DO IT. The consent banner (pageShell.jsx) tells an
 * EEA or UK visitor that their choice controls "Shape's first-party usage stats on this site", and
 * the tap counts (/click-capture.js) and the remembered first link (/signup-source.js) honour it.
 * But every page loaded /_vercel/insights/script.js outright, so a page view was counted before
 * the banner was answered, after a Reject, and under Global Privacy Control. Each page now loads
 * this instead, and this loads Vercel's script only when the rule the other two use allows: GPC
 * and a Reject always stop it, an Accept allows it, and with no choice yet the EEA and the UK wait
 * while everywhere else counts. Waiting, it loads the moment the banner is accepted (the banner's
 * `shape:consent` event, or another tab's choice). Once loaded, every event is checked again
 * (`beforeSend`, as @vercel/analytics registers it), so a later Reject stops what follows. The Next
 * app's pages do the same through src/components/ConsentAnalytics.tsx.
 */
(function (root) {
  'use strict';
  if (!root || !root.document || root.shapeConsentInsights) return;

  var SRC = '/_vercel/insights/script.js';
  var KEY = 'shape.consent.v1';
  // The EEA and the UK by device time zone: every Europe/* zone (slightly over-inclusive, which
  // fails safe), plus the EEA's zones outside Europe/* (the Canaries, Madeira, the Azores, Ceuta,
  // Cyprus, Iceland, Svalbard, and France's outermost regions; Codex on #2334). One list, written
  // out in six files; tests/consent-region.test.mjs holds them equal.
  var CONSENT_REGION_RE = /^(?:Europe\/|(?:Atlantic\/(?:Canary|Madeira|Azores|Reykjavik|Jan_Mayen)|Africa\/Ceuta|Asia\/(?:Nicosia|Famagusta)|Arctic\/Longyearbyen|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot)|Indian\/(?:Reunion|Mayotte))$)/;

  function trackingAllowed(opts) {
    var o = opts || {};
    if (o.gpc) return false;
    if (o.consent === 'reject') return false;
    if (o.consent === 'accept') return true;
    if (!o.timeZone) return false;
    return !CONSENT_REGION_RE.test(o.timeZone);
  }

  function allowedHere() {
    var consent = null;
    try { consent = root.localStorage.getItem(KEY); } catch (e) { consent = null; }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    var gpc = false;
    try { gpc = root.navigator && root.navigator.globalPrivacyControl === true; } catch (e) { gpc = false; }
    return trackingAllowed({ consent: consent, gpc: gpc, timeZone: tz });
  }

  var loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      // Vercel's queue, as @vercel/analytics fills it: the script reads it when it runs.
      root.va = root.va || function () { (root.vaq = root.vaq || []).push(arguments); };
      root.va('beforeSend', function (event) { return allowedHere() ? event : null; });
      var s = root.document.createElement('script');
      s.defer = true;
      s.src = SRC;
      (root.document.head || root.document.documentElement).appendChild(s);
    } catch (e) {}
  }
  function check() {
    if (!loaded && allowedHere()) load();
  }

  root.shapeConsentInsights = { trackingAllowed: trackingAllowed, allowedHere: allowedHere, check: check, SRC: SRC };
  check();
  try {
    root.addEventListener('shape:consent', check);
    root.addEventListener('storage', function (e) { if (!e || e.key === KEY || e.key === null) check(); });
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
