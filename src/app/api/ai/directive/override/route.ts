// Coach override of a client's directive — HUMAN IN THE LOOP: the coach decides,
// and their override WINS over the engine. Persisted to
// client_programs.detail.directive (merged; never clobbers the program sections)
// and logged to ai_audit_log (reversible: before/after = the override state).
// Gated on is_coach_on_client. Pass override:null to clear (revert to engine).
//
// POST /api/ai/directive/override  { clientId, override, record? } → { ok, override, audited }

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor, auditSink } from '@/lib/ai/server';
import { engineDirective, writeOverride, sanitizeOverride, invalidateDirectiveCache } from '@/lib/ai/directive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ clientId?: string; override?: unknown; record?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const clientId = parsed.data.clientId;
  if (typeof clientId !== 'string' || !clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
  }

  // Only a coach actively on this client may override their directive.
  const { data: ok } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (ok !== true) return NextResponse.json({ error: 'Not a coach on this client.' }, { status: 403 });

  const override = parsed.data.override == null ? null : sanitizeOverride(parsed.data.override, actor.user.id);
  const baseRecord =
    parsed.data.record && typeof parsed.data.record === 'object' ? (parsed.data.record as Record<string, unknown>) : {};
  const suggestion = engineDirective(baseRecord); // the engine directive the coach is replacing

  const { before, after } = await writeOverride(actor.supabase, clientId, actor.user.id, override);

  let audited = true;
  try {
    await auditSink(actor.supabase).log({
      actorUserId: actor.user.id,
      actorRole: actor.role,
      source: 'engine',
      action: override ? 'directive_override' : 'directive_override_clear',
      target: { userId: clientId, kind: 'directive', id: null },
      suggestion,
      confirmedPayload: override,
      beforeState: before,
      afterState: after,
    });
  } catch (e) {
    audited = false;
    console.warn('[shape-ai] directive override audit failed:', (e as Error)?.message);
  }

  invalidateDirectiveCache(clientId);
  return NextResponse.json({ ok: true, override: after, audited });
}
