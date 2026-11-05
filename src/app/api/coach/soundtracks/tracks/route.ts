// A coach's playlist, track by track (owner, 2026-11-05): the track list read from Spotify, an energy tag
// per track (Easy / Build / Peak, stored on coach_soundtracks.track_tags), and a reorder written back to
// Spotify through the coach's own connection. The rules are pure (src/lib/soundtrack-tracks.mjs).
//
// GET   ?id=<soundtrack id>
//   -> { provider, tracks: [{ id, uri, name, artists, durationMs, energy }], total, tagged, canReorder, snapshotId, source }
//   Read with the coach's own Spotify connection when they have one (their private playlists too:
//   playlist-read-private), else Shape's app token (public playlists). An Apple Music playlist has no
//   track list here (MusicKit runs in the browser): { provider: 'apple', tracks: [] , reason: 'apple' }.
// PATCH { id, tags: { [trackId]: 'easy' | 'build' | 'peak' | null } } -> { tags, tagged }
//   Before 2026-11-05-soundtrack-energy.sql runs there is no track_tags column: 503, nothing written.
// POST  { id, from, to, snapshotId? } -> { ok, snapshotId }
//   Moves one track on Spotify (PUT /v1/playlists/{id}/tracks, the playlist-modify scopes the coach
//   granted). Only a playlist the coach can edit on Spotify; Spotify's refusal is said as such.
//
// The row is read on the coach's own session (coach_soundtracks is owner-only), so a coach reaches only
// their own playlists. Shape never streams a track.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { getFreshAccessToken } from '@/lib/integrations/tokens';
import { spotifyPlaylistId, mapSpotifyItems, withEnergy, cleanTagPatch, mergeTags, reorderBody, MAX_TRACKS } from '../../../../../lib/soundtrack-tracks.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noTagsColumn = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204');

let appToken: { token: string; exp: number } | null = null;
async function spotifyAppToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (appToken && appToken.exp > Date.now() + 5000) return appToken.token;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const d = await res.json();
    appToken = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
    return appToken.token;
  } catch { return null; }
}

type Row = { id: string; provider: string; url: string | null; track_tags?: Record<string, string> | null };

