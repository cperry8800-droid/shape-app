// CORS for the installed app (Capacitor). The app's pages are served from the device,
// at `capacitor://localhost` (iOS) or `https://localhost` (Android, androidScheme
// 'https'), and call this server at VITE_API_BASE_URL, so every /api call it makes is
// cross-origin. A call carrying `Authorization` (every signed-in call) or a JSON body is
// preflighted, and until this module no /api route answered a preflight or named an
// allowed origin (only /api/apply did, for itself). The WebView refused them all: Nora,
// confirm cards, transcription, the greeting (Codex, #2249).
//
// ⚠ TWO ORIGINS, NAMED, AND NO CREDENTIALS. Only the app's own origins are allowed, never
// a reflected or `*` origin. `Access-Control-Allow-Credentials` is never sent, so the
// browser sends no cookie on these calls and exposes no response to a cookie-carrying
// one: a page served from localhost on someone's computer cannot read a website
// session through this (GET /api/auth/session returns tokens as JSON). The app signs its
// calls with a Bearer token, which needs no cookie, so with no credentials allowed a call
// from these origins can do no more than curl can.

import { NextResponse } from 'next/server';

export const NATIVE_APP_ORIGINS: readonly string[] = ['capacitor://localhost', 'https://localhost'];

// Routes that answer CORS themselves; two sources for one header would be a conflict.
const SELF_CORS_PREFIXES = ['/api/apply'];

const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
// Cache-Control and Pragma: a WebView can add both to a `cache: 'no-store'` fetch and name them
// in the preflight, and the app reads with no-store throughout (Codex, #2251).
const ALLOW_HEADERS = 'Authorization, Content-Type, Accept, Cache-Control, Pragma';
const EXPOSE_HEADERS = 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining';

/** The origin to allow for this request, or null: an /api path, from the app, not self-served. */
export function nativeCorsOrigin(pathname: string, origin: string | null): string | null {
  if (!origin || !pathname.startsWith('/api/')) return null;
  if (SELF_CORS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;
  return NATIVE_APP_ORIGINS.includes(origin) ? origin : null;
}

/** The answer to the app's preflight. It runs before the session, rate-limit and member gate,
 *  which would otherwise refuse a preflight for carrying no Authorization of its own. */
export function nativePreflight(origin: string): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

/** Names the app's origin on a response, whatever produced it (the route, a 401, a 429). */
export function withNativeCors<T extends Response>(res: T, origin: string): T {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  const vary = res.headers.get('Vary');
  if (!vary || !/(^|,\s*)origin(\s*,|$)/i.test(vary)) res.headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  return res;
}
