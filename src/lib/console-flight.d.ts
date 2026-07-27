import type { Gate, CoderabbitVerdict } from '@/app/console/flight-types';

export const REQUIRED_CHECKS: ReadonlyArray<string>;
export const CODERABBIT_BOTS: ReadonlyArray<string>;
export const CODEX_BOTS: ReadonlyArray<string>;

export function gateFromRuns(
  runs: Array<{ name?: string; status?: string; conclusion?: string | null }>
): Gate;

export function coderabbitVerdict(args: {
  reviews?: Array<{ user?: { login?: string }; state?: string; commit_id?: string }>;
  comments?: Array<{ user?: { login?: string }; body?: string }>;
  headSha?: string;
}): CoderabbitVerdict;

export function codexPresent(args: {
  reviews?: Array<{ user?: { login?: string } }>;
  comments?: Array<{ user?: { login?: string } }>;
}): 'present' | 'none';

export function prAllGreen(p: {
  ci?: string;
  coderabbit?: string;
  codex?: string;
  draft?: boolean;
}): boolean;
