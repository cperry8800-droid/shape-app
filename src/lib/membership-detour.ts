// The server-action checkouts (/subscribe and /purchase) hold the same rule as the API routes:
// coaching needs an active Shape membership (owner, 2026-10-14). Returns where to send a buyer
// instead of the coach's checkout (the $5 checkout, which comes back to the coach's profile,
// or the profile with an error), or null when they are a member.
// ⚠ It never calls redirect() itself: redirect() throws, so the caller redirects, outside any try.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMembership } from '@/lib/membership-core';
import { createPlatformCheckout } from '@/lib/platform-membership';
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { isCheckoutInProgress } from '@/lib/checkout-barrier';

export async function membershipDetour(opts: {
  supabase: SupabaseClient;
  user: { id: string; email?: string | null; email_confirmed_at?: string | null };
  backHref: string;
  origin: string;
}): Promise<string | null> {
  const { supabase, user, backHref, origin } = opts;
  const email = user.email ?? null;
  let membership;
  try {
    membership = await computeMembership(supabase, user.id, email, { emailConfirmed: !!user.email_confirmed_at, strict: true });
  } catch {
    return `${backHref}&error=membership_check_failed`;
  }
  if (membership.isKnownMinor) return `${backHref}&error=age_restricted`;
  if (membership.isMember) return null;
  const priceId = process.env.STRIPE_PLATFORM_PRICE_ID;
  if (!priceId) return `${backHref}&error=membership_required`;
  try {
    const customerId = await stripeCustomerFor(user.id, email);
    const result = await createPlatformCheckout({ priceId, userId: user.id, customerId, email, origin, next: backHref, cancelPath: backHref });
    // Paid moments ago and our row not written yet (Codex on #2353): no second membership.
    if (result.alreadyMember) return `${backHref}&member=pending`;
    return result.url ?? `${backHref}&error=membership_required`;
  } catch (e) {
    if (isCheckoutInProgress(e)) return `${backHref}&error=checkout_in_progress`;
    console.error('[membership-detour] membership checkout failed', e);
    return `${backHref}&error=membership_check_failed`;
  }
}
