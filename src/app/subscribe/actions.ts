'use server';

// Subscribe flow — creates a Stripe Checkout Session for a client subscribing
// to a trainer or nutritionist. The client clicks "Subscribe $X/mo" on a
// provider detail page; we:
//
// 1. Verify they're signed in (if not, bounce to /login?next=...)
// 2. Lazily create (and cache) a Stripe Product + Price for this provider
// 3. Create a Checkout Session in subscription mode with metadata so the
//    webhook can resolve (client_id, provider_id, provider_role)
// 4. Redirect the user to Stripe's hosted page
//
// After payment, Stripe redirects to /subscribe/success and also POSTs a
// webhook to /api/stripe/webhook which is where we actually record the
// subscription row.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { hasActiveWaitlistInvite } from '@/lib/waitlist';
import { coachProfileHref } from '@/lib/coach-profile-href';
import { resolveCoachCheckoutOrigin } from '@/lib/coach-origin';
import { bpsToPercent } from '@/lib/platform-fee';
import { ACTIVE_SUB } from '@/lib/membership-core';
import { membershipDetour } from '@/lib/membership-detour';
import { hasCompletedScreening, screeningHref } from '@/lib/health-screening';
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { acctOpts, connectedCustomerFor, madeByShape } from '@/lib/stripe-connect';
import { coachNotPayable, directChargesReady, normalizeCode, formerSubscriptionLive, recordCoachCheckout, recordedSubscriptionLive, resolveCheckoutCode, type CheckoutCode } from '@/lib/coach-checkout';
import { hasLiveStripeSubscription } from '@/lib/stripe-live-subscription';
import { CHECKOUT_CREATE_OPTIONS, checkoutReturnsKey, claimCheckout, currentCheckout, isCheckoutInProgress, retireCoachCheckouts, type CheckoutClaim, type RetiredCoachCheckouts } from '@/lib/checkout-barrier';

type ProviderRole = 'trainer' | 'nutritionist';

async function getProviderConnectInfo(
  providerRole: ProviderRole,
  providerId: number,
  allowAtCapacity = false,
  direct = false
): Promise<
  | { priceId: string; priceCents: number; stripeAccountId: string }
  | { error: string }
> {
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';

  // Use admin client so we can both read AND write the cached Stripe IDs
  // (the public-read RLS policy doesn't allow updates from unauthenticated
  // or even authenticated users, only the webhook path).
  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from(table)
    .select('id, name, price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at, suspended_at')
    .eq('id', providerId)
    .maybeSingle();

  if (error) return { error: `db_${error.code ?? 'error'}: ${error.message}` };
  if (!provider) return { error: 'provider_not_found' };
  // A suspended listing takes no payment (client-onboarding review, fix 3c: M8).
  if ((provider as { suspended_at?: string | null }).suspended_at) return { error: 'provider_suspended' };
  if (!allowAtCapacity && isEffectivelyAtCapacity(provider)) return { error: 'provider_at_capacity' };
  if (!provider.price || provider.price <= 0) return { error: 'price_not_set' };
  // ⚠ A coach who has not connected, or has disconnected, takes no payment (coach-checkout.ts).
  const notPayable = coachNotPayable(provider);
  if (notPayable) return { error: notPayable === 'coach_disconnected' ? 'coach_disconnected' : 'stripe_not_onboarded' };

  const priceCents = Math.round(Number(provider.price) * 100);

  // Create a fresh product + price for each Checkout Session. Cheap, and avoids needing cache
  // columns on the trainers / nutritionists table. On a direct charge they are made on the COACH's
  // account, where the checkout is: a price on Shape's account cannot be sold there.
  const onCoach = acctOpts(direct ? provider.stripe_account_id : null);
  const product = await stripe.products.create({
    name: `${provider.name} — ${providerRole} subscription`,
    metadata: { provider_id: String(provider.id), provider_role: providerRole },
  }, onCoach);
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: priceCents,
    recurring: { interval: 'month' },
    metadata: { provider_id: String(provider.id), provider_role: providerRole },
  }, onCoach);

  return {
    priceId: price.id,
    priceCents,
    stripeAccountId: provider.stripe_account_id,
  };
}

