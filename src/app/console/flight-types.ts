// Shared flight types — a type-only module so ConsoleClient and the
// /api/console/flight route read ONE source of truth without the client ever
// importing the server route (review round 1: duplication invites drift, and
// some bundling paths follow type-only edges).

export type Gate = 'green' | 'red' | 'running' | 'none';

export type CoderabbitVerdict = 'approved' | 'clean' | 'changes' | 'commented' | 'none';

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
