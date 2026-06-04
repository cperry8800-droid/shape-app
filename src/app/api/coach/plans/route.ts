// Coach plans — published programs / meal plans, shared by the mobile Plans
// page and the website. Owner-scoped via RLS (coach_plans).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, kind, name, meta, price, published, detail, created_at';
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind');
  let q = supabase.from('coach_plans').select(SELECT).eq('owner_id', user.id).order('created_at', { ascending: false });
  if (kind === 'program' || kind === 'meal_plan') q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const name = clean(body.name, 160);
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  const insert = {
    owner_id: user.id,
    kind: body.kind === 'meal_plan' ? 'meal_plan' : 'program',
    name,
    meta: clean(body.meta, 200) || null,
    price: clean(body.price, 32) || null,
    published: body.published === false ? false : true,
    detail: body.detail && typeof body.detail === 'object' ? body.detail : {},
  };
  const { data, error } = await supabase.from('coach_plans').insert(insert).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = clean(body.name, 160);
  if (typeof body.meta === 'string') patch.meta = clean(body.meta, 200);
  if (typeof body.price === 'string') patch.price = clean(body.price, 32);
  if (typeof body.published === 'boolean') patch.published = body.published;
  if (body.detail && typeof body.detail === 'object') patch.detail = body.detail;
  const { data, error } = await supabase.from('coach_plans').update(patch).eq('id', id).eq('owner_id', user.id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await supabase.from('coach_plans').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
