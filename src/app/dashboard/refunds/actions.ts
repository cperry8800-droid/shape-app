'use server';

// Admin refund processing. A client files a refund request (refunds/actions.ts);
// an admin reviews it here and, on approval, Shape issues the Stripe refund with
// the Connect transfer + application fee unwound — each at the charge's own
// stored rate (15% marketplace / 0% BYO), so the coach's cut is clawed back and
// any platform fee is returned (platform nets zero — no more "refund the client,
// coach keeps their pay, Shape eats the loss" leak).
//
// Admin-guarded via requireAdminUser(). The charge.refunded webhook independently
// flips purchase status (and reconciles a dashboard-issued refund), so this
// action + the webhook are each idempotent.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { stripe } from '@/lib/stripe';

function clean(value: FormDataEntryValue | null, max = 2000): string {
  return String(value ?? '').trim().slice(0, max);
}

type ClaimedRequest = {
  id: string;
  client_id: string;
  subscription_id: string | null;
  one_time_purchase_id: string | null;
  created_at: string;
};

type RefundTarget =
  | { kind: 'one_time'; chargeId: string }
  | { kind: 'subscription'; chargeId: string; subscriptionId: string };

function chargeIdOf(value: unknown): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : (value as { id?: string }).id ?? null;
}

// Invoice.charge is read at runtime — the typed field was dropped in recent
// Stripe API versions (mirrors the webhook's defensive extraction).
function extractInvoiceChargeId(invoice: unknown): string | null {
  if (!invoice || typeof invoice === 'string') return null;
  return chargeIdOf((invoice as { charge?: unknown }).charge ?? null);
}

// Resolve the Stripe charge a refund request points at. For a subscription we
// refund the invoice that was current WHEN THE CLIENT FILED the request — not
// whatever is latest now (a new billing cycle may have posted since). Stripe
// lookups are contained here and surfaced as a typed error, never thrown.
async function resolveTarget(
  admin: ReturnType<typeof createAdminClient>,
  req: ClaimedRequest
): Promise<RefundTarget | { error: string }> {
  try {
    if (req.one_time_purchase_id) {
      const { data } = await admin
        .from('one_time_purchases')
        .select('stripe_payment_intent_id')
        .eq('id', req.one_time_purchase_id)
        .maybeSingle<{ stripe_payment_intent_id: string | null }>();
      if (!data?.stripe_payment_intent_id) return { error: 'purchase_missing_payment_intent' };
      const pi = await stripe.paymentIntents.retrieve(data.stripe_payment_intent_id, {
        expand: ['latest_charge'],
      });
      const chargeId = chargeIdOf((pi as unknown as { latest_charge?: unknown }).latest_charge);
      if (!chargeId) return { error: 'no_charge_on_purchase' };
      return { kind: 'one_time', chargeId };
    }
    if (req.subscription_id) {
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('id', req.subscription_id)
        .maybeSingle<{ stripe_subscription_id: string | null }>();
      if (!data?.stripe_subscription_id) return { error: 'subscription_missing_stripe_id' };
      const requestedAt = Math.floor(new Date(req.created_at).getTime() / 1000);
      const invoices = await stripe.invoices.list({
        subscription: data.stripe_subscription_id,
        limit: 100,
      });
      const chosen = invoices.data
        .filter((inv) => (inv.created ?? 0) <= requestedAt)
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];
      // Fail closed: with no invoice at/before the request time we can't pick a
      // target without risking a newer billing cycle's charge.
      if (!chosen) return { error: 'no_invoice_at_request_time' };
      const chargeId = extractInvoiceChargeId(chosen);
      if (!chargeId) return { error: 'no_charge_on_invoice' };
      return { kind: 'subscription', chargeId, subscriptionId: data.stripe_subscription_id };
    }
    return { error: 'invalid_target' };
  } catch {
    return { error: 'stripe_lookup_failed' };
  }
}

