export type TwoFactorState = 'verified' | 'verify' | 'enroll';

export const STAFF_VERIFY_PATH: string;
export const STAFF_PAGE_PREFIXES: ReadonlyArray<string>;
export function isStaffPage(pathname: unknown): boolean;
export function twoFactorState(input: { currentLevel?: string | null; verifiedFactors?: number }): TwoFactorState;
export function staffNext(raw: unknown): string;
export function verifyUrl(pathname: string, search?: string): string;
export function cleanCode(value: unknown): string;
