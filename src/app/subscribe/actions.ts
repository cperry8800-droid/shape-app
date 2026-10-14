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
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { hasLiveStripeSubscription } from '@/lib/stripe-live-subscription';

type ProviderRole = 'trainer' | 'nutritionist';

async function getProviderConnectInfo(
  providerRole: ProviderRole,
  providerId: number,
  allowAtCapacity = false
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
    .select('id, name, price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at')
    .eq('id', providerId)
    .maybeSingle();

  if (error) return { error: `db_${error.code ?? 'error'}: ${error.message}` };
  if (!provider) return { error: 'provider_not_found' };
  if (!allowAtCapacity && isEffectivelyAtCapacity(provider)) return { error: 'provider_at_capacity' };
  if (!provider.price || provider.price <= 0) return { error: 'price_not_set' };
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') {
    return { error: 'stripe_not_onboarded' };
  }

  const priceCents = Math.round(Number(provider.price) * 100);

  // Create a fresh product + price on the PLATFORM account for each
  // Checkout Session. Cheap, and avoids needing cache columns on the
  // trainers / nutritionists table. (We can re-introduce caching once
  // those columns exist in the schema.)
  const product = await stripe.products.create({
    name: `${provider.name} — ${providerRole} subscription`,
    metadata: { provider_id: String(provider.id), provider_role: providerRole },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: priceCents,
    recurring: { interval: 'month' },
    metadata: { provider_id: String(provider.id), provider_role: providerRole },
  });

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

  if (!['trainer', 'nutritionist'].includes(providerRole) || !providerId) {
    redirect('/?error=invalid_subscribe');
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

  let customerId: string | null = null;
  try {
    customerId = await stripeCustomerFor(user.id, user.email ?? null);
  } catch (e) {
    console.error('[subscribe] Stripe customer failed', e);
  }
  if (!customerId) redirect(`${backHref}&error=checkout_failed`);

  // One live subscription per coach: paying twice made two monthly charges. Our table and
  // Stripe are both read (stripe-live-subscription.ts says why); a failed read refuses.
  const { data: existing, error: existingErr } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('client_id', user.id)
    .eq('provider_id', providerId)
    .eq('provider_role', providerRole);
  if (existingErr) redirect(`${backHref}&error=subscription_check_failed`);
  let live = (existing ?? []).some((row: { status?: unknown }) => ACTIVE_SUB.has(String(row.status)));
  // Our row arrives with the webhook; Stripe has the subscription the moment it is paid.
  let stripeChecked = live;
  if (!live) {
    try {
      live = await hasLiveStripeSubscription({ customerId, email: user.email ?? null }, { client_id: user.id, provider_id: String(providerId), provider_role: providerRole });
      stripeChecked = true;
    } catch (e) {
      console.error('[subscribe] Stripe subscription lookup failed', e);
    }
  }
  if (!stripeChecked) redirect(`${backHref}&error=subscription_check_failed`);
  if (live) redirect(`${backHref}&error=already_subscribed`);

  // First-dibs: a live waitlist invite lets an at-capacity coach be subscribed
  // to. Invite lookup runs on the caller's RLS-scoped client, inside a try so a
  // lookup/env failure fails the same retryable way as the rest of setup.
  let allowAtCapacity = false;
  try {
    allowAtCapacity = await hasActiveWaitlistInvite(supabase, user.id, providerRole, providerId);
  } catch {
    redirect(`${backHref}&error=waitlist_check_failed`);
  }

  let priceResult;
  try {
    priceResult = await getProviderConnectInfo(providerRole, providerId, allowAtCapacity);
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

  // Shape takes the RESOLVED application fee on the coach charge; the rest
  // settles into the provider's connected Stripe account.
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceResult.priceId, quantity: 1 }],
      customer: customerId,
      client_reference_id: user.id,
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        price_cents: String(priceResult.priceCents),
        origin: coachOrigin,
        fee_bps: String(feeBps),
        ...(referralId ? { referral_id: referralId } : {}),
      },
      subscription_data: {
        // Stripe requires the application fee to be positive-or-absent: a 0%
        // (BYO) fee OMITS the field — the full charge transfers to the coach and
        // Shape absorbs Stripe's processing (the spec's deliberate subsidy).
        ...(feeBps > 0 ? { application_fee_percent: bpsToPercent(feeBps) } : {}),
        transfer_data: { destination: priceResult.stripeAccountId },
        metadata: {
          client_id: user.id,
          provider_id: String(providerId),
          provider_role: providerRole,
        },
      },
      success_url: `${siteOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteOrigin}${backHref}&error=subscribe_cancelled`,
      allow_promotion_codes: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`${backHref}&error=${encodeURIComponent(`stripe: ${msg}`.slice(0, 300))}`);
  }

  if (!session.url) {
    redirect(`${backHref}&error=checkout_failed`);
  }

  redirect(session.url);
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
  const { data: row } = await supabase
    .from('subscriptions')
    .select('id, stripe_subscription_id, client_id')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!row || row.client_id !== user.id || !row.stripe_subscription_id) {
    redirect('/dashboard?error=not_allowed');
  }

  await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true });
  redirect('/newdesign/ClientDashboard.html?notice=cancel_scheduled');
}
