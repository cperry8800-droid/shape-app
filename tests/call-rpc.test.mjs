// tests/call-rpc.test.mjs
//
// callRpc's whole point is an asymmetry: a RESOLVED `{ error }` is reported to
// Sentry, a resolved success is not — and the result comes back UNCHANGED
// either way, because a rejected/thrown promise never reaches a try/catch the
// way a resolved PostgREST error does. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import Sentry from '@sentry/nextjs';
import { callRpc } from '../src/lib/supabase/call-rpc.mjs';

// `Sentry` here and inside call-rpc.mjs are the SAME cached module object (one
// `@sentry/nextjs` resolves to one file on disk), so patching a method on it
// here is visible to the wrapper under test. Always restored, so no test can
// leak a mock into the next one.
function withMockedCapture(fn) {
  return async () => {
    const original = Sentry.captureException;
    const calls = [];
    Sentry.captureException = (...args) => { calls.push(args); };
    try {
      await fn(calls);
    } finally {
      Sentry.captureException = original;
    }
  };
}

test('a resolved { error } IS reported to Sentry, tagged with the RPC name', withMockedCapture(async (calls) => {
  const err = { message: 'permission denied for function track_event', code: '42501' };
  const client = { rpc: async () => ({ data: null, error: err }) };

  await callRpc(client, 'track_event', { p_event: 'x' });

  assert.equal(calls.length, 1, 'the resolved error must be reported exactly once');
  assert.equal(calls[0][0], err, 'the raw error is passed through, not re-wrapped');
  assert.deepEqual(calls[0][1], { tags: { rpc: 'track_event' } });
}));

test('a resolved SUCCESS is not reported — that asymmetry is the whole point', withMockedCapture(async (calls) => {
  const client = { rpc: async () => ({ data: { ok: true }, error: null }) };

  await callRpc(client, 'track_event', {});

  assert.equal(calls.length, 0);
}));

test('the result is returned UNCHANGED on a resolved error', withMockedCapture(async () => {
  const err = { message: 'nope' };
  const client = { rpc: async () => ({ data: null, error: err }) };

  const result = await callRpc(client, 'some_rpc');

  assert.deepEqual(result, { data: null, error: err });
}));

test('the result is returned UNCHANGED on success', withMockedCapture(async () => {
  const client = { rpc: async () => ({ data: { rows: 3 }, error: null }) };

  const result = await callRpc(client, 'some_rpc');

  assert.deepEqual(result, { data: { rows: 3 }, error: null });
}));

test('a throwing reporter does not break the caller — the result still comes back', async () => {
  const original = Sentry.captureException;
  Sentry.captureException = () => { throw new Error('sentry sdk exploded'); };
  try {
    const err = { message: 'boom' };
    const client = { rpc: async () => ({ data: null, error: err }) };

    const result = await callRpc(client, 'some_rpc');

    assert.deepEqual(result, { data: null, error: err }, 'the caller must still get its result');
  } finally {
    Sentry.captureException = original;
  }
});

test('args are forwarded to client.rpc unchanged — a true drop-in', withMockedCapture(async () => {
  let seenName;
  let seenArgs;
  const client = { rpc: async (name, args) => { seenName = name; seenArgs = args; return { data: null, error: null }; } };

  await callRpc(client, 'my_rpc', { a: 1 });

  assert.equal(seenName, 'my_rpc');
  assert.deepEqual(seenArgs, { a: 1 });
}));

test('a genuine rejection propagates untouched — not the trap this wrapper targets', withMockedCapture(async (calls) => {
  const client = { rpc: async () => { throw new Error('network down'); } };

  await assert.rejects(() => callRpc(client, 'x'), /network down/);
  assert.equal(calls.length, 0, 'a rejection already reaches a catch block on its own — nothing to report here');
}));

test('against the REAL, uninitialized Sentry SDK (no DSN in this test run), an error result never throws', async () => {
  // No mocking at all in this test — proves the actual "captureException on a
  // disabled SDK is a no-op" contract holds for real, not just for the mock.
  const err = { message: 'no dsn configured yet' };
  const client = { rpc: async () => ({ data: null, error: err }) };

  const result = await callRpc(client, 'some_rpc');

  assert.deepEqual(result, { data: null, error: err });
});
