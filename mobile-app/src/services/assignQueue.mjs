// Assignment write-failure classification + the offline replay queue.
//
// ⚠ THE RULE THIS MODULE EXISTS TO ENFORCE (owner ruling 2026-07-28):
//
//   A coach seeing "saved" on a week the server REJECTED is worse than the
//   ungated path. They would believe it saved AND believe it passed.
//
// So the two failure classes are not interchangeable:
//
//   * NETWORK / connectivity  -> a local record is correct. Offline assignment
//                                is a real use case; the queue replays it.
//   * SERVER REJECTION (4xx,  -> NEVER absorbed. No local record is written,
//     409, RLS denial, a          the failure is surfaced to the coach with
//     constraint violation)       whatever reason the server gave.
//
// ⚠ AND THE DEFAULT IS **REJECTED**, deliberately. The two mis-classifications
// are NOT symmetric:
//
//   a rejection read as a network blip -> a local record + a false "saved".
//                                         That is the exact harm above.
//   a network blip read as a rejection -> an honest error and a retry.
//                                         Costs the coach one tap.
//
// Only POSITIVE evidence of connectivity loss earns the local fallback. This is
// the same fail-toward-the-safe-direction reasoning as MALFORMED vs EXCLUDED in
// SPEC-guardrails.md §4.1: reserve the permissive state for the shapes that can
// only mean the permissive thing.
//
// Pure by design — no window, no navigator, no Supabase. Connectivity is passed
// IN so the decision is fixture-testable.

/** localStorage key for the replay queue. */
export const BS_ASSIGN_QUEUE_KEY = 'shape.pendingAssignments';

/**
 * Hard cap on queued assignments. A queue that grows without bound is a
 * different failure (a coach assigning into a void for weeks); the cap keeps
 * the NEWEST work, because that is the week they actually care about.
 */
export const BS_ASSIGN_QUEUE_CAP = 200;

/**
 * An assignment older than this is dropped rather than replayed. Replaying a
 * three-week-old week onto a client's calendar is not "catching up", it is
 * writing a week nobody expects — and by then the coach has long since seen it
 * fail and re-assigned.
 */
export const BS_ASSIGN_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Connectivity vocabulary across the runtimes this ships on: browser fetch
// (Chrome/Safari/Firefox wordings all differ), the Capacitor WebView, and Node.
// Matched case-insensitively against `${name} ${message}`.
const NETWORK_MESSAGE = new RegExp([
  'failed to fetch',                       // Chromium
  'networkerror',                          // Firefox
  'network request failed',                // React Native / some WebViews
  'load failed',                           // Safari / WKWebView
  'fetch failed',                          // undici / Node
  'the internet connection appears to be offline', // iOS URLSession, surfaced by WKWebView
  'err_internet_disconnected',
  'err_name_not_resolved',
  'err_network_changed',
  'econnrefused', 'econnreset', 'enotfound', 'etimedout', 'eai_again',
  'socket hang up',
].join('|'), 'i');

/**
 * Decide whether a failed write was the network or the server.
 *
 * @param {unknown} error   the error/`{error}` a write returned or threw
 * @param {{online?: boolean}} [opts]  `online:false` is definitive offline
 * @returns {'network'|'rejected'}
 */
export function bsClassifyWriteFailure(error, opts = {}) {
  // The device itself says it has no connection. Nothing else to weigh.
  if (opts && opts.online === false) return 'network';

  // No error object at all tells us nothing — and "nothing" is not evidence of
  // connectivity loss, so it takes the safe default.
  if (!error || typeof error !== 'object') return 'rejected';

  // A PostgREST/Postgres code means the DATABASE answered. Whatever it said —
  // 42501 (RLS denied), 23505 (unique violation), PGRST204 (unknown column) —
  // it is a rejection, and the coach must see it.
  const code = error.code == null ? '' : String(error.code).trim();
  if (code) return 'rejected';

  // An HTTP status means a server answered. 409 (the guardrail gate), any 4xx,
  // and 5xx alike: the request reached something that replied.
  const status = Number(error.status);
  if (Number.isFinite(status) && status > 0) return 'rejected';

  const text = `${error.name || ''} ${error.message || ''}`;
  return NETWORK_MESSAGE.test(text) ? 'network' : 'rejected';
}

