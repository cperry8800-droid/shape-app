// src/lib/guardrail-health.mjs
//
// Layer 2 of error tracking: the failure modes Sentry cannot see, because the
// progression guardrail NEVER THROWS BY CONTRACT. Pure — no database, no clock,
// no network. `nowISO` is the only "now" this module is allowed to know.
//
// ⚠ RATES ARE PER EVALUATION, NEVER PER PUBLISH. `guardrail_evaluated` has two
// emission sites (week-publish-server.ts and trainer/adjust/route.ts), and the
// Adjust one writes a row PER EVALUATION inside a map. The migration comment
// claiming "one row per publish" is wrong; sizing anything against it is wrong.

import { BS_GUARDRAIL_STATES } from '../../public/newdesign/progressionGuardrail.mjs';

/** Below this many evaluations a rate is noise, so it is not reported at all. */
export const BS_SAMPLE_FLOOR = 20;

/**
 * ⚠ TWO values, not one. `progressionGuardrail.mjs` returns `malformed_history`
 * when the history is unusable and `malformed_week` when the proposed week is.
 * Matching only the first silently misses every malformed proposed week — and a
 * malformed check that cannot see half its subject is the exact silent failure
 * this module exists to catch.
 */
export const BS_MALFORMED_REASONS = ['malformed_history', 'malformed_week'];

const BS_RED_RATE_MAX = 0.05;
const BS_UNKNOWN_RATE_MAX = 0.10;

/** Re-announce an unresolved alert this often, so it is not forgotten. */
const BS_REALERT_MS = 7 * 24 * 60 * 60 * 1000;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/** A readable evaluation row, or null. Junk is EXCLUDED, never counted. */
function readEvaluation(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const state = typeof row.state === 'string' ? row.state : null;
  const unknownReason = typeof row.unknownReason === 'string' ? row.unknownReason : null;
  // A row with neither field carries no signal and must not pad a denominator.
  if (state === null && unknownReason === null) return null;
  return { state, unknownReason };
}

const verdict = (status, value, sample, alertedAt = null) => ({ status, value, sample, alertedAt });

/**
 * Decide whether a check that is currently `alert` should NOTIFY.
 *
 * Notifies on a transition into alert, and again every BS_REALERT_MS while it
 * stays there. Returns the `alertedAt` to persist.
 *
 * ⚠ `insufficient_sample` is not a state in either direction here: it never
 * notifies, and it never counts as the "previously fine" that arms a new alert
 * incorrectly — it simply leaves the previous stamp alone by having none.
 */
function shouldNotify(previousEntry, nowISO) {
  const wasAlerting = previousEntry && previousEntry.status === 'alert';
  if (!wasAlerting) return { notify: true, alertedAt: nowISO };

  const last = Date.parse(previousEntry.alertedAt || '');
  if (!Number.isFinite(last)) return { notify: true, alertedAt: nowISO };

  const now = Date.parse(nowISO);
  if (!Number.isFinite(now)) return { notify: false, alertedAt: previousEntry.alertedAt };

  if (now - last >= BS_REALERT_MS) return { notify: true, alertedAt: nowISO };
  return { notify: false, alertedAt: previousEntry.alertedAt };
}

/**
 * @param {{rpeDropped:number|null, evaluations:Array, previous:object|null, nowISO:string}} input
 * @returns {{verdicts:Record<string,object>, alerts:Array<{check,severity,message}>}}
 */