export async function startCheckout(formData: FormData): Promise<void> {
  const providerRole = String(formData.get('provider_role') ?? '') as ProviderRole;
  const providerId = Number(formData.get('provider_id') ?? 0);
  // BYO ref-link token (the web capture sets this hidden field in PR B) — the
  // last-resort checkout-time bind fallback for a ref-link visitor.
  const ref = String(formData.get('ref') ?? '').trim() || undefined;
  // The code box on /subscribe (coach-checkout.ts): a Shape code or the coach's own.
  const typedCode = normalizeCode(formData.get('code'));

  if (!['trainer', 'nutritionist'].includes(providerRole) || !providerId) {
    // Not `/`: the root redirect carries no error on, so the visitor heard nothing.
    redirect('/newdesign/Marketplace.html?error=invalid_subscribe');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Back to the coach's live profile (the living profile, by the listing's owner); every
  // error return below appends `&error=…` to it.
  const backHref = await coachProfileHref(providerRole, providerId);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(backHref)}`);
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  // ⚠ COACHING NEEDS AN ACTIVE SHAPE MEMBERSHIP (owner, 2026-10-14), the same rule as
  // /api/stripe/checkout-session. A non-member goes through the $5 checkout first and comes
  // back to this coach's profile (membership-detour.ts); nothing is charged for the coach
  // until they choose again. redirect() throws, so it is called here, outside any try.
  const detour = await membershipDetour({ supabase, user, backHref, origin: siteOrigin });
  if (detour) redirect(detour);

  // ⚠ HIRING A COACH NEEDS THE HEALTH SCREENING (client-onboarding review, fix 2b), the same rule
  // as /api/stripe/checkout-session: a member who has not completed it goes to Settings → Health
  // profile and comes back here. A failed read refuses.
  let screened = false;
  try {
    screened = await hasCompletedScreening(supabase, user.id);
  } catch (e) {
    console.error('[subscribe] health screening read failed', e);
    redirect(`${backHref}&error=screening_check_failed`);
  }
  if (!screened) redirect(screeningHref(backHref));

  let customerId: string | null = null;
  try {
    customerId = await stripeCustomerFor(user.id, user.email ?? null);
  } catch (e) {
    console.error('[subscribe] Stripe customer failed', e);
  }
  if (!customerId) redirect(`${backHref}&error=checkout_failed`);
  // Direct charges (part B): the checkout is made ON the coach's account. Without both Connect
  // variables the webhook could record none of it, so it stays a destination charge.
  const direct = directChargesReady();
  if (!direct) console.warn('[subscribe] Connect variables unset: coach checkout made as a destination charge on Shape\'s account');
  if (typedCode === 'invalid') redirect(`${backHref}&error=code_invalid`);
  if (typedCode && !direct) redirect(`${backHref}&error=code_not_here`);

  // One live subscription per coach: paying twice made two monthly charges. Our table is read
  // here, and Stripe under the checkout claim below (stripe-live-subscription.ts says why); a
  // failed read refuses.
  const { data: existing, error: existingErr } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('client_id', user.id)
    .eq('provider_id', providerId)
    .eq('provider_role', providerRole);
  if (existingErr) redirect(`${backHref}&error=subscription_check_failed`);
  if ((existing ?? []).some((row: { status?: unknown }) => ACTIVE_SUB.has(String(row.status)))) {
    redirect(`${backHref}&error=already_subscribed`);
  }

  // First-dibs: a live waitlist invite lets an at-capacity coach be subscribed
  // to. Invite lookup runs on the caller's RLS-scoped client, inside a try so a
  // lookup/env failure fails the same retryable way as the rest of setup.
  let allowAtCapacity = false;
  try {
    allowAtCapacity = await hasActiveWaitlistInvite(supabase, user.id, providerRole, providerId);
  } catch {
    redirect(`${backHref}&error=waitlist_check_failed`);
  }

  // One payable checkout per account and coach at a time (checkout-barrier.ts): claimed before
  // anything is looked for or created, confirmed right before the create, and released in the
  // finally, which passes redirect()'s throw on.
  let claim: CheckoutClaim;
  try {
    claim = await claimCheckout(user.id, `coach-${providerRole}-${providerId}`);
  } catch (e) {
    if (isCheckoutInProgress(e)) redirect(`${backHref}&error=checkout_in_progress`);
    console.error('[subscribe] checkout claim failed', e);
    redirect(`${backHref}&error=checkout_failed`);
  }
  try {
    let priceResult;
    try {
      priceResult = await getProviderConnectInfo(providerRole, providerId, allowAtCapacity, direct);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      redirect(`${backHref}&error=${encodeURIComponent(`stripe_setup: ${msg}`.slice(0, 300))}`);
    }
    if ('error' in priceResult) {
      redirect(`${backHref}&error=${encodeURIComponent(priceResult.error)}`);
    }

    // BYO commission split: resolve WHY this checkout exists → the resolved fee.
    // A client the coach brought (an already-bound referral) pays 0%; a marketplace
    // client pays 15%. Fail-closed to marketplace / 1500 inside the resolver.
    const { origin: coachOrigin, feeBps, referralId } = await resolveCoachCheckoutOrigin({
      caller: supabase,
      providerRole,
      providerId,
      ref,
    });

    const account = priceResult.stripeAccountId;
    const onCoach = acctOpts(direct ? account : null);
    // The member's customer on the coach's account, for a direct charge.
    let buyer: string = customerId;
    if (direct) {
      try {
        buyer = await connectedCustomerFor(stripe, createAdminClient(), { userId: user.id, account, email: user.email ?? null });
      } catch (e) {
        console.error('[subscribe] customer on the coach account failed', e);
        redirect(`${backHref}&error=checkout_failed`);
      }
    }
    let checkoutCode: CheckoutCode | null = null;
    if (typedCode) {
      let found: Awaited<ReturnType<typeof resolveCheckoutCode>>;
      try {
        found = await resolveCheckoutCode(stripe, { code: typedCode, account, listCents: priceResult.priceCents, mode: 'subscription', platformCustomerId: customerId, coachCustomerId: direct ? buyer : null });
      } catch (e) {
        console.error('[subscribe] code lookup failed', e);
        redirect(`${backHref}&error=code_check_failed`);
      }
      if (!found.ok) redirect(`${backHref}&error=${found.reason}`);
      checkoutCode = found.code;
    }

    // Handed back only on this request's terms: a changed price, fee, referral, code or return makes a new one.
    const successUrl = `${siteOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}${direct ? `&acct=${account}` : ''}`;
    const cancelUrl = `${siteOrigin}${backHref}&error=subscribe_cancelled`;
    const returns = checkoutReturnsKey(successUrl, cancelUrl);
    let open: string | null = null;
    let retired: RetiredCoachCheckouts = { subscriptions: new Set(), former: new Map(), unverified: false };
    try {
      const sameProduct = (s: { mode?: string | null; metadata?: Record<string, string> | null }) => s.mode === 'subscription'
        && s.metadata?.provider_id === String(providerId) && s.metadata?.provider_role === providerRole;
      const sameTerms = (s: { metadata?: Record<string, string> | null }) => s.metadata?.price_cents === String(priceResult.priceCents) && s.metadata?.fee_bps === String(feeBps)
        && s.metadata?.origin === coachOrigin && (s.metadata?.referral_id ?? null) === (referralId ?? null)
        && s.metadata?.returns === returns && (s.metadata?.code ?? null) === (checkoutCode?.code ?? null);
      // On a direct charge, a destination-charge checkout still open on Shape's account is expired,
      // and on the coach's account nothing is handed back: Shape's recorded open checkouts for this
      // coach are expired and a fresh one is made (checkout-barrier.ts, retireCoachCheckouts).
      if (direct) {
        await currentCheckout(customerId, sameProduct, () => false);
        retired = await retireCoachCheckouts(user.id, account, { provider_role: providerRole, provider_id: providerId });
      } else {
        open = await currentCheckout(customerId, sameProduct, sameTerms);
      }
    } catch (e) {
      console.error('[subscribe] open checkout lookup failed', e);
      redirect(`${backHref}&error=checkout_failed`);
    }
    // ⚠ ASKED HERE, WHILE HOLDING THE CLAIM AND AFTER THE OPEN CHECKOUTS ARE READ (Codex on #2353):
    // a request that waited on the claim can arrive after the first checkout was paid, and one
    // the buyer completes in another tab while this request reads them is no longer listed as
    // open. Stripe holds the subscription the moment it is paid; our row comes with the webhook.
    let paid = false;
    try {
      const wanted = { client_id: user.id, provider_id: String(providerId), provider_role: providerRole };
      paid = await hasLiveStripeSubscription({ customerId, email: user.email ?? null }, wanted)
        // Shape's recorded ones, each read by its id: a list the coach can bury is never relied on.
        || (direct && await recordedSubscriptionLive(stripe, account, retired.subscriptions, ACTIVE_SUB))
        // And the same on a former account of this coach's, while a payment there may be unrecorded.
        || (direct && await formerSubscriptionLive(stripe, retired.former, ACTIVE_SUB))
        || (direct && await hasLiveStripeSubscription({ customerId: buyer, email: null }, wanted, account, (sub) => madeByShape(sub.application) || retired.subscriptions.has(sub.id ?? '')));
    } catch (e) {
      console.error('[subscribe] Stripe subscription lookup failed', e);
      redirect(`${backHref}&error=subscription_check_failed`);
    }
    if (paid) redirect(`${backHref}&error=already_subscribed`);
    // A recent checkout on the coach's former account Shape can no longer read (retireCoachCheckouts).
    if (retired.unverified) redirect(`${backHref}&error=payment_pending`);
    if (open) redirect(open);

    // Shape takes the RESOLVED application fee on the coach charge; the rest
    // settles into the provider's connected Stripe account.
    let session;
    try {
      await claim.confirm();
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceResult.priceId, quantity: 1 }],
        customer: buyer,
        client_reference_id: user.id,
        metadata: {
          client_id: user.id,
          provider_id: String(providerId),
          provider_role: providerRole,
          price_cents: String(priceResult.priceCents),
          origin: coachOrigin,
          fee_bps: String(feeBps),
          returns,
          ...(referralId ? { referral_id: referralId } : {}),
          ...(checkoutCode ? { code: checkoutCode.code, code_source: checkoutCode.source } : {}),
        },
        subscription_data: {
          // Stripe requires the application fee to be positive-or-absent: a 0% (BYO) fee OMITS the
          // field. On a direct charge Stripe's own fee is the coach's either way.
          ...(feeBps > 0 ? { application_fee_percent: bpsToPercent(feeBps) } : {}),
          ...(direct ? {} : { transfer_data: { destination: account } }),
          metadata: {
            client_id: user.id,
            provider_id: String(providerId),
            provider_role: providerRole,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        // A typed code is applied here, which turns Stripe's own box off; with none, the coach's own
        // codes go in Stripe's box (a percent fee follows the discount).
        ...(checkoutCode ? { discounts: [checkoutCode.discount] } : { allow_promotion_codes: true }),
      }, { ...CHECKOUT_CREATE_OPTIONS, ...onCoach });
    } catch (e) {
      if (isCheckoutInProgress(e)) redirect(`${backHref}&error=checkout_in_progress`);
      if (checkoutCode && (e as { type?: string })?.type === 'StripeInvalidRequestError') redirect(`${backHref}&error=code_not_here`);
      const msg = e instanceof Error ? e.message : String(e);
      redirect(`${backHref}&error=${encodeURIComponent(`stripe: ${msg}`.slice(0, 300))}`);
    }

    if (!session.url) {
      redirect(`${backHref}&error=checkout_failed`);
    }
    // ⚠ The record before the address: on a coach's account the webhook records only a checkout
    // Shape wrote down (coach_checkouts).
    if (direct) {
      let recorded = true;
      try {
        await recordCoachCheckout(createAdminClient(), {
          stripe_checkout_session_id: session.id,
          stripe_account_id: account,
          client_id: user.id,
          provider_role: providerRole,
          provider_id: providerId,
          mode: 'subscription',
          kind: 'subscription',
          plan_id: null,
          workout_id: null,
          item_name: null,
          origin: coachOrigin,
          fee_bps: feeBps,
          referral_id: referralId ?? null,
          list_cents: priceResult.priceCents,
          charge_cents: priceResult.priceCents,
          application_fee_cents: null,
          store_credit_kind: null,
          store_credit_cents: 0,
          store_credit_ref: null,
          code: checkoutCode?.code ?? null,
          code_source: checkoutCode?.source ?? null,
        });
      } catch (e) {
        recorded = false;
        console.error('[subscribe] coach checkout not recorded — expired, not handed out', { session: session.id, error: e instanceof Error ? e.message : String(e) });
        await stripe.checkout.sessions.expire(session.id, undefined, onCoach).then(() => undefined, () => undefined);
      }
      if (!recorded) redirect(`${backHref}&error=checkout_failed`);
    }

    redirect(session.url);
  } finally {
    await claim.release();
  }
}

export async function cancelSubscription(formData: FormData): Promise<void> {
  const subscriptionId = String(formData.get('subscription_id') ?? '');
  if (!subscriptionId) redirect('/dashboard?error=missing_sub_id');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify the user owns this subscription row before we tell Stripe to
  // cancel. RLS already filters the select to the signed-in client.
  // '*' carries stripe_account_id, the coach's account a direct charge lives on (null: the
  // platform), and is migration-safe: before the 2026-10-18 migration the column is absent.
  const { data: row } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row || row.client_id !== user.id || !row.stripe_subscription_id) {
    redirect('/dashboard?error=not_allowed');
  }

  await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true }, acctOpts(row.stripe_account_id));
  redirect('/newdesign/ClientDashboard.html?notice=cancel_scheduled');
}
