import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { hasActiveWaitlistInvite } from '@/lib/waitlist';
import { readJson, dbError } from '@/lib/request-utils';
import { feeSplit, maxCreditCents } from '@/lib/platform-fee';

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
  successPath?: string;
  cancelPath?: string;
};

type ProviderRow = {
  id: number;
  name: string;
  price: number | null;
  session_price?: number | null;
  meal_plan_price?: number | null;
  stripe_account_id: string | null;
  stripe_account_status: string | null;
  at_capacity: boolean | null;
  capacity_resume_at: string | null;
};

async function resolveUser(request: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;
    const token = bearerMatch[1];
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

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
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

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
  const selectFields =
    providerRole === 'trainer'
      ? 'id, name, price, session_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at'
      : 'id, name, price, meal_plan_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at';
  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from(table)
    .select(selectFields)
    .eq('id', providerId)
    .maybeSingle<ProviderRow>();

  if (error) return dbError(error, 'checkout credit lookup', 500);
  if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  if (
    isEffectivelyAtCapacity(provider) &&
    !(await hasActiveWaitlistInvite(admin, user.id, providerRole, providerId))
  ) {
    return NextResponse.json({ error: 'Provider is currently at capacity.' }, { status: 409 });
  }
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') {
    return NextResponse.json({ error: 'Provider has not completed Stripe onboarding.' }, { status: 409 });
  }

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
    const { data: plan, error: planErr } = await admin
      .from('coach_plans')
      .select('price, published')
      .eq('id', planId)
      .maybeSingle<{ price: string | null; published: boolean }>();
    if (planErr) return dbError(planErr, 'checkout plan lookup', 500);
    if (!plan || plan.published !== true) {
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
        // Cap redemption at Shape's 15% cut so the charge always covers the
        // coach's 85%-of-gross payout. Shape absorbs the credit out of its own
        // fee (never out of pocket), and any excess credit stays in the wallet
        // for next time — keeps the coach whole with no separate top-up transfer.
        const maxRedeemable = Math.min(priceCents - 50, maxCreditCents(priceCents));
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
  const { applicationFeeCents } = feeSplit(priceCents, chargeCents);

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
        ...(storeCreditApplied > 0 ? { store_credit_kind: String(storeCreditKind), store_credit_cents: String(storeCreditApplied) } : {}),
        ...(body.item && (body.item as { planId?: unknown }).planId ? { plan_id: String((body.item as { planId?: unknown }).planId) } : {}),
      },
      ...(isSubscription
        ? {
            subscription_data: {
              application_fee_percent: 15,
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
              application_fee_amount: applicationFeeCents,
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
