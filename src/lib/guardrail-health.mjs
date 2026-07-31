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

import {
  BS_GUARDRAIL_STATES,
  BS_MALFORMED_REASONS,
  BS_STATE_RED,
  BS_STATE_UNKNOWN,
} from '../../public/newdesign/progressionGuardrail.mjs';

/** Below this many evaluations a rate is noise, so it is not reported at all. */
export const BS_SAMPLE_FLOOR = 20;

/**
 * ⚠ TWO values, not one. The core returns `malformed_history` when the history
 * is unusable and `malformed_week` when the proposed week is. Matching only the
 * first silently misses every malformed proposed week — and a malformed check
 * that cannot see half its subject is the exact silent failure this module
 * exists to catch.
 *
 * ⚠ IMPORTED FROM THE CORE, NEVER RE-TYPED HERE — the same treatment
 * `BS_GUARDRAIL_STATES` got, for the same reason. A local literal means renaming
 * `malformed_week` in the core makes this check read 0 forever with no test
 * failing anywhere: the monitor goes blind exactly where it is supposed to see.
 * Re-exported so consumers keep one import site.
 */
export { BS_MALFORMED_REASONS };

const BS_RED_RATE_MAX = 0.05;
const BS_UNKNOWN_RATE_MAX = 0.10;

/** Re-announce an unresolved alert this often, so it is not forgotten. */
const BS_REALERT_MS = 7 * 24 * 60 * 60 * 1000;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * A readable evaluation row, or null when the element IS NOT A ROW AT ALL.
 *
 * ⚠ TWO KINDS OF JUNK, AND THEY ARE DELIBERATELY NOT THE SAME CASE.
 *
 * A **NON-OBJECT** (`null`, `undefined`, `42`, `'nope'`) is excluded outright and
 * counted nowhere. Nothing that reads `guardrail_evaluated` can produce one — the
 * route maps every row through `{state, unknownReason}` before it gets here — so
 * a non-object can only come from a caller handing this module something that is
 * not a row. There is no telemetry row behind it to investigate, and counting it
 * would file a CALLER bug as a PRODUCER bug, which is the mis-filing this
 * module's own doctrine warns about.
 *
 * An **OBJECT WITH NEITHER FIELD** (`{}`) is the opposite, and it used to be
 * dropped here alongside the non-objects. It is exactly what the route emits for
 * a REAL `guardrail_evaluated` row whose props carry no usable `state` and no
 * usable `unknownReason` — and `bsTelemetryProps` always writes a computed state,
 * so such a row is a shape NO LEGITIMATE WRITER CAN EMIT: the definition of
 * malformed. Dropping it meant a systematic regression in the telemetry mapper
 * could report `malformed: ok/0` while the rate checks merely fell to
 * `insufficient_sample` — a monitor going quiet exactly as it went blind. It is
 * therefore returned (so `isStateless` below can count it toward malformed) and
 * excluded from the rate denominators, the same treatment unrecognized states get.
 */
function readEvaluation(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const state = typeof row.state === 'string' ? row.state : null;
  const unknownReason = typeof row.unknownReason === 'string' ? row.unknownReason : null;
  return { state, unknownReason };
}

const verdict = (status, value, sample, alertedAt = null) => ({ status, value, sample, alertedAt });

/** The persisted alert stamp on a previous verdict, or null if it carries none. */
function stampOf(previousEntry) {
  if (!previousEntry || typeof previousEntry !== 'object') return null;
  return typeof previousEntry.alertedAt === 'string' && previousEntry.alertedAt
    ? previousEntry.alertedAt
    : null;
}

/**
 * Decide whether a check that is currently `alert` should NOTIFY.
 *
 * Notifies on a transition into alert, and again every BS_REALERT_MS while it
 * stays there. Returns the `alertedAt` to persist.
 *
 * ⚠ THE STAMP, NOT THE STATUS, IS WHAT SAYS "THIS EPISODE IS ALREADY OPEN."
 * Keying on `status === 'alert'` looked equivalent and is not, because
 * `insufficient_sample` is a THIRD status that sits between two alerting runs:
 * day 1 red_rate alerts and stamps; day 2 the sample dips below the floor and
 * writes `insufficient_sample`; day 3 the sample recovers and the check is still
 * failing. A status test reads day 2 as "was not alerting" and notifies AGAIN —
 * a continuing fault announced as a new one, which is exactly the flapping this
 * control exists to prevent. So the rate check CARRIES the stamp through
 * `insufficient_sample` (see `rate()` below) and this function honours any stamp
 * it finds.
 *
 * Only an `ok` verdict clears the stamp, and clearing it is what makes a genuine
 * recovery-then-relapse notify again. `insufficient_sample` is therefore a
 * transition in NEITHER direction: it never notifies, and it never re-arms.
 */
