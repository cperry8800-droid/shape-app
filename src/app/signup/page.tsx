// Signup page — creates a new Supabase Auth user with email + password.

import SignupForm from './SignupForm';

export const metadata = { title: 'Sign up — Shape' };

export default function SignupPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Get started free</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Create your Shape account. No credit card required.
      </p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <SignupForm />
      </div>
    </main>
  );
}
