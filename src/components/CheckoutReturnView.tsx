// The page a member lands on after a Stripe checkout (client-onboarding review, fix 3c: M11). It says
// what readCheckoutReturn found and nothing more: paid, still clearing, not completed, or not
// something this page can confirm. Shared by /purchase/success and /subscribe/success.

import Link from 'next/link';
import { checkoutReturnCopy, type CheckoutReturn } from '@/lib/checkout-return';

export function CheckoutReturnView({ result }: { result: CheckoutReturn }) {
  const c = checkoutReturnCopy(result);
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-white" data-checkout-return={result.state}>
      <h1 className="text-3xl font-light tracking-tight mb-3">{c.title}</h1>
      <p className="text-sm text-neutral-400 mb-6">{c.body}</p>
      <Link
        href={c.cta.href}
        className="inline-block text-sm font-medium bg-white text-neutral-950 rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
      >
        {c.cta.label}
      </Link>
    </main>
  );
}
