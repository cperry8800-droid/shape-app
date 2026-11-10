// Current platform subscription for the signed-in user — powers the Settings
// "Your plan" card. Reads the latest row from platform_subscriptions (kept in
// sync by the Stripe webhook). Auth accepts the mobile Bearer token or cookie.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { PLATFORM_PERK_STATUSES } from '@/lib/membership-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The statuses this card shows a plan for. Only `active` pays for the paid features
// (PLATFORM_PERK_STATUSES); a past-due plan is still shown, as one whose payment failed.
const SHOWN = new Set(['active', 'past_due']);

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

  if (error || !data || !SHOWN.has(String(data.status))) {
    return NextResponse.json({ active: false });
  }

  // ⚠ `active` IS THE PAID FEATURES. It read true for trialing and past_due too, so a member whose
  // card had failed was shown as paid ("im not doing free trials"; "past due just loses the paid
  // percs", owner, 2026-11-10). A past-due plan answers active:false, pastDue:true.
  return NextResponse.json({
    active: PLATFORM_PERK_STATUSES.has(String(data.status)),
    pastDue: data.status === 'past_due',
    status: data.status,
    priceCents: typeof data.price_cents === 'number' ? data.price_cents : null,
    renewsAt: data.current_period_end ?? null,
  });
}
