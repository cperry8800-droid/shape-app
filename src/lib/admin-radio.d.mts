export type RadioFilters = { days: number };
export type RadioSplit = { tuneIns: number; seconds: number };
export type RadioDay = { day: string; tune_ins: number; minutes: number; peak: number };
export type RadioSummary = {
  from: string;
  to: string;
  tuneIns: number;
  seconds: number;
  average: number;
  surfaces: { web: RadioSplit; app: RadioSplit };
  audiences: { member: RadioSplit; coach: RadioSplit };
  daily: RadioDay[];
  peak: { listeners: number; at: string; day: string } | null;
  now: { listeners: number; web: number; app: number };
};

export const RADIO_PERIODS: ReadonlyArray<number>;
export function radioFilters(params: unknown): RadioFilters;
export function radioHref(filters: RadioFilters, patch?: Partial<RadioFilters>): string;
export function radioStatsArgs(filters: RadioFilters, timezone: string): { p_days: number; p_tz: string };
export function listenTime(seconds: unknown): string;
export function radioSummary(stats: unknown): RadioSummary;
export function listenShare(seconds: unknown, total: number): string;
