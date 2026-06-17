// Coach grocery lists — a coach's own + per-client grocery lists
// (coach_grocery_lists, owner-scoped via RLS). Mirrors /api/coach/soundtracks.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, name, client_id, client_name, status, items, created_at';
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const STATUSES = ['ready', 'review', 'approval', 'sent'];

function normItems(v: unknown): Array<{ name: string; aisle: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (typeof it === 'string') return { name: it.trim().slice(0, 120), aisle: 'Other' };
      if (it && typeof it === 'object') {
        const o = it as Record<string, unknown>;
        return { name: clean(o.name, 120), aisle: clean(o.aisle, 40) || 'Other' };
      }
      return null;
    })
    .filter((x): x is { name: string; aisle: string } => !!x && !!x.name)
    .slice(0, 200);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data, error } = await supabase
    .from('coach_grocery_lists')
    .select(SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return dbError(error, 'coach grocery lists write', 500);
  return NextResponse.json({ lists: data ?? [] });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const name = clean(body.name, 160);
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  const insert = {
    owner_id: user.id,
    name,
    client_id: clean(body.clientId, 64) || null,
    client_name: clean(body.clientName, 120) || null,
    status: STATUSES.includes(String(body.status)) ? String(body.status) : 'ready',
    items: normItems(body.items),
  };
  const { data, error } = await supabase.from('coach_grocery_lists').insert(insert).select(SELECT).single();
  if (error) return dbError(error, 'coach grocery lists write', 500);
  return NextResponse.json({ list: data });
}

export async function PATCH(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = clean(body.name, 160);
  if (typeof body.clientId === 'string') patch.client_id = clean(body.clientId, 64) || null;
  if (typeof body.clientName === 'string') patch.client_name = clean(body.clientName, 120) || null;
  if (STATUSES.includes(String(body.status))) patch.status = String(body.status);
  if (Array.isArray(body.items)) patch.items = normItems(body.items);
  const { data, error } = await supabase
    .from('coach_grocery_lists')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(SELECT)
    .single();
  if (error) return dbError(error, 'coach grocery lists write', 500);
  return NextResponse.json({ list: data });
}

export async function DELETE(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await supabase.from('coach_grocery_lists').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return dbError(error, 'coach grocery lists write', 500);
  return NextResponse.json({ ok: true });
}
