// The Shape team's admin console: the Overview's numbers, the Staff page and the activity log,
// with links to the admin tools that predate it. Levels: src/lib/staff-levels.mjs.
//
// The gate here decides who sees the console's frame; it is NOT the only gate. Next renders a
// layout and its page in parallel, so every page and every action checks the level it needs
// itself (requireStaff), and this layout's check only keeps the frame from rendering for a
// visitor or a non-staff account.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';
import SentryUser from '@/components/SentryUser';
import { getStaffMember } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';
import { LEVEL_LABELS, pagesFor, toolsFor } from '@/lib/staff-levels.mjs';

export const metadata = {
  title: 'Shape — Admin',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffMember();
  if (!staff) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // A visitor signs in; a signed-in account that is not staff gets the site's 404, so the
    // console's address says nothing about itself to someone who cannot open it.
    if (!user) redirect('/login?next=/admin');
    notFound();
  }

  const pages = pagesFor(staff.level);
  const tools = toolsFor(staff.level);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <SentryUser id={staff.id} />
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Shape · Admin</div>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight break-all">{staff.email}</h1>
          <p className="text-sm text-neutral-500 mt-1">{LEVEL_LABELS[staff.level]}</p>
        </div>
        <SignOutButton className="text-sm font-medium border border-neutral-700 text-neutral-100 rounded-full px-4 py-2 hover:bg-neutral-900 transition-colors">
          Log out
        </SignOutButton>
      </div>

      <nav className="flex gap-1 flex-wrap border-b border-neutral-800 mb-3" aria-label="Admin console">
        {pages.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="text-sm text-neutral-300 hover:text-neutral-100 px-3 sm:px-4 py-2.5 border-b-2 border-transparent hover:border-neutral-700 transition-colors -mb-px"
          >
            {p.label}
          </Link>
        ))}
      </nav>
      {tools.length > 0 && (
        <nav className="flex gap-x-3 gap-y-1 flex-wrap mb-8 text-xs text-neutral-500" aria-label="Admin tools">
          <span className="uppercase tracking-[0.14em]">Tools</span>
          {tools.map((t) => (
            <Link key={t.href} href={t.href} className="hover:text-neutral-200 transition-colors">
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {tools.length === 0 && <div className="mb-8" />}

      {children}
    </main>
  );
}