function shouldNotify(previousEntry, nowISO) {
  const stamp = stampOf(previousEntry);
  if (!stamp) return { notify: true, alertedAt: nowISO };

  const last = Date.parse(stamp);
  if (!Number.isFinite(last)) return { notify: true, alertedAt: nowISO };

  const now = Date.parse(nowISO);
  if (!Number.isFinite(now)) return { notify: false, alertedAt: stamp };

  // ⚠ A STAMP IN THE FUTURE IS A CORRUPT STAMP, NOT A FRESH ONE — and it is the
  // one corruption that PARSES. After a clock correction or a bad run record,
  // `now - last` is negative, so the re-alert test below can never fire; the run
  // then suppresses the alert AND persists the same future stamp again, every
  // day, until seven days past that timestamp. For a far-future value that is
  // effectively forever — a check silenced permanently by a single bad write.
  // Treated exactly like an unparseable stamp (above): re-notify and reset, so
  // this module's rule holds without exception — a corrupt stamp fails toward
  // over-notifying, never toward silence.
  //
  // ⚠ STRICTLY greater. `last === now` is two runs inside the same millisecond,
  // which is an ordinary repeat and must stay suppressed.
  if (last > now) return { notify: true, alertedAt: nowISO };

  if (now - last >= BS_REALERT_MS) return { notify: true, alertedAt: nowISO };
  return { notify: false, alertedAt: stamp };
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

  // ── 1. session_rpe_dropped, 25h. A count, not a rate: any drop is a real
  //       rating a member gave that we failed to store.
  const dropped = finite(rpeDropped) ? rpeDropped : 0;
  record(
    'rpe_dropped',
    dropped > 0 ? 'alert' : 'ok',
    dropped,
    null,
    'error',
    `${dropped} session RPE rating(s) were given but not stored in the last 25h. `
    + 'A member rated a session and the write was rejected.',
  );

  // ── 2. malformed, ANY occurrence, no floor. Malformed is reserved for shapes
  //       NO LEGITIMATE WRITER CAN EMIT, so one row means our own code produced
  //       something it should not have. That is a bug, not a rate to trend.
  //
  // ⚠ THREE CONTRIBUTORS, folded into ONE check, not three more. A row the
  // guardrail itself flagged `unknown` on malformed input; a row whose `state` is
  // not one of `BS_GUARDRAIL_STATES` (imported from the core, never re-typed here
  // — that constant is the single source of the vocabulary); and a row carrying
  // NO readable state and NO readable reason at all. All three are "a shape no
  // legitimate writer can emit": an unrecognized state can only come from a core
  // rename this monitor was never told about, or a row an OLDER deploy wrote
  // under a state that has since been retired; a stateless row can only come from
  // our own telemetry mapper, because the producer computes a state on every
  // path. None is a caller bug, and all three would silently switch off the very
  // rate checks below (red_rate/unknown_rate) that exist to catch a rename by
  // going quiet. They are counted as ONE union (so a row cannot be double-counted
  // by satisfying two predicates) but NAMED SEPARATELY in the alert body —
  // "the guardrail reported malformed input", "this monitor doesn't recognise a
  // state it saw" and "rows are arriving with no state at all" are three
  // different faults with three different fixes.
  const isUnrecognizedState = (r) => r.state !== null && !BS_GUARDRAIL_STATES.includes(r.state);
  /** Neither field readable — see `readEvaluation`: our own mapper's output. */
  const isStateless = (r) => r.state === null && r.unknownReason === null;
  const hasMalformedReason = (r) =>
    r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason);
  const malformedReasonCount = rows.filter(hasMalformedReason).length;
  const unrecognizedStateCount = rows.filter(isUnrecognizedState).length;
  const statelessCount = rows.filter(isStateless).length;
  // The union is what makes "counted once" structural. The three predicates are
  // mutually exclusive as written (a stateless row has neither a reason nor a
  // state), but summing the three counts would quietly start double-counting the
  // day one of them is widened.
  const malformed = rows.filter(
    (r) => hasMalformedReason(r) || isUnrecognizedState(r) || isStateless(r),
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
  if (statelessCount > 0) {
    malformedParts.push(
      `${statelessCount} carried no state and no unknown reason at all — every `
      + 'evaluation is written with a computed state, so this is the telemetry '
      + 'mapper emitting rows without one, not anything a coach did.',
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
  // ⚠ UNRECOGNIZED-STATE AND STATELESS ROWS ARE EXCLUDED FROM THE DENOMINATOR
  // HERE, not just counted above. Left in, they pad `sample` while matching
  // neither `'red'` nor `'unknown'` in the matchers below — diluting BOTH rates
  // DOWNWARD, the one direction this monitor must never move on its own account.
  // A silently renamed vocabulary, or a telemetry mapper that stopped writing a
  // state, would then read as an IMPROVING red/unknown rate — exactly backwards
  // for a check built to catch silent failure. Excluding them can only push
  // `rateSample` DOWN toward `insufficient_sample` — never fabricate a rate by
  // dividing by whatever recognizable rows are left — so the floor check below
  // still runs against the reduced sample, and the malformed check above (no
  // floor, any occurrence) is what actually raises the alarm.
  const rateRows = rows.filter((r) => !isUnrecognizedState(r) && !isStateless(r));
  const rateSample = rateRows.length;

  const rate = (check, matcher, max, severity, label) => {
    if (rateSample < BS_SAMPLE_FLOOR) {
      // ⚠ CARRY THE STAMP. `insufficient_sample` means "could not check", which
      // is not the same claim as "checked, and fine" — so it must not erase the
      // memory of an alert that is still open. Dropping it here let a fault that
      // merely went quiet for a day re-announce itself as brand new the moment
      // the sample recovered. `ok` is the only status allowed to clear a stamp.
      verdicts[check] = verdict('insufficient_sample', null, rateSample, stampOf(prev[check]));
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

  rate('red_rate', (r) => r.state === BS_STATE_RED, BS_RED_RATE_MAX, 'warning', 'Red');
  rate('unknown_rate', (r) => r.state === BS_STATE_UNKNOWN, BS_UNKNOWN_RATE_MAX, 'warning', 'Unknown');

  return { verdicts, alerts };
}
