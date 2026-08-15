// Session-cookie policy for the auth cookies the app writes.
//
// ⚠ Enforcement lives in the setAll ADAPTERS (middleware.ts + server.ts), not
// in createServerClient's `cookieOptions` — @supabase/ssr 0.12.4 spreads
// cookieOptions and then OVERWRITES maxAge with its own 400-day default when
// building set-cookie options (dist/main/cookies.js:233,464), so the config
// route silently does nothing for lifetime. applyShapeCookieOptions() is the
// path that actually works.
//
// maxAge 30 days: the middleware re-issues the cookie on every request, so an
// active member's session rolls forward indefinitely; only a device idle for
// 30 days signs out. (SDK default is 400 days — a stolen cookie valid > 1 yr.)
//
// httpOnly true: safe because this app has no browser Supabase client
// (src/lib/supabase/client.ts has zero importers; the static site keeps its
// own localStorage session and the /api/auth/session bridge sets cookies
// server-side). Honest scope: this stops script READS of the cookie itself —
// but GET /api/auth/session still returns the tokens as JSON to same-origin
// callers (the legacy-page bootstrap bridge), so origin XSS retains that
// avenue until the bridge is redesigned. Registered follow-up; httpOnly is
// defense in depth here, not a complete XSS answer.
export const SHAPE_SESSION_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 30,
  httpOnly: true,
} as const;

type CookieSetOptions = Record<string, unknown> & { maxAge?: number };

// Merge the policy over whatever the SDK asked for — EXCEPT deletions: the SDK
// removes cookies by setting maxAge 0 (sign-out, chunk cleanup), and stomping
// that with 30 days would resurrect every cookie it tries to delete.
export function applyShapeCookieOptions<T extends CookieSetOptions | undefined>(
  options: T
): CookieSetOptions {
  const base = (options ?? {}) as CookieSetOptions;
  if (base.maxAge === 0) return { ...base, httpOnly: true };
  return { ...base, ...SHAPE_SESSION_COOKIE_OPTIONS };
}
