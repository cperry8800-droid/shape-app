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

// BOTH reviewers are deliberately absent: Codex was dropped 2026-08-20 and CodeRabbit
// 2026-08-24, so neither record says anything about whether THIS head was reviewed.
// Their absence from this type is LOAD-BEARING — a caller that tries to feed a reviewer
// verdict back into the gate now fails to compile, rather than quietly closing the gate
// forever the next time a reviewer is retired.
export function prAllGreen(p: {
  ci?: string;
  draft?: boolean;
}): boolean;
