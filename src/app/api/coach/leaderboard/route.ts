// The coach leaderboard: every live trainer or nutritionist listing, ranked by Coach Score.
//
// GET ?role=trainer|nutritionist&view=standing|climb&limit=50
//   -> { role, view, total, since,
//        entries: [{ providerId, name, specialty, avatarUrl, points, tier, activeClients,
//                    completionPct, rank, prevRank, moved, gained, isMe, listed }],
//        me: entry | null }
//
//   standing  ranked by today's Coach Score, the one the coach's Score page shows; `moved` is
//             places moved since the nightly reading a week ago (null until there is one)
//   climb     ranked by points gained since the reading 30 days ago; `since` is the day the gain
//             is measured from (earlier history counts from the first reading), null before
//             there are any readings to compare
//
// Coaches only (an account that owns a listing of either role); shape_coach_board refuses
// anyone else, which this answers 403. `entries` is the top `limit`, plus the caller and the
// coach either side of them. The caller's own listing is on the board even before it is live
// (`listed: false`), so they can see where they would stand.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { isMissingRelation } from '@/lib/owned-provider';
import { coachEntry, parseCoachRole, parseCoachView, parseLimit, trimCoachBoard } from '@/lib/leaderboard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const url = new URL(request.url);
  const role = parseCoachRole(url.searchParams.get('role'));
  if (!role) return NextResponse.json({ error: 'role=trainer|nutritionist required.' }, { status: 400 });
  const view = parseCoachView(url.searchParams.get('view'));
  const limit = parseLimit(url.searchParams.get('limit'));

  const supabase = await clientForRequest(request);
  const { data, error } = await supabase.rpc('shape_coach_board', { p_role: role, p_view: view });
  if (error) {
    if ((error as { code?: string }).code === '42501') return NextResponse.json({ error: 'Coaches only.' }, { status: 403 });
    if (isMissingRelation(error)) return NextResponse.json({ error: 'The coach leaderboard is not switched on yet.' }, { status: 503 });
    return NextResponse.json({ error: 'Leaderboard unavailable.' }, { status: 502 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const { entries, total, me } = trimCoachBoard(rows.map(coachEntry), limit);
  const since = view === 'climb'
    ? (rows.find((r) => r.gained_since)?.gained_since as string | undefined) ?? null
    : null;
  return NextResponse.json({ role, view, total, since, entries, me });
}
