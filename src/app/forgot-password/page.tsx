import AuthScene from '@/components/AuthScene';
import styles from '@/components/auth-scene.module.css';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata = { title: 'Reset password — Shape' };

// Log in's Forgot? (public/newdesign/login.jsx) and the app's Forgot password land here, drawn as the
// website's Log in page is (AuthScene), so the way back in reads as one flow with Set a new password.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ link?: string }>;
}) {
  const params = await searchParams;
  // /auth/confirm lands here when an emailed sign-in link was used already or has expired.
  const expired = params?.link === 'expired';
  return (
    <AuthScene back={{ href: '/login', label: '← Back to log in' }}>
      <div className={styles.eyebrow}>Account recovery</div>
      <h1 className={styles.title}>
        Reset your <em>password</em>.
      </h1>
      <p className={styles.sub}>
        {expired
          ? 'That link has expired or was already used. Enter your email and we’ll send a new one to set your password.'
          : 'Enter your email and we’ll send a link to set a new one.'}
      </p>
      <ForgotPasswordForm />
      <div className={styles.foot}>
        <span>Remembered it?</span>
        <a href="/login">Log in →</a>
      </div>
    </AuthScene>
  );
}
