// Coach payments on the coaches' own Stripe accounts (owner, 2026-10-18: "shape is not paying
// processing fee"). Coach charges are destination charges today: they are made on Shape's platform
// account and Stripe bills its processing fee to Shape. They move to DIRECT charges on each coach's
// Standard connected account, where Stripe takes its fee and Shape takes only its application fee.
// This file is the plumbing for that move (PR A of three); nothing here changes how anything is
// charged.
//
// A money row (subscriptions, one_time_purchases) says which account it lives on in
// stripe_account_id: null is the platform (every row made before this, and every destination charge
// still being made), and an acct_ id is that coach's account. Every helper here is a no-op for null,
// so the legacy path is exactly what it was.
//
// Pure: the Stripe client and the service-role database are passed in, so tests drive every rule
// without a network, and the webhook test harnesses load this file as it is.

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null };
type Query = {
  select: (cols: string) => Query;
  eq: (col: string, v: unknown) => Query;
  maybeSingle: () => PromiseLike<QueryResult>;
  upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => PromiseLike<QueryResult>;
};
/** The slice of the service-role Supabase client these helpers use. */
export type AdminLike = { from: (table: string) => unknown };
const q = (admin: AdminLike, table: string) => admin.from(table) as Query;

/** A Stripe connected-account id as Stripe writes one. */
export function isAccountId(v: unknown): v is string {
  return typeof v === 'string' && /^acct_[A-Za-z0-9]{6,64}$/.test(v);
}

/**
 * The request options that send a Stripe call to a connected account, or `undefined` (the
 * platform) for a legacy row. Passed as the options argument of any call:
 * `stripe.subscriptions.cancel(id, undefined, acctOpts(row.stripe_account_id))`.
 */
export function acctOpts(acct: string | null | undefined): { stripeAccount: string } | undefined {
  return acct ? { stripeAccount: acct } : undefined;
}

/** Postgres 42703 / PostgREST PGRST204: the column is not there (a database before the migration). */
export function missingColumn(err: { code?: string } | null | undefined): boolean {
  return err?.code === '42703' || err?.code === 'PGRST204';
}

/** The id inside an `application` field, which Stripe sends as an id or, expanded, an object. */
export function applicationIdOf(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id || null;
  return null;
}

/**
 * Whether a Stripe object was made by Shape's Connect application. Only checked when
 * STRIPE_CONNECT_APPLICATION_ID is set; unset, every object passes this half (the account half of
 * the origin guard still holds).
 */
export function madeByShape(application: unknown, expected: string | undefined = process.env.STRIPE_CONNECT_APPLICATION_ID): boolean {
  const want = String(expected ?? '').trim();
  if (!want) return true;
  return applicationIdOf(application) === want;
}

export type OriginRefusal = 'not_a_coach' | 'no_coach_row' | 'account_mismatch' | 'application_mismatch' | 'read_failed';
export type OriginVerdict = { ok: true } | { ok: false; reason: OriginRefusal; error?: unknown };

/**
 * ⚠ THE ORIGIN GUARD. A Standard account is the coach's own Stripe account: they can make any
 * checkout on it, with any metadata. A Connect event is signed by Stripe, but what it says about
 * Shape (metadata.client_id, provider_role, provider_id) is whatever its maker wrote. Without this,
 * a coach could charge a client on their own account, outside Shape and its fee, and have the
 * webhook record a Shape subscription or purchase for it, or name ANOTHER coach and write rows on
 * that coach's books. So a Connect event writes a row only when
 *   1. the account it came from is the account on record for the coach its metadata names, and
 *   2. the payment object behind it was made by Shape's Connect application (when
 *      STRIPE_CONNECT_APPLICATION_ID is set; `checkApplication: false` skips this half for an
 *      event that carries no such object, an expired checkout).
 * Anything else is refused: the caller logs it, answers 200 and writes nothing.
 */
