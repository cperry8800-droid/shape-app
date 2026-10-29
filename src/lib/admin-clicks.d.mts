export type ClickFilters = { days: number; surface: 'all' | 'web' | 'app'; who: 'all' | 'visitor' | 'member' | 'coach' };
export type ClickSurface = 'web' | 'app';
export type ClickPageRow = { surface: ClickSurface; page: string; name: string; clicks: number };
export type ClickTargetRow = { surface: ClickSurface; page: string; target: string; unnamed: boolean; clicks: number };
export type ClickSummary = {
  from: string;
  to: string;
  total: number;
  surfaces: { web: number; app: number };
  audiences: { visitor: number; member: number; coach: number };
  daily: Array<{ day: string; clicks: number }>;
  pages: ClickPageRow[];
  targets: ClickTargetRow[];
};

export const CLICK_PERIODS: ReadonlyArray<number>;
export const CLICK_SURFACES: ReadonlyArray<{ key: ClickFilters['surface']; label: string }>;
export const CLICK_AUDIENCES: ReadonlyArray<{ key: ClickFilters['who']; label: string }>;
export const SURFACE_LABELS: Readonly<Record<ClickSurface, string>>;
export function clickFilters(params: unknown): ClickFilters;
export function clicksHref(filters: ClickFilters, patch?: Partial<ClickFilters>): string;
export function clickStatsArgs(
  filters: ClickFilters,
  timezone: string,
): { p_days: number; p_surface: ClickSurface | null; p_audience: 'visitor' | 'member' | 'coach' | null; p_tz: string };
export function pageName(surface: unknown, page: unknown): string;
export function targetName(target: unknown): { text: string; unnamed: boolean };
export function clickSummary(stats: unknown): ClickSummary;
export function shareOf(count: unknown, total: number): string;
