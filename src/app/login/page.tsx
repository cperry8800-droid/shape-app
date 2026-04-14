// Login page — email + password via Supabase Auth.

import LoginForm from './LoginForm';

export const metadata = { title: 'Log in — Shape' };

export default function LoginPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Welcome back</h1>
      <p className="text-sm text-neutral-400 mb-8">Sign in to continue to Shape.</p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
