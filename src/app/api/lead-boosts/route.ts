import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { findLeadBoostItem } from '@/lib/store-catalogue';

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

  if (error) return dbError(error, 'lead boosts write', 400);
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

// A PostgREST error that says the function is not there: the state of a database the
// 2026-10-09 migration has not been applied to yet (PGRST202 is PostgREST's "could not find
// the function", 42883 Postgres's own undefined_function).
function isUndefinedFunction(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
}

// POST { role, days | itemId, providerId? } → activate a Lead Boost for the caller's own
// provider row, paying the catalogue item's points. Everything that moves money happens in
// ONE database function, redeem_lead_boost (SECURITY DEFINER, authenticated only): the points
// leave the ledger, the redemption is recorded and the boost row is written together, and a
// refusal (not enough points, a boost already active, not the caller's provider row) moves
// nothing. The route decides nothing about price or length: `days` only picks which of the
// fixed catalogue items (7, 14, 30) the caller means, and the row's `boost_days` is what the
// boost gets. (H6 of the 2026-10-08 review: this route used to insert the boost itself, with
// no debit and no bound on days, through write policies #2280 dropped.)
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Sign in before redeeming a Lead Boost.' }, { status: 401 });
  }

  const bodyResult = await readJson<{ role?: unknown; days?: unknown; itemId?: unknown; providerId?: unknown }>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const role = normalizeRole(body.role);
  if (!role) return NextResponse.json({ error: 'role is required (trainer|nutritionist).' }, { status: 400 });
  const item = findLeadBoostItem(body.itemId, body.days);
  if (!item) return NextResponse.json({ error: 'Lead Boosts come in 7, 14 or 30 days.' }, { status: 400 });
  const providerIdRaw = Number(body.providerId ?? 0);

  const client = await clientForRequest(request);
  const { data, error } = await client.rpc('redeem_lead_boost', {
    p_item_id: item.id,
    p_role: role,
    p_provider_id: Number.isFinite(providerIdRaw) && providerIdRaw > 0 ? Math.floor(providerIdRaw) : null,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('insufficient_points')) {
      return NextResponse.json({ error: 'Not enough points for this Lead Boost.', code: 'insufficient_points' }, { status: 409 });
    }
    if (msg.includes('boost_active')) {
      // The provider already has an active boost (a double-submit, a second device, or a race
      // the function lost): nothing was charged. Return the active boost so the redeem reads
      // as idempotent, as it did before. Only the caller's OWN provider rows are read back:
      // active boosts are publicly readable, and a read by role alone handed the caller the
      // newest active boost of some other coach, that coach's id and dates with it (Codex, #2285).
      const { data: owned } = await client
        .from(role === 'trainer' ? 'trainers' : 'nutritionists')
        .select('id')
        .eq('owner_id', user.id);
      const wanted = Number.isFinite(providerIdRaw) && providerIdRaw > 0 ? Math.floor(providerIdRaw) : null;
      const ownedIds = (owned ?? [])
        .map((r) => Number((r as { id?: unknown }).id))
        .filter((id) => Number.isFinite(id) && id > 0 && (wanted === null || id === wanted));
      const { data: existing } = ownedIds.length
        ? await client
            .from('coach_lead_boosts')
            .select('id, provider_role, provider_id, starts_at, ends_at, status, source, duration_days')
            .eq('provider_role', role)
            .in('provider_id', ownedIds)
            .eq('status', 'active')
            .gt('ends_at', new Date().toISOString())
            .order('starts_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };
      if (existing) {
        return NextResponse.json({
          boost: {
            id: existing.id, role: existing.provider_role, providerId: existing.provider_id,
            startsAt: existing.starts_at, endsAt: existing.ends_at, status: existing.status,
            source: existing.source, days: existing.duration_days,
          },
          alreadyActive: true,
        });
      }
      return NextResponse.json({ error: 'A Lead Boost is already active for this profile.', code: 'boost_active' }, { status: 409 });
    }
    if (msg.includes('no_provider')) {
      return NextResponse.json({ error: `No ${role} profile linked to this account.` }, { status: 403 });
    }
    if (msg.includes('unknown_item') || msg.includes('item_locked') || msg.includes('bad_role')) {
      return NextResponse.json({ error: 'This Lead Boost is not available.' }, { status: 400 });
    }
    if (msg.includes('not_authenticated')) {
      return NextResponse.json({ error: 'Sign in before redeeming a Lead Boost.' }, { status: 401 });
    }
    if (isUndefinedFunction(error)) {
      // Loud, not a silent grant: the database does not have redeem_lead_boost yet.
      return NextResponse.json({ error: 'Lead Boosts are not switched on yet. Please try again later.' }, { status: 503 });
    }
    return dbError(error, 'lead boosts redeem', 400);
  }

  const b = (data ?? {}) as {
    id?: string; role?: string; providerId?: number; startsAt?: string; endsAt?: string;
    days?: number; cost?: number; code?: string; balance?: number;
  };
  return NextResponse.json({
    boost: {
      id: b.id,
      role: b.role ?? role,
      providerId: b.providerId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: 'active',
      source: 'shape_store',
      days: b.days ?? item.boostDays,
      cost: b.cost,
      code: b.code,
    },
    balance: typeof b.balance === 'number' ? b.balance : null,
  });
}
