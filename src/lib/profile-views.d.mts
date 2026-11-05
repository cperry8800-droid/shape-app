// Types for profile-views.mjs: the profile-view beacon's rules and the funnel's read of the counts.
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProfileViewRole = 'trainer' | 'nutritionist';
export const PROFILE_VIEW_ROLES: ReadonlyArray<ProfileViewRole>;
export const PROFILE_VIEW_BODY_MAX: number;
export const PROFILE_VIEW_DAYS: number;
export function isLikelyBot(ua: unknown): boolean;
export function cleanProfileView(raw: unknown): { role: ProfileViewRole; id: number } | null;
export function callerAddress(headers: Headers): string;
export function viewBuckets(secret: string | null | undefined, address: string, role: ProfileViewRole, id: number): { view: string; addr: string };
export function viewsSinceDay(now?: number, days?: number): string;
export function coachProfileViews(
  supabase: SupabaseClient,
  role: ProfileViewRole,
  providerId: number,
  opts?: { now?: number; days?: number }
): Promise<number | null>;
