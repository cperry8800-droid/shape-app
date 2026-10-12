// Edge-safe rate limiter — NO `next/headers`, so it's usable from the proxy
// (Edge runtime). Backed by the `check_rate_limit` Postgres RPC (see
// supabase-migrations/2026-06-15-rate-limits.sql), which atomically increments a
// fixed-window counter and reports whether the caller is still under the limit.
//
// Fails OPEN: if the limiter backend errors or the RPC isn't deployed yet, it
// returns `allowed` so a limiter fault can never take the API down.

import type { SupabaseClient } from '@supabase/supabase-js';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  limit: number;
};

// Opaque bucket keys. `check_rate_limit` is callable directly by anon/auth (the
// proxy's anon client must reach it), so a raw key like `api:u:<uuid>` could be
// hit directly with a guessed identifier to grief a victim's counter. HMAC-ing
// the key with a server-only secret makes the bucket name unforgeable from the
// client. Auto-active in prod: falls back to SUPABASE_SERVICE_ROLE_KEY (never
// exposed; used only as one-way HMAC material) when no dedicated
// RATE_LIMIT_SECRET is set. Degrades to the raw key (still functional) if
// neither secret nor WebCrypto is available. Tier prefix kept for debuggability.
async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  let hex = '';
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

async function rateLimitKey(rawKey: string): Promise<string> {
  const secret =
    (typeof process !== 'undefined'
      ? process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
      : '') || '';
  if (!secret || typeof crypto === 'undefined' || !crypto.subtle) return rawKey;
  try {
    const tier = rawKey.split(':', 1)[0];
    return `${tier}:${await hmacHex(secret, rawKey)}`;
  } catch {
    return rawKey;
  }
}

export async function checkRateLimit(
  client: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
  // A caller whose limit stands in for a stronger check (a bot check) passes `failClosed`: a
  // limiter fault then refuses instead of admitting, so an outage is not a way past the check.
  opts: { failClosed?: boolean } = {}
): Promise<RateLimitResult> {
  const unavailable = { allowed: !opts.failClosed, remaining: opts.failClosed ? 0 : max, resetSeconds: 0, limit: max };
  try {
    const { data, error } = await client.rpc('check_rate_limit', {
      p_key: await rateLimitKey(key),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) return unavailable;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; remaining?: number; reset_seconds?: number }
      | undefined;
    // Strict callers admit only on an explicit `allowed: true` from the limiter.
    if (opts.failClosed && row?.allowed !== true) return { ...unavailable, allowed: false };
    return {
      allowed: row?.allowed !== false,
      remaining: Number(row?.remaining ?? 0),
      resetSeconds: Number(row?.reset_seconds ?? windowSeconds),
      limit: max,
    };
  } catch {
    return unavailable;
  }
}
