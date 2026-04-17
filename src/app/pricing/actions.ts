'use server';

// Shape Platform checkout — creates a Stripe Checkout Session for the
// $5/mo membership tier. Invoked from the "Get Started" button on the
// /pricing page. Logged-out users get bounced to /signup?next=/pricing
// so they can create an account first.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export async function startPlatformCheckout(): Promise<void> {
  const priceId = process.env.STRIPE_PLATFORM_PRICE_ID;
  if (!priceId) {
    redirect('/pricing?error=price_not_configured');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/signup?next=/pricing');
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    metadata: {
      client_id: user.id,
      plan: 'shape_platform',
    },
    subscription_data: {
      metadata: {
        client_id: user.id,
        plan: 'shape_platform',
      },
    },
    success_url: `${origin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?error=subscribe_cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    redirect('/pricing?error=checkout_failed');
  }

  redirect(session.url);
}
