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
 * An **OBJECT WITH AN UNREADABLE `state`** (`{}`, or `{state: null,
 * unknownReason: 'incomplete_week'}`) is the opposite, and it used to be dropped
 * here alongside the non-objects. It is exactly what the route emits for a REAL
 * `guardrail_evaluated` row whose props carry no usable `state` — and
 * `bsTelemetryProps` always writes a computed state, so such a row is a shape NO
 * LEGITIMATE WRITER CAN EMIT: the definition of malformed. Dropping it meant a
 * systematic regression in the telemetry mapper could report `malformed: ok/0`
 * while the rate checks merely fell to `insufficient_sample` — a monitor going
 * quiet exactly as it went blind. It is therefore returned (so
 * `isUnreadableState` below can count it toward malformed) and excluded from the
 * rate denominators, the same treatment unrecognized states get.
 *
 * ⚠ NOTE THE FIELD THAT DOES **NOT** RESCUE IT: a readable `unknownReason` says
 * nothing about whether a state was computed. Keying "stateless" on BOTH fields
 * being absent meant a mapper that dropped `state` while preserving a legitimate
 * reason produced rows that satisfied no malformed predicate at all — see the
 * predicate block in `bsEvaluateHealth`.
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
 * @param {{rpeDropped:number|null, evaluations:Array, previous:object|null, nowISO:string,
 *          readState:string|undefined}} input
 * @returns {{verdicts:Record<string,object>, alerts:Array<{check,severity,message}>}}
 */
