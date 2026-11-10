// The membership's prices, as Stripe holds them (owner, 2026-11-10: $5 a month, or $48 a year).
//
// GET → 200 { monthly: { priceCents, interval } | null, annual: { priceCents, interval } | null }
//   Public: the prices are on the pricing page anyway. `annual` is null when no yearly price is
//   set (STRIPE_PLATFORM_ANNUAL_PRICE_ID), so the screens offer the month only; a price Stripe
//   could not be asked for reads as null too, and the screens fall back to their own words. Read
//   from Stripe at most every ten minutes per server.

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Plan = { priceCents: number; interval: 'month' | 'year' } | null;
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; body: { monthly: Plan; annual: Plan } } | null = null;

async function planOf(priceId: string | undefined, want: 'month' | 'year'): Promise<Plan> {
  if (!priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    const cents = price.unit_amount;
    // ⚠ A price that is not the interval it is named for is no plan: a monthly price set as the
    // yearly one would sell a month as a year.
    if (!price.active || typeof cents !== 'number' || price.recurring?.interval !== want || (price.recurring?.interval_count ?? 1) !== 1) return null;
    return { priceCents: cents, interval: want };
  } catch {
    return null;
  }
}

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const [monthly, annual] = await Promise.all([
      planOf(process.env.STRIPE_PLATFORM_PRICE_ID, 'month'),
      planOf(process.env.STRIPE_PLATFORM_ANNUAL_PRICE_ID, 'year'),
    ]);
    const body = { monthly, annual };
    // Only a full answer is kept: a Stripe blip is asked again next time.
    if ((monthly || !process.env.STRIPE_PLATFORM_PRICE_ID) && (annual || !process.env.STRIPE_PLATFORM_ANNUAL_PRICE_ID)) cache = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=300' } });
  }
  return NextResponse.json(cache.body, { headers: { 'cache-control': 'public, max-age=300' } });
}
