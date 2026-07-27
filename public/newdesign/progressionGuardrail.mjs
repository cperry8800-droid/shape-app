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
//   §3  load derivation — eligible / rated / session AU  (F17–F29, F130–F133)
//   §4a week bucketing — the client's local Monday-start weeks (F41, F42,
//       F112, F119–F128)
//   §4b the baseline — bounded trailing window, median, 500 AU floor
//       (F35–F40, F99–F108, F113–F116)
//   §5  the proposed week + the cold-start ceilings and axes
//       (F43–F50, F69–F71, F87, F105, F115)
//   §6  the measured regime — the ramp curve read at the client's baseline
//       (F52–F57)
//   §7  the return regime + regime resolution — the gap, the return cap, and
//       the 84-day handoff to cold start (F58–F67, F82, F101, F117)
//   §8  the concentration axis finished — the hard day measured against the
//       client's own hardest logged session (F72–F75)
//   §9  state resolution — green / amber / red, the curve and compound paths,
//       and the sub-3-session suppression (F48–F50, F76–F84)
//   §10 bsProgressionGuardrail — the one entry point, and honest absence
//       (F85–F92, F110–F112, F118)
//   §11 bsGuardrailCopy — the only source of guardrail wording, and the one
//       place display rounding happens (F51, F68, F93–F98)

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
 * The lowest load either curve is DEFINED at — the anchor tables' first x.
 *
 * ⚠ THIS IS THE SAME 500 AS `BS_BASELINE_FLOOR_AU`, AND THAT IS NOT A
 * COINCIDENCE. Three rules share this boundary and must move together:
 *   1. the ramp/red curves' own domain (this constant — the tables start here),
 *   2. the measured-baseline floor (§4b rule B2), and
 *   3. the general rule that a PERCENTAGE OF A SMALL NUMBER IS MEANINGLESS,
 *      which is why 1 and 2 exist at all.
 * Retuning the lowest ramp anchor moves all three. DERIVED from the table
 * rather than written as a literal so it cannot drift away from it, with the
 * red table's first anchor and the baseline floor both asserted equal in the
 * suite — if they ever diverge that fails loudly instead of silently reading a
 * curve outside its own domain.
 */
export const BS_CURVE_DOMAIN_FLOOR_AU = Math.min(...BS_RAMP_ANCHORS.map((a) => a.at));

// The calibration is CONFIGURATION, not state. These tables are exported and
// read on every evaluation by three consumers, so a stray write would silently
// recalibrate the guardrail for the life of the process. The interpolator
// already sorts a filtered COPY rather than the original — freezing closes the
// other half. §13.4 promises a retune of exactly these numbers: that is a
// source edit, never a runtime one.
[BS_RAMP_ANCHORS, BS_RED_ANCHORS, BS_RETURN_ANCHORS].forEach((table) => {
  table.forEach((anchor) => Object.freeze(anchor));
  Object.freeze(table);
});

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

  // `.filter()` already returns a NEW array, and that — not any later copy —
  // is what stops the sort mutating a caller's table. The exported constants
  // are shared module state; an in-place sort would reorder them for every
  // later reader.
  const points = anchors
    .filter((a) => a && finite(a.at) && finite(a.pct))
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

/* ── §3. Load derivation ───────────────────────────────────────────────────
 *
 * What a logged session contributes to a week's load. Three states per session,
 * and the difference between them is the whole point:
 *
 *   MALFORMED  a caller bug — a negative duration, an RPE of 11. Reported by
 *              name, never clamped and never silently dropped (rule C). One
 *              malformed row turns the whole evaluation `unknown`, because a
 *              client-side defect must not quietly produce a wrong baseline
 *              forever. `unknown` does not block publish (rule D).
 *   ABSENT     honest, expected, handled by EXCLUSION — an unrated session, a
 *              wall-clock overrun nobody confirmed. Contributes no AU and is
 *              not an error.
 *   RATED      a real measurement. Contributes rpe x minutes.
 *
 * Absent must never become a zero. A session with no rating that scored 0 AU
 * would enter the week's sum as a real, very light session and deflate the
 * baseline — which loosens every future ceiling. That is the dangerous
 * direction, and it is the reason F20 exists.
 */

/** Wall-clock minutes past which an UNCONFIRMED duration stops being evidence. */
export const BS_SESSION_MINUTES_CEILING = 150;

/** The rating scale the completion prompt actually offers. */
export const BS_RPE_MIN = 1;
export const BS_RPE_MAX = 10;

/**
 * Describe a value for a malformed report without ever throwing.
 *
 * `${Symbol()}` throws a TypeError, so a malformed row carrying a Symbol would
 * crash the very reporting path built to survive malformed rows. `String(sym)`
 * is safe; everything else is bounded so a huge string cannot ride into
 * telemetry.
 */
function describe(v) {
  const t = typeof v;
  if (t === 'symbol') return String(v);
  if (v === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'number' || t === 'boolean') return String(v);
  if (t === 'string') return v.length > 40 ? `${JSON.stringify(v.slice(0, 40))}...` : JSON.stringify(v);
  if (Array.isArray(v)) return `array(${v.length})`;
  return t;
}

function issue(index, field, value, id) {
  const report = { index, field, value: describe(value) };
  // A proposed session carries a coach-authored id; a history row has only its
  // position. Naming the id is what lets the builder highlight the offending
  // row rather than the whole week (F85, F86).
  if (id !== undefined) report.id = describe(id);
  return report;
}

/**
 * Coerce a wire value to a number WITHOUT any of the coercions that fabricate.
 *
 * `session_rpe` is `numeric(3,1)`, and PostgREST returns `numeric` as TEXT to
 * preserve precision — so a stored 7 arrives as the string `"7.0"`, not the
 * number 7. Parsing has to happen before any integer test or every valid rating
 * in production would read as malformed. (This repo has already paid for the
 * same lesson once: see the `varianceBand.mjs` note about numeric-as-string.)
 *
 * What is deliberately NOT coerced:
 *   - `''` -> `Number('')` is a finite 0, which would turn junk into "absent".
 *   - `true` -> `Number(true)` is 1, a perfectly valid-looking rating.
 *   - `Symbol()` -> `Number()` THROWS on it rather than returning NaN.
 * Each returns NaN here, and NaN fails the integer test, so all three land as
 * malformed rather than as a fabricated rating.
 */
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/* ── §4a. Week bucketing — the client's own calendar ───────────────────────
 *
 * A "week" is a Monday-start week IN THE CLIENT'S LOCAL TIME, not in UTC. The
 * core takes the instant plus an IANA zone and does the conversion itself
 * (rule E), because a pre-localised date would push the conversion into SQL —
 * the one place it cannot be fixture-tested, which is exactly the objection
 * that moved load derivation in here.
 *
 * A Sunday-evening session in New York belongs to the week the client trained
 * it in; read as UTC the same instant is Monday and lands in the NEXT week,
 * shifting load between two baselines (F119 / F120).
 *
 * KNOWN PROPERTY, deliberate: all history buckets under the client's CURRENT
 * zone. There is no per-session stored zone — the caller stamps one zone on
 * every row — so a client who moves country sees old weeks re-bucket and a
 * baseline can move without any new training (F128). Accepted knowingly:
 * travel is rare, the shift is a session or two near a boundary, and the
 * guardrail is advisory. Documented so nobody "fixes" it later.
 */

/**
 * `Intl.DateTimeFormat` construction is not free and the zone repeats on every
 * row, so formatters are memoised. Pure: same zone in, same formatter out, and
 * an invalid zone caches its `null` so the RangeError is paid once.
 */
const zoneFormatters = new Map();

/** How many zone formatters may be held at once. See `zoneFormatter`. */
const BS_ZONE_CACHE_MAX = 64;

function zoneFormatter(timeZone) {
  // A non-string zone must be rejected BEFORE construction. `timeZone:
  // undefined` and `timeZone: null` do not throw — they silently fall back to
  // the RUNTIME's zone, which would bucket a client's history under whichever
  // machine happened to evaluate it. That is the one failure mode this whole
  // section exists to prevent.
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return null;
  if (zoneFormatters.has(timeZone)) return zoneFormatters.get(timeZone);

  // ⚠ BOUNDED. The publish route (SPEC §9.2) is a long-lived Node process, and
  // every history row's `timezone` reaches this map — a caller sending rows
  // with distinct garbage zones would grow it permanently across requests. The
  // real world has a few hundred zones and one client uses one; evicting the
  // oldest entry past the cap costs a rebuild nobody notices.
  if (zoneFormatters.size >= BS_ZONE_CACHE_MAX) {
    zoneFormatters.delete(zoneFormatters.keys().next().value);
  }

  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    fmt = null; // RangeError: an unknown zone. Absent, and reported as malformed.
  }
  zoneFormatters.set(timeZone, fmt);
  return fmt;
}

const DAY_MS = 86400000;

/** An explicit UTC designator or numeric offset. See bsLocalWeek. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function isoDateFromUtcMs(ms) {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The Monday that starts the week containing a UTC-anchored calendar date.
 *
 * The ONE place the week boundary is decided, shared by session bucketing and
 * the baseline window — two Monday rules is how they come to disagree about
 * which week a session belongs to.
 */
function mondayIsoFromUtcMs(ms) {
  const mondayIndex = (new Date(ms).getUTCDay() + 6) % 7; // 0 = Monday
  return isoDateFromUtcMs(ms - mondayIndex * DAY_MS);
}

/**
 * Parse a bare `YYYY-MM-DD` calendar date to a UTC anchor, or NaN.
 *
 * Deliberately NOT `Date.parse`: that accepts a whole grammar of other forms
 * (`2026-08`, `Aug 3 2026`, an instant with an offset) and would silently take
 * a value this module has no business interpreting. `todayISO` and every
 * bucketed week start are plain calendar dates, so the parser is too.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcMsFromIsoDate(iso) {
  if (typeof iso !== 'string') return NaN;
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(ms)) return NaN;
  // Reject a date that does not exist (2026-02-31 rolls forward into March).
  // A caller supplying an impossible date is a bug, not a date to guess at.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return NaN;
  }
  return ms;
}

/**
 * Resolve an instant to the client's local date and the Monday that starts its
 * week.
 *
 * @param {*} startedAtISO the instant, as stored — MUST carry an explicit offset
 * @param {*} timeZone an IANA zone name
 * @returns {{localDateISO:string, weekStartISO:string}|null} null if either input is unusable
 */