export function bsEvaluateHealth({ rpeDropped, evaluations, previous, nowISO }) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const rows = (Array.isArray(evaluations) ? evaluations : [])
    .map(readEvaluation)
    .filter(Boolean);
  const sample = rows.length;

  const verdicts = {};
  const alerts = [];

  /** Register a verdict, and an alert if it is bad and due to be announced. */
  const record = (check, status, value, sampleN, severity, message) => {
    if (status !== 'alert') {
      verdicts[check] = verdict(status, value, sampleN);
      return;
    }
    const { notify, alertedAt } = shouldNotify(prev[check], nowISO);
    verdicts[check] = verdict('alert', value, sampleN, alertedAt);
    if (notify) alerts.push({ check, severity, message });
  };

  // ── 1. session_rpe_dropped, 24h. A count, not a rate: any drop is a real
  //       rating a member gave that we failed to store.
  const dropped = finite(rpeDropped) ? rpeDropped : 0;
  record(
    'rpe_dropped',
    dropped > 0 ? 'alert' : 'ok',
    dropped,
    null,
    'error',
    `${dropped} session RPE rating(s) were given but not stored in the last 24h. `
    + 'A member rated a session and the write was rejected.',
  );

  // ── 2. malformed, ANY occurrence, no floor. Malformed is reserved for shapes
  //       NO LEGITIMATE WRITER CAN EMIT, so one row means our own code produced
  //       something it should not have. That is a bug, not a rate to trend.
  //
  // ⚠ TWO CONTRIBUTORS, folded into ONE check, not a fifth one. A row the
  // guardrail itself flagged `unknown` on malformed input, and a row whose
  // `state` is not one of `BS_GUARDRAIL_STATES` (imported from the core, never
  // re-typed here — that constant is the single source of the vocabulary),
  // are both "a shape no legitimate writer can emit": an unrecognized state
  // can only come from a core rename this monitor was never told about, or a
  // row an OLDER deploy wrote under a state that has since been retired.
  // Neither is a caller bug, and both would silently switch off the very rate
  // checks below (red_rate/unknown_rate) that exist to catch a rename by going
  // quiet. They are counted as ONE union (so a row cannot be double-counted by
  // satisfying both predicates) but NAMED SEPARATELY in the alert body — "the
  // guardrail reported malformed input" and "this monitor doesn't recognise a
  // state it saw" are different faults with different fixes.
  const isUnrecognizedState = (r) => r.state !== null && !BS_GUARDRAIL_STATES.includes(r.state);
  const malformedReasonCount = rows.filter(
    (r) => r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason),
  ).length;
  const unrecognizedStateCount = rows.filter(isUnrecognizedState).length;
  const malformed = rows.filter(
    (r) => (r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason))
      || isUnrecognizedState(r),
  ).length;
  const malformedParts = [];
  if (malformedReasonCount > 0) {
    malformedParts.push(
      `${malformedReasonCount} went unknown on malformed input the guardrail itself reported `
      + `(${BS_MALFORMED_REASONS.join(' or ')}) — that is our bug, not the coach's.`,
    );
  }
  if (unrecognizedStateCount > 0) {
    malformedParts.push(
      `${unrecognizedStateCount} carried a state this monitor does not recognise `
      + `(expected one of ${BS_GUARDRAIL_STATES.join('/')}) — either the guardrail's `
      + 'state vocabulary changed without this monitor being updated, or an older '
      + 'deploy wrote a state that has since been retired.',
    );
  }
  record(
    'malformed',
    malformed > 0 ? 'alert' : 'ok',
    malformed,
    sample,
    'error',
    `${malformed} guardrail evaluation(s) in the last 7d were malformed. ${malformedParts.join(' ')}`.trim(),
  );

  // ── 3 & 4. The rate checks. Below the floor they report insufficient_sample —
  //          never zero, never a number. One unknown out of one evaluation is
  //          100% and would trip every threshold in the design.
  //
  // ⚠ UNRECOGNIZED-STATE ROWS ARE EXCLUDED FROM THE DENOMINATOR HERE, not just
  // counted above. Left in, they pad `sample` while matching neither `'red'`
  // nor `'unknown'` in the matchers below — diluting BOTH rates DOWNWARD, the
  // one direction this monitor must never move on its own account. A silently
  // renamed vocabulary would then read as an IMPROVING red/unknown rate,
  // exactly backwards for a check built to catch silent failure. Excluding
  // them can only push `rateSample` DOWN toward `insufficient_sample` — never
  // fabricate a rate by dividing by whatever recognizable rows are left — so
  // the floor check below still runs against the reduced sample.
  const rateRows = rows.filter((r) => !isUnrecognizedState(r));
  const rateSample = rateRows.length;

  const rate = (check, matcher, max, severity, label) => {
    if (rateSample < BS_SAMPLE_FLOOR) {
      verdicts[check] = verdict('insufficient_sample', null, rateSample);
      return;
    }
    const hits = rateRows.filter(matcher).length;
    const value = hits / rateSample;
    record(
      check,
      value > max ? 'alert' : 'ok',
      value,
      rateSample,
      severity,
      `${label} rate is ${(value * 100).toFixed(1)}% over the last 7d `
      + `(${hits} of ${rateSample}), above the ${(max * 100).toFixed(0)}% threshold.`,
    );
  };

  rate('red_rate', (r) => r.state === 'red', BS_RED_RATE_MAX, 'warning', 'Red');
  rate('unknown_rate', (r) => r.state === 'unknown', BS_UNKNOWN_RATE_MAX, 'warning', 'Unknown');

  return { verdicts, alerts };
}
