// Stripe webhook — records subscriptions on checkout.session.completed and
// keeps their status in sync on customer.subscription.updated/deleted.
//
// Requires STRIPE_WEBHOOK_SECRET in the environment. Uses the raw request
// body for signature verification (NEVER parse as JSON first).
//
// TWO DESTINATIONS, ONE URL (coach direct charges, 2026-10-18). Shape's own account sends its
// events signed with STRIPE_WEBHOOK_SECRET. The coaches' connected accounts send theirs through a
// second destination ("Connected accounts" in Stripe), signed with STRIPE_CONNECT_WEBHOOK_SECRET;
// those carry `event.account`. A Connect event:
//   · reads every Stripe object on the account it came from (acctOpts);
//   · passes the ORIGIN GUARD before it writes a row a coach's metadata names (stripe-connect.ts);
//   · finds rows only among those stamped with its own account, and stamps the rows it writes;
//   · never touches the $5 membership (platform_subscriptions), which only Shape's account sells.
// A platform event runs exactly as it did before.

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { acctOpts, checkConnectOrigin, madeByShape } from '@/lib/stripe-connect';
import { createAdminClient } from '@/lib/supabase/admin';
import { coachCutCents, bpsToRate, parseFeeBpsMeta } from '@/lib/platform-fee';
import { attributionPair, MARKETPLACE_FEE_BPS } from '@/lib/coach-origin.mjs';
import { isRetryableDbError } from '@/lib/db-retryable';
import { coachPaid, startCoaching, welcomeMember } from '@/lib/coach-thread';
import { cancelRefundedSession } from '@/lib/refund-session';
import { announcePayment } from '@/lib/payment-notices';

export const runtime = 'nodejs';

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

// Shape's fee and the coach's share of a subscription payment at the rate stamped on its row
// (Stripe takes application_fee_percent = fee_bps / 100). null when the rate is not a valid one:
// a notice then leaves the split out rather than guess it.
function splitAtBps(cents: number, bps: unknown): { shape: number; coach: number } | null {
  try {
    const coach = coachCutCents(cents, bpsToRate(bps as number));
    return { shape: cents - coach, coach };
  } catch {
    return null;
  }
}

// BYO commission split — persist the origin verdict resolved at checkout onto the
// money row. Missing/invalid metadata falls back to marketplace / 1500 — fail
// toward Shape's fee, never toward a free ride.
const VALID_ORIGINS = new Set(['marketplace', 'coach_invite', 'coach_link']);
function originFromMeta(v: string | undefined): string {
  return v && VALID_ORIGINS.has(v) ? v : 'marketplace';
}
// STRICT digit-string parse (shared pure impl) — Number('') is 0 in JS, so a
// naive numeric guard would read empty/absent metadata as a 0% commission.
// Absent/empty/malformed → 1500: fail toward Shape's fee.
const feeBpsFromMeta = (v: string | undefined): number => parseFeeBpsMeta(v);
// The pair is validated as ONE unit (attributionPair): a defaulted origin next
// to fee_bps "0" must not persist marketplace/0 (free ride), and a coach_*
// origin next to malformed fee metadata must not persist BYO/1500. Incoherent
// pairs downgrade WHOLE to marketplace/1500 before touching the write-once row.
function attributionFromMeta(meta: { origin?: string; fee_bps?: string } | null | undefined): { origin: string; feeBps: number } {
  return attributionPair(originFromMeta(meta?.origin), feeBpsFromMeta(meta?.fee_bps));
}

// The origin/fee_bps columns land with the OWNER migration; a deploy that beats
// it must still record the purchase. Postgres 42703 / PostgREST PGRST204 both mean
// "column does not exist" — the signal to retry the write without them.
function isUndefinedColumn(err: { code?: string } | null): boolean {
  return err?.code === '42703' || err?.code === 'PGRST204';
}

// PostgREST could not match the function by name and arguments: the 5-argument
// consume_store_credit (2026-10-09) is not there yet, so the 4-argument live one is.
function isUndefinedFunction(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
}

/**
 * Debit the credit a completed checkout was discounted by. Converts the reservation the
 * checkout made (metadata.store_credit_ref) when the database has the 2026-10-09 function;
 * on a database that still has the 4-argument one, falls back to it, so a deploy that lands
 * before the migration debits the way the live function always did.
 */
async function consumeStoreCredit(
  admin: ReturnType<typeof createAdminClient>,
  args: { userId: string; kind: 'session' | 'nutrition'; sessionId: string; cents: number; reservationRef: string | null }
): Promise<{ taken: number; error: string | null }> {
  const base = { p_user_id: args.userId, p_kind: args.kind, p_session_id: args.sessionId, p_amount_cents: args.cents };
  let { data, error } = await admin.rpc('consume_store_credit', { ...base, p_reservation_ref: args.reservationRef });
  if (error && isUndefinedFunction(error)) ({ data, error } = await admin.rpc('consume_store_credit', base));
  if (error) return { taken: 0, error: error.message };
  return { taken: Math.max(0, Math.floor(Number(data ?? 0)) || 0), error: null };
}

// Gate on that retry: dropping the columns is safe ONLY when the intended values
// are exactly the columns' DB defaults (marketplace / 1500) — the inserted
// defaults then equal the intent. Any other combination can only have been
// stamped POST-migration (pre-migration the checkout resolver RPC is absent, so
// every session carries marketplace/1500), which makes a missing-column error
// here PostgREST schema-cache lag, not a pre-migration deploy — and retrying
// without the columns would insert the defaults and the freeze trigger would
// lock the WRONG attribution on a BYO money row forever. Those deliveries must
// FAIL (non-2xx) so Stripe redelivers once the cache has refreshed.
function canDropOriginColumns(origin: string, feeBps: number): boolean {
  return origin === 'marketplace' && feeBps === MARKETPLACE_FEE_BPS;
}

