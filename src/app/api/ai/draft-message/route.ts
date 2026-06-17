// AI-draft a coach's check-in / message to a client — grounded in the client's
// real, current cross-discipline signals from the shared record. Returns an
// EDITABLE draft + the conversation to send it in; SENDS NOTHING. The coach edits
// freely and sends via the existing POST /api/conversations/[id]/messages. The
// draft is logged to ai_audit_log. Coach-only, on their own client.
//
// POST /api/ai/draft-message  { clientId, record, role?, kind? }
//   → { draft, cited, source, conversationId, draftAuditId, hasTraining, hasNutrition }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor, auditSink } from '@/lib/ai/server';
import { draftCheckin } from '@/lib/ai/draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ clientId?: string; record?: unknown; role?: string; kind?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const clientId = parsed.data.clientId;
  if (typeof clientId !== 'string' || !clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
  }

  // Only a coach actively on this client may draft to them.
  const { data: ok, error: scopeErr } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (scopeErr) return NextResponse.json({ error: 'Unable to verify coach scope right now.' }, { status: 500 });
  if (ok !== true) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });

  const record =
    parsed.data.record && typeof parsed.data.record === 'object' ? (parsed.data.record as Record<string, unknown>) : {};
  const role = typeof parsed.data.role === 'string' && parsed.data.role ? parsed.data.role : actor.role;

  const result = await draftCheckin(record, role, { kind: parsed.data.kind });

  // Resolve the coach↔client 1:1 so the surface can send via the existing endpoint.
  let conversationId: string | null = null;
  try {
    const { data } = await actor.supabase.rpc('get_or_create_member_conversation', { p_other_user_id: clientId });
    conversationId = (data as string) || null;
  } catch {
    /* the surface can resolve/send on its own if this fails */
  }

  // Log the DRAFT (the AI suggestion the coach will edit before sending).
  let draftAuditId: string | null = null;
  try {
    draftAuditId = await auditSink(actor.supabase).log({
      actorUserId: actor.user.id,
      actorRole: actor.role,
      source: 'nora',
      action: 'checkin_draft',
      target: { userId: clientId, kind: 'message', id: conversationId },
      suggestion: { draft: result.draft, cited: result.cited, signals: result.evidence.signals, source: result.source },
      confirmedPayload: null,
    });
  } catch (e) {
    console.warn('[shape-ai] checkin draft audit failed:', (e as Error)?.message);
  }

  return NextResponse.json({
    draft: result.draft,
    cited: result.cited,
    source: result.source,
    conversationId,
    draftAuditId,
    hasTraining: result.evidence.hasTraining,
    hasNutrition: result.evidence.hasNutrition,
  });
}