export function bsEvaluateHealth({ rpeDropped, evaluations, previous, nowISO, readState }) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const rows = (Array.isArray(evaluations) ? evaluations : [])
    .map(readEvaluation)
    .filter(Boolean);
  const sample = rows.length;

  // ⚠ DID THE READ PROVE IT COVERED THE WINDOW? `bsReadState` is the single
  // source of that vocabulary and `'complete'` is its ONE proving value — every
  // other value is a different way of failing to prove it, which is why this
  // tests for the proving value rather than listing the failures (a new failure
  // state added there is then covered here for free, in the safe direction).
  //
  // ⚠ AN ABSENT `readState` READS AS UNPROVEN, NOT AS PROVEN. A caller that does
  // not describe its read has not told us the read was complete, and treating
  // silence as proof is the same fabrication this module has already paid for
  // once (`Number(null)` is a finite 0 — see `count_shifted` in
  // `bsReadStateNote`). Unproven fails toward keeping an episode OPEN, which
  // over-reports; proven-by-default fails toward closing an episode that may
  // still be running, which is the defect below. Over-reporting is recoverable;
  // a silently-closed episode is not.
  const readProved = readState === 'complete';

  const verdicts = {};
  const alerts = [];

  /**
   * Register a verdict, and an alert if it is bad and due to be announced.
   *
   * ⚠ `fromEvaluationRead` DEFAULTS TO TRUE ON PURPOSE. A check added later is
   * far more likely to read the 7d evaluations than to carry its own independent
   * exact count, so the protection is inherited by default and only a check that
   * can DEMONSTRATE its data is complete opts out.
   */
  const record = (check, status, value, sampleN, severity, message, fromEvaluationRead = true) => {
    if (status !== 'alert') {
      // ⚠ CARRY THE STAMP WHEN THE READ COULD NOT PROVE IT COVERED THE WINDOW.
      // This is the SAME rule `rate()` already applies to `insufficient_sample`,
      // widened to the case that shares its logic: an `ok` computed on a
      // truncated read means "none in what we saw", not "checked, and fine" —
      // `bsReadStateNote` says exactly that sentence to the human — so it must
      // not erase the memory of an alert that is still open. It used to, which
      // meant a fault that stayed open across a truncated run was announced
      // AGAIN as brand new by the next complete run: the flapping this control
      // exists to prevent, arriving through the read rather than the sample.
      //
      // Only a PROVEN `ok` clears a stamp. This never notifies and never
      // re-arms — a transition in neither direction, exactly like
      // `insufficient_sample`.
      //
      // ⚠ NOTHING IS DUPLICATED INTO THE VERDICT ITSELF, deliberately. The route
      // persists `_read` (state included) beside these verdicts in the same row,
      // so a human reading the history already sees WHY an `ok` could not close
      // an episode; stamping every verdict with the same fact would be a second
      // copy to keep in step with the first.
      const carried = fromEvaluationRead && !readProved ? stampOf(prev[check]) : null;
      verdicts[check] = verdict(status, value, sampleN, carried);
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
    // ⚠ NOT FROM THE EVALUATION READ — the ONE check that opts out. This count
    // comes from its own `head:true` exact-count query over `analytics_events`
    // (see the route: "nothing here can truncate"), so its `ok` really does mean
    // "checked, and fine" even on a run whose 7d evaluation read was cut short.
    // Gating it on the read would suppress a genuine recovery on complete data —
    // the over-correction, and a monitor that cannot record a recovery is as
    // useless as one that cannot record a fault.
    false,
  );

  // ── 2. malformed, ANY occurrence, no floor. Malformed is reserved for shapes
  //       NO LEGITIMATE WRITER CAN EMIT, so one row means our own code produced
  //       something it should not have. That is a bug, not a rate to trend.
  //
  // ⚠ TWO PREDICATES, THREE DIAGNOSES, folded into ONE check. A row the guardrail
  // itself flagged `unknown` on malformed input, and a row whose `state` this
  // monitor cannot read. Both are "a shape no legitimate writer can emit", and
  // both would silently switch off the very rate checks below
  // (red_rate/unknown_rate) that exist to catch a vocabulary rename by going
  // quiet. Neither is a caller bug.
  //
  // ⚠ THE STATE PREDICATE IS "NOT A RECOGNISED STATE", NOT "NO STATE AT ALL", and
  // the difference is a hole this check shipped with. It used to require BOTH
  // `state` and `unknownReason` to be absent, so a telemetry mapper that dropped
  // `state` while preserving a legitimate reason — `{state: null, unknownReason:
  // 'incomplete_week'}` — satisfied NO malformed predicate: 20 such rows reported
  // `malformed: ok/0` AND both rates `ok/0`, with the producer contract (every
  // evaluation carries a computed state) broken on every row. A state is either
  // one of `BS_GUARDRAIL_STATES` (imported from the core, never re-typed here —
  // that constant is the single source of the vocabulary) or it is unreadable;
  // no other field can vouch for it.
  //
  // Counted as ONE union, so a row cannot be double-counted by satisfying both
  // predicates — but NAMED SEPARATELY in the alert body, because "the guardrail
  // reported malformed input", "this monitor doesn't recognise a state it saw"
  // and "rows are arriving with no state at all" are three different faults with
  // three different fixes: a core rename this monitor was never told about, an
  // OLDER deploy writing a since-retired state, or our own telemetry mapper.
  const isUnreadableState = (r) => !BS_GUARDRAIL_STATES.includes(r.state);
  /**
   * ⚠ REPORTING SUB-CASES OF `isUnreadableState`, NOT extra malformed predicates.
   * They partition it (a state is either absent or present-but-unrecognized), so
   * they name a diagnosis without widening what counts as malformed.
   */
  const isUnrecognizedState = (r) => r.state !== null && isUnreadableState(r);
  const isMissingState = (r) => r.state === null;
  const hasMalformedReason = (r) =>
    r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason);
  const malformedReasonCount = rows.filter(hasMalformedReason).length;
  const unrecognizedStateCount = rows.filter(isUnrecognizedState).length;
  const missingStateCount = rows.filter(isMissingState).length;
  // ⚠ The union is what makes "counted once" structural, and it is no longer a
  // formality: the two predicates OVERLAP by construction now (a row can carry a
  // malformed reason AND an unreadable state), so the per-diagnosis counts above
  // can sum past this total. Summing them would over-report; the union cannot.
  const malformed = rows.filter(
    (r) => hasMalformedReason(r) || isUnreadableState(r),
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
  if (missingStateCount > 0) {
    malformedParts.push(
      `${missingStateCount} carried no readable state at all — every evaluation is `
      + 'written with a computed state, so this is the telemetry mapper emitting '
      + 'rows without one, not anything a coach did. A reason on the same row does '
      + 'not make up for it: a reason says nothing about whether a state was computed.',
    );
  }
  // ⚠ Say so when the diagnoses overlap. A reader who can add up three numbers
  // that exceed the total distrusts the whole alert, and a distrusted monitor is
  // as dead as a silent one.
  if (malformedReasonCount + unrecognizedStateCount + missingStateCount > malformed) {
    malformedParts.push(
      'One row can break more than one of these at once, so those counts overlap '
      + 'and do not sum to the total above.',
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
  // ⚠ EVERY ROW WITH AN UNREADABLE STATE IS EXCLUDED FROM THE DENOMINATOR HERE,
  // not just counted above — missing and unrecognized alike, and regardless of
  // what `unknownReason` says. Left in, they pad `sample` while matching neither
  // `'red'` nor `'unknown'` in the matchers below — diluting BOTH rates DOWNWARD,
  // the one direction this monitor must never move on its own account. A silently
  // renamed vocabulary, or a telemetry mapper that stopped writing a state, would
  // then read as an IMPROVING red/unknown rate — exactly backwards for a check
  // built to catch silent failure. Excluding them can only push `rateSample` DOWN
  // toward `insufficient_sample` — never fabricate a rate by dividing by whatever
  // recognizable rows are left — so the floor check below still runs against the
  // reduced sample, and the malformed check above (no floor, any occurrence) is
  // what actually raises the alarm.
  const rateRows = rows.filter((r) => !isUnreadableState(r));
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

/**
 * WHICH of the read's several failure-to-prove-completeness cases occurred.
 *
 * ⚠ THIS DOES NOT DECIDE `truncated` AND MUST NEVER BE MADE TO. The route's flag
 * is deliberately conservative and stays exactly as it is: a read that reached
 * its ceiling is flagged whether or not the count agrees, because
 * `rows === matched` IS NOT PROOF OF A COMPLETE READ. `matched` is page 0's
 * count; a row backfilled with an old `ts` into a region the cursor has already
 * paged past is never fetched AND was never counted, so the two numbers agree
 * while a row is gone. (The route's point 4/point 5 comments carry the full
 * reasoning — read them before touching either.)
 *
 * What the counts DO support is describing the run precisely instead of
 * alarmingly. `truncated` alone collapses four different events into one bit, so
 * the log line and the persisted `_read.state` read identically whether the job
 * filled its budget on a quiet week or demonstrably lost rows — and a history
 * that cannot tell those apart is one a human stops consulting. This is the
 * distinction, and nothing downstream branches on it.
 *
 *   · `complete`               — count agrees, budget not spent.
 *   · `ceiling_exact`          — budget spent, count agrees. Nothing KNOWN to be
 *                                missing (but see the warning above).
 *   · `ceiling_truncated`      — budget spent and the count disagrees: rows were
 *                                demonstrably left behind.
 *   · `ceiling_count_unknown`  — budget spent, no count to check it against.
 *   · `count_shifted`          — budget not spent, count disagrees: the set moved
 *                                under the read (either direction).
 *   · `count_unknown`          — budget not spent, no count.
 *
 * @param {{rows:number, matched:number|null, ceiling:number}} input
 * @returns {'complete'|'ceiling_exact'|'ceiling_truncated'|'ceiling_count_unknown'|'count_shifted'|'count_unknown'}
 */
export function bsReadState({ rows, matched, ceiling }) {
  const read = finite(rows) ? rows : 0;
  const cap = finite(ceiling) ? ceiling : Infinity;
  const atCeiling = read >= cap;
  if (!finite(matched)) return atCeiling ? 'ceiling_count_unknown' : 'count_unknown';
  if (matched === read) return atCeiling ? 'ceiling_exact' : 'complete';
  return atCeiling ? 'ceiling_truncated' : 'count_shifted';
}

/**
 * The human sentence for a `bsReadState`. Every non-`complete` case ends on the
 * same operational consequence — a `malformed: ok` from this run is "none in what
 * we saw", not proof of absence — because that is the only thing a reader has to
 * act on, and it is true of all of them.
 *
 * @param {{state:string, rows:number, matched:number|null, ceiling:number}} input
 * @returns {string}
 */
export function bsReadStateNote({ state, rows, matched, ceiling }) {
  const read = finite(rows) ? rows : 0;
  const said = finite(matched) ? String(matched) : 'nothing';
  const caveat = ' A malformed "ok" from this run means "none in what we saw", not proof of absence.';
  switch (state) {
    case 'ceiling_exact':
      return `The 7d evaluation read filled its ${ceiling}-row ceiling and the exact count agrees `
        + `(${read} read, count said ${said}). Nothing is known to be missing — but a read that `
        + 'spends its whole budget cannot prove it reached the end of the window, and a row '
        + 'backfilled behind the cursor would agree with the count too.' + caveat;
    case 'ceiling_truncated':
      return `The 7d evaluation read was CUT SHORT at its ${ceiling}-row ceiling: ${read} rows read, `
        + `count said ${said}. Verdicts below cover only part of the window.` + caveat;
    case 'ceiling_count_unknown':
      return `The 7d evaluation read reached its ${ceiling}-row ceiling and the exact count was `
        + `unavailable (${read} rows read), so nothing can confirm what it covered.` + caveat;
    case 'count_shifted':
      // ⚠ `finite(matched) &&`, never a bare `Number(matched)`: `Number(null)` is
      // a finite 0, so a null count would silently render as "the set GREW" —
      // fabricating a direction from data that does not exist. This module has
      // paid for that coercion once already.
      return `The 7d evaluation read saw ${read} rows but the count said ${said}: the set `
        + `${finite(matched) && read > matched ? 'GREW' : 'SHRANK'} underneath the read, so the `
        + 'window judged is not the window the count describes.' + caveat;
    case 'count_unknown':
      return `The 7d evaluation read returned no exact count (${read} rows read), so its coverage `
        + 'cannot be confirmed.' + caveat;
    default:
      return `The 7d evaluation read covered the window: ${read} rows read, count said ${said}.`;
  }
}
