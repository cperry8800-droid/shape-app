// Server wiring for the AI preview/confirm scaffold: resolve the acting human
// (auth + role), the registry of real actions, the user_goals-backed demo store,
// and the ai_audit_log sink (the SECURITY DEFINER RPCs from
// 2026-06-16-ai-audit-log.sql). The pure lifecycle lives in ./proposals.mjs;
// this file only injects concrete, RLS-scoped implementations.
//
// SERVER-ONLY. The Supabase client here is request-scoped (Bearer or cookie), so
// every read/write runs as the calling user and RLS stays authoritative.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { currentUser, clientForRequest } from '@/lib/request-auth';
import { createRegistry, demoEchoAction } from '@/lib/ai/proposals.mjs';
import { NORA_ACTIONS } from '@/lib/ai/actions.mjs';

export type Actor = { user: User; role: string; supabase: SupabaseClient };

/** The signed-in human + their role + an RLS-scoped client, or null. */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const user = await currentUser(request);
  if (!user) return null;
  const supabase = await clientForRequest(request);
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role || 'client';
  return { user, role, supabase };
}

/** HMAC secret for proposal tokens — server-only env, stable across instances. */
export function proposalSecret(): string {
  return process.env.AI_PROPOSAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

// The server's action registry. Real product actions (set goals, log meal,
// adjust program, …) get registered here in later prompts; today only the
// reversible demo action exists so the scaffold is exercisable end to end.
export const serverRegistry = createRegistry();
serverRegistry.define(demoEchoAction.name, demoEchoAction);
// Real action tools, registered in rollout order (TIER 1 → TIER 2).
for (const a of NORA_ACTIONS) serverRegistry.define(a.name, a);

/** Per-user key/value store backed by the caller's own user_goals rows. */
export function userGoalsStore(supabase: SupabaseClient, userId: string) {
  return {
    async get(key: string): Promise<unknown> {
      const { data } = await supabase
        .from('user_goals')
        .select('data')
        .eq('user_id', userId)
        .eq('kind', key)
        .maybeSingle();
      const blob = (data as { data?: unknown } | null)?.data;
      return blob && typeof blob === 'object' && Object.keys(blob as object).length ? blob : null;
    },
    async set(key: string, value: unknown): Promise<unknown> {
      await supabase
        .from('user_goals')
        .upsert({ user_id: userId, kind: key, data: value ?? {} }, { onConflict: 'user_id,kind' });
      return value;
    },
  };
}

type AuditEntry = {
  actorUserId: string;
  actorRole: string;
  source: string;
  action: string;
  target?: { userId?: string | null; kind?: string | null; id?: string | null } | null;
  suggestion?: unknown;
  confirmedPayload?: unknown;
  beforeState?: unknown;
  afterState?: unknown;
  reversal?: unknown;
};

/** ai_audit_log sink: append/read/undo via the SECURITY DEFINER RPCs + RLS read. */
export function auditSink(supabase: SupabaseClient) {
  return {
    async log(entry: AuditEntry): Promise<string> {
      const { data, error } = await supabase.rpc('log_ai_action', {
        p_source: entry.source,
        p_action: entry.action,
        p_actor_role: entry.actorRole,
        p_target_user_id: entry.target?.userId ?? null,
        p_target_kind: entry.target?.kind ?? null,
        p_target_id: entry.target?.id ?? null,
        p_suggestion: entry.suggestion ?? null,
        p_confirmed_payload: entry.confirmedPayload ?? null,
        p_before_state: entry.beforeState ?? null,
        p_after_state: entry.afterState ?? null,
        p_reversal: entry.reversal ?? null,
      });
      if (error) throw new Error(`ai_audit_log write failed: ${error.message}`);
      return data as string;
    },
    async get(id: string) {
      const { data } = await supabase.from('ai_audit_log').select('*').eq('id', id).maybeSingle();
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        id: r.id,
        status: r.status,
        actorUserId: r.actor_user_id,
        actorRole: r.actor_role,
        source: r.source,
        action: r.action,
        target: { userId: r.target_user_id, kind: r.target_kind, id: r.target_id },
        suggestion: r.suggestion,
        confirmedPayload: r.confirmed_payload,
        beforeState: r.before_state,
        afterState: r.after_state,
        reversal: r.reversal,
      };
    },
    async markUndone(id: string): Promise<boolean> {
      const { error } = await supabase.rpc('mark_ai_action_undone', { p_id: id });
      if (error) throw new Error(`ai_audit undo failed: ${error.message}`);
      return true;
    },
  };
}

/** The execution context passed to actions (actor identity + the RLS store + an
 * endpoint caller that forwards the actor's session). */
export function makeCtx(actor: Actor, request?: Request) {
  return {
    actor: { id: actor.user.id, role: actor.role },
    store: userGoalsStore(actor.supabase, actor.user.id),
    supabase: actor.supabase,
    // Call an existing same-origin /api/* endpoint CARRYING THE ACTOR'S SESSION,
    // so the endpoint's own auth + RLS stay the authoritative gate (never
    // service-role, never a bypass).
    async call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
      if (!request) throw new Error('endpoint call has no request context');
      const url = new URL(path, request.url);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const cookie = request.headers.get('cookie');
      if (cookie) headers.cookie = cookie;
      const auth = request.headers.get('authorization');
      if (auth) headers.authorization = auth;
      const res = await fetch(url, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    },
  };
}
