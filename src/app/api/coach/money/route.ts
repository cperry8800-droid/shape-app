// A coach's money, slim: what they collected (this month so far and lifetime on Shape, from the
// coach_payments record, in their own time zone) and their Stripe account's balance, payout schedule
// and recent payouts. For Settings and anything else that needs these without the whole analytics
// rollup (/api/{role}/analytics carries the same `earnings` and `stripe` for the Business page).
//
//   GET ?role=trainer|nutritionist
//   → { isCoach: false } for an account with no listing of that role
//   → { isCoach: true, role, providerId, zone, earnings, stripe }
//     earnings: { state: 'ready', month, lifetime, … } | { state: 'not_set_up' } | { state: 'unread' }
//     stripe:   src/lib/stripe.ts StripeSummary (payouts of the last ~4 months, with the schedule)
//
// ⚠ COLLECTED IS NOT A PAYOUT. `earnings` is what members paid this coach on Shape, less Shape's fee
// (before Stripe's card fees on a direct charge); a payout is what Stripe sent the bank from the
// coach's whole balance. Pages word them apart (coachForecast.js payoutHistory, collectedFrom).
//
// The caller is read from the app's Bearer token or the website's cookie (request-auth.ts), and every
// read runs as them: RLS shows a coach only their own provider row and their own payments.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { loadStripe } from '@/lib/stripe';
import { normalizeZone } from '@/lib/time';
import { coachEarnings } from '../../../../lib/coach-payments.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const roleParam = new URL(request.url).searchParams.get('role');
  const role = roleParam === 'trainer' || roleParam === 'nutritionist' ? roleParam : null;
  if (!role) return NextResponse.json({ error: 'role must be trainer or nutritionist.' }, { status: 400 });
  const supabase = await clientForRequest(request);
  // '*' is migration-safe (timezone came with 2026-09-11-provider-timezone.sql). The lowest id is the
  // account's primary provider row, as owned-provider.ts reads it (an account owns one or two at most).
  const { data: owned, error } = await supabase
    .from(role === 'trainer' ? 'trainers' : 'nutritionists')
    .select('*')
    .eq('owner_id', user.id)
    .order('id', { ascending: true });
  const data = Array.isArray(owned) ? owned[0] ?? null : null;
  if (error) {
    console.warn('[shape-app] coach money: provider row read failed:', error.message);
    return NextResponse.json({ error: 'Could not read your listing.' }, { status: 503 });
  }
  const provider = data as { id: number; timezone?: unknown; stripe_account_id?: string | null; stripe_account_status?: string | null } | null;
  if (!provider) return NextResponse.json({ isCoach: false });
  const zone = normalizeZone(provider.timezone) || 'UTC';
  const now = Date.now();
  const [earnings, stripe] = await Promise.all([
    coachEarnings(supabase, { role, providerId: provider.id, zone, now }),
    loadStripe(provider.stripe_account_id ?? null, provider.stripe_account_status ?? null, now),
  ]);
  return NextResponse.json({ isCoach: true, role, providerId: provider.id, zone, earnings, stripe });
}
