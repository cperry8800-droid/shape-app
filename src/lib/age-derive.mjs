// Age derivation for the 18+ gate — pure, so the birthday boundary is testable.
//
// ⚠ WHY THE GATE CANNOT TRUST `profiles.over_18` ALONE. That column is written
// by the set_over_18() trigger, which fires only when the `profiles` row is
// WRITTEN — so it is an age SNAPSHOT taken when the DOB was recorded, not a fact
// about today. An account that recorded a DOB at 17 keeps `over_18 = false`
// after its eighteenth birthday until some unrelated profile edit happens to
// re-fire the trigger, and signing in does not write that row. The 2026-08-15
// DOB freeze makes that worse rather than better: it removes the one
// self-service write that would have recomputed it. So an adult could be refused
// indefinitely by a gate that is supposed to be about minors.
//
// Deriving from the date at READ time makes the gate self-correcting and removes
// the dependence on trigger timing; `over_18` stays only as the denormalised
// fallback for rows that carry no usable DOB.
//
// Lives in .mjs (with a hand-written .d.ts) because `node --test` cannot import
// TypeScript — the established pattern for pure logic in src/lib. It imports
// nothing, so it stays safe for the edge proxy's import chain.

/** Ages in years that the 18+ gate is defined against. */
export const ADULT_AGE_YEARS = 18;

/**
 * How far the reference instant is rolled BACK before its calendar day is read:
 * 12 hours, the westernmost UTC offset in the tz database (`Etc/GMT+12`, the
 * "Anywhere on Earth" convention). Reading the day at UTC−12 is what makes
 * adulthood true in EVERY timezone before this function will assert it.
 */
export const ADULT_REFERENCE_OFFSET_MS = 12 * 60 * 60 * 1000;

/**
 * TRUE when `dob` proves the account is under 18 as of `now`, FALSE when it
 * proves 18 or over, and NULL when there is no usable date — null means "this
 * says nothing", never "adult".
 *
 * ⚠ ADULTHOOD IS ASSERTED ONLY ONCE IT IS TRUE IN EVERY TIMEZONE — the calendar
 * day is read at UTC−12 (`ADULT_REFERENCE_OFFSET_MS`), not at UTC. An earlier
 * version compared at UTC and called that a one-directional safety margin. It was
 * the opposite: the UTC day runs AHEAD of every zone west of UTC, so there the
 * gate declared adulthood BEFORE the member's local eighteenth birthday and
 * admitted a minor early, by up to the zone's offset. Verified counterexample —
 * DOB 2008-08-17 at 2026-08-17T00:30:00Z read as an ADULT while it was still
 * Aug 16 in America/Los_Angeles and America/New_York.
 *
 * The cost of the margin is in the SAFE direction and is bounded: a member is
 * refused for up to 12h after local midnight at UTC (26h at UTC+14) on the day
 * they turn 18. Refusing an adult briefly is a nuisance; admitting a minor is the
 * failure this gate exists to prevent, so the trade runs this way deliberately.
 *
 * ⚠ THIS DELIBERATELY NO LONGER MATCHES `set_over_18()`, which compares against
 * `current_date` (UTC) and so is up to a day less conservative. That cannot put
 * two gates into disagreement about a person, because `over_18` is never the
 * decider when a usable DOB exists: both consumers read
 * `fromDob !== null ? fromDob : over_18 === false` (age-gate.ts,
 * membership-core.ts), and when the DOB is null the trigger writes NULL too, so
 * neither side has an opinion. Confirmed against the LIVE catalog on 2026-08-16
 * rather than the migration files: no policy, view, constraint or other function
 * reads `over_18` — `set_over_18()` is the only object that mentions it, and it
 * only writes it. The column is a denormalised snapshot, not a second gate.
 *
 * The finer fix is the member's OWN calendar day, and it is not available: it
 * needs `client_profiles.timezone` (read by `shape_user_tz(uid)`), and that table
 * holds ZERO rows — every account would fall through to this margin anyway, at
 * the cost of a second table read on the middleware hot path. Revisit when that
 * column is actually populated; the margin is correct in the meantime, not a
 * placeholder.
 *
 * @param {unknown} dob  a `YYYY-MM-DD` date string, or anything at all
 * @param {Date|number} [now]  injectable clock; defaults to the real one
 * @returns {boolean|null}
 */
