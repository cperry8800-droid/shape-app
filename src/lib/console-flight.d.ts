import type { Gate, CoderabbitVerdict, CodexVerdict } from '@/app/console/flight-types';

export const REQUIRED_CHECKS: ReadonlyArray<string>;
export const CODERABBIT_BOTS: ReadonlyArray<string>;
export const CODEX_BOTS: ReadonlyArray<string>;

// Narrower than Gate on purpose: check runs can't produce 'blocked' (that
// state belongs to a reviewer that was prevented from running at all).
export function gateFromRuns(
  runs: Array<{ name?: string; status?: string; conclusion?: string | null }>
): Exclude<Gate, 'blocked'>;

export function coderabbitVerdict(args: {
  reviews?: Array<{ user?: { login?: string }; state?: string; commit_id?: string }>;
  comments?: Array<{ user?: { login?: string }; body?: string }>;
  headSha?: string;
}): CoderabbitVerdict;

export function codexVerdict(args: {
  reviews?: Array<{
    user?: { login?: string };
    body?: string;
    commit_id?: string;
    submitted_at?: string;
  }>;
  comments?: Array<{ user?: { login?: string }; body?: string; created_at?: string }>;
  headSha?: string;
}): CodexVerdict;

// CodeRabbit is deliberately absent: it is a breadth sweep, not a gate.
export function prAllGreen(p: {
  ci?: string;
  codex?: string;
  draft?: boolean;
}): boolean;
