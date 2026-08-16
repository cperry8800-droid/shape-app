// src/lib/supabase/auth-cookies.mjs
//
// Server-side clearing of the Supabase auth cookies, so a sign-out route's
// 200 is an ASSERTION rather than a hope. Module shape: `.mjs` + a
// hand-written `.d.ts` (the call-rpc.mjs / console-triage.mjs pattern),
// because the predicate has to be reachable from `node --test`, which cannot
// import TypeScript.
//
// ⚠ WHY THIS EXISTS AT ALL — the response code is load-bearing. Four separate
// surfaces gate their cross-tab sign-out broadcast on `res.ok` from
// /api/auth/signout or DELETE /api/auth/session (pageShell.jsx, index.html,
// SignOutButton.tsx, mobile shapeBackend.js). The rule at every one of those
// call sites is: a MISSED broadcast leaves sibling tabs as they were, but a
// PREMATURE one manufactures a signed-in tab that nothing corrects. So the
// 200 must mean "this browser no longer holds a usable session cookie".
// Before this module the routes returned 200 having simply discarded
// `signOut()`'s result, and the guarantee rested entirely on an auth-js
// implementation detail.
//
// ⚠ THE IMPLEMENTATION DETAIL IT DELIBERATELY STOPS DEPENDING ON. auth-js
// 2.111.0 (what @supabase/ssr resolves here today) calls `_removeSession()`
// BEFORE returning a failed global-revocation error — so on an auth-service
// outage the cookie really was cleared and the 200 happened to be honest.
// The website's vendored auth-js 2.108.2 (public/vendor/supabase-js-2.108.2.umd.js)
// does the OPPOSITE: it returns first, which is exactly why its `scope:'local'`
// retry is load-bearing over there. Two versions apart, same function,
// opposite ordering — and nothing in a lockfile bump would tell you the
// ordering flipped. Clearing the cookies ourselves makes the route's answer
// independent of which version is installed.
//
// Order of operations at the call site is still signOut() FIRST, then this:
// signOut() is what revokes the refresh token server-side. This only
// guarantees the local cookie state; it is not a substitute for revocation.

// Supabase writes the session as `sb-<projectRef>-auth-token`, chunked into
// `.0`, `.1`, ... when it outgrows one cookie, plus `-code-verifier` during a
// PKCE exchange. Anchored at both ends so it cannot match an unrelated cookie
// that merely contains the substring.
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+|-code-verifier)?$/;

/**
 * True when `name` is one of the Supabase auth cookies this app should drop on
 * sign-out. Pure — exported so the rule is unit-testable without next/headers.
 */
export function isSupabaseAuthCookie(name) {
  return typeof name === 'string' && SUPABASE_AUTH_COOKIE.test(name);
}

/**
 * Expires every Supabase auth cookie present on the request. Returns the names
 * it cleared, so a caller can log or assert on the count.
 *
 * ⚠ A cookie is deleted by NAME + PATH + DOMAIN, not by value — the expiry
 * must be written with the same `path` the cookie was set with or the browser
 * keeps the original. @supabase/ssr writes at the default path `/`, which is
 * what both sign-out routes and the middleware use, so `/` is correct here.
 * `maxAge: 0` is the delete signal, and applyShapeCookieOptions carves it out
 * explicitly (cookie-options.ts) so the 30-day session policy cannot resurrect
 * a cookie that is being removed.
 */
export function clearSupabaseAuthCookies(store) {
  const cleared = [];
  for (const cookie of store.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    store.set(cookie.name, '', { path: '/', maxAge: 0, httpOnly: true });
    cleared.push(cookie.name);
  }
  return cleared;
}
