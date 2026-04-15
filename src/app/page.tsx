// Root route. Logged-out visitors get the cinematic horizon-style
// marketing home; logged-in users are sent to their dashboard so the
// existing app experience is untouched.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import HorizonHome from './HorizonHome';

export const metadata = {
  title: 'Shape — Real coaching, powered by community',
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return <HorizonHome />;
}
