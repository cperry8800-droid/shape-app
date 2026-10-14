// The $5 Shape membership's Stripe side: starting its checkout and confirming it on return.
//
// ⚠ A MEMBER COMES BACK FROM STRIPE BEFORE THE WEBHOOK HAS WRITTEN THEIR ROW. Membership is
// read from `platform_subscriptions` alone (membership-core.ts), and the webhook usually lands
// a few seconds after the browser does, so a member returning to the coach they were about to
// subscribe to was refused as a non-member on the next click. The checkout now returns through
// /api/stripe/platform-return, which reads the session from Stripe and writes the same row the
// webhook writes (keyed on the subscription id, so the two writes are one row), then sends the
// member on to where they started.

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_SUB } from '@/lib/membership-core';
import { appendParam } from '@/lib/return-path';
import { claimCheckout, currentCheckout } from '@/lib/checkout-barrier';
import { hasLiveStripeSubscription } from '@/lib/stripe-live-subscription';

/** Where a member lands after joining when nothing asked for somewhere else. */
export const MEMBERSHIP_HOME = '/newdesign/ClientApp.html#today';

/** The success URL for a membership checkout: confirm, then continue to `next` (a same-origin path). */
export function membershipReturnUrl(origin: string, next: string): string {
  return `${origin}${appendParam('/api/stripe/platform-return', 'session_id', '{CHECKOUT_SESSION_ID}')}&next=${encodeURIComponent(next)}`;
}

export async function createPlatformCheckout(opts: {
  priceId: string;
  userId: string;
  /** The account's own Stripe customer (stripe-customer.ts), so the membership lands on it. */
  customerId: string;
  /** Older checkouts made a customer per session from the email; those are looked at too. */
  email: string | null;
  origin: string;
  next: string;
  cancelPath: string;
}): Promise<{ alreadyMember: true } | { alreadyMember: false; url: string | null }> {
  // One payable membership checkout at a time (checkout-barrier.ts): an open one is handed back.
  // CheckoutInProgressError and a failed Stripe read propagate; callers answer them.
  const release = await claimCheckout(opts.userId, 'shape_platform');
  try {
    // ⚠ ASKED HERE, WHILE HOLDING THE CLAIM (Codex on #2353): a request that waited on the claim
    // can arrive after the first checkout was paid, when there is nothing open to hand back.
    // Stripe holds the subscription the moment it is paid; our row comes later.
    if (await hasLiveStripeSubscription({ customerId: opts.customerId, email: opts.email }, { client_id: opts.userId, plan: 'shape_platform' })) {
      return { alreadyMember: true };
    }
    const open = await currentCheckout(opts.customerId, (s) => s.metadata?.plan === 'shape_platform');
    if (open) return { alreadyMember: false, url: open };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: opts.priceId, quantity: 1 }],
      customer: opts.customerId,
      client_reference_id: opts.userId,
      metadata: { client_id: opts.userId, plan: 'shape_platform' },
      subscription_data: { metadata: { client_id: opts.userId, plan: 'shape_platform' } },
      success_url: membershipReturnUrl(opts.origin, opts.next),
      cancel_url: `${opts.origin}${opts.cancelPath}`,
      allow_promotion_codes: true,
    });
    return { alreadyMember: false, url: session.url ?? null };
  } finally {
    await release();
  }
}

/**
 * Reads a returning membership checkout from Stripe and, when its subscription is live, writes
 * the member's row. Returns 'active' only when the row was written. Anyone may load the return
 * URL: the row comes from Stripe's own record of the session, so a replay writes the same row.
 */
export async function confirmPlatformCheckout(sessionId: string): Promise<'active' | 'pending'> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  if (session.metadata?.plan !== 'shape_platform' || session.status !== 'complete') return 'pending';
  const clientId = session.metadata?.client_id || session.client_reference_id;
  const sub = session.subscription && typeof session.subscription === 'object'
    ? (session.subscription as Stripe.Subscription)
    : null;
  if (!clientId || !sub || !ACTIVE_SUB.has(sub.status)) return 'pending';
  const periodEnd = sub.items?.data?.[0]?.current_period_end;
  const { error } = await createAdminClient()
    .from('platform_subscriptions')
    .upsert({
      client_id: clientId,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_cents: session.amount_total ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    }, { onConflict: 'stripe_subscription_id' });
  if (error) {
    console.error('[platform-membership] confirm upsert failed', { sessionId, error: error.message });
    return 'pending';
  }
  return 'active';
}
