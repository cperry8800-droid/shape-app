// Progression guardrails — the pure core (Deploy 2a).
//
// Advisory only. This module decides whether a coach-authored training week
// represents an unusually large load increase for a client, and returns flags.
// It never blocks, never rewrites a week, and never proposes an alternative.
//
// PURITY IS THE CONTRACT: no I/O, no database calls, no React, no clock reads.
// `todayISO` is the only "now" and it is an INPUT. Given the same inputs this
// module returns a deeply-equal result every time — which is the only reason the
// fixture table can be the specification.
//
// Canonical location is `public/newdesign/` (the `varianceBand.mjs` precedent):
// the web builders load it as a native ES module, mobile imports the same file
// by relative path, and the Node tests import it directly. ONE implementation,
// three consumers — the two surfaces cannot disagree because there is only one
// set of rules and one set of strings.
//
// Specification: SPEC-guardrails.md (design) and SPEC-guardrails-2a-fixtures.md
// (the FROZEN fixture table, which is the definition of done). A rule with no
// row in that table does not get built. If a test fails, the implementation is
// wrong — not the fixture.
//
// Built section by section against the table. Landed so far:
//   §2  bsInterpolateAnchors + the three anchor tables   (F1–F16)

/* ── §2. The interpolation utility ─────────────────────────────────────────
 *
 * One mechanism for all three curves, so there is one behaviour to reason about
 * and one fixture pattern to test. Linear between adjacent anchors, and FLAT
 * beyond the first and last — clamped, never extrapolated.
 *
 * The clamp is the load-bearing half. Extrapolating a ramp curve below its first
 * anchor produces ceilings above 40% for a near-zero baseline, which is where
 * percentages stop meaning anything (SPEC-guardrails.md §13.4, and the 500 AU
 * baseline floor exists for the same reason). Extrapolating above the last
 * anchor eventually produces a negative ceiling. Both are arithmetic dressed as
 * measurement; the curve is only defined inside its own domain.
 */

/** A single anchor: at `at` (the x value), the curve reads `pct`. */

/**
 * The amber ceiling — how much a week may rise over the baseline before it
 * flags. Scales INVERSELY with current load: a client at 500 AU can add 40%
 * without it meaning much, a client at 5000 AU cannot.
 *
 * Reference athletes: 600 AU → 38.2% · 1680 AU → 20.92% · 3375 AU → 12.25%.
 * SPEC-guardrails.md §5.1.
 */
export const BS_RAMP_ANCHORS = [
  { at: 500, pct: 40 },
  { at: 1500, pct: 22 },
  { at: 3000, pct: 13 },
  { at: 5000, pct: 9 },
];

/**
 * The red curve — the explicit-acknowledgment threshold. The gap over amber
 * widens from ~1.88x at 500 AU to ~2.44x at 5000 AU on purpose: at the top of
 * the curve a large percentage is a small absolute change, and red must not
 * fire on non-events. SPEC-guardrails.md §5.2.
 */
export const BS_RED_ANCHORS = [
  { at: 500, pct: 75 },
  { at: 1500, pct: 45 },
  { at: 3000, pct: 30 },
  { at: 5000, pct: 22 },
];

/**
 * The return-week fraction — after an interruption, the fraction of the
 * pre-break baseline the return week is held to. Keyed on the gap in DAYS.
 *
 * The table is only three anchors because the two ends are REGIME decisions,
 * not curve values, and must not be encoded here:
 *   - gap  < 14 days → no return rule at all; the ordinary ramp applies (F58).
 *   - gap >= 84 days → the baseline is stale; hand off to `cold_start` (F63).
 *     A regime handoff, NOT a fifth fraction.
 * Between 56 and 83 days the clamp holds it flat at 40% — defined, not
 * undefined (F117). SPEC-guardrails.md §5.3.
 */
export const BS_RETURN_ANCHORS = [
  { at: 14, pct: 70 },
  { at: 28, pct: 55 },
  { at: 56, pct: 40 },
];

/**
 * A finite JS number, and nothing that merely looks like one.
 *
 * Deliberately strict rather than `Number(v)`. Two documented hazards in this
 * repo: `Number(null)` and `Number('')` are a finite `0`, which fabricates an
 * observation out of absence; and `Number(Symbol())` THROWS rather than
 * returning NaN, which would break the never-throws contract. Testing the type
 * first sidesteps both, and satisfies F16 (`NaN` / `null` / `'x'` -> null).
 */
function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Read a piecewise-linear curve at `x`.
 *
 * Interpolates between adjacent anchors; clamps flat below the first and above
 * the last. Anchor ORDER does not matter — the input is sorted here, so a
 * retune can add a point anywhere in the config without regard to position
 * (F15). Never throws: malformed input returns null (F16), because a wrong
 * number here silently becomes a wrong ceiling, and no ceiling is safer than a
 * fabricated one.
 *
 * @param {Array<{at:number,pct:number}>} anchors
 * @param {number} x
 * @returns {number|null} the curve's value at x, or null if it cannot be read
 */
export function bsInterpolateAnchors(anchors, x) {
  if (!finite(x)) return null;
  if (!Array.isArray(anchors)) return null;

  // Copy before sorting: the exported constants are shared module state, and
  // an in-place sort would mutate a caller's table.
  const points = anchors
    .filter((a) => a && finite(a.at) && finite(a.pct))
    .slice()
    .sort((a, b) => a.at - b.at);

  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first.at) return first.pct;
  if (x >= last.at) return last.pct;

  for (let i = 0; i < points.length - 1; i += 1) {
    const lo = points[i];
    const hi = points[i + 1];
    if (x >= lo.at && x <= hi.at) {
      const span = hi.at - lo.at;
      // Two anchors at the same x carry no slope. Take the lower one rather
      // than dividing by zero into an Infinity that would read as a ceiling.
      if (span === 0) return lo.pct;
      const t = (x - lo.at) / span;
      return lo.pct + t * (hi.pct - lo.pct);
    }
  }

  // Unreachable: x is strictly inside [first.at, last.at], so some adjacent
  // pair brackets it. Returning null rather than undefined keeps the contract
  // honest if that ever stops being true.
  return null;
}
