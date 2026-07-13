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

  const res = await undoChange({
    registry: serverRegistry,
    auditId,
    actor: { id: actor.user.id, role: actor.role },
    ctx: makeCtx(actor, request),
    audit: auditSink(actor.supabase),
  });

  if (!res.ok) {
    const status = res.error === 'audit_not_found' ? 404 : res.error === 'not_undoable' ? 422 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json(res);
}
