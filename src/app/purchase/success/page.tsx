// Stripe's return page for a one-time purchase, and for the website and app checkouts that send
// their subscriptions here (/api/stripe/checkout-session's default successPath). It checks the
// checkout before it says anything (client-onboarding review, fix 3c: M11): it used to say the
// payment had gone through whatever had happened.

import { CheckoutReturnView } from '@/components/CheckoutReturnView';
import { readCheckoutReturn } from '@/lib/checkout-return';

export const metadata = { title: 'Your payment — Shape' };
export const dynamic = 'force-dynamic';

export default async function PurchaseSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const result = await readCheckoutReturn(sessionId);
  return <CheckoutReturnView result={result} />;
}
