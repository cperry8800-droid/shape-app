// Stripe Customer Portal session for the signed-in user.
//
// The Me page "Manage" / "Update payment method" actions call this to get a
// short-lived portal URL where the user can change their card, view invoices,
// or cancel subscriptions — all UI hosted by Stripe so we never see card data.
//
// Resolves the stripe_customer_id from platform_subscriptions or per-coach
// subscriptions; returns 404 if the user has neither (no Stripe customer yet).
//
// ⚠ A COACH'S PLAN ON THE COACH'S OWN ACCOUNT (direct charges, part B) is managed there: the body's
// `coach: { provider_role, provider_id }` opens the portal on that coach's account, for the member's
// customer on it, with Shape's own configuration (coach-checkout.ts, coachPortalUrl). Without
// `coach`, Shape's own portal opens as before: the membership and any plan from before the move.
// GET lists the member's plans billed on coaches' own accounts, so the app can offer a Manage row
// for each (it has no cookie session for /api/client/team).

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { platformCoachCustomer } from '@/lib/stripe-connect';
import { coachAccountPlan, coachAccountPlans, coachPortalUrl } from '@/lib/coach-checkout';
import { createAdminClient } from '@/lib/supabase/admin';
import { ACTIVE_SUB } from '@/lib/membership-core';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { sameOriginPath } from '@/lib/return-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(req);
  const { plans, error } = await coachAccountPlans(supabase, user.id, ACTIVE_SUB);
  if (error) return dbError(error, 'billing portal coach plans read', 503);
  // The coaches' listing names (public on their profiles), read with the service role.
  const admin = createAdminClient();
  const named = await Promise.all(plans.map(async (p) => {
    const { data } = await admin.from(p.provider_role === 'trainer' ? 'trainers' : 'nutritionists').select('name').eq('id', p.provider_id).maybeSingle();
    return { ...p, name: String((data as { name?: string | null } | null)?.name || '').trim() || null };
  }));
  return NextResponse.json({ plans: named });
}

export async function POST(req: Request) {
  // Accept either the mobile Bearer token or the cookie session.
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(req);

  // Build the return URL from the request origin so dev/staging/prod all work.
  let returnUrl = 'https://www.theshapecommunity.com/m/';
  let coach: { provider_role?: unknown; provider_id?: unknown } | null = null;
  try {
    const url = new URL(req.url);
    const bodyResult = await readJson<{ returnPath?: unknown; coach?: { provider_role?: unknown; provider_id?: unknown } }>(req, { allowEmpty: true });
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.data;
    // L10: a path on this origin, or the app's root; a protocol-relative value is not a path.
    const path = sameOriginPath(body?.returnPath, '/m/');
    returnUrl = `${url.protocol}//${url.host}${path}`;
    coach = body?.coach && typeof body.coach === 'object' ? body.coach : null;
  } catch {
    // Ignore body-parse failures and use the default returnUrl.
  }

  if (coach) {
    const role = coach.provider_role === 'trainer' || coach.provider_role === 'nutritionist' ? coach.provider_role : null;
    const providerId = Number(coach.provider_id);
    if (!role || !Number.isSafeInteger(providerId) || providerId <= 0) {
      return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
    }
    // The member's own plan with this coach billed on the coach's account, read on their own client.
    const { plan, error } = await coachAccountPlan(supabase, user.id, role, providerId, ACTIVE_SUB);
    if (error) return dbError(error, 'billing portal coach plan read', 503);
    if (!plan) {
      return NextResponse.json({ error: 'No plan with this coach is billed on their account.', reason: 'no_coach_plan' }, { status: 404 });
    }
    try {
      const url = await coachPortalUrl(stripe, createAdminClient(), {
        account: plan.stripe_account_id, customer: plan.stripe_customer_id, returnUrl,
      });
      return NextResponse.json({ url });
    } catch (err) {
      return dbError(err, 'stripe coach billing portal', 500, 'Stripe portal session failed.');
    }
  }

  // Find the user's stripe_customer_id from any of the subscription tables.
  const [platform, perCoach] = await Promise.all([
    supabase
      .from('platform_subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle(),
    // A legacy coaching row on Shape's own account only: a direct-charge row's customer is on the
    // coach's account, and this portal opens on Shape's (src/lib/stripe-connect.ts).
    platformCoachCustomer(supabase, user.id),
  ]);

  const customerId =
    platform.data?.stripe_customer_id || perCoach.data?.stripe_customer_id || null;

  if (!customerId) {
    return NextResponse.json(
      { error: 'No active subscription found. Subscribe to the Shape platform to manage billing.' },
      { status: 404 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return dbError(err, 'stripe billing portal', 500, 'Stripe portal session failed.');
  }
}
