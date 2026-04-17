// Start Stripe Connect (Standard) onboarding for a trainer or nutritionist.
//
// POST with JSON { provider_role: 'trainer'|'nutritionist', provider_id: number }.
// The caller must own the provider row (checked via owner_id = auth.uid()).
//
// If the provider doesn't have a Stripe account yet, we create one (Standard
// type, so the trainer gets their own Stripe dashboard and handles taxes,
// payouts, etc. themselves). We then generate a one-time AccountLink and
// return its URL — the client redirects there.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ProviderRole = 'trainer' | 'nutritionist';

// Resolve user from either a Supabase cookie session (Next.js pages) or a
// Bearer token (legacy static HTML dashboards posting via fetch).
async function resolveUser(
  request: Request
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: { provider_role?: string; provider_id?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const providerRole = body.provider_role as ProviderRole;
  const providerId = Number(body.provider_id);
  if (!['trainer', 'nutritionist'].includes(providerRole) || !providerId) {
    return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 });
  }

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();

  const { data: provider } = await admin
    .from(table)
    .select('id, name, owner_id, stripe_account_id')
    .eq('id', providerId)
    .maybeSingle();

  if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  if (provider.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not the provider owner.' }, { status: 403 });
  }

  let accountId = provider.stripe_account_id as string | null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      email: user.email ?? undefined,
      metadata: {
        provider_id: String(providerId),
        provider_role: providerRole,
        owner_id: user.id,
      },
    });
    accountId = account.id;
    await admin
      .from(table)
      .update({ stripe_account_id: accountId, stripe_account_status: 'pending' })
      .eq('id', providerId);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/api/stripe/connect/refresh?role=${providerRole}&id=${providerId}`,
    return_url: `${origin}/stripe-onboarding/success?role=${providerRole}&id=${providerId}`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url });
}