export function bsLocalWeek(startedAtISO, timeZone) {
  if (typeof startedAtISO !== 'string') return null;
  const raw = startedAtISO.trim();
  // An offset is REQUIRED. `Date.parse('2026-08-03T02:40:00')` — no designator —
  // is interpreted in the RUNTIME's zone by spec, so the same history would
  // bucket differently on two machines. Rejecting it keeps the module
  // deterministic, and `timestamptz` always serialises with an offset anyway.
  if (!HAS_OFFSET.test(raw)) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;

  const fmt = zoneFormatter(timeZone);
  if (!fmt) return null;

  const parts = fmt.formatToParts(new Date(ms));
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : NaN;
  };
  const y = get('year');
  const m = get('month');
  const d = get('day');
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

  // Anchor the LOCAL calendar date in UTC and do the day arithmetic there.
  // Subtracting milliseconds from the original instant instead would be wrong
  // across a DST transition, where a local day is 23 or 25 hours long (F123,
  // F126) — calendar arithmetic has no such day.
  const anchor = Date.UTC(y, m - 1, d);
  return {
    localDateISO: isoDateFromUtcMs(anchor),
    weekStartISO: mondayIsoFromUtcMs(anchor),
  };
}

/**
 * Classify one logged session.
 *
 * Every problem with the row is collected, not just the first, so a coach's
 * "could not check" line and the telemetry behind it name everything that is
 * wrong rather than revealing one defect per fix.
 *
 * @param {*} session a raw history row — assume nothing about it
 * @param {number} index its position, so a malformed row can be named
 * @returns {{malformed:boolean, issues:Array, eligible:boolean, rated:boolean,
 *            au:number|null, weekStartISO:string|null, localDateISO:string|null}}
 */
export function bsClassifySession(session, index = 0) {
  const bad = (issues) => ({
    malformed: true,
    issues,
    eligible: false,
    rated: false,
    au: null,
    weekStartISO: null,
    localDateISO: null,
  });

  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return bad([issue(index, 'session', session)]);
  }

  const { startedAtISO, timezone, durationSec, sessionRpe, durationConfirmed } = session;
  const issues = [];

  // ── When it happened, in the client's own calendar.
  const when = bsLocalWeek(startedAtISO, timezone);
  if (!when) {
    // Name whichever half is at fault so the report is actionable. An unknown
    // zone is never silently bucketed in UTC — that would fabricate a week
    // boundary the client never experienced (F125).
    if (typeof startedAtISO !== 'string' || !HAS_OFFSET.test(String(startedAtISO).trim())
        || !Number.isFinite(Date.parse(String(startedAtISO).trim()))) {
      issues.push(issue(index, 'startedAtISO', startedAtISO));
    }
    if (!zoneFormatter(timezone)) {
      issues.push(issue(index, 'timezone', timezone));
    }
    if (issues.length === 0) issues.push(issue(index, 'startedAtISO', startedAtISO));
  }

  // ── Duration. Required, and the load is meaningless without it.
  //
  // Deliberately strict where the rating below is tolerant: `duration_seconds`
  // is `integer`, and PostgREST returns int4 as a JSON NUMBER, so a string here
  // means something upstream is wrong. `session_rpe` is `numeric`, which
  // crosses the wire as text — hence the parse there and not here. If that ever
  // stops being true the whole history reads malformed, which surfaces loudly
  // as "could not check" plus telemetry rather than failing silently.
  if (!finite(durationSec) || durationSec < 0) {
    issues.push(issue(index, 'durationSec', durationSec));
  }

  // ── RPE. Ruled order, applied exactly as written:
  //   1. null / undefined / exactly 0  -> ABSENT (not rated). The column is
  //      nullable and its CHECK permits 0, but the prompt only ever writes
  //      whole numbers 1-10, so a stored 0 means "not rated" — never "zero
  //      effort" (F20).
  //   2. not an integer                -> MALFORMED (F130, F131, F132)
  //   3. integer outside [1, 10]       -> MALFORMED (F29)
  //   4. otherwise                     -> RATED
  //
  // Steps 2 and 3 exist because a value can be STORABLE without being
  // PRODUCIBLE. `numeric(3,1)` holds one decimal place across the whole range,
  // so 0.5 and 7.5 are equally impossible from a whole-number prompt and are
  // equally a defect. Reporting them is the point of rule C — the cost is an
  // `unknown` that does not block publish; the cost of swallowing them is a
  // wrong baseline forever.
  //
  // ⚠ STEP 2 IS THE SINGLE LINE TO REVERSE if half-point RPE (6.5 / 7.5 / 8.5,
  // a real strength-training convention) is ever added to the prompt. The
  // column type already supports it — `numeric(3,1)` is kept for exactly that
  // reason and must NOT be narrowed to an integer type. Relax the integer test
  // to a half-step test and steps 1, 3 and 4 stand unchanged.
  let rpe = null;
  if (sessionRpe !== null && sessionRpe !== undefined) {
    const n = toNumber(sessionRpe);           // "7.0" -> 7, '' / true / Symbol -> NaN
    if (n !== 0) {                            // step 1: 0 (in any wire form) is absent
      if (!Number.isInteger(n) || n < BS_RPE_MIN || n > BS_RPE_MAX) {
        issues.push(issue(index, 'sessionRpe', sessionRpe)); // steps 2 and 3
      } else {
        rpe = n;                              // step 4
      }
    }
  }

  // Any problem at all and the row measures nothing. Rule C: reported by name,
  // never clamped into something usable and never silently dropped.
  if (issues.length > 0) return bad(issues);

  const rated = rpe !== null;

  // ── Eligibility. A session with no duration measures nothing (F18), and an
  // unconfirmed wall-clock overrun is the TIMER's word, not the member's — the
  // clock runs whether or not anyone is training, so a forgotten timer would
  // inflate the baseline and loosen every future ceiling (F22).
  //
  // `durationConfirmed` is treated as a boolean flag: only a truthy value is a
  // confirmation. A missing flag therefore reads as unconfirmed, which excludes
  // rather than includes — the safe direction, and not a malformed row.
  const overrun = durationSec > BS_SESSION_MINUTES_CEILING * 60;
  const inferredOverrun = overrun && !durationConfirmed;
  const eligible = durationSec > 0 && !inferredOverrun;

  // Ineligible sessions are not rated either. An excluded overrun must not
  // linger in the denominator as an "unrated" session — it is not a session we
  // failed to rate, it is a session we do not have a length for (F27).
  const isRated = eligible && rated;

  return {
    malformed: false,
    issues: [],
    eligible,
    rated: isRated,
    // The PARSED rating, never the raw wire value — "7.0" x 60 would be a
    // string-times-number coercion waiting to surprise someone.
    au: isRated ? rpe * (durationSec / 60) : null,
    weekStartISO: when.weekStartISO,
    localDateISO: when.localDateISO,
  };
}

/**
 * Derive one week's load from its logged sessions.
 *
 * `loadAu` sums the RATED sessions only. `measured` is the qualifying rule:
 * strictly more than half of the eligible sessions carry a rating, so a week
 * split exactly down the middle does NOT qualify (F31) — a baseline built from
 * half-guesses is not a measurement.
 *
 * @param {*} sessions
 * @returns {{eligible:number, rated:number, loadAu:number, measured:boolean,
 *            hardestAu:number, malformed:Array}}
 */
export function bsWeekLoad(sessions) {
  if (!Array.isArray(sessions)) {
    // Not a caller bug we can name a row for — the whole collection is wrong.
    return {
      eligible: 0,
      rated: 0,
      loadAu: 0,
      measured: false,
      hardestAu: 0,
      malformed: [issue(-1, 'sessions', sessions)],
    };
  }
  const malformed = [];
  const classified = [];
  sessions.forEach((s, i) => {
    const c = bsClassifySession(s, i);
    if (c.malformed) malformed.push(...c.issues);
    else classified.push(c);
  });
  return { ...tally(classified), malformed };
}

/**
 * Sum a set of already-classified, non-malformed sessions into one week.
 *
 * `hardestAu` rides here rather than being recomputed later because it comes
 * from the same pass over the same rows, and a second traversal is a second
 * chance to disagree.
 */
function tally(classified) {
  let eligible = 0;
  let rated = 0;
  let loadAu = 0;
  let hardestAu = 0;
  for (const c of classified) {
    if (c.eligible) eligible += 1;
    if (c.rated) {
      rated += 1;
      loadAu += c.au;
      // `>` vs `>=` here is an EQUIVALENT mutation — both leave the max. Noted
      // so a future sweep does not chase it as an unguarded fact.
      if (c.au > hardestAu) hardestAu = c.au;
    }
  }
  return { eligible, rated, loadAu, measured: rated > eligible / 2, hardestAu };
}

/**
 * Group logged sessions into the client's local Monday-start weeks.
 *
 * Weeks come back sorted ascending by `weekStartISO`, so the ORDER sessions
 * arrive in cannot change the answer (F41). Several sessions on one date all
 * count — a date is not a key (F42). Weeks with no sessions are simply absent
 * rather than present-and-empty: an absent week is not a week of zero training,
 * and Section 4b's qualifying rules must not read it as one.
 *
 * @param {*} sessions
 * @returns {{weeks:Array<{weekStartISO:string, eligible:number, rated:number,
 *            loadAu:number, measured:boolean, realSessions:number,
 *            hardestAu:number, sessions:number}>, malformed:Array}}
 */
export function bsBucketWeeks(sessions) {
  if (!Array.isArray(sessions)) {
    return { weeks: [], malformed: [issue(-1, 'sessions', sessions)] };
  }

  const malformed = [];
  const byWeek = new Map();

  sessions.forEach((s, i) => {
    const c = bsClassifySession(s, i);
    if (c.malformed) {
      malformed.push(...c.issues);
      return;
    }
    const key = c.weekStartISO;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(c);
  });

  const weeks = [...byWeek.entries()]
    .map(([weekStartISO, classified]) => ({
      weekStartISO,
      sessions: classified.length,
      ...tally(classified),
    }))
    // ISO dates are zero-padded and fixed-width, so a plain code-unit compare
    // is a correct chronological sort. `localeCompare` is deliberately avoided:
    // its collation varies by ICU build, and this ordering is a contract two
    // surfaces share.
    .sort((a, b) => (a.weekStartISO < b.weekStartISO ? -1 : a.weekStartISO > b.weekStartISO ? 1 : 0));

  return { weeks, malformed };
}

/* ── §4b. The baseline — the bounded trailing window ───────────────────────
 *
 * Rule A: the median of the most recent QUALIFYING weeks — at most 4, at least
 * 3 — searching back at most 12 calendar weeks (84 days) from `todayISO`.
 * Both bounds are load-bearing and pull in opposite directions: "last N
 * calendar weeks" starves a sparse logger, "last N qualifying weeks" reaches
 * back indefinitely into stale data.
 *
 *   - at most 4  — one training block. Memory that adapts at the rate training
 *                  actually changes.
 *   - at least 3 — below that there is no baseline, only a guess.
 *   - 84 days    — the SAME number as the stale-baseline horizon, deliberately.
 *                  One staleness concept expressed once; two horizons is how
 *                  they come to disagree.
 *
 * Rule B, kept as two separate guards on purpose:
 *   B1 `baseline <= 0` is unreachable by construction (a measured week needs a
 *      rated session, which has positive AU) — and asserted anyway, because
 *      that is exactly the class of reasoning that turns out to be wrong and
 *      the failure is severe: every ceiling becomes 0 and every week goes red.
 *      ⚠ It also catches the case the floor test CANNOT: `NaN < 500` is FALSE,
 *      so a NaN baseline sails straight through a naive floor check.
 *   B2 `baseline < 500 AU` → no baseline. 500 is the ramp curve's own lowest
 *      anchor; below it the curve is outside its domain and a percentage is
 *      arithmetic dressed as measurement. A 200 AU beginner adding a second
 *      session is a 100% increase — the guardrail would be at its loudest for
 *      the people least able to read it. Under the floor the absolute
 *      session-count caps govern, which is what they were calibrated for.
 */

