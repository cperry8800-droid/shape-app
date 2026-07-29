// The publish decision — pure, no I/O, no clock reads.
//
// SPEC-guardrails.md §7.4 (kill switch), §9.2/§9.4 (the gate), §10.2 (telemetry).
//
// The core says WHAT the week is. This says what happens NEXT — and it lives in
// its own fixture-tested module for the same reason the core does: a rule that
// only exists inside a request handler is a rule nothing can pin.

import { bsClassifySession, bsScopeSessions } from '../../public/newdesign/progressionGuardrail.mjs';

/**
 * An acknowledgment is a coach saying WHY. Either half counts — a coach who
 * typed a reason but picked no code has still acknowledged; a code with no
 * prose is the interstitial's own default path.
 */
function hasAck(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  return !!(String(a.reasonCode == null ? '' : a.reasonCode).trim()
    || String(a.reasonText == null ? '' : a.reasonText).trim());
}

/**
 * Decide whether this week publishes.
 *
 * @param {{result: object, redEnabled: boolean|null, acknowledgment?: object|null}} args
 *   `redEnabled` is the value the load-history RPC returned. Anything that is
 *   not an explicit `true`/`false` means the flag could not be read, and §7.4
 *   rules that ENFORCED — deliberately.
 * @returns {{publish:boolean, status:number, displayState:string, trueState:string,
 *            redSuppressed:boolean, requiresAck:boolean, writeAck:boolean,
 *            overridden:boolean, acknowledgmentCode:string|null, reason:string|null,
 *            redPath:string|null, flagReadFailed:boolean, enforcing:boolean}}
 */
export function bsGateDecision({ result, redEnabled, acknowledgment = null } = {}) {
  const r = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  const trueState = typeof r.state === 'string' ? r.state : 'unknown';

  // Only an explicit boolean is a READ flag. A string 'false' or a 0 is a
  // transport artefact, not a decision, and treating it as advisory would turn
  // a serialization bug into a silently disabled gate.
  const flagReadFailed = redEnabled !== true && redEnabled !== false;
  const enforcing = flagReadFailed ? true : redEnabled === true;

  const base = {
    trueState,
    reason: r.reason == null ? null : r.reason,
    redPath: r.redPath == null ? null : r.redPath,
    flagReadFailed,
    enforcing,
    redSuppressed: false,
    requiresAck: false,
    writeAck: false,
    overridden: false,
    acknowledgmentCode: null,
    displayState: trueState,
    publish: true,
    status: 200,
  };

  // green, amber and unknown all publish. `unknown` is REPORTED, not enforced
  // (§9.2) — an unscoreable week is not a safe week, but blocking on it would
  // punish a coach for a blank field or one bad logged row.
  if (trueState !== 'red') return base;

  if (!enforcing) {
    // §7.4: every red is DOWNGRADED TO AMBER in everything the coach sees, and
    // publish-blocking is disabled — no acknowledgment interstitial, no 409, no
    // guardrail_red_ack entry (there is nothing to acknowledge). Telemetry keeps
    // recording the truth; see bsTelemetryProps.
    //
    // An acknowledgment that arrived anyway is IGNORED rather than recorded:
    // the publish was never blocked, so an audit row would assert an override
    // that did not happen.
    return { ...base, displayState: 'amber', redSuppressed: true };
  }

  if (!hasAck(acknowledgment)) {
    return { ...base, publish: false, status: 409, requiresAck: true };
  }

  return {
    ...base,
    writeAck: true,
    overridden: true,
    acknowledgmentCode: String(acknowledgment.reasonCode == null ? '' : acknowledgment.reasonCode).trim() || null,
  };
}

/**
 * The share of the baseline-eligible history dropped for want of a session RPE.
 *
 * §10.2: "so the cost of skipping is visible at the point it actually distorts
 * a ceiling." Derived from the SAME raw rows the core reads, through the core's
 * OWN classifier — a second implementation of "was this rated" is exactly how
 * the number starts disagreeing with the ceiling it exists to explain.
 *
 * Out-of-scope rows (device imports, §9.5) are in neither the numerator nor the
 * denominator; malformed rows are excluded from both for the same reason.
 *
 * @returns {number|null} null when nothing is in scope — never a fabricated 0.
 */
export function bsExcludedSessionRate(sessions) {
  let scoped;
  try {
    scoped = bsScopeSessions(Array.isArray(sessions) ? sessions : []);
  } catch (e) {
    return null;
  }
  let total = 0;
  let unrated = 0;
  for (let i = 0; i < scoped.length; i += 1) {
    const c = bsClassifySession(scoped[i], i);
    if (c.malformed) continue;
    total += 1;
    if (!c.rated) unrated += 1;
  }
  if (total === 0) return null;
  return unrated / total;
}

/**
 * The `guardrail_evaluated` props (§10.2).
 *
 * ⚠ `state` is ALWAYS THE TRUE COMPUTED STATE, never the value shown to the
 * coach. That is the entire point of the kill switch: we keep a clean read of
 * what red WOULD have fired on, so the caps can be retuned from real data
 * before red is switched back on. A switch that also suppressed the telemetry
 * would leave us blind precisely when we most needed to see.
 *
 * ⚠ NO CLIENT IDENTIFIER. Aggregate only, never read for an individual case —
 * `ai_audit_log` is authoritative for anything coach-facing or legal (§10.1).
 *
 * ⚠ DEVIATION from §10.2's field list, ADDITIVE: the spec names one
 * `reasonCode`, but two disjoint vocabularies want it — the coach's OVERRIDE
 * code and the core's `unknown` reason. Mixing them in one column makes every
 * later aggregate query ambiguous, so they ride as `reasonCode` (override) and
 * `unknownReason` (core). Nothing was removed.
 */
export function bsTelemetryProps({ result, decision, excludedSessionRate, adjustMode }) {
  const r = result && typeof result === 'object' ? result : {};
  const d = decision && typeof decision === 'object' ? decision : {};
  const axesList = Array.isArray(r.axes) ? r.axes : [];

  // The axes that actually tripped, when any did. A green week contributes
  // none, but the retune still wants to know which axes were LIVE — an empty
  // list there would read as "nothing was evaluated".
  const contributing = Array.isArray(r.contributingAxes) ? r.contributingAxes : [];
  const axes = contributing.length
    ? contributing
    : axesList.map((a) => (a && a.axis) || null).filter(Boolean);

  // The tightest ceiling any axis reported — the one the week is actually
  // pressing against. Null when no axis produced one (unknown, not_evaluable).
  const pcts = axesList
    .map((a) => (a && typeof a.ceilingPct === 'number' && Number.isFinite(a.ceilingPct) ? a.ceilingPct : null))
    .filter((p) => p !== null);

  return {
    state: r.state == null ? null : r.state,
    regime: r.regime == null ? null : r.regime,
    redPath: r.redPath == null ? null : r.redPath,
    axes,
    baselineAu: r.baseline && r.baseline.au != null ? r.baseline.au : null,
    proposedAu: r.proposed && r.proposed.totalAu != null ? r.proposed.totalAu : null,
    ceilingPct: pcts.length ? Math.min(...pcts) : null,
    overridden: !!d.overridden,
    reasonCode: d.overridden ? (d.acknowledgmentCode || null) : null,
    unknownReason: r.state === 'unknown' ? (r.reason || null) : null,
    excludedSessionRate: typeof excludedSessionRate === 'number' && Number.isFinite(excludedSessionRate)
      ? excludedSessionRate
      : null,
    redSuppressed: !!d.redSuppressed,
    adjustMode: adjustMode || null,
  };
}
