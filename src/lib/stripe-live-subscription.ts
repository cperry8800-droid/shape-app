// "Does this buyer already hold this subscription?" asked of Stripe itself.
//
// ⚠ OUR OWN TABLES LAG THE PAYMENT (Codex on #2353). `subscriptions` and
// `platform_subscriptions` are written when Stripe's webhook arrives, seconds after the buyer
// is back on our page, so a duplicate check that read only our tables let a buyer who pressed
// Subscribe again in that window pay twice. Stripe holds the subscription the moment the
// checkout completes, so the checkout routes ask here as well as there.
//
// The account's own customer (stripe-customer.ts) is where every checkout now lands. Checkouts
// from before it made a customer per session from the buyer's email, so customers with that
// email are read too. A Stripe failure throws: the caller refuses rather than risk a second
// charge.

import { stripe } from '@/lib/stripe';
import { ACTIVE_SUB } from '@/lib/membership-core';

export async function hasLiveStripeSubscription(
  buyer: { customerId: string | null; email: string | null },
  metadata: Record<string, string>
): Promise<boolean> {
  const ids = new Set<string>();
  if (buyer.customerId) ids.add(buyer.customerId);
  if (buyer.email) {
    const customers = await stripe.customers.list({ email: buyer.email, limit: 20 });
    for (const c of customers.data) ids.add(c.id);
  }
  for (const customer of ids) {
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 50 });
    const match = subs.data.some(
      (sub) => ACTIVE_SUB.has(sub.status) && Object.entries(metadata).every(([k, v]) => sub.metadata?.[k] === v)
    );
    if (match) return true;
  }
  return false;
}
