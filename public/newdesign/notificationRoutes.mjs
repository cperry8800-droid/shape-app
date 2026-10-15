// Every route a Shape notification can carry, and the one way to write it down for a push (the
// notification audit, 2026-10-15; owner: "should we run a seperate audit on all push
// notifications?" · "for a closed shape app").
//
// ⚠ ONE TABLE, READ BY EVERY SIDE. The server's push dispatch (src/app/api/push/dispatch/route.ts),
// the app's router (mobile-app/src/broadsheet/bsNotificationRoute.mjs) and the guard test
// (tests/notification-routes.test.mjs) all import it. Before it, each surface kept its own list,
// and the audit found fifteen routes that opened nothing on at least one of them: Codex on #2360
// found them one surface per review round.
//
// A push carries only its route string, so canonicalRoute() writes what the app needs (a thread,
// a client, a coach, a person) INTO the route; parseRoute() reads it back. The in-app list passes
// (route, data) and goes through the same canonicalRoute(), so the two cannot open different
// places.

/** Every route kind, and who receives it: a member, a coach, or either. */
export const ROUTES = Object.freeze({
  chat: 'either',        // a conversation (chat:<id>); "messages" with data.conversationId is written as this
  messages: 'either',    // a "New message" without its conversation (older rows): the chat tab
  home: 'either',        // a member's Home; a coach's Today
  client: 'coach',       // a client's page: client:<role>:<id> or client:<id>
  clients: 'coach',      // the coach's client list (the coach digest)
  schedule: 'coach',     // the coach's calendar: a booking request, a session payment (schedule:<role>)
  waitlist: 'coach',     // the coach's waiting room (waitlist:<role>)
  credentials: 'coach',  // the coach's certifications
  prep: 'member',        // the night-before prep reminder (prep:<recipe>)
  coach: 'member',       // a coach's listing (coach:<role>:<id>): a waiting-list invite
  sessions: 'member',    // the member's sessions: booked, confirmed, declined, moved, cancelled
  train: 'member',       // a workout, a program, a week of training
  eat: 'member',         // a meal plan, a grocery list
  score: 'member',       // the Shape Score
  checkin: 'member',     // the weekly check-in
  goal: 'member',        // the member's goal
  habits: 'member',      // habits and streaks
  progress: 'member',    // weigh-ins, check-in photos
  feed: 'either',        // the community feed (feed:<post>)
  community: 'either',   // the community feed (a coach's co-sign)
  profile: 'either',     // a person's profile (profile:<user>): follows
  settings: 'either',    // Settings: a connected app shared a workout
});

const ROLE = (r) => (r === 'trainer' || r === 'nutritionist' ? r : r === 'dietitian' ? 'nutritionist' : null);
const ID = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/**
 * The route as a push carries it, from a notification's own (route, data). Ids the app needs ride
 * in the string; a route it does not know is returned as it came (and opens nothing).
 */
export function canonicalRoute(route, data) {
  if (typeof route !== 'string' || !route) return '';
  const d = data && typeof data === 'object' ? data : {};
  const conv = ID(d.conversationId);
  if ((route === 'messages' || route === 'chat') && conv) return 'chat:' + conv;
  const role = ROLE(d.providerRole);
  if (route === 'client') {
    const id = ID(d.clientId);
    return id ? (role ? `client:${role}:${id}` : `client:${id}`) : route;
  }
  if ((route === 'schedule' || route === 'waitlist' || route === 'credentials') && role) return `${route}:${role}`;
  if (route === 'profile' && ID(d.actorId)) return 'profile:' + ID(d.actorId);
  if ((route === 'feed' || route === 'community') && ID(d.postId)) return 'feed:' + ID(d.postId);
  return route;
}

/**
 * A route string read back: { kind, id, role }, or null for one nothing opens. `kind` is a key of
 * ROUTES.
 */
export function parseRoute(str) {
  if (typeof str !== 'string' || !str) return null;
  const at = str.indexOf(':');
  const kind = at < 0 ? str : str.slice(0, at);
  if (!Object.prototype.hasOwnProperty.call(ROUTES, kind)) return null;
  const rest = at < 0 ? '' : str.slice(at + 1);
  // A bare "chat" (no thread named) is the chat; "chat:" with nothing after it is malformed.
  if (kind === 'chat') return rest ? { kind, id: rest, role: null } : at < 0 ? { kind: 'messages', id: null, role: null } : null;
  if (kind === 'client') {
    const m = /^(trainer|nutritionist):(.*)$/.exec(rest);
    const id = m ? m[2] : rest;
    return id ? { kind, id, role: m ? m[1] : null } : null;
  }
  if (kind === 'coach') {
    const [role, id] = rest.split(':');
    const r = ROLE(role);
    return r ? { kind, id: /^\d+$/.test(id || '') ? id : null, role: r } : null;
  }
  if (kind === 'prep') return rest ? { kind, id: rest, role: null } : null;
  if (kind === 'schedule' || kind === 'waitlist' || kind === 'credentials') return { kind, id: null, role: ROLE(rest) };
  if (kind === 'profile' || kind === 'feed') return { kind, id: rest || null, role: null };
  return { kind, id: null, role: null };
}

/** Who a route is for. */
export function routeAudience(kind) {
  return Object.prototype.hasOwnProperty.call(ROUTES, kind) ? ROUTES[kind] : null;
}
