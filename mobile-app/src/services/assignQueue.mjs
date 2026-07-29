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
 * Transport failures Node/undici report on `error.code` rather than in the
 * message. In the WebView these never appear — but the blanket
 * "any code means the server answered" rule below is wrong for them, and a
 * misfiled connectivity failure is the harmful direction.
 */
const NETWORK_CODE = /^(econnrefused|econnreset|enotfound|etimedout|eai_again|econnaborted|epipe|ehostunreach|enetunreach|und_err_(connect_timeout|socket|headers_timeout))$/i;

/**
 * Decide whether a failed write was the network or the server.
 *
 * @param {unknown} error   the error/`{error}` a write returned or threw
 * @param {{online?: boolean}} [opts]  `online:false` is definitive offline
 * @returns {'network'|'rejected'}
 */
export function bsClassifyWriteFailure(error, opts = {}) {
  // No error object at all tells us nothing — and "nothing" is not evidence of
  // connectivity loss, so it takes the safe default.
  if (!error || typeof error !== 'object') {
    return opts && opts.online === false ? 'network' : 'rejected';
  }

  // ⚠ EVIDENCE THE SERVER ANSWERED OUTRANKS `navigator.onLine`, and the order
  // here is the whole point. `online` is a notoriously unreliable signal — it
  // reports adapter link state, not reachability, so captive portals, VPN
  // transitions and OS network switches all produce false negatives. A
  // PostgREST code or an HTTP status is PROOF a server replied, and no link
  // state can retract that.
  //
  // The sequence this protects against is mundane, not exotic: the request
  // goes out online, the server replies 409, and the device drops its
  // connection before the promise settles. Checking `online` first would file
  // the guardrail's own rejection as a network blip — writing a local record
  // and telling the coach "HELD, you're offline" about a week the gate
  // refused. That is the exact asymmetry this module exists to prevent.

  // A PostgREST/Postgres code means the DATABASE answered. Whatever it said —
  // 42501 (RLS denied), 23505 (unique violation), PGRST204 (unknown column) —
  // it is a rejection, and the coach must see it.
  //
  // Except when the "code" is a TRANSPORT code: Node/undici report
  // ECONNREFUSED and friends on `error.code`, where a blanket rejection would
  // misfile a genuine connectivity failure. Those are matched first.
  const code = error.code == null ? '' : String(error.code).trim();
  if (code) return NETWORK_CODE.test(code) ? 'network' : 'rejected';

  // An HTTP status means a server answered. 409 (the guardrail gate), any 4xx,
  // and 5xx alike: the request reached something that replied.
  const status = Number(error.status);
  if (Number.isFinite(status) && status > 0) return 'rejected';

  // Nothing answered. NOW the device's own claim is the best evidence there is.
  if (opts && opts.online === false) return 'network';

  const text = `${error.name || ''} ${error.message || ''}`;
  return NETWORK_MESSAGE.test(text) ? 'network' : 'rejected';
}

/**
 * ⚠ WHAT IS **NOT** HERE, AND WHY (docs/OFFLINE-ASSIGN-QUEUE-PARKED.md).
 *
 * An earlier cut of this module carried an identity heuristic
 * (`bsAssignmentKey`), a client-side existence probe against `client_workouts`,
 * per-screen memory of what had been sent, and client-side owner partitioning.
 * Every one of those existed to APPROXIMATE an answer to a single question:
 *
 *     "has this week already been delivered?"
 *
 * `client_workouts` had no unique key to ask it against, so the question had
 * three answers — the screen's memory, the device queue, and the server — and
 * nothing reconciled them. Three rounds of review each found the same shape of
 * bug: one pair reconciled, the third drifting.
 *
 * The week-shaped boundary answers it authoritatively. The idempotency key is
 * minted at AUTHORING time and carried in the payload, so a replay of the same
 * week returns `already_delivered` from the server rather than a second set of
 * rows. All of that bookkeeping is therefore DELETED rather than layered on
 * top — keeping it would mean two systems answering one question again.
 *
 * Owner scoping is likewise the SERVER's job now (§9.4 requirement 4): a
 * payload replayed under a different signed-in account is rejected by
 * `publish_client_week`, not filtered here.
 */

/**
 * A queue entry's identity is now simply its idempotency key. No heuristic, no
 * content hash — the same value the server dedupes on.
 */
const entryKey = (it) => (it && it.payload && it.payload.idempotencyKey) || '';

/**
 * Queue a week for replay.
 *
 * Re-queuing the SAME key replaces the held entry rather than appending: a
 * coach who edited a held week and re-tapped assign means the new content, and
 * two entries under one key would send the second as a `key_reused` conflict.
 */
export function bsQueueAssignment(items, payload, opts = {}) {
  const now = Number(opts.now) || 0;
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const key = (payload && payload.idempotencyKey) || '';
  if (!key) return list;
  const without = list.filter((it) => entryKey(it) !== key);
  return [...without, { payload, queuedAt: now }];
}