/** Below this, a week has no baseline and no percentage is computed against it. */
export const BS_BASELINE_FLOOR_AU = 500;

/** The window: at least this many qualifying weeks, at most that many. */
export const BS_WINDOW_MIN_WEEKS = 3;
export const BS_WINDOW_MAX_WEEKS = 4;

/** How far back the window may search — 12 calendar weeks, the stale horizon. */
export const BS_WINDOW_REACH_DAYS = 84;

/**
 * A session must clear this to count as real training for GAP detection.
 *
 * A gap is a run of consecutive days with no session ABOVE this floor, so a
 * 60 AU walk does not reset an interruption (F64) and a 140 AU session does
 * (F65). Each week carries its own count of such sessions (`realSessions`).
 *
 * ⚠ This floor does NOT filter the baseline window. F103 pins four weeks of
 * ~0.02 AU sub-minute sessions as QUALIFYING — they reach the floor test and
 * report `baseline_below_floor`, which they could not do if the gap floor had
 * already excluded them. Light weeks are still weeks; the gap rule decides
 * regimes (§7), not membership of the median.
 */
export const BS_GAP_SESSION_FLOOR_AU = 100;

/**
 * The median — the mean of the middle PAIR when the count is even (F39).
 *
 * A median, not a mean, because one abnormally light week must not drag the
 * baseline down (F37) and one huge week must not inflate it (F38). Those two
 * rows are the whole reason this is not an average.
 */
export function bsMedian(values) {
  if (!Array.isArray(values)) return null;
  const nums = values.filter(finite).slice().sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = nums.length >> 1;
  return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Is a computed baseline usable — rule B, both halves, in one place.
 *
 * Exported so B1 can be asserted INDEPENDENTLY of B2 (F104, F116), which is the
 * whole point of keeping them separate: `baseline <= 0` is unreachable through
 * real sessions, so the only honest way to pin the guard is to call it directly.
 *
 *   B1  not a positive finite number  -> unusable. Catches 0, negatives, and
 *       NaN — and NaN is the one a bare `< 500` check silently passes.
 *   B2  below the ramp curve's own lowest anchor -> unusable.
 */
export function bsIsUsableBaseline(au) {
  if (!finite(au) || au <= 0) return false;   // B1
  return au >= BS_BASELINE_FLOOR_AU;          // B2 — the floor is BELOW, not at
}

/**
 * Derive the baseline from a client's logged history.
 *
 * `todayISO` is the only "now" and it is an INPUT — never a clock read. It is a
 * bare client-local calendar date, matching the dates weeks are bucketed on, so
 * the comparison is calendar-to-calendar with no zone arithmetic left to do.
 *
 * @param {*} sessions raw history rows
 * @param {*} todayISO 'YYYY-MM-DD', the client's local today
 * @returns {{au:number|null, rawAu:number|null, hardestLoggedAu:number|null,
 *            basis:'measured'|'none', weeks:number, window:Array,
 *            reason:string|null, malformed:Array}}
 */
export function bsBaseline(sessions, todayISO) {
  const { weeks, malformed } = bsBucketWeeks(sessions);

  const none = (reason, extraIssues = []) => ({
    au: null,
    rawAu: null,
    hardestLoggedAu: null,
    basis: 'none',
    weeks: 0,
    window: [],
    reason,
    malformed: extraIssues.length ? [...malformed, ...extraIssues] : malformed,
  });

  // ── `todayISO` itself can be a caller bug, and it is not history.
  //
  // ⚠ DECISION BEYOND THE TABLE: no fixture supplies a malformed `todayISO`.
  // Reported as malformed rather than guessed at, following rule C — the whole
  // window is measured from this date, so silently defaulting it would produce
  // a confidently wrong baseline instead of an honest "could not check".
  const todayMs = utcMsFromIsoDate(todayISO);
  if (!Number.isFinite(todayMs)) {
    return none('malformed_history', [issue(-1, 'todayISO', todayISO)]);
  }

  if (!Array.isArray(sessions)) return none('malformed_history');

  // No history at all is a DIFFERENT answer from history we cannot use (F107
  // vs F106): one is "not enough logged", the other is "logged but unusable",
  // and a coach reads them differently.
  if (sessions.length === 0) return none('no_history');

  const currentMonday = mondayIsoFromUtcMs(todayMs);
  const reachStart = isoDateFromUtcMs(todayMs - BS_WINDOW_REACH_DAYS * DAY_MS);

  // ISO dates are zero-padded and fixed-width, so a plain string compare is a
  // correct chronological compare — same reasoning as the week sort.
  // A week qualifies when it is MEASURED, complete, and in reach — and nothing
  // more. In particular it is NOT filtered on the gap floor: F103 pins four
  // weeks of ~0.02 AU sub-minute sessions as qualifying (they reach the
  // baseline floor test and report `baseline_below_floor`), so a week whose
  // every session is light still counts as a week. F40's "week inside a
  // detected gap" is therefore the EMPTY week — a week with no training must
  // not enter the median as a zero — which holds by construction here, because
  // bucketing never materialises a week that has no sessions.
  const qualifying = weeks.filter((w) => (
    // Strictly more than half of the eligible sessions carry a rating.
    w.measured
    // ⚠ DECISION BEYOND THE TABLE: COMPLETED weeks only. The week containing
    // `todayISO` is still being lived — on a Tuesday it holds one session and
    // would enter the median as a genuine light week, dragging the baseline
    // down and TIGHTENING every ceiling. SPEC-guardrails.md §6.1 says
    // "completed measured weeks", which is the textual ground for this; no
    // fixture row pins it either way.
    && w.weekStartISO < currentMonday
    // Within reach: 84 days back from today, measured at the week's own start.
    && w.weekStartISO >= reachStart
  ));

  // The most recent 4. Weeks arrive ascending, so the tail is the recent end;
  // anything older simply does not enter the median (F102).
  //
  // NOT named `window`: shadowing the browser global inside a module that must
  // never touch it is a hazard — a later `window.foo` meant as the global would
  // silently read this array — and it makes every purity grep noisy. The
  // RETURNED field keeps the domain name.
  const windowWeeks = qualifying.slice(-BS_WINDOW_MAX_WEEKS);

  if (windowWeeks.length < BS_WINDOW_MIN_WEEKS) {
    // ⚠ DECISION BEYOND THE TABLE: the table names `no_qualifying_weeks` for
    // ZERO qualifying weeks (F106) and never names a reason for one or two.
    // Reusing it there would report "no qualifying weeks" about a client who
    // has two — a small lie, and this module's whole contract is that it does
    // not tell them. `insufficient_weeks` is new vocabulary, flagged as such.
    const reason = windowWeeks.length === 0 ? 'no_qualifying_weeks' : 'insufficient_weeks';
    return {
      au: null,
      rawAu: null,
      hardestLoggedAu: null,
      basis: 'none',
      weeks: windowWeeks.length,
      window: windowWeeks,
      reason,
      malformed,
    };
  }

  const au = bsMedian(windowWeeks.map((w) => w.loadAu));

  // The hardest single session anywhere in the window — what §8 compares a
  // proposed hard day against. Taken from the SAME window as the median so the
  // two can never describe different stretches of training. Zero means the
  // window holds no rated session at all, which is absence rather than a
  // hardest session of nothing.
  //
  // ⚠ THE ZERO BRANCH CANNOT FIRE FROM HERE, and a perturbation sweep proved
  // it: a week only qualifies when `rated > eligible / 2`, and a zero-AU
  // session is not even ELIGIBLE — so every window that reaches this line holds
  // a rated session with real load. Kept because the field is genuinely
  // nullable to its callers (§8 falls back to the absolute peak bound when it
  // is null) and because "cannot fire" is the claim that stops being true.
  const hardest = windowWeeks.reduce((max, w) => (w.hardestAu > max ? w.hardestAu : max), 0);

  // `rawAu` carries the computed figure for telemetry while `au` stays null, so
  // nothing downstream can divide by a baseline this function has rejected.
  const unusable = !bsIsUsableBaseline(au);
  return {
    au: unusable ? null : au,
    rawAu: finite(au) ? au : null,
    hardestLoggedAu: hardest > 0 ? hardest : null,
    basis: unusable ? 'none' : 'measured',
    weeks: windowWeeks.length,
    window: windowWeeks,
    // ⚠ B1 vs B2 are different failures. `bsIsUsableBaseline` rejects on
    // non-finite / <= 0 (B1 — a median that is not a number at all) AND on
    // below-500 (B2 — a real figure the floor rejects). Reporting
    // `baseline_below_floor` for the first would name the wrong cause in
    // telemetry: 499 is below the floor, NaN is not a measurement.
    reason: unusable
      ? (finite(au) && au > 0 ? 'baseline_below_floor' : 'baseline_unreadable')
      : null,
    malformed,
  };
}

/* ── §5. The proposed week, and the cold-start ceilings ────────────────────
 *
 * `cold_start` is the LAUNCH regime, not a rare fallback: `workout_sessions`
 * held zero rows at design time, so every client begins here and stays until
 * three rated weeks have accumulated. The caps are calibrated for that job — a
 * limit for a client of UNKNOWN training status — not for a worst-case
 * deconditioned beginner.
 *
 * Absolute caps, not percentages, because there is nothing to take a percentage
 * OF. The weekly cap scales with the proposed week's own session count, which
 * is the one thing the week declares about the client with no history and no
 * intake: a coach writing six sessions is asserting something a two-session
 * week is not.
 *
 * The cost, stated plainly: caps loose enough to leave a normal intermediate
 * week green are necessarily loose for a genuinely deconditioned beginner, who
 * reaches only amber at 3 x 600 AU. Nothing closes that gap without knowing who
 * the client is, and the free-text intake columns cannot supply it. Amber is a
 * visible flag, not silence, so the trade is the right one.
 */

/** Weekly total: `sessions x k`. 600 AU ~ 75 min at RPE 8, as a weekly AVERAGE. */
export const BS_COLD_START_WEEKLY_AMBER_PER_SESSION = 600;
export const BS_COLD_START_WEEKLY_RED_PER_SESSION = 850;

/**
 * The hardest single session, in absolute AU.
 *
 * Deliberately higher than the weekly average allowance: one hard day among
 * several is normal, every day being that hard is not. 700 AU ~ 90 min at
 * RPE 8; 1000 AU ~ 120 min at RPE 8.5. Applies INDEPENDENTLY of the weekly
 * total — a week that is comfortably green overall still flags when one day is
 * disproportionate (F50).
 */
export const BS_PEAK_AMBER_AU = 700;
export const BS_PEAK_RED_AU = 1000;

/**
 * `share_of_week` — how much of the week lands in its single hardest session.
 *
 * Needs at least three sessions to mean anything: at two sessions a perfectly
 * balanced 50/50 week would read 50% and flag (F69), and at one session the
 * share is 100% by arithmetic and says nothing at all (F105). Below the floor
 * the check does not apply — it is omitted, not passed.
 */
export const BS_SHARE_OF_WEEK_AMBER_PCT = 45;
export const BS_SHARE_MIN_SESSIONS = 3;

/**
 * The scale a COACH plans on.
 *
 * Same 1-10 range as a logged rating, but deliberately NOT the same rule: a
 * logged `session_rpe` must be a whole number because the completion prompt
 * only ever writes whole numbers, so a fraction there can only be a defect
 * (§3). A coach authoring a week has no such constraint and half-points are a
 * real convention — F45's reference athlete is planned at RPE 7.5 and must
 * compute a load, not report a defect.
 */
export const BS_PLANNED_RPE_MIN = 1;
export const BS_PLANNED_RPE_MAX = 10;

/**
 * Derive the proposed week: its total, its hardest session, its session count.
 *
 * Every unusable session is REPORTED rather than skipped. A week is a claim
 * about a whole seven days; quietly dropping one of its sessions would compare
 * a week the coach did not write against the client's history, and it would
 * flag lower than the real week — the dangerous direction.
 *
 * @param {*} proposedWeek `{ weekStartISO, sessions: [{id, plannedMinutes, plannedRpe}] }`
 * @returns {{sessions:number, totalAu:number, hardestAu:number,
 *            hardestId:*, perSession:Array, incomplete:Array}}
 */
export function bsProposedWeek(proposedWeek) {
  const bad = (issues) => ({
    sessions: 0,
    totalAu: 0,
    hardestAu: 0,
    hardestId: null,
    perSession: [],
    incomplete: issues,
  });

  if (!proposedWeek || typeof proposedWeek !== 'object' || Array.isArray(proposedWeek)) {
    return bad([issue(-1, 'proposedWeek', proposedWeek)]);
  }
  const rows = proposedWeek.sessions;
  if (!Array.isArray(rows)) return bad([issue(-1, 'sessions', rows)]);

  // A week with no sessions is INCOMPLETE, never green (F87). Every cold-start
  // cap is `sessions x k`, which is 0 at zero sessions — so a path that treated
  // this as an ordinary week would find every possible total over every ceiling
  // and flag a week that does not exist.
  if (rows.length === 0) return bad([issue(-1, 'sessions', rows)]);

  const incomplete = [];
  const perSession = [];

  rows.forEach((row, index) => {
    const id = row && typeof row === 'object' ? row.id : undefined;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      incomplete.push(issue(index, 'session', row));
      return;
    }

    // Minutes: a real positive duration. No upper ceiling — the 150-minute rule
    // exists because a wall-clock TIMER's word is not a measurement, and a
    // coach deliberately authoring a long session is not the timer.
    const minutes = row.plannedMinutes;
    const minutesOk = finite(minutes) && minutes > 0;
    if (!minutesOk) incomplete.push(issue(index, 'plannedMinutes', minutes, id));

    // ⚠ DECISION BEYOND THE TABLE: an out-of-range or non-numeric plannedRpe is
    // reported the same way a MISSING one is (F85). The table covers absence
    // only, and `incomplete_week` is the one reason in the vocabulary that
    // describes a proposal we cannot read. Either way the week is not scored.
    const rpe = row.plannedRpe;
    const rpeOk = finite(rpe) && rpe >= BS_PLANNED_RPE_MIN && rpe <= BS_PLANNED_RPE_MAX;
    if (!rpeOk) incomplete.push(issue(index, 'plannedRpe', rpe, id));

    if (minutesOk && rpeOk) perSession.push({ id: id ?? null, index, au: rpe * minutes });
  });

  let totalAu = 0;
  let hardestAu = 0;
  let hardestId = null;
  for (const s of perSession) {
    totalAu += s.au;
    if (s.au > hardestAu) {
      hardestAu = s.au;
      hardestId = s.id;
    }
  }

  return {
    // The session COUNT is the authored count, not the readable count: the caps
    // scale with what the coach wrote. Counting only the readable sessions would
    // shrink the cap in exactly the weeks we already cannot read.
    sessions: rows.length,
    totalAu,
    hardestAu,
    hardestId,
    perSession,
    incomplete,
  };
}

