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
  const malformed = rows.filter(
    (r) => r.unknownReason !== null && BS_MALFORMED_REASONS.includes(r.unknownReason),
  ).length;
  record(
    'malformed',
    malformed > 0 ? 'alert' : 'ok',
    malformed,
    sample,
    'error',
    `${malformed} guardrail evaluation(s) in the last 7d went unknown on malformed input `
    + `(${BS_MALFORMED_REASONS.join(' or ')}). Malformed means a shape no legitimate `
    + 'writer can emit, so this is our bug.',
  );

  // ── 3 & 4. The rate checks. Below the floor they report insufficient_sample —
  //          never zero, never a number. One unknown out of one evaluation is
  //          100% and would trip every threshold in the design.
  const rate = (check, matcher, max, severity, label) => {
    if (sample < BS_SAMPLE_FLOOR) {
      verdicts[check] = verdict('insufficient_sample', null, sample);
      return;
    }
    const hits = rows.filter(matcher).length;
    const value = hits / sample;
    record(
      check,
      value > max ? 'alert' : 'ok',
      value,
      sample,
      severity,
      `${label} rate is ${(value * 100).toFixed(1)}% over the last 7d `
      + `(${hits} of ${sample}), above the ${(max * 100).toFixed(0)}% threshold.`,
    );
  };

  rate('red_rate', (r) => r.state === 'red', BS_RED_RATE_MAX, 'warning', 'Red');
  rate('unknown_rate', (r) => r.state === 'unknown', BS_UNKNOWN_RATE_MAX, 'warning', 'Unknown');

  return { verdicts, alerts };
}