async function readRow(request: Request, id: string) {
  const supabase = await clientForRequest(request);
  // `*` so a database without track_tags still reads the row.
  const { data, error } = await supabase.from('coach_soundtracks').select('*').eq('id', id).maybeSingle();
  return { supabase, row: (data as Row | null) ?? null, error };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  const { row, error } = await readRow(request, id);
  if (error) return NextResponse.json({ error: "Couldn't read that playlist." }, { status: 502 });
  if (!row) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  if (row.provider === 'apple') return NextResponse.json({ provider: 'apple', tracks: [], total: 0, tagged: 0, canReorder: false, reason: 'apple' });
  const pid = spotifyPlaylistId(row.url);
  if (!pid) return NextResponse.json({ provider: 'spotify', tracks: [], total: 0, tagged: 0, canReorder: false, reason: 'no_link' });

  const userToken = await getFreshAccessToken(user.id, 'spotify');
  const token = userToken || (await spotifyAppToken());
  if (!token) return NextResponse.json({ error: 'Connect Spotify to read this playlist.', reason: 'not_connected' }, { status: 409 });
  const items: unknown[] = [];
  let total = 0;
  let snapshotId: string | null = null;
  try {
    const head = await fetch(`https://api.spotify.com/v1/playlists/${pid}?fields=snapshot_id,tracks.total`, { headers: { Authorization: `Bearer ${token}` } });
    if (head.ok) {
      const h = await head.json();
      snapshotId = typeof h?.snapshot_id === 'string' ? h.snapshot_id : null;
      total = Number(h?.tracks?.total) || 0;
    } else if (head.status === 404 || head.status === 403) {
      return NextResponse.json({ error: userToken ? "Spotify won't show this playlist to your account." : 'This playlist is private: connect Spotify to read it.', reason: 'refused' }, { status: 409 });
    }
    let next: string | null = `https://api.spotify.com/v1/playlists/${pid}/tracks?fields=items(track(id,uri,name,duration_ms,artists(name))),next&limit=100`;
    while (next && items.length < MAX_TRACKS) {
      const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return NextResponse.json({ error: `Spotify didn't answer (${res.status}). Try again.` }, { status: 502 });
      const page = await res.json();
      items.push(...(Array.isArray(page?.items) ? page.items : []));
      next = typeof page?.next === 'string' && page.next.startsWith('https://api.spotify.com/') ? page.next : null;
    }
  } catch {
    return NextResponse.json({ error: "Couldn't reach Spotify. Try again." }, { status: 502 });
  }
  const read = withEnergy(mapSpotifyItems(items), row.track_tags ?? {});
  return NextResponse.json({
    provider: 'spotify',
    tracks: read.tracks,
    total: total || read.tracks.length,
    tagged: read.tagged,
    canReorder: !!userToken,
    snapshotId,
    source: userToken ? 'your_connection' : 'public',
    tagsStored: Object.prototype.hasOwnProperty.call(row, 'track_tags'),
  });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const id = String(parsed.data.id || '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  const patch = cleanTagPatch(parsed.data.tags);
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to tag.' }, { status: 400 });
  const { supabase, row, error } = await readRow(request, id);
  if (error) return NextResponse.json({ error: "Couldn't read that playlist." }, { status: 502 });
  if (!row) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  if (!Object.prototype.hasOwnProperty.call(row, 'track_tags')) {
    return NextResponse.json({ error: 'Energy tags are not set up yet.', reason: 'not_migrated' }, { status: 503 });
  }
  const tags = mergeTags(row.track_tags, patch);
  const { error: upErr } = await supabase.from('coach_soundtracks').update({ track_tags: tags }).eq('id', id).eq('owner_id', user.id);
  if (noTagsColumn(upErr)) return NextResponse.json({ error: 'Energy tags are not set up yet.', reason: 'not_migrated' }, { status: 503 });
  if (upErr) return NextResponse.json({ error: "Couldn't save the tags. Try again." }, { status: 500 });
  return NextResponse.json({ tags, tagged: Object.keys(tags).length });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const id = String(parsed.data.id || '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  const { row, error } = await readRow(request, id);
  if (error) return NextResponse.json({ error: "Couldn't read that playlist." }, { status: 502 });
  if (!row) return NextResponse.json({ error: 'Unknown playlist.' }, { status: 404 });
  const pid = row.provider === 'spotify' ? spotifyPlaylistId(row.url) : null;
  if (!pid) return NextResponse.json({ error: 'Only a Spotify playlist can be reordered from Shape.' }, { status: 400 });
  const n = Number(parsed.data.count);
  const body = reorderBody(Number(parsed.data.from), Number(parsed.data.to), Number.isInteger(n) ? n : MAX_TRACKS, typeof parsed.data.snapshotId === 'string' ? parsed.data.snapshotId : null);
  if (!body) return NextResponse.json({ error: 'That move could not be read.' }, { status: 400 });
  const token = await getFreshAccessToken(user.id, 'spotify');
  if (!token) return NextResponse.json({ error: 'Connect Spotify to reorder your playlist.', reason: 'not_connected' }, { status: 409 });
  try {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${pid}/tracks`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 403) return NextResponse.json({ error: "Spotify only lets the playlist's owner reorder it.", reason: 'not_owner' }, { status: 409 });
    if (!res.ok) return NextResponse.json({ error: `Spotify didn't take the move (${res.status}). Reload the list and try again.` }, { status: 502 });
    const d = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, snapshotId: typeof d?.snapshot_id === 'string' ? d.snapshot_id : null });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Spotify. Try again." }, { status: 502 });
  }
}
