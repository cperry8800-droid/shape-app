// Shape Score leaderboard.
//
// GET ?period=week|month|all&limit=50
//   -> { period, entries: [{ userId, name, avatarUrl, points, rank, isMe }],
//        me: { points, rank, total } | null }
//
// Cross-user ranking comes from the SECURITY DEFINER functions shape_leaderboard
// / shape_leaderboard_me (score_ledger RLS is owner-only), which return only
// safe display fields and respect the per-user leaderboard opt-out.
//
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const url = new URL(request.url);
  const periodRaw = (url.searchParams.get('period') || 'month').toLowerCase();
  const period = ['week', 'month', 'all'].includes(periodRaw) ? periodRaw : 'month';
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));

  // ⚠ A FAILED READ IS NOT AN EMPTY BOARD. This returned 200 with `{entries: [], me:
  // null}`, which every consumer reads as a settled answer — so an RPC outage told
  // members that nobody had earned points and that they were not ranked. Both are
  // positive claims the route cannot make. The mobile callers already treat a non-2xx
  // as a failure (`getJsonOrDefault` falls back to the same empty default, the
  // broadsheet takes `r.ok ? … : null`), so this is strictly better for them too.
  const { data: rows, error } = await supabase.rpc('shape_leaderboard', { p_period: period, p_limit: limit });
  if (error) return NextResponse.json({ error: 'Leaderboard unavailable.' }, { status: 502 });

  const entries = (rows ?? []).map((r: { user_id: string; full_name: string; avatar_url: string | null; points: number; rank: number }) => ({
    userId: r.user_id,
    name: r.full_name,
    avatarUrl: r.avatar_url,
    points: Number(r.points),
    rank: Number(r.rank),
    isMe: r.user_id === user.id,
  }));

  // The same rule one call down: `me: null` is the positive claim "you are not ranked",
  // so a failed read of it must not be published as one.
  let me = null;
  const { data: meRows, error: meError } = await supabase.rpc('shape_leaderboard_me', { p_period: period });
  if (meError) return NextResponse.json({ error: 'Leaderboard unavailable.' }, { status: 502 });
  if (Array.isArray(meRows) && meRows[0]) {
    me = { points: Number(meRows[0].points), rank: Number(meRows[0].rank), total: Number(meRows[0].total) };
  }

  return NextResponse.json({ period, entries, me });
}
