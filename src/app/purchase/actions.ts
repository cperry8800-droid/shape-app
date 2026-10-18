'use server';

// One-time purchases from a trainer or nutritionist (single booking, single
// meal plan). Trainer/nutritionist sets the price in their profile; Shape
// takes a 15% application fee and the remaining 85% lands in the provider's
// connected Stripe account.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { feeSplit, bpsToRate } from '@/lib/platform-fee';
import { hasActiveWaitlistInvite, isActiveClientOf } from '@/lib/waitlist';
import { resolveCoachCheckoutOrigin } from '@/lib/coach-origin';
import { coachProfileHref } from '@/lib/coach-profile-href';
import { membershipDetour } from '@/lib/membership-detour';
import { hiresCoach, hasCompletedScreening, screeningHref } from '@/lib/health-screening';
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { acctOpts, connectedCustomerFor } from '@/lib/stripe-connect';
import { afterCode, coachNotPayable, directChargesReady, normalizeCode, recordCoachCheckout, resolveCheckoutCode, type CheckoutCode } from '@/lib/coach-checkout';

type ProviderRole = 'trainer' | 'nutritionist';
type Kind = 'booking' | 'meal_plan';

export async function startOneTimeCheckout(formData: FormData): Promise<void> {
  const providerRole = String(formData.get('provider_role') ?? '') as ProviderRole;
  const providerId = Number(formData.get('provider_id') ?? 0);
  const kind = String(formData.get('kind') ?? '') as Kind;
  // BYO ref-link token (the web capture sets this hidden field in PR B) — the
  // last-resort checkout-time bind fallback for a ref-link visitor.
  const ref = String(formData.get('ref') ?? '').trim() || undefined;
  // The code box on /purchase (coach-checkout.ts): a Shape code or the coach's own.
  const typedCode = normalizeCode(formData.get('code'));
  const workoutIdRaw = formData.get('workout_id');
  const planIdRaw = formData.get('plan_id');
  const workoutId = workoutIdRaw ? Number(workoutIdRaw) : null;
  const planId = planIdRaw ? Number(planIdRaw) : null;
  const urlItemName = formData.get('item_name')
    ? String(formData.get('item_name')).slice(0, 120)
    : null;

  if (
    !['trainer', 'nutritionist'].includes(providerRole) ||
    !providerId ||
    !['booking', 'meal_plan'].includes(kind)
  ) {
    redirect('/?error=invalid_purchase');
  }

  // The coach's live profile (the living profile, by the listing's owner), where the visitor
  // came from; every error return below appends `&error=…` to it.
  const backHref = await coachProfileHref(providerRole, providerId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backHref)}`);

  // ⚠ COACHING NEEDS AN ACTIVE SHAPE MEMBERSHIP (owner, 2026-10-14; client-onboarding review):
  // a single session or meal plan as much as a subscription. This action never asked. A
  // non-member goes through the $5 checkout first and comes back to the coach's profile.
  // redirect() throws, so it is called here, outside any try.
  const detour = await membershipDetour({ supabase, user, backHref, origin: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000' });
  if (detour) redirect(detour);

  let customerId: string | null = null;
  try {
    customerId = await stripeCustomerFor(user.id, user.email ?? null);
  } catch (e) {
    console.error('[purchase] Stripe customer failed', e);
  }
  if (!customerId) redirect(`${backHref}&error=checkout_failed`);

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();
  // Select the per-kind price column that actually exists on this
  // provider's table — trainers have session_price, nutritionists have
  // meal_plan_price.
  const priceCol = providerRole === 'trainer' ? 'session_price' : 'meal_plan_price';
  const { data: provider, error: providerError } = await admin
    .from(table)
    .select(
      `id, name, price, ${priceCol}, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at, suspended_at`
    )
    .eq('id', providerId)
    .maybeSingle();

  if (providerError) {
    redirect(`${backHref}&error=${encodeURIComponent(`db_${providerError.code ?? 'error'}: ${providerError.message}`)}`);
  }
  if (!provider) redirect(`${backHref}&error=provider_not_found`);
  // A suspended listing takes no payment (client-onboarding review, fix 3c: M8).
  if ((provider as { suspended_at?: string | null }).suspended_at) redirect(`${backHref}&error=provider_suspended`);
  // First-dibs: an at-capacity coach is only purchasable with a live waitlist
  // invite. Invite lookup runs on the caller's RLS-scoped client; a lookup
  // failure is a distinct retryable state, not a silent "at capacity".
  if (isEffectivelyAtCapacity(provider)) {
    let invited = false;
    try {
      // A member who already subscribes to this coach can still buy from them at capacity (task
      // #10): at capacity means no new clients.
      invited = await hasActiveWaitlistInvite(supabase, user.id, providerRole, providerId)
        || await isActiveClientOf(supabase, user.id, providerRole, providerId);
    } catch {
      redirect(`${backHref}&error=waitlist_check_failed`);
    }
    if (!invited) redirect(`${backHref}&error=provider_at_capacity`);
  }
  // ⚠ A coach who has not connected, or has disconnected, takes no payment (coach-checkout.ts).
  const notPayable = coachNotPayable(provider);
  if (notPayable) redirect(`${backHref}&error=${notPayable === 'coach_disconnected' ? 'coach_disconnected' : 'provider_not_onboarded'}`);
  const account = provider.stripe_account_id as string;
  // Direct charges (part B): the checkout is made ON the coach's account. Without both Connect
  // variables the webhook could record none of it, so it stays a destination charge.
  const direct = directChargesReady();
  if (!direct) console.warn('[purchase] Connect variables unset: coach checkout made as a destination charge on Shape\'s account');
  if (typedCode === 'invalid') redirect(`${backHref}&error=code_invalid`);
  if (typedCode && !direct) redirect(`${backHref}&error=code_not_here`);

  // If a specific workout or plan was targeted, use its price + name so
  // the Stripe receipt shows the actual item. Otherwise fall back to the
  // provider-level session / meal-plan fee, then the monthly price.
  let itemName: string | null = null;
  let itemPrice: number | null = null;
  if (providerRole === 'trainer' && workoutId && Number.isFinite(workoutId)) {
    const { data: wk } = await admin
      .from('trainer_workouts')
      .select('id, name, price, trainer_id')
      .eq('id', workoutId)
      .maybeSingle();
    if (wk && wk.trainer_id === providerId) {
      itemName = (wk as { name: string }).name;
      itemPrice = (wk as { price: number | null }).price ?? null;
    }
  }
  if (providerRole === 'nutritionist' && planId && Number.isFinite(planId)) {
    const { data: pl } = await admin
      .from('nutritionist_plans')
      .select('id, name, price, nutritionist_id')
      .eq('id', planId)
      .maybeSingle();
    if (pl && pl.nutritionist_id === providerId) {
      itemName = (pl as { name: string }).name;
      itemPrice = (pl as { price: number | null }).price ?? null;
    }
  }

  // ⚠ A SESSION WITH A TRAINER HIRES A COACH, SO IT NEEDS THE HEALTH SCREENING (client-onboarding
  // review, fix 2b; health-screening.ts). A meal plan, or a workout found above, is a product; a
  // booking whose workout was not found is charged as a session, so it is held to it too. A member
  // who has not completed it goes to Settings → Health profile and comes back here. A failed read
  // refuses.
  if (hiresCoach({ subscription: false, providerRole, product: kind !== 'booking' || itemName != null })) {
    let screened = false;
    try {
      screened = await hasCompletedScreening(supabase, user.id);
    } catch (e) {
      console.error('[purchase] health screening read failed', e);
      redirect(`${backHref}&error=screening_check_failed`);
    }
    if (!screened) redirect(screeningHref(backHref));
  }

  const providerRow = provider as Record<string, number | string | null>;
  const rawPrice =
    itemPrice ??
    ((providerRow[priceCol] as number | null) ?? (provider.price as number | null));
  const priceCents = Math.round(Number(rawPrice ?? 0) * 100);
  if (!priceCents || priceCents <= 0) {
    redirect(`${backHref}&error=price_not_set`);
  }

  const label = kind === 'booking' ? 'Booking' : 'Meal plan';
  const displayItemName = itemName ?? urlItemName;
  const productName = displayItemName
    ? `${provider.name} — ${displayItemName}`
    : `${provider.name} — ${label}`;

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  // BYO commission split: resolve WHY this checkout exists → the resolved fee.
  // A client the coach brought pays 0%; a marketplace client pays 15%. Fail-closed
  // to marketplace / 1500 inside the resolver.
  const { origin: coachOrigin, feeBps, referralId } = await resolveCoachCheckoutOrigin({
    caller: supabase,
    providerRole,
    providerId,
    ref,
  });

  // The member's customer on the coach's account, for a direct charge.
  let buyer: string = customerId;
  if (direct) {
    try {
      buyer = await connectedCustomerFor(stripe, admin, { userId: user.id, account, email: user.email ?? null });
    } catch (e) {
      console.error('[purchase] customer on the coach account failed', e);
      redirect(`${backHref}&error=checkout_failed`);
    }
  }
  let checkoutCode: CheckoutCode | null = null;
  if (typedCode) {
    let found: Awaited<ReturnType<typeof resolveCheckoutCode>>;
    try {
      found = await resolveCheckoutCode(stripe, { code: typedCode, account, listCents: priceCents, mode: 'payment', platformCustomerId: customerId, coachCustomerId: direct ? buyer : null });
    } catch (e) {
      console.error('[purchase] code lookup failed', e);
      redirect(`${backHref}&error=code_check_failed`);
    }
    if (!found.ok) redirect(`${backHref}&error=${found.reason}`);
    checkoutCode = found.code;
  }
  // No store credit on this path, so the charge is the price after any code. Shape keeps the
  // RESOLVED fee of it (the owner's split: its rate of the discounted price), the coach the rest.
  const chargeCents = afterCode(priceCents, checkoutCode);
  const { applicationFeeCents } = feeSplit(chargeCents, chargeCents, bpsToRate(feeBps));
  const onCoach = acctOpts(direct ? account : null);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: priceCents,
            product_data: { name: productName },
          },
        },
      ],
      customer: buyer,
      client_reference_id: user.id,
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        kind,
        price_cents: String(chargeCents),
        workout_id: workoutId ? String(workoutId) : '',
        plan_id: planId ? String(planId) : '',
        origin: coachOrigin,
        fee_bps: String(feeBps),
        ...(referralId ? { referral_id: referralId } : {}),
        ...(checkoutCode ? { code: checkoutCode.code, code_source: checkoutCode.source } : {}),
      },
      ...(checkoutCode ? { discounts: [checkoutCode.discount] } : {}),
      payment_intent_data: {
        // Stripe requires the application fee to be positive-or-absent: a 0% (BYO) fee OMITS the
        // field. On a direct charge Stripe's own fee is the coach's either way.
        ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
        ...(direct ? {} : { transfer_data: { destination: account } }),
        metadata: {
          client_id: user.id,
          provider_id: String(providerId),
          provider_role: providerRole,
          kind,
          workout_id: workoutId ? String(workoutId) : '',
          plan_id: planId ? String(planId) : '',
        },
      },
      success_url: `${siteOrigin}/purchase/success?session_id={CHECKOUT_SESSION_ID}${direct ? `&acct=${account}` : ''}`,
      cancel_url: `${siteOrigin}${backHref}&error=purchase_cancelled`,
    }, onCoach);
  } catch (e) {
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
      await recordCoachCheckout(admin, {
        stripe_checkout_session_id: session.id,
        stripe_account_id: account,
        client_id: user.id,
        provider_role: providerRole,
        provider_id: providerId,
        mode: 'payment',
        kind,
        plan_id: planId ? String(planId) : null,
        workout_id: workoutId ? String(workoutId) : null,
        item_name: displayItemName ? String(displayItemName).slice(0, 200) : null,
        origin: coachOrigin,
        fee_bps: feeBps,
        referral_id: referralId ?? null,
        list_cents: priceCents,
        charge_cents: chargeCents,
        application_fee_cents: applicationFeeCents,
        store_credit_kind: null,
        store_credit_cents: 0,
        store_credit_ref: null,
        code: checkoutCode?.code ?? null,
        code_source: checkoutCode?.source ?? null,
      });
    } catch (e) {
      recorded = false;
      console.error('[purchase] coach checkout not recorded — expired, not handed out', { session: session.id, error: e instanceof Error ? e.message : String(e) });
      await stripe.checkout.sessions.expire(session.id, undefined, onCoach).then(() => undefined, () => undefined);
    }
    if (!recorded) redirect(`${backHref}&error=checkout_failed`);
  }

  redirect(session.url);
}
