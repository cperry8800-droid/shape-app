// Stripe Customer Portal session for the signed-in user.
//
// The Me page "Manage" / "Update payment method" actions call this to get a
// short-lived portal URL where the user can change their card, view invoices,
// or cancel subscriptions — all UI hosted by Stripe so we never see card data.
//
// Resolves the stripe_customer_id from platform_subscriptions or per-coach
// subscriptions; returns 404 if the user has neither (no Stripe customer yet).

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Accept either the mobile Bearer token or the cookie session.
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(req);

  // Find the user's stripe_customer_id from any of the subscription tables.
  const [platform, perCoach] = await Promise.all([
    supabase
      .from('platform_subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle(),
  ]);

  const customerId =
    platform.data?.stripe_customer_id || perCoach.data?.stripe_customer_id || null;

  if (!customerId) {
    return NextResponse.json(
      { error: 'No active subscription found. Subscribe to the Shape platform to manage billing.' },
      { status: 404 }
    );
  }

  // Build the return URL from the request origin so dev/staging/prod all work.
  let returnUrl = 'https://www.theshapecommunity.com/m/';
  try {
    const url = new URL(req.url);
    const bodyResult = await readJson<{ returnPath?: unknown }>(req, { allowEmpty: true });
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    const path = typeof body?.returnPath === 'string' ? body.returnPath : '/m/';
    returnUrl = `${url.protocol}//${url.host}${path}`;
  } catch {
    // Ignore body-parse failures and use the default returnUrl.
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe portal session failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
