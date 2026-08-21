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
  reviews?: Array<{ user?: { login?: string }; state?: string; commit_id?: string; submitted_at?: string }>;
  comments?: Array<{ user?: { login?: string }; body?: string }>;
  reviewComments?: Array<{ user?: { login?: string }; original_commit_id?: string; created_at?: string }>;
  headSha?: string;
}): CoderabbitVerdict;

export function nextPageUrl(link: string | null | undefined): string | null;

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

// Codex is deliberately absent: the house stopped using it (owner, 2026-08-20), so a
// Codex record says nothing about whether THIS head was reviewed.
export function prAllGreen(p: {
  ci?: string;
  coderabbit?: string;
  draft?: boolean;
}): boolean;
