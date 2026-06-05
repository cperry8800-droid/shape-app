// List the signed-in user's own + followed Spotify playlists.
//
// Used by the coach Soundtracks importer so a coach can pick a playlist straight
// from their connected Spotify library (instead of pasting a link). Reuses the
// existing Spotify OAuth connection — the `playlist-read-private` /
// `playlist-read-collaborative` scopes are already requested at connect time
// (see providers.ts). Returns lightweight rows; full metadata (track count +
// duration) is resolved server-side when the soundtrack is saved.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { getFreshAccessToken } from '@/lib/integrations/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Playlist = {
  id: string;
  name: string;
  tracks: number;
  url: string;
  image: string | null;
  owner: string | null;
};

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const accessToken = await getFreshAccessToken(user.id, 'spotify');
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Connect Spotify before importing playlists.', connected: false },
      { status: 400 }
    );
  }

  const out: Playlist[] = [];
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';
  let guard = 0;
  try {
    while (url && guard < 4) {
      guard += 1;
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json(
            { error: 'Spotify rejected the request — reconnect Spotify and try again.', connected: false },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: `Could not load playlists (${res.status}).` }, { status: 502 });
      }
      const data = await res.json();
      for (const p of (data?.items || []) as Array<Record<string, unknown>>) {
        const id = typeof p?.id === 'string' ? p.id : null;
        if (!id) continue;
        const tracks = p?.tracks as { total?: number } | undefined;
        const ext = p?.external_urls as { spotify?: string } | undefined;
        const images = p?.images as Array<{ url?: string }> | undefined;
        const owner = p?.owner as { display_name?: string } | undefined;
        out.push({
          id,
          name: typeof p?.name === 'string' && p.name ? p.name : 'Untitled playlist',
          tracks: Number.isFinite(tracks?.total) ? (tracks!.total as number) : 0,
          url: ext?.spotify || `https://open.spotify.com/playlist/${id}`,
          image: Array.isArray(images) && images[0]?.url ? (images[0].url as string) : null,
          owner: owner?.display_name || null,
        });
      }
      url = typeof data?.next === 'string' ? data.next : null;
    }
  } catch {
    return NextResponse.json({ error: 'Could not reach Spotify.' }, { status: 502 });
  }

  return NextResponse.json({ connected: true, playlists: out });
}
