// Types for age-derive.mjs (hand-written — the .mjs + .d.ts pattern used by
// console-flight / console-triage / funnel, because `node --test` cannot import
// TypeScript and the age boundary needs real test vectors).

export declare const ADULT_AGE_YEARS: number;

/**
 * TRUE when `dob` proves the account is under 18 as of `now`, FALSE when it
 * proves 18 or over, NULL when there is no usable date (null means "says
 * nothing", never "adult").
 */
export declare function isMinorFromDob(dob: unknown, now?: Date | number): boolean | null;
