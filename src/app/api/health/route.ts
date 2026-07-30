// Env health check — ADMIN ONLY. Returns booleans only, never the actual values.
//
// ⚠ THIS ROUTE WAS UNAUTHENTICATED AND ITS OWN HEADER WAS WRONG.
//
// It said "Safe to leave exposed (no secrets in response)" while returning
// `…abcd` — the LAST FOUR CHARACTERS of STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET — plus live-vs-test key mode and a complete map of which
// integrations are provisioned. Anyone could curl it and learn that the platform
// runs live Stripe keys, which services are wired, the sender identity to
// impersonate in a phish, and four known characters of the webhook signing secret
// (enough to confirm a rotation, or to correlate a partial secret leaked
// elsewhere).
//
// A boolean map of the infrastructure is reconnaissance even without the
// suffixes, so the fix is BOTH: the suffixes are gone, and the route sits behind
// the same admin gate as /warroom and /console. A non-admin gets 404, not 403 —
// an unauthorized caller has no business learning the route exists.
//
// requireAdminUser() THROWS rather than returning null, so the gate is a
// try/catch. Written that way deliberately: a bare `await` would reject the
// request with a 500 stack, which both leaks and looks like an outage.
//
// Found by an access-control audit, 2026-07-30.

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function keyMode(value: string | undefined): 'live' | 'test' | 'missing' | 'unknown' {
  if (!value) return 'missing';
  if (value.startsWith('sk_live_') || value.startsWith('pk_live_')) return 'live';
  if (value.startsWith('sk_test_') || value.startsWith('pk_test_')) return 'test';
  return 'unknown';
}

export async function GET() {
  try {
    await requireAdminUser();
  } catch {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const env = process.env;
  return NextResponse.json(
    {
      site: {
        NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL ?? null,
      },
      stripe: {
        STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY,
        STRIPE_SECRET_KEY_mode: keyMode(env.STRIPE_SECRET_KEY),
        STRIPE_WEBHOOK_SECRET: !!env.STRIPE_WEBHOOK_SECRET,
        STRIPE_PLATFORM_PRICE_ID: !!env.STRIPE_PLATFORM_PRICE_ID,
      },
      supabase: {
        NEXT_PUBLIC_SUPABASE_URL: !!env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
      },
      integrations: {
        STRAVA_CLIENT_ID: !!env.STRAVA_CLIENT_ID,
        STRAVA_CLIENT_SECRET: !!env.STRAVA_CLIENT_SECRET,
      },
      ai: {
        OPENAI_API_KEY: !!env.OPENAI_API_KEY,
        OPENAI_MODEL: env.OPENAI_MODEL ?? null,
      },
      email: {
        RESEND_API_KEY: !!env.RESEND_API_KEY,
        RESEND_FROM: env.RESEND_FROM ?? null,
      },
      runtime: {
        VERCEL_ENV: env.VERCEL_ENV ?? null,
        NODE_ENV: env.NODE_ENV ?? null,
        deployed_at: new Date().toISOString(),
      },
    },
    {
      headers: {
        'cache-control': 'no-store, max-age=0',
      },
    }
  );
}
