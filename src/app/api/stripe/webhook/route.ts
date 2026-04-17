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

        if (!clientId) {
          console.warn('[shape-app] checkout.session.completed missing client_id', session.id);
          break;
        }

        if (session.mode === 'payment') {
          // One-time purchase (booking or meal plan).
          const kind = session.metadata?.kind;
          if (!providerId || !providerRole || !kind) {
            console.warn('[shape-app] one-time checkout missing metadata', session.id);
            break;
          }
          const pi =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          let applicationFeeCents: number | null = null;
          if (pi) {
            const intent = await stripe.paymentIntents.retrieve(pi);
            applicationFeeCents = intent.application_fee_amount ?? null;
          }
          await admin.from('one_time_purchases').upsert(
            {
              client_id: clientId,
              provider_id: Number(providerId),
              provider_role: providerRole,
              kind,
              price_cents: priceCents,
              application_fee_cents: applicationFeeCents,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: pi,
              status: 'paid',
            },
            { onConflict: 'stripe_checkout_session_id' }
          );
          break;
        }

        // Subscription mode — platform or trainer/nutritionist.
        if (!providerId && session.metadata?.plan !== 'shape_platform') {
          console.warn('[shape-app] sub checkout missing metadata', session.id);
          break;
        }

        let currentPeriodEnd: string | null = null;
        if (typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          // @ts-expect-error — current_period_end exists at runtime
          currentPeriodEnd = isoOrNull(sub.current_period_end);
        }

        await admin.from('subscriptions').upsert(
          {
            client_id: clientId,
            provider_id: providerId ? Number(providerId) : null,
            provider_role: providerRole ?? null,
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

      case 'account.updated': {
        // Connect account status change (onboarding progress, restrictions).
        const account = event.data.object as Stripe.Account;
        const providerRole = account.metadata?.provider_role;
        const providerId = Number(account.metadata?.provider_id ?? 0);
        if (!providerRole || !providerId) break;
        const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
        const status = account.charges_enabled && account.payouts_enabled
          ? 'active'
          : account.requirements?.disabled_reason
            ? 'restricted'
            : 'pending';
        await admin.from(table).update({ stripe_account_status: status }).eq('id', providerId);
        break;
      }

      case 'charge.refunded': {
        // Refund happened (admin approved via Stripe dashboard or user flow).
        // Flip the matching one_time_purchase row and any pending refund
        // request to 'refunded'.
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        if (pi) {
          const { data: purchase } = await admin
            .from('one_time_purchases')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', pi)
            .select('id')
            .maybeSingle();
          if (purchase?.id) {
            await admin
              .from('refund_requests')
              .update({ status: 'refunded', processed_at: new Date().toISOString() })
              .eq('one_time_purchase_id', purchase.id)
              .eq('status', 'pending');
          }
        }
        // Subscription refunds come in with an invoice → subscription link.
        // @ts-expect-error — charge.invoice exists at runtime (older SDK typings)
        const chargeInvoice = charge.invoice as string | { id?: string } | null | undefined;
        if (chargeInvoice) {
          const invoiceId = typeof chargeInvoice === 'string' ? chargeInvoice : chargeInvoice.id;
          const invoice = await stripe.invoices.retrieve(invoiceId!);
          // @ts-expect-error — subscription exists on invoice at runtime
          const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
          if (subId) {
            const { data: subRow } = await admin
              .from('subscriptions')
              .select('id')
              .eq('stripe_subscription_id', subId)
              .maybeSingle();
            if (subRow?.id) {
              await admin
                .from('refund_requests')
                .update({ status: 'refunded', processed_at: new Date().toISOString() })
                .eq('subscription_id', subRow.id)
                .eq('status', 'pending');
            }
          }
        }
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;
        if (!pi) break;
        const newStatus = event.type === 'charge.dispute.created' ? 'disputed' : 'paid';
        await admin
          .from('one_time_purchases')
          .update({ status: newStatus })
          .eq('stripe_payment_intent_id', pi);
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
