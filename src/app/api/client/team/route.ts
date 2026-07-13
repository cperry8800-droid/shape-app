// Client's coaching team.
//
// Resolves active subscriptions into the coaches the client is paying,
// plus their plan price, next scheduled session, and last message
// timestamp (when available). The ClientTeam page renders this shape
// directly.

import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createClient } from '@/lib/supabase/server';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

type SubRow = {
  provider_id: number;
  provider_role: 'trainer' | 'nutritionist';
  status: string;
  price_cents: number | null;
  created_at: string;
};

type SessionRow = {
  provider_id: number;
  provider_role: 'trainer' | 'nutritionist';
  scheduled_at: string;
  status: string;
};

function fmtPriceMonthly(cents: number | null) {
  if (!cents || cents <= 0) return '—';
  return `$${Math.round(cents / 100)}/mo`;
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtNextSession(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { data: subs, error: subsErr } = await supabase
    .from('subscriptions')
    .select('provider_id, provider_role, status, price_cents, created_at')
    .eq('client_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: true });
  if (subsErr) return dbError(subsErr, 'team subscriptions read', 500);

  const rows = (subs || []) as SubRow[];
  if (!rows.length) return NextResponse.json({ coaches: [] });

  const trainerIds = rows.filter(r => r.provider_role === 'trainer').map(r => r.provider_id);
  const nutriIds = rows.filter(r => r.provider_role === 'nutritionist').map(r => r.provider_id);

  const nowIso = new Date().toISOString();
  const [tRes, nRes, sessRes] = await Promise.all([
    trainerIds.length
      ? supabase.from('trainers').select('id, name, role').in('id', trainerIds)
      : Promise.resolve({ data: [] }),
    nutriIds.length
      ? supabase.from('nutritionists').select('id, name, role').in('id', nutriIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('sessions')
      .select('provider_id, provider_role, scheduled_at, status')
      .eq('client_id', user.id)
      .in('status', ['requested', 'confirmed'])
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }),
  ]);

  type ProviderRow = { id: number; name: string; role?: string | null };
  const trainersById = new Map<number, ProviderRow>(((tRes.data || []) as ProviderRow[]).map(r => [r.id, r]));
  const nutrisById = new Map<number, ProviderRow>(((nRes.data || []) as ProviderRow[]).map(r => [r.id, r]));

  const nextByKey = new Map<string, string>();
  for (const s of ((sessRes.data || []) as SessionRow[])) {
    const k = `${s.provider_role}:${s.provider_id}`;
    if (!nextByKey.has(k)) nextByKey.set(k, s.scheduled_at);
  }

  const coaches = rows.map(sub => {
    const provider = sub.provider_role === 'trainer'
      ? trainersById.get(sub.provider_id)
      : nutrisById.get(sub.provider_id);
    if (!provider) return null;
    const next = nextByKey.get(`${sub.provider_role}:${sub.provider_id}`);
    return {
      provider_id: sub.provider_id,
      provider_role: sub.provider_role,
      name: provider.name,
      role: sub.provider_role === 'trainer'
        ? (provider.role || 'Trainer')
        : (provider.role || 'Nutritionist'),
      since: fmtDate(sub.created_at),
      plan: `${provider.role || (sub.provider_role === 'trainer' ? 'Trainer' : 'Nutritionist')} · ${fmtPriceMonthly(sub.price_cents)}`,
      next: next ? fmtNextSession(next) : 'No session booked',
    };
  }).filter(Boolean);

  return NextResponse.json({ coaches });
}
