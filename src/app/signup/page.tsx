import { Suspense } from 'react';
import SignupForm from './SignupForm';

export const metadata = { title: 'Create account — Shape' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Create your account</h1>
      <p className="text-sm text-neutral-400 mb-8">Join Shape as a client, trainer, or nutritionist.</p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <Suspense><SignupForm defaultRole={role} /></Suspense>
      </div>
    </main>
  );
}
