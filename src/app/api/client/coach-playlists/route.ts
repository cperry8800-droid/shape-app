// The playlists the member's own coaches sent them, for the member website (owner, 2026-11-05: "Show the
// coach-sent playlists on the member's Workouts (trainer's) and Nutrition (nutritionist's cooking
// playlists) pages"). The app reads the same through get_my_coach_playlists (shapeBackend.js
// listMyCoachPlaylists); this is that read for the website, on the member's own session, so the
// definer answers only for the caller and only from coaches they have
// (2026-10-11-coach-playlists-for-clients.sql).
//
// GET ?role=trainer|nutritionist -> { playlists: [{ id, name, provider, url, tracks, duration, bpm, tag, coachName }] }
// A link is kept only when it is an https Spotify or Apple Music one (playlistLink.mjs): the page opens it
// in the member's own app; Shape never streams it. A failed read is a 502, never an empty list.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { bsPlaylistLink } from '../../../../../mobile-app/src/services/playlistLink.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id?: string; name?: string; provider?: string; url?: string | null; tracks?: number | null; duration?: string | null; bpm?: string | null; tag?: string | null; coach_name?: string | null };

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const role = new URL(request.url).searchParams.get('role');
  if (role !== 'trainer' && role !== 'nutritionist') return NextResponse.json({ error: 'role must be trainer or nutritionist.' }, { status: 400 });
  const supabase = await clientForRequest(request);
  const { data, error } = await supabase.rpc('get_my_coach_playlists', { p_role: role });
  if (error) return NextResponse.json({ error: "Couldn't read your coach's playlists." }, { status: 502 });
  const playlists = ((Array.isArray(data) ? data : []) as Row[]).filter((r) => r && r.name).map((r) => ({
    id: String(r.id || ''),
    name: String(r.name),
    provider: r.provider === 'apple' ? 'apple' : 'spotify',
    url: bsPlaylistLink(r.url ?? null),
    tracks: Number(r.tracks) || 0,
    duration: r.duration && r.duration !== '—' ? r.duration : null,
    bpm: r.bpm && r.bpm !== '—' ? r.bpm : null,
    tag: r.tag || null,
    coachName: r.coach_name || null,
  }));
  return NextResponse.json({ playlists });
}
