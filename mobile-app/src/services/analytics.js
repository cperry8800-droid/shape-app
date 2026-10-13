// mobile-app/src/services/analytics.js
// Mobile (Capacitor/web) product analytics — same fire-and-forget contract as
// the web helper. Posts to the same /api/analytics/track (native uses the
// VITE_API_BASE_URL that shapeBackend already configures for fetch; the /m/ web
// build defaults to same-origin via an empty base → relative URL).
// Native callers have no cookie session, so events record as anon/null-user in v1.
// Consent-gated, region-aware (honors the SAME `shape.consent.v1` signal as the
// web carrier in public/supabase.js): GPC and an explicit opt-out ALWAYS block.
// With no explicit choice we OPT-IN for EEA/UK (block until 'accept' is recorded —
// the mobile app has no consent banner yet, so EEA first-run is never tracked)
// and OPT-OUT elsewhere (track unless 'reject'), mirroring the web shell's
// EEA/UK-by-timezone consent gating (CONSENT_REGION_RE below).
// The EEA and the UK by device time zone: every Europe/* zone (slightly over-inclusive, which
// fails safe), plus the EEA's zones outside Europe/* (the Canaries, Madeira, the Azores, Ceuta,
// Cyprus, Iceland, Svalbard, and France's outermost regions; Codex on #2334). One list, written
// out in four files; tests/consent-region.test.mjs holds them equal.
const CONSENT_REGION_RE = /^(?:Europe\/|(?:Atlantic\/(?:Canary|Madeira|Azores|Reykjavik|Jan_Mayen)|Africa\/Ceuta|Asia\/(?:Nicosia|Famagusta)|Arctic\/Longyearbyen|America\/(?:Guadeloupe|Martinique|Cayenne|Marigot)|Indian\/(?:Reunion|Mayotte))$)/;
function inEeaOrUk() {
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    return CONSENT_REGION_RE.test(tz);
  } catch (e) { return true; }   // region unknown → treat as EEA (fail CLOSED)
}
function consentBlocked() {
  try {
    if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true) return true;
    let c = null;
    try { c = localStorage.getItem('shape.consent.v1'); } catch (e) {}
    if (c === 'reject') return true;   // explicit opt-out, anywhere
    if (c === 'accept') return false;  // explicit opt-in, anywhere
    return inEeaOrUk();                // no choice yet: block EEA/UK, allow elsewhere
  } catch (e) { return true; }         // consent state unknown → block (fail CLOSED)
}
function postEvent(event, props) {
  try {
    if (consentBlocked()) return; // respect GPC + explicit opt-out; track otherwise
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    fetch(base + '/api/analytics/track', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props: props || {} }),
    }).catch(() => {});
  } catch (e) {}
}
if (typeof window !== 'undefined') {
  // MERGE `track` onto whatever ShapeAnalytics already exists (shapeBackend sets
  // `{ get, getProgress }`). The old `= ShapeAnalytics || { track }` short-circuited
  // because the object was already defined, so `.track` never attached and every
  // mobile funnel event silently no-op'd. Always attach track, never clobber.
  window.ShapeAnalytics = window.ShapeAnalytics || {};
  window.ShapeAnalytics.track = postEvent;
}
export {};
