// Shared flight types — a type-only module so ConsoleClient and the
// /api/console/flight route read ONE source of truth without the client ever
// importing the server route (review round 1: duplication invites drift, and
// some bundling paths follow type-only edges).

// 'blocked' = the gate could not run at all (distinct from failed, pending and
// absent). It must never read as any of those three.
export type Gate = 'green' | 'red' | 'running' | 'blocked' | 'none';

// 'limited' = CodeRabbit was capped and never started; not a verdict, and not
// the same as having commented.
export type CoderabbitVerdict = 'approved' | 'clean' | 'changes' | 'commented' | 'limited' | 'none';

export type FlightPr = {
  number: number;
  title: string;
  url: string;
  branch: string;
  createdAt: string;
  draft: boolean;
  ci: Gate;
  coderabbit: CoderabbitVerdict;
  codex: 'present' | 'none';
  allGreen: boolean;
};

export type Flight = {
  ok: boolean;
  reason?: 'no_token' | 'github_error';
  generatedAt: string;
  ciMain: Gate;
  prs: FlightPr[];
};
