// The member's two leaderboard switches — read them, and change them.
//
//   leaderboard  "Show me on leaderboards". On unless turned off; off takes the member off every
//                member board but their own.
//   teamBoard    "Show me to my coach's team". null until the member answers it (the team board
//                treats that as off), then true or false.
//
// GET  -> { leaderboard: boolean, teamBoard: boolean | null }
// PUT  { leaderboard?: boolean, teamBoard?: boolean } -> the same, as stored
//
// Both live in user_goals kind 'client_privacy_prefs' (keys `leaderboard` and `team_board`, 'on' |
// 'off'), which shape_member_board reads (supabase-migrations/2026-10-15-leaderboards.sql). Until
// this route nothing wrote that document, so the board's opt-out could not be used.
//
// The caller's own RLS-scoped client, never the service role: user_goals lets a member write only
// their own rows. The read-back is the answer, not the write's silence (the /api/me/age-public
// rule). Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { readPrivacy, writePrivacy } from '@/lib/leaderboard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const privateJson = (body: unknown, init?: { status?: number }) =>
  NextResponse.json(body, { ...(init || {}), headers: PRIVATE_HEADERS });

const KIND = 'client_privacy_prefs';

async function readDoc(supabase: SupabaseClient, uid: string) {
  const { data, error } = await supabase
    .from('user_goals')
    .select('data')
    .eq('user_id', uid)
    .eq('kind', KIND)
    .maybeSingle();
  return { doc: ((data as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>, error };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const { doc, error } = await readDoc(supabase, user.id);
  // ⚠ A FAILED READ IS NOT "ON". The page draws the switches from this answer, and the next tap
  // would write the opposite of a value it never read.
  if (error) return privateJson({ error: 'Could not read your settings.', code: 'unavailable' }, { status: 503 });
  return privateJson(readPrivacy(doc));
}

export async function PUT(request: Request) {
  const user = await currentUser(request);
  if (!user) return privateJson({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<unknown>(request);
  if (!bodyResult.ok) return bodyResult.response;
  const body = (bodyResult.data ?? {}) as { leaderboard?: unknown; teamBoard?: unknown };
  // Strict booleans: these gate who sees the member.
  const change: { leaderboard?: boolean; teamBoard?: boolean } = {};
  for (const key of ['leaderboard', 'teamBoard'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') {
      return privateJson({ error: 'Expected { leaderboard?: boolean, teamBoard?: boolean }.', code: 'bad_body' }, { status: 400 });
    }
    change[key] = body[key] as boolean;
  }
  if (!Object.keys(change).length) {
    return privateJson({ error: 'Nothing to change.', code: 'bad_body' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const before = await readDoc(supabase, user.id);
  if (before.error) return privateJson({ error: 'Could not read your settings.', code: 'unavailable' }, { status: 503 });

  const { error: writeErr } = await supabase
    .from('user_goals')
    .upsert({ user_id: user.id, kind: KIND, data: writePrivacy(before.doc, change), updated_at: new Date().toISOString() }, { onConflict: 'user_id,kind' });
  if (writeErr) return privateJson({ error: 'Could not save that.', code: 'write_failed' }, { status: 503 });

  const after = await readDoc(supabase, user.id);
  if (after.error) return privateJson({ error: 'Could not confirm the change.', code: 'unconfirmed' }, { status: 503 });
  const stored = readPrivacy(after.doc);
  const saved = (change.leaderboard === undefined || stored.leaderboard === change.leaderboard)
    && (change.teamBoard === undefined || stored.teamBoard === change.teamBoard);
  if (!saved) return privateJson({ error: 'The change was not saved.', code: 'not_saved', ...stored }, { status: 409 });
  return privateJson(stored);
}
