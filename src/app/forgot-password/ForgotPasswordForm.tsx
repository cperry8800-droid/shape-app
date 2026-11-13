'use client';

import { useActionState, useState, useEffect } from 'react';
import { requestPasswordReset } from '../login/actions';
import Turnstile, { turnstileEnabled } from '@/components/Turnstile';
import styles from '@/components/auth-scene.module.css';

type State = { error: string } | { ok: true; email: string } | null;

async function resetAction(_prev: State, formData: FormData): Promise<State> {
  const email = formData.get('email') as string;
  const result = await requestPasswordReset(formData);
  if ('error' in result) return result;
  return { ok: true, email };
}

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(resetAction, null);
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaPending = turnstileEnabled() && !captchaToken && !captchaUnavailable;

  // Turnstile tokens are single-use; a failed request already spent it. Reset +
  // remount a fresh widget so a retry isn't blocked by a stale token.
  useEffect(() => {
    if (state && 'error' in state) {
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
    }
  }, [state]);

  if (state && 'ok' in state) {
    return (
      <div role="status" className={styles.ok}>
        <strong>Check your email.</strong>
        If {state.email} has a Shape account, a link to set a new password is on its way. It works once, for a
        limited time, in any browser.
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          className={styles.input}
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      {state && 'error' in state ? (
        <div role="alert" className={styles.err}>
          {state.error}
        </div>
      ) : null}

      <div className={styles.captcha}>
        <Turnstile key={captchaKey} onToken={setCaptchaToken} onUnavailable={() => setCaptchaUnavailable(true)} />
      </div>

      <button type="submit" className={styles.submit} disabled={pending || captchaPending}>
        {pending ? 'Sending…' : captchaPending ? 'Confirming you’re human…' : 'Send reset link →'}
      </button>
    </form>
  );
}
