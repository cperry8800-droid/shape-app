// Types for auth-cookies.mjs. See that file for why the sign-out routes clear
// the cookies themselves instead of trusting signOut()'s return.

/** The minimal mutable cookie store this module needs (Next's `cookies()`). */
export interface AuthCookieStore {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
}

/** True when `name` is a Supabase auth cookie that sign-out should drop. */
export function isSupabaseAuthCookie(name: string): boolean;

/**
 * Expires every Supabase auth cookie on the request (`maxAge: 0`, path `/`).
 * Returns the names cleared.
 */
export function clearSupabaseAuthCookies(store: AuthCookieStore): string[];
