// The human confirms a previewed change: verify the signed token, execute the
// EXACT previewed change, write one ai_audit_log row, return the audit id (the
// undo handle). A change can only be executed via a confirmed token — there is
// no way to execute without first proposing + confirming.
//
// POST /api/ai/proposals/confirm  { token } → { ok, auditId, result }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { confirmChange } from '@/lib/ai/proposals.mjs';
import { resolveActor, makeCtx, serverRegistry, proposalSecret, auditSink, proposalConsumer } from '@/lib/ai/server';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ token?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const token = parsed.data.token;
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token is required.' }, { status: 400 });
  }

  const secret = proposalSecret();
  if (!secret) return NextResponse.json({ error: 'AI proposals are not configured.' }, { status: 503 });

  const consumer = proposalConsumer(actor.supabase);
  const res = await confirmChange({
    registry: serverRegistry,
    token,
    actor: { id: actor.user.id, role: actor.role },
    ctx: makeCtx(actor, request),
    secret,
    audit: auditSink(actor.supabase),
    consume: consumer.consume,
    release: consumer.release,
  });

  if (!res.ok) {
    // already_confirmed → 409 (replay of a token already applied); auth → 403; else 400.
    const status = res.error === 'actor_mismatch' || res.error === 'role_not_allowed'
      ? 403
      : res.error === 'already_confirmed'
        ? 409
        : 400;
    return NextResponse.json({ error: res.error, message: (res as { message?: string }).message }, { status });
  }
  // audited:false means the change applied but the audit row couldn't be written
  // (no undo handle) — the UI uses this to suppress the Undo affordance.
  return NextResponse.json({ ok: true, auditId: res.auditId, audited: (res as { audited?: boolean }).audited !== false, result: res.result });
}
