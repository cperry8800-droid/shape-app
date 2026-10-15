// Stripe's return page for a coach subscription started from /subscribe. The webhook is the source
// of truth for the subscription row; this page checks the checkout before it says anything
// (client-onboarding review, fix 3c: M11). It used to say "Payment confirmed" whatever had happened.

import { CheckoutReturnView } from '@/components/CheckoutReturnView';
import { readCheckoutReturn } from '@/lib/checkout-return';

export const metadata = { title: 'Your subscription — Shape' };
export const dynamic = 'force-dynamic';

export default async function SubscribeSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const result = await readCheckoutReturn(sessionId);
  return <CheckoutReturnView result={result} />;
}
