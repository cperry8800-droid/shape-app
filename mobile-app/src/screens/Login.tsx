// Email/password sign-in screen. Renders when there is no Supabase session.
// On success, App.tsx swaps to the main tabbed UI.

import { useState, type FormEvent } from 'react';
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // App.tsx's onAuthStateChange listener will route us forward.
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not authenticate.');
    } finally {
      setBusy(false);
    }
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

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 999,
            background: 'var(--teal)', color: 'var(--paper)', border: 0,
            fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
        style={{
          marginTop: 18, width: '100%', padding: '10px 18px', borderRadius: 999,
          background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border)',
          fontFamily: 'inherit', fontSize: 13,
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  background: 'rgba(242,237,228,0.04)',
  border: '1px solid var(--border)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 15,
  boxSizing: 'border-box',
};
