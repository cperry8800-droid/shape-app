// Live Console persistence for the newdesign Nutritionist "Console" page.
// Mirrors /api/trainer/console with provider_role = 'nutritionist' and
// kind = 'meal'. See that file for the action / response shapes.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ROLE = 'nutritionist' as const;
const KIND = 'meal' as const;

type PushedItemRow = {
  id: string;
  client_id: string;
  kind: string;
  payload: Record<string, unknown>;
  sent_at: string;
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
    return NextResponse.json({ isNutritionist: false, focusByClient: {}, itemsByClient: {} });
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

  return NextResponse.json({ isNutritionist: true, focusByClient, itemsByClient });
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
