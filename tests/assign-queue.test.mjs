import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BS_ASSIGN_QUEUE_CAP, BS_ASSIGN_QUEUE_MAX_AGE_MS,
  bsClassifyWriteFailure, bsAssignmentKey, bsQueueAssignment, bsPruneQueue, bsReplayQueue,
  bsMergeAfterDrain, bsPartitionByOwner,
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
// Mirrors shapeBackend's `classifyAssignError` — the ONE real producer of the
// errors the replay loop reads. It stamps `rejected` on rejections and
// `offline` on network failures, and the loop now requires that POSITIVE
// `offline` marker to hold an item. A helper that only stamped `rejected`
// would let a hold-on-anything-unmarked regression pass unnoticed.
const thrown = (raw) => {
  const err = new Error(raw.message || 'write failed');
  if (bsClassifyWriteFailure(raw, { online: true }) === 'rejected') err.rejected = true;
  else err.offline = true;
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
  assert.deepEqual(await bsReplayQueue([], { write }), { sent: 0, sentItems: [], rejections: [], held: [] });
  assert.deepEqual(await bsReplayQueue(null, { write }), { sent: 0, sentItems: [], rejections: [], held: [] });
  await bsReplayQueue([null, {}, { payload: null }], { write });
  assert.equal(calls, 0);
});

test('bsPruneQueue: a device clock that jumped FORWARD does not expire the queue', () => {
  // now - queuedAt is negative; that is a clock change, not an age.
  const future = { id: 'f', queuedAt: NOW + 5 * DAY, payload: payload() };
  assert.equal(bsPruneQueue([future], { now: NOW }).length, 1);
});

// ─── Round-2 regressions (CodeRabbit, 2026-07-28) ───────────────────────────

test('classifier: a TRANSPORT code is a network failure, not a server answer', () => {
  // Node/undici report these on `error.code`, where the blanket
  // "any code means the server answered" rule misfiled them as rejections.
  for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET']) {
    assert.equal(bsClassifyWriteFailure({ code, message: 'fetch failed' }), 'network', code);
  }
  // A Postgres SQLSTATE still reads as the server answering.
  assert.equal(bsClassifyWriteFailure({ code: '42501' }), 'rejected');
});

test('replay: an UNCLASSIFIED throw is dropped and reported, never held forever', async () => {
  // A deterministic unclassified throw held at the head of the queue blocks
  // every assignment behind it, permanently — the replay stops on a hold.
  const poison = new Error('Client and workout title are required.');  // no .offline
  const items = [
    { id: 'a', queuedAt: 1, payload: { clientId: '', title: '' } },
    { id: 'b', queuedAt: 2, payload: { clientId: 'c1', scheduledDate: '2026-08-03', title: 'Real week' } },
  ];
  const written = [];
  const res = await bsReplayQueue(items, {
    write: async (p) => { if (!p.title) throw poison; written.push(p.title); },
  });
  assert.equal(res.held.length, 0, 'a poison item must not wedge the queue');
  assert.equal(res.rejections.length, 1);
  assert.deepEqual(written, ['Real week'], 'the valid item behind it still goes');
  assert.equal(res.sent, 1);
});

test('replay: a genuine network failure still holds, in order', async () => {
  // The polarity flip must not cost the behaviour the queue exists for.
  const offline = new Error('Load failed');
  offline.offline = true;
  const items = [
    { id: 'a', queuedAt: 1, payload: { clientId: 'c1', scheduledDate: '2026-08-03', title: 'Mon' } },
    { id: 'b', queuedAt: 2, payload: { clientId: 'c1', scheduledDate: '2026-08-04', title: 'Tue' } },
  ];
  const res = await bsReplayQueue(items, { write: async () => { throw offline; } });
  assert.equal(res.sent, 0);
  assert.equal(res.rejections.length, 0);
  assert.deepEqual(res.held.map((i) => i.payload.title), ['Mon', 'Tue']);
});

