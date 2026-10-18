// Types for coach-trajectory.mjs — the practice-trajectory series behind the
// Business plate (review 2026-09-09, R8). The module is plain JS so the test
// suite can drive it; this file is what the analytics routes type against.

export const TRAJECTORY_WEEKS: number;

export function mondayUTC(ms: number): number;

export function subNeverStarted(row: Record<string, unknown> | null | undefined): boolean;

export function subEndedAt(row: Record<string, unknown> | null | undefined, now?: number): number | null;

// Open subscriptions, and the coach↔client relationship (active, trialing, past_due).
export const OPEN_SUB_STATUSES: string[];

// The rows open at `now` by the series' own rule (the ones its latest week counts).
export function openSubsAt<T extends Record<string, unknown>>(subs?: T[], now?: number): T[];

// Today's clients (people) and monthly gross and net from those rows: buildTrajectory's latest week.
export function practiceToday(subs?: Array<Record<string, unknown>>, opts?: {
  now?: number;
  cutCents?: (priceCents: number, feeBps: number | null) => number;
}): { clients: number; mrrGrossCents: number; mrrNetCents: number };

// Every status that does not close a span (open, or never a client): a read of the rows that ended
// filters on everything else.
export const NOT_ENDED_STATUSES: string[];

// When a row ended (the series' own close, clamped to now) and whether that ended the client's
// membership: false when another of their plans was open at the close of the ISO week it ended in
// (at now for the current week, the instant the series' weekly `ended` is judged at), or the row has
// not ended.
export function subDeparture(
  row: Record<string, unknown>,
  subs?: Array<Record<string, unknown>> | null,
  now?: number,
): { endedAt: number | null; departed: boolean };

export type TrajectoryBucket = {
  weekOf: string;
  active: number;
  added: number;
  ended: number;
  mrrGrossCents: number;
  mrrNetCents: number;
  oneTimeCents: number;
  oneTimeNetCents: number;
};

export type TrajectorySummary = {
  activeNow: number;
  active30dAgo: number;
  addsThisMonth: number;
  endedThisMonth: number;
  churnRate30dPct: number | null;
  medianTenureDays: number | null;
  oneTime30dCents: number;
  totalEverSubscribed: number;
};

export type CoachTrajectory = {
  weeks: TrajectoryBucket[];
  firstSubAt: string | null;
  summary: TrajectorySummary;
};

export function buildTrajectory(opts?: {
  subs?: Array<Record<string, unknown>>;
  purchases?: Array<Record<string, unknown>>;
  now?: number;
  weeks?: number;
  cutCents?: (priceCents: number, feeBps: number | null) => number;
}): CoachTrajectory;
