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

export async function checkRateLimit(
  client: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const { data, error } = await client.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error || !data) return { allowed: true, remaining: max, resetSeconds: 0, limit: max };
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; remaining?: number; reset_seconds?: number }
      | undefined;
    return {
      allowed: row?.allowed !== false,
      remaining: Number(row?.remaining ?? 0),
      resetSeconds: Number(row?.reset_seconds ?? windowSeconds),
      limit: max,
    };
  } catch {
    return { allowed: true, remaining: max, resetSeconds: 0, limit: max };
  }
}

// Best-effort, UNVERIFIED read of a JWT's `sub` claim — used only to bucket
// rate limits per-user for Bearer (native app) callers, where the proxy has no
// cookie session. Never used for auth decisions, so skipping signature
// verification is safe; a forged token still fails at the route itself.
export function jwtSub(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('binary');
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