test('drain: an assignment queued DURING the pass is not erased by the write-back', () => {
  // CodeRabbit's reproduction, as a fixture. The pass snapshots [W1, W2];
  // mid-drain the coach queues W3; the pass holds both originals. Writing back
  // only `held` erased W3 silently — the outcome this module ranks worst.
  const item = (t) => ({ id: `q-${t}`, queuedAt: NOW, payload: payload({ title: t }) });
  const started = [item('W1'), item('W2')];
  const current = [item('W1'), item('W2'), item('W3-NEW')];

  const merged = bsMergeAfterDrain(started, started, current);
  assert.deepEqual(merged.map((i) => i.payload.title), ['W1', 'W2', 'W3-NEW']);
});

test('drain: a SENT item does not come back, and arrivals survive alongside', () => {
  const item = (t) => ({ id: `q-${t}`, queuedAt: NOW, payload: payload({ title: t }) });
  const started = [item('W1'), item('W2')];
  // W1 sent, W2 held; W3 arrived mid-pass.
  const merged = bsMergeAfterDrain(started, [item('W2')], [item('W2'), item('W3')]);
  assert.deepEqual(merged.map((i) => i.payload.title), ['W2', 'W3'], 'W1 must not resurrect');
});

test('drain: an arrival matching a HELD item never duplicates the assignment', () => {
  const item = (t) => ({ id: `q-${t}`, queuedAt: NOW, payload: payload({ title: t }) });
  const started = [item('W1')];
  const merged = bsMergeAfterDrain(started, [item('W1')], [item('W1')]);
  assert.equal(merged.length, 1, 'same identity collapses, as bsQueueAssignment documents');
});

test('drain: junk from localStorage cannot break the merge', () => {
  assert.deepEqual(bsMergeAfterDrain(null, null, null), []);
  assert.deepEqual(bsMergeAfterDrain(undefined, [], 'nope'), []);
  const good = { id: 'a', queuedAt: NOW, payload: payload() };
  assert.deepEqual(bsMergeAfterDrain([], [], [null, good]), [good]);
});

// ─── Round-3 regressions (Codex, 2026-07-28) ────────────────────────────────
// The queue is ONE device-wide localStorage key that sign-out does not clear,
// the writer resolves trainer_id from whoever is signed in at write time, and
// the drain fires on session resolve. Unscoped, coach B signing in replays
// coach A's held week under B's provider — or loses it to an RLS denial.

test('owner: an entry replays ONLY under the account that queued it', () => {
  const q = [
    { id: 'a', queuedAt: NOW, owner: 'coach-A', payload: payload({ title: 'A week' }) },
    { id: 'b', queuedAt: NOW, owner: 'coach-B', payload: payload({ title: 'B week' }) },
  ];
  assert.deepEqual(bsPartitionByOwner(q, 'coach-A').mine.map((i) => i.id), ['a']);
  assert.deepEqual(bsPartitionByOwner(q, 'coach-A').others.map((i) => i.id), ['b']);
  // ...and the other coach's work is NOT dropped — it waits for them.
  assert.deepEqual(bsPartitionByOwner(q, 'coach-B').mine.map((i) => i.id), ['b']);
});

test('owner: an UNATTRIBUTABLE entry never replays under an arbitrary account', () => {
  // No stamp = we cannot prove whose it is. Writing it under whoever happens to
  // be signed in is the exact failure this scoping exists to prevent, so it
  // stays in `others` (and ages out) rather than replaying.
  const q = [{ id: 'legacy', queuedAt: NOW, payload: payload() }];
  assert.deepEqual(bsPartitionByOwner(q, 'coach-A').mine, []);
  assert.deepEqual(bsPartitionByOwner(q, 'coach-A').others.map((i) => i.id), ['legacy']);
  // A blank/absent viewer id matches nothing — never a wildcard.
  assert.deepEqual(bsPartitionByOwner(q, '').mine, []);
  assert.deepEqual(bsPartitionByOwner(q, null).mine, []);
  assert.deepEqual(bsPartitionByOwner(null, 'coach-A'), { mine: [], others: [] });
});

test('owner: one coach queueing does NOT collapse another coach s identical entry', () => {
  // Same client, same date, same title, different coaches = two assignments.
  // Keyed on the payload alone, B's queue write silently deleted A's held work.
  let q = bsQueueAssignment([], payload(), { now: NOW, owner: 'coach-A' });
  q = bsQueueAssignment(q, payload(), { now: NOW + 1000, owner: 'coach-B' });
  assert.equal(q.length, 2, "coach B must not erase coach A's held assignment");
  assert.deepEqual(q.map((it) => it.owner), ['coach-A', 'coach-B']);

  // The same coach re-tapping still collapses to one.
  q = bsQueueAssignment(q, payload(), { now: NOW + 2000, owner: 'coach-A' });
  assert.equal(q.length, 2);
  assert.equal(q.filter((it) => it.owner === 'coach-A').length, 1);
});

