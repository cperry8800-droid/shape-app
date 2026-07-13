// AI-draft a coach's check-in / message to a client — grounded in the client's
// real, current cross-discipline signals. The grounding record is built
// SERVER-SIDE from the client's coach-readable stats (get_client_stats), NOT from
// caller input, so a coach can't draft (and audit) a check-in on fabricated
// numbers. Returns an EDITABLE draft + the conversation to send it in; SENDS
// NOTHING. The coach edits freely and sends via the existing
// POST /api/conversations/[id]/messages. The draft is logged to ai_audit_log.
// Coach-only, on their own client.
//
// POST /api/ai/draft-message  { clientId, role?, kind?, clientName? }
//   → { draft, cited, source, conversationId, draftAuditId, hasTraining, hasNutrition }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor, auditSink } from '@/lib/ai/server';
import { draftCheckin } from '@/lib/ai/draft';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Build the grounding record from the client's REAL stats rollup (get_client_stats),
// mirroring the client-side bsBuildDraftRecord mapping. Only real values; a missing
// stat is simply absent (the engine drafts an honest "just checking in" note). The
// display NAME is the only field allowed from the request (a greeting, not a cited
// signal), so it can never become fabricated evidence.
function groundedRecord(stats: Record<string, unknown> | null, name: string): Record<string, unknown> {
  const rec: Record<string, unknown> = { profile: { name: name || 'your client' } };
  if (!stats || typeof stats !== 'object') return rec;
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sessionsPlanned = n(stats.sessionsPlanned);
  if (sessionsPlanned != null) {
    const done = n(stats.sessionsCompleted) ?? 0;
    rec.trainingAdherence = { done, planned: sessionsPlanned, pct: sessionsPlanned ? Math.round((done / sessionsPlanned) * 100) : null };
  }
  const avgCalories = n(stats.avgCalories);
  const avgProtein = n(stats.avgProtein);
  if (avgCalories != null || avgProtein != null) {
    rec.nutrition = { avgCalories, avgProtein, targetCalories: null, targetProtein: null };
  }
  const daysLogged7d = n(stats.daysLogged7d);
  if (daysLogged7d != null) rec.foodLogs = { daysLogged7d };
  const weightNow = n(stats.weightNow);
  const weightStart = n(stats.weightStart);
  if (weightNow != null && weightStart != null) {
    rec.weighIns = [{ on: '', weight: weightStart, unit: 'lb' }, { on: '', weight: weightNow, unit: 'lb' }];
  }
  return rec;
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ clientId?: string; role?: string; kind?: string; clientName?: string; record?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const clientId = parsed.data.clientId;
  if (typeof clientId !== 'string' || !clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
  }

  // Only a coach actively on this client may draft to them.
  const { data: ok, error: scopeErr } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (scopeErr) return NextResponse.json({ error: 'Unable to verify coach scope right now.' }, { status: 500 });
  if (ok !== true) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });

  // SERVER-AUTHORITATIVE grounding: fetch the client's real stats ourselves (the
  // RPC is RLS/scope-gated) and build the evidence record from THAT — never from
  // caller input. The only thing taken from the request is a display name.
  const { data: stats } = await actor.supabase.rpc('get_client_stats', { p_user_id: clientId });
  const reqName =
    (parsed.data.clientName && typeof parsed.data.clientName === 'string' && parsed.data.clientName) ||
    ((parsed.data.record as { profile?: { name?: string } } | undefined)?.profile?.name) ||
    '';
  const record = groundedRecord((stats as Record<string, unknown> | null) ?? null, String(reqName).slice(0, 80));
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
