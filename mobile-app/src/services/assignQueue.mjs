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
 * Normalise an owner stamp. An owner is the auth user id of the COACH ACCOUNT
 * that queued the assignment — never a trainer/provider id, because offline is
 * exactly when the provider lookup is unavailable (it is a network call).
 */
function ownerOf(item) {
  const v = item && item.owner;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/**
 * Queue-level identity: the payload identity SCOPED TO ITS OWNER.
 *
 * ⚠ Owner is part of the identity on purpose. The queue is one device-wide
 * localStorage key that survives sign-out, so two coaches can hold entries in
 * it at once. Keyed on the payload alone, coach B assigning the same title to
 * the same client on the same date would silently collapse coach A's held
 * work — a dropped assignment, which is the outcome this module ranks worst.
 * `bsAssignmentKey` (the payload identity a REPLAY dedupes against) is
 * deliberately unchanged: the server row carries no owner distinction.
 */
function bsEntryKey(item) {
  return `${ownerOf(item)} ${bsAssignmentKey(item && item.payload)}`;
}

/**
 * Split a queue into the entries this account may replay and everything else.
 *
 * ⚠ THE RULE: an entry replays ONLY under the account that queued it.
 *
 * The writer resolves `trainer_id` from the CURRENT session when the payload
 * carries none (which is every assignment — the provider lookup is a network
 * call, so it is unavailable at queue time). Combined with a device-wide key
 * that `signOut()` does not clear and a drain that fires on session resolve,
 * an unscoped replay writes coach A's held week under coach B's provider the
 * moment B signs in — or, where B does not coach that client, drops it on an
 * RLS denial. Both are silent; the first is worse, because the assignment
 * lands under the wrong coach's name and looks legitimate.
 *
 * An entry with NO owner stamp is unattributable, so it goes to `others` and
 * never replays. Nothing in the wild carries one: this module has not shipped.
 *
 * `others` are left in the queue untouched — they belong to another account
 * that may sign back in — and age out through `bsPruneQueue` like anything else.
 */
export function bsPartitionByOwner(items, owner) {
  const me = typeof owner === 'string' && owner.trim() ? owner.trim() : '';
  const mine = [];
  const others = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    (me && ownerOf(it) === me ? mine : others).push(it);
  }
  return { mine, others };
}

/**
 * Append an assignment to the queue.
 *
 * Same-identity entries collapse (the newest wins) so a coach who taps assign
 * three times offline queues one session, not three — but only within ONE
 * owner, per `bsEntryKey`.
 */
export function bsQueueAssignment(items, payload, opts = {}) {
  const now = Number(opts.now) || 0;
  const owner = typeof opts.owner === 'string' && opts.owner.trim() ? opts.owner.trim() : '';
  const entry = { id: `q-${now}-${owner}-${bsAssignmentKey(payload)}`, queuedAt: now, owner, payload };
  const key = bsEntryKey(entry);
  const rest = (Array.isArray(items) ? items : []).filter((it) => it && bsEntryKey(it) !== key);
  return bsPruneQueue([...rest, entry], opts);
}

/**
 * What the queue should contain after a replay pass.
 *
 * ⚠ A DRAIN MUST MERGE, NEVER REPLACE. The pass snapshots the queue, then
 * awaits a series of network writes — and `assignClientWorkout` keeps writing
 * to the same storage throughout that window. Writing back only what the pass
 * held would erase every assignment queued meanwhile.
 *
 * That window is not narrow: assigning a week is a loop of awaited inserts, and
 * any fetch-shaped failure with no code and no status classifies as `network` —
 * which is exactly when the drain is slowest. Silently dropping an assignment
 * is the outcome this module ranks worst (see `bsAssignmentKey`), so the write
 * back is computed from live storage, not the stale snapshot.
 *
 * An arrival is anything in `current` whose identity was NOT in the snapshot.
 * An arrival matching a HELD item is dropped in favour of the held one — the
 * same-identity collapse `bsQueueAssignment` already documents. The assignment
 * is never lost; only the newer payload for that one slot.
 *
 * @param {Array} started  the queue as the pass snapshotted it
 * @param {Array} held     items the pass could not send, in authored order
 * @param {Array} current  the queue as it stands NOW
 * @returns {Array} held items first, then anything that arrived mid-pass
 */
export function bsMergeAfterDrain(started, held, current) {
  const startedKeys = new Set(
    (Array.isArray(started) ? started : []).map((it) => bsEntryKey(it)),
  );
  const arrivals = (Array.isArray(current) ? current : []).filter(
    (it) => it && !startedKeys.has(bsEntryKey(it)),
  );
  return [...(Array.isArray(held) ? held : []), ...arrivals];
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
 * `sentItems` carries the ENTRIES behind the `sent` count. A caller cannot
 * reconstruct them from the count, and the delivered set is what a post-replay
 * side effect has to act on — telling the client their week arrived, in
 * particular, which the online path promises and the held path could not keep.
 *
 * @param {Array} items
 * @param {{write:(p:any)=>Promise<any>, exists?:(p:any)=>Promise<boolean>}} effects
 * @returns {Promise<{sent:number, sentItems:Array, rejections:Array, held:Array}>}
 */
export async function bsReplayQueue(items, effects = {}) {
  const queue = Array.isArray(items) ? items : [];
  const writeFn = effects.write;
  // ⚠ A MISSING WRITER IS NOT A REJECTION. Calling a non-function throws a bare
  // TypeError, which carries no `offline` marker and so takes the classifier's
  // documented `rejected` default — permanently dropping EVERY queued
  // assignment, the outcome this module ranks worst. Nothing was attempted, so
  // holding is the only honest answer.
  if (typeof writeFn !== 'function') {
    return { sent: 0, sentItems: [], rejections: [], held: queue.filter(Boolean) };
  }
  // ⚠ AND A FAILED EXISTENCE READ IS NOT A REJECTION EITHER. `exists` is a
  // best-effort duplicate check; a throw from it must fall back to "unknown, so
  // attempt the write" — matching assignmentAlreadyWritten's own documented
  // fail-open — rather than sinking the item.
  const existsFn = typeof effects.exists === 'function' ? effects.exists : null;
  const exists = async (p) => {
    if (!existsFn) return false;
    try { return await existsFn(p); } catch (e) { return false; }
  };
  const write = writeFn;

  let sent = 0;
  const sentItems = [];
  const rejections = [];
  let held = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (!item || !item.payload) continue; // pruned shapes shouldn't reach here
    try {
      if (await exists(item.payload)) { sent += 1; sentItems.push(item); continue; }
      await write(item.payload);
      sent += 1;
      sentItems.push(item);
    } catch (err) {
      // ⚠ HOLDING REQUIRES POSITIVE EVIDENCE OF A NETWORK FAILURE, and the
      // polarity is the point. `classifyAssignError` stamps `offline` on
      // exactly the errors it classified as `network`; anything else — an
      // unclassified throw, a validation guard, a bug in the writer — takes
      // the classifier's own documented default of `rejected`.
      //
      // Branching on `!err.rejected` instead (the obvious way round) makes the
      // UNSAFE outcome the default for every error that never passed through
      // the classifier. A DETERMINISTIC unclassified throw is the bad case: it
      // is held, retried forever, and because a hold stops the pass, ONE
      // poison item at the head blocks every assignment queued behind it,
      // permanently. Requiring the positive marker makes such an item drop
      // loudly on the first replay instead.
      if (!(err && err.offline === true)) {
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

  return { sent, sentItems, rejections, held };
}
