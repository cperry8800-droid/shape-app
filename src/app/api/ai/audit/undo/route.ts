// Undo a previously-confirmed AI change: reverse the underlying data via the
// action's own undo (RLS-scoped, as the user) and flip the audit row to
// 'undone' (mark_ai_action_undone re-checks the actor/coach permission).
//
// POST /api/ai/audit/undo  { auditId } → { ok }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { undoChange } from '@/lib/ai/proposals.mjs';
import { resolveActor, makeCtx, serverRegistry, auditSink } from '@/lib/ai/server';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ auditId?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const auditId = parsed.data.auditId;
  if (typeof auditId !== 'string' || !auditId) {
    return NextResponse.json({ error: 'auditId is required.' }, { status: 400 });
  }

  // ⚠ A REFUSED UNDO SAYS WHY (2026-11-10). An action's undo throws its own reason ("Changed since
  // — nothing undone.", accountSetup.mjs) and undoChange hands the claim back and re-throws; with
  // no catch here that became a bare 500, and the card said "Something went wrong." The reason
  // goes to the card now, as the confirm route sends an apply's (proposals.mjs execute_failed).
  let res: Awaited<ReturnType<typeof undoChange>>;
  try {
    res = await undoChange({
      registry: serverRegistry,
      auditId,
      actor: { id: actor.user.id, role: actor.role, roles: actor.roles },
      ctx: makeCtx(actor, request),
      audit: auditSink(actor.supabase),
    });
  } catch (e) {
    const message = (e instanceof Error && e.message) || 'I could not undo that change.';
    return NextResponse.json({ error: 'undo_failed', message }, { status: 409 });
  }

  if (!res.ok) {
    const status = res.error === 'audit_not_found' ? 404 : res.error === 'not_undoable' ? 422 : 400;
    return NextResponse.json({ error: res.error, message: (res as { message?: string }).message }, { status });
  }
  return NextResponse.json(res);
}