/**
 * One check: its value against an amber and a red ceiling.
 *
 * `ceiling` is the amber ceiling — the first line crossed — matching the
 * documented result shape; `redCeiling` rides alongside so telemetry and copy
 * never have to recompute it. Both comparisons are strictly OVER: a value
 * exactly at a ceiling is green (F53, F71, and the peak bound at F46's 700).
 */
function bsCheck(name, value, amberCeiling, redCeiling) {
  // ⚠ A NULL red ceiling means "this check has no red bound BY DESIGN", and it
  // must be tested for explicitly. `value > null` coerces to `value > 0`, which
  // would turn every such check red on any positive value. Infinity would give
  // the right verdict, but it is not JSON-serializable: it reaches the coach as
  // `null` through the 409 publish-rejection payload and through
  // `analytics_events.props`, where "no red bound by design" becomes
  // indistinguishable from "the field was unreadable".
  const isRed = finite(redCeiling) && value > redCeiling;
  const state = isRed ? 'red' : value > amberCeiling ? 'amber' : 'green';
  return {
    check: name,
    value,
    ceiling: amberCeiling,
    redCeiling,
    state,
    tripped: state !== 'green',
  };
}

/** The worst state among a set of checks — green unless something says otherwise. */
function bsWorstState(checks) {
  if (checks.some((c) => c.state === 'red')) return 'red';
  if (checks.some((c) => c.state === 'amber')) return 'amber';
  return 'green';
}

/**
 * An axis: its checks, the worst state among them, and the ceiling as a PERCENT.
 *
 * `ceilingPct` is the ceiling expressed as a percentage over baseline — 19% for
 * a client at 2000 AU. It is genuinely NULL under cold start, where the caps are
 * absolute AU and no percentage exists to report; that is why the documented
 * shape allows null, and why reporting some derived ratio there instead would
 * be inventing a number the regime does not have.
 */
function bsAxis(axis, checks, ceilingPct = null) {
  return {
    axis,
    state: bsWorstState(checks),
    checks,
    ceilingPct: finite(ceilingPct) ? ceilingPct : null,
  };
}

/**
 * The volume axis under cold start — the weekly total against `sessions x k`.
 */
export function bsColdStartVolumeAxis(proposed) {
  return bsAxis('volume', [bsCheck(
    'weekly_total',
    proposed.totalAu,
    proposed.sessions * BS_COLD_START_WEEKLY_AMBER_PER_SESSION,
    proposed.sessions * BS_COLD_START_WEEKLY_RED_PER_SESSION,
  )]);
}

/**
 * The concentration axis — is the week's load piled into one day?
 *
 * Two checks, ONE axis (F74). Both firing together is still a single amber and
 * must not satisfy the compound-red rule: they are two readings of the same
 * property, not two independent findings.
 *
 * The hard-day check compares against the ABSOLUTE bounds when nothing better
 * is known (F75, the cold-start case) and against the client's own hardest
 * logged session once one exists (F72, §8). The bound source decides the
 * check's NAME, because they are different sentences to a coach: "this is a
 * hard day by any standard" is not "this is a big jump for this person".
 *
 * @param {*} proposed the derived proposed week
 * @param {{hardestLoggedAu?:number}} [bounds]
 */
export function bsConcentrationAxis(proposed, bounds) {
  // `bounds = {}` would only default on `undefined`; an explicit null is a
  // realistic caller slip and this is an EXPORTED function, so it must not
  // throw — the never-throws contract covers the parts, not just the whole.
  const jump = bsJumpBounds(bounds && bounds.hardestLoggedAu);
  const checks = [jump
    ? bsCheck('jump_vs_history', proposed.hardestAu, jump.amberAu, jump.redAu)
    : bsCheck('peak', proposed.hardestAu, BS_PEAK_AMBER_AU, BS_PEAK_RED_AU)];

  // Below three sessions the share says nothing, and dividing by a zero total
  // would say something worse than nothing.
  if (proposed.sessions >= BS_SHARE_MIN_SESSIONS && proposed.totalAu > 0) {
    checks.push(bsCheck(
      'share_of_week',
      (proposed.hardestAu / proposed.totalAu) * 100,
      BS_SHARE_OF_WEEK_AMBER_PCT,
      // The share has no red bound of its own — a concentrated week is a
      // coaching question, not an emergency. Red on this axis comes from the
      // peak bound, which measures absolute load rather than proportion.
      // NULL, not Infinity: this rides into jsonb and into an HTTP payload.
      null,
    ));
  }

  return bsAxis('concentration', checks);
}

/** Both cold-start axes, in the documented order. */
export function bsColdStartAxes(proposed) {
  return [bsColdStartVolumeAxis(proposed), bsConcentrationAxis(proposed)];
}

/* ── §6. The measured regime — the ramp curve ──────────────────────────────
 *
 * A real baseline exists, so the flat caps give way to a percentage of what
 * this client actually does. Both ceilings are read off the anchor curves at
 * the client's own baseline and scale INVERSELY with it: a client at 500 AU may
 * add 40% without it meaning much, a client at 5000 AU may not.
 *
 * At the reference baseline of 2000 AU that is a 19% ramp (amber over 2380) and
 * a 40% red curve (red over 2800).
 *
 * ⚠ THE GUARDRAIL NEVER FLAGS GOING DOWN (F57). Both ceilings are `baseline x
 * (1 + pct)`, so a decrease is under them by construction — a deliberate deload
 * is green, and this must stay true by arithmetic rather than by a special
 * case, because a special case can be removed by someone who does not know why
 * it was there. The cost is real and is accepted knowingly: a deload lowers the
 * median, so the return-to-normal week afterwards reads as an increase from the
 * reduced baseline (F109, F129, and SPEC-guardrails.md §13.7).
 */

/**
 * Read both ceilings off the curves at a client's own baseline.
 *
 * Returns null when the baseline is not usable — this is the measured regime,
 * and without a measurement there is nothing to be measured against. Callers
 * route to cold start rather than receiving a fabricated ceiling.
 *
 * @param {number} baselineAu
 * @returns {{rampPct:number, redPct:number, amberAu:number, redAu:number}|null}
 */
