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
 * TRUE when `dob` proves the account is under 18 as of `now`, FALSE when it
 * proves 18 or over, and NULL when there is no usable date — null means "this
 * says nothing", never "adult".
 *
 * Compared in UTC to match the trigger's `current_date`, so a birthday resolves on
 * the UTC day.
 *
 * ⚠ THAT IS NOT A ONE-DIRECTIONAL SAFETY MARGIN, AND AN EARLIER VERSION OF THIS
 * COMMENT CLAIMED IT WAS. The UTC day runs AHEAD of every timezone west of UTC, so
 * there this function declares adulthood BEFORE the member's local eighteenth
 * birthday — it admits a minor early, by up to the zone's offset. Verified: with
 * DOB 2008-08-17 at 2026-08-17T00:30:00Z it returns `false` (adult) while it is
 * still Aug 16 in America/Los_Angeles and America/New_York. Only EAST of UTC does
 * the asymmetry refuse an adult a little longer (the safe direction).
 *
 * ⚠ The `set_over_18()` trigger has the IDENTICAL asymmetry — it compares against
 * `current_date`, which is UTC — so this is a property of the rule, not of this
 * file, and fixing only one side would put the two gates back into disagreement
 * (the defect the clamp below exists to prevent).
 *
 * The correct fix is the member's own calendar day: `client_profiles.timezone`
 * holds an IANA zone captured on app open, and Postgres has `shape_user_tz(uid)`.
 * Wiring that through both callers AND the trigger is an OWNER decision — it
 * changes the meaning of an applied, production-verified migration, and "which
 * day is authoritative for an age gate" is a compliance question, not a
 * refactor. Registered in docs/HANDOFF-2026-08-16.md; do not treat the UTC
 * comparison as safe in the meantime.
 *
 * @param {unknown} dob  a `YYYY-MM-DD` date string, or anything at all
 * @param {Date|number} [now]  injectable clock; defaults to the real one
 * @returns {boolean|null}
 */
export function isMinorFromDob(dob, now = Date.now()) {
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
  const ref = new Date(typeof now === 'number' ? now : now.getTime());
  if (!Number.isFinite(ref.getTime())) return null;
  // Same comparison the trigger makes: dob <= today - 18y ⇒ adult.
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
