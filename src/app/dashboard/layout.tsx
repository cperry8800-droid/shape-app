// Dashboard shell. Any route under /dashboard is gated: if you're not signed
// in, you're bounced to /login. If you're signed in but have no profile row
// yet (e.g. mid email-confirm), we render a small "finishing setup" notice.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserAndProfile } from '@/lib/queries';
import { logout } from '@/app/login/actions';
import { getAdminEmails } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';

const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due']);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCurrentUserAndProfile();
  if (!ctx) redirect('/login');

  const { profile, email, userId } = ctx;
  const role = profile?.role ?? 'client';
  const isAdmin = Boolean(email && getAdminEmails().includes(email.toLowerCase()));

  // App-wide member gate (same rule as the mobile app): approved coaches and
  // admins get in free; everyone else needs an active platform subscription.
  const isCoach = role === 'trainer' || role === 'nutritionist';
  let isMember = isCoach || isAdmin;
  if (!isMember) {
    const supabase = await createClient();
    const { data: sub } = await supabase
      .from('platform_subscriptions')
      .select('status')
      .eq('client_id', userId)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    isMember = Boolean(sub && ACTIVE_SUB.has(String(sub.status)));
  }

  // The user-facing dashboards moved to the newdesign portal
  // (public/newdesign/*.html). Only the admin tools still live under
  // /dashboard, so the nav is just those.
  const tabs: { href: string; label: string; show: boolean }[] = [
    { href: '/dashboard/applications', label: 'Applications', show: isAdmin },
    { href: '/dashboard/refunds', label: 'Refunds', show: isAdmin },
    { href: '/dashboard/claim', label: 'Claim profile', show: isAdmin },
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

      {isMember ? (
        children
      ) : (
        <div className="rounded-2xl border border-teal-400/30 bg-gradient-to-b from-teal-400/10 to-transparent px-6 py-12 text-center max-w-xl mx-auto">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-xs uppercase tracking-[0.18em] text-teal-400 mb-3">Members only</div>
          <h2 className="text-3xl font-light tracking-tight mb-2">Shape is for members.</h2>
          <p className="text-sm text-neutral-400 leading-relaxed mb-7 max-w-md mx-auto">
            Become a Shape member for $5/month to unlock your training, nutrition,
            coaching, community and rewards — everything Shape does.
          </p>
          <Link
            href="/pricing"
            className="inline-block text-sm font-semibold bg-teal-400 text-neutral-950 rounded-full px-6 py-3 hover:bg-teal-300 transition-colors"
          >
            Become a member · $5/mo →
          </Link>
          <p className="text-xs text-neutral-600 mt-5">Approved coaches have full access at no charge.</p>
        </div>
      )}
    </main>
  );
}
