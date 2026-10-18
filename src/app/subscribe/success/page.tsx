// Stripe's return page for a coach subscription started from /subscribe. The webhook is the source
// of truth for the subscription row; this page checks the checkout before it says anything
// (client-onboarding review, fix 3c: M11). It used to say "Payment confirmed" whatever had happened.

import { CheckoutReturnView } from '@/components/CheckoutReturnView';
import { readCheckoutReturn } from '@/lib/checkout-return';

export const metadata = { title: 'Your subscription — Shape' };
export const dynamic = 'force-dynamic';

export default async function SubscribeSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string; acct?: string | string[] }> }) {
  // acct: the coach's connected account a direct-charge checkout was made on (checked against the
  // coaches on record inside readCheckoutReturn before it is used).
  const { session_id: sessionId, acct } = await searchParams;
  const result = await readCheckoutReturn(sessionId, acct);
  return <CheckoutReturnView result={result} />;
}
