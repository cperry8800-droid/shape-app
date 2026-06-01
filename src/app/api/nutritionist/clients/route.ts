// Live client roster for the newdesign Nutritionist "Clients" page.
// Read-only over existing tables (nutritionists, subscriptions, sessions) —
// no new schema. Per-client adherence / at-risk analytics are intentionally
// NOT here: that needs client data a coach can't read via RLS.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DAY_MS } from '@/lib/time';

export const dynamic = 'force-dynamic';

type ClientEntry = {
  id: string | null;
  name: string;
  sessions: number;
  lastAt: number | null;
  mrrCents: number;
  joinedAt: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = nutriRow?.id ?? null;
  if (providerId == null) {
    return NextResponse.json({
      isNutritionist: false,
      clients: [],
      totals: { active: 0, mrrCents: 0 },
    });
  }

  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('client_id, price_cents, status, created_at')
    .eq('provider_role', 'nutritionist')
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('client_id, client_name, scheduled_at')
    .eq('provider_role', 'nutritionist')
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
  const clients = [...byClient.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => ({
      id: e.id,
      name: e.name,
      sessions: e.sessions,
      mrrCents: e.mrrCents,
      lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null,
      isNew: e.joinedAt ? now - new Date(e.joinedAt).getTime() < 14 * DAY_MS : e.sessions <= 1,
    }));

  const mrrCents = clients.reduce((sum, c) => sum + c.mrrCents, 0);

  return NextResponse.json({
    isNutritionist: true,
    clients,
    totals: { active: clients.length, mrrCents },
  });
}
