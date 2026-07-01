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
  apiVersion: '2026-06-24.dahlia',
  appInfo: {
    name: 'Shape',
    url: 'https://theshapecommunity.com',
  },
});

/** Connect-account balance + recent payouts, as the coach analytics routes shape it. */
export type StripeSummary = {
  connected: boolean;
  status: string;
  balanceCents: number | null;
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
    return { connected: false, status: accountStatus ?? 'not_connected', balanceCents: null, schedule: null, payouts: [] };
  }
  try {
    const [balance, payoutList, account] = await Promise.all([
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),
      stripe.accounts.retrieve(accountId).catch(() => null),
    ]);
    const balanceCents = (balance.available ?? []).reduce((sum, b) => sum + b.amount, 0);
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
    return { connected: true, status: accountStatus ?? 'connected', balanceCents, schedule, payouts };
  } catch {
    return { connected: true, status: accountStatus ?? 'error', balanceCents: null, schedule: null, payouts: [] };
  }
}
