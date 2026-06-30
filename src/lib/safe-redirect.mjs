// Same-origin relative-path guard for post-auth / OAuth "return" redirects.
//
// Rejects anything that isn't a single-leading-slash relative path — absolute
// URLs (https://evil.com), protocol-relative (//evil.com), and backslash
// variants (/\evil.com, which browsers normalise to //) — so a crafted
// ?return= can't turn the OAuth callback into an open redirect. Mirrors the
// inline guard already used in src/app/auth/callback/route.ts and
// src/app/login/actions.ts (those could adopt this helper later).
//
// @param {unknown} raw       candidate return target (query param / cookie value)
// @param {string}  fallback  safe default when `raw` is unusable
// @returns {string} a same-origin relative path, or `fallback`
export function safeReturnPath(raw, fallback = '/') {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  if (!v.startsWith('/')) return fallback; // must be a relative path
  if (v.startsWith('//')) return fallback; // protocol-relative -> off-origin
  if (v[1] === '\\') return fallback; // "/\" -> browsers treat as "//"
  return v;
}