/**
 * The instant from which an account must PROVE adulthood to pass the age gates.
 *
 * ⚠ WHY THIS EXISTS — the defect no amount of signup patching could close. Every
 * gate used to read `isKnownMinor = fromDob !== null ? fromDob : over_18 === false`,
 * i.e. only an explicit proof of MINORITY refused and absence ADMITTED. So any
 * account that reached a session without a stored date of birth was admitted:
 * a failed profile upsert, an email-confirmation callback that never provisioned,
 * an approved-coach invitation, or simply the next signup surface someone adds.
 * Four consecutive review rounds found four different routes to that same state,
 * because the hole is not on any one write path — it is the read-time default.
 * Absence of data is not a promise; entitlement keys on an explicit stamp.
 *
 * ⚠ WHY A CUTOFF RATHER THAN A FLAT FLIP. Accounts created before Shape collected
 * a date of birth cannot prove anything and are not their owners' fault, so they
 * are grandfathered. Verified against production on 2026-08-16: exactly 2 profiles
 * exist, both DOB-null, the newest created 2026-06-13 — so this cutoff grandfathers
 * two pre-launch accounts and requires proof of every account made from here on.
 *
 * ⚠ THIS IS A ONE-WAY RATCHET. Moving it FORWARD re-opens the hole for every
 * account created in the widened window. It may only ever move backward (or be
 * deleted once no grandfathered account remains).
 */
export const ADULT_PROOF_REQUIRED_FROM = Date.UTC(2026, 7, 16);

/**
 * TRUE when the age gates must REFUSE this profile.
 *
 * The order matters: a usable date of birth decides in BOTH directions, so a
 * proven adult is never refused by the cutoff. Only when the row proves nothing
 * either way does the account's age decide whether absence is grandfathered.
 *
 * ⚠ A NULL/absent profile REFUSES. That is the point: "no row" is precisely the
 * state a failed provisioning write leaves behind, and it used to be admitted.
 * Callers must therefore SELECT `created_at` alongside the age columns — a
 * forgotten column reads as an unplaceable account and refuses. That is the safe
 * direction, and tests/age-gate-null-policy.test.mjs pins every gate's select so
 * the mistake fails the build rather than the login.
 *
 * @param {{date_of_birth?: unknown, over_18?: unknown, created_at?: unknown}|null|undefined} profile
 * @param {Date|number} [now]
 * @returns {boolean}
 */
export function mustRefuseForAge(profile, now = Date.now()) {
  const fromDob = isMinorFromDob(profile?.date_of_birth, now);
  if (fromDob !== null) return fromDob;
  // The trigger-written flag is the fallback for rows carrying no usable date.
  // It cannot be set from the client (set_over_18() derives it and discards any
  // supplied value), so `true` is genuine proof of adulthood.
  const over18 = profile?.over_18;
  if (over18 === false) return true;
  if (over18 === true) return false;
  // Nothing proves anything. Grandfather only accounts that predate the rule.
  const created = Date.parse(
    typeof profile?.created_at === 'string' || typeof profile?.created_at === 'number'
      ? profile.created_at
      : NaN
  );
  if (!Number.isFinite(created)) return true;
  return created >= ADULT_PROOF_REQUIRED_FROM;
}

/**
 * The ONE parse of a `YYYY-MM-DD` birthdate: `{y, mo, d, born}` or null.
 *
 * Extracted so age and the 18+ rule cannot disagree about which strings are
 * valid — a second copy is a second thing to keep in step, which is the class of
 * defect this whole module exists to prevent. Behaviour is unchanged from the
 * inline version isMinorFromDob carried; the mirror test asserts that.
 */
