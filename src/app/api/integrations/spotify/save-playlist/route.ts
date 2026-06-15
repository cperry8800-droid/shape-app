// Save (follow) a Spotify playlist into the signed-in user's own library.
//
// Used so a client can save a coach's workout / meal-plan playlist to their own
// Spotify profile. "Save to profile" in Spotify terms is following the playlist
// (PUT /v1/playlists/{id}/followers) — it appears in the user's library without
// duplicating it. Requires the playlist-modify scopes (see providers.ts).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { getFreshAccessToken } from '@/lib/integrations/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepts an open.spotify.com URL, a spotify:playlist:ID URI, or a raw id.
function extractPlaylistId(input: string): string | null {
  const value = String(input || '').trim();
  if (!value) return null;
  const urlMatch = value.match(/playlist[/:]([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{16,}$/.test(value)) return value;
  return null;
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<{ playlistId?: string; url?: string; public?: boolean }>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const playlistId = extractPlaylistId(body.playlistId || body.url || '');
  if (!playlistId) {
    return NextResponse.json({ error: 'A valid Spotify playlist link or id is required.' }, { status: 400 });
  }

  const accessToken = await getFreshAccessToken(user.id, 'spotify');
  if (!accessToken) {
    return NextResponse.json({ error: 'Connect Spotify before saving playlists.' }, { status: 400 });
  }

  // Following with public:false saves it privately to the user's library.
  const isPublic = body.public === true;
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ public: isPublic }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { error: 'Spotify rejected the request — reconnect Spotify and try again.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Could not save playlist (${res.status}): ${text.slice(0, 120) || res.statusText}` },
      { status: 502 }
    );
  }

  // Best-effort: note the save so we can show "saved" state later.
  try {
    const client = await clientForRequest(request);
    await client.from('user_integrations').update({ updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('provider', 'spotify');
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ ok: true, playlistId });
}
