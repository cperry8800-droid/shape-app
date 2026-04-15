// Server-side Stripe client. Never import this from client components.
// Requires STRIPE_SECRET_KEY in the environment.

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  // Don't throw at module load — pages that don't use Stripe still need to
  // render. We surface the error at the call site instead.
  console.warn('[shape-app] STRIPE_SECRET_KEY is not set — subscribe flow will fail.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_missing', {
  // Pin to a known API version so the SDK types line up.
  apiVersion: '2026-03-25.dahlia',
  appInfo: {
    name: 'Shape',
    url: 'https://theshapecommunity.com',
  },
});