export function bsMeasuredCeilings(baselineAu) {
  if (!bsIsUsableBaseline(baselineAu)) return null;

  const rampPct = bsInterpolateAnchors(BS_RAMP_ANCHORS, baselineAu);
  const redPct = bsInterpolateAnchors(BS_RED_ANCHORS, baselineAu);
  // The curves only return null on input this function has already rejected,
  // so this cannot fire today. It is kept because "cannot fire" is exactly the
  // claim that stops being true, and the failure would be a NaN ceiling that
  // compares false against everything and silently passes every week.
  if (!finite(rampPct) || !finite(redPct)) return null;

  return {
    rampPct,
    redPct,
    amberAu: baselineAu * (1 + rampPct / 100),
    redAu: baselineAu * (1 + redPct / 100),
  };
}

/**
 * The volume axis under the measured regime — the week's total against the ramp.
 *
 * @param {*} proposed the derived proposed week
 * @param {number} baselineAu
 * @returns {object|null} null when there is no usable baseline
 */
export function bsMeasuredVolumeAxis(proposed, baselineAu) {
  const ceilings = bsMeasuredCeilings(baselineAu);
  if (!ceilings) return null;

  const total = bsCheck('weekly_total', proposed.totalAu, ceilings.amberAu, ceilings.redAu);
  // Report the percentage of the ceiling actually in play, so the copy can name
  // the threshold that was crossed rather than always naming the amber one.
  return bsAxis('volume', [total], total.state === 'red' ? ceilings.redPct : ceilings.rampPct);
}

/**
 * Both measured-regime axes.
 *
 * `bounds.hardestLoggedAu` is the client's own hardest logged session (§8). It
 * is optional here rather than required, because the two are independent facts:
 * a usable weekly baseline does not guarantee a hardest session worth comparing
 * against, and without one the axis falls back to the absolute bounds (F75).
 */
export function bsMeasuredAxes(proposed, baselineAu, bounds = {}) {
  const volume = bsMeasuredVolumeAxis(proposed, baselineAu);
  if (!volume) return null;
  return [volume, bsConcentrationAxis(proposed, bounds)];
}

/* ── §7. The return regime — coming back from an interruption ──────────────
 *
 * After a break, the client's pre-break baseline is still the best measurement
 * of who they were — and a bad description of who they are today. So the
 * baseline is REDUCED to a fraction of itself, and the ordinary ramp curve is
 * then read at that reduced number (SPEC-guardrails.md §6.3). Subsequent weeks
 * re-ramp from there by the ordinary rules — no special case, no third curve.
 *
 * Worked, at the reference baseline of 2000 AU:
 *   gap 14d -> 70% -> the week is measured against 1400 (F59)
 *   gap 28d -> 55% -> measured against 1100, whose own ramp is 29.2%, so amber
 *                     lands at 1421.2 (F60) — the cap and the ramp compose
 *   gap 56d -> 40% -> measured against 800 (F61), and 40% is the last anchor:
 *                     56 through 83 days are all 40% (F62, F117)
 *   gap 84d -> the baseline is STALE. A regime handoff to cold start, NOT a
 *              fifth fraction and NOT floored at 40% (F63)
 *
 * ⚠ THE CAP MODIFIES THE VOLUME AXIS — IT IS NOT A SECOND AXIS (F82). A return
 * week whose total also clears the ramp has ONE finding, not two, and must
 * never satisfy the compound-red rule in §9. That is why this section returns
 * the same single-check `volume` axis the measured regime does, with different
 * numbers in it, rather than adding a `return` axis alongside.
 *
 * WHAT COUNTS AS A GAP: consecutive days with no logged session over 100 AU.
 * A 15-minute walk must not reset three weeks of protection (F64), a real
 * session does (F65). Two consequences worth stating out loud:
 *
 *   - An UNRATED session cannot reset a gap. It has no AU at all, so it cannot
 *     exceed a floor expressed in AU. A client who trains without rating reads
 *     as absent, and their return week is held to a tighter ceiling than it
 *     needs to be. That is the safe direction of the error and it is the same
 *     honest-absence rule §3 applies everywhere else: we do not know what we
 *     were not told.
 *   - The floor is on the SESSION, not the week. A week of six 90 AU sessions
 *     is 540 AU of real training that resets no gap.
 */

/** Below this many days there is no return rule at all — the ordinary ramp applies. */
export const BS_RETURN_MIN_GAP_DAYS = 14;

/**
 * At or beyond this many days the baseline is stale and the regime hands off to
 * cold start. The SAME 84 days as the window's reach (§4b) — one staleness
 * concept expressed once, deliberately.
 */
export const BS_STALE_GAP_DAYS = 84;

/**
 * How long since the client last logged a session that counts as real training.
 *
 * Measured from that session's local date to `todayISO`, in whole days. Null
 * when there has never been one — see the note in `bsResolveRegime` for why
 * that is a "cannot say", not a gap of infinity.
 *
 * @param {*} sessions raw history rows
 * @param {*} todayISO 'YYYY-MM-DD', the client's local today
 * @returns {{gapDays:number|null, lastRealISO:string|null, malformed:Array}}
 */
export function bsHistoryGap(sessions, todayISO) {
  const todayMs = utcMsFromIsoDate(todayISO);
  if (!Number.isFinite(todayMs)) {
    return { gapDays: null, lastRealISO: null, malformed: [issue(-1, 'todayISO', todayISO)] };
  }
  if (!Array.isArray(sessions)) {
    return { gapDays: null, lastRealISO: null, malformed: [issue(-1, 'sessions', sessions)] };
  }

  const malformed = [];
  let lastRealISO = null;

  sessions.forEach((s, i) => {
    const c = bsClassifySession(s, i);
    if (c.malformed) {
      malformed.push(...c.issues);
      return;
    }
    // Strictly OVER the floor: 100 AU exactly does not reset a gap, matching
    // the week tally's own test so the two can never disagree about which
    // sessions are real.
    if (!c.rated || !(c.au > BS_GAP_SESSION_FLOOR_AU)) return;
    // ISO dates are fixed-width, so a plain string compare finds the latest.
    if (lastRealISO === null || c.localDateISO > lastRealISO) lastRealISO = c.localDateISO;
  });

  if (lastRealISO === null) return { gapDays: null, lastRealISO: null, malformed };

  const lastMs = utcMsFromIsoDate(lastRealISO);
  // Calendar-to-calendar, both anchored in UTC, so no DST-length day can shift
  // the count — the same arithmetic the window reach uses.
  const days = (todayMs - lastMs) / DAY_MS;

  // A session dated after today is the only way this goes negative, and a
  // negative gap cannot mean anything. Read it as "trained today", which is the
  // tighter regime (no return relaxation) rather than the looser one.
  return { gapDays: Math.max(0, days), lastRealISO, malformed };
}

/**
 * The return-week fraction for a gap, or null when no return rule applies.
 *
 * Null is returned for BOTH ends, and they are different decisions wearing the
 * same shape: under 14 days there is no interruption to return from (F58), and
 * at 84 days the baseline is stale and the regime changes (F63). Neither is a
 * curve value, which is why they are guards here rather than anchors in the
 * table — the clamp would otherwise happily report 70% for a 3-day gap and 40%
 * for a 300-day one.
 *
 * @param {number} gapDays
 * @returns {number|null}
 */
export function bsReturnFraction(gapDays) {
  if (!finite(gapDays)) return null;
  if (gapDays < BS_RETURN_MIN_GAP_DAYS) return null;   // F58 — no return rule
  if (gapDays >= BS_STALE_GAP_DAYS) return null;       // F63 — a regime handoff
  // Flat at 40% from 56 days to the horizon (F62, F117) — defined, not
  // undefined, exactly as the ramp curve is held flat below 500 AU.
  return bsInterpolateAnchors(BS_RETURN_ANCHORS, gapDays);
}

/**
 * The return week's ceilings: cap the baseline, then read the ordinary curves
 * at the capped number.
 *
 * ⚠ DECISION BEYOND THE TABLE: the 500 AU floor (rule B2) gates the MEASURED
 * baseline, not the capped one. A 1000 AU client returning after eight weeks is
 * held to 400 AU, which is under the floor — and the honest ceiling for them is
 * the one the return rule computes, not the cold-start caps. Routing to cold
 * start there would hand a returning client `sessions x 600`, which is far
 * LOOSER than the cap that exists to protect them: the guardrail would go quiet
 * for exactly the person it was written for. The curve's own clamp covers the
 * arithmetic below its first anchor, which is what a clamp is for. B1
 * (positive and finite) is still asserted on the capped number, because a NaN
 * ceiling compares false against everything and silently passes every week.
 *
 * @param {number} baselineAu the client's pre-break baseline
 * @param {number} gapDays
 * @returns {{gapDays:number, returnPct:number, cappedAu:number, rampPct:number,
 *            redPct:number, amberAu:number, redAu:number}|null}
 */
export function bsReturnCeilings(baselineAu, gapDays) {
  if (!bsIsUsableBaseline(baselineAu)) return null;

  const returnPct = bsReturnFraction(gapDays);
  if (!finite(returnPct)) return null;

  const cappedAu = baselineAu * (returnPct / 100);
  if (!finite(cappedAu) || cappedAu <= 0) return null;   // B1, on the capped number

  const rampPct = bsInterpolateAnchors(BS_RAMP_ANCHORS, cappedAu);
  const redPct = bsInterpolateAnchors(BS_RED_ANCHORS, cappedAu);
  if (!finite(rampPct) || !finite(redPct)) return null;

  return {
    gapDays,
    returnPct,
    cappedAu,
    rampPct,
    redPct,
    amberAu: cappedAu * (1 + rampPct / 100),
    redAu: cappedAu * (1 + redPct / 100),
  };
}

/**
 * The volume axis under the return regime.
 *
 * ONE axis with ONE check, identical in shape to the measured regime's (F82).
 * The whole of the return rule lives in the numbers inside it.
 *
 * ⚠ `ceilingPct` is the percentage over the RETURN CAP, not over the client's
 * pre-break baseline — the cap is the number this axis measured against, and
 * `ceilingPct` is always the percentage over whatever that number was. A return
 * week is usually a DECREASE from the pre-break baseline, so reading this
 * percentage as growth over it would invert the story. The check's `ceiling`
 * carries the absolute AU, which cannot be misread.
 *
 * @returns {object|null} null when there is no usable baseline or no return rule
 */
export function bsReturnVolumeAxis(proposed, baselineAu, gapDays) {
  const ceilings = bsReturnCeilings(baselineAu, gapDays);
  if (!ceilings) return null;

  const total = bsCheck('weekly_total', proposed.totalAu, ceilings.amberAu, ceilings.redAu);
  return bsAxis('volume', [total], total.state === 'red' ? ceilings.redPct : ceilings.rampPct);
}

