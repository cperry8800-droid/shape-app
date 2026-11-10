// The directive for "one lead per page": POST a client's unified record, get the
// ONE directive (verdict + cross-domain reason + single action) + the coach
// "read", with any stored coach override merged in (the override wins) and the
// result cached per client/day. Read/compute only — no client-data writes.
// Behind the membership gate (/api/ai/*).
//
// POST /api/ai/directive  { record, clientId? } → { directive, cached }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor } from '@/lib/ai/server';
import { computeDirective } from '@/lib/ai/directive';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ record?: unknown; clientId?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const record = parsed.data.record;
  if (!record || typeof record !== 'object') {
    return NextResponse.json({ error: 'record is required.' }, { status: 400 });
  }

  const self = actor.user.id;
  const clientId = typeof parsed.data.clientId === 'string' && parsed.data.clientId ? parsed.data.clientId : null;
  let targetId = self;
  if (clientId && clientId !== self) {
    const { data: ok, error: scopeErr } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
    if (scopeErr) return NextResponse.json({ error: 'Unable to verify coach access right now.' }, { status: 500 });
    if (ok !== true) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });
    targetId = clientId;
  }

  const { directive, cached } = await computeDirective(actor.supabase, record as Record<string, unknown>, targetId);
  return NextResponse.json({ directive, cached });
}
