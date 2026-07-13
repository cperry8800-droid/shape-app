// AI proposes a change → returns a preview/diff + a signed confirm token.
// NOTHING is written here. The human reviews the preview and POSTs the token to
// /api/ai/proposals/confirm to execute. Behind the membership gate (the proxy
// gates /api/ai/*); the handler additionally requires a signed-in actor.
//
// POST /api/ai/proposals  { action, input } → { ok, proposalId, preview, token }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { proposeChange } from '@/lib/ai/proposals.mjs';
import { resolveActor, makeCtx, serverRegistry, proposalSecret } from '@/lib/ai/server';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ action?: string; input?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const { action, input } = parsed.data;
  if (typeof action !== 'string' || !action) {
    return NextResponse.json({ error: 'action is required.' }, { status: 400 });
  }

  const secret = proposalSecret();
  if (!secret) return NextResponse.json({ error: 'AI proposals are not configured.' }, { status: 503 });

  const res = await proposeChange({
    registry: serverRegistry,
    action,
    input,
    actor: { id: actor.user.id, role: actor.role },
    ctx: makeCtx(actor, request),
    secret,
  });

  if (!res.ok) {
    const status = res.error === 'role_not_allowed' ? 403 : res.error === 'unknown_action' ? 404 : 400;
    return NextResponse.json({ error: res.error, message: (res as { message?: string }).message }, { status });
  }
  return NextResponse.json(res);
}