/**
 * Both return-regime axes.
 *
 * The concentration axis is UNCHANGED by the return rule — the gap says nothing
 * about how a week distributes its load, and inventing a reduced peak bound
 * here would be a second, unruled cap. `bounds` threads through exactly as it
 * does under the measured regime.
 *
 * ⚠ A returning client is therefore still compared against the hardest session
 * they logged BEFORE the break, which is the most generous reading available.
 * Deliberate: the volume axis is where the interruption is priced in, and
 * pricing it twice would flag the same fact on two axes — the thing F82 exists
 * to prevent.
 */
export function bsReturnAxes(proposed, baselineAu, gapDays, bounds = {}) {
  const volume = bsReturnVolumeAxis(proposed, baselineAu, gapDays);
  if (!volume) return null;
  return [volume, bsConcentrationAxis(proposed, bounds)];
}

/**
 * Which regime applies — the one decision that routes everything else.
 *
 * Exactly one regime applies to any evaluation. The order below is the ruling,
 * not a convenience:
 *
 *   1. NO USABLE BASELINE -> cold start, carrying the baseline's own reason.
 *      First, because "your baseline is stale" implies there is one; when there
 *      is not, `no_history` / `no_qualifying_weeks` / `baseline_below_floor` is
 *      the truer sentence.
 *   2. GAP >= 84 DAYS -> cold start, `stale_baseline`. THE STALE RULE BEATS THE
 *      WINDOW (F101): old qualifying weeks can still sit inside the 84-day
 *      reach while no real session has been logged for 90 days, and a baseline
 *      you cannot trust is worse than no baseline at all.
 *   3. GAP >= 14 DAYS -> return.
 *   4. otherwise -> measured. This is also what the week AFTER a return week
 *      resolves to (F66): the return week itself closed the gap, so the
 *      ordinary rules re-ramp from the new baseline with no special case.
 *
 * ⚠ DECISION BEYOND THE TABLE: a client with NO real session anywhere in their
 * history has `gapDays: null`, and null is not a gap of infinity. They do not
 * route to stale — they keep whatever baseline their weeks produced. The table
 * has no row for it (F101's premise names a last qualifying session 90 days
 * back), and the alternative is worse: a client training six genuine 90 AU
 * sessions a week would be declared stale and handed the far looser cold-start
 * caps, which is the dangerous direction.
 *
 * ⚠ MALFORMED IS CARRIED, NOT ACTED ON. Rule C says one malformed row turns the
 * whole evaluation `unknown`, and that decision belongs to the top level (§10),
 * which MUST check `malformed` before reading `regime`. The list comes from
 * `bsBaseline` alone: the gap pass classifies the same rows through the same
 * classifier, so merging both would report every defect twice.
 *
 * @param {*} sessions raw history rows
 * @param {*} todayISO 'YYYY-MM-DD', the client's local today
 * @returns {{regime:'cold_start'|'measured'|'return', reason:string|null,
 *            baselineAu:number|null, gapDays:number|null, baseline:object,
 *            malformed:Array}}
 */
export function bsResolveRegime(sessions, todayISO) {
  const baseline = bsBaseline(sessions, todayISO);
  const { gapDays } = bsHistoryGap(sessions, todayISO);
  const malformed = baseline.malformed;

  const at = (regime, reason, baselineAu) => ({
    regime, reason, baselineAu, gapDays, baseline, malformed,
  });

  if (baseline.basis !== 'measured') return at('cold_start', baseline.reason, null);

  // ⚠ DECISION BEYOND THE TABLE: `stale_baseline` is new vocabulary. The
  // documented reason list covers the no-baseline cases and never names this
  // one, and reusing `no_qualifying_weeks` would report "no qualifying weeks"
  // about a client who has three — a small lie, and this module's contract is
  // that it does not tell them.
  if (finite(gapDays) && gapDays >= BS_STALE_GAP_DAYS) {
    return at('cold_start', 'stale_baseline', null);
  }

  if (finite(gapDays) && gapDays >= BS_RETURN_MIN_GAP_DAYS) {
    return at('return', null, baseline.au);
  }

  return at('measured', null, baseline.au);
}

/* ── §8. The concentration axis, finished — the jump against history ───────
 *
 * A hard day is only alarming relative to what the person already does. 900 AU
 * is unremarkable for a client whose regular hardest session is 850 and a real
 * jump for one whose ceiling has been 500 — so once a measured hardest session
 * exists, the absolute bound gives way to a comparison against THEIRS (F72).
 * With no measured hardest session there is nothing else to compare against,
 * and the absolute bound is the honest fallback (F75), which is exactly the
 * cold-start case.
 *
 * The allowance over the client's hardest is the ORDINARY RAMP CURVE read at
 * that session's own value (SPEC-guardrails.md §7.1: "hardest logged session
 * ... x (1 + its own anchor ramp)"). One curve, read at whatever it is
 * measuring — the same mechanism the weekly ceiling uses, applied to a session
 * instead of a week. A client whose hardest is 700 AU may go to 954.8 before it
 * reads as a jump.
 *
 * ⚠ THE COMPARISON REPLACES THE ABSOLUTE BOUND, IT DOES NOT ADD TO IT. The
 * spec's word is "else". A client who has genuinely logged a 900 AU session is
 * not flagged for proposing 1100 just because 1100 clears a cap written for
 * clients of unknown capacity — the whole point of the absolute bound is that
 * it stands in for a measurement we do not have. Once we have one, it goes.
 *
 * ⚠ AND IT IS STILL ONE CHECK ON ONE AXIS. `share_of_week` and the hard-day
 * check frequently fire together on the same session (F49, F74) — that is one
 * problem described twice, and §9 counts distinct AXES precisely so it cannot
 * become a compound red.
 */

/**
 * The jump allowance over a client's own hardest logged session.
 *
 * ⚠ DECISION BEYOND THE TABLE: the RED bound. The table (F72) and the spec both
 * state the amber rule only. Leaving red undefined would mean a client with any
 * history could never reach red on this axis — a proposed session at three
 * times their hardest ever would be a mild amber, which is precisely the case
 * that should demand an acknowledgment. So red mirrors amber: the red curve
 * read at the same session value, exactly as the weekly ceilings pair up.
 *
 * ⚠ AND IT IS FLOORED AT THE CURVE'S OWN DOMAIN (F139-F143). Below
 * `BS_CURVE_DOMAIN_FLOOR_AU` the ramp and red curves clamp to 40% / 75% —
 * percentages of a number too small for a percentage to mean anything, the
 * identical reason rule B2 refuses to read them for a sub-500 weekly baseline.
 * Without the floor a client whose sessions are SMALL got the TIGHTEST possible
 * jump bound: at a 200 AU hardest, red sat at 350, so restructuring an
 * unchanged 1000 AU week from five sessions into 400/300/300 resolved RED and
 * blocked publish — while the same week from a client with no history at all
 * was green. More data made the guardrail louder in the wrong direction, on the
 * only state with teeth.
 *
 * Below the floor this returns null and §8 falls back to the absolute peak
 * bound — exactly what F75 already specifies for "no measured hardest session",
 * because an unusable measurement and an absent one are the same thing here.
 * NO SIGNAL IS LOST: `share_of_week` already catches restructure, and it does so
 * SCALE-FREE (it is a proportion, so it needs no curve). The fallback stops a
 * check that is broken at this magnitude from duplicating one that works.
 *
 * @param {*} hardestLoggedAu the client's hardest RATED session in the window
 * @returns {{hardestLoggedAu:number, rampPct:number, redPct:number,
 *            amberAu:number, redAu:number}|null} null when there is none, or
 *   when the one there is sits outside the curves' domain
 */
export function bsJumpBounds(hardestLoggedAu) {
  // Absence, not a hardest session of zero. A zero here would make every
  // proposed session an infinite jump and flag every week ever authored.
  if (!finite(hardestLoggedAu) || hardestLoggedAu <= 0) return null;

  // Outside the curves' domain — see the note above. The absolute peak bound
  // takes over, which is a real limit rather than an extrapolated one.
  if (hardestLoggedAu < BS_CURVE_DOMAIN_FLOOR_AU) return null;

  const rampPct = bsInterpolateAnchors(BS_RAMP_ANCHORS, hardestLoggedAu);
  const redPct = bsInterpolateAnchors(BS_RED_ANCHORS, hardestLoggedAu);
  if (!finite(rampPct) || !finite(redPct)) return null;

  return {
    hardestLoggedAu,
    rampPct,
    redPct,
    amberAu: hardestLoggedAu * (1 + rampPct / 100),
    redAu: hardestLoggedAu * (1 + redPct / 100),
  };
}

/* ── §9. State resolution — what the coach actually sees ───────────────────
 *
 * Four rules, in this order (SPEC-guardrails.md §7.2):
 *
 *   1. any axis over its red ceiling      -> red, redPath 'curve'
 *   2. two or more DISTINCT axes at amber
 *      AND the week has 3+ sessions       -> red, redPath 'compound'
 *   3. any axis at amber                  -> amber
 *   4. otherwise                          -> green
 *
 * Rule 1 runs first so a single catastrophic jump produces red — and therefore
 * an acknowledgment and an audit entry — rather than sitting at amber behind a
 * compound rule that happens not to apply.
 *
 * ⚠ THE 3-SESSION CONDITION ON RULE 2 IS LOAD-BEARING, IN EVERY REGIME. Below
 * three sessions the concentration axis is very nearly DETERMINED by the volume
 * axis: a week of two equal sessions has a hardest session of exactly half the
 * weekly total by construction, so the two cannot fail independently and
 * compounding them double-counts one fact. Two 800 AU sessions is 1600 AU
 * against a 1200 two-session cap (volume amber) with a hardest of 800 against
 * the 700 bound (concentration amber) — neither anywhere near red, yet the
 * compound rule would call it red for two hard-but-real 100-minute sessions
 * (F79). Amber is the correct answer there.
 *
 * Suppression touches THE COMPOUND PATH ONLY. Either axis can still reach red
 * on its own at any session count, so a genuinely dangerous two-session week is
 * caught by rule 1 (F81).
 *
 * ⚠ NOT BUILT HERE: the red kill switch (spec §7.4). This function always
 * reports the TRUE state — that is precisely what lets 2b downgrade red to
 * amber for the coach while telemetry keeps recording what red would have
 * fired on. A core that downgraded would leave us blind exactly when the caps
 * most need retuning from real data.
 */

/**
 * The axis registry — which axes exist, and which participate in resolution.
 *
 * `distribution` (hard sets per muscle group) is REGISTERED AND DISABLED (F84).
 * It is not computable honestly in v1: authored moves carry only a free-text
 * name with no reference to `exercise_library`, and `primary_muscles` is a
 * coach-owned free-text array defaulting to empty — so name-matching would
 * produce muscle-group counts that are silently wrong for most coaches, which
 * is the failure class the honest-absence rules exist to prevent.
 *
 * Enabling it later is a flag flip here plus a resolver, not a rewrite of the
 * rules below — which is the whole reason `axes` is a LIST rather than a pair
 * of named fields.
 */
