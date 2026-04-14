import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="text-6xl font-light tracking-tight mb-4">404</div>
      <h1 className="text-xl font-medium mb-2">Page not found</h1>
      <p className="text-sm text-neutral-400 mb-8">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>
      <Link
        href="/"
        className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors inline-block"
      >
        Back to home
      </Link>
    </main>
  );
}
