// Phone login page — SMS OTP via Supabase + Twilio. Supports an optional
// NEXT_PUBLIC_HCAPTCHA_SITE_KEY for client-side CAPTCHA.

import PhoneLoginForm from './PhoneLoginForm';

export const metadata = { title: 'Phone sign-in — Shape' };

export default async function PhoneLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-3xl font-light tracking-tight mb-2">Sign in with phone</h1>
      <p className="text-sm text-neutral-400 mb-8">
        We&rsquo;ll text you a 6-digit code. Standard messaging rates apply.
      </p>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <PhoneLoginForm next={next ?? ''} />
      </div>
    </main>
  );
}
