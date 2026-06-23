// mobile-app/src/services/analytics.js
// Mobile (Capacitor/web) product analytics — same fire-and-forget contract as
// the web helper. Posts to the same /api/analytics/track (native uses the
// VITE_API_BASE_URL that shapeBackend already configures for fetch; the /m/ web
// build defaults to same-origin via an empty base → relative URL).
// Native callers have no cookie session, so events record as anon/null-user in v1.
function postEvent(event, props) {
  try {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    fetch(base + '/api/analytics/track', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props: props || {} }),
    }).catch(() => {});
  } catch (e) {}
}
if (typeof window !== 'undefined') {
  window.ShapeAnalytics = window.ShapeAnalytics || { track: postEvent };
}
export {};
