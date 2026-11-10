// List the caller's AI audit trail — their own AI-initiated changes, plus (for
// a coach) changes targeting a client they're active on. RLS on ai_audit_log
// scopes the rows; this just reads them back for an "AI changes / undo" view.
//
// GET /api/ai/audit?limit=50 → { entries: [...] }

import { NextResponse } from 'next/server';
import { resolveActor } from '@/lib/ai/server';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // A MISSING ?limit must fall back to 50 — but Number(null) is 0 (finite), so
  // guard the null/empty case before coercing, else the clamp would yield 1.
  const limitRaw = new URL(request.url).searchParams.get('limit');
  const limitParam = limitRaw == null || limitRaw === '' ? NaN : Number(limitRaw);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);

  const { data, error } = await actor.supabase
    .from('ai_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[shape-ai] failed to read ai_audit_log:', error.message);
    return NextResponse.json({ error: 'Failed to load audit entries.' }, { status: 500 });
  }

  const entries = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      source: r.source,
      action: r.action,
      actorRole: r.actor_role,
      target: { userId: r.target_user_id, kind: r.target_kind, id: r.target_id },
      suggestion: r.suggestion,
      confirmedPayload: r.confirmed_payload,
      beforeState: r.before_state,
      afterState: r.after_state,
      status: r.status,
      undoneAt: r.undone_at,
      createdAt: r.created_at,
    };
  });
  return NextResponse.json({ entries });
}
