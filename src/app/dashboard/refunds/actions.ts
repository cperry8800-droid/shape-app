'use server';

// Admin refund processing. A client files a refund request (refunds/actions.ts);
// an admin reviews it here and, on approval, Shape issues the Stripe refund with
// the Connect transfer + application fee unwound so the coach's 85% is clawed
// back and Shape's 15% is returned to the coach (platform nets zero — no more
// "refund the client, coach keeps their pay, Shape eats the loss" leak).
//
// Admin-guarded via requireAdminUser(). The charge.refunded webhook independently
// flips purchase/request status (and reconciles any dashboard-issued refund), so
// this action + the webhook are each idempotent.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { stripe } from '@/lib/stripe';

function clean(value: FormDataEntryValue | null, max = 2000): string {
  return String(value ?? '').trim().slice(0, max);
}

type RefundRequestRow = {
  id: string;
  client_id: string;
  subscription_id: string | null;
  one_time_purchase_id: string | null;
  status: string;
};

type RefundTarget =
  | { kind: 'one_time'; paymentIntentId: string }
  | { kind: 'subscription'; paymentIntentId: string; subscriptionId: string };

// Invoice.payment_intent is read at runtime — the typed field was dropped in
// recent Stripe API versions (mirrors the webhook's defensive extraction).
function extractInvoicePaymentIntentId(invoice: unknown): string | null {
  if (!invoice || typeof invoice === 'string') return null;
  const inv = invoice as { payment_intent?: string | { id?: string } | null };
  const pi = inv.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id ?? null;
}

// Resolve the PaymentIntent a refund request points at (and, for a coach
// subscription, its Stripe subscription id so we can also cancel it).
async function resolveTarget(
  admin: ReturnType<typeof createAdminClient>,
  req: RefundRequestRow
): Promise<RefundTarget | { error: string }> {
  if (req.one_time_purchase_id) {
    const { data } = await admin
      .from('one_time_purchases')
      .select('stripe_payment_intent_id')
      .eq('id', req.one_time_purchase_id)
      .maybeSingle<{ stripe_payment_intent_id: string | null }>();
    if (!data?.stripe_payment_intent_id) return { error: 'purchase_missing_payment_intent' };
    return { kind: 'one_time', paymentIntentId: data.stripe_payment_intent_id };
  }
  if (req.subscription_id) {
    const { data } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('id', req.subscription_id)
      .maybeSingle<{ stripe_subscription_id: string | null }>();
    if (!data?.stripe_subscription_id) return { error: 'subscription_missing_stripe_id' };
    const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id, {
      expand: ['latest_invoice.payment_intent'],
    });
    const piId = extractInvoicePaymentIntentId(
      (sub as unknown as { latest_invoice?: unknown }).latest_invoice
    );
    if (!piId) return { error: 'no_invoice_payment_intent' };
    return { kind: 'subscription', paymentIntentId: piId, subscriptionId: data.stripe_subscription_id };
  }
  return { error: 'invalid_target' };
}

export async function approveRefund(formData: FormData): Promise<void> {
  await requireAdminUser();
  const requestId = clean(formData.get('request_id'), 80);
  const notes = clean(formData.get('admin_notes'), 4000);
  if (!requestId) redirect('/dashboard/refunds?error=missing_request');

  const admin = createAdminClient();
  const { data: req, error } = await admin
    .from('refund_requests')
    .select('id, client_id, subscription_id, one_time_purchase_id, status')
    .eq('id', requestId)
    .maybeSingle<RefundRequestRow>();
  if (error) redirect(`/dashboard/refunds?error=${encodeURIComponent('db_' + (error.code ?? 'error'))}`);
  if (!req) redirect('/dashboard/refunds?error=request_not_found');
  if (req.status === 'refunded') redirect('/dashboard/refunds?updated=already_refunded');

  const target = await resolveTarget(admin, req);
  if ('error' in target) redirect(`/dashboard/refunds?error=${encodeURIComponent(target.error)}`);

  try {
    // Unwind the Connect transfer + application fee only when the charge has them
    // (a coach sale). A platform-only charge refunds plainly.
    const pi = await stripe.paymentIntents.retrieve(target.paymentIntentId, { expand: ['latest_charge'] });
    const charge = (pi as unknown as { latest_charge?: unknown }).latest_charge;
    const c = charge && typeof charge !== 'string' ? (charge as { transfer?: unknown; application_fee?: unknown }) : null;
    const hasTransfer = Boolean(c?.transfer);
    const hasFee = Boolean(c?.application_fee);
    await stripe.refunds.create({
      payment_intent: target.paymentIntentId,
      ...(hasTransfer ? { reverse_transfer: true } : {}),
      ...(hasTransfer && hasFee ? { refund_application_fee: true } : {}),
    });
    // Refunding a coach subscription also cancels it so the client isn't billed
    // again (customer.subscription.deleted then flips the row to canceled).
    if (target.kind === 'subscription') {
      try {
        await stripe.subscriptions.cancel(target.subscriptionId);
      } catch {
        /* already canceled — fine */
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/dashboard/refunds?error=${encodeURIComponent(('stripe: ' + msg).slice(0, 300))}`);
  }

  const now = new Date().toISOString();
  await admin
    .from('refund_requests')
    .update({ status: 'refunded', processed_at: now, admin_notes: notes || null })
    .eq('id', requestId);
  if (req.one_time_purchase_id) {
    await admin.from('one_time_purchases').update({ status: 'refunded' }).eq('id', req.one_time_purchase_id);
  }

  revalidatePath('/dashboard/refunds');
  redirect('/dashboard/refunds?updated=refunded');
}

export async function denyRefund(formData: FormData): Promise<void> {
  await requireAdminUser();
  const requestId = clean(formData.get('request_id'), 80);
  const notes = clean(formData.get('admin_notes'), 4000);
  if (!requestId) redirect('/dashboard/refunds?error=missing_request');

  const admin = createAdminClient();
  const { error } = await admin
    .from('refund_requests')
    .update({
      status: 'denied',
      processed_at: new Date().toISOString(),
      admin_notes: notes || 'Denied from admin review.',
    })
    .eq('id', requestId);
  if (error) redirect(`/dashboard/refunds?error=${encodeURIComponent('db_' + (error.code ?? 'error'))}`);

  revalidatePath('/dashboard/refunds');
  redirect('/dashboard/refunds?updated=denied');
}
