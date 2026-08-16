// Types for age-derive.mjs (hand-written — the .mjs + .d.ts pattern used by
// console-flight / console-triage / funnel, because `node --test` cannot import
// TypeScript and the age boundary needs real test vectors).

export declare const ADULT_AGE_YEARS: number;

/** Milliseconds the reference instant is rolled back before its day is read (UTC−12). */
export declare const ADULT_REFERENCE_OFFSET_MS: number;

/**
 * TRUE when `dob` proves the account is under 18 as of `now`, FALSE when it
 * proves 18 or over, NULL when there is no usable date (null means "says
 * nothing", never "adult").
 *
 * Adulthood is asserted only once it is true in EVERY timezone (the day is read
 * at UTC−12), so the gate never admits a minor early — see age-derive.mjs.
 */
export declare function isMinorFromDob(dob: unknown, now?: Date | number): boolean | null;

/** Instant from which an account must PROVE adulthood; older accounts are grandfathered. */
export declare const ADULT_PROOF_REQUIRED_FROM: number;

/**
 * TRUE when the age gates must REFUSE this profile — absence of proof refuses for
 * any account created at/after ADULT_PROOF_REQUIRED_FROM (a null profile included).
 * Callers MUST select `created_at` alongside the age columns.
 */
export declare function mustRefuseForAge(
  profile:
    | { date_of_birth?: unknown; over_18?: unknown; created_at?: unknown }
    | null
    | undefined,
  now?: Date | number
): boolean;
