// Stripe checkout return page. The webhook is the source of truth for
// creating the subscription row, so here we just confirm to the user and
// send them to their dashboard.

import Link from 'next/link';

export const metadata = { title: 'Subscription confirmed — Shape' };

export default function SubscribeSuccessPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-light tracking-tight mb-2">You&rsquo;re subscribed</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Payment confirmed. Your new coach will show up in your dashboard in a moment.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/dashboard/client"
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-6 py-3 hover:bg-neutral-900 transition-colors"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
