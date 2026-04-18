// Env health check. Returns booleans only — never the actual values.
// Hit https://theshapecommunity.com/api/health to verify which env vars
// are wired in prod. Safe to leave exposed (no secrets in response).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function suffix(value: string | undefined): string | null {
  if (!value || value.length < 4) return null;
  return `…${value.slice(-4)}`;
}

function keyMode(value: string | undefined): 'live' | 'test' | 'missing' | 'unknown' {
  if (!value) return 'missing';
  if (value.startsWith('sk_live_') || value.startsWith('pk_live_')) return 'live';
  if (value.startsWith('sk_test_') || value.startsWith('pk_test_')) return 'test';
  return 'unknown';
}

export async function GET() {
  const env = process.env;
  return NextResponse.json(
    {
      site: {
        NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL ?? null,
      },
      stripe: {
        STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY,
        STRIPE_SECRET_KEY_mode: keyMode(env.STRIPE_SECRET_KEY),
        STRIPE_SECRET_KEY_suffix: suffix(env.STRIPE_SECRET_KEY),
        STRIPE_WEBHOOK_SECRET: !!env.STRIPE_WEBHOOK_SECRET,
        STRIPE_WEBHOOK_SECRET_suffix: suffix(env.STRIPE_WEBHOOK_SECRET),
        STRIPE_PLATFORM_PRICE_ID: !!env.STRIPE_PLATFORM_PRICE_ID,
      },
      supabase: {
        NEXT_PUBLIC_SUPABASE_URL: !!env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
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
