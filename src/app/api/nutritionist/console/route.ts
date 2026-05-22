// Live Console persistence for the newdesign Nutritionist "Console" page.
// Mirrors /api/trainer/console with provider_role = 'nutritionist' and
// kind = 'meal'. See that file for the action / response shapes.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ROLE = 'nutritionist' as const;
const KIND = 'meal' as const;
const RECENT_CLIENT_MS = 60 * 86_400_000; // 60 days = "current"

type PushedItemRow = {
  id: string;
  client_id: string;
  kind: string;
  payload: Record<string, unknown>;
  sent_at: string;
};

type ConsoleClient = {
  id: string;
  name: string;
  status: 'current' | 'past';
  lastAt: string | null;
};

async function getProviderId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

// Fetches the nutritionist's client roster from subscriptions + sessions,
// grouped by client_id with a "current" / "past" status the dropdown groups by.
// "current" = active/trialing subscription OR a session in the last 60 days.
async function fetchClientsForProvider(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerId: number,
): Promise<ConsoleClient[]> {
  const [subRes, sessRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('client_id, status')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId),
    supabase
      .from('sessions')
      .select('client_id, client_name, scheduled_at')
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: false })
      .limit(1000),
  ]);

  type Entry = { id: string; name: string; status: 'current' | 'past'; lastAt: number | null };
  const byId = new Map<string, Entry>();

  for (const sub of subRes.data ?? []) {
    if (!sub.client_id) continue;
    const e: Entry = byId.get(sub.client_id) ?? { id: sub.client_id, name: 'Client', status: 'past', lastAt: null };
    if (sub.status === 'active' || sub.status === 'trialing') e.status = 'current';
    byId.set(sub.client_id, e);
  }

  const now = Date.now();
  for (const s of sessRes.data ?? []) {
    if (!s.client_id) continue;
    const e: Entry = byId.get(s.client_id) ?? { id: s.client_id, name: 'Client', status: 'past', lastAt: null };
    if (s.client_name && e.name === 'Client') e.name = s.client_name;
    const t = new Date(s.scheduled_at).getTime();
    if (e.lastAt == null || t > e.lastAt) e.lastAt = t;
    if (now - t < RECENT_CLIENT_MS && e.status !== 'current') e.status = 'current';
    byId.set(s.client_id, e);
  }

  return [...byId.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => ({ id: e.id, name: e.name, status: e.status, lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ isNutritionist: false, clients: [], focusByClient: {}, itemsByClient: {}, snapshotByClient: {} });
  }

  const clients = await fetchClientsForProvider(supabase, providerId);

  // Latest daily_health_snapshot per client — RLS already permits a
  // nutritionist to read snapshots for their active/trialing subscribers,
  // so we just SELECT and the policy filters down.
  const snapshotByClient: Record<string, Record<string, unknown>> = {};
  if (clients.length > 0) {
    const clientIds = clients.map((c) => c.id);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { data: snapRows } = await supabase
      .from('daily_health_snapshot')
      .select('user_id, snapshot_date, weight_lb, sleep_hours, resting_hr, stress, calories, protein_g, hrv_ms, recovery_score')
      .in('user_id', clientIds)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: false });
    for (const row of snapRows ?? []) {
      const uid = row.user_id as string;
      if (!snapshotByClient[uid]) snapshotByClient[uid] = row as Record<string, unknown>;
    }
  }

  const { data: bannerRows } = await supabase
    .from('coach_focus_banners')
    .select('client_id, text, sent_at')
    .eq('provider_role', ROLE)
    .eq('provider_id', providerId);

  const focusByClient: Record<string, string> = {};
  for (const b of bannerRows ?? []) {
    if (typeof b.client_id === 'string' && typeof b.text === 'string') {
      focusByClient[b.client_id] = b.text;
    }
  }

  const { data: itemRows } = await supabase
    .from('coach_pushed_items')
    .select('id, client_id, kind, payload, sent_at')
    .eq('provider_role', ROLE)
    .eq('provider_id', providerId)
    .is('removed_at', null)
    .order('sent_at', { ascending: true });

  const itemsByClient: Record<string, Array<Record<string, unknown>>> = {};
  for (const r of (itemRows ?? []) as PushedItemRow[]) {
    const list = itemsByClient[r.client_id] ?? [];
    list.push({ id: r.id, ...(r.payload ?? {}) });
    itemsByClient[r.client_id] = list;
  }

  return NextResponse.json({ isNutritionist: true, clients, focusByClient, itemsByClient, snapshotByClient });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const providerId = await getProviderId(supabase, user.id);
  if (providerId == null) {
    return NextResponse.json({ error: 'Not a nutritionist.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        clientId?: unknown;
        action?: unknown;
        text?: unknown;
        payload?: unknown;
        itemId?: unknown;
      }
    | null;

  const clientId = String(body?.clientId ?? '').trim();
  const action = String(body?.action ?? '').trim();
  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId.' }, { status: 400 });
  }

  if (action === 'focus') {
    const text = String(body?.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Focus text is empty.' }, { status: 400 });
    }
    const { error } = await supabase.from('coach_focus_banners').upsert(
      {
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        text,
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'provider_role,provider_id,client_id' },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'addItem') {
    const payload = body?.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : null;
    const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!payload || !name) {
      return NextResponse.json({ error: 'Meal name is required.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('coach_pushed_items')
      .insert({
        provider_role: ROLE,
        provider_id: providerId,
        client_id: clientId,
        kind: KIND,
        payload,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === 'removeItem') {
    const itemId = String(body?.itemId ?? '').trim();
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('coach_pushed_items')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('provider_role', ROLE)
      .eq('provider_id', providerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
