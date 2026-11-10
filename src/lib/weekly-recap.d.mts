// Types for weekly-recap.mjs (plain ESM, so node --test loads it as it is).
export type RecapWeek = { weekStart: string; weekEnd: string; startMs: number; endMs: number };
export type Recap = { workouts: number; activeMinutes: number | null; mealDays: number; daysActive: number; points: number; streak: number };
export function recapWeek(args: { now: number; zone?: string | null; which?: 'last' | 'current' }): RecapWeek;
export function buildRecap(args: {
  sessions?: Array<{ status?: string | null; started_at?: string | null; ended_at?: string | null; created_at?: string | null }>;
  ledger?: Array<{ delta?: number | null; earned_at?: string | null; source_kind?: string | null }>;
  week: RecapWeek;
  zone?: string | null;
  now: number;
}): Recap;
export const STREAK_MAX_DAYS: number;
export const RECAP_HISTORY_DAYS: number;
export const DAY_MS: number;
