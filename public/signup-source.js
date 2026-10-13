/* Where a new account came from: the browser half.
 *
 * A classic-script COPY of src/lib/signup-source.mjs (the sign-up pages are classic scripts and
 * cannot import an ES module); tests/signup-source.test.mjs runs both over the same cases and
 * fails on any difference. Change a rule there and here together. The rules, and why the
 * remembered first touch is consent-gated, are written out in that file.
 *
 * On load it remembers the first link a visitor arrived from (only when trackingAllowed says so).
 * A sign-up form asks window.shapeSignupSource.forSignup('website') for what to save with the
 * new account: the remembered first touch, else this page's own link and referrer.
 */
(function (root) {
  'use strict';
  var SOURCE_KEY = 'shape.signupSource';
  var COACH_REF_KEY = 'shape.coachRef';
  var SOURCE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var COACH_REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  // The EEA and the UK by device time zone: every Europe/* zone (slightly over-inclusive, which
  // fails safe), plus the EEA's zones outside Europe/* (the Canaries, Madeira, the Azores, Ceuta,
  // Cyprus, Iceland, Svalbard, and France's outermost regions; Codex on #2334). One list, written
  // out in four files; tests/consent-region.test.mjs holds them equal.
  var CONSENT_REGION_RE = /^(?:Europe\/|(?:Atlantic\/(?:Canary|Madeira|Azores|Reykjavik|Jan_Mayen)|Africa\/Ceuta|Asia\/(?:Nicosia|Famagusta)|Arctic\/Longyearbyen|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot)|Indian\/(?:Reunion|Mayotte))$)/;
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
  var FIELD_MAX = 60;
  var PATH_MAX = 120;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var HOST_PREFIX = /^(www\d?|m|l|lm|mobile)\./;

  function clip(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .toLowerCase()
      .slice(0, max == null ? FIELD_MAX : max);
  }

  function referrerHost(referrer, ownHost) {
    var url;
    try { url = new URL(String(referrer || '')); } catch (e) { return ''; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    var host = url.hostname.toLowerCase().replace(HOST_PREFIX, '');
    var own = String(ownHost || '').toLowerCase().split(':')[0].replace(HOST_PREFIX, '');
    if (!host || (own && (host === own || host.slice(-(own.length + 1)) === '.' + own))) return '';
    return clip(host);
  }

  function touchFrom(opts) {
    var o = opts || {};
    var params;
    try { params = new URLSearchParams(String(o.search || '')); } catch (e) { params = new URLSearchParams(); }
    var touch = {};
    for (var i = 0; i < UTM.length; i++) {
      var v = clip(params.get(UTM[i]));
      if (v) touch[UTM[i]] = v;
    }
    var ref = referrerHost(o.referrer, o.host);
    if (ref) touch.referrer = ref;
    if (!touch.utm_source && !touch.utm_medium && !touch.utm_campaign && !touch.referrer) return null;
    var landing = String(o.path || '').split(/[?#]/)[0].slice(0, PATH_MAX);
    if (landing.charAt(0) === '/') touch.landing = landing;
    touch.at = new Date(o.now == null ? Date.now() : o.now).toISOString();
    return touch;
  }

  function cleanSource(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var out = {};
    var keys = UTM.concat(['referrer']);
    for (var i = 0; i < keys.length; i++) {
      var v = clip(raw[keys[i]]);
      if (v) out[keys[i]] = v;
    }
    var landing = String(raw.landing == null ? '' : raw.landing).slice(0, PATH_MAX);
    if (/^\/[^\s]*$/.test(landing)) out.landing = landing;
    var at = Date.parse(String(raw.at == null ? '' : raw.at));
    if (isFinite(at)) out.at = new Date(at).toISOString();
    if (raw.coach_ref === true) out.coach_ref = true;
    if (raw.surface === 'website' || raw.surface === 'app') out.surface = raw.surface;
    if (raw.platform === 'ios' || raw.platform === 'android' || raw.platform === 'web') out.platform = raw.platform;
    return Object.keys(out).length ? out : null;
  }

  function readStored(rawJson, now) {
    var t = now == null ? Date.now() : now;
    var parsed;
    try { parsed = JSON.parse(String(rawJson || '')); } catch (e) { return null; }
    var v = cleanSource(parsed);
    if (!v || !v.at || t - Date.parse(v.at) > SOURCE_TTL_MS || Date.parse(v.at) > t + 60000) return null;
    return v;
  }

  function nextStored(stored, touch) {
    return stored || touch || null;
  }

  function coachRefLive(rawJson, now) {
    var t = now == null ? Date.now() : now;
    try {
      var v = JSON.parse(String(rawJson || ''));
      return Boolean(v && UUID_RE.test(String(v.token || '')) && v.at > 0 && t - v.at <= COACH_REF_TTL_MS);
    } catch (e) { return false; }
  }

  function trackingAllowed(opts) {
    var o = opts || {};
    if (o.gpc) return false;
    if (o.consent === 'reject') return false;
    if (o.consent === 'accept') return true;
    if (!o.timeZone) return false;
    return !CONSENT_REGION_RE.test(o.timeZone);
  }

  function forSignup(opts) {
    var o = opts || {};
    var base = o.stored || o.current || {};
    var merged = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) merged[k] = base[k];
    merged.coach_ref = o.coachRef === true;
    merged.surface = o.surface == null ? 'website' : o.surface;
    merged.platform = o.platform == null ? null : o.platform;
    return cleanSource(merged) || { surface: merged.surface };
  }

  var rules = {
    SOURCE_KEY: SOURCE_KEY, COACH_REF_KEY: COACH_REF_KEY,
    clip: clip, referrerHost: referrerHost, touchFrom: touchFrom, cleanSource: cleanSource,
    readStored: readStored, nextStored: nextStored, coachRefLive: coachRefLive,
    trackingAllowed: trackingAllowed, forSignup: forSignup
  };

  // ── The page glue ─────────────────────────────────────────────────────────
  function get(key) { try { return root.localStorage.getItem(key); } catch (e) { return null; } }
  function allowedHere() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    var gpc = false;
    try { gpc = root.navigator && root.navigator.globalPrivacyControl === true; } catch (e) { gpc = false; }
    return trackingAllowed({ consent: get('shape.consent.v1'), gpc: gpc, timeZone: tz });
  }
  function currentTouch() {
    var loc = root.location || {};
    return touchFrom({ search: loc.search, referrer: root.document ? root.document.referrer : '', host: loc.host, path: loc.pathname });
  }
  function capture() {
    try {
      if (!allowedHere()) {
        // A withdrawn consent also drops what was remembered.
        try { root.localStorage.removeItem(SOURCE_KEY); } catch (e) {}
        return null;
      }
      var stored = readStored(get(SOURCE_KEY));
      var keep = nextStored(stored, currentTouch());
      if (keep && keep !== stored) root.localStorage.setItem(SOURCE_KEY, JSON.stringify(keep));
      return keep;
    } catch (e) { return null; }
  }

  root.shapeSignupSource = {
    rules: rules,
    capture: capture,
    // What a sign-up on this page saves with the new account.
    forSignup: function (surface, platform) {
      try {
        var stored = allowedHere() ? readStored(get(SOURCE_KEY)) : null;
        return forSignup({ stored: stored, current: currentTouch(), coachRef: coachRefLive(get(COACH_REF_KEY)), surface: surface || 'website', platform: platform });
      } catch (e) { return { surface: surface || 'website' }; }
    }
  };
  capture();
})(typeof window !== 'undefined' ? window : this);
