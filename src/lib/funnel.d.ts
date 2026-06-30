export type FunnelStep = { key: string; label: string };
export type FunnelRow = {
  key: string; label: string; count: number;
  pctOfSignup: number; pctDrop: number; isBiggestDrop: boolean;
};
export const FUNNEL_STEPS: ReadonlyArray<FunnelStep>;
export const ANALYTICS_EVENTS: ReadonlyArray<string>;
export function isAnalyticsEvent(name: unknown): boolean;
export function buildFunnel(counts: Record<string, number>): FunnelRow[];
