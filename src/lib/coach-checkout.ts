// Coach checkouts on the coach's own Stripe account (coach direct charges, part B; owner,
// 2026-10-18: "shape is not paying processing fee"). Part A (stripe-connect.ts) laid the plumbing;
// this is what the three checkout entry points, the webhook and the return pages share now that a
// coach's checkout is made ON the coach's Standard account:
//   · directChargesReady: whether checkouts move to the coach's account at all;
//   · the checkout record (coach_checkouts), written before a checkout's address is handed out and
//     the only thing the webhook believes about a checkout on a coach's account;
//   · the code box: a Shape code (mirrored onto the coach's account) or the coach's own code;
//   · recurringCents: what a subscription renews at, quantity and discounts included;
//   · the billing portal on a coach's account, and a fresh account for a coach who reconnects.
//
// Pure: the Stripe client and the service-role database are passed in, so tests drive every rule
// without a network.

import { isAccountId, type AdminLike } from '@/lib/stripe-connect';

type DbError = { code?: string; message?: string } | null;
type QueryResult = { data: unknown; error: DbError };
type Query = {
  select: (cols: string) => Query;
  insert: (row: Record<string, unknown>) => PromiseLike<QueryResult>;
  update: (row: Record<string, unknown>) => Query;
  upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => PromiseLike<QueryResult>;
  eq: (col: string, v: unknown) => Query;
  is: (col: string, v: null) => Query;
  maybeSingle: () => PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;
const q = (admin: AdminLike, table: string) => admin.from(table) as Query;

/**
 * Whether a coach's checkout is made on the coach's own account (a direct charge). It needs both
 * Connect variables: without the webhook secret the coach's account's events never arrive, and
 * without the application id the webhook refuses every one of them (stripe-connect.ts), so a
 * direct charge would take the member's money and record nothing. Unset, the checkout stays the
 * destination charge it was, and a warning says so.
 */
export function directChargesReady(env: Record<string, string | undefined> = process.env): boolean {
  return !!String(env.STRIPE_CONNECT_APPLICATION_ID ?? '').trim() && !!String(env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '').trim();
}

/**
 * Why a coach takes no payment, as the flag a caller reads (`reason`), or null when they can.
 * ⚠ A COACH WHO HAS NOT CONNECTED, OR HAS DISCONNECTED, TAKES NO PAYMENT. There is no account to
 * charge on: Shape never charges a coach's client on Shape's own account and pays the coach later.
 * Their listing is off the marketplace already (listing_ready needs 'active').
 */
export function coachNotPayable(provider: { stripe_account_id?: string | null; stripe_account_status?: string | null }): 'coach_disconnected' | 'coach_not_connected' | null {
  if (provider.stripe_account_status === 'disconnected') return 'coach_disconnected';
  if (!provider.stripe_account_id || provider.stripe_account_status !== 'active') return 'coach_not_connected';
  return null;
}

// ── The checkout record ──────────────────────────────────────────────────────────────────────

export type CoachCheckout = {
  stripe_checkout_session_id: string;
  stripe_account_id: string;
  client_id: string;
  provider_role: 'trainer' | 'nutritionist';
  provider_id: number;
  mode: 'payment' | 'subscription';
  kind: 'subscription' | 'booking' | 'meal_plan' | 'program';
  plan_id: string | null;
  workout_id: string | null;
  item_name: string | null;
  origin: string;
  fee_bps: number;
  referral_id: string | null;
  list_cents: number;
  charge_cents: number;
  application_fee_cents: number | null;
  store_credit_kind: 'session' | 'nutrition' | null;
  store_credit_cents: number;
  store_credit_ref: string | null;
  code: string | null;
  code_source: 'shape' | 'coach' | null;
};

/** Writes the record. Throws on a failure: a checkout Shape cannot vouch for is never handed out. */
export async function recordCoachCheckout(admin: AdminLike, row: CoachCheckout): Promise<void> {
  const { error } = await q(admin, 'coach_checkouts').insert(row);
  if (error) throw Object.assign(new Error(`coach checkout not recorded: ${error.message ?? error.code}`), { code: error.code });
}

/**
 * The record of checkout `sessionId` on account `account`: { row } (null when there is none) or
 * { error }. Only a record made for that same account counts.
 */
export async function readCoachCheckout(admin: AdminLike, sessionId: string, account: string): Promise<{ row: CoachCheckout | null; error?: undefined } | { row?: undefined; error: NonNullable<DbError> }> {
  const { data, error } = await q(admin, 'coach_checkouts')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('stripe_account_id', account)
    .maybeSingle();
  if (error) return { error };
  return { row: (data as CoachCheckout | null) ?? null };
}

/**
 * The metadata a checkout on a coach's account is read by, from its record: the same keys Shape's
 * own checkouts carry, so the webhook runs one path for both. What the coach could have edited on
 * the checkout itself is never read.
 */
export function metadataFromRecord(r: CoachCheckout): Record<string, string> {
  return {
    client_id: r.client_id,
    provider_id: String(r.provider_id),
    provider_role: r.provider_role,
    kind: r.kind,
    origin: r.origin,
    fee_bps: String(r.fee_bps),
    price_cents: String(r.charge_cents),
    gross_price_cents: String(r.list_cents),
    ...(r.plan_id ? { plan_id: r.plan_id } : {}),
    ...(r.item_name ? { item_name: r.item_name } : {}),
    ...(r.referral_id ? { referral_id: r.referral_id } : {}),
    ...(r.store_credit_ref && r.store_credit_kind && r.store_credit_cents > 0
      ? { store_credit_kind: r.store_credit_kind, store_credit_cents: String(r.store_credit_cents), store_credit_ref: r.store_credit_ref }
      : {}),
  };
}

// ── The code box ─────────────────────────────────────────────────────────────────────────────

type Coupon = {
  id: string;
  valid?: boolean;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
  duration?: string;
  duration_in_months?: number | null;
  applies_to?: { products?: string[] } | null;
  max_redemptions?: number | null;
  redeem_by?: number | null;
};
type PromotionCode = {
  id: string;
  code?: string;
  active?: boolean;
  expires_at?: number | null;
  max_redemptions?: number | null;
  times_redeemed?: number;
  customer?: unknown;
  promotion?: { coupon?: string | Coupon | null } | null;
  restrictions?: { first_time_transaction?: boolean; minimum_amount?: number | null; minimum_amount_currency?: string | null } | null;
};
type Opts = { stripeAccount?: string; idempotencyKey?: string };
export type CodeStripe = {
  promotionCodes: { list: (params: Record<string, unknown>, opts?: Opts) => PromiseLike<{ data: PromotionCode[] }> };
  coupons: {
    retrieve: (id: string, params?: Record<string, unknown>, opts?: Opts) => PromiseLike<Coupon>;
    create: (params: Record<string, unknown>, opts?: Opts) => PromiseLike<Coupon>;
  };
};

export type CodeRefusal = 'code_invalid' | 'code_not_here';
export type CheckoutCode = {
  source: 'shape' | 'coach';
  code: string;
  /** What goes into the session's `discounts`. */
  discount: { coupon: string } | { promotion_code: string };
  percentOff: number | null;
  amountOff: number | null;
};

/** A code as a member types one, or null for an empty box. Anything that is not a code shape is invalid. */
export function normalizeCode(raw: unknown): string | null | 'invalid' {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return /^[A-Za-z0-9_-]{2,64}$/.test(s) ? s : 'invalid';
}

const customerOf = (p: PromotionCode): string | null => {
  if (!p.customer) return null;
  return typeof p.customer === 'string' ? p.customer : (p.customer as { id?: string }).id ?? null;
};

/**
 * The promotion code a member means, among those Stripe holds under the code they typed. ⚠ ONE
 * VISIBLE CODE CAN BE SEVERAL PROMOTION CODES (Codex on #2403): Stripe keeps a code unique per
 * customer, so the same letters can be one member's own code, another member's, and one open to
 * all. The member's own wins, then the open one; 'others' when every match is someone else's.
 */
function pickCode(list: PromotionCode[], typed: string, customer: string | null): PromotionCode | 'others' | null {
  const same = list.filter((p) => p.code?.toLowerCase() === typed.toLowerCase());
  if (!same.length) return null;
  return (customer ? same.find((p) => customerOf(p) === customer) : undefined) ?? same.find((p) => !customerOf(p)) ?? 'others';
}

const couponOf = (p: PromotionCode): Coupon | null => {
  const c = p.promotion?.coupon;
  return c && typeof c === 'object' ? c : null;
};

// The coupon's money: a percent, or an amount in dollars. Anything else is a coupon Shape cannot
// price a checkout by (another currency, a product-limited coupon, none at all).
function usable(c: Coupon | null): c is Coupon {
  if (!c || c.valid === false) return false;
  if (c.applies_to?.products?.length) return false;
  if (typeof c.percent_off === 'number' && c.percent_off > 0 && c.percent_off <= 100) return true;
  return typeof c.amount_off === 'number' && c.amount_off > 0 && String(c.currency || '').toLowerCase() === 'usd';
}

/** The price after a code, in cents, the way Stripe takes it off. */
export function afterCode(listCents: number, code: { percentOff: number | null; amountOff: number | null } | null): number {
  if (!code) return listCents;
  if (code.percentOff) return Math.max(0, listCents - Math.round((listCents * code.percentOff) / 100));
  if (code.amountOff) return Math.max(0, listCents - code.amountOff);
  return listCents;
}

/**
 * The code a member typed, found as a Shape code (on Shape's own account) or, failing that, as the
 * coach's own code (on the coach's account), and made usable at a checkout on the coach's account.
 * ⚠ A SHAPE CODE LIVES ON SHAPE'S ACCOUNT, AND THE CHECKOUT IS ON THE COACH'S, so Stripe's own code
 * box there cannot take it. It is checked here and MIRRORED: a coupon with the same terms is made
 * once on the coach's account (id `shape-<promotion code id>`) and applied to the checkout.
 *   · A restriction Shape cannot hold to on another account refuses the code ('code_not_here'):
 *     a redemption limit (the coach's account would never count against it), first-time only, or a
 *     coupon limited to Shape's own products. A code made for one customer must be the member's.
 *   · A coach's own code is applied as the coach's promotion code, so Stripe enforces its
 *     restrictions and counts its redemptions on the coach's account.
 * The fee split is the owner's (2026-10-18): Shape takes its rate of the DISCOUNTED price, whoever's
 * code it is (application_fee_percent does it for a subscription; a one-time fee is computed on the
 * price after the code).
 */
export async function resolveCheckoutCode(
  stripe: CodeStripe,
  args: { code: string; account: string; listCents: number; mode: 'payment' | 'subscription'; platformCustomerId: string | null; coachCustomerId?: string | null; now?: number }
): Promise<{ ok: true; code: CheckoutCode } | { ok: false; reason: CodeRefusal }> {
  const now = Math.floor((args.now ?? Date.now()) / 1000);
  const minimumMet = (p: PromotionCode, cents: number) => {
    const min = p.restrictions?.minimum_amount;
    return !min || (String(p.restrictions?.minimum_amount_currency || 'usd').toLowerCase() === 'usd' && cents >= min);
  };
  const fits = (c: Coupon) => args.mode === 'subscription' || afterCode(args.listCents, { percentOff: c.percent_off ?? null, amountOff: c.amount_off ?? null }) >= 50;

  const shape = pickCode((await stripe.promotionCodes.list({ code: args.code, active: true, limit: 20, expand: ['data.promotion.coupon.applies_to'] })).data, args.code, args.platformCustomerId);
  // A Shape code that is only other members' is a miss here, not a refusal: the coach's account
  // keeps its own codes, and the same letters may be one there for this member (Codex on #2403).
  if (shape && shape !== 'others') {
    const c = couponOf(shape);
    if (shape.expires_at && shape.expires_at <= now) return { ok: false, reason: 'code_invalid' };
    if (c?.redeem_by && c.redeem_by <= now) return { ok: false, reason: 'code_invalid' };
    // ⚠ A limit on the code OR ITS COUPON cannot be held to on another account (Codex on #2403): the
    // coach's account never counts against Shape's.
    if (shape.max_redemptions != null || c?.max_redemptions != null || shape.restrictions?.first_time_transaction) return { ok: false, reason: 'code_not_here' };
    if (!usable(c) || !fits(c) || !minimumMet(shape, args.listCents)) return { ok: false, reason: 'code_not_here' };
    const mirrorId = `shape-${shape.id}`;
    const opts = { stripeAccount: args.account };
    let mirror: Coupon | null = null;
    try {
      mirror = await stripe.coupons.retrieve(mirrorId, undefined, opts);
    } catch (err) {
      if ((err as { code?: string })?.code !== 'resource_missing') throw err;
    }
    if (!mirror) {
      mirror = await stripe.coupons.create({
        id: mirrorId,
        name: `Shape code ${shape.code}`.slice(0, 40),
        ...(c.percent_off ? { percent_off: c.percent_off } : { amount_off: c.amount_off, currency: 'usd' }),
        duration: c.duration || 'once',
        ...(c.duration === 'repeating' && c.duration_in_months ? { duration_in_months: c.duration_in_months } : {}),
        // A deadline is portable: the mirror stops at the same moment as Shape's coupon.
        ...(c.redeem_by ? { redeem_by: c.redeem_by } : {}),
        metadata: { shape_promotion_code: shape.id, shape_coupon: c.id },
      }, { ...opts, idempotencyKey: `shape-mirror-${shape.id}-${args.account}` });
    }
    return {
      ok: true,
      code: { source: 'shape', code: shape.code || args.code, discount: { coupon: mirror.id }, percentOff: c.percent_off ?? null, amountOff: c.percent_off ? null : c.amount_off ?? null },
    };
  }

  const own = pickCode((await stripe.promotionCodes.list({ code: args.code, active: true, limit: 20, expand: ['data.promotion.coupon.applies_to'] }, { stripeAccount: args.account })).data, args.code, args.coachCustomerId ?? null);
  if (own === 'others') return { ok: false, reason: 'code_invalid' };
  if (own) {
    const c = couponOf(own);
    if (own.expires_at && own.expires_at <= now) return { ok: false, reason: 'code_invalid' };
    if (!usable(c) || !fits(c) || !minimumMet(own, args.listCents)) return { ok: false, reason: 'code_not_here' };
    return {
      ok: true,
      code: { source: 'coach', code: own.code || args.code, discount: { promotion_code: own.id }, percentOff: c.percent_off ?? null, amountOff: c.percent_off ? null : c.amount_off ?? null },
    };
  }
  return { ok: false, reason: 'code_invalid' };
}

/** What a member is told about a code that did not apply. */
export const CODE_MESSAGES: Record<CodeRefusal, string> = {
  code_invalid: "That code isn't valid. Check it and try again.",
  code_not_here: "That code can't be used for this checkout.",
};

// ── What a subscription renews at ────────────────────────────────────────────────────────────

type SubItem = { quantity?: number | null; price?: { unit_amount?: number | null } | null };
type SubDiscount = string | { end?: number | null; coupon?: unknown; source?: { coupon?: unknown } | null };
export type SubLike = {
  items?: { data?: SubItem[] } | null;
  discounts?: SubDiscount[] | null;
};

/**
 * Whether a subscription's discounts are all expanded down to their coupons: an id alone, a
 * discount or its `source.coupon`, says nothing about the money (Codex on #2403).
 */
export function discountsExpanded(sub: SubLike): boolean {
  return (sub.discounts ?? []).every((d) => d && typeof d === 'object' && !!(d.source?.coupon ?? d.coupon) && typeof (d.source?.coupon ?? d.coupon) === 'object');
}

/**
 * What the subscription renews at, in cents: each item's unit amount times its quantity, less the
 * subscription's discounts that still apply at the next renewal. null when it cannot be told (an
 * item without a whole-cent unit amount, a discount not expanded, a coupon not expanded).
 * ⚠ unit_amount ALONE WAS WRONG (part A's left-open): it ignored a quantity the coach set and any
 * code, so the Business page counted a member on 2 seats or 20% off at the list price.
 * A `once` coupon was spent on the first invoice and a `repeating` one that ends by the period's
 * end will not touch the renewal, so neither counts.
 */
export function recurringCents(sub: SubLike, periodEnd: number | null = null): number | null {
  const items = sub.items?.data ?? [];
  if (!items.length) return null;
  let cents = 0;
  for (const it of items) {
    const unit = it.price?.unit_amount;
    const qty = it.quantity ?? 1;
    if (typeof unit !== 'number' || !Number.isSafeInteger(unit) || unit < 0 || !Number.isSafeInteger(qty) || qty < 0) return null;
    cents += unit * qty;
  }
  for (const d of sub.discounts ?? []) {
    if (!d || typeof d !== 'object') return null;
    const c = (d.source?.coupon ?? d.coupon) as Coupon | string | null | undefined;
    if (!c || typeof c !== 'object') return null;
    if (c.duration === 'once') continue;
    if (d.end && periodEnd && d.end <= periodEnd) continue;
    if (typeof c.percent_off === 'number' && c.percent_off > 0) cents -= Math.round((cents * c.percent_off) / 100);
    else if (typeof c.amount_off === 'number' && c.amount_off > 0) cents -= c.amount_off;
    cents = Math.max(0, cents);
  }
  return cents;
}

/** Shape's rate on a subscription, from the subscription itself (application_fee_percent), in basis points. */
export function feeBpsOfSubscription(sub: { application_fee_percent?: number | null }): number {
  const pct = sub.application_fee_percent;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(10000, Math.round(pct * 100));
}

// ── The billing portal on a coach's account ──────────────────────────────────────────────────

/**
 * Every live plan the member has that is billed on a coach's own account, one per coach, read with
 * the member's own client: what the app's billing section lists a Manage row for (Codex on #2403).
 */
export async function coachAccountPlans(
  client: AdminLike,
  userId: string,
  live: ReadonlySet<string>
): Promise<{ plans: Array<{ provider_role: 'trainer' | 'nutritionist'; provider_id: number }>; error: DbError }> {
  const { data, error } = await q(client, 'subscriptions').select('*').eq('client_id', userId);
  if (error) return { plans: [], error };
  const seen = new Set<string>();
  const plans: Array<{ provider_role: 'trainer' | 'nutritionist'; provider_id: number }> = [];
  for (const r of (data ?? []) as Array<{ status?: string; stripe_account_id?: string | null; stripe_customer_id?: string | null; provider_role?: string | null; provider_id?: number | null }>) {
    if (!live.has(String(r.status)) || !isAccountId(r.stripe_account_id) || !r.stripe_customer_id) continue;
    if (r.provider_role !== 'trainer' && r.provider_role !== 'nutritionist') continue;
    const id = Number(r.provider_id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const key = `${r.provider_role}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push({ provider_role: r.provider_role, provider_id: id });
  }
  return { plans, error: null };
}

/**
 * The member's plan with a coach that is billed on the coach's own account (a direct charge), read
 * with the member's own client ("clients read own subscriptions"): a live one first (`live`, the
 * caller's ACTIVE_SUB), else any. A plan from before the move (no account) is in Shape's own portal, so it is
 * never this. '*' carries stripe_account_id and is migration-safe.
 */
export async function coachAccountPlan(
  client: AdminLike,
  userId: string,
  role: 'trainer' | 'nutritionist',
  providerId: number,
  live: ReadonlySet<string>
): Promise<{ plan: { stripe_account_id: string; stripe_customer_id: string } | null; error: DbError }> {
  const { data, error } = await q(client, 'subscriptions').select('*').eq('client_id', userId).eq('provider_id', providerId).eq('provider_role', role);
  if (error) return { plan: null, error };
  const rows = ((data ?? []) as Array<{ status?: string; stripe_account_id?: string | null; stripe_customer_id?: string | null }>)
    .filter((r) => isAccountId(r.stripe_account_id) && !!r.stripe_customer_id);
  const hit = rows.find((r) => live.has(String(r.status))) ?? rows[0];
  return { plan: hit ? { stripe_account_id: hit.stripe_account_id as string, stripe_customer_id: hit.stripe_customer_id as string } : null, error: null };
}

export type PortalStripe = {
  billingPortal: {
    configurations: { create: (params: { features: Record<string, unknown> }, opts: Opts) => PromiseLike<{ id: string }> };
    sessions: { create: (params: { customer: string; configuration?: string; return_url?: string }, opts: Opts) => PromiseLike<{ url: string }> };
  };
};

/**
 * A billing-portal page for the member's customer on a coach's account. ⚠ A COACH'S ACCOUNT HAS NO
 * PORTAL OF ITS OWN until the coach saves one in their dashboard, and one they saved could offer
 * anything. So Shape makes its own configuration on the account once (kept in
 * stripe_account_portal): the card, past invoices, and cancel at the period's end. No plan
 * switching: a coach's price is set on Shape.
 */
export async function coachPortalUrl(
  stripe: PortalStripe,
  admin: AdminLike,
  { account, customer, returnUrl }: { account: string; customer: string; returnUrl: string }
): Promise<string> {
  if (!isAccountId(account) || !customer) throw new Error('coachPortalUrl needs a coach account and a customer on it');
  const read = async (): Promise<string | null> => {
    const { data, error } = await q(admin, 'stripe_account_portal').select('configuration_id').eq('stripe_account_id', account).maybeSingle();
    if (error) throw error;
    return ((data as { configuration_id?: string | null } | null)?.configuration_id) || null;
  };
  let configuration = await read();
  if (!configuration) {
    const made = await stripe.billingPortal.configurations.create({
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
        customer_update: { enabled: false },
        subscription_update: { enabled: false },
      },
    }, { stripeAccount: account, idempotencyKey: `shape-portal-${account}` });
    // Never replaces a row: one saved by a concurrent request wins.
    const { error } = await q(admin, 'stripe_account_portal').upsert(
      { stripe_account_id: account, configuration_id: made.id },
      { onConflict: 'stripe_account_id', ignoreDuplicates: true }
    );
    if (error) throw error;
    configuration = (await read()) ?? made.id;
  }
  const session = await stripe.billingPortal.sessions.create({ customer, configuration, return_url: returnUrl }, { stripeAccount: account });
  return session.url;
}

// ── A coach who connects, or connects again ──────────────────────────────────────────────────

export type AccountStripe = {
  accounts: { create: (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => PromiseLike<{ id: string }> };
};

/**
 * The Stripe account a coach onboards on: the one on record, or a new Standard account.
 * ⚠ A DISCONNECTED COACH GETS A NEW ONE. Their old account removed Shape's access
 * (account.application.deauthorized), so an onboarding link for it fails and the coach could never
 * reconnect. The old account's rows keep their own stripe_account_id (frozen), so nothing already
 * paid moves. The write only lands on the row as it was read, so two presses make one account.
 */
export async function onboardingAccountFor(
  stripe: AccountStripe,
  admin: AdminLike,
  { table, provider, role, user }: {
    table: 'trainers' | 'nutritionists';
    provider: { id: number; stripe_account_id?: string | null; stripe_account_status?: string | null };
    role: 'trainer' | 'nutritionist';
    user: { id: string; email: string | null };
  }
): Promise<string> {
  const current = provider.stripe_account_id || null;
  if (current && provider.stripe_account_status !== 'disconnected') return current;
  // ⚠ ONE ACCOUNT PER COACH ROW AND STARTING POINT (Codex on #2403): two presses at once both get
  // here before either write below, and without a key each made its own Standard account, one left
  // behind in Stripe. Keyed on the row and the account being replaced, so the same press made again
  // gets the same account back, and a later reconnect (a new account to replace) gets a new one.
  const account = await stripe.accounts.create({
    type: 'standard',
    email: user.email ?? undefined,
    metadata: { provider_id: String(provider.id), provider_role: role, owner_id: user.id },
  }, { idempotencyKey: `shape-connect-${table}-${provider.id}-${current ?? 'first'}` });
  let write = q(admin, table).update({ stripe_account_id: account.id, stripe_account_status: 'pending' }).eq('id', provider.id);
  write = current ? write.eq('stripe_account_id', current) : write.is('stripe_account_id', null);
  const { data, error } = await write.select('stripe_account_id');
  if (error) throw error;
  if (Array.isArray(data) && data.length) return account.id;
  // Another request got there first: its account is the one on record.
  const { data: now, error: readErr } = await q(admin, table).select('stripe_account_id').eq('id', provider.id).maybeSingle();
  if (readErr) throw readErr;
  const onRecord = (now as { stripe_account_id?: string | null } | null)?.stripe_account_id;
  if (!onRecord) throw new Error('coach account not saved');
  return onRecord;
}
