// Stripe sends the provider here if their onboarding link expires before they
// finish. We generate a fresh AccountLink and redirect them back to Stripe.

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerRole = url.searchParams.get('role');
  const providerId = Number(url.searchParams.get('id'));
  if (!['trainer', 'nutritionist'].includes(providerRole ?? '') || !providerId) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_onboarding', request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();
  const { data: provider } = await admin
    .from(table)
    .select('id, owner_id, stripe_account_id, stripe_account_status')
    .eq('id', providerId)
    .maybeSingle();

  if (!provider || provider.owner_id !== user.id || !provider.stripe_account_id) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_onboarding', request.url));
  }
  // A disconnected account no longer lets Shape in, so a link for it would fail: the coach starts
  // again from Connect Stripe, which makes them a new account (connect-account, connect/onboard).
  if ((provider as { stripe_account_status?: string | null }).stripe_account_status === 'disconnected') {
    return NextResponse.redirect(new URL('/dashboard?error=stripe_disconnected', request.url));
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const link = await stripe.accountLinks.create({
    account: provider.stripe_account_id,
    refresh_url: `${origin}/api/stripe/connect/refresh?role=${providerRole}&id=${providerId}`,
    return_url: `${origin}/stripe-onboarding/success?role=${providerRole}&id=${providerId}`,
    type: 'account_onboarding',
  });

  return NextResponse.redirect(link.url);
}