/**
 * Merge a drain pass back into the live queue.
 *
 * Items that arrived MID-PASS were never attempted and must survive; held items
 * keep their authored order and lead, so a replay writes a coach's weeks in the
 * order they wrote them.
 */
export function bsMergeAfterDrain(started, held, current) {
  const startedKeys = new Set((Array.isArray(started) ? started : []).map(entryKey));
  const arrivals = (Array.isArray(current) ? current : []).filter(
    (it) => it && !startedKeys.has(entryKey(it)),
  );
  return [...(Array.isArray(held) ? held : []), ...arrivals];
}

/**
 * Drop aged-out entries, then cap to the NEWEST `BS_ASSIGN_QUEUE_CAP`.
 *
 * ⚠ IT REPORTS WHAT IT DROPPED. The parked branch's third open finding was a
 * SILENT cap eviction: at the cap each new offline assignment quietly discarded
 * the oldest while the writer still answered "held", so a coach was told work
 * was queued that no longer existed. A prune that drops work a human is waiting
 * on has to say so — the caller surfaces it.
 *
 * @returns {{kept:Array, dropped:Array<{payload:any, queuedAt:number, why:'aged'|'evicted'}>}}
 */
export function bsPruneQueue(items, opts = {}) {
  const now = Number(opts.now) || 0;
  const maxAge = Number.isFinite(opts.maxAgeMs) ? Number(opts.maxAgeMs) : BS_ASSIGN_QUEUE_MAX_AGE_MS;
  const cap = Number.isFinite(opts.cap) ? Number(opts.cap) : BS_ASSIGN_QUEUE_CAP;

  const dropped = [];
  const live = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== 'object' || !it.payload) continue;   // unreadable, not "work"
    const at = Number(it.queuedAt);
    if (!Number.isFinite(at)) continue;
    // A FUTURE timestamp is a clock the device moved, not an expiry — keep it.
    if (now - at > maxAge) { dropped.push({ ...it, why: 'aged' }); continue; }
    live.push(it);
  }
  if (live.length > cap) {
    const cut = live.length - cap;
    for (let i = 0; i < cut; i += 1) dropped.push({ ...live[i], why: 'evicted' });
    return { kept: live.slice(cut), dropped };
  }
  return { kept: live, dropped };
}

/**
 * Replay held weeks through an INJECTED writer.
 *
 * ⚠ The writer is injected precisely so a replay can never become a side door.
 * The caller hands in the one and only assignment writer — which now POSTs the
 * gated week-shaped route — so queued work flows through the guardrail with no
 * change here. A replay that inserted directly would reintroduce exactly the
 * client-bypass the boundary exists to prevent.
 *
 * Outcomes, per item:
 *   accepted / already_delivered -> sent (the server distinguishes them; both
 *                                  mean the week is on the client's calendar)
 *   REJECTED (4xx, 409, RLS)     -> DROPPED and reported. Retrying forever
 *                                  never succeeds and a coach believes it is
 *                                  pending.
 *   network failure              -> this item and every item AFTER it are held,
 *                                  in order, and no further writes are tried.
 *
 * `sentItems` carries the ENTRIES behind the count: a caller cannot rebuild
 * them from a number, and the delivered set is what a post-replay side effect
 * has to act on — telling the client their week arrived, in particular.
 */
export async function bsReplayQueue(items, effects = {}) {
  const queue = Array.isArray(items) ? items : [];
  const writeFn = effects.write;
  const isOnline = effects.online;
  const out = { sent: 0, sentItems: [], rejections: [], held: [] };
  if (typeof writeFn !== 'function') return { ...out, held: queue };

  for (let i = 0; i < queue.length; i += 1) {
    const it = queue[i];
    if (!it || !it.payload) continue;
    try {
      const res = await writeFn(it.payload);
      // The server's own word. `already_delivered` is a SUCCESS — the week is
      // there; reporting it as a failure would have the coach re-send it.
      if (res && res.rejected) {
        out.rejections.push({ ...it, reason: res.reason || null, copy: res.copy || null });
        continue;
      }
      out.sent += 1;
      out.sentItems.push({ ...it, replayed: res && res.status === 'already_delivered' });
    } catch (err) {
      if (bsClassifyWriteFailure(err, { online: typeof isOnline === 'boolean' ? isOnline : undefined }) === 'network') {
        // Hold THIS item and everything after it, in order. Continuing past a
        // connectivity failure would write a coach's weeks out of sequence.
        out.held = queue.slice(i);
        return out;
      }
      // Anything the server answered is a rejection — dropped, surfaced, never
      // retried into a void.
      out.rejections.push({ ...it, reason: (err && err.reason) || (err && err.message) || null, copy: (err && err.copy) || null });
    }
  }
  return out;
}
