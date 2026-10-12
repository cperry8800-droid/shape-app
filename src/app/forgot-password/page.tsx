import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata = { title: 'Reset password — Shape' };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ link?: string }>;
}) {
  const params = await searchParams;
  // /auth/confirm lands here when an emailed sign-in link was used already or has expired.
  const expired = params?.link === 'expired';
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Reset your password</h1>
      <p className="text-sm text-neutral-400 mb-8">
        {expired
          ? 'That link has expired or was already used. Enter your email and we’ll send a new one to set your password.'
          : "Enter your email and we'll send a reset link."}
      </p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
