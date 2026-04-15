// Dashboard shell. Any route under /dashboard is gated: if you're not signed
// in, you're bounced to /login. If you're signed in but have no profile row
// yet (e.g. mid email-confirm), we render a small "finishing setup" notice.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserAndProfile } from '@/lib/queries';
import { logout } from '@/app/login/actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentUserAndProfile();
  if (!ctx) redirect('/login');

  const { profile, email } = ctx;
  const role = profile?.role ?? 'client';

  const tabs: { href: string; label: string; show: boolean }[] = [
    { href: '/dashboard', label: 'Overview', show: true },
    { href: '/dashboard/client', label: 'My Coaches', show: role === 'client' || (profile?.roles ?? []).includes('client') },
    { href: '/dashboard/trainer', label: 'Trainer', show: role === 'trainer' || (profile?.roles ?? []).includes('trainer') },
    { href: '/dashboard/nutritionist', label: 'Nutritionist', show: role === 'nutritionist' || (profile?.roles ?? []).includes('nutritionist') },
    { href: '/dashboard/claim', label: 'Claim profile', show: true },
    { href: '/dashboard/settings', label: 'Settings', show: true },
  ];

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Dashboard</div>
          <h1 className="text-3xl font-light tracking-tight">
            {profile?.full_name || email || 'Welcome'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1 capitalize">
            {profile ? `${role}${(profile.roles ?? []).length > 1 ? ` · +${profile.roles.length - 1} more` : ''}` : 'Profile pending'}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-4 py-2 hover:bg-neutral-900 transition-colors"
          >
            Log out
          </button>
        </form>
      </div>

      <nav className="flex gap-1 flex-wrap border-b border-neutral-800 mb-8">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="text-sm text-neutral-400 hover:text-neutral-100 px-4 py-2.5 border-b-2 border-transparent hover:border-neutral-700 transition-colors -mb-px"
            >
              {t.label}
            </Link>
          ))}
      </nav>

      {!profile && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3 mb-8">
          Finishing up your account setup. If this persists, try signing out and back in.
        </div>
      )}

      {children}
    </main>
  );
}
