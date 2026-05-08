import { useState, type FormEvent } from 'react';
import { Field, PrimaryAction, SecondaryAction, inputStyle } from '../components/ui';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setInfo('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authenticate.');
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setInfo(null);
  }

  return (
    <div style={{ padding: '60px 20px 20px', maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
        Shape
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 28px' }}>
        {mode === 'signin' ? 'Sign in to continue.' : 'Create your account.'}
      </p>

      <form onSubmit={onSubmit}>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />
        </Field>

        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
        {info && <p style={{ color: 'var(--teal-bright)', fontSize: 13, margin: '0 0 12px' }}>{info}</p>}

        <PrimaryAction type="submit" disabled={busy} style={{ padding: '14px 18px', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </PrimaryAction>
      </form>

      <SecondaryAction onClick={toggleMode} style={{ marginTop: 18, width: '100%' }}>
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </SecondaryAction>
    </div>
  );
}
