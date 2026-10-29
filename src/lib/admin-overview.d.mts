export type OverviewTile = { label: string; value: string; sub: string; href: string; count?: number };
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
export type CelebrationCounts = { birthdays: { week: number; today: number }; anniversaries: { week: number; today: number } };
export function overviewSections(stats: AdminOverviewStats | null | undefined, extras?: { celebrations?: CelebrationCounts | null; accountRequests?: number | null }): OverviewSection[];
export function niceMax(max: number): number;
export function dailyColumns(
  daily: ReadonlyArray<{ day: string }> | null | undefined,
  key: string,
  box?: { width?: number; height?: number }
): { top: number; total: number; cols: DailyColumn[] };
export type SourceRow = { source: string; count: number };
export function sourceRows(list: unknown): SourceRow[];
export function surfaceLine(surfaces: Record<string, number> | null | undefined): string;
export function birthdayLabel(month: unknown, day: unknown): string;
export function whenLabel(daysUntil: unknown): string;
export function celebrationCounts(answer: unknown): CelebrationCounts;
export function yearsLabel(years: unknown): string;
export type OverviewView = { key: 'summary' | 'growth' | 'money' | 'coaching' | 'engagement' | 'clicks'; label: string; sections: ReadonlyArray<string>; blurb?: string };
export const OVERVIEW_VIEWS: ReadonlyArray<OverviewView>;
export function overviewView(raw: unknown): OverviewView;
export function viewHref(key: string): string;
export function keyNumbers(sections: OverviewSection[] | null | undefined): OverviewTile[];
export function waitingLine(tiles: OverviewTile[] | null | undefined): { total: number; line: string };
