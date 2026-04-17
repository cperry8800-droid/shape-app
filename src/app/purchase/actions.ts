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
  const { data: provider } = await admin
    .from(table)
    .select(
      'id, name, price, session_price, meal_plan_price, stripe_account_id, stripe_account_status'
    )
    .eq('id', providerId)
    .maybeSingle();

  if (!provider) redirect(`${backHref}?error=provider_not_found`);
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') {
    redirect(`${backHref}?error=provider_not_onboarded`);
  }

  // Trainers expose `session_price` (single-session fee); nutritionists
  // expose `meal_plan_price`. Fall back to the monthly `price` if the
  // per-item column is unset, so older rows still check out at something.
  const rawPrice =
    kind === 'booking'
      ? provider.session_price ?? provider.price
      : provider.meal_plan_price ?? provider.price;
  const priceCents = Math.round(Number(rawPrice ?? 0) * 100);
  if (!priceCents || priceCents <= 0) {
    redirect(`${backHref}?error=price_not_set`);
  }

  const label = kind === 'booking' ? 'Booking' : 'Meal plan';
  const productName = `${provider.name} — ${label}`;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const applicationFeeCents = Math.floor((priceCents * APPLICATION_FEE_BASIS_POINTS) / 10000);

  const session = await stripe.checkout.sessions.create({
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
    },
    payment_intent_data: {
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: provider.stripe_account_id },
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        kind,
      },
    },
    success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${backHref}?error=purchase_cancelled`,
  });

  if (!session.url) {
    redirect(`${backHref}?error=checkout_failed`);
  }

  redirect(session.url);
}
