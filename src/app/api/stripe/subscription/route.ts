// Current platform subscription for the signed-in user — powers the Settings
// "Your plan" card. Reads the latest row from platform_subscriptions (kept in
// sync by the Stripe webhook). Auth accepts the mobile Bearer token or cookie.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE = new Set(['active', 'trialing', 'past_due']);

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const client = await clientForRequest(request);
  const { data, error } = await client
    .from('platform_subscriptions')
    .select('status, price_cents, current_period_end')
    .eq('client_id', user.id)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !ACTIVE.has(String(data.status))) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    status: data.status,
    priceCents: typeof data.price_cents === 'number' ? data.price_cents : null,
    renewsAt: data.current_period_end ?? null,
  });
}
