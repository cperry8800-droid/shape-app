// One Stripe customer per Shape account, kept on profiles.stripe_customer_id: a column only the
// server can write (guard_profile_identity_columns puts back any member's own change).
//
// ⚠ CHECKOUTS USED TO MAKE A NEW CUSTOMER EVERY TIME (Codex on #2353). They passed the buyer's
// email and Stripe created a customer per session, so the only way to ask Stripe "does this
// account already pay for this?" was to look customers up by email. An account with no email
// (a phone sign-up) could not be found at all, and a second press before the webhook landed
// paid twice. Every checkout now names the account's own customer, so the question has one
// place to look, and the billing portal shows every subscription the account holds.

import { stripe } from '@/lib/stripe';
import { platformCoachCustomer } from '@/lib/stripe-connect';
import { createAdminClient } from '@/lib/supabase/admin';

export async function stripeCustomerFor(userId: string, email: string | null): Promise<string> {
  const admin = createAdminClient();
  const read = async (): Promise<string | null> => {
    const { data, error } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).maybeSingle();
    if (error) throw error;
    return ((data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id) ?? null;
  };
  const existing = await read();
  if (existing) return existing;
  // ⚠ A MEMBER WHO PAID BEFORE THIS ALREADY HAS A CUSTOMER (Codex on #2353): the webhook kept it
  // on their subscription rows only. That one is adopted, in the order the billing portal opens
  // them (the membership's first), so a new coach subscription lands where the member manages
  // the rest instead of on a second customer the portal never shows.
  // ⚠ ONLY A PLATFORM CUSTOMER IS EVER ADOPTED (coach direct charges, 2026-10-18): a coaching
  // subscription on a coach's own Stripe account holds a customer on THAT account, which Shape's
  // account has never heard of (platformCoachCustomer reads only rows on the platform).
  const onRecord = async (table: 'platform_subscriptions' | 'subscriptions'): Promise<string | null> => {
    const { data, error } = table === 'subscriptions'
      ? await platformCoachCustomer(admin, userId)
      : await admin.from(table).select('stripe_customer_id')
        .eq('client_id', userId).not('stripe_customer_id', 'is', null).limit(1).maybeSingle();
    if (error) throw error;
    return ((data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id) ?? null;
  };
  let customerId = (await onRecord('platform_subscriptions')) ?? (await onRecord('subscriptions'));
  if (!customerId) {
    // The idempotency key gives two first checkouts started together one customer, not two.
    const customer = await stripe.customers.create(
      { ...(email ? { email } : {}), metadata: { client_id: userId } },
      { idempotencyKey: `shape-customer-${userId}` }
    );
    customerId = customer.id;
  }
  // Only fills an empty column, so a customer saved by a concurrent request is never replaced.
  const { error } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId)
    .is('stripe_customer_id', null);
  if (error) throw error;
  return (await read()) ?? customerId;
}
