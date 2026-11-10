// Shape Score leaderboard for members.
//
// GET ?scope=everyone|following|team&period=week|month|all&limit=50
//   -> { scope, period, total,
//        entries: [{ userId, name, avatarUrl, points, rank, prevRank, moved, tier, streak,
//                    trainingDays, mealDays, isMe }],
//        me: entry | null,               the caller's own row, ranked or not in this window
//        hidden: null | 'off' | 'private' | 'team_unasked' | 'team_off',
//                                        why OTHER members do not see the caller here
//        fullBoard: boolean,             the whole board, your exact rank and movement (paid)
//        locked: null | 'free_account' | 'past_due' | 'unknown',   why it is not the full board
//                                                     ('unknown': the membership could not be read)
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
import { computeMembership } from '@/lib/membership-core';
import { isMissingRelation } from '@/lib/owned-provider';
import { OPEN_SUB_STATUSES } from '../../../lib/coach-trajectory.mjs';
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

  const [board, own, hasCoach, following, membership] = await Promise.all([
    supabase.rpc('shape_member_board', { p_scope: scope, p_period: period, p_limit: limit }),
    readOwnSettings(supabase, user.id),
    scope === 'team'
      ? countOrNull(supabase.from('subscriptions').select('id', { count: 'exact', head: true })
          .eq('client_id', user.id).in('status', OPEN_SUB_STATUSES))
      : Promise.resolve(null),
    scope === 'following'
      ? countOrNull(supabase.from('user_follows').select('following_id', { count: 'exact', head: true })
          .eq('follower_id', user.id).eq('status', 'accepted'))
      : Promise.resolve(null),
    // null: unread. The board still answers; only the reason it gives the caller is unknown.
    computeMembership(supabase, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true }).catch(() => null),
  ]);
  // ⚠ EVERY ACCOUNT IS RANKED; THE FULL BOARD IS THE MEMBERSHIP (owner, 2026-11-10, after Strava:
  // free accounts are what fill the boards, so they compete; the full board, your exact rank and
  // how you moved are paid). A free or past-due caller gets the top FREE_TOP, their own points,
  // their rank only when it is in that top, and no movement. A membership that could not be read
  // is the free board: nothing paid is shown on a guess.
  const fullBoard = membership ? membership.isMember : false;
  // ⚠ An unread membership is 'unknown', never a free account (Codex P2 on #2675): a paying member
  // whose read failed is not told they are free, nor sent to a second checkout.
  const locked: BoardLock = fullBoard ? null : !membership ? 'unknown' : membership.pastDue ? 'past_due' : 'free_account';

  if (board.error) {
    if (isMissingRelation(board.error)) return legacyBoard(supabase, user.id, scope, period, limit, own, locked);
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
    ...(fullBoard
      ? { entries, me: mine ? { ...mine, total } : null }
      : freeBoard(all, mine, total)),
    hidden: own ? hiddenReason(scope, own.privacy, own.visibility) : null,
    fullBoard,
    locked,
    privacy: own ? own.privacy : null,
  };
  if (scope === 'team') body.hasCoach = hasCoach === null ? null : hasCoach > 0;
  if (scope === 'following') body.following = following;
  return NextResponse.json(body);
}

type BoardLock = 'free_account' | 'past_due' | 'unknown' | null;

/** How many places a free account sees at the top of a board (owner, 2026-11-10, after Strava). */
const FREE_TOP = 10;

type BoardEntry = { rank: number | null; isMe?: boolean; prevRank?: number | null; moved?: number | null; [k: string]: unknown };
/**
 * The free board: the top FREE_TOP places, with no movement on anyone's row (history is paid), and
 * the caller's own row with their points but a rank only when it is in that top.
 */
function freeBoard(all: BoardEntry[], mine: BoardEntry | null, total: number) {
  const still = (e: BoardEntry) => ({ ...e, prevRank: null, moved: null });
  const entries = all.filter((e) => e.rank !== null && e.rank <= FREE_TOP).map(still);
  const inTop = !!mine && mine.rank !== null && mine.rank <= FREE_TOP;
  return {
    entries,
    me: mine ? { ...still(mine), rank: inTop ? mine.rank : null, inTop, total } : null,
  };
}

// A database the leaderboard migration has not reached: the old board, Everyone only, names
// shortened here. Following and the team board need the new function, so they say so.
async function legacyBoard(
  supabase: SupabaseClient, userId: string, scope: Scope, period: Period, limit: number,
  own: { privacy: Privacy; visibility: unknown } | null,
  locked: BoardLock = null,
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
    scope, period, total,
    ...(locked ? freeBoard(entries, me, total) : { entries, me }),
    // The old board filters on the board switch only, not on a private profile.
    hidden: own && !own.privacy.leaderboard ? 'off' : null,
    fullBoard: !locked,
    locked,
    privacy: own ? own.privacy : null,
    legacy: true,
  });
}
