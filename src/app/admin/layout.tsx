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
import { waitingCounts } from '@/lib/admin-waiting';
import { createClient } from '@/lib/supabase/server';
import { LEVEL_LABELS, pagesFor, toolsFor } from '@/lib/staff-levels.mjs';
import AdminSidebar from './AdminSidebar';
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

  // Plain objects for the client sidebar: the label and where it goes.
  const pages = pagesFor(staff.level).map(({ href, label }) => ({ href, label }));
  const tools = toolsFor(staff.level).map(({ href, label }) => ({ href, label }));
  const counts = await waitingCounts(staff.level);

  const account = (
    <div className="flex flex-col gap-1">
      <div className="text-[13px] text-neutral-200 truncate" title={staff.email}>
        {staff.email}
      </div>
      <div className={`${MONO} text-[9.5px] uppercase tracking-[0.16em] text-neutral-500`}>{LEVEL_LABELS[staff.level]}</div>
      <SignOutButton className="mt-2 self-start inline-flex items-center min-h-[36px] px-4 border border-white/15 text-[13px] text-neutral-100 hover:border-white/40 hover:bg-white/5 transition-colors">
        Log out
      </SignOutButton>
    </div>
  );

  return (
    <div className={`${display.variable} ${mono.variable} lg:grid lg:grid-cols-[248px_minmax(0,1fr)] min-h-[100dvh]`}>
      <SentryUser id={staff.id} />
      <AdminSidebar pages={pages} tools={tools} counts={counts} account={account} />
      <main className="min-w-0 px-4 sm:px-6 lg:px-10 py-8 sm:py-10">
        <div className="max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
