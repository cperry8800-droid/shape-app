// Stripe webhook — records subscriptions on checkout.session.completed and
// keeps their status in sync on customer.subscription.updated/deleted.
//
// Requires STRIPE_WEBHOOK_SECRET in the environment. Uses the raw request
// body for signature verification (NEVER parse as JSON first).

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';

export const runtime = 'nodejs';

// Notify a coach (provider owner) of revenue. Best-effort; never throws.
async function notifyProviderOwner(
  admin: ReturnType<typeof createAdminClient>,
  providerId: number,
  providerRole: string,
  title: string,
  body: string
): Promise<void> {
  try {
    const table = providerRole === 'nutritionist' ? 'nutritionists' : 'trainers';
    const { data } = await admin.from(table).select('owner_id').eq('id', providerId).maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      await createNotification(admin, { userId: ownerId, type: 'payment', title, body, route: 'sessions' });
    }
  } catch {
    /* best-effort */
  }
}

function usd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

// Stripe API 2026-03-25 removed `Charge.invoice` and `Invoice.subscription` from
// the typed SDK. They're still present at runtime; the structured replacement
// for the subscription link lives under `invoice.parent.subscription_details`.
function extractInvoiceId(charge: Stripe.Charge): string | null {
  const c = charge as unknown as { invoice?: string | { id?: string } | null };
  if (!c.invoice) return null;
  return typeof c.invoice === 'string' ? c.invoice : c.invoice.id ?? null;
}

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as unknown as {
    parent?: {
      subscription_details?: { subscription?: string | { id?: string } | null } | null;
    } | null;
    subscription?: string | { id?: string } | null;
  };
  const ref = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id ?? null;
}

