// Today's Money card: the coach's next payout, from Stripe (the owner's answer to #2628, 2026-11-06).
//
// GET /api/coach/next-payout?role=trainer|nutritionist
//   200 { isProvider: false }                                     no listing of that role on this account
//   200 { isProvider: true, connected: false }                    no Stripe account linked yet
//   200 { isProvider: true, connected: true, error: true }        linked, but Stripe couldn't be read
//   200 { isProvider: true, connected: true, next: Payout|null }  the earliest payout pending or in transit
//   400 not a coach's role · 401 signed out · 503 the sign-in check failed · 500 the listing read failed
//   Payout = { amountCents, currency, arrivalDate (ms, Stripe's arrival day), status }
//
// ⚠ THE BUSINESS PAGE'S SOURCE, NOT A SECOND ONE. The analytics routes read the listing's own
// stripe_account_id and ask Stripe through src/lib/stripe.ts loadStripe; this reads the same row and
// the same helper, and "next" is the rule Business prints (coachForecast.js moneyFrom: of the
// payouts in transit or pending, the soonest to land). It is its own small route because the
// analytics read is the whole Business rollup (subscriptions, trajectory, names, renewals), which
// Today has no use for.
// ⚠ A FAILED READ IS NEVER "NO PAYOUT": Stripe unreachable answers error (loadStripe flags it), a
// failed listing read a 500, an auth outage a 503 (src/lib/auth-lookup.ts), and the card says each.
// Read-only, under the caller's own session (RLS scopes the listing to its owner): the cookie on the
// website, the Bearer token in the installed app. Private, never cached.

import { NextResponse } from 'next/server';
import { clientForRequest, userLookupForRequest } from '@/lib/request-auth';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';
import { loadStripe } from '@/lib/stripe';
// A pure UMD module (module.exports = api), as src/app/api/exercises/route.ts imports dashBuilderCore.js.
import CoachForecast from '../../../../../public/newdesign/coachForecast.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

// Each coach role's listing table: a trainer's row and a nutritionist's are separate listings, and
// one account can own both (each with its own connected account).
const LISTING_TABLE: Record<string, string> = { trainer: 'trainers', nutritionist: 'nutritionists' };

type Payout = { amountCents: number; currency: string; status: string; arrivalDate: number | null };
const forecast = CoachForecast as unknown as { moneyFrom: (stripe: unknown) => { next: Payout | null } };

export async function GET(request: Request) {
  const role = new URL(request.url).searchParams.get('role') ?? '';
  const table = Object.prototype.hasOwnProperty.call(LISTING_TABLE, role) ? LISTING_TABLE[role] : null;
  if (!table) return privateJson({ error: 'Ask for a trainer or nutritionist payout.' }, { status: 400 });

  const { user, error: authErr } = await userLookupForRequest(request);
  if (!user) {
    // An unreachable auth server is not a signed-out visitor: the card reads a 503 as unread.
    if (!isMeasuredSignedOut(authErr)) {
      console.warn('[shape-app] next payout: the sign-in check failed — answering 503, not 401:', authErr?.message);
      return privateJson({ error: 'Could not check your sign-in just now.' }, { status: 503 });
    }
    return privateJson({ error: 'Authentication required.' }, { status: 401 });
  }

  const supabase = await clientForRequest(request);
  const { data: listing, error: listingErr } = await supabase
    .from(table)
    .select('id, stripe_account_id, stripe_account_status')
    .eq('owner_id', user.id)
    .maybeSingle();
  // A failed read is not "this account has no listing", and not "payouts aren't connected".
  if (listingErr) {
    console.warn('[shape-app] next payout: listing read failed:', listingErr.message);
    return privateJson({ error: 'Could not read your listing.' }, { status: 500 });
  }
  if (!listing) return privateJson({ isProvider: false });

  const summary = await loadStripe(listing.stripe_account_id ?? null, listing.stripe_account_status ?? null);
  if (!summary.connected) return privateJson({ isProvider: true, connected: false });
  if (summary.error) return privateJson({ isProvider: true, connected: true, error: true });

  const next = forecast.moneyFrom(summary).next;
  return privateJson({
    isProvider: true,
    connected: true,
    next: next
      ? { amountCents: next.amountCents, currency: next.currency, arrivalDate: next.arrivalDate ?? null, status: next.status }
      : null,
  });
}
