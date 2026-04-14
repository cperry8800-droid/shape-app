// Shared top nav. Server component so it can read the Supabase session
// and swap between Log in / Get started and the signed-in chip.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';

const links = [
  { href: '/trainers', label: 'Trainers' },
  { href: '/nutritionists', label: 'Nutritionists' },
  { href: '/gyms', label: 'Gyms' },
];

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-900">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight text-lg">
          Shape
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors hidden sm:inline"
              >
                Dashboard
              </Link>
              <span className="text-sm text-neutral-400 hidden md:inline truncate max-w-[180px]">
                {user.email}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-4 py-2 hover:bg-neutral-900 transition-colors"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors hidden sm:inline"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium bg-teal-400 text-neutral-950 rounded-full px-4 py-2 hover:bg-teal-300 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
