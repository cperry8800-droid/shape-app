// Types for provider-experience.mjs (hand-written, the .mjs + .d.ts pattern of age-derive.mjs:
// `node --test` cannot import TypeScript, and the app imports the same file).

/** Shape's standard; less is reviewed individually, never refused. */
export declare const EXPERIENCE_STANDARD_YEARS: number;

/** The choices every application surface offers, in order. */
export declare const PROVIDER_EXPERIENCE_OPTIONS: readonly string[];

/** The fewest years an answer states, or NULL for no usable answer. */
export declare function experienceYears(value: unknown): number | null;

/** TRUE when the answer is below the standard. */
export declare function belowExperienceStandard(value: unknown): boolean;

/** What an application still needs on experience, or '' when it has it all. */
export declare function experienceProblem(value: unknown, answers?: Record<string, unknown> | null): string;
