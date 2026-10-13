// Root route — logged-out visitors get the new cinematic home page
// (/newdesign/index.html; it self-redirects mobile to the app page).
// Logged-in users skip straight to their dashboard.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { carriedQuery } from '@/lib/signup-source.mjs';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default async function RootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/newdesign/ClientDashboard.html');
  }

  // A shared link's tags (where a sign-up came from, and a coach's referral) go through the
  // redirect: dropping them here credited every tagged link to the homepage as a direct visit.
  redirect(`/newdesign/index.html${carriedQuery(await searchParams)}`);
}
