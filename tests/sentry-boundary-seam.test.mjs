// tests/sentry-boundary-seam.test.mjs
//
// The seam check, not the delivery check: a mock transport proves
// bsCaptureBoundaryError produces a real Sentry event with the component
// stack, the crash_type tag and mechanism.handled — and that Sentry's dedupe
// suppresses an identical consecutive capture (a render loop must not burn
// the monthly quota). Delivery is the deferred post-DSN e2e gate (spec).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SENTRY_SRC = join(ROOT, 'mobile-app', 'src', 'sentry.mjs');
// The SAME CJS instances the compiled module will receive — client state is
// shared, so init here is visible to the seam's capture call.
const mobileRequire = createRequire(join(ROOT, 'mobile-app', 'src', 'x.js'));
const SentryReact = mobileRequire('@sentry/react');
const SentryCapacitor = mobileRequire('@sentry/capacitor');

globalThis.window = globalThis; // sentry.mjs and the SDK expect a window-ish global

const registry = new Map([
  ['@sentry/react', SentryReact],
  ['@sentry/capacitor', SentryCapacitor],
]);
const MOD = await loadRealModule(SENTRY_SRC, { registry });

const envelopes = [];
// Documented fake DSN (spec) — with dsn:'' no client exists and capture is a
// no-op, so the test NEEDS a syntactically valid dummy. Mock transport: no
// network is ever constructed.
SentryReact.init({
  dsn: 'https://public@dedupe.invalid/1',
  defaultIntegrations: undefined, // keep SDK defaults, incl. dedupe
  transport: () => ({
    send: (envelope) => { envelopes.push(envelope); return Promise.resolve({}); },
    flush: () => Promise.resolve(true),
  }),
});

function eventsSent() {
  // Envelope = [headers, items]; item = [itemHeaders, payload].
  return envelopes
    .flatMap((env) => env[1])
    .filter((item) => item[0].type === 'event')
    .map((item) => item[1]);
}

test('a boundary capture produces a real event: component stack, tag, mechanism', async () => {
  const err = new Error('seam probe');
  MOD.bsCaptureBoundaryError(err, { componentStack: '\n    at Bomb\n    at BSApp' });
  await SentryReact.flush(2000);
  const events = eventsSent();
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.tags?.crash_type, 'boundary');
  // Real-event finding (per the task brief's contingency): captureReactException
  // in @sentry/react 10.60.0 puts NO component-stack string on
  // contexts.react.component_stack / componentStack at all — that key is
  // absent. Instead it synthesizes a CHAINED exception ("React ErrorBoundary
  // Error") whose stacktrace.frames are parsed one-per-line from the
  // componentStack string (each "at X" line becomes a frame with
  // filename: X). Assert against that real shape instead.
  const boundaryEx = ev.exception?.values?.find((v) => v.type === 'React ErrorBoundary Error');
  assert.ok(boundaryEx, 'expected a synthesized "React ErrorBoundary Error" exception carrying the component stack');
  const frames = boundaryEx.stacktrace?.frames ?? [];
  assert.ok(frames.some((f) => f.filename === 'Bomb'), 'component stack frame for Bomb missing');
  const mech = ev.exception?.values?.[0]?.mechanism;
  assert.equal(mech?.handled, true);
});

test('the identical consecutive capture is deduped — one envelope total', async () => {
  const before = eventsSent().length;
  const err = new Error('dedupe probe');
  const info = { componentStack: '\n    at Bomb' };
  MOD.bsCaptureBoundaryError(err, info);
  MOD.bsCaptureBoundaryError(err, info);
  await SentryReact.flush(2000);
  assert.equal(eventsSent().length, before + 1,
    'dedupeIntegration inactive — add the local same-message+stack guard per spec');
});

test('the crash_type tag does not leak onto unrelated events', async () => {
  const before = eventsSent().length;
  SentryReact.captureMessage('unrelated');
  await SentryReact.flush(2000);
  const events = eventsSent();
  assert.equal(events.length, before + 1);
  assert.equal(events[events.length - 1].tags?.crash_type, undefined);
});

test('total: never throws, even with garbage input', () => {
  assert.doesNotThrow(() => MOD.bsCaptureBoundaryError(null, null));
  assert.doesNotThrow(() => MOD.bsCaptureBoundaryError(undefined, { componentStack: 42 }));
});
