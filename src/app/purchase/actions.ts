'use server';

// One-time purchases from a trainer or nutritionist (single booking, single
// meal plan). Trainer/nutritionist sets the price in their profile; Shape
// takes a 15% application fee and the remaining 85% lands in the provider's
// connected Stripe account.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

type ProviderRole = 'trainer' | 'nutritionist';
type Kind = 'booking' | 'meal_plan';

const APPLICATION_FEE_BASIS_POINTS = 1500; // 15.00%

export async function startOneTimeCheckout(formData: FormData): Promise<void> {
  const providerRole = String(formData.get('provider_role') ?? '') as ProviderRole;
  const providerId = Number(formData.get('provider_id') ?? 0);
  const kind = String(formData.get('kind') ?? '') as Kind;
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

  const backHref =
    providerRole === 'trainer'
      ? `/trainer-profile.html?id=${providerId}`
      : `/nutritionist-profile.html?id=${providerId}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backHref)}`);

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();
  // Select the per-kind price column that actually exists on this
  // provider's table — trainers have session_price, nutritionists have
  // meal_plan_price.
  const priceCol = providerRole === 'trainer' ? 'session_price' : 'meal_plan_price';
  const { data: provider, error: providerError } = await admin
    .from(table)
    .select(
      `id, name, price, ${priceCol}, stripe_account_id, stripe_account_status, at_capacity`
    )
    .eq('id', providerId)
    .maybeSingle();

  if (providerError) {
    redirect(`${backHref}&error=${encodeURIComponent(`db_${providerError.code ?? 'error'}: ${providerError.message}`)}`);
  }
  if (!provider) redirect(`${backHref}&error=provider_not_found`);
  if (provider.at_capacity) redirect(`${backHref}&error=provider_at_capacity`);
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') {
    redirect(`${backHref}&error=provider_not_onboarded`);
  }

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

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const applicationFeeCents = Math.floor((priceCents * APPLICATION_FEE_BASIS_POINTS) / 10000);

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
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        kind,
        price_cents: String(priceCents),
        workout_id: workoutId ? String(workoutId) : '',
        plan_id: planId ? String(planId) : '',
      },
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: provider.stripe_account_id },
        metadata: {
          client_id: user.id,
          provider_id: String(providerId),
          provider_role: providerRole,
          kind,
          workout_id: workoutId ? String(workoutId) : '',
          plan_id: planId ? String(planId) : '',
        },
      },
      success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${backHref}&error=purchase_cancelled`,
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
