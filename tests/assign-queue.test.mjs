// Assignment write-failure classification + the key-based replay queue.
//
// The classifier vectors are PORTED VERBATIM from the parked offline-queue
// branch (docs/OFFLINE-ASSIGN-QUEUE-PARKED.md) — that module's one genuinely
// key-independent invariant, and the thing three rounds of review got right.
// Everything that existed to APPROXIMATE the server's answer went with its
// code; these are the vectors that outlived it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_ASSIGN_QUEUE_CAP, BS_ASSIGN_QUEUE_MAX_AGE_MS,
  bsClassifyWriteFailure, bsQueueAssignment, bsPruneQueue, bsReplayQueue, bsMergeAfterDrain,
} from '../mobile-app/src/services/assignQueue.mjs';

const NOW = 1753142400000; // fixed epoch — injected clock, never Date.now()
const DAY = 24 * 3600 * 1000;

const payload = (over = {}) => ({
  clientId: 'c-1', weekStartISO: '2026-08-03',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  sessions: [{ title: 'Upper', scheduledDate: '2026-08-03' }], ...over,
});
const entry = (over = {}, at = NOW) => ({ payload: payload(over), queuedAt: at });

// ─── The classifier ─────────────────────────────────────────────────────────
// The whole point is the ASYMMETRY: 'rejected' is the safe default, and only
// positive evidence of connectivity loss returns 'network'.

test('bsClassifyWriteFailure: a server that ANSWERED is always a rejection', () => {
  // The gate's 409 — the case this rule was written for.
  assert.equal(bsClassifyWriteFailure({ status: 409, message: 'guardrail red' }), 'rejected');
  // Any other 4xx.
  assert.equal(bsClassifyWriteFailure({ status: 400 }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ status: 403 }), 'rejected');
  // RLS denial + a constraint violation — the DATABASE spoke.
  assert.equal(bsClassifyWriteFailure({ code: '42501', message: 'permission denied' }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ code: '23505' }), 'rejected');
  // PostgREST's own codes (e.g. a column that doesn't exist yet).
  assert.equal(bsClassifyWriteFailure({ code: 'PGRST204' }), 'rejected');
  // A 5xx reached a server too. Surfacing it costs a retry; absorbing it lies.
  assert.equal(bsClassifyWriteFailure({ status: 503, message: 'service unavailable' }), 'rejected');
});

test('bsClassifyWriteFailure: a code WINS over network-sounding prose', () => {
  // A rejection whose message happens to contain "fetch" must not be laundered
  // into a local record by the message regex.
  assert.equal(
    bsClassifyWriteFailure({ code: '42501', message: 'failed to fetch policy for relation' }),
    'rejected',
  );
  assert.equal(bsClassifyWriteFailure({ status: 409, message: 'network unavailable' }), 'rejected');
});

test('bsClassifyWriteFailure: real connectivity failures, every runtime wording', () => {
  const online = { online: true }; // even claiming online, the message decides
  for (const message of [
    'Failed to fetch',                                  // Chromium
    'NetworkError when attempting to fetch resource.',  // Firefox
    'Load failed',                                      // Safari / WKWebView
    'Network request failed',                           // Capacitor WebView
    'fetch failed',                                     // undici / Node
    'The Internet connection appears to be offline.',   // iOS URLSession
    'net::ERR_INTERNET_DISCONNECTED',
    'connect ECONNREFUSED 127.0.0.1:443',
    'getaddrinfo ENOTFOUND db.example.invalid',
  ]) {
    assert.equal(bsClassifyWriteFailure({ message }, online), 'network', message);
  }
  // TypeError is how a browser surfaces a dead fetch — name is read too.
  assert.equal(bsClassifyWriteFailure({ name: 'TypeError', message: 'Failed to fetch' }), 'network');
});

test('bsClassifyWriteFailure: navigator.onLine is the LAST word, not the first', () => {
  // ⚠ AMENDED 2026-07-28. This test previously asserted the opposite — that
  // `online:false` was "definitive" because such an error "cannot have reached
  // a server". That premise is false: `navigator.onLine` reports adapter link
  // state AT THE MOMENT WE ASK, not reachability at the moment the request went
  // out. The realistic sequence is mundane — request goes out online, server
  // replies 409, device drops its connection before the promise settles — and
  // the old ordering filed the guardrail's OWN rejection as a network blip,
  // writing a local record and telling the coach "held, you're offline" about
  // a week the gate refused. Exactly the asymmetry this module exists to stop.
  //
  // A PostgREST code or an HTTP status is PROOF a server answered; no link
  // state can retract it.
  assert.equal(bsClassifyWriteFailure({ code: '42501' }, { online: false }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ status: 409 }, { online: false }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ code: '23505' }, { online: false }), 'rejected');

  // With NOTHING answering, the device's own claim IS the best evidence there
  // is — so it still decides, it just no longer pre-empts the evidence.
  assert.equal(bsClassifyWriteFailure(null, { online: false }), 'network');
  assert.equal(bsClassifyWriteFailure({ message: 'something went wrong' }, { online: false }), 'network');
});

