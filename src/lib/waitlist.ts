// src/lib/waitlist.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  WAITLIST_INVITE_TTL_DAYS,
  ACTIVE_WAITLIST_STATUSES,
  isActiveWaitlistRow,
  computePositions,
} from './waitlist.mjs';

export {
  WAITLIST_INVITE_TTL_DAYS,
  ACTIVE_WAITLIST_STATUSES,
  isActiveWaitlistRow,
  computePositions,
};

export type WaitlistStatus = 'waiting' | 'invited' | 'booked' | 'declined' | 'left';
export type ProviderRole = 'trainer' | 'nutritionist';

export type RequestUser = { id: string; email: string | null };

// Resolve the caller AND a caller-scoped (RLS-enforced) Supabase client from a
// cookie session OR a Supabase Bearer token, so user-initiated waitlist actions
// run under the caller's own identity — never the service role. Mirrors the
// checkout-session auth so mobile (Bearer) + web (cookie) both work.
export async function resolveRequestClient(
  request: Request
): Promise<{ user: RequestUser; supabase: SupabaseClient } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anon) return null;
    const token = bearer[1];
    const supabase = createSupabaseClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(token);
    if (!data.user) return null;
    return { user: { id: data.user.id, email: data.user.email ?? null }, supabase };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { user: { id: data.user.id, email: data.user.email ?? null }, supabase };
}

// Back-compat: just the caller (used where the RLS-scoped client isn't needed).
export async function resolveRequestUser(request: Request): Promise<RequestUser | null> {
  const resolved = await resolveRequestClient(request);
  return resolved ? resolved.user : null;
}

// True when this client holds a non-expired invite for this coach — the
// first-dibs bypass consulted by the purchase guards. Runs through the caller's
// RLS-scoped client (the "clients read own waitlist" policy). THROWS on a lookup
// error so callers can surface a distinct retryable state instead of silently
// treating a DB/RLS failure as "no invite" (which would wrongly deny first-dibs).
export async function hasActiveWaitlistInvite(
  client: SupabaseClient,
  clientId: string,
  providerRole: ProviderRole,
  providerId: number
): Promise<boolean> {
  const { data, error } = await client
    .from('coach_waitlist')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider_role', providerRole)
    .eq('provider_id', providerId)
    .eq('status', 'invited')
    .gt('invite_expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`waitlist invite lookup failed: ${error.message}`);
  return Boolean(data);
}
