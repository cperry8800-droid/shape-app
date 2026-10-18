// Types for coach-renewals.mjs — the Business page's "Renewing this week". The module is
// plain JS so the test suite can drive it; this file is what the analytics routes type against.

export const RENEWAL_DAYS: number;
export const RENEWAL_CHECK_CAP: number;

export type RenewalSource = {
  client_id?: string | null;
  price_cents?: number | null;
  fee_bps?: number | null;
  current_period_end?: string | null;
  stripe_subscription_id?: string | null;
};

export type Renewal = {
  name: string;
  /** whose plan it is; null when the row has no client */
  clientId: string | null;
  dueAt: string;
  priceCents: number;
  netCents: number;
  /** true = cancelled, ends that day · false = renews · null = could not ask Stripe */
  ending: boolean | null;
};

export function pickRenewals<T extends RenewalSource>(subs: T[], now?: number, days?: number): T[];

export function renewalRows(
  picked: RenewalSource[],
  opts: {
    names: Map<string, string>;
    flags: Map<string, boolean | null>;
    cutCents: (priceCents: number, feeBps: number | null) => number;
  }
): Renewal[];
