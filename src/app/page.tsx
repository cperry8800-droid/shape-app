// Root route — logged-out visitors get the new cinematic home page
// (/newdesign/index.html; it self-redirects mobile to the app page).
// Logged-in users skip straight to their dashboard.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/newdesign/ClientDashboard.html');
  }

  redirect('/newdesign/index.html');
}
