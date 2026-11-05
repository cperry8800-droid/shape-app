// The notification row as the change signal (website ↔ app parity, P7; owner, 2026-11-05: "the
// website and app need to fully communicate", and "clients workouts and programs should automatically
// get sent to app… they shouldnt have to manually push send to phone").
//
// Every coach publish already writes a notice for the member (publish_client_week's `workout` row, the
// meal-plan route's `meal_plan` row), every session change a `session_*` row and every message a
// `message` row, and `notifications` is already in supabase_realtime. So a screen left open does not
// need a table of its own in realtime: when a notice lands for the signed-in person, the screens that
// show what it is about read again. The app also reads again when it comes back to the foreground,
// since a suspended socket can miss a row outright.
//
// One module for both surfaces (the app re-exports it from mobile-app/src/services/changeSignal.mjs):
//   · changeScopesOf(notice): which screens a notice is about;
//   · createChangeBatcher: a burst of notices (a week of workouts, a thread of messages) is one read;
//   · announceChange / onShapeChange: the window event the screens listen to;
//   · changeRevHook(React): a number that moves on each announcement naming a screen's scopes, for a
//     read's effect deps (the userGoalsRefresh.mjs pattern);
//   · startChangeFeed: the realtime subscription itself, for the website (the app feeds its own
//     existing notifications subscription into a batcher instead of opening a second channel);
//   · foregroundGate: when a return to the foreground should read again.
// No React, no window at import time.

export const SHAPE_CHANGE_EVENT = 'shape:change';
// Every scope a screen can listen to. ALL is announced on a return to the foreground and on a
// realtime reconnect (anything may have changed while nobody was listening); a listener never
// subscribes to ALL itself.
export const CHANGE_SCOPES = Object.freeze(['training', 'meals', 'sessions', 'messages', 'checkins', 'clients', 'habits', 'goals']);
export const ALL = '*';
// A burst of notices is one read: a coach's week is one `workout` row per client, a care-team thread
// can deliver several messages at once, and a session change can write two rows (the member's and the
// coach's). Long enough to gather them, short enough that the screen still answers at once.
export const CHANGE_BATCH_MS = 700;
// A return to the foreground reads again only after this long away: switching apps for a second
// (copying a code, answering a call) should not re-read every screen.
export const FOREGROUND_MIN_AWAY_MS = 15_000;

const SCOPE_OF_TYPE = Object.freeze({
  // What a coach sends a member.
  workout: ['training'],
  program: ['training'],
  meal_plan: ['meals'],
  grocery: ['meals'],
  // Sessions, on either side.
  booking_request: ['sessions'],
  intro_followup: ['sessions'],
  listing_request: ['sessions'],
  listing_joined: ['sessions'],
  // A coach's roster.
  new_client: ['clients'],
  shared_client: ['clients'],
  // Messages: the thread list and the screens that show a coach's last word.
  message: ['messages'],
});

/** The scopes a notice row is about ({ type, data }), [] for one that changes nothing a screen shows. */
export function changeScopesOf(notice) {
  const type = notice && typeof notice === 'object' && typeof notice.type === 'string' ? notice.type : '';
  if (!type) return [];
  if (Object.prototype.hasOwnProperty.call(SCOPE_OF_TYPE, type)) return SCOPE_OF_TYPE[type].slice();
  // Every session notice, those that exist and any added later (a member cancelling, P5).
  if (type.indexOf('session_') === 0) return ['sessions'];
  // A check-in landing for a coach (checkin_submitted, and any later checkin_* notice).
  if (type.indexOf('checkin') === 0) return ['checkins'];
  // The engine's own nudges (ai_*), payments, follows, credentials: nothing a plan screen shows.
  return [];
}

