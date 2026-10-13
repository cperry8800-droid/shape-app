// Two-factor sign-in for the Shape team (src/lib/staff-two-factor.mjs). The proxy sends a staff
// page here when the session has not passed a second factor: the first time, a staff member sets
// up an authenticator app; after that, they enter its code once per sign-in. Then back to the page
// they asked for.
//
// Outside /admin on purpose: the console's layout and pages need the second factor, so they
// cannot be where it is given.

import { notFound, redirect } from 'next/navigation';
import { getStaffSignIn } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';
import { staffNext } from '@/lib/staff-two-factor.mjs';
import StaffTwoFactor from './StaffTwoFactor';

export const metadata = { title: 'Two-factor sign-in — Shape Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function StaffVerifyPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = staffNext(params?.next);
  const signIn = await getStaffSignIn();
  if (!signIn) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // A visitor signs in first; a signed-in account that is not staff gets the site's 404, as
    // the console itself gives it.
    if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
    notFound();
  }
  if (signIn.twoFactor === 'verified') redirect(next);

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-xs uppercase tracking-[0.12em] text-teal-400 mb-1">Shape · Admin</div>
      <h1 className="text-2xl sm:text-3xl font-light tracking-tight">Two-factor sign-in</h1>
      <p className="text-sm text-neutral-400 mt-2 break-all">{signIn.staff.email}</p>
      <div className="mt-8">
        <StaffTwoFactor mode={signIn.twoFactor} next={next} />
      </div>
    </main>
  );
}