export const BS_AXIS_REGISTRY = [
  { axis: 'volume', enabled: true },
  { axis: 'concentration', enabled: true },
  { axis: 'distribution', enabled: false },
];
// `distribution.enabled` is the one flag nobody may flip at runtime: turning it
// on without its resolver would let an axis with no rules cast a vote, which is
// the failure the honest-absence rules above exist to prevent. Frozen so that
// enabling it stays a source edit, reviewed, with its resolver.
BS_AXIS_REGISTRY.forEach((row) => Object.freeze(row));
Object.freeze(BS_AXIS_REGISTRY);

/**
 * Does this axis participate in state resolution?
 *
 * An axis nobody registered is treated as DISABLED rather than allowed through:
 * a typo'd axis name must not silently gain a vote.
 */
export function bsAxisEnabled(axis) {
  const row = BS_AXIS_REGISTRY.find((a) => a.axis === axis);
  return !!(row && row.enabled);
}

/** The compound path needs at least this many sessions to be independent. */
export const BS_COMPOUND_MIN_SESSIONS = 3;

/**
 * Resolve the axes into one state, and name what caused it.
 *
 * `contributingAxes` is derived HERE and only here. The alternative — letting
 * the copy layer re-derive which axes caused the state from their individual
 * states — is a second implementation of the same rule, and the two would
 * eventually disagree about whether an amber axis alongside a red one is
 * "contributing" (it is not: it did not cause the red).
 *
 * ⚠ DECISION BEYOND THE TABLE: a DISABLED axis is excluded from resolution
 * ENTIRELY, not just from the compound count. F84 and the spec both name the
 * compound path specifically, and excluding it only there would leave a
 * disabled axis able to turn a week red on its own — a flag raised by a
 * measurement we have declared not honestly computable. The narrower reading
 * fails in the more damaging direction, so this takes the stronger one.
 *
 * @param {Array} axes the axes for this regime
 * @param {number} proposedSessions the AUTHORED session count of the week
 * @returns {{state:'green'|'amber'|'red', redPath:'curve'|'compound'|null,
 *            contributingAxes:Array<string>}}
 */
export function bsResolveState(axes, proposedSessions) {
  const live = (Array.isArray(axes) ? axes : []).filter(
    (a) => a && bsAxisEnabled(a.axis),
  );

  const reds = live.filter((a) => a.state === 'red');
  if (reds.length > 0) {
    // DEDUPED like the ambers below, and for the same reason: the same axis
    // named twice is one finding. Nothing produces a duplicate axis today —
    // which is exactly why the assumption is pinned here rather than assumed.
    return {
      state: 'red',
      redPath: 'curve',
      contributingAxes: [...new Set(reds.map((a) => a.axis))],
    };
  }

  const ambers = live.filter((a) => a.state === 'amber');
  // DISTINCT axes: the same axis appearing twice is one finding, not two. The
  // concentration axis carries two checks that frequently fire together (F49,
  // F74) — that is one problem described twice, and it must not compound.
  const distinct = [...new Set(ambers.map((a) => a.axis))];

  if (distinct.length >= 2 && finite(proposedSessions)
      && proposedSessions >= BS_COMPOUND_MIN_SESSIONS) {
    return { state: 'red', redPath: 'compound', contributingAxes: distinct };
  }

  if (distinct.length > 0) {
    return { state: 'amber', redPath: null, contributingAxes: distinct };
  }

  return { state: 'green', redPath: null, contributingAxes: [] };
}

/* ── §10. The whole thing — one function, and honest absence ───────────────
 *
 * `bsProgressionGuardrail(history, proposedWeek)` is the only entry point.
 * Everything above is a part; this assembles them: history -> regime -> axes ->
 * state -> one result.
 *
 * THE STATE THAT MATTERS MOST HERE IS `unknown`. It means *we could not measure
 * this*, which is not a finding about the training and is never the coach's
 * fault. Rule D governs it:
 *
 *   - It must NOT block publish. A coach cannot be gated on data quality they
 *     did not cause. (Enforced in 2b; the core simply never calls it red.)
 *   - It must be VISIBLE, stated plainly with its reason. Rendering nothing
 *     would be indistinguishable from green, and a coach would reasonably infer
 *     the week had been checked and passed.
 *   - It must be RECORDED with its reason, so a logging defect gets noticed
 *     and fixed instead of sitting silent behind a UI that looks fine.
 *
 * ⚠ AN UNKNOWN RESULT CARRIES NO AXES, NO RED PATH, AND NO BASELINE (F118). It
 * must be impossible to read as green *or* as a flag. The baseline is withheld
 * deliberately even when the history looks computable: rule C exists because
 * quietly dropping malformed rows "lets a client-side defect produce a wrong
 * baseline forever", and a number derived by ignoring the rows we just refused
 * to ignore is exactly that number. An unknown result asserts nothing about the
 * client.
 *
 * NEVER THROWS. Every input is treated as hostile — the `varianceBand`
 * precedent. A guardrail that crashes the publish path is worse than one that
 * says nothing.
 */

/**
 * Evaluate a coach-authored week against a client's logged history.
 *
 * @param {*} history `{ todayISO, sessions }` — `todayISO` is the only "now"
 * @param {*} proposedWeek `{ weekStartISO, sessions: [{id, plannedMinutes, plannedRpe}] }`
 * @returns {{state:'green'|'amber'|'red'|'unknown',
 *            regime:'cold_start'|'measured'|'return',
 *            redPath:'curve'|'compound'|null, reason:string|null,
 *            baseline:{au:number|null, basis:string, weeks:number},
 *            proposed:{totalAu:number, hardestAu:number, sessions:number},
 *            axes:Array, contributingAxes:Array<string>, gapDays:number|null,
 *            issues:{malformedHistory:Array, incompleteWeek:Array}}}
 */
export function bsProgressionGuardrail(history, proposedWeek) {
  // The proposed week is derived first and unconditionally: its problems are
  // reported even when the history is the thing that failed, so telemetry sees
  // every defect rather than one defect per fix.
  const proposed = bsProposedWeek(proposedWeek);

  const unknown = (reason, malformedHistory, regime = 'cold_start') => ({
    state: 'unknown',
    regime,
    redPath: null,
    reason,
    // No baseline on an unknown result — see the section note.
    baseline: { au: null, basis: 'none', weeks: 0 },
    proposed: {
      totalAu: proposed.totalAu,
      hardestAu: proposed.hardestAu,
      sessions: proposed.sessions,
    },
    axes: [],
    contributingAxes: [],
    gapDays: null,
    issues: { malformedHistory, incompleteWeek: proposed.incomplete },
  });

  // A history that is not an object at all is named as such rather than being
  // taken apart into a cascade of missing-field reports (F88).
  if (!history || typeof history !== 'object' || Array.isArray(history)) {
    return unknown('malformed_history', [issue(-1, 'history', history)]);
  }

  const resolved = bsResolveRegime(history.sessions, history.todayISO);

  // ⚠ ORDER: malformed history leads when BOTH classes are present, and no
  // fixture rules it. The reason a coach reads should be the one that actually
  // explains their situation: a single bad logged row makes EVERY week they
  // author read unknown until it is fixed, so leading with `incomplete_week`
  // would point them at a blank field whose repair changes nothing, and would
  // mask the persistent cause intermittently. Both lists are reported either
  // way, so nothing is lost to telemetry.
  if (resolved.malformed.length > 0) {
    return unknown('malformed_history', resolved.malformed);
  }

  // An unscoreable week is not a safe week — it is an unmeasured one, and this
  // says so rather than passing it green (F85, F86, F87). Zero sessions lands
  // here too: every cold-start cap is `sessions x k`, which is 0 at zero
  // sessions, so a path that scored it would find every total over every
  // ceiling and flag a week that does not exist.
  //
  // The regime and baseline ARE known here — the history was readable — but
  // they stay withheld for one rule rather than two: an unknown result asserts
  // nothing about the client, whatever made it unknown.
  if (proposed.incomplete.length > 0) {
    return unknown('incomplete_week', [], resolved.regime);
  }

  const axes = bsRegimeAxes(resolved, proposed);
  if (!axes) {
    // ⚠ Cannot fire: `bsResolveRegime` returns a usable baseline for exactly
    // the regimes that need one, and a return regime by definition sits inside
    // the 14-to-83-day band its fraction is defined over. Kept because "cannot
    // fire" is the claim that stops being true, and the alternative is worse —
    // a null axis list resolves GREEN, which is a fabricated pass. `unscoreable`
    // is new vocabulary on purpose: seeing it in telemetry means an invariant
    // this module is built on has broken.
    return unknown('unscoreable', [], resolved.regime);
  }

  const { state, redPath, contributingAxes } = bsResolveState(axes, proposed.sessions);

  return {
    state,
    regime: resolved.regime,
    redPath,
    // ⚠ A SCORED WEEK CAN STILL CARRY A REASON. Under cold start it says WHY
    // there is no baseline — `no_history`, `no_qualifying_weeks`,
    // `baseline_below_floor`, `stale_baseline` — which is what the copy layer
    // keys "no baseline yet" off (F51). It is null under measured and return,
    // where the baseline speaks for itself.
    reason: resolved.reason,
    baseline: {
      au: resolved.baseline.au,
      basis: resolved.baseline.basis,
      weeks: resolved.baseline.weeks,
    },
    proposed: {
      totalAu: proposed.totalAu,
      hardestAu: proposed.hardestAu,
      sessions: proposed.sessions,
    },
    axes,
    contributingAxes,
    gapDays: resolved.gapDays,
    issues: { malformedHistory: [], incompleteWeek: [] },
  };
}

/**
 * The axes for a resolved regime — the one place the three builders are chosen
 * between, so a regime cannot be scored against another regime's ceilings.
 */
function bsRegimeAxes(resolved, proposed) {
  const bounds = { hardestLoggedAu: resolved.baseline.hardestLoggedAu };

  if (resolved.regime === 'measured') {
    return bsMeasuredAxes(proposed, resolved.baselineAu, bounds);
  }
  if (resolved.regime === 'return') {
    return bsReturnAxes(proposed, resolved.baselineAu, resolved.gapDays, bounds);
  }
  // Cold start: no baseline, so no history to compare a hard day against
  // either — the absolute bounds are the honest fallback (F75).
  return bsColdStartAxes(proposed);
}

