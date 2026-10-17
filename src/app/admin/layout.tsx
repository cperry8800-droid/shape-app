// The Shape team's admin console: the Overview's numbers, the Staff page and the activity log,
// with links to the admin tools that predate it. Levels: src/lib/staff-levels.mjs.
//
// The gate here decides who sees the console's frame; it is NOT the only gate. Next renders a
// layout and its page in parallel, so every page and every action checks the level it needs
// itself (requireStaff), and this layout's check only keeps the frame from rendering for a
// visitor or a non-staff account.

import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { notFound, redirect } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';
import SentryUser from '@/components/SentryUser';
import { getStaffMember } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';
import { LEVEL_LABELS, pagesFor, toolsFor } from '@/lib/staff-levels.mjs';
import AdminNav from './AdminNav';
import { MONO } from './ui';

// The website's titles and labels (public/newdesign), for the console only.
const display = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--font-admin-display' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-admin-mono' });

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

  // Plain objects for the client nav: the label and where it goes.
  const pages = pagesFor(staff.level).map(({ href, label }) => ({ href, label }));
  const tools = toolsFor(staff.level).map(({ href, label }) => ({ href, label }));

  return (
    <main className={`${display.variable} ${mono.variable} max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10`}>
      <SentryUser id={staff.id} />
      <header className="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap pb-5">
        <div className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-accent`}>Shape · Admin console</div>
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0 text-right">
            <div className="text-sm text-neutral-200 truncate max-w-[14rem] sm:max-w-xs" title={staff.email}>
              {staff.email}
            </div>
            <div className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-neutral-500`}>{LEVEL_LABELS[staff.level]}</div>
          </div>
          <SignOutButton className="shrink-0 inline-flex items-center min-h-[40px] px-4 border border-white/15 text-sm text-neutral-100 hover:border-white/40 hover:bg-white/5 transition-colors">
            Log out
          </SignOutButton>
        </div>
      </header>

      <AdminNav pages={pages} tools={tools} />

      <div className="pt-8 sm:pt-10">{children}</div>
    </main>
  );
}
