// One payable checkout per account and product at a time.
//
// ⚠ TWO PRESSES COULD OPEN TWO PAYABLE CHECKOUTS (Codex on #2353). The "already paying?" check
// (stripe-live-subscription.ts) runs before any session exists, so two Join or Subscribe requests
// arriving together both passed it, and each made a session the buyer could complete. Two
// barriers close it:
// - currentCheckout: before a new session, the account's open session for the same product from
//   this 10-minute window is handed back instead (a second press from another page reopens the
//   same checkout), and open ones from an EARLIER window are expired, so an abandoned tab can no
//   longer be paid and a coach's changed price is not charged from it.
// - checkoutIdempotencyKey: requests in the same window for the same account and product share
//   one Stripe idempotency key, which covers two requests that both found nothing open. A double
//   press gets the SAME session back; one with different parameters is refused by Stripe, which
//   the caller answers as checkout_in_progress.
// Callers take `now` once and pass it to both, so the two agree on the window.

import { stripe } from '@/lib/stripe';

const WINDOW_MS = 10 * 60 * 1000;

function windowStart(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

export function checkoutIdempotencyKey(userId: string, product: string, now: number = Date.now()): string {
  return `checkout-${product}-${userId}-${windowStart(now) / WINDOW_MS}`;
}

type OpenSession = { created: number; url?: string | null; mode?: string | null; metadata?: Record<string, string> | null };

/** The URL of this window's open checkout for the same product, if any; earlier ones are expired. */
export async function currentCheckout(
  customerId: string,
  sameProduct: (session: OpenSession) => boolean,
  now: number = Date.now()
): Promise<string | null> {
  const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 20 });
  const cutoff = windowStart(now);
  let current: string | null = null;
  for (const session of open.data) {
    if (!sameProduct(session)) continue;
    if (session.created * 1000 < cutoff) {
      // Throws when the session closed in between (paid, say): the caller refuses, and the next
      // press finds the subscription.
      await stripe.checkout.sessions.expire(session.id);
    } else if (!current && session.url) {
      current = session.url;
    }
  }
  return current;
}

/** Stripe's refusal of a reused idempotency key with different parameters. */
export function isCheckoutInProgress(err: unknown): boolean {
  const e = err as { type?: string; rawType?: string } | null;
  return !!e && (e.type === 'StripeIdempotencyError' || e.rawType === 'idempotency_error');
}
