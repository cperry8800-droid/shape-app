// Server-side Stripe client. Never import this from client components.
// Requires STRIPE_SECRET_KEY in the environment.

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Don't throw at module load — pages that don't use Stripe still need to
  // render. We surface the error at the call site instead.
  console.warn('[shape-app] STRIPE_SECRET_KEY is not set — subscribe flow will fail.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_missing', {
  // Pin to a known API version so the SDK types line up.
  apiVersion: '2026-08-26.dahlia',
  appInfo: {
    name: 'Shape',
    url: 'https://theshapecommunity.com',
  },
});

/** Connect-account balance + recent payouts, as the coach analytics routes shape it. */
export type StripeSummary = {
  connected: boolean;
  status: string;
  /** True when the account is linked but Stripe could not be read just now: every figure is null. */
  error?: boolean;
  balanceCents: number | null;
  /** Charges still clearing in Stripe's hold, not yet in the available balance. */
  pendingCents: number | null;
  /** The account's payout cadence (Business page schedule line); null until connected. */
  schedule: {
    interval: string; // 'daily' | 'weekly' | 'monthly' | 'manual'
    weeklyAnchor: string | null;
    monthlyAnchor: number | null;
    delayDays: number | null;
  } | null;
  payouts: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    arrivalDate: number | null;
    created: number;
  }>;
};

/** Balance + payout schedule + last 12 payouts for a connected account (or an empty/error summary). */
export async function loadStripe(
  accountId: string | null,
  accountStatus: string | null
): Promise<StripeSummary> {
  if (!accountId) {
    return { connected: false, status: accountStatus ?? 'not_connected', balanceCents: null, pendingCents: null, schedule: null, payouts: [] };
  }
  try {
    const [balance, payoutList, account] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),
      stripe.accounts.retrieve(accountId).catch(() => null),
    ]);
    const balanceCents = (balance.available ?? []).reduce((sum, b) => sum + b.amount, 0);
    const pendingCents = (balance.pending ?? []).reduce((sum, b) => sum + b.amount, 0);
    const payouts = payoutList.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: p.arrival_date ? p.arrival_date * 1000 : null,
      created: p.created * 1000,
    }));
    const sched = account?.settings?.payouts?.schedule ?? null;
    const schedule = sched
      ? {
          interval: sched.interval ?? 'daily',
          weeklyAnchor: sched.weekly_anchor ?? null,
          monthlyAnchor: sched.monthly_anchor ?? null,
          delayDays: sched.delay_days ?? null,
        }
      : null;
    return { connected: true, status: accountStatus ?? 'connected', balanceCents, pendingCents, schedule, payouts };
  } catch {
    // ⚠ FLAGGED, NOT LEFT TO THE STATUS. The status is the account's stored one ('active' for a
    // working account), so a failed read used to look connected with nothing in it, and the
    // page said "your first payout lands here" to a coach who has been paid for months.
    return { connected: true, error: true, status: accountStatus ?? 'error', balanceCents: null, pendingCents: null, schedule: null, payouts: [] };
  }
}

/** A subscription to ask about: its id, and the connected account it lives on (null: the platform). */
export type CancelFlagRow = string | { id: string; account?: string | null };

// The most pages (of 100) read from one coach's account on one page load. A Standard account is
// the coach's own Stripe account and may hold their other business too; past this, the rows not
// yet found read as "could not ask", never as renewing.
export const ACCOUNT_LIST_PAGES = 20;

const isEnding = (sub: { cancel_at_period_end?: boolean | null; cancel_at?: number | null; status?: string }) =>
  !!(sub.cancel_at_period_end || sub.cancel_at || sub.status === 'canceled');

// Every subscription on one connected account, a page at a time, until the wanted ids are all
// found. One list per account replaces a retrieve per row.
async function flagsOnAccount(account: string, ids: Set<string>, out: Map<string, boolean | null>): Promise<void> {
  const want = new Set(ids);
  try {
    let startingAfter: string | undefined;
    for (let page = 0; page < ACCOUNT_LIST_PAGES && want.size; page++) {
      const res = await stripe.subscriptions.list(
        { status: 'all', limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
        { stripeAccount: account }
      );
      for (const sub of res.data) {
        if (want.delete(sub.id)) out.set(sub.id, isEnding(sub));
      }
      if (!res.has_more || !res.data.length) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
  } catch {
    // A failed page: what was found stands, the rest could not be asked.
  }
  for (const id of want) out.set(id, null);
}

/**
 * Whether each subscription is set to end rather than renew, for the Business page's renewals
 * (src/lib/coach-renewals.mjs). A member who cancels keeps an `active` row until the period
 * ends, so only Stripe knows. A legacy row (no account: a destination charge on the platform) is
 * retrieved on its own, at most `cap` of them; the rows on a coach's own account (direct charges)
 * are read with one paged list per account, which needs no cap.
 * true = cancelled · false = renews · null = could not ask (or past the cap).
 */
export async function loadCancelFlags(rows: CancelFlagRow[], cap: number): Promise<Map<string, boolean | null>> {
  const out = new Map<string, boolean | null>();
  const ids: string[] = [];
  const byAccount = new Map<string, Set<string>>();
  for (const r of rows) {
    const id = typeof r === 'string' ? r : r?.id;
    const account = typeof r === 'string' ? null : r?.account || null;
    if (!id) continue;
    if (!account) { ids.push(id); continue; }
    if (!byAccount.has(account)) byAccount.set(account, new Set());
    byAccount.get(account)!.add(id);
  }
  const listed = Promise.all([...byAccount].map(([account, set]) => flagsOnAccount(account, set, out)));
  await Promise.all(ids.map(async (id, i) => {
    if (i >= cap) { out.set(id, null); return; }
    try {
      const sub = await stripe.subscriptions.retrieve(id);
      out.set(id, !!(sub.cancel_at_period_end || sub.cancel_at || sub.status === 'canceled'));
    } catch {
      out.set(id, null);
    }
  }));
  await listed;
  return out;
}
