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
//
// On a coach's own account (direct charges, `account`), the buyer is the member's customer THERE
// (stripe_connected_customers): only that customer is asked, on that account. Customers found by
// email on a coach's account are the coach's own business, never the member's. ⚠ And there a
// subscription's metadata is the coach's to write (Codex on #2403): one the coach made off Shape
// with the member's ids would block every real checkout, so the caller passes `shapes`, which
// counts only a subscription Shape's application made. One already on Shape's books is found by
// the caller's own read of its rows.

import { stripe } from '@/lib/stripe';
import { ACTIVE_SUB } from '@/lib/membership-core';

export async function hasLiveStripeSubscription(
  buyer: { customerId: string | null; email: string | null },
  metadata: Record<string, string>,
  account: string | null = null,
  shapes: (sub: { id?: string; application?: unknown }) => boolean = () => true
): Promise<boolean> {
  const opts = account ? { stripeAccount: account } : undefined;
  const ids = new Set<string>();
  if (buyer.customerId) ids.add(buyer.customerId);
  if (buyer.email && !account) {
    const customers = await stripe.customers.list({ email: buyer.email, limit: 20 });
    for (const c of customers.data) ids.add(c.id);
  }
  for (const customer of ids) {
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 50 }, opts);
    const match = subs.data.some(
      (sub) => ACTIVE_SUB.has(sub.status) && Object.entries(metadata).every(([k, v]) => sub.metadata?.[k] === v) && shapes(sub)
    );
    if (match) return true;
  }
  return false;
}
