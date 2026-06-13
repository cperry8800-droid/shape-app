// Default card on file for the signed-in user — powers the "Payment method" row
// on the Me page billing card. Resolves the stripe_customer_id from any of the
// subscription tables (same as the billing portal), then reads the customer's
// default card from Stripe (brand + last4 only — we never store card data).
// Returns { hasMethod:false } when there's no customer/card; the UI then shows
// the billing-portal link instead of a fabricated card.

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(req);

  const [platform, perCoach] = await Promise.all([
    supabase.from('platform_subscriptions').select('stripe_customer_id').eq('client_id', user.id).not('stripe_customer_id', 'is', null).limit(1).maybeSingle(),
    supabase.from('subscriptions').select('stripe_customer_id').eq('client_id', user.id).not('stripe_customer_id', 'is', null).limit(1).maybeSingle(),
  ]);
  const customerId = platform.data?.stripe_customer_id || perCoach.data?.stripe_customer_id || null;
  if (!customerId) return NextResponse.json({ hasMethod: false });

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (!customer || (customer as { deleted?: boolean }).deleted) return NextResponse.json({ hasMethod: false });

    let card: Stripe.PaymentMethod.Card | null = null;
    const def = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    if (def && typeof def === 'object' && (def as Stripe.PaymentMethod).card) {
      card = (def as Stripe.PaymentMethod).card ?? null;
    }
    if (!card) {
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      card = list.data[0]?.card ?? null;
    }
    if (!card) return NextResponse.json({ hasMethod: false });

    return NextResponse.json({ hasMethod: true, brand: card.brand ?? null, last4: card.last4 ?? null });
  } catch {
    return NextResponse.json({ hasMethod: false });
  }
}
