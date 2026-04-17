import Link from 'next/link';

export const metadata = { title: 'Payment received — Shape' };

export default function PurchaseSuccessPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-white">
      <h1 className="text-3xl font-light tracking-tight mb-3">Payment received</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Thanks — your payment went through. You can see it in your dashboard; the
        provider will reach out shortly to schedule or deliver.
      </p>
      <Link
        href="/dashboard/client"
        className="inline-block text-sm font-medium bg-white text-neutral-950 rounded-full px-5 py-2.5 hover:bg-white/90 transition-colors"
      >
        Go to dashboard
      </Link>
    </main>
  );
}