test('bsClassifyWriteFailure: an unreadable error takes the SAFE default', () => {
  // No evidence of connectivity loss => rejected. Absence is not evidence.
  assert.equal(bsClassifyWriteFailure(null), 'rejected');
  assert.equal(bsClassifyWriteFailure(undefined), 'rejected');
  assert.equal(bsClassifyWriteFailure('boom'), 'rejected');
  assert.equal(bsClassifyWriteFailure({}), 'rejected');
  assert.equal(bsClassifyWriteFailure({ message: 'something went wrong' }), 'rejected');
  // An abort is us cancelling, not the network dropping — surface it.
  assert.equal(bsClassifyWriteFailure({ name: 'AbortError', message: 'aborted' }), 'rejected');
  // A code of '' (supabase-js fills this on some paths) is not a code.
  assert.equal(bsClassifyWriteFailure({ code: '', message: 'Failed to fetch' }), 'network');
  assert.equal(bsClassifyWriteFailure({ code: '  ', message: 'weird' }), 'rejected');
});

// ─── The queue, rebuilt on the idempotency key ──────────────────────────────
// Identity is now the SERVER's key, not a heuristic. These pin what that buys.

test('queue: identity is the idempotency key', () => {
  const q = bsQueueAssignment([], payload(), { now: NOW });
  assert.equal(q.length, 1);
  assert.equal(q[0].payload.idempotencyKey, '22222222-2222-4222-8222-222222222222');
});

test('queue: re-queuing the SAME key REPLACES rather than appends', () => {
  // A coach who edited a held week and re-tapped assign means the new content.
  // Two entries under one key would send the second as a key_reused conflict.
  const first = bsQueueAssignment([], payload({ weekStartISO: '2026-08-03' }), { now: NOW });
  const second = bsQueueAssignment(first, payload({ weekStartISO: '2026-08-10' }), { now: NOW + 60 });
  assert.equal(second.length, 1);
  assert.equal(second[0].payload.weekStartISO, '2026-08-10');
});

test('queue: a DIFFERENT key is a separate week', () => {
  const a = bsQueueAssignment([], payload(), { now: NOW });
  const b = bsQueueAssignment(a, payload({ idempotencyKey: '33333333-3333-4333-8333-333333333333' }), { now: NOW });
  assert.equal(b.length, 2);
});

test('queue: a payload with NO key is refused — it could never be replayed safely', () => {
  const { idempotencyKey, ...noKey } = payload();
  assert.deepEqual(bsQueueAssignment([], noKey, { now: NOW }), []);
});

// ─── Pruning REPORTS what it drops ──────────────────────────────────────────

test('prune: aged-out entries are dropped AND reported', () => {
  const old = entry({}, NOW - 15 * DAY);
  const fresh = entry({ idempotencyKey: '44444444-4444-4444-8444-444444444444' }, NOW - DAY);
  const { kept, dropped } = bsPruneQueue([old, fresh], { now: NOW });
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].why, 'aged');
});

test('prune: a cap eviction is REPORTED, never silent', () => {
  // The parked branch's third open finding: at the cap each new assignment
  // silently discarded the oldest while the writer still answered "held", so a
  // coach was told work was queued that no longer existed.
  // ⚠ BUILT IN PRODUCTION ORDER — OLDEST FIRST. `bsQueueAssignment` APPENDS, so
  // index 0 is the entry that has waited longest, and `bsPruneQueue` evicts by
  // POSITION. A fixture built newest-first would exercise the eviction backwards
  // and still pass every count.
  const many = Array.from({ length: BS_ASSIGN_QUEUE_CAP + 3 }, (_, i) =>
    entry({ idempotencyKey: `k${i}` }, NOW - (BS_ASSIGN_QUEUE_CAP + 3 - i) * 1000));
  const { kept, dropped } = bsPruneQueue(many, { now: NOW });
  assert.equal(kept.length, BS_ASSIGN_QUEUE_CAP);
  assert.equal(dropped.length, 3);
  assert.ok(dropped.every((d) => d.why === 'evicted'));
  // ⚠ WHICH entries go, not just how many. Counting alone passes identically
  // whether the oldest three or the NEWEST three are discarded — and discarding
  // the newest would throw away the assignment the coach just made while the
  // writer still answered "held". The three longest-waiting go; everything the
  // coach wrote most recently survives.
  const keyOf = (e) => e.payload.idempotencyKey;
  assert.deepEqual(dropped.map(keyOf), ['k0', 'k1', 'k2']);
  assert.deepEqual(kept.map(keyOf), Array.from({ length: BS_ASSIGN_QUEUE_CAP }, (_, i) => `k${i + 3}`));
});

