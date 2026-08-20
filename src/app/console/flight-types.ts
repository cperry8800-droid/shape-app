// Shared flight types — a type-only module so ConsoleClient and the
// /api/console/flight route read ONE source of truth without the client ever
// importing the server route (review round 1: duplication invites drift, and
// some bundling paths follow type-only edges).

// 'blocked' = the gate has no usable verdict for THIS head and needs an action —
// either it could not run at all (CodeRabbit capped) or it ran against a different
// commit (a stale Codex pass). Distinct from failed, pending and absent, and it
// must never read as any of those three.
export type Gate = 'green' | 'red' | 'running' | 'blocked' | 'none';

// 'limited' = CodeRabbit was capped and never started; not a verdict, and not
// the same as having commented.
export type CoderabbitVerdict = 'approved' | 'clean' | 'changes' | 'commented' | 'limited' | 'none';

// Codex is THE gate, and it is head-pinned. 'stale' = Codex ran, but its verdict
// names a different commit than the head (or names none at all) — neither a pass
// nor an absence, and the action for it is a re-trigger. It replaced
// 'present' | 'none', under which any Codex record the PR ever had opened the gate.
export type CodexVerdict = 'clean' | 'findings' | 'stale' | 'none';

export type FlightPr = {
  number: number;
  title: string;
  url: string;
  branch: string;
  createdAt: string;
  draft: boolean;
  ci: Gate;
  coderabbit: CoderabbitVerdict;
  codex: CodexVerdict;
  allGreen: boolean;
};

export type Flight = {
  ok: boolean;
  reason?: 'no_token' | 'github_error';
  generatedAt: string;
  ciMain: Gate;
  prs: FlightPr[];
};
