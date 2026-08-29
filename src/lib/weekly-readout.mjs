// The weekly readout's week key and its response assembly.
//
// Both are pure so `node --test` can drive them: the week key decides how often
// a member's readout regenerates, and the response assembly decides what a
// member is told the readout COVERS. The second is the one that can lie — a
// stored readout rendered under this request's window would be a claim about
// days it never saw — so it is a function with vectors rather than a few
// ternaries inside the route.

import { bsWeekStartOf } from './week-merge.mjs';

/**
 * The Monday (UTC) of the week containing `nowMs`, as `YYYY-MM-DD`.
 *
 * ⚠ NOT AN ISO 'YYYY-Www' KEY, DELIBERATELY. `bsWeekStartOf` already answers
 * "which week is this" in this repo, with a round-trip calendar guard because
 * Date.UTC rolls Feb 30 into March 2 rather than failing. A week-numbering
 * string would need the ISO week-YEAR — where Jan 1 can belong to week 52 of
 * the previous year — which is a second implementation of the same question and
 * a class of off-by-one this store has no reason to own.
 *
 * ⚠ UTC, and that is narrower than it sounds. The key only bounds how often the
 * readout REGENERATES; a per-member zone resolves one instant to two different
 * weeks for a member who travels and would re-issue a readout they already
 * read — the same reasoning the notification dedup recorded for its own UTC
 * week. Where a member's own day gates what they EARN, the per-member zone is
 * required and is used; caching is not that.
 */
export function weeklyReadoutWeekStart(nowMs) {
  // ⚠ `typeof` IS LOAD-BEARING, AND MY OWN TEST IS WHAT CAUGHT IT. This read
  // `Number(nowMs)` and checked the result was finite — but `Number(null)` is a
  // finite **0**, so a null instant produced `1969-12-29`: the Monday of the
  // Unix epoch's week. Every week would then collapse into one cached row and
  // the readout would never regenerate. It is the same coercion class this repo
  // has already paid for twice (a `Number(null)` fabricating an observation in
  // the cycle read; a `value: null` nutrient fabricating a 0-kcal food row), and
  // the route calling this with `Date.now()` is what makes it latent rather than
  // shipped — a property of today's one caller, not of the function.
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const d = new Date(nowMs);
  if (Number.isNaN(d.getTime())) return null;
  return bsWeekStartOf(d.toISOString().slice(0, 10));
}

/**
 * Is this stored row a usable cache hit?
 *
 * ⚠ EXPORTED BECAUSE THE ROUTE NEEDS THE SAME ANSWER, and tightening it inside
 * `buildReadoutResponse` alone briefly made things WORSE rather than better —
 * caught by tracing the change through the caller rather than by a test. The
 * route decides whether to take its cache branch (and skip the snapshot read)
 * before it calls the assembler; with the two conditions written separately,
 * a half-row passed the route's looser check, skipped the read, and then failed
 * the assembler's stricter one — so it rendered the assembler's placeholder
 * `live` values: an EMPTY readout over a sample size of zero. That is the same
 * class as #1950's split reportability predicate, in the same feature, one PR
 * later: sharing a threshold is not sharing a predicate, and two readers of one
 * fact must read one function.
 *
 * A stored readout always cites at least one correlation — only generated
 * readouts are stored, and generation requires a pair that cleared the
 * reportability gate — so requiring both halves costs nothing real and fails
 * toward recomputation, which cannot render a lie.
 */
export function isCachedReadout(stored) {
  return !!(
    stored &&
    stored.readout &&
    Array.isArray(stored.correlations) &&
    stored.correlations.length > 0
  );
}

/**
 * Assemble the response, stamped with what the readout actually covers.
 *
 * `stored` is the row the claim returned when a finished readout already
 * existed; `live` is what this request computed. A cache hit reports the
 * STORED window, sample size, source and correlations — never the requested
 * window, and never freshly-computed correlations beside a stored readout,
 * because every insight names a correlation_key the UI plots and a key that
 * has since moved would leave the readout citing evidence the response no
 * longer contains.
 *
 * ⚠ A 'ready' ROW IS A HIT ONLY IF IT CARRIES BOTH HALVES — see
 * `isCachedReadout`. The two failure modes differ in how loud they are, and the
 * quieter one is why: a null readout under `cached: true` is at least
 * conspicuous, while a readout served beside an EMPTY correlation list renders
 * fine and is a lie, because every insight names a correlation_key the UI plots
 * and none of them would resolve.
 */
export function buildReadoutResponse({ subjectId, weekStart, stored, live }) {
  const hit = isCachedReadout(stored);
  return {
    source: hit ? stored.source : live.source,
    cached: hit,
    user_id: subjectId,
    // Null, never '', when the week could not be computed. An empty string
    // reads as a week whose name we lost; null says we never had one — and the
    // response is then honestly uncacheable rather than quietly keyed on ''.
    week_start: weekStart || null,
    window_days: hit ? stored.window_days : live.window_days,
    sample_size: hit ? stored.sample_size : live.sample_size,
    generated_at: hit ? stored.generated_at : live.generated_at,
    correlations: hit ? stored.correlations : live.correlations,
    readout: hit ? stored.readout : live.readout,
  };
}

/**
 * How long a claim is honoured before another request may take it.
 *
 * Clamped server-side too (the RPC refuses anything under 30s), so a caller
 * cannot hand itself a zero-length lease and make every request a reclaimer.
 */
export const CLAIM_LEASE_SECONDS = 300;

/**
 * The bound on one generation attempt.
 *
 * ⚠ THIS IS WHAT MAKES THE ONE-CALL BOUND A BOUND, and the relationship is the
 * whole point of stating both constants here rather than in the route. A
 * reviewer read the lease as permitting two paid model calls: A claims, A's call
 * runs past the lease, B reclaims and calls again. That interleaving needs a
 * generation still in flight after CLAIM_LEASE_SECONDS — which cannot happen,
 * because the attempt aborts at GENERATE_TIMEOUT_MS and the route finalizes or
 * releases within milliseconds of that. A dead generator is the case the reclaim
 * exists for, and a dead generator has no call in flight to duplicate.
 *
 * But that safety was resting on two numbers in two files agreeing by accident.
 * They live together now and `weeklyReadoutBoundHolds()` states the relationship
 * a test pins: the lease must be at least twice the longest attempt, so the
 * margin survives clock skew and the round-trips either side of the call.
 */
export const GENERATE_TIMEOUT_MS = 60_000;

/** Does the lease still strictly outlast the longest possible generation? */
export function weeklyReadoutBoundHolds(
  leaseSeconds = CLAIM_LEASE_SECONDS,
  timeoutMs = GENERATE_TIMEOUT_MS,
) {
  return leaseSeconds * 1000 >= timeoutMs * 2;
}
