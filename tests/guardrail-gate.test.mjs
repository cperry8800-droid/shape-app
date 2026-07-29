// The publish decision — SPEC-guardrails.md §7.4 (kill switch), §9.2/§9.4 (the
// gate), §10.2 (telemetry).
//
// Every §9.4 fixture that is a DECISION rather than a schema fact is discharged
// here. The core says what the week IS; this says what happens next, and it
// lives in its own fixture-tested module for the same reason the core does — a
// rule that only exists inside a request handler is a rule nothing can pin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '../src/lib/guardrail-gate.mjs';

const res = (over = {}) => ({
  state: 'green',
  regime: 'measured',
  redPath: null,
  reason: null,
  baseline: { au: 1800, basis: 'measured', weeks: 4 },
  proposed: { totalAu: 1900, hardestAu: 480, sessions: 4 },
  axes: [{ axis: 'volume', state: 'green', checks: [], ceilingPct: 12 }],
  contributingAxes: [],
  gapDays: null,
  issues: { malformedHistory: [], incompleteWeek: [] },
  ...over,
});

const RED = { state: 'red', redPath: 'curve', contributingAxes: ['volume'] };

// ── The states that publish ─────────────────────────────────────────────────

test('green publishes', () => {
  const d = bsGateDecision({ result: res(), redEnabled: true });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
  assert.equal(d.displayState, 'green');
});

test('amber publishes — amber never blocks', () => {
  const d = bsGateDecision({ result: res({ state: 'amber' }), redEnabled: true });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
  assert.equal(d.requiresAck, false);
});

test('unknown does NOT gate publish — it is reported, not enforced', () => {
  // §9.2. An unscoreable week is not a safe week, but blocking on it would
  // punish a coach for a blank field or one bad logged row.
  for (const reason of ['incomplete_week', 'malformed_week', 'malformed_history', 'unscoreable']) {
    const d = bsGateDecision({ result: res({ state: 'unknown', reason }), redEnabled: true });
    assert.equal(d.publish, true, reason);
    assert.equal(d.reason, reason);
  }
});

// ── Red, enforcing ──────────────────────────────────────────────────────────

test('ENFORCING + red + no acknowledgment is REJECTED 409', () => {
  const d = bsGateDecision({ result: res(RED), redEnabled: true });
  assert.equal(d.publish, false);
  assert.equal(d.status, 409);
  assert.equal(d.requiresAck, true);
  assert.equal(d.displayState, 'red');
  assert.equal(d.writeAck, false);
});

test('ENFORCING + red + an acknowledgment publishes and writes the audit row', () => {
  const d = bsGateDecision({
    result: res(RED),
    redEnabled: true,
    acknowledgment: { reasonCode: 'returning_athlete', reasonText: 'Coming off a taper.' },
  });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
  assert.equal(d.writeAck, true);
  assert.equal(d.overridden, true);
  assert.equal(d.acknowledgmentCode, 'returning_athlete');
});

test('a reason TEXT alone is an acknowledgment — a coach who typed why did acknowledge', () => {
  const d = bsGateDecision({
    result: res(RED), redEnabled: true,
    acknowledgment: { reasonCode: '', reasonText: 'Deliberate overreach, discussed.' },
  });
  assert.equal(d.publish, true);
  assert.equal(d.overridden, true);
});

test('an EMPTY acknowledgment is not an acknowledgment', () => {
  for (const ack of [{ reasonCode: '', reasonText: '' }, {}, { reasonCode: '   ' }, null]) {
    const d = bsGateDecision({ result: res(RED), redEnabled: true, acknowledgment: ack });
    assert.equal(d.publish, false);
    assert.equal(d.status, 409);
  }
});

// ── Red, advisory (§7.4 — how 2b SHIPS) ─────────────────────────────────────

test('ADVISORY + red is WRITTEN, shown as amber, and NOT rejected', () => {
  const d = bsGateDecision({ result: res(RED), redEnabled: false });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
  assert.equal(d.displayState, 'amber');
  assert.equal(d.trueState, 'red');
  assert.equal(d.redSuppressed, true);
  assert.equal(d.requiresAck, false);
});

test('ADVISORY + red writes NO guardrail_red_ack row — there is nothing to acknowledge', () => {
  assert.equal(bsGateDecision({ result: res(RED), redEnabled: false }).writeAck, false);
});

test('ADVISORY ignores an acknowledgment that arrived anyway', () => {
  // A builder that sent one is not wrong, but there is nothing to record: the
  // publish was never blocked, so an audit row would assert an override that
  // did not happen.
  const d = bsGateDecision({
    result: res(RED), redEnabled: false,
    acknowledgment: { reasonCode: 'returning_athlete', reasonText: 'x' },
  });
  assert.equal(d.writeAck, false);
  assert.equal(d.overridden, false);
});

test('ADVISORY does not touch amber or unknown', () => {
  assert.equal(bsGateDecision({ result: res({ state: 'amber' }), redEnabled: false }).redSuppressed, false);
  assert.equal(bsGateDecision({ result: res({ state: 'unknown', reason: 'no_history' }), redEnabled: false }).displayState, 'unknown');
});

// ── The flag itself ─────────────────────────────────────────────────────────

test('an UNREADABLE flag fails ENFORCED', () => {
  // §7.4. Safe BECAUSE red is not a hard block — it costs an acknowledgment and
  // a reason, never the ability to publish. Failing the other way would
  // silently remove the gate at exactly the moment something is already wrong.
  for (const flag of [null, undefined]) {
    const d = bsGateDecision({ result: res(RED), redEnabled: flag });
    assert.equal(d.publish, false);
    assert.equal(d.enforcing, true);
    assert.equal(d.flagReadFailed, true);
  }
});

