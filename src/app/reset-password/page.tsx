// Reached via the /auth/callback redirect after clicking the reset email.
// By that point the user has a temporary session and can update their pw.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ResetForm from './ResetForm';

export const metadata = { title: 'New password — Shape' };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Set a new password</h1>
      <p className="text-sm text-neutral-400 mb-8">Choose something you&rsquo;ll remember.</p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <ResetForm />
      </div>
    </main>
  );
}
