import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { hasActiveWaitlistInvite, resolveRequestClient } from '@/lib/waitlist';
import { readJson, dbError } from '@/lib/request-utils';
import { feeSplit, maxCreditCents, bpsToRate, bpsToPercent } from '@/lib/platform-fee';
import { resolveCoachCheckoutOrigin } from '@/lib/coach-origin';

export const runtime = 'nodejs';

type ProviderRole = 'trainer' | 'nutritionist';

type CheckoutBody = {
  item?: {
    type?: string;
    name?: string;
    price?: string | number;
    unit?: string;
  };
  coach?: {
    id?: string | number;
    provider_id?: string | number | null;
    db_id?: string | number | null;
    name?: string;
    role?: string;
    provider_role?: string;
  };
  role?: string;
  ref?: string;
  successPath?: string;
  cancelPath?: string;
};

type ProviderRow = {
  id: number;
  name: string;
  /** The coach account behind this discipline row. Load-bearing: a purchased
   *  plan is bound to it, so the payee and the product cannot be chosen apart. */
  owner_id: string | null;
  price: number | null;
  session_price?: number | null;
  meal_plan_price?: number | null;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  at_capacity: boolean | null;
  capacity_resume_at: string | null;
};

function providerRoleFrom(input?: string): ProviderRole | null {
  const clean = String(input || '').toLowerCase();
  if (clean.includes('nutrition')) return 'nutritionist';
  if (clean.includes('trainer')) return 'trainer';
  return null;
}