// Safety-net for refunds issued directly in the Stripe dashboard: a refund on a
// Connect destination charge only makes the platform whole if reverse_transfer +
// refund_application_fee were set. When they weren't, Shape eats the coach's 85%.
// This reconciles a refunded destination charge to the "both flags" outcome by
// topping up the transfer reversal + application-fee refund to the amount
// proportional to what was refunded. Idempotent (a refund already issued with the
// flags leaves nothing to top up); platform ($5) charges have no transfer/fee and
// are skipped. Best-effort — never throws.
async function reconcileConnectRefund(charge: Stripe.Charge): Promise<void> {
  const chargeAmount = charge.amount ?? 0;
  const refundedAmount = charge.amount_refunded ?? 0;
  if (chargeAmount <= 0 || refundedAmount <= 0) return;

  const ref = charge as unknown as {
    transfer?: string | { id?: string } | null;
    application_fee?: string | { id?: string } | null;
  };
  const transferId = typeof ref.transfer === 'string' ? ref.transfer : ref.transfer?.id ?? null;
  const feeId = typeof ref.application_fee === 'string' ? ref.application_fee : ref.application_fee?.id ?? null;

  // Reverse the coach transfer, proportional to the refunded amount.
  if (transferId) {
    try {
      const transfer = await stripe.transfers.retrieve(transferId);
      const target = Math.round((transfer.amount * refundedAmount) / chargeAmount);
      const toReverse = target - (transfer.amount_reversed ?? 0);
      if (toReverse > 0) {
        await stripe.transfers.createReversal(
          transferId,
          {
            amount: toReverse,
            description: `Auto-reversal reconciling refund on charge ${charge.id}`,
          },
          // Keyed on the cumulative refunded amount so retried/concurrent
          // deliveries dedupe, while a later additional refund gets a new key.
          { idempotencyKey: `refund-reversal-${charge.id}-${refundedAmount}` }
        );
      }
    } catch (err) {
      console.warn(
        '[shape-app] transfer reversal reconcile failed:',
        err instanceof Error ? err.message : err
      );
    }
  }

  // Return the application fee to the coach, proportional to the refunded amount.
  if (feeId) {
    try {
      const fee = await stripe.applicationFees.retrieve(feeId);
      const target = Math.round((fee.amount * refundedAmount) / chargeAmount);
      const toRefund = target - (fee.amount_refunded ?? 0);
      if (toRefund > 0) {
        await stripe.applicationFees.createRefund(
          feeId,
          { amount: toRefund },
          { idempotencyKey: `refund-appfee-${charge.id}-${refundedAmount}` }
        );
      }
    } catch (err) {
      console.warn(
        '[shape-app] application fee refund reconcile failed:',
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function upsertPlatformSubscription(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    client_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    status: string;
    price_cents: number | null;
    current_period_end: string | null;
  }
) {
  const { error } = await admin
    .from('platform_subscriptions')
    .upsert(row, { onConflict: 'stripe_subscription_id' });

  if (error && error.code !== '42P01') {
    console.warn('[shape-app] platform subscription upsert failed:', error.message);
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Server misconfiguration — every delivery fails until this is set.
    // Logged loudly so it stands out in the deploy logs.
    console.error(
      '[shape-app] STRIPE_WEBHOOK_SECRET is not set — cannot verify Stripe webhooks.'
    );
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
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
              plan_id: session.metadata?.plan_id || null,
              status: 'paid',
            },
            { onConflict: 'stripe_checkout_session_id' }
          );
          // Commit any Shape-credit applied at checkout (debits the wallet once,
          // idempotent by session id). Reserved at session-create, spent here.
          const creditCents = Number(session.metadata?.store_credit_cents ?? 0);
          const creditKind = session.metadata?.store_credit_kind;
          if (creditCents > 0 && (creditKind === 'session' || creditKind === 'nutrition')) {
            const { error: creditErr } = await admin.rpc('consume_store_credit', {
              p_user_id: clientId,
              p_kind: creditKind,
              p_session_id: session.id,
              p_amount_cents: creditCents,
            });
            if (creditErr) console.warn('[shape-app] store credit consume failed:', creditErr.message);
          }
          // 85% of the gross lands with the coach after the 15% platform fee.
          await notifyProviderOwner(
            admin, Number(providerId), providerRole,
            'Payment received',
            `${usd(Math.round(priceCents * 0.85))} from a client${kind === 'meal_plan' ? ' for a meal plan' : kind === 'booking' ? ' for a booking' : ''}.`
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
          currentPeriodEnd = isoOrNull(sub.items.data[0]?.current_period_end);
        }

        if (session.metadata?.plan === 'shape_platform') {
          await upsertPlatformSubscription(admin, {
            client_id: clientId,
            stripe_customer_id:
              typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
            stripe_subscription_id:
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id ?? null,
            status: 'active',
            price_cents: priceCents || null,
            current_period_end: currentPeriodEnd,
          });
          break;
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
        if (providerId && providerRole) {
          await notifyProviderOwner(
            admin, Number(providerId), providerRole,
            'New subscriber',
            `A new client just subscribed${priceCents ? ` · ${usd(Math.round(priceCents * 0.85))}/mo to you` : ''}.`
          );
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
        const currentPeriodEnd = isoOrNull(sub.items.data[0]?.current_period_end);

        await admin
          .from('subscriptions')
          .update({ status, current_period_end: currentPeriodEnd })
          .eq('stripe_subscription_id', sub.id);
        const { error: platformError } = await admin
          .from('platform_subscriptions')
          .update({ status, current_period_end: currentPeriodEnd })
          .eq('stripe_subscription_id', sub.id);
        if (platformError && platformError.code !== '42P01') {
          console.warn('[shape-app] platform subscription update failed:', platformError.message);
        }
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
        // Ensure the coach transfer + platform fee are unwound even if the refund
        // was issued in the Stripe dashboard without reverse_transfer /
        // refund_application_fee (idempotent; no-op for the in-app refund path).
        await reconcileConnectRefund(charge);
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
        const invoiceId = extractInvoiceId(charge);
        if (invoiceId) {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          const subId = extractSubscriptionId(invoice);
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
    // The signature is already verified, so this is a genuine Stripe event —
    // the failure is in our own processing. Returning 500 here makes Stripe
    // retry the event for up to ~3 days and flags the endpoint as failing
    // (the "your webhook is failing" email). A permanently broken event would
    // retry forever. Acknowledge with 200 and log loudly instead, so one bad
    // event can't drag the whole endpoint into a failing state.
    console.error(
      `[shape-app] stripe webhook handler error (event ${event.id}, type ${event.type}):`,
      err
    );
    return NextResponse.json({ received: true, handlerError: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