// Mark a client-bound referral consumed — service-role, conditional on
// consumed_at IS NULL so a webhook retry is a no-op and a failed row-write never
// burns the referral. Best-effort: never throws (a missing table pre-migration or
// a stale id just logs). Only ever passed a referral_id when origin is BYO.
async function consumeReferral(
  admin: ReturnType<typeof createAdminClient>,
  referralId: string | undefined | null,
  kind: 'subscription' | 'purchase'
): Promise<void> {
  if (!referralId) return;
  const { error } = await admin
    .from('coach_referrals')
    .update({ consumed_at: new Date().toISOString(), consumed_kind: kind })
    .eq('id', referralId)
    .is('consumed_at', null);
  if (error && error.code !== '42P01') {
    console.warn('[shape-app] coach referral consume failed:', error.message);
  }
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

// A Stripe reference, as an id or an expanded object.
function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  return v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : null;
}

// Safety-net for refunds issued directly in the Stripe dashboard: a refund on a
// Connect destination charge only makes the platform whole if reverse_transfer +
// refund_application_fee were set. When they weren't, Shape eats the coach's 85%.
// This reconciles a refunded destination charge to the "both flags" outcome by
// topping up the transfer reversal + application-fee refund to the amount
// proportional to what was refunded. Idempotent (a refund already issued with the
// flags leaves nothing to top up); platform ($5) charges have no transfer/fee and
// are skipped. Best-effort — never throws.
//
// A DIRECT CHARGE (a Connect event, `acct`) has no Shape transfer: the money is the coach's from
// the start. A refund the coach issues from their own Stripe dashboard returns Shape's application
// fee in the same proportion (owner, 2026-10-18: "Yes, give it back"), so only the fee half runs,
// and only for the fee Shape took on THIS account's charge. ⚠ The transfer half never runs on a
// Connect event: a `transfer` on a coach's own charge would be the coach's own transfer.
async function reconcileConnectRefund(charge: Stripe.Charge, acct: string | null): Promise<void> {
  const chargeAmount = charge.amount ?? 0;
  const refundedAmount = charge.amount_refunded ?? 0;
  if (chargeAmount <= 0 || refundedAmount <= 0) return;

  const ref = charge as unknown as {
    transfer?: string | { id?: string } | null;
    application_fee?: string | { id?: string } | null;
  };
  const transferId = typeof ref.transfer === 'string' ? ref.transfer : ref.transfer?.id ?? null;
  const feeId = typeof ref.application_fee === 'string' ? ref.application_fee : ref.application_fee?.id ?? null;

  // Reverse the coach transfer, proportional to the refunded amount (a destination charge only).
  if (transferId && !acct) {
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
      // Application fees live on Shape's own account, so this read takes no account option.
      const fee = await stripe.applicationFees.retrieve(feeId);
      if (acct && (idOf(fee.account) !== acct || idOf(fee.charge) !== charge.id)) {
        console.warn('[shape-app] application fee refund skipped: the fee is not this account\'s charge', {
          charge: charge.id, account: acct, fee: feeId,
        });
        return;
      }
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

/**
 * The event, verified with Shape's own destination secret and then, failing that, with the
 * Connect destination's. Which one signed it is returned: an event only the Connect secret
 * verifies came through the Connect destination.
 */
function verifyEvent(
  rawBody: string,
  signature: string,
  platformSecret: string,
  connectSecret: string | undefined
): { event: Stripe.Event; viaConnect: boolean } | { error: unknown } {
  try {
    return { event: stripe.webhooks.constructEvent(rawBody, signature, platformSecret), viaConnect: false };
  } catch (err) {
    if (connectSecret) {
      try {
        return { event: stripe.webhooks.constructEvent(rawBody, signature, connectSecret), viaConnect: true };
      } catch {
        // Neither secret signed it: the platform's error is the one reported.
      }
    }
    return { error: err };
  }
}

/**
 * The origin guard (src/lib/stripe-connect.ts) for a Connect event that would write rows its
 * metadata names. null lets it through; otherwise the answer to send: 200 with nothing written
 * (Stripe must not retry a refusal), or 503 when the coach row could not be read for a reason
 * that passes (Stripe retries, and the next delivery is judged again).
 */
async function connectOriginRefusal(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
  acct: string,
  meta: Record<string, string> | null | undefined,
  application: unknown,
  checkApplication = true
): Promise<NextResponse | null> {
  const verdict = await checkConnectOrigin(admin, {
    account: acct,
    providerRole: meta?.provider_role,
    providerId: meta?.provider_id,
    application,
    checkApplication,
  });
  if (verdict.ok) return null;
  if (verdict.reason === 'read_failed' && isRetryableDbError(verdict.error)) {
    return NextResponse.json({ received: false, retry: true, error: 'coach account not read' }, { status: 503 });
  }
  console.error('[stripe webhook] Connect event refused by the origin guard — nothing written', {
    event: event.id, type: event.type, account: acct, reason: verdict.reason,
    provider_role: meta?.provider_role ?? null, provider_id: meta?.provider_id ?? null,
  });
  return NextResponse.json({ received: true, ignored: verdict.reason });
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
  return !error;
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || undefined;

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

  const verified = verifyEvent(rawBody, signature, secret, connectSecret);
  if ('error' in verified) {
    console.error('[shape-app] stripe webhook signature failed:', verified.error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  const { event, viaConnect } = verified;

  // The connected account a Connect event happened on; null for Shape's own account.
  const acct = typeof event.account === 'string' && event.account ? event.account : null;
  // ⚠ The Connect destination sends only connected-account events. One of its events without an
  // account would otherwise run as a platform event, the membership included.
  if (viaConnect && !acct) {
    console.error('[stripe webhook] a Connect-signed event names no account — ignored', { event: event.id, type: event.type });
    return NextResponse.json({ received: true, ignored: 'no_account' });
  }
  // A Connect event finds rows only among those on its own account.
  const onAccount = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (acct ? q.eq('stripe_account_id', acct) : q);

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      // L13: a delayed payment method (a bank debit) completes the session before the money
      // moves; Stripe then sends async_payment_succeeded with the same session, and that is
      // when the purchase is recorded. Both carry a Checkout.Session and run the same code.
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const clientId = session.metadata?.client_id;
        const providerId = session.metadata?.provider_id;
        const providerRole = session.metadata?.provider_role;
        const priceCents = Number(session.metadata?.price_cents ?? 0);

        if (!clientId) {
          console.warn('[shape-app] checkout.session.completed missing client_id', session.id);
          break;
        }
        // The membership is sold on Shape's own account only: a connected account's checkout
        // never starts or renews one.
        if (acct && session.metadata?.plan === 'shape_platform') {
          console.error('[stripe webhook] a connected account\'s checkout claims to be the membership — ignored', { session: session.id, account: acct });
          break;
        }

        if (session.mode === 'payment') {
          // One-time purchase (booking or meal plan).
          const kind = session.metadata?.kind;
          if (!providerId || !providerRole || !kind) {
            console.warn('[shape-app] one-time checkout missing metadata', session.id);
            break;
          }
          // L13: `paid` is the only status under which the money has moved. A session that
          // completed `unpaid` is recorded when its payment succeeds (the case label above);
          // one that never does is released by async_payment_failed or expired.
          if (session.payment_status !== 'paid') {
            console.warn('[shape-app] one-time checkout completed without payment; waiting for the payment event', {
              session: session.id, payment_status: session.payment_status,
            });
            break;
          }
          const pi =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          let applicationFeeCents: number | null = null;
          let paymentApplication: unknown = null;
          if (pi) {
            const intent = await stripe.paymentIntents.retrieve(pi, undefined, acctOpts(acct));
            // A retrieved intent with no application_fee_amount means the fee
            // was deliberately OMITTED (BYO 0%, or store credit consumed the
            // whole fee) — that's a real $0, not unknown. Coerce so the admin
            // refunds page shows $0 instead of treating the fee as unresolvable.
            applicationFeeCents = intent.application_fee_amount ?? 0;
            paymentApplication = intent.application;
          }
          // The origin guard, before anything below writes. A Checkout Session carries no
          // `application`; its payment does (no payment intent, nothing to check: refused while
          // STRIPE_CONNECT_APPLICATION_ID is set).
          if (acct) {
            const refused = await connectOriginRefusal(admin, event, acct, session.metadata, paymentApplication);
            if (refused) return refused;
          }
          const purchasedPlanId = session.metadata?.plan_id || null;
          // Snapshot the sold plan onto the purchase. plan_id is ON DELETE SET
          // NULL, so without this a coach deleting a plan makes the buyer's
          // purchase disappear from their Library — money taken, nothing owned.
          // Best-effort by design: a failed read records the purchase anyway
          // (losing the money is worse than losing the snapshot), and it is only
          // ever read as a FALLBACK — the live row still wins where it exists.
          let planSnapshot: Record<string, unknown> | null = null;
          let planIdForRow = purchasedPlanId;
          if (purchasedPlanId) {
            const { data: planRow, error: planErr } = await admin
              .from('coach_plans')
              .select('id, kind, name, meta, detail')
              .eq('id', purchasedPlanId)
              .maybeSingle();
            if (planErr) {
              console.error('[stripe webhook] coach_plans snapshot read failed — purchase records without one', {
                session: session.id, plan: purchasedPlanId, error: planErr.message,
              });
            } else if (planRow) {
              planSnapshot = { ...planRow, snapshot_at: new Date().toISOString(), snapshot_source: 'checkout' };
            } else {
              // The coach DELETED the plan between Checkout Session creation and
              // this webhook. Sending the stale UUID makes the FK reject the
              // insert; purchaseErr is only logged and the handler acks 200, so
              // Stripe never retries — a paid buyer would end up with NO purchase
              // row at all. That is worse than the Library gap this PR exists to
              // close, and it predates this change. Record the payment with a
              // null plan_id, and keep the id in the marker so support can trace
              // what was bought. The marker carries no `name`, which is what
              // keeps it OUT of the Library (see the migration's filter) rather
              // than rendering an entry the client cannot open.
              planIdForRow = null;
              // A REPLAY can also land here: the first delivery stored a FULL
              // snapshot, the coach then deleted the plan, and Stripe redelivered
              // the same event. Blindly writing the marker would overwrite that
              // snapshot on the conflict-update, and the Library — which gates on
              // a name — would then drop a row the buyer already had. That would
              // destroy exactly what this PR exists to preserve, on a delivery
              // that changes nothing. So reuse a stored snapshot when one exists.
              // select('*') because plan_snapshot may not exist pre-migration.
              const { data: priorRow, error: priorErr } = await admin
                .from('one_time_purchases')
                .select('*')
                .eq('stripe_checkout_session_id', session.id)
                .maybeSingle();
              const priorSnap = (priorRow as { plan_snapshot?: Record<string, unknown> | null } | null)?.plan_snapshot ?? null;
              const priorIsFull = !!priorSnap && typeof priorSnap === 'object' && typeof priorSnap.name === 'string' && priorSnap.name !== '';
              if (priorErr) {
                // Could not READ the prior row, so we cannot know whether a full
                // snapshot is already stored. Writing the marker here would risk
                // destroying one. Send NO plan_snapshot at all: the upsert then
                // omits the column and leaves any stored value untouched.
                planSnapshot = null;
              } else {
                planSnapshot = priorIsFull
                  ? (priorSnap as Record<string, unknown>)
                  : {
                      id: purchasedPlanId,
                      snapshot_at: new Date().toISOString(),
                      snapshot_source: 'plan_deleted_before_payment',
                    };
              }
              console.error('[stripe webhook] purchased plan was deleted before payment completed — recording the purchase without plan_id', {
                session: session.id, plan: purchasedPlanId, client: clientId,
                keptPriorSnapshot: priorIsFull, priorReadFailed: !!priorErr,
              });
            }
          }
          const purchaseRow = {
            client_id: clientId,
            provider_id: Number(providerId),
            provider_role: providerRole,
            kind,
            price_cents: priceCents,
            application_fee_cents: applicationFeeCents,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: pi,
            plan_id: planIdForRow,
            status: 'paid',
            // The account the payment lives on (frozen by the database once written). Carried by
            // every retry below, so no fallback can record a direct charge as a platform one.
            ...(acct ? { stripe_account_id: acct } : {}),
          };
          // Write the row FIRST and check the error; origin/fee_bps are write-once
          // (a DB trigger preserves them on any replay/late delivery). Only on a
          // confirmed write do we consume the referral — so a failed row-write
          // never burns the referral without recording the purchase.
          const { origin: purchaseOrigin, feeBps: purchaseFeeBps } = attributionFromMeta(session.metadata);
          const withOrigin = { ...purchaseRow, origin: purchaseOrigin, fee_bps: purchaseFeeBps };
          const withSnapshot: Record<string, unknown> = { ...withOrigin };
          if (planSnapshot) withSnapshot.plan_snapshot = planSnapshot;
          let { error: purchaseErr } = await admin
            .from('one_time_purchases')
            .upsert(withSnapshot, { onConflict: 'stripe_checkout_session_id' });
          // ⚠ BEFORE 2026-10-15-paid-sessions.sql THE TABLE REFUSES KIND 'program' (23514, its kind
          // check). The sale is recorded as it was before that migration, a booking, rather than
          // lost: the row is the buyer's entitlement. The alerts below still say what was sold.
          if (purchaseErr?.code === '23514' && kind === 'program') {
            console.error('[stripe webhook] one_time_purchases refused kind program — recorded as booking; run 2026-10-15-paid-sessions.sql', { session: session.id });
            purchaseRow.kind = 'booking';
            withOrigin.kind = 'booking';
            withSnapshot.kind = 'booking';
            ({ error: purchaseErr } = await admin
              .from('one_time_purchases')
              .upsert(withSnapshot, { onConflict: 'stripe_checkout_session_id' }));
          }
          // Pre-migration (or during PostgREST schema-cache lag) the plan_snapshot
          // column doesn't exist yet. Drop ONLY that column and retry — falling
          // straight through to the origin-drop path below would let a missing
          // snapshot column 503 a BYO purchase, trading a cosmetic gap for a
          // blocked payment.
          //
          // Deliberately NOT retryable, unlike the BYO origin case below. A 503
          // here is only correct if the column is momentarily invisible; if the
          // migration simply hasn't been applied, Stripe retries for ~3 days and
          // then gives up, and the purchase is never recorded at all. Losing the
          // snapshot costs the buyer only if the coach later deletes the plan,
          // and re-running the (idempotent) migration backfills every row whose
          // plan still exists. Losing the purchase costs them the money. So we
          // record the payment and shout about the gap.
          if (planSnapshot && isUndefinedColumn(purchaseErr)) {
            console.error('[stripe webhook] plan_snapshot column unavailable — purchase recorded WITHOUT a snapshot; re-run 2026-07-26-purchase-plan-snapshot.sql to backfill', {
              session: session.id, plan: purchasedPlanId, client: clientId,
            });
            ({ error: purchaseErr } = await admin
              .from('one_time_purchases')
              .upsert(withOrigin, { onConflict: 'stripe_checkout_session_id' }));
          }
          // The plan can also be deleted BETWEEN the snapshot read above and this
          // write, so the FK rejects a plan_id that was valid moments ago. The
          // outcome is identical to the known-deleted case — error logged, 200
          // acked, Stripe never retries, paid buyer with no purchase row — so the
          // same recovery applies: retry once with plan_id NULL, keeping the FULL
          // snapshot already captured, which is strictly better than the marker
          // (the buyer keeps their content because we read the plan before it
          // vanished). 23503 = foreign_key_violation.
          if (purchaseErr?.code === '23503' && planIdForRow) {
            console.error('[stripe webhook] purchased plan deleted between snapshot read and write — retrying with plan_id null', {
              session: session.id, plan: planIdForRow, client: clientId,
            });
            planIdForRow = null;
            const fkRetry: Record<string, unknown> = { ...withOrigin, plan_id: null };
            if (planSnapshot) fkRetry.plan_snapshot = planSnapshot;
            ({ error: purchaseErr } = await admin
              .from('one_time_purchases')
              .upsert(fkRetry, { onConflict: 'stripe_checkout_session_id' }));
            if (isUndefinedColumn(purchaseErr)) {
              ({ error: purchaseErr } = await admin
                .from('one_time_purchases')
                .upsert({ ...withOrigin, plan_id: null }, { onConflict: 'stripe_checkout_session_id' }));
            }
          }
          if (isUndefinedColumn(purchaseErr)) {
            // A direct charge is never recorded without its account either: before the migration
            // the purchase waits (Stripe retries for three days) rather than pass as a platform one.
            if (!canDropOriginColumns(purchaseOrigin, purchaseFeeBps) || acct) {
              // Schema-cache lag on a BYO purchase — defaulting would freeze the
              // row as marketplace/1500. Fail so Stripe redelivers (nothing has
              // been written yet, so the retry replays cleanly).
              console.error('[stripe webhook] one_time_purchases origin columns unavailable (schema-cache lag) — failing for redelivery', {
                session: session.id, origin: purchaseOrigin, feeBps: purchaseFeeBps, account: acct,
              });
              return NextResponse.json({ error: 'origin_columns_unavailable' }, { status: 503 });
            }
            ({ error: purchaseErr } = await admin
              .from('one_time_purchases')
              .upsert(purchaseRow, { onConflict: 'stripe_checkout_session_id' }));
          }
          if (purchaseErr) {
            console.error('[stripe webhook] one_time_purchases upsert failed', { session: session.id, error: purchaseErr.message, code: purchaseErr.code });
            // M10 (2026-10-08 review): entitlements are read from this row. A failure that is
            // about the connection, the server or a lock is answered 503 so Stripe retries the
            // event (for up to three days); one that will read the same way tomorrow is
            // acknowledged and logged, as before, so one bad event cannot fail the endpoint.
            if (isRetryableDbError(purchaseErr)) {
              return NextResponse.json({ received: false, retry: true, error: 'purchase record not written' }, { status: 503 });
            }
          } else {
            await consumeReferral(admin, session.metadata?.referral_id, 'purchase');
          }
          // Commit any Shape-credit applied at checkout (debits the wallet once,
          // idempotent by session id). Reserved at session-create, spent here —
          // and ONLY on a confirmed purchase write: this handler acks failures
          // with 200 (no Stripe retry), so debiting after a failed upsert would
          // burn the member's credit with no durable purchase record.
          const creditCents = Number(session.metadata?.store_credit_cents ?? 0);
          const creditKind = session.metadata?.store_credit_kind;
          // H5 (2026-10-08 review): the checkout RESERVED this credit when it created the
          // session (metadata.store_credit_ref); consuming converts the reservation into the
          // checkout debit, so the wallet does not move here. A session created before the
          // reservation migration carries no ref and takes what the wallet has, as before;
          // either way the debit is compared with the discount and a shortfall is said.
          if (!purchaseErr && creditCents > 0 && (creditKind === 'session' || creditKind === 'nutrition')) {
            const consumed = await consumeStoreCredit(admin, {
              userId: clientId, kind: creditKind, sessionId: session.id, cents: creditCents,
              reservationRef: session.metadata?.store_credit_ref || null,
            });
            if (consumed.error) console.warn('[shape-app] store credit consume failed:', consumed.error);
            else if (consumed.taken < creditCents) {
              console.error('[stripe webhook] store credit shortfall: the member was discounted more than the wallet gave up', {
                session: session.id, discounted: creditCents, debited: consumed.taken, reservationRef: session.metadata?.store_credit_ref || null,
              });
            }
          }
          // The coach is paid (1 − resolved rate) of the GROSS price — 85% on a
          // marketplace sale, 100% on a BYO sale (0% commission). Read the resolved
          // rate from the stamped fee_bps so the notified figure is what they got.
          const grossCents = Number(session.metadata?.gross_price_cents ?? priceCents);
          const payoutRate = bpsToRate(purchaseFeeBps);
          // ⚠ THE COACH IS TOLD WHO PAID, AND ONLY ONCE THE PURCHASE IS SAVED (fix 3c: M10). This read
          // "$X from a client for a booking", named nobody, left a paid session with nothing to
          // book, and was sent whether or not the row above was written. coachPaid keys each send on
          // the checkout, so a redelivered event sends nothing twice.
          if (!purchaseErr) {
            await coachPaid(admin, {
              clientId,
              providerRole: providerRole === 'nutritionist' ? 'nutritionist' : 'trainer',
              providerId: Number(providerId),
              kind: kind === 'program' || kind === 'meal_plan' ? kind : 'booking',
              checkoutId: session.id,
              coachCents: coachCutCents(grossCents, payoutRate),
              // The name read from coach_plans above, never the checkout's caller-supplied item_name
              // (Fable on #2373): a buyer could put any sentence into the coach's notice.
              itemName: planSnapshot && typeof planSnapshot.name === 'string' && planSnapshot.name.trim() ? planSnapshot.name.trim() : null,
            });
            // The member's receipt and the owners' notice (payment-notices.ts), for what Stripe
            // charged and the fee its payment carries.
            await announcePayment(admin, {
              key: session.id,
              clientId,
              amountCents: session.amount_total ?? priceCents,
              paidFor: kind === 'program' || kind === 'meal_plan' ? kind : 'booking',
              renewal: false,
              provider: { role: providerRole === 'nutritionist' ? 'nutritionist' : 'trainer', id: Number(providerId) },
              shapeFeeCents: applicationFeeCents,
              itemName: planSnapshot && typeof planSnapshot.name === 'string' && planSnapshot.name.trim() ? planSnapshot.name.trim() : null,
            });
          }
          // First-dibs: a completed purchase against an invited waitlist slot
          // is the client taking their spot — flip it to booked. Supabase
          // reports failures via `error` (not a throw), so check it — a failed
          // flip would leave a stale invite/waiting row out of sync.
          if (providerId && providerRole && clientId) {
            const { error: wlErr } = await admin.from('coach_waitlist')
              .update({ status: 'booked', responded_at: new Date().toISOString() })
              .eq('client_id', clientId).eq('provider_role', providerRole).eq('provider_id', Number(providerId))
              .in('status', ['waiting', 'invited']);
            if (wlErr) {
              console.error('[stripe webhook] waitlist booked-flip (payment) failed', { clientId, providerId, providerRole, error: wlErr.message });
            }
          }
          break;
        }

        // Subscription mode — platform or trainer/nutritionist.
        if (!providerId && session.metadata?.plan !== 'shape_platform') {
          console.warn('[shape-app] sub checkout missing metadata', session.id);
          break;
        }

        // Fix 3a (Codex on #2360): the welcome, the thread and the alerts say the subscription has
        // started, so they wait for the money. A delayed payment method (a bank debit) completes
        // the session `unpaid`; this branch runs again on async_payment_succeeded with `paid`,
        // and that is when they go. A trial needs no payment and starts now.
        const moneyMoved = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

        let currentPeriodEnd: string | null = null;
        // ⚠ A REDELIVERED COMPLETION COULD BRING A CANCELLED SUBSCRIPTION BACK (client-onboarding review,
        // L9). This wrote 'active' whatever had happened since: Stripe retries an event for days, so a
        // completion delivered again after customer.subscription.deleted (or arriving after it) put a
        // cancelled membership or coaching subscription back to active. Stripe's own subscription,
        // read here already, decides: one it says has ended is recorded as ended, and starts nothing.
        let subEnded = false;
        let subApplication: unknown = null;
        if (typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription, undefined, acctOpts(acct));
          currentPeriodEnd = isoOrNull(sub.items.data[0]?.current_period_end);
          subEnded = sub.status === 'canceled' || sub.status === 'incomplete_expired';
          subApplication = sub.application;
        }
        // The origin guard, before anything below writes (the subscription carries `application`).
        if (acct) {
          const refused = await connectOriginRefusal(admin, event, acct, session.metadata, subApplication);
          if (refused) return refused;
        }

        if (session.metadata?.plan === 'shape_platform') {
          const membershipSaved = await upsertPlatformSubscription(admin, {
            client_id: clientId,
            stripe_customer_id:
              typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
            stripe_subscription_id:
              typeof session.subscription === 'string'
                ? session.subscription
                : session.subscription?.id ?? null,
            status: subEnded ? 'canceled' : 'active',
            price_cents: priceCents || null,
            current_period_end: currentPeriodEnd,
          });
          // Fix 3a: a welcome from Shape when the membership starts, once per member; and, for what
          // was charged, the member's receipt and the owners' notice (payment-notices.ts).
          if (membershipSaved && moneyMoved && !subEnded) {
            await welcomeMember(admin, clientId);
            await announcePayment(admin, {
              key: session.id,
              clientId,
              amountCents: session.amount_total ?? priceCents,
              paidFor: 'membership',
              renewal: false,
            });
          }
          break;
        }

        const subRow = {
          client_id: clientId,
          provider_id: providerId ? Number(providerId) : null,
          provider_role: providerRole ?? null,
          stripe_customer_id:
            typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
          stripe_subscription_id:
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id ?? null,
          status: subEnded ? 'canceled' : 'active',
          price_cents: priceCents || null,
          current_period_end: currentPeriodEnd,
          // The account the subscription lives on (frozen once written), carried by the retry too.
          ...(acct ? { stripe_account_id: acct } : {}),
        };
        // Write the row FIRST and check the error; origin/fee_bps are write-once
        // (a DB trigger preserves them on any replay). Consume the referral only on
        // a confirmed write — so a failed write never burns it without recording.
        const { origin: subOrigin, feeBps: subFeeBps } = attributionFromMeta(session.metadata);
        let { error: subErr } = await admin
          .from('subscriptions')
          .upsert(
            { ...subRow, origin: subOrigin, fee_bps: subFeeBps },
            { onConflict: 'stripe_subscription_id' }
          );
        if (isUndefinedColumn(subErr)) {
          // A direct-charge subscription is never recorded without its account (as the purchase).
          if (!canDropOriginColumns(subOrigin, subFeeBps) || acct) {
            // Schema-cache lag on a BYO subscription — defaulting would freeze
            // the row as marketplace/1500 (15% forever on a 0% sale). Fail so
            // Stripe redelivers; nothing side-effectful has run before this
            // write, so the retry replays cleanly.
            console.error('[stripe webhook] subscriptions origin columns unavailable (schema-cache lag) — failing for redelivery', {
              session: session.id, origin: subOrigin, feeBps: subFeeBps, account: acct,
            });
            return NextResponse.json({ error: 'origin_columns_unavailable' }, { status: 503 });
          }
          ({ error: subErr } = await admin
            .from('subscriptions')
            .upsert(subRow, { onConflict: 'stripe_subscription_id' }));
        }
        if (subErr) {
          console.error('[stripe webhook] subscriptions upsert failed', { session: session.id, error: subErr.message, code: subErr.code });
          // M10: the same split as the purchase row above; the subscription row is what the
          // membership gate reads.
          if (isRetryableDbError(subErr)) {
            return NextResponse.json({ received: false, retry: true, error: 'subscription record not written' }, { status: 503 });
          }
        } else {
          await consumeReferral(admin, session.metadata?.referral_id, 'subscription');
        }
        // Fix 3a (client-onboarding review, H7 / M9): only once the subscription is SAVED, open
        // the coach thread with Shape's welcome, alert and email the coach with the client's name
        // and links, and email the member. It used to send a nameless "New subscriber" bell even
        // when the save above had failed. Each part sends once (src/lib/coach-thread.ts).
        if (!subErr && moneyMoved && !subEnded && providerId && (providerRole === 'trainer' || providerRole === 'nutritionist')) {
          await startCoaching(admin, {
            clientId,
            providerRole,
            providerId: Number(providerId),
            subscriptionKey: subRow.stripe_subscription_id || session.id,
            monthlyCents: priceCents ? coachCutCents(priceCents, bpsToRate(subFeeBps)) : null,
          });
          // The member's receipt and the owners' notice for the first month (payment-notices.ts).
          // Later months are invoice.paid's.
          const firstMonthCents = session.amount_total ?? priceCents;
          await announcePayment(admin, {
            key: session.id,
            clientId,
            amountCents: firstMonthCents,
            paidFor: 'coaching',
            renewal: false,
            provider: { role: providerRole, id: Number(providerId) },
            shapeFeeCents: splitAtBps(firstMonthCents, subFeeBps)?.shape ?? null,
          });
        }
        // First-dibs: a completed subscription against an invited waitlist
        // slot is the client taking their spot — flip it to booked. Check the
        // returned error (Supabase doesn't throw) so a failed flip is surfaced.
        if (providerId && providerRole && clientId) {
          const { error: wlErr } = await admin.from('coach_waitlist')
            .update({ status: 'booked', responded_at: new Date().toISOString() })
            .eq('client_id', clientId).eq('provider_role', providerRole).eq('provider_id', Number(providerId))
            .in('status', ['waiting', 'invited']);
          if (wlErr) {
            console.error('[stripe webhook] waitlist booked-flip (subscription) failed', { clientId, providerId, providerRole, error: wlErr.message });
          }
        }
        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        // H5: the member closed the tab (or never paid) and the 24-hour session died. The credit
        // the checkout reserved goes back to the wallet; a session with no reservation (no
        // credit applied, or created before the reservation migration) has nothing to release.
        // ⚠ Stripe sends this event only when the endpoint subscribes to it (Developers →
        // Webhooks → the endpoint → events); until it does, reserve_store_credit's own 48-hour
        // sweep is what returns the credit.
        const session = event.data.object as Stripe.Checkout.Session;
        const ref = session.metadata?.store_credit_ref;
        // ⚠ A CONNECTED ACCOUNT'S CHECKOUT NEVER RELEASES CREDIT HERE (Codex on #2401). An expired
        // checkout carries no payment, so nothing proves Shape made it: a coach could make one on
        // their own account naming a live Shape checkout's store_credit_ref, and the release would
        // free credit that checkout still holds, to be spent twice. reserve_store_credit's 48-hour
        // sweep returns the credit instead. Part B, which first puts credit on a coach's account,
        // binds each reservation to its checkout before releasing early.
        if (ref && acct) {
          console.warn('[stripe webhook] a connected account\'s expired checkout — its credit is left to the 48-hour sweep', { session: session.id, account: acct });
          break;
        }
        if (ref) {
          const { error: releaseErr } = await admin.rpc('release_store_credit_reservation', { p_ref: ref });
          if (releaseErr) console.error('[stripe webhook] store credit reservation release failed', { session: session.id, ref, error: releaseErr.message });
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        // A connected account's subscription Shape did not make is none of Shape's business.
        if (acct && !madeByShape(sub.application)) {
          console.warn('[stripe webhook] a connected account\'s subscription not made by Shape — ignored', { subscription: sub.id, account: acct });
          break;
        }
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
        const currentPeriodEnd = isoOrNull(sub.items.data[0]?.current_period_end);
        const patch: Record<string, unknown> = { status, current_period_end: currentPeriodEnd };
        // On a coach's own account the coach can change the price (their Stripe dashboard); the
        // row follows it, so the Business page's figures are what the member pays.
        const unitAmount = sub.items.data[0]?.price?.unit_amount;
        if (acct && event.type === 'customer.subscription.updated' && typeof unitAmount === 'number' && Number.isSafeInteger(unitAmount) && unitAmount >= 0) {
          patch.price_cents = unitAmount;
        }

        // ⚠ A CANCELLED SUBSCRIPTION STAYS CANCELLED (L9). Stripe never reopens one, so an update
        // event that still says otherwise is an older one delivered late, and moved the row back.
        const notReopened = <Q extends { neq: (c: string, v: string) => Q }>(q: Q) => (status === 'canceled' ? q : q.neq('status', 'canceled'));
        await notReopened(onAccount(admin
          .from('subscriptions')
          .update(patch)
          .eq('stripe_subscription_id', sub.id)));
        // The membership is Shape's own account's alone: a Connect event never touches it.
        if (acct) break;
        const { error: platformError } = await notReopened(admin
          .from('platform_subscriptions')
          .update({ status, current_period_end: currentPeriodEnd })
          .eq('stripe_subscription_id', sub.id));
        if (platformError && platformError.code !== '42P01') {
          console.warn('[shape-app] platform subscription update failed:', platformError.message);
        }
        break;
      }

      case 'account.updated': {
        // Connect account status change (onboarding progress, restrictions).
        // L11: the row is the one holding THIS account's id (unique per table), which Stripe
        // signed with the event. The metadata used to pick the row on its own, so an account
        // whose metadata named another coach's id would have written that coach's status.
        // The metadata's role still narrows the table when it is present.
        const account = event.data.object as Stripe.Account;
        // A Connect event is about the account it came from, and no other.
        if (acct && account.id !== acct) {
          console.error('[stripe webhook] account.updated about another account — ignored', { account: account.id, from: acct });
          break;
        }
        const providerRole = account.metadata?.provider_role;
        const tables: Array<'trainers' | 'nutritionists'> =
          providerRole === 'trainer' ? ['trainers']
          : providerRole === 'nutritionist' ? ['nutritionists']
          : ['trainers', 'nutritionists'];
        const status = account.charges_enabled && account.payouts_enabled
          ? 'active'
          : account.requirements?.disabled_reason
            ? 'restricted'
            : 'pending';
        let matched = 0;
        for (const table of tables) {
          // ⚠ A disconnected account stays disconnected: an update Stripe made before the coach
          // disconnected can be delivered after it, and would list a coach Shape can no longer
          // charge for. Connecting again goes through onboarding, which sets the status itself.
          // (A NULL status is not "disconnected": a bare neq would skip it, as SQL compares NULL.)
          const { data: hit, error: accErr } = await admin
            .from(table)
            .update({ stripe_account_status: status })
            .or('stripe_account_status.is.null,stripe_account_status.neq.disconnected')
            .eq('stripe_account_id', account.id)
            .select('id');
          if (accErr) console.error('[stripe webhook] account.updated write failed', { account: account.id, table, error: accErr.message });
          matched += hit?.length ?? 0;
          if (matched) break;
        }
        if (!matched) console.warn('[stripe webhook] account.updated matched no coach', { account: account.id, role: providerRole ?? null });
        break;
      }

      case 'account.application.deauthorized': {
        // A coach disconnected their Stripe account from Shape (their Stripe dashboard), or Stripe
        // did. Shape can no longer charge on it or read it, so the coach is marked disconnected,
        // which also takes them off the listing (listing_ready needs 'active'). The event's object
        // is Shape's application; the account is the event's own.
        if (!acct) {
          console.warn('[stripe webhook] account.application.deauthorized without an account — ignored', { event: event.id });
          break;
        }
        let disconnected = 0;
        for (const table of ['trainers', 'nutritionists'] as const) {
          const { data: hit, error: offErr } = await admin
            .from(table)
            .update({ stripe_account_status: 'disconnected' })
            .eq('stripe_account_id', acct)
            .select('id');
          if (offErr) {
            console.error('[stripe webhook] disconnected status write failed', { account: acct, table, error: offErr.message });
            if (isRetryableDbError(offErr)) {
              return NextResponse.json({ received: false, retry: true, error: 'disconnection not recorded' }, { status: 503 });
            }
          }
          disconnected += hit?.length ?? 0;
        }
        // For an admin: the coach's clients keep paying on the coach's own account, but Shape can
        // no longer cancel, refund or read those subscriptions.
        console.error('[stripe webhook] ADMIN: a coach disconnected their Stripe account from Shape', { account: acct, coachRows: disconnected });
        break;
      }

      case 'charge.refunded': {
        // Refund happened (admin approved via Stripe dashboard or user flow).
        // Flip the matching one_time_purchase row and any pending refund
        // request to 'refunded'.
        const charge = event.data.object as Stripe.Charge;
        // A connected account's charge Shape did not make is none of Shape's business.
        if (acct && !madeByShape(charge.application)) {
          console.warn('[stripe webhook] a connected account\'s charge not made by Shape — ignored', { charge: charge.id, account: acct });
          break;
        }
        // Ensure the coach transfer + platform fee are unwound even if the refund
        // was issued in the Stripe dashboard without reverse_transfer /
        // refund_application_fee (idempotent; no-op for the in-app refund path).
        await reconcileConnectRefund(charge, acct);
        const pi = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        if (pi) {
          const { data: purchase } = await onAccount(admin
            .from('one_time_purchases')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', pi))
            .select('id')
            .maybeSingle();
          if (purchase?.id) {
            await admin
              .from('refund_requests')
              .update({ status: 'refunded', processed_at: new Date().toISOString() })
              .eq('one_time_purchase_id', purchase.id)
              .eq('status', 'pending');
            // A refunded paid session that is still ahead comes off both calendars (refund-session.ts).
            await cancelRefundedSession(admin, purchase.id);
          }
        }
        // Subscription refunds come in with an invoice → subscription link.
        const invoiceId = extractInvoiceId(charge);
        if (invoiceId) {
          const invoice = await stripe.invoices.retrieve(invoiceId, undefined, acctOpts(acct));
          const subId = extractSubscriptionId(invoice);
          if (subId) {
            let subQuery = admin
              .from('subscriptions')
              .select('id')
              .eq('stripe_subscription_id', subId);
            if (acct) subQuery = subQuery.eq('stripe_account_id', acct);
            const { data: subRow } = await subQuery.maybeSingle();
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
        await onAccount(admin
          .from('one_time_purchases')
          .update({ status: newStatus })
          .eq('stripe_payment_intent_id', pi));
        break;
      }

      case 'invoice.paid': {
        // A subscription's later month went through: the member's receipt, the owners' notice and,
        // for a coach's plan, the coach's (payment-notices.ts). The first month is announced by
        // checkout.session.completed, so only a cycle's invoice counts, and only one that took money.
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== 'subscription_cycle' || !(invoice.amount_paid > 0) || !invoice.id) break;
        const subId = extractSubscriptionId(invoice);
        if (!subId) break;
        // The membership is sold on Shape's own account only.
        if (!acct) {
          const { data: membership, error: membershipErr } = await admin
            .from('platform_subscriptions')
            .select('client_id')
            .eq('stripe_subscription_id', subId)
            .maybeSingle();
          if (membershipErr) {
            console.error('[stripe webhook] renewal: membership read failed — no notice', { invoice: invoice.id, error: membershipErr.message });
          }
          const memberId = (membership as { client_id?: string | null } | null)?.client_id;
          if (memberId) {
            await announcePayment(admin, { key: invoice.id, clientId: memberId, amountCents: invoice.amount_paid, paidFor: 'membership', renewal: true });
            break;
          }
        }
        let planQuery = admin
          .from('subscriptions')
          .select('client_id, provider_id, provider_role, fee_bps')
          .eq('stripe_subscription_id', subId);
        if (acct) planQuery = planQuery.eq('stripe_account_id', acct);
        const { data: plan, error: planErr } = await planQuery.maybeSingle();
        if (planErr) {
          console.error('[stripe webhook] renewal: subscription read failed — no notice', { invoice: invoice.id, error: planErr.message });
          break;
        }
        const row = plan as { client_id?: string | null; provider_id?: number | null; provider_role?: string | null; fee_bps?: number | null } | null;
        if (!row?.client_id || !row.provider_id || (row.provider_role !== 'trainer' && row.provider_role !== 'nutritionist')) break;
        const split = splitAtBps(invoice.amount_paid, row.fee_bps);
        await announcePayment(admin, {
          key: invoice.id,
          clientId: row.client_id,
          amountCents: invoice.amount_paid,
          paidFor: 'coaching',
          renewal: true,
          provider: { role: row.provider_role, id: Number(row.provider_id) },
          shapeFeeCents: split?.shape ?? null,
          coachCents: split?.coach ?? null,
        });
        break;
      }

      default:
        // Other events (charge.succeeded, etc.) are ignored for now.
        break;
    }
  } catch (err) {
    // The signature is already verified, so this is a genuine Stripe event —
    // the failure is in our own processing. Returning 5xx makes Stripe retry
    // the event for up to ~3 days and flags the endpoint as failing (the "your
    // webhook is failing" email); a permanently broken event would retry
    // forever. So the answer depends on the failure (M10, 2026-10-08 review):
    // a connection, server, lock or timeout failure is 503 and IS retried,
    // because the next delivery can succeed; anything else is acknowledged
    // with 200 and logged loudly, as before, so one bad event can't drag the
    // whole endpoint into a failing state.
    console.error(
      `[shape-app] stripe webhook handler error (event ${event.id}, type ${event.type}):`,
      err
    );
    if (isRetryableDbError(err)) {
      return NextResponse.json({ received: false, retry: true, handlerError: true }, { status: 503 });
    }
    return NextResponse.json({ received: true, handlerError: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
