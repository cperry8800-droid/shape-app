// The server-action checkouts (/subscribe and /purchase) hold the same rule as the API routes.
// ⚠ HIRING A COACH IS FREE WITH AN ACCOUNT (owner, 2026-11-10): this used to send a non-member to
// the $5 checkout first (owner, 2026-10-14). What is left is Shape's 18+: returns where to send a
// buyer instead of the coach's checkout (the profile with an error), or null when they may buy.
// ⚠ It never calls redirect() itself: redirect() throws, so the caller redirects, outside any try.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMembership } from '@/lib/membership-core';

export async function membershipDetour(opts: {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null; email_confirmed_at?: string | null };
  backHref: string;
  origin: string;
}): Promise<string | null> {
  const { supabase, user, backHref } = opts;
  let membership;
  try {
    membership = await computeMembership(supabase, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true });
  } catch {
    return `${backHref}&error=membership_check_failed`;
  }
  if (membership.isKnownMinor) return `${backHref}&error=age_restricted`;
  return null;
}