/* ── §11. The copy — one voice, so two surfaces cannot disagree ────────────
 *
 * `bsGuardrailCopy(result)` is the ONLY source of guardrail wording (§8),
 * following the `bsVarianceCopy` precedent. The mobile builder, the two web
 * builders and the publish-rejection response all read from here, so the same
 * flag reads identically wherever it appears — there is one set of strings
 * rather than three that drift apart over a year.
 *
 * DISPLAY ROUNDING HAPPENS HERE AND NOWHERE ELSE (F98). Every ceiling, every
 * comparison and every state upstream runs unrounded; a figure is rounded only
 * at the moment it becomes a word.
 *
 * AND THE PRECISION IS ADAPTIVE (F136-F138). Whole-number rounding can collapse
 * a real difference — a 2380.4 AU week over a 2380 AU ceiling is amber, and
 * "2380 AU against a 2380 AU limit" reads to a coach as a broken system, which
 * is the one impression this design exists to avoid. So when rounding would
 * collapse the distinction, both figures print at the smallest precision that
 * keeps them apart. That is NOT nudging: 2380.4 is exactly the number the
 * comparison was made on, shown at the resolution the comparison happened at.
 * A week whose whole numbers already differ still prints whole numbers.
 *
 * TWO PHRASINGS ARE DOCTRINE, NOT FORMATTING.
 *
 *   "no baseline yet", never "estimated" (F51, F93). Under cold start there is
 *   no measurement and a fixed limit is being applied. Calling that an estimate
 *   would claim a number we do not have — the same failure the 500 AU floor and
 *   the never-impute rule exist to prevent.
 *
 *   "no sessions logged in N days", never "you took N days off" (F68, F94).
 *   Logging is self-report. Unlogged training and no training are
 *   indistinguishable from here, and the copy must not claim to tell them
 *   apart — least of all to a coach who will repeat it to the client.
 *
 * Both required phrases are emitted verbatim and LOWER CASE mid-sentence, so a
 * surface (or a test) matching the exact string always finds it.
 *
 * F95 IS SCOPED, BY RULING. "Exceeds the red threshold for this baseline" is
 * said only in the regimes that HAVE a baseline — measured and return. A
 * cold-start red has none, so the phrase would claim a measurement we do not
 * hold and would contradict F93's "no baseline yet" in the same breath; that
 * case says it is past the fixed red limit instead (F134). F135 pins the
 * negative: "for this baseline" appears nowhere in any cold-start output.
 */

/** Coach-facing names for the axes — the internal keys are never printed. */
export const BS_AXIS_LABELS = {
  volume: 'weekly volume',
  concentration: 'hardest session',
  distribution: 'day-to-day spread',
};

const axisLabel = (axis) => BS_AXIS_LABELS[axis] || axis;

/** The one rounding point in the module. Non-finite never becomes a word. */
const show = (n) => (finite(n) ? String(Math.round(n)) : null);

/**
 * How far precision may escalate before a figure stops being readable.
 *
 * ⚠ ANY finite cap leaves a residual band — two numbers can always differ by
 * less than the last digit printed. `pairAt` returns null there rather than
 * printing a false equality, and the clause says "just over its limit" instead
 * of quoting a limit it cannot distinguish.
 */
export const BS_MAX_DISPLAY_DECIMALS = 3;

/**
 * A value and the ceiling it was judged against, printed at the SMALLEST
 * precision that keeps them distinct.
 *
 * WHY THIS EXISTS: whole-number rounding can collapse a real difference —
 * a 2380.4 AU week over a 2380 AU ceiling is amber, and printing "2380 AU
 * against a 2380 AU limit" reads as a bug to the coach, which is the one
 * impression this whole design exists to avoid. Escalating the DISPLAY is not
 * nudging the figures: 2380.4 is exactly the number the comparison was made on,
 * shown at the resolution the comparison happened at. Nothing upstream changes.
 *
 * Escalation fires ONLY when the distinction is actually lost (F136-F138): a
 * week whose whole numbers already differ prints whole numbers.
 *
 * @returns {{value:string, ceiling:string}|null} null when the two are
 *   indistinguishable at every precision this module will print
 */
function pairAt(value, ceiling) {
  for (let dp = 0; dp <= BS_MAX_DISPLAY_DECIMALS; dp += 1) {
    const v = value.toFixed(dp);
    const c = ceiling.toFixed(dp);
    if (v !== c) return { value: v, ceiling: c };
  }
  return null;
}

const sentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "a, b and c" — the axis names F96 requires alongside the compound phrase. */
function nameList(labels) {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * One tripped check as a clause. Each check reports against ITS OWN threshold —
 * a red check quotes the red ceiling, an amber one the amber ceiling — so a
 * concentration axis that is red on the peak and amber on the share does not
 * print two numbers pretending to be the same limit.
 */
function checkClause(check) {
  if (!finite(check.value)) return null;
  const ceiling = check.state === 'red' ? check.redCeiling : check.ceiling;
  // The share has no red ceiling by design (it is null), so a red
  // concentration axis legitimately reaches here with nothing to compare
  // against — the clause drops the comparison rather than printing a limit
  // that does not exist.
  const pair = finite(ceiling) ? pairAt(check.value, ceiling) : null;

  const share = check.check === 'share_of_week';
  const unit = share ? '%' : ' AU';
  const head = (v) => {
    if (share) return `${v}% of the week in its single hardest session`;
    return check.check === 'weekly_total' ? `${v} AU this week` : `a ${v} AU hardest session`;
  };

  if (!finite(ceiling)) return head(show(check.value));
  // Indistinguishable even at full display precision. Every clause here is a
  // TRIPPED check, so the value is strictly over its ceiling — "just over" is
  // the honest reading, and quoting two identical figures is not.
  if (!pair) return `${head(show(check.value))}, just over its limit`;
  return `${head(pair.value)} against a ${pair.ceiling}${unit} limit`;
}

/**
 * The clauses for the axes that actually decided the state.
 *
 * Driven by `contributingAxes` rather than by every axis, because an amber axis
 * sitting beside a red one did not contribute to the verdict and naming it
 * would read as though it had. That list is derived in exactly one place —
 * `bsResolveState` — which is why the copy layer reads it instead of
 * re-deriving it and eventually disagreeing.
 */
function trippedClauses(result) {
  const axes = Array.isArray(result.axes) ? result.axes : [];
  const contributing = Array.isArray(result.contributingAxes) ? result.contributingAxes : [];
  const clauses = [];
  for (const axis of axes) {
    if (!axis || !contributing.includes(axis.axis)) continue;
    for (const check of (Array.isArray(axis.checks) ? axis.checks : [])) {
      if (!check || !check.tripped) continue;
      const clause = checkClause(check);
      if (clause) clauses.push(clause);
    }
  }
  return clauses;
}

/**
 * What the regime itself adds — and the home of both doctrine phrases.
 *
 * This rides on EVERY flag, including a compound red, which is how a cold-start
 * compound red still carries "no baseline yet" (F51: *any* cold-start flag).
 */
function regimeNote(result) {
  if (result.regime === 'cold_start') {
    return 'Fixed limits — no baseline yet, so nothing here is drawn from this '
      + "client's own weeks.";
  }
  if (result.regime === 'return') {
    const days = show(result.gapDays);
    // No gap figure is a cannot-say, not a zero: the sentence drops the number
    // rather than printing "no sessions logged in 0 days", which would be a
    // claim about the client's history that this result does not make.
    return days === null
      ? 'Reduced limits — this client is returning after an interruption.'
      : `Reduced limits — no sessions logged in ${days} days.`;
  }
  const baseline = show(result.baseline && result.baseline.au);
  return baseline === null
    ? null
    : `Measured against this client's own ${baseline} AU baseline.`;
}

/** What each `unknown` reason means to the person reading it. */
const BS_UNKNOWN_DETAIL = {
  malformed_history: "Some of this client's logged sessions could not be read, so "
    + 'there is no history to compare against. That is a data problem to fix, not a '
    + 'problem with the week.',
  incomplete_week: 'Some sessions in this week have no duration or no effort target '
    + 'yet, so there is nothing to measure.',
  unscoreable: 'The comparison could not be completed.',
};

/**
 * The words for a guardrail result — the only place guardrail wording lives.
 *
 * @param {*} result a `bsProgressionGuardrail` result
 * @returns {{chip:string, line:string, detail:string|null, axes:string[]}|null}
 *   null for green (F97) and for no result at all — nothing to say either way
 */
export function bsGuardrailCopy(result) {
  // No result object is a CALLER-side condition — a fetch that failed, a value
  // never assigned. This function cannot diagnose it and does not pretend to.
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;

  // F97 — green says nothing. A guardrail that speaks when there is no finding
  // trains a coach to stop reading it.
  if (result.state === 'green') return null;

  const axes = Array.isArray(result.contributingAxes) ? [...result.contributingAxes] : [];

  // ⚠ ANYTHING UNRECOGNISED LANDS HERE, NOT IN GREEN'S null. A state this
  // function does not know is exactly the case where rendering nothing would be
  // read as a pass — the failure §10 exists to prevent, repeated at the copy
  // layer. Rule D also requires an unknown to be VISIBLE and to carry its
  // reason, which is why this returns copy at all rather than null.
  if (result.state !== 'amber' && result.state !== 'red') {
    return {
      chip: 'NOT CHECKED',
      line: 'This week could not be checked.',
      detail: BS_UNKNOWN_DETAIL[result.reason] || BS_UNKNOWN_DETAIL.unscoreable,
      axes: [],
    };
  }

  const clauses = trippedClauses(result);
  const body = clauses.join('; ');
  const compound = result.state === 'red' && result.redPath === 'compound';

  let line;
  if (compound) {
    // F96 — the phrase AND the axis names. The names come first because a coach
    // needs to know what to change before being told how it added up.
    const named = nameList(axes.map(axisLabel)) || 'more than one limit';
    line = `${sentenceCase(named)} are over their limits together — multiple `
      + 'limits reached at once.';
  } else if (result.state === 'red' && result.regime !== 'cold_start') {
    // F95 — verbatim, and only where a baseline exists to be exceeded. The
    // figures lead and the verdict follows, in every state, so a coach reads
    // the same shape of sentence whatever tripped.
    line = body
      ? `${sentenceCase(body)} — this exceeds the red threshold for this baseline.`
      : 'This week exceeds the red threshold for this baseline.';
  } else if (result.state === 'red') {
    line = body
      ? `${sentenceCase(body)} — past the red limit.`
      : 'This week is past the red limit.';
  } else {
    line = body ? `${sentenceCase(body)}.` : 'This week is over its amber limit.';
  }

  const detail = [
    // On a compound red the numbers move to the detail, because the headline is
    // about the combination rather than any single figure.
    compound && body
      ? `${sentenceCase(body)}. Each is inside its own red limit; the combination `
        + 'is what reads red.'
      : null,
    regimeNote(result),
  ].filter(Boolean).join(' ');

  return {
    chip: result.state === 'red' ? 'RED' : 'AMBER',
    line,
    detail: detail || null,
    axes,
  };
}
