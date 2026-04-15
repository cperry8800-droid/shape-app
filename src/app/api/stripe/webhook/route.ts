// Stripe webhook — records subscriptions on checkout.session.completed and
// keeps their status in sync on customer.subscription.updated/deleted.
//
// Requires STRIPE_WEBHOOK_SECRET in the environment. Uses the raw request
// body for signature verification (NEVER parse as JSON first).

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error('[shape-app] stripe webhook signature failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clientId = session.metadata?.client_id;
        const providerId = session.metadata?.provider_id;
        const providerRole = session.metadata?.provider_role;
        const priceCents = Number(session.metadata?.price_cents ?? 0);

        if (!clientId || !providerId || !providerRole) {
          console.warn('[shape-app] checkout.session.completed missing metadata', session.id);
          break;
        }

        // Fetch the subscription so we can store the current period end.
        let currentPeriodEnd: string | null = null;
        if (typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          // @ts-expect-error — current_period_end exists at runtime
          currentPeriodEnd = isoOrNull(sub.current_period_end);
        }

        await admin.from('subscriptions').upsert(
          {
            client_id: clientId,
            provider_id: Number(providerId),
            provider_role: providerRole,
            stripe_customer_id:
              typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
            stripe_subscription_id:
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id ?? null,
            status: 'active',
            price_cents: priceCents || null,
            current_period_end: currentPeriodEnd,
          },
          { onConflict: 'stripe_subscription_id' }
        );
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
        // @ts-expect-error — current_period_end exists at runtime
        const currentPeriodEnd = isoOrNull(sub.current_period_end);

        await admin
          .from('subscriptions')
          .update({ status, current_period_end: currentPeriodEnd })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      default:
        // Other events (invoice.paid, etc.) are ignored for now.
        break;
    }
  } catch (err) {
    console.error('[shape-app] stripe webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
