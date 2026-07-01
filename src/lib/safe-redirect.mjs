// Same-origin relative-path guard for post-auth / OAuth "return" redirects.
//
// Rejects anything that isn't a single-leading-slash relative path — absolute
// URLs (https://evil.com), protocol-relative (//evil.com), backslash variants
// (/\evil.com, which browsers normalise to //), and values containing ASCII
// control chars (WHATWG URL strips newline/CR/tab, so "/\n/evil.com" resolves
// off-origin) — so a crafted ?return= can't turn the OAuth callback into an open
// redirect. Mirrors the inline guard already used in
// src/app/auth/callback/route.ts and src/app/login/actions.ts.
//
// @param {unknown} raw       candidate return target (query param / cookie value)
// @param {string}  fallback  safe default when `raw` is unusable
// @returns {string} a same-origin relative path, or `fallback`
export function safeReturnPath(raw, fallback = '/') {
  if (typeof raw !== 'string') return fallback;
  const v = raw.trim();
  // Reject C0 control chars (0x00-0x1F) + DEL (0x7F): newline/CR/tab are stripped
  // by the URL parser and would let "/\n/evil.com" resolve off-origin.
  for (let i = 0; i < v.length; i++) {
    const code = v.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  if (!v.startsWith('/')) return fallback; // must be a relative path
  if (v.startsWith('//')) return fallback; // protocol-relative -> off-origin
  if (v[1] === '\\') return fallback; // "/\" -> browsers treat as "//"
  return v;
}
