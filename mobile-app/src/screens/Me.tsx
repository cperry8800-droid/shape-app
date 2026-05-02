// Me / Profile screen — pulls the signed-in user's client_intakes row from
// Supabase. This is the round-trip that proves mobile ↔ web are sharing data:
// the same row gets written by the web onboarding form and read here.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Intake = {
  first_name: string | null;
  last_name: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  workout_frequency: string | null;
  dietary: string | null;
};

export default function Me() {
  const [email, setEmail] = useState<string | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userResp } = await supabase.auth.getUser();
        const user = userResp.user;
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!cancelled) setEmail(user.email ?? null);
        const { data, error } = await supabase
          .from('client_intakes')
          .select('first_name, last_name, primary_goal, experience_level, workout_frequency, dietary')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setIntake(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 6px' }}>Me</h1>

      {loading && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</p>}
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

      {!loading && (
        <>
          <Card>
            <Eyebrow>ACCOUNT</Eyebrow>
            <Title>{email ?? 'Signed out'}</Title>
          </Card>

          {intake ? (
            <Card>
              <Eyebrow>INTAKE</Eyebrow>
              <Title>{[intake.first_name, intake.last_name].filter(Boolean).join(' ') || 'Profile'}</Title>
              <Row label="Goal" value={intake.primary_goal} />
              <Row label="Experience" value={intake.experience_level} />
              <Row label="Frequency" value={intake.workout_frequency} />
              <Row label="Dietary" value={intake.dietary} />
            </Card>
          ) : (
            <Card>
              <Eyebrow>INTAKE</Eyebrow>
              <Title>No intake yet</Title>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                Finish onboarding on the web to populate this screen.
              </p>
            </Card>
          )}

          <button
            onClick={signOut}
            style={{
              marginTop: 14, padding: '10px 18px', borderRadius: 999,
              background: 'transparent', color: 'var(--ink)',
              border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13,
            }}
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(242,237,228,0.04)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 18,
      marginBottom: 14,
    }}>{children}</div>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.14em', color: 'var(--teal-bright)', marginBottom: 8 }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, letterSpacing: '-0.015em', marginBottom: 6 }}>{children}</div>;
}
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--ink)' }}>{value || '—'}</span>
    </div>
  );
}
