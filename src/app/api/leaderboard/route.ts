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
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearer[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const url = new URL(request.url);
  const periodRaw = (url.searchParams.get('period') || 'month').toLowerCase();
  const period = ['week', 'month', 'all'].includes(periodRaw) ? periodRaw : 'month';
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));

  const { data: rows, error } = await supabase.rpc('shape_leaderboard', { p_period: period, p_limit: limit });
  if (error) return NextResponse.json({ period, entries: [], me: null });

  const entries = (rows ?? []).map((r: { user_id: string; full_name: string; avatar_url: string | null; points: number; rank: number }) => ({
    userId: r.user_id,
    name: r.full_name,
    avatarUrl: r.avatar_url,
    points: Number(r.points),
    rank: Number(r.rank),
    isMe: r.user_id === user.id,
  }));

  let me = null;
  const { data: meRows } = await supabase.rpc('shape_leaderboard_me', { p_period: period });
  if (Array.isArray(meRows) && meRows[0]) {
    me = { points: Number(meRows[0].points), rank: Number(meRows[0].rank), total: Number(meRows[0].total) };
  }

  return NextResponse.json({ period, entries, me });
}
