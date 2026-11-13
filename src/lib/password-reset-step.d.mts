export const RESET_MIN_LENGTH: number;
export const RESET_OTHER_FACTOR: string;
export function cleanCode(value: unknown): string;
export function resetNeedsCode(input?: { currentLevel?: string | null; verifiedFactors?: number }): boolean;
export function resetPasswordError(error: { code?: unknown; message?: unknown; name?: unknown } | null | undefined): {
  error: string;
  needsCode?: boolean;
  expired?: boolean;
};
export function resetCodeError(error: { code?: unknown } | null | undefined): string;