function parseDobParts(dob) {
  if (typeof dob !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  // Reject calendar-impossible dates rather than letting Date.UTC roll them
  // forward — Feb 30 silently becomes Mar 2, which would bucket a birthday into
  // a day the member never had. (The same Date.parse trap the guardrail wave hit.)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const born = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(born)) return null;
  const probe = new Date(born);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return { y, mo, d, born };
}

export function isMinorFromDob(dob, now = Date.now()) {
  const parts = parseDobParts(dob);
  if (!parts) return null;
  const { y, mo, d, born } = parts;
  // Read the calendar day at UTC−12 so "today" means today in the LAST timezone
  // to reach it — see the header. Subtracting from the instant is exactly the
  // westernmost local date; no tz database lookup is involved.
  const ref = new Date((typeof now === 'number' ? now : now.getTime()) - ADULT_REFERENCE_OFFSET_MS);
  // ⚠ VALIDATE THE RESULTING DATE, NOT THE INPUT NUMBER. A finite input can still
  // be outside the Date range (|t| > 8.64e15), and every field read below then
  // yields NaN — which falls through the comparison as `born > NaN` = false, i.e.
  // it declares an ADULT from a clock we could not read. Null is the only honest
  // answer for an unusable clock.
  if (!Number.isFinite(ref.getTime())) return null;
  // The comparison itself is the trigger's: dob <= today - 18y ⇒ adult. Only the
  // day `today` refers to differs, and only ever in the refusing direction.
  //
  // ⚠ THE CUTOFF MUST BE CLAMPED, NOT ROLLED. Postgres CLAMPS an impossible
  // anniversary (`date '2028-02-29' - interval '18 years'` → 2010-02-28) while
  // `Date.UTC` ROLLS IT FORWARD (Feb 29 → Mar 1). Unclamped, on Feb 29 of a leap
  // year a member born exactly 18 years earlier on Mar 1 read as an ADULT here
  // and a MINOR to the trigger — at 17y364d. That admits a real minor (the
  // unsafe direction) and makes the two gates disagree about one person, which is
  // the whole reason this module exists. Only February can roll, but the guard is
  // written generally. Both cutoffs verified against production Postgres
  // 2026-08-16; recurs every leap year (2028, 2032, 2036…).
  const cy = ref.getUTCFullYear() - ADULT_AGE_YEARS;
  const cm = ref.getUTCMonth();
  let cutoff = Date.UTC(cy, cm, ref.getUTCDate());
  // Day 0 of the NEXT month is the last day of the intended one — the clamp.
  if (new Date(cutoff).getUTCMonth() !== cm) cutoff = Date.UTC(cy, cm + 1, 0);
  return born > cutoff;
}

/**
 * The member's age in whole years as of `now`, or NULL when there is no usable
 * date or clock. Null means "says nothing" — never 0.
 *
 * ⚠ READS THE SAME REFERENCE DAY AS THE 18+ RULE (UTC−12), DELIBERATELY. Using a
 * different clock here would let the gate and the displayed age disagree about
 * whether someone's birthday has happened — one person, two answers, which is
 * exactly the divergence this module exists to prevent. The cost is that an age
 * ticks over up to a day late for members east of UTC−12, in the same
 * under-stating direction the gate already chose.
 *
 * ⚠ FEB 29 IS CLAMPED, NOT ROLLED, matching isMinorFromDob and Postgres. In a
 * non-leap year the anniversary of a Feb 29 birth falls on Feb 28 — rolling it to
 * Mar 1 would leave a leap-day member reading a year younger for one day.
 */
export function ageFromDob(dob, now = Date.now()) {
  const parts = parseDobParts(dob);
  if (!parts) return null;
  const { y, mo, d } = parts;

  // Same clock-validity guard as the gate: a finite input can still be outside the
  // Date range, and every field read then yields NaN — which would fall through the
  // comparisons below and produce a fabricated age from a clock we could not read.
  const ref = new Date((typeof now === 'number' ? now : now.getTime()) - ADULT_REFERENCE_OFFSET_MS);
  if (!Number.isFinite(ref.getTime())) return null;

  const ry = ref.getUTCFullYear();
  const rm = ref.getUTCMonth() + 1;
  const rd = ref.getUTCDate();

  // The anniversary's day-of-month in the reference year, clamped for Feb 29.
  let annivDay = d;
  if (mo === 2 && d === 29) {
    const leap = (ry % 4 === 0 && ry % 100 !== 0) || ry % 400 === 0;
    if (!leap) annivDay = 28;
  }

  let age = ry - y;
  // Not yet reached this year's anniversary ⇒ one year younger.
  if (rm < mo || (rm === mo && rd < annivDay)) age -= 1;

  // A future birthdate has no age. Null rather than a negative number: a caller
  // rendering "-3" is worse than a caller rendering nothing.
  if (age < 0) return null;
  return age;
}
