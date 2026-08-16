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
