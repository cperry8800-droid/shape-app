import ForgotForm from './ForgotForm';

export const metadata = { title: 'Reset password — Shape' };

export default function ForgotPasswordPage() {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Forgot your password?</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Enter your email and we&rsquo;ll send you a reset link.
      </p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <ForgotForm />
      </div>
    </main>
  );
}
