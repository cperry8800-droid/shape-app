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
// - claim.confirm, right before the checkout is created: renews the claim and refuses if it is no
//   longer this request's. A request that ran past the claim's 60 seconds may have lost it to
//   another while still working (Codex again); it then creates nothing. The create itself is
//   bounded by CHECKOUT_CREATE_OPTIONS, well inside the 60 seconds, so two requests can never
//   both hand out a checkout.
// - currentCheckout, run while holding the claim: the account's open checkout for the product, if
//   it is under 10 minutes old and still on this request's terms (price, fee, referral), is handed
//   back, so the loser above gets the winner's checkout and a second press from another page
//   reopens it. Every other open one for the product is expired, so an abandoned tab can no longer
//   be paid and a changed price or fee is never charged from an old checkout (Codex on #2353).
//   Callers ask Stripe whether the account already pays AFTER this and before handing anything
//   out, so a checkout completed in another tab meanwhile is caught (Codex again). Where a
//   checkout returns to is one of its terms too (checkoutReturnsKey): a checkout opened in the
//   app returns to the app's close page, and one reused from a coach's profile on the website
//   would strand the buyer there.

import { createHash, randomUUID } from 'node:crypto';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const FRESH_MS = 10 * 60 * 1000;
/** For the sessions.create made under a claim: done or failed within 20 seconds of claim.confirm. */
export const CHECKOUT_CREATE_OPTIONS = { timeout: 20_000, maxNetworkRetries: 0 } as const;
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

export type CheckoutClaim = {
  /** Renews the claim right before the checkout is created; throws CheckoutInProgressError if it was taken over. */
  confirm: () => Promise<void>;
  /** Releases the claim. Never throws. */
  release: () => Promise<void>;
};

/**
 * Claims (account, product), waiting briefly while another request holds it. Throws
 * CheckoutInProgressError if the claim stays held, or the database's error: a checkout is never
 * opened without the claim.
 */
export async function claimCheckout(userId: string, product: string): Promise<CheckoutClaim> {
  const admin = createAdminClient();
  const token = randomUUID();
  const args = { p_user_id: userId, p_product: product, p_token: token };
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await admin.rpc('claim_checkout', args);
    if (error) throw error;
    if (data === true) break;
    if (attempt >= CLAIM_WAITS_MS.length) throw new CheckoutInProgressError();
    await sleep(CLAIM_WAITS_MS[attempt]);
  }
  return {
    confirm: async () => {
      const { data, error } = await admin.rpc('renew_checkout_claim', args);
      if (error) throw error;
      if (data !== true) throw new CheckoutInProgressError();
    },
    release: async () => {
      try {
        const { error } = await admin.rpc('release_checkout', args);
        if (error) console.error('[checkout-barrier] release failed; the claim lapses in 60 seconds', { product, error: error.message });
      } catch (e) {
        console.error('[checkout-barrier] release failed; the claim lapses in 60 seconds', { product, error: String(e) });
      }
    },
  };
}

/** Where a checkout returns to, as one short metadata value (Stripe caps a value at 500 characters). */
export function checkoutReturnsKey(successUrl: string, cancelUrl: string): string {
  return createHash('sha256').update(`${successUrl}\n${cancelUrl}`).digest('hex').slice(0, 32);
}

type OpenSession = { id: string; created: number; url?: string | null; mode?: string | null; metadata?: Record<string, string> | null };

/**
 * Run while holding the claim: the account's newest open checkout for the product, if it is fresh
 * and on the same terms; every other open one for the product is expired. `stripeAccount` reads
 * (and expires) the checkouts on a coach's own account, where a direct charge's checkout lives,
 * for the member's customer on that account.
 */
export async function currentCheckout(
  customerId: string,
  sameProduct: (session: OpenSession) => boolean,
  sameTerms: (session: OpenSession) => boolean,
  now: number = Date.now(),
  stripeAccount: string | null = null
): Promise<string | null> {
  const opts = stripeAccount ? { stripeAccount } : undefined;
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 }, opts);
  let current: string | null = null;
  // Stripe lists the newest first.
  for (const session of open.data) {
    if (!sameProduct(session)) continue;
    if (!current && session.url && now - session.created * 1000 < FRESH_MS && sameTerms(session)) {
      current = session.url;
      continue;
    }
    // Throws when the session closed in between (paid, say): the caller refuses, and the next
    // press finds the subscription.
    await stripe.checkout.sessions.expire(session.id, undefined, opts);
  }
  return current;
}
