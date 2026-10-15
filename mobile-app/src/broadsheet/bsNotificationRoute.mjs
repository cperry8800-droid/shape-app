// The one map from a notification's route to the screen it opens (client-onboarding review, fix 3a),
// shared by the in-app list and a tapped push (push.js hands its route to the shell), so the two
// cannot open different places. Returns whether it handled the route.
//
// ⚠ ITS OWN MODULE, IMPORTED BY EVERY SHELL (Codex on #2360). It lived in the client module and the
// coach shells reached it as window.bsRouteNotification, but an app that starts straight into a
// trainer or nutritionist role never loads the client module (iosAppBroadsheetMain loadProsBundle),
// so a tapped push was cleared and routed into nothing. Every shell now imports it, and the client
// module still exposes it on window for its own older callers.
//
// ⚠ EVERY ROUTE IS IN public/newdesign/notificationRoutes.mjs (the notification audit, 2026-10-15),
// the table the server's push and the guard test read too. A route is written the way a push
// carries it (canonicalRoute), read back (parseRoute), and opened by a window event the shells
// answer:
//   chat:<id>            shape:openConversation { conversationId }
//   prep:<recipe>        shape:openPrep { slug }
//   home                 shape:goHome
//   client:<role>:<id>   shape:openClient { clientId, providerRole }
//   coach:<role>:<id>    shape:openMarket { role, coachId }
//   everything else      shape:openPage { page, id, role }
// A shell that is not the route's audience (a member route in a coach app, or the other coach
// role's) hands it to the shell that is (bsHandOver, below).
import { canonicalRoute, parseRoute } from '../../../public/newdesign/notificationRoutes.mjs';

export function bsRouteNotification(route, data) {
  const p = parseRoute(canonicalRoute(route, data));
  if (!p) return false;
  const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
  try {
    if (p.kind === 'chat') { fire('shape:openConversation', { conversationId: p.id }); return true; }
    // `fromNotification`: only a notification hands a route to another shell. The same events
    // fired from inside an app (a coach's "browse the marketplace") never switch apps.
    if (p.kind === 'prep') { fire('shape:openPrep', { slug: p.id, fromNotification: true }); return true; }
    if (p.kind === 'home') { fire('shape:goHome'); return true; }
    if (p.kind === 'client') { fire('shape:openClient', { clientId: p.id, providerRole: p.role, fromNotification: true }); return true; }
    if (p.kind === 'coach') { fire('shape:openMarket', { role: p.role, ...(p.id ? { coachId: Number(p.id) } : {}), fromNotification: true }); return true; }
    fire('shape:openPage', { page: p.kind, id: p.id, role: p.role, fromNotification: true });
    return true;
  } catch (e) { /* no window events: nothing to open */ }
  return false;
}

/**
 * Hand a route to the shell of `role` ('client', 'trainer' or 'nutritionist'): it waits on
 * window.__bsPushRoute, and the shell that mounts for the new role replays it once its listeners
 * are up (every shell's deferred replay). `route` is the canonical string, so it carries its ids.
 */
export function bsHandOver(route, role, setTweak) {
  if (!route || !role || typeof setTweak !== 'function') return false;
  window.__bsPushRoute = route;
  setTweak('role', role);
  return true;
}

/** The coach role this account holds ('trainer' first), for a coach route that names none. */
export function bsAccountCoachRole() {
  try {
    const p = window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().profile;
    const roles = [].concat(p && Array.isArray(p.roles) ? p.roles : [], p && p.role ? [p.role] : []).map((r) => String(r || '').toLowerCase());
    if (roles.includes('trainer')) return 'trainer';
    if (roles.includes('nutritionist') || roles.includes('dietitian')) return 'nutritionist';
  } catch (e) { /* signed out: none */ }
  return null;
}

/** The member pages: a coach app hands these to the member app. */
export const BS_MEMBER_PAGES = Object.freeze(['sessions', 'train', 'eat', 'score', 'checkin', 'goal', 'habits', 'progress']);
/** The coach pages: the member app hands these to the coach app. */
export const BS_COACH_PAGES = Object.freeze(['clients', 'schedule', 'waitlist', 'credentials']);

/** The canonical string for an open event's detail, for a hand-over. */
export function bsRouteFor(kind, detail) {
  const d = detail || {};
  if (kind === 'client') return d.providerRole ? `client:${d.providerRole}:${d.clientId}` : `client:${d.clientId}`;
  if (kind === 'coach') return `coach:${d.role}${d.coachId != null ? ':' + d.coachId : ''}`;
  if (kind === 'prep') return 'prep:' + d.slug;
  if (kind === 'page') return d.page + (d.role ? ':' + d.role : d.id ? ':' + d.id : '');
  return '';
}
