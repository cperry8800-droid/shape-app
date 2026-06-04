// Coach soundtracks — saved playlists shared by the mobile Soundtracks page
// and the website Playlists page. Owner-scoped via RLS (coach_soundtracks).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, name, provider, tag, url, tracks, duration, bpm, attached, created_at';
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data, error } = await supabase
    .from('coach_soundtracks')
    .select(SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ soundtracks: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const name = clean(body.name, 160);
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  const provider = body.provider === 'apple' ? 'apple' : 'spotify';
  const insert = {
    owner_id: user.id,
    name,
    provider,
    tag: clean(body.tag, 60) || null,
    url: clean(body.url, 500) || null,
    tracks: Number.isFinite(Number(body.tracks)) ? Math.max(0, Math.round(Number(body.tracks))) : 0,
    duration: clean(body.duration, 24) || null,
    bpm: clean(body.bpm, 24) || null,
    attached: Array.isArray(body.attached) ? body.attached : [],
  };
  const { data, error } = await supabase.from('coach_soundtracks').insert(insert).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ soundtrack: data });
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
  if (body.provider === 'apple' || body.provider === 'spotify') patch.provider = body.provider;
  if (typeof body.tag === 'string') patch.tag = clean(body.tag, 60);
  if (typeof body.url === 'string') patch.url = clean(body.url, 500);
  if (typeof body.duration === 'string') patch.duration = clean(body.duration, 24);
  if (typeof body.bpm === 'string') patch.bpm = clean(body.bpm, 24);
  if (body.tracks != null && Number.isFinite(Number(body.tracks))) patch.tracks = Math.max(0, Math.round(Number(body.tracks)));
  if (Array.isArray(body.attached)) patch.attached = body.attached;
  const { data, error } = await supabase
    .from('coach_soundtracks')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ soundtrack: data });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await supabase.from('coach_soundtracks').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
