// Types for coach-trajectory.mjs — the practice-trajectory series behind the
// Business plate (review 2026-09-09, R8). The module is plain JS so the test
// suite can drive it; this file is what the analytics routes type against.

export const TRAJECTORY_WEEKS: number;

export function mondayUTC(ms: number): number;

export function subNeverStarted(row: Record<string, unknown> | null | undefined): boolean;

export function subEndedAt(row: Record<string, unknown> | null | undefined, now?: number): number | null;

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
