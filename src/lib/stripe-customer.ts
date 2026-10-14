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
  // The idempotency key gives two first checkouts started together one customer, not two.
  const customer = await stripe.customers.create(
    { ...(email ? { email } : {}), metadata: { client_id: userId } },
    { idempotencyKey: `shape-customer-${userId}` }
  );
  // Only fills an empty column, so a customer saved by a concurrent request is never replaced.
  const { error } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
    .is('stripe_customer_id', null);
  if (error) throw error;
  return (await read()) ?? customer.id;
}
