// "Does this buyer already hold this subscription?" asked of Stripe itself.
//
// ⚠ OUR OWN TABLES LAG THE PAYMENT (Codex on #2353). `subscriptions` and
// `platform_subscriptions` are written when Stripe's webhook arrives, seconds after the buyer
// is back on our page, so a duplicate check that read only our tables let a buyer who pressed
// Subscribe again in that window pay twice. Stripe holds the subscription the moment the
// checkout completes, so the checkout routes ask here as well as there.
//
// Checkout makes one Stripe customer per session from the buyer's email, so every customer
// with that email is read. A buyer with no email on the account (a phone sign-up) cannot be
// matched this way, and the table check is all there is. A Stripe failure throws: the caller
// refuses rather than risk a second charge.

import { stripe } from '@/lib/stripe';
import { ACTIVE_SUB } from '@/lib/membership-core';

export async function hasLiveStripeSubscription(
  email: string | null,
  metadata: Record<string, string>
): Promise<boolean> {
  if (!email) return false;
  const customers = await stripe.customers.list({ email, limit: 20 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 50 });
    const match = subs.data.some(
      (sub) => ACTIVE_SUB.has(sub.status) && Object.entries(metadata).every(([k, v]) => sub.metadata?.[k] === v)
    );
    if (match) return true;
  }
  return false;
}
