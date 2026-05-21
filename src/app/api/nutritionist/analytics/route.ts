// Live data for the newdesign Nutritionist "Analytics" page.
// Real business metrics (recurring revenue, roster, sessions) read over
// existing tables, plus real Stripe Connect payout history for the
// nutritionist's connected account. RLS scopes the Supabase queries to the
// signed-in nutritionist. The compliance / at-risk / correlation surfaces
// are intentionally absent — they need per-client analytics with no backing.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeSummary = {
  connected: boolean;
  status: string;
  balanceCents: number | null;
  payouts: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    arrivalDate: number | null;
    created: number;
  }>;
};

async function loadStripe(
  accountId: string | null,
  accountStatus: string | null
): Promise<StripeSummary> {
  if (!accountId) {
    return { connected: false, status: accountStatus ?? 'not_connected', balanceCents: null, payouts: [] };
  }
  try {
    const [balance, payoutList] = await Promise.all([
      stripe.balance.retrieve({ stripeAccount: accountId }),
      stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),
    ]);
    const balanceCents = (balance.available ?? []).reduce((sum, b) => sum + b.amount, 0);
    const payouts = payoutList.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      currency: p.currency,
      status: p.status,
      arrivalDate: p.arrival_date ? p.arrival_date * 1000 : null,
      created: p.created * 1000,
    }));
    return { connected: true, status: accountStatus ?? 'connected', balanceCents, payouts };
  } catch {
    return { connected: true, status: accountStatus ?? 'error', balanceCents: null, payouts: [] };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!nutriRow) {
    return NextResponse.json({ isNutritionist: false });
  }

  const providerId = nutriRow.id;

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('price_cents, status')
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);
  const subs = subRows ?? [];
  const grossCents = subs.reduce(
    (sum: number, r: { price_cents: number | null }) => sum + (r.price_cents ?? 0),
    0
  );

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('scheduled_at, status')
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId)
    .limit(1000);
  const sessions = sessRows ?? [];

  const now = Date.now();
  let completedSessions = 0;
  let upcomingSessions = 0;
  for (const s of sessions) {
    if (s.status === 'completed') {
      completedSessions += 1;
    } else if (
      (s.status === 'requested' || s.status === 'confirmed') &&
      new Date(s.scheduled_at).getTime() >= now
    ) {
      upcomingSessions += 1;
    }
  }

  const stripeSummary = await loadStripe(
    nutriRow.stripe_account_id ?? null,
    nutriRow.stripe_account_status ?? null
  );

  return NextResponse.json({
    isNutritionist: true,
    metrics: {
      mrrGrossCents: grossCents,
      mrrNetCents: Math.round(grossCents * 0.85),
      activeClients: subs.length,
      totalSessions: sessions.length,
      completedSessions,
      upcomingSessions,
    },
    stripe: stripeSummary,
  });
}
