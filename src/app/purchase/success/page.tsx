// Stripe's return page for a one-time purchase, and for the website and app checkouts that send
// their subscriptions here (/api/stripe/checkout-session's default successPath). It checks the
// checkout before it says anything (client-onboarding review, fix 3c: M11): it used to say the
// payment had gone through whatever had happened.

import { CheckoutReturnView } from '@/components/CheckoutReturnView';
import { readCheckoutReturn } from '@/lib/checkout-return';

export const metadata = { title: 'Your payment — Shape' };
export const dynamic = 'force-dynamic';

export default async function PurchaseSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string; acct?: string | string[] }> }) {
  // acct: the coach's connected account a direct-charge checkout was made on (checked against the
  // coaches on record inside readCheckoutReturn before it is used).
  const { session_id: sessionId, acct } = await searchParams;
  const result = await readCheckoutReturn(sessionId, acct);
  return <CheckoutReturnView result={result} />;
}
