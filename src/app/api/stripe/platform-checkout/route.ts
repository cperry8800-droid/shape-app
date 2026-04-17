// Platform checkout — creates a Stripe Checkout Session for the $5/mo Shape
// Platform membership (the public "pricing" tier, distinct from the per-trainer
// and per-nutritionist subscriptions handled by /subscribe).
//
// Flow:
//   pricing.html → POST /api/stripe/platform-checkout
//   → redirect to Stripe-hosted checkout
//   → success_url returns to /subscribe/success
//
// Auth: accepts a Supabase Bearer token from legacy /public pages. If the
// caller isn't signed in, the client-side button sends them to
// signup-client.html first; the API returns 401 with a redirect hint.
//
// Pricing: we use the STRIPE_PLATFORM_PRICE_ID env var. This should be set to
// a recurring $5/month price you've created in the Stripe dashboard for the
// "Shape Platform" product.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

type Body = { successPath?: string; cancelPath?: string };

export async function POST(request: Request) {
  const priceId = process.env.STRIPE_PLATFORM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { error: 'Platform price is not configured. Set STRIPE_PLATFORM_PRICE_ID.' },
      { status: 500 }
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  // Resolve user — cookie session (Next.js pages) OR Bearer token (legacy).
  let userEmail: string | null = null;
  let userId: string | null = null;

  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
    }
    const token = bearerMatch[1];
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    if (data.user) {
      userId = data.user.id;
      userEmail = data.user.email ?? null;
    }
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      userId = data.user.id;
      userEmail = data.user.email ?? null;
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Not signed in.', redirectTo: '/signup-client.html?next=/pricing.html' },
      { status: 401 }
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const successPath = body.successPath || '/subscribe/success';
  const cancelPath = body.cancelPath || '/pricing.html?error=subscribe_cancelled';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail ?? undefined,
      client_reference_id: userId,
      metadata: {
        client_id: userId,
        plan: 'shape_platform',
      },
      subscription_data: {
        metadata: {
          client_id: userId,
          plan: 'shape_platform',
        },
      },
      success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[shape-app] platform-checkout error', err);
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
  }
}
