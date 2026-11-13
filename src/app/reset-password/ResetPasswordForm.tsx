'use client';

// The set-password form (./page.tsx). An account with two-factor sign-in gives its authenticator code
// with the new password, and the action verifies it before it saves (login/actions.ts updatePassword).
// The fields are held in state, so a refused code or password keeps what was typed: React clears an
// uncontrolled form after its action runs.

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { updatePassword, type UpdatePasswordResult } from '../login/actions';
import styles from '@/components/auth-scene.module.css';

// `local`: caught in the browser (the two passwords differ), so the server was not asked.
type State = (UpdatePasswordResult & { local?: boolean }) | null;

async function updateAction(prev: State, formData: FormData): Promise<State> {
  const pw = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  // A code verified on an earlier try leaves the session past the second factor: the field stays gone,
  // unless the server asks for a code again.
  const codeDone = !!prev?.codeDone;
  // A mismatch is caught here, before the server: whatever the server last asked (the code) still stands.
  if (pw !== confirm) return { error: 'Those two passwords don’t match.', codeDone, needsCode: prev?.needsCode, local: true };
  const result = await updatePassword(formData);
  if (!result) return null;
  return { ...result, codeDone: result.needsCode ? false : codeDone || !!result.codeDone };
}

export default function ResetPasswordForm({ askCode }: { askCode: boolean }) {
  const [state, formAction, pending] = useActionState<State, FormData>(updateAction, null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [lastState, setLastState] = useState<State>(null);
  // The server asking for the code always shows the field; the page's own ask holds until a code passes.
  const codeAsked = !!state?.needsCode || (askCode && !state?.codeDone);

  // A code the server refused is cleared so the next one goes in clean (the passwords stay).
  if (state !== lastState) {
    setLastState(state);
    if (state?.needsCode && !state.local && code) setCode('');
  }

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <div className={styles.labelrow}>
          <label className={styles.label} htmlFor="password">
            New password
          </label>
        </div>
        <div className={styles.pw}>
          <input
            id="password"
            name="password"
            className={styles.input}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 characters at least"
          />
          <button type="button" className={styles.reveal} onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          className={styles.input}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="The same again"
        />
      </div>

      {codeAsked ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="code">
            Authenticator code
          </label>
          <p className={styles.hint} id="code-hint">
            Two-factor sign-in is on for this account. Enter the 6-digit code your authenticator app shows for Shape.
          </p>
          <input
            id="code"
            name="code"
            className={`${styles.input} ${styles.code}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            required
            aria-describedby="code-hint"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="••••••"
          />
        </div>
      ) : null}

      {state?.error ? (
        <div role="alert" className={styles.err}>
          {state.error}
          {state.expired ? (
            <>
              {' '}
              <Link href="/forgot-password">Ask for a new link</Link>.
            </>
          ) : null}
        </div>
      ) : null}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? 'Saving…' : 'Save new password →'}
      </button>

      {codeAsked ? (
        <p className={styles.hint} style={{ margin: 0, textAlign: 'center' }}>
          Lost the app? An owner can reset your two-factor from the Staff page.
        </p>
      ) : null}
    </form>
  );
}
