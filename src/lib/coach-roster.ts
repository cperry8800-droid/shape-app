// Live client roster for the newdesign coach "Clients" pages.
// Read-only over existing tables (trainers/nutritionists, subscriptions,
// sessions) — no new schema. Per-client adherence / at-risk analytics are
// intentionally NOT here: that needs client data a coach can't read via RLS.
//
// Shared by the trainer and nutritionist routes, which differ only in the
// provider table, the provider_role filter, and the isTrainer/isNutritionist
// response key — all derived from `role` below.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { DAY_MS } from '@/lib/time';

type ClientEntry = {
  id: string | null;
  name: string;
  sessions: number;
  lastAt: number | null;
  mrrCents: number;
  joinedAt: string | null;
};

export async function coachClientsResponse(
  role: 'trainer' | 'nutritionist',
  request: Request
): Promise<NextResponse> {
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const supabase = await clientForRequest(request);

  const roleKey = role === 'trainer' ? 'isTrainer' : 'isNutritionist';
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';

  const { data: providerRow } = await supabase
    .from(table)
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = providerRow?.id ?? null;
  if (providerId == null) {
    return NextResponse.json({ [roleKey]: false, clients: [], totals: { active: 0, mrrCents: 0 } });
  }

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('client_id, price_cents, status, created_at')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('client_id, client_name, scheduled_at')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .order('scheduled_at', { ascending: false })
    .limit(1000);

  const byClient = new Map<string, ClientEntry>();
  const ensure = (key: string): ClientEntry => {
    let e = byClient.get(key);
    if (!e) {
      e = { id: null, name: 'Client', sessions: 0, lastAt: null, mrrCents: 0, joinedAt: null };
      byClient.set(key, e);
    }
    return e;
  };

  for (const s of sessRows ?? []) {
    const key = s.client_id || `name:${s.client_name || 'unknown'}`;
    const e = ensure(key);
    if (s.client_id) e.id = s.client_id;
    e.sessions += 1;
    if (s.client_name && e.name === 'Client') e.name = s.client_name;
    const t = new Date(s.scheduled_at).getTime();
    if (e.lastAt == null || t > e.lastAt) e.lastAt = t;
  }

  for (const sub of subRows ?? []) {
    const e = ensure(sub.client_id || 'unknown');
    if (sub.client_id) e.id = sub.client_id;
    e.mrrCents += sub.price_cents ?? 0;
    if (sub.created_at && (!e.joinedAt || sub.created_at < e.joinedAt)) {
      e.joinedAt = sub.created_at;
    }
  }

  const now = Date.now();
  const STALE_MS = 14 * DAY_MS;
  const clients = [...byClient.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => {
      const isNew = e.joinedAt ? now - new Date(e.joinedAt).getTime() < STALE_MS : e.sessions <= 1;
      // Needs-eyes = not new and low-touch: no session in 14d, or fewer than
      // 3 sessions when we have no timestamp to go on. Everyone else is on track.
      const stale = e.lastAt == null ? e.sessions < 3 : (now - e.lastAt) > STALE_MS;
      const status: 'new' | 'eyes' | 'ontrack' = isNew ? 'new' : stale ? 'eyes' : 'ontrack';
      return {
        id: e.id,
        name: e.name,
        sessions: e.sessions,
        mrrCents: e.mrrCents,
        lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null,
        isNew,
        status,
      };
    });

  const mrrCents = clients.reduce((sum, c) => sum + c.mrrCents, 0);

  return NextResponse.json({
    [roleKey]: true,
    clients,
    totals: { active: clients.length, mrrCents },
  });
}
