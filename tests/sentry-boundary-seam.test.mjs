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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { loadRealModule } from './helpers/load-real-module.mjs';

const traverse = _traverse.default || _traverse;

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
  // ⚠ Shaped this way deliberately — do not "simplify" it back to
  // `values[0].mechanism.handled === true`. `captureReactException` calls
  // `setCause(error, errorBoundaryError)`, so linkedErrorsIntegration emits TWO
  // values: values[0] is the SYNTHETIC "React ErrorBoundary Error" cause,
  // values[1] the real thrown error. Pinning values[0] alone asserts an
  // incidental property of a synthesized value — linkedErrors sets its
  // `handled` default itself — rather than the invariant that decides release
  // health. That invariant is what `@sentry/core`'s `_updateSessionFromEvent`
  // reads (client.js: it walks EVERY value and marks the session crashed if any
  // has `mechanism.handled === false`), and it is exactly the owner's
  // 2026-08-02 call: boundary crashes stay OUT of the crash-free session rate,
  // with the `crash_type` tag as the compensating control. Asserting it across
  // all values also survives values[1]'s mechanism changing under us.
  //
  // ⚠ Measured, not assumed: this fails when the hint is flipped to
  // `handled: false`, and CANNOT fail when the hint is deleted — deletion emits
  // an identical mechanism set (see the intent guard at the bottom of this file
  // for the proof and the source-level check that covers that mutation).
  assert.ok(ev.exception.values.every((v) => v.mechanism?.handled !== false));
  assert.equal(ev.exception.values.at(-1).value, 'seam probe'); // the real error, not the synthetic cause
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

// ⚠ Why this one is SOURCE-level and not another envelope assertion — measured,
// not assumed (2026-08-02). Deleting the `{ mechanism: { handled: true } }`
// argument entirely emits a mechanism set that is FUNCTIONALLY IDENTICAL:
// linkedErrorsIntegration defaults values[0].handled to true on its own, and the
// hint never reaches values[1] at all (flipping it to `false` moves only
// values[0] — proven by mutation). So the deletion has NO behavioural signature
// and NO assertion over the emitted event can detect it — the test above
// correctly fails on the flip and cannot fail on the deletion.
//
// That makes the hint load-bearing as INTENT, not as current behaviour: it is
// the only thing pinning this seam to the owner's explicit 2026-08-02 decision
// if @sentry/react's default ever moves. Guarding intent needs a source check.
function boundaryMechanismHint(src) {
  const ast = parse(src, { sourceType: 'module' });
  let found = null;
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== 'MemberExpression' || c.property?.name !== 'captureReactException') return;
      const third = p.node.arguments[2];
      if (!third || third.type !== 'ObjectExpression') { found = found ?? { present: false }; return; }
      const mech = third.properties.find((x) => x.type === 'ObjectProperty' && x.key?.name === 'mechanism');
      if (!mech || mech.value.type !== 'ObjectExpression') { found = found ?? { present: false }; return; }
      const handled = mech.value.properties.find((x) => x.type === 'ObjectProperty' && x.key?.name === 'handled');
      found = { present: true, handled: handled?.value?.type === 'BooleanLiteral' ? handled.value.value : undefined };
    },
  });
  return found;
}

test('the explicit mechanism.handled hint is still passed (intent guard — deletion is behaviourally invisible)', () => {
  const hint = boundaryMechanismHint(readFileSync(SENTRY_SRC, 'utf8'));
  assert.ok(hint, 'captureReactException call not found in the seam');
  assert.equal(hint.present, true,
    'the { mechanism: { handled: true } } argument was dropped from bsCaptureBoundaryError — behaviourally identical TODAY, but it is the only record of the owner\'s explicit release-health decision');
  assert.equal(hint.handled, true,
    'mechanism.handled is no longer the literal true — flipping it puts boundary crashes back into the crash-free session rate, reversing an explicit owner call');
});

test('the intent guard flags what it should, and only that', () => {
  const call = (args) => `import * as S from '@sentry/react';\nexport function f(){ S.captureReactException(${args}); }`;
  assert.deepEqual(boundaryMechanismHint(call("e, i, { mechanism: { handled: true } }")), { present: true, handled: true });
  assert.deepEqual(boundaryMechanismHint(call("e, i, { mechanism: { handled: false } }")), { present: true, handled: false }, 'flip is visible');
  assert.deepEqual(boundaryMechanismHint(call('e, i')), { present: false }, 'deletion is visible');
  assert.deepEqual(boundaryMechanismHint(call('e, i, {}')), { present: false }, 'empty options object is not a hint');
  assert.equal(boundaryMechanismHint('export const x = 1;'), null, 'no call at all');
});
