import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AuthScene from '@/components/AuthScene';
import SignOutButton from '@/components/SignOutButton';
import styles from '@/components/auth-scene.module.css';
import { resetNeedsCode } from '@/lib/password-reset-step.mjs';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata = { title: 'Set a new password — Shape', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// The page the reset email opens (/auth/confirm signs the link's session in, then lands here), in the
// website's Log in look (AuthScene). An account with two-factor sign-in also gives its authenticator
// code here: the link's session has not passed the second factor, and Supabase saves no new password
// until it has (src/lib/password-reset-step.mjs).
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/forgot-password');

  let currentLevel: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    currentLevel = error ? null : ((data?.claims as { aal?: string } | undefined)?.aal ?? null);
  } catch {
    currentLevel = null;
  }
  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp').length;
  const askCode = resetNeedsCode({ currentLevel, verifiedFactors });

  return (
    <AuthScene back={{ href: '/login', label: '← Back to log in' }}>
      <div className={styles.eyebrow}>Account recovery</div>
      <h1 className={styles.title}>
        Set a new <em>password</em>.
      </h1>
      <p className={styles.sub}>
        {user.email ? (
          <>
            For <strong>{user.email}</strong>. It works on the website and in the Shape app.
          </>
        ) : (
          'It works on the website and in the Shape app.'
        )}
      </p>
      <ResetPasswordForm askCode={askCode} />
      <div className={styles.foot}>
        <span>Not your account?</span>
        <SignOutButton>Log out</SignOutButton>
      </div>
    </AuthScene>
  );
}