/**
 * Identity of an assignment, for the pre-replay duplicate check.
 *
 * ⚠ `client_workouts` carries no natural unique key for an assignment, so a
 * replay is at-least-once by construction: an item whose insert SUCCEEDED but
 * whose response was lost stays queued and would be written twice. Skipping a
 * same-identity row is the safe direction — a coach re-assigning the identical
 * title to the identical client on the identical date is rare, while a client
 * seeing the same session twice on one day is visible and wrong.
 *
 * The real fix is a server-side idempotency key on the week-shaped boundary
 * (SPEC-guardrails.md §9.4); this is the honest interim.
 */
export function bsAssignmentKey(payload) {
  const p = payload || {};
  const at = (v) => String(v == null ? '' : v).trim().toLowerCase();
  return [at(p.clientId), at(p.scheduledDate), at(p.title)].join('|');
}

/**
 * Append an assignment to the queue.
 *
 * Same-identity entries collapse (the newest wins) so a coach who taps assign
 * three times offline queues one session, not three.
 */
export function bsQueueAssignment(items, payload, opts = {}) {
  const now = Number(opts.now) || 0;
  const key = bsAssignmentKey(payload);
  const rest = (Array.isArray(items) ? items : []).filter(
    (it) => it && bsAssignmentKey(it.payload) !== key,
  );
  const entry = { id: `q-${now}-${key}`, queuedAt: now, payload };
  return bsPruneQueue([...rest, entry], opts);
}

/**
 * Drop aged-out entries, then cap to the NEWEST `BS_ASSIGN_QUEUE_CAP`.
 * Order is preserved (oldest first) so a replay writes a week in the order the
 * coach authored it.
 */
export function bsPruneQueue(items, opts = {}) {
  const now = Number(opts.now) || 0;
  const maxAge = Number.isFinite(opts.maxAgeMs) ? Number(opts.maxAgeMs) : BS_ASSIGN_QUEUE_MAX_AGE_MS;
  const cap = Number.isFinite(opts.cap) ? Number(opts.cap) : BS_ASSIGN_QUEUE_CAP;

  const live = (Array.isArray(items) ? items : []).filter((it) => {
    if (!it || typeof it !== 'object' || !it.payload) return false;
    const at = Number(it.queuedAt);
    if (!Number.isFinite(at)) return false;
    // A future timestamp is a clock the device moved, not an expiry — keep it.
    return now - at <= maxAge;
  });

  return live.length > cap ? live.slice(live.length - cap) : live;
}

/**
 * Replay held assignments through an INJECTED writer.
 *
 * ⚠ The writer is injected precisely so a replay can never become a side door.
 * The caller hands in the one and only assignment writer, so when the
 * week-shaped boundary lands (SPEC-guardrails.md §9.4) and that writer starts
 * POSTing the gated route, queued work flows through the gate with no change
 * here. A replay that inserted directly would be exactly the client-bypass the
 * gate exists to prevent — reintroduced by the offline path.
 *
 * Outcomes, per item:
 *   already written  -> skipped (at-least-once delivery; counts as sent)
 *   written          -> sent
 *   REJECTED         -> DROPPED from the queue and reported. Retrying forever
 *                       would never succeed, and a coach believes it is pending.
 *   network failure  -> this item and every item AFTER it are held, in order,
 *                       and no further writes are attempted this pass.
 *
 * @param {Array} items
 * @param {{write:(p:any)=>Promise<any>, exists?:(p:any)=>Promise<boolean>}} effects
 * @returns {Promise<{sent:number, rejections:Array, held:Array}>}
 */
export async function bsReplayQueue(items, effects = {}) {
  const write = effects.write;
  const exists = effects.exists || (async () => false);
  const queue = Array.isArray(items) ? items : [];

  let sent = 0;
  const rejections = [];
  let held = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (!item || !item.payload) continue; // pruned shapes shouldn't reach here
    try {
      if (await exists(item.payload)) { sent += 1; continue; }
      await write(item.payload);
      sent += 1;
    } catch (err) {
      if (err && err.rejected) {
        rejections.push({
          payload: item.payload,
          reason: String((err && err.message) || 'rejected'),
          guardrail: (err && err.guardrail) || null,
        });
        continue;
      }
      // Still offline. Stop — hammering a dead connection just burns battery,
      // and order matters: the coach authored this week in sequence.
      held = queue.slice(i);
      break;
    }
  }

  return { sent, rejections, held };
}
