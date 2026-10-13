export type OverviewTile = { label: string; value: string; sub: string; href: string };
export type OverviewSection = { key: string; title: string; note: string; tiles: OverviewTile[] };
export type DailyRow = { day: string; signups: number; active: number; workouts: number; applications: number };
export type AdminOverviewStats = {
  generated_at?: string;
  timezone?: string;
  today?: string;
  daily?: DailyRow[];
  [section: string]: unknown;
};
export type DailyColumn = { day: string; value: number; x: number; w: number; y: number; h: number };

export const DAILY_CHARTS: ReadonlyArray<{ key: 'signups' | 'active' | 'workouts' | 'applications'; title: string }>;
export type TierRow = { name: string; from: number; count: number };
export const TIER_THRESHOLDS: ReadonlyArray<number>;
export const MEMBER_TIERS: ReadonlyArray<string>;
export const COACH_TIERS: ReadonlyArray<string>;
export function tierIndex(points: unknown): number;
export function tierName(points: unknown, coach?: boolean): string;
export function tierBreakdown(stats: AdminOverviewStats | null | undefined): { members: TierRow[]; coaches: TierRow[] };
export function daysSince(iso: string | null | undefined, now: string | null | undefined): number;
export function formatCount(v: unknown): string;
export function countOf(v: unknown, one: string, many?: string): string;
export function formatMoney(cents: unknown): string;
export function shapeMrrCents(stats: AdminOverviewStats | null | undefined): number;
export function overviewSections(stats: AdminOverviewStats | null | undefined): OverviewSection[];
export function niceMax(max: number): number;
export function dailyColumns(
  daily: DailyRow[] | null | undefined,
  key: string,
  box?: { width?: number; height?: number }
): { top: number; total: number; cols: DailyColumn[] };
