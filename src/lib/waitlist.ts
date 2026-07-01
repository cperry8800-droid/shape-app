// src/lib/waitlist.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  WAITLIST_INVITE_TTL_DAYS,
  ACTIVE_WAITLIST_STATUSES,
  computePositions,
} from './waitlist.mjs';

export { WAITLIST_INVITE_TTL_DAYS, ACTIVE_WAITLIST_STATUSES, computePositions };

export type WaitlistStatus = 'waiting' | 'invited' | 'booked' | 'declined' | 'left';
export type ProviderRole = 'trainer' | 'nutritionist';

// Resolve the caller from a cookie session OR a Supabase Bearer token (mirrors
// the checkout-session route so mobile + web both work).
export async function resolveRequestUser(
  request: Request
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anon) return null;
    const token = bearer[1];
    const client = createSupabaseClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

// True when this client holds a non-expired invite for this coach — the
// first-dibs bypass consulted by the purchase guards.
export async function hasActiveWaitlistInvite(
  admin: SupabaseClient,
  clientId: string,
  providerRole: ProviderRole,
  providerId: number
): Promise<boolean> {
  const { data } = await admin
    .from('coach_waitlist')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider_role', providerRole)
    .eq('provider_id', providerId)
    .eq('status', 'invited')
    .gt('invite_expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