async function releaseClaim(admin: ReturnType<typeof createAdminClient>, requestId: string): Promise<void> {
  await admin
    .from('refund_requests')
    .update({ status: 'pending', processed_at: null })
    .eq('id', requestId)
    .eq('status', 'approved');
}

export async function approveRefund(formData: FormData): Promise<void> {
  await requireAdminUser();
  const requestId = clean(formData.get('request_id'), 80);
  const notes = clean(formData.get('admin_notes'), 4000);
  if (!requestId) redirect('/dashboard/refunds?error=missing_request');

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Atomically claim the request: only a still-`pending` row can be moved, so
  // double-submits and stale denied/approved rows can never move money twice.
  const { data: claimed, error: claimErr } = await admin
    .from('refund_requests')
    .update({ status: 'approved', processed_at: now, admin_notes: notes || null })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id, client_id, subscription_id, one_time_purchase_id, created_at')
    .maybeSingle<ClaimedRequest>();
  if (claimErr) redirect(`/dashboard/refunds?error=${encodeURIComponent('db_' + (claimErr.code ?? 'error'))}`);
  if (!claimed) redirect('/dashboard/refunds?updated=already_processed');

  const target = await resolveTarget(admin, claimed);
  if ('error' in target) {
    await releaseClaim(admin, requestId);
    redirect(`/dashboard/refunds?error=${encodeURIComponent(target.error)}`);
  }

  try {
    // Unwind the Connect transfer + application fee only when the charge has them
    // (a coach sale). A platform-only charge refunds plainly. Deterministic
    // idempotency key: a retried submit returns the same refund, never a second.
    const charge = await stripe.charges.retrieve(target.chargeId);
    const hasTransfer = Boolean((charge as unknown as { transfer?: unknown }).transfer);
    const hasFee = Boolean((charge as unknown as { application_fee?: unknown }).application_fee);
    await stripe.refunds.create(
      {
        charge: target.chargeId,
        ...(hasTransfer ? { reverse_transfer: true } : {}),
        ...(hasTransfer && hasFee ? { refund_application_fee: true } : {}),
      },
      { idempotencyKey: `refund-req-${requestId}` }
    );
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
    await releaseClaim(admin, requestId);
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/dashboard/refunds?error=${encodeURIComponent(('stripe: ' + msg).slice(0, 300))}`);
  }

  // The Stripe refund already succeeded; the row must reflect it. If this write
  // fails the request stays `approved` and the webhook (pending-only) won't fix
  // it, so surface the mismatch instead of reporting a clean success.
  const { error: finalErr } = await admin
    .from('refund_requests')
    .update({ status: 'refunded', processed_at: new Date().toISOString() })
    .eq('id', requestId);
  if (claimed.one_time_purchase_id) {
    await admin.from('one_time_purchases').update({ status: 'refunded' }).eq('id', claimed.one_time_purchase_id);
  }

  revalidatePath('/dashboard/refunds');
  if (finalErr) redirect('/dashboard/refunds?error=refunded_but_status_update_failed');
  redirect('/dashboard/refunds?updated=refunded');
}

export async function denyRefund(formData: FormData): Promise<void> {
  await requireAdminUser();
  const requestId = clean(formData.get('request_id'), 80);
  const notes = clean(formData.get('admin_notes'), 4000);
  if (!requestId) redirect('/dashboard/refunds?error=missing_request');

  const admin = createAdminClient();
  // Only a pending request can be denied; a zero-row update means it was already
  // processed or the id is bogus.
  const { data: denied, error } = await admin
    .from('refund_requests')
    .update({
      status: 'denied',
      processed_at: new Date().toISOString(),
      admin_notes: notes || 'Denied from admin review.',
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle<{ id: string }>();
  if (error) redirect(`/dashboard/refunds?error=${encodeURIComponent('db_' + (error.code ?? 'error'))}`);
  if (!denied) redirect('/dashboard/refunds?updated=already_processed');

  revalidatePath('/dashboard/refunds');
  redirect('/dashboard/refunds?updated=denied');
}
