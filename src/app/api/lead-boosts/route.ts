import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProviderRole = 'trainer' | 'nutritionist';

function normalizeRole(value: unknown): ProviderRole | null {
  const role = String(value ?? '').toLowerCase();
  if (role === 'trainer' || role === 'nutritionist') return role;
  return null;
}

function anonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const client = await clientForRequest(request);
  if (bearerMatch) {
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ?? null;
  }
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = normalizeRole(url.searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'role is required (trainer|nutritionist).' }, { status: 400 });

  const client = anonClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('coach_lead_boosts')
    .select('provider_role, starts_at, ends_at, status, source')
    .eq('provider_role', role)
    .eq('status', 'active')
    .lte('starts_at', nowIso)
    .gt('ends_at', nowIso)
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ active: null });

  const startsMs = new Date(data.starts_at as string).getTime();
  const endsMs = new Date(data.ends_at as string).getTime();
  const days = startsMs > 0 && endsMs > startsMs ? Math.max(1, Math.round((endsMs - startsMs) / 86400000)) : null;

  return NextResponse.json({
    active: {
      role: data.provider_role,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      source: data.source,
      days,
    },
  });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sign in before redeeming a Lead Boost.' }, { status: 401 });
  }

  let body: { role?: unknown; days?: unknown; providerId?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const role = normalizeRole(body.role);
  const days = Number(body.days ?? 0);
  if (!role) return NextResponse.json({ error: 'role is required (trainer|nutritionist).' }, { status: 400 });
  if (!Number.isFinite(days) || days < 1) return NextResponse.json({ error: 'days must be a positive number.' }, { status: 400 });

  const client = await clientForRequest(request);
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';
  const providerIdRaw = Number(body.providerId ?? 0);

  let providerQuery = client.from(table).select('id').eq('owner_id', user.id).order('id', { ascending: true }).limit(1);
  if (providerIdRaw > 0) providerQuery = providerQuery.eq('id', providerIdRaw);
  const { data: providers, error: providerError } = await providerQuery;
  if (providerError) return NextResponse.json({ error: providerError.message }, { status: 400 });

  const provider = providers?.[0];
  if (!provider) return NextResponse.json({ error: `No ${role} profile linked to this account.` }, { status: 403 });

  const now = new Date();
  const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('coach_lead_boosts')
    .insert({
      provider_role: role,
      provider_id: provider.id,
      status: 'active',
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      source: 'shape_store',
      payload: { redeemed_via: 'shape_store', days },
    })
    .select('id, provider_role, provider_id, starts_at, ends_at, status, source')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    boost: {
      id: data.id,
      role: data.provider_role,
      providerId: data.provider_id,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      source: data.source,
      days,
    },
  });
}
