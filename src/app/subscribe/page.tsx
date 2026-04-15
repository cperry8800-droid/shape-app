// Subscribe landing — takes ?role=trainer|nutritionist&id=<providerId> query
// params, shows the provider name + price, and a big Subscribe button that
// POSTs to the startCheckout server action. If not signed in, the action
// itself bounces to /login?next= so no pre-check needed here.
//
// The legacy static profile pages link here (e.g. /subscribe?role=trainer&id=2).

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { startCheckout } from './actions';

export const metadata = { title: 'Subscribe — Shape' };

type Props = {
  searchParams: Promise<{ role?: string; id?: string }>;
};

export default async function SubscribePage({ searchParams }: Props) {
  const { role: roleRaw, id: idRaw } = await searchParams;
  const role = roleRaw === 'trainer' || roleRaw === 'nutritionist' ? roleRaw : null;
  const id = idRaw ? Number(idRaw) : NaN;

  if (!role || !Number.isFinite(id) || id <= 0) {
    return <ErrorShell message="Invalid subscribe link. Missing role or provider id." />;
  }

  const supabase = await createClient();
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider, error } = await supabase
    .from(table)
    .select('id, name, specialty, price')
    .eq('id', id)
    .maybeSingle();

  if (error || !provider) {
    return <ErrorShell message={`We couldn't find that ${role}.`} />;
  }

  const row = provider as { id: number; name: string; specialty: string | null; price: number | null };
  const priceDisplay =
    row.price && row.price > 0 ? `$${Number(row.price).toFixed(0)}/mo` : 'Contact for pricing';

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '160px 24px 80px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.42)',
          marginBottom: 14,
        }}
      >
        Subscribe to {role}
      </div>
      <h1
        style={{
          fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)',
          fontWeight: 300,
          letterSpacing: '-0.04em',
          lineHeight: 1.15,
          marginBottom: 10,
        }}
      >
        {row.name}
      </h1>
      {row.specialty && (
        <p style={{ color: 'rgba(255,255,255,0.62)', marginBottom: 36, fontWeight: 300 }}>
          {row.specialty}
        </p>
      )}

      <div
        style={{
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.09)',
          padding: '32px 28px',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
            fontWeight: 300,
            letterSpacing: '-0.03em',
            marginBottom: 6,
          }}
        >
          {priceDisplay}
        </div>
        <div
          style={{
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.42)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Billed monthly · cancel anytime
        </div>

        <form action={startCheckout} style={{ marginTop: 28 }}>
          <input type="hidden" name="provider_role" value={role} />
          <input type="hidden" name="provider_id" value={id} />
          <button
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '14px 28px',
              fontSize: '0.82rem',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: '1px solid #2DD4BF',
              background: '#2DD4BF',
              color: '#0a0a0a',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            Continue to payment →
          </button>
        </form>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.42)' }}>
        You&rsquo;ll be taken to Stripe to complete checkout. We never store card details on
        Shape.
      </p>

      <div style={{ marginTop: 40, fontSize: '0.78rem' }}>
        <Link href={`/${role}-profile.html?id=${id}`} style={{ color: 'rgba(255,255,255,0.62)' }}>
          ← Back to profile
        </Link>
      </div>
    </main>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '160px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 300, marginBottom: 16 }}>
        Can&rsquo;t start subscription
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.62)', marginBottom: 32 }}>{message}</p>
      <Link
        href="/trainers"
        style={{
          display: 'inline-block',
          padding: '12px 28px',
          fontSize: '0.82rem',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          border: '1px solid rgba(255,255,255,0.22)',
          color: '#fff',
          textDecoration: 'none',
        }}
      >
        Browse trainers
      </Link>
    </main>
  );
}
