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

// The document, whether it exists, and the updated_at it was read at (the version a write is
// conditioned on).
async function readDoc(supabase: SupabaseClient, uid: string) {
  const { data, error } = await supabase
    .from('user_goals')
    .select('data, updated_at')
    .eq('user_id', uid)
    .eq('kind', KIND)
    .maybeSingle();
  const row = data as { data?: Record<string, unknown> | null; updated_at?: string | null } | null;
  return {
    doc: (row?.data ?? {}) as Record<string, unknown>,
    exists: !!row,
    version: row?.updated_at ?? null,
    error,
  };
}

const ATTEMPTS = 3;

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

  // ⚠ ONLY THE KEYS THIS REQUEST CHANGES, ON THE DOCUMENT AS IT IS NOW (Codex, on #2371). A
  // whole-document upsert from a read let two quick changes (both switches, or two devices) each
  // write back the other's old value: turning the team board on could quietly turn "Show me on
  // leaderboards" back on. So a write is conditioned on the version it read (updated_at), and a
  // write that finds the document changed reads it again and re-applies just this change.
  let written = false;
  for (let attempt = 0; attempt < ATTEMPTS && !written; attempt++) {
    const before = await readDoc(supabase, user.id);
    if (before.error) return privateJson({ error: 'Could not read your settings.', code: 'unavailable' }, { status: 503 });
    const next = writePrivacy(before.doc, change);
    const stamp = new Date().toISOString();
    if (!before.exists) {
      const { error } = await supabase.from('user_goals').insert({ user_id: user.id, kind: KIND, data: next, updated_at: stamp });
      if (!error) { written = true; break; }
      if ((error as { code?: string }).code === '23505') continue; // created in between: read it and go again
      return privateJson({ error: 'Could not save that.', code: 'write_failed' }, { status: 503 });
    }
    let update = supabase.from('user_goals').update({ data: next, updated_at: stamp })
      .eq('user_id', user.id).eq('kind', KIND);
    update = before.version === null ? update.is('updated_at', null) : update.eq('updated_at', before.version);
    const { data, error } = await update.select('user_id');
    if (error) return privateJson({ error: 'Could not save that.', code: 'write_failed' }, { status: 503 });
    if (Array.isArray(data) && data.length) written = true;
  }
  if (!written) return privateJson({ error: 'Your settings changed while saving. Try again.', code: 'busy' }, { status: 409 });

  const after = await readDoc(supabase, user.id);
  if (after.error) return privateJson({ error: 'Could not confirm the change.', code: 'unconfirmed' }, { status: 503 });
  const stored = readPrivacy(after.doc);
  const saved = (change.leaderboard === undefined || stored.leaderboard === change.leaderboard)
    && (change.teamBoard === undefined || stored.teamBoard === change.teamBoard);
  if (!saved) return privateJson({ error: 'The change was not saved.', code: 'not_saved', ...stored }, { status: 409 });
  return privateJson(stored);
}
