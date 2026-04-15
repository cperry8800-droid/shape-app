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

type ProviderRole = 'trainer' | 'nutritionist';

async function getOrCreateStripePriceId(
  providerRole: ProviderRole,
  providerId: number
): Promise<{ priceId: string; priceCents: number } | { error: string }> {
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';

  // Use admin client so we can both read AND write the cached Stripe IDs
  // (the public-read RLS policy doesn't allow updates from unauthenticated
  // or even authenticated users, only the webhook path).
  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from(table)
    .select('id, name, price, stripe_product_id, stripe_price_id')
    .eq('id', providerId)
    .maybeSingle();

  if (error || !provider) return { error: 'Provider not found.' };
  if (!provider.price || provider.price <= 0) return { error: 'Provider has no price set.' };

  const priceCents = Math.round(Number(provider.price) * 100);

  if (provider.stripe_price_id) {
    return { priceId: provider.stripe_price_id, priceCents };
  }

  // Create product (or reuse if we have a product_id but no price_id).
  let productId = provider.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({
      name: `${provider.name} — ${providerRole} subscription`,
      metadata: { provider_id: String(provider.id), provider_role: providerRole },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: priceCents,
    recurring: { interval: 'month' },
    metadata: { provider_id: String(provider.id), provider_role: providerRole },
  });

  await admin
    .from(table)
    .update({ stripe_product_id: productId, stripe_price_id: price.id })
    .eq('id', provider.id);

  return { priceId: price.id, priceCents };
}

export async function startCheckout(formData: FormData): Promise<void> {
  const providerRole = String(formData.get('provider_role') ?? '') as ProviderRole;
  const providerId = Number(formData.get('provider_id') ?? 0);

  if (!['trainer', 'nutritionist'].includes(providerRole) || !providerId) {
    redirect('/?error=invalid_subscribe');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const backHref =
    providerRole === 'trainer' ? `/trainers/${providerId}` : `/nutritionists/${providerId}`;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(backHref)}`);
  }

  const priceResult = await getOrCreateStripePriceId(providerRole, providerId);
  if ('error' in priceResult) {
    redirect(`${backHref}?error=${encodeURIComponent(priceResult.error)}`);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceResult.priceId, quantity: 1 }],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    metadata: {
      client_id: user.id,
      provider_id: String(providerId),
      provider_role: providerRole,
      price_cents: String(priceResult.priceCents),
    },
    subscription_data: {
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
      },
    },
    success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${backHref}?error=subscribe_cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    redirect(`${backHref}?error=checkout_failed`);
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
  redirect('/dashboard/client?notice=cancel_scheduled');
}
