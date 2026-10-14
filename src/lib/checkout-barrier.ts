// One payable checkout per account and product at a time.
//
// ⚠ TWO PRESSES COULD OPEN TWO PAYABLE CHECKOUTS (Codex on #2353). The "already paying?" check
// (stripe-live-subscription.ts) runs before any session exists, so two Join or Subscribe requests
// arriving together both passed it, and each made a session the buyer could complete. A Stripe
// idempotency key per 10-minute window closed most of that, but two requests straddling a window
// boundary got different keys (Codex again), so the lock is now the database's:
// - claimCheckout: the request claims (account, product) in checkout_claims, an insert that two
//   requests cannot both win (2026-10-14-checkout-claims.sql). The loser waits for the winner to
//   finish, then claims in turn. The claim is released when the request is done.
// - currentCheckout, run while holding the claim: the account's open checkout for the product, if
//   it is under 10 minutes old, is handed back (so the loser above gets the winner's checkout, and
//   a second press from another page reopens it). Every other open one for the product is expired,
//   so an abandoned tab can no longer be paid and a coach's changed price is not charged from it.

import { randomUUID } from 'node:crypto';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const FRESH_MS = 10 * 60 * 1000;
// How long a request waits for another holding the claim: a checkout is made in a second or two.
const CLAIM_WAITS_MS = [300, 600, 900, 1200, 1500];

export class CheckoutInProgressError extends Error {
  readonly code = 'checkout_in_progress';
  constructor() {
    super('Another checkout for this is being opened right now.');
    this.name = 'CheckoutInProgressError';
  }
}

// By its code, not instanceof, so a second copy of this module in another bundle still matches.
export function isCheckoutInProgress(err: unknown): boolean {
  return err instanceof Error && (err as { code?: unknown }).code === 'checkout_in_progress';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims (account, product), waiting briefly while another request holds it. Returns the release,
 * which never throws. Throws CheckoutInProgressError if the claim stays held, or the database's
 * error: a checkout is never opened without the claim.
 */
export async function claimCheckout(userId: string, product: string): Promise<() => Promise<void>> {
  const admin = createAdminClient();
  const token = randomUUID();
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await admin.rpc('claim_checkout', { p_user_id: userId, p_product: product, p_token: token });
    if (error) throw error;
    if (data === true) break;
    if (attempt >= CLAIM_WAITS_MS.length) throw new CheckoutInProgressError();
    await sleep(CLAIM_WAITS_MS[attempt]);
  }
  return async () => {
    try {
      const { error } = await admin.rpc('release_checkout', { p_user_id: userId, p_product: product, p_token: token });
      if (error) console.error('[checkout-barrier] release failed; the claim lapses in 60 seconds', { product, error: error.message });
    } catch (e) {
      console.error('[checkout-barrier] release failed; the claim lapses in 60 seconds', { product, error: String(e) });
    }
  };
}

type OpenSession = { created: number; url?: string | null; mode?: string | null; metadata?: Record<string, string> | null };

/** Run while holding the claim: the account's newest open checkout for the product if it is fresh; every other is expired. */
export async function currentCheckout(
  customerId: string,
  sameProduct: (session: OpenSession) => boolean,
  now: number = Date.now()
): Promise<string | null> {
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
  let current: string | null = null;
  // Stripe lists the newest first.
  for (const session of open.data) {
    if (!sameProduct(session)) continue;
    if (!current && session.url && now - session.created * 1000 < FRESH_MS) {
      current = session.url;
      continue;
    }
    // Throws when the session closed in between (paid, say): the caller refuses, and the next
    // press finds the subscription.
    await stripe.checkout.sessions.expire(session.id);
  }
  return current;
}