function cleanScopes(scopes) {
  const list = Array.isArray(scopes) ? scopes : [scopes];
  const out = [];
  for (const s of list) {
    if (s === ALL) return [ALL];
    if (typeof s === 'string' && CHANGE_SCOPES.includes(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Gathers scopes for `delayMs` and hands their union to `emit` once. `push` with nothing usable does
 * not start the timer. ALL swallows everything else in its batch. Timers are injectable for tests.
 */
export function createChangeBatcher(emit, opts = {}) {
  const delayMs = Number.isFinite(opts.delayMs) && opts.delayMs >= 0 ? opts.delayMs : CHANGE_BATCH_MS;
  const setT = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearT = opts.clearTimer || ((id) => clearTimeout(id));
  let pending = [];
  let timer = null;
  let stopped = false;
  const flush = () => {
    if (timer != null) { clearT(timer); timer = null; }
    if (!pending.length) return;
    const out = pending;
    pending = [];
    try { emit(out); } catch (e) { /* a listener's failure never stops the next batch */ }
  };
  return {
    push(scopes) {
      if (stopped) return false;
      const add = cleanScopes(scopes);
      if (!add.length) return false;
      if (add[0] === ALL || pending[0] === ALL) pending = [ALL];
      else for (const s of add) if (!pending.includes(s)) pending.push(s);
      if (timer == null) timer = setT(flush, delayMs);
      return true;
    },
    flush,
    stop() { stopped = true; if (timer != null) { clearT(timer); timer = null; } pending = []; },
    pending: () => pending.slice(),
  };
}

const win = () => (typeof window !== 'undefined' ? window : null);

/** Tell the mounted screens that what these scopes show has changed. `reason` rides along. */
export function announceChange(scopes, target = win(), reason) {
  if (!target || typeof target.dispatchEvent !== 'function') return false;
  const list = cleanScopes(scopes);
  if (!list.length) return false;
  const CE = (typeof target.CustomEvent === 'function' && target.CustomEvent) || (typeof CustomEvent === 'function' ? CustomEvent : null);
  if (!CE) return false;
  try { target.dispatchEvent(new CE(SHAPE_CHANGE_EVENT, { detail: { scopes: list, reason: reason || 'notice' } })); return true; } catch (e) { return false; }
}

/** Whether an announcement naming `named` is about any of `mine`. ALL is about everything. */
export function changeConcerns(named, mine) {
  const a = Array.isArray(named) ? named : [];
  const b = Array.isArray(mine) ? mine : [];
  if (!a.length || !b.length) return false;
  if (a.includes(ALL)) return true;
  return a.some((s) => b.includes(s));
}

/** Calls `fn(detail)` when an announcement concerns any of `scopes`; returns the unsubscribe. */
export function onShapeChange(scopes, fn, target = win()) {
  if (!target || typeof target.addEventListener !== 'function' || typeof fn !== 'function') return () => {};
  const mine = cleanScopes(scopes).filter((s) => s !== ALL);
  const onEvt = (e) => {
    const detail = e && e.detail && typeof e.detail === 'object' ? e.detail : {};
    if (changeConcerns(detail.scopes, mine)) fn(detail);
  };
  target.addEventListener(SHAPE_CHANGE_EVENT, onEvt);
  return () => target.removeEventListener(SHAPE_CHANGE_EVENT, onEvt);
}

/**
 * A hook made with the caller's own React (each broadsheet module brings its own): a number that moves
 * on each announcement concerning `scopes`. 0 until the first one, so a read can tell its mount from a
 * change (and, on a change, read past a cache).
 */
export function changeRevHook(React) {
  return function useShapeChangeRev(scopes) {
    const [rev, setRev] = React.useState(0);
    const key = cleanScopes(scopes).filter((s) => s !== ALL).join('|');
    React.useEffect(() => onShapeChange(key ? key.split('|') : [], () => setRev((n) => n + 1)), [key]);
    return rev;
  };
}

/**
 * Whether coming back into view should read again: only after `minAwayMs` hidden. `hiddenAt` is when
 * the page went out of sight (null when it never did). Pure, for the two surfaces' visibility handlers.
 */
export function foregroundGate(hiddenAt, now, minAwayMs = FOREGROUND_MIN_AWAY_MS) {
  if (!Number.isFinite(hiddenAt) || !Number.isFinite(now)) return false;
  return now - hiddenAt >= minAwayMs;
}

/**
 * Subscribe `client` (a supabase-js client) to the notices written for `userId` and announce the
 * scopes they are about. A reconnect after the channel dropped announces ALL: rows written while it
 * was down never arrive. Returns stop(). Nothing happens without a client or an id.
 */
export function startChangeFeed({ client, userId, target = win(), delayMs, channelName } = {}) {
  if (!client || typeof client.channel !== 'function' || typeof userId !== 'string' || !userId) return () => {};
  const batcher = createChangeBatcher((scopes) => announceChange(scopes, target, scopes[0] === ALL ? 'reconnect' : 'notice'), { delayMs });
  let joinedOnce = false;
  let dropped = false;
  let channel = null;
  try {
    channel = client
      .channel(channelName || `shape-change:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => { try { const row = payload && payload.new; if (row && row.user_id === userId) batcher.push(changeScopesOf(row)); } catch (e) {} })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (joinedOnce && dropped) batcher.push(ALL);
          joinedOnce = true;
          dropped = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          dropped = true;
        }
      });
  } catch (e) { channel = null; }
  return () => {
    batcher.stop();
    if (channel) { try { client.removeChannel(channel); } catch (e) {} }
  };
}

/**
 * The website's feed: the signed-in person's notices on `w.shapeDb` (public/supabase.js), started once
 * per page and again on a sign-in or sign-out on it. Resolves the handle ({ stop }), or null when the
 * page has no account client.
 */
export function startWebsiteChangeFeed(w = win(), opts = {}) {
  if (!w) return Promise.resolve(null);
  // Once per page: a second call (another script, a remount) gets the same feed.
  if (!w.__shapeChangeFeed) w.__shapeChangeFeed = websiteFeed(w, opts);
  return w.__shapeChangeFeed;
}
async function websiteFeed(w, opts) {
  // ⚠ NOT EVERY PAGE LOADS /supabase.js (the Messages pages don't): pageShell.jsx's shapeEnsureDb loads it
  // on demand, and pageShell runs after this module, so it is waited for (a few seconds at most).
  let db = w.shapeDb;
  if (!db || !db.client) {
    const tries = Number.isFinite(opts.tries) ? opts.tries : 40;
    const everyMs = Number.isFinite(opts.everyMs) ? opts.everyMs : 250;
    for (let i = 0; i < tries && typeof w.shapeEnsureDb !== 'function' && !(w.shapeDb && w.shapeDb.client); i += 1) {
      await new Promise((r) => setTimeout(r, everyMs));
    }
    try { db = (typeof w.shapeEnsureDb === 'function' ? await w.shapeEnsureDb() : null) || w.shapeDb; } catch (e) { db = w.shapeDb; }
  }
  if (!db || !db.client || typeof db.getUser !== 'function') return null;
  let stop = () => {};
  let uid = null;
  const start = async () => {
    let u = null;
    // A session that lives only in the site's cookies leaves the client anonymous until it is bridged.
    try { if (typeof db.getSession === 'function') await db.getSession(); } catch (e) { /* read the user anyway */ }
    try { u = await db.getUser(); } catch (e) { u = null; }
    const next = u && typeof u.id === 'string' ? u.id : null;
    if (next === uid) return;
    stop();
    uid = next;
    stop = next ? startChangeFeed({ client: db.client, userId: next, target: w }) : () => {};
  };
  const handle = { stop: () => { stop(); stop = () => {}; uid = null; } };
  await start();
  try {
    db.client.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') start(); });
  } catch (e) { /* the page keeps the feed it started */ }
  return handle;
}
