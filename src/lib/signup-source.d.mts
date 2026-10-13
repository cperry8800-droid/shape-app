export type SignupSource = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing?: string;
  at?: string;
  coach_ref?: true;
  surface?: 'website' | 'app';
  platform?: 'ios' | 'android' | 'web';
};

export const SOURCE_KEY: string;
export const COACH_REF_KEY: string;
export const SOURCE_TTL_MS: number;
export const COACH_REF_TTL_MS: number;
export const CARRIED_KEYS: ReadonlyArray<string>;
export function clip(value: unknown, max?: number): string;
export function referrerHost(referrer: unknown, ownHost?: string): string;
export function touchFrom(input?: { search?: string; referrer?: string; host?: string; path?: string; now?: number }): SignupSource | null;
export function cleanSource(raw: unknown): SignupSource | null;
export function readStored(rawJson: unknown, now?: number): SignupSource | null;
export function nextStored(stored: SignupSource | null, touch: SignupSource | null): SignupSource | null;
export function coachRefLive(rawJson: unknown, now?: number): boolean;
export function trackingAllowed(input?: { consent?: string | null; gpc?: boolean; timeZone?: string }): boolean;
export function forSignup(input?: {
  stored?: SignupSource | null;
  current?: SignupSource | null;
  coachRef?: boolean;
  surface?: 'website' | 'app';
  platform?: string | null;
}): SignupSource;
export function carriedQuery(params: Record<string, string | string[] | undefined> | undefined): string;
