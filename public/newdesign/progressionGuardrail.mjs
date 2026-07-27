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

function issue(index, field, value) {
  return { index, field, value: describe(value) };
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

function zoneFormatter(timeZone) {
  // A non-string zone must be rejected BEFORE construction. `timeZone:
  // undefined` and `timeZone: null` do not throw — they silently fall back to
  // the RUNTIME's zone, which would bucket a client's history under whichever
  // machine happened to evaluate it. That is the one failure mode this whole
  // section exists to prevent.
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return null;
  if (zoneFormatters.has(timeZone)) return zoneFormatters.get(timeZone);
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
  const mondayIndex = (new Date(anchor).getUTCDay() + 6) % 7; // 0 = Monday
  return {
    localDateISO: isoDateFromUtcMs(anchor),
    weekStartISO: isoDateFromUtcMs(anchor - mondayIndex * DAY_MS),
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
 * @returns {{eligible:number, rated:number, loadAu:number, measured:boolean, malformed:Array}}
 */
export function bsWeekLoad(sessions) {
  if (!Array.isArray(sessions)) {
    // Not a caller bug we can name a row for — the whole collection is wrong.
    return {
      eligible: 0,
      rated: 0,
      loadAu: 0,
      measured: false,
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

/** Sum a set of already-classified, non-malformed sessions into one week. */
function tally(classified) {
  let eligible = 0;
  let rated = 0;
  let loadAu = 0;
  for (const c of classified) {
    if (c.eligible) eligible += 1;
    if (c.rated) {
      rated += 1;
      loadAu += c.au;
    }
  }
  return { eligible, rated, loadAu, measured: rated > eligible / 2 };
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
 *            loadAu:number, measured:boolean, sessions:number}>, malformed:Array}}
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
