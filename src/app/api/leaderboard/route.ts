// Shape Score leaderboard for members.
//
// GET ?scope=everyone|following|team&period=week|month|all&limit=50
//   -> { scope, period, total,
//        entries: [{ userId, name, avatarUrl, points, rank, prevRank, moved, tier, streak,
//                    trainingDays, mealDays, isMe }],
//        me: entry | null,               the caller's own row, ranked or not in this window
//        hidden: null | 'off' | 'private' | 'team_unasked' | 'team_off',
//                                        why OTHER members do not see the caller here
//        privacy: { leaderboard, teamBoard } | null,   the two switches (null: unread)
//        hasCoach?: boolean | null,      team only
//        following?: number | null }     following only
//
// The ranking is shape_member_board (supabase-migrations/2026-10-15-leaderboards.sql), which
// returns first name and last initial and applies every privacy rule. `entries` keeps the
// fields the app builds before this one read (userId, name, avatarUrl, points, rank, isMe), and
// `me` keeps { points, rank, total }.
//
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { isMissingRelation } from '@/lib/owned-provider';
import {
  hiddenReason, memberEntry, parseLimit, parsePeriod, parseScope, readPrivacy, shortName,
  type Period, type Privacy, type Scope,
} from '@/lib/leaderboard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unavailable = () => NextResponse.json({ error: 'Leaderboard unavailable.' }, { status: 502 });

// The caller's own settings: the two switches, and whether their profile is public. Read under
// their own session (user_goals is owner-readable). A failed read is reported as null, never as
// a default, because the page draws the switches from it.
async function readOwnSettings(supabase: SupabaseClient, userId: string): Promise<{ privacy: Privacy; visibility: unknown } | null> {
  const { data, error } = await supabase
    .from('user_goals')
    .select('kind, data')
    .eq('user_id', userId)
    .in('kind', ['client_privacy_prefs', 'client_settings']);
  if (error) return null;
  const rows = (data ?? []) as Array<{ kind: string; data: Record<string, unknown> | null }>;
  const prefs = rows.find((r) => r.kind === 'client_privacy_prefs')?.data ?? {};
  const settings = rows.find((r) => r.kind === 'client_settings')?.data ?? {};
  return { privacy: readPrivacy(prefs), visibility: settings.profileVisibility };
}

async function countOrNull(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count, error } = await query;
  return error ? null : count ?? 0;
}

// ⚠ A FAILED READ IS NOT AN EMPTY BOARD. Returning 200 with no entries tells members nobody has
// earned points and that they are not ranked; both are claims the route cannot make. Callers
// already treat a non-2xx as "could not read".
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const url = new URL(request.url);
  const scope = parseScope(url.searchParams.get('scope'));
  const period = parsePeriod(url.searchParams.get('period'));
  const limit = parseLimit(url.searchParams.get('limit'));

  const [board, own, hasCoach, following] = await Promise.all([
    supabase.rpc('shape_member_board', { p_scope: scope, p_period: period, p_limit: limit }),
    readOwnSettings(supabase, user.id),
    scope === 'team'
      ? countOrNull(supabase.from('subscriptions').select('id', { count: 'exact', head: true })
          .eq('client_id', user.id).in('status', ['active', 'trialing']))
      : Promise.resolve(null),
    scope === 'following'
      ? countOrNull(supabase.from('user_follows').select('following_id', { count: 'exact', head: true })
          .eq('follower_id', user.id).eq('status', 'accepted'))
      : Promise.resolve(null),
  ]);

  if (board.error) {
    if (isMissingRelation(board.error)) return legacyBoard(supabase, user.id, scope, period, limit, own);
    return unavailable();
  }

  const rows = (board.data ?? []) as Array<Record<string, unknown>>;
  const all = rows.map(memberEntry);
  const mine = all.find((e) => e.isMe) ?? null;
  const total = rows.length ? Number(rows[0].total) || 0 : 0;
  // The top, you, and the next person above you, which the database adds when they sit below the
  // top (the one "to pass" names).
  const aboveRank = mine && mine.rank !== null
    ? all.reduce<number | null>((best, e) => (e.rank !== null && e.rank < (mine.rank as number) && (best === null || e.rank > best) ? e.rank : best), null)
    : null;
  const entries = all.filter((e) => (e.rank ?? Infinity) <= limit || e.isMe || (aboveRank !== null && e.rank === aboveRank));

  const body: Record<string, unknown> = {
    scope,
    period,
    total,
    entries,
    me: mine ? { ...mine, total } : null,
    hidden: own ? hiddenReason(scope, own.privacy, own.visibility) : null,
    privacy: own ? own.privacy : null,
  };
  if (scope === 'team') body.hasCoach = hasCoach === null ? null : hasCoach > 0;
  if (scope === 'following') body.following = following;
  return NextResponse.json(body);
}

// A database the leaderboard migration has not reached: the old board, Everyone only, names
// shortened here. Following and the team board need the new function, so they say so.
async function legacyBoard(
  supabase: SupabaseClient, userId: string, scope: Scope, period: Period, limit: number,
  own: { privacy: Privacy; visibility: unknown } | null,
) {
  if (scope !== 'everyone') return NextResponse.json({ error: 'This leaderboard is not switched on yet.' }, { status: 503 });
  const [{ data: rows, error }, { data: meRows, error: meError }] = await Promise.all([
    supabase.rpc('shape_leaderboard', { p_period: period, p_limit: limit }),
    supabase.rpc('shape_leaderboard_me', { p_period: period }),
  ]);
  if (error || meError) return unavailable();
  // The old board never checked visibility, so another member's photo and id stay off it here.
  const entries = ((rows ?? []) as Array<{ user_id: string; full_name: string; avatar_url: string | null; points: number; rank: number }>).map((r, i) => ({
    userId: r.user_id === userId ? r.user_id : `row-${i}`,
    name: shortName(r.full_name),
    avatarUrl: r.user_id === userId ? r.avatar_url : null,
    points: Number(r.points),
    rank: Number(r.rank),
    prevRank: null,
    moved: null,
    tier: null,
    streak: null,
    trainingDays: null,
    mealDays: null,
    isMe: r.user_id === userId,
  }));
  const meRow = Array.isArray(meRows) ? meRows[0] : null;
  const total = meRow ? Number(meRow.total) : entries.length;
  const listed = entries.find((e) => e.isMe);
  const me = meRow
    ? { ...(listed ?? { userId, name: 'You', avatarUrl: null, prevRank: null, moved: null, tier: null, streak: null, trainingDays: null, mealDays: null, isMe: true }),
        points: Number(meRow.points), rank: Number(meRow.rank), total }
    : null;
  return NextResponse.json({
    scope, period, total, entries, me,
    // The old board filters on the board switch only, not on a private profile.
    hidden: own && !own.privacy.leaderboard ? 'off' : null,
    privacy: own ? own.privacy : null,
    legacy: true,
  });
}