function providerIdFrom(coach?: CheckoutBody['coach']): number {
  const raw = coach?.provider_id ?? coach?.db_id ?? coach?.id ?? '';
  const id = Number(String(raw).replace(/^[a-z]/i, ''));
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function priceCentsFrom(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 100);
  const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

export async function POST(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { user, supabase: caller } = auth;

  let body: CheckoutBody = {};
  const bodyResult = await readJson<CheckoutBody>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  body = bodyResult.data;

  const providerRole = providerRoleFrom(body.coach?.provider_role || body.coach?.role || body.role);
  const providerId = providerIdFrom(body.coach);
  if (!providerRole || !providerId) {
    return NextResponse.json(
      { error: 'This provider is not connected to a live Shape provider row yet.' },
      { status: 400 }
    );
  }

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  // owner_id is selected ONLY to bind the purchased plan to this provider below.
  // Without it the payee and the product are two independent caller-supplied
  // values, which is the whole bug this guard closes.
  const selectFields =
    providerRole === 'trainer'
      ? 'id, name, owner_id, price, session_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at'
      : 'id, name, owner_id, price, meal_plan_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at';
  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from(table)
    .select(selectFields)
    .eq('id', providerId)
    .maybeSingle<ProviderRow>();

  if (error) return dbError(error, 'checkout credit lookup', 500);
  if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  // First-dibs: at-capacity coaches are only purchasable with a live waitlist
  // invite. The invite lookup runs through the caller's RLS-scoped client; a
  // lookup failure surfaces as retryable rather than silently denying the bypass.
  if (isEffectivelyAtCapacity(provider)) {
    let invited = false;
    try {
      invited = await hasActiveWaitlistInvite(caller, user.id, providerRole, providerId);
    } catch {
      return NextResponse.json(
        { error: 'Could not verify your waitlist status. Please try again.' },
        { status: 503 }
      );
    }
    if (!invited) {
      return NextResponse.json({ error: 'Provider is currently at capacity.' }, { status: 409 });
    }
  }
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') {
    return NextResponse.json({ error: 'Provider has not completed Stripe onboarding.' }, { status: 409 });
  }

  // BYO commission split: resolve WHY this checkout exists (marketplace vs a
  // client the coach brought) → the resolved fee. feeBps is THE single fee value;
  // nothing downstream re-derives from `origin`. Runs entirely on the CALLER's
  // RLS client (the auth.uid()-scoped RPC). Fail-closed to marketplace / 1500.
  const { origin: coachOrigin, feeBps, referralId } = await resolveCoachCheckoutOrigin({
    caller,
    providerRole,
    providerId,
    ref: body.ref,
  });
  const feeRate = bpsToRate(feeBps);

  const isSubscription = String(body.item?.type || '').toLowerCase() === 'subscription';
  const itemName = body.item?.name || (isSubscription ? 'Monthly coaching' : 'One-time purchase');
  const fallbackOneTimePrice =
    providerRole === 'trainer'
      ? provider.session_price ?? provider.price
      : provider.meal_plan_price ?? provider.price;
  // SECURITY: the one-time price is ALWAYS server-authoritative — never
  // body.item.price (a client could otherwise name their own amount and pay $1
  // for a $180 session/plan; the platform fee is derived from it too). A plan
  // purchase prices from the coach_plans row by planId; a session / meal-plan
  // prices from the provider row.
  let oneTimeCents = Math.round(Number(fallbackOneTimePrice || 0) * 100);
  const planId =
    body.item && (body.item as { planId?: unknown }).planId != null
      ? String((body.item as { planId?: unknown }).planId).trim()
      : '';
  if (!isSubscription && planId) {
    if (!/^[0-9a-f-]{36}$/i.test(planId)) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }
    // ⚠ THE PLAN MUST BELONG TO THE COACH BEING PAID.
    //
    // `item.planId` and `coach.provider_id` arrive as two INDEPENDENT
    // caller-supplied values: the first picks the priced product, the second
    // picks the payout destination (`transfer_data.destination`), the capacity
    // gate, and the BYO fee resolution. Looking the plan up by id alone let a
    // caller pair coach B's published plan with coach A's provider row — Stripe
    // charged B's price, A's connected account received the transfer, the
    // webhook wrote `one_time_purchases { provider_id: A, plan_id: B }`, and
    // `get_my_purchased_plans()` (which joins on plan_id alone) unlocked B's
    // `detail` to the buyer. B is paid nothing for their own content.
    //
    // Three more consequences rode on the same request: the platform fee was
    // resolved against A (a BYO referral to A zeroes `application_fee_amount`,
    // so Shape earned nothing on B's sale), B's at-capacity gate was bypassed
    // because capacity was checked on A, and the store-credit kind was taken
    // from A's named role rather than the product's discipline.
    //
    // Binding on owner_id, not provider_id, is deliberate: one owner may hold
    // both a trainer and a nutritionist row, and a plan is authored by the
    // OWNER (`coach_plans.owner_id`), not by a discipline row.
    //
    // ⚠ WHICH IS EXACTLY WHY OWNERSHIP ALONE IS NOT ENOUGH. For a dual-role
    // owner, owner_id matches through BOTH of their rows, so a buyer could pair
    // that owner's meal_plan with their trainer row (or a program with the
    // nutritionist row) and still pass. Everything downstream keys off the
    // caller-chosen `providerRole`, so all of it would come from the wrong
    // discipline: `storeCreditKind` (a nutrition credit paying for a training
    // program), the capacity gate, `transfer_data.destination`, the BYO fee
    // resolution, and the `provider_role` the webhook records on the purchase.
    //
    // The database already declares the mapping — twice, identically:
    //   case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end
    // (2026-06-14-market-plans.sql:27, 2026-06-08-coach-sale-plans-by-user.sql:21)
    // so a request whose role disagrees with the plan's kind contradicts the
    // server's own definition of where that plan is sold. `kind` is a two-value
    // check constraint ('program' | 'meal_plan'), so the mapping is total.
    const { data: plan, error: planErr } = await admin
      .from('coach_plans')
      .select('price, published, owner_id, kind')
      .eq('id', planId)
      .maybeSingle<{ price: string | null; published: boolean; owner_id: string | null; kind: string | null }>();
    if (planErr) return dbError(planErr, 'checkout plan lookup', 500);
    if (!plan || plan.published !== true) {
      return NextResponse.json({ error: 'This plan is not available for purchase.' }, { status: 404 });
    }
    if (!plan.owner_id || !provider.owner_id || plan.owner_id !== provider.owner_id) {
      // Same 404 copy as an unpublished plan: a buyer has no business learning
      // whether some other coach's plan id exists.
      return NextResponse.json({ error: 'This plan is not available for purchase.' }, { status: 404 });
    }
    const planRole = plan.kind === 'meal_plan' ? 'nutritionist' : 'trainer';
    if (planRole !== providerRole) {
      return NextResponse.json({ error: 'This plan is not available for purchase.' }, { status: 404 });
    }
    oneTimeCents = priceCentsFrom(plan.price);
    if (!oneTimeCents) return NextResponse.json({ error: 'This plan has no price set.' }, { status: 400 });
  }
  const priceCents = isSubscription
    ? Math.round(Number(provider.price || 0) * 100)
    : oneTimeCents;
  if (!priceCents) return NextResponse.json({ error: 'Price is not configured.' }, { status: 400 });

  // Store-credit wallet auto-applies to one-time coach purchases: a redeemed
  // session credit covers a trainer booking, a nutrition credit covers a meal
  // plan. We read the balance now to discount the charge, and commit the spend
  // in the webhook on a completed payment (so abandoned checkouts don't burn
  // credit). At least $0.50 always remains payable so the charge is valid.
  let chargeCents = priceCents;
  let storeCreditApplied = 0;
  const storeCreditKind = isSubscription ? null : providerRole === 'trainer' ? 'session' : 'nutrition';
  if (storeCreditKind && priceCents > 50) {
    try {
      const { data: wallet } = await admin.rpc('get_store_credit_for', { p_user_id: user.id });
      const available = Number((wallet as Record<string, unknown> | null)?.[storeCreditKind] ?? 0);
      if (Number.isFinite(available) && available > 0) {
        // Cap redemption at Shape's cut so the charge always covers the coach's
        // payout. Shape absorbs the credit out of its own fee (never out of
        // pocket). At the BYO rate (0) the cap is 0 — there is no Shape fee to
        // absorb credit from, so store credit does not apply, by the math.
        const maxRedeemable = Math.min(priceCents - 50, maxCreditCents(priceCents, feeRate));
        storeCreditApplied = Math.max(0, Math.min(Math.floor(available), maxRedeemable));
        chargeCents = priceCents - storeCreditApplied;
      }
    } catch {
      // Wallet read failed — proceed at full price (credit stays in the wallet).
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const successPath = body.successPath || '/purchase/success';
  const cancelPath = body.cancelPath || '/newdesign/GetApp.html?checkout=cancelled';
  // Shape absorbs redeemed store credit: the coach is paid 85% of the GROSS
  // price, so the fee is what's left of the (credit-capped) charge after the
  // coach's cut. Because credit is capped at Shape's 15% above, the charge
  // always covers the coach's cut — no out-of-pocket top-up is ever needed.
  const { applicationFeeCents } = feeSplit(priceCents, chargeCents, feeRate);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: chargeCents,
            product_data: {
              name: storeCreditApplied > 0 ? `${provider.name} - ${itemName} (−$${(storeCreditApplied / 100).toFixed(2)} Shape credit)` : `${provider.name} - ${itemName}`,
              metadata: {
                provider_id: String(providerId),
                provider_role: providerRole,
              },
            },
            ...(isSubscription ? { recurring: { interval: 'month' as const } } : {}),
          },
          quantity: 1,
        },
      ],
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        price_cents: String(chargeCents),
        gross_price_cents: String(priceCents),
        kind: isSubscription ? 'subscription' : providerRole === 'nutritionist' ? 'meal_plan' : 'booking',
        item_name: String(itemName),
        origin: coachOrigin,
        fee_bps: String(feeBps),
        ...(referralId ? { referral_id: referralId } : {}),
        ...(storeCreditApplied > 0 ? { store_credit_kind: String(storeCreditKind), store_credit_cents: String(storeCreditApplied) } : {}),
        ...(body.item && (body.item as { planId?: unknown }).planId ? { plan_id: String((body.item as { planId?: unknown }).planId) } : {}),
      },
      ...(isSubscription
        ? {
            subscription_data: {
              // Stripe requires the application fee to be positive-or-absent: a
              // 0% (BYO) fee OMITS the field, so the full charge transfers to the
              // coach and Shape absorbs Stripe's processing cost (the spec's
              // deliberate launch-phase subsidy).
              ...(feeBps > 0 ? { application_fee_percent: bpsToPercent(feeBps) } : {}),
              transfer_data: { destination: provider.stripe_account_id as string },
              metadata: {
                client_id: user.id,
                provider_id: String(providerId),
                provider_role: providerRole,
              },
            },
          }
        : {
            payment_intent_data: {
              // Positive-or-absent (also covers the max-store-credit case, where
              // the fee legitimately computes to 0 at the standard rate).
              ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
              transfer_data: { destination: provider.stripe_account_id as string },
              metadata: {
                client_id: user.id,
                provider_id: String(providerId),
                provider_role: providerRole,
              },
            },
          }),
      success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      allow_promotion_codes: isSubscription,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 });
    }
    return NextResponse.json({ url: session.url, creditAppliedCents: storeCreditApplied });
  } catch (err) {
    return dbError(err, 'mobile checkout-session', 500, 'Could not start checkout.');
  }
}
