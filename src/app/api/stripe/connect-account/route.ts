import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ProviderRole = 'trainer' | 'nutritionist';

type Body = {
  role?: string;
  provider_role?: string;
  provider_id?: string | number;
};

async function resolveUser(request: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;
    const token = bearerMatch[1];
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

function normalizeRole(role: unknown): ProviderRole | null {
  const clean = String(role || '').toLowerCase();
  if (clean.includes('nutrition')) return 'nutritionist';
  if (clean.includes('trainer')) return 'trainer';
  return null;
}

export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const providerRole = normalizeRole(body.provider_role || body.role);
  if (!providerRole) return NextResponse.json({ error: 'Invalid provider role.' }, { status: 400 });

  const providerId = Number(body.provider_id || 0);
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const admin = createAdminClient();

  let query = admin.from(table).select('id, name, owner_id, stripe_account_id').eq('owner_id', user.id);
  if (providerId) query = query.eq('id', providerId);
  const { data: provider, error } = await query.order('id', { ascending: true }).limit(1).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!provider) {
    return NextResponse.json({ error: `No ${providerRole} profile found for this account.` }, { status: 404 });
  }

  let accountId = provider.stripe_account_id as string | null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'standard',
      email: user.email ?? undefined,
      metadata: {
        provider_id: String(provider.id),
        provider_role: providerRole,
        owner_id: user.id,
      },
    });
    accountId = account.id;
    await admin
      .from(table)
      .update({ stripe_account_id: accountId, stripe_account_status: 'pending' })
      .eq('id', provider.id);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/api/stripe/connect/refresh?role=${providerRole}&id=${provider.id}`,
    return_url: `${origin}/stripe-onboarding/success?role=${providerRole}&id=${provider.id}`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: link.url });
}
