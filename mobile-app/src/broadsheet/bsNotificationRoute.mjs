// The one map from a notification's route to the screen it opens (client-onboarding review, fix 3a),
// shared by the in-app list and a tapped push (push.js hands its route to the shell), so the two
// cannot open different places. Returns whether it handled the route; 'sessions' stays the Settings
// screen's own.
//
// ⚠ ITS OWN MODULE, IMPORTED BY EVERY SHELL (Codex on #2360). It lived in the client module and the
// coach shells reached it as window.bsRouteNotification, but an app that starts straight into a
// trainer or nutritionist role never loads the client module (iosAppBroadsheetMain loadProsBundle),
// so a tapped push was cleared and routed into nothing. Every shell now imports it, and the client
// module still exposes it on window for its own older callers.
//
// Each route opens its screen by a window event the shells answer (shape:openPrep,
// shape:openConversation, shape:goHome, shape:openClient, shape:openMarket).

export function bsRouteNotification(route, data) {
  if (typeof route !== 'string') return false;
  // A "New message" notification (route "messages") opens its conversation (fix 3a).
  if (route === 'messages' && data && typeof data.conversationId === 'string' && data.conversationId) route = 'chat:' + data.conversationId;
  try {
    // The night-before prep reminder ("prep:<recipe>") opens the cook screen on that recipe.
    if (route.startsWith('prep:') && route.length > 5) {
      window.dispatchEvent(new CustomEvent('shape:openPrep', { detail: { slug: route.slice(5) } }));
      return true;
    }
    // A conversation ("chat:<id>", e.g. a coach's new-client alert, fix 3a) opens that thread, in
    // either shell (both answer shape:openConversation).
    if (route.startsWith('chat:') && route.length > 5) {
      window.dispatchEvent(new CustomEvent('shape:openConversation', { detail: { conversationId: route.slice(5) } }));
      return true;
    }
    // The membership welcome ("home") opens the member's Home (Codex on #2360: it opened nothing).
    if (route === 'home') {
      window.dispatchEvent(new CustomEvent('shape:goHome'));
      return true;
    }
    // A coach's new-client alert when no thread could open ("client" with data.clientId in the list,
    // "client:<id>" from a push, which carries only its route): that client's page in the coach app
    // (both coach shells answer shape:openClient).
    const clientId = route.startsWith('client:') ? route.slice(7)
      : route === 'client' && data && typeof data.clientId === 'string' ? data.clientId : '';
    if (clientId) {
      window.dispatchEvent(new CustomEvent('shape:openClient', { detail: { clientId } }));
      return true;
    }
    // Waitlist invite ("coach:<role>:<id>") → the marketplace on that role, so the invited client
    // can find the coach and book (first-dibs applies).
    if (route.startsWith('coach:')) {
      window.dispatchEvent(new CustomEvent('shape:openMarket', { detail: { role: route.split(':')[1] || null } }));
      return true;
    }
  } catch (e) { /* no window events: nothing to open */ }
  return false;
}
