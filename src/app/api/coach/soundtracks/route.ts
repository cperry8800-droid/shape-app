// Coach soundtracks — saved playlists shared by the mobile Soundtracks page
// and the website Playlists page. Owner-scoped via RLS (coach_soundtracks).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, name, provider, tag, url, tracks, duration, bpm, attached, created_at';
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ── Spotify metadata resolve (client-credentials; public playlists) ──────────
let spotTokenCache: { token: string; exp: number } | null = null;
async function spotifyAppToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (spotTokenCache && spotTokenCache.exp > Date.now() + 5000) return spotTokenCache.token;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const d = await res.json();
    spotTokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
    return spotTokenCache.token;
  } catch { return null; }
}
function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}
async function resolveSpotify(url: string): Promise<{ name?: string; tracks?: number; duration?: string } | null> {
  const m = (url || '').match(/playlist[/:]([A-Za-z0-9]+)/);
  if (!m) return null;
  const token = await spotifyAppToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${m[1]}?fields=name,tracks.total,tracks.items(track(duration_ms))`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const items = (d?.tracks?.items || []) as Array<{ track?: { duration_ms?: number } }>;
    const totalMs = items.reduce((s, it) => s + (it?.track?.duration_ms || 0), 0);
    return {
      name: typeof d?.name === 'string' ? d.name : undefined,
      tracks: Number.isFinite(d?.tracks?.total) ? d.tracks.total : undefined,
      duration: totalMs > 0 ? fmtDuration(totalMs) : undefined,
    };
  } catch { return null; }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data, error } = await supabase
    .from('coach_soundtracks')
    .select(SELECT)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return dbError(error, 'coach soundtracks write', 500);
  return NextResponse.json({ soundtracks: data ?? [] });
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
  const provider = body.provider === 'apple' ? 'apple' : 'spotify';
  const url = clean(body.url, 500);
  // Pull real cover-less metadata (name/tracks/duration) from a Spotify link.
  const meta = provider === 'spotify' ? await resolveSpotify(url) : null;
  const insert = {
    owner_id: user.id,
    name: meta?.name && (!name || name === 'New playlist') ? meta.name.slice(0, 160) : name,
    provider,
    tag: clean(body.tag, 60) || null,
    url: url || null,
    tracks: meta?.tracks != null ? meta.tracks : (Number.isFinite(Number(body.tracks)) ? Math.max(0, Math.round(Number(body.tracks))) : 0),
    duration: meta?.duration || clean(body.duration, 24) || null,
    bpm: clean(body.bpm, 24) || null,
    attached: Array.isArray(body.attached) ? body.attached : [],
  };
  const { data, error } = await supabase.from('coach_soundtracks').insert(insert).select(SELECT).single();
  if (error) return dbError(error, 'coach soundtracks write', 500);
  return NextResponse.json({ soundtrack: data });
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
  if (error) return dbError(error, 'coach soundtracks write', 500);
  return NextResponse.json({ soundtrack: data });
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
  const { error } = await supabase.from('coach_soundtracks').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return dbError(error, 'coach soundtracks write', 500);
  return NextResponse.json({ ok: true });
}
