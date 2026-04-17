// One-time purchase landing — takes ?role=trainer|nutritionist&id=<id>&kind=booking|meal_plan
// and shows the provider + price, then a submit button that calls
// startOneTimeCheckout. Same shape as /subscribe but for mode=payment.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { startOneTimeCheckout } from './actions';

export const metadata = { title: 'Checkout — Shape' };

type Props = {
  searchParams: Promise<{
    role?: string;
    id?: string;
    kind?: string;
    workout_id?: string;
    plan_id?: string;
  }>;
};

export default async function PurchasePage({ searchParams }: Props) {
  const sp = await searchParams;
  const role = sp.role === 'trainer' || sp.role === 'nutritionist' ? sp.role : null;
  const kind = sp.kind === 'booking' || sp.kind === 'meal_plan' ? sp.kind : null;
  const id = sp.id ? Number(sp.id) : NaN;
  const workoutId = sp.workout_id ? Number(sp.workout_id) : null;
  const planId = sp.plan_id ? Number(sp.plan_id) : null;

  if (!role || !kind || !Number.isFinite(id) || id <= 0) {
    return <ErrorShell message="Invalid purchase link. Missing role, kind, or provider id." />;
  }

  if (role === 'trainer' && kind !== 'booking') {
    return <ErrorShell message="Trainers only offer bookings, not meal plans." />;
  }
  if (role === 'nutritionist' && kind !== 'meal_plan') {
    return <ErrorShell message="Nutritionists only offer meal plans, not bookings." />;
  }

  const supabase = await createClient();
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  const priceCol = kind === 'booking' ? 'session_price' : 'meal_plan_price';

  const { data: provider, error } = await supabase
    .from(table)
    .select(`id, name, specialty, price, ${priceCol}`)
    .eq('id', id)
    .maybeSingle();

  if (error || !provider) {
    return <ErrorShell message={`We couldn't find that ${role}.`} />;
  }

  // If a specific workout / plan is targeted, pull that row and use its price
  // + name so the checkout screen shows the actual item, not the generic
  // provider-level fee.
  let itemName: string | null = null;
  let itemPrice: number | null = null;
  if (role === 'trainer' && Number.isFinite(workoutId) && workoutId) {
    const { data: wk } = await supabase
      .from('trainer_workouts')
      .select('id, name, price')
      .eq('id', workoutId)
      .maybeSingle();
    if (wk) {
      itemName = (wk as { name: string }).name;
      itemPrice = (wk as { price: number | null }).price ?? null;
    }
  }
  if (role === 'nutritionist' && Number.isFinite(planId) && planId) {
    const { data: pl } = await supabase
      .from('nutritionist_plans')
      .select('id, name, price')
      .eq('id', planId)
      .maybeSingle();
    if (pl) {
      itemName = (pl as { name: string }).name;
      itemPrice = (pl as { price: number | null }).price ?? null;
    }
  }

  const row = provider as { id: number; name: string; specialty: string | null; price: number | null } & Record<string, number | null>;
  const price = itemPrice ?? row[priceCol] ?? row.price ?? null;
  const priceDisplay = price && price > 0 ? `$${Number(price).toFixed(0)}` : 'Contact for pricing';
  const label = itemName
    ? role === 'trainer' ? 'Buy workout plan' : 'Buy meal plan'
    : kind === 'booking' ? 'Book a session' : 'Buy meal plan';
  const sub = itemName
    ? 'One-time purchase · no subscription'
    : kind === 'booking' ? 'One-time session fee · no subscription' : 'One-time meal plan · no subscription';
  const displayName = itemName ? `${row.name} — ${itemName}` : row.name;

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '160px 24px 80px', textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', marginBottom: 14 }}>
        {label}
      </div>
      <h1 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: 10 }}>
        {displayName}
      </h1>
      {row.specialty && (
        <p style={{ color: 'rgba(255,255,255,0.62)', marginBottom: 36, fontWeight: 300 }}>{row.specialty}</p>
      )}

      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.09)', padding: '32px 28px', marginBottom: 24 }}>
        <div style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 300, letterSpacing: '-0.03em', marginBottom: 6 }}>
          {priceDisplay}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {sub}
        </div>

        <form action={startOneTimeCheckout} style={{ marginTop: 28 }}>
          <input type="hidden" name="provider_role" value={role} />
          <input type="hidden" name="provider_id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          {workoutId ? <input type="hidden" name="workout_id" value={workoutId} /> : null}
          {planId ? <input type="hidden" name="plan_id" value={planId} /> : null}
          <button
            type="submit"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '14px 28px', fontSize: '0.82rem', fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid #2DD4BF',
              background: '#2DD4BF', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Continue to payment →
          </button>
        </form>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.42)' }}>
        You&rsquo;ll be taken to Stripe to complete checkout. We never store card details on Shape.
      </p>

      <div style={{ marginTop: 40, fontSize: '0.78rem' }}>
        <a href={`/${role}-profile.html?id=${id}`} style={{ color: 'rgba(255,255,255,0.62)' }}>
          ← Back to profile
        </a>
      </div>
    </main>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '160px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 300, marginBottom: 16 }}>Can&rsquo;t start checkout</h1>
      <p style={{ color: 'rgba(255,255,255,0.62)', marginBottom: 32 }}>{message}</p>
      <Link
        href="/trainers"
        style={{
          display: 'inline-block', padding: '12px 28px', fontSize: '0.82rem', fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.22)',
          color: '#fff', textDecoration: 'none',
        }}
      >
        Browse trainers
      </Link>
    </main>
  );
}