export async function checkConnectOrigin(
  admin: AdminLike,
  args: { account: string; providerRole: unknown; providerId: unknown; application?: unknown; checkApplication?: boolean },
  expectedApplication: string | undefined = process.env.STRIPE_CONNECT_APPLICATION_ID
): Promise<OriginVerdict> {
  const role = args.providerRole;
  const id = Number(args.providerId);
  if ((role !== 'trainer' && role !== 'nutritionist') || !Number.isSafeInteger(id) || id <= 0 || !isAccountId(args.account)) {
    return { ok: false, reason: 'not_a_coach' };
  }
  const { data, error } = await q(admin, role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('stripe_account_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, reason: 'read_failed', error };
  if (!data) return { ok: false, reason: 'no_coach_row' };
  if ((data as { stripe_account_id?: unknown }).stripe_account_id !== args.account) return { ok: false, reason: 'account_mismatch' };
  if (args.checkApplication !== false && !madeByShape(args.application, expectedApplication)) {
    return { ok: false, reason: 'application_mismatch' };
  }
  return { ok: true };
}

type CustomerQuery = {
  select: (cols: string) => CustomerQuery;
  eq: (col: string, v: unknown) => CustomerQuery;
  not: (col: string, op: string, v: unknown) => CustomerQuery;
  is: (col: string, v: null) => CustomerQuery;
  limit: (n: number) => CustomerQuery;
  maybeSingle: () => PromiseLike<QueryResult>;
};

/**
 * The member's PLATFORM customer as their coaching subscriptions hold it, read with whichever
 * client the caller has (the member's own, or the service role). ⚠ Only a row on Shape's own
 * account (stripe_account_id null) counts: a direct-charge row holds a customer on the COACH's
 * account, which Shape's account has never heard of, so adopting it, opening the billing portal on
 * it or reading its card would fail or show the wrong thing. Before the 2026-10-18 migration the
 * column is absent and every row is a platform one, so the filter is dropped then. Answers in the
 * shape of a `.maybeSingle()` read: { data: { stripe_customer_id } | null, error }.
 */
export async function platformCoachCustomer(
  client: AdminLike,
  userId: string
): Promise<{ data: { stripe_customer_id?: string | null } | null; error: { code?: string; message?: string } | null }> {
  const read = (platformOnly: boolean) => {
    const rows = (client.from('subscriptions') as CustomerQuery)
      .select('stripe_customer_id')
      .eq('client_id', userId)
      .not('stripe_customer_id', 'is', null);
    return (platformOnly ? rows.is('stripe_account_id', null) : rows).limit(1).maybeSingle();
  };
  let res = await read(true);
  if (res.error && missingColumn(res.error)) res = await read(false);
  return { data: (res.data as { stripe_customer_id?: string | null } | null) ?? null, error: res.error };
}

type StripeCustomers = {
  customers: {
    create: (params: Record<string, unknown>, opts: { stripeAccount: string; idempotencyKey: string }) => PromiseLike<{ id: string }>;
  };
};

/**
 * The member's Stripe customer ON A COACH'S ACCOUNT, made once and kept in
 * stripe_connected_customers. A direct charge is made on the coach's account, and a customer there
 * is a different object from the member's platform customer (profiles.stripe_customer_id), so the
 * two are never mixed: this one is never written to profiles, and the platform one is never sent
 * with a Stripe-Account header. Unused until the checkouts move (PR B).
 */
export async function connectedCustomerFor(
  stripe: StripeCustomers,
  admin: AdminLike,
  { userId, account, email }: { userId: string; account: string; email: string | null }
): Promise<string> {
  if (!userId || !isAccountId(account)) throw new Error('connectedCustomerFor needs a member and a connected account');
  const read = async (): Promise<string | null> => {
    const { data, error } = await q(admin, 'stripe_connected_customers')
      .select('customer_id')
      .eq('user_id', userId)
      .eq('stripe_account_id', account)
      .maybeSingle();
    if (error) throw error;
    return ((data as { customer_id?: string | null } | null)?.customer_id) || null;
  };
  const existing = await read();
  if (existing) return existing;
  // The idempotency key gives two first checkouts started together one customer, not two.
  const customer = await stripe.customers.create(
    { ...(email ? { email } : {}), metadata: { client_id: userId } },
    { stripeAccount: account, idempotencyKey: `shape-customer-${userId}-${account}` }
  );
  // Never replaces a row: a customer saved by a concurrent request wins, and is the one returned.
  const { error } = await q(admin, 'stripe_connected_customers').upsert(
    { user_id: userId, stripe_account_id: account, customer_id: customer.id },
    { onConflict: 'user_id,stripe_account_id', ignoreDuplicates: true }
  );
  if (error) throw error;
  return (await read()) ?? customer.id;
}
