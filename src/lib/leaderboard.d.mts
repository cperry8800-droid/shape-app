export type Scope = 'everyone' | 'following' | 'team';
export type Period = 'week' | 'month' | 'all';
export type CoachView = 'standing' | 'climb';
export type CoachRole = 'trainer' | 'nutritionist';
export type HiddenReason = 'off' | 'private' | 'team_unasked' | 'team_off';
export type Privacy = { leaderboard: boolean; teamBoard: boolean | null };

export const MEMBER_TIERS: Array<[string, number]>;
export const COACH_TIERS: Array<[string, number]>;
export const SCOPES: Scope[];
export const PERIODS: Period[];
export const COACH_VIEWS: CoachView[];
export const COACH_ROLES: CoachRole[];

export function memberTier(points: unknown): string | null;
export function coachTier(points: unknown): string | null;
export function parseScope(raw: unknown): Scope;
export function parsePeriod(raw: unknown): Period;
export function parseCoachView(raw: unknown): CoachView;
export function parseCoachRole(raw: unknown): CoachRole | null;
export function parseLimit(raw: unknown, fallback?: number): number;
export function shortName(full: unknown): string;
export function normalizeVisibility(raw: unknown): 'public' | 'friends' | 'private';
export function readPrivacy(prefsDoc: unknown): Privacy;
export function writePrivacy(prefsDoc: unknown, change: { leaderboard?: unknown; teamBoard?: unknown }): Record<string, unknown>;
export function hiddenReason(scope: Scope, privacy: Privacy | null, visibility: unknown): HiddenReason | null;
export function moved(rank: unknown, prevRank: unknown): number | null;

export type MemberEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  rank: number | null;
  prevRank: number | null;
  moved: number | null;
  tier: string | null;
  /** The caller's own row only; null on everyone else's. */
  streak: number | null;
  trainingDays: number | null;
  mealDays: number | null;
  isMe: boolean;
};
export type CoachEntry = {
  providerId: number;
  name: string;
  specialty: string | null;
  avatarUrl: string | null;
  points: number;
  tier: string | null;
  activeClients: number;
  completionPct: number;
  rank: number | null;
  prevRank: number | null;
  moved: number | null;
  gained: number | null;
  isMe: boolean;
  listed: boolean;
};
export function memberEntry(row: Record<string, unknown>): MemberEntry;
export function coachEntry(row: Record<string, unknown>): CoachEntry;
export function trimCoachBoard(entries: CoachEntry[], limit?: number): { entries: CoachEntry[]; total: number; me: CoachEntry | null };