test('a non-boolean flag fails ENFORCED — only an explicit false is advisory', () => {
  for (const flag of ['false', 0, {}]) {
    assert.equal(bsGateDecision({ result: res(RED), redEnabled: flag }).publish, false);
  }
});

// ── excludedSessionRate (§10.2) ─────────────────────────────────────────────

const sess = (rpe) => ({
  startedAtISO: '2026-07-20T18:00:00-04:00',
  timezone: 'America/New_York',
  durationSec: 3600,
  sessionRpe: rpe,
  durationPrompted: true,
  durationAnswer: 'confirmed',
  source: 'shape_app',
  status: 'completed',
});

test('excludedSessionRate is the share of in-scope sessions with no rating', () => {
  // A skipped rating stores NULL, never 0 — and BOTH mean absent.
  assert.equal(bsExcludedSessionRate([sess(8), sess(null), sess(7), sess(0)]), 0.5);
  assert.equal(bsExcludedSessionRate([sess(8), sess(7)]), 0);
  assert.equal(bsExcludedSessionRate([sess(null)]), 1);
});

test('excludedSessionRate is NULL with nothing in scope — never a fabricated 0', () => {
  assert.equal(bsExcludedSessionRate([]), null);
  assert.equal(bsExcludedSessionRate(null), null);
  assert.equal(bsExcludedSessionRate('nope'), null);
});

test('excludedSessionRate ignores out-of-scope rows', () => {
  // §9.5: device imports are outside the guardrail entirely — not in the
  // numerator, not in the denominator.
  const imported = { ...sess(null), source: 'garmin' };
  assert.equal(bsExcludedSessionRate([sess(8), imported]), 0);
});

test('excludedSessionRate never throws on garbage rows', () => {
  assert.doesNotThrow(() => bsExcludedSessionRate([null, 42, {}, sess(8)]));
});

// ── Telemetry (§10.2) ───────────────────────────────────────────────────────

test('telemetry logs the TRUE state when the switch suppressed a red', () => {
  // The entire point of the switch: keep a clean read of what red WOULD have
  // fired on, so the caps can be retuned before red is switched back on.
  const r = res({ state: 'red', redPath: 'compound', contributingAxes: ['volume', 'concentration'] });
  const d = bsGateDecision({ result: r, redEnabled: false });
  const p = bsTelemetryProps({ result: r, decision: d, excludedSessionRate: 0.25, adjustMode: null });
  assert.equal(p.state, 'red');
  assert.equal(p.redPath, 'compound');
  assert.equal(p.redSuppressed, true);
  assert.deepEqual(p.axes, ['volume', 'concentration']);
  assert.equal(p.excludedSessionRate, 0.25);
});

test('telemetry carries NO client identifier', () => {
  const r = res();
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: 'deload' });
  const s = JSON.stringify(p).toLowerCase();
  assert.equal(s.includes('client'), false);
  assert.equal(s.includes('user'), false);
  assert.equal(s.includes('@'), false);
});

test('adjustMode is provenance — set from Adjust, null when a coach authored directly', () => {
  const r = res();
  const d = bsGateDecision({ result: r, redEnabled: true });
  assert.equal(bsTelemetryProps({ result: r, decision: d, excludedSessionRate: 0, adjustMode: 'progress' }).adjustMode, 'progress');
  assert.equal(bsTelemetryProps({ result: r, decision: d, excludedSessionRate: 0, adjustMode: null }).adjustMode, null);
});

test('reasonCode is the OVERRIDE code; unknownReason is the core reason — never mixed', () => {
  const red = res(RED);
  const overridden = bsGateDecision({ result: red, redEnabled: true, acknowledgment: { reasonCode: 'returning_athlete' } });
  const pOver = bsTelemetryProps({ result: red, decision: overridden, excludedSessionRate: 0, adjustMode: null });
  assert.equal(pOver.reasonCode, 'returning_athlete');
  assert.equal(pOver.unknownReason, null);

  const unk = res({ state: 'unknown', reason: 'incomplete_week' });
  const pUnk = bsTelemetryProps({ result: unk, decision: bsGateDecision({ result: unk, redEnabled: true }), excludedSessionRate: 0, adjustMode: null });
  assert.equal(pUnk.reasonCode, null);
  assert.equal(pUnk.unknownReason, 'incomplete_week');
});

test('ceilingPct reports the TIGHTEST ceiling any axis produced', () => {
  const r = res({
    axes: [
      { axis: 'volume', state: 'amber', checks: [], ceilingPct: 22 },
      { axis: 'concentration', state: 'green', checks: [], ceilingPct: 9 },
    ],
  });
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: null });
  assert.equal(p.ceilingPct, 9);
});

test('ceilingPct is NULL when no axis produced one', () => {
  const r = res({ axes: [{ axis: 'concentration', state: 'not_evaluable', checks: [], ceilingPct: null }] });
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: null });
  assert.equal(p.ceilingPct, null);
});

test('axes falls back to every named axis when nothing contributed', () => {
  // A green week contributes no axis, but the retune still wants to know which
  // axes were live — an empty list would read as "nothing was evaluated".
  const r = res({ contributingAxes: [] });
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: null });
  assert.deepEqual(p.axes, ['volume']);
});

test('the decision never throws on a junk result', () => {
  for (const junk of [null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => bsGateDecision({ result: junk, redEnabled: true }));
  }
});