test('drain: the write-back preserves ANOTHER account s queued work', () => {
  // The drain replays only `mine`, so a foreign entry reaches the merge as an
  // arrival. Owner is part of the merge key, so this holds structurally — a
  // foreign entry can never be mistaken for one of ours and dropped.
  const mine = [{ id: 'a', queuedAt: NOW, owner: 'coach-A', payload: payload({ title: 'W1' }) }];
  const theirs = { id: 'b', queuedAt: NOW, owner: 'coach-B', payload: payload({ title: 'W1' }) };
  const merged = bsMergeAfterDrain(mine, [], [...mine, theirs]);
  assert.deepEqual(merged.map((i) => i.id), ['b'], "A's sent item is gone; B's is untouched");
});

test('replay: sentItems carries the ENTRIES behind the count', () => {
  // The count alone cannot tell a caller WHICH assignments landed, and the
  // delivered set is what the post-replay client notification acts on.
  const items = [
    { id: 'a', queuedAt: NOW, owner: 'c', payload: payload({ scheduledDate: '2026-08-03' }) },
    { id: 'b', queuedAt: NOW, owner: 'c', payload: payload({ scheduledDate: '2026-08-04' }) },
  ];
  return bsReplayQueue(items, { write: async () => {} }).then((res) => {
    assert.equal(res.sent, 2);
    assert.deepEqual(res.sentItems.map((i) => i.id), ['a', 'b']);
  });
});

test('replay: an already-written session still counts as DELIVERED in sentItems', async () => {
  // It reached the client's calendar; the notification is owed either way.
  const res = await bsReplayQueue(
    [{ id: 'a', queuedAt: NOW, owner: 'c', payload: payload() }],
    { exists: async () => true, write: async () => { throw new Error('must not write'); } },
  );
  assert.deepEqual(res.sentItems.map((i) => i.id), ['a']);
});

test('replay: a REJECTED item never appears in sentItems', async () => {
  const rejected = new Error('permission denied');
  rejected.rejected = true;
  const res = await bsReplayQueue(
    [{ id: 'a', queuedAt: NOW, owner: 'c', payload: payload() }],
    { write: async () => { throw rejected; } },
  );
  assert.equal(res.sent, 0);
  assert.deepEqual(res.sentItems, [], 'a refused assignment must never trigger a "it is live" note');
});

// ─── Round-4 regressions (CodeRabbit, 2026-07-28) ───────────────────────────
// The effects boundary was neither guarded nor tested. Both gaps land on the
// same outcome: an unmarked throw takes the classifier's `rejected` default,
// which DROPS the assignment permanently — the worst outcome in this module.

test('replay: a MISSING writer holds the queue, it never drops it', async () => {
  const items = [
    { id: 'a', queuedAt: NOW, owner: 'c', payload: payload({ scheduledDate: '2026-08-03' }) },
    { id: 'b', queuedAt: NOW, owner: 'c', payload: payload({ scheduledDate: '2026-08-04' }) },
  ];
  const res = await bsReplayQueue(items, {});
  assert.equal(res.sent, 0);
  assert.deepEqual(res.rejections, [], 'nothing was attempted, so nothing was refused');
  assert.deepEqual(res.held.map((i) => i.id), ['a', 'b'], 'the week waits for a working writer');
});

test('replay: a THROWING exists falls back to attempting the write', async () => {
  // `exists` is a best-effort duplicate check. A read failure means "unknown",
  // and a possible duplicate is recoverable where a dropped week is not.
  const written = [];
  const res = await bsReplayQueue(
    [{ id: 'a', queuedAt: NOW, owner: 'c', payload: payload() }],
    { exists: async () => { throw new Error('offline read'); }, write: async (p) => { written.push(p.title); } },
  );
  assert.equal(res.sent, 1);
  assert.deepEqual(written, ['Upper Pull']);
  assert.deepEqual(res.rejections, []);
});
