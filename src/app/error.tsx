'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[shape] unhandled error:', error);
  }, [error]);

  return (
    <main className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="text-6xl font-light tracking-tight mb-4">😬</div>
      <h1 className="text-xl font-medium mb-2">Something went wrong</h1>
      <p className="text-sm text-neutral-400 mb-8">
        An unexpected error occurred. You can try again or head back home.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors"
        >
          Try again
        </button>
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