test('prune: a FUTURE timestamp is a moved clock, not an expiry', () => {
  const { kept, dropped } = bsPruneQueue([entry({}, NOW + 5 * DAY)], { now: NOW });
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test('prune: unreadable entries are discarded without being reported as lost work', () => {
  const { kept, dropped } = bsPruneQueue([null, 42, {}, { payload: null }, entry()], { now: NOW });
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test('prune: the max age is 14 days', () => {
  assert.equal(BS_ASSIGN_QUEUE_MAX_AGE_MS, 14 * DAY);
});

// ─── Replay ─────────────────────────────────────────────────────────────────

test('replay: already_delivered counts as SENT, not as a failure', () => {
  // The server distinguishes accepted from already_delivered; both mean the
  // week is on the client's calendar. Reporting a replay as a failure would
  // have the coach send it a third time.
  return bsReplayQueue([entry()], { write: async () => ({ status: 'already_delivered' }) })
    .then((r) => {
      assert.equal(r.sent, 1);
      assert.equal(r.sentItems[0].replayed, true);
      assert.equal(r.held.length, 0);
      assert.equal(r.rejections.length, 0);
    });
});

test('replay: a REJECTION is dropped and reported, never retried into a void', async () => {
  const r = await bsReplayQueue([entry()], {
    write: async () => ({ rejected: true, reason: 'red_unacknowledged', copy: { chip: 'RED' } }),
  });
  assert.equal(r.sent, 0);
  assert.equal(r.held.length, 0, 'a rejected week must NOT stay queued');
  assert.equal(r.rejections.length, 1);
  assert.equal(r.rejections[0].reason, 'red_unacknowledged');
  assert.equal(r.rejections[0].copy.chip, 'RED');
});

test('replay: a NETWORK failure holds this item and every item AFTER it, in order', async () => {
  const a = entry({ idempotencyKey: 'ka' });
  const b = entry({ idempotencyKey: 'kb' });
  const c = entry({ idempotencyKey: 'kc' });
  let n = 0;
  const r = await bsReplayQueue([a, b, c], {
    write: async () => { n += 1; if (n === 2) throw Object.assign(new Error('Failed to fetch'), {}); return { status: 'accepted' }; },
  });
  assert.equal(r.sent, 1);
  assert.equal(r.held.length, 2, 'the failing item and the one after it are held');
  assert.equal(r.held[0].payload.idempotencyKey, 'kb');
  assert.equal(r.held[1].payload.idempotencyKey, 'kc');
  assert.equal(n, 2, 'no further writes are attempted after a connectivity failure');
});

test('replay: a SERVER error mid-queue drops that item and keeps going', async () => {
  let n = 0;
  const r = await bsReplayQueue([entry({ idempotencyKey: 'ka' }), entry({ idempotencyKey: 'kb' })], {
    write: async () => { n += 1; if (n === 1) throw Object.assign(new Error('nope'), { status: 409 }); return { status: 'accepted' }; },
  });
  assert.equal(r.rejections.length, 1);
  assert.equal(r.sent, 1);
  assert.equal(r.held.length, 0);
});

test('replay: with no writer, everything is held rather than silently lost', async () => {
  const r = await bsReplayQueue([entry()], {});
  assert.equal(r.held.length, 1);
  assert.equal(r.sent, 0);
});

// ─── Merge ──────────────────────────────────────────────────────────────────

test('merge: items that arrived MID-PASS survive, held items lead', () => {
  const started = [entry({ idempotencyKey: 'ka' })];
  const held = [entry({ idempotencyKey: 'ka' })];
  const arrived = entry({ idempotencyKey: 'kz' });
  const merged = bsMergeAfterDrain(started, held, [...started, arrived]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].payload.idempotencyKey, 'ka');
  assert.equal(merged[1].payload.idempotencyKey, 'kz');
});

test('merge: a fully-drained pass leaves only the arrivals', () => {
  const started = [entry({ idempotencyKey: 'ka' })];
  const arrived = entry({ idempotencyKey: 'kz' });
  const merged = bsMergeAfterDrain(started, [], [...started, arrived]);
  assert.deepEqual(merged.map((m) => m.payload.idempotencyKey), ['kz']);
});
