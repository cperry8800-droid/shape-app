import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_ASSIGN_QUEUE_CAP, BS_ASSIGN_QUEUE_MAX_AGE_MS,
  bsClassifyWriteFailure, bsAssignmentKey, bsQueueAssignment, bsPruneQueue, bsReplayQueue,
} from '../mobile-app/src/services/assignQueue.mjs';

const NOW = 1753142400000; // fixed epoch — injected clock, never Date.now()
const DAY = 24 * 3600 * 1000;

const payload = (over = {}) => ({
  clientId: 'c-1', title: 'Upper Pull', scheduledDate: '2026-08-03', ...over,
});

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
    'getaddrinfo ENOTFOUND zznufekgjngecelwxndw.supabase.co',
  ]) {
    assert.equal(bsClassifyWriteFailure({ message }, online), 'network', message);
  }
  // TypeError is how a browser surfaces a dead fetch — name is read too.
  assert.equal(bsClassifyWriteFailure({ name: 'TypeError', message: 'Failed to fetch' }), 'network');
});

test('bsClassifyWriteFailure: navigator.onLine === false is definitive', () => {
  // The device says there is no connection. Even a rejection-shaped error is a
  // network failure — it cannot have reached a server.
  assert.equal(bsClassifyWriteFailure({ code: '42501' }, { online: false }), 'network');
  assert.equal(bsClassifyWriteFailure(null, { online: false }), 'network');
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

// ─── Queue identity + dedupe ────────────────────────────────────────────────

test('bsAssignmentKey: identity is client + date + title, normalised', () => {
  assert.equal(bsAssignmentKey(payload()), bsAssignmentKey(payload({ title: '  upper pull ' })));
  assert.notEqual(bsAssignmentKey(payload()), bsAssignmentKey(payload({ scheduledDate: '2026-08-04' })));
  assert.notEqual(bsAssignmentKey(payload()), bsAssignmentKey(payload({ clientId: 'c-2' })));
  // Never throws on junk — the queue is read from localStorage.
  assert.equal(typeof bsAssignmentKey(null), 'string');
  assert.equal(typeof bsAssignmentKey({}), 'string');
});

test('bsQueueAssignment: a re-tap offline queues ONE session, not three', () => {
  let q = [];
  q = bsQueueAssignment(q, payload(), { now: NOW });
  q = bsQueueAssignment(q, payload(), { now: NOW + 1000 });
  q = bsQueueAssignment(q, payload(), { now: NOW + 2000 });
  assert.equal(q.length, 1);
  assert.equal(q[0].queuedAt, NOW + 2000, 'the newest wins');

  // A genuinely different session is its own entry.
  q = bsQueueAssignment(q, payload({ scheduledDate: '2026-08-04' }), { now: NOW + 3000 });
  assert.equal(q.length, 2);
});

test('bsQueueAssignment: order is preserved so a week replays as authored', () => {
  let q = [];
  for (const d of ['2026-08-03', '2026-08-05', '2026-08-07']) {
    q = bsQueueAssignment(q, payload({ scheduledDate: d }), { now: NOW });
  }
  assert.deepEqual(q.map((it) => it.payload.scheduledDate), ['2026-08-03', '2026-08-05', '2026-08-07']);
});

// ─── Pruning ────────────────────────────────────────────────────────────────

test('bsPruneQueue: aged-out entries are DROPPED, not replayed', () => {
  const stale = { id: 'a', queuedAt: NOW - BS_ASSIGN_QUEUE_MAX_AGE_MS - 1, payload: payload() };
  const fresh = { id: 'b', queuedAt: NOW - DAY, payload: payload({ scheduledDate: '2026-08-04' }) };
  const kept = bsPruneQueue([stale, fresh], { now: NOW });
  assert.deepEqual(kept.map((it) => it.id), ['b']);

  // Exactly at the boundary is still live (<=, not <).
  const edge = { id: 'c', queuedAt: NOW - BS_ASSIGN_QUEUE_MAX_AGE_MS, payload: payload() };
  assert.equal(bsPruneQueue([edge], { now: NOW }).length, 1);
});

test('bsPruneQueue: the cap keeps the NEWEST work', () => {
  const items = Array.from({ length: BS_ASSIGN_QUEUE_CAP + 5 }, (_, i) => ({
    id: `q${i}`, queuedAt: NOW - (BS_ASSIGN_QUEUE_CAP + 5 - i) * 1000, payload: payload(),
  }));
  const kept = bsPruneQueue(items, { now: NOW });
  assert.equal(kept.length, BS_ASSIGN_QUEUE_CAP);
  assert.equal(kept[kept.length - 1].id, `q${BS_ASSIGN_QUEUE_CAP + 4}`, 'newest survives');
  assert.equal(kept[0].id, 'q5', 'oldest 5 dropped');
});

test('bsPruneQueue: junk from localStorage is discarded, never thrown on', () => {
  const good = { id: 'ok', queuedAt: NOW, payload: payload() };
  const kept = bsPruneQueue(
    [null, 'nope', 42, {}, { queuedAt: NOW }, { payload: payload() }, { queuedAt: 'x', payload: payload() }, good],
    { now: NOW },
  );
  assert.deepEqual(kept.map((it) => it.id), ['ok']);
  assert.deepEqual(bsPruneQueue(null, { now: NOW }), []);
  assert.deepEqual(bsPruneQueue(undefined, { now: NOW }), []);
});

// ─── Replay ─────────────────────────────────────────────────────────────────
// The owner's three fixtures for the fallback fix, exercised against the real
// replay loop with the writer injected.

/**
 * Build the error the writer actually throws, ROUTED THROUGH the real
 * classifier — so these fixtures cannot pass on a hand-set flag the production
 * path would never have set.
 */
const thrown = (raw) => {
  const err = new Error(raw.message || 'write failed');
  if (bsClassifyWriteFailure(raw, { online: true }) === 'rejected') err.rejected = true;
  if (raw.guardrail) err.guardrail = raw.guardrail;
  return err;
};

const queued = (dates) => dates.map((d, i) => ({
  id: `q${i}`, queuedAt: NOW, payload: payload({ scheduledDate: d }),
}));

test('replay fixture 1: a 409 SURFACES and leaves NO local record', async () => {
  const seen = [];
  const res = await bsReplayQueue(queued(['2026-08-03']), {
    write: async (p) => { seen.push(p); throw thrown({ status: 409, message: 'guardrail red — not acknowledged', guardrail: { flag: 'red' } }); },
  });
  // Nothing is held: a rejected assignment is not kept pretending to be pending.
  assert.deepEqual(res.held, []);
  assert.equal(res.sent, 0);
  // ...and it is REPORTED, carrying the gate's own reason.
  assert.equal(res.rejections.length, 1);
  assert.match(res.rejections[0].reason, /guardrail red/);
  assert.deepEqual(res.rejections[0].guardrail, { flag: 'red' });
  assert.equal(seen.length, 1, 'attempted exactly once — a rejection is not retried');
});

test('replay fixture 2: a network failure still falls back locally', async () => {
  const res = await bsReplayQueue(queued(['2026-08-03', '2026-08-04']), {
    write: async () => { throw thrown({ message: 'Failed to fetch' }); },
  });
  assert.equal(res.sent, 0);
  assert.equal(res.rejections.length, 0, 'a network failure is never reported as a rejection');
  assert.equal(res.held.length, 2, 'both stay queued for the next reconnect');
});

test('replay fixture 3: a queued session syncs THROUGH the writer, never around it', async () => {
  // The injected writer IS the gate. Every replayed item must pass through it —
  // if a replay ever inserted directly it would be the client-bypass the gate
  // exists to prevent, reintroduced by the offline path.
  const throughWriter = [];
  const res = await bsReplayQueue(queued(['2026-08-03', '2026-08-05']), {
    write: async (p) => { throughWriter.push(p.scheduledDate); },
  });
  assert.equal(res.sent, 2);
  assert.deepEqual(res.held, []);
  assert.deepEqual(throughWriter, ['2026-08-03', '2026-08-05'], 'every item, in authored order');
});

test('replay: a network failure HOLDS the rest in order and stops trying', async () => {
  const attempted = [];
  const res = await bsReplayQueue(queued(['2026-08-03', '2026-08-04', '2026-08-05']), {
    write: async (p) => {
      attempted.push(p.scheduledDate);
      if (p.scheduledDate === '2026-08-04') throw thrown({ message: 'Load failed' });
    },
  });
  assert.equal(res.sent, 1);
  assert.deepEqual(attempted, ['2026-08-03', '2026-08-04'], 'stops at the drop — no hammering');
  assert.deepEqual(res.held.map((it) => it.payload.scheduledDate), ['2026-08-04', '2026-08-05']);
});

test('replay: a rejection is dropped but the REST of the week still goes', async () => {
  const res = await bsReplayQueue(queued(['2026-08-03', '2026-08-04', '2026-08-05']), {
    write: async (p) => {
      if (p.scheduledDate === '2026-08-04') throw thrown({ code: '42501', message: 'permission denied' });
    },
  });
  assert.equal(res.sent, 2, 'the two writable sessions land');
  assert.equal(res.rejections.length, 1);
  assert.deepEqual(res.held, [], 'the rejected one is not left pretending to be pending');
});

test('replay: an already-written session is SKIPPED, not duplicated', async () => {
  const written = [];
  const res = await bsReplayQueue(queued(['2026-08-03', '2026-08-04']), {
    exists: async (p) => p.scheduledDate === '2026-08-03',
    write: async (p) => { written.push(p.scheduledDate); },
  });
  assert.equal(res.sent, 2, 'the skipped one still counts as delivered');
  assert.deepEqual(written, ['2026-08-04'], 'the existing row is not written twice');
});

test('replay: an empty or junk queue is a no-op', async () => {
  let calls = 0;
  const write = async () => { calls += 1; };
  assert.deepEqual(await bsReplayQueue([], { write }), { sent: 0, rejections: [], held: [] });
  assert.deepEqual(await bsReplayQueue(null, { write }), { sent: 0, rejections: [], held: [] });
  await bsReplayQueue([null, {}, { payload: null }], { write });
  assert.equal(calls, 0);
});

test('bsPruneQueue: a device clock that jumped FORWARD does not expire the queue', () => {
  // now - queuedAt is negative; that is a clock change, not an age.
  const future = { id: 'f', queuedAt: NOW + 5 * DAY, payload: payload() };
  assert.equal(bsPruneQueue([future], { now: NOW }).length, 1);
});
