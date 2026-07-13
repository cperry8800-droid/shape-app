// Record that a coach actually SENT an AI-assisted message (logs the SENT
// version, which may differ from the draft — the coach edited it). Called by the
// surface after the real send (POST /api/conversations/[id]/messages) succeeds,
// so the audit trail shows: AI drafted X, coach sent Y. Coach-only, on their
// own client.
//
// POST /api/ai/draft-message/sent  { clientId, sentText, draftAuditId?, conversationId? } → { ok, auditId }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor, auditSink } from '@/lib/ai/server';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ clientId?: string; sentText?: string; draftAuditId?: string; conversationId?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const clientId = parsed.data.clientId;
  const sentText = parsed.data.sentText;
  if (typeof clientId !== 'string' || !clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
  }
  if (typeof sentText !== 'string' || !sentText.trim()) {
    return NextResponse.json({ error: 'sentText is required.' }, { status: 400 });
  }

  const { data: ok, error: scopeErr } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (scopeErr) return NextResponse.json({ error: 'Unable to verify coach scope right now.' }, { status: 500 });
  if (ok !== true) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });

  let auditId: string | null = null;
  try {
    auditId = await auditSink(actor.supabase).log({
      actorUserId: actor.user.id,
      actorRole: actor.role,
      source: 'nora',
      action: 'checkin_sent',
      target: { userId: clientId, kind: 'message', id: parsed.data.conversationId || null },
      suggestion: { draftAuditId: parsed.data.draftAuditId || null },
      confirmedPayload: { sentText: sentText.slice(0, 4000) },
    });
  } catch (e) {
    console.warn('[shape-ai] checkin sent audit failed:', (e as Error)?.message);
  }

  return NextResponse.json({ ok: true, auditId });
}
