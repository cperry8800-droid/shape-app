// Coach workout review note — a gated server entry for writing a review note on
// a client's logged workout session. The coach_workout_review_notes RLS already
// scopes the write (reviewer = self, owned provider row, can_access_workout_
// session); this route confirms the caller owns the session's provider row up
// front for a clean 403, then inserts as the caller (RLS stays authoritative).
//
// POST { sessionId, body, visibility? } -> { ok, id }
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VISIBILITIES = ['client', 'coach_private', 'team'];

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const sessionId = String(body.sessionId ?? '').trim();
  const text = String(body.body ?? '').trim().slice(0, 4000);
  const visibility = VISIBILITIES.includes(String(body.visibility)) ? String(body.visibility) : 'client';
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'A note body is required.' }, { status: 400 });

  // The session names the provider (role + id). Confirm the caller owns THAT
  // provider row — i.e. they are the coach on this session — before writing.
  const { data: sessionRow } = await supabase
    .from('workout_sessions')
    .select('id, provider_id, provider_role')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sessionRow) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  const providerRole = (sessionRow as { provider_role?: string }).provider_role;
  const providerId = (sessionRow as { provider_id?: number }).provider_id;
  if (providerRole !== 'trainer' && providerRole !== 'nutritionist') {
    return NextResponse.json({ error: 'This session has no coach to review it.' }, { status: 403 });
  }
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: owned } = await supabase
    .from(table)
    .select('id')
    .eq('id', providerId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: 'You are not the coach on this session.' }, { status: 403 });
  }

  const { data: inserted, error } = await supabase
    .from('coach_workout_review_notes')
    .insert({
      session_id: sessionId,
      reviewer_id: user.id,
      provider_id: providerId,
      provider_role: providerRole,
      body: text,
      visibility,
    })
    .select('id')
    .single();

  if (error) {
    const denied = /row-level security/i.test(error.message);
    return NextResponse.json(
      { error: denied ? 'You are not the coach on this session.' : error.message },
      { status: denied ? 403 : 500 },
    );
  }
  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
