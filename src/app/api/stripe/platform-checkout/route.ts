// Platform checkout — creates a Stripe Checkout Session for the $5/mo Shape
// Platform membership (the public "pricing" tier, distinct from the per-trainer
// and per-nutritionist subscriptions handled by /subscribe).
//
// Flow:
//   Pricing / the dashboard's join panel / a coach's profile → POST /api/stripe/platform-checkout
//   → Stripe-hosted checkout
//   → /api/stripe/platform-return confirms the session and continues to `returnTo`
//
// Auth: accepts a Supabase Bearer token (the app) or the site's cookie session. If the
// caller isn't signed in the API returns 401 with a redirect hint to the website's
// sign-up (the Pricing page sends a signed-out visitor to Landing on its own).
//
// Pricing: we use the STRIPE_PLATFORM_PRICE_ID env var. This should be set to
// a recurring $5/month price you've created in the Stripe dashboard for the
// "Shape Platform" product.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership } from '@/lib/membership-core';
import { createPlatformCheckout, MEMBERSHIP_HOME } from '@/lib/platform-membership';
import { hasLiveStripeSubscription } from '@/lib/stripe-live-subscription';
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { sameOriginPath } from '@/lib/return-path';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';

// `returnTo` is where the member goes once the membership is confirmed. `successPath` is its
// older name, still sent by app builds already installed.
type Body = { returnTo?: string; successPath?: string; cancelPath?: string };

export async function POST(request: Request) {
  const priceId = process.env.STRIPE_PLATFORM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: 'Platform price is not configured. Set STRIPE_PLATFORM_PRICE_ID.' },
      { status: 500 }
    );
  }

  const bodyResult = await readJson<Body>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body: Body = bodyResult.data || {};

  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Not signed in.', redirectTo: '/newdesign/SignupClient.html' },
      { status: 401 }
    );
  }

  let customerId: string;
  // ⚠ A MEMBER COULD BUY A SECOND MEMBERSHIP. Nothing here looked for the first, so every press
  // of Join made a new $5 subscription. An approved coach or an admin is a member already and
  // has nothing to buy. Fail closed: no checkout opens on an answer we could not read.
  try {
    const client = await clientForRequest(request);
    const m = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true });
    if (m.isKnownMinor) {
      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });
    }
    // Our row arrives with the webhook (or platform-return); Stripe has it the moment it is paid.
    // The account's own customer is where it lands (stripe-customer.ts).
    customerId = await stripeCustomerFor(user.id, user.email ?? null);
    if (m.isMember || await hasLiveStripeSubscription({ customerId, email: user.email ?? null }, { client_id: user.id, plan: 'shape_platform' })) {
      return NextResponse.json({ error: "You're already a Shape member.", code: 'already_member' }, { status: 409 });
    }
  } catch (err) {
    console.error('[shape-app] platform-checkout membership read failed', err);
    return NextResponse.json({ error: 'Could not check your membership. Try again in a moment.' }, { status: 503 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  // L10: paths on this origin only; anything else is the default.
  const next = sameOriginPath(body.returnTo ?? body.successPath, MEMBERSHIP_HOME);
  const cancelPath = sameOriginPath(body.cancelPath, '/newdesign/Pricing.html?error=subscribe_cancelled');

  try {
    const url = await createPlatformCheckout({ priceId, userId: user.id, customerId, origin, next, cancelPath });
    if (!url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 });
    }
    try { const supabaseTrack = await createClient(); await supabaseTrack.rpc('track_event', { p_event: 'checkout_started', p_props: { kind: 'platform' } }); } catch {}
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[shape-app] platform-checkout error', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
