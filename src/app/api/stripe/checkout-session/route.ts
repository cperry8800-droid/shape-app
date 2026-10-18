import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { hasActiveWaitlistInvite, isActiveClientOf, resolveRequestClient } from '@/lib/waitlist';
import { hiresCoach, hasCompletedScreening, SCREENING_REQUIRED } from '@/lib/health-screening';
import { readJson, dbError } from '@/lib/request-utils';
import { feeSplit, maxCreditCents, bpsToRate, bpsToPercent } from '@/lib/platform-fee';
import { resolveCoachCheckoutOrigin } from '@/lib/coach-origin';
import { appendParam, sameOriginPath } from '@/lib/return-path';
import { ACTIVE_SUB, computeMembership } from '@/lib/membership-core';
import { hasLiveStripeSubscription } from '@/lib/stripe-live-subscription';
import { stripeCustomerFor } from '@/lib/stripe-customer';
import { connectedCustomerFor } from '@/lib/stripe-connect';
import { CODE_MESSAGES, afterCode, coachNotPayable, directChargesReady, normalizeCode, recordCoachCheckout, resolveCheckoutCode, type CheckoutCode } from '@/lib/coach-checkout';
import { CHECKOUT_CREATE_OPTIONS, checkoutReturnsKey, claimCheckout, currentCheckout, isCheckoutInProgress, type CheckoutClaim } from '@/lib/checkout-barrier';

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
  /** The code box: a Shape code or the coach's own (coach-checkout.ts). */
  code?: string;
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
  suspended_at: string | null;
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

  // ⚠ COACHING NEEDS AN ACTIVE SHAPE MEMBERSHIP (owner, 2026-10-14: "need to be an active member
  // to access platform"). This route never asked, so a signed-in non-member could pay a coach and
  // then be refused messages, the plan and the dashboard by the membership gate. The refusal
  // carries the same code the gate uses, so a caller sends the member to the $5 checkout first.
  // Fail closed: no payment starts on a membership we could not read.
  try {
    const m = await computeMembership(caller, user.id, user.email ?? null, { emailConfirmed: user.emailConfirmed === true, strict: true });
    if (m.isKnownMinor) {
      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });
    }
    if (!m.isMember) {
      return NextResponse.json({ error: 'Shape membership required.', code: 'membership_required' }, { status: 402 });
    }
  } catch (err) {
    console.error('[shape-app] checkout membership read failed', err);
    return NextResponse.json({ error: 'Could not check your membership. Try again in a moment.' }, { status: 503 });
  }

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
      ? 'id, name, owner_id, price, session_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at, suspended_at'
      : 'id, name, owner_id, price, meal_plan_price, stripe_account_id, stripe_account_status, at_capacity, capacity_resume_at, suspended_at';
  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from(table)
    .select(selectFields)
    .eq('id', providerId)
    .maybeSingle<ProviderRow>();

  if (error) return dbError(error, 'checkout credit lookup', 500);
  if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  // ⚠ A SUSPENDED LISTING TAKES NO PAYMENT (client-onboarding review, fix 3c: M8). Suspension
  // (#2326) took the listing off the marketplace, and its profile, an old link or the app could
  // still pay it. `reason` is the flag a caller reads, as `at_capacity` below.
  if (provider.suspended_at) {
    return NextResponse.json({ error: "This coach isn't taking payments right now.", reason: 'suspended' }, { status: 409 });
  }
  const isSubscription = String(body.item?.type || '').toLowerCase() === 'subscription';
  // First-dibs: at-capacity coaches are only purchasable with a live waitlist
  // invite. The invite lookup runs through the caller's RLS-scoped client; a
  // lookup failure surfaces as retryable rather than silently denying the bypass.
  // ⚠ AT CAPACITY MEANS NO NEW CLIENTS, NOT NO SALES (task #10; owner, 2026-10-15). A member who
  // already subscribes to this coach can still buy their sessions and plans; a subscription, or a
  // purchase from someone who is not yet a client, still needs the invite.
  if (isEffectivelyAtCapacity(provider)) {
    let invited = false;
    try {
      invited = await hasActiveWaitlistInvite(caller, user.id, providerRole, providerId)
        || (!isSubscription && await isActiveClientOf(caller, user.id, providerRole, providerId));
    } catch {
      return NextResponse.json(
        { error: 'Could not verify your waitlist status. Please try again.' },
        { status: 503 }
      );
    }
    if (!invited) {
      // `reason` is a FLAG, not prose. Two different 409s leave this route — this one
      // and "has not completed Stripe onboarding" — and the only thing separating them
      // for a caller was the sentence. A website that sniffed /capacity/i would make
      // the copy part of the contract, which is the defect this repo already
      // post-mortems (an /account/i sniff matching "Your account is over its usage
      // limits"). Additive: every existing caller reads `error` and is unaffected.
      return NextResponse.json(
        { error: 'Provider is currently at capacity.', reason: 'at_capacity' },
        { status: 409 }
      );
    }
  }
  // ⚠ A COACH WHO HAS NOT CONNECTED, OR HAS DISCONNECTED, TAKES NO PAYMENT (coach-checkout.ts).
  const notPayable = coachNotPayable(provider);
  if (notPayable) {
    return NextResponse.json({
      error: notPayable === 'coach_disconnected' ? "This coach isn't taking payments right now." : 'Provider has not completed Stripe onboarding.',
      reason: notPayable,
    }, { status: 409 });
  }
  const account = provider.stripe_account_id as string;
  // Direct charges (part B): the checkout is made ON the coach's account, so Stripe's fee comes out
  // of the coach's share and Shape takes only its application fee. Without both Connect variables
  // the webhook could record none of it, so the checkout stays a destination charge.
  const direct = directChargesReady();
  if (!direct) console.warn('[shape-app] Connect variables unset: coach checkout made as a destination charge on Shape\'s account');
  const typedCode = normalizeCode(body.code);
  if (typedCode === 'invalid' || (typedCode && !direct)) {
    const reason = typedCode === 'invalid' ? 'code_invalid' : 'code_not_here';
    return NextResponse.json({ error: CODE_MESSAGES[reason], reason }, { status: 400 });
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

  // ⚠ HIRING A COACH NEEDS THE HEALTH SCREENING (client-onboarding review, fix 2b; owner decision
  // 2). Only a member who wants coaching is screened at first run, so one who said no is screened
  // here, before paying: a subscription, or a session with a trainer (health-screening.ts). A
  // program or a meal plan is a product. Read on the caller's own client; a failed read refuses.
  const buysProduct = body.item != null && (body.item as { planId?: unknown }).planId != null
    && String((body.item as { planId?: unknown }).planId).trim() !== '';
  if (hiresCoach({ subscription: isSubscription, providerRole, product: buysProduct })) {
    let screened: boolean;
    try {
      screened = await hasCompletedScreening(caller, user.id);
    } catch (err) {
      console.error('[shape-app] checkout health screening read failed', err);
      return NextResponse.json({ error: 'Could not check your health screening. Try again in a moment.' }, { status: 503 });
    }
    if (!screened) return NextResponse.json(SCREENING_REQUIRED, { status: 409 });
  }
  // The account's own Stripe customer (stripe-customer.ts): the purchase lands on it, and the
  // duplicate check below can ask Stripe about it whether or not the account has an email.
  let customerId: string;
  try {
    customerId = await stripeCustomerFor(user.id, user.email ?? null);
  } catch (err) {
    console.error('[shape-app] checkout Stripe customer failed', err);
    return NextResponse.json({ error: 'Could not start checkout. Try again in a moment.' }, { status: 503 });
  }
  // On the coach's account the member pays as their customer THERE (stripe_connected_customers),
  // never as their platform customer, which that account has never heard of.
  let coachCustomerId: string | null = null;
  if (direct) {
    try {
      coachCustomerId = await connectedCustomerFor(stripe, admin, { userId: user.id, account, email: user.email ?? null });
    } catch (err) {
      console.error('[shape-app] checkout customer on the coach account failed', err);
      return NextResponse.json({ error: 'Could not start checkout. Try again in a moment.' }, { status: 503 });
    }
  }
  // ⚠ A SECOND SUBSCRIPTION TO THE SAME COACH WAS ONE PRESS AWAY. A member back from Stripe
  // before the webhook landed still saw Subscribe, and paying again made two monthly charges.
  // Read here on the caller's own client ("clients read own subscriptions"), and at Stripe under
  // the checkout claim below; a failed read refuses.
  const alreadySubscribed = () => NextResponse.json(
    { error: "You're already subscribed to this coach.", reason: 'already_subscribed' },
    { status: 409 }
  );
  if (isSubscription) {
    const { data: existing, error: existingErr } = await caller
      .from('subscriptions')
      .select('status')
      .eq('client_id', user.id)
      .eq('provider_id', providerId)
      .eq('provider_role', providerRole);
    if (existingErr) return dbError(existingErr, 'checkout existing subscription lookup', 503);
    if ((existing ?? []).some((row: { status?: unknown }) => ACTIVE_SUB.has(String(row.status)))) return alreadySubscribed();
  }
  let itemName = body.item?.name || (isSubscription ? 'Monthly coaching' : 'One-time purchase');
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
  // What the sale is, as the purchase records it. ⚠ A PROGRAM WAS RECORDED AS A BOOKING (fix 3c:
  // M10): this read the role alone, so a trainer's program counted as a paid session wherever a
  // booking means one (a coaching client, a thread, a session to schedule). With a plan, the plan
  // says; without one, a trainer's sale is a session and a nutritionist's a meal plan.
  let purchaseKind: 'booking' | 'meal_plan' | 'program' = providerRole === 'nutritionist' ? 'meal_plan' : 'booking';
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
      .select('price, published, owner_id, kind, name')
      .eq('id', planId)
      .maybeSingle<{ price: string | null; published: boolean; owner_id: string | null; kind: string | null; name: string | null }>();
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
    // The plan's own name, not the caller's (Fable on #2373): item.name rode into the Stripe line item
    // and the coach's "bought <item>" notice as whatever the request said.
    if (typeof plan.name === 'string' && plan.name.trim()) itemName = plan.name.trim().slice(0, 120);
    purchaseKind = plan.kind === 'meal_plan' ? 'meal_plan' : 'program';
    oneTimeCents = priceCentsFrom(plan.price);
    if (!oneTimeCents) return NextResponse.json({ error: 'This plan has no price set.' }, { status: 400 });
  }
  const priceCents = isSubscription
    ? Math.round(Number(provider.price || 0) * 100)
    : oneTimeCents;
  if (!priceCents) return NextResponse.json({ error: 'Price is not configured.' }, { status: 400 });

  // The code box (coach-checkout.ts): a Shape code, mirrored onto the coach's account, or the
  // coach's own. Shape takes its rate of the price after the code (owner, 2026-10-18).
  let checkoutCode: CheckoutCode | null = null;
  if (typedCode) {
    try {
      const found = await resolveCheckoutCode(stripe, {
        code: typedCode, account, listCents: priceCents, mode: isSubscription ? 'subscription' : 'payment', platformCustomerId: customerId, coachCustomerId,
      });
      if (!found.ok) return NextResponse.json({ error: CODE_MESSAGES[found.reason], reason: found.reason }, { status: 400 });
      checkoutCode = found.code;
    } catch (err) {
      console.error('[shape-app] checkout code lookup failed', err);
      return NextResponse.json({ error: 'Could not check that code. Try again in a moment.' }, { status: 503 });
    }
  }
  const pricedCents = afterCode(priceCents, checkoutCode);

  // Store-credit wallet auto-applies to one-time coach purchases: a redeemed
  // session credit covers a trainer booking, a nutrition credit covers a meal
  // plan. We read the balance now to discount the charge, and commit the spend
  // in the webhook on a completed payment (so abandoned checkouts don't burn
  // credit). At least $0.50 always remains payable so the charge is valid.
  // ⚠ A CODE AND STORE CREDIT DO NOT STACK: the code is a Stripe discount on the list price, and
  // the credit is taken off the price Shape sends, so with both the fee would be split on a price
  // Stripe never charged. A member who types a code keeps their credit for the next checkout.
  let chargeCents = pricedCents;
  let storeCreditApplied = 0;
  let storeCreditRef: string | null = null;
  const storeCreditKind = isSubscription || checkoutCode ? null : providerRole === 'trainer' ? 'session' : 'nutrition';
  if (storeCreditKind && priceCents > 50) {
    try {
      // H5 (2026-10-08 review): a reservation whose `checkout.session.expired` never arrived
      // would hold this member's credit for good; reserve_store_credit releases this member's
      // stale ones itself, and this read-side sweep makes the balance read below see them gone
      // too. Best-effort: on a database without the function the read is simply unswept.
      await admin.rpc('sweep_store_credit_reservations', { p_user_id: user.id, p_older_than: '48 hours' }).then(() => undefined, () => undefined);
      const { data: wallet } = await admin.rpc('get_store_credit_for', { p_user_id: user.id });
      const available = Number((wallet as Record<string, unknown> | null)?.[storeCreditKind] ?? 0);
      if (Number.isFinite(available) && available > 0) {
        // Cap redemption at Shape's cut so the charge always covers the coach's
        // payout. Shape absorbs the credit out of its own fee (never out of
        // pocket). At the BYO rate (0) the cap is 0 — there is no Shape fee to
        // absorb credit from, so store credit does not apply, by the math.
        const maxRedeemable = Math.min(priceCents - 50, maxCreditCents(priceCents, feeRate));
        storeCreditApplied = Math.max(0, Math.min(Math.floor(available), maxRedeemable));
      }
      // ⚠ H5 (2026-10-08 review): THE CREDIT IS RESERVED NOW, NOT MERELY READ. Reading the
      // balance and lowering the charge let five checkouts opened against one $25 credit each
      // charge $25 less, with the webhook able to debit only the first; the rest came out of
      // Shape's fee. reserve_store_credit writes a negative `reservation` row under the member's
      // wallet lock, so the next checkout sees that credit gone. The webhook converts the
      // reservation into the checkout debit on completion and releases it on expiry; the
      // reservation ref rides in the session metadata so the webhook can name it.
      //
      // What the wallet did NOT give up is NOT discounted: a short or failed reservation (a
      // concurrent checkout got there first, or a database without the function yet) charges
      // the full price less exactly what was reserved, never less what was read.
      if (storeCreditApplied > 0) {
        const ref = crypto.randomUUID();
        const { data: reserved, error: reserveErr } = await admin.rpc('reserve_store_credit', {
          p_user_id: user.id, p_kind: storeCreditKind, p_ref: ref, p_amount_cents: storeCreditApplied,
        });
        const got = reserveErr ? 0 : Math.max(0, Math.min(storeCreditApplied, Math.floor(Number(reserved ?? 0)) || 0));
        if (reserveErr) console.warn('[shape-app] store credit reservation failed; charging full price:', reserveErr.message);
        storeCreditApplied = got;
        storeCreditRef = got > 0 ? ref : null;
      }
      chargeCents = priceCents - storeCreditApplied;
    } catch {
      // Wallet read failed — proceed at full price (credit stays in the wallet).
      storeCreditApplied = 0;
      storeCreditRef = null;
      chargeCents = priceCents;
    }
  }
  // A reservation behind a session Stripe never created must not hold the member's credit
  // for 48 hours: hand it back the moment the session fails to exist.
  const releaseReservation = async () => {
    if (!storeCreditRef) return;
    const ref = storeCreditRef;
    storeCreditRef = null;
    await admin.rpc('release_store_credit_reservation', { p_ref: ref }).then(
      ({ error }) => { if (error) console.error('[shape-app] store credit reservation release failed', { ref, error: error.message }); },
      (e: unknown) => console.error('[shape-app] store credit reservation release failed', { ref, error: String(e) })
    );
  };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  // L10: a path, on this origin, or the default. `//evil.example` used to be concatenated as is.
  const successPath = sameOriginPath(body.successPath, '/purchase/success');
  const cancelPath = sameOriginPath(body.cancelPath, '/newdesign/GetApp.html?checkout=cancelled');
  // Shape absorbs redeemed store credit: the coach is paid 85% of the GROSS
  // price, so the fee is what's left of the (credit-capped) charge after the
  // coach's cut. Because credit is capped at Shape's 15% above, the charge
  // always covers the coach's cut — no out-of-pocket top-up is ever needed.
  // With a code, the coach's cut is of the price after it (the owner's split); otherwise of the list
  // price, with any store credit taken out of Shape's fee.
  const { applicationFeeCents } = feeSplit(pricedCents, chargeCents, feeRate);
  // A direct charge's return page reads the checkout on the coach's account (checkout-return.ts).
  const successPathWithId = appendParam(successPath, 'session_id', '{CHECKOUT_SESSION_ID}');
  const successUrl = `${origin}${direct ? appendParam(successPathWithId, 'acct', account) : successPathWithId}`;
  const cancelUrl = `${origin}${cancelPath}`;
  const returns = checkoutReturnsKey(successUrl, cancelUrl);
  // Stripe calls for this checkout go to the coach's account on a direct charge.
  const onCoach = direct ? { stripeAccount: account } : undefined;
  const buyer = direct ? (coachCustomerId as string) : customerId;

  // One payable subscription checkout per account and coach at a time (checkout-barrier.ts):
  // claimed here, confirmed right before the create, released in the finally below.
  // Subscriptions reserve no store credit.
  let claim: CheckoutClaim | null = null;
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>> | null = null;
  try {
    if (isSubscription) {
      claim = await claimCheckout(user.id, `coach-${providerRole}-${providerId}`);
      const sameProduct = (s: { mode?: string | null; metadata?: Record<string, string> | null }) => s.mode === 'subscription'
        && s.metadata?.provider_id === String(providerId) && s.metadata?.provider_role === providerRole;
      // Handed back only on this request's terms: a changed price, fee, referral or code makes a new one.
      const sameTerms = (s: { metadata?: Record<string, string> | null }) => s.metadata?.price_cents === String(chargeCents) && s.metadata?.fee_bps === String(feeBps)
        && s.metadata?.origin === coachOrigin && (s.metadata?.referral_id ?? null) === (referralId ?? null)
        && s.metadata?.returns === returns && (s.metadata?.code ?? null) === (checkoutCode?.code ?? null);
      // ⚠ A destination-charge checkout still open on Shape's account from before the move could
      // still be paid; on a direct charge every one of them is expired, and none is handed back.
      const open = direct
        ? (await currentCheckout(customerId, sameProduct, () => false), await currentCheckout(buyer, sameProduct, sameTerms, Date.now(), account))
        : await currentCheckout(customerId, sameProduct, sameTerms);
      // ⚠ ASKED HERE, WHILE HOLDING THE CLAIM AND AFTER THE OPEN CHECKOUTS ARE READ (Codex on #2353):
      // a request that waited on the claim can arrive after the first checkout was paid, and one
      // the buyer completes in another tab while this request reads them is no longer listed as
      // open. Stripe holds the subscription the moment it is paid; our row comes with the webhook.
      // On a direct charge both are asked: a plan from before the move lives on Shape's account.
      let paid: boolean;
      try {
        const wanted = { client_id: user.id, provider_id: String(providerId), provider_role: providerRole };
        paid = await hasLiveStripeSubscription({ customerId, email: user.email ?? null }, wanted)
          || (direct && await hasLiveStripeSubscription({ customerId: buyer, email: null }, wanted, account));
      } catch (err) {
        console.error('[shape-app] checkout Stripe subscription lookup failed', err);
        return NextResponse.json({ error: 'Could not check your subscriptions. Try again in a moment.' }, { status: 503 });
      }
      if (paid) return alreadySubscribed();
      if (open) return NextResponse.json({ url: open, creditAppliedCents: 0 });
      await claim.confirm();
    }
    const subscriptionMeta = { client_id: user.id, provider_id: String(providerId), provider_role: providerRole };
    session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            // A code is Stripe's discount on the list price; store credit is taken off the price.
            unit_amount: checkoutCode ? priceCents : chargeCents,
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
      customer: buyer,
      client_reference_id: user.id,
      // ⚠ On a coach's account this is for people reading the dashboard: the coach can edit it, so
      // the webhook reads the checkout's record (coach_checkouts) instead.
      metadata: {
        client_id: user.id,
        provider_id: String(providerId),
        provider_role: providerRole,
        price_cents: String(chargeCents),
        gross_price_cents: String(priceCents),
        kind: isSubscription ? 'subscription' : purchaseKind,
        item_name: String(itemName),
        origin: coachOrigin,
        fee_bps: String(feeBps),
        returns,
        ...(referralId ? { referral_id: referralId } : {}),
        ...(checkoutCode ? { code: checkoutCode.code, code_source: checkoutCode.source } : {}),
        ...(storeCreditApplied > 0 ? { store_credit_kind: String(storeCreditKind), store_credit_cents: String(storeCreditApplied) } : {}),
        ...(storeCreditRef ? { store_credit_ref: storeCreditRef } : {}),
        ...(body.item && (body.item as { planId?: unknown }).planId ? { plan_id: String((body.item as { planId?: unknown }).planId) } : {}),
      },
      ...(isSubscription
        ? {
            subscription_data: {
              // Stripe requires the application fee to be positive-or-absent: a 0% (BYO) fee OMITS
              // the field. On a direct charge Stripe's own fee is the coach's either way.
              ...(feeBps > 0 ? { application_fee_percent: bpsToPercent(feeBps) } : {}),
              ...(direct ? {} : { transfer_data: { destination: account } }),
              metadata: subscriptionMeta,
            },
          }
        : {
            payment_intent_data: {
              // Positive-or-absent (also covers the max-store-credit case, where
              // the fee legitimately computes to 0 at the standard rate).
              ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
              ...(direct ? {} : { transfer_data: { destination: account } }),
              metadata: subscriptionMeta,
            },
          }),
      success_url: successUrl,
      cancel_url: cancelUrl,
      // A typed code is applied here, and then Stripe's own box is off (a checkout takes one). With
      // none, a subscription takes the coach's own codes in Stripe's box (its fee is a percent, so
      // it follows the discount); a one-time fee is a fixed amount, so its codes go through ours.
      ...(checkoutCode ? { discounts: [checkoutCode.discount] } : { allow_promotion_codes: isSubscription }),
    }, isSubscription ? { ...CHECKOUT_CREATE_OPTIONS, ...onCoach } : onCoach);

    if (!session.url) {
      await releaseReservation();
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 });
    }
    // ⚠ THE RECORD BEFORE THE ADDRESS. On a coach's account the webhook records only a checkout
    // Shape wrote down (coach_checkouts), and releases only the store credit recorded against it,
    // so a checkout whose record failed is expired and never handed out.
    if (direct) {
      try {
        await recordCoachCheckout(admin, {
          stripe_checkout_session_id: session.id,
          stripe_account_id: account,
          client_id: user.id,
          provider_role: providerRole,
          provider_id: providerId,
          mode: isSubscription ? 'subscription' : 'payment',
          kind: isSubscription ? 'subscription' : purchaseKind,
          plan_id: planId || null,
          workout_id: null,
          item_name: String(itemName).slice(0, 200),
          origin: coachOrigin,
          fee_bps: feeBps,
          referral_id: referralId ?? null,
          list_cents: priceCents,
          charge_cents: chargeCents,
          application_fee_cents: isSubscription ? null : applicationFeeCents,
          store_credit_kind: storeCreditRef ? storeCreditKind : null,
          store_credit_cents: storeCreditRef ? storeCreditApplied : 0,
          store_credit_ref: storeCreditRef,
          code: checkoutCode?.code ?? null,
          code_source: checkoutCode?.source ?? null,
        });
      } catch (err) {
        console.error('[shape-app] coach checkout not recorded — expired, not handed out', { session: session.id, error: err instanceof Error ? err.message : String(err) });
        await stripe.checkout.sessions.expire(session.id, undefined, onCoach).then(() => undefined, () => undefined);
        await releaseReservation();
        return NextResponse.json({ error: 'Could not start checkout. Try again in a moment.' }, { status: 503 });
      }
    }
    return NextResponse.json({ url: session.url, creditAppliedCents: storeCreditApplied });
  } catch (err) {
    await releaseReservation();
    // A coach's code whose own restrictions refuse this checkout (first purchase only, a minimum,
    // another customer) is refused by Stripe at the create: the member is told about the code.
    const stripeErr = err as { type?: string; param?: string; message?: string };
    if (checkoutCode && stripeErr?.type === 'StripeInvalidRequestError' && /discount|promotion|coupon/i.test(`${stripeErr.param ?? ''} ${stripeErr.message ?? ''}`)) {
      return NextResponse.json({ error: CODE_MESSAGES.code_not_here, reason: 'code_not_here' }, { status: 400 });
    }
    if (isCheckoutInProgress(err)) {
      return NextResponse.json(
        { error: 'A checkout for this coach is being opened. Try again in a moment.', reason: 'checkout_in_progress' },
        { status: 409 }
      );
    }
    return dbError(err, 'mobile checkout-session', 500, 'Could not start checkout.');
  } finally {
    if (claim) await claim.release();
  }
}
